/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { ChatViewTitleControl } from '../../../../browser/widgetHosts/viewPane/chatViewTitleControl.js';

class TestResizeObserver implements ResizeObserver {
	private callback: ResizeObserverCallback | undefined;
	private target: Element | undefined;

	readonly create = (callback: ResizeObserverCallback): ResizeObserver => {
		this.callback = callback;
		return this;
	};

	observe(target: Element): void {
		this.target = target;
	}

	unobserve(): void { }
	disconnect(): void { }
	takeRecords(): ResizeObserverEntry[] { return []; }

	fire(height: number): void {
		assert.ok(this.target);
		const size: ResizeObserverSize = { inlineSize: 0, blockSize: height };
		this.callback?.([{
			target: this.target,
			contentRect: DOMRectReadOnly.fromRect({ height }),
			borderBoxSize: [size],
			contentBoxSize: [size],
			devicePixelContentBoxSize: [size],
		}], this);
	}
}

suite('ChatViewTitleControl', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks height changes from ResizeObserver', () => {
		const container = document.createElement('div');
		const resizeObserver = new TestResizeObserver();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stubInstance(MenuWorkbenchToolBar, { dispose: () => { } });
		const control = disposables.add(instantiationService.createInstance(
			ChatViewTitleControl,
			container,
			{ focusChat: () => { } },
			resizeObserver.create
		));
		let heightChangeCount = 0;
		disposables.add(control.onDidChangeHeight(() => heightChangeCount++));

		resizeObserver.fire(22);
		resizeObserver.fire(22);
		resizeObserver.fire(0);

		assert.deepStrictEqual({
			height: control.getHeight(),
			heightChangeCount
		}, {
			height: 0,
			heightChangeCount: 2
		});
	});
});
