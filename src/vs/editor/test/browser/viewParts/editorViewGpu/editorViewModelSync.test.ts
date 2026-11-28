/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorViewModelSync } from '../../../../browser/viewParts/editorViewGpu/editorViewModelSync.js';

/**
 * Cross-checks {@link EditorViewModelSync} against a plain reference model.
 *
 * The `reference` arrays are the ground truth (what the view model looks like);
 * every simulated edit mutates them directly. The `mirror` holds, per line, the
 * content last sent to the renderer, or `undefined` for a line it does not have.
 * It changes only by executing the plans the planner produces and by
 * {@link Sim.send}, which sends lines the way `EditorViewGpu` does before the
 * renderer reads them. After each `sync()` the mirror must have the reference's
 * line count, and every line it holds must be current.
 */
class Sim {

	private readonly _sync = new EditorViewModelSync();

	// Ground-truth view model: text + a per-line token "signature".
	private readonly _refText: string[];
	private readonly _refSig: string[];

	// Renderer mirror: `text|signature` as sent, or `undefined` until sent.
	private _mirror: (string | undefined)[] = [];

	private _sigCounter = 0;

	constructor(initial: string[]) {
		this._refText = initial.slice();
		this._refSig = initial.map(() => this._nextSig());
	}

	private _nextSig(): string {
		return `s${this._sigCounter++}`;
	}

	private _reference(lineNumber: number): string {
		return `${this._refText[lineNumber - 1]}|${this._refSig[lineNumber - 1]}`;
	}

	public get lineCount(): number {
		return this._refText.length;
	}

	public planner(): EditorViewModelSync {
		return this._sync;
	}

	// --- simulated edits: mutate reference + notify planner -------------------

	public change(fromLineNumber: number, count: number): void {
		const to = fromLineNumber + count - 1;
		for (let line = fromLineNumber; line <= to; line++) {
			this._refText[line - 1] = `changed(${this._nextSig()})`;
			this._refSig[line - 1] = this._nextSig(); // a content change re-tokenizes
		}
		this._sync.onLinesChanged(fromLineNumber, count);
	}

	public insert(fromLineNumber: number, count: number): void {
		const newText: string[] = [];
		const newSig: string[] = [];
		for (let i = 0; i < count; i++) {
			newText.push(`inserted(${this._nextSig()})`);
			newSig.push(this._nextSig());
		}
		this._refText.splice(fromLineNumber - 1, 0, ...newText);
		this._refSig.splice(fromLineNumber - 1, 0, ...newSig);
		this._sync.onLinesInserted(fromLineNumber, fromLineNumber + count - 1);
	}

	public delete(fromLineNumber: number, count: number): void {
		this._refText.splice(fromLineNumber - 1, count);
		this._refSig.splice(fromLineNumber - 1, count);
		this._sync.onLinesDeleted(fromLineNumber, fromLineNumber + count - 1);
	}

	public tokens(fromLineNumber: number, toLineNumber: number): void {
		for (let line = fromLineNumber; line <= toLineNumber; line++) {
			this._refSig[line - 1] = this._nextSig();
		}
		this._sync.onTokensChanged([{ fromLineNumber, toLineNumber }], this._refText.length);
	}

	public flush(): void {
		this._sync.scheduleFullReload();
	}

	// --- plan execution -------------------------------------------------------

	public sync(): void {
		const plan = this._sync.takePlan();
		if (plan.fullReload) {
			this._mirror = new Array(this._refText.length).fill(undefined);
			return;
		}
		for (const splice of plan.structural) {
			this._mirror.splice(splice.start, splice.deleteCount, ...new Array(splice.insertCount).fill(undefined));
		}
		for (const line of plan.staleLines) {
			if (line >= 1 && line <= this._mirror.length) {
				this._mirror[line - 1] = undefined;
			}
		}
	}

	/** Send the 1-based lines `[from..to]` the mirror does not have, reading the final reference. */
	public send(from: number, to: number): void {
		for (let line = Math.max(1, from); line <= Math.min(to, this._mirror.length); line++) {
			this._mirror[line - 1] ??= this._reference(line);
		}
	}

	public get sentLineCount(): number {
		return this._mirror.filter(line => line !== undefined).length;
	}

	/** The mirror has the reference's line count and every line it holds is current. */
	public assertSynced(message?: string): void {
		const suffix = message ? `: ${message}` : '';
		assert.strictEqual(this._mirror.length, this._refText.length, `line count${suffix}`);
		for (let line = 1; line <= this._mirror.length; line++) {
			const sent = this._mirror[line - 1];
			if (sent !== undefined) {
				assert.strictEqual(sent, this._reference(line), `line ${line} is stale${suffix}`);
			}
		}
	}

	/** After sending every line, the mirror equals the reference. */
	public assertComplete(message?: string): void {
		this.send(1, this._mirror.length);
		this.assertSynced(message);
		assert.strictEqual(this.sentLineCount, this._refText.length, `unsent lines${message ? `: ${message}` : ''}`);
	}
}

suite('EditorViewModelSync', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state schedules a full reload, then a clean incremental state', () => {
		const sync = new EditorViewModelSync();
		assert.strictEqual(sync.pendingFullReload, true);
		const plan = sync.takePlan();
		assert.strictEqual(plan.fullReload, true);
		assert.strictEqual(sync.pendingFullReload, false);
		const next = sync.takePlan();
		assert.deepStrictEqual(next, { fullReload: false, structural: [], staleLines: [] });
	});

	test('a full reload sends no line until one is needed', () => {
		const sim = new Sim(['a', 'b', 'c', 'd']);
		sim.sync();
		sim.assertSynced();
		assert.strictEqual(sim.sentLineCount, 0);
		sim.send(2, 3);
		assert.strictEqual(sim.sentLineCount, 2);
		sim.assertComplete();
	});

	test('single-line content change -> one stale line', () => {
		const sim = new Sim(['a', 'b', 'c']);
		sim.sync();
		sim.change(2, 1);
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan, { fullReload: false, structural: [], staleLines: [2] });
	});

	test('token change -> stale lines (no structure)', () => {
		const sim = new Sim(['a', 'b', 'c', 'd']);
		sim.sync();
		sim.tokens(2, 3);
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan, { fullReload: false, structural: [], staleLines: [2, 3] });
	});

	test('content and token changes of one line mark it stale once', () => {
		const sim = new Sim(['a', 'b', 'c']);
		sim.sync();
		sim.tokens(2, 2);
		sim.change(2, 1);
		assert.deepStrictEqual(sim.planner().takePlan().staleLines, [2]);
	});

	test('insert emits a splice by count; the new lines are unsent', () => {
		const sim = new Sim(['a', 'b', 'c']);
		sim.sync();
		sim.send(1, 3);
		sim.insert(2, 2); // insert two lines before old line 2
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan, { fullReload: false, structural: [{ start: 1, deleteCount: 0, insertCount: 2 }], staleLines: [] });
	});

	test('delete emits a structural splice and no stale lines', () => {
		const sim = new Sim(['a', 'b', 'c', 'd']);
		sim.sync();
		sim.delete(2, 2);
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan, { fullReload: false, structural: [{ start: 1, deleteCount: 2, insertCount: 0 }], staleLines: [] });
	});

	test('a change is shifted by a later insert above it', () => {
		const sim = new Sim(['a', 'b', 'c', 'd', 'e']);
		sim.sync();
		sim.send(1, 5);
		sim.change(4, 1);   // line 4 goes stale
		sim.insert(2, 2);   // insert 2 lines at 2 -> old line 4 becomes line 6
		sim.sync();
		sim.assertSynced();
		sim.assertComplete();
	});

	test('a stale line removed by a later delete is dropped', () => {
		const sim = new Sim(['a', 'b', 'c', 'd', 'e']);
		sim.sync();
		sim.tokens(3, 3);   // line 3 goes stale
		sim.delete(3, 1);   // delete line 3
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan.staleLines, [], 'the deleted line is no longer stale');
		assert.strictEqual(plan.structural.length, 1);
	});

	test('interleaved insert + change + delete + tokens stays consistent', () => {
		const sim = new Sim(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']);
		sim.sync();
		sim.send(1, 6);
		sim.insert(2, 1);
		sim.change(5, 2);
		sim.delete(1, 1);
		sim.tokens(3, 4);
		sim.sync();
		sim.assertSynced();
		sim.assertComplete();
	});

	test('crossing 20,000 lines keeps the mirror incremental', () => {
		const sim = new Sim(Array.from({ length: 19_999 }, (_, i) => `line ${i}`));
		sim.sync();
		sim.send(19_950, 19_999);
		sim.insert(20_000, 3);
		sim.change(20_001, 2);
		sim.tokens(19_990, 20_002);
		assert.strictEqual(sim.planner().pendingFullReload, false);
		sim.sync();
		sim.assertSynced('after crossing former cap');

		sim.send(19_950, 20_002);
		sim.delete(19_999, 4);
		sim.sync();
		sim.assertSynced('after deleting across former cap');
		sim.assertComplete();
	});

	test('edits and token updates deep in a large document remain incremental', () => {
		const sync = new EditorViewModelSync();
		sync.takePlan();
		sync.onLinesChanged(100_001, 1);
		sync.onLinesInserted(100_002, 100_002);
		sync.onLinesDeleted(100_004, 100_004);
		sync.onTokensChanged([{ fromLineNumber: 100_001, toLineNumber: 100_003 }], 100_010);
		assert.deepStrictEqual(sync.takePlan(), {
			fullReload: false,
			structural: [
				{ start: 100_001, deleteCount: 0, insertCount: 1 },
				{ start: 100_003, deleteCount: 1, insertCount: 0 },
			],
			staleLines: [100_001, 100_002, 100_003],
		});
	});

	test('large document rebuilds and coalesced edits keep sent lines current', () => {
		const sim = new Sim(Array.from({ length: 100_010 }, (_, i) => `line ${i}`));
		sim.sync();
		sim.send(99_990, 100_010);
		sim.send(19_990, 20_010);
		sim.change(100_005, 2);
		sim.insert(19_999, 3);
		sim.delete(50_000, 2);
		sim.tokens(100_003, 100_011);
		sim.sync();
		sim.assertSynced('deep edits and shifted tokens');
		sim.flush();
		sim.sync();
		assert.strictEqual(sim.sentLineCount, 0, 'a full remap forgets every sent line');
		sim.assertComplete('full remap');
	});

	test('scheduleFullReload discards pending incremental work', () => {
		const sim = new Sim(['a', 'b', 'c']);
		sim.sync();
		sim.change(1, 1);
		sim.insert(2, 1);
		sim.flush(); // full reload supersedes the above
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan, { fullReload: true, structural: [], staleLines: [] });
	});

	test('empty plan when nothing changed', () => {
		const sim = new Sim(['a', 'b']);
		sim.sync();
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan, { fullReload: false, structural: [], staleLines: [] });
	});

	test('hasPendingChanges tracks whether takePlan would do work', () => {
		const sync = new EditorViewModelSync();
		// Starts dirty (initial full reload).
		assert.strictEqual(sync.hasPendingChanges, true);
		sync.takePlan();
		// Clean after consuming the plan; a redundant sync would be a no-op.
		assert.strictEqual(sync.hasPendingChanges, false);

		const sim = new Sim(['a', 'b', 'c']);
		sim.sync();
		assert.strictEqual(sim.planner().hasPendingChanges, false);

		// Each kind of pending work flips the flag; consuming it clears it.
		sim.change(2, 1);
		assert.strictEqual(sim.planner().hasPendingChanges, true);
		sim.planner().takePlan();
		assert.strictEqual(sim.planner().hasPendingChanges, false);

		sim.tokens(1, 1);
		assert.strictEqual(sim.planner().hasPendingChanges, true);
		sim.planner().takePlan();
		assert.strictEqual(sim.planner().hasPendingChanges, false);

		sim.insert(1, 1);
		assert.strictEqual(sim.planner().hasPendingChanges, true);
		sim.planner().takePlan();
		assert.strictEqual(sim.planner().hasPendingChanges, false);
	});

	test('randomized edits and partial sends never leave a sent line stale', () => {
		// Deterministic LCG so failures reproduce.
		let seed = 0x9e3779b9;
		const rnd = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			return seed / 0xffffffff;
		};
		const randInt = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

		for (let trial = 0; trial < 40; trial++) {
			const initial: string[] = [];
			for (let i = 0, n = randInt(1, 8); i < n; i++) {
				initial.push(`init${i}`);
			}
			const sim = new Sim(initial);
			sim.sync();
			sim.assertSynced(`trial ${trial} init`);

			for (let step = 0; step < 60; step++) {
				const len = sim.lineCount;
				const op = randInt(0, 5);
				if (op === 0 && len > 0) {
					const from = randInt(1, len);
					sim.change(from, randInt(1, Math.min(3, len - from + 1)));
				} else if (op === 1) {
					sim.insert(randInt(1, len + 1), randInt(1, 3));
				} else if (op === 2 && len > 0) {
					const from = randInt(1, len);
					sim.delete(from, randInt(1, Math.min(3, len - from + 1)));
				} else if (op === 3 && len > 0) {
					const from = randInt(1, len);
					sim.tokens(from, Math.min(from + randInt(0, 2), len));
				} else if (op === 4) {
					// Occasionally coalesce and verify mid-stream.
					sim.sync();
					sim.assertSynced(`trial ${trial} step ${step}`);
				} else if (op === 5) {
					// The renderer reads some lines: they are sent after a sync.
					sim.sync();
					const from = randInt(1, Math.max(1, sim.lineCount));
					sim.send(from, from + randInt(0, 3));
				}
			}
			sim.sync();
			sim.assertSynced(`trial ${trial} final`);
			sim.assertComplete(`trial ${trial} complete`);
		}
	});
});
