/**
 * Cursor 風 UX: 状態の可視化レイヤー（Explore / Grep / Read / Plan / Preview / Apply）
 *
 * ① 探索ログ層（explore / grep / read）
 * ② 計画ログ層（plan / reason）
 * ③ 差分プレビュー層（preview）
 * ④ 適用UX層（applied / cancelled）
 *
 * ロジックは既存のまま、イベントを挟むだけで Cursor っぽい体験にする。
 */

/** Cursor の 4 層に対応する UX イベント種別 */
export type UxEventType =
  | "explore"
  | "grep"
  | "read"
  | "layer1_result"
  | "plan"
  | "reason"
  | "preview"
  | "applied"
  | "cancelled"
  | "planning_start"
  | "planning_end"
  | "error";

export interface UxEventPayload {
  type: UxEventType;
  detail: string;
  /** 完了したら true（Cursor の ✓） */
  done?: boolean;
  /** 追加データ（ファイルパス・行範囲など） */
  meta?: Record<string, unknown>;
}

type UxEventCallback = (payload: UxEventPayload) => void;

const listeners: UxEventCallback[] = [];

/**
 * UX イベントを購読する。Chat UI の progress log などで使用。
 * @returns 解除用関数
 */
export function subscribeUxEvents(cb: UxEventCallback): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/**
 * 内部処理をイベントとして発火する。探索・計画・適用の各層で呼ぶ。
 */
export function emitUxEvent(payload: UxEventPayload): void {
  const withDone = payload.done !== false && (payload.type === "applied" || payload.type === "cancelled" || payload.type === "error")
    ? { ...payload, done: true }
    : payload;
  for (const cb of listeners) {
    try {
      cb(withDone);
    } catch {
      // 購読側のエラーは握りつぶす
    }
  }
}

/** Apply フローの状態（Preview → Accept/Reject の設計用） */
export type ApplyState = "planning" | "preview" | "applied" | "cancelled";
