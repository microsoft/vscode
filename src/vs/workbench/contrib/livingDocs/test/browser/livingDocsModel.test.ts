/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { bulkApproveConfirm, groupDecisions, groupPendingByDoc, IProposedChange, nextPendingDocId, reviewConfidence, reviewedDocsFromSeen, reviewFraming, summariseProjectRun } from '../../common/livingDocsModel.js';

function change(docId: string, id: string): IProposedChange {
	return {
		id, docId, docTitle: docId, blockId: '', blockLabel: '', oldText: '', newText: '',
		kind: 'meaning', confidence: 0.8, rationale: '', sourceCells: [],
	};
}

function grounded(docId: string, id: string, rationale: string, sourceQuote?: string, sourceLine?: number): IProposedChange {
	return { ...change(docId, id), rationale, sourceQuote, sourceLine };
}

suite('LivingDoc model - nextPendingDocId', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('advances to the next document that still has pending changes', () => {
		const pending = [change('a', '1'), change('b', '2'), change('c', '3')];
		assert.strictEqual(nextPendingDocId(pending, 'a'), 'b');
		assert.strictEqual(nextPendingDocId(pending, 'b'), 'c');
	});

	test('cycles round-robin from the last changed document back to the first', () => {
		const pending = [change('a', '1'), change('b', '2'), change('c', '3')];
		assert.strictEqual(nextPendingDocId(pending, 'c'), 'a');
	});

	test('orders by first appearance and ignores duplicate changes on the same doc', () => {
		const pending = [change('a', '1'), change('a', '2'), change('b', '3')];
		assert.strictEqual(nextPendingDocId(pending, 'a'), 'b');
	});

	test('returns the first changed doc when the current document has no pending changes', () => {
		const pending = [change('b', '1'), change('c', '2')];
		assert.strictEqual(nextPendingDocId(pending, 'a'), 'b');
	});

	test('returns undefined when the current document is the only one with pending changes', () => {
		assert.strictEqual(nextPendingDocId([change('a', '1'), change('a', '2')], 'a'), undefined);
	});

	test('returns undefined when there are no pending changes at all', () => {
		assert.strictEqual(nextPendingDocId([], 'a'), undefined);
	});
});

suite('LivingDoc model - summariseProjectRun', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const docs = [
		{ docId: 'a', docTitle: 'Access Control' },
		{ docId: 'b', docTitle: 'Acceptable Use' },
		{ docId: 'c', docTitle: 'Cryptography' },
	];

	test('aggregates pending changes by document into changed / no-change tiles with totals', () => {
		const pending = [change('a', '1'), change('a', '2'), change('b', '3')];
		assert.deepStrictEqual(summariseProjectRun(docs, pending), {
			tiles: [
				{ docId: 'a', docTitle: 'Access Control', status: 'changed', changeCount: 2 },
				{ docId: 'b', docTitle: 'Acceptable Use', status: 'changed', changeCount: 1 },
				{ docId: 'c', docTitle: 'Cryptography', status: 'no-change', changeCount: 0 },
			],
			totalChanges: 3,
			changedDocs: 2,
			unchangedDocs: 1,
			skippedDocs: 0,
		});
	});

	test('reports every document as no-change and zero totals when nothing is pending', () => {
		assert.deepStrictEqual(summariseProjectRun(docs, []), {
			tiles: [
				{ docId: 'a', docTitle: 'Access Control', status: 'no-change', changeCount: 0 },
				{ docId: 'b', docTitle: 'Acceptable Use', status: 'no-change', changeCount: 0 },
				{ docId: 'c', docTitle: 'Cryptography', status: 'no-change', changeCount: 0 },
			],
			totalChanges: 0,
			changedDocs: 0,
			unchangedDocs: 3,
			skippedDocs: 0,
		});
	});

	test('a stopped run marks not-yet-changed documents skipped, keeping changed ones (plan 27 iter 4)', () => {
		// The whole-project fan-out is a single model call, so a mid-flight Stop means every document that
		// did not already land a change is honestly skipped (it never ran), while a changed doc keeps its work.
		const pending = [change('a', '1')];
		assert.deepStrictEqual(summariseProjectRun(docs, pending, true), {
			tiles: [
				{ docId: 'a', docTitle: 'Access Control', status: 'changed', changeCount: 1 },
				{ docId: 'b', docTitle: 'Acceptable Use', status: 'skipped', changeCount: 0 },
				{ docId: 'c', docTitle: 'Cryptography', status: 'skipped', changeCount: 0 },
			],
			totalChanges: 1,
			changedDocs: 1,
			unchangedDocs: 0,
			skippedDocs: 2,
		});
	});

	test('ignores pending changes for documents outside the project so totalChanges equals the tile sum', () => {
		// A stale snapshot / a doc removed mid-run can leave a pending change whose docId has no tile.
		// It must not inflate totalChanges, which the bottom bar reports as "N changes in M documents".
		const pending = [change('a', '1'), change('ghost', '2'), change('ghost', '3')];
		const summary = summariseProjectRun([{ docId: 'a', docTitle: 'Access Control' }], pending);
		assert.deepStrictEqual(summary, {
			tiles: [{ docId: 'a', docTitle: 'Access Control', status: 'changed', changeCount: 1 }],
			totalChanges: 1,
			changedDocs: 1,
			unchangedDocs: 0,
			skippedDocs: 0,
		});
	});
});

suite('LivingDoc model - groupDecisions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('groups grounded changes by their source line, counting distinct documents affected', () => {
		// Two documents changed by the same MFA decision (line 2) + one by a separate TLS decision (line 19).
		const pending = [
			grounded('a', '1', 'MFA required', 'multi-factor authentication is now REQUIRED', 2),
			grounded('b', '2', 'MFA required', 'multi-factor authentication is now REQUIRED', 2),
			grounded('c', '3', 'TLS 1.2+', 'data in transit must use TLS 1.2 or higher', 19),
		];
		assert.deepStrictEqual(groupDecisions(pending), [
			{ quote: 'multi-factor authentication is now REQUIRED', sourceLine: 2, docsAffected: 2, changeCount: 2, grounded: true },
			{ quote: 'data in transit must use TLS 1.2 or higher', sourceLine: 19, docsAffected: 1, changeCount: 1, grounded: true },
		]);
	});

	test('groups by quote when the model gave a quote but no line (no fabricated line)', () => {
		const pending = [
			grounded('a', '1', 'BYOD', 'personal devices may access email and calendar only'),
			grounded('b', '2', 'BYOD', 'personal devices may access email and calendar only'),
		];
		assert.deepStrictEqual(groupDecisions(pending), [
			{ quote: 'personal devices may access email and calendar only', docsAffected: 2, changeCount: 2, grounded: true },
		]);
	});

	test('degrades honestly to rationale grouping when no change carries a source grounding', () => {
		const pending = [
			grounded('a', '1', 'Tidy the intro'),
			grounded('b', '2', 'Tidy the intro'),
			grounded('c', '3', 'Fix the heading'),
		];
		assert.deepStrictEqual(groupDecisions(pending), [
			{ quote: 'Tidy the intro', docsAffected: 2, changeCount: 2, grounded: false },
			{ quote: 'Fix the heading', docsAffected: 1, changeCount: 1, grounded: false },
		]);
	});

	test('counts a document once per decision even when it has several changes from that decision', () => {
		const pending = [
			grounded('a', '1', 'MFA', 'MFA is required', 2),
			grounded('a', '2', 'MFA', 'MFA is required', 2),
		];
		assert.deepStrictEqual(groupDecisions(pending), [
			{ quote: 'MFA is required', sourceLine: 2, docsAffected: 1, changeCount: 2, grounded: true },
		]);
	});

	test('returns an empty list when there are no pending changes', () => {
		assert.deepStrictEqual(groupDecisions([]), []);
	});
});

suite('LivingDoc model - reviewConfidence (D24-A)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function withKind(kind: 'figure' | 'meaning', confidence: number): IProposedChange {
		return { ...change('a', '1'), kind, confidence };
	}

	test('a meaning change below 0.8 is Inferred; every other change is High', () => {
		assert.deepStrictEqual(
			[
				reviewConfidence(withKind('meaning', 0.79)),
				reviewConfidence(withKind('meaning', 0.8)),
				reviewConfidence(withKind('meaning', 0.95)),
				reviewConfidence(withKind('meaning', 0.5)),
				reviewConfidence(withKind('figure', 0.4)),
				reviewConfidence(withKind('figure', 0.99)),
			],
			['inferred', 'high', 'high', 'inferred', 'high', 'high'],
		);
	});
});

suite('LivingDoc model - groupPendingByDoc', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('groups changes by document in first-appearance order, keeping every change', () => {
		const pending = [change('a', '1'), change('b', '2'), change('a', '3'), change('c', '4')];
		assert.deepStrictEqual(
			groupPendingByDoc(pending).map(g => ({ docId: g.docId, docTitle: g.docTitle, ids: g.changes.map(c => c.id) })),
			[
				{ docId: 'a', docTitle: 'a', ids: ['1', '3'] },
				{ docId: 'b', docTitle: 'b', ids: ['2'] },
				{ docId: 'c', docTitle: 'c', ids: ['4'] },
			],
		);
	});

	test('returns an empty list when there are no pending changes', () => {
		assert.deepStrictEqual(groupPendingByDoc([]), []);
	});
});

suite('LivingDoc model - reviewedDocsFromSeen', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a seen doc with no remaining pending is reviewed with its human title, in seen order', () => {
		const seen = new Map<string, string>([['a-uri', 'Access Control'], ['b-uri', 'Backup Policy'], ['c-uri', 'Cryptography']]);
		const pendingDocIds = new Set<string>(['b-uri']);
		assert.deepStrictEqual(
			reviewedDocsFromSeen(seen, pendingDocIds),
			[{ docId: 'a-uri', title: 'Access Control' }, { docId: 'c-uri', title: 'Cryptography' }],
		);
	});

	test('nothing is reviewed while every seen doc still has pending changes', () => {
		const seen = new Map<string, string>([['a-uri', 'Access Control']]);
		assert.deepStrictEqual(reviewedDocsFromSeen(seen, new Set(['a-uri'])), []);
	});
});

suite('LivingDoc model - reviewFraming (plan 31 iter 2)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a low-confidence meaning change frames as an attention kind tag + Inferred chip', () => {
		const f = reviewFraming({ kind: 'meaning', confidence: 0.6, rationale: 'Because the CSV moved.', sourceLine: 12 }, 'metrics.csv');
		assert.strictEqual(f.kindLabel, 'MEANING CHANGE · needs your call');
		assert.strictEqual(f.kindAttention, true);
		assert.strictEqual(f.confidence, 'inferred');
		assert.strictEqual(f.confidenceLabel, '◐ Inferred');
		assert.strictEqual(f.rationale, 'Because the CSV moved.');
		assert.strictEqual(f.sourceLabel, 'metrics.csv · line 12');
	});

	test('a confident meaning change frames as High', () => {
		const f = reviewFraming({ kind: 'meaning', confidence: 0.9, rationale: '', sourceLine: undefined }, '');
		assert.strictEqual(f.confidence, 'high');
		assert.strictEqual(f.confidenceLabel, '● High');
	});

	test('a figure change frames as an ok FIGURE tag and is always High', () => {
		const f = reviewFraming({ kind: 'figure', confidence: 0.4, rationale: '', sourceLine: undefined }, 'metrics.csv');
		assert.strictEqual(f.kindLabel, 'FIGURE');
		assert.strictEqual(f.kindAttention, false);
		assert.strictEqual(f.confidence, 'high');
		assert.strictEqual(f.sourceLabel, 'metrics.csv');
	});

	test('omits the source label when no source is given and never fabricates a line', () => {
		const f = reviewFraming({ kind: 'meaning', confidence: 0.9, rationale: '', sourceLine: undefined }, '');
		assert.strictEqual(f.sourceLabel, '');
		assert.strictEqual(f.rationale, '');
	});
});

suite('LivingDoc model - bulkApproveConfirm (plan 31 iter 4)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('confirms with real counts when the set includes meaning changes', () => {
		const set = [
			{ kind: 'figure' as const }, { kind: 'figure' as const }, { kind: 'figure' as const },
			{ kind: 'meaning' as const }, { kind: 'meaning' as const }, { kind: 'figure' as const },
		];
		const c = bulkApproveConfirm(set);
		assert.strictEqual(c.needed, true);
		assert.strictEqual(c.message, 'Approve 6 changes including 2 meaning changes?');
	});

	test('mentions the version snapshot when snapshot is on (plan 26 landed)', () => {
		const c = bulkApproveConfirm([{ kind: 'meaning' }, { kind: 'figure' }], true);
		assert.strictEqual(c.needed, true);
		assert.strictEqual(c.message, 'Approve 2 changes including 1 meaning change? A version snapshot is taken first, so you can restore.');
	});

	test('a figures-only bulk approve needs no confirm (stays one-click)', () => {
		const c = bulkApproveConfirm([{ kind: 'figure' }, { kind: 'figure' }], true);
		assert.strictEqual(c.needed, false);
		assert.strictEqual(c.message, '');
	});

	test('an empty set needs no confirm', () => {
		assert.strictEqual(bulkApproveConfirm([], true).needed, false);
	});
});
