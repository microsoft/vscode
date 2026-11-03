/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationToggle } from '../../../browser/aiCustomization/customizationToggle.js';
import { isToolsTreeKeyboardTarget, ToolsListWidget } from '../../../browser/aiCustomization/toolsListWidget.js';
import { IToolData, IToolSet } from '../../../common/tools/languageModelToolsService.js';

suite('toolsListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('handles tree keys only from the row itself', () => {
		const row = document.createElement('div');
		const moreButton = document.createElement('button');
		row.appendChild(moreButton);

		assert.deepStrictEqual({
			row: isToolsTreeKeyboardTarget(row, row),
			moreButton: isToolsTreeKeyboardTarget(moreButton, row),
		}, {
			row: true,
			moreButton: false,
		});
	});

	test('uses switches for customization enablement', () => {
		const enabledToggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Enabled', checked: true }));
		const mixedToggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Mixed', checked: 'mixed' }));

		assert.deepStrictEqual({
			enabledRole: enabledToggle.domNode.firstElementChild?.getAttribute('role'),
			enabledChecked: enabledToggle.domNode.firstElementChild?.getAttribute('aria-checked'),
			mixedRole: mixedToggle.domNode.firstElementChild?.getAttribute('role'),
			mixedChecked: mixedToggle.domNode.firstElementChild?.getAttribute('aria-checked'),
		}, {
			enabledRole: 'switch',
			enabledChecked: 'true',
			mixedRole: 'switch',
			mixedChecked: 'mixed',
		});
	});

	test('search treats dashes and spaces as equivalent separators with highlights', () => {
		const toolSet = {
			id: 'chrome-devtools',
			referenceName: 'chrome-devtools',
			description: 'Chrome DevTools MCP',
			source: { type: 'internal', label: 'Internal' },
			getTools: () => [{ id: 'take_screenshot', displayName: 'take-screenshot' }, { id: 'navigate', displayName: 'Navigate Page' }],
		} as unknown as IToolSet;
		const toViewModel = (query: string) => {
			const vm = (ToolsListWidget.prototype as unknown as {
				_toViewModel(this: object, reader: undefined, ts: IToolSet, query: string): { nameMatches?: unknown; visibleTools: { tool: IToolData; nameMatches?: unknown }[] } | undefined;
			})._toViewModel.call({ _resolveSetDetail: () => undefined }, undefined, toolSet, query);
			return vm && { set: vm.nameMatches, tools: vm.visibleTools.map(tool => [tool.tool.id, tool.nameMatches]) };
		};

		assert.deepStrictEqual({
			dashedSet: toViewModel('chrome-devtools'),
			spacedTool: toViewModel('take screenshot'),
			underscoredTool: toViewModel('navigate_page'),
			none: toViewModel('missing'),
		}, {
			dashedSet: { set: [{ start: 0, end: 6 }, { start: 7, end: 15 }], tools: [['take_screenshot', undefined], ['navigate', undefined]] },
			spacedTool: { set: undefined, tools: [['take_screenshot', [{ start: 0, end: 4 }, { start: 5, end: 15 }]]] },
			underscoredTool: { set: undefined, tools: [['navigate', [{ start: 0, end: 8 }, { start: 9, end: 13 }]]] },
			none: undefined,
		});
	});
});
