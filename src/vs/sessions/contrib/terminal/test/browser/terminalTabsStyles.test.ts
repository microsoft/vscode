/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/media/workbench.css';
import '../../../../browser/parts/media/panelPart.css';
import '../../../../../base/browser/ui/list/list.css';
import '../../../../../workbench/contrib/terminal/browser/media/terminal.css';
import '../../../../../workbench/contrib/modernUI/browser/media/padding.css';
import '../../../../../workbench/contrib/modernUI/browser/media/roundedCorners.css';
import '../../../../../workbench/contrib/modernUI/browser/media/tabs.css';
import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Sessions - Terminal Tabs Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTerminalList(agents: boolean, compact: boolean, theme: string) {
		const root = append(mainWindow.document.body, $('.monaco-workbench.modern-ui-tabs'));
		store.add(toDisposable(() => root.remove()));
		root.classList.add(theme, agents ? 'agent-sessions-workbench' : 'modern-ui');
		root.classList.toggle('modern-ui-compact', compact);
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-cornerRadius-small: 4px; --vscode-panel-background: #112233; --vscode-agentsPanel-background: #223344; --vscode-list-dropBackground: #334455;';
		const panel = append(root, $('.part.panel'));
		const paneView = append(panel, $('.monaco-pane-view'));
		const body = append(paneView, $('.pane-body.integrated-terminal'));
		const tabs = append(body, $('.tabs-container.has-text'));
		const listContainer = append(tabs, $('.tabs-list-container'));
		const list = append(listContainer, $('.tabs-list.monaco-list'));
		const rows = append(list, $('.monaco-list-rows'));
		rows.style.width = '200px';
		const row = append(rows, $('.monaco-list-row.selected'));
		const entry = append(row, $('.terminal-tabs-entry.is-active'));
		append(entry, $('.monaco-icon-label'));
		return { root, listContainer, row, entry };
	}

	for (const compact of [false, true]) {
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			test(`matches editor terminal row styling in ${theme}, ${compact ? 'compact' : 'default'} density`, () => {
				const agents = createTerminalList(true, compact, theme);
				const editor = createTerminalList(false, compact, theme);
				const getRowStyles = (row: HTMLElement) => {
					const style = mainWindow.getComputedStyle(row);
					return {
						left: style.left,
						right: style.right,
						width: style.width,
						borderRadius: style.borderRadius,
					};
				};
				const inset = compact ? 2 : 4;
				assert.deepStrictEqual({
					agents: getRowStyles(agents.row),
					editor: getRowStyles(editor.row),
					entryPadding: mainWindow.getComputedStyle(agents.entry).paddingInline,
					background: mainWindow.getComputedStyle(agents.listContainer).backgroundColor,
				}, {
					agents: { left: `${inset}px`, right: `${inset}px`, width: `${200 - 2 * inset}px`, borderRadius: '4px' },
					editor: { left: `${inset}px`, right: `${inset}px`, width: `${200 - 2 * inset}px`, borderRadius: '4px' },
					entryPadding: '8px',
					background: 'rgb(34, 51, 68)',
				});
			});
		}
	}

	test('preserves the drop target background and icon-only row styling', () => {
		const { root, listContainer, row } = createTerminalList(true, false, 'vs-dark');
		root.querySelector('.tabs-container')!.classList.remove('has-text');
		listContainer.classList.add('drop-target');
		assert.deepStrictEqual({
			background: mainWindow.getComputedStyle(listContainer).backgroundColor,
			borderRadius: mainWindow.getComputedStyle(row).borderRadius,
			left: mainWindow.getComputedStyle(row).left,
			right: mainWindow.getComputedStyle(row).right,
		}, {
			background: 'rgb(51, 68, 85)',
			borderRadius: '4px',
			left: '4px',
			right: '4px',
		});
	});
});
