/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { SplitView, IView, Orientation } from 'vs/base/browser/ui/splitview/splitview2';

class TestView implements IView {

	private _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	get minimumSize(): number { return this._minimumSize; }
	set minimumSize(size: number) { this._minimumSize = size; this._onDidChange.fire(); }

	get maximumSize(): number { return this._maximumSize; }
	set maximumSize(size: number) { this._maximumSize = size; this._onDidChange.fire(); }

	private _onDidRender = new Emitter<{ container: HTMLElement; orientation: Orientation }>();
	readonly onDidRender = this._onDidRender.event;

	private _size = 0;
	get size(): number { return this._size; }
	private _onDidLayout = new Emitter<{ size: number; orientation: Orientation }>();
	readonly onDidLayout = this._onDidLayout.event;

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus = this._onDidFocus.event;

	constructor(
		private _minimumSize: number,
		private _maximumSize: number
	) {
		assert(_minimumSize <= _maximumSize, 'splitview view minimum size must be <= maximum size');
	}

	render(container: HTMLElement, orientation: Orientation): void {
		this._onDidRender.fire({ container, orientation });
	}

	layout(size: number, orientation: Orientation): void {
		this._size = size;
		this._onDidLayout.fire({ size, orientation });
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

suite('Splitview', () => {
	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.width = `${200}px`;
		container.style.height = `${200}px`;
	});

	teardown(() => {
		container = null;
	});

	test('empty splitview has empty DOM', () => {
		const splitview = new SplitView(container);
		assert.equal(container.firstElementChild.childElementCount, 0, 'split view should be empty');
		splitview.dispose();
	});

	test('has views as sashes as children', () => {
		const view1 = new TestView(20, 20);
		const view2 = new TestView(20, 20);
		const view3 = new TestView(20, 20);
		const splitview = new SplitView(container);

		splitview.addView(view1, 20);
		splitview.addView(view2, 20);
		splitview.addView(view3, 20);

		let viewQuery = container.querySelectorAll('.monaco-split-view > .split-view-view');
		assert.equal(viewQuery.length, 3, 'split view should have 3 views');

		let sashQuery = container.querySelectorAll('.monaco-split-view > .monaco-sash');
		assert.equal(sashQuery.length, 2, 'split view should have 2 sashes');

		splitview.removeView(2);

		viewQuery = container.querySelectorAll('.monaco-split-view > .split-view-view');
		assert.equal(viewQuery.length, 2, 'split view should have 2 views');

		sashQuery = container.querySelectorAll('.monaco-split-view > .monaco-sash');
		assert.equal(sashQuery.length, 1, 'split view should have 1 sash');

		splitview.removeView(0);

		viewQuery = container.querySelectorAll('.monaco-split-view > .split-view-view');
		assert.equal(viewQuery.length, 1, 'split view should have 1 view');

		sashQuery = container.querySelectorAll('.monaco-split-view > .monaco-sash');
		assert.equal(sashQuery.length, 0, 'split view should have no sashes');

		splitview.removeView(0);

		viewQuery = container.querySelectorAll('.monaco-split-view > .split-view-view');
		assert.equal(viewQuery.length, 0, 'split view should have no views');

		sashQuery = container.querySelectorAll('.monaco-split-view > .monaco-sash');
		assert.equal(sashQuery.length, 0, 'split view should have no sashes');

		splitview.dispose();
		view1.dispose();
		view2.dispose();
		view3.dispose();
	});

	test('calls view methods on addView and removeView', () => {
		const view = new TestView(20, 20);
		const splitview = new SplitView(container);

		let didLayout = false;
		const layoutDisposable = view.onDidLayout(() => didLayout = true);

		let didRender = false;
		const renderDisposable = view.onDidRender(() => didRender = true);

		splitview.addView(view, 20);

		assert.equal(view.size, 20, 'view has right size');
		assert(didLayout, 'layout is called');
		assert(didLayout, 'render is called');

		splitview.dispose();
		layoutDisposable.dispose();
		renderDisposable.dispose();
		view.dispose();
	});

	test('stretches view to viewport', () => {
		const view = new TestView(20, Number.POSITIVE_INFINITY);
		const splitview = new SplitView(container);
		splitview.layout(200);

		splitview.addView(view, 20);
		assert.equal(view.size, 200, 'view is stretched');

		splitview.layout(200);
		assert.equal(view.size, 200, 'view stayed the same');

		splitview.layout(100);
		assert.equal(view.size, 100, 'view is collapsed');

		splitview.layout(20);
		assert.equal(view.size, 20, 'view is collapsed');

		splitview.layout(10);
		assert.equal(view.size, 20, 'view is clamped');

		splitview.layout(200);
		assert.equal(view.size, 200, 'view is stretched');

		splitview.dispose();
		view.dispose();
	});

	test('respects preferred sizes with structural changes', () => {
		const view1 = new TestView(20, Number.POSITIVE_INFINITY);
		const view2 = new TestView(20, Number.POSITIVE_INFINITY);
		const view3 = new TestView(20, Number.POSITIVE_INFINITY);
		const splitview = new SplitView(container);
		splitview.layout(200);

		splitview.addView(view1, 20);
		assert.equal(view1.size, 200, 'view1 is stretched');

		splitview.addView(view2, 20);
		assert.equal(view1.size, 20, 'view1 size is restored');
		assert.equal(view2.size, 200 - 20, 'view2 is stretched');

		splitview.addView(view3, 20);
		assert.equal(view1.size, 20, 'view1 size is restored');
		assert.equal(view2.size, 20, 'view2 size is restored');
		assert.equal(view3.size, 160, 'view3 is stretched');

		splitview.dispose();
		view3.dispose();
		view2.dispose();
		view1.dispose();
	});

	test('can resize views', () => {
		const view1 = new TestView(20, Number.POSITIVE_INFINITY);
		const view2 = new TestView(20, Number.POSITIVE_INFINITY);
		const view3 = new TestView(20, Number.POSITIVE_INFINITY);
		const splitview = new SplitView(container);
		splitview.layout(200);

		splitview.addView(view1, 20);
		splitview.addView(view2, 20);
		splitview.addView(view3, 20);

		assert.equal(view1.size, 20, 'view1 size is the default');
		assert.equal(view2.size, 20, 'view2 size the the default');
		assert.equal(view3.size, 160, 'view3 is stretched');

		splitview.resizeView(1, 40);

		assert.equal(view1.size, 20, 'view1 is untouched');
		assert.equal(view2.size, 40, 'view2 is stretched');
		assert.equal(view3.size, 140, 'view3 is collapsed');

		splitview.resizeView(0, 70);

		assert.equal(view1.size, 70, 'view1 is stretched');
		assert.equal(view2.size, 20, 'view2 is collapsed');
		assert.equal(view3.size, 110, 'view3 is collapsed');

		splitview.resizeView(2, 20);

		assert.equal(view1.size, 70, 'view1 is stretched');
		assert.equal(view2.size, 110, 'view2 is stretched');
		assert.equal(view3.size, 20, 'view3 is collapsed only to minimum size');

		splitview.dispose();
		view3.dispose();
		view2.dispose();
		view1.dispose();
	});
});