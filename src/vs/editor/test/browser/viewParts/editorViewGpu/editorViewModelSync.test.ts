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
 * every simulated edit mutates them directly. The `mirror` arrays start empty and
 * are updated **only** by executing the plan the planner produces — inserting
 * placeholders for structural inserts and reading final content for dirty lines,
 * exactly as `EditorViewGpu` does at present time. After each `sync()` the mirror
 * must equal the complete reference document.
 */
class Sim {

	private readonly _sync: EditorViewModelSync;

	// Ground-truth view model: text + a per-line token "signature".
	private _refText: string[];
	private _refSig: string[];

	// Renderer mirror, only ever mutated by executing plans.
	private _mirText: string[] = [];
	private _mirSig: string[] = [];

	private _sigCounter = 0;

	constructor(initial: string[]) {
		this._sync = new EditorViewModelSync();
		this._refText = initial.slice();
		this._refSig = initial.map(() => this._nextSig());
	}

	private _nextSig(): string {
		return `s${this._sigCounter++}`;
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
			this._mirText = this._refText.slice();
			this._mirSig = this._refSig.slice();
			return;
		}
		for (const delta of plan.structural) {
			assert.strictEqual(delta.type, 'replaceLines', 'structural deltas must be replaceLines');
			if (delta.type === 'replaceLines') {
				const placeholderText = delta.insert.map(l => l.text); // planner inserts empty placeholders
				const placeholderSig = delta.insert.map(() => '<placeholder>');
				this._mirText.splice(delta.start, delta.deleteCount, ...placeholderText);
				this._mirSig.splice(delta.start, delta.deleteCount, ...placeholderSig);
			}
		}
		// Content refresh reads final text + tokens (present-time, final coords).
		for (const line of plan.contentLines) {
			if (line >= 1 && line <= this._mirText.length) {
				this._mirText[line - 1] = this._refText[line - 1];
				this._mirSig[line - 1] = this._refSig[line - 1];
			}
		}
		// Token-only refresh reads final tokens.
		for (const line of plan.tokenLines) {
			if (line >= 1 && line <= this._mirSig.length) {
				this._mirSig[line - 1] = this._refSig[line - 1];
			}
		}
	}

	public assertSynced(message?: string): void {
		assert.deepStrictEqual(this._mirText, this._refText, `text mismatch${message ? ': ' + message : ''}`);
		assert.deepStrictEqual(this._mirSig, this._refSig, `token mismatch${message ? ': ' + message : ''}`);
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
		assert.deepStrictEqual(next, { fullReload: false, structural: [], contentLines: [], tokenLines: [] });
	});

	test('single-line content change -> one content refresh', () => {
		const sim = new Sim(['a', 'b', 'c']);
		sim.sync(); // initial full reload
		sim.assertSynced('after initial load');

		sim.change(2, 1);
		const plan = sim.planner().takePlan();
		assert.strictEqual(plan.fullReload, false);
		assert.deepStrictEqual(plan.structural, []);
		assert.deepStrictEqual(plan.contentLines, [2]);
		assert.deepStrictEqual(plan.tokenLines, []);
	});

	test('token change -> token-only refresh (no content, no structure)', () => {
		const sim = new Sim(['a', 'b', 'c', 'd']);
		sim.sync();
		sim.tokens(2, 3);
		const plan = sim.planner().takePlan();
		assert.strictEqual(plan.fullReload, false);
		assert.deepStrictEqual(plan.structural, []);
		assert.deepStrictEqual(plan.contentLines, []);
		assert.deepStrictEqual(plan.tokenLines, [2, 3]);
	});

	test('content dirty wins over token dirty for the same line', () => {
		const sim = new Sim(['a', 'b', 'c']);
		sim.sync();
		sim.tokens(2, 2);
		sim.change(2, 1);
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan.contentLines, [2]);
		assert.deepStrictEqual(plan.tokenLines, [], 'line 2 is covered by the content refresh');
	});

	test('insert emits a placeholder splice + content refresh of the new lines', () => {
		const sim = new Sim(['a', 'b', 'c']);
		sim.sync();
		sim.insert(2, 2); // insert two lines before old line 2
		const plan = sim.planner().takePlan();
		assert.strictEqual(plan.structural.length, 1);
		const delta = plan.structural[0];
		assert.strictEqual(delta.type, 'replaceLines');
		if (delta.type === 'replaceLines') {
			assert.strictEqual(delta.start, 1);
			assert.strictEqual(delta.deleteCount, 0);
			assert.deepStrictEqual(delta.insert, [{ text: '', tokens: [] }, { text: '', tokens: [] }]);
		}
		assert.deepStrictEqual(plan.contentLines, [2, 3]);
	});

	test('delete emits a structural splice and no content refresh', () => {
		const sim = new Sim(['a', 'b', 'c', 'd']);
		sim.sync();
		sim.delete(2, 2);
		const plan = sim.planner().takePlan();
		assert.strictEqual(plan.structural.length, 1);
		const delta = plan.structural[0];
		assert.strictEqual(delta.type, 'replaceLines');
		if (delta.type === 'replaceLines') {
			assert.strictEqual(delta.start, 1);
			assert.strictEqual(delta.deleteCount, 2);
			assert.deepStrictEqual(delta.insert, []);
		}
		assert.deepStrictEqual(plan.contentLines, []);
		assert.deepStrictEqual(plan.tokenLines, []);
	});

	test('a change is shifted by a later insert above it', () => {
		const sim = new Sim(['a', 'b', 'c', 'd', 'e']);
		sim.sync();
		sim.change(4, 1);   // mark line 4 dirty
		sim.insert(2, 2);   // insert 2 lines at 2 -> old line 4 becomes line 6
		sim.sync();
		sim.assertSynced();
	});

	test('a dirty line removed by a later delete is dropped', () => {
		const sim = new Sim(['a', 'b', 'c', 'd', 'e']);
		sim.sync();
		sim.tokens(3, 3);   // mark line 3 token-dirty
		sim.delete(3, 1);   // delete line 3
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan.tokenLines, [], 'the deleted line is no longer dirty');
		assert.strictEqual(plan.structural.length, 1);
	});

	test('interleaved insert + change + delete + tokens stays consistent', () => {
		const sim = new Sim(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']);
		sim.sync();
		sim.insert(2, 1);
		sim.change(5, 2);
		sim.delete(1, 1);
		sim.tokens(3, 4);
		sim.sync();
		sim.assertSynced();
	});

	test('crossing 20,000 lines keeps the complete mirror incremental', () => {
		const sim = new Sim(Array.from({ length: 19_999 }, (_, i) => `line ${i}`));
		sim.sync();
		sim.insert(20_000, 3);
		sim.change(20_001, 2);
		sim.tokens(20_000, 20_002);
		assert.strictEqual(sim.planner().pendingFullReload, false);
		sim.sync();
		sim.assertSynced('after crossing former cap');

		sim.delete(19_999, 4);
		sim.sync();
		sim.assertSynced('after deleting across former cap');
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
				{ type: 'replaceLines', start: 100_001, deleteCount: 0, insert: [{ text: '', tokens: [] }] },
				{ type: 'replaceLines', start: 100_003, deleteCount: 1, insert: [] },
			],
			contentLines: [100_001, 100_002],
			tokenLines: [100_003],
		});
	});

	test('large document rebuilds and coalesced edits preserve every line', () => {
		const sim = new Sim(Array.from({ length: 100_010 }, (_, i) => `line ${i}`));
		sim.sync();
		sim.assertSynced('initial full document');
		sim.change(100_005, 2);
		sim.insert(19_999, 3);
		sim.delete(50_000, 2);
		sim.tokens(100_003, 100_011);
		sim.sync();
		sim.assertSynced('deep edits and shifted tokens');
		sim.flush();
		sim.sync();
		sim.assertSynced('full remap');
	});

	test('scheduleFullReload discards pending incremental work', () => {
		const sim = new Sim(['a', 'b', 'c']);
		sim.sync();
		sim.change(1, 1);
		sim.insert(2, 1);
		sim.flush(); // full reload supersedes the above
		const plan = sim.planner().takePlan();
		assert.strictEqual(plan.fullReload, true);
		assert.deepStrictEqual(plan.structural, []);
		assert.deepStrictEqual(plan.contentLines, []);
		assert.deepStrictEqual(plan.tokenLines, []);
	});

	test('empty plan when nothing changed', () => {
		const sim = new Sim(['a', 'b']);
		sim.sync();
		const plan = sim.planner().takePlan();
		assert.deepStrictEqual(plan, { fullReload: false, structural: [], contentLines: [], tokenLines: [] });
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

	test('randomized edit sequences keep the mirror in sync with the reference', () => {
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
				const op = randInt(0, 4);
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
				}
			}
			sim.sync();
			sim.assertSynced(`trial ${trial} final`);
		}
	});
});
