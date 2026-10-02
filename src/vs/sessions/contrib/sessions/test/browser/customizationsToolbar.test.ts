/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAICustomizationItemsModel } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { IAICustomizationToolsModel } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationToolsModel.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ICustomizationMigrationHint, ICustomizationMigrationService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IAICustomizationMcpServerCountService } from '../../browser/customizationMcpServerCount.js';
import { CustomizationLinkViewItem, readCustomizationCount } from '../../browser/customizationsToolbar.contribution.js';
import { CustomizationsNavigationState } from '../../browser/customizationsNavigationState.js';

suite('Customizations toolbar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the Tools count from the shared tools model', () => {
		const count = derived(reader => readCustomizationCount(
			{ id: 'tools', label: 'Tools', icon: Codicon.tools, isTools: true },
			reader,
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IAICustomizationMcpServerCountService>() { },
			new class extends mock<IAICustomizationToolsModel>() {
				override readonly enabledToolCount = constObservable(3);
			},
		)).get();

		assert.strictEqual(count, 3);
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
		const toolsModel = new class extends mock<IAICustomizationToolsModel>() {
			override readonly enabledToolCount = constObservable(0);
		};
		const harnessDescriptor = upcastPartial<IHarnessDescriptor>({ id: 'agent-host-test', label: 'Test', icon: Codicon.extensions });
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = constObservable('agent-host-test');
			override readonly availableHarnesses = constObservable([harnessDescriptor]);
			override getActiveDescriptor() { return harnessDescriptor; }
		};
		const customizationsChanged = disposables.add(new Emitter<void>());
		const refreshedHint = new DeferredPromise<ICustomizationMigrationHint | undefined>();
		let migrationCheckCount = 0;
		const migrationService = new class extends mock<ICustomizationMigrationService>() {
			override readonly onDidChangeCustomizations = customizationsChanged.event;
			override async computeMigrationHint(): Promise<ICustomizationMigrationHint | undefined> {
				if (migrationCheckCount++ > 0) {
					return refreshedHint.p;
				}
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
			toolsModel,
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
		customizationsChanged.fire();
		const refreshingState = state.migrationAvailable.get();
		await refreshedHint.complete(undefined);
		await refreshedHint.p;
		await Promise.resolve();
		const refreshedState = state.migrationAvailable.get();
		enabled.set(false, undefined);

		assert.deepStrictEqual({
			enabledState,
			refreshingState,
			refreshedState,
			disabledState: {
				totalCount: state.totalCount.get(),
				migrationAvailable: state.migrationAvailable.get(),
			},
		}, {
			enabledState: {
				totalCount: 9,
				migrationAvailable: true,
			},
			refreshingState: true,
			refreshedState: false,
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
			new class extends mock<IAICustomizationToolsModel>() { },
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
			new class extends mock<IAICustomizationToolsModel>() { },
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
