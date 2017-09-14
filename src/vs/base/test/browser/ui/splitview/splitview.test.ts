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
		container.style.width = '200px';
		container.style.height = '200px';
	});

	teardown(() => {
		container = null;
	});

	test('empty splitview has empty DOM', () => {
		const splitview = new SplitView(container);
		assert.equal(container.firstElementChild.childElementCount, 0, 'split view should be empty');
		splitview.dispose();
	});

	test('splitview has views as sashes as children', () => {
		const view = new TestView(20, 20);
		const splitview = new SplitView(container);

		splitview.addView(view, 20);
		splitview.addView(view, 20);
		splitview.addView(view, 20);

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
		view.dispose();
	});
});