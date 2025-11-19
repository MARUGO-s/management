/**
 * スプレッドシートのIDとシート名。
 */
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
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
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    const errorMessage = "ERROR: リクエストボディが空、または無効です。";
    Logger.log(errorMessage);
    return createJsonResponse({ status: 'ERROR', message: errorMessage }, 400);
  }

  try {
    const data = JSON.parse(e.postData.contents);
    Logger.log("✅ 受信データ: " + JSON.stringify(data));

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
    return createJsonResponse({ status: 'ERROR', message: "サーバーエラー: " + error.message }, 500);
  }
}

/**
 * 修正データを特定の行の直前に挿入する関数
 */
function processCorrectionData(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) throw new Error(`「${TARGET_SHEET_NAME}」シートが見つかりません。`);

    const correctionMark = data.correctionMark || "✏️修正";
    const rowData = createRowDataArray(data, correctionMark);

    let targetRowIndex = null;

    // 1. originalRowIndex による特定を試行
    if (data.originalRowIndex && typeof data.originalRowIndex === 'number' && data.originalRowIndex >= 2) {
      targetRowIndex = data.originalRowIndex;
      Logger.log(`🎯 originalRowIndex による行特定: ${targetRowIndex}`);
    }

    // 2. originalCreatedAt による特定を試行（作成日時カラムは10列目）
    else if (data.originalCreatedAt) {
      Logger.log(`🔍 originalCreatedAt による行検索: ${data.originalCreatedAt}`);
      const createdAtColumn = 10; // 作成日時カラム
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const dataRange = sheet.getRange(2, createdAtColumn, lastRow - 1, 1);
        const createdAtValues = dataRange.getValues();

        for (let i = 0; i < createdAtValues.length; i++) {
          const cellValue = createdAtValues[i][0];
          if (cellValue && cellValue.toString().trim() === data.originalCreatedAt.trim()) {
            targetRowIndex = i + 2; // 2行目から開始するため+2
            Logger.log(`✅ 作成日時で行を特定: ${targetRowIndex}`);
            break;
          }
        }
      }
    }

    // 3. originalRowId による特定を試行
    else if (data.originalRowId) {
      Logger.log(`🔍 originalRowId による行検索: ${data.originalRowId}`);
      // UUIDカラムがある場合（例：12列目）
      const idColumn = 12;
      const lastRow = sheet.getLastRow();
      if (sheet.getLastColumn() >= idColumn && lastRow > 1) {
        const dataRange = sheet.getRange(2, idColumn, lastRow - 1, 1);
        const idValues = dataRange.getValues();

        for (let i = 0; i < idValues.length; i++) {
          const cellValue = idValues[i][0];
          if (cellValue && cellValue.toString().trim() === data.originalRowId.trim()) {
            targetRowIndex = i + 2;
            Logger.log(`✅ RowIdで行を特定: ${targetRowIndex}`);
            break;
          }
        }
      }
    }

    // どの方法でも特定できない場合は先頭に挿入
    if (!targetRowIndex) {
      Logger.log("⚠️ 元行を特定できませんでした。先頭行（2行目）に挿入します。");
      targetRowIndex = 2;
    }

    // 行番号の妥当性チェック
    const lastRow = sheet.getLastRow();
    if (targetRowIndex > lastRow + 1) {
      Logger.log(`⚠️ 計算された行番号 ${targetRowIndex} が範囲外。最終行後に挿入します。`);
      targetRowIndex = lastRow + 1;
    }

    Logger.log(`📝 修正データを行 ${targetRowIndex} の直前に挿入します。`);

    // 指定行の直前に新しい行を挿入
    sheet.insertRowBefore(targetRowIndex);

    // 新しく挿入された行にデータを書き込み
    sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);

    createBackup("correction");
    sendBorrowerEmail_(data, true);

    Logger.log(`✅ 修正データ挿入完了。行: ${targetRowIndex}`);
    return createJsonResponse({ status: 'SUCCESS', message: '修正データが正常に挿入されました。' });

  } catch (error) {
    Logger.log("❌ 修正データ挿入エラー: " + error.toString());
    return createJsonResponse({ status: 'ERROR', message: "修正データ挿入エラー: " + error.message }, 500);
  }
}

/**
 * 通常データをシートの先頭に挿入する関数
 */
function processNormalData(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) throw new Error(`「${TARGET_SHEET_NAME}」シートが見つかりません。`);

    const correctionMark = data.isCorrection ? (data.correctionMark || "✏️修正") : "";
    const rowData = createRowDataArray(data, correctionMark);

    sheet.insertRowBefore(2);
    sheet.getRange(2, 1, 1, rowData.length).setValues([rowData]);

    createBackup(data.isCorrection ? "correction" : "normal");
    sendBorrowerEmail_(data, data.isCorrection === true);

    Logger.log("✅ データ挿入処理完了");
    return createJsonResponse({ status: 'SUCCESS', message: 'データが正常に挿入されました。' });

  } catch (error) {
    Logger.log("❌ データ挿入エラー: " + error.toString());
    return createJsonResponse({ status: 'ERROR', message: "データ挿入エラー: " + error.message }, 500);
  }
}

/**
 * 書き込むデータの配列を作成する共通関数
 * 🔧 日付処理を改善：タイムゾーンの問題を解決
 * 🔧 数量フィールド：小数点以下を保持するため文字列として明示的に処理
 */
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
    ];
}


// --- 検索、メール、その他のヘルパー関数 ---

function sendBorrowerEmail_(data, isCorrection) {
  try {
    let email = getEmailByBorrowerName_(data.borrower);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const unitPriceDisp = (parseFloat(data.unitPrice || 0)).toLocaleString('ja-JP');
    const amountDisp = (parseFloat(data.amount || 0)).toLocaleString('ja-JP');
    const subject = '【貸借管理】新しい取引が登録されました';
    const bodyText = `${data.borrower} 様\n\n以下の内容で登録されました：\n\n日付: ${data.date}\n品目: ${data.item}\n個/本: ${data.quantity}\n単価: ${unitPriceDisp} 円\n金額: ${amountDisp} 円\n貸主: ${data.lender}\nカテゴリー: ${data.category}\n${isCorrection ? '備考: ✏️修正\n' : ''}\n--\n貸借管理システム`;
    MailApp.sendEmail({ to: email, subject, body: bodyText });
    Logger.log('📧 借主へメール送信済み: ' + email);
  } catch (err) {
    Logger.log('❌ メール送信エラー: ' + err.toString());
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
  return createJsonResponse({ status: 'SUCCESS', message: "GAS動作確認OK (GET)"});
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

  } catch (error) {
    Logger.log(`バックアップ作成エラー: ${error.message}`);
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
    const sheet = SpreadsheetApp.openById('1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY').getSheetByName('食材コスト');

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
    ]);

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
    const sheet = SpreadsheetApp.openById('1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY').getSheetByName('原価リスト');

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
    ]);

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
