/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../../browser/media/style.css';
import '../../browser/media/mobileHostPickerSheet.css';
import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('MobileHostPicker Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('selected rows preserve their selected palette while hovered', () => {
		const results = ['vs', 'vs-dark', 'hc-black', 'hc-light'].map(theme => {
			const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${theme}`));
			root.style.setProperty('--vscode-list-hoverBackground', '#f0f0f0');
			root.style.setProperty('--vscode-list-activeSelectionBackground', '#0060c0');
			root.style.setProperty('--vscode-list-activeSelectionForeground', '#ffffff');
			root.style.setProperty('--vscode-contrastActiveBorder', theme.startsWith('hc-') ? '#f38518' : 'transparent');
			root.style.setProperty('--vscode-strokeThickness', '1px');
			store.add(toDisposable(() => root.remove()));
			const row = append(root, $('button.host-picker-row.agent-sessions-interactive.agent-sessions-interactive-list.checked.hovered', { 'aria-checked': 'true' }));
			const style = mainWindow.getComputedStyle(row);
			return {
				background: style.backgroundColor,
				foreground: style.color,
			};
		});

		assert.deepStrictEqual(results, [
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
		]);
	});
});
