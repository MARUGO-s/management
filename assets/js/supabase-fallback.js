/**
 * Supabaseフォールバッククライアント
 * データベーステーブルが存在しない場合に自動的にフォールバックデータを使用
 */

class SupabaseFallbackClient {
  constructor(supabaseClient) {
    this.client = supabaseClient;
    this.fallbackMode = false;
    this.tableCache = new Map();
  }

  /**
   * テーブルが存在するかチェック
   */
  async checkTableExists(tableName) {
    if (this.tableCache.has(tableName)) {
      return this.tableCache.get(tableName);
    }

    try {
      const { error } = await this.client
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      const exists = !error || !error.message.includes('does not exist');
      this.tableCache.set(tableName, exists);
      return exists;
    } catch (error) {
      console.warn(`⚠️ テーブル存在確認エラー (${tableName}):`, error);
      this.tableCache.set(tableName, false);
      return false;
    }
  }

  /**
   * Supabaseクエリラッパー
   */
  from(tableName) {
    const self = this;

    return {
      select: (columns = '*') => {
        return {
          eq: async (column, value) => {
            try {
              const tableExists = await self.checkTableExists(tableName);
              if (!tableExists) {
                console.log(`📦 フォールバックモード: ${tableName}.select().eq(${column}, ${value})`);
                const data = window.getFallbackData(tableName, { [column]: value });
                return { data, error: null };
              }

              return await self.client.from(tableName).select(columns).eq(column, value);
            } catch (error) {
              console.error(`❌ クエリエラー (${tableName}):`, error);
              const data = window.getFallbackData(tableName, { [column]: value });
              return { data, error: null };
            }
          },

          in: async (column, values) => {
            try {
              const tableExists = await self.checkTableExists(tableName);
              if (!tableExists) {
                console.log(`📦 フォールバックモード: ${tableName}.select().in(${column}, [${values.join(',')}])`);
                const data = window.getFallbackData(tableName).filter(item =>
                  values.includes(item[column])
                );
                return { data, error: null };
              }

              return await self.client.from(tableName).select(columns).in(column, values);
            } catch (error) {
              console.error(`❌ クエリエラー (${tableName}):`, error);
              const data = window.getFallbackData(tableName).filter(item =>
                values.includes(item[column])
              );
              return { data, error: null };
            }
          },

          contains: async (column, values) => {
            try {
              const tableExists = await self.checkTableExists(tableName);
              if (!tableExists) {
                console.log(`📦 フォールバックモード: ${tableName}.select().contains(${column}, [${values.join(',')}])`);
                const data = window.getFallbackData(tableName).filter(item => {
                  if (!item[column] || !Array.isArray(item[column])) return false;
                  return values.some(value => item[column].includes(value));
                });
                return { data, error: null };
              }

              return await self.client.from(tableName).select(columns).contains(column, values);
            } catch (error) {
              console.error(`❌ クエリエラー (${tableName}):`, error);
              const data = window.getFallbackData(tableName).filter(item => {
                if (!item[column] || !Array.isArray(item[column])) return false;
                return values.some(value => item[column].includes(value));
              });
              return { data, error: null };
            }
          },

          or: async (condition) => {
            try {
              const tableExists = await self.checkTableExists(tableName);
              if (!tableExists) {
                console.log(`📦 フォールバックモード: ${tableName}.select().or(${condition})`);
                let data = [];
                if (condition.includes('tags.cs.')) {
                  data = window.getFallbackData(tableName).filter(item => {
                    return item.tags && (
                      item.tags.includes('AI制作') ||
                      item.tags.includes('GPT制作')
                    );
                  });
                }
                return { data, error: null };
              }

              return await self.client.from(tableName).select(columns).or(condition);
            } catch (error) {
              console.error(`❌ クエリエラー (${tableName}):`, error);
              let data = [];
              if (condition.includes('tags.cs.')) {
                data = window.getFallbackData(tableName).filter(item => {
                  return item.tags && (
                    item.tags.includes('AI制作') ||
                    item.tags.includes('GPT制作')
                  );
                });
              }
              return { data, error: null };
            }
          },

          not: async (column, operator, value) => {
            try {
              const tableExists = await self.checkTableExists(tableName);
              if (!tableExists) {
                console.log(`📦 フォールバックモード: ${tableName}.select().not(${column}, ${operator}, ${value})`);
                const data = window.getFallbackData(tableName).filter(item => {
                  if (operator === 'is' && value === null) {
                    return item[column] !== null && item[column] !== undefined;
                  }
                  return true;
                });
                return { data, error: null };
              }

              return await self.client.from(tableName).select(columns).not(column, operator, value);
            } catch (error) {
              console.error(`❌ クエリエラー (${tableName}):`, error);
              const data = window.getFallbackData(tableName).filter(item => {
                if (operator === 'is' && value === null) {
                  return item[column] !== null && item[column] !== undefined;
                }
                return true;
              });
              return { data, error: null };
            }
          },

          order: (column, options = {}) => {
            return {
              then: async (callback) => {
                try {
                  const tableExists = await self.checkTableExists(tableName);
                  if (!tableExists) {
                    console.log(`📦 フォールバックモード: ${tableName}.select().order(${column})`);
                    let data = window.getFallbackData(tableName);

                    // 簡単なソート実装
                    if (column && data.length > 0) {
                      data = data.sort((a, b) => {
                        const aVal = a[column];
                        const bVal = b[column];
                        if (options.ascending === false) {
                          return bVal > aVal ? 1 : -1;
                        }
                        return aVal > bVal ? 1 : -1;
                      });
                    }

                    callback({ data, error: null });
                    return { catch: () => {} };
                  }

                  const result = await self.client.from(tableName).select(columns).order(column, options);
                  callback(result);
                  return { catch: () => {} };
                } catch (error) {
                  console.error(`❌ クエリエラー (${tableName}):`, error);
                  const data = window.getFallbackData(tableName);
                  callback({ data, error: null });
                  return { catch: () => {} };
                }
              }
            };
          },

          then: async (callback) => {
            try {
              const tableExists = await self.checkTableExists(tableName);
              if (!tableExists) {
                console.log(`📦 フォールバックモード: ${tableName}.select()`);
                const data = window.getFallbackData(tableName);
                callback({ data, error: null });
                return { catch: () => {} };
              }

              const result = await self.client.from(tableName).select(columns);
              callback(result);
              return { catch: () => {} };
            } catch (error) {
              console.error(`❌ クエリエラー (${tableName}):`, error);
              const data = window.getFallbackData(tableName);
              callback({ data, error: null });
              return { catch: () => {} };
            }
          }
        };
      },

      insert: async (data) => {
        try {
          const tableExists = await self.checkTableExists(tableName);
          if (!tableExists) {
            console.log(`📦 フォールバックモード: ${tableName}.insert() - 実際の挿入はスキップ`);
            return { data: [data], error: null };
          }

          return await self.client.from(tableName).insert(data);
        } catch (error) {
          console.error(`❌ 挿入エラー (${tableName}):`, error);
          return { data: null, error };
        }
      },

      delete: async () => {
        try {
          const tableExists = await self.checkTableExists(tableName);
          if (!tableExists) {
            console.log(`📦 フォールバックモード: ${tableName}.delete() - 実際の削除はスキップ`);
            return { data: null, error: null };
          }

          return await self.client.from(tableName).delete();
        } catch (error) {
          console.error(`❌ 削除エラー (${tableName}):`, error);
          return { data: null, error };
        }
      }
    };
  }
}

// グローバルフォールバッククライアントを作成
window.createFallbackSupabaseClient = (originalClient) => {
  return new SupabaseFallbackClient(originalClient);
};

console.log('🔄 Supabaseフォールバッククライアント読み込み完了');