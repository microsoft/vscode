/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAutomationDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunDispatch, IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';

import '../../browser/automations.contribution.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
const automationEnabledProperty = configurationRegistry.getConfigurationProperties()[CHAT_AUTOMATIONS_ENABLED_SETTING];
const cloudAutomationEnabledProperty = configurationRegistry.getConfigurationProperties()[CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING];

suite('Automations Contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers Automations as enabled by default on all builds with automatic experiments', () => {
		assert.deepStrictEqual({
			default: automationEnabledProperty.default,
			included: automationEnabledProperty.included,
			tags: automationEnabledProperty.tags,
			experiment: automationEnabledProperty.experiment,
		}, {
			default: true,
			included: undefined,
			tags: ['onExP'],
			experiment: { mode: 'auto' },
		});

	});

	test('cloud gate defaults on with machine scope and automatic config treatment', () => {
		const property = cloudAutomationEnabledProperty;
		assert.deepStrictEqual({ id: CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, default: property.default, scope: property.scope, tags: property.tags, experiment: property.experiment },
			{ id: 'chat.automations.cloud.enabled', default: true, scope: ConfigurationScope.MACHINE, tags: ['preview', 'onExP'], experiment: { mode: 'auto' } });
	});

	suite('Run Automation', () => {
		const commandId = 'workbench.action.chat.runAutomation';
		const automation: IAutomationDescriptor = {
			id: 'local:review',
			name: 'Review',
			prompt: 'Review recent changes',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: URI.file('/workspace'), providerId: 'local', sessionTypeId: 'copilot', isolation: { kind: 'default' } },
			enabled: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};

		function setup(automations: readonly IAutomationDescriptor[] = [automation]) {
			const instantiationService = store.add(new TestInstantiationService());
			const configurationService = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true });
			const catalogue = observableValue<readonly IAutomationDescriptor[]>('automations', automations);
			const runnable = new Set(automations.map(item => item.id));
			const state = {
				picks: [] as IQuickPickItem[],
				calls: [] as IAutomationDescriptor[],
				notifications: [] as string[],
				select: (items: IQuickPickItem[]): IQuickPickItem | undefined => items[0],
				refresh: async () => { },
				dispatch: { kind: 'accepted' } as IAutomationRunDispatch,
			};
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IAutomationService, upcastPartial<IAutomationService>({
				automations: catalogue,
				refresh: () => state.refresh(),
				getAutomation: id => catalogue.get().find(item => item.id === id),
				canRunAutomation: id => runnable.has(id),
			}));
			instantiationService.stub(IAutomationRunner, upcastPartial<IAutomationRunner>({
				runOnce: item => {
					state.calls.push(item);
					return { whenDispatched: Promise.resolve(state.dispatch), whenCompleted: new Promise<void>(() => { }) };
				},
			}));
			instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
				pick: (async (items: QuickPickInput<IQuickPickItem>[] | Promise<QuickPickInput<IQuickPickItem>[]>) => {
					state.picks = (await items).filter((item): item is IQuickPickItem => item.type !== 'separator');
					return state.select(state.picks);
				}) as IQuickInputService['pick'],
			}));
			instantiationService.stub(ILabelService, upcastPartial<ILabelService>({ getUriLabel: uri => uri.path }));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
				getProvider: <T extends ISessionsProvider>(id: string) => upcastPartial<ISessionsProvider>({ label: id === 'local' ? 'Local' : 'Remote' }) as T,
			}));
			instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ info: message => { state.notifications.push(String(message)); } }));
			const run = () => instantiationService.invokeFunction(CommandsRegistry.getCommand(commandId)!.handler);
			return { state, catalogue, runnable, configurationService, run };
		}

		test('is listed as Chat: Run Automation... only when chat and automations are enabled', () => {
			const item = MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(isIMenuItem).find(item => item.command.id === commandId)!;
			const context = store.add(new MockContextKeyService());
			const chatEnabled = ChatContextKeys.enabled.bindTo(context);
			const automationsEnabled = ChatAutomationsEnabledContext.bindTo(context);
			const visibility = [];
			for (const [chat, automations] of [[false, false], [true, false], [false, true], [true, true]]) {
				chatEnabled.set(chat);
				automationsEnabled.set(automations);
				visibility.push(item.when!.evaluate({ getValue: key => context.getContextKeyValue(key) }));
			}
			assert.deepStrictEqual({ title: item.command.title, category: item.command.category, visibility }, {
				title: { value: 'Run Automation...', original: 'Run Automation...' },
				category: { value: 'Chat', original: 'Chat' },
				visibility: [false, false, false, true],
			});
		});

		test('refreshes, filters unavailable automations, and runs the selected identity without waiting for completion', async () => {
			const remote = { ...automation, id: 'remote:review', target: { ...automation.target, providerId: 'remote' } };
			const { state, catalogue, run } = setup([automation, remote]);
			state.refresh = async () => catalogue.set([automation, remote, { ...automation, id: 'unavailable' }], undefined);
			state.select = items => items[1];
			await run();
			assert.deepStrictEqual({
				picks: state.picks.map(({ id, label, description, detail }) => ({ id, label, description, detail })),
				calls: state.calls,
				notifications: state.notifications,
			}, {
				picks: [
					{ id: automation.id, label: 'Review', description: 'Local · /workspace', detail: automation.prompt },
					{ id: remote.id, label: 'Review', description: 'Remote · /workspace', detail: remote.prompt },
				],
				calls: [remote],
				notifications: ['Run requested for automation \'Review\'. Check Automations for run history.'],
			});
		});

		test('a failed provider refresh does not block runnable automations', async () => {
			const unavailable = { ...automation, id: 'unavailable' };
			const { state, runnable, run } = setup([automation, unavailable]);
			state.refresh = async () => {
				runnable.delete(unavailable.id);
				throw new Error('Provider refresh failed');
			};
			await run();
			assert.deepStrictEqual({ picks: state.picks.map(item => item.id), calls: state.calls }, {
				picks: [automation.id],
				calls: [automation],
			});
		});

		test('uses the latest automation definition after selection', async () => {
			const { state, catalogue, run } = setup();
			const updated = { ...automation, prompt: 'Updated prompt' };
			state.select = items => {
				catalogue.set([updated], undefined);
				return items[0];
			};
			await run();
			assert.deepStrictEqual(state.calls, [updated]);
		});

		test('cancelling the picker does not run an automation', async () => {
			const { state, run } = setup();
			state.select = () => undefined;
			await run();
			assert.deepStrictEqual(state.calls, []);
		});

		test('an empty catalogue shows a non-pickable explanation', async () => {
			const { state, run } = setup([]);
			await run();
			assert.deepStrictEqual({ picks: state.picks, calls: state.calls }, {
				picks: [{ label: 'No automations are currently available to run.', pickable: false }],
				calls: [],
			});
		});

		for (const change of ['deleted', 'unavailable', 'automationsDisabled', 'aiDisabled'] as const) {
			test(`does not run an automation that becomes ${change} while picking`, async () => {
				const { state, catalogue, runnable, configurationService, run } = setup();
				state.select = items => {
					if (change === 'deleted') {
						catalogue.set([], undefined);
					} else if (change === 'unavailable') {
						runnable.clear();
					} else {
						configurationService.setUserConfiguration(change === 'aiDisabled' ? ChatAIDisabledSettingId : CHAT_AUTOMATIONS_ENABLED_SETTING, change === 'aiDisabled');
					}
					return items[0];
				};
				await run();
				assert.deepStrictEqual(state.calls, []);
			});
		}
	});
});
