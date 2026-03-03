import type { SessionManager } from './sessionManager';
import { suppressSession } from './outputDetector';

const SUPPRESS_MS = 5000;
const ENTER_DELAY_MS = 300;

/**
 * Sends a message to a session terminal via bracket paste + delayed Enter.
 * Bracket paste prevents the terminal from interpreting the message as commands.
 */
export function sendToSession(sessionManager: SessionManager, targetId: string, message: string): void {
  const session = sessionManager.getSession(targetId);
  if (!session) { return; }

  suppressSession(targetId, SUPPRESS_MS);

  const BS = '\x1b[200~';
  const BE = '\x1b[201~';
  session.terminal.sendText(BS + message + BE, false);

  setTimeout(() => {
    session.terminal.sendText('', true); // sends Enter
  }, ENTER_DELAY_MS);
}

/**
 * Appends text to a session's terminal input without pressing Enter.
 * The user can then type additional context before submitting.
 */
export function appendToSessionInput(sessionManager: SessionManager, targetId: string, text: string): void {
  const session = sessionManager.getSession(targetId);
  if (!session) { return; }

  // Use bracket paste to insert text without triggering shell interpretation,
  // but don't send Enter — user will do that after adding context.
  const BS = '\x1b[200~';
  const BE = '\x1b[201~';
  session.terminal.sendText(BS + text + BE, false);
  session.terminal.show();
}

export interface QueuedMessage {
  targetId: string;
  message: string;
  sourceName: string;
  fromSessionId: string;
  toSessionId: string;
  extracted: string;
  timestamp: number;
}

/**
 * MessageQueue manages pending messages for busy agents.
 * Messages expire after 60s unless the target is paused.
 */
export class MessageQueue {
  private queue: QueuedMessage[] = [];

  enqueue(msg: QueuedMessage): void {
    this.queue.push(msg);
  }

  /**
   * Drain deliverable messages. Returns messages that were delivered.
   * Messages targeting paused sessions stay in the queue.
   * Expired messages (>60s, non-paused target) are discarded.
   */
  drain(sessionManager: SessionManager): QueuedMessage[] {
    if (this.queue.length === 0) { return []; }

    const now = Date.now();
    const stillQueued: QueuedMessage[] = [];
    const delivered: QueuedMessage[] = [];

    const pausedIds = new Set(
      sessionManager.getSessions()
        .filter(s => s.status === 'paused')
        .map(s => s.id)
    );
    const idleIds = new Set(
      sessionManager.getSessions()
        .filter(s => s.status === 'waiting')
        .map(s => s.id)
    );

    for (const qm of this.queue) {
      // Keep messages for paused sessions
      if (pausedIds.has(qm.targetId)) {
        stillQueued.push(qm);
        continue;
      }

      // Expire old messages for non-paused targets
      if (now - qm.timestamp > 60_000) {
        continue;
      }

      if (idleIds.has(qm.targetId)) {
        // Target is idle — deliver
        sendToSession(sessionManager, qm.targetId, qm.message);
        sessionManager.setSessionStatus(qm.targetId, 'running');
        sessionManager.addMessage({
          id: `${Date.now()}-${qm.fromSessionId}-${qm.toSessionId}`,
          fromSessionId: qm.fromSessionId,
          toSessionId: qm.toSessionId,
          content: qm.extracted,
          timestamp: Date.now(),
        });
        delivered.push(qm);
        idleIds.delete(qm.targetId);
      } else {
        stillQueued.push(qm);
      }
    }

    this.queue = stillQueued;
    return delivered;
  }

  get length(): number {
    return this.queue.length;
  }
}
