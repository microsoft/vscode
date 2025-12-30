/**
 * ThreadManager - Manages conversation threads and branching
 */

import { AuditLogger } from '../governance/AuditLogger';
import type { Thread, Message, ConversationContext, MergeRequest } from '../chat/types';

/**
 * Manages conversation threads including creation, branching, and merging
 */
export class ThreadManager {
  private static instance: ThreadManager;
  private threads: Map<string, Thread> = new Map();
  private activeThreadId: string | null = null;
  private workspaceId: string;

  private constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  static getInstance(workspaceId: string): ThreadManager {
    if (!this.instance || this.instance.workspaceId !== workspaceId) {
      this.instance = new ThreadManager(workspaceId);
    }
    return this.instance;
  }

  /**
   * Create a new thread
   */
  create(name?: string): Thread {
    const thread: Thread = {
      id: crypto.randomUUID(),
      name: name || `Thread ${this.threads.size + 1}`,
      messages: [],
      agents: [],
      context: this.createEmptyContext(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.threads.set(thread.id, thread);
    this.activeThreadId = thread.id;

    AuditLogger.getInstance().log('thread.create', {
      thread_id: thread.id,
      name: thread.name,
    });

    return thread;
  }

  /**
   * Get all threads
   */
  getAll(): Thread[] {
    return Array.from(this.threads.values());
  }

  /**
   * Get the active thread
   */
  getActive(): Thread | null {
    if (!this.activeThreadId) return null;
    return this.threads.get(this.activeThreadId) || null;
  }

  /**
   * Set the active thread
   */
  setActive(threadId: string): void {
    if (this.threads.has(threadId)) {
      this.activeThreadId = threadId;
    }
  }

  /**
   * Add a message to the active thread
   */
  addMessage(message: Message): void {
    const thread = this.getActive();
    if (!thread) {
      throw new Error('No active thread');
    }

    thread.messages.push(message);
    thread.updatedAt = new Date().toISOString();

    // Track agents used in this thread
    if (message.agentId && !thread.agents.includes(message.agentId)) {
      thread.agents.push(message.agentId);
    }
  }

  /**
   * Branch a thread from a specific message
   */
  branch(messageIndex: number): Thread {
    const parent = this.getActive();
    if (!parent) {
      throw new Error('No active thread to branch from');
    }

    if (messageIndex < 0 || messageIndex >= parent.messages.length) {
      throw new Error('Invalid message index for branching');
    }

    // Create new thread with messages up to branch point
    const branchedMessages = parent.messages
      .slice(0, messageIndex + 1)
      .map((msg) => ({ ...msg, id: crypto.randomUUID() }));

    const branch: Thread = {
      id: crypto.randomUUID(),
      name: `${parent.name || 'Thread'} - Branch`,
      parentId: parent.id,
      branchPoint: messageIndex,
      messages: branchedMessages,
      agents: [...parent.agents],
      context: { ...parent.context },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.threads.set(branch.id, branch);
    this.activeThreadId = branch.id;

    AuditLogger.getInstance().log('thread.branch', {
      parent_thread_id: parent.id,
      new_thread_id: branch.id,
      branch_point: messageIndex,
    });

    return branch;
  }

  /**
   * Merge insights from a branch back to parent
   */
  merge(request: MergeRequest): void {
    const source = this.threads.get(request.sourceThreadId);
    const target = this.threads.get(request.targetThreadId);

    if (!source || !target) {
      throw new Error('Invalid thread IDs for merge');
    }

    // Add selected messages as a summary to the target thread
    const selectedMessages = request.selectedMessages
      .filter((i) => i >= 0 && i < source.messages.length)
      .map((i) => source.messages[i]);

    if (selectedMessages.length > 0) {
      const summaryMessage: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `**Merged from branch "${source.name}":**\n\n${selectedMessages
          .map((m) => `> ${m.content.slice(0, 200)}...`)
          .join('\n\n')}`,
        timestamp: new Date().toISOString(),
      };

      target.messages.push(summaryMessage);
      target.updatedAt = new Date().toISOString();
    }

    AuditLogger.getInstance().log('thread.merge', {
      source_thread_id: source.id,
      target_thread_id: target.id,
      messages_merged: request.selectedMessages.length,
    });
  }

  /**
   * Delete a thread
   */
  delete(threadId: string): void {
    if (this.threads.has(threadId)) {
      this.threads.delete(threadId);

      // If we deleted the active thread, switch to another
      if (this.activeThreadId === threadId) {
        const remaining = Array.from(this.threads.keys());
        this.activeThreadId = remaining.length > 0 ? remaining[0] : null;
      }
    }
  }

  /**
   * Create an empty conversation context
   */
  private createEmptyContext(): ConversationContext {
    return {
      openFiles: [],
      symbols: [],
      previousResponses: [],
      workspaceId: this.workspaceId,
    };
  }

  /**
   * Update the context for the active thread
   */
  updateContext(updates: Partial<ConversationContext>): void {
    const thread = this.getActive();
    if (thread) {
      thread.context = { ...thread.context, ...updates };
      thread.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Persist threads to storage
   */
  async persist(): Promise<void> {
    const data = {
      activeThreadId: this.activeThreadId,
      threads: Array.from(this.threads.values()),
    };

    // Store in IndexedDB or local storage
    localStorage.setItem(
      `logos_threads_${this.workspaceId}`,
      JSON.stringify(data)
    );
  }

  /**
   * Load threads from storage
   */
  async load(): Promise<void> {
    const stored = localStorage.getItem(`logos_threads_${this.workspaceId}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this.threads = new Map(
          data.threads.map((t: Thread) => [t.id, t])
        );
        this.activeThreadId = data.activeThreadId;
      } catch (e) {
        console.error('Failed to load threads:', e);
      }
    }
  }
}

export default ThreadManager;


