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
      // 入力日時が同じ秒の別の元行を、元行の受付IDで区別する（GASの内容ハッシュと同じ規則）。
      ...(payload.originalCreatedAt && payload.originalRowId ? [String(payload.originalRowId)] : []),
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
    if (result?.similarityVersion !== 1) {
      throw outcomeError('類似取引の重複確認に対応したサーバーではないため、送信前に停止しました。管理者にご連絡ください。', 'notSent');
    }
    if (!(result?.duplicateRulesVersion >= 2)) {
      throw outcomeError('日付違いの再入力・修正元の確認に対応したサーバーではないため、送信前に停止しました（重複確認の更新待ち）。管理者にご連絡ください。', 'notSent');
    }
  }
  function prepare(url, payloads) {
    const journal = read(url);
    // 同じ内容の行には、結果が未確認（pending）の受付を先に割り当てる。一部だけ登録できた後に
    // 登録済みの行を画面から消して再送しても、未送信の行に登録済みの受付IDを取り違えない。
    const slots = new Map();
    const entries = payloads.map(payload => {
      const base = keyOf(payload, 0);
      if (!slots.has(base)) {
        const existing = [];
        for (let occurrence = 0; journal[keyOf(payload, occurrence)]; occurrence++) {
          existing.push({ key: keyOf(payload, occurrence), entry: journal[keyOf(payload, occurrence)] });
        }
        const ordered = existing.filter(slot => slot.entry.state === 'pending')
          .concat(existing.filter(slot => slot.entry.state !== 'pending'));
        slots.set(base, { ordered, next: 0 });
      }
      const slot = slots.get(base);
      // 既存の受付を使い切ったら、続きの出現番号で新しい受付を作る。
      const assigned = slot.ordered[slot.next] || { key: keyOf(payload, slot.next), entry: null };
      slot.next++;
      return assigned;
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
    let requestPayload = payload;
    // CacheService の早期失効後にも新しいトークンで再確認できるよう、最大2回だけ承認を求める。
    for (let approvalAttempts = 0; approvalAttempts < 3; approvalAttempts++) {
      try {
        ({ result } = await fetchJson(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          // ログインで発行されたトークンを添える（GASで確認し、行には書き込まない）。
          body: JSON.stringify({ ...requestPayload, sessionToken: root.LoanSession?.get()?.token || '' }), redirect: 'follow'
        }));
      } catch (error) {
        throw outcomeError('通信が不安定なため、登録結果を確認できませんでした。', 'unknown', error.message);
      }
      if (result?.code !== 'SIMILAR_TRANSACTION' || result.written !== false) break;
      if (approvalAttempts >= 2) throw outcomeError('重複の確認に失敗したため登録を停止しました。', 'rejected');
      if (typeof result.confirmationToken !== 'string' || !result.confirmationToken) {
        throw outcomeError('重複確認の応答が不正なため登録を停止しました。', 'rejected');
      }
      const reason = result.similarKind === 'redated'
        ? '同じ人が24時間以内に、日付だけ違う同じ内容（貸主・借主・品目・金額）を登録しています。'
        : '同じ日付・貸主・借主・品目・金額の取引が登録されています。';
      if (!root.confirm(`${reason}\n本当に別の取引として登録しますか？キャンセルすると登録しません。`)) {
        throw outcomeError('同じ内容の取引があるため登録を取りやめました。', 'rejected');
      }
      // The server rejected before writing. Keep the same durable receipt ID
      // when resending the explicitly approved transaction.
      requestPayload = { ...payload, duplicateConfirmed: true, confirmationToken: result.confirmationToken };
    }
    if (result?.code === 'SESSION_REQUIRED') {
      root.LoanSession?.clear();
      throw outcomeError(result.message, 'rejected');
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
