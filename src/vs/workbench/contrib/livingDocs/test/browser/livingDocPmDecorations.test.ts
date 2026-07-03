/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseLivingDoc } from '../../common/livingDocMarkdown.js';
import { IProposedChange } from '../../common/livingDocsModel.js';
import { buildPmDecorationSpec, wordDiffSegments } from '../../common/livingDocPmDecorations.js';

// A living document with a plain prose block (an editable target), a bound block, and headings, so the
// decoration mapping can be exercised against a realistic ProseMirror-backed surface.
const DOC_MD = [
	'---',
	'title: Weekly Summary',
	'sources:',
	'  - metrics.csv',
	'---',
	'',
	'## Highlights',
	'',
	'Revenue grew fast this week.',
	'',
	'Margins held [40%](bind:metrics.margin) steady.',
].join('\n') + '\n';

function change(overrides: Partial<IProposedChange>): IProposedChange {
	return {
		id: 'c1', docId: 'doc', docTitle: 'Weekly Summary', blockId: '', blockLabel: '',
		oldText: '', newText: '', kind: 'meaning', confidence: 0.85, rationale: '', sourceCells: [],
		...overrides,
	};
}

suite('LivingDoc PM decoration mapping', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a word diff splits into eq/del/ins runs with run counts', () => {
		const diff = wordDiffSegments('Revenue grew fast this week.', 'Revenue dropped sharply this week.');
		assert.deepStrictEqual(diff, {
			segments: [
				{ t: 'eq', text: 'Revenue' },
				{ t: 'del', text: 'grew fast' },
				{ t: 'ins', text: 'dropped sharply' },
				{ t: 'eq', text: 'this week.' },
			],
			added: 1,
			removed: 1,
		});
	});

	test('a meaning-change proposal maps to one edit decoration anchored on the block text', () => {
		const doc = parseLivingDoc(DOC_MD);
		const block = doc.blocks.find(b => b.text.startsWith('Revenue'))!;
		const pending = [change({ blockId: block.id, oldText: block.text, newText: 'Revenue dropped sharply this week.' })];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.strictEqual(spec.edits.length, 1);
		assert.strictEqual(spec.inserts.length, 0);
		assert.deepStrictEqual(spec.edits[0], {
			id: 'c1',
			anchorText: 'Revenue grew fast this week.',
			segments: [
				{ t: 'eq', text: 'Revenue' },
				{ t: 'del', text: 'grew fast' },
				{ t: 'ins', text: 'dropped sharply' },
				{ t: 'eq', text: 'this week.' },
			],
			added: 1,
			removed: 1,
			source: 'metrics.csv',
			confidence: 0.85,
		});
	});

	test('a wrapped (multi-line) paragraph anchor is whitespace-collapsed so it matches the rendered node text', () => {
		// House style wraps each sentence on its own physical line. CommonMark renders soft wraps as single
		// spaces, so the live ProseMirror node's textContent is single-spaced. The decoration bundle places
		// the inline diff by EXACT match of anchorText against that textContent, so the anchor must collapse
		// its internal whitespace too - otherwise a wrapped paragraph never decorates and the change shows
		// only in the rail (the plan-19 baseline bug).
		const wrappedMd = [
			'## Visual identity',
			'',
			'The primary colour is blue. It anchors the logo, primary buttons, and',
			'links across every surface. The blue is reserved for the single most',
			'important action on a screen.',
		].join('\n') + '\n';
		const doc = parseLivingDoc(wrappedMd);
		const block = doc.blocks.find(b => b.text.startsWith('The primary colour'))!;
		// Sanity: the parsed block text really does carry the hard newlines from the wrapped source.
		assert.ok(block.text.includes('\n'), 'expected the wrapped block text to contain newlines');

		const pending = [change({ blockId: block.id, oldText: block.text, newText: 'The primary colour is red.' })];
		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.strictEqual(spec.edits.length, 1);
		assert.strictEqual(
			spec.edits[0].anchorText,
			'The primary colour is blue. It anchors the logo, primary buttons, and links across every surface. The blue is reserved for the single most important action on a screen.',
		);
		assert.ok(!spec.edits[0].anchorText.includes('\n'), 'anchorText must not contain newlines');
	});

	test('a generative insert maps to an insert decoration anchored after its heading', () => {
		const doc = parseLivingDoc(DOC_MD);
		const heading = doc.blocks.find(b => b.type === 'heading')!;
		const pending = [change({
			id: 'c2', insert: true, afterBlockId: heading.id, blockLabel: 'Highlights',
			oldText: '', newText: '* one\n* two',
		})];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.strictEqual(spec.edits.length, 0);
		assert.deepStrictEqual(spec.inserts, [{
			id: 'c2',
			afterText: 'Highlights',
			newText: '* one\n* two',
			blockLabel: 'Highlights',
			confidence: 0.85,
		}]);
	});

	test('an insert with no anchor block targets the end of the document', () => {
		const doc = parseLivingDoc(DOC_MD);
		const pending = [change({ id: 'c3', insert: true, afterBlockId: '', blockLabel: 'the end', newText: 'A closing note.' })];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.strictEqual(spec.inserts[0].afterText, null);
	});

	test('bound blocks become dot gutter markers carrying their bind keys and recent flag', () => {
		const doc = parseLivingDoc(DOC_MD);
		const bound = doc.blocks.find(b => b.binds.length > 0)!;

		const spec = buildPmDecorationSpec(doc, [], new Set([bound.id]));

		assert.deepStrictEqual(spec.gutters, [{ kind: 'dot', keys: ['metrics.margin'], recent: true }]);
	});

	test('a multi-line edited paragraph adds a bar gutter marker anchored on the block text', () => {
		// A wrapped (multi-physical-line) paragraph under a pending meaning-change should get an
		// `attention` bar spanning its rows, anchored by the same whitespace-collapsed text the edit
		// widget uses so the bundle can resolve the same node.
		const wrappedMd = [
			'## Visual identity',
			'',
			'The primary colour is blue. It anchors the logo, primary buttons, and',
			'links across every surface. The blue is reserved for the single most',
			'important action on a screen.',
		].join('\n') + '\n';
		const doc = parseLivingDoc(wrappedMd);
		const block = doc.blocks.find(b => b.text.startsWith('The primary colour'))!;
		const pending = [change({ blockId: block.id, oldText: block.text, newText: 'The primary colour is red.' })];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.deepStrictEqual(spec.gutters, [{
			kind: 'bar',
			anchorText: 'The primary colour is blue. It anchors the logo, primary buttons, and links across every surface. The blue is reserved for the single most important action on a screen.',
		}]);
	});

	test('a single-line edited paragraph does NOT add a bar (a bar is only for multi-line edits)', () => {
		// The single-line "Revenue" block is under a pending edit but has no hard newlines, so no bar is
		// produced. (DOC_MD's bound block still contributes its dot, so we assert specifically no bar.)
		const doc = parseLivingDoc(DOC_MD);
		const block = doc.blocks.find(b => b.text.startsWith('Revenue'))!;
		const pending = [change({ blockId: block.id, oldText: block.text, newText: 'Revenue dropped sharply this week.' })];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.deepStrictEqual(spec.gutters.filter(g => g.kind === 'bar'), []);
	});

	test('a bound block that is also being edited keeps its dot and does not double up', () => {
		// The bound "Margins held ..." block is single-line, so an edit on it yields no bar; the
		// source-bound dot must still be present exactly once.
		const doc = parseLivingDoc(DOC_MD);
		const bound = doc.blocks.find(b => b.binds.length > 0)!;
		const pending = [change({ blockId: bound.id, oldText: bound.text, newText: 'Margins held [45%](bind:metrics.margin) steady.' })];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.deepStrictEqual(spec.gutters, [{ kind: 'dot', keys: ['metrics.margin'], recent: false }]);
	});

	test('a multi-line source-bound block under a pending edit emits both a dot and a bar', () => {
		// A wrapped paragraph that is ALSO source-bound should produce a dot (from its binds) AND a bar
		// (from the multi-line pending edit). The dot and bar have independent anchoring -- the dot marks
		// provenance, the bar marks the edit extent -- so both must be present with no crash or double-up.
		const multiLineBoundMd = [
			'---',
			'title: Campaign Brief',
			'sources:',
			'  - brand.csv',
			'---',
			'',
			'## Identity',
			'',
			'The primary colour is [blue](bind:brand.colour). It anchors the logo, primary buttons, and',
			'links across every touchpoint. The blue is reserved for the single most',
			'important action on a screen.',
		].join('\n') + '\n';
		const doc = parseLivingDoc(multiLineBoundMd);
		const bound = doc.blocks.find(b => b.binds.length > 0)!;
		// Sanity: the block really is both bound and multi-line.
		assert.ok(bound.binds.length > 0, 'expected a bound block');
		assert.ok(bound.text.includes('\n'), 'expected a multi-line block');

		const pending = [change({ blockId: bound.id, oldText: bound.text, newText: 'The primary colour is red.' })];
		const spec = buildPmDecorationSpec(doc, pending, new Set([bound.id]));

		// One edit decoration (the meaning-change).
		assert.strictEqual(spec.edits.length, 1);
		// The gutter must have exactly one dot (from binds) and one bar (from the multi-line edit).
		const dots = spec.gutters.filter(g => g.kind === 'dot');
		const bars = spec.gutters.filter(g => g.kind === 'bar');
		assert.deepStrictEqual(dots, [{ kind: 'dot', keys: ['brand.colour'], recent: true }]);
		assert.strictEqual(bars.length, 1);
		assert.ok(!bars[0].anchorText.includes('\n'), 'bar anchorText must be whitespace-collapsed');
	});
});
