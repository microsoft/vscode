/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, Sequencer } from '../../../base/common/async.js';
import type { Event } from '../../../base/common/event.js';
import { Disposable, DisposableResourceMap, type IDisposable } from '../../../base/common/lifecycle.js';
import { LinkedMap, Touch } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostSessionReleaseRetryMsEnvVar, AgentHostSessionResidencyLimitEnvVar } from '../common/agentService.js';
import { IAgentHostSubscriptionService, resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { isSessionStatusArchived, parseSubagentSessionUri } from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

const DEFAULT_SESSION_RESIDENCY_LIMIT = 10;
const DEFAULT_SESSION_RELEASE_RETRY_MS = 30_000;

function readNonNegativeIntegerEnv(name: string, defaultValue: number): number {
	const raw = process.env[name];
	const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

export interface IAgentSessionRelease {
	canRelease(chats: readonly URI[]): Promise<boolean>;
	release(chats: readonly URI[]): Promise<void>;
}

export interface IAgentSessionReleaseDelegate {
	isReleaseBlocked(session: URI): boolean;
	whenSessionDataIdle(session: URI): Promise<void>;
	getSessionChats(session: URI): readonly URI[];
	createRelease(session: URI): IAgentSessionRelease | undefined;
	evictSessionState(session: URI, chats: readonly URI[]): void;
}

export interface IAgentSessionResidencyOptions {
	readonly limit?: number;
	readonly releaseRetryMs?: number;
	readonly holdsSession: (session: string) => boolean;
	readonly onDidReleaseHold: Event<string>;
}

export class AgentSessionResidency extends Disposable {
	private readonly _releaseInFlight = new Map<string, Promise<boolean>>();
	private readonly _sessionsBeingDisposed = new Set<string>();
	private readonly _recency = new LinkedMap<string, URI>();
	private readonly _reconciler = new Sequencer();
	private readonly _releaseRetries = this._register(new DisposableResourceMap<IDisposable>());
	private readonly _limit: number;
	private readonly _releaseRetryMs: number;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _delegate: IAgentSessionReleaseDelegate,
		private readonly _options: IAgentSessionResidencyOptions,
		@IAgentHostSubscriptionService private readonly _subscriptions: IAgentHostSubscriptionService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._limit = _options.limit ?? readNonNegativeIntegerEnv(AgentHostSessionResidencyLimitEnvVar, DEFAULT_SESSION_RESIDENCY_LIMIT);
		this._releaseRetryMs = _options.releaseRetryMs ?? readNonNegativeIntegerEnv(AgentHostSessionReleaseRetryMsEnvVar, DEFAULT_SESSION_RELEASE_RETRY_MS);
		this._register(this._stateManager.onDidChangeSessionActiveTurn(({ session, active }) => {
			if (active) {
				this.touch(URI.parse(session));
			}
			void this.reconcile();
		}));
		this._register(this._stateManager.onDidRemoveSession(session => {
			const resource = URI.parse(session);
			if (!parseSubagentSessionUri(resource)) {
				this._recency.delete(session);
				void this.reconcile();
			}
		}));
		this._register(this._options.onDidReleaseHold(() => void this.reconcile()));
	}

	touch(resource: URI): void {
		const session = resolveAgentHostSession(resource);
		this._releaseRetries.deleteAndDispose(session);
		const sessionKey = session.toString();
		if (!this._stateManager.getSessionState(sessionKey)
			|| this._stateManager.isEphemeralSession(sessionKey)
			|| this._stateManager.isUnusedDraft(sessionKey) === true) {
			return;
		}
		this._recency.set(sessionKey, session, Touch.AsNew);
	}

	reconcile(): Promise<void> {
		return this._reconciler.queue(() => this._doReconcile());
	}

	async runDisposal<T>(resource: URI, task: () => Promise<T>): Promise<T> {
		const session = resolveAgentHostSession(resource);
		const sessionKey = session.toString();
		this._sessionsBeingDisposed.add(sessionKey);
		this._recency.delete(sessionKey);
		this._releaseRetries.deleteAndDispose(session);
		try {
			await this._releaseInFlight.get(sessionKey);
			this._releaseRetries.deleteAndDispose(session);
			try {
				return await task();
			} catch (error) {
				this.touch(session);
				throw error;
			}
		} finally {
			this._sessionsBeingDisposed.delete(sessionKey);
			void this.reconcile();
		}
	}

	async waitForRelease(resource: URI): Promise<void> {
		await this._releaseInFlight.get(resolveAgentHostSession(resource).toString());
	}

	private _residentCount(): number {
		let count = 0;
		for (const [sessionKey] of this._recency) {
			if (this._stateManager.getSessionState(sessionKey)
				&& !this._stateManager.isEphemeralSession(sessionKey)
				&& this._stateManager.isUnusedDraft(sessionKey) !== true) {
				count++;
			}
		}
		return count;
	}

	private _isReleaseRequired(sessionKey: string, expectedRecency: URI | undefined): boolean {
		if (isSessionStatusArchived(this._stateManager.getSessionState(sessionKey)?.status)) {
			return true;
		}
		return expectedRecency !== undefined
			&& this._recency.get(sessionKey) === expectedRecency
			&& this._residentCount() > this._limit;
	}

	private async _doReconcile(): Promise<void> {
		const stale: string[] = [];
		const residents: URI[] = [];
		for (const [sessionKey, session] of this._recency) {
			if (!this._stateManager.getSessionState(sessionKey)
				|| this._stateManager.isEphemeralSession(sessionKey)
				|| this._stateManager.isUnusedDraft(sessionKey) === true) {
				stale.push(sessionKey);
			} else {
				residents.push(session);
			}
		}
		for (const sessionKey of stale) {
			this._recency.delete(sessionKey);
		}

		const archived = new Map<string, URI>();
		for (const sessionKey of this._stateManager.getSessionUris()) {
			const session = URI.parse(sessionKey);
			if (!parseSubagentSessionUri(session)
				&& isSessionStatusArchived(this._stateManager.getSessionState(sessionKey)?.status)) {
				archived.set(sessionKey, session);
			}
		}

		let residentCount = residents.length;
		const processed = new Set<string>();
		for (const session of [...archived.values(), ...residents]) {
			const sessionKey = session.toString();
			if (processed.has(sessionKey)) {
				continue;
			}
			processed.add(sessionKey);
			if (!archived.has(sessionKey) && residentCount <= this._limit) {
				break;
			}
			const wasResident = this._recency.has(sessionKey);
			if (await this._tryRelease(session, this._recency.get(sessionKey)) && wasResident) {
				residentCount--;
			}
		}
	}

	private async _tryRelease(resource: URI, expectedRecency: URI | undefined): Promise<boolean> {
		const session = resolveAgentHostSession(resource);
		const sessionKey = session.toString();
		if (!this._isReleaseRequired(sessionKey, expectedRecency)
			|| this._sessionsBeingDisposed.has(sessionKey)
			|| this._releaseRetries.has(session)
			|| this._subscriptions.hasSessionSubscribers(session)
			|| this._delegate.isReleaseBlocked(session)
			|| this._stateManager.hasActiveTurn(sessionKey)
			|| this._options.holdsSession(sessionKey)) {
			return false;
		}
		const releaseInFlight = this._releaseInFlight.get(sessionKey);
		if (releaseInFlight) {
			return releaseInFlight;
		}
		const trackedRelease = this._release(session, expectedRecency);
		this._releaseInFlight.set(sessionKey, trackedRelease);
		try {
			return await trackedRelease;
		} finally {
			if (this._releaseInFlight.get(sessionKey) === trackedRelease) {
				this._releaseInFlight.delete(sessionKey);
			}
		}
	}

	private async _release(session: URI, expectedRecency: URI | undefined): Promise<boolean> {
		const sessionKey = session.toString();
		try {
			await this._delegate.whenSessionDataIdle(session);
			if (!this._canContinueRelease(sessionKey, expectedRecency)) {
				return false;
			}

			const release = this._delegate.createRelease(session);
			if (!release) {
				return false;
			}
			let chats = this._delegate.getSessionChats(session);
			while (true) {
				if (!await release.canRelease(chats)) {
					this._scheduleRetryIfNeeded(session, expectedRecency);
					return false;
				}
				const currentChats = this._delegate.getSessionChats(session);
				if (currentChats.length === chats.length && currentChats.every((chat, index) => chat.toString() === chats[index].toString())) {
					break;
				}
				chats = currentChats;
			}

			if (!this._stateManager.getSessionState(sessionKey) || !this._canContinueRelease(sessionKey, expectedRecency)) {
				return false;
			}
			await release.release(chats);
			if (!this._canContinueRelease(sessionKey, expectedRecency)) {
				return false;
			}
			this._delegate.evictSessionState(session, chats);
			return true;
		} catch (error) {
			this._logService.error(error, `[AgentSessionResidency] Failed to release session ${sessionKey}`);
			this._scheduleRetryIfNeeded(session, expectedRecency);
			return false;
		}
	}

	private _canContinueRelease(sessionKey: string, expectedRecency: URI | undefined): boolean {
		return this._isReleaseRequired(sessionKey, expectedRecency)
			&& !this._sessionsBeingDisposed.has(sessionKey)
			&& !this._subscriptions.hasSessionSubscribers(URI.parse(sessionKey))
			&& !this._delegate.isReleaseBlocked(URI.parse(sessionKey))
			&& !this._stateManager.hasActiveTurn(sessionKey)
			&& !this._options.holdsSession(sessionKey);
	}

	private _scheduleRetryIfNeeded(session: URI, expectedRecency: URI | undefined): void {
		const sessionKey = session.toString();
		if (!this._isReleaseRequired(sessionKey, expectedRecency)
			|| this._sessionsBeingDisposed.has(sessionKey)
			|| this._subscriptions.hasSessionSubscribers(session)) {
			return;
		}
		this._releaseRetries.set(session, disposableTimeout(() => {
			this._releaseRetries.deleteAndDispose(session);
			void this.reconcile();
		}, this._releaseRetryMs));
	}
}
