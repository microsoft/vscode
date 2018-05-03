/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Direction, Grid, getRelativeLocation, Orientation } from 'vs/base/browser/ui/grid/grid';
import { TestView } from './util';

suite('Grid', function () {
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

	test('empty', function () {
		const view1 = new TestView(100, Number.MAX_VALUE, 100, Number.MAX_VALUE);
		const gridview = new Grid(container, view1);
		gridview.layout(800, 600);

		assert.deepEqual(view1.size, [800, 600]);
	});

	test('two views vertically', function () {
		const view1 = new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE);
		const grid = new Grid(container, view1);
		grid.layout(800, 600);
		assert.deepEqual(view1.size, [800, 600]);

		const view2 = new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE);
		grid.addView(view1, Direction.Up, view2, 200);
		assert.deepEqual(view1.size, [800, 400]);
		assert.deepEqual(view2.size, [800, 200]);
	});

	test('two views horizontally', function () {
		const view1 = new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE);
		const grid = new Grid(container, view1);
		grid.layout(800, 600);
		assert.deepEqual(view1.size, [800, 600]);

		const view2 = new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE);
		grid.addView(view1, Direction.Right, view2, 300);
		assert.deepEqual(view1.size, [500, 600]);
		assert.deepEqual(view2.size, [300, 600]);
	});
});