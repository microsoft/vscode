/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { wrapTablesWithScrollable } from '../../../browser/widget/chatContentParts/chatMarkdownTableScrolling.js';
/** Builds an HTMLElement containing one or more tables from markdown-style 2-D arrays. */
function buildContainer(tables) {
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
    function wrap(container) {
        const layoutParticipants = new Set();
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
        assert.ok(wrapper.classList.contains('rendered-markdown-table-scroll-wrapper'), 'outer node should have the scroll wrapper class');
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
        const table = container.querySelector('table');
        // min-width is set only on the first row; other rows are untouched
        // col 0 max = 3 chars -> 3ch; col 1 max = 11 chars -> capped at 3ch
        assert.deepStrictEqual(Array.from(table.rows[0].cells).map(cell => cell.style.minWidth), ['3ch', '3ch']);
        assert.deepStrictEqual(Array.from(table.rows[1].cells).map(cell => cell.style.minWidth), ['', '']);
    });
    test('uses actual char count when below the 3ch cap', () => {
        const container = buildContainer([[['AB', 'C'], ['DE', 'F']]]);
        wrap(container);
        const table = container.querySelector('table');
        // col 0 max=2 -> 2ch; col 1 max=1 -> no min-width
        assert.strictEqual(table.rows[0].cells[0].style.minWidth, '2ch');
        assert.strictEqual(table.rows[0].cells[1].style.minWidth, '');
    });
    test('does not set min-width on single-character columns', () => {
        const container = buildContainer([[['X', 'hello'], ['Y', 'world']]]);
        wrap(container);
        const table = container.querySelector('table');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1hcmtkb3duVGFibGVTY3JvbGxpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0TWFya2Rvd25UYWJsZVNjcm9sbGluZy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUVsSCwwRkFBMEY7QUFDMUYsU0FBUyxjQUFjLENBQUMsTUFBb0I7SUFDM0MsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNoRCxLQUFLLE1BQU0sSUFBSSxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQzNCLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUNsQyxNQUFNLE9BQU8sR0FBRyxRQUFRLEtBQUssQ0FBQztnQkFDN0IsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUU7Z0JBQ3JCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDN0MsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQy9CLEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxF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