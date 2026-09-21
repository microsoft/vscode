/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAICustomizationItemsModel } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { IAgentHostToolSetEnablementService, IToolEnablementState } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { ILanguageModelToolsService, IToolData, IToolSet } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IMcpService } from '../../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { CustomizationLinkViewItem, readCustomizationCount } from '../../browser/customizationsToolbar.contribution.js';

suite('Sessions - Customizations Toolbar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses one focusable button and executes its action once', () => {
		let runCount = 0;
		const action = disposables.add(new Action('test.customization', 'Test Customization', undefined, true, () => runCount++));
		const viewItem = disposables.add(new CustomizationLinkViewItem(
			action,
			{},
			{ id: action.id, label: action.label, icon: Codicon.settingsGear },
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IMcpService>() { },
			new class extends mock<ILanguageModelToolsService>() { },
			new class extends mock<IAgentHostToolSetEnablementService>() { },
		));
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.append(container);
		disposables.add(toDisposable(() => container.remove()));

		viewItem.render(container);
		viewItem.setFocusable(false);
		const button = container.querySelector<HTMLElement>('.customization-link-button');
		assert.ok(button);
		const unfocused = {
			containerTabIndex: container.tabIndex,
			buttonTabIndex: button.tabIndex,
		};

		viewItem.focus();
		const focused = {
			activeElementIsButton: mainWindow.document.activeElement === button,
			containerTabIndex: container.tabIndex,
			buttonTabIndex: button.tabIndex,
		};
		button.click();
		viewItem.blur();

		assert.deepStrictEqual({
			unfocused,
			focused,
			afterBlur: {
				activeElementIsButton: mainWindow.document.activeElement === button,
				buttonTabIndex: button.tabIndex,
			},
			runCount,
			buttonCount: container.querySelectorAll('[role="button"]').length,
		}, {
			unfocused: {
				containerTabIndex: -1,
				buttonTabIndex: -1,
			},
			focused: {
				activeElementIsButton: true,
				containerTabIndex: -1,
				buttonTabIndex: 0,
			},
			afterBlur: {
				activeElementIsButton: false,
				buttonTabIndex: -1,
			},
			runCount: 1,
			buttonCount: 1,
		});
	});

	test('includes enabled tools in customization counts', () => {
		const tools = [
			new class extends mock<IToolData>() { override readonly id = 'tool.one'; },
			new class extends mock<IToolData>() { override readonly id = 'tool.two'; },
		];
		const toolSet = new class extends mock<IToolSet>() {
			override readonly id = 'test.tools';
			override getTools(): Iterable<IToolData> {
				return tools;
			}
		};
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override readonly toolSets = constObservable<Iterable<IToolSet>>([toolSet]);
		};
		const state: IToolEnablementState = {
			toolSets: new Map(),
			tools: new Map([['tool.two', false]]),
		};
		const toolEnablementService = new class extends mock<IAgentHostToolSetEnablementService>() {
			override observe() {
				return constObservable(state);
			}
		};
		const count = derived(reader => readCustomizationCount(
			{ id: 'test.tools', label: 'Tools', icon: Codicon.tools, isTools: true },
			reader,
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IMcpService>() { },
			toolsService,
			toolEnablementService,
		)).get();

		assert.strictEqual(count, 1);
	});
});
