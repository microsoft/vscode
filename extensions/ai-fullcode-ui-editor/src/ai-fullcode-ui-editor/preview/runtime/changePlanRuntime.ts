/**
 * ChangePlan Runtime（Webview用 JavaScript 文字列）
 *
 * ChangePlan/History/Apply panel などの変更計画ロジック
 *
 * 重要: このファイルは Webview に注入される JavaScript 文字列を生成します
 */

export const changePlanRuntimeJs = `
  // ============================================
  // ChangePlan Runtime（ChangePlan/History/Apply panel等）
  // ============================================

  // ✅ デバッグログスイッチ
  // ✅ ES2018互換: オプショナルキャッチバインディングを修正
  const DEBUG_CHANGEPLAN = (() => {
    try {
      const win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis.window : null);
      return win && (win.DEBUG_CHANGEPLAN === 'true' || win.DEBUG_CHANGEPLAN === true);
    } catch (e) {
      return false;
    }
  })();

  // ✅ デバッグログ出力
  function debugLog(tag, ...args) {
    // Silent debug log
  }

  // ============================================
  // UIActionStore（UI操作AST管理）
  // ============================================

  /**
   * UIActionStore: UI操作ASTを蓄積・取得
   */
  class UIActionStore {
    constructor() {
      this.actions = [];
      this.maxSize = 1000;
    }

    add(action) {
      this.actions.push(action);

      // 最大保持数を超えた場合は古いものを削除
      if (this.actions.length > this.maxSize) {
        this.actions.shift();
      }

      debugLog('STORE', 'action added', { type: action.type, operationId: action.operationId });
    }

    getAll() {
      return [...this.actions]; // コピーを返す
    }

    clear() {
      this.actions = [];
      debugLog('STORE', 'cleared');
    }

    size() {
      return this.actions.length;
    }

    getRecent(count) {
      return this.actions.slice(-count);
    }
  }

  // ============================================
  // ChangePlanStore（変更計画管理）
  // ============================================

  /**
   * ChangePlanStore: ChangePlanを管理
   */
  class ChangePlanStore {
    constructor() {
      this.plans = [];
      this.maxSize = 100;
    }

    add(plan) {
      this.plans.push(plan);

      // 最大保持数を超えた場合は古いものを削除
      if (this.plans.length > this.maxSize) {
        this.plans.shift();
      }

      debugLog('CHANGEPLAN', 'plan added', { id: plan.id, filePath: plan.filePath });
    }

    getById(id) {
      return this.plans.find(p => p.id === id) || null;
    }

    getAll() {
      return [...this.plans]; // コピーを返す
    }

    clear() {
      this.plans = [];
      debugLog('CHANGEPLAN', 'cleared');
    }

    size() {
      return this.plans.length;
    }
  }

  // ============================================
  // HistoryStore（変更履歴管理）
  // ============================================

  /**
   * HistoryStore: 変更履歴を管理
   */
  class HistoryStore {
    constructor() {
      this.entries = [];
      this.maxSize = 100;
    }

    push(entry) {
      this.entries.push(entry);

      // 最大保持数を超えた場合は古いものを削除
      if (this.entries.length > this.maxSize) {
        this.entries.shift();
      }

      debugLog('HISTORY', 'entry added', { id: entry.id, planId: entry.planId });
    }

    getLatest() {
      return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
    }

    getAll() {
      return [...this.entries]; // コピーを返す
    }

    getById(id) {
      return this.entries.find(e => e.id === id) || null;
    }

    getByFilePath(filePath) {
      return this.entries.filter(e => e.filePath === filePath && !e.reverted);
    }

    undo() {
      // 元に戻されていない最新の履歴を探す
      for (let i = this.entries.length - 1; i >= 0; i--) {
        if (!this.entries[i].reverted) {
          this.entries[i].reverted = true;
          debugLog('HISTORY', 'undone', { id: this.entries[i].id });
          return this.entries[i];
        }
      }
      return null;
    }

    revert(entryId) {
      const entry = this.getById(entryId);
      if (entry && !entry.reverted) {
        entry.reverted = true;
        debugLog('HISTORY', 'reverted', { id: entryId });
        return entry;
      }
      return null;
    }

    clear() {
      this.entries = [];
      debugLog('HISTORY', 'cleared');
    }

    size() {
      return this.entries.length;
    }
  }

  // ============================================
  // ApplyChangePlanService（変更適用）
  // ============================================

  /**
   * ApplyChangePlanService: ChangePlan を実コードへ反映
   */
  class ApplyChangePlanService {
    constructor() {
      this.historyStore = null;
    }

    setHistoryStore(historyStore) {
      this.historyStore = historyStore;
    }

    async apply(planId) {
      debugLog('APPLY', 'start', { planId });

      // TODO: VSCode Extension Host に ChangePlan を送信
      // 現在はプレースホルダー実装

      const result = {
        success: false,
        filePath: '',
        beforeContent: '',
        afterContent: '',
        error: 'ApplyChangePlanService is not fully implemented yet',
      };

      debugLog('APPLY', 'result', result);
      return result;
    }

    async dryRun(planId) {
      debugLog('APPLY', 'dryRun', { planId });

      // TODO: VSCode Extension Host に ChangePlan を送信（dry-run）
      // 現在はプレースホルダー実装

      const result = {
        canApply: false,
        diff: '',
        warnings: [],
        error: 'ApplyChangePlanService is not fully implemented yet',
      };

      debugLog('APPLY', 'dryRun result', result);
      return result;
    }
  }

  // ============================================
  // ChangePlanGenerator（変更計画生成）
  // ============================================

  /**
   * ChangePlanGenerator: UI操作ASTから ChangePlan を生成
   */
  function generateChangePlan(uiActionAST) {
    debugLog('GENERATE', 'start', { type: uiActionAST.type, operationId: uiActionAST.operationId });

    // TODO: UI操作ASTから ChangePlan を生成
    // 現在はプレースホルダー実装

    const plan = {
      id: 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      sourceOpId: uiActionAST.operationId,
      filePath: '',
      changeType: 'STYLE_CHANGE',
      patch: {
        before: '',
        after: '',
      },
      range: {
        start: 0,
        end: 0,
      },
      riskLevel: 'low',
      requiresUserDecision: false,
      confidence: 0.5,
      reason: 'ChangePlanGenerator is not fully implemented yet',
    };

    debugLog('GENERATE', 'result', plan);
    return plan;
  }

  // ============================================
  // グローバルに公開
  // ============================================

  // シングルトンインスタンス
  const uiActionStore = new UIActionStore();
  const changePlanStore = new ChangePlanStore();
  const historyStore = new HistoryStore();
  const applyChangePlanService = new ApplyChangePlanService();

  applyChangePlanService.setHistoryStore(historyStore);

  window.UIActionStore = UIActionStore;
  window.ChangePlanStore = ChangePlanStore;
  window.HistoryStore = HistoryStore;
  window.ApplyChangePlanService = ApplyChangePlanService;
  window.getUIActionStore = function() { return uiActionStore; };
  window.getChangePlanStore = function() { return changePlanStore; };
  window.getHistoryStore = function() { return historyStore; };
  window.getApplyChangePlanService = function() { return applyChangePlanService; };
  window.generateChangePlan = generateChangePlan;
`;
