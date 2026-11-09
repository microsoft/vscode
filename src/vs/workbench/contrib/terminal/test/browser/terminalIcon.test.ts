/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { createStyleSheet } from '../../../../../base/browser/domStylesheets.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Color } from '../../../../../base/common/color.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getIconColorStyle } from '../../browser/terminalIcon.js';

suite('Terminal icon colors', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('colors configured icons without coloring actions, statuses or nested icons', () => {
		const container = dom.$('.monaco-workbench');
		store.add(toDisposable(() => container.remove()));
		mainWindow.document.body.appendChild(container);
		const style = createStyleSheet(container, undefined, store.add(new DisposableStore()));
		style.textContent = getIconColorStyle('terminal-icon-test', Color.fromHex('#ff0000'));

		const icons = new Map<string, HTMLElement>();
		const addIcon = (parent: HTMLElement, name: string, classes: string) => {
			const icon = dom.append(parent, dom.$(`span.codicon${classes}`));
			icon.style.color = 'blue';
			icons.set(name, icon);
		};

		for (const iconId of ['rerun-task', 'split-horizontal', 'trashcan']) {
			const row = dom.append(container, dom.$('.terminal-icon-test'));
			addIcon(dom.append(row, dom.$('.monaco-icon-label')), `configured ${iconId}`, `.codicon-${iconId}`);
			addIcon(dom.append(row, dom.$('.action-item')), `action ${iconId}`, `.action-label.codicon-${iconId}`);
		}

		const statusRow = dom.append(container, dom.$('.terminal-icon-test'));
		addIcon(statusRow, 'status', '.file-icon.codicon-warning');
		const singleTab = dom.append(container, dom.$('.single-terminal-tab.action-label.terminal-icon-test'));
		addIcon(singleTab, 'single tab', '.codicon-rerun-task');
		addIcon(dom.append(singleTab, dom.$('.single-terminal-tab-label')), 'progress', '.codicon-alert');
		const alternateAction = dom.append(container, dom.$('.single-terminal-tab.action-label.alt-command.terminal-icon-test'));
		addIcon(alternateAction, 'alternate action', '.codicon-split-horizontal');

		assert.deepStrictEqual(Object.fromEntries([...icons].map(([name, icon]) => [name, mainWindow.getComputedStyle(icon).color])), {
			'configured rerun-task': 'rgb(255, 0, 0)',
			'action rerun-task': 'rgb(0, 0, 255)',
			'configured split-horizontal': 'rgb(255, 0, 0)',
			'action split-horizontal': 'rgb(0, 0, 255)',
			'configured trashcan': 'rgb(255, 0, 0)',
			'action trashcan': 'rgb(0, 0, 255)',
			'status': 'rgb(0, 0, 255)',
			'single tab': 'rgb(255, 0, 0)',
			'progress': 'rgb(0, 0, 255)',
			'alternate action': 'rgb(0, 0, 255)',
		});
	});
});
