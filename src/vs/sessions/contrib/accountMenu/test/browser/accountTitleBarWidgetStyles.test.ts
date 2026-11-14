/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/media/style.css';
import '../../browser/media/accountTitleBarWidget.css';
import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Account Title Bar Widget Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('open state wins over hover while keyboard focus retains its own boundary', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.hc-black'));
		root.style.cssText = [
			'--vscode-strokeThickness: 1px',
			'--vscode-toolbar-hoverBackground: #112233',
			'--vscode-toolbar-activeBackground: #223344',
			'--vscode-toolbar-hoverOutline: #445566',
			'--vscode-contrastActiveBorder: #556677',
			'--vscode-focusBorder: #778899',
		].join(';');
		store.add(toDisposable(() => root.remove()));

		const open = append(root, $('.sessions-account-titlebar-widget.agent-sessions-interactive.menu-visible.hovered'));
		const focusedOpen = append(root, $('.sessions-account-titlebar-widget.agent-sessions-interactive.menu-visible.hovered.focus-visible'));
		const describe = (element: HTMLElement) => {
			const style = mainWindow.getComputedStyle(element);
			return {
				background: style.backgroundColor,
				outlineColor: style.outlineColor,
				outlineOffset: style.outlineOffset,
				outlineStyle: style.outlineStyle,
				outlineWidth: style.outlineWidth,
			};
		};

		assert.deepStrictEqual({
			open: describe(open),
			focusedOpen: describe(focusedOpen),
		}, {
			open: {
				background: 'rgb(34, 51, 68)',
				outlineColor: 'rgb(85, 102, 119)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			focusedOpen: {
				background: 'rgb(34, 51, 68)',
				outlineColor: 'rgb(119, 136, 153)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
		});
	});
});
