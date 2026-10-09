/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { syncToAnchor } from '../../browser/overlayLayoutElement.js';
import { mainWindow } from '../../browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('OverlayLayoutElement', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('syncToAnchor', () => {

		let container: HTMLElement;
		let anchor: HTMLElement;

		setup(() => {
			container = document.createElement('div');
			mainWindow.document.body.appendChild(container);

			anchor = document.createElement('div');
			anchor.style.position = 'absolute';
			anchor.style.left = '30px';
			anchor.style.top = '40px';
			anchor.style.width = '200px';
			anchor.style.height = '100px';
			container.appendChild(anchor);
		});

		teardown(() => {
			container.remove();
		});

		function rectOf(element: HTMLElement) {
			const rect = element.getBoundingClientRect();
			return [rect.left, rect.top, rect.width, rect.height].map(Math.round);
		}

		function createElement(styles: Partial<CSSStyleDeclaration>): HTMLElement {
			const element = document.createElement('div');
			Object.assign(element.style, styles);
			container.appendChild(element);
			return element;
		}

		test('moves and resizes a fixed element onto its anchor', () => {
			const element = createElement({ position: 'fixed', left: '0px', top: '0px', width: '10px', height: '10px' });
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), rectOf(anchor));
		});

		test('places an element that has no position or size yet', () => {
			const element = createElement({ position: 'fixed' });
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), rectOf(anchor));
		});

		test('accounts for the containing block of an absolutely positioned element', () => {
			const parent = createElement({ position: 'absolute', left: '7px', top: '11px', width: '500px', height: '500px' });
			const element = document.createElement('div');
			element.style.position = 'absolute';
			parent.appendChild(element);
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), rectOf(anchor));
		});

		test('does not touch an element that already matches its anchor', () => {
			const element = createElement({ position: 'fixed' });
			syncToAnchor(element, anchor);
			const before = element.getAttribute('style');
			syncToAnchor(element, anchor);
			assert.strictEqual(element.getAttribute('style'), before);
		});

		test('ignores anchors that are not rendered', () => {
			const element = createElement({ position: 'fixed', left: '1px', top: '2px', width: '3px', height: '4px' });
			anchor.style.display = 'none';
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), [1, 2, 3, 4]);

			anchor.remove();
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), [1, 2, 3, 4]);
		});
	});
});
