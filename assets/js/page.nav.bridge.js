// page.nav.bridge.js
// このスクリプトは、一覧ページのカードクリックと新規ボタンのクリックを処理します。
// 各ボタンに個別のイベントリスナーを設定するため、他のスクリプトとの干渉を防ぎます。
(function(window, document){
  
  // 新規ボタンのクリックイベントを処理
  document.addEventListener('click', (e) => {
    const newBtn = e.target.closest('.js-new');
    if (newBtn) {
      e.preventDefault();
      e.stopPropagation();
      location.href = 'recipe.edit.html';
    }
  });

  // 一覧のカードのクリックイベントを処理
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card && card.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      location.href = `recipe.view.html?id=${encodeURIComponent(card.dataset.id)}`;
    }
  });

})(window, document);
// JavaScript Document