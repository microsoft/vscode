/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { Toggle } from '../../../../../base/browser/ui/toggle/toggle.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { defaultToggleStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import '../../../../browser/media/style.css';
import '../../browser/media/gettingStarted.css';

suite('Getting started focus styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		// Hidden Electron windows do not match focus pseudo-classes; run these tests in a browser.
		if (!mainWindow.document.hasFocus()) {
			this.skip();
		}
	});

	for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
		for (const checked of [false, true]) {
			test(`startup checkbox has a focus outline in ${theme} when checked=${checked}`, () => {
				const container = append(mainWindow.document.body, $(`.monaco-workbench.${theme}`));
				store.add(toDisposable(() => container.remove()));
				container.style.setProperty('--vscode-focusBorder', '#0078d4');
				container.style.setProperty('--vscode-checkbox-border', '#888888');
				container.style.setProperty('--vscode-strokeThickness', '1px');
				container.style.setProperty('--vscode-spacing-size40', '4px');
				container.style.width = '800px';

				const content = append(append(container, $('.part.editor')), $('.content'));
				content.style.height = '400px';
				const slide = append(append(content, $('.gettingStartedContainer')), $('.gettingStartedSlide.gettingStartedSlideCategories'));
				const categories = append(slide, $('.gettingStartedCategoriesContainer'));
				const footer = append(categories, $('.footer'));
				const startup = append(footer, $('p.showOnStartup'));
				const toggle = store.add(new Toggle({
					icon: Codicon.check,
					actionClassName: 'getting-started-checkbox',
					isChecked: checked,
					title: 'Show welcome page on startup',
					...defaultToggleStyles
				}));
				append(startup, toggle.domNode);
				append(startup, $('label', {}, 'Show welcome page on startup'));
				const input = append(container, $('input', { type: 'text' }));
				input.focus();
				toggle.focus();

				const style = mainWindow.getComputedStyle(toggle.domNode);
				const checkboxBounds = toggle.domNode.getBoundingClientRect();
				const footerBounds = footer.getBoundingClientRect();
				const outlineExtent = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
				assert.deepStrictEqual({
					focused: mainWindow.document.activeElement === toggle.domNode,
					focusVisible: toggle.domNode.matches(':focus-visible'),
					outlineStyle: style.outlineStyle,
					outlineWidth: style.outlineWidth,
					outlineColor: style.outlineColor,
					outlineOffset: style.outlineOffset,
					outlineContained: checkboxBounds.top - outlineExtent >= footerBounds.top
						&& checkboxBounds.bottom + outlineExtent <= footerBounds.bottom
						&& checkboxBounds.left - outlineExtent >= footerBounds.left
						&& checkboxBounds.right + outlineExtent <= footerBounds.right,
					checked: toggle.domNode.getAttribute('aria-checked'),
				}, {
					focused: true,
					focusVisible: true,
					outlineStyle: 'solid',
					outlineWidth: '1px',
					outlineColor: 'rgb(0, 120, 212)',
					outlineOffset: '2px',
					outlineContained: true,
					checked: String(checked),
				});
			});
		}
	}
});
