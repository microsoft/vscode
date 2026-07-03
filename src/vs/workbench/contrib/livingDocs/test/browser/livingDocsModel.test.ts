/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { groupDecisions, groupPendingByDoc, IProposedChange, nextPendingDocId, reviewConfidence, reviewedDocsFromSeen, summariseProjectRun } from '../../common/livingDocsModel.js';

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
