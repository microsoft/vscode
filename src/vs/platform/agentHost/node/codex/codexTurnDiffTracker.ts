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
	readonly fileSequences: Map<string, { readonly first: number; readonly last: number }>;
	notification: TurnDiffUpdatedNotification;
	hostTurnId: string;
	startSequence: number;
	sequence: number;
	status: 'active' | 'complete' | 'storing' | 'failed';
}

/** Groups native parents and children by their host checkpoints before reconstructing shared file contents. */
export class CodexTurnDiffTracker implements IDisposable {
	private readonly _nativeTurns = new Map<string, INativeTurn>();
	private readonly _pendingChildren = new Map<string, INativeTurn>();
	private readonly _hostTurns = new Map<string, Set<INativeTurn>>();
	private _sequence = 0;

	constructor(private readonly _store: (captures: readonly ICodexTurnDiffCapture[], relatedDiffs: readonly string[]) => Promise<void>) { }

	private _createTurn(threadId: string, nativeTurnId: string, hostTurnId: string): INativeTurn {
		const turn: INativeTurn = {
			ready: new DeferredPromise<void>(), snapshots: [], initialDiffs: new Map(), fileSequences: new Map(), hostTurnId,
			notification: { threadId, turnId: nativeTurnId, diff: '' },
			startSequence: ++this._sequence, sequence: this._sequence, status: 'active',
		};
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
		const turn = this._pendingChildren.get(threadId) ?? this._createTurn(threadId, nativeTurnId, hostTurnId);
		this._pendingChildren.delete(threadId);
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
		turn.sequence = ++this._sequence;
		// Retain each path's first diff even if it later vanishes from a cumulative revert.
		for (const section of notification.diff.split(/(?=^diff --git )/m).filter(section => section.length > 0)) {
			const header = section.split('\n', 1)[0];
			if (!turn.initialDiffs.has(header)) {
				turn.initialDiffs.set(header, section);
			}
		}
	}

	/** File-change completion identifies which cumulative paths actually changed in this host segment. */
	markEdited(nativeTurnId: string, paths: readonly string[]): void {
		const turn = this._nativeTurns.get(nativeTurnId);
		if (turn?.status === 'active') {
			const sequence = ++this._sequence;
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
			turn.startSequence = ++this._sequence;
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

	/** Native completion is waiting for a child, rather than only for database persistence. */
	isWaitingForRelatedTurns(nativeTurnId: string): boolean {
		return this._nativeTurns.get(nativeTurnId)?.status === 'complete';
	}

	private _relatedTurns(turn: INativeTurn): Set<INativeTurn> {
		const group = new Set([turn]);
		for (const member of group) {
			for (const host of [member.hostTurnId, ...member.snapshots.map(snapshot => snapshot.turnId)]) {
				for (const related of this._hostTurns.get(host) ?? []) {
					group.add(related);
				}
			}
		}
		return group;
	}

	private async _flushGroup(turn: INativeTurn): Promise<void> {
		const group = this._relatedTurns(turn);
		if ([...group].some(member => member.status !== 'complete')) {
			return;
		}
		const start = (member: INativeTurn) => member.snapshots[0]?.startSequence ?? member.startSequence;
		const groupStart = Math.min(...[...group].map(start));
		// Database row order defines the session delta. A replacement turn must not
		// overtake the cancelled turn's child snapshots while they are still pending.
		if ([...this._nativeTurns.values()].some(member => !group.has(member) && member.status !== 'failed' && start(member) < groupStart)) {
			return;
		}
		const captures = [...group].map(member => ({ notification: member.notification, snapshots: member.snapshots, initialDiffs: [...member.initialDiffs.values()] }));
		const relatedDiffs = [...this._nativeTurns.values()].filter(member => !group.has(member) && member.status !== 'failed')
			.flatMap(member => [...member.initialDiffs.values(), ...member.snapshots.map(snapshot => snapshot.diff), member.notification.diff]);
		for (const member of group) {
			member.status = 'storing';
		}
		try {
			await this._store(captures, relatedDiffs);
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
		this._flushNextGroup();
	}

	private _flushNextGroup(): void {
		const start = (turn: INativeTurn) => turn.snapshots[0]?.startSequence ?? turn.startSequence;
		const next = [...this._nativeTurns.values()].filter(member => member.status === 'complete').sort((a, b) => start(a) - start(b))[0];
		if (next) {
			void this._flushGroup(next);
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
			this._flushNextGroup();
		}
		await Promise.all([...this._nativeTurns.values()]
			.filter(turn => turn.notification.threadId === threadId && turn.status !== 'failed')
			.map(turn => this.complete(turn.notification.turnId)));
	}

	/** A stuck child must fail its checkpoint instead of holding all future persistence behind it. */
	failWaitingTurn(hostTurnId: string, error: Error): void {
		const turn = this._hostTurns.get(hostTurnId)?.values().next().value;
		if (!turn) {
			return;
		}
		const group = this._relatedTurns(turn);
		if ([...group].some(member => member.status === 'storing')) {
			return;
		}
		for (const member of group) {
			member.status = 'failed';
			member.initialDiffs.clear();
			member.ready.error(error);
			if (this._pendingChildren.get(member.notification.threadId) === member) {
				this._pendingChildren.delete(member.notification.threadId);
			}
		}
		this._flushNextGroup();
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
				turn.ready.cancel();
			}
		}
		this._hostTurns.clear();
		this._nativeTurns.clear();
		this._pendingChildren.clear();
	}
}
