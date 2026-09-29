/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { wrapTablesWithScrollable } from '../../../browser/widget/chatContentParts/chatMarkdownTableScrolling.js';

/** Builds an HTMLElement containing one or more tables from markdown-style 2-D arrays. */
function buildContainer(tables: string[][][]): HTMLDivElement {
	const container = document.createElement('div');
	for (const rows of tables) {
		const table = document.createElement('table');
		rows.forEach((rowData, rowIndex) => {
			const section = rowIndex === 0
				? table.createTHead()
				: (table.tBodies[0] ?? table.createTBody());
			const tr = section.insertRow();
			for (const text of rowData) {
				const cell = rowIndex === 0 ? document.createElement('th') : tr.insertCell();
				cell.textContent = text;
				if (rowIndex === 0) {
					tr.appendChild(cell);
				}
			}
		});
		container.appendChild(table);
	}
	return container;
}

suite('wrapTablesWithScrollable', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function wrap(container: HTMLDivElement): { layoutParticipants: Set<() => void> } {
		const layoutParticipants = new Set<() => void>();
		store.add(wrapTablesWithScrollable(container, new Lazy(() => layoutParticipants)));
		return { layoutParticipants };
	}

	test('replaces each table with a scroll wrapper in the DOM', () => {
		const container = buildContainer([[
			['ID', 'Name'],
			['001', 'Alice'],
		]]);
		// Before: direct child is <table>
		assert.strictEqual(container.children[0].tagName, 'TABLE');

		wrap(container);

		// After: direct child is the monaco-scrollable-element wrapper
		const wrapper = container.children[0];
		assert.ok(wrapper.classList.contains('rendered-markdown-table-scroll-wrapper'),
			'outer node should have the scroll wrapper class');
	});

	test('table is preserved inside the scroll wrapper', () => {
		const container = buildContainer([[['A', 'BB'], ['C', 'DD']]]);
		wrap(container);

		// The table must still be in the document, nested inside the wrapper
		const table = container.querySelector('table');
		assert.ok(table, 'table should still exist in DOM');
		assert.ok(container.contains(table), 'table should be inside container');
		assert.ok(!container.children[0].isSameNode(table), 'table should not be a direct child anymore');
	});

	test('registers a layout participant for each table', () => {
		const container = buildContainer([
			[['H1', 'H2'], ['a', 'bb']],
			[['X', 'YY'], ['c', 'dd']],
		]);
		const { layoutParticipants } = wrap(container);
		assert.strictEqual(layoutParticipants.size, 2, 'one layout participant registered per table');
	});

	test('sets column min-width capped at 3ch', () => {
		const container = buildContainer([[
			['ID', 'Name'],
			['001', 'Alice'],
			['002', 'Longer Name'],
		]]);
		wrap(container);

		const table = container.querySelector('table')!;
		// min-width is set only on the first row; other rows are untouched
		// col 0 max = 3 chars -> 3ch; col 1 max = 11 chars -> capped at 3ch
		assert.deepStrictEqual(
			Array.from(table.rows[0].cells).map(cell => cell.style.minWidth),
			['3ch', '3ch']
		);
		assert.deepStrictEqual(
			Array.from(table.rows[1].cells).map(cell => cell.style.minWidth),
			['', '']
		);
	});

	test('uses actual char count when below the 3ch cap', () => {
		const container = buildContainer([[['AB', 'C'], ['DE', 'F']]]);
		wrap(container);

		const table = container.querySelector('table')!;
		// col 0 max=2 -> 2ch; col 1 max=1 -> no min-width
		assert.strictEqual(table.rows[0].cells[0].style.minWidth, '2ch');
		assert.strictEqual(table.rows[0].cells[1].style.minWidth, '');
	});

	test('does not set min-width on single-character columns', () => {
		const container = buildContainer([[['X', 'hello'], ['Y', 'world']]]);
		wrap(container);

		const table = container.querySelector('table')!;
		assert.strictEqual(table.rows[0].cells[0].style.minWidth, '', 'single-char column should have no min-width');
	});

	test('handles multiple tables independently', () => {
		const container = buildContainer([
			[['AB', 'C'], ['DE', 'F']],
			[['X', 'YYY'], ['Z', 'WWW']],
		]);
		wrap(container);

		const tables = container.querySelectorAll('table');
		assert.strictEqual(tables.length, 2);

		// Table 1: col 0 max=2, col 1 max=1 -> only col 0 gets min-width
		assert.strictEqual(tables[0].rows[0].cells[0].style.minWidth, '2ch');
		assert.strictEqual(tables[0].rows[0].cells[1].style.minWidth, '');

		// Table 2: col 0 max=1, col 1 max=3 -> only col 1 gets min-width
		assert.strictEqual(tables[1].rows[0].cells[0].style.minWidth, '');
		assert.strictEqual(tables[1].rows[0].cells[1].style.minWidth, '3ch');
	});

	test('no-ops on a container with no tables', () => {
		const container = document.createElement('div');
		container.innerHTML = '<p>hello</p>';
		const { layoutParticipants } = wrap(container);
		assert.strictEqual(layoutParticipants.size, 0);
		assert.strictEqual(container.querySelector('table'), null);
	});
});
