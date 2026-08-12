/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createRegExp } from '../../../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { findMatchRangesInDom, openAncestorDisclosures, rangesEqual, shouldCaptureFocusBeforeShow } from '../../../browser/widget/chatFind/chatFindWidget.js';

suite('ChatFindWidget DOM highlighting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function regex(query: string) {
		return createRegExp(query, false, { matchCase: false, wholeWord: false, global: true, unicode: true });
	}

	test('finds matches within a single text node', () => {
		const root = document.createElement('div');
		root.textContent = 'the quick brown fox jumps over the lazy dog';

		const ranges = findMatchRangesInDom(root, regex('the'), 100);

		assert.strictEqual(ranges.length, 2);
		for (const range of ranges) {
			assert.strictEqual(range.toString().toLowerCase(), 'the');
		}
	});

	test('finds matches split across nested inline elements (e.g. bold markdown)', () => {
		const root = document.createElement('div');
		// Simulates rendered markdown like "the **quick** brown fox", where a
		// match's surrounding text lives in sibling/nested text nodes.
		root.innerHTML = 'the <b>quick</b> brown <em>fox</em> jumps';

		const ranges = findMatchRangesInDom(root, regex('quick'), 100);

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].toString(), 'quick');
	});

	test('respects a match limit (only mounted/visible content is ever scanned)', () => {
		const root = document.createElement('div');
		root.textContent = new Array(20).fill('needle').join(' ');

		const ranges = findMatchRangesInDom(root, regex('needle'), 5);

		assert.strictEqual(ranges.length, 5);
	});

	test('does not fuse text across block boundaries', () => {
		const root = document.createElement('div');
		// Two paragraphs whose seam would read as "needle" if blocks were concatenated.
		root.innerHTML = '<p>nee</p><p>dle</p>';

		assert.deepStrictEqual(findMatchRangesInDom(root, regex('needle'), 100), []);
	});

	test('keeps inline formatting on one line so whole-word matches survive', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p>the <b>nee</b><i>dle</i> here</p>';

		const ranges = findMatchRangesInDom(root, createRegExp('needle', false, { matchCase: false, wholeWord: true, global: true, unicode: true }), 100);

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].toString(), 'needle');
	});

	test('excludes embedded editor text without joining surrounding text', () => {
		const root = document.createElement('div');
		root.append('nee');
		const editor = root.appendChild(document.createElement('div'));
		editor.textContent = 'needle';
		root.append('dle');

		assert.deepStrictEqual(findMatchRangesInDom(root, regex('needle'), 100, [editor]), []);
	});

	test('returns no ranges when there is no text content', () => {
		const root = document.createElement('div');
		assert.deepStrictEqual(findMatchRangesInDom(root, regex('needle'), 100), []);
	});

	test('rangesEqual compares by container/offset, not by reference', () => {
		const root = document.createElement('div');
		root.textContent = 'needle';

		const [a] = findMatchRangesInDom(root, regex('needle'), 100);
		const [b] = findMatchRangesInDom(root, regex('needle'), 100);

		assert.notStrictEqual(a, b, 'sanity: these are distinct Range objects');
		assert.strictEqual(rangesEqual(a, b), true);
	});

	test('uses the root element\'s own document, not the global document', () => {
		// Simulates a node owned by another window/document (e.g. an
		// auxiliary window), which must not be scanned/ranged via globals.
		const otherDocument = document.implementation.createHTMLDocument('');
		const root = otherDocument.createElement('div');
		root.textContent = 'needle';

		const [range] = findMatchRangesInDom(root, regex('needle'), 100);

		assert.strictEqual(range.toString(), 'needle');
		assert.strictEqual(range.startContainer.ownerDocument, otherDocument);
	});

	test('openAncestorDisclosures opens every closed <details> ancestor up to root', () => {
		const root = document.createElement('div');
		root.innerHTML = '<details><summary>a</summary><details><summary>b</summary><span>needle</span></details></details>';
		const outer = root.querySelector<HTMLDetailsElement>('details')!;
		const inner = root.querySelector<HTMLDetailsElement>('details details')!;
		const target = root.querySelector('span')!.firstChild!;

		const opened = openAncestorDisclosures(root, target);

		assert.strictEqual(opened, true);
		assert.strictEqual(outer.open, true);
		assert.strictEqual(inner.open, true);
	});

	test('openAncestorDisclosures does not open <details> outside of root, and reports false when nothing changes', () => {
		const outside = document.createElement('details');
		const root = document.createElement('div');
		root.innerHTML = '<details open><span>needle</span></details>';
		outside.appendChild(root);
		const target = root.querySelector('span')!.firstChild!;

		const opened = openAncestorDisclosures(root, target);

		assert.strictEqual(opened, false, 'the already-open details inside root needed no change');
		assert.strictEqual(outside.open, false, 'details outside root must not be touched');
	});

	test('shouldCaptureFocusBeforeShow only captures focus when opening from hidden', () => {
		assert.strictEqual(shouldCaptureFocusBeforeShow(false), true, 'opening from hidden captures the pre-Find focus target');
		assert.strictEqual(shouldCaptureFocusBeforeShow(true), false, 'reopening while already visible must not overwrite it');
	});
});
