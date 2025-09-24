// 共通UIコンポーネント

// ローディングスピナーの表示
function showLoadingSpinner(containerId, message = '読み込み中...') {
  const container = getElement(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

// ローディングスピナーの非表示
function hideLoadingSpinner(containerId) {
  const container = getElement(containerId);
  if (container) {
    container.innerHTML = '';
  }
}

// エラーメッセージの表示
function showErrorMessage(containerId, message) {
  const container = getElement(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <div class="error-message">
      <div class="error-icon">⚠️</div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

// 成功メッセージの表示
function showSuccessMessage(containerId, message) {
  const container = getElement(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <div class="success-message">
      <div class="success-icon">✅</div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

// モーダルダイアログの表示
function showModal(title, content, buttons = []) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close" onclick="closeModal(this)">&times;</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
      <div class="modal-footer">
        ${buttons.map(button => `
          <button class="btn ${button.class || 'btn-secondary'}" onclick="${button.onclick}">
            ${escapeHtml(button.text)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  return modal;
}

// モーダルダイアログの非表示
function closeModal(button) {
  const modal = button.closest('.modal-overlay');
  if (modal) {
    modal.remove();
  }
}

// 確認ダイアログの表示
function showConfirmDialog(title, message, onConfirm, onCancel = null) {
  const content = `
    <p>${escapeHtml(message)}</p>
  `;
  
  const buttons = [
    {
      text: 'キャンセル',
      class: 'btn-secondary',
      onclick: 'closeModal(this); ' + (onCancel ? onCancel.toString() : '')
    },
    {
      text: '確認',
      class: 'btn-primary',
      onclick: 'closeModal(this); ' + onConfirm.toString()
    }
  ];
  
  return showModal(title, content, buttons);
}

// トースト通知の表示
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" onclick="closeToast(this)">&times;</button>
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // アニメーション
  setTimeout(() => toast.classList.add('show'), 100);
  
  // 自動非表示
  setTimeout(() => closeToast(toast.querySelector('.toast-close')), duration);
  
  return toast;
}

// トースト通知の非表示
function closeToast(button) {
  const toast = button.closest('.toast');
  if (toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }
}

// プログレスバーの表示
function showProgressBar(containerId, progress = 0, message = '') {
  const container = getElement(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress}%"></div>
      </div>
      <div class="progress-text">${escapeHtml(message)}</div>
    </div>
  `;
}

// プログレスバーの更新
function updateProgressBar(containerId, progress, message = '') {
  const container = getElement(containerId);
  if (!container) return;
  
  const progressFill = container.querySelector('.progress-fill');
  const progressText = container.querySelector('.progress-text');
  
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }
  
  if (progressText && message) {
    progressText.textContent = message;
  }
}

// タブコンポーネントの作成
function createTabComponent(containerId, tabs) {
  const container = getElement(containerId);
  if (!container) return;
  
  const tabContainer = document.createElement('div');
  tabContainer.className = 'tab-container';
  
  // タブヘッダー
  const tabHeader = document.createElement('div');
  tabHeader.className = 'tab-header';
  
  tabs.forEach((tab, index) => {
    const tabButton = document.createElement('button');
    tabButton.className = `tab-button ${index === 0 ? 'active' : ''}`;
    tabButton.textContent = tab.title;
    tabButton.onclick = () => switchTab(tabContainer, index);
    tabHeader.appendChild(tabButton);
  });
  
  // タブコンテンツ
  const tabContent = document.createElement('div');
  tabContent.className = 'tab-content';
  
  tabs.forEach((tab, index) => {
    const contentDiv = document.createElement('div');
    contentDiv.className = `tab-panel ${index === 0 ? 'active' : ''}`;
    contentDiv.innerHTML = tab.content;
    tabContent.appendChild(contentDiv);
  });
  
  tabContainer.appendChild(tabHeader);
  tabContainer.appendChild(tabContent);
  container.appendChild(tabContainer);
}

// タブの切り替え
function switchTab(container, index) {
  const buttons = container.querySelectorAll('.tab-button');
  const panels = container.querySelectorAll('.tab-panel');
  
  buttons.forEach((button, i) => {
    button.classList.toggle('active', i === index);
  });
  
  panels.forEach((panel, i) => {
    panel.classList.toggle('active', i === index);
  });
}

// ドロップダウンメニューの作成
function createDropdown(containerId, options, onSelect) {
  const container = getElement(containerId);
  if (!container) return;
  
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';
  
  const button = document.createElement('button');
  button.className = 'dropdown-button';
  button.textContent = options[0]?.text || '選択してください';
  button.onclick = () => toggleDropdown(dropdown);
  
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  
  options.forEach(option => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.textContent = option.text;
    item.onclick = () => {
      button.textContent = option.text;
      closeDropdown(dropdown);
      if (onSelect) onSelect(option.value);
    };
    menu.appendChild(item);
  });
  
  dropdown.appendChild(button);
  dropdown.appendChild(menu);
  container.appendChild(dropdown);
}

// ドロップダウンの表示/非表示
function toggleDropdown(dropdown) {
  dropdown.classList.toggle('open');
}

// ドロップダウンの非表示
function closeDropdown(dropdown) {
  dropdown.classList.remove('open');
}

// 検索ボックスの作成
function createSearchBox(containerId, placeholder = '検索...', onSearch) {
  const container = getElement(containerId);
  if (!container) return;
  
  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.className = 'search-input';
  
  const button = document.createElement('button');
  button.className = 'search-button';
  button.innerHTML = '🔍';
  button.onclick = () => {
    if (onSearch) onSearch(input.value);
  };
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      if (onSearch) onSearch(input.value);
    }
  });
  
  searchBox.appendChild(input);
  searchBox.appendChild(button);
  container.appendChild(searchBox);
}

// ページネーションの作成
function createPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = getElement(containerId);
  if (!container) return;
  
  const pagination = document.createElement('div');
  pagination.className = 'pagination';
  
  // 前のページボタン
  const prevButton = document.createElement('button');
  prevButton.textContent = '←';
  prevButton.disabled = currentPage <= 1;
  prevButton.onclick = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };
  pagination.appendChild(prevButton);
  
  // ページ番号ボタン
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.className = i === currentPage ? 'active' : '';
    pageButton.onclick = () => onPageChange(i);
    pagination.appendChild(pageButton);
  }
  
  // 次のページボタン
  const nextButton = document.createElement('button');
  nextButton.textContent = '→';
  nextButton.disabled = currentPage >= totalPages;
  nextButton.onclick = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };
  pagination.appendChild(nextButton);
  
  container.appendChild(pagination);
}

// カードコンポーネントの作成
function createCard(title, content, actions = []) {
  const card = document.createElement('div');
  card.className = 'card';
  
  card.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">${escapeHtml(title)}</h3>
    </div>
    <div class="card-body">
      ${content}
    </div>
    ${actions.length > 0 ? `
      <div class="card-footer">
        ${actions.map(action => `
          <button class="btn ${action.class || 'btn-secondary'}" onclick="${action.onclick}">
            ${escapeHtml(action.text)}
          </button>
        `).join('')}
      </div>
    ` : ''}
  `;
  
  return card;
}

// バッジコンポーネントの作成
function createBadge(text, type = 'default') {
  const badge = document.createElement('span');
  badge.className = `badge badge-${type}`;
  badge.textContent = text;
  return badge;
}

// アラートコンポーネントの作成
function createAlert(message, type = 'info', dismissible = true) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  
  alert.innerHTML = `
    <div class="alert-content">
      <span class="alert-message">${escapeHtml(message)}</span>
      ${dismissible ? '<button class="alert-close" onclick="closeAlert(this)">&times;</button>' : ''}
    </div>
  `;
  
  return alert;
}

// アラートの非表示
function closeAlert(button) {
  const alert = button.closest('.alert');
  if (alert) {
    alert.remove();
  }
}

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showLoadingSpinner,
    hideLoadingSpinner,
    showErrorMessage,
    showSuccessMessage,
    showModal,
    closeModal,
    showConfirmDialog,
    showToast,
    closeToast,
    showProgressBar,
    updateProgressBar,
    createTabComponent,
    switchTab,
    createDropdown,
    toggleDropdown,
    closeDropdown,
    createSearchBox,
    createPagination,
    createCard,
    createBadge,
    createAlert,
    closeAlert
  };
}


