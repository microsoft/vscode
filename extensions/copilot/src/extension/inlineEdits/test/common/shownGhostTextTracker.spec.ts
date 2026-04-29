/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { computeGhostTextEditKey, ShownGhostTextTracker } from '../../common/shownGhostTextTracker';

describe('ShownGhostTextTracker', () => {
	const docUri = 'file:///test.ts';

	test('untracked suggestion is not filtered', () => {
		const tracker = new ShownGhostTextTracker();
		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 1)).toBe(false);
	});

	test('rejected ghost text is always filtered', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordRejected(docUri, 'edit1');

		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 1)).toBe(true);
		// Different position — still filtered
		expect(tracker.shouldFilter(docUri, 'edit1', true, 5, 3, 2)).toBe(true);
	});

	test('rejected ghost text is filtered even when it would be an inline edit', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordRejected(docUri, 'edit1');

		expect(tracker.shouldFilter(docUri, 'edit1', false, 1, 0, 1)).toBe(true);
	});

	test('ignored ghost text is filtered at different cursor position', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordIgnored(docUri, 'edit1', { cursorLine: 1, cursorCharacter: 0, documentVersion: 1 });

		expect(tracker.shouldFilter(docUri, 'edit1', true, 2, 0, 1)).toBe(true);
	});

	test('ignored ghost text is filtered at different document version', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordIgnored(docUri, 'edit1', { cursorLine: 1, cursorCharacter: 0, documentVersion: 1 });

		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 2)).toBe(true);
	});

	test('ignored ghost text is filtered when it would be an inline edit', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordIgnored(docUri, 'edit1', { cursorLine: 1, cursorCharacter: 0, documentVersion: 1 });

		// Same position and version, but would be inline edit — filtered
		expect(tracker.shouldFilter(docUri, 'edit1', false, 1, 0, 1)).toBe(true);
	});

	test('ignored ghost text is allowed at same position, version, and ghost text mode', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordIgnored(docUri, 'edit1', { cursorLine: 1, cursorCharacter: 0, documentVersion: 1 });

		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 1)).toBe(false);
	});

	test('rejection overrides prior ignore', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordIgnored(docUri, 'edit1', { cursorLine: 1, cursorCharacter: 0, documentVersion: 1 });
		tracker.recordRejected(docUri, 'edit1');

		// Same context that would have been allowed for ignore — now rejected
		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 1)).toBe(true);
	});

	test('ignore cannot downgrade a rejection', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordRejected(docUri, 'edit1');
		tracker.recordIgnored(docUri, 'edit1', { cursorLine: 1, cursorCharacter: 0, documentVersion: 1 });

		// Still rejected
		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 1)).toBe(true);
	});

	test('acceptance clears both rejection and ignore tracking', () => {
		const tracker = new ShownGhostTextTracker();
		tracker.recordRejected(docUri, 'edit1');
		tracker.clearTracking(docUri, 'edit1');

		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 1)).toBe(false);

		tracker.recordIgnored(docUri, 'edit2', { cursorLine: 1, cursorCharacter: 0, documentVersion: 1 });
		tracker.clearTracking(docUri, 'edit2');

		expect(tracker.shouldFilter(docUri, 'edit2', true, 2, 0, 1)).toBe(false);
	});

	test('tracking is scoped per document', () => {
		const tracker = new ShownGhostTextTracker();
		const doc1 = 'file:///a.ts';
		const doc2 = 'file:///b.ts';

		tracker.recordRejected(doc1, 'edit1');

		expect(tracker.shouldFilter(doc1, 'edit1', true, 1, 0, 1)).toBe(true);
		expect(tracker.shouldFilter(doc2, 'edit1', true, 1, 0, 1)).toBe(false);
	});

	test('multiple suggestions tracked independently', () => {
		const tracker = new ShownGhostTextTracker();

		tracker.recordRejected(docUri, 'edit1');
		tracker.recordIgnored(docUri, 'edit2', { cursorLine: 3, cursorCharacter: 5, documentVersion: 4 });

		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 1)).toBe(true);
		expect(tracker.shouldFilter(docUri, 'edit2', true, 3, 5, 4)).toBe(false); // same context → allowed
		expect(tracker.shouldFilter(docUri, 'edit2', true, 1, 0, 4)).toBe(true); // different position → filtered
		expect(tracker.shouldFilter(docUri, 'edit3', true, 1, 0, 1)).toBe(false); // untracked
	});

	test('clearDocument removes all tracking for that document', () => {
		const tracker = new ShownGhostTextTracker();

		tracker.recordRejected(docUri, 'edit1');
		tracker.recordIgnored(docUri, 'edit2', { cursorLine: 1, cursorCharacter: 0, documentVersion: 1 });

		tracker.clearDocument(docUri);

		expect(tracker.shouldFilter(docUri, 'edit1', true, 1, 0, 1)).toBe(false);
		expect(tracker.shouldFilter(docUri, 'edit2', true, 5, 0, 2)).toBe(false);
	});

	test('clearDocument does not affect other documents', () => {
		const tracker = new ShownGhostTextTracker();
		const doc1 = 'file:///a.ts';
		const doc2 = 'file:///b.ts';

		tracker.recordRejected(doc1, 'edit1');
		tracker.recordRejected(doc2, 'edit1');

		tracker.clearDocument(doc1);

		expect(tracker.shouldFilter(doc1, 'edit1', true, 1, 0, 1)).toBe(false);
		expect(tracker.shouldFilter(doc2, 'edit1', true, 1, 0, 1)).toBe(true);
	});

	test('evicts oldest entries when per-document cap is exceeded', () => {
		const tracker = new ShownGhostTextTracker();

		// Fill up with 201 rejected entries (exceeds the 200 cap)
		for (let i = 0; i < 201; i++) {
			tracker.recordRejected(docUri, `edit-${i}`);
		}

		// The oldest entries should have been evicted
		expect(tracker.shouldFilter(docUri, 'edit-0', true, 1, 0, 1)).toBe(false);

		// The newest entries should still be tracked
		expect(tracker.shouldFilter(docUri, 'edit-200', true, 1, 0, 1)).toBe(true);
	});
});

describe('computeGhostTextEditKey', () => {
	test('produces deterministic keys', () => {
		const key1 = computeGhostTextEditKey(1, 0, 1, 10, 'hello');
		const key2 = computeGhostTextEditKey(1, 0, 1, 10, 'hello');
		expect(key1).toBe(key2);
	});

	test('different ranges produce different keys', () => {
		const key1 = computeGhostTextEditKey(1, 0, 1, 10, 'hello');
		const key2 = computeGhostTextEditKey(2, 0, 2, 10, 'hello');
		expect(key1).not.toBe(key2);
	});

	test('different text produces different keys', () => {
		const key1 = computeGhostTextEditKey(1, 0, 1, 10, 'hello');
		const key2 = computeGhostTextEditKey(1, 0, 1, 10, 'world');
		expect(key1).not.toBe(key2);
	});
});
