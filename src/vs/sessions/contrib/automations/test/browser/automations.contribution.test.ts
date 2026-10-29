/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { useFakeTimers } from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../base/common/observable.js';
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
import { INotificationHandle, INotificationService, IPromptChoice, Severity } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunDispatch, IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { AutomationCatalogueState, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { IOpenSessionOptions, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../sessions/browser/automationsConstants.js';

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
		const automationRun: IAutomationRun = {
			id: 'local:run',
			automationId: automation.id,
			status: 'running',
			trigger: 'manual',
			sessionResource: URI.parse('agent-host-copilot:/run'),
			startedAt: '2026-01-01T00:00:00.000Z',
		};

		function setup(automations: readonly IAutomationDescriptor[] = [automation]) {
			const instantiationService = store.add(new TestInstantiationService());
			const configurationService = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true });
			const catalogue = observableValue<readonly IAutomationDescriptor[]>('automations', automations);
			const catalogueState = observableValue<AutomationCatalogueState>('catalogueState', 'ready');
			const runnable = new Set(automations.map(item => item.id));
			const state = {
				picks: [] as IQuickPickItem[],
				calls: [] as IAutomationDescriptor[],
				notifications: [] as string[],
				choices: [] as IPromptChoice[],
				severity: undefined as Severity | undefined,
				closed: 0,
				autoAccept: true,
				pickerShown: false,
				pickerDisposed: false,
				openedSessions: [] as { resource: URI; options: IOpenSessionOptions | undefined }[],
				openedViews: [] as string[],
				openSession: async () => { },
				select: (items: IQuickPickItem[]): IQuickPickItem | undefined => items[0],
				refreshCalls: 0,
				refresh: async () => { },
				dispatch: { kind: 'accepted' } as IAutomationRunDispatch,
			};
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IAutomationService, upcastPartial<IAutomationService>({
				automations: catalogue,
				catalogueState,
				refresh: () => {
					state.refreshCalls++;
					return state.refresh();
				},
				getAutomation: id => catalogue.get().find(item => item.id === id),
				canRunAutomation: id => runnable.has(id),
			}));
			instantiationService.stub(IAutomationRunner, upcastPartial<IAutomationRunner>({
				runOnce: item => {
					state.calls.push(item);
					return { whenDispatched: Promise.resolve(state.dispatch), whenCompleted: new Promise<void>(() => { }) };
				},
			}));
			const onDidAccept = store.add(new Emitter<IQuickPickDidAcceptEvent>());
			const onDidHide = store.add(new Emitter<IQuickInputHideEvent>());
			const picker = upcastPartial<IQuickPick<IQuickPickItem>>({
				get items() { return state.picks; },
				set items(items) {
					state.picks = [...items];
					picker.activeItems = [];
				},
				activeItems: [],
				selectedItems: [],
				value: '',
				busy: false,
				onDidAccept: onDidAccept.event,
				onDidHide: onDidHide.event,
				show: () => {
					state.pickerShown = true;
					if (state.autoAccept) {
						void (async () => {
							await Promise.resolve();
							const selected = state.select(state.picks);
							if (selected?.id && selected.pickable !== false) {
								picker.selectedItems = [selected];
								onDidAccept.fire({ inBackground: false });
							} else {
								picker.hide();
							}
						})();
					}
				},
				hide: () => {
					state.pickerShown = false;
					onDidHide.fire({ reason: QuickInputHideReason.Gesture });
				},
				dispose: () => { state.pickerDisposed = true; },
			});
			instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
				createQuickPick: (() => picker) as IQuickInputService['createQuickPick'],
			}));
			instantiationService.stub(ILabelService, upcastPartial<ILabelService>({ getUriLabel: uri => uri.path }));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
				getProvider: <T extends ISessionsProvider>(id: string) => upcastPartial<ISessionsProvider>({ label: id === 'local' ? 'Local' : 'Remote' }) as T,
			}));
			store.add(toDisposable(() => notification.close()));
			const onDidClose = store.add(new Emitter<void>());
			let closed = false;
			const notification = upcastPartial<INotificationHandle>({
				onDidClose: onDidClose.event,
				close: () => {
					state.closed++;
					if (!closed) {
						closed = true;
						onDidClose.fire();
					}
				},
			});
			instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
				prompt: (severity, message, choices) => {
					state.severity = severity;
					state.notifications.push(String(message));
					state.choices = choices;
					return notification;
				},
				error: message => {
					state.notifications.push(String(message));
					return notification;
				},
			}));
			instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
				openSession: async (resource, options) => {
					state.openedSessions.push({ resource, options });
					await state.openSession();
				},
			}));
			instantiationService.stub(ICustomViewService, upcastPartial<ICustomViewService>({
				showCustomView: id => { state.openedViews.push(id); },
			}));
			const run = () => instantiationService.invokeFunction(CommandsRegistry.getCommand(commandId)!.handler);
			const accept = (item: IQuickPickItem) => {
				picker.selectedItems = [item];
				onDidAccept.fire({ inBackground: false });
			};
			return { state, catalogue, catalogueState, runnable, configurationService, notification, picker, accept, run };
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

		test('loads a missing catalogue, filters unavailable automations, and runs the selected identity without waiting for completion', async () => {
			const remote = { ...automation, id: 'remote:review', target: { ...automation.target, providerId: 'remote' } };
			const { state, catalogue, catalogueState, run } = setup([automation, remote]);
			catalogue.set([], undefined);
			catalogueState.set('loading', undefined);
			state.refresh = async () => catalogue.set([automation, remote, { ...automation, id: 'unavailable' }], undefined);
			state.select = items => items[1];
			await run();
			assert.deepStrictEqual({
				picks: state.picks.map(({ id, label, description, detail }) => ({ id, label, description, detail })),
				calls: state.calls,
				refreshCalls: state.refreshCalls,
				notifications: state.notifications,
			}, {
				picks: [
					{ id: automation.id, label: 'Review', description: 'Local · /workspace', detail: automation.prompt },
					{ id: remote.id, label: 'Review', description: 'Remote · /workspace', detail: remote.prompt },
				],
				calls: [remote],
				refreshCalls: 1,
				notifications: ['Run requested for automation \'Review\'.'],
			});
		});

		for (const status of ['ready', 'loading', 'unavailable', 'error'] as const) {
			test(`uses cached automations without refreshing when catalogue state is ${status}`, async () => {
				const { state, catalogueState, run } = setup();
				catalogueState.set(status, undefined);
				await run();
				assert.deepStrictEqual({
					refreshCalls: state.refreshCalls,
					picks: state.picks.map(item => item.id),
					calls: state.calls,
				}, { refreshCalls: 0, picks: [automation.id], calls: [automation] });
			});
		}

		test('shows automations that arrive after refresh resolves while the picker remains open', async () => {
			const { state, catalogue, catalogueState, runnable, picker, accept, run } = setup([]);
			state.autoAccept = false;
			catalogueState.set('loading', undefined);
			const refreshed = Promise.resolve();
			state.refresh = () => refreshed;
			const operation = run();
			await refreshed;
			const beforeArrival = { shown: state.pickerShown, busy: picker.busy, labels: state.picks.map(item => item.label) };
			runnable.add(automation.id);
			transaction(tx => {
				catalogue.set([automation], tx);
				catalogueState.set('ready', tx);
			});
			accept(state.picks[0]);
			await operation;
			assert.deepStrictEqual({
				beforeArrival,
				refreshCalls: state.refreshCalls,
				picks: state.picks.map(item => item.id),
				busy: picker.busy,
				calls: state.calls,
				disposed: state.pickerDisposed,
			}, {
				beforeArrival: { shown: true, busy: true, labels: ['Loading automations...'] },
				refreshCalls: 1,
				picks: [automation.id],
				busy: false,
				calls: [automation],
				disposed: true,
			});
		});

		test('keeps healthy providers usable and preserves the active item and filter as more automations arrive', async () => {
			const remote = { ...automation, id: 'remote:review', target: { ...automation.target, providerId: 'remote' } };
			const { state, catalogue, catalogueState, runnable, picker, accept, run } = setup([automation]);
			state.autoAccept = false;
			catalogueState.set('loading', undefined);
			const operation = run();
			picker.value = 'Review';
			picker.activeItems = [state.picks[0]];
			runnable.add(remote.id);
			catalogue.set([remote, automation], undefined);
			const activeId = picker.activeItems[0]?.id;
			accept(picker.activeItems[0]);
			await operation;
			assert.deepStrictEqual({
				refreshCalls: state.refreshCalls,
				picks: state.picks.map(item => item.id),
				activeId,
				value: picker.value,
				calls: state.calls,
			}, {
				refreshCalls: 0,
				picks: [remote.id, automation.id],
				activeId: automation.id,
				value: 'Review',
				calls: [automation],
			});
		});

		test('cancelling while refresh is pending disposes the picker and ignores later catalogue updates', async () => {
			const { state, catalogue, catalogueState, picker, run } = setup([]);
			state.autoAccept = false;
			catalogueState.set('loading', undefined);
			const refresh = new DeferredPromise<void>();
			state.refresh = () => refresh.p;
			const operation = run();
			picker.hide();
			await operation;
			catalogue.set([automation], undefined);
			await refresh.complete();
			assert.deepStrictEqual({
				disposed: state.pickerDisposed,
				labels: state.picks.map(item => item.label),
				calls: state.calls,
			}, { disposed: true, labels: ['Loading automations...'], calls: [] });
		});

		for (const kind of ['started', 'alreadyRunning'] as const) {
			test(`offers to open the exact ${kind} run without opening it automatically`, async () => {
				const { state, run } = setup();
				state.dispatch = kind === 'started'
					? { kind, run: automationRun, sessionResource: automationRun.sessionResource! }
					: { kind, activeRun: automationRun };
				await run();
				assert.deepStrictEqual(state.openedSessions, []);
				await state.choices[0].run();
				assert.deepStrictEqual({
					severity: state.severity,
					labels: state.choices.map(choice => choice.label),
					sessions: state.openedSessions,
					views: state.openedViews,
				}, {
					severity: Severity.Info,
					labels: ['Open Run'],
					sessions: [{ resource: automationRun.sessionResource, options: { preserveFocus: false, source: 'automation' } }],
					views: [],
				});
			});
		}

		test('opens Automations when an accepted request has no correlated run', async () => {
			const { state, run } = setup();
			await run();
			await state.choices[0].run();
			assert.deepStrictEqual({
				labels: state.choices.map(choice => choice.label),
				sessions: state.openedSessions,
				views: state.openedViews,
			}, { labels: ['Show Automations'], sessions: [], views: [AUTOMATIONS_CUSTOM_VIEW_ID] });
		});

		test('dismisses the notification after exactly ten seconds', async () => {
			const clock = useFakeTimers();
			try {
				const { state, run } = setup();
				await run();
				clock.tick(9_999);
				const beforeTimeout = state.closed;
				clock.tick(1);
				assert.deepStrictEqual({ beforeTimeout, afterTimeout: state.closed }, { beforeTimeout: 0, afterTimeout: 1 });
			} finally {
				clock.restore();
			}
		});

		test('closing the notification cancels its dismissal timer', async () => {
			const clock = useFakeTimers();
			try {
				const { state, notification, run } = setup();
				await run();
				notification.close();
				clock.tick(10_000);
				assert.strictEqual(state.closed, 1);
			} finally {
				clock.restore();
			}
		});

		test('reports an error if the run cannot be opened', async () => {
			const { state, run } = setup();
			state.dispatch = { kind: 'started', run: automationRun, sessionResource: automationRun.sessionResource! };
			state.openSession = async () => { throw new Error('Session unavailable'); };
			await run();
			await state.choices[0].run();
			assert.deepStrictEqual(state.notifications, [
				'Run requested for automation \'Review\'.',
				'Failed to open automation run: Session unavailable',
			]);
		});

		test('a failed provider refresh does not block runnable automations', async () => {
			const unavailable = { ...automation, id: 'unavailable' };
			const { state, catalogue, catalogueState, runnable, run } = setup([automation, unavailable]);
			catalogue.set([], undefined);
			catalogueState.set('error', undefined);
			state.refresh = async () => {
				catalogue.set([automation, unavailable], undefined);
				runnable.delete(unavailable.id);
				throw new Error('Provider refresh failed');
			};
			await run();
			assert.deepStrictEqual({ refreshCalls: state.refreshCalls, picks: state.picks.map(item => item.id), calls: state.calls }, {
				refreshCalls: 1,
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

		test('a loaded empty catalogue shows a non-pickable explanation without refreshing', async () => {
			const { state, run } = setup([]);
			await run();
			assert.deepStrictEqual({ refreshCalls: state.refreshCalls, picks: state.picks, calls: state.calls }, {
				refreshCalls: 0,
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
