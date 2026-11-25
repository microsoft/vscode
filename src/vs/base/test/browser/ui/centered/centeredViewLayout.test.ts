/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../browser/dom.js';
import { CenteredViewLayout } from '../../../../browser/ui/centered/centeredViewLayout.js';
import { IView } from '../../../../browser/ui/grid/grid.js';
import { GridView, Orientation } from '../../../../browser/ui/grid/gridview.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
import { TestView } from '../grid/util.js';

suite('CenteredViewLayout', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class EditorView extends TestView {
		readonly pathIndependentLayout = true;
		get proportionalLayout(): boolean {
			return this.width === 0 || !(this.width === this.minimumWidth || this.height === this.minimumHeight);
		}
	}

	for (const fixedWidth of [false, true]) {
		test(`activation preserves embedded grid geometry (${fixedWidth ? 'fixed width' : 'margin ratios'})`, () => {
			const left = store.add(new EditorView(220, Number.POSITIVE_INFINITY, 70, Number.POSITIVE_INFINITY));
			const right = store.add(new EditorView(220, Number.POSITIVE_INFINITY, 70, Number.POSITIVE_INFINITY));
			const grid = store.add(new GridView());
			grid.orientation = Orientation.HORIZONTAL;
			grid.layout(2400, 70);
			grid.addView(left, 1200, [0]);
			grid.addView(right, 1200, [1]);
			grid.resizeView([0], { width: 1200 });
			const gridView: IView = {
				element: grid.element,
				get minimumWidth() { return grid.minimumWidth; },
				get maximumWidth() { return grid.maximumWidth; },
				get minimumHeight() { return grid.minimumHeight; },
				get maximumHeight() { return grid.maximumHeight; },
				onDidChange: grid.onDidChange,
				layout: (width, height, top, left) => grid.layout(width, height, top, left),
			};
			const centered = store.add(new CenteredViewLayout($('.container'), gridView, undefined, fixedWidth));
			centered.layout(2400, 70, 0, 0);
			const initial = [left, right].map(view => [view.width, view.height, view.proportionalLayout]);

			centered.activate(true);

			assert.deepStrictEqual({ initial, widths: [left.width, right.width] }, {
				initial: [[1200, 70, false], [1200, 70, false]],
				widths: fixedWidth ? [220, 680] : [220, 1264],
			});
		});
	}
});
