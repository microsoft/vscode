/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/sessionsList.css';
import '../../browser/media/customizationsToolbar.css';
import '../../browser/media/disclosure.css';
import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Sessions Disclosure Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('distinguishes transient hover, expanded, and keyboard focus boundaries', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.hc-black'));
		root.style.setProperty('--vscode-strokeThickness', '1px');
		root.style.setProperty('--vscode-contrastActiveBorder', '#f38518');
		root.style.setProperty('--vscode-list-focusOutline', '#007acc');
		root.style.setProperty('--vscode-list-hoverBackground', '#112233');
		store.add(toDisposable(() => root.remove()));

		const direct = append(root, $('.sessions-disclosure.hovered', { 'aria-expanded': 'false' }));
		const expandedDirect = append(root, $('.sessions-disclosure.hovered', { 'aria-expanded': 'true' }));
		const closedDetails = append(root, $('details'));
		const closedSummary = append(closedDetails, $('summary.sessions-disclosure.hovered'));
		const openDetails = append(root, $('details')) as HTMLDetailsElement;
		openDetails.open = true;
		const openSummary = append(openDetails, $('summary.sessions-disclosure.hovered'));
		const row = append(root, $('.monaco-list-row.sessions-disclosure-row.hovered'));
		const tree = append(row, $('.monaco-tl-row'));
		const focusedDirect = append(root, $('.sessions-disclosure.hovered.focus-visible'));
		const control = append(root, $('.sessions-list-control.session-list-row-spacing'));
		const list = append(control, $('.monaco-list'));
		list.tabIndex = 0;
		const focusedRow = append(list, $('.monaco-list-row.session-list-inset-row.sessions-disclosure-row.hovered.focused'));
		const focusedTree = append(focusedRow, $('.monaco-tl-row'));
		const pointerControl = append(root, $('.sessions-list-control.session-list-row-spacing.session-section-focus-from-pointer'));
		const pointerList = append(pointerControl, $('.monaco-list'));
		const pointerFocusedRow = append(pointerList, $('.monaco-list-row.session-list-inset-row.sessions-disclosure-row.hovered.focused'));
		const pointerFocusedTree = append(pointerFocusedRow, $('.monaco-tl-row'));
		const customizationToolbar = append(root, $('.ai-customization-toolbar'));
		const customizationHeader = append(customizationToolbar, $('.ai-customization-header.sessions-disclosure.hovered', { 'aria-expanded': 'true' }));
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
		const customizationFill = mainWindow.getComputedStyle(customizationHeader, '::before');

		assert.deepStrictEqual({
			direct: readOutline(direct),
			expandedDirect: readOutline(expandedDirect),
			closedSummary: readOutline(closedSummary),
			openSummary: readOutline(openSummary),
			tree: readOutline(tree),
			focusedDirect: readOutline(focusedDirect),
			focusedTree: readOutline(focusedTree),
			pointerFocusedTree: readOutline(pointerFocusedTree),
			customization: {
				header: readOutline(customizationHeader),
				fillOutline: customizationFill.outlineStyle,
			},
		}, {
			direct: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'dashed', width: '1px' },
			expandedDirect: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'solid', width: '1px' },
			closedSummary: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'dashed', width: '1px' },
			openSummary: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'solid', width: '1px' },
			tree: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'dashed', width: '1px' },
			focusedDirect: { color: 'none', offset: '0px', style: 'none', width: '0px' },
			focusedTree: { color: 'rgb(0, 122, 204)', offset: '-1px', style: 'solid', width: '1px' },
			pointerFocusedTree: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'dashed', width: '1px' },
			customization: {
				header: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'solid', width: '1px' },
				fillOutline: 'none',
			},
		});
	});
});
