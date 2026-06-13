/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { compute4GramTextSimilarity, computeWholeFileEditSurvival } from '../../../node/shared/editSurvivalTracker.js';

suite('agentHost editSurvivalTracker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('compute4GramTextSimilarity', () => {
		test('identical strings → 1', () => {
			assert.strictEqual(compute4GramTextSimilarity('hello world', 'hello world'), 1);
		});

		test('completely different strings → low score', () => {
			const score = compute4GramTextSimilarity('aaaaaaaa', 'bbbbbbbb');
			assert.ok(score < 0.1, `expected < 0.1, got ${score}`);
		});

		test('short inputs (<4 chars) fall back to equality', () => {
			assert.strictEqual(compute4GramTextSimilarity('ab', 'ab'), 1);
			assert.strictEqual(compute4GramTextSimilarity('ab', 'cd'), 0);
		});

		test('mostly-shared text scores high', () => {
			const a = 'function greet() { return "hello"; }';
			const b = 'function greet() { return "hello!"; }';
			const score = compute4GramTextSimilarity(a, b);
			assert.ok(score > 0.85, `expected > 0.85, got ${score}`);
		});
	});

	suite('computeWholeFileEditSurvival', () => {
		test('user kept AI output verbatim → 1/1', () => {
			const before = 'old line\n';
			const after = 'new line\n';
			const scores = computeWholeFileEditSurvival(before, after, after);
			assert.strictEqual(scores.fourGram, 1);
			assert.strictEqual(scores.noRevert, 1);
		});

		test('user fully reverted to original → low fourGram, low noRevert', () => {
			const before = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n';
			const after = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n';
			const scores = computeWholeFileEditSurvival(before, after, before);
			assert.ok(scores.fourGram < 0.2, `fourGram expected < 0.2, got ${scores.fourGram}`);
			assert.strictEqual(scores.noRevert, 0);
		});

		test('user refined AI output → fourGram lower, noRevert stays at 1', () => {
			const before = 'function add(a, b) { return a + b; }\n';
			const after = 'function add(a: number, b: number): number { return a + b; }\n';
			const current = 'function add(a: number, b: number): number {\n\treturn a + b;\n}\n';
			const scores = computeWholeFileEditSurvival(before, after, current);
			assert.ok(scores.fourGram > 0.5 && scores.fourGram < 1, `fourGram expected mid-range, got ${scores.fourGram}`);
			// Refinement diverges from AI text but stays equally far from
			// the original — should not be counted as a revert.
			assert.strictEqual(scores.noRevert, 1);
		});

		test('AI produced same text as before → noRevert defaults to 1', () => {
			const text = 'unchanged\n';
			const scores = computeWholeFileEditSurvival(text, text, text);
			assert.strictEqual(scores.fourGram, 1);
			assert.strictEqual(scores.noRevert, 1);
		});
	});

	suite('multi-tracker scenarios', () => {
		// Each scenario simulates several reporters running concurrently
		// against the same file, the way the agent host launches one
		// per `takeCompletedEdit`. We snapshot the scores each reporter
		// would compute at every subsequent file state — i.e. what
		// telemetry would show across the 7 timer ticks if those ticks
		// landed at the corresponding file states.
		//
		// Each table cell is `fourGram/noRevert`, both rounded to 2dp.

		interface IEdit {
			readonly id: string;
			/** File content right before this edit landed. */
			readonly before: string;
			/** File content right after this edit landed. */
			readonly after: string;
		}

		function round(n: number): number {
			return Math.round(n * 100) / 100;
		}

		/**
		 * For each edit, sample its survival scores against every later
		 * file state (the state when that edit completed, then each
		 * state produced by subsequent edits). Returns a `Map<editId, scores[]>`
		 * where `scores[i]` is the score the reporter for `editId` would
		 * emit if a timer tick landed on file state `i` (counting from
		 * when that edit completed).
		 */
		function simulate(edits: ReadonlyArray<IEdit>): Map<string, ReadonlyArray<string>> {
			const result = new Map<string, string[]>();
			for (let i = 0; i < edits.length; i++) {
				const edit = edits[i];
				const samples: string[] = [];
				// The reporter samples at t=0 (its own `after`) and then
				// at each later edit's `after`.
				const stream = [edit.after, ...edits.slice(i + 1).map(e => e.after)];
				for (const currentText of stream) {
					const { fourGram, noRevert } = computeWholeFileEditSurvival(edit.before, edit.after, currentText);
					samples.push(`${round(fourGram)}/${round(noRevert)}`);
				}
				result.set(edit.id, samples);
			}
			return result;
		}

		test('two non-overlapping additions both survive', () => {
			// Agent adds a line at the bottom, then adds another at the
			// top. Neither edit disturbs the other's content.
			const base = 'alpha\nbravo\ncharlie\n';
			const afterE1 = base + 'delta added by e1\n';
			const afterE2 = 'echo added by e2\n' + afterE1;

			const samples = simulate([
				{ id: 'e1', before: base, after: afterE1 },
				{ id: 'e2', before: afterE1, after: afterE2 },
			]);

			assert.deepStrictEqual(Object.fromEntries(samples), {
				// e1: t=0 perfect. After e2 lands, e1's added line is
				// still present (noRevert=1) but the file has *more*
				// text than e1 wrote, so the fourGram ratio falls.
				// This is a whole-file scoring artifact — region-aware
				// scoring would still report 1 here.
				e1: ['1/1', '0.8/1'],
				e2: ['1/1'],
			});
		});

		test('add a line, then modify the same line — fourGram drops, noRevert stays high', () => {
			const base = 'alpha\nbravo\ncharlie\n';
			const afterE1 = base + 'delta the original\n';
			const afterE2 = base + 'delta after edit two changed it\n';

			const samples = simulate([
				{ id: 'e1', before: base, after: afterE1 },
				{ id: 'e2', before: afterE1, after: afterE2 },
			]);

			assert.deepStrictEqual(Object.fromEntries(samples), {
				// e1: at t=0 perfect; once e2 lands the modified line
				// is no longer e1's text → fourGram drops. noRevert
				// holds at 1 because the file did not move back toward
				// `base`, it moved further away.
				e1: ['1/1', '0.54/1'],
				e2: ['1/1'],
			});
		});

		test('change a line, add a line, delete a line — mixed survival', () => {
			// Three disjoint edits in different regions. The final file
			// reflects all three; everyone should look healthy.
			const base = 'first\nsecond\nthird\nfourth\nfifth\n';
			const afterE1 = 'first\nSECOND CHANGED\nthird\nfourth\nfifth\n';
			const afterE2 = afterE1 + 'sixth added\n';
			const afterE3 = 'first\nSECOND CHANGED\nthird\nfifth\nsixth added\n'; // 'fourth' removed

			const samples = simulate([
				{ id: 'e1-change', before: base, after: afterE1 },
				{ id: 'e2-add', before: afterE1, after: afterE2 },
				{ id: 'e3-delete', before: afterE2, after: afterE3 },
			]);

			assert.deepStrictEqual(Object.fromEntries(samples), {
				// All three edits keep noRevert at 1 throughout — none
				// of the later edits pulled the file back toward an
				// earlier `before` state. fourGram for the earlier
				// edits drops as later edits add or remove content
				// elsewhere in the file (whole-file scoring is not
				// region-aware).
				'e1-change': ['1/1', '0.86/1', '0.73/1'],
				'e2-add': ['1/1', '0.9/1'],
				'e3-delete': ['1/1'],
			});
		});

		test('agent supersedes its own work — first reporter falsely reports a revert', () => {
			// This is the failure mode observed in production telemetry:
			// e1 shrinks the file, e2 replaces it with the original
			// content. e1's reporter cannot tell the difference between
			// "user reverted" and "next AI edit overwrote me" → noRevert
			// collapses to 0 even though the user never touched it.
			const original = 'line one\nline two\nline three\nline four\n';
			const shrunken = 'line one\nline two\n';

			const samples = simulate([
				{ id: 'e1-shrink', before: original, after: shrunken },
				{ id: 'e2-restore', before: shrunken, after: original },
			]);

			assert.deepStrictEqual(Object.fromEntries(samples), {
				// e1 at t=0: identical to its `after` → 1/1.
				// e1 after e2 lands: current ≡ original ≡ e1's `before`
				// → noRevert collapses to 0. fourGram is the similarity
				// between e1's `after` (shrunken) and the restored file,
				// which still overlaps on the first two lines.
				'e1-shrink': ['1/1', '0.59/0'],
				'e2-restore': ['1/1'],
			});
		});

		test('user refines after AI edit — noRevert holds at 1', () => {
			// One AI edit, then the user tweaks the added text. The
			// refinement does not move content back toward `before`.
			const base = 'function add(a, b) { return a + b; }\n';
			const afterAI = 'function add(a: number, b: number): number { return a + b; }\n';
			const afterUser = 'function add(a: number, b: number): number {\n\treturn a + b;\n}\n';

			const samples = simulate([
				{ id: 'ai-edit', before: base, after: afterAI },
				// Treat the user refinement as a synthetic "edit" so
				// simulate() advances the reporter through that state.
				{ id: 'user-refine', before: afterAI, after: afterUser },
			]);

			const aiSamples = samples.get('ai-edit')!;
			assert.strictEqual(aiSamples[0], '1/1', 'AI edit perfect at t=0');
			// After the user refines, fourGram drops a bit but noRevert
			// stays at 1 because the file moved further from `base`,
			// not back toward it.
			const [fg, nr] = aiSamples[1].split('/').map(Number);
			assert.ok(fg > 0.4 && fg < 1, `expected fourGram in (0.4, 1), got ${fg}`);
			assert.strictEqual(nr, 1, 'noRevert should remain 1 after a refinement');
		});

		test('user fully reverts after AI edit — both scores drop', () => {
			const before = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n';
			const after = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n';

			const samples = simulate([
				{ id: 'ai-edit', before, after },
				// User reverts to original.
				{ id: 'user-revert', before: after, after: before },
			]);

			const aiSamples = samples.get('ai-edit')!;
			assert.strictEqual(aiSamples[0], '1/1');
			const [fg, nr] = aiSamples[1].split('/').map(Number);
			assert.ok(fg < 0.2, `expected fourGram < 0.2 after revert, got ${fg}`);
			assert.strictEqual(nr, 0, 'noRevert should be 0 after a full revert');
		});
	});
});
