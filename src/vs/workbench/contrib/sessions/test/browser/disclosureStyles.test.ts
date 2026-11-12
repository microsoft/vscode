/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/disclosure.css';
import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Sessions Disclosure Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the same dashed high contrast hover boundary for direct and tree disclosures', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.hc-black'));
		root.style.setProperty('--vscode-strokeThickness', '1px');
		root.style.setProperty('--vscode-contrastActiveBorder', '#f38518');
		store.add(toDisposable(() => root.remove()));

		const direct = append(root, $('.sessions-disclosure.hovered'));
		const row = append(root, $('.monaco-list-row.sessions-disclosure-row.hovered'));
		const tree = append(row, $('.monaco-tl-row'));
		const focusedDirect = append(root, $('.sessions-disclosure.hovered.focus-visible'));
		const control = append(root, $('.sessions-list-control'));
		const list = append(control, $('.monaco-list'));
		list.tabIndex = 0;
		const focusedRow = append(list, $('.monaco-list-row.sessions-disclosure-row.hovered.focused'));
		const focusedTree = append(focusedRow, $('.monaco-tl-row'));
		list.focus();
		const readOutline = (element: HTMLElement) => {
			const style = mainWindow.getComputedStyle(element);
			const hasOutline = style.outlineStyle !== 'none';
			return {
				color: hasOutline ? style.outlineColor : 'none',
				offset: hasOutline ? style.outlineOffset : '0px',
				style: style.outlineStyle,
				width: hasOutline ? style.outlineWidth : '0px',
			};
		};

		assert.deepStrictEqual({
			direct: readOutline(direct),
			tree: readOutline(tree),
			focusedDirect: readOutline(focusedDirect),
			focusedTree: readOutline(focusedTree),
		}, {
			direct: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'dashed', width: '1px' },
			tree: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'dashed', width: '1px' },
			focusedDirect: { color: 'none', offset: '0px', style: 'none', width: '0px' },
			focusedTree: { color: 'none', offset: '0px', style: 'none', width: '0px' },
		});
	});
});
