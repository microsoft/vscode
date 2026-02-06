/**
 * AI Chat統合
 *
 * Phase 6: AIチャット統合
 * VSCode Chat View（UIのみ）を使用、中身は既存MCPに流す
 *
 * 重要: VSCode OSSの内蔵AI（Copilot API）には依存しない。
 * UIだけ使い、中身は既存のMCP（/api/mcp）に流す。
 */

import { initChatViewComponent } from './chatView';

/**
 * AI Chat統合を初期化
 *
 * VSCode Chat View（UIのみ）を初期化し、既存のMCPに接続します。
 *
 * ✅ 修正: VSCode OSSのChatServiceが利用できない場合でもエラーを発生させない
 */
export function initChatView(): void {
  try {
    // Chat Viewを初期化
    // ✅ 注意: 現在は実装が完了していない（TODOコメントのみ）
    // VSCode OSSのChatServiceが利用できない場合、ここでエラーが発生する可能性がある
    initChatViewComponent();
  } catch (error) {
    // ChatServiceが利用できない場合（デフォルトエージェント未登録など）は警告のみ
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('No default agent registered') || errorMessage.includes('ChatService')) {
      // エラーを再スローしない（拡張機能の他の機能は正常に動作する）
      return;
    }
    // その他のエラーは再スロー
    throw error;
  }
}

// 各モジュールをエクスポート
export { initChatViewComponent } from './chatView';
export { handleChatMessage, callMCPAPI, type AIOperationPlan } from './mcpBridge';
export { applyAIGeneratedOperations, applyAIOperationPlan, getPlanPreview } from './codeApplier';
export { createAiFullcodeChatParticipant, CHAT_PARTICIPANT_ID } from './chatParticipant';
export { subscribeUxEvents, emitUxEvent, type UxEventPayload, type UxEventType, type ApplyState } from './uxEvents';
export { explainPlan, explainPlanAsText } from './explainPlan';
export { generateUnifiedDiff, diffAsMarkdown } from './diffPreview';
export { getCurrentPlan, setCurrentPlan, clearCurrentPlan, type CurrentPlan } from './planStore';
export { runAgentInstruction, applyCurrentPlan, type RunAgentInstructionResult, type ApplyCurrentPlanResult } from './agentController';
export { resolveTarget } from './resolveTarget';
export type { ResolvedTarget, FileScore as ResolveTargetFileScore, EmbeddingHit, RepoMapProvider } from './resolveTarget.types';
export { beginTransaction, rollbackTransaction } from './transactionContext';
export type { FileSnapshot, TransactionContext } from './transactionContext';
export { buildPlanPreview } from './codeApplier';
export type { PlanPreview } from './codeApplier';
export { renderPreviewToMarkdown } from './planPreview';
export { pushUndoSnapshot, undoLastChange, hasUndo } from './undoStack';
export type { UndoSnapshot } from './undoStack';

