/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { getAgentHostCopilotSandboxSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ComponentToState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { AgentHostChatInputPicker } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatInputPicker.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostNewSessionFolderService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IChatWidget } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatPetService } from '../../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IChatPhoneInputPresenter } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { SessionType } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatViewModel } from '../../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { AgentHostModePicker } from '../../browser/agentHostModePicker.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import '../../../../chat/browser/media/chatWidget.css';
import '../../../../../browser/media/style.css';

async function render(context: ComponentFixtureContext, mode: string, permissions: ChatPermissionLevel, sandboxed = false, flyout = false, editor = false): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.classList.add('monaco-workbench', 'interactive-session', 'modern-ui', 'monaco-enable-motion');
	if (!editor) {
		container.classList.add('agent-sessions-workbench');
	}
	container.style.position = 'relative';
	container.style.width = '900px';
	container.style.height = '450px';
	container.style.padding = 'var(--vscode-spacing-size80)';
	container.style.backgroundColor = 'var(--vscode-editor-background)';

	const configuration = new class extends TestConfigurationService {
		override async updateValue(key: string, value: unknown): Promise<void> {
			await this.setUserConfiguration(key, value);
			this.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: setting => setting === key,
				affectedKeys: new Set([key]),
				source: ConfigurationTarget.USER,
				change: { keys: [key], overrides: [] },
			});
		}
	}({
		[ChatConfiguration.ExperimentalModePermissionsPicker]: true,
		[ChatConfiguration.AssistedPermissionsEnabled]: true,
		[ChatConfiguration.PermissionsSandboxToggleEnabled]: true,
		[getAgentHostCopilotSandboxSettingId(false)]: sandboxed ? 'on' : 'off',
	});
	disposableStore.add(configuration.onDidChangeConfigurationEmitter);
	const config: ResolveSessionConfigResult = {
		schema: {
			type: 'object',
			properties: {
				mode: {
					type: 'string', title: 'Mode',
					enum: ['interactive', 'plan', 'autopilot'],
					enumLabels: ['Interactive', 'Plan', 'Autopilot'],
					enumDescriptions: ['Works with you, turn by turn', 'Creates a plan before making changes', 'Works autonomously until the task is done'],
				},
				autoApprove: {
					type: 'string', title: 'Permissions',
					enum: ['default', 'assisted', 'autoApprove'],
					enumLabels: ['Manual permissions', 'Assisted permissions', 'Allow all'],
					enumDescriptions: ['Asks when approval settings don\'t apply', 'Evaluates risk before running tools', 'Runs tool calls without asking'],
				},
			},
		},
		values: { mode, autoApprove: permissions },
	};
	const configChanged = disposableStore.add(new Emitter<string>());
	const provider = new class extends mock<IAgentHostSessionsProvider>() {
		override readonly id = 'local-agent-host';
		override readonly onDidChangeSessionConfig = configChanged.event;
		override getSessionConfig() { return config; }
		override isSessionConfigResolving() { return constObservable(false); }
		override async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
			config.values[property] = value;
			configChanged.fire(sessionId);
		}
	}();
	const providers = new Map<string, ISessionsProvider>([[provider.id, provider]]);
	const session = constObservable<IActiveSession | undefined>(new class extends mock<IActiveSession>() {
		override readonly providerId = provider.id;
		override readonly sessionId = 'fixture';
		override readonly sessionType = 'copilotcli';
	}());
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme, additionalServices: registerWorkbenchServices });
	instantiationService.set(IConfigurationService, configuration);
	instantiationService.set(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProviders() { return [...providers.values()]; }
		override getProvider<T extends ISessionsProvider>(id: string): T | undefined { return providers.get(id) as T | undefined; }
	}());
	instantiationService.stub(IChatPetService, { unlockAchievement: () => false });
	instantiationService.stub(IChatPhoneInputPresenter, { enabled: constObservable(false) });
	instantiationService.stub(IAgentHostEnablementService, { enabled: constObservable(true), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) });
	instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
		override readonly mainContainer = container;
		override readonly activeContainer = container;
		override readonly onDidLayoutContainer = Event.None;
		override getContainer() { return container; }
	}());
	instantiationService.set(IContextViewService, disposableStore.add(instantiationService.createInstance(ContextViewService)));
	instantiationService.set(IActionWidgetService, disposableStore.add(instantiationService.createInstance(ActionWidgetService)));
	const toolbar = dom.append(container, dom.$('.interactive-input-part'));
	toolbar.style.position = 'absolute';
	toolbar.style.left = '350px';
	toolbar.style.bottom = '8px';
	const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
	const actions = dom.append(actionBar, dom.$('ul.actions-container'));
	const actionItem = dom.append(actions, dom.$('li.action-item'));
	if (editor) {
		const state = new class extends mock<SessionState>() {
			override readonly config = config;
		}();
		const changed = disposableStore.add(new Emitter<SessionState>());
		const subscriptions: { [K in StateComponents]?: IAgentSubscription<ComponentToState[K]> } = {
			[StateComponents.Session]: { value: state, verifiedValue: state, onDidChange: changed.event, onWillApplyAction: Event.None, onDidApplyAction: Event.None },
		};
		instantiationService.set(IAgentHostService, new class extends mock<IAgentHostService>() {
			override getSubscription<T extends StateComponents>(kind: T): IReference<IAgentSubscription<ComponentToState[T]>> {
				const subscription = subscriptions[kind];
				if (!subscription) {
					throw new Error(`Unsupported fixture subscription: ${kind}`);
				}
				return { object: subscription, dispose: () => { } };
			}
			override dispatch(_resource: string, action: Parameters<IAgentHostService['dispatch']>[1]): void {
				if (action.type === ActionType.SessionConfigChanged) {
					Object.assign(config.values, action.config);
					changed.fire(state);
				}
			}
		}());
		instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, { resolve: () => undefined });
		instantiationService.stub(IAgentHostNewSessionFolderService, { getFolder: () => undefined, getDefaultFolder: () => undefined });
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, { onDidChange: Event.None, get: () => undefined, getResolvedConfig: () => config, refreshResolvedConfig: async () => { } });
		const widget = new class extends mock<IChatWidget>() {
			override readonly onDidChangeViewModel = Event.None;
			override readonly viewModel = new class extends mock<IChatViewModel>() {
				override readonly sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/fixture' });
			}();
		}();
		const picker = disposableStore.add(instantiationService.createInstance(AgentHostChatInputPicker, widget, 'mode'));
		picker.render(actionItem);
	} else {
		const picker = disposableStore.add(instantiationService.createInstance(AgentHostModePicker, session));
		picker.render(actionItem);
	}
	if (flyout || editor) {
		await new Promise<void>(resolve => dom.getWindow(toolbar).requestAnimationFrame(() => resolve()));
		await dom.getWindow(toolbar).document.fonts.ready;
		toolbar.querySelector<HTMLElement>(flyout ? '.agent-host-permissions-button' : '.agent-host-mode-button')?.click();
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/agentHostModePicker' }, {
	Manual: defineComponentFixture({ render: context => render(context, 'interactive', ChatPermissionLevel.Default) }),
	Assisted: defineComponentFixture({ render: context => render(context, 'plan', ChatPermissionLevel.Assisted) }),
	AllowAll: defineComponentFixture({ render: context => render(context, 'autopilot', ChatPermissionLevel.AutoApprove) }),
	Sandboxed: defineComponentFixture({ render: context => render(context, 'interactive', ChatPermissionLevel.Default, true) }),
	PermissionsFlyout: defineComponentFixture({ render: context => render(context, 'interactive', ChatPermissionLevel.Default, true, true) }),
	AssistedPermissionsFlyout: defineComponentFixture({ render: context => render(context, 'autopilot', ChatPermissionLevel.Assisted, false, true) }),
	EditorMode: defineComponentFixture({ render: context => render(context, 'interactive', ChatPermissionLevel.Default, false, false, true) }),
	EditorPermissions: defineComponentFixture({ render: context => render(context, 'interactive', ChatPermissionLevel.Assisted, false, true, true) }),
});
