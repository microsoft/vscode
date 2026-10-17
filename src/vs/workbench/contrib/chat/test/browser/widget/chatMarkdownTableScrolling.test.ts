/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { scheduleAtNextAnimationFrame } from '../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
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

/** Resolves after the table scrollbars measured at the next animation frame have been updated. */
function afterNextAnimationFrame(): Promise<void> {
	return new Promise(resolve => scheduleAtNextAnimationFrame(mainWindow, resolve, -20000 /* after dom.modify */));
}

suite('wrapTablesWithScrollable', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function wrap(container: HTMLDivElement): { layoutParticipants: Set<() => void> } {
		const layoutParticipants = new Set<() => void>();
		store.add(wrapTablesWithScrollable(container, new Lazy(() => layoutParticipants)));
		return { layoutParticipants };
	}

	/** Attaches `container` to the document with a fixed width, so its tables have a real layout. */
	function attach(container: HTMLDivElement, width: number): void {
		container.style.width = `${width}px`;
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
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

	test('shows a horizontal scrollbar only for tables wider than their container', async () => {
		const container = buildContainer([
			[['Wide'], ['x'.repeat(200)]],
			[['A', 'B'], ['c', 'd']],
		]);
		attach(container, 200);
		wrap(container);
		await afterNextAnimationFrame();

		const sliderWidths = Array.from(container.querySelectorAll<HTMLElement>('.scrollbar.horizontal .slider'), slider => parseFloat(slider.style.width));
		assert.deepStrictEqual(sliderWidths.map(width => width > 0 && width < 200 ? 'scrollable' : width === 200 ? 'fits' : `unmeasured (${width})`), ['scrollable', 'fits']);
	});

	test('re-measures all tables on resize without forcing a layout per table', async () => {
		const container = buildContainer([
			[['H1', 'H2'], ['a', 'bb']],
			[['X', 'YY'], ['c', 'dd']],
			[['P', 'QQ'], ['e', 'ff']],
		]);
		attach(container, 200);
		const { layoutParticipants } = wrap(container);
		await afterNextAnimationFrame();

		// A layout read that follows a scrollbar update forces a synchronous layout.
		const log: ('read' | 'write')[] = [];
		for (const table of container.querySelectorAll('table')) {
			const tableContainer = table.parentElement!;
			for (const name of ['clientWidth', 'scrollWidth', 'clientHeight', 'scrollHeight', 'scrollLeft', 'scrollTop'] as const) {
				const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, name)!;
				Object.defineProperty(tableContainer, name, {
					configurable: true,
					get: () => {
						log.push('read');
						return descriptor.get!.call(tableContainer);
					},
					set: descriptor.set && (value => descriptor.set!.call(tableContainer, value)),
				});
			}
		}
		const setScrollDimensions = sinon.stub(DomScrollableElement.prototype, 'setScrollDimensions').callsFake(function (this: DomScrollableElement, dimensions) {
			log.push('write');
			setScrollDimensions.wrappedMethod.call(this, dimensions);
		});

		// Every markdown part runs its layout participants from its own resize observer.
		for (const layout of layoutParticipants) {
			layout();
		}
		await afterNextAnimationFrame();

		assert.deepStrictEqual({
			scrollbarUpdates: setScrollDimensions.callCount,
			readsAfterFirstUpdate: log.slice(log.indexOf('write')).filter(entry => entry === 'read').length,
		}, {
			scrollbarUpdates: 3,
			readsAfterFirstUpdate: 0,
		});
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
