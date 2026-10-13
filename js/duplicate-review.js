// 重複チェックの確認状態（「問題なし」として非表示）を GAS の「重複確認」シートと読み書きする。
// 表示を隠すだけの記録で、重複の判定・月次報告の件数は変えない。全員で共有する。
// 使う側: pages/marugo.html（window.DuplicateReview.list() / set({...})）。
// config.js（window.LoanSession）の後に読み込む。
(function (root) {
  'use strict';

  // 入力画面（pages/js/main.js の GAS_URL）と同じ Web アプリ
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbxxrH8ZtjpadlxvdnbFFOvyc4kCsANrZt-aOu5HZ2RhlbSgDwFsJzq7AfMGW58w3HTW/exec';
  const KEY_PATTERN = /^dr1_[0-9a-f]{28}$/; // DuplicateCheck.groupKey と同じ形式
  const LEVELS = ['high', 'medium', 'check'];
  const UNSUPPORTED = '確認状態の保存に未対応のサーバーです（GASの更新待ち）。管理者にご連絡ください。';

  function sessionRequired(message) {
    const error = new Error(message || 'ログインの有効期限が切れました。ログインし直してください。');
    error.code = 'SESSION_REQUIRED';
    return error;
  }

  function wait(ms) {
    return new Promise(resolve => root.setTimeout(resolve, ms));
  }

  // 応答が読めない（通信断・Google 側中継の404 HTML）ときだけ1回送り直す。
  // 一覧は読み取りのみ、保存は「最後の記録が有効」なので、送り直しても状態は変わらない。
  async function post(payload) {
    const session = root.LoanSession && root.LoanSession.get();
    if (!session || !session.token) {
      if (root.LoanSession && root.LoanSession.requireLogin) root.LoanSession.requireLogin();
      throw sessionRequired('ログインが必要です。ログインし直してください。');
    }
    const body = JSON.stringify(Object.assign({}, payload, { sessionToken: session.token }));
    let result;
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await root.fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body, redirect: 'follow', cache: 'no-store'
        });
        const text = await response.text();
        result = JSON.parse(text);
        if (!result || typeof result !== 'object') throw new Error('not an object');
        break;
      } catch (error) {
        if (attempt >= 2) throw new Error('サーバーの応答を読み取れませんでした。通信状況を確認して、もう一度お試しください。');
        await wait(1000);
      }
    }
    if (result.code === 'SESSION_REQUIRED') {
      if (root.LoanSession) {
        root.LoanSession.clear();
        if (root.LoanSession.requireLogin) root.LoanSession.requireLogin();
      }
      throw sessionRequired(result.message);
    }
    if (result.duplicateReviewVersion !== 1) throw new Error(UNSUPPORTED);
    if (result.status !== 'SUCCESS') {
      const error = new Error(result.message || '確認状態を保存・取得できませんでした。');
      if (result.code) error.code = result.code;
      throw error;
    }
    return result;
  }

  function cleanReview(review) {
    const text = value => (typeof value === 'string' ? value : '');
    return {
      hidden: !!review && review.hidden === true,
      reviewer: text(review && review.reviewer),
      reviewedAt: text(review && review.reviewedAt),
      note: text(review && review.note)
    };
  }

  // 確認キー → { hidden, reviewer, reviewedAt, note }
  async function list() {
    const result = await post({ action: 'listDuplicateReviews' });
    if (!result.reviews || typeof result.reviews !== 'object') throw new Error(UNSUPPORTED);
    const reviews = {};
    Object.keys(result.reviews).forEach(key => {
      if (KEY_PATTERN.test(key)) reviews[key] = cleanReview(result.reviews[key]);
    });
    return reviews;
  }

  // hidden: true =「問題なし」として非表示、false = 表示に戻す。保存された記録を返す
  async function set(input) {
    const options = input || {};
    const reviewer = typeof options.reviewer === 'string' ? options.reviewer.trim() : '';
    const note = typeof options.note === 'string' ? options.note.trim() : '';
    if (!KEY_PATTERN.test(String(options.key || ''))) throw new Error('確認キーが不正です。画面を再読み込みしてください。');
    if (typeof options.hidden !== 'boolean') throw new Error('非表示・表示の指定が不正です。');
    if (!reviewer) throw new Error('確認者の名前を入力してください。');
    if (reviewer.length > 40) throw new Error('確認者の名前は40文字以内にしてください。');
    if (note.length > 200) throw new Error('メモは200文字以内にしてください。');
    if (LEVELS.indexOf(options.level) < 0) throw new Error('確度が不正です。');
    const result = await post({
      action: 'setDuplicateReview', key: options.key, hidden: options.hidden, reviewer, note,
      level: options.level, kind: String(options.kind || ''), summary: String(options.summary || '')
    });
    if (!result.review || typeof result.review !== 'object') throw new Error(UNSUPPORTED);
    return cleanReview(result.review);
  }

  root.DuplicateReview = { GAS_URL, KEY_PATTERN, list, set };
})(typeof window !== 'undefined' ? window : globalThis);
