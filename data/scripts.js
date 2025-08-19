document.addEventListener('DOMContentLoaded', () => {
  // テーブルを囲むスクロール可能なコンテナ要素を取得
  const scrollContainer = document.getElementById('scrollable-area');

  // 要素が見つからなければ、ここで処理を終了
  if (!scrollContainer) {
    return;
  }

  // もしコンテナが中身より広く、スクロールが不要な場合はアイコンを隠して終了
  if (scrollContainer.scrollWidth <= scrollContainer.clientWidth) {
    scrollContainer.classList.add('hidden');
    return;
  }

  // 30秒後にアイコンを非表示にするタイマーを設定
  const hideTimer = setTimeout(hideHint, 30000);

  // アイコンを非表示にし、関連するイベントをすべて解除する関数
  function hideHint() {
    scrollContainer.classList.add('hidden'); // CSSの .hidden クラスを適用
    clearTimeout(hideTimer); // タイマーを停止
    // 一度実行されたら不要になるイベントリスナーを解除
    scrollContainer.removeEventListener('scroll', hideHint);
    document.querySelectorAll('button').forEach(btn => {
      btn.removeEventListener('click', hideHint);
    });
  }

  // スクロールされた時、または何かのボタンがクリックされた時にアイコンを即座に非表示にする
  scrollContainer.addEventListener('scroll', hideHint, { once: true });
  document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', hideHint, { once: true });
  });
});
