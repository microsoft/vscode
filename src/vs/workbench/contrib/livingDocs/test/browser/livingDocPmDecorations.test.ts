/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseLivingDoc } from '../../common/livingDocMarkdown.js';
import { emptyLock, ILivingDocLock, IProposedChange } from '../../common/livingDocsModel.js';
import { buildPmDecorationSpec, buildFigureProvenance, relativeSyncedLabel, wordDiffSegments } from '../../common/livingDocPmDecorations.js';

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
			kind: 'meaning',
			rationale: '',
			newText: 'Revenue dropped sharply this week.',
		});
	});

	test('an edit decoration carries the rationale, kind, proposed text and a real source line (plan 31 iter 2)', () => {
		const doc = parseLivingDoc(DOC_MD);
		const block = doc.blocks.find(b => b.text.startsWith('Revenue'))!;
		const pending = [change({
			blockId: block.id, oldText: block.text, newText: 'Revenue dropped sharply this week.',
			kind: 'meaning', confidence: 0.6, rationale: 'The CSV shows revenue fell 12% week-on-week.', sourceLine: 12,
		})];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.strictEqual(spec.edits.length, 1);
		assert.strictEqual(spec.edits[0].kind, 'meaning');
		assert.strictEqual(spec.edits[0].rationale, 'The CSV shows revenue fell 12% week-on-week.');
		assert.strictEqual(spec.edits[0].newText, 'Revenue dropped sharply this week.');
		assert.strictEqual(spec.edits[0].sourceLine, 12);
	});

	test('an edit decoration omits sourceLine when the change carries no real line (never fabricated)', () => {
		const doc = parseLivingDoc(DOC_MD);
		const block = doc.blocks.find(b => b.text.startsWith('Revenue'))!;
		const pending = [change({ blockId: block.id, oldText: block.text, newText: 'Revenue dropped sharply this week.' })];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.strictEqual(spec.edits[0].sourceLine, undefined);
	});

	test('an insertion decoration carries its rationale, kind and proposed text (plan 31 iter 2)', () => {
		const doc = parseLivingDoc(DOC_MD);
		const pending = [change({
			id: 'ins1', insert: true, afterBlockId: '', newText: '- One\n- Two', blockLabel: 'the end',
			kind: 'meaning', rationale: 'A short list requested in chat.',
		})];

		const spec = buildPmDecorationSpec(doc, pending, new Set());

		assert.strictEqual(spec.inserts.length, 1);
		assert.strictEqual(spec.inserts[0].kind, 'meaning');
		assert.strictEqual(spec.inserts[0].rationale, 'A short list requested in chat.');
		assert.strictEqual(spec.inserts[0].sourceLine, undefined);
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
			kind: 'meaning',
			rationale: '',
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

	// The anchor-layer of the decision-68 fix (plan 31 iter 1): when a change targets one item of a list
	// block, the decoration must anchor + diff at that single item, never spanning the whole list (which
	// would draw the sibling items as deletions and imply they will be destroyed on approve).
	suite('list-item edit anchoring (decision-68)', () => {
		const LIST_MD = [
			'## Growth levers',
			'',
			'- Expand the free trial to thirty days',
			'- Win back recently churned accounts',
			'- Launch an annual billing plan',
			'- Improve onboarding activation',
		].join('\n') + '\n';

		test('a single-item list edit anchors on that <li> and never draws siblings as deletions', () => {
			const doc = parseLivingDoc(LIST_MD);
			const listBlock = doc.blocks.find(b => b.text.startsWith('- Expand'))!;
			// The pre-fix change shape: oldText is the WHOLE list block, newText is the one rewritten item.
			const pending = [change({
				blockId: listBlock.id,
				oldText: listBlock.text,
				newText: '- Win back recently churned accounts with a targeted email campaign',
			})];

			const spec = buildPmDecorationSpec(doc, pending, new Set());

			assert.strictEqual(spec.edits.length, 1);
			// Anchor is the single targeted item, not the whole four-item block.
			assert.strictEqual(spec.edits[0].anchorText, '- Win back recently churned accounts');
			// No sibling word is shown as deleted (they must survive an approve, so they are not in the diff).
			const deleted = spec.edits[0].segments.filter(s => s.t === 'del').map(s => s.text).join(' ');
			for (const sibling of ['Expand', 'trial', 'annual', 'billing', 'onboarding', 'activation']) {
				assert.ok(!deleted.includes(sibling), `sibling word "${sibling}" must not appear in a deletion segment (got: ${deleted})`);
			}
			// A single <li> is one line, so no multi-row bar is produced for it.
			assert.deepStrictEqual(spec.gutters.filter(g => g.kind === 'bar'), []);
		});

		test('an already-scoped single-item change anchors on the item unchanged', () => {
			const doc = parseLivingDoc(LIST_MD);
			const listBlock = doc.blocks.find(b => b.text.startsWith('- Expand'))!;
			const pending = [change({
				blockId: listBlock.id,
				oldText: '- Launch an annual billing plan',
				newText: '- Launch an annual and a monthly billing plan',
			})];

			const spec = buildPmDecorationSpec(doc, pending, new Set());
			assert.strictEqual(spec.edits[0].anchorText, '- Launch an annual billing plan');
		});
	});

	// Hover provenance (plan 29 iter 3): the lock's binding ledger projected into the per-key tooltip data.
	suite('figure hover provenance', () => {
		const NOW = Date.parse('2026-07-06T12:00:00Z');
		function lockWith(bindings: ILivingDocLock['bindings']): ILivingDocLock {
			return { ...emptyLock(), bindings };
		}

		test('a fresh file binding projects source, cell, relative sync and fresh:true', () => {
			const lock = lockWith({
				'metrics.mrr': { resolved: '$48.6k', source: 'metrics.csv#mrr', sourceHash: 'a1', syncedAt: '2026-07-06T10:00:00Z', appliedBy: 'agent', kind: 'figure' },
			});
			const prov = buildFigureProvenance(lock, new Set(), NOW);
			assert.deepStrictEqual(prov, [{ key: 'metrics.mrr', source: 'metrics.csv', location: 'mrr', synced: 'Synced 2 h ago', fresh: true }]);
		});

		test('a binding in the stale set reports fresh:false so the tooltip shows the amber line', () => {
			const lock = lockWith({
				'metrics.mrr': { resolved: '$48.6k', source: 'metrics.csv#mrr', sourceHash: 'a1', syncedAt: '2026-07-06T11:30:00Z', appliedBy: 'agent', kind: 'figure' },
			});
			const prov = buildFigureProvenance(lock, new Set(['metrics.mrr']), NOW);
			assert.strictEqual(prov[0].fresh, false);
			assert.strictEqual(prov[0].synced, 'Synced 30 min ago');
		});

		test('a source with no cell qualifier yields an empty location; a never-synced entry reads "Not yet synced"', () => {
			const lock = lockWith({
				'pipeline@mcp:demo.query/total': { resolved: '128,000', source: 'demo.query', sourceHash: 'b2', syncedAt: '', appliedBy: 'agent', kind: 'figure' },
			});
			const prov = buildFigureProvenance(lock, new Set(), NOW);
			assert.deepStrictEqual(prov, [{ key: 'pipeline@mcp:demo.query/total', source: 'demo.query', location: '', synced: 'Not yet synced', fresh: true }]);
		});

		test('relativeSyncedLabel is truthful across buckets and never fabricates on a missing time', () => {
			assert.strictEqual(relativeSyncedLabel(undefined, NOW), 'Not yet synced');
			assert.strictEqual(relativeSyncedLabel('not-a-date', NOW), 'Not yet synced');
			assert.strictEqual(relativeSyncedLabel('2026-07-06T11:59:30Z', NOW), 'Synced just now');
			assert.strictEqual(relativeSyncedLabel('2026-07-05T12:00:00Z', NOW), 'Synced 1 day ago');
			assert.strictEqual(relativeSyncedLabel('2026-07-03T12:00:00Z', NOW), 'Synced 3 days ago');
		});
	});
});
