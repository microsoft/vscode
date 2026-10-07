/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { Action } from '../../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { AgentCustomization, CustomizationType } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ClaudeSessionConfigKey } from '../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { CodexSessionConfigKey } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IUpdateService } from '../../../../../../platform/update/common/update.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { createServices } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatPetService } from '../../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatConfiguration } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { resetShownWarnings } from '../../../../../../workbench/contrib/chat/common/chatPermissionWarnings.js';
import { ChatPhoneInputPresenterRequest, IChatPhoneInputPresenter, IChatPhoneInputSessionContext, IChatPhoneSessionModelPicker, MobileChatInputCombinedPickerActionItem } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { whenModelConfigValuesSaved } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { IChatMode, IChatModes } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelConfigurationAccess } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { IWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/common/environmentService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService, TestWorkspaceTrustManagementService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { NullLanguageModelsService } from '../../../../../../workbench/contrib/chat/test/common/languageModels.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionModelsSnapshot } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ExperimentalMobileChatPhoneInputPresenterContribution } from '../../browser/mobile/experimentalMobileChatPhoneInputPresenter.js';
import { INewChatModelPickerService, NewChatModelPickerService } from '../../../../chat/browser/newChatModelPicker.js';
import { ModelPicker } from '../../../../chat/browser/modelPicker.js';
import { ISessionModelSelection } from '../../../../chat/browser/sessionModelSelection.js';
import { createModelSelectionState, normalizeModelPickerOptions } from '../../../../chat/browser/sessionModelPickerState.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { MockChatSessionsService } from '../../../../../../workbench/contrib/chat/test/common/mockChatSessionsService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISessionAgentRef, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ISessionContext, SessionContext } from '../../../../../services/sessions/browser/sessionContext.js';
import { MobilePermissionPicker } from '../../../copilotChatSessions/browser/mobilePermissionPicker.js';
import { MobileAgentHostModePicker } from '../../browser/mobile/mobileAgentHostModePicker.js';
import { AgentHostPermissionPickerDelegate } from '../../browser/agentHostPermissionPickerDelegate.js';
import { AgentHostSessionConfigPickerContribution } from '../../browser/agentHostSessionConfigPicker.js';
import { TABBED_MODEL_PICKER_SETTING_ID } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerWidget.js';
import { Menus } from '../../../../../browser/menus.js';

suite('ExperimentalMobileChatPhoneInputPresenter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => resetShownWarnings());

	function createHarness(modelCount = 2, options: { readonly cloud?: boolean; readonly approvals?: boolean; readonly speed?: boolean; readonly confirmPermissions?: boolean; readonly customAgents?: boolean; readonly sandbox?: boolean } = {}) {
		const container = dom.append(mainWindow.document.body, dom.$('div.phone-layout'));
		store.add(toDisposable(() => container.remove()));
		const contextKeys = new MockContextKeyService();
		contextKeys.createKey('sessionsIsPhoneLayout', true);
		const models: ILanguageModelChatMetadataAndIdentifier[] = Array.from({ length: modelCount }, (_, index) => ({
			identifier: `copilot:model-${index}`,
			metadata: {
				extension: new ExtensionIdentifier('test.models'),
				id: `model-${index}`,
				name: `Model ${index}`,
				vendor: 'copilot',
				version: '1',
				family: 'test',
				maxInputTokens: 264000,
				maxOutputTokens: 64000,
				isDefaultForLocation: {},
				configurationSchema: {
					properties: {
						effort: { type: 'string', title: 'Reasoning', group: 'navigation', enum: ['low', 'high'], enumItemLabels: ['Low', 'High'], default: 'low' },
						context: { type: 'number', title: 'Context Window', group: 'tokens', enum: [264000, 1000000], enumItemLabels: ['264K', '1M'], default: 264000 },
					},
				},
			},
		}));
		if (options.speed) {
			models[1] = { ...models[0], identifier: 'copilot:model-0-fast', metadata: { ...models[0].metadata, id: 'model-0-fast', name: 'Model 0 Fast' } };
		}
		const mode = upcastPartial<IChatMode>({ id: 'agent', label: constObservable('Agent'), icon: constObservable(Codicon.copilot) });
		const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('model', models[0]);
		const writes: { model: string; values: Record<string, unknown> }[] = [];
		const configuration = new Map<string, Record<string, unknown>>();
		const access: IModelConfigurationAccess = {
			getModelConfiguration: model => configuration.get(model),
			getModelConfigurationActions: () => [],
			setModelConfiguration: async (model, values) => {
				writes.push({ model, values });
				configuration.set(model, { ...configuration.get(model), ...values });
			},
		};
		let context: IChatPhoneInputSessionContext = {
			providerId: options.cloud ? 'cloud-draft-creation' : LOCAL_AGENT_HOST_PROVIDER_ID,
			sessionId: 'session-one',
			sessionType: options.sandbox ? 'copilotcli' : 'test',
			chatResource: URI.parse('chat:/one'),
			modelId: models[0].identifier,
		};
		const activeChat = observableValue<IChat>('chat', upcastPartial<IChat>({ resource: context.chatResource }));
		const selectedAgent = observableValue<{ id: string; kind: string } | undefined>('agent', undefined);
		const inputSession = constObservable(upcastPartial<IActiveSession>({
			...context,
			resource: URI.parse('session:/one'),
			activeChat,
			modelId: derived(reader => currentModel.read(reader)?.identifier),
			status: constObservable(SessionStatus.Untitled),
			mode: selectedAgent,
		}));
		const configChanged = store.add(new Emitter<string>());
		let config: ResolveSessionConfigResult | undefined = options.approvals ? {
			schema: {
				type: 'object', properties: {
					mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], enumLabels: ['Interactive', 'Plan', 'Autopilot'], default: 'interactive', sessionMutable: true },
					approvalMode: { type: 'string', title: 'Approvals', enum: ['manual', 'assisted', 'allow-all'], default: 'manual', sessionMutable: true },
					...(options.sandbox ? { [SessionConfigKey.SandboxEnabled]: { type: 'string' as const, title: 'Sandbox', enum: ['on', 'off'], default: 'off', sessionMutable: true } } : {}),
				}
			},
			values: { mode: 'interactive', approvalMode: 'manual' },
		} : undefined;
		const configWrites: { key: string; value: unknown }[] = [];
		const resolving = observableValue('resolving', false);
		const agentWrites: (ISessionAgentRef | undefined)[] = [];
		let configSaveBarrier: DeferredPromise<void> | undefined;
		const configProvider = {
			getSessionConfig: () => config,
			getCreateSessionConfig: () => options.cloud ? config?.values : undefined,
			isSessionConfigResolving: () => resolving,
			onDidChangeSessionConfig: configChanged.event,
			setSessionConfigValue: async (_id: string, key: string, value: unknown) => {
				if (configSaveBarrier) {
					resolving.set(true, undefined);
					await configSaveBarrier.p;
				}
				configWrites.push({ key, value });
				if (config) {
					config = { ...config, values: { ...config.values, [key]: value } };
					configChanged.fire(context.sessionId);
				}
				resolving.set(false, undefined);
			},
		};
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			...configProvider,
			id: context.providerId,
			sessionConfig: configProvider,
			getModelsSnapshot: () => upcastPartial<ISessionModelsSnapshot>({ models }),
			getModelPickerOptions: () => ({ showAutoModel: true, useGroupedModelPicker: false, showFeatured: false, showUnavailableFeatured: false, showManageModelsAction: false }),
			getAutomationModelConfiguration: () => access,
			getSessions: () => [inputSession.get()],
			getCustomAgents: () => [upcastPartial<AgentCustomization>({ type: CustomizationType.Agent, uri: 'file:///agents/planner.agent.md', name: 'Planner', description: 'Plan the task' })],
			setAgent: options.customAgents ? (_sessionId, agent) => {
				agentWrites.push(agent);
				selectedAgent.set(agent && { id: agent.uri, kind: 'agent' }, undefined);
			} : undefined,
		});
		let policyRestricted = false;
		const configurationService = new class extends TestConfigurationService {
			override inspect<T>(key: string): IConfigurationValue<T> {
				const value = super.inspect<T>(key);
				return { ...value, policyValue: policyRestricted && key === ChatConfiguration.GlobalAutoApprove ? value.value : undefined };
			}
		}({ [ChatConfiguration.GlobalAutoApprove]: false, [TABBED_MODEL_PICKER_SETTING_ID]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const dialogService = new TestDialogService(undefined, { result: options.confirmPermissions ?? true });
		const errors: unknown[] = [];
		const newChatModelPicker = new NewChatModelPickerService();
		const entitlementService = new TestChatEntitlementService();
		entitlementService.entitlement = ChatEntitlement.Pro;
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatPhoneInputPresenter)?.[1];
		assert.ok(descriptor);
		const instantiationService = createServices(store.add(new DisposableStore()), [
			[IChatPhoneInputPresenter, descriptor.ctor],
			[IContextKeyService, contextKeys],
			[ICommandService, upcastPartial<ICommandService>({})],
			[IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ mainContainer: container })],
			[ISessionsService, upcastPartial<ISessionsService>({ activeSession: inputSession, visibleSessions: constObservable([inputSession.get()]) })],
			[ISessionsProvidersService, getSingletonServiceDescriptors().find(([id]) => id === ISessionsProvidersService)![1].ctor],
			[IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri })],
			[IChatPetService, upcastPartial<IChatPetService>({})],
			[ILanguageModelsService, new class extends NullLanguageModelsService {
				override getLanguageModelIds() { return models.map(model => model.identifier); }
				override async setModelConfiguration() { assert.fail('The session-scoped model configuration must be used'); }
			}()],
			[IConfigurationService, configurationService],
			[IDialogService, dialogService],
			[IStorageService, store.add(new InMemoryStorageService())],
			[IActionWidgetService, upcastPartial<IActionWidgetService>({ isVisible: false, hide: () => { } })],
			[IHoverService, upcastPartial<IHoverService>({ setupDelayedHover: () => Disposable.None })],
			[ITelemetryService, NullTelemetryService],
			[IOpenerService, upcastPartial<IOpenerService>({ open: async () => true })],
			[IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({
				managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false),
			})],
			[IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({})],
			[INotificationService, upcastPartial<INotificationService>({ error: error => errors.push(error) })],
			[IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => undefined })],
			[IKeybindingService, new MockKeybindingService()],
			[IProductService, upcastPartial<IProductService>({ version: '1.142.0', quality: 'dev' })],
			[IDefaultAccountService, upcastPartial<IDefaultAccountService>({})],
			[IUpdateService, upcastPartial<IUpdateService>({})],
			[IWorkspaceTrustManagementService, store.add(new TestWorkspaceTrustManagementService())],
			[IWorkspaceTrustRequestService, upcastPartial<IWorkspaceTrustRequestService>({})],
			[IChatEntitlementService, entitlementService],
			[ISessionContext, new SessionContext(inputSession)],
			[IPreferencesService, upcastPartial<IPreferencesService>({})],
			[IChatSessionsService, new MockChatSessionsService()],
			[IActionViewItemService, getSingletonServiceDescriptors().find(([id]) => id === IActionViewItemService)![1].ctor],
			[ISessionModelSelection, upcastPartial<ISessionModelSelection>({
				state: derived(reader => createModelSelectionState(models, normalizeModelPickerOptions(undefined), currentModel.read(reader), undefined)),
				modelConfiguration: access,
				selectModel: identifier => {
					const model = models.find(model => model.identifier === identifier);
					if (!model) {
						return false;
					}
					currentModel.set(model, undefined);
					context = { ...context, modelId: model.identifier };
					return true;
				},
			})],
		]);
		store.add(instantiationService.get(ISessionsProvidersService).registerProvider(provider));
		const presenter = instantiationService.get(IChatPhoneInputPresenter);
		const enabledBefore = presenter.enabled.get();
		const defaultsBefore = { metrics: presenter.inputEditorMetrics, deferClipboard: presenter.deferClipboardImageRead };
		const contribution = store.add(instantiationService.createInstance(ExperimentalMobileChatPhoneInputPresenterContribution));
		const delegates: ChatPhoneInputPresenterRequest = {
			kind: 'delegates',
			modeDelegate: {
				currentMode: constObservable(mode),
				currentChatModes: constObservable(upcastPartial<IChatModes>({ builtin: [mode], custom: [] })),
				sessionResource: () => undefined,
			},
			modelDelegate: {
				currentModel,
				getModels: () => models,
				setModel: model => {
					currentModel.set(model, undefined);
					context = { ...context, modelId: model.identifier };
				},
				getPresentationOptions: () => ({ showFeatured: false, showAutoModel: true, showModelIcon: false, useGroupedModelPicker: false, showUnavailableFeatured: false, showManageModelsAction: false }),
				modelConfiguration: access,
			},
		};
		const session: ChatPhoneInputPresenterRequest = {
			kind: 'session',
			getSessionContext: () => context,
			modelDelegate: options.cloud ? delegates.modelDelegate : undefined,
			selectModel: identifier => {
				context = { ...context, modelId: identifier };
				return true;
			},
		};
		const currentSheet = () => container.querySelector<HTMLElement>('.mobile-picker-sheet:not(.closing)');
		const row = (label: string) => {
			const result = Array.from(currentSheet()?.querySelectorAll<HTMLButtonElement>('.mobile-picker-sheet-item') ?? [])
				.find(item => item.querySelector('.mobile-picker-sheet-label')?.textContent === label);
			assert.ok(result, `Missing sheet row: ${label}`);
			return result;
		};
		const open = (request: ChatPhoneInputPresenterRequest) => {
			const closed = presenter.showCombinedModeAndModelSheet(container, request);
			store.add(toDisposable(() => currentSheet()?.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')?.click()));
			return closed;
		};
		const close = () => currentSheet()?.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')?.click();
		return {
			container, presenter, contribution, enabledBefore, defaultsBefore, delegates, session, open, close, currentSheet, row, writes, access, currentModel,
			switchChat: () => {
				context = { ...context, chatResource: URI.parse('chat:/two') };
				activeChat.set(upcastPartial<IChat>({ resource: context.chatResource }), undefined);
			},
			configWrites, errors, dialogService, configurationService, newChatModelPicker, instantiationService,
			inputSession,
			models, resolving, agentWrites,
			holdConfigSave: (barrier: DeferredPromise<void>) => { configSaveBarrier = barrier; },
			updateConfig: (next: ResolveSessionConfigResult) => { config = next; configChanged.fire(context.sessionId); },
			restrictPermissions: () => { policyRestricted = true; },
			waitForSelection: async () => {
				for (let index = 0; index < 20 && currentSheet()?.querySelector('[aria-busy="true"]'); index++) {
					await timeout(0);
				}
				assert.ok(!currentSheet()?.querySelector('[aria-busy="true"]'));
			},
		};
	}

	for (const provider of ['claude', 'codex'] as const) {
		for (const running of [false, true]) {
			test(`${provider} ${running ? 'running' : 'draft'} approvals pill uses the same sheet and advertised values`, async () => {
				const harness = createHarness();
				const key = provider === 'claude' ? ClaudeSessionConfigKey.PermissionMode : CodexSessionConfigKey.PermissionsPreset;
				const value = provider === 'claude' ? 'acceptEdits' : 'auto-review';
				harness.updateConfig({
					schema: { type: 'object', properties: { [key]: { type: 'string', title: 'Approvals', enum: ['default', value], enumLabels: ['Manual', 'Selected permissions'], default: 'default', sessionMutable: true } } },
					values: { [key]: 'default' },
				});
				const { instantiationService } = harness;
				store.add(instantiationService.createInstance(AgentHostSessionConfigPickerContribution));
				const actionId = `sessions.agentHost.${running ? 'running' : 'new'}Session${provider === 'claude' ? 'PermissionMode' : 'CodexApprovals'}Picker`;
				const factory = instantiationService.get(IActionViewItemService).lookUp(running ? MenuId.ChatInputSecondary : Menus.NewSessionControl, actionId)!;
				const action = instantiationService.createInstance(MenuItemAction, { id: actionId, title: 'Approvals' }, undefined, undefined, undefined, undefined);
				const picker = store.add(factory(action, {}, instantiationService, mainWindow.vscodeWindowId)!);
				const host = dom.append(harness.container, dom.$('div'));
				picker.render(host);
				host.querySelector<HTMLElement>('.action-label')!.click();
				const title = harness.currentSheet()?.querySelector('.mobile-picker-sheet-title')?.textContent;
				harness.row('Selected permissions').click();
				await harness.waitForSelection();
				harness.close();
				await timeout(300);
				assert.deepStrictEqual({ title, writes: harness.configWrites }, { title: 'Configure Session', writes: [{ key, value }] });
			});
		}
	}

	for (const control of ['model name', 'model details', 'mode', 'permissions', 'running permissions'] as const) {
		test(`${control} pill opens Configure Session rather than a desktop popup`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const harness = createHarness(2, { cloud: control !== 'running permissions', approvals: true });
				const { instantiationService } = harness;
				instantiationService.stub(INewChatModelPickerService, harness.newChatModelPicker);
				const toolbar = dom.append(harness.container, dom.$('div'));
				const modelPicker = store.add(instantiationService.createInstance(ModelPicker, constObservable(false)));
				modelPicker.render(dom.append(toolbar, dom.$('div')));
				let trigger: HTMLElement;
				if (control === 'model name' || control === 'model details') {
					trigger = toolbar.querySelector<HTMLElement>(control === 'model name' ? '.model-picker-name' : '.model-picker-config')!;
					trigger.dispatchEvent(new mainWindow.Event(TouchEventType.Tap, { bubbles: true }));
					trigger.dispatchEvent(new mainWindow.MouseEvent('mousedown', { button: 0, bubbles: true }));
				} else if (control === 'mode') {
					const picker = store.add(instantiationService.createInstance(MobileAgentHostModePicker, harness.inputSession));
					trigger = picker.render(dom.append(toolbar, dom.$('div')));
					trigger.click();
				} else if (control === 'permissions') {
					const delegate = store.add(instantiationService.createInstance(AgentHostPermissionPickerDelegate, harness.inputSession));
					const picker = store.add(instantiationService.createInstance(MobilePermissionPicker, delegate));
					const host = dom.append(toolbar, dom.$('div'));
					picker.render(host);
					trigger = host.querySelector<HTMLElement>('.action-label')!;
					trigger.click();
					trigger.dispatchEvent(new mainWindow.Event(TouchEventType.Tap, { bubbles: true }));
				} else {
					store.add(instantiationService.createInstance(AgentHostSessionConfigPickerContribution));
					const actionId = 'sessions.agentHost.runningSessionConfigPicker';
					const factory = instantiationService.get(IActionViewItemService).lookUp(MenuId.ChatInputSecondary, actionId)!;
					assert.ok(factory);
					const action = instantiationService.createInstance(MenuItemAction, { id: actionId, title: 'Approvals' }, undefined, undefined, undefined, undefined);
					const picker = store.add(factory(action, {}, instantiationService, mainWindow.vscodeWindowId)!);
					const host = dom.append(toolbar, dom.$('div'));
					picker.render(host);
					trigger = host.querySelector<HTMLElement>('.action-label')!;
					trigger.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
				}
				const state = {
					title: harness.currentSheet()?.querySelector('.mobile-picker-sheet-title')?.textContent,
					sheets: harness.container.querySelectorAll('.mobile-picker-sheet:not(.closing)').length,
					desktop: harness.container.querySelectorAll('.context-view, .quick-input-widget, .model-picker-tabbed-widget').length,
					sections: Array.from(harness.currentSheet()?.querySelectorAll('.mobile-picker-sheet-section-title') ?? [], element => element.textContent),
				};
				harness.close();
				await timeout(500);
				assert.deepStrictEqual({ ...state, focused: mainWindow.document.activeElement === trigger }, {
					title: 'Configure Session', sheets: 1, desktop: 0,
					sections: ['Agent Mode', 'Model', 'Reasoning', 'Context Window', 'Approvals'],
					focused: true,
				});
			});
		});
	}

	test('finds the originating input by provider, session and chat, and removes disposed registrations', () => {
		const { presenter } = createHarness();
		const context = { providerId: 'host-one', sessionId: 'opaque-session', sessionType: 'copilot', chatResource: URI.parse('ahp-session:/same'), modelId: undefined };
		const makePicker = (providerId: string): IChatPhoneSessionModelPicker => ({
			getSessionContext: () => ({ ...context, providerId }),
			selectModel: () => true,
		});
		const expected = makePicker('host-one');
		const registration = store.add(presenter.registerSessionModelPicker(expected));
		store.add(presenter.registerSessionModelPicker(makePicker('host-two')));
		const matched = presenter.getSessionModelPicker(context) === expected;
		const wrongSession = presenter.getSessionModelPicker({ ...context, sessionId: 'different' });
		const wrongChat = presenter.getSessionModelPicker({ ...context, chatResource: URI.parse('ahp-session:/another') });
		registration.dispose();
		assert.deepStrictEqual({ matched, wrongSession, wrongChat, afterDispose: presenter.getSessionModelPicker(context) }, {
			matched: true, wrongSession: undefined, wrongChat: undefined, afterDispose: undefined,
		});
	});

	test('an input constructed before phone activation registers its selection callback when the presenter becomes enabled', () => {
		const harness = createHarness();
		const enabled = observableValue('enabled', false);
		store.add(harness.presenter.setImpl({ enabled, supportsUnifiedConfiguration: true, showCombinedModeAndModelSheet: async () => { } }));
		harness.instantiationService.stub(INewChatModelPickerService, harness.newChatModelPicker);
		store.add(harness.instantiationService.createInstance(ModelPicker, constObservable(false)));
		const context = harness.session.getSessionContext()!;
		const before = harness.presenter.getSessionModelPicker(context);
		enabled.set(true, undefined);
		const selected = harness.presenter.getSessionModelPicker(context)?.selectModel(harness.models[1].identifier);
		enabled.set(false, undefined);
		assert.deepStrictEqual({ before, selected, model: harness.currentModel.get()?.identifier, after: harness.presenter.getSessionModelPicker(context) }, {
			before: undefined, selected: true, model: harness.models[1].identifier, after: undefined,
		});
	});

	test('registers and removes the experimental implementation through the existing presenter hook', () => {
		const { presenter, contribution, enabledBefore } = createHarness();
		const enabledDuring = presenter.enabled.get();
		contribution.dispose();
		assert.deepStrictEqual([enabledBefore, enabledDuring, presenter.enabled.get()], [false, true, false]);
	});

	test('font metrics and clipboard behavior change only while the experimental presenter is installed', () => {
		const { presenter, contribution, defaultsBefore } = createHarness();
		const active = { metrics: presenter.inputEditorMetrics, deferClipboard: presenter.deferClipboardImageRead };
		contribution.dispose();
		assert.deepStrictEqual({ before: defaultsBefore, active, after: { metrics: presenter.inputEditorMetrics, deferClipboard: presenter.deferClipboardImageRead } }, {
			before: { metrics: undefined, deferClipboard: false },
			active: { metrics: { fontSize: 16, lineHeight: 24 }, deferClipboard: true },
			after: { metrics: undefined, deferClipboard: false },
		});
	});

	test('the factory renders the mobile button and coalesces keyboard, click and tap activation', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			const { modeDelegate, modelDelegate } = harness.delegates;
			const action = store.add(new Action('test.config', 'Configure'));
			const item = harness.presenter.createActionViewItem?.(action, modeDelegate, modelDelegate);
			assert.ok(item);
			store.add(item);
			const buttonContainer = dom.append(harness.container, dom.$('div'));
			item.render(buttonContainer);
			const trigger = buttonContainer.querySelector<HTMLElement>('.chat-phone-input-chip')!;
			const icons = Array.from(trigger.querySelectorAll('.codicon'), element => element.className);
			trigger.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
			trigger.click();
			trigger.dispatchEvent(new mainWindow.Event(TouchEventType.Tap, { bubbles: true, cancelable: true }));
			const opened = {
				sheets: harness.container.querySelectorAll('.mobile-picker-sheet:not(.closing)').length,
				expanded: trigger.getAttribute('aria-expanded'),
			};
			harness.close();
			await timeout(500);
			assert.deepStrictEqual({ label: trigger.textContent, icons, opened, expanded: trigger.getAttribute('aria-expanded'), focused: mainWindow.document.activeElement === trigger }, {
				label: 'Model 0',
				icons: ['codicon codicon-chevron-down chat-phone-input-chip-chevron'],
				opened: { sheets: 1, expanded: 'true' },
				expanded: 'false',
				focused: true,
			});
		});
	});

	test('the original full-workbench button keeps its mode icon and needs no custom factory', () => {
		const harness = createHarness();
		harness.contribution.dispose();
		const { modeDelegate, modelDelegate } = harness.delegates;
		const action = store.add(new Action('test.config', 'Configure'));
		const customItem = harness.presenter.createActionViewItem?.(action, modeDelegate, modelDelegate);
		const item = store.add(new MobileChatInputCombinedPickerActionItem(action, modeDelegate, modelDelegate, harness.presenter));
		const buttonContainer = dom.append(harness.container, dom.$('div'));
		item.render(buttonContainer);
		assert.deepStrictEqual({
			customItem,
			label: buttonContainer.querySelector('.chat-input-picker-label')?.textContent,
			modeIcon: !!buttonContainer.querySelector('.codicon-copilot'),
			chevron: !!buttonContainer.querySelector('.chat-phone-input-chip-chevron'),
		}, { customItem: undefined, label: 'Model 0', modeIcon: true, chevron: false });
	});

	for (const source of ['delegates', 'session'] as const) {
		test(`${source} retains model, reasoning and context choices with scoped writes`, async () => {
			const harness = createHarness();
			const closed = harness.open(harness[source]);
			const sections = Array.from(harness.currentSheet()!.querySelectorAll('.mobile-picker-sheet-section-title'), element => element.textContent);
			const modelNavigates = !!harness.row('Model 0').querySelector('.mobile-picker-sheet-chevron');
			harness.row('High').click();
			await harness.waitForSelection();
			harness.row('1M').click();
			await whenModelConfigValuesSaved(harness.access);
			await harness.waitForSelection();
			const checked = Array.from(harness.currentSheet()!.querySelectorAll('.mobile-picker-sheet-item.checked .mobile-picker-sheet-label'), element => element.textContent);
			harness.close();
			await closed;
			assert.deepStrictEqual({ sections, modelNavigates, checked, writes: harness.writes }, {
				sections: [...(source === 'delegates' ? ['Agent Mode'] : []), 'Model', 'Reasoning', 'Context Window'],
				modelNavigates: true,
				checked: [...(source === 'delegates' ? ['Agent'] : []), 'High', '1M'],
				writes: [
					{ model: 'copilot:model-0', values: { effort: 'high' } },
					{ model: 'copilot:model-0', values: { context: 1000000 } },
				],
			});
		});
	}

	test('does not apply configuration from an open sheet after switching chats', async () => {
		const harness = createHarness();
		const closed = harness.open(harness.session);
		harness.switchChat();
		harness.row('High').click();
		harness.close();
		await closed;
		assert.deepStrictEqual(harness.writes, []);
	});

	for (const cloud of [false, true]) {
		test(`${cloud ? 'Cloud draft' : 'running session'} includes permissions and saves confirmed choices through the existing picker`, async () => {
			const harness = createHarness(2, { cloud, approvals: true });
			const closed = harness.open({ ...harness.session, initialSection: 'permissions' });
			const initialFocus = mainWindow.document.activeElement?.textContent;
			harness.row('Allow all').click();
			await harness.waitForSelection();
			const checked = harness.row('Allow all').getAttribute('aria-current');
			harness.row('Plan').click();
			await harness.waitForSelection();
			harness.close();
			await closed;
			assert.deepStrictEqual({ initialFocus, checked, writes: harness.configWrites, errors: harness.errors }, {
				initialFocus: 'Manual permissionsAsks when approval settings don\'t apply',
				checked: 'true',
				writes: [{ key: 'approvalMode', value: 'allow-all' }, { key: 'mode', value: 'plan' }],
				errors: [],
			});
		});
	}

	for (const outcome of ['cancel', 'changed chat', 'changed policy'] as const) {
		test(`permission ${outcome} does not write or show an unconfirmed checkmark`, async () => {
			const harness = createHarness(2, { cloud: true, approvals: true, confirmPermissions: outcome !== 'cancel' });
			const closed = harness.open(harness.session);
			harness.row('Allow all').click();
			if (outcome === 'changed chat') {
				harness.switchChat();
			} else if (outcome === 'changed policy') {
				harness.restrictPermissions();
			}
			await harness.waitForSelection();
			const checked = outcome === 'changed chat' ? undefined : harness.row('Manual permissions').getAttribute('aria-current');
			harness.close();
			await closed;
			assert.deepStrictEqual({ writes: harness.configWrites, checked, errors: harness.errors }, {
				writes: [], checked: outcome === 'changed chat' ? undefined : 'true', errors: [],
			});
		});
	}

	test('enterprise policy disables elevated permission rows in Configure Session', async () => {
		const harness = createHarness(2, { cloud: true, approvals: true });
		harness.restrictPermissions();
		const closed = harness.open(harness.session);
		const disabled = ['Manual permissions', 'Assisted permissions', 'Allow all'].map(label => harness.row(label).disabled);
		harness.close();
		await closed;
		assert.deepStrictEqual(disabled, [false, true, true]);
	});

	test('Cloud draft speed and model configuration use the owning model delegate', async () => {
		const harness = createHarness(2, { cloud: true, speed: true });
		const closed = harness.open({ ...harness.session, initialSection: 'modelConfiguration' });
		const focus = mainWindow.document.activeElement?.textContent;
		harness.row('Fast').click();
		await harness.waitForSelection();
		harness.row('High').click();
		await harness.waitForSelection();
		const checked = harness.row('Fast').getAttribute('aria-current');
		harness.close();
		await closed;
		assert.deepStrictEqual({ focus, checked, model: harness.currentModel.get()?.identifier, writes: harness.writes }, {
			focus: 'Low', checked: 'true', model: 'copilot:model-0-fast',
			writes: [{ model: 'copilot:model-0-fast', values: { effort: 'high' } }],
		});
	});

	test('the current input model wins while the provider model snapshot catches up', async () => {
		const harness = createHarness(2, { cloud: true });
		harness.currentModel.set(harness.models[1], undefined);
		const closed = harness.open(harness.session);
		const displayed = harness.row('Model 1').textContent;
		harness.row('High').click();
		await harness.waitForSelection();
		harness.close();
		await closed;
		assert.deepStrictEqual({ displayed, writes: harness.writes }, {
			displayed: 'Model 12 models available', writes: [{ model: 'copilot:model-1', values: { effort: 'high' } }],
		});
	});

	test('custom agent selection and clearing preserve the existing provider contract', async () => {
		const harness = createHarness(2, { customAgents: true });
		const closed = harness.open(harness.session);
		harness.row('Planner').click();
		await harness.waitForSelection();
		const checked = harness.row('Planner').getAttribute('aria-current');
		harness.row('Default Agent').click();
		await harness.waitForSelection();
		harness.close();
		await closed;
		assert.deepStrictEqual({ checked, writes: harness.agentWrites }, {
			checked: 'true', writes: [{ uri: 'file:///agents/planner.agent.md', name: 'Planner' }, undefined],
		});
	});

	test('running permissions use the live input model-configuration store rather than the automation store', async () => {
		const harness = createHarness(2, { approvals: true });
		const editorWrites: Record<string, unknown>[] = [];
		let editorValues: Record<string, unknown> = { effort: 'low' };
		const editorAccess: IModelConfigurationAccess = {
			getModelConfiguration: () => editorValues,
			getModelConfigurationActions: () => [],
			setModelConfiguration: async (_id, values) => {
				editorWrites.push(values);
				editorValues = { ...editorValues, ...values };
			},
		};
		const action = store.add(new Action('running.model', 'Model'));
		const item = harness.presenter.createActionViewItem!(action, {
			...harness.delegates.modeDelegate,
			sessionResource: () => harness.inputSession.get().activeChat.get().resource,
		}, { ...harness.delegates.modelDelegate, modelConfiguration: editorAccess })!;
		store.add(item);
		item.render(dom.append(harness.container, dom.$('div')));
		const { instantiationService } = harness;
		store.add(instantiationService.createInstance(AgentHostSessionConfigPickerContribution));
		const actionId = 'sessions.agentHost.runningSessionConfigPicker';
		const factory = instantiationService.get(IActionViewItemService).lookUp(MenuId.ChatInputSecondary, actionId)!;
		const permissionAction = instantiationService.createInstance(MenuItemAction, { id: actionId, title: 'Approvals' }, undefined, undefined, undefined, undefined);
		const picker = store.add(factory(permissionAction, {}, instantiationService, mainWindow.vscodeWindowId)!);
		const host = dom.append(harness.container, dom.$('div'));
		picker.render(host);
		host.querySelector<HTMLElement>('.action-label')!.click();
		harness.row('High').click();
		await harness.waitForSelection();
		harness.close();
		await timeout(300);
		assert.deepStrictEqual({ editorWrites, automationWrites: harness.writes }, { editorWrites: [{ effort: 'high' }], automationWrites: [] });
	});

	test('sandbox changes await resolution and leave the refreshed controls enabled', async () => {
		const harness = createHarness(2, { approvals: true, sandbox: true });
		const barrier = new DeferredPromise<void>();
		harness.holdConfigSave(barrier);
		const closed = harness.open(harness.session);
		harness.row('On').click();
		const pending = {
			busy: !!harness.currentSheet()?.querySelector('[aria-busy="true"]'),
			resolving: harness.resolving.get(),
		};
		await barrier.complete();
		await harness.waitForSelection();
		const enabled = ['On', 'Off', 'Allow all', 'Plan'].map(label => !harness.row(label).disabled);
		const checked = harness.row('On').getAttribute('aria-current');
		harness.close();
		await closed;
		assert.deepStrictEqual({ pending, enabled, checked, writes: harness.configWrites }, {
			pending: { busy: true, resolving: true }, enabled: [true, true, true, true], checked: 'true',
			writes: [{ key: SessionConfigKey.SandboxEnabled, value: 'on' }],
		});
	});

	test('late-resolving permissions appear without reopening the sheet or moving model focus', async () => {
		const harness = createHarness();
		harness.resolving.set(true, undefined);
		const closed = harness.open({ ...harness.session, initialSection: 'model' });
		const sheet = harness.currentSheet();
		harness.updateConfig({
			schema: {
				type: 'object', properties: {
					approvalMode: { type: 'string', title: 'Approvals', enum: ['manual', 'allow-all'], default: 'manual', sessionMutable: true },
					mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan'], default: 'interactive', sessionMutable: true },
				}
			},
			values: { approvalMode: 'manual', mode: 'interactive' },
		});
		harness.resolving.set(false, undefined);
		const state = {
			sameSheet: sheet === harness.currentSheet(),
			focused: mainWindow.document.activeElement?.querySelector('.mobile-picker-sheet-label')?.textContent,
			permissionEnabled: !harness.row('Allow all').disabled,
		};
		harness.row('Allow all').click();
		await harness.waitForSelection();
		harness.close();
		await closed;
		assert.deepStrictEqual({ ...state, writes: harness.configWrites }, {
			sameSheet: true, focused: 'Model 0', permissionEnabled: true, writes: [{ key: 'approvalMode', value: 'allow-all' }],
		});
	});

	test('a failed model-configuration save reports the error and keeps the saved value checked', async () => {
		const harness = createHarness();
		const failure = new Error('Could not save configuration');
		harness.access.setModelConfiguration = async () => { throw failure; };
		const closed = harness.open(harness.session);
		harness.row('High').click();
		await harness.waitForSelection();
		const selected = harness.row('Low').getAttribute('aria-current');
		harness.close();
		await closed;
		assert.deepStrictEqual({ errors: harness.errors, selected }, { errors: [failure], selected: 'true' });
	});

	test('read-only configuration and resolving permissions cannot be changed from the sheet', async () => {
		const harness = createHarness(2, { approvals: true });
		harness.models[0].metadata.configurationSchema!.properties!.effort.readOnly = true;
		harness.resolving.set(true, undefined);
		const closed = harness.open(harness.session);
		const disabled = ['High', 'Plan', 'Allow all'].map(label => harness.row(label).disabled);
		harness.close();
		await closed;
		assert.deepStrictEqual({ disabled, configWrites: harness.configWrites, writes: harness.writes }, { disabled: [true, true, true], configWrites: [], writes: [] });
	});

	for (const source of ['delegates', 'session'] as const) {
		test(`${source} searchable model selection rebuilds configuration for the new model`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const harness = createHarness(9);
				const closed = harness.open(harness[source]);
				harness.row('Model 0').click();
				await timeout(500);
				const search = harness.currentSheet()!.querySelector<HTMLInputElement>('.mobile-picker-sheet-search-input')!;
				assert.ok(search);
				search.value = 'Model 8';
				search.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
				await timeout(500);
				const results = Array.from(harness.currentSheet()!.querySelectorAll('.mobile-picker-sheet-label'), element => element.textContent);
				harness.row('Model 8').click();
				await timeout(500);
				const title = harness.currentSheet()!.querySelector('.mobile-picker-sheet-title')?.textContent;
				const label = harness.row('Model 8').querySelector('.mobile-picker-sheet-label')?.textContent;
				harness.row('High').click();
				await whenModelConfigValuesSaved(harness.access);
				harness.close();
				await closed;
				assert.deepStrictEqual({
					results, title, label, writes: harness.writes,
					selected: source === 'delegates' ? harness.currentModel.get()?.identifier : harness.session.getSessionContext()?.modelId,
				}, {
					results: ['Model 8'],
					title: 'Configure Session',
					label: 'Model 8',
					selected: 'copilot:model-8',
					writes: [{ model: 'copilot:model-8', values: { effort: 'high' } }],
				});
			});
		});
	}

	test('does not reopen configuration for a different chat after nested model selection', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness(9);
			const closed = harness.open(harness.session);
			harness.row('Model 0').click();
			await timeout(500);
			harness.switchChat();
			harness.row('Model 8').click();
			await timeout(500);
			await closed;
			assert.deepStrictEqual({ sheet: harness.currentSheet(), model: harness.session.getSessionContext()?.modelId, writes: harness.writes }, {
				sheet: null, model: 'copilot:model-0', writes: [],
			});
		});
	});
});
