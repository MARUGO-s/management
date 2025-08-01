document.addEventListener('DOMContentLoaded', () => {
  const scrollContainer = document.getElementById('scrollable-area');
  const scrollHint = document.getElementById('scroll-hint');

  if (scrollContainer && scrollHint) {
    if (scrollContainer.scrollWidth <= scrollContainer.clientWidth) {
      scrollHint.style.display = 'none';
      return;
    }

    const onScroll = () => {
      scrollHint.style.display = 'none';
      scrollContainer.removeEventListener('scroll', onScroll);
    };

    scrollContainer.addEventListener('scroll', onScroll);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const scrollHint = document.getElementById('scroll-hint');

  if (!scrollHint) return;

  const hideScrollHint = () => {
    setTimeout(() => {
      scrollHint.style.display = 'none';
    }, 20000);
  };

  // すべてのボタンに対してクリックイベントを設定
  const buttons = document.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', hideScrollHint);
  });
});
