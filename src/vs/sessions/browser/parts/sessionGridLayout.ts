/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Direction, Grid, IView, Orientation, Sizing } from '../../../base/browser/ui/grid/grid.js';

export function getSessionGridColumns(count: number, width: number): number {
	return Math.max(1, Math.min(Math.ceil(Math.sqrt(count)), Math.floor(width / 400)));
}

/** Rearranges existing views without disposing their chat widgets. */
export function arrangeSessionGrid<T extends IView>(grid: Grid<T>, views: readonly T[], columns: number): void {
	if (views.length === 0) {
		return;
	}
	for (let i = views.length - 1; i > 0; i--) {
		grid.removeView(views[i]);
	}
	grid.orientation = Orientation.VERTICAL;
	for (let i = columns; i < views.length; i += columns) {
		grid.addView(views[i], Sizing.Distribute, views[i - columns], Direction.Down);
	}
	for (let row = 0; row < views.length; row += columns) {
		for (let i = row + 1; i < Math.min(row + columns, views.length); i++) {
			grid.addView(views[i], Sizing.Distribute, views[i - 1], Direction.Right);
		}
	}
	grid.distributeViewSizes();
}
