/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TitlebarPart } from '../../browser/parts/titlebarPart.js';

suite('Sessions - Titlebar Part', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const updateTitleBarToolBarOverflow = Reflect.get(TitlebarPart.prototype, 'updateTitleBarToolBarOverflow') as (this: TitlebarPart) => void;

	test('hides optional toolbar groups when a titlebar section overflows', () => {
		let centerClientWidth = 60;
		let rightClientWidth = 60;
		const root = createMeasuredElement(() => 100, () => 100);
		const left = createMeasuredElement(() => 20, () => 20);
		const toolBars = [20, 20, 20, 20, 20].map(() => mainWindow.document.createElement('div'));
		const center = createMeasuredElement(
			() => centerClientWidth,
			() => 40 + visibleWidth(toolBars[0], 20) + visibleWidth(toolBars[1], 20)
		);
		const right = createMeasuredElement(
			() => rightClientWidth,
			() => 40 + visibleWidth(toolBars[2], 20) + visibleWidth(toolBars[3], 20) + visibleWidth(toolBars[4], 20)
		);
		const titlebarPart = Object.create(TitlebarPart.prototype) as TitlebarPart;
		Reflect.set(titlebarPart, 'rootContainer', root);
		Reflect.set(titlebarPart, 'leftContent', left);
		Reflect.set(titlebarPart, 'centerContent', center);
		Reflect.set(titlebarPart, 'rightContent', right);
		Reflect.set(titlebarPart, 'overflowManagedToolBarElements', toolBars);

		updateTitleBarToolBarOverflow.call(titlebarPart);
		const constrained = toolBars.map(element => element.classList.contains('overflowing'));

		centerClientWidth = 100;
		rightClientWidth = 100;
		updateTitleBarToolBarOverflow.call(titlebarPart);
		const expanded = toolBars.map(element => element.classList.contains('overflowing'));

		assert.deepStrictEqual({ constrained, expanded }, {
			constrained: [true, true, true, true, false],
			expanded: [false, false, false, false, false],
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
