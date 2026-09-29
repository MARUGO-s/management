// A receipt is persisted BEFORE sending. Keep it across reloads and uncertain failures.
(function (root) {
  'use strict';
  const fields = ['date', 'name', 'lender', 'borrower', 'category', 'item',
    'quantity', 'unitPrice', 'amount'];
  function keyOf(payload, occurrence) {
    return JSON.stringify([
      ...fields.map(field => String(payload[field] ?? '')),
      payload.isCorrection === true,
      payload.isCorrection ? (payload.correctionMark || '✏️修正') : '',
      payload.originalCreatedAt || payload.originalRowId || payload.originalRowIndex || '',
      occurrence
    ]);
  }
  function storageKey(url) {
    return 'loan-receipt-v1:' + url;
  }
  function read(url) {
    try {
      const raw = root.localStorage.getItem(storageKey(url));
      if (!raw) return {};
      const journal = JSON.parse(raw);
      if (!journal || Array.isArray(journal) || typeof journal !== 'object') throw new Error();
      for (const entry of Object.values(journal)) {
        if (!entry || !entry.receiptId || !['pending', 'confirmed'].includes(entry.state)) throw new Error();
      }
      return journal;
    } catch (_) {
      throw new Error('送信履歴を読み取れません。二重登録防止のため送信を停止しました。ブラウザの保存設定をご確認ください。');
    }
  }
  function write(url, journal) {
    try {
      const encoded = JSON.stringify(journal);
      root.localStorage.setItem(storageKey(url), encoded);
      if (root.localStorage.getItem(storageKey(url)) !== encoded) throw new Error();
    } catch (_) {
      throw Object.assign(new Error('送信履歴を保存できないため、送信前に停止しました。ブラウザの保存設定をご確認ください。'),
        { receiptOutcome: 'notSent' });
    }
  }
  // 送信失敗の結果: notSent/rejected は「登録されていない」ことが確定、unknown は結果未確認。
  function outcomeError(message, outcome, detail) {
    return Object.assign(new Error(message), { receiptOutcome: outcome, detail: detail || '' });
  }
  // 通信断やGoogle側中継(echo)の404で応答が読めないことがある。GETと同じ受付IDのPOSTは
  // 何度送っても二重登録しないため、読めるまで同じリクエストを送り直す。JSON応答は再送しない。
  async function fetchJson(url, options) {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await root.fetch(url, options);
        return { response, result: await response.json() };
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise(resolve => root.setTimeout(resolve, 1500 * attempt));
      }
    }
  }
  async function ensureServer(url) {
    let response, result;
    try {
      ({ response, result } = await fetchJson(url, { cache: 'no-store', redirect: 'follow' }));
    } catch (error) {
      throw outcomeError('サーバーに接続できなかったため、送信前に停止しました。', 'notSent', error.message);
    }
    if (result?.receiptColumnsReady === false) {
      throw outcomeError('受付ID用の列を利用できないため、送信前に停止しました。管理者にご連絡ください。', 'notSent');
    }
    if (!response.ok || result?.idempotencyVersion !== 1) {
      throw outcomeError('二重登録防止のサーバー準備が完了していないため、送信前に停止しました。管理者にご連絡ください。', 'notSent');
    }
  }
  function prepare(url, payloads) {
    const journal = read(url);
    const occurrences = new Map();
    const entries = payloads.map(payload => {
      const base = keyOf(payload, 0);
      const occurrence = occurrences.get(base) || 0;
      occurrences.set(base, occurrence + 1);
      const key = keyOf(payload, occurrence);
      return { key, entry: journal[key] || null };
    });
    // Pending receipts are always reused: never offer a new ID for an uncertain write.
    const alreadyComplete = entries.length > 0 && entries.every(({ entry }) => entry?.state === 'confirmed');
    const startNew = alreadyComplete && root.confirm(
      'この内容はすでに登録済みです。別の取引として同じ内容をもう一度登録しますか？\nキャンセルすると再登録しません。');
    const prepared = payloads.map((payload, index) => {
      const { key } = entries[index];
      let entry = entries[index].entry;
      if (!entry || startNew) {
        entry = { receiptId: root.crypto.randomUUID(), state: 'pending' };
        journal[key] = entry;
      }
      return { ...payload, receiptId: entry.receiptId, receiptVersion: 1 };
    });
    // One atomic storage write for the entire batch, including intentional repeats.
    // A quota error must not replace only some of the original receipts.
    write(url, journal);
    return prepared;
  }
  function confirmReceipt(url, payload) {
    // Include occurrence through the persisted receipt ID, rather than the UI row position.
    const journal = read(url);
    for (const [key, entry] of Object.entries(journal)) {
      if (entry?.receiptId === payload.receiptId) {
        journal[key] = { ...entry, state: 'confirmed' };
        write(url, journal);
        return;
      }
    }
    throw new Error('登録結果の履歴を保存できませんでした。同じ内容で再送すると登録済みの結果を確認できます。');
  }
  async function send(url, payload) {
    let result;
    try {
      ({ result } = await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload), redirect: 'follow'
      }));
    } catch (error) {
      throw outcomeError('通信が不安定なため、登録結果を確認できませんでした。', 'unknown', error.message);
    }
    if (result?.status === 'ERROR' && result.written === false) {
      throw outcomeError('サーバーで登録を中止しました。', 'rejected', result.message);
    }
    if (result?.status !== 'SUCCESS' || result.idempotencyVersion !== 1 || result.receiptId !== payload.receiptId) {
      throw outcomeError('登録結果を確認できませんでした。', 'unknown', result?.message);
    }
    try {
      confirmReceipt(url, payload);
    } catch (error) {
      // 登録は完了している。履歴が pending のままでも、次の再送は同じ受付IDで照合される。
      root.console?.warn?.('受付履歴を更新できませんでした', error);
    }
    return result;
  }
  async function withLock(url, callback) {
    if (!root.navigator.locks) {
      throw Object.assign(new Error('このブラウザでは二重登録防止を利用できないため、送信前に停止しました。最新のブラウザで開いてください。'),
        { receiptOutcome: 'notSent' });
    }
    return root.navigator.locks.request('loan-submit:' + url, { ifAvailable: true }, lock => {
      if (!lock) throw Object.assign(new Error('別のタブで送信中のため、送信前に停止しました。完了するまでお待ちください。'),
        { receiptOutcome: 'notSent' });
      return callback();
    });
  }
  // 画面表示用の文言。登録できたか分からない場合を「失敗」と見せない。
  function describeFailure(error, registered = 0, total = 1, retryButton = false) {
    const outcome = error?.receiptOutcome || 'unknown';
    const done = registered > 0 ? `${total}件中${registered}件は登録済みです。` : '';
    const detail = error?.detail || (error?.receiptOutcome ? '' : error?.message) || '';
    if (outcome === 'notSent' || outcome === 'rejected') {
      return { tone: 'error', title: '登録できませんでした',
        body: `${done}${registered > 0 ? '残りは' : 'この内容は'}登録されていません。${error.message}\n` +
          'もう一度送信してください（登録済みの分が二重登録されることはありません）。', detail };
    }
    return { tone: 'warning', title: '登録を確認できていません',
      body: `${done}通信が不安定なため、${registered > 0 ? '残りが' : ''}登録されたかどうかを確認できませんでした。` +
        '登録済みの可能性があります。\n' + (retryButton ? '「結果を確認する」を押すと' : '内容を変えずにもう一度送信すると') +
        '同じ内容で照合します（二重登録はされません）。', detail };
  }
  // エラーモーダル（.modal-title / 本文 / .modal-actions）に表示する。onRetry は未確認時のボタン。
  function presentFailure(modal, body, info, onRetry) {
    const title = modal.querySelector?.('.modal-title');
    if (title && modal.dataset.defaultTitle === undefined) modal.dataset.defaultTitle = title.textContent;
    if (title) title.textContent = (info.tone === 'warning' ? '⚠️ ' : '') + info.title;
    body.textContent = info.body;
    if (info.detail && root.document) {
      const small = root.document.createElement('small');
      small.style.cssText = 'display:block;margin-top:8px;color:#6b7280;';
      small.textContent = '詳細: ' + info.detail;
      body.appendChild(small);
    }
    modal.dataset.tone = info.tone;
    let retry = modal.querySelector?.('#errorModalRetryBtn');
    const actions = modal.querySelector?.('.modal-actions');
    if (!retry && actions && root.document) {
      retry = root.document.createElement('button');
      retry.type = 'button';
      retry.id = 'errorModalRetryBtn';
      retry.className = 'list-btn';
      retry.textContent = '結果を確認する';
      actions.insertBefore(retry, actions.firstChild);
    }
    // 閉じたら既定の見出しに戻す。モーダルは入力エラーなど他の表示にも使われるため。
    const restore = () => {
      if (title && modal.dataset.defaultTitle !== undefined) title.textContent = modal.dataset.defaultTitle;
      delete modal.dataset.tone;
      if (retry) retry.style.display = 'none';
    };
    modal.querySelector?.('#errorModalCloseBtn')?.addEventListener('click', restore, { once: true });
    if (retry) {
      retry.style.display = info.tone === 'warning' && onRetry ? '' : 'none';
      retry.onclick = () => { modal.classList.remove('show'); restore(); onRetry(); };
    }
  }
  root.LoanReceipts = { ensureServer, prepare, send, withLock, describeFailure, presentFailure };
})(window);
