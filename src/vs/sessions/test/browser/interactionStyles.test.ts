/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/style.css';
import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

suite('Sessions Interaction Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRoot(): HTMLElement {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.hc-black'));
		root.style.cssText = [
			'--vscode-strokeThickness: 1px',
			'--vscode-cornerRadius-small: 4px',
			'--vscode-toolbar-hoverBackground: #112233',
			'--vscode-toolbar-hoverOutline: #445566',
			'--vscode-list-hoverBackground: #223344',
			'--vscode-list-activeSelectionBackground: #334455',
			'--vscode-list-activeSelectionForeground: #ffffff',
			'--vscode-contrastActiveBorder: #556677',
			'--vscode-focusBorder: #778899',
			'--vscode-list-focusOutline: #99aabb',
		].join(';');
		store.add(toDisposable(() => root.remove()));
		return root;
	}

	function getInteractionStyles(element: Element): {
		readonly background: string;
		readonly outlineColor: string;
		readonly outlineOffset: string;
		readonly outlineStyle: string;
		readonly outlineWidth: string;
	} {
		const style = mainWindow.getComputedStyle(element);
		const hasOutline = style.outlineStyle !== 'none';
		return {
			background: style.backgroundColor,
			outlineColor: hasOutline ? style.outlineColor : 'none',
			outlineOffset: style.outlineOffset,
			outlineStyle: style.outlineStyle,
			outlineWidth: hasOutline ? style.outlineWidth : '0px',
		};
	}

	test('shared controls preserve toolbar and list interaction semantics in high contrast', () => {
		const root = createRoot();
		const toolbarHover = append(root, $('.agent-sessions-interactive.hovered'));
		const listHover = append(root, $('.agent-sessions-interactive.agent-sessions-interactive-list.hovered'));
		const toolbarFocus = append(root, $('.agent-sessions-interactive.focus-visible'));
		const listFocus = append(root, $('.agent-sessions-interactive.agent-sessions-interactive-list.focus-visible'));
		const toolbarFocusHover = append(root, $('.agent-sessions-interactive.focus-visible.hovered'));
		const listFocusHover = append(root, $('.agent-sessions-interactive.agent-sessions-interactive-list.focus-visible.hovered'));
		const borderedFocus = append(root, $('.agent-sessions-interactive.agent-sessions-interactive-list.agent-sessions-interactive-bordered.focus-visible'));
		const borderedFocusHover = append(root, $('.agent-sessions-interactive.agent-sessions-interactive-list.agent-sessions-interactive-bordered.focus-visible.hovered'));
		const disabledHover = append(root, $('.agent-sessions-interactive.hovered.disabled'));
		const pressedHover = append(root, $('.agent-sessions-interactive.hovered', { 'aria-pressed': 'true' }));
		const expandedListHover = append(root, $('.agent-sessions-interactive.agent-sessions-interactive-list.hovered', { 'aria-expanded': 'true' }));
		const buttonHover = append(root, $('.monaco-button.hovered'));
		const buttonExpandedHover = append(root, $('.monaco-button.hovered', { 'aria-expanded': 'true' }));
		const buttonFocusHover = append(root, $('.monaco-button.focus-visible.hovered'));
		const closedDetails = append(root, $('details'));
		const closedSummary = append(closedDetails, $('summary.agent-sessions-interactive.agent-sessions-interactive-bordered.hovered'));
		const openDetails = append(root, $('details')) as HTMLDetailsElement;
		openDetails.open = true;
		const openSummary = append(openDetails, $('summary.agent-sessions-interactive.agent-sessions-interactive-bordered.hovered'));

		assert.deepStrictEqual({
			toolbarHover: getInteractionStyles(toolbarHover),
			listHover: getInteractionStyles(listHover),
			toolbarFocus: getInteractionStyles(toolbarFocus),
			listFocus: getInteractionStyles(listFocus),
			toolbarFocusHover: getInteractionStyles(toolbarFocusHover),
			listFocusHover: getInteractionStyles(listFocusHover),
			borderedFocus: getInteractionStyles(borderedFocus),
			borderedFocusHover: getInteractionStyles(borderedFocusHover),
			disabledHover: getInteractionStyles(disabledHover),
			pressedHover: getInteractionStyles(pressedHover),
			expandedListHover: getInteractionStyles(expandedListHover),
			buttonHover: getInteractionStyles(buttonHover),
			buttonExpandedHover: getInteractionStyles(buttonExpandedHover),
			buttonFocusHover: getInteractionStyles(buttonFocusHover),
			closedSummary: getInteractionStyles(closedSummary),
			openSummary: getInteractionStyles(openSummary),
		}, {
			toolbarHover: {
				background: 'rgb(17, 34, 51)',
				outlineColor: 'rgb(68, 85, 102)',
				outlineOffset: '-1px',
				outlineStyle: 'dashed',
				outlineWidth: '1px',
			},
			listHover: {
				background: 'rgb(34, 51, 68)',
				outlineColor: 'rgb(85, 102, 119)',
				outlineOffset: '-1px',
				outlineStyle: 'dashed',
				outlineWidth: '1px',
			},
			toolbarFocus: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(119, 136, 153)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			listFocus: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(153, 170, 187)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			toolbarFocusHover: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(119, 136, 153)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			listFocusHover: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(153, 170, 187)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			borderedFocus: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(153, 170, 187)',
				outlineOffset: '-2px',
				outlineStyle: 'solid',
				outlineWidth: '2px',
			},
			borderedFocusHover: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(153, 170, 187)',
				outlineOffset: '-2px',
				outlineStyle: 'solid',
				outlineWidth: '2px',
			},
			disabledHover: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'none',
				outlineOffset: '0px',
				outlineStyle: 'none',
				outlineWidth: '0px',
			},
			pressedHover: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(85, 102, 119)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			expandedListHover: {
				background: 'rgb(34, 51, 68)',
				outlineColor: 'rgb(85, 102, 119)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			buttonHover: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(85, 102, 119)',
				outlineOffset: '-1px',
				outlineStyle: 'dashed',
				outlineWidth: '1px',
			},
			buttonExpandedHover: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(85, 102, 119)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			buttonFocusHover: {
				background: 'rgba(0, 0, 0, 0)',
				outlineColor: 'rgb(119, 136, 153)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
			closedSummary: {
				background: 'rgb(17, 34, 51)',
				outlineColor: 'rgb(68, 85, 102)',
				outlineOffset: '-1px',
				outlineStyle: 'dashed',
				outlineWidth: '1px',
			},
			openSummary: {
				background: 'rgb(17, 34, 51)',
				outlineColor: 'rgb(85, 102, 119)',
				outlineOffset: '-1px',
				outlineStyle: 'solid',
				outlineWidth: '1px',
			},
		});
	});

	test('expanded list controls retain normal-theme hover feedback', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.vs'));
		root.style.setProperty('--vscode-list-hoverBackground', '#223344');
		root.style.setProperty('--vscode-contrastActiveBorder', 'transparent');
		root.style.setProperty('--vscode-strokeThickness', '1px');
		store.add(toDisposable(() => root.remove()));
		const expanded = append(root, $('.agent-sessions-interactive.agent-sessions-interactive-list.hovered', { 'aria-expanded': 'true' }));

		assert.strictEqual(mainWindow.getComputedStyle(expanded).backgroundColor, 'rgb(34, 51, 68)');
	});
});
