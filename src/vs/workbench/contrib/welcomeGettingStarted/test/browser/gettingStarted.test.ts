/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { Toggle } from '../../../../../base/browser/ui/toggle/toggle.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Color } from '../../../../../base/common/color.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { defaultToggleStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import '../../../../browser/media/style.css';
import '../../../../browser/media/floatingPanels.css';
import '../../../modernUI/browser/media/editorBorder.css';
import '../../browser/media/gettingStarted.css';
import { GettingStartedFocusOutline, updateGettingStartedFocusOutlineRadius } from '../../browser/gettingStartedFocusOutline.js';

suite('Getting started focus styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		// Hidden Electron windows do not match focus pseudo-classes; run these tests in a browser.
		if (!mainWindow.document.hasFocus()) {
			this.skip();
		}
	});

	for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
		test(`document focus outline follows the floating editor corners in ${theme}`, () => {
			const container = append(mainWindow.document.body, $(`.monaco-workbench.modern-ui.floating-panels.${theme}`));
			store.add(toDisposable(() => container.remove()));
			container.style.cssText = '--vscode-focusBorder: #0078d4; --vscode-strokeThickness: 1px; --vscode-cornerRadius-large: 8px; width: 400px;';
			const editor = append(append(container, $('.monaco-grid-view')), $('.part.editor'));
			editor.style.cssText = 'position: relative; width: 400px; height: 300px; border: 1px solid transparent; box-sizing: border-box;';
			const content = append(editor, $('.content'));
			content.style.cssText = 'position: absolute; inset: 0;';
			const document = append(content, $('.gettingStartedContainer', { role: 'document', tabindex: 0 }));
			document.style.cssText = 'position: absolute; top: 30px; right: 0; bottom: 0; left: 0;';
			const input = append(container, $('input', { type: 'text' }));
			input.focus();
			document.focus();

			const readOutline = () => {
				updateGettingStartedFocusOutlineRadius(document);
				const style = document.classList.contains('focus-outline-rounded')
					? mainWindow.getComputedStyle(document, '::after')
					: mainWindow.getComputedStyle(document);
				return {
					focusVisible: document.matches(':focus-visible'),
					outline: style.outlineStyle,
					topLeft: style.borderTopLeftRadius,
					topRight: style.borderTopRightRadius,
					bottomLeft: style.borderBottomLeftRadius,
					bottomRight: style.borderBottomRightRadius,
				};
			};
			const states = [readOutline()];
			container.style.setProperty('--vscode-editorArea-cornerRadius', '16px');
			states.push(readOutline());
			container.classList.add('modern-ui-compact');
			states.push(readOutline());
			container.classList.remove('modern-ui-compact');
			container.style.setProperty('--vscode-editorArea-cornerRadius', '0px');
			states.push(readOutline());
			container.classList.add('mac', 'nostatusbar');
			container.style.setProperty('--window-corner-radius', '16px');
			container.style.setProperty('--vscode-spacing-size40', '4px');
			editor.classList.add('floating-editor-outer-left', 'floating-editor-outer-bottom');
			states.push(readOutline());
			editor.classList.add('floating-editor-outer-right');
			states.push(readOutline());
			container.classList.add('fullscreen');
			states.push(readOutline());
			container.classList.remove('mac', 'nostatusbar', 'fullscreen');
			input.focus();
			const unfocused = readOutline();
			document.focus();
			editor.classList.add('modal-editor-part');
			container.style.setProperty('--vscode-editorArea-cornerRadius', '16px');
			states.push(readOutline());
			editor.classList.remove('modal-editor-part');
			container.classList.remove('modern-ui', 'floating-panels');
			states.push(readOutline());

			const outline = (left: string, right: string) => ({
				topLeft: '0px',
				topRight: '0px',
				bottomLeft: left,
				bottomRight: right,
			});
			assert.deepStrictEqual({ states, unfocused }, {
				states: [
					['7px', '7px'], ['15px', '15px'], ['0px', '0px'], ['0px', '0px'],
					['11px', '0px'], ['11px', '11px'], ['0px', '0px'], ['0px', '0px'], ['0px', '0px'],
				].map(([left, right]) => ({ focusVisible: true, outline: 'solid', ...outline(left, right) })),
				unfocused: { focusVisible: false, outline: 'none', ...outline('0px', '0px') },
			});
		});

		test(`document focus outline only rounds exposed corners in ${theme}`, () => {
			const container = append(mainWindow.document.body, $(`.monaco-workbench.modern-ui.floating-panels.${theme}`));
			store.add(toDisposable(() => container.remove()));
			container.style.cssText = '--vscode-strokeThickness: 1px; --vscode-cornerRadius-large: 8px;';
			const editor = append(append(container, $('.monaco-grid-view')), $('.part.editor'));
			editor.style.cssText = 'position: relative; width: 400px; height: 300px; border: 1px solid transparent; box-sizing: border-box;';
			const content = append(editor, $('.content'));
			content.style.cssText = 'position: absolute; inset: 0;';
			const input = append(container, $('input', { type: 'text' }));
			const readRadius = (style: string) => {
				const document = append(content, $('.gettingStartedContainer', { tabindex: 0 }));
				document.style.cssText = style;
				input.focus();
				document.focus();
				updateGettingStartedFocusOutlineRadius(document);
				const computed = mainWindow.getComputedStyle(document, '::after');
				const radius = [
					computed.borderTopLeftRadius,
					computed.borderTopRightRadius,
					computed.borderBottomRightRadius,
					computed.borderBottomLeftRadius,
				];
				const elementRadius = mainWindow.getComputedStyle(document).borderRadius;
				document.remove();
				return { elementRadius, radius };
			};

			assert.deepStrictEqual([
				readRadius('position: absolute; top: 32px; bottom: 3px; left: 0; width: 198px;'),
				readRadius('position: absolute; top: 32px; right: 0; bottom: 3px; left: 200px; width: auto;'),
				readRadius('position: absolute; top: 32px; right: 99px; bottom: 3px; left: 99px;'),
				readRadius('position: absolute; top: 32px; right: 0; bottom: 150px; left: 0;'),
				readRadius('position: absolute; top: 150px; right: 0; bottom: 3px; left: 0;'),
			], [
				{ elementRadius: '0px', radius: ['0px', '0px', '0px', '7px 4px'] },
				{ elementRadius: '0px', radius: ['0px', '0px', '7px 4px', '0px'] },
				{ elementRadius: '0px', radius: ['0px', '0px', '0px', '0px'] },
				{ elementRadius: '0px', radius: ['0px', '0px', '0px', '0px'] },
				{ elementRadius: '0px', radius: ['0px', '0px', '7px 4px', '7px 4px'] },
			]);
		});

		test(`document focus outline refreshes when sizes or themes change in ${theme}`, () => {
			const container = append(mainWindow.document.body, $(`.monaco-workbench.modern-ui.floating-panels.${theme}`));
			store.add(toDisposable(() => container.remove()));
			container.style.cssText = '--vscode-strokeThickness: 1px; --vscode-editorArea-cornerRadius: 0px;';
			const editor = append(append(container, $('.monaco-grid-view')), $('.part.editor'));
			editor.style.cssText = 'position: relative; width: 400px; height: 300px; border: 1px solid transparent; box-sizing: border-box;';
			const content = append(editor, $('.content'));
			content.style.cssText = 'position: absolute; inset: 0;';
			const document = append(content, $('.gettingStartedContainer', { tabindex: 0 }));
			document.style.cssText = 'position: absolute; top: 32px; right: 0; bottom: 3px; left: 0;';
			const onDidChangeSizes = store.add(new Emitter<void>());
			const themeService = new TestThemeService();
			const focusOutline = store.add(new GettingStartedFocusOutline(document, { onDidChangeSizes: onDidChangeSizes.event }, themeService));
			focusOutline.update();
			const readRadius = () => document.style.getPropertyValue('--getting-started-focus-outline-radius');

			const states = [readRadius()];
			container.style.setProperty('--vscode-editorArea-cornerRadius', '16px');
			onDidChangeSizes.fire();
			states.push(readRadius());
			container.style.setProperty('--vscode-editorArea-cornerRadius', '8px');
			themeService.fireThemeChange();
			states.push(readRadius());

			assert.deepStrictEqual(states, [
				'0px 0px 0px 0px / 0px 0px 0px 0px',
				'0px 0px 15px 15px / 0px 0px 12px 12px',
				'0px 0px 7px 7px / 0px 0px 4px 4px',
			]);
		});

		test(`document has a keyboard focus outline in ${theme}`, () => {
			const container = append(mainWindow.document.body, $(`.monaco-workbench.${theme}`));
			store.add(toDisposable(() => container.remove()));
			container.style.setProperty('--vscode-focusBorder', '#0078d4');
			container.style.setProperty('--vscode-strokeThickness', '1px');
			const content = append(append(container, $('.part.editor')), $('.content'));
			content.style.height = '400px';
			const document = append(content, $('.gettingStartedContainer', { role: 'document', tabindex: 0 }));
			const slide = append(document, $('.gettingStartedSlide.gettingStartedSlideCategories'));
			const button = append(slide, $('button', {}, 'Start'));
			const input = append(container, $('input', { type: 'text' }));
			input.focus();
			document.focus();

			const style = mainWindow.getComputedStyle(document);
			const documentBounds = document.getBoundingClientRect();
			const contentBounds = content.getBoundingClientRect();
			const outlineExtent = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
			const focusedStyle = {
				focused: mainWindow.document.activeElement === document,
				focusVisible: document.matches(':focus-visible'),
				outlineStyle: style.outlineStyle,
				outlineWidth: style.outlineWidth,
				outlineColor: style.outlineColor,
				outlineOffset: style.outlineOffset,
				outlineContained: documentBounds.top - outlineExtent >= contentBounds.top
					&& documentBounds.bottom + outlineExtent <= contentBounds.bottom
					&& documentBounds.left - outlineExtent >= contentBounds.left
					&& documentBounds.right + outlineExtent <= contentBounds.right,
			};
			button.focus();

			assert.deepStrictEqual({
				...focusedStyle,
				childFocused: mainWindow.document.activeElement === button,
				outlineStyleWithChildFocused: mainWindow.getComputedStyle(document).outlineStyle,
			}, {
				focused: true,
				focusVisible: true,
				outlineStyle: 'solid',
				outlineWidth: '1px',
				outlineColor: 'rgb(0, 120, 212)',
				outlineOffset: '-1px',
				outlineContained: true,
				childFocused: true,
				outlineStyleWithChildFocused: 'none',
			});
		});

		for (const section of ['recent', 'walkthrough']) {
			test(`${section} close button uses the theme focus outline in ${theme}`, () => {
				const container = append(mainWindow.document.body, $(`.monaco-workbench.${theme}`));
				store.add(toDisposable(() => container.remove()));
				container.style.setProperty('--vscode-focusBorder', '#0078d4');
				container.style.setProperty('--vscode-strokeThickness', '1px');
				container.style.backgroundColor = '#fafafd';
				const content = append(append(container, $('.part.editor')), $('.content'));
				const slide = append(append(content, $('.gettingStartedContainer')), $('.gettingStartedSlide.gettingStartedSlideCategories'));
				const parent = section === 'recent'
					? append(append(slide, $('ul.recently-opened')), $('li'))
					: append(slide, $('.getting-started-category'));
				const button = append(parent, $('a.codicon.codicon-close.hide-category-button', {
					tabindex: 0,
					role: 'button',
					'aria-label': 'Hide',
				}));
				button.classList.toggle('recently-opened-delete-button', section === 'recent');
				parent.tabIndex = 0;
				parent.focus();
				button.focus();

				const style = mainWindow.getComputedStyle(button);
				const outlineColor = Color.Format.CSS.parse(style.outlineColor)!;
				assert.deepStrictEqual({
					focused: mainWindow.document.activeElement === button,
					visibility: style.visibility,
					outlineStyle: style.outlineStyle,
					outlineWidth: style.outlineWidth,
					outlineColor: outlineColor.toString(),
					outlineOffset: style.outlineOffset,
					sufficientContrast: outlineColor.getContrastRatio(Color.fromHex('#fafafd')) >= 3,
				}, {
					focused: true,
					visibility: 'visible',
					outlineStyle: 'solid',
					outlineWidth: '1px',
					outlineColor: '#0078d4',
					outlineOffset: '-1px',
					sufficientContrast: true,
				});
			});
		}

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
