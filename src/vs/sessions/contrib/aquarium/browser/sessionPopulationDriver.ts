/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../common/agentHostSessionsProvider.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAquariumHost, IAquariumPopulationDriver, IFishHandle } from './aquariumOverlay.js';
import { IAquariumSubmitIntentService } from './aquariumSubmitIntentService.js';
import { FishStatusVariant } from './fish.js';

/**
 * Soft cap on session-fish so the aquarium never balloons past a comfortable
 * count even when the user runs unusually many parallel agent-host sessions.
 * The driver enforces this by aging out the oldest **terminal** (completed /
 * error) fish first; active sessions are never displaced by the cap.
 */
const MAX_SESSION_FISH = 20;

/** Spawn size of a fish that's growing from a freshly-submitted chat. */
const GROWTH_START_SIZE = 18;
/** Final size the fish reaches if its session keeps running long enough. */
const GROWTH_TARGET_SIZE = 56;
/** Wall-clock tween length from {@link GROWTH_START_SIZE} to {@link GROWTH_TARGET_SIZE}. */
const GROWTH_DURATION_MS = 18000;

interface ISessionFishEntry {
	readonly handle: IFishHandle;
	readonly perSession: DisposableStore;
	/** Latest status observed via the per-session autorun, used by the cap eviction. */
	lastStatus: SessionStatus;
	/** Wall-clock time the session was first observed, used as the cap-eviction tiebreaker. */
	readonly addedAt: number;
	/**
	 * True when the fish was spawned via a freshly-consumed submit intent and
	 * is currently in the grow-from-spawn tween. Cleared the moment the
	 * session leaves `InProgress` so the tween settles at whatever size the
	 * fish reached.
	 */
	isGrowing: boolean;
}

/**
 * Population driver that maps the live set of agent-host sessions 1:1 to fish
 * in the aquarium. Status drives color via {@link FishStatusVariant}; add /
 * remove animations are handled by the engine via {@link IFishHandle.fadeOut}.
 *
 * Activity bubbles and submit-grow tweens are layered on top in later phases
 * (this driver only deals with population + status).
 */
export class SessionPopulationDriver extends Disposable implements IAquariumPopulationDriver {

	private _host: IAquariumHost | undefined;

	private readonly _entries = new Map<string, ISessionFishEntry>();

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IAquariumSubmitIntentService private readonly _submitIntentService: IAquariumSubmitIntentService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();
	}

	attach(host: IAquariumHost): void {
		this._host = host;

		for (const session of this._sessionsManagementService.getSessions()) {
			if (this._isAgentHost(session)) {
				this._addSession(session);
			}
		}

		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			for (const removed of e.removed) {
				this._removeSession(removed.sessionId);
			}
			for (const added of e.added) {
				if (this._isAgentHost(added)) {
					this._addSession(added);
				}
			}
			// `changed` is reactively handled by per-session autoruns wired in `_addSession`.
		}));

		this._enforceCap();
	}

	override dispose(): void {
		for (const entry of this._entries.values()) {
			entry.perSession.dispose();
			entry.handle.dispose();
		}
		this._entries.clear();
		this._host = undefined;
		super.dispose();
	}

	private _isAgentHost(session: ISession): boolean {
		return ANY_AGENT_HOST_PROVIDER_RE.test(session.providerId);
	}

	private _addSession(session: ISession): void {
		if (!this._host || this._entries.has(session.sessionId)) {
			return;
		}
		// If the user just submitted, opt this fish into the growth tween.
		// `consumeIntent` clears the timestamp so a single intent only grows
		// one fish even if multiple sessions register in quick succession.
		const isGrowing = this._submitIntentService.consumeIntent();
		const motionReduced = this._accessibilityService.isMotionReduced();

		const handle = this._host.addFish(isGrowing
			? { size: motionReduced ? (GROWTH_START_SIZE + GROWTH_TARGET_SIZE) / 2 : GROWTH_START_SIZE }
			: undefined);
		if (isGrowing && !motionReduced) {
			handle.fish.setTargetSize(GROWTH_TARGET_SIZE, GROWTH_DURATION_MS);
		}

		const perSession = new DisposableStore();
		const entry: ISessionFishEntry = {
			handle,
			perSession,
			lastStatus: SessionStatus.Untitled,
			addedAt: Date.now(),
			isGrowing,
		};
		this._entries.set(session.sessionId, entry);

		perSession.add(autorun(reader => {
			const status = session.status.read(reader);
			const previousStatus = entry.lastStatus;
			entry.lastStatus = status;
			handle.fish.setStatusVariant(statusToVariant(status));
			// Settle the growth tween the moment the session leaves InProgress
			// so a fish that "finished early" doesn't keep growing into a
			// completed-state size that doesn't match its semantics.
			if (entry.isGrowing && previousStatus === SessionStatus.InProgress && status !== SessionStatus.InProgress) {
				entry.isGrowing = false;
				handle.fish.setTargetSize(handle.fish.size, 0);
			}
			if (isTerminal(status)) {
				// Re-evaluate the cap when a fish becomes evictable.
				this._enforceCap();
			}
		}));

		// Activity → bubble. Coalesced via Bubble.setText so identical
		// consecutive observable ticks don't reset the dwell on every emit.
		perSession.add(autorun(reader => {
			const status = session.status.read(reader);
			const description = session.description.read(reader);
			if (!this._host) {
				return;
			}
			const isLive = status === SessionStatus.InProgress || status === SessionStatus.NeedsInput;
			const text = isLive ? (description?.value ?? '').trim() : '';
			this._host.showBubble(handle, text);
		}));
	}

	private _removeSession(sessionId: string): IDisposable | undefined {
		const entry = this._entries.get(sessionId);
		if (!entry) {
			return undefined;
		}
		entry.perSession.dispose();
		entry.handle.fadeOut();
		this._entries.delete(sessionId);
		return undefined;
	}

	/**
	 * Soft-cap the number of fish at {@link MAX_SESSION_FISH}. Only sessions
	 * in a terminal state (`Completed` / `Error`) are evicted; oldest first.
	 * Active sessions are kept regardless of cap to preserve the 1:1 visual.
	 */
	private _enforceCap(): void {
		if (this._entries.size <= MAX_SESSION_FISH) {
			return;
		}
		const evictable: Array<{ id: string; addedAt: number }> = [];
		for (const [id, entry] of this._entries) {
			if (isTerminal(entry.lastStatus)) {
				evictable.push({ id, addedAt: entry.addedAt });
			}
		}
		// Oldest first so the visible "fade-out" pattern is FIFO.
		evictable.sort((a, b) => a.addedAt - b.addedAt);

		let toEvict = this._entries.size - MAX_SESSION_FISH;
		while (toEvict > 0 && evictable.length > 0) {
			const next = evictable.shift()!;
			this._removeSession(next.id);
			toEvict--;
		}
	}
}

function statusToVariant(status: SessionStatus): FishStatusVariant | undefined {
	switch (status) {
		case SessionStatus.InProgress:
			return 'running';
		case SessionStatus.NeedsInput:
			return 'needs-input';
		case SessionStatus.Completed:
			return 'completed';
		case SessionStatus.Error:
			return 'error';
		default:
			return undefined;
	}
}

function isTerminal(status: SessionStatus): boolean {
	return status === SessionStatus.Completed || status === SessionStatus.Error;
}
