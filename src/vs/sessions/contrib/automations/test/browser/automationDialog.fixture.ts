/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ButtonBar, IButton } from '../../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { assert } from '../../../../../base/common/assert.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier, IModelConfigurationAccess } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { TABBED_MODEL_PICKER_SETTING_ID } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerWidget.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { FixtureMenuService, registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, ChatModelSource, IChat, ISession, ISessionWorkspace, ISessionType, SESSION_WORKSPACE_GROUP_LOCAL, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AutomationModelPickerContribution } from '../../../chat/browser/modelPicker.js';
import { IFormState, IValidationState, renderForm, updateSaveButtonState } from '../../browser/automationDialog.js';

import '../../../../../workbench/contrib/chat/browser/widget/media/chat.css';
import '../../../../browser/media/style.css';
import '../../../chat/browser/media/chatWidget.css';
import '../../../chat/browser/media/chatInput.css';
import '../../browser/media/automationDialog.css';

const folderUri = URI.file('C:\\Code\\vscode');
const sessionType: ISessionType = {
	id: 'copilotcli',
	label: 'Copilot',
	icon: Codicon.copilot,
	authRequirement: SessionTypeAuthRequirement.None,
};
const workspace: ISessionWorkspace = {
	uri: folderUri,
	label: 'vscode',
	icon: Codicon.folder,
	group: SESSION_WORKSPACE_GROUP_LOCAL,
	folders: [{ root: folderUri, workingDirectory: folderUri, name: 'vscode', description: undefined, gitRepository: undefined }],
	requiresWorkspaceTrust: true,
	isVirtualWorkspace: false,
};
const model: ILanguageModelChatMetadataAndIdentifier = {
	identifier: 'copilot/gpt-5.4',
	metadata: {
		extension: new ExtensionIdentifier('github.copilot-chat'),
		id: 'gpt-5.4',
		name: 'GPT-5.4',
		vendor: 'copilot',
		version: '1',
		family: 'gpt',
		maxInputTokens: 128000,
		maxOutputTokens: 16384,
		isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
		// Lets the Populated variant show the tabbed model picker's thinking-effort
		// and context-size summary chip, matching the real dev build.
		configurationSchema: {
			properties: {
				effort: {
					type: 'string',
					group: MODEL_CONFIG_GROUP_EFFORT,
					enum: ['low', 'medium', 'high'],
					enumItemLabels: ['Low', 'Medium', 'High'],
					default: 'medium',
				},
				context: {
					type: 'number',
					group: MODEL_CONFIG_GROUP_CONTEXT,
					enum: [128000, 872000],
					default: 128000,
				},
			},
		},
	},
};
/** Non-default effort/context values so the config summary chip has something to report. */
const modelConfigurationValues = { effort: 'high', context: 872000 };

async function renderAutomationDialog(context: ComponentFixtureContext, populated: boolean): Promise<void> {
	const { container, disposableStore, theme, fileIconTheme } = context;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.style.width = '680px';
	container.style.height = '600px';
	container.style.position = 'relative';
	container.style.overflow = 'hidden';
	container.style.transform = 'translate3d(0, 0, 0)';
	container.style.boxSizing = 'border-box';
	container.style.backgroundColor = 'var(--vscode-editor-background)';

	const config: ResolveSessionConfigResult = {
		schema: {
			type: 'object',
			properties: {
				mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], enumLabels: ['Interactive', 'Plan', 'Autopilot'] },
				autoApprove: { type: 'string', title: 'Permissions', enum: ['default', 'assisted', 'autoApprove'], enumLabels: ['Manual permissions', 'Assisted permissions', 'Allow all'] },
			},
		},
		values: { mode: 'interactive', autoApprove: 'default' },
	};
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('agent-host-copilotcli:/automation-fixture');
		override readonly status = constObservable(SessionStatus.Untitled);
		override readonly modelId = constObservable(model.identifier);
		override readonly modelSource = constObservable(ChatModelSource.Chosen);
		override readonly mode = constObservable({ id: 'agent', kind: ChatModeKind.Agent });
		override readonly interactivity = constObservable(ChatInteractivity.Full);
		override readonly workspace = constObservable(workspace);
		override readonly changes = constObservable([]);
		override readonly changesets = constObservable(undefined);
	}();
	const session = new class extends mock<ISession>() {
		override readonly sessionId = 'automation-fixture';
		override readonly providerId = LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly sessionType = sessionType.id;
		override readonly resource = chat.resource;
		override readonly status = constObservable(SessionStatus.Untitled);
		override readonly loading = constObservable(false);
		override readonly workspace = constObservable(workspace);
		override readonly mainChat = constObservable(chat);
		override readonly chats = constObservable([chat]);
		override readonly modelId = constObservable(model.identifier);
		override readonly mode = constObservable({ id: 'agent', kind: ChatModeKind.Agent });
		override readonly isArchived = constObservable(false);
		override readonly isRead = constObservable(true);
		override readonly capabilities = constObservable({ supportsMultipleChats: false });
	}();
	const automationSession = observableValue<ISession | undefined>('automationSession', undefined);
	const provider = new class extends mock<IAgentHostSessionsProvider>() {
		override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly label = 'Local';
		override readonly icon = Codicon.vm;
		override readonly order = 0;
		override readonly sessionTypes = [sessionType];
		override readonly supportsLocalWorkspaces = true;
		override readonly browseActions = [];
		override readonly onDidChangeSessionTypes = Event.None;
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidChangeModels = Event.None;
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSessionConfig = Event.None;
		override getSessions() { return []; }
		override resolveWorkspace(uri: URI) { return extUri.isEqual(uri, folderUri) ? workspace : undefined; }
		override getModelsSnapshot() {
			return { models: [model], desiredModelResolution: { kind: 'notRequested' as const }, modelTarget: 'agent-host-copilotcli' };
		}
		override getModelPickerOptions() {
			return { useGroupedModelPicker: true, showFeatured: false, showUnavailableFeatured: false, showManageModelsAction: false, showAutoModel: false };
		}
		override setModel(): void { }
		override getCustomAgents() { return []; }
		override getSessionConfig() { return config; }
		override isSessionConfigResolving() { return constObservable(false); }
		override getAutomationModelConfiguration(): IModelConfigurationAccess {
			return {
				getModelConfiguration: () => modelConfigurationValues,
				setModelConfiguration: async () => { },
				getModelConfigurationActions: () => [],
			};
		}
	}();
	const managementService = new class extends mock<ISessionsManagementService>() {
		override readonly automationSession = automationSession;
		override readonly onDidChangeSessionTypes = Event.None;
		override getSessionTypesForFolder() { return [{ providerId: provider.id, sessionType }]; }
		override getQuickChatSessionTypes() { return []; }
		override isNewSessionTargetAvailable() { return true; }
		override isQuickChatTargetAvailable() { return false; }
		override resolveWorkspace() { return { providerId: provider.id, workspace }; }
		override createAutomationSession() {
			automationSession.set(session, undefined);
			return session;
		}
		override discardAutomationSession() { automationSession.set(undefined, undefined); }
		override supportsAutomationSessionConfiguration() { return true; }
		override usesCombinedNewSessionConfigPicker() { return false; }
		override async getAutomationSessionConfiguration() { return { sessionTemplate: { model: model.identifier, config: config.values } }; }
	}();
	const factories = new Map<string, IActionViewItemFactory>();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		fileIconTheme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(ISessionsManagementService, managementService);
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return [provider]; }
				override getProvider<T extends ISessionsProvider>(id: string): T | undefined { return (id === provider.id ? provider : undefined) as T | undefined; }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable(undefined);
				override readonly visibleSessions = constObservable([]);
			}());
			reg.defineInstance(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
				override readonly onDidChangeRecentWorkspaces = Event.None;
				override readonly historyLoadState = constObservable('loaded' as const);
				override getRecentWorkspaces() { return []; }
				override isNoWorkspaceChecked() { return false; }
			}());
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = extUri;
			}());
			reg.defineInstance(IGitService, new class extends mock<IGitService>() {
				override async openRepository() { return undefined; }
			}());
			reg.defineInstance(IWorkspaceTrustRequestService, new class extends mock<IWorkspaceTrustRequestService>() {
				override async requestResourcesTrust() { return true; }
			}());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly mainContainer = container;
				override readonly mainContainerDimension = { width: 680, height: 600 };
				override getContainer() { return container; }
			}());
			reg.defineInstance(IActionViewItemService, new class extends mock<IActionViewItemService>() {
				override readonly onDidChange = Event.None;
				override register(menu: MenuId, command: string | MenuId, factory: IActionViewItemFactory) {
					const key = `${menu.id}/${typeof command === 'string' ? command : command.id}`;
					factories.set(key, factory);
					return toDisposable(() => factories.delete(key));
				}
				override lookUp(menu: MenuId, command: string | MenuId) {
					return factories.get(`${menu.id}/${typeof command === 'string' ? command : command.id}`);
				}
			}());
		},
	});
	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	await configurationService.setUserConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker, true);
	// Matches the dev build's default experiment: the tabbed model picker folds
	// thinking-effort/context configuration into a summary chip next to the model name.
	await configurationService.setUserConfiguration(TABBED_MODEL_PICKER_SETTING_ID, true);
	const contextKeyService = instantiationService.get(IContextKeyService);
	ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
	disposableStore.add(instantiationService.createInstance(AutomationModelPickerContribution));

	const menuService = instantiationService.get(IMenuService) as FixtureMenuService;
	menuService.addItem(Menus.AutomationsDialogTargetToolbar, { command: { id: 'workbench.action.chat.renderAutomationsWorkspacePicker', title: 'Workspace' }, group: 'navigation', order: -2 });
	menuService.addItem(Menus.AutomationsDialogTargetToolbar, { command: { id: 'workbench.action.chat.renderAutomationsHarnessChip', title: 'Copilot' }, group: 'navigation', order: -1 });
	menuService.addItem(Menus.AutomationsDialogTargetToolbar, { command: { id: 'workbench.action.chat.renderAutomationsIsolationGroup', title: 'Isolation' }, group: 'navigation', order: 2 });
	menuService.addItem(Menus.AutomationsDialogInputToolbar, { command: { id: 'fixture.agentMode', title: 'Agent' }, group: 'navigation', order: 0 });
	const modelPickerItem = MenuRegistry.getMenuItems(Menus.AutomationsDialogInputToolbar).filter(isIMenuItem).find(item => item.command.id === 'sessions.modelPicker');
	assert(!!modelPickerItem);
	menuService.addItem(Menus.AutomationsDialogInputToolbar, modelPickerItem);
	menuService.addItem(Menus.NewSessionControl, { command: { id: 'fixture.interactive', title: 'Interactive' }, group: 'navigation', order: 0 });
	menuService.addItem(Menus.NewSessionControl, { command: { id: 'fixture.manualPermissions', title: 'Manual permissions' }, group: 'navigation', order: 10 });

	const state: IFormState = {
		name: populated ? 'Morning workspace review' : '',
		interval: 'daily',
		hour: 9,
		minute: 0,
		day: 1,
		isQuickChat: false,
		folderUri: populated ? folderUri : undefined,
		providerId: populated ? provider.id : undefined,
		sessionTypeId: populated ? sessionType.id : undefined,
		isolationMode: 'workspace',
		branch: undefined,
		enabled: true,
	};
	const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
	let createButton: IButton | undefined;
	let form!: HTMLElement;
	let handle!: ReturnType<typeof renderForm>;
	let revalidate = () => { };
	const dialog = disposableStore.add(new Dialog(container, 'New automation', [], {
		type: 'none',
		extraClasses: ['automation-dialog'],
		disableDefaultAction: true,
		buttonStyles: defaultButtonStyles,
		checkboxStyles: defaultCheckboxStyles,
		inputBoxStyles: defaultInputBoxStyles,
		dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
		renderFooter: container => {
			container.classList.add('dialog-buttons', 'automation-dialog-footer-actions');
			container.parentElement?.classList.add('dialog-buttons-row', 'automation-dialog-footer-row');
			const buttonBar = disposableStore.add(new ButtonBar(container));
			createButton = buttonBar.addButton(defaultButtonStyles);
			createButton.label = 'Create';
			buttonBar.addButton({ ...defaultButtonStyles, secondary: true }).label = 'Cancel';
		},
		renderBody: container => {
			container.classList.add('automation-dialog-body');
			dom.append(container, dom.$('.automation-titlebar', { 'aria-hidden': 'true' }, 'New automation'));
			dom.append(container, dom.$('.automation-description', undefined, 'Define a prompt that will run on a schedule against the selected target.'));
			form = dom.append(dom.append(container, dom.$('.automation-form-pane')), dom.$('.automation-form'));
			handle = renderForm(
				form, state, disposableStore, validation, () => revalidate(), instantiationService, contextKeyService,
				instantiationService.get(IContextViewService), configurationService, instantiationService.get(IWorkbenchLayoutService),
				instantiationService.get(ILogService), managementService, instantiationService.get(IWorkspaceTrustRequestService),
				populated ? 'Review recent changes in vscode and summarize the most important follow-up tasks.' : '',
				undefined, undefined, constObservable([provider.id]),
			);
			revalidate = () => updateSaveButtonState(createButton, state, validation, form, handle.getPrompt, handle.getBranch, managementService, true);
		},
	}));
	void dialog.show();
	await handle.waitForAutomationSessionSync(CancellationToken.None);
	revalidate();

	const nextFrame = () => new Promise<void>(resolve => dom.getWindow(container).requestAnimationFrame(() => resolve()));
	await nextFrame();
	await nextFrame();
	assert(!form.querySelector('#automation-session-configuration-label'));
	if (populated) {
		const input = form.querySelector('.chat-input-container');
		const toolbar = form.querySelector('.automation-session-config');
		const controls = form.querySelector('.automation-session-controls');
		assert(!!input && !!toolbar && !!controls && input.contains(toolbar) && !input.contains(controls));
		assert(toolbar.textContent?.includes('Agent') && toolbar.textContent.includes(model.metadata.name));
		assert(controls.textContent?.includes('Interactive') && controls.textContent.includes('Manual'));
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/automations/', labels: { kind: 'screenshot' } }, {
	Default: defineComponentFixture({ render: context => renderAutomationDialog(context, false) }),
	Populated: defineComponentFixture({ render: context => renderAutomationDialog(context, true) }),
});
