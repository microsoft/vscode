/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { GridView, IView, GridNode, GridBranchNode } from 'vs/base/browser/ui/grid/gridview';

class TestView implements IView {

	private _onDidChange = new Emitter<{ width: number; height: number; }>();
	readonly onDidChange = this._onDidChange.event;

	get minimumWidth(): number { return this._minimumWidth; }
	set minimumWidth(size: number) { this._minimumWidth = size; this._onDidChange.fire(); }

	get maximumWidth(): number { return this._maximumWidth; }
	set maximumWidth(size: number) { this._maximumWidth = size; this._onDidChange.fire(); }

	get minimumHeight(): number { return this._minimumHeight; }
	set minimumHeight(size: number) { this._minimumHeight = size; this._onDidChange.fire(); }

	get maximumHeight(): number { return this._maximumHeight; }
	set maximumHeight(size: number) { this._maximumHeight = size; this._onDidChange.fire(); }

	private _onDidRender = new Emitter<{ container: HTMLElement }>();
	readonly onDidRender = this._onDidRender.event;

	private _width = 0;
	get width(): number { return this._width; }

	private _height = 0;
	get height(): number { return this._height; }

	private _onDidLayout = new Emitter<{ width: number; height: number; }>();
	readonly onDidLayout = this._onDidLayout.event;

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus = this._onDidFocus.event;

	constructor(
		private _minimumWidth: number,
		private _maximumWidth: number,
		private _minimumHeight: number,
		private _maximumHeight: number
	) {
		assert(_minimumWidth <= _maximumWidth, 'gridview view minimum width must be <= maximum width');
		assert(_minimumHeight <= _maximumHeight, 'gridview view minimum height must be <= maximum height');
	}

	render(container: HTMLElement): void {
		this._onDidRender.fire({ container });
	}

	layout(width: number, height: number): void {
		this._width = width;
		this._height = height;
		this._onDidLayout.fire({ width, height });
	}

	focus(): void {
		this._onDidFocus.fire();
	}

	dispose(): void {
		this._onDidChange.dispose();
		this._onDidRender.dispose();
		this._onDidLayout.dispose();
		this._onDidFocus.dispose();
	}
}

function nodesToArrays(node: GridNode<any>): any {
	if (node instanceof GridBranchNode) {
		return node.children.map(nodesToArrays);
	} else {
		return node.view;
	}
}

suite('GridView', function () {
	let container: HTMLElement;

	setup(function () {
		container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.width = `${200}px`;
		container.style.height = `${200}px`;
	});

	teardown(function () {
		container = null;
	});

	test('empty gridview is empty', function () {
		const gridview = new GridView(container);
		assert.deepEqual(gridview.getViews(), { children: [] });
		gridview.dispose();
	});

	test('gridview addView', function () {
		const gridview = new GridView(container);

		const view = new TestView(20, 20, 20, 20);
		assert.throws(() => gridview.addView(view, 200, []), 'empty location');
		assert.throws(() => gridview.addView(view, 200, [1]), 'index overflow');
		assert.throws(() => gridview.addView(view, 200, [0, 0]), 'hierarchy overflow');

		const views = [
			new TestView(20, 20, 20, 20),
			new TestView(20, 20, 20, 20),
			new TestView(20, 20, 20, 20)
		];

		gridview.addView(views[0], 200, [0]);
		gridview.addView(views[1], 200, [1]);
		gridview.addView(views[2], 200, [2]);

		assert.deepEqual(nodesToArrays(gridview.getViews()), views);

		gridview.dispose();
	});

	test('gridview addView nested', function () {
		const gridview = new GridView(container);

		const views = [
			new TestView(20, 20, 20, 20),
			[
				new TestView(20, 20, 20, 20),
				new TestView(20, 20, 20, 20)
			]
		];

		gridview.addView(views[0] as IView, 200, [0]);
		gridview.addView(views[1][0] as IView, 200, [1]);
		gridview.addView(views[1][1] as IView, 200, [1, 1]);

		assert.deepEqual(nodesToArrays(gridview.getViews()), views);

		gridview.dispose();
	});

	test('gridview addView deep nested', function () {
		const gridview = new GridView(container);

		const view1 = new TestView(20, 20, 20, 20);
		gridview.addView(view1 as IView, 200, [0]);
		assert.deepEqual(nodesToArrays(gridview.getViews()), [view1]);

		const view2 = new TestView(20, 20, 20, 20);
		gridview.addView(view2 as IView, 200, [1]);
		assert.deepEqual(nodesToArrays(gridview.getViews()), [view1, view2]);

		const view3 = new TestView(20, 20, 20, 20);
		gridview.addView(view3 as IView, 200, [1, 0]);
		assert.deepEqual(nodesToArrays(gridview.getViews()), [view1, [view3, view2]]);

		const view4 = new TestView(20, 20, 20, 20);
		gridview.addView(view4 as IView, 200, [1, 0, 0]);
		assert.deepEqual(nodesToArrays(gridview.getViews()), [view1, [[view4, view3], view2]]);

		const view5 = new TestView(20, 20, 20, 20);
		gridview.addView(view5 as IView, 200, [1, 0]);
		assert.deepEqual(nodesToArrays(gridview.getViews()), [view1, [view5, [view4, view3], view2]]);

		const view6 = new TestView(20, 20, 20, 20);
		gridview.addView(view6 as IView, 200, [2]);
		assert.deepEqual(nodesToArrays(gridview.getViews()), [view1, [view5, [view4, view3], view2], view6]);

		const view7 = new TestView(20, 20, 20, 20);
		gridview.addView(view7 as IView, 200, [1, 1]);
		assert.deepEqual(nodesToArrays(gridview.getViews()), [view1, [view5, view7, [view4, view3], view2], view6]);

		const view8 = new TestView(20, 20, 20, 20);
		gridview.addView(view8 as IView, 200, [1, 1, 0]);
		assert.deepEqual(nodesToArrays(gridview.getViews()), [view1, [view5, [view8, view7], [view4, view3], view2], view6]);

		gridview.dispose();
	});
});