<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>逆取引の送信</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* 基本スタイル */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif;
      background-color: #f4f7f6;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 15px;
      color: #333;
    }
    /* メインコンテナ */
    .container {
      background: #ffffff;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
      max-width: 500px;
      width: 100%;
    }
    /* ヘッダー */
    .header-section { text-align: center; margin-bottom: 20px; position: relative; }
    .back-btn {
      position: absolute; top: 50%; left: 0; transform: translateY(-50%);
      background: #f1f1f1; color: #333; border: 1px solid #ddd;
      padding: 6px 10px; border-radius: 8px; cursor: pointer;
      font-size: 12px; font-weight: 600; text-decoration: none;
      transition: background-color 0.2s ease;
    }
    .back-btn:hover { background-color: #e7e7e7; }
    h2 { font-size: clamp(1.4rem, 5vw, 1.6rem); font-weight: 600; margin: 0; white-space: nowrap; }
    .subtitle { color: #666; font-size: clamp(0.8rem, 3vw, 0.85rem); margin-top: 3px; }
    /* フォーム & データ表示 */
    .details-table { margin-bottom: 20px; border-top: 1px solid #f0f0f0; }
    .form-group {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 5px; border-bottom: 1px solid #f0f0f0;
      min-height: 38px; overflow: hidden;
    }
    .details-table .form-group:last-child { border-bottom: none; }
    .form-group label {
      font-weight: 500; color: #555; font-size: clamp(0.85rem, 3.5vw, 0.9rem);
      white-space: nowrap; padding-right: 10px; flex-shrink: 0;
    }
    input:disabled, select:disabled {
      background: transparent; border: none; padding: 0;
      font-size: clamp(0.85rem, 3.5vw, 0.9rem); color: #222;
      font-family: inherit; text-align: right; cursor: default; width: 100%;
      -webkit-appearance: none; -moz-appearance: none; appearance: none;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    select:disabled { background-image: none; }
    /* 名前入力 */
    .name-input-group {
      border-top: 2px solid #333; margin-top: 15px; padding-top: 15px;
      border-bottom: none; display: block;
    }
    .name-input-group label {
      font-size: clamp(1rem, 4vw, 1.05rem); font-weight: 600;
      margin-bottom: 8px; display: block; text-align: center;
    }
    #name {
      width: 100%; padding: 10px 12px; font-size: clamp(0.9rem, 3.8vw, 1rem);
      border: 1px solid #ccc; border-radius: 8px; transition: all 0.2s ease;
    }
    #name:focus {
      outline: none; border-color: #5a7c5a;
      box-shadow: 0 0 0 3px rgba(90, 124, 90, 0.2);
    }
    /* ボタン */
    .button-group { display: flex; gap: 8px; margin-top: 20px; }
    .submit-btn, .cancel-btn {
      flex-grow: 1; width: 100%; padding: 12px 10px; border: none;
      border-radius: 8px; font-size: clamp(0.9rem, 4vw, 1rem);
      font-weight: 600; cursor: pointer; transition: all 0.2s ease; white-space: nowrap;
    }
    .submit-btn { background-color: #5a7c5a; color: white; }
    .submit-btn:hover:not(:disabled) { background-color: #4a6b4a; }
    .cancel-btn { background-color: #aaa; color: white; }
    .cancel-btn:hover { background-color: #999; }
    .submit-btn:disabled { background-color: #cccccc; cursor: not-allowed; }
    .loading {
      display: none; width: 16px; height: 16px; border: 2px solid #ffffff;
      border-radius: 50%; border-top-color: transparent;
      animation: spin 1s linear infinite; margin-right: 5px; vertical-align: middle;
    }
    .submit-btn.loading .loading { display: inline-block; }
    /* その他 */
    .error-notice {
      display: none; background-color: #fff0f0; border: 1px solid #ffcccc;
      color: #d8000c; padding: 10px; border-radius: 8px; text-align: center;
      margin-bottom: 15px; font-size: clamp(0.75rem, 3vw, 0.8rem);
    }
    .error-notice.show { display: block; }
    .hidden-inputs { display: none; }

    /* ========== 【ここから追加】進捗表示ポップアップのスタイル ========== */
    .progress-popup-backdrop {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background-color: rgba(0, 0, 0, 0.6);
      display: none; /* JSで表示を制御 */
      align-items: center; justify-content: center;
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .progress-popup-backdrop.show {
      display: flex;
      opacity: 1;
    }
    .progress-popup {
      background: white; padding: 25px 30px; border-radius: 12px;
      width: 90%; max-width: 350px; text-align: center;
      box-shadow: 0 5px 20px rgba(0,0,0,0.2);
      transform: scale(0.95);
      transition: transform 0.3s ease;
    }
    .progress-popup-backdrop.show .progress-popup {
      transform: scale(1);
    }
    .progress-popup h3 { margin-bottom: 20px; font-size: 1.2rem; color: #333; }
    .status-step {
      display: flex; align-items: center; justify-content: flex-start;
      text-align: left; margin: 12px 0; font-size: 1rem; font-weight: 500;
      color: #888;
      transition: color 0.4s ease;
    }
    .status-icon { margin-right: 12px; font-size: 1.2rem; width: 24px; text-align: center; }
    .status-step.active { color: #333; font-weight: 600; }
    .status-step.completed { color: #28a745; }
    .status-step.error { color: #dc3545; }
    .status-step .status-icon::before { content: '◻️'; }
    .status-step.active .status-icon::before {
      content: '⏳'; display: inline-block;
      animation: spin 1.5s linear infinite;
    }
    .status-step.completed .status-icon::before { content: '✅'; animation: none; }
    .status-step.error .status-icon::before { content: '❌'; animation: none; }
    .popup-error-message {
        color: #dc3545; font-size: 0.9rem; margin-top: 15px;
        display: none; text-align: center; font-weight: 500;
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    /* ========== 【ここまで追加】 ========== */
  </style>
</head>
<body>
  <div class="container">
    <div class="header-section">
      <a href="#" onclick="history.back(); return false;" class="back-btn" id="back-btn">← 戻る</a>
      <h2>逆取引の送信</h2>
      <p class="subtitle">内容を確認し、修正者名を入力して送信してください。</p>
    </div>
    <div class="error-notice" id="error-notice">
      修正対象のデータが見つかりません。<br>データ一覧ページから再度選択してください。
    </div>
    <form id="correctionForm">
      <div class="details-table">
          <div class="form-group"><label for="date">📅 日付</label><input type="date" id="date" required disabled></div>
          <div class="form-group"><label for="lender">📤 貸主 (修正後)</label><select id="lender" required disabled></select></div>
          <div class="form-group"><label for="borrower">📥 借主 (修正後)</label><select id="borrower" required disabled></select></div>
          <div class="form-group"><label for="category-display">🏷️ カテゴリー</label><input type="text" id="category-display" disabled></div>
          <div class="form-group"><label for="item">📝 品目</label><input type="text" id="item" required disabled></div>
          <div class="form-group"><label for="quantity">🔢 個/本/g</label><input type="text" id="quantity" disabled></div>
          <div class="form-group"><label for="unitPrice">💰 単価</label><input type="text" id="unitPrice" disabled></div>
          <div class="form-group"><label for="amount">💵 金額</label><input type="text" id="amount" required disabled></div>
      </div>
      <div class="form-group name-input-group">
        <label for="name">👤 修正者名</label>
        <input type="text" id="name" required placeholder="名前を入力してください">
      </div>
      <div class="hidden-inputs"><input type="hidden" id="category" required></div>
      <div class="button-group">
        <button type="button" class="cancel-btn" onclick="history.back()">キャンセル</button>
        <button type="submit" class="submit-btn"><span class="loading"></span><span class="btn-text">送信</span></button>
      </div>
    </form>
  </div>
  
  <div id="progress-popup-backdrop" class="progress-popup-backdrop">
    <div id="progress-popup" class="progress-popup">
      <h3>送信処理中...</h3>
      <div class="status-step" id="step-validation">
        <span class="status-icon"></span>
        <span>入力データを検証中...</span>
      </div>
      <div class="status-step" id="step-sending">
        <span class="status-icon"></span>
        <span>データを送信中...</span>
      </div>
      <div class="status-step" id="step-complete">
        <span class="status-icon"></span>
        <span>処理完了！</span>
      </div>
      <div id="popup-error-message" class="popup-error-message"></div>
    </div>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const hasSessionData = sessionStorage.getItem('correctionData');
      const hasLocalData = localStorage.getItem('correctionData');
      if (!hasSessionData && !hasLocalData) {
        document.getElementById('error-notice').classList.add('show');
        document.getElementById('correctionForm').style.display = 'none';
      }
    });
  </script>
  <script src="correction.js"></script>
</body>
</html>
