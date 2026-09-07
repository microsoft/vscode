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
	static instance: TestResizeObserver | undefined;
	private observedTarget: Element | undefined;
	observedBox: ResizeObserverBoxOptions | undefined;

	constructor(private readonly callback: ResizeObserverCallback) {
		TestResizeObserver.instance = this;
	}

	observe(target: Element, options?: ResizeObserverOptions): void {
		this.observedTarget = target;
		this.observedBox = options?.box;
	}

	unobserve(): void { }
	disconnect(): void { }
	takeRecords(): ResizeObserverEntry[] { return []; }

	fire(height: number): void {
		assert.ok(this.observedTarget);
		const size: ResizeObserverSize = { inlineSize: 0, blockSize: height };
		this.callback([{
			target: this.observedTarget,
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
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stubInstance(MenuWorkbenchToolBar, { dispose: () => { } });
		const control = disposables.add(instantiationService.createInstance(
			ChatViewTitleControl,
			container,
			{ focusChat: () => { } },
			TestResizeObserver
		));
		const resizeObserver = TestResizeObserver.instance;
		assert.ok(resizeObserver);
		const observedHeights: number[] = [];
		disposables.add(control.onDidChangeHeight(() => observedHeights.push(control.getHeight())));

		resizeObserver.fire(22);
		resizeObserver.fire(22);
		resizeObserver.fire(0);

		assert.deepStrictEqual({
			height: control.getHeight(),
			observedHeights,
			observedBox: resizeObserver.observedBox
		}, {
			height: 0,
			observedHeights: [22, 0],
			observedBox: 'border-box'
		});
	});
});
