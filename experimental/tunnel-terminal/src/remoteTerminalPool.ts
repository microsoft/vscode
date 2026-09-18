/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalBridge, type BridgeCloseReason, type BridgeOptions } from './bridge';
import { RemoteRelay } from './remoteRelay';
import { maxTerminalSessions, relayApprovalPendingMessage, relayCapacityMessage, relayLeaseMs, validateSessionId } from './relayProtocol';

export class TerminalApprovalGate {
	private pending: { sessionId: string; visible: boolean } | undefined;

	reserve(sessionId: string): void {
		if (this.pending) {
			throw new Error(relayApprovalPendingMessage);
		}
		this.pending = { sessionId, visible: false };
	}

	async show(sessionId: string, approve: () => Promise<boolean>): Promise<boolean> {
		if (this.pending?.sessionId !== sessionId) {
			return false;
		}
		this.pending.visible = true;
		try {
			return await approve();
		} finally {
			if (this.pending?.sessionId === sessionId) {
				this.pending = undefined;
			}
		}
	}

	release(sessionId: string): void {
		// A timed-out modal can remain visible. Do not stack another prompt on it.
		if (this.pending?.sessionId === sessionId && !this.pending.visible) {
			this.pending = undefined;
		}
	}
}

interface PoolSession {
	bridge: TerminalBridge;
	relay?: RemoteRelay;
	retentionTimer?: NodeJS.Timeout;
}

export interface RemoteTerminalPoolOptions {
	spawn: BridgeOptions['spawn'];
	approve: BridgeOptions['approve'];
	onError(error: Error): void;
	onSessionClose?(reason: BridgeCloseReason): void;
	approvalGate?: TerminalApprovalGate;
	approvalTimeoutMs?: number;
	startTimeoutMs?: number;
	retentionMs?: number;
	leaseMs?: number;
	pollMs?: number;
}

export class RemoteTerminalPool {
	private readonly sessions = new Map<string, PoolSession>();
	private readonly approvalGate: TerminalApprovalGate;
	private disposed = false;

	constructor(private readonly options: RemoteTerminalPoolOptions) {
		this.approvalGate = options.approvalGate ?? new TerminalApprovalGate();
	}

	async open(sessionId: string): Promise<void> {
		validateSessionId(sessionId);
		if (this.disposed) {
			throw new Error('The terminal bridge has been stopped.');
		}
		if (this.sessions.has(sessionId)) {
			throw new Error('This terminal session already exists.');
		}
		if (this.sessions.size >= maxTerminalSessions) {
			throw new Error(relayCapacityMessage);
		}
		this.approvalGate.reserve(sessionId);
		const session: PoolSession = {
			bridge: new TerminalBridge({
				spawn: this.options.spawn,
				approve: code => this.approvalGate.show(sessionId, () => this.options.approve(code)),
				onError: error => this.options.onError(error),
				startTimeoutMs: this.options.startTimeoutMs,
				approvalTimeoutMs: this.options.approvalTimeoutMs,
				onClose: reason => {
					this.approvalGate.release(sessionId);
					if (this.sessions.get(sessionId) === session) {
						this.options.onSessionClose?.(reason);
						// Preserve final output/exit for the client, but bound abandoned closed sessions.
						session.retentionTimer = setTimeout(() => this.close(sessionId), this.options.retentionMs ?? relayLeaseMs);
					}
				},
			}),
		};
		this.sessions.set(sessionId, session);
		try {
			const connection = await session.bridge.start();
			if (this.sessions.get(sessionId) !== session) {
				throw new Error('The terminal session was closed while starting.');
			}
			session.relay = new RemoteRelay(connection.url, {
				onError: error => this.options.onError(error),
				onLeaseExpired: () => this.close(sessionId),
				leaseMs: this.options.leaseMs,
				pollMs: this.options.pollMs,
			});
			await session.relay.open();
		} catch (error) {
			this.close(sessionId);
			throw error;
		}
	}

	getRelay(sessionId: string): RemoteRelay {
		validateSessionId(sessionId);
		const session = this.sessions.get(sessionId);
		if (!session?.relay) {
			throw new Error('The terminal session is not connected.');
		}
		return session.relay;
	}

	close(sessionId: string): void {
		validateSessionId(sessionId);
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}
		this.sessions.delete(sessionId);
		clearTimeout(session.retentionTimer);
		this.approvalGate.release(sessionId);
		session.relay?.dispose();
		session.bridge.dispose('disconnected');
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const sessionId of this.sessions.keys()) {
			this.close(sessionId);
		}
	}
}
