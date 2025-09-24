/**
 * AI設定管理モジュール
 * Vision APIの後の文字解析でGroqまたはGeminiを選択可能
 */

class AIConfig {
  constructor() {
    this.providers = {
      groq: {
        name: 'Groq',
        description: '高速な推論、材料解析に最適化',
        model: 'llama-3.1-8b-instant',
        maxTokens: 2048,
        temperature: 0.1,
        endpoint: 'call-groq-api',
        strengths: ['高速処理', '材料解析', 'コスト効率']
      },
      gemini: {
        name: 'Gemini',
        description: '高精度な解析、複雑なレシピに最適化',
        model: 'gemini-1.5-flash',
        maxTokens: 4096,
        temperature: 0.2,
        endpoint: 'call-vision-api',
        strengths: ['高精度', '複雑な構造', '多言語対応']
      }
    };
    
    this.defaultProvider = 'groq';
    this.currentProvider = this.getStoredProvider() || this.defaultProvider;
  }

  /**
   * 保存されたプロバイダー設定を取得
   */
  getStoredProvider() {
    try {
      return localStorage.getItem('ai_provider') || this.defaultProvider;
    } catch (e) {
      return this.defaultProvider;
    }
  }

  /**
   * プロバイダー設定を保存
   */
  setProvider(provider) {
    if (!this.providers[provider]) {
      throw new Error(`無効なプロバイダー: ${provider}`);
    }
    
    this.currentProvider = provider;
    try {
      localStorage.setItem('ai_provider', provider);
      console.log(`✅ AIプロバイダーを${this.providers[provider].name}に設定`);
    } catch (e) {
      console.warn('⚠️ プロバイダー設定の保存に失敗:', e);
    }
  }

  /**
   * 現在のプロバイダー情報を取得
   */
  getCurrentProvider() {
    return {
      key: this.currentProvider,
      ...this.providers[this.currentProvider]
    };
  }

  /**
   * 利用可能なプロバイダー一覧を取得
   */
  getAvailableProviders() {
    return Object.keys(this.providers).map(key => ({
      key,
      ...this.providers[key]
    }));
  }

  /**
   * プロバイダー選択UIを作成
   */
  createProviderSelector() {
    const container = document.createElement('div');
    container.className = 'ai-provider-selector';
    container.innerHTML = `
      <div class="ai-provider-header">
        <h3>AI解析プロバイダー選択</h3>
        <p>Vision APIで抽出したテキストをどのAIで解析するか選択してください</p>
      </div>
      <div class="ai-provider-options">
        ${this.getAvailableProviders().map(provider => `
          <div class="ai-provider-option ${provider.key === this.currentProvider ? 'selected' : ''}" 
               data-provider="${provider.key}">
            <div class="ai-provider-info">
              <h4>${provider.name}</h4>
              <p>${provider.description}</p>
              <div class="ai-provider-strengths">
                ${provider.strengths.map(strength => `<span class="strength-tag">${strength}</span>`).join('')}
              </div>
            </div>
            <div class="ai-provider-specs">
              <div class="spec-item">
                <span class="spec-label">モデル:</span>
                <span class="spec-value">${provider.model}</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">温度:</span>
                <span class="spec-value">${provider.temperature}</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">最大トークン:</span>
                <span class="spec-value">${provider.maxTokens}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // イベントリスナーを追加
    container.querySelectorAll('.ai-provider-option').forEach(option => {
      option.addEventListener('click', () => {
        const provider = option.dataset.provider;
        this.setProvider(provider);
        this.updateSelector(container);
        this.onProviderChange(provider);
      });
    });

    return container;
  }

  /**
   * セレクターの表示を更新
   */
  updateSelector(container) {
    container.querySelectorAll('.ai-provider-option').forEach(option => {
      option.classList.toggle('selected', option.dataset.provider === this.currentProvider);
    });
  }

  /**
   * プロバイダー変更時のコールバック
   */
  onProviderChange(provider) {
    console.log(`🔄 AIプロバイダーが${this.providers[provider].name}に変更されました`);
    
    // カスタムイベントを発火
    const event = new CustomEvent('aiProviderChanged', {
      detail: { provider, config: this.providers[provider] }
    });
    document.dispatchEvent(event);
  }

  /**
   * プロバイダー設定をリセット
   */
  reset() {
    this.currentProvider = this.defaultProvider;
    try {
      localStorage.removeItem('ai_provider');
      console.log('✅ AIプロバイダー設定をリセット');
    } catch (e) {
      console.warn('⚠️ プロバイダー設定のリセットに失敗:', e);
    }
  }
}

// グローバルインスタンスを作成
window.aiConfig = new AIConfig();

// CSS スタイルを追加
const style = document.createElement('style');
style.textContent = `
  .ai-provider-selector {
    background: var(--bg-secondary);
    border: 1px solid var(--border-medium);
    border-radius: 12px;
    padding: 1.5rem;
    margin: 1rem 0;
  }

  .ai-provider-header h3 {
    margin: 0 0 0.5rem 0;
    color: var(--text-primary);
    font-size: 1.2rem;
  }

  .ai-provider-header p {
    margin: 0 0 1rem 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .ai-provider-options {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .ai-provider-option {
    flex: 1;
    min-width: 280px;
    background: var(--bg-primary);
    border: 2px solid var(--border-light);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .ai-provider-option:hover {
    border-color: var(--accent-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .ai-provider-option.selected {
    border-color: var(--accent-primary);
    background: var(--accent-primary-light);
  }

  .ai-provider-info h4 {
    margin: 0 0 0.5rem 0;
    color: var(--text-primary);
    font-size: 1.1rem;
  }

  .ai-provider-info p {
    margin: 0 0 1rem 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .ai-provider-strengths {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .strength-tag {
    background: var(--accent-secondary);
    color: var(--text-primary);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .ai-provider-specs {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .spec-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .spec-label {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .spec-value {
    color: var(--text-primary);
    font-size: 0.85rem;
    font-weight: 500;
  }

  @media (max-width: 768px) {
    .ai-provider-options {
      flex-direction: column;
    }
    
    .ai-provider-option {
      min-width: auto;
    }
  }
`;

document.head.appendChild(style);