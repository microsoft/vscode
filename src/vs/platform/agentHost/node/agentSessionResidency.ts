/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, Sequencer } from '../../../base/common/async.js';
import type { Event } from '../../../base/common/event.js';
import { Disposable, DisposableResourceMap, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { LinkedMap, Touch } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostSessionReleaseRetryMsEnvVar, AgentHostSessionResidencyLimitEnvVar } from '../common/agentService.js';
import { IAgentHostSubscriptionService, resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { parseAnnotationsUri } from '../common/annotationsUri.js';
import { isSessionStatusArchived, parseSubagentSessionUri } from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

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

/** A move's hold on a session it loaded data-only ({@link AgentSessionResidency.holdForMove}). */
export interface IAgentSessionMoveHold extends IDisposable {
	/** The session's data load, shared by every hold on it. */
	readonly loaded: Promise<void>;
}

interface IMoveHoldEntry {
	count: number;
	loaded: Promise<void>;
	readonly ended: DeferredPromise<void>;
}

export interface IAgentSessionResidencyOptions {
	readonly limit?: number;
	readonly releaseRetryMs?: number;
	readonly holdsSession: (session: string) => boolean;
	readonly onDidReleaseHold: Event<string>;
}

export class AgentSessionResidency extends Disposable {
	private readonly _releaseInFlight = new Map<string, Promise<boolean>>();
	/** Sessions a chat move loaded data-only (C15), by the number of moves holding them; dropped when the last ends. */
	private readonly _moveHolds = new Map<string, IMoveHoldEntry>();
	/** Sessions being dropped after the last move holding them ended. */
	private readonly _moveDrops = new Map<string, Promise<void>>();
	private readonly _sessionsBeingDisposed = new Map<string, number>();
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
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
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
		// Nothing waits for a session a move held once the host shuts down.
		this._register(toDisposable(() => this._moveHolds.forEach(hold => hold.ended.complete())));
	}

	touch(resource: URI): void {
		const session = this._getResidencySession(resource);
		if (!session) {
			return;
		}
		this._releaseRetries.deleteAndDispose(session);
		const sessionKey = session.toString();
		if (!this._stateManager.getSessionState(sessionKey)
			|| this._isHeldForMove(sessionKey)
			|| this._stateManager.isEphemeralSession(sessionKey)
			|| this._stateManager.isUnusedDraft(sessionKey) === true) {
			return;
		}
		this._recency.set(sessionKey, session, Touch.AsNew);
	}

	private _getResidencySession(resource: URI): URI | undefined {
		// Annotation ownership does not imply a dependency on the resident conversation; changesets still do.
		return parseAnnotationsUri(resource.toString()) ? undefined : this._resolveSession(resource);
	}

	private _resolveSession(resource: URI): URI | undefined {
		return resolveAgentHostSession(resource, chat => this._chatOwnership.getChatOwner(chat));
	}

	private _hasResidencySubscribers(resource: URI): boolean {
		const sessionKey = this._resolveSession(resource)?.toString();
		if (sessionKey === undefined) {
			return false;
		}
		for (const subscribedResource of this._subscriptions.subscribedResources) {
			// Subscribed chats resolve through the owner recorded at subscribe time.
			const subscribedSession = parseAnnotationsUri(subscribedResource.toString()) ? undefined : this._subscriptions.resolveSubscribedSession(subscribedResource);
			if (subscribedSession?.toString() === sessionKey) {
				return true;
			}
		}
		return false;
	}

	reconcile(): Promise<void> {
		return this._reconciler.queue(() => this._doReconcile());
	}

	isBeingDisposed(resource: URI | string): boolean {
		const session = this._resolveSession(typeof resource === 'string' ? URI.parse(resource) : resource);
		return !!session && this._sessionsBeingDisposed.has(session.toString());
	}

	async runDisposal<T>(resource: URI, task: () => Promise<T>): Promise<T> {
		const session = this._resolveSession(resource);
		if (!session) {
			throw new Error(`Cannot dispose a resource with no recorded session: ${resource.toString()}`);
		}
		const sessionKey = session.toString();
		this._sessionsBeingDisposed.set(sessionKey, (this._sessionsBeingDisposed.get(sessionKey) ?? 0) + 1);
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
			const remainingDisposals = (this._sessionsBeingDisposed.get(sessionKey) ?? 1) - 1;
			if (remainingDisposals > 0) {
				this._sessionsBeingDisposed.set(sessionKey, remainingDisposals);
			} else {
				this._sessionsBeingDisposed.delete(sessionKey);
			}
			void this.reconcile();
		}
	}

	async waitForRelease(resource: URI): Promise<void> {
		const session = this._getResidencySession(resource);
		if (session) {
			const sessionKey = session.toString();
			// Settles once the last move holding it ends, and then once the drop that follows does.
			await this._moveHolds.get(sessionKey)?.ended.p;
			await this._moveDrops.get(sessionKey);
			await this._releaseInFlight.get(sessionKey);
		}
	}

	/**
	 * Holds `session` while a chat move uses its data (C15): a move loads a session it needs that isn't loaded with its
	 * data only (`load`), which no client sees. Holds are counted and share the first one's load; when the last one is
	 * disposed the session is dropped, whatever its recency or subscribers, so opening it afterwards restores it in full.
	 * While held it doesn't count towards the residency limit and {@link waitForRelease} waits for it to be dropped.
	 * Returns `undefined` while the session is being dropped: wait for {@link waitForRelease} and try again.
	 */
	holdForMove(session: URI, load: () => Promise<void>): IAgentSessionMoveHold | undefined {
		const sessionKey = session.toString();
		if (this._moveDrops.has(sessionKey)) {
			return undefined;
		}
		let hold = this._moveHolds.get(sessionKey);
		if (!hold) {
			this._recency.delete(sessionKey);
			this._releaseRetries.deleteAndDispose(session);
			const created: IMoveHoldEntry = { count: 0, loaded: Promise.resolve(), ended: new DeferredPromise<void>() };
			this._moveHolds.set(sessionKey, created);
			created.loaded = load();
			// Awaited by each holder; a failure here is theirs to report.
			created.loaded.catch(() => { });
			hold = created;
		}
		const current = hold;
		current.count++;
		let disposed = false;
		return {
			loaded: current.loaded,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				if (--current.count === 0 && this._moveHolds.get(sessionKey) === current) {
					this._moveHolds.delete(sessionKey);
					const drop = this._dropAfterMove(session, current.loaded);
					this._moveDrops.set(sessionKey, drop);
					current.ended.complete();
					void drop.finally(() => {
						if (this._moveDrops.get(sessionKey) === drop) {
							this._moveDrops.delete(sessionKey);
						}
					});
				}
			},
		};
	}

	/** Whether a chat move holds `resource`'s session ({@link holdForMove}): it is being loaded, used or dropped for the move. */
	isHeldForMove(resource: URI): boolean {
		const session = this._resolveSession(resource);
		return !!session && this._isHeldForMove(session.toString());
	}

	/** {@link isHeldForMove} for a session's own key, without resolving it. */
	isSessionHeldForMove(sessionKey: string): boolean {
		return this._isHeldForMove(sessionKey);
	}

	private _isHeldForMove(sessionKey: string): boolean {
		return this._moveHolds.has(sessionKey) || this._moveDrops.has(sessionKey);
	}

	private async _dropAfterMove(session: URI, loaded: Promise<void>): Promise<void> {
		const sessionKey = session.toString();
		await loaded.catch(() => { });
		await this._releaseInFlight.get(sessionKey);
		if (!this._stateManager.isDataOnlySession(sessionKey)) {
			// A whole-session move ended it, or its data never loaded.
			return;
		}
		try {
			await this._delegate.whenSessionDataIdle(session);
			await this._delegate.createRelease(session)?.release(this._delegate.getSessionChats(session));
		} catch (error) {
			this._logService.warn(`[AgentSessionResidency] Failed to release ${sessionKey} after a move; dropping it anyway`, error);
		} finally {
			// Always: a session loaded for a move only is never shown, so one left behind could never be opened again.
			if (this._stateManager.isDataOnlySession(sessionKey)) {
				try {
					this._delegate.evictSessionState(session, this._delegate.getSessionChats(session));
				} catch (error) {
					this._logService.error(error, `[AgentSessionResidency] Failed to drop ${sessionKey} after a move`);
				}
			}
		}
	}

	private _residentCount(): number {
		let count = 0;
		for (const [sessionKey] of this._recency) {
			if (this._stateManager.getSessionState(sessionKey)
				&& !this._isHeldForMove(sessionKey)
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
				|| this._isHeldForMove(sessionKey)
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
				&& !this._isHeldForMove(sessionKey)
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
		const session = this._resolveSession(resource);
		if (!session) {
			return false;
		}
		const sessionKey = session.toString();
		if (!this._isReleaseRequired(sessionKey, expectedRecency)
			|| this._isHeldForMove(sessionKey)
			|| this._sessionsBeingDisposed.has(sessionKey)
			|| this._releaseRetries.has(session)
			|| this._hasResidencySubscribers(session)
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
		return !this._store.isDisposed
			&& this._isReleaseRequired(sessionKey, expectedRecency)
			&& !this._isHeldForMove(sessionKey)
			&& !this._sessionsBeingDisposed.has(sessionKey)
			&& !this._hasResidencySubscribers(URI.parse(sessionKey))
			&& !this._delegate.isReleaseBlocked(URI.parse(sessionKey))
			&& !this._stateManager.hasActiveTurn(sessionKey)
			&& !this._options.holdsSession(sessionKey);
	}

	private _scheduleRetryIfNeeded(session: URI, expectedRecency: URI | undefined): void {
		const sessionKey = session.toString();
		if (this._store.isDisposed
			|| !this._isReleaseRequired(sessionKey, expectedRecency)
			|| this._sessionsBeingDisposed.has(sessionKey)
			|| this._hasResidencySubscribers(session)) {
			return;
		}
		this._releaseRetries.set(session, disposableTimeout(() => {
			this._releaseRetries.deleteAndDispose(session);
			void this.reconcile();
		}, this._releaseRetryMs));
	}
}
