/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAquariumHost, IAquariumPopulationDriver, IFishHandle } from './aquariumOverlay.js';
import { IAquariumSubmitIntentService } from './aquariumSubmitIntentService.js';
import { FishStatusVariant } from './fish.js';

/** Spawn size of a fish that's growing from a freshly-submitted chat. */
const GROWTH_START_SIZE = 18;
/** Final size the fish reaches if its session keeps running long enough. */
const GROWTH_TARGET_SIZE = 56;
/** Wall-clock tween length from {@link GROWTH_START_SIZE} to {@link GROWTH_TARGET_SIZE}. */
const GROWTH_DURATION_MS = 18000;

interface ISessionFishEntry {
	readonly handle: IFishHandle;
	readonly perSession: DisposableStore;
	/** Latest status observed via the per-session autorun. */
	lastStatus: SessionStatus;
	/**
	 * True when the fish was spawned via a freshly-consumed submit intent and
	 * is currently in the grow-from-spawn tween. Cleared the moment the
	 * session leaves `InProgress` so the tween settles at whatever size the
	 * fish reached.
	 */
	isGrowing: boolean;
}

/**
 * Population driver that maps the live, non-archived set of sessions 1:1 to
 * fish in the aquarium — mirroring what the sessions sidebar shows by
 * default. Status drives color via {@link FishStatusVariant}; add / remove
 * animations are handled by the engine via {@link IFishHandle.fadeOut}.
 *
 * Activity bubbles and submit-grow tweens are layered on top in later phases
 * (this driver only deals with population + status).
 */
export class SessionPopulationDriver extends Disposable implements IAquariumPopulationDriver {

	private _host: IAquariumHost | undefined;

	private readonly _entries = new Map<string, ISessionFishEntry>();
	/** Per-session disposable that observes archived state so we add/remove fish in sync with the sidebar. */
	private readonly _watchers = new Map<string, IDisposable>();

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
			this._watchSession(session);
		}

		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			for (const removed of e.removed) {
				this._unwatchSession(removed.sessionId);
				this._removeSession(removed.sessionId);
			}
			for (const added of e.added) {
				this._watchSession(added);
			}
			// `changed` is reactively handled by per-session autoruns wired in `_addSession`.
		}));
	}

	override dispose(): void {
		for (const watcher of this._watchers.values()) {
			watcher.dispose();
		}
		this._watchers.clear();
		for (const entry of this._entries.values()) {
			entry.perSession.dispose();
			entry.handle.dispose();
		}
		this._entries.clear();
		this._host = undefined;
		super.dispose();
	}

	/**
	 * Watch a session's archived state. Archived sessions are hidden from the
	 * sidebar's default list and so are hidden from the aquarium too; if the
	 * user unarchives a session its fish reappears.
	 */
	private _watchSession(session: ISession): void {
		if (this._watchers.has(session.sessionId)) {
			return;
		}
		const store = new DisposableStore();
		this._watchers.set(session.sessionId, store);
		store.add(autorun(reader => {
			const archived = session.isArchived.read(reader);
			if (archived) {
				this._removeSession(session.sessionId);
			} else {
				this._addSession(session);
			}
		}));
	}

	private _unwatchSession(sessionId: string): void {
		this._watchers.get(sessionId)?.dispose();
		this._watchers.delete(sessionId);
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
}

function statusToVariant(status: SessionStatus): FishStatusVariant | undefined {
	switch (status) {
		case SessionStatus.InProgress:
			return 'running';
		case SessionStatus.NeedsInput:
			return 'needs-input';
		case SessionStatus.Error:
			return 'error';
		default:
			// Untitled / Completed fall through to the species color so the
			// aquarium stays colorful — only live or errored fish stand out.
			return undefined;
	}
}
