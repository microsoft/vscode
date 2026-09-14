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

	test('chooses readable columns for two, four, six and narrow layouts', () => {
		assert.deepStrictEqual([
			getSessionGridColumns(2, 1200),
			getSessionGridColumns(4, 1200),
			getSessionGridColumns(6, 1200),
			getSessionGridColumns(6, 800),
			getSessionGridColumns(4, 500),
			getSessionGridColumns(1, 0),
		], [2, 2, 3, 2, 1, 1]);
	});

	for (const count of [2, 3, 4, 6]) {
		test(`tiles ${count} existing chats without losing their view identity`, () => {
			const views = Array.from({ length: count }, () => store.add(new TestView(100, Infinity, 100, Infinity)));
			const grid = store.add(new Grid(views[0]));
			grid.layout(1200, 800);
			for (let i = 1; i < count; i++) {
				grid.addView(views[i], Sizing.Distribute, views[i - 1], Direction.Right);
			}
			const columns = getSessionGridColumns(count, 1200);
			arrangeSessionGrid(grid, views, columns);
			grid.layout(1200, 800);
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
				height: 800 / Math.ceil(count / columns),
				right: index % columns < columns - 1 && index + 1 < count ? true : undefined,
				below: index + columns < count ? true : undefined,
			})));

			arrangeSessionGrid(grid, views, count);
			grid.layout(1200, 800);
			assert.deepStrictEqual(views.map(view => grid.getViewSize(view)), views.map(() => ({ width: 1200 / count, height: 800 })));
		});
	}
});
