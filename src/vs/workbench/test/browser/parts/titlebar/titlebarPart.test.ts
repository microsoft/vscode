/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserTitlebarPart } from '../../../../browser/parts/titlebar/titlebarPart.js';

suite('Workbench - Titlebar Part', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const updateTitleBarToolBarOverflow = Reflect.get(BrowserTitlebarPart.prototype, 'updateTitleBarToolBarOverflow') as (this: BrowserTitlebarPart) => void;

	test('hides optional toolbar groups in priority order', () => {
		let rootClientWidth = 130;
		const centerAdjacentToolBar = mainWindow.document.createElement('div');
		const updateToolBar = mainWindow.document.createElement('div');
		const root = createMeasuredElement(
			() => rootClientWidth,
			() => 100 + visibleWidth(centerAdjacentToolBar, 30) + visibleWidth(updateToolBar, 30)
		);
		const titlebarPart = Object.create(BrowserTitlebarPart.prototype) as BrowserTitlebarPart;
		Reflect.set(titlebarPart, 'rootContainer', root);
		Reflect.set(titlebarPart, 'centerAdjacentToolBarElement', centerAdjacentToolBar);
		Reflect.set(titlebarPart, 'updateToolBarElement', updateToolBar);

		updateTitleBarToolBarOverflow.call(titlebarPart);
		const centerHiddenFirst = [centerAdjacentToolBar, updateToolBar].map(element => element.classList.contains('overflowing'));

		rootClientWidth = 100;
		updateTitleBarToolBarOverflow.call(titlebarPart);
		const bothHidden = [centerAdjacentToolBar, updateToolBar].map(element => element.classList.contains('overflowing'));

		rootClientWidth = 160;
		updateTitleBarToolBarOverflow.call(titlebarPart);
		const bothVisible = [centerAdjacentToolBar, updateToolBar].map(element => element.classList.contains('overflowing'));

		assert.deepStrictEqual({ centerHiddenFirst, bothHidden, bothVisible }, {
			centerHiddenFirst: [true, false],
			bothHidden: [true, true],
			bothVisible: [false, false],
		});
	});
});

function createMeasuredElement(clientWidth: () => number, scrollWidth: () => number): HTMLElement {
	const element = mainWindow.document.createElement('div');
	Object.defineProperties(element, {
		clientWidth: { get: clientWidth },
		scrollWidth: { get: scrollWidth },
	});
	return element;
}

function visibleWidth(element: HTMLElement, width: number): number {
	return element.classList.contains('overflowing') || element.classList.contains('has-no-actions') ? 0 : width;
}
