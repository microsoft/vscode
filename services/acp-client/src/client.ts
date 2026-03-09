// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { EventEmitter } from 'events';
import { StdioTransport } from './transport/stdioTransport';
import { HttpTransport } from './transport/httpTransport';
import { AgentRegistry } from './registry/agentRegistry';
import type {
	ACPClient,
	AgentDescriptor,
	AgentCapabilities,
	Session,
	SessionConfig,
	SessionContext,
	SessionEvent,
	SessionStatus,
	AgentRegistryEntry,
} from './types';

type Transport = StdioTransport | HttpTransport;

interface ManagedSession {
	session: Session;
	transport: Transport;
	eventHandlers: Set<(event: SessionEvent) => void>;
}

/**
 * Concrete implementation of the ACP client.
 *
 * Connects to agent servers via stdio or HTTP, manages sessions, and
 * streams events back to the editor. Supports the meta-orchestrator
 * dispatch pattern described in instruction 15.
 */
export class ACPClientImpl extends EventEmitter implements ACPClient {
	private sessions = new Map<string, ManagedSession>();
	private transports = new Map<string, Transport>();

	constructor(private readonly registry: AgentRegistry) {
		super();
	}

	// -----------------------------------------------------------------------
	// Discovery
	// -----------------------------------------------------------------------

	async listAgents(): Promise<AgentDescriptor[]> {
		return this.registry.listDescriptors();
	}

	async getAgentCapabilities(agentId: string): Promise<AgentCapabilities> {
		const entry = this.registry.getEntry(agentId);
		if (!entry) {
			throw new Error(`Agent not found: ${agentId}`);
		}

		// Try to get live capabilities from the agent
		try {
			const transport = await this.getOrCreateTransport(entry);
			const response = await transport.request('acp/capabilities');
			if (response.result) {
				return response.result as AgentCapabilities;
			}
		} catch {
			// Fall back to static capabilities from registry
		}

		return AgentRegistry.entryToCapabilities(entry);
	}

	// -----------------------------------------------------------------------
	// Session management
	// -----------------------------------------------------------------------

	async createSession(agentId: string, config: SessionConfig): Promise<Session> {
		const entry = this.registry.getEntry(agentId);
		if (!entry) {
			throw new Error(`Agent not found: ${agentId}`);
		}

		const transport = await this.getOrCreateTransport(entry);

		const response = await transport.request('acp/session.create', {
			task: config.task,
			context: config.context,
			tools: config.tools,
			maxTokens: config.maxTokens,
			timeout: config.timeout,
		});

		if (response.error) {
			throw new Error(`Failed to create session: ${response.error.message}`);
		}

		const sessionData = response.result as { sessionId: string };
		const session: Session = {
			id: sessionData.sessionId,
			agentId,
			status: 'running',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		const managed: ManagedSession = {
			session,
			transport,
			eventHandlers: new Set(),
		};

		this.sessions.set(session.id, managed);

		// Listen for session events from this transport
		transport.on('notification', (notification: { method: string; params?: unknown }) => {
			if (notification.method === 'acp/session.event') {
				const event = notification.params as SessionEvent;
				if (event.sessionId === session.id) {
					this.handleSessionEvent(session.id, event);
				}
			}
		});

		return session;
	}

	async sendMessage(sessionId: string, message: string, context?: SessionContext): Promise<void> {
		const managed = this.getSession(sessionId);

		await managed.transport.request('acp/session.message', {
			sessionId,
			message,
			context,
		});

		managed.session.updatedAt = Date.now();
	}

	async pauseSession(sessionId: string): Promise<void> {
		const managed = this.getSession(sessionId);

		await managed.transport.request('acp/session.pause', { sessionId });

		managed.session.status = 'paused';
		managed.session.updatedAt = Date.now();
	}

	async resumeSession(sessionId: string): Promise<void> {
		const managed = this.getSession(sessionId);

		await managed.transport.request('acp/session.resume', { sessionId });

		managed.session.status = 'running';
		managed.session.updatedAt = Date.now();
	}

	async terminateSession(sessionId: string): Promise<void> {
		const managed = this.getSession(sessionId);

		try {
			await managed.transport.request('acp/session.terminate', { sessionId });
		} catch {
			// Best effort — the agent may have already exited
		}

		managed.session.status = 'terminated';
		managed.session.updatedAt = Date.now();
		this.sessions.delete(sessionId);
	}

	// -----------------------------------------------------------------------
	// Event stream
	// -----------------------------------------------------------------------

	onSessionEvent(sessionId: string, handler: (event: SessionEvent) => void): void {
		const managed = this.getSession(sessionId);
		managed.eventHandlers.add(handler);
	}

	offSessionEvent(sessionId: string, handler: (event: SessionEvent) => void): void {
		const managed = this.sessions.get(sessionId);
		managed?.eventHandlers.delete(handler);
	}

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	async shutdown(): Promise<void> {
		// Terminate all active sessions
		const sessionIds = Array.from(this.sessions.keys());
		await Promise.allSettled(
			sessionIds.map(id => this.terminateSession(id))
		);

		// Stop all transports
		const transports = Array.from(this.transports.values());
		await Promise.allSettled(
			transports.map(t => t.stop())
		);

		this.transports.clear();
		this.sessions.clear();
	}

	/** Get status of all active sessions. */
	getActiveSessions(): Session[] {
		return Array.from(this.sessions.values()).map(m => ({ ...m.session }));
	}

	/** Get the status of a specific session. */
	getSessionStatus(sessionId: string): SessionStatus | undefined {
		return this.sessions.get(sessionId)?.session.status;
	}

	// -----------------------------------------------------------------------
	// Internal helpers
	// -----------------------------------------------------------------------

	private getSession(sessionId: string): ManagedSession {
		const managed = this.sessions.get(sessionId);
		if (!managed) {
			throw new Error(`Session not found: ${sessionId}`);
		}
		return managed;
	}

	private async getOrCreateTransport(entry: AgentRegistryEntry): Promise<Transport> {
		const existing = this.transports.get(entry.id);
		if (existing?.isConnected) {
			return existing;
		}

		let transport: Transport;

		if (entry.transport === 'stdio') {
			transport = new StdioTransport(
				entry.command!,
				entry.args ?? [],
				entry.env,
			);
		} else {
			transport = new HttpTransport(entry.url!);
		}

		await transport.start();
		this.transports.set(entry.id, transport);

		transport.on('error', (err: Error) => {
			console.error(`[acp-client] Transport error for ${entry.id}:`, err.message);
			this.emit('transportError', { agentId: entry.id, error: err });
		});

		return transport;
	}

	private handleSessionEvent(sessionId: string, event: SessionEvent): void {
		const managed = this.sessions.get(sessionId);
		if (!managed) {
			return;
		}

		// Update session status on terminal events
		if (event.type === 'complete') {
			managed.session.status = 'completed';
			managed.session.updatedAt = Date.now();
		} else if (event.type === 'error') {
			managed.session.status = 'failed';
			managed.session.updatedAt = Date.now();
		}

		// Notify all event handlers
		for (const handler of managed.eventHandlers) {
			try {
				handler(event);
			} catch (err) {
				console.error(`[acp-client] Event handler error for session ${sessionId}:`, err);
			}
		}

		// Emit on the client for global listeners
		this.emit('sessionEvent', event);
	}
}
