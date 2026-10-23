/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	compute4GramTextSimilarity,
	computeChunkedEditSurvival,
	computeChunkedFourGramSurvival,
	computeFractionPresentIn,
	computeWholeFileEditSurvival,
} from '../../../node/shared/editSurvivalTracker.js';

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

	suite('computeFractionPresentIn', () => {
		test('chunk fully present in current → 1', () => {
			const chunk = 'export function greet() { return "hello"; }\n';
			const file = '// header\n' + chunk + '// footer\n';
			assert.strictEqual(computeFractionPresentIn(chunk, file), 1);
		});

		test('chunk fully absent from current → 0', () => {
			const chunk = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx\n';
			const file = 'completely unrelated content here\n';
			assert.strictEqual(computeFractionPresentIn(chunk, file), 0);
		});

		test('partial overlap → fraction between 0 and 1', () => {
			const chunk = 'function add(a, b) { return a + b; }\n';
			const file = 'function add(a, b) { return a - b; }\n';
			const score = computeFractionPresentIn(chunk, file);
			assert.ok(score > 0.5 && score < 1, `expected fraction in (0.5, 1), got ${score}`);
		});

		test('empty chunk → 1', () => {
			assert.strictEqual(computeFractionPresentIn('', 'anything'), 1);
		});

		test('chunk shorter than 4 chars falls back to substring match', () => {
			assert.strictEqual(computeFractionPresentIn('ab', 'cabd'), 1);
			assert.strictEqual(computeFractionPresentIn('ab', 'cxd'), 0);
		});

		test('immune to file growth: score stays at 1 when content is appended', () => {
			const chunk = 'export function greet() { return "hello"; }\n';
			const small = chunk;
			const big = chunk + 'x'.repeat(10_000);
			assert.strictEqual(computeFractionPresentIn(chunk, small), 1);
			assert.strictEqual(computeFractionPresentIn(chunk, big), 1);
		});
	});

	suite('computeChunkedFourGramSurvival', () => {
		test('empty chunks → 0 (caller should branch and fall back)', () => {
			assert.strictEqual(computeChunkedFourGramSurvival([], 'file'), 0);
		});

		test('multiple chunks weighted by length', () => {
			// A long chunk fully present, a short chunk fully absent.
			// The long chunk should dominate, dragging the average up.
			const longChunk = 'a'.repeat(200);
			const shortChunk = 'xyz9'; // 4-gram absent from file
			const file = longChunk;
			const score = computeChunkedFourGramSurvival([longChunk, shortChunk], file);
			// long ≈ 200 ngrams * 1.0 + short ≈ 1 ngram * 0.0,
			// weighted: 200 / 201 ≈ 0.995
			assert.ok(score > 0.99, `expected near 1, got ${score}`);
		});

		test('all chunks fully present → 1', () => {
			const a = 'export const x = 1;\n';
			const b = 'export const y = 2;\n';
			const file = `// header\n${a}// mid\n${b}// footer\n`;
			assert.strictEqual(computeChunkedFourGramSurvival([a, b], file), 1);
		});

		test('scales linearly with chunks: file n-gram set is built once', () => {
			// Regression guard: a previous implementation rebuilt the
			// file n-gram set inside the per-chunk loop, making cost
			// O(|chunks| × |file|). With the set built once, scoring
			// 50 chunks against a 500 KB file should finish well
			// under a second on any developer machine.
			const file = 'x'.repeat(500_000);
			const chunks = Array.from({ length: 50 }, (_, i) => `chunk${i}-${'x'.repeat(40)}`);
			const start = Date.now();
			const score = computeChunkedFourGramSurvival(chunks, file);
			const elapsedMs = Date.now() - start;
			assert.ok(score >= 0 && score <= 1, `score out of range: ${score}`);
			assert.ok(elapsedMs < 1000, `expected < 1000ms, took ${elapsedMs}ms`);
		});
	});

	suite('computeChunkedEditSurvival', () => {
		test('falls back to whole-file scoring when chunks are empty', () => {
			const before = 'aaaaaaaaaaaaaaaaaaaa\n';
			const after = 'bbbbbbbbbbbbbbbbbbbb\n';
			const expected = computeWholeFileEditSurvival(before, after, after);
			const actual = computeChunkedEditSurvival(before, after, [], after);
			assert.deepStrictEqual(actual, expected);
		});

		test('fourGram from chunks, noRevert still from whole-file', () => {
			// File grows around the chunk — chunked fourGram stays at 1
			// while noRevert stays at 1 because the file did not move
			// back toward `before`.
			const before = '// empty\n';
			const chunk = 'export function greet() { return "hello"; }\n';
			const after = before + chunk;
			const current = after + '\n// later append\n';
			const scores = computeChunkedEditSurvival(before, after, [chunk], current);
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
			/**
			 * Optional explicit AI-written text chunks for this edit
			 * (the way the Claude observer extracts them from
			 * `Edit.new_string`, `MultiEdit.edits[*].new_string`, or
			 * `Write.content`). When provided, the simulation uses the
			 * chunked scoring path so the snapshot mirrors what the
			 * reporter would actually emit.
			 */
			readonly aiChunks?: readonly string[];
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
					const { fourGram, noRevert } = edit.aiChunks
						? computeChunkedEditSurvival(edit.before, edit.after, edit.aiChunks, currentText)
						: computeWholeFileEditSurvival(edit.before, edit.after, currentText);
					samples.push(`${round(fourGram)}/${round(noRevert)}`);
				}
				result.set(edit.id, samples);
			}
			return result;
		}

		test('two non-overlapping additions both survive (whole-file scoring)', () => {
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
				// This is the whole-file scoring artifact — chunked
				// scoring fixes it (see the chunked test below).
				e1: ['1/1', '0.8/1'],
				e2: ['1/1'],
			});
		});

		test('two non-overlapping additions both survive (chunked scoring)', () => {
			// Same scenario as above, but each edit now carries its
			// AI-written chunk (mirroring what `Edit.new_string` /
			// `Write.content` extraction passes through to the reporter).
			// The chunked path scores each edit against its own
			// AI-written text, so file growth elsewhere does not drag
			// the score down.
			const base = 'alpha\nbravo\ncharlie\n';
			const e1Chunk = 'delta added by e1\n';
			const e2Chunk = 'echo added by e2\n';
			const afterE1 = base + e1Chunk;
			const afterE2 = e2Chunk + afterE1;

			const samples = simulate([
				{ id: 'e1', before: base, after: afterE1, aiChunks: [e1Chunk] },
				{ id: 'e2', before: afterE1, after: afterE2, aiChunks: [e2Chunk] },
			]);

			assert.deepStrictEqual(Object.fromEntries(samples), {
				// e1's chunk is still entirely present after e2 lands
				// (it's just deeper in the file) → fourGram stays at 1.
				e1: ['1/1', '1/1'],
				e2: ['1/1'],
			});
		});

		test('write then edit that appends — write stays at 1 under chunked scoring', () => {
			// The motivating case: agent writes a file at T1, then a
			// later Edit appends new content. Whole-file scoring would
			// drag the Write's fourGram down because the file is now
			// bigger than what the Write produced; chunked scoring
			// keeps the Write at 1 because its content is still fully
			// present.
			const original = 'export function a() { return 1; }\n';
			const appended = 'export function b() { return 2; }\n';
			const afterWrite = original;
			const afterEdit = original + appended;

			const samples = simulate([
				{ id: 'write', before: '', after: afterWrite, aiChunks: [original] },
				{ id: 'edit', before: afterWrite, after: afterEdit, aiChunks: [appended] },
			]);

			assert.deepStrictEqual(Object.fromEntries(samples), {
				write: ['1/1', '1/1'],
				edit: ['1/1'],
			});
		});

		test('MultiEdit with several chunks survives a later unrelated append', () => {
			// MultiEdit lands three new functions. A subsequent Edit
			// appends a fourth function. Each MultiEdit chunk is still
			// fully present, so the length-weighted average stays at 1.
			const base = '// existing module\n';
			const chunkA = 'export function alpha() { return 1; }\n';
			const chunkB = 'export function bravo() { return 2; }\n';
			const chunkC = 'export function charlie() { return 3; }\n';
			const chunkD = 'export function delta() { return 4; }\n';
			const afterMulti = base + chunkA + chunkB + chunkC;
			const afterEdit = afterMulti + chunkD;

			const samples = simulate([
				{ id: 'multi', before: base, after: afterMulti, aiChunks: [chunkA, chunkB, chunkC] },
				{ id: 'edit', before: afterMulti, after: afterEdit, aiChunks: [chunkD] },
			]);

			assert.deepStrictEqual(Object.fromEntries(samples), {
				multi: ['1/1', '1/1'],
				edit: ['1/1'],
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
