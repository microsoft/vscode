/**
 * Plan を人間向けテキストに変換（Cursor 風「何を変えるか」の表示）
 *
 * LLM に説明させず、operation の型から deterministic に 1 行ずつ生成する。
 */

import type { AIOperationPlan } from './mcpBridge';

function opToLine(op: { type: string; filePath?: string; [key: string]: unknown }): string {
  const fp = (op.filePath && String(op.filePath).trim() !== '') ? op.filePath : 'current file';
  switch (op.type) {
    case 'update-text-content': {
      const after = op.textContent != null ? String(op.textContent) : '';
      return `Update text to "${after.slice(0, 50)}${after.length > 50 ? '…' : ''}" in ${fp}`;
    }
    case 'update-attribute': {
      const name = op.name != null ? String(op.name) : 'attribute';
      const value = op.value != null ? String(op.value) : '';
      return `Set ${name}="${value.slice(0, 30)}${value.length > 30 ? '…' : ''}" in ${fp}`;
    }
    case 'replace-component':
      return `Replace component in ${fp}`;
    case 'remove_element':
      return `Remove element in ${fp}`;
    case 'reorder_elements':
      return `Reorder elements in ${fp}`;
    case 'add_element':
      return `Add element in ${fp}`;
    default:
      return `${op.type} in ${fp}`;
  }
}

/**
 * 計画の operations を Cursor 風の短い説明文の配列に変換
 */
export function explainPlan(plan: AIOperationPlan): string[] {
  const ops = plan.operations ?? [];
  return ops.map((op) => opToLine(op));
}

/**
 * 1 つの文字列にまとめる（Chat の Plan 表示用）
 */
export function explainPlanAsText(plan: AIOperationPlan): string {
  const lines = explainPlan(plan);
  if (lines.length === 0) return plan.reasoning ?? 'No operations.';
  return ['Plan:', ...lines.map((l) => `- ${l}`)].join('\n');
}
