/**
 * AuditLogger - Comprehensive audit logging for Logos IDE
 *
 * Logs all IDE operations with PERSONA attestation for
 * compliance, security, and debugging.
 */

import { PersonaAuth, Attestation } from './PersonaAuth';

export type AuditEventType =
  | 'file.open'
  | 'file.save'
  | 'file.delete'
  | 'file.rename'
  | 'file.create'
  | 'completion.request'
  | 'completion.accept'
  | 'completion.reject'
  | 'flash_app.invoked'
  | 'bmu.routing'
  | 'agent.invoke'
  | 'agent.response'
  | 'agent.handoff'
  | 'thread.create'
  | 'thread.branch'
  | 'thread.merge'
  | 'terminal.command'
  | 'terminal.output'
  | 'git.commit'
  | 'git.push'
  | 'git.pull'
  | 'ca.suggestion'
  | 'ca.auto_doc'
  | 'ca.analysis'
  | 'session.start'
  | 'session.end';

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  persona_id: string;
  session_id: string;
  workspace_id?: string;
  thread_id?: string;
  event_type: AuditEventType;
  event_data: Record<string, unknown>;
  attestation?: Attestation;
  metadata?: {
    client_version?: string;
    platform?: string;
    latency_ms?: number;
  };
}

interface AuditBackend {
  writeBatch(events: AuditEvent[]): Promise<void>;
}

/**
 * In-memory backend for development
 */
class InMemoryAuditBackend implements AuditBackend {
  private events: AuditEvent[] = [];

  async writeBatch(events: AuditEvent[]): Promise<void> {
    this.events.push(...events);
    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  getEvents(): AuditEvent[] {
    return this.events;
  }

  getEventsForFile(path: string): AuditEvent[] {
    return this.events.filter(
      (e) =>
        e.event_type.startsWith('file.') &&
        (e.event_data.path === path || e.event_data.file === path)
    );
  }
}

/**
 * IndexedDB backend for persistent local storage
 */
class IndexedDBAuditBackend implements AuditBackend {
  private dbName = 'logos_audit';
  private storeName = 'events';

  async writeBatch(events: AuditEvent[]): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);

    for (const event of events) {
      store.add(event);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'event_id' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('event_type', 'event_type');
          store.createIndex('persona_id', 'persona_id');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Central audit logger for Logos IDE
 */
export class AuditLogger {
  private static instance: AuditLogger;

  private personaId: string = '';
  private sessionId: string = '';
  private workspaceId: string = '';
  private backends: AuditBackend[] = [];
  private buffer: AuditEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private sessionStartTime: number = Date.now();
  private totalEvents: number = 0;

  private constructor() {}

  static getInstance(): AuditLogger {
    if (!this.instance) {
      this.instance = new AuditLogger();
    }
    return this.instance;
  }

  /**
   * Initialize the audit logger
   */
  static initialize(
    personaId: string,
    sessionId: string,
    workspaceId: string
  ): void {
    const instance = this.getInstance();
    instance.personaId = personaId;
    instance.sessionId = sessionId;
    instance.workspaceId = workspaceId;
    instance.sessionStartTime = Date.now();

    // Initialize backends
    instance.backends = [
      new InMemoryAuditBackend(),
      // new IndexedDBAuditBackend(),
    ];

    // Start periodic flush
    instance.flushInterval = setInterval(() => {
      instance.flush();
    }, 5000); // Flush every 5 seconds

    // Log session start
    instance.log('session.start', {
      client_version: '1.0.0',
      platform: typeof window !== 'undefined' ? 'web' : 'node',
    });
  }

  /**
   * Log an audit event
   */
  async log(
    eventType: AuditEventType,
    eventData: Record<string, unknown>
  ): Promise<void> {
    const event: AuditEvent = {
      event_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      persona_id: this.personaId,
      session_id: this.sessionId,
      workspace_id: this.workspaceId,
      event_type: eventType,
      event_data: eventData,
      metadata: {
        client_version: '1.0.0',
        platform: typeof window !== 'undefined' ? 'web' : 'node',
      },
    };

    // Sign with PERSONA (non-blocking)
    this.signEvent(event).catch(console.error);

    // Add to buffer
    this.buffer.push(event);
    this.totalEvents++;

    // Immediate flush for critical events
    if (this.isCritical(eventType)) {
      await this.flush();
    }
  }

  /**
   * Sign an event with PERSONA
   */
  private async signEvent(event: AuditEvent): Promise<void> {
    try {
      const auth = PersonaAuth.getInstance();
      const payload = JSON.stringify({
        event_id: event.event_id,
        timestamp: event.timestamp,
        event_type: event.event_type,
        event_data_hash: await this.hashData(event.event_data),
      });

      event.attestation = await auth.sign(payload);
    } catch (error) {
      console.warn('[AuditLogger] Failed to sign event:', error);
    }
  }

  /**
   * Hash event data for attestation
   */
  private async hashData(data: Record<string, unknown>): Promise<string> {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(JSON.stringify(data));
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Flush buffer to backends
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    // Write to all backends in parallel
    await Promise.all(
      this.backends.map((backend) => backend.writeBatch(events))
    ).catch((error) => {
      console.error('[AuditLogger] Failed to flush events:', error);
      // Put events back in buffer for retry
      this.buffer.unshift(...events);
    });
  }

  /**
   * Check if event type is critical (needs immediate flush)
   */
  private isCritical(eventType: AuditEventType): boolean {
    return [
      'git.push',
      'git.commit',
      'terminal.command',
      'agent.handoff',
      'file.delete',
    ].includes(eventType);
  }

  /**
   * Get events for a file
   */
  static async getEventsForFile(filePath: string): Promise<AuditEvent[]> {
    const instance = this.getInstance();
    const memBackend = instance.backends.find(
      (b) => b instanceof InMemoryAuditBackend
    ) as InMemoryAuditBackend | undefined;

    return memBackend?.getEventsForFile(filePath) ?? [];
  }

  /**
   * Export all events
   */
  static async exportAll(): Promise<AuditEvent[]> {
    const instance = this.getInstance();
    await instance.flush();

    const memBackend = instance.backends.find(
      (b) => b instanceof InMemoryAuditBackend
    ) as InMemoryAuditBackend | undefined;

    return memBackend?.getEvents() ?? [];
  }

  /**
   * Finalize the logger (call on session end)
   */
  async finalize(): Promise<void> {
    // Log session end
    await this.log('session.end', {
      duration_ms: Date.now() - this.sessionStartTime,
      events_logged: this.totalEvents,
    });

    // Final flush
    await this.flush();

    // Clear interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

export default AuditLogger;

