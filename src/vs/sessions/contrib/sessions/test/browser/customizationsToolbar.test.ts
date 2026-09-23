/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, derived } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAICustomizationItemsModel } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { IAgentHostToolSetEnablementService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { ILanguageModelToolsService, IToolData, IToolSet } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IAICustomizationMcpServerCountService } from '../../browser/customizationMcpServerCount.js';
import { CustomizationLinkViewItem, readCustomizationCount } from '../../browser/customizationsToolbar.contribution.js';

suite('Customizations toolbar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('includes enabled Tools in customization totals', () => {
		const toolSets = [
			upcastPartial<IToolSet>({
				id: 'builtin',
				getTools: () => [
					upcastPartial<IToolData>({ id: 'one' }),
					upcastPartial<IToolData>({ id: 'two' }),
				],
			}),
			upcastPartial<IToolSet>({
				id: 'deprecated',
				deprecated: true,
				getTools: () => [upcastPartial<IToolData>({ id: 'ignored' })],
			}),
		];
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override readonly toolSets = constObservable(toolSets);
		};
		const enablementService = new class extends mock<IAgentHostToolSetEnablementService>() {
			override observe() {
				return constObservable({
					toolSets: new Map([['builtin', false]]),
					tools: new Map([['one', true]]),
				});
			}
		};

		const count = derived(reader => readCustomizationCount(
			{ id: 'tools', label: 'Tools', icon: Codicon.tools, isTools: true },
			reader,
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IAICustomizationMcpServerCountService>() { },
			toolsService,
			enablementService,
		)).get();

		assert.strictEqual(count, 1);
	});

	test('renders one focus target and runs its action once', async () => {
		let runCount = 0;
		const action = disposables.add(new Action('test.customization', 'Customization', undefined, true, () => {
			runCount++;
		}));
		const item = disposables.add(new CustomizationLinkViewItem(
			action,
			{},
			{ id: 'test.customization', label: 'Customization', icon: Codicon.settingsGear },
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IAICustomizationMcpServerCountService>() { },
			new class extends mock<ILanguageModelToolsService>() { },
			new class extends mock<IAgentHostToolSetEnablementService>() { },
		));
		const container = mainWindow.document.createElement('div');
		item.render(container);
		const button = container.querySelector<HTMLElement>('.customization-link-button');
		button?.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			buttonCount: container.querySelectorAll('.customization-link-button').length,
			focusableCount: container.querySelectorAll('a, button').length,
			runCount,
		}, {
			buttonCount: 1,
			focusableCount: 1,
			runCount: 1,
		});
	});

	test('forwards ActionBar roving focus to the nested button', () => {
		const container = mainWindow.document.createElement('div');
		const createViewItem = (action: IAction) => new CustomizationLinkViewItem(
			action,
			{},
			{ id: action.id, label: action.label, icon: Codicon.settingsGear },
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IAICustomizationMcpServerCountService>() { },
			new class extends mock<ILanguageModelToolsService>() { },
			new class extends mock<IAgentHostToolSetEnablementService>() { },
		);
		const actionBar = disposables.add(new ActionBar(container, {
			actionViewItemProvider: action => createViewItem(action),
		}));
		const actions = [
			disposables.add(new Action('test.one', 'One')),
			disposables.add(new Action('test.two', 'Two')),
		];

		actionBar.push(actions);

		assert.deepStrictEqual({
			itemTabIndexes: Array.from(container.querySelectorAll<HTMLElement>('li'), element => element.tabIndex),
			buttonTabIndexes: Array.from(container.querySelectorAll<HTMLElement>('.customization-link-button'), element => element.tabIndex),
			focusableElements: Array.from(container.querySelectorAll<HTMLElement>('li, a, button')).filter(element => element.tabIndex === 0).length,
		}, {
			itemTabIndexes: [-1, -1],
			buttonTabIndexes: [0, -1],
			focusableElements: 1,
		});
	});
});
