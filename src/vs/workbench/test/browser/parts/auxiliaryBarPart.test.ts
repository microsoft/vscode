/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../base/browser/dom.js';
import { ToggleMenuAction } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { Separator } from '../../../../base/common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createTestAuxiliaryBarPart } from './auxiliaryBarTestUtils.js';

import '../../../browser/media/part.css';
import '../../../contrib/modernUI/browser/media/padding.css';
import '../../../contrib/modernUI/browser/media/fontRamp.css';
import '../../../contrib/modernUI/browser/media/tabs.css';

suite('Auxiliary Bar - Responsive title actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;

	setup(() => {
		root = append(document.body, $('.monaco-workbench'));
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
	});

	teardown(() => root.remove());

	for (const presentation of ['', 'modern-ui modern-ui-tabs', 'modern-ui modern-ui-tabs modern-ui-compact']) {
		test(`overflows New Chat before Settings and restores them in reverse order (${presentation || 'standard'})`, () => {
			root.className = `monaco-workbench ${presentation}`;
			const container = append(root, $('.part.auxiliarybar'));
			const part = createTestAuxiliaryBarPart(container, store);

			const states = [];
			for (const [containerWidth, toolbarWidth] of [[300, 120], [185, 80], [140, 50], [185, 80], [300, 120]]) {
				container.style.width = `${containerWidth}px`;
				part.setToolbarAvailableWidth(toolbarWidth);
				part.layout(containerWidth, 200, 0, 0);
				part.toolbar.relayout();
				const title = container.querySelector('h2')!;
				const firstAction = part.toolbar.getItemElement(0)!;
				const lastAction = part.toolbar.getItemElement(part.toolbar.getItemsLength() - 1)!;
				const globalActions = container.querySelector('.global-actions')!;
				states.push({
					actions: Array.from({ length: part.toolbar.getItemsLength() }, (_, index) => part.toolbar.getItemAction(index)?.id),
					separatorWidth: part.toolbar.getItemWidth(part.toolbar.getItemsLength() - 1),
					titleVisible: title.textContent === 'Chat' && title.clientWidth >= title.scrollWidth,
					overlap: title.getBoundingClientRect().right > firstAction.getBoundingClientRect().left + 0.5 || lastAction.getBoundingClientRect().right > globalActions.getBoundingClientRect().left + 0.5,
					globalActionsVisible: ['.codicon-screen-full', '.codicon-close'].every(selector => {
						const action = container.querySelector<HTMLElement>(`.global-actions ${selector}`);
						return action !== null && action.getBoundingClientRect().width > 0;
					}),
				});
			}
			const separatorWidth = states[0].separatorWidth;
			assert.deepStrictEqual(states, [
				{ actions: ['submenuitem.test.auxiliaryBar.newChat', 'settings', ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
				{ actions: ['settings', ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
				{ actions: [ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
				{ actions: ['settings', ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
				{ actions: ['submenuitem.test.auxiliaryBar.newChat', 'settings', ToggleMenuAction.ID, Separator.ID], separatorWidth, titleVisible: true, overlap: false, globalActionsVisible: true },
			]);
		});
	}
});
