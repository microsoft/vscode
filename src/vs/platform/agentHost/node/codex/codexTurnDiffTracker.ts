/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import type { IDisposable } from '../../../../base/common/lifecycle.js';
import type { ICodexTurnDiffCapture, ICodexTurnDiffSnapshot } from './codexTurnDiff.js';
import type { TurnDiffUpdatedNotification } from './protocol/generated/v2/TurnDiffUpdatedNotification.js';

interface INativeTurn {
	readonly ready: DeferredPromise<void>;
	readonly snapshots: ICodexTurnDiffSnapshot[];
	readonly initialDiffs: Map<string, string>;
	/** Paths this native turn has touched, including ones a later update reverted. */
	readonly paths: Set<string>;
	readonly fileSequences: Map<string, { readonly first: number; readonly last: number }>;
	notification: TurnDiffUpdatedNotification;
	hostTurnId: string;
	startSequence: number;
	sequence: number;
	status: 'active' | 'complete' | 'storing' | 'failed';
}

/** The paths a diff section names: its `---` and `+++` sides, or its `diff --git` line when it has neither. */
function sectionPaths(section: string): string[] {
	const hunks = section.search(/^@@/m);
	const header = hunks === -1 ? section : section.slice(0, hunks);
	const paths = [...header.matchAll(/^(?:---|\+\+\+) (?:[ab]\/)?(.+)$/gm)].map(match => match[1]).filter(path => path !== '/dev/null');
	const samePath = /^diff --git a\/(.+) b\/\1$/m.exec(header);
	return paths.length || !samePath ? paths : [samePath[1]];
}

/**
 * Groups the native turns of a host turn, such as a parent and its children, with the turns that touched
 * the same paths, before reconstructing their shared file contents. A group is stored once all its turns complete.
 */
export class CodexTurnDiffTracker implements IDisposable {
	private readonly _discardedTurnIds = new Set<string>();
	private readonly _nativeTurns = new Map<string, INativeTurn>();
	private readonly _pendingChildren = new Map<string, INativeTurn>();
	private readonly _hostTurns = new Map<string, Set<INativeTurn>>();
	private _sequence = 0;
	/** While events are replayed into a reserved slot, the last sequence taken from it. */
	private _replaySequence: number | undefined;

	constructor(private readonly _store: (captures: readonly ICodexTurnDiffCapture[], relatedDiffs: readonly string[], discardedTurnIds: ReadonlySet<string>) => Promise<void>) { }

	/** Sequences order edits across native turns, so events processed later than they arrived take them from a reserved slot. */
	private _nextSequence(): number {
		if (this._replaySequence === undefined) {
			return ++this._sequence;
		}
		// Fractional steps keep every sequence of the slot below the next one reserved or taken afterwards.
		this._replaySequence += 1 / 1024;
		return this._replaySequence;
	}

	/** Reserves the position of an event that arrives now but is processed later, such as one from a child thread not yet registered. */
	reserveSequence(): number {
		return ++this._sequence;
	}

	/** Processes an event at the position {@link reserveSequence} reserved when it arrived, so its edits keep their arrival order. */
	replayAt(reserved: number, replay: () => void): void {
		const previous = this._replaySequence;
		this._replaySequence = reserved;
		try {
			replay();
		} finally {
			this._replaySequence = previous;
		}
	}

	private _createTurn(threadId: string, nativeTurnId: string, hostTurnId: string): INativeTurn {
		const turn: INativeTurn = {
			ready: new DeferredPromise<void>(), snapshots: [], initialDiffs: new Map(), paths: new Set(), fileSequences: new Map(), hostTurnId,
			notification: { threadId, turnId: nativeTurnId, diff: '' },
			startSequence: 0, sequence: 0, status: 'active',
		};
		turn.startSequence = turn.sequence = this._nextSequence();
		void turn.ready.p.catch(() => { });
		this._addHostTurn(hostTurnId, turn);
		return turn;
	}

	trackChild(threadId: string, hostTurnId: string): void {
		if ([...this._hostTurns.get(hostTurnId) ?? []].some(turn => turn.status === 'failed')) {
			return;
		}
		this._pendingChildren.set(threadId, this._createTurn(threadId, '', hostTurnId));
	}

	start(threadId: string, nativeTurnId: string, hostTurnId: string): void {
		if (this._nativeTurns.has(nativeTurnId)) {
			return;
		}
		if ([...this._hostTurns.get(hostTurnId) ?? []].some(turn => turn.status === 'failed')) {
			return;
		}
		const pending = this._pendingChildren.get(threadId);
		const turn = pending ?? this._createTurn(threadId, nativeTurnId, hostTurnId);
		this._pendingChildren.delete(threadId);
		if (pending && this._replaySequence !== undefined) {
			// The child sent this event before its spawn registered it, so it started then.
			turn.startSequence = turn.sequence = this._nextSequence();
		}
		turn.notification = { threadId, turnId: nativeTurnId, diff: '' };
		this._nativeTurns.set(nativeTurnId, turn);
	}

	update(notification: TurnDiffUpdatedNotification): void {
		const child = this._pendingChildren.get(notification.threadId);
		if (child) {
			this.start(notification.threadId, notification.turnId, child.hostTurnId);
		}
		const turn = this._nativeTurns.get(notification.turnId);
		if (!turn || turn.status !== 'active') {
			return;
		}
		turn.notification = notification;
		turn.sequence = this._nextSequence();
		// Retain each path's first diff even if it later vanishes from a cumulative revert.
		for (const section of notification.diff.split(/(?=^diff --git )/m).filter(section => section.length > 0)) {
			const header = section.split('\n', 1)[0];
			if (!turn.initialDiffs.has(header)) {
				turn.initialDiffs.set(header, section);
				for (const path of sectionPaths(section)) {
					turn.paths.add(path);
				}
			}
		}
	}

	/** File-change completion identifies which cumulative paths actually changed in this host segment. */
	markEdited(nativeTurnId: string, paths: readonly string[]): void {
		const turn = this._nativeTurns.get(nativeTurnId);
		if (turn?.status === 'active') {
			const sequence = this._nextSequence();
			turn.sequence = sequence;
			for (const path of paths) {
				turn.fileSequences.set(path, { first: turn.fileSequences.get(path)?.first ?? sequence, last: sequence });
			}
		}
	}

	split(nativeTurnId: string, hostTurnId: string): void {
		const turn = this._nativeTurns.get(nativeTurnId);
		if (turn) {
			if (turn.status !== 'failed') {
				this._snapshot(turn);
			}
			turn.hostTurnId = hostTurnId;
			turn.startSequence = this._nextSequence();
			this._addHostTurn(hostTurnId, turn);
		}
	}

	private _snapshot(turn: INativeTurn): void {
		turn.snapshots.push({ turnId: turn.hostTurnId, diff: turn.notification.diff, startSequence: turn.startSequence, sequence: turn.sequence, fileSequences: new Map(turn.fileSequences) });
	}

	private _addHostTurn(hostTurnId: string, turn: INativeTurn): void {
		let turns = this._hostTurns.get(hostTurnId);
		if (!turns) {
			turns = new Set();
			this._hostTurns.set(hostTurnId, turns);
		}
		turns.add(turn);
	}

	async complete(nativeTurnId: string): Promise<void> {
		const turn = this._nativeTurns.get(nativeTurnId);
		if (!turn) {
			return;
		}
		if (turn.status === 'active') {
			this._snapshot(turn);
			turn.status = 'complete';
			void this._flushGroup(turn);
		}
		await turn.ready.p;
	}

	/** Native completion waits for another turn that touched the same paths, rather than only for database persistence. */
	isWaitingForRelatedTurns(nativeTurnId: string): boolean {
		return this._nativeTurns.get(nativeTurnId)?.status === 'complete';
	}

	/**
	 * The pending native turns stored together with `turn`: those of its host turns and those that touched one of its paths, transitively.
	 * A child can edit a file its parent touched before its diff arrives, so a parent always waits for its children.
	 * A turn a truncation removed neither joins nor holds back another group; its diffs still help resolve contents.
	 */
	private _relatedTurns(turn: INativeTurn): Set<INativeTurn> {
		const group = new Set([turn]);
		if (this._isDiscarded(turn)) {
			return group;
		}
		const candidates = [...this._nativeTurns.values(), ...this._pendingChildren.values()].filter(member => (member.status === 'active' || member.status === 'complete') && !this._isDiscarded(member));
		for (const member of group) {
			const hostTurnIds = this._hostTurnIds(member);
			for (const other of candidates) {
				if (!group.has(other) && (this._hostTurnIds(other).some(id => hostTurnIds.includes(id)) || [...other.paths].some(path => member.paths.has(path)))) {
					group.add(other);
				}
			}
		}
		return group;
	}

	private _hostTurnIds(turn: INativeTurn): string[] {
		return [turn.hostTurnId, ...turn.snapshots.map(snapshot => snapshot.turnId)];
	}

	private async _flushGroup(turn: INativeTurn): Promise<void> {
		const group = this._relatedTurns(turn);
		if ([...group].some(member => member.status !== 'complete')) {
			return;
		}
		// A removed turn's diffs still resolve the contents of kept turns that touched its paths, so it is released after them.
		if (this._isDiscarded(turn) && [...this._nativeTurns.values()].some(member => (member.status === 'active' || member.status === 'complete')
			&& !this._isDiscarded(member) && [...member.paths].some(path => turn.paths.has(path)))) {
			return;
		}
		// Database row order defines each path's session delta: an overlapping store that started first must finish first.
		const paths = new Set([...group].flatMap(member => [...member.paths]));
		if ([...this._nativeTurns.values()].some(member => member.status === 'storing' && !this._isDiscarded(member) && [...member.paths].some(path => paths.has(path)))) {
			return;
		}
		const captures = [...group].map(member => ({ notification: member.notification, snapshots: member.snapshots, initialDiffs: [...member.initialDiffs.values()] }));
		const relatedDiffs = [...this._nativeTurns.values()].filter(member => !group.has(member) && member.status !== 'failed')
			.flatMap(member => [...member.initialDiffs.values(), ...member.snapshots.map(snapshot => snapshot.diff), member.notification.diff]);
		for (const member of group) {
			member.status = 'storing';
		}
		try {
			await this._store(captures, relatedDiffs, this._discardedTurnIds);
			for (const member of group) {
				this._nativeTurns.delete(member.notification.turnId);
				for (const [id, pending] of this._hostTurns) {
					pending.delete(member);
					if (pending.size === 0) {
						this._hostTurns.delete(id);
					}
				}
				member.ready.complete();
			}
		} catch (error) {
			for (const member of group) {
				member.status = 'failed';
				member.ready.error(error);
			}
		}
		this._flushCompleteGroups();
	}

	private _isDiscarded(turn: INativeTurn): boolean {
		return this._hostTurnIds(turn).every(id => this._discardedTurnIds.has(id));
	}

	/**
	 * Marks host turns a truncation removed. Snapshots still being captured for them, e.g. by a child
	 * that outlives its turn, are not stored, and their running turns hold back no other group.
	 */
	discard(hostTurnIds: Iterable<string>): void {
		for (const hostTurnId of hostTurnIds) {
			this._discardedTurnIds.add(hostTurnId);
		}
		this._flushCompleteGroups();
	}

	/** Flushes, in start order, every complete group whose turns all completed and no overlapping store holds back. */
	private _flushCompleteGroups(): void {
		const start = (turn: INativeTurn) => turn.snapshots[0]?.startSequence ?? turn.startSequence;
		for (const member of [...this._nativeTurns.values()].filter(member => member.status === 'complete').sort((a, b) => start(a) - start(b))) {
			void this._flushGroup(member);
		}
	}

	/** Unwinds a child even when no turn/started reached the host before disconnection. */
	async completeThread(threadId: string): Promise<void> {
		const pending = this._pendingChildren.get(threadId);
		if (pending) {
			this._pendingChildren.delete(threadId);
			const related = this._hostTurns.get(pending.hostTurnId);
			related?.delete(pending);
			if (related?.size === 0) {
				this._hostTurns.delete(pending.hostTurnId);
			}
			pending.ready.complete();
			this._flushCompleteGroups();
		}
		await Promise.all([...this._nativeTurns.values()]
			.filter(turn => turn.notification.threadId === threadId && turn.status !== 'failed')
			.map(turn => this.complete(turn.notification.turnId)));
	}

	/** Whether disposing the tracker would drop edits it can still store: kept turns still captured, or waiting for related turns. A running store finishes either way. */
	hasPendingTurns(): boolean {
		return [...this._nativeTurns.values(), ...this._pendingChildren.values()].some(turn => (turn.status === 'active' || turn.status === 'complete') && !this._isDiscarded(turn));
	}

	/** Whether a kept turn is still being captured on a thread outside `except`. */
	isCapturing(except: ReadonlySet<string>): boolean {
		return [...this._nativeTurns.values(), ...this._pendingChildren.values()].some(turn => turn.status === 'active' && !this._isDiscarded(turn) && !except.has(turn.notification.threadId));
	}

	/** Whether a kept turn's store is running, which holds back a completed group that touched one of its paths. */
	isStoring(): boolean {
		return [...this._nativeTurns.values()].some(turn => turn.status === 'storing' && !this._isDiscarded(turn));
	}

	async waitForTurnEdits(hostTurnId: string): Promise<void> {
		let turns: Set<INativeTurn> | undefined;
		while ((turns = this._hostTurns.get(hostTurnId))?.size) {
			await Promise.all([...turns].map(turn => turn.ready.p));
		}
	}

	dispose(): void {
		for (const turns of this._hostTurns.values()) {
			for (const turn of turns) {
				// A store already running settles its turns when it finishes.
				if (turn.status !== 'storing') {
					turn.ready.cancel();
				}
			}
		}
		this._hostTurns.clear();
		this._nativeTurns.clear();
		this._pendingChildren.clear();
	}
}
