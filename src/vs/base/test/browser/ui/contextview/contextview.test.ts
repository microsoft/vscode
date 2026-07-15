/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../browser/dom.js';
import { ContextView, ContextViewDOMPosition, IDelegate } from '../../../../browser/ui/contextview/contextview.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('ContextView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('hide() is re-entrant safe and does not double-dispose render result (#319393)', () => {
		const container = $('.container');
		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);

		let disposeCount = 0;
		const delegate: IDelegate = {
			getAnchor: () => ({ x: 0, y: 0 }),
			render: () => ({
				dispose: () => {
					disposeCount++;
					if (disposeCount === 1) {
						// Simulate a re-entrant hide() call (e.g. via a blur event
						// fired while removing the rendered DOM node from the document).
						contextView.hide();
					}
				}
			})
		};

		contextView.show(delegate);

		assert.doesNotThrow(() => contextView.hide());
		assert.strictEqual(disposeCount, 1, 'render disposable must be disposed exactly once');

		contextView.dispose();
		container.remove();
	});

	test('shadow DOM host is layered with the context view', () => {
		const container = $('.container');
		const contextView = new ContextView(container, ContextViewDOMPosition.FIXED_SHADOW);
		const delegate: IDelegate = {
			getAnchor: () => ({ x: 0, y: 0 }),
			render: () => null,
			layer: 1
		};

		contextView.show(delegate);

		const shadowRootHost = container.getElementsByClassName('shadow-root-host')[0] as HTMLElement;
		assert.deepStrictEqual({
			position: shadowRootHost.style.position,
			top: shadowRootHost.style.top,
			left: shadowRootHost.style.left,
			width: shadowRootHost.style.width,
			height: shadowRootHost.style.height,
			zIndex: shadowRootHost.style.zIndex,
			contextViewZIndex: contextView.getViewElement().style.zIndex
		}, {
			position: 'fixed',
			top: '0px',
			left: '0px',
			width: '0px',
			height: '0px',
			zIndex: '2576',
			contextViewZIndex: '2576'
		});

		contextView.dispose();
		container.remove();
	});
});
