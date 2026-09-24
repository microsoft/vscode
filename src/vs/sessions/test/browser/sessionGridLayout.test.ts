/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Direction, Grid, Sizing } from '../../../base/browser/ui/grid/grid.js';
import { TestView } from '../../../base/test/browser/ui/grid/util.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { arrangeSessionGrid, getSessionGridColumns } from '../../browser/parts/sessionGridLayout.js';

suite('Sessions - Tiled Chat Grid', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('chooses tmux-style columns from the session count', () => {
		assert.deepStrictEqual([
			getSessionGridColumns(1),
			getSessionGridColumns(2),
			getSessionGridColumns(3),
			getSessionGridColumns(4),
			getSessionGridColumns(5),
			getSessionGridColumns(6),
			getSessionGridColumns(9),
			getSessionGridColumns(10),
			getSessionGridColumns(16),
		], [1, 2, 2, 2, 3, 3, 3, 4, 4]);
	});

	for (const count of [2, 3, 4, 5, 6, 9]) {
		test(`tiles ${count} existing chats without losing their view identity`, () => {
			const views = Array.from({ length: count }, () => store.add(new TestView(100, Infinity, 100, Infinity)));
			const grid = store.add(new Grid(views[0]));
			grid.layout(1200, 800);
			for (let i = 1; i < count; i++) {
				grid.addView(views[i], Sizing.Distribute, views[i - 1], Direction.Right);
			}
			const columns = getSessionGridColumns(count);
			arrangeSessionGrid(grid, views, columns);
			grid.layout(1200, 800);
			const rows = Math.ceil(count / columns);
			const rowHeight = Math.floor(800 / rows);
			assert.deepStrictEqual(views.map((view, index) => ({
				width: grid.getViewSize(view).width,
				height: grid.getViewSize(view).height,
				right: index % columns < columns - 1 && index + 1 < count
					? grid.getNeighborViews(view, Direction.Right).includes(views[index + 1])
					: undefined,
				below: index + columns < count
					? grid.getNeighborViews(view, Direction.Down).includes(views[index + columns])
					: undefined,
			})), views.map((_, index) => ({
				width: 1200 / Math.min(columns, count - Math.floor(index / columns) * columns),
				height: Math.floor(index / columns) === rows - 1 ? 800 - rowHeight * (rows - 1) : rowHeight,
				right: index % columns < columns - 1 && index + 1 < count ? true : undefined,
				below: index + columns < count ? true : undefined,
			})));

			arrangeSessionGrid(grid, views, count);
			grid.layout(1200, 800);
			const columnWidth = Math.floor(1200 / count);
			assert.deepStrictEqual(views.map(view => grid.getViewSize(view)), views.map((_, index) => ({
				width: index === count - 1 ? 1200 - columnWidth * (count - 1) : columnWidth,
				height: 800,
			})));
		});
	}
});
