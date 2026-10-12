/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, raceCancellation, timeout } from '../../../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../../base/common/marshalling.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IToolResult } from '../languageModelToolsService.js';

export type BackgroundAgentStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface IBackgroundAgentContext {
	readonly sessionResource: URI;
	readonly requestId?: string;
}

export interface IBackgroundAgentSnapshot {
	readonly id: string;
	readonly sessionResource: string;
	readonly parentRequestId: string;
	readonly parentAgentId?: string;
	readonly requestId: string;
	readonly invocationId: string;
	readonly description: string;
	readonly agentName?: string;
	readonly depth: number;
	readonly status: BackgroundAgentStatus;
	readonly startedAt: number;
	readonly completedAt?: number;
	readonly consumed: boolean;
	readonly cancellationRequested: boolean;
	readonly result?: IToolResult;
}

interface IBackgroundAgentRecord extends IBackgroundAgentSnapshot {
	owner: string;
	leaseId: string;
	leaseUntil: number;
	fence: number;
	contexts: { sessionResource: string; requestId: string }[];
}

interface IRegistryState {
	version: 1;
	records: IBackgroundAgentRecord[];
}

export interface IBackgroundAgentStart extends IBackgroundAgentContext {
	readonly parentAgentId?: string;
	readonly invocationId: string;
	readonly description: string;
	readonly agentName?: string;
}

export interface IBackgroundAgentHandle {
	readonly snapshot: IBackgroundAgentSnapshot;
	readonly completion: Promise<IBackgroundAgentSnapshot>;
}

export interface IBackgroundAgentRoster {
	readonly scope: 'current_session';
	readonly running: number;
	readonly limit: number;
	readonly pendingResults: number;
	readonly agents: readonly IBackgroundAgentSnapshot[];
}

interface ILiveAgent {
	readonly source: CancellationTokenSource;
	readonly leaseId: string;
	readonly fence: number;
	readonly store: DisposableStore;
}

export interface IBackgroundAgentRegistryOptions {
	readonly now?: () => number;
	readonly leaseDuration?: number;
	readonly heartbeatInterval?: number;
	readonly terminalRetention?: number;
}

/** Durable session roster and noninterrupting mailbox; all mutations use authoritative storage CAS. */
export class BackgroundAgentRegistry extends Disposable {
	static readonly StorageKey = 'chat.backgroundAgents.v1';
	static readonly Limit = 10;
	private readonly owner = generateUuid();
	private readonly live = new Map<string, ILiveAgent>();
	private readonly onDidChangeEmitter = this._register(new Emitter<IBackgroundAgentSnapshot>());
	readonly onDidChange = this.onDidChangeEmitter.event;
	private readonly now: () => number;
	private readonly leaseDuration: number;
	private readonly terminalRetention: number;
	private disposed = false;

	constructor(private readonly storage: IStorageService, options: IBackgroundAgentRegistryOptions = {}) {
		super();
		this.now = options.now ?? Date.now;
		this.leaseDuration = options.leaseDuration ?? 90_000;
		this.terminalRetention = options.terminalRetention ?? 30 * 60_000;
		const heartbeat = this._register(new IntervalTimer());
		heartbeat.cancelAndSet(() => {
			void this.heartbeat().catch(() => this.cancelLiveAgents());
		}, options.heartbeatInterval ?? 20_000);
	}

	private sessionKey(resource: URI): string {
		return extUri.getComparisonKey(resource);
	}

	private encode(state: IRegistryState): string {
		return JSON.stringify(state, (_key, value) => value instanceof VSBuffer
			? { $backgroundAgentBuffer: encodeBase64(value) }
			: value);
	}

	private decode(value: string | undefined): IRegistryState {
		if (value === undefined) {
			return { version: 1, records: [] };
		}
		const state: IRegistryState = revive(JSON.parse(value, (_key, value) => {
			if (value && typeof value === 'object' && typeof value.$backgroundAgentBuffer === 'string') {
				return decodeBase64(value.$backgroundAgentBuffer);
			}
			return value;
		}));
		if (state.version !== 1 || !Array.isArray(state.records)) {
			throw new Error(localize('backgroundAgent.invalidStorage', "Background agent state storage has an unsupported format."));
		}
		return state;
	}

	private recover(state: IRegistryState): IBackgroundAgentSnapshot[] {
		const now = this.now();
		const recovered: IBackgroundAgentSnapshot[] = [];
		for (let index = 0; index < state.records.length; index++) {
			const record = state.records[index];
			if (record.status === 'running' && record.leaseUntil <= now) {
				state.records[index] = {
					...record, status: 'interrupted', completedAt: now, leaseUntil: 0, fence: record.fence + 1,
					result: { content: [{ kind: 'text', value: localize('backgroundAgent.interrupted', "Agent execution was interrupted before completion (window or Extension Host reload).") }], toolResultError: true },
				};
				recovered.push(state.records[index]);
			}
		}
		state.records = state.records.filter(record => record.status === 'running' || now - (record.completedAt ?? record.startedAt) <= this.terminalRetention);
		return recovered;
	}

	private async transaction<T>(update: (state: IRegistryState) => T): Promise<T> {
		let previous = await this.storage.readApplicationSharedValue(BackgroundAgentRegistry.StorageKey);
		for (let attempt = 0; attempt < 100; attempt++) {
			const state = this.decode(previous);
			const recovered = this.recover(state);
			const result = update(state);
			const next = this.encode(state);
			const outcome = await this.storage.compareAndSwapApplicationSharedValue(BackgroundAgentRegistry.StorageKey, previous, next);
			if (outcome.swapped) {
				for (const snapshot of recovered) {
					this.onDidChangeEmitter.fire(snapshot);
				}
				return result;
			}
			previous = outcome.currentValue;
		}
		throw new Error(localize('backgroundAgent.storageBusy', "Background agent storage is busy. Retry the operation."));
	}

	private scope(state: IRegistryState, context: IBackgroundAgentContext): string {
		return this.findCaller(state, context)?.sessionResource ?? this.sessionKey(context.sessionResource);
	}

	private findCaller(state: IRegistryState, context: IBackgroundAgentContext): IBackgroundAgentRecord | undefined {
		const sessionResource = this.sessionKey(context.sessionResource);
		return context.requestId ? state.records.find(record => record.contexts.some(binding => binding.sessionResource === sessionResource && binding.requestId === context.requestId)) : undefined;
	}

	/** Binds a detached transport's exact invocation identity to the original lineage and quota. */
	async bindInvocationContext(id: string, context: IBackgroundAgentContext): Promise<void> {
		if (!context.requestId) {
			throw new Error(localize('backgroundAgent.requestRequired', "An exact request ID is required for background agent context binding."));
		}
		await this.transaction(state => {
			const record = state.records.find(record => record.id === id);
			if (!record || record.owner !== this.owner || record.status !== 'running') {
				throw new Error(localize('backgroundAgent.notOwned', "The background agent is not live in this owner."));
			}
			const binding = { sessionResource: this.sessionKey(context.sessionResource), requestId: context.requestId! };
			const existing = this.findCaller(state, context);
			if (existing && existing.id !== id) {
				throw new Error(localize('backgroundAgent.contextCollision', "The invocation context is already bound to another background agent."));
			}
			if (!existing) {
				record.contexts.push(binding);
			}
		});
	}

	async getInvocation(context: IBackgroundAgentContext): Promise<IBackgroundAgentSnapshot | undefined> {
		return this.transaction(state => this.findCaller(state, context));
	}

	async start(input: IBackgroundAgentStart, task: (snapshot: IBackgroundAgentSnapshot, token: CancellationToken) => Promise<IToolResult>, parentToken: CancellationToken = CancellationToken.None): Promise<IBackgroundAgentHandle> {
		if (this.disposed || parentToken.isCancellationRequested) {
			throw new Error(localize('backgroundAgent.startCancelled', "Background agent launch was cancelled."));
		}
		const id = generateUuid();
		const leaseId = generateUuid();
		const snapshot = await this.transaction(state => {
			const caller = this.findCaller(state, input);
			const parent = input.parentAgentId ? state.records.find(record => record.id === input.parentAgentId) : caller;
			if (parent && (parent.status !== 'running' || parent.owner !== this.owner) || input.parentAgentId && caller?.id !== input.parentAgentId) {
				throw new Error(localize('backgroundAgent.invalidParent', "The parent agent is no longer live in this owner."));
			}
			const sessionResource = parent?.sessionResource ?? this.scope(state, input);
			if (state.records.filter(record => record.sessionResource === sessionResource && record.status === 'running').length >= BackgroundAgentRegistry.Limit) {
				throw new Error(localize('backgroundAgent.quota', "This chat session has reached its limit of 10 running agents. Recover their IDs with read_agent({}) or mode list."));
			}
			const startedAt = this.now();
			const record: IBackgroundAgentRecord = {
				id, sessionResource, parentRequestId: input.requestId ?? input.invocationId, parentAgentId: parent?.id,
				requestId: id, invocationId: input.invocationId, description: input.description, agentName: input.agentName,
				depth: (parent?.depth ?? 0) + 1, status: 'running', startedAt, consumed: false, cancellationRequested: false,
				owner: this.owner, leaseId, leaseUntil: startedAt + this.leaseDuration, fence: 1,
				contexts: [{ sessionResource: this.sessionKey(input.sessionResource), requestId: id }],
			};
			state.records.push(record);
			return record;
		});
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(parentToken));
		if (this.disposed || parentToken.isCancellationRequested) {
			source.cancel();
		}
		this.live.set(id, { source, leaseId, fence: snapshot.fence, store });
		this.onDidChangeEmitter.fire(snapshot);
		const completion = this.execute(snapshot, task, source.token);
		return { snapshot, completion };
	}

	private async execute(snapshot: IBackgroundAgentRecord, task: (snapshot: IBackgroundAgentSnapshot, token: CancellationToken) => Promise<IToolResult>, token: CancellationToken): Promise<IBackgroundAgentSnapshot> {
		let result: IToolResult;
		let status: BackgroundAgentStatus = 'completed';
		try {
			result = token.isCancellationRequested ? { content: [] } : await raceCancellation(task(snapshot, token), token) ?? {
				content: [{ kind: 'text', value: localize('backgroundAgent.cancelled', "Agent execution was cancelled.") }],
			};
			status = this.disposed ? 'interrupted' : token.isCancellationRequested ? 'cancelled' : result.toolResultError ? 'failed' : 'completed';
		} catch (error) {
			status = token.isCancellationRequested || isCancellationError(error) ? 'cancelled' : 'failed';
			result = { content: [{ kind: 'text', value: error instanceof Error ? error.message : String(error) }], toolResultError: true };
		}
		try {
			const terminal = await this.transaction(state => {
				const index = state.records.findIndex(record => record.id === snapshot.id);
				const record = state.records[index];
				if (!record || record.owner !== this.owner || record.leaseId !== snapshot.leaseId || record.fence !== snapshot.fence || record.status !== 'running') {
					return record ?? { ...snapshot, status: 'interrupted' as const, completedAt: this.now() };
				}
				return state.records[index] = { ...record, result, status, completedAt: this.now(), leaseUntil: 0, fence: record.fence + 1 };
			});
			this.onDidChangeEmitter.fire(terminal);
			return terminal;
		} finally {
			this.live.get(snapshot.id)?.store.dispose();
			this.live.delete(snapshot.id);
		}
	}

	private async heartbeat(): Promise<void> {
		if (!this.live.size || this.disposed) {
			return;
		}
		const invalid = await this.transaction(state => {
			const invalid: string[] = [];
			for (const [id, live] of this.live) {
				const record = state.records.find(record => record.id === id);
				if (!record || record.owner !== this.owner || record.leaseId !== live.leaseId || record.fence !== live.fence || record.status !== 'running') {
					invalid.push(id);
				} else {
					record.leaseUntil = this.now() + this.leaseDuration;
				}
			}
			return invalid;
		});
		for (const id of invalid) {
			this.live.get(id)?.source.cancel();
		}
	}

	async list(context: IBackgroundAgentContext): Promise<IBackgroundAgentRoster> {
		return this.transaction(state => {
			const scope = this.scope(state, context);
			const agents = state.records.filter(record => record.sessionResource === scope && !record.consumed);
			return { scope: 'current_session', running: agents.filter(record => record.status === 'running').length, limit: BackgroundAgentRegistry.Limit, pendingResults: agents.filter(record => record.status !== 'running').length, agents };
		});
	}

	async get(context: IBackgroundAgentContext, id: string): Promise<IBackgroundAgentSnapshot | undefined> {
		return this.transaction(state => state.records.find(record => record.id === id && record.sessionResource === this.scope(state, context)));
	}

	/** Retains completion snapshots even after read_agent claims them, separated by exact launch request. */
	async mailbox(context: IBackgroundAgentContext): Promise<readonly IBackgroundAgentSnapshot[]> {
		return this.transaction(state => state.records.filter(record => record.sessionResource === this.scope(state, context) && record.parentRequestId === context.requestId && record.status !== 'running'));
	}

	async claim(context: IBackgroundAgentContext, id: string): Promise<IToolResult | undefined> {
		return this.transaction(state => {
			const index = state.records.findIndex(record => record.id === id && record.sessionResource === this.scope(state, context));
			const record = state.records[index];
			if (!record || record.status === 'running' || record.consumed) {
				return undefined;
			}
			state.records[index] = { ...record, consumed: true, fence: record.fence + 1 };
			return record.result;
		});
	}

	async cancel(context: IBackgroundAgentContext, id: string): Promise<boolean> {
		const accepted = await this.transaction(state => {
			const index = state.records.findIndex(record => record.id === id && record.sessionResource === this.scope(state, context));
			const record = state.records[index];
			if (!record || record.status !== 'running' || record.owner !== this.owner || !this.live.has(id)) {
				return false;
			}
			state.records[index] = { ...record, cancellationRequested: true };
			return true;
		});
		if (accepted) {
			this.live.get(id)?.source.cancel();
		}
		return accepted;
	}

	async wait(context: IBackgroundAgentContext, id: string, seconds: number, token: CancellationToken): Promise<IBackgroundAgentSnapshot | undefined> {
		const deadline = this.now() + Math.max(300, Math.min(Number.isFinite(seconds) ? seconds : 1800, 3600)) * 1000;
		let snapshot = await this.get(context, id);
		while (snapshot?.status === 'running' && !token.isCancellationRequested && this.now() < deadline) {
			try {
				await timeout(Math.min(250, deadline - this.now()), token);
			} catch (error) {
				if (!isCancellationError(error)) {
					throw error;
				}
				break;
			}
			snapshot = await this.get(context, id);
		}
		return snapshot;
	}

	private cancelLiveAgents(): void {
		for (const live of this.live.values()) {
			live.source.cancel();
		}
	}

	override dispose(): void {
		this.disposed = true;
		this.cancelLiveAgents();
		for (const live of this.live.values()) {
			live.store.dispose();
		}
		super.dispose();
	}
}

/** Core integration can bind exact transport contexts and inspect owned state, but cannot launch or dispose workers. */
export type IBackgroundAgentRegistryAccess = Pick<BackgroundAgentRegistry, 'bindInvocationContext' | 'getInvocation' | 'onDidChange' | 'list' | 'get' | 'mailbox' | 'claim' | 'cancel' | 'wait'>;

export async function appendBackgroundAgentRoster(registry: Pick<IBackgroundAgentRegistryAccess, 'list'>, context: IBackgroundAgentContext, result: IToolResult): Promise<IToolResult> {
	const roster = await registry.list(context);
	const rows = roster.agents.map(agent => JSON.stringify({ agent_id: agent.id, status: agent.status, agent_name: agent.agentName, description: agent.description })).join('\n');
	const value = localize('backgroundAgent.roster', "Current session subagents: running={0}/{1}, pending_results={2}.\n{3}", roster.running, roster.limit, roster.pendingResults, rows);
	return { ...result, content: [...result.content, { kind: 'text', value }] };
}