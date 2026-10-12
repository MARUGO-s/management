/**
 * スプレッドシートのIDとシート名。
 */
const SPREADSHEET_ID = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY';
const TARGET_SHEET_NAME = "貸借表"; // データを操作するシート名

/**
 * 詳細なバックアップ設定
 */
const BACKUP_FOLDER_NAME = "貸借表バックアップ";
const BACKUP_RETENTION = {
  IMMEDIATE: 14,    // 即時バックアップ保持期間（日数）
  DAILY: 60,        // 日次バックアップ保持期間（日数）
  WEEKLY: 180,     // 週次バックアップ保持期間（日数）
  MONTHLY: 365,    // 月次バックアップ保持期間（日数）
  MAX_AGE: 365     // 最大保持期間（これを超えると削除対象）
};

/**
 * WebアプリのPOSTリクエストを処理するメイン関数
 */
// ログインで発行されたトークンを Supabase で確認する（有効なものは10分キャッシュ）。
// anon キーは公開前提の値（画面の config.js と同じ）。
const SUPABASE_URL = 'https://mzismgyctulktrihcwfg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXNtZ3ljdHVsa3RyaWhjd2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTI0MTEsImV4cCI6MjA3MzY4ODQxMX0.ZgXkgPnz408eN1uMVG5dmOxpcV1zQgBfh7Qgekh0nAg';

function verifySession_(token) {
  if (!token || typeof token !== 'string') return false;
  const cache = CacheService.getScriptCache();
  const key = 'session_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 43);
  if (cache.get(key) === 'ok') return true;
  const response = UrlFetchApp.fetch(SUPABASE_URL + '/functions/v1/password-manager', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify({ action: 'check-token', token: token })
  });
  if (response.getResponseCode() !== 200) throw new Error('ログインの確認に失敗しました。');
  const valid = JSON.parse(response.getContentText()).valid === true;
  if (valid) cache.put(key, 'ok', 600);
  return valid;
}

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    const errorMessage = "ERROR: リクエストボディが空、または無効です。";
    Logger.log(errorMessage);
    return createJsonResponse({ status: 'ERROR', message: errorMessage }, 400);
  }

  try {
    const data = JSON.parse(e.postData.contents);
    // トークンはログや行データに残さない。
    const sessionToken = data.sessionToken;
    delete data.sessionToken;
    if (!verifySession_(sessionToken)) {
      return createJsonResponse({ status: 'ERROR', written: false, code: 'SESSION_REQUIRED',
        message: 'ログインの有効期限が切れました。ログインし直してから送信してください。' }, 401);
    }
    Logger.log("✅ 受信データ: " + JSON.stringify({receiptId: data.receiptId, action: data.action || 'registration', isCorrection: data.isCorrection === true}));

    // CSVアップロード処理
    if (data.action === 'uploadIngredients') {
      return handleIngredientsUpload(data.data);
    } else if (data.action === 'uploadCost') {
      return handleCostUpload(data.data);
    }

    // ★ 追加: 行番号キーの正規化（originalRowIndex / rowIndex / sourceRow のいずれでも可）
    // 数値に変換できた場合のみ originalRowIndex に上書きします（既存分岐の typeof === 'number' に対応）
    if (data && data.isCorrection === true) {
      var _candidate = (data.originalRowIndex != null ? data.originalRowIndex
                       : (data.rowIndex != null ? data.rowIndex
                       : data.sourceRow));
      var _n = Number(_candidate);
      if (!isNaN(_n)) {
        data.originalRowIndex = _n;
      }
    }
    // ★ 追加ここまで

    validateReceipt_(data);
    if (data.isCorrection === true && data.correctionMark && data.correctionMark !== '✏️修正') {
      throw new Error('修正マークが不正です。修正画面から選び直してください。');
    }
    if (data.isCorrection === true && !(data.originalRowIndex >= 2 || data.originalCreatedAt || data.originalRowId)) {
      throw new Error('修正元の行を特定できません。修正画面から選び直してください。');
    }

    // 修正データか通常データかを振り分け
    if (data.isCorrection === true && (
        (typeof data.originalRowIndex === 'number' && data.originalRowIndex >= 2) ||
        data.originalCreatedAt ||
        data.originalRowId
      )) {
      // 修正データで元行特定情報がある場合、専用関数を呼び出す
      Logger.log(`📝 修正データ処理を開始。元行特定情報: rowIndex=${data.originalRowIndex}, createdAt=${data.originalCreatedAt}, rowId=${data.originalRowId}`);
      return processCorrectionData(data);
    } else {
      // 通常のデータの場合、元の関数を呼び出す
      Logger.log("📋 通常データとして先頭行への挿入を開始。");
      return processNormalData(data);
    }

  } catch (error) {
    Logger.log("❌ doPost エラー: " + error.toString());
    return createJsonResponse({ status: 'ERROR', written: false, message: "サーバーエラー: " + error.message }, 500);
  }
}

/**
 * Durable receipt metadata lives in L/M of the SAME row as A:K.
 * A separate receipt ledger would leave a crash window between the two writes.
 */
function validateReceipt_(data) {
  if (data.receiptVersion !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.receiptId || '')) {
    throw new Error('二重登録防止のため、画面を再読み込みしてから送信してください。');
  }
}

function receiptHash_(data) {
  const fields = ['date', 'name', 'lender', 'borrower', 'category', 'item', 'quantity', 'unitPrice', 'amount'];
  const canonical = JSON.stringify([
    ...fields.map(field => String(data[field] == null ? '' : data[field])),
    data.isCorrection === true,
    data.isCorrection ? (data.correctionMark || '✏️修正') : '',
    data.originalCreatedAt || data.originalRowId || data.originalRowIndex || '',
    // 入力日時だけでは同秒の元行を区別できない。元行の受付IDも送られた場合だけ内容に含め、
    // 受付IDを送らない旧画面のハッシュは変えない。
    ...(data.originalCreatedAt && data.originalRowId ? [String(data.originalRowId)] : [])
  ]);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonical)
    .map(value => ('0' + ((value + 256) % 256).toString(16)).slice(-2)).join('');
}

function receiptSuccess_(data, duplicate, notifications) {
  return { status: 'SUCCESS', idempotencyVersion: 1, receiptId: data.receiptId,
    duplicate: duplicate, notifications: notifications || { backup: 'skipped', email: 'skipped' },
    message: duplicate ? '登録済みの結果を確認しました。' : '正常に登録しました。' };
}

function receiptColumnsAvailable_(sheet) {
  const width = Math.min(2, sheet.getMaxColumns() - 11);
  if (width <= 0) return true;
  // 見出し設定済みなら全行を読まない（毎回の事前確認GETを軽くする）。
  const header = sheet.getRange(1, 12, 1, width).getValues()[0];
  if (header[0] === '__receipt_id_v1' && header[1] === '__receipt_hash_v1') return true;
  const range = sheet.getRange(1, 12, Math.max(sheet.getLastRow(), 1), width);
  const values = range.getValues();
  return !values.some(row => row.some(value => value !== '')) &&
    !range.getFormulas().some(row => row.some(value => value !== ''));
}

function findReceipt_(sheet, data) {
  validateReceipt_(data);
  const headers = ['__receipt_id_v1', '__receipt_hash_v1'];
  if (sheet.getMaxColumns() < 13) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 13 - sheet.getMaxColumns());
  }
  const current = sheet.getRange(1, 12, 1, 2).getValues()[0];
  if (current[0] !== headers[0] || current[1] !== headers[1]) {
    if (!receiptColumnsAvailable_(sheet)) throw new Error('受付ID用のL・M列に既存データがあります。管理者にご連絡ください。');
    sheet.getRange(1, 12, 1, 2).setValues([headers]);
    sheet.hideColumns(12, 2);
  }
  if (sheet.getLastRow() < 2) return null;
  const match = sheet.getRange(2, 12, sheet.getLastRow() - 1, 1)
    .createTextFinder(data.receiptId).matchEntireCell(true).findNext();
  if (!match) return null;
  const hash = sheet.getRange(match.getRow(), 13, 1, 1).getValues()[0][0];
  if (hash !== receiptHash_(data)) throw new Error('同じ受付IDで内容が変更されています。登録を停止しました。');
  return receiptSuccess_(data, true);
}

// A new receipt is not proof of a new transaction: check business fields under
// the same ScriptLock used for insertion. This is a confirmation gate, not a
// unique constraint (two legitimate deliveries can have identical fields).
function similarTransactionKey_(date, lender, borrower, item, amount) {
  const rawDate = date instanceof Date ? Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd') : String(date || '');
  const match = rawDate.match(/(\d{4})[年\/\-.](\d{1,2})[月\/\-.](\d{1,2})/);
  const day = match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
  const store = value => {
    const name = String(value || '').trim().normalize('NFKC').replace(/[-‐‒–−－]/g, '‑');
    return ({ 'マルゴ': 'MARUGO', 'マルゴセカンド': 'MARUGO2', 'クラウディア2': 'Claudia2',
      'BISTRO CAVA,CAVA': 'BISTRO CAVACAVA', 'BISTRO CAVA CAVA': 'BISTRO CAVACAVA',
      'BISTROCAVACAVA': 'BISTRO CAVACAVA', 'BISTRO CAVA・CAVA': 'BISTRO CAVACAVA',
      'BISTRO CAVA‑CAVA': 'BISTRO CAVACAVA' })[name] || name;
  };
  const product = String(item || '').normalize('NFKC').toLowerCase()
    .replace(/[\s・,.'’"]/g, '').replace(/20(\d{2})/g, '$1');
  const value = Number(String(amount ?? '').normalize('NFKC').replace(/[,\s¥￥]/g, ''));
  if (!day || !store(lender) || !store(borrower) || !product || !Number.isFinite(value)) return '';
  return JSON.stringify([day, store(lender), store(borrower), product, Math.round(value * 100)]);
}

function similarRowKey_(row) {
  return similarTransactionKey_(row[0], row[2], row[3], row[5], row[8]) ||
    similarTransactionKey_(row[9], row[2], row[3], row[5], row[8]);
}

function similarInputTime_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return value.getTime();
  const match = String(value || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return match ? new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0)).getTime() : NaN;
}

function similarInputLabel_(value) {
  const label = Object.prototype.toString.call(value) === '[object Date]'
    ? Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
    : String(value || '').trim();
  const match = label.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return match ? `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')} ` +
    `${match[4].padStart(2, '0')}:${match[5]}:${match[6] || '00'}` : label;
}

// A correction cancels at most one older reverse row. Use the same passes as the
// browser's DuplicateCheck.findCorrectionPairs: same day, then a one-day historical
// offset, then a correction that reverses an already-paired correction (undo).
// rows are A:K values from sheet row 2; returns { row, index } for live rows.
function activeRowsFromValues_(rows) {
  const parts = rows.map(row => {
    const key = similarRowKey_(row);
    return key ? JSON.parse(key) : null;
  });
  const time = rows.map(row => similarInputTime_(row[9]));
  const item = rows.map(row => String(row[5] || '').trim());
  const correction = rows.map(row => String(row[10] || '').includes('✏️修正'));
  const key = (i, reverse) => JSON.stringify([parts[i][reverse ? 2 : 1], parts[i][reverse ? 1 : 2], item[i], parts[i][4]]);
  const byKey = new Map();
  rows.forEach((_, i) => {
    if (!parts[i]) return;
    const k = key(i, false);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(i);
  });
  const day = i => Date.parse(parts[i][0]);
  const used = new Set();
  const partner = new Map();
  const pair = (a, b) => { used.add(a); used.add(b); partner.set(a, b); partner.set(b, a); };
  const corrections = rows.map((_, i) => i).filter(i => correction[i])
    .sort((a, b) => (time[a] || 0) - (time[b] || 0));
  const closest = (c, list) => list.sort((a, b) => Math.abs(day(a) - day(c)) - Math.abs(day(b) - day(c)) ||
    Math.abs(a - c) - Math.abs(b - c))[0];
  const eligible = (c, i, maxDays) => i !== c && Math.abs(day(i) - day(c)) <= maxDays * 86400000 && !(time[i] > time[c]);
  [0, 1].forEach(maxDays => corrections.forEach(c => {
    if (used.has(c) || !parts[c]) return;
    const found = closest(c, (byKey.get(key(c, true)) || []).filter(i => !used.has(i) && eligible(c, i, maxDays)));
    if (found !== undefined) pair(c, found);
  }));
  // 修正の修正: 組になった修正を逆向きに取り消す修正は、その修正と組にし、元の行を集計に戻す。
  corrections.forEach(c => {
    if (used.has(c) || !parts[c]) return;
    const found = closest(c, (byKey.get(key(c, true)) || []).filter(i => correction[i] && used.has(i) &&
      !correction[partner.get(i)] && eligible(c, i, 1)));
    if (found === undefined) return;
    const revived = partner.get(found);
    used.delete(revived);
    partner.delete(revived);
    pair(c, found);
  });
  return rows.map((row, i) => ({ row, index: i + 2 })).filter(({ index }) => !used.has(index - 2) && !correction[index - 2]);
}

function activeTransactionRows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return activeRowsFromValues_(sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues());
}

// 修正行は内容で元行と組になるため、同じ内容の元行が複数あると、選んだ行ではない行を
// 取り消したことになり得る（間に行が入ると、等距離の別の修正の相手が入れ替わることもある）。
// 書き込み前に挿入後の組を計算し、「選んだ1行だけが集計から外れる」位置に挿入する。
// 候補は元行の直前・直後・先頭（先頭なら既存の行どうしの距離は変わらない）。どれも駄目なら止める。
function correctionInsertPosition_(sheet, data, targetRowIndex) {
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  const expected = new Set(activeRowsFromValues_(rows).map(({ index }) => index));
  if (!expected.delete(targetRowIndex)) throw new Error('修正元の未取消取引が見つかりません。修正画面から選び直してください。');
  // シートは先頭の ' を数式除けの書式として扱い、値には残さない。
  const newRow = createRowDataArray(data, '✏️修正')
    .map(value => typeof value === 'string' ? value.replace(/^'(?=[=+\-@])/, '') : value);
  // 最終行の直後への追加（insertRowAfter）は、表の範囲外になり得るため最後の手段にする。
  const lastRowIndex = rows.length + 1;
  const positions = targetRowIndex < lastRowIndex
    ? [targetRowIndex, targetRowIndex + 1, 2] : [targetRowIndex, 2, targetRowIndex + 1];
  for (const position of positions) {
    const at = position - 2;
    const after = activeRowsFromValues_(rows.slice(0, at).concat([newRow], rows.slice(at)))
      .map(({ index }) => index < position ? index : index - 1);
    if (after.length === expected.size && after.every(index => expected.has(index))) return position;
  }
  throw new Error('同じ内容の取引が近くにあり、選んだ行だけを取り消せないため登録を停止しました。管理者にご連絡ください。');
}

function similarTransactionParts_(a, b, reverse, exactItem) {
  if (!a || !b) return false;
  const x = JSON.parse(a), y = JSON.parse(b);
  const first = reverse ? x[2] === y[1] && x[1] === y[2] : x[1] === y[1] && x[2] === y[2];
  const sameItem = x[3] === y[3] || (!exactItem && x[3].length >= 3 && y[3].length >= 3 &&
    (x[3].includes(y[3]) || y[3].includes(x[3])));
  return first && x[4] === y[4] && sameItem &&
    (reverse ? Math.abs(Date.parse(x[0]) - Date.parse(y[0])) <= 86400000 : x[0] === y[0]);
}

function validateCorrectionOrigin_(sheet, data) {
  const key = similarTransactionKey_(data.date, data.lender, data.borrower, data.item, data.amount);
  const candidates = key ? activeTransactionRows_(sheet).filter(({row}) =>
    String(data.item || '').trim() === String(row[5] || '').trim() &&
    similarTransactionParts_(key, similarRowKey_(row), true, true)) : [];
  let selected;
  if (data.originalRowId) {
    selected = candidates.find(({index}) => String(sheet.getRange(index, 12, 1, 1).getValues()[0][0]) === String(data.originalRowId).trim());
  } else if (data.originalCreatedAt) {
    const matching = candidates.filter(({row}) => similarInputLabel_(row[9]) === similarInputLabel_(data.originalCreatedAt));
    selected = matching.find(({index}) => index === data.originalRowIndex) || matching[0];
  } else {
    selected = candidates.find(({index}) => index === data.originalRowIndex);
  }
  if (!selected) throw new Error('修正元の未取消取引が見つかりません。修正画面から選び直してください。');
  return selected.index;
}

function hasSimilarTransaction_(sheet, data) {
  const target = similarTransactionKey_(data.date, data.lender, data.borrower, data.item, data.amount);
  if (!target) throw new Error('重複確認に必要な取引項目が不正です。');
  const kind = similarTransactionKind_(activeTransactionRows_(sheet), data, target, Date.now());
  if (!kind) return '';
  const cache = CacheService.getScriptCache();
  const key = 'similar-confirm:' + data.receiptId;
  const challenge = cache.get(key);
  if (data.duplicateConfirmed === true && typeof data.confirmationToken === 'string' &&
      challenge === receiptHash_(data) + '|' + data.confirmationToken) {
    cache.remove(key);
    return '';
  }
  return kind;
}

// 画面の送信前確認（DuplicateCheck.findSimilarForNewEntries）と同じ2条件:
//   sameDay: 同じ日付・貸主・借主・金額で品目が同じ（表記ゆれを含む）
//   redated: 同じ人が24時間以内に、日付だけ違う同じ内容を登録している
function similarTransactionKind_(liveRows, data, target, now) {
  const name = String(data.name || '').replace(/[\s　]/g, '');
  let kind = '';
  liveRows.some(({ row }) => {
    const other = similarRowKey_(row);
    if (similarTransactionParts_(target, other, false, false)) { kind = 'sameDay'; return true; }
    if (!kind && name && String(row[1] || '').replace(/[\s　]/g, '') === name &&
        now - similarInputTime_(row[9]) <= 86400000 && similarRedatedParts_(target, other)) kind = 'redated';
    return false;
  });
  return kind;
}

function similarRedatedParts_(a, b) {
  if (!a || !b) return false;
  const x = JSON.parse(a), y = JSON.parse(b);
  return x[0] !== y[0] && x[1] === y[1] && x[2] === y[2] && x[4] === y[4] &&
    (x[3] === y[3] || (x[3].length >= 3 && y[3].length >= 3 && (x[3].includes(y[3]) || y[3].includes(x[3]))));
}

function similarTransactionResponse_(data, kind) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('similar-confirm:' + data.receiptId, receiptHash_(data) + '|' + token, 600);
  return createJsonResponse({ status: 'ERROR', written: false, code: 'SIMILAR_TRANSACTION',
    confirmationToken: token, similarKind: kind,
    message: kind === 'redated'
      ? '同じ人が24時間以内に、日付だけ違う同じ内容（貸主・借主・品目・金額）を登録しています。別の取引として登録する場合のみ確認してください。'
      : '同じ日付・貸主・借主・品目・金額の取引が登録済みです。別の取引として登録する場合のみ確認してください。' });
}

function finishReceiptNotifications_(data, isCorrection) {
  const result = { backup: 'completed', email: 'completed' };
  // Failures after a durable registration must not masquerade as a failed write.
  try { result.backup = createBackup(isCorrection ? 'correction' : 'normal') || 'completed'; }
  catch (error) { result.backup = 'failed'; Logger.log('バックアップエラー: ' + error.message); }
  try { result.email = sendBorrowerEmail_(data, isCorrection) || 'completed'; }
  catch (error) { result.email = 'failed'; Logger.log('メール通知エラー: ' + error.message); }
  return result;
}

// 書き込み後の失敗は登録失敗ではない。受付IDの行が残っていれば成功として通知まで完了させる。
// 戻り値: 成功応答 / false（行がないことを確認）/ null（確認できない）。
function recoverWrittenReceipt_(data, isCorrection, lock, error) {
  let match;
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) return null;
    if (sheet.getLastRow() < 2) return false;
    match = sheet.getRange(2, 12, sheet.getLastRow() - 1, 1)
      .createTextFinder(data.receiptId).matchEntireCell(true).findNext();
  } catch (lookupError) {
    Logger.log('⚠️ 登録有無を確認できません: ' + lookupError.message);
    return null;
  }
  if (!match) return false;
  Logger.log('⚠️ 登録後の処理で例外（登録は完了）: ' + error.message);
  if (lock.hasLock()) lock.releaseLock();
  return createJsonResponse(receiptSuccess_(data, false, completeNotifications_(data, isCorrection)));
}

function writeFailure_(data, isCorrection, lock, error, label) {
  Logger.log('❌ ' + label + ': ' + error.toString());
  const recovered = recoverWrittenReceipt_(data, isCorrection, lock, error);
  if (recovered) return recovered;
  if (recovered === false) clearPendingNotifications_(data);
  // written:false は「行がないことを確認済み」。確認できない場合は画面側で未確認として扱う。
  return createJsonResponse({ status: 'ERROR', written: recovered === false ? false : 'unknown',
    message: label + ': ' + error.message }, 500);
}

// 通知前に処理が中断した登録を、同じ受付IDの再送時に補う。
const NOTIFY_PENDING_PREFIX = 'notify_pending_';
const NOTIFY_STALE_MS = 6 * 60 * 1000; // GASの最大実行時間。進行中の処理と二重に通知しない。

function markPendingNotifications_(data) {
  try {
    PropertiesService.getScriptProperties().setProperty(NOTIFY_PENDING_PREFIX + data.receiptId, String(Date.now()));
  } catch (error) {
    Logger.log('⚠️ 通知待ちを記録できません: ' + error.message);
  }
}

function clearPendingNotifications_(data) {
  try {
    PropertiesService.getScriptProperties().deleteProperty(NOTIFY_PENDING_PREFIX + data.receiptId);
  } catch (error) {
    Logger.log('⚠️ 通知待ちを解除できません: ' + error.message);
  }
}

function completeNotifications_(data, isCorrection) {
  const notifications = finishReceiptNotifications_(data, isCorrection);
  clearPendingNotifications_(data);
  return notifications;
}

// ロック内で呼ぶ。中断した通知だけを確保してから、ロック外で送る。
function duplicateResponse_(data, receipt, isCorrection, lock) {
  let pendingSince = 0;
  try {
    const properties = PropertiesService.getScriptProperties();
    const key = NOTIFY_PENDING_PREFIX + data.receiptId;
    pendingSince = Number(properties.getProperty(key) || 0);
    if (!pendingSince || Date.now() - pendingSince < NOTIFY_STALE_MS) return createJsonResponse(receipt);
    properties.setProperty(key, String(Date.now()));
  } catch (error) {
    Logger.log('⚠️ 通知待ちを確認できません: ' + error.message);
    return createJsonResponse(receipt);
  }
  if (lock.hasLock()) lock.releaseLock();
  return createJsonResponse(receiptSuccess_(data, true, completeNotifications_(data, isCorrection)));
}

function processCorrectionData(data) {
  // 同時実行（複数端末・ダブルクリック等）による行挿入の競合を防ぐためスクリプトロックで直列化する
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("⛔ ロック取得タイムアウト（修正データ）");
    return createJsonResponse({ status: 'ERROR', written: false, message: '他の処理が実行中のため登録できませんでした。数秒後に再度お試しください。' }, 503);
  }
  let writing = false;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) throw new Error(`「${TARGET_SHEET_NAME}」シートが見つかりません。`);

    const receipt = findReceipt_(sheet, data);
    if (receipt) return duplicateResponse_(data, receipt, true, lock);
    const insertRowIndex = correctionInsertPosition_(sheet, data, validateCorrectionOrigin_(sheet, data));
    const correctionMark = "✏️修正";
    const rowData = createRowDataArray(data, correctionMark).concat([data.receiptId, receiptHash_(data)]);

    Logger.log(`📝 修正データを行 ${insertRowIndex} に挿入します。`);

    // 元行の直前（必要なら直後）に新しい行を挿入
    markPendingNotifications_(data);
    writing = true; // ここから先の失敗は行の有無を確認してから応答する。
    if (insertRowIndex > sheet.getLastRow()) sheet.insertRowAfter(insertRowIndex - 1);
    else sheet.insertRowBefore(insertRowIndex);

    // 新しく挿入された行にデータを書き込み
    sheet.getRange(insertRowIndex, 1, 1, rowData.length).setValues([rowData]);

    SpreadsheetApp.flush(); // 取引と受付IDを同一行で確定する。
    if (lock.hasLock()) lock.releaseLock();
    const notifications = completeNotifications_(data, true);
    return createJsonResponse(receiptSuccess_(data, false, notifications));

  } catch (error) {
    if (!writing) {
      Logger.log("❌ 修正データ挿入エラー: " + error.toString());
      return createJsonResponse({ status: 'ERROR', written: false, message: "修正データ挿入エラー: " + error.message }, 500);
    }
    return writeFailure_(data, true, lock, error, "修正データ挿入エラー");
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * 通常データをシートの先頭に挿入する関数
 */
function processNormalData(data) {
  // 同時実行（複数端末・ダブルクリック等）による行挿入の競合を防ぐためスクリプトロックで直列化する
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("⛔ ロック取得タイムアウト（通常データ）");
    return createJsonResponse({ status: 'ERROR', written: false, message: '他の処理が実行中のため登録できませんでした。数秒後に再度お試しください。' }, 503);
  }
  let writing = false;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) throw new Error(`「${TARGET_SHEET_NAME}」シートが見つかりません。`);

    const receipt = findReceipt_(sheet, data);
    if (receipt) return duplicateResponse_(data, receipt, data.isCorrection === true, lock);
    if (data.isCorrection === true) throw new Error('修正データは修正画面から登録してください。');
    const similarKind = hasSimilarTransaction_(sheet, data);
    if (similarKind) return similarTransactionResponse_(data, similarKind);
    const correctionMark = data.isCorrection ? (data.correctionMark || "✏️修正") : "";
    const rowData = createRowDataArray(data, correctionMark).concat([data.receiptId, receiptHash_(data)]);

    markPendingNotifications_(data);
    writing = true; // ここから先の失敗は行の有無を確認してから応答する。
    sheet.insertRowBefore(2);
    sheet.getRange(2, 1, 1, rowData.length).setValues([rowData]);

    SpreadsheetApp.flush(); // 取引と受付IDを同一行で確定する。
    if (lock.hasLock()) lock.releaseLock();
    const notifications = completeNotifications_(data, data.isCorrection === true);
    return createJsonResponse(receiptSuccess_(data, false, notifications));

  } catch (error) {
    if (!writing) {
      Logger.log("❌ データ挿入エラー: " + error.toString());
      return createJsonResponse({ status: 'ERROR', written: false, message: "データ挿入エラー: " + error.message }, 500);
    }
    return writeFailure_(data, data.isCorrection === true, lock, error, "データ挿入エラー");
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * 書き込むデータの配列を作成する共通関数
 * 🔧 日付処理を改善：タイムゾーンの問題を解決
 * 🔧 数量フィールド：小数点以下を保持するため文字列として明示的に処理
 */
// 利用者の入力が「=」「+」「-」「@」で始まるとシートで数式として実行されるため、文字列として書く。
function sheetText_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

function createRowDataArray(data, correctionMark) {
    // 📅 日付文字列を "YYYY/MM/DD" 形式に変換
    // Google Sheetsが日本ロケールとして正しく認識するようにする
    let dateValue = data.date;
    if (data.date && typeof data.date === 'string') {
      if (data.date.includes('-')) {
        // "2025-10-15" → "2025/10/15" に変換
        dateValue = data.date.replace(/-/g, '/');
        Logger.log(`📅 日付フォーマット変換: "${data.date}" → "${dateValue}"`);
      }
    }

    // 🔢 数量を文字列として明示的に処理（小数点以下を保持）
    // 数値として解釈されると丸められる可能性があるため、文字列として扱う
    let quantityValue = '';
    if (data.quantity != null && data.quantity !== '') {
      // 文字列に変換して小数点以下を保持
      quantityValue = String(data.quantity).trim();
      Logger.log(`🔢 数量フィールド: "${data.quantity}" → "${quantityValue}" (文字列として保持)`);
    }

    // この配列の順番を、スプレッドシートのA列, B列, C列...の順番と完全に一致させる
    return [
      dateValue,         // A列: 貸借数 (日付) - タイムゾーン対応済み
      data.name,         // B列: 名前
      data.lender,       // C列: 貸主
      data.borrower,     // D列: 借主
      data.category,     // E列: カテゴリー
      data.item,         // F列: 品目
      quantityValue,     // G列: 個/本/g - 小数点以下を保持するため文字列として処理
      data.unitPrice,    // H列: 単価
      data.amount,       // I列: 金額
      new Date().toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}), // J列: 入力日時
      correctionMark     // K列: 修正
    ].map(sheetText_);
}


// --- 検索、メール、その他のヘルパー関数 ---

function sendBorrowerEmail_(data, isCorrection) {
  try {
    let email = getEmailByBorrowerName_(data.borrower);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'skipped';
    const unitPriceDisp = (parseFloat(data.unitPrice || 0)).toLocaleString('ja-JP');
    const amountDisp = (parseFloat(data.amount || 0)).toLocaleString('ja-JP');
    const subject = '【貸借管理】新しい取引が登録されました';
    const bodyText = `${data.borrower} 様\n\n以下の内容で登録されました：\n\n日付: ${data.date}\n品目: ${data.item}\n個/本: ${data.quantity}\n単価: ${unitPriceDisp} 円\n金額: ${amountDisp} 円\n貸主: ${data.lender}\nカテゴリー: ${data.category}\n${isCorrection ? '備考: ✏️修正\n' : ''}\n--\n貸借管理システム`;
    MailApp.sendEmail({ to: email, subject, body: bodyText });
    Logger.log('📧 借主へメール送信済み: ' + email);
    return 'completed';
  } catch (err) {
    Logger.log('❌ メール送信エラー: ' + err.toString());
    return 'failed';
  }
}

function getEmailByBorrowerName_(borrowerName) {
  try {
    const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('マスタ');
    if (!sh) return null;
    const values = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    const target = String(borrowerName || '').trim();
    for (const [name, email] of values) {
      if (String(name).trim() === target) return String(email || '').trim() || null;
    }
    return null;
  } catch (e) {
    Logger.log('getEmailByBorrowerName_ エラー: ' + e.toString());
    return null;
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TARGET_SHEET_NAME);
    const ready = !!sheet && receiptColumnsAvailable_(sheet);
    return createJsonResponse({ status: 'SUCCESS', message: 'GAS動作確認OK (GET)',
      idempotencyVersion: 1, similarityVersion: 1, duplicateRulesVersion: 2, receiptColumnsReady: ready });
  } catch (error) {
    return createJsonResponse({ status: 'ERROR', message: error.message, idempotencyVersion: 1,
      receiptColumnsReady: false });
  }
}


// --- 詳細バックアップシステム ---

/**
 * スプレッドシート編集時に即時バックアップを作成するトリガー関数
 */
function onEdit(e) {
  if (!e || !e.range) return;
  if (e.range.getSheet().getName() !== TARGET_SHEET_NAME) return;
  if (e.value === undefined) return;
  recordEditLog(e);
  createBackup("immediate");
}

/**
 * 編集ログを「ログ」シートに記録する関数
 */
function recordEditLog(e) {
  try {
    const logSheetName = "ログ";
    let logSheet = e.source.getSheetByName(logSheetName);
    if (!logSheet) {
      logSheet = e.source.insertSheet(logSheetName);
      logSheet.getRange(1, 1, 1, 5).setValues([["日時", "シート名", "セル", "変更前", "変更後"]]);
    }
    logSheet.insertRowBefore(2);
    logSheet.getRange(2, 1, 1, 5).setValues([[
      new Date(), e.range.getSheet().getName(), e.range.getA1Notation(), e.oldValue || "", e.value
    ]]);
  } catch (error) {
    Logger.log("編集ログ記録エラー: " + error.message);
  }
}

/**
 * 毎日バックアップとクリーンアップを実行するトリガー関数
 */
function dailyCleanupAndBackup() {
  Logger.log("--- 日次バックアップとクリーンアップを開始 ---");
  try {
    createBackup("daily");
    cleanupBackups();
  } catch (e) {
    Logger.log(`日次処理エラー: ${e.message}`);
  }
}

/**
 * バックアップファイルを作成する関数
 */
function createBackup(backupType) {
  try {
    const file = DriveApp.getFileById(SPREADSHEET_ID);
    const backupFolder = getOrCreateBackupFolder_();
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    const backupName = `${file.getName()}_backup_${dateStr}_${backupType}`;

    const backupFile = file.makeCopy(backupName, backupFolder);

    backupFile.setDescription(JSON.stringify({
      originalId: SPREADSHEET_ID,
      backupType: backupType,
      timestamp: new Date().getTime()
    }));
    Logger.log(`バックアップを作成しました: ${backupName}`);
    return 'completed';

  } catch (error) {
    Logger.log(`バックアップ作成エラー: ${error.message}`);
    return 'failed';
  }
}

/**
 * バックアップ用フォルダを取得または作成する関数
 */
function getOrCreateBackupFolder_() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  Logger.log(`バックアップフォルダ「${BACKUP_FOLDER_NAME}」を新規作成しました。`);
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

/**
 * 古いバックアップをルールに従って削除する関数
 */
function cleanupBackups() {
  Logger.log("--- 古いバックアップのクリーンアップを開始 ---");
  try {
    const backupFolder = getOrCreateBackupFolder_();
    const files = backupFolder.getFiles();
    const now = new Date();

    while (files.hasNext()) {
      const file = files.next();
      if (!file.getName().includes("_backup_")) continue;

      const fileDate = file.getDateCreated();
      const ageInDays = (now.getTime() - fileDate.getTime()) / (1000 * 3600 * 24);

      // 最大保持期間を超えたものは無条件で削除
      if (ageInDays > BACKUP_RETENTION.MAX_AGE) {
        Logger.log(`バックアップを削除（最大保持期間超過）: ${file.getName()}`);
        file.setTrashed(true);
      }
      // ここに、さらに詳細な日次・週次・月次ルールを追加することも可能です
    }
    Logger.log("--- バックアップのクリーンアップが完了 ---");
  } catch (error) {
    Logger.log(`クリーンアップエラー: ${error.message}`);
  }
}


// --- CSVアップロード機能 ---

/**
 * 食材データアップロード処理
 */
function handleIngredientsUpload(uploadData) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('食材コスト');

    if (!sheet) {
      throw new Error('食材コストシートが見つかりません');
    }

    // データを配列に変換
    const rows = uploadData.map(item => [
      '', // データ区分（空）
      item.date, // 伝票日付
      '', // 伝票No（空）
      '', // 取引状態（空）
      '', // 自社コード（空）
      '', // 自社会員名（空）
      '', // 自社担当者（空）
      '', // 取引先コード（空）
      item.supplier, // 取引先名
      '', // 納品場所コード（空）
      '', // 納品場所名（空）
      '', // 納品場所住所（空）
      '', // マイカタログID（空）
      '', // 自社管理商品コード（空）
      item.productName, // 商品名
      '', // 規格（空）
      '', // 入数（空）
      item.packUnit, // 入数単位
      item.unitPrice, // 単価
      '', // 数量（空）
      item.unit, // 単位
      '', // 金額（空）
      '', // 消費税（空）
      '', // 小計（空）
      '', // 課税区分（空）
      '', // 税区分（空）
      '', // 合計商品本体（空）
      '', // 合計商品消費税（空）
      '', // 合計送料本体（空）
      '', // 合計送料消費税（空）
      '', // 合計その他（空）
      '', // 総合計（空）
      '', // 発注日（空）
      '', // 発送日（空）
      '', // 納品日（空）
      '', // 受領日（空）
      '', // 取引ID_SYSTEM（空）
      '', // 伝票明細ID_SYSTEM（空）
      '', // 発注送信日（空）
      '', // 発注送信時間（空）
      '', // 送信日（空）
      ''  // 送信時間（空）
    ].map(sheetText_));

    // シートの一番下にデータを追加
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'SUCCESS',
      message: `${rows.length}件の食材データが正常にアップロードされました`,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('食材アップロードエラー:', error);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ERROR',
      message: `食材データのアップロードに失敗しました: ${error.toString()}`
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ワイン原価データアップロード処理
 */
function handleCostUpload(uploadData) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('原価リスト');

    if (!sheet) {
      throw new Error('原価リストシートが見つかりません');
    }

    // 全41列のデータ配列を作成
    const rows = uploadData.map(item => [
      item.dataType || '',           // A: データ区分
      item.date || '',               // B: 伝票日付
      item.slipNo || '',             // C: 伝票No
      item.transactionStatus || '',  // D: 取引状態
      item.companyCode || '',        // E: 自社コード
      item.companyMember || '',      // F: 自社会員名
      item.companyStaff || '',       // G: 自社担当者
      item.supplierCode || '',       // H: 取引先コード
      item.supplier || '',           // I: 取引先名
      item.deliveryCode || '',       // J: 納品場所コード
      item.deliveryName || '',       // K: 納品場所名
      item.deliveryAddress || '',    // L: 納品場所 住所
      item.myCatalogId || '',        // M: マイカタログID
      item.companyProductCode || '', // N: 自社管理商品コード
      item.productName || '',        // O: 商品名
      item.specification || '',      // P: 規格
      item.quantity || '',           // Q: 入数
      item.packUnit || '',           // R: 入数単位
      item.unitPrice || '',          // S: 単価
      item.amount || '',             // T: 数量
      item.unit || '',               // U: 単位
      item.price || '',              // V: 金額
      item.tax || '',                // W: 消費税
      item.subtotal || '',           // X: 小計
      item.taxCategory || '',        // Y: 課税区分
      item.taxType || '',            // Z: 税区分
      item.totalProduct || '',       // AA: 合計 商品本体
      item.totalProductTax || '',   // AB: 合計 商品消費税
      item.totalShipping || '',      // AC: 合計 送料本体
      item.totalShippingTax || '',   // AD: 合計 送料消費税
      item.totalOther || '',         // AE: 合計 その他
      item.grandTotal || '',         // AF: 総合計
      item.orderDate || '',          // AG: 発注日
      item.shippingDate || '',       // AH: 発送日
      item.deliveryDate || '',       // AI: 納品日
      item.receiptDate || '',        // AJ: 受領日
      item.transactionId || '',      // AK: 取引ID_SYSTEM
      item.slipDetailId || '',       // AL: 伝票明細ID_SYSTEM
      item.orderSendDate || '',      // AM: 発注送信日
      item.orderSendTime || '',      // AN: 発注送信時間
      item.sendDate || '',           // AO: 送信日
      item.sendTime || ''            // AP: 送信時間
    ].map(sheetText_));

    // シートの一番下にデータを追加
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 2, rows.length, rows[0].length).setValues(rows);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'SUCCESS',
      message: `${rows.length}件のワイン原価データが正常にアップロードされました`,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('ワイン原価アップロードエラー:', error);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ERROR',
      message: `ワイン原価データのアップロードに失敗しました: ${error.toString()}`
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 数量列（G列）のフォーマットを設定する関数（初回設定時のみ実行）
 * スプレッドシートのフォーマットメニューから手動で設定することも可能
 * この関数は手動で実行するか、トリガーで初回のみ実行してください
 */
function setQuantityColumnFormat() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) throw new Error(`「${TARGET_SHEET_NAME}」シートが見つかりません。`);

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      // G列（7列目）のフォーマットを数値（小数点表示可能）に設定
      const quantityRange = sheet.getRange(2, 7, lastRow - 1, 1);
      quantityRange.setNumberFormat('#,##0.0#######'); // 小数点以下を表示可能にする
      Logger.log('✅ 数量列（G列）のフォーマットを設定しました');
    }

    // ヘッダー行の1列目も含めて、今後追加される行にも適用するため、列全体にフォーマットを設定
    sheet.getRange('G:G').setNumberFormat('#,##0.0#######');
    Logger.log('✅ 数量列（G列）全体のフォーマットを設定しました');

    return '数量列のフォーマット設定が完了しました';
  } catch (error) {
    Logger.log('❌ 数量列フォーマット設定エラー: ' + error.toString());
    return 'エラー: ' + error.toString();
  }
}

/**
 * カテゴリー列（E列）のデータ検証を更新する関数
 * M-mart カードとM-mart 現金を追加します
 * この関数はスクリプトエディタから手動で実行してください
 */
function updateCategoryValidation() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) throw new Error(`「${TARGET_SHEET_NAME}」シートが見つかりません。`);

    // カテゴリーのリスト（M-mart カードとM-mart 現金を追加）
    const categories = ['食材', '飲料', 'M-mart', 'M-mart カード', 'M-mart 現金', 'その他'];

    // データ検証ルールを作成
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(categories, true)  // trueでドロップダウンを表示
      .setAllowInvalid(false)  // 無効な値を許可しない
      .build();

    // E列全体にデータ検証を適用（2行目以降）
    const lastRow = Math.max(sheet.getLastRow(), 1000); // 少なくとも1000行分設定
    const categoryRange = sheet.getRange(2, 5, lastRow, 1); // E列は5列目
    categoryRange.setDataValidation(rule);

    Logger.log('✅ カテゴリー列（E列）のデータ検証を更新しました');
    Logger.log('✅ 新しいカテゴリー: ' + categories.join(', '));

    return 'カテゴリー列のデータ検証設定が完了しました';
  } catch (error) {
    Logger.log('❌ カテゴリー列データ検証設定エラー: ' + error.toString());
    return 'エラー: ' + error.toString();
  }
}
