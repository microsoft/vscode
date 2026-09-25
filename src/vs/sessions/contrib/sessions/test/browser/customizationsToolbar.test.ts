/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAICustomizationItemsModel } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { IAgentHostToolSetEnablementService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ICustomizationMigrationHint, ICustomizationMigrationService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { ILanguageModelToolsService, IToolData, IToolSet } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IAICustomizationMcpServerCountService } from '../../browser/customizationMcpServerCount.js';
import { CustomizationLinkViewItem, readCustomizationCount } from '../../browser/customizationsToolbar.contribution.js';
import { CustomizationsNavigationState } from '../../browser/customizationsNavigationState.js';

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

	test('tracks the active customization total and migration availability', async () => {
		const enabled = observableValue(disposables, true);
		const activeSession = observableValue<IActiveSession | undefined>(disposables, upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host-test:/session'),
			workspace: constObservable(undefined),
		}));
		const itemsModel = new class extends mock<IAICustomizationItemsModel>() {
			override getCount() { return constObservable(1); }
			override getPluginCount() { return constObservable(2); }
		};
		const mcpServerCountService = new class extends mock<IAICustomizationMcpServerCountService>() {
			override readonly count = constObservable(3);
		};
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override readonly toolSets = constObservable<readonly IToolSet[]>([]);
		};
		const toolEnablementService = new class extends mock<IAgentHostToolSetEnablementService>() {
			override observe() {
				return constObservable({ toolSets: new Map(), tools: new Map() });
			}
		};
		const harnessDescriptor = upcastPartial<IHarnessDescriptor>({ id: 'agent-host-test', label: 'Test', icon: Codicon.extensions });
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = constObservable('agent-host-test');
			override readonly availableHarnesses = constObservable([harnessDescriptor]);
			override getActiveDescriptor() { return harnessDescriptor; }
		};
		const migrationService = new class extends mock<ICustomizationMigrationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override async computeMigrationHint(): Promise<ICustomizationMigrationHint | undefined> {
				return { migrationFlowId: 'flow', message: 'Migrations available', counts: [] };
			}
		};
		const state = disposables.add(new CustomizationsNavigationState(
			enabled,
			new class extends mock<ISessionsService>() {
				override readonly activeSession = activeSession;
			},
			itemsModel,
			mcpServerCountService,
			toolsService,
			toolEnablementService,
			harnessService,
			migrationService,
			new class extends mock<IConfigurationService>() {
				override readonly onDidChangeConfiguration = Event.None;
			},
			new class extends mock<ILogService>() { },
		));
		await Promise.resolve();

		const enabledState = {
			totalCount: state.totalCount.get(),
			migrationAvailable: state.migrationAvailable.get(),
		};
		enabled.set(false, undefined);

		assert.deepStrictEqual({
			enabledState,
			disabledState: {
				totalCount: state.totalCount.get(),
				migrationAvailable: state.migrationAvailable.get(),
			},
		}, {
			enabledState: {
				totalCount: 9,
				migrationAvailable: true,
			},
			disabledState: {
				totalCount: 0,
				migrationAvailable: false,
			},
		});
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
