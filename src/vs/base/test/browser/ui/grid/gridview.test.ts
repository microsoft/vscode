/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../browser/dom.js';
import { GridView, IView, Orientation, Sizing } from '../../../../browser/ui/grid/gridview.js';
import { nodesToArrays, TestView } from './util.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Gridview', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createGridView(): GridView {
		const gridview = store.add(new GridView());
		const container = $('.container');

		container.style.position = 'absolute';
		container.style.width = `${200}px`;
		container.style.height = `${200}px`;
		container.appendChild(gridview.element);

		return gridview;
	}

	for (const orientation of [Orientation.HORIZONTAL, Orientation.VERTICAL]) {
		for (const participation of ['minimized', 'disabled', 'proportional']) {
			for (const sizing of [Sizing.Distribute, Sizing.Auto(0)]) {
				test(`nested constrained distribution preserves descendant geometry (${orientation}, ${participation}, ${sizing.type})`, () => {
					class EditorView extends TestView {
						get proportionalLayout(): boolean {
							return participation !== 'minimized' || this.width === 0 || !(this.width === this.minimumWidth || this.height === this.minimumHeight);
						}
					}
					const horizontal = orientation === Orientation.HORIZONTAL;
					const grid = store.add(new GridView({ proportionalLayout: participation !== 'disabled' }));
					grid.orientation = orientation;
					grid.layout(horizontal ? 2400 : 1000, horizontal ? 1000 : 2400);
					const views = Array.from({ length: 6 }, () => store.add(new EditorView(
						horizontal ? 220 : 70, Number.POSITIVE_INFINITY,
						horizontal ? 70 : 220, Number.POSITIVE_INFINITY
					)));
					const [a, b, d, e, f, n] = views;
					grid.addView(a, 800, [0]);
					grid.addView(b, 800, [1]);
					grid.addView(d, 800, [2]);
					grid.addView(f, 500, [2, 1]);
					grid.addView(e, 400, [2, 0, 1]);
					grid.resizeView([0], horizontal ? { width: 800 } : { height: 800 });
					grid.resizeView([1], horizontal ? { width: 800 } : { height: 800 });
					grid.resizeView([2, 0, 0], { width: horizontal ? 400 : 70, height: horizontal ? 70 : 400 });
					const initial = [d, e].map(view => horizontal ? view.width : view.height);

					grid.addView(n, sizing, [1]);

					assert.deepStrictEqual({
						initial,
						root: [0, 1, 2, 3].map(index => {
							const size = grid.getViewSize([index]);
							return horizontal ? size.width : size.height;
						}),
						nested: [d, e].map(view => horizontal ? view.width : view.height),
						cross: [d, e].map(view => horizontal ? view.height : view.width)
					}, {
						initial: [400, 400],
						root: [600, 600, 600, 600],
						nested: participation === 'proportional' ? [300, 300] : [360, 240],
						cross: [70, 70]
					});
				});
			}
		}
	}

	for (const orientation of [Orientation.HORIZONTAL, Orientation.VERTICAL]) {
		test(`nested constrained removal preserves descendant geometry (${orientation})`, () => {
			class EditorView extends TestView {
				get proportionalLayout(): boolean {
					return this.width === 0 || !(this.width === this.minimumWidth || this.height === this.minimumHeight);
				}
			}
			const horizontal = orientation === Orientation.HORIZONTAL;
			const grid = store.add(new GridView());
			grid.orientation = orientation;
			grid.layout(horizontal ? 2400 : 1000, horizontal ? 1000 : 2400);
			const createView = (maximum = Number.POSITIVE_INFINITY) => store.add(new EditorView(
				horizontal ? 220 : 70, horizontal ? maximum : Number.POSITIVE_INFINITY,
				horizontal ? 70 : 220, horizontal ? Number.POSITIVE_INFINITY : maximum
			));
			const [a, b, d, f, n] = Array.from({ length: 5 }, () => createView());
			const e = createView(350);
			grid.addView(a, 600, [0]);
			grid.addView(b, 600, [1]);
			grid.addView(d, 600, [2]);
			grid.addView(n, 600, [1]);
			grid.addView(f, 500, [3, 1]);
			grid.addView(e, 300, [3, 0, 1]);
			for (let index = 0; index < 3; index++) {
				grid.resizeView([index], horizontal ? { width: 600 } : { height: 600 });
			}
			grid.resizeView([3, 0, 0], { width: horizontal ? 300 : 70, height: horizontal ? 70 : 300 });
			const initial = [d, e].map(view => horizontal ? view.width : view.height);

			grid.removeView([1], Sizing.Distribute);

			assert.deepStrictEqual({
				initial,
				nested: [d, e].map(view => horizontal ? view.width : view.height),
				root: [0, 1, 2].map(index => {
					const size = grid.getViewSize([index]);
					return horizontal ? size.width : size.height;
				})
			}, { initial: [300, 300], nested: [580, 220], root: [800, 800, 800] });
		});
	}

	test('empty gridview is empty', function () {
		const gridview = createGridView();
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), []);
	});

	test('gridview addView', function () {
		const gridview = createGridView();

		const view = store.add(new TestView(20, 20, 20, 20));
		assert.throws(() => gridview.addView(view, 200, []), 'empty location');
		assert.throws(() => gridview.addView(view, 200, [1]), 'index overflow');
		assert.throws(() => gridview.addView(view, 200, [0, 0]), 'hierarchy overflow');

		const views = [
			store.add(new TestView(20, 20, 20, 20)),
			store.add(new TestView(20, 20, 20, 20)),
			store.add(new TestView(20, 20, 20, 20))
		];

		gridview.addView(views[0], 200, [0]);
		gridview.addView(views[1], 200, [1]);
		gridview.addView(views[2], 200, [2]);

		assert.deepStrictEqual(nodesToArrays(gridview.getView()), views);
	});

	test('gridview addView nested', function () {
		const gridview = createGridView();

		const views = [
			store.add(new TestView(20, 20, 20, 20)),
			[
				store.add(new TestView(20, 20, 20, 20)),
				store.add(new TestView(20, 20, 20, 20))
			]
		];

		gridview.addView(views[0] as IView, 200, [0]);
		gridview.addView((views[1] as TestView[])[0] as IView, 200, [1]);
		gridview.addView((views[1] as TestView[])[1] as IView, 200, [1, 1]);

		assert.deepStrictEqual(nodesToArrays(gridview.getView()), views);
	});

	test('gridview addView deep nested', function () {
		const gridview = createGridView();

		const view1 = store.add(new TestView(20, 20, 20, 20));
		gridview.addView(view1 as IView, 200, [0]);
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), [view1]);

		const view2 = store.add(new TestView(20, 20, 20, 20));
		gridview.addView(view2 as IView, 200, [1]);
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), [view1, view2]);

		const view3 = store.add(new TestView(20, 20, 20, 20));
		gridview.addView(view3 as IView, 200, [1, 0]);
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), [view1, [view3, view2]]);

		const view4 = store.add(new TestView(20, 20, 20, 20));
		gridview.addView(view4 as IView, 200, [1, 0, 0]);
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), [view1, [[view4, view3], view2]]);

		const view5 = store.add(new TestView(20, 20, 20, 20));
		gridview.addView(view5 as IView, 200, [1, 0]);
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), [view1, [view5, [view4, view3], view2]]);

		const view6 = store.add(new TestView(20, 20, 20, 20));
		gridview.addView(view6 as IView, 200, [2]);
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), [view1, [view5, [view4, view3], view2], view6]);

		const view7 = store.add(new TestView(20, 20, 20, 20));
		gridview.addView(view7 as IView, 200, [1, 1]);
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), [view1, [view5, view7, [view4, view3], view2], view6]);

		const view8 = store.add(new TestView(20, 20, 20, 20));
		gridview.addView(view8 as IView, 200, [1, 1, 0]);
		assert.deepStrictEqual(nodesToArrays(gridview.getView()), [view1, [view5, [view8, view7], [view4, view3], view2], view6]);
	});

	test('simple layout', function () {
		const gridview = createGridView();
		gridview.layout(800, 600);

		const view1 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view1, 200, [0]);
		assert.deepStrictEqual(view1.size, [800, 600]);
		assert.deepStrictEqual(gridview.getViewSize([0]), { width: 800, height: 600 });

		const view2 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view2, 200, [0]);
		assert.deepStrictEqual(view1.size, [800, 400]);
		assert.deepStrictEqual(gridview.getViewSize([1]), { width: 800, height: 400 });
		assert.deepStrictEqual(view2.size, [800, 200]);
		assert.deepStrictEqual(gridview.getViewSize([0]), { width: 800, height: 200 });

		const view3 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view3, 200, [1, 1]);
		assert.deepStrictEqual(view1.size, [600, 400]);
		assert.deepStrictEqual(gridview.getViewSize([1, 0]), { width: 600, height: 400 });
		assert.deepStrictEqual(view2.size, [800, 200]);
		assert.deepStrictEqual(gridview.getViewSize([0]), { width: 800, height: 200 });
		assert.deepStrictEqual(view3.size, [200, 400]);
		assert.deepStrictEqual(gridview.getViewSize([1, 1]), { width: 200, height: 400 });

		const view4 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view4, 200, [0, 0]);
		assert.deepStrictEqual(view1.size, [600, 400]);
		assert.deepStrictEqual(gridview.getViewSize([1, 0]), { width: 600, height: 400 });
		assert.deepStrictEqual(view2.size, [600, 200]);
		assert.deepStrictEqual(gridview.getViewSize([0, 1]), { width: 600, height: 200 });
		assert.deepStrictEqual(view3.size, [200, 400]);
		assert.deepStrictEqual(gridview.getViewSize([1, 1]), { width: 200, height: 400 });
		assert.deepStrictEqual(view4.size, [200, 200]);
		assert.deepStrictEqual(gridview.getViewSize([0, 0]), { width: 200, height: 200 });

		const view5 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view5, 100, [1, 0, 1]);
		assert.deepStrictEqual(view1.size, [600, 300]);
		assert.deepStrictEqual(gridview.getViewSize([1, 0, 0]), { width: 600, height: 300 });
		assert.deepStrictEqual(view2.size, [600, 200]);
		assert.deepStrictEqual(gridview.getViewSize([0, 1]), { width: 600, height: 200 });
		assert.deepStrictEqual(view3.size, [200, 400]);
		assert.deepStrictEqual(gridview.getViewSize([1, 1]), { width: 200, height: 400 });
		assert.deepStrictEqual(view4.size, [200, 200]);
		assert.deepStrictEqual(gridview.getViewSize([0, 0]), { width: 200, height: 200 });
		assert.deepStrictEqual(view5.size, [600, 100]);
		assert.deepStrictEqual(gridview.getViewSize([1, 0, 1]), { width: 600, height: 100 });
	});

	test('simple layout with automatic size distribution', function () {
		const gridview = createGridView();
		gridview.layout(800, 600);

		const view1 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view1, Sizing.Distribute, [0]);
		assert.deepStrictEqual(view1.size, [800, 600]);
		assert.deepStrictEqual(gridview.getViewSize([0]), { width: 800, height: 600 });

		const view2 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view2, Sizing.Distribute, [0]);
		assert.deepStrictEqual(view1.size, [800, 300]);
		assert.deepStrictEqual(view2.size, [800, 300]);

		const view3 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view3, Sizing.Distribute, [1, 1]);
		assert.deepStrictEqual(view1.size, [400, 300]);
		assert.deepStrictEqual(view2.size, [800, 300]);
		assert.deepStrictEqual(view3.size, [400, 300]);

		const view4 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view4, Sizing.Distribute, [0, 0]);
		assert.deepStrictEqual(view1.size, [400, 300]);
		assert.deepStrictEqual(view2.size, [400, 300]);
		assert.deepStrictEqual(view3.size, [400, 300]);
		assert.deepStrictEqual(view4.size, [400, 300]);

		const view5 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view5, Sizing.Distribute, [1, 0, 1]);
		assert.deepStrictEqual(view1.size, [400, 150]);
		assert.deepStrictEqual(view2.size, [400, 300]);
		assert.deepStrictEqual(view3.size, [400, 300]);
		assert.deepStrictEqual(view4.size, [400, 300]);
		assert.deepStrictEqual(view5.size, [400, 150]);
	});

	test('addviews before layout call 1', function () {
		const gridview = createGridView();

		const view1 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view1, 200, [0]);

		const view2 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view2, 200, [0]);

		const view3 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view3, 200, [1, 1]);

		gridview.layout(800, 600);

		assert.deepStrictEqual(view1.size, [400, 300]);
		assert.deepStrictEqual(view2.size, [800, 300]);
		assert.deepStrictEqual(view3.size, [400, 300]);
	});

	test('addviews before layout call 2', function () {
		const gridview = createGridView();
		const view1 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view1, 200, [0]);

		const view2 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view2, 200, [0]);

		const view3 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view3, 200, [0, 0]);

		gridview.layout(800, 600);

		assert.deepStrictEqual(view1.size, [800, 300]);
		assert.deepStrictEqual(view2.size, [400, 300]);
		assert.deepStrictEqual(view3.size, [400, 300]);
	});

	test('flipping orientation should preserve absolute offsets', function () {
		const gridview = createGridView();
		const view1 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view1, 200, [0]);

		const view2 = store.add(new TestView(50, Number.POSITIVE_INFINITY, 50, Number.POSITIVE_INFINITY));
		gridview.addView(view2, 200, [1]);

		gridview.layout(800, 600, 100, 200);

		assert.deepStrictEqual([view1.top, view1.left], [100, 200]);
		assert.deepStrictEqual([view2.top, view2.left], [100 + 300, 200]);

		gridview.orientation = Orientation.HORIZONTAL;

		assert.deepStrictEqual([view1.top, view1.left], [100, 200]);
		assert.deepStrictEqual([view2.top, view2.left], [100, 200 + 400]);
	});
});
