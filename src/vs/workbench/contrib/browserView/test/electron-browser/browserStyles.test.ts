/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../electron-browser/media/browser.css';
import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Browser Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies the configured per-corner radii to the container and placeholder', () => {
		const root = append(mainWindow.document.body, $('.browser-root'));
		store.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-cornerRadius-small', '4px');
		const browserContainer = append(root, $('.browser-container'));
		browserContainer.style.setProperty('--browser-view-bottom-right-corner-radius', '12px');
		const placeholder = append(browserContainer, $('.browser-placeholder-contents'));
		const screenshot = append(placeholder, $('.browser-placeholder-screenshot.browser-placeholder-screenshot--corner-fill'));

		const radius = (element: HTMLElement) => {
			const style = mainWindow.getComputedStyle(element);
			return {
				topLeft: style.borderTopLeftRadius,
				bottomLeft: style.borderBottomLeftRadius,
				bottomRight: style.borderBottomRightRadius,
			};
		};

		assert.deepStrictEqual({
			container: radius(browserContainer),
			placeholder: radius(placeholder),
			cornerFillBackgroundSize: mainWindow.getComputedStyle(screenshot).backgroundSize,
		}, {
			container: { topLeft: '4px', bottomLeft: '4px', bottomRight: '12px' },
			placeholder: { topLeft: '4px', bottomLeft: '4px', bottomRight: '12px' },
			cornerFillBackgroundSize: 'calc(100% + 24px) calc(100% + 24px)',
		});
	});
});
