/**
 * Plan Store（Extension スコープ・Cursor 同一）
 *
 * Chat と独立した in-memory state。
 * apply / cancel どちらからも参照可能。Chat は state を一切持たない。
 */

import type { AIOperationPlan } from './mcpBridge';

export interface CurrentPlan {
  id: string;
  /** 主対象（STEP1 resolveTarget の primaryFile） */
  targetFilePath: string;
  /** transaction 対象（STEP1 の secondaryFiles） */
  secondaryFiles: string[];
  plan: AIOperationPlan;
  summary: string;
  createdAt: number;
}

let currentPlan: CurrentPlan | null = null;

export function setCurrentPlan(plan: CurrentPlan): void {
  currentPlan = plan;
}

export function getCurrentPlan(): CurrentPlan | null {
  return currentPlan;
}

export function clearCurrentPlan(): void {
  currentPlan = null;
}
