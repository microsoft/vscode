/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { GridView, IView, GridNode, GridBranchNode, getRelativeLocation, Direction, GridWidget } from 'vs/base/browser/ui/grid/gridview';
import { Orientation } from 'vs/base/browser/ui/sash/sash';

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

	private _element: HTMLElement = document.createElement('div');
	get element(): HTMLElement { this._onDidGetElement.fire(); return this._element; }

	private _onDidGetElement = new Emitter<void>();
	readonly onDidGetElement = this._onDidGetElement.event;

	private _width = 0;
	get width(): number { return this._width; }

	private _height = 0;
	get height(): number { return this._height; }

	get size(): [number, number] { return [this.width, this.height]; }

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
		this._onDidGetElement.dispose();
		this._onDidLayout.dispose();
		this._onDidFocus.dispose();
	}
}

function nodesToArrays(node: GridNode): any {
	if (node instanceof GridBranchNode) {
		return node.children.map(nodesToArrays);
	} else {
		return node.view;
	}
}

suite('Gridview', function () {
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

	test('getRelativeLocation', function () {
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Up), [0]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Down), [1]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Left), [0, 0]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Right), [0, 1]);

		assert.deepEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Up), [0, 0]);
		assert.deepEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Down), [0, 1]);
		assert.deepEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Left), [0]);
		assert.deepEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Right), [1]);

		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Up), [4]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Down), [5]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Left), [4, 0]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Right), [4, 1]);

		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Up), [0, 0, 0]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Down), [0, 0, 1]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Left), [0, 0]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Right), [0, 1]);

		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Up), [1, 2, 0]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Down), [1, 2, 1]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Left), [1, 2]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Right), [1, 3]);

		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Up), [1, 2, 3]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Down), [1, 2, 4]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Left), [1, 2, 3, 0]);
		assert.deepEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Right), [1, 2, 3, 1]);
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

suite('GridWidget', function () {
	let container: HTMLElement;

	setup(function () {
		container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.width = `${800}px`;
		container.style.height = `${600}px`;
	});

	teardown(function () {
		container = null;
	});

	test('empty', function () {
		const view1 = new TestView(100, Number.MAX_VALUE, 100, Number.MAX_VALUE);
		const gridview = new GridWidget(container, view1);
		gridview.layout(800, 600);

		assert.deepEqual(view1.size, [800, 600]);
	});

	test('two views vertically', function () {
		const view1 = new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE);
		const grid = new GridWidget(container, view1);
		grid.layout(800, 600);
		assert.deepEqual(view1.size, [800, 600]);

		const view2 = new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE);
		grid.splitView(view1, Direction.Up, view2, 200);
		assert.deepEqual(view1.size, [800, 400]);
		assert.deepEqual(view2.size, [800, 200]);
	});

	test('two views horizontally', function () {
		const view1 = new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE);
		const grid = new GridWidget(container, view1);
		grid.layout(800, 600);
		assert.deepEqual(view1.size, [800, 600]);

		const view2 = new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE);
		grid.splitView(view1, Direction.Right, view2, 300);
		assert.deepEqual(view1.size, [500, 600]);
		assert.deepEqual(view2.size, [300, 600]);
	});
});