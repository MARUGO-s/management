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
      throw new Error('送信履歴を保存できません。二重登録防止のため送信を停止しました。ブラウザの保存設定をご確認ください。');
    }
  }
  // GASの応答はGoogle側の中継(echo)で時折404の非JSONになる。GASの処理は完了しているため、
  // 同じリクエスト（POSTは同じ受付ID）を再送して結果を読み直す。通信断・JSON応答は再送しない。
  async function fetchJson(url, options) {
    for (let attempt = 1; ; attempt++) {
      const response = await root.fetch(url, options);
      try {
        return { response, result: await response.json() };
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise(resolve => root.setTimeout(resolve, 1500 * attempt));
      }
    }
  }
  async function ensureServer(url) {
    const { response, result } = await fetchJson(url, { cache: 'no-store', redirect: 'follow' });
    if (result?.receiptColumnsReady === false) {
      throw new Error('受付ID用の列を利用できません。既存の貸借データは変更せず送信を停止しました。管理者にご連絡ください。');
    }
    if (!response.ok || result?.idempotencyVersion !== 1) {
      throw new Error('二重登録防止のサーバー準備が完了していません。送信を停止しました。管理者にご連絡ください。');
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
    const { response, result } = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload), redirect: 'follow'
    });
    if (!response.ok || result?.status !== 'SUCCESS' ||
        result.idempotencyVersion !== 1 || result.receiptId !== payload.receiptId) {
      throw new Error(result?.message || '登録結果を確認できませんでした。同じ内容の再送では二重登録せず結果を確認します。');
    }
    confirmReceipt(url, payload);
    return result;
  }
  async function withLock(url, callback) {
    if (!root.navigator.locks) {
      throw new Error('このブラウザでは二重登録防止を利用できません。最新のブラウザで開いてください。');
    }
    return root.navigator.locks.request('loan-submit:' + url, { ifAvailable: true }, lock => {
      if (!lock) throw new Error('別のタブで送信中です。完了するまでお待ちください。');
      return callback();
    });
  }
  root.LoanReceipts = { ensureServer, prepare, send, withLock };
})(window);
