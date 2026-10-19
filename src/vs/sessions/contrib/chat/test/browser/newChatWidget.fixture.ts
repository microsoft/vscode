/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { toAction } from '../../../../../base/common/actions.js';
import { assert } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { type IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IChatTipService } from '../../../../../workbench/contrib/chat/browser/chatTipService.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js';
import { IMicCaptureService } from '../../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IVoiceInputModeService, VoiceInputMode } from '../../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js';
import { IAICustomizationWorkspaceService } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IChatRequestVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IPromptsService, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, ICustomizationMigrationHint, ICustomizationMigrationService, McpServerCustomizationMigration, PluginMarketplaceCustomizationMigration } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { ICustomizationMigrationTelemetryService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationTelemetryService.js';
import { IMcpWorkbenchService } from '../../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { CHAT_ATTACH_CONTEXT_ACTION_ID, ChatAgentLocation, ChatConfiguration, ChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { renderModePickerTrigger } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
import { IChatPhoneInputPresenter } from '../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IChatInputPickerResponsiveState } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerResponsiveLayout.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { NullLanguageModelsService } from '../../../../../workbench/contrib/chat/test/common/languageModels.js';
import { IHistoryService } from '../../../../../workbench/services/history/common/history.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { FixtureMenuService, registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { activeSessionViewBackground } from '../../../../common/theme.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { getNewSessionRepositoryConfigGroup, Menus } from '../../../../browser/menus.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, ISessionsChatBackground, ISessionsChatBackgroundService, SessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { SessionsChatBackgroundRenderer } from '../../../../services/chatBackground/browser/chatBackgroundRenderer.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatModelSource, IChat, ISession, ISessionWorkspace, ISessionType, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionComparisonService } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { IAquariumService } from '../../../aquarium/browser/aquariumOverlay.js';
import { computeIssueIcon, computePullRequestIcon, GitHubIssueState, GitHubPullRequestState } from '../../../github/common/types.js';
import { NewChatView } from '../../browser/chatView.js';
import { COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, COMPARE_AGENTS_ENABLED_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING, NEW_SESSION_WELCOME_MESSAGES_SETTING, NEW_SESSION_WELCOME_NAME_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';
import { getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../../common/newChatContextIds.js';
import { INewSessionComposerService, INewSessionPromptOption, NewSessionComposerService, NewSessionPromptOptionsState } from '../../browser/newSessionComposerService.js';
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from '../../browser/newChatVoice.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../../../../platform/chat/common/agentsWindowInvitation.js';

import '../../../../browser/media/style.css';
import '../../../../browser/parts/media/sessionView.css';
import '../../../../browser/parts/mobile/mobileChatShell.css';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatModelReference, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ILanguageModelToolsService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { MockChatService } from '../../../../../workbench/contrib/chat/test/common/chatService/mockChatService.js';
import { MockLanguageModelToolsService } from '../../../../../workbench/contrib/chat/test/common/tools/mockLanguageModelToolsService.js';
import { ChatSubmitAction } from '../../../../../workbench/contrib/chat/browser/actions/chatExecuteActions.js';
import { ChatVoiceInputModeAction } from '../../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputModeActionViewItem.js';
import { ModelPickerToolbarsContribution } from '../../browser/modelPicker.js';
import { COMPOSER_SESSION_CONTROLS_ACTION_ID, SharedChatInputComposerContribution } from '../../browser/sharedChatInputComposer.contribution.js';

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 560;
const ATTACHED_FOLDER_URI = URI.file('/Code/docs');
const ATTACHED_REPOSITORY_URI = URI.parse('https://github.com/microsoft/typescript');
const ATTACHED_REPOSITORY_ROOT = URI.parse('vscode-vfs://github/microsoft/typescript/HEAD');

function connectorIcon(base64: string): URI {
	return URI.parse(`data:image/png;base64,${base64}`);
}

const linearConnectorIcon = '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';
const notionConnectorIcon = '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';
const workIqConnectorIcon = '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';

const fixtureConnectors: readonly ICustomizationMarketplaceResource[] = [
	{
		sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
		identifier: 'linear',
		displayName: 'Linear',
		description: 'Plan and track product work.',
		mediaType: 'application/mcp-server+json',
		tags: [],
		capabilities: [],
		representativeQueries: [],
		icon: connectorIcon(linearConnectorIcon),
	},
	{
		sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
		identifier: 'notion',
		displayName: 'Notion',
		description: 'Search team knowledge and documentation.',
		mediaType: 'application/mcp-server+json',
		tags: [],
		capabilities: [],
		representativeQueries: [],
		icon: connectorIcon(notionConnectorIcon),
	},
	{
		sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
		identifier: 'workiq-mail',
		displayName: 'Work IQ',
		description: 'Bring Microsoft 365 work context into chats.',
		mediaType: 'application/mcp-server+json',
		tags: [],
		capabilities: [],
		representativeQueries: [],
		icon: connectorIcon(workIqConnectorIcon),
	},
];

const fixtureConnectorRecommendations: NonNullable<IProductService['connectorRecommendations']> = Object.fromEntries(
	fixtureConnectors.map(connector => [connector.identifier, {
		name: connector.identifier === 'workiq-mail' ? 'WorkIQ' : connector.displayName,
		description: connector.description,
		iconUrl: URI.isUri(connector.icon) ? connector.icon.toString(true) : '',
	}]),
);

interface INewChatWidgetFixtureOptions {
	readonly width?: number;
	readonly height?: number;
	readonly commentCount?: number;
	readonly showTip?: boolean;
	readonly promptOptions?: NewSessionPromptOptionsState;
	readonly selectedOptionIndex?: number;
	readonly editedInput?: string;
	readonly withWorkspace?: boolean;
	readonly withRemoteWorkspace?: boolean;
	readonly openWorkspacePicker?: boolean;
	readonly closeWorkspacePickerAfterOpen?: boolean;
	readonly openGitHubContextPicker?: boolean;
	readonly openComparisonSetup?: boolean;
	readonly comparisonPrompt?: string;
	readonly withAttachedContext?: boolean;
	readonly withControlPickers?: boolean;
	readonly expandSessionOptions?: boolean;
	readonly withAutoModel?: boolean;
	readonly withConfiguredModel?: boolean;
	readonly withVoiceInputMode?: boolean;
	readonly primaryToolbarWidth?: number;
	readonly phoneLayout?: boolean;
	readonly chatBackground?: 'codicons' | 'loud';
	readonly migrationCount?: number;
	readonly experimentalComposerLayout?: boolean;
	readonly toggleExperimentalComposerLayout?: boolean;
	readonly unifiedWorkspacePicker?: boolean;
	readonly collapsedSessionOptionsShowIcons?: boolean;
	readonly welcomePhrases?: boolean;
	readonly connectorRecommendations?: boolean;
	readonly connectorProductIcons?: boolean;
	readonly dismissedConnectorCount?: number;
	readonly focusConnectorRecommendations?: boolean;
	readonly expectBelowInputSurfacesScrollable?: boolean;
}

class FixturePickerActionViewItem extends BaseActionViewItem implements IChatInputPickerResponsiveState {
	private _compact = false;

	constructor(private readonly _kind: 'agent' | 'model' | 'mode' | 'permissions' | 'isolation' | 'branch') {
		super(undefined, toAction({ id: `fixture.${_kind}`, label: _kind, run: () => { } }));
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.toggle('compact-picker', this._compact);
		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		const trigger = dom.append(slot, dom.$(this._kind === 'mode' ? 'div.action-label' : 'a.action-label'));
		trigger.role = 'button';
		trigger.tabIndex = 0;
		if (this._kind === 'mode') {
			this._register(renderModePickerTrigger(trigger, {
				label: 'Interactive', icon: Codicon.comment, labelClassName: 'sessions-chat-dropdown-label',
			}, {
				label: 'Allow all', level: ChatPermissionLevel.AutoApprove, sandboxed: false,
			}, () => { }));
			return;
		}
		if (this._kind === 'permissions') {
			dom.append(trigger, renderIcon(Codicon.key));
			dom.append(trigger, dom.$('span.sessions-chat-dropdown-label', undefined, 'Manual permissions'));
			return;
		}
		if (this._kind === 'agent') {
			container.classList.add('chat-agent-picker-item');
			dom.append(trigger, renderIcon(Codicon.agent));
			dom.append(trigger, dom.$('span.sessions-chat-dropdown-label', undefined, 'Agent'));
			return;
		}
		if (this._kind === 'model') {
			// The classes of the production model picker item, which the composer's layout targets.
			container.classList.add('chat-input-picker-item', 'model-picker-item');
			dom.append(trigger, dom.$('span.sessions-chat-dropdown-label', undefined, 'Model'));
			return;
		}
		dom.append(trigger, renderIcon(this._kind === 'isolation' ? Codicon.worktree : Codicon.gitBranch));
		dom.append(trigger, dom.$('span.sessions-chat-dropdown-label', undefined, this._kind === 'isolation' ? 'New Worktree' : 'Branch'));
	}

	setCompact(compact: boolean): void {
		this._compact = compact;
		this.element?.classList.toggle('compact-picker', compact);
	}

	isCompact(): boolean {
		return this._compact;
	}
}

/** Action view items registered by the production contributions and by the fixture itself. */
class FixtureActionViewItemService implements IActionViewItemService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	private readonly _factories = new Map<string, IActionViewItemFactory>();

	register(menu: MenuId, commandId: string | MenuId, factory: IActionViewItemFactory): IDisposable {
		const key = `${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`;
		this._factories.set(key, factory);
		return toDisposable(() => this._factories.delete(key));
	}

	lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
		return this._factories.get(`${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`);
	}
}

class AutoModelFixtureMenuService extends FixtureMenuService {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
	) {
		super(contextKeyService, commandService);
		this.addItem(MenuId.ChatInputStatus, {
			command: { id: 'fixture.autopilotStatus', title: 'Autopilot', icon: Codicon.rocket },
			group: 'navigation',
			order: 1,
		});
		this.addItem(MenuId.ChatInputStatus, {
			command: { id: 'fixture.warningStatus', title: 'Warning', icon: Codicon.warning },
			group: 'navigation',
			order: 2,
		});
		this.addItem(MenuId.ChatInputStatus, {
			command: { id: 'fixture.connectionStatus', title: 'Connection', icon: Codicon.radioTower },
			group: 'navigation',
			order: 3,
		});
		this.addItem(MenuId.ChatInputStatus, {
			command: { id: 'fixture.textStatus', title: 'Status' },
			group: 'navigation',
			order: 4,
		});
	}

	addModelItem(): void {
		this.addItem(Menus.NewSessionChatInputToolbar, {
			command: { id: 'sessions.modelPicker', title: 'Model' },
			group: 'navigation',
			order: 1,
		});
	}
}

const loudChatBackground: ISessionsChatBackground = {
	kind: 'image',
	backgroundImage: 'repeating-linear-gradient(135deg, #ff00a8 0 16px, #00e5ff 16px 32px, #ffe600 32px 48px, #4b00ff 48px 64px)',
	backgroundRepeat: 'repeat',
	backgroundSize: 'auto',
	backgroundPosition: 'left top',
};

/** Wraps the composer in the Agents Window host and paints its resolved background. */
function createChatBackgroundPart(container: HTMLElement, disposableStore: DisposableStore, background: ISessionsChatBackground | undefined): HTMLElement {
	const part = dom.append(container, dom.$('.part.sessionspart'));
	part.style.position = 'relative';
	part.style.width = '100%';
	part.style.height = '100%';
	// The part carries the opaque base, as it does in the Agents window, so the
	// session view above it can stay transparent and let the wallpaper through.
	part.style.backgroundColor = asCssVariable(activeSessionViewBackground);
	const renderer = disposableStore.add(new SessionsChatBackgroundRenderer(part, true));
	renderer.setBackground(background);
	return part;
}

/** Creates real chat models, which the composer's chat widget needs to accept input. */
class FixtureComposerChatService extends MockChatService {
	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}

	private _createModel(): IChatModelReference {
		const model = this.instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: false });
		this.addSession(model);
		return {
			object: model,
			dispose: () => {
				this.removeSession(model.sessionResource);
				model.dispose();
			},
		};
	}

	override startNewLocalSession(): IChatModelReference {
		return this._createModel();
	}

	override async acquireOrLoadSession(): Promise<IChatModelReference | undefined> {
		return this._createModel();
	}
}

/**
 * Renders the whole new-session composer (`NewChatView` → `NewChatWidget`) inside
 * a `.session-view` so the draft-comments banner sits above the input the way it
 * does in the Agents window.
 *
 * Deliberately a separate file from `newChatInput.fixture.ts`: pulling
 * `NewChatView` into that module would change the order its stylesheets are
 * injected in, and `.new-chat-bottom-container` is styled by two equally
 * specific rules (`chatWidget.css` vs `newChatInSession.css`) that source order
 * decides between.
 */
async function renderNewChatWidget(context: ComponentFixtureContext, options: INewChatWidgetFixtureOptions = {}): Promise<void> {
	const { container, disposableStore } = context;
	const {
		width = DEFAULT_WIDTH,
		height = DEFAULT_HEIGHT,
		commentCount = 0,
		showTip = false,
		promptOptions,
		selectedOptionIndex,
		editedInput,
		withWorkspace = false,
		withRemoteWorkspace = false,
		openWorkspacePicker = false,
		closeWorkspacePickerAfterOpen = false,
		openGitHubContextPicker = false,
		openComparisonSetup = false,
		comparisonPrompt,
		withAttachedContext = false,
		withControlPickers = false,
		expandSessionOptions = true,
		withAutoModel = false,
		withConfiguredModel = false,
		withVoiceInputMode = false,
		primaryToolbarWidth,
		phoneLayout = false,
		chatBackground,
		migrationCount = 0,
		experimentalComposerLayout = false,
		toggleExperimentalComposerLayout = false,
		unifiedWorkspacePicker = experimentalComposerLayout,
		collapsedSessionOptionsShowIcons = false,
		welcomePhrases = false,
		connectorRecommendations = false,
		connectorProductIcons = true,
		dismissedConnectorCount = 0,
		focusConnectorRecommendations = false,
		expectBelowInputSurfacesScrollable = false,
	} = options;
	const hasChatBackground = chatBackground !== undefined;
	const feedbackItems: readonly IAgentFeedback[] = Array.from({ length: commentCount }, (_, index) => ({
		id: `feedback-${index}`,
		text: `Comment ${index + 1}`,
		resourceUri: URI.file(`/workspace/src/file-${index + 1}.ts`),
		range: new Range(index + 1, 1, index + 1, 8),
		sessionResource: AGENT_FEEDBACK_NEW_SESSION_RESOURCE,
		kind: AgentFeedbackKind.UserReview,
		state: AgentFeedbackState.Accepted,
	}));
	const workspace = createFixtureWorkspace(withRemoteWorkspace);
	const sessionTypes = createFixtureSessionTypes();
	const models = withConfiguredModel ? [createFixtureConfiguredModel()] : withAutoModel ? [createFixtureAutoModel()] : [];
	const provider = createFixtureProvider(workspace, sessionTypes, models, disposableStore, withControlPickers);
	const activeSession = promptOptions || withWorkspace || withRemoteWorkspace || withAttachedContext ? createFixtureActiveSession(workspace, sessionTypes[0], migrationCount > 0, provider.id) : undefined;
	const activeSessionObservable = observableValue<IActiveSession | undefined>('activeSession', activeSession);
	const composerService = disposableStore.add(new NewSessionComposerService());
	const sessionsService = new class extends mock<ISessionsService>() {
		override readonly initialRestoreComplete = constObservable(true);
		override readonly activeSession = activeSessionObservable;
	}();
	const configurationService = new TestConfigurationService({
		// Editor settings the composer's chat widget reads.
		chat: { editor: { fontSize: 14, fontFamily: 'default', fontWeight: 'normal', lineHeight: 0, wordWrap: 'on' } },
		editor: { fontFamily: 'monospace', fontLigatures: false, accessibilitySupport: 'off' },
		[NEW_SESSION_WELCOME_NAME_SETTING]: '',
		[NEW_SESSION_WELCOME_PHRASES_SETTING]: welcomePhrases,
		[NEW_SESSION_WELCOME_MESSAGES_SETTING]: welcomePhrases ? { mode: 'replace', phrases: ['Let\'s ship something'] } : undefined,
		[ChatConfiguration.ExperimentalModePermissionsPicker]: withControlPickers,
		[UNIFIED_WORKSPACE_PICKER_SETTING]: unifiedWorkspacePicker,
		[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: experimentalComposerLayout,
		[COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING]: collapsedSessionOptionsShowIcons,
		[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: connectorRecommendations,
		[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: connectorRecommendations,
		[NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING]: connectorRecommendations,
		...(chatBackground === 'codicons' ? {
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET,
			[AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING]: AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET,
		} : {}),
	});
	disposableStore.add(configurationService.onDidChangeConfigurationEmitter);
	const storageService = disposableStore.add(new InMemoryStorageService());
	if (showTip) {
		storageService.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 2, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	const actionViewItems = new FixtureActionViewItemService();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IActionViewItemService, actionViewItems);
			reg.define(IChatService, FixtureComposerChatService);
			reg.defineInstance(ILanguageModelToolsService, disposableStore.add(new MockLanguageModelToolsService()));
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly connectorRecommendations = connectorRecommendations
					? connectorProductIcons
						? fixtureConnectorRecommendations
						: Object.fromEntries(Object.entries(fixtureConnectorRecommendations).map(([id, recommendation]) => [id, { ...recommendation, iconUrl: '' }]))
					: undefined;
			}());
			reg.defineInstance(IStorageService, storageService);
			reg.defineInstance(IAuthenticationService, new class extends mock<IAuthenticationService>() { }());
			reg.defineInstance(IRequestService, new class extends mock<IRequestService>() { }());
			if (withAutoModel || withConfiguredModel) {
				reg.define(IMenuService, AutoModelFixtureMenuService);
				reg.defineInstance(ILanguageModelsService, new class extends NullLanguageModelsService {
					override getLanguageModelIds() { return models.map(model => model.identifier); }
					override getLanguageModels() { return models; }
					override lookupLanguageModel(identifier: string) { return models.find(model => model.identifier === identifier)?.metadata; }
				}());
			}
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = extUri;
			}());
			reg.defineInstance(INewSessionComposerService, composerService);
			reg.defineInstance(IChatTipService, new class extends mock<IChatTipService>() {
				override readonly onDidDismissTip = Event.None;
				override readonly onDidNavigateTip = Event.None;
				override readonly onDidHideTip = Event.None;
				override readonly onDidDisableTips = Event.None;
				override getWelcomeTip() {
					return showTip ? { id: 'fixture-tip', content: new MarkdownString('**Tip:** Reference files or folders with # to give the agent more context.') } : undefined;
				}
				override resetSession(): void { }
				override hasMultipleTips(): boolean { return false; }
			}());
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() {
				override readonly onShow = Event.None;
				override readonly onHide = Event.None;
			}());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly activeContainer = container;
				override readonly mainContainer = container;
				override readonly mainContainerDimension = { width, height };
				override getContainer() { return container; }
			}());
			reg.defineInstance(ISearchService, new class extends mock<ISearchService>() { }());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessionTypes = Event.None;
				override isQuickChatTargetAvailable(): boolean { return false; }
				override getSessionTypesForFolder() {
					return activeSession ? sessionTypes.map(sessionType => ({ providerId: provider.id, sessionType })) : [];
				}
			}());
			reg.defineInstance(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
				override readonly comparisons = constObservable([]);
			}());
			reg.defineInstance(ISessionsService, sessionsService);
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return activeSession ? [provider] : []; }
				override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
					return (providerId === provider.id ? provider : undefined) as T | undefined;
				}
			}());
			reg.defineInstance(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
				override readonly onDidChangeRecentWorkspaces = Event.None;
				override readonly historyLoadState = constObservable('loaded' as const);
				override getRecentWorkspaces(): IRecentWorkspace[] { return activeSession ? [{ workspace, providerId: provider.id, checked: true, source: 'agents' }] : []; }
				override addRecentWorkspace(): void { }
				override removeRecentWorkspace(): void { }
				override clearCheckedWorkspace(): void { }
				override isNoWorkspaceChecked(): boolean { return false; }
				override checkNoWorkspace(): void { }
			}());
			reg.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly onDidChangeDiscovering = Event.None;
				override readonly selectedHostId = provider.id;
				override readonly selectedHost = {
					id: provider.id,
					providerIds: [provider.id],
					label: provider.label,
					grouped: false,
					address: undefined,
					icon: provider.icon,
					status: AgentHostFilterConnectionStatus.Connected,
					connectable: true,
				};
				override readonly hosts = [];
				override readonly isDiscovering = false;
				override async rediscover(): Promise<boolean> { return true; }
			}());
			reg.defineInstance(IAquariumService, new class extends mock<IAquariumService>() {
				override mountToggle() {
					return { dispose() { }, setHostVisible() { } };
				}
			}());
			reg.defineInstance(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
				override readonly onDidChangeFeedback = Event.None;
				override readonly onDidChangeFeedbackVisibility = Event.None;
				override readonly onDidChangeFeedbackScope = Event.None;
				override readonly onDidRevealSessionComment = Event.None;
				override getVisibleResolvedFeedbackIds(): ReadonlySet<string> { return new Set(); }
				override getFeedback(sessionResource: URI): readonly IAgentFeedback[] {
					return sessionResource.toString() === AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString() ? feedbackItems : [];
				}
				override getFeedbackSessionResource() { return undefined; }
				override async revealFeedback(): Promise<void> { }
			}());
			reg.defineInstance(IHistoryService, new class extends mock<IHistoryService>() { }());
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override async getFilteredPromptSlashCommands() { return []; }
			}());
			reg.defineInstance(IPromptsService, new class extends mock<IPromptsService>() {
				override readonly onDidChangeSlashCommands = Event.None;
				override readonly onDidChangeCustomAgents = Event.None;
				override readonly onDidChangeInstructions = Event.None;
				override readonly onDidChangeAgentInstructions = Event.None;
				override async listAgentInstructions() { return []; }
			}());
			reg.defineInstance(IMcpWorkbenchService, new class extends mock<IMcpWorkbenchService>() {
				override readonly onChange = Event.None;
				override readonly onReset = Event.None;
			}());
			reg.defineInstance(ICustomizationMigrationService, new class extends mock<ICustomizationMigrationService>() {
				override readonly onDidChangeCustomizations = Event.None;

				override computeMigration(resource: URI, type: FileCustomizationMigrationType): Promise<FileCustomizationMigration>;
				override computeMigration(resource: URI, type: CustomizationMigrationType.McpServers): Promise<McpServerCustomizationMigration>;
				override computeMigration(resource: URI, type: CustomizationMigrationType.PluginMarketplaces): Promise<PluginMarketplaceCustomizationMigration>;
				override async computeMigration(_resource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration> {
					if (type === CustomizationMigrationType.McpServers) {
						return { type, candidates: [], servers: [], exclusions: [], discoveryComplete: true, coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false } };
					}
					if (type === CustomizationMigrationType.PluginMarketplaces) {
						return { type, candidates: [] };
					}
					const candidates = Array.from({ length: migrationCount }, (_, index) => ({
						uri: URI.file(`/workspace/.github/prompts/prompt-${index}.prompt.md`),
						type: PromptsType.prompt, storage: PromptsStorage.local,
					}));
					return { type, candidates, files: candidates.map(candidate => candidate.uri) };
				}

				override async computeMigrationHint(): Promise<ICustomizationMigrationHint | undefined> {
					return migrationCount > 0 ? {
						migrationFlowId: 'fixture-migration',
						message: `${migrationCount} agent customizations need an update to keep working.`,
						counts: [{ type: CustomizationMigrationType.PromptFiles, count: migrationCount }],
					} : undefined;
				}
			}());
			reg.defineInstance(ICustomizationMigrationTelemetryService, new class extends mock<ICustomizationMigrationTelemetryService>() {
				override hintComputed() { }
				override hintShown() { }
				override hintClicked() { }
			}());
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly onDidChangeSlashCommands = Event.None;
				override async getSlashCommands() { return []; }
			}());
			reg.defineInstance(INewChatVoiceTargetService, disposableStore.add(new NewChatVoiceTargetService(
				sessionsService,
				new class extends mock<IChatWidgetService>() {
					override readonly onDidChangeFocusedSession = Event.None;
				}(),
			)));
			reg.defineInstance(IVoiceInputModeService, new class extends mock<IVoiceInputModeService>() {
				override readonly selectedMode = observableValue<VoiceInputMode>('selectedMode', 'voice');
				override readonly voiceAvailable = observableValue<boolean>('voiceAvailable', withVoiceInputMode);
				override readonly dictationAvailable = observableValue<boolean>('dictationAvailable', withVoiceInputMode);
				override readonly handsFree = observableValue<boolean>('handsFree', true);
				override readonly simulatedVoiceState = observableValue<undefined>('simulatedVoiceState', undefined);
				override readonly simulatedHandsFree = observableValue<undefined>('simulatedHandsFree', undefined);
				override readonly simulatedVersion = observableValue<undefined>('simulatedVersion', undefined);
				override readonly simulatedHover = observableValue<boolean>('simulatedHover', false);
			}());
			reg.defineInstance(IVoiceSessionController, new class extends mock<IVoiceSessionController>() {
				override readonly isConnected = observableValue<boolean>('isConnected', false);
				override readonly isConnecting = observableValue<boolean>('isConnecting', false);
				override readonly voiceState = observableValue<'idle' | 'listening' | 'processing' | 'speaking' | 'error'>('voiceState', 'idle');
				override readonly targetSession = observableValue<URI | undefined>('targetSession', undefined);
				override readonly hasDraftTarget = observableValue<boolean>('hasDraftTarget', false);
				override readonly transcriptTurns = observableValue<never[]>('transcriptTurns', []);
			}());
			reg.defineInstance(ITtsPlaybackService, new class extends mock<ITtsPlaybackService>() {
				override readonly analyserNode = undefined;
			}());
			reg.defineInstance(IMicCaptureService, new class extends mock<IMicCaptureService>() {
				override readonly analyserNode = undefined;
			}());
			reg.defineInstance(IChatSpeechToTextService, new class extends mock<IChatSpeechToTextService>() {
				override readonly onDidChangeState = Event.None;
				override readonly onDidChangePreparingModel = Event.None;
				override readonly onDidChangeDownloadingModel = Event.None;
				override readonly state = ChatSpeechToTextState.Idle;
				override readonly isConfigured = false;
				override readonly isPreparingModel = false;
				override readonly isDownloadingModel = false;
			}());
			reg.define(ISessionsChatBackgroundService, SessionsChatBackgroundService);
		},
	});
	if (showTip) {
		ChatContextKeys.foregroundSessionCount.bindTo(instantiationService.get(IContextKeyService)).set(0);
	}
	await instantiationService.get(IConfigurationService).updateValue(COMPARE_AGENTS_ENABLED_SETTING, true);

	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	if (openComparisonSetup) {
		container.style.position = 'relative';
		container.style.overflow = 'hidden';
		container.style.transform = 'translate3d(0, 0, 0)';
	}
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.classList.toggle('phone-layout', phoneLayout);
	const phoneLayoutContext = IsPhoneLayoutContext.bindTo(instantiationService.get(IContextKeyService));
	phoneLayoutContext.set(phoneLayout);

	const background = isHighContrast(context.theme.type)
		? undefined
		: chatBackground === 'loud'
			? loudChatBackground
			: instantiationService.get(ISessionsChatBackgroundService).getBackground();
	const sessionView = dom.append(hasChatBackground ? createChatBackgroundPart(container, disposableStore, background) : container, dom.$('.session-view.is-active'));
	if (hasChatBackground && isHighContrast(context.theme.type)) {
		assert(!container.querySelector('.has-chat-background')
			&& container.querySelectorAll('.sessions-chat-codicon-background .codicon').length === 0
			&& container.querySelector<HTMLElement>('.sessions-chat-codicon-hit-target')?.hidden === true,
			'High-contrast themes must hide the Codicon wallpaper and Celebrate button.');
	}
	sessionView.style.width = '100%';
	sessionView.style.height = '100%';
	if (!hasChatBackground) {
		sessionView.style.backgroundColor = asCssVariable(activeSessionViewBackground);
	}
	sessionView.style.setProperty('--session-view-background', asCssVariable(activeSessionViewBackground));
	const sessionViewContent = dom.append(sessionView, dom.$('.session-view-content'));
	sessionViewContent.style.width = '100%';
	sessionViewContent.style.height = '100%';

	const menuService = instantiationService.get(IMenuService) as FixtureMenuService;
	instantiationService.stub(IChatPhoneInputPresenter, { enabled: constObservable(phoneLayout) });
	// The composer's own input toolbar items and view items, as in the product.
	disposableStore.add(instantiationService.createInstance(SharedChatInputComposerContribution));
	disposableStore.add(instantiationService.createInstance(ModelPickerToolbarsContribution));
	menuService.addItem(Menus.NewSessionChatInputToolbar, { command: { id: CHAT_ATTACH_CONTEXT_ACTION_ID, title: 'Add Context...', icon: Codicon.addCompact }, group: 'navigation', order: -2 });
	// The fixture menu service keeps insertion order.
	if (withVoiceInputMode) {
		menuService.addItem(MenuId.ChatExecute, { command: { id: ChatVoiceInputModeAction.ID, title: 'Voice Input Mode', icon: Codicon.micCompact }, group: 'navigation', order: -11 });
	}
	// The input only has sendable content in fixtures that attach context or fill the prompt.
	const sendEnabled = withAttachedContext || !!comparisonPrompt;
	menuService.addItem(MenuId.ChatExecute, { command: { id: ChatSubmitAction.ID, title: 'Send', icon: Codicon.arrowUpCompact, precondition: sendEnabled ? undefined : ContextKeyExpr.false() }, group: 'navigation', order: 4 });
	if (withControlPickers) {
		instantiationService.stub(IAgentHostConnectionsService, {
			onDidChangeSessionResolution: Event.None,
			resolveSessionResource: () => undefined,
		});
		instantiationService.stub(IAgentWorkbenchLayoutService, { mainContainer: container });
		instantiationService.stub(ISessionChangesService, {});
		instantiationService.stub(IViewsService, {});
		instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
			override readonly mainContainer = container;
			override readonly activeContainer = container;
			override readonly onDidLayoutContainer = Event.None;
			override getContainer() { return container; }
		}());
		instantiationService.set(IContextViewService, disposableStore.add(instantiationService.createInstance(ContextViewService)));
		instantiationService.set(IActionWidgetService, disposableStore.add(instantiationService.createInstance(ActionWidgetService)));
		for (const menu of [Menus.NewSessionChatInputToolbar, Menus.NewSessionControl]) {
			disposableStore.add(actionViewItems.register(menu, 'fixture.agent', () => new FixturePickerActionViewItem('agent')));
		}
		disposableStore.add(actionViewItems.register(Menus.NewSessionChatInputToolbar, 'fixture.model', () => new FixturePickerActionViewItem('model')));
		disposableStore.add(actionViewItems.register(Menus.NewSessionControl, 'fixture.mode', () => new FixturePickerActionViewItem(phoneLayout ? 'permissions' : 'mode')));
		disposableStore.add(actionViewItems.register(Menus.NewSessionRepositoryConfig, 'fixture.worktree', () => new FixturePickerActionViewItem('isolation')));
		disposableStore.add(actionViewItems.register(Menus.NewSessionRepositoryConfig, 'fixture.branch', () => new FixturePickerActionViewItem('branch')));
		menuService.addItem(experimentalComposerLayout ? Menus.NewSessionControl : Menus.NewSessionChatInputToolbar, { command: { id: 'fixture.agent', title: 'Agent' }, group: 'navigation', order: experimentalComposerLayout ? -1 : 0 });
		if (experimentalComposerLayout) {
			menuService.addItem(Menus.NewSessionChatInputToolbar, { command: { id: COMPOSER_SESSION_CONTROLS_ACTION_ID, title: 'Session Controls' }, group: 'navigation', order: 0 });
		}
		if (!(menuService instanceof AutoModelFixtureMenuService)) {
			menuService.addItem(Menus.NewSessionChatInputToolbar, { command: { id: 'fixture.model', title: 'Model' }, group: 'navigation', order: 1 });
		}
		menuService.addItem(Menus.NewSessionControl, { command: { id: 'fixture.mode', title: 'Mode' }, group: 'navigation', order: 0 });
		menuService.addItem(Menus.NewSessionRepositoryConfig, {
			command: { id: 'fixture.worktree', title: 'New Worktree' },
			group: getNewSessionRepositoryConfigGroup(1, 'fixture.worktree'),
			order: 1,
		});
		menuService.addItem(Menus.NewSessionRepositoryConfig, {
			command: { id: 'fixture.branch', title: 'Branch' },
			group: getNewSessionRepositoryConfigGroup(2, 'fixture.branch'),
			order: 2,
		});
	}
	if (menuService instanceof AutoModelFixtureMenuService) {
		menuService.addModelItem();
	}

	if (migrationCount > 0) {
		await configurationService.setUserConfiguration(ChatConfiguration.ChatCustomizationsMigrationEnabled, true);
	}
	const view = disposableStore.add(instantiationService.createInstance(NewChatView, false, {
		initialAttachments: withAttachedContext ? createFixtureAttachments() : undefined,
	}));
	sessionViewContent.appendChild(view.element);
	view.layout(width, height, 0, 0);
	const targetWindow = dom.getWindow(container);
	const nextFrame = () => new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	await nextFrame();
	await nextFrame();
	for (let attempt = 0; attempt < 30 && !view.element.querySelector('.sessions-chat-session-type-picker'); attempt++) {
		await nextFrame();
	}
	assert(!!view.element.querySelector('.sessions-chat-session-type-picker'));
	for (const animation of view.element.getAnimations({ subtree: true })) {
		if (animation.effect?.getComputedTiming().endTime !== Infinity) {
			animation.finish();
		}
	}
	await nextFrame();
	if (toggleExperimentalComposerLayout) {
		for (const enabled of [true, false, true]) {
			await configurationService.setUserConfiguration(EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING;
				}
			}());
			await nextFrame();
		}
	}
	const promptBox = view.element.querySelector<HTMLElement>('.new-chat-input-container');
	assert(!!promptBox);
	const widgetContent = view.element.querySelector<HTMLElement>('.new-chat-widget-content');
	assert(!!widgetContent);
	const experimentalComposerLayoutEnabled = widgetContent.classList.contains('experimental-new-session-composer');
	if (phoneLayout && experimentalComposerLayout) {
		const workspacePicker = view.element.querySelector<HTMLElement>('.sessions-workspace-category-picker');
		assert(experimentalComposerLayoutEnabled && !!workspacePicker,
			'Phone must retain the experimental composer when the setting is enabled.');
		const workspacePickerBounds = workspacePicker.getBoundingClientRect();
		const containerBounds = container.getBoundingClientRect();
		assert(workspacePickerBounds.left >= containerBounds.left && workspacePickerBounds.right <= containerBounds.right,
			'The phone workspace picker must stay within the viewport.');
	}
	if (experimentalComposerLayoutEnabled) {
		const optionsToggle = view.element.querySelector<HTMLElement>('.new-chat-session-options-toggle');
		const sessionOptions = view.element.querySelector<HTMLElement>('.new-chat-session-options-details');
		const optionsTray = view.element.querySelector<HTMLElement>('.new-chat-session-options');
		assert(!!optionsToggle && !!sessionOptions && !!optionsTray && !sessionOptions.hidden && !sessionOptions.inert,
			'Session options must be expanded by default.');
		if (withControlPickers && width >= 800) {
			assert([...sessionOptions.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label')].every(label => label.checkVisibility()),
				'Wide composers must initially show every picker label.');
		}
		optionsToggle.click();
		for (const animation of sessionOptions.getAnimations()) {
			animation.finish();
		}
		await nextFrame();
		const collapsedTrayBounds = optionsTray.getBoundingClientRect();
		const promptBounds = promptBox.getBoundingClientRect();
		assert(!!(optionsTray.compareDocumentPosition(promptBox) & Node.DOCUMENT_POSITION_FOLLOWING),
			'The tray must precede the prompt in reading and keyboard order.');
		if (!phoneLayout) {
			assert(Math.abs(collapsedTrayBounds.bottom - promptBounds.top) < 1,
				'The collapsed tray must sit flush with the prompt.');
		}
		if (phoneLayout) {
			assert(Math.abs(collapsedTrayBounds.left - promptBounds.left) < 1
				&& Math.abs(collapsedTrayBounds.right - promptBounds.right) < 1,
				'The collapsed phone tray must stay aligned to the prompt.');
		} else {
			assert(collapsedTrayBounds.width < promptBounds.width, 'The collapsed tray must fit its controls, not the prompt width.');
		}
		if (collapsedSessionOptionsShowIcons) {
			const detailLabels = [...sessionOptions.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label')];
			const detailControls = [...sessionOptions.querySelectorAll<HTMLElement>('.action-label[role="button"]')].filter(control => control.checkVisibility());
			assert(!sessionOptions.hidden && !sessionOptions.inert && sessionOptions.classList.contains('collapsed-icon-rail')
				&& !optionsToggle.hidden && optionsToggle.getAttribute('aria-expanded') === 'false'
				&& detailControls.length > 0 && detailLabels.every(label => !label.checkVisibility()),
				'The collapsed icon rail keeps the pickers reachable as icons with the disclosure toggle available.');
		}
		if (expandSessionOptions) {
			optionsToggle.click();
			assert(!sessionOptions.hidden && !sessionOptions.inert && optionsToggle.getAttribute('aria-expanded') === 'true');
			for (const animation of sessionOptions.getAnimations()) {
				animation.finish();
			}
			await nextFrame();
			if (phoneLayout) {
				assert(Math.abs(optionsTray.getBoundingClientRect().width - collapsedTrayBounds.width) < 1,
					'The phone tray must stay aligned to the prompt while its controls expand.');
			} else {
				assert(optionsTray.getBoundingClientRect().width > collapsedTrayBounds.width, 'The tray must grow with its revealed controls.');
			}
		}
		const trayBounds = optionsTray.getBoundingClientRect();
		if (expandSessionOptions && withControlPickers && !phoneLayout) {
			assert(Math.abs(trayBounds.height - collapsedTrayBounds.height) < 1,
				'Expanding the tray must compact pickers rather than increase its height.');
		}
		if (!phoneLayout) {
			assert(Math.abs(trayBounds.bottom - promptBox.getBoundingClientRect().top) < 1,
				'The tray must remain flush with the prompt after expansion.');
		}
		const trayStyle = targetWindow.getComputedStyle(optionsTray);
		const inputArea = promptBox.querySelector<HTMLElement>('.chat-input-container');
		assert(!!inputArea);
		const hasRoundedTopCorners = parseFloat(trayStyle.borderTopLeftRadius) > 0 && parseFloat(trayStyle.borderTopRightRadius) > 0;
		assert(hasRoundedTopCorners
			&& parseFloat(trayStyle.borderBottomLeftRadius) === 0 && parseFloat(trayStyle.borderBottomRightRadius) === 0
			&& trayStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
			&& (!isHighContrast(context.theme.type) || trayStyle.backgroundColor === targetWindow.getComputedStyle(inputArea).backgroundColor),
			'The experimental tray must have a filled background and joined corners, preserving the solid input background in high contrast.');
		assert(trayBounds.left >= promptBounds.left - 1 && trayBounds.right <= promptBounds.right + 1,
			'The tray must fit within the prompt width.');
		if (phoneLayout) {
			assert(Math.abs(trayBounds.left + trayBounds.width / 2 - promptBounds.left - promptBounds.width / 2) < 1,
				'The phone workspace picker must retain its centered layout.');
		} else {
			const inputEditor = inputArea.querySelector<HTMLElement>('.interactive-input-editor');
			const attachIcon = inputArea.querySelector<HTMLElement>('.chat-input-toolbar .codicon-add-compact');
			assert(!!inputEditor && !!attachIcon);
			// The codicon is the action label itself, so its glyph starts at the content box.
			const attachIconStyle = targetWindow.getComputedStyle(attachIcon);
			const attachIconLeft = attachIcon.getBoundingClientRect().left + parseFloat(attachIconStyle.borderLeftWidth) + parseFloat(attachIconStyle.paddingLeft);
			assert(trayBounds.left > promptBounds.left
				&& Math.abs(collapsedTrayBounds.left - trayBounds.left) < 1,
				'The tray must retain its inset when expanded or collapsed.');
			assert(Math.abs(trayBounds.left - inputEditor.getBoundingClientRect().left) < 1
				&& Math.abs(trayBounds.left - attachIconLeft) <= 1,
				'The tray edge must align with the placeholder text and attach context icon.');
		}
		const toggleStyle = targetWindow.getComputedStyle(optionsToggle);
		assert(toggleStyle.display === 'flex' && toggleStyle.alignItems === 'center' && toggleStyle.justifyContent === 'center',
			'The disclosure chevron must be centered within its button.');
		const controls = [...optionsTray.querySelectorAll<HTMLElement>('.action-label[role="button"]')].filter(control => control.checkVisibility());
		const referenceStyle = controls[0] && targetWindow.getComputedStyle(controls[0]);
		for (const [index, control] of controls.entries()) {
			const style = targetWindow.getComputedStyle(control);
			const bounds = control.getBoundingClientRect();
			const label = control.querySelector<HTMLElement>('.sessions-chat-dropdown-label');
			const labelBounds = label?.checkVisibility() ? label.getBoundingClientRect() : undefined;
			assert(style.height === referenceStyle.height && style.padding === referenceStyle.padding
				&& style.gap === referenceStyle.gap && style.fontSize === referenceStyle.fontSize,
				'Every tray picker must have the same control size, padding, icon gap and text size.');
			assert(!labelBounds || Math.abs(bounds.top + bounds.height / 2 - labelBounds.top - labelBounds.height / 2) < 1,
				'Picker text must be vertically centered within the control.');
			const next = controls[index + 1]?.getBoundingClientRect();
			if (next && Math.abs(next.top - bounds.top) < 1) {
				const trayStyle = targetWindow.getComputedStyle(optionsTray);
				const spacing = parseFloat(trayStyle.getPropertyValue('--vscode-spacing-size80'));
				const stroke = parseFloat(trayStyle.getPropertyValue('--vscode-strokeThickness'));
				assert(Math.abs(next.left - bounds.right - spacing) <= stroke,
					'Adjacent pickers must have equal design-token spacing.');
			}
		}
		const lastControl = controls.at(-1)?.getBoundingClientRect();
		assert(controls.every(control => Math.abs(control.getBoundingClientRect().top - controls[0].getBoundingClientRect().top) < 1),
			'Tray pickers must stay on one row instead of stacking.');
		assert(!!controls[0]?.querySelector<HTMLElement>('.sessions-chat-dropdown-label')?.checkVisibility(),
			'The workspace name must remain visible when other pickers compact.');
		const toggleBounds = optionsToggle.getBoundingClientRect();
		assert(!lastControl || Math.abs(toggleBounds.top + toggleBounds.height / 2 - lastControl.top - lastControl.height / 2) < 1,
			'The chevron and the picker text must share the same center line.');
		for (const decoration of optionsTray.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-chevron, .repository-config-separator')) {
			assert(targetWindow.getComputedStyle(decoration).display === 'none', 'Tray pickers must not show separators or dropdown chevrons.');
		}
		const harnessLabel = optionsTray.querySelector<HTMLElement>('.sessions-chat-session-type-picker .sessions-chat-dropdown-label');
		assert(!harnessLabel || targetWindow.getComputedStyle(harnessLabel).marginLeft === '0px',
			'The harness must use the picker gap without an additional label margin.');
		if (expandSessionOptions && withControlPickers && width < 400 && !phoneLayout) {
			// Verify the compaction behaviour by its width-independent invariants instead of
			// hardcoded pixel breakpoints, which drift between platforms (macOS vs CI Ubuntu)
			// as font metrics shift the exact widths at which labels collapse to icons.
			const relayout = async (w: number) => {
				container.style.width = `${w}px`;
				view.layout(w, height, 0, 0);
				await nextFrame();
				await nextFrame();
				return [...sessionOptions.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label')].map(label => label.checkVisibility());
			};
			// Visible labels must always form a left-aligned prefix: once a label collapses,
			// every label to its right is collapsed too (compaction runs right to left).
			const compactsRightToLeft = (states: boolean[]) => states.every((visible, index) => visible || index + 1 >= states.length || !states[index + 1]);
			const visibleCount = (states: boolean[]) => states.filter(Boolean).length;

			const wide = await relayout(800);
			assert(wide.length > 0 && wide.every(visible => visible),
				'A wide tray must show every repository and harness label.');

			// Narrow through a few representative widths: labels only ever collapse (never
			// reappear) and always keep a left-aligned prefix, until the tray fully compacts.
			let previousVisible = visibleCount(wide);
			let fullyCompacted = false;
			for (const w of [520, 420, 360, 300, 220]) {
				const states = await relayout(w);
				assert(compactsRightToLeft(states), 'Pickers must compact one at a time from right to left.');
				const currentVisible = visibleCount(states);
				assert(currentVisible <= previousVisible, 'Narrowing the tray must not reveal a previously hidden label.');
				previousVisible = currentVisible;
				fullyCompacted ||= currentVisible === 0;
			}
			assert(fullyCompacted, 'Narrow trays must be able to show repository and harness icons without labels.');

			// Widen back through the same widths: labels only ever reappear (never collapse)
			// and restore left to right until every label is visible again.
			for (const w of [300, 360, 420, 520, 800]) {
				const states = await relayout(w);
				assert(compactsRightToLeft(states), 'Pickers must restore one at a time from left to right.');
				const currentVisible = visibleCount(states);
				assert(currentVisible >= previousVisible, 'Widening the tray must not hide a previously visible label.');
				previousVisible = currentVisible;
			}
			assert(previousVisible === wide.length, 'A wide tray must restore every label as the chat widens.');

			container.style.width = `${width}px`;
			view.layout(width, height, 0, 0);
			await nextFrame();
			await nextFrame();
		}
	}
	if (migrationCount > 0) {
		const notice = view.element.querySelector<HTMLElement>('.new-chat-migration-notice');
		const input = view.element.querySelector<HTMLElement>('.new-chat-input-container');
		assert(!!notice && !!input && targetWindow.getComputedStyle(notice).display !== 'none');
		const before = input.getBoundingClientRect();
		notice.style.display = 'none';
		const withoutNotice = input.getBoundingClientRect();
		notice.style.display = '';
		assert(before.x === withoutNotice.x && before.y === withoutNotice.y && before.height === withoutNotice.height,
			'The migration notice must not move or resize the centered input.');
		if (!expectBelowInputSurfacesScrollable) {
			assert(notice.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom,
				'The migration notice must fit below the input.');
		}
	}
	if (connectorRecommendations) {
		const recommendations = view.element.querySelector<HTMLElement>('.new-session-connector-recommendations');
		const cards = recommendations?.querySelectorAll<HTMLElement>('.new-session-connector-recommendation-card');
		assert(!!recommendations && cards?.length === 3 && targetWindow.getComputedStyle(recommendations).display !== 'none');
		if (connectorProductIcons) {
			await waitForFixtureCondition(() => recommendations.querySelectorAll('img').length === 3, 'Connector recommendation icons did not load.');
			await Promise.all([...recommendations.querySelectorAll<HTMLImageElement>('img')].map(image => image.decode()));
		} else {
			assert(recommendations.querySelectorAll('.codicon-ai-customization-mcp-server').length === 3,
				'Every recommendation without a product image must use the MCP server fallback icon.');
		}
		const dismissButtons = [...recommendations.querySelectorAll<HTMLElement>('.new-session-connector-recommendation-dismiss')];
		for (let index = 0; index < dismissedConnectorCount; index++) {
			dismissButtons[index]?.click();
		}
		assert([...cards].filter(card => !card.hidden).length === 3 - dismissedConnectorCount,
			'Dismissed connector recommendations must collapse while the remaining cards stay visible.');
		assert(recommendations.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom,
			'Connector recommendations must fit below the input.');
		const input = view.element.querySelector<HTMLElement>('.new-chat-input-container');
		const composerGap = phoneLayout
			? (input?.getBoundingClientRect().top ?? 0) - recommendations.getBoundingClientRect().bottom
			: recommendations.getBoundingClientRect().top - (input?.getBoundingClientRect().bottom ?? 0);
		assert(!!input && composerGap >= 20,
			'Connector recommendations must have at least 20px of breathing room next to the composer.');
		if (width >= DEFAULT_WIDTH) {
			assert([...cards].every(card => card.getBoundingClientRect().height <= 80),
				'Wide connector cards must stay compact at no more than 80px tall.');
		}
		if (focusConnectorRecommendations) {
			context.focus({ focus: () => cards[0].querySelector<HTMLElement>('.new-session-connector-recommendation-card-primary')?.focus() });
		}
	}
	if (showTip) {
		const tip = view.element.querySelector<HTMLElement>('.chat-tip-widget');
		assert(!!tip && targetWindow.getComputedStyle(tip).display !== 'none', 'The getting-started tip must be visible.');
	}
	if (connectorRecommendations && showTip && migrationCount > 0) {
		const recommendations = view.element.querySelector<HTMLElement>('.new-session-connector-recommendations');
		const tip = view.element.querySelector<HTMLElement>('.chat-tip-widget');
		const migration = view.element.querySelector<HTMLElement>('.new-chat-migration-notice');
		const belowInputSurfaces = view.element.querySelector<HTMLElement>('.new-session-below-input-surfaces');
		assert(!!recommendations && !!tip && !!migration
			&& recommendations.getBoundingClientRect().top < tip.getBoundingClientRect().top
			&& tip.getBoundingClientRect().top < migration.getBoundingClientRect().top,
			'Connector cards, the getting-started tip, and migration notice must appear in that order.');
		if (!phoneLayout) {
			assert(Math.abs(tip.getBoundingClientRect().height - migration.getBoundingClientRect().height) <= 1,
				'The getting-started tip and migration notice must have matching heights.');
		}
		if (expectBelowInputSurfacesScrollable) {
			assert(!!belowInputSurfaces
				&& belowInputSurfaces.scrollHeight > belowInputSurfaces.clientHeight
				&& belowInputSurfaces.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom
				&& promptBox.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom,
				'Constrained desktop support surfaces must scroll without clipping the composer.');
		}
	}
	if (phoneLayout) {
		const input = view.element.querySelector<HTMLElement>('.new-chat-input-container');
		const containerRect = container.getBoundingClientRect();
		const inputRect = input?.getBoundingClientRect();
		assert(!!input && input.checkVisibility() && !!inputRect && inputRect.height > 0 && inputRect.top >= containerRect.top && inputRect.bottom <= containerRect.bottom,
			'The phone composer must remain visible within the fixture viewport.');
	}
	const repositoryConfigContainer = view.element.querySelector<HTMLElement>('.new-chat-repo-config-container');
	if (withControlPickers) {
		const workspacePickerContainer = view.element.querySelector<HTMLElement>('.new-session-workspace-picker-container');
		const sessionOptions = view.element.querySelector<HTMLElement>('.new-chat-session-options-details');
		const sessionControls = view.element.querySelector<HTMLElement>('.new-chat-session-controls');
		assert(!!workspacePickerContainer && !!repositoryConfigContainer);
		assert(!!sessionOptions && !!sessionControls);
		assert(repositoryConfigContainer.querySelectorAll('.action-label:not(.separator)').length === 2);
		const primaryToolbar = promptBox.querySelector<HTMLElement>('.chat-input-toolbar');
		const toolbarItems = [...primaryToolbar?.querySelector('.actions-container')?.children ?? []];
		const attachButton = primaryToolbar?.querySelector<HTMLElement>('.codicon-add-compact')?.closest<HTMLElement>('.action-item');
		const secondaryControls = view.element.querySelector<HTMLElement>('.new-chat-controls-container');
		const bottomContainer = view.element.querySelector<HTMLElement>('.new-chat-bottom-container');
		assert(!!primaryToolbar && !!attachButton && !!secondaryControls && !!bottomContainer);
		const configItems = toolbarItems.filter(item => item !== attachButton && !item.classList.contains('sessions-shared-chat-input-session-controls'));
		if (experimentalComposerLayoutEnabled) {
			const [attach, controls, models] = toolbarItems;
			assert(sessionOptions.contains(repositoryConfigContainer)
				&& attach === attachButton
				&& controls.classList.contains('sessions-shared-chat-input-session-controls')
				&& models === configItems[0],
				'Experimental controls must appear in workspace/repository/harness order above and attachment, agent/mode, model order inside the prompt.');
			const controlItems = controls.querySelectorAll<HTMLElement>('.new-chat-session-controls .actions-container > .action-item');
			assert(controlItems[0]?.textContent === 'Agent'
				&& (phoneLayout
					? controlItems[1]?.textContent === 'Manual permissions' && !controlItems[1]?.querySelector('.agent-host-mode-permissions-trigger')
					: !!controlItems[1]?.querySelector('.agent-host-mode-permissions-trigger'))
				&& configItems.length === 1,
				'The composer must use the phone permissions control or desktop combined mode/permissions control inside the prompt.');
			if (!phoneLayout) {
				assert(targetWindow.getComputedStyle(bottomContainer).justifyContent === 'flex-end',
					'The experimental desktop bottom row must remain right-aligned.');
			}
			if (width >= DEFAULT_WIDTH) {
				const agentBounds = controlItems[0].getBoundingClientRect();
				const modeBounds = controlItems[1].getBoundingClientRect();
				assert(agentBounds.left - attachButton.getBoundingClientRect().right === modeBounds.left - agentBounds.right,
					'Attachment, agent, and mode controls must use the same spacing.');
				if (withConfiguredModel) {
					const buttons = [...primaryToolbar.querySelectorAll<HTMLElement>('.chat-input-picker-split-button')];
					assert(buttons.length === 4 && buttons.every(button => {
						const style = targetWindow.getComputedStyle(button);
						return style.paddingLeft === '6px' && style.paddingRight === '6px' && button.getBoundingClientRect().height === 22;
					}), 'Mode, permissions, model, and model configuration must have matching centered hit targets.');
					for (const secondary of primaryToolbar.querySelectorAll<HTMLElement>('.chat-input-picker-split-secondary')) {
						const primary = secondary.previousElementSibling!;
						const secondaryBounds = secondary.getBoundingClientRect();
						const separatorCenter = secondaryBounds.left + parseFloat(targetWindow.getComputedStyle(secondary, '::before').left);
						assert(separatorCenter === (primary.getBoundingClientRect().right + secondaryBounds.left) / 2,
							'Split-picker separators must be centered between the hit targets.');
					}
				}
			}
		} else {
			assert(configItems.length === 2 && configItems[0]?.textContent === 'Agent',
				'The agent picker must precede the model picker inside the prompt.');
			const repositoryControls = repositoryConfigContainer.closest<HTMLElement>('.new-chat-secondary-controls-container');
			assert(!!repositoryControls
				&& secondaryControls.contains(sessionControls)
				&& !sessionOptions.contains(repositoryConfigContainer),
				'Legacy controls must remain split across the row below the prompt.');
			if (phoneLayout) {
				const containerBounds = container.getBoundingClientRect();
				const bottomBounds = bottomContainer.getBoundingClientRect();
				const separator = bottomContainer.querySelector<HTMLElement>('.repository-config-separator');
				assert(bottomBounds.left >= containerBounds.left && bottomBounds.right <= containerBounds.right
					&& targetWindow.getComputedStyle(bottomContainer).overflowX === 'auto'
					&& (!separator || targetWindow.getComputedStyle(separator).display === 'none'),
					'Phone controls must remain in a viewport-bounded scrollable row without a repository separator.');
				if (!experimentalComposerLayout && withControlPickers) {
					const separatePermissions = bottomContainer.querySelector<HTMLElement>('.sessions-chat-dropdown-label');
					assert(separatePermissions?.textContent === 'Manual permissions'
						&& separatePermissions.checkVisibility()
						&& !bottomContainer.querySelector('.agent-host-mode-permissions-trigger'),
						'The real phone path must show Manual permissions separately instead of the desktop combined picker.');
				}
			} else {
				assert(promptBox.getBoundingClientRect().top - workspacePickerContainer.getBoundingClientRect().bottom === 8
					&& targetWindow.getComputedStyle(bottomContainer).justifyContent === 'space-between'
					&& configItems[0].getBoundingClientRect().left - attachButton.getBoundingClientRect().right === 4
					&& secondaryControls.getBoundingClientRect().left < repositoryControls.getBoundingClientRect().left,
					'Legacy desktop controls must remain aligned below the prompt.');
			}
		}
	} else if (hasChatBackground) {
		assert(!!repositoryConfigContainer
			&& repositoryConfigContainer.classList.contains('has-no-actions')
			&& targetWindow.getComputedStyle(repositoryConfigContainer).display === 'none');
	}
	if (withAttachedContext) {
		assert(promptBox.querySelectorAll('.chat-attached-context-attachment').length === createFixtureAttachments().length,
			'The host\'s initial attachments must render in the composer.');
	}
	if (phoneLayout && withAttachedContext) {
		const content = view.element.querySelector<HTMLElement>('.new-chat-widget-content');
		assert(!!content);
		assert(content.style.top === '');
	}
	if (phoneLayout) {
		const bottomContainer = view.element.querySelector<HTMLElement>('.new-chat-bottom-container');
		assert(bottomContainer?.scrollLeft === 0, 'The phone chip lane must initially show its leading controls.');
		if (withControlPickers && !experimentalComposerLayoutEnabled) {
			const permissionsLabel = Array.from(bottomContainer.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label'))
				.find(label => label.textContent === 'Manual permissions');
			const controlsContainer = bottomContainer.querySelector<HTMLElement>('.new-chat-controls-container');
			const sessionControls = bottomContainer.querySelector<HTMLElement>('.new-chat-session-controls');
			const bottomBounds = bottomContainer.getBoundingClientRect();
			const controlsBounds = controlsContainer?.getBoundingClientRect();
			const permissionsBounds = permissionsLabel?.closest<HTMLElement>('.action-label')?.getBoundingClientRect();
			assert(!!controlsContainer
				&& controlsContainer.clientWidth >= controlsContainer.scrollWidth
				&& !!controlsBounds
				&& !!sessionControls
				&& sessionControls.clientWidth >= sessionControls.scrollWidth
				&& !!permissionsBounds
				&& permissionsBounds.right <= controlsBounds.right
				&& permissionsBounds.left >= bottomBounds.left
				&& permissionsBounds.right <= bottomBounds.right,
				`The separate phone permissions control must be fully visible at the start of the chip lane. controls=${controlsBounds?.width}/${controlsContainer?.scrollWidth}, session=${sessionControls?.clientWidth}/${sessionControls?.scrollWidth}, permissions=${permissionsBounds?.width}`);
		} else if (withControlPickers) {
			const permissionsLabel = Array.from(promptBox.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label'))
				.find(label => label.textContent === 'Manual permissions');
			const permissionsBounds = permissionsLabel?.closest<HTMLElement>('.action-label')?.getBoundingClientRect();
			const promptBounds = promptBox.getBoundingClientRect();
			assert(!!permissionsLabel?.checkVisibility()
				&& !!permissionsBounds
				&& permissionsBounds.left >= promptBounds.left
				&& permissionsBounds.right <= promptBounds.right,
				'The experimental phone composer must keep the separate permissions control visible inside the input.');
		}
		const attachButton = promptBox.querySelector<HTMLElement>('.chat-input-toolbar .codicon-add-compact');
		const sendButton = promptBox.querySelector<HTMLElement>('.chat-execute-toolbar .chat-submit-button');
		const attachBounds = attachButton?.getBoundingClientRect();
		const sendBounds = sendButton?.getBoundingClientRect();
		assert(!!attachBounds && !!sendBounds
			&& Math.abs((attachBounds.top + attachBounds.bottom) / 2 - (sendBounds.top + sendBounds.bottom) / 2) <= 1,
			'The phone send button must align with the other input toolbar actions.');
	}
	if (phoneLayout && welcomePhrases) {
		const content = view.element.querySelector<HTMLElement>('.new-chat-widget-content');
		const welcomeMessage = view.element.querySelector<HTMLElement>('.new-session-welcome-message');
		const workspacePickerContainer = view.element.querySelector<HTMLElement>('.new-session-workspace-picker-container');
		const workspacePicker = view.element.querySelector<HTMLElement>('.sessions-workspace-category-picker');
		const containerBounds = container.getBoundingClientRect();
		const contentBounds = content?.getBoundingClientRect();
		const welcomeBounds = welcomeMessage?.getBoundingClientRect();
		const workspaceBounds = workspacePickerContainer?.getBoundingClientRect();
		const workspacePickerBounds = workspacePicker?.getBoundingClientRect();
		assert(!!contentBounds && !!welcomeBounds && !!workspaceBounds && !!workspacePickerBounds
			&& welcomeBounds.top >= containerBounds.top + containerBounds.height * 0.2
			&& welcomeBounds.bottom < workspacePickerBounds.top
			&& workspacePickerBounds.top >= containerBounds.top + containerBounds.height * 0.4
			&& workspacePickerBounds.bottom <= containerBounds.top + containerBounds.height * 0.55,
			'Phone welcome phrases must move toward the centered workspace hero without shifting the hero itself.');
	}
	if (withAutoModel) {
		const statusLabels = [...promptBox.querySelectorAll<HTMLElement>('.chat-input-status-toolbar .action-item > .action-label')];
		assert(statusLabels.filter(label => label.classList.contains('codicon')).length === 3
			&& statusLabels.some(label => label.classList.contains('codicon-rocket'))
			&& statusLabels.some(label => label.classList.contains('codicon-warning')),
			'The input status toolbar must show the contributed status icons.');
		const textLabel = statusLabels.find(label => label.textContent === 'Status');
		assert(!!textLabel && textLabel.scrollWidth <= textLabel.clientWidth, 'The text status action must not clip.');
	}
	if (primaryToolbarWidth !== undefined) {
		const toolbar = promptBox.querySelector<HTMLElement>('.chat-input-toolbar');
		if (!toolbar) {
			throw new Error('Expected the new-session input toolbar to render.');
		}
		toolbar.style.flex = `0 0 ${primaryToolbarWidth}px`;
		toolbar.style.width = `${primaryToolbarWidth}px`;
		await nextFrame();
		await nextFrame();
	}
	if (openWorkspacePicker) {
		await nextFrame();
		await nextFrame();
		view.element.querySelector<HTMLElement>('.sessions-workspace-picker-trigger .action-label')?.click();
		context.disposableStackStore.add(toDisposable(() =>
			container.querySelector<HTMLElement>('.mobile-picker-sheet-backdrop')?.click()));
		await nextFrame();
		if (phoneLayout && unifiedWorkspacePicker) {
			const sheet = container.querySelector<HTMLElement>('.mobile-picker-sheet');
			const search = sheet?.querySelector<HTMLElement>('.mobile-picker-sheet-search');
			const searchInput = search?.querySelector<HTMLInputElement>('.mobile-picker-sheet-search-input');
			const sheetBounds = sheet?.getBoundingClientRect();
			const searchBounds = search?.getBoundingClientRect();
			assert(!!sheetBounds && !!searchBounds && !!search && !!searchInput
				&& searchBounds.left >= sheetBounds.left && searchBounds.right <= sheetBounds.right
				&& targetWindow.getComputedStyle(searchInput).outlineStyle === 'none'
				&& targetWindow.getComputedStyle(search).outlineStyle === 'solid',
				'The unified phone picker search focus ring must follow the rounded field without overflowing the sheet.');
		}
		if (closeWorkspacePickerAfterOpen) {
			container.querySelector<HTMLElement>('.mobile-picker-sheet-backdrop')?.click();
			await nextFrame();
		}
	} else if (openGitHubContextPicker) {
		await nextFrame();
		await nextFrame();
		view.element.querySelector<HTMLElement>('[aria-label="Attach a GitHub issue or pull request to the new session"]')?.click();
	} else if (openComparisonSetup) {
		if (comparisonPrompt !== undefined) {
			view.prefillInput(comparisonPrompt);
		}
		view.element.querySelector<HTMLElement>('.sessions-chat-session-type-picker .action-label')?.click();
		await nextFrame();
		await nextFrame();
		targetWindow.document.querySelector<HTMLElement>('.sessions-run-multiple-agents-action')?.click();
		await nextFrame();
		await nextFrame();
		const rows = container.querySelector<HTMLElement>('.session-comparison-setup-rows-scroll');
		if (rows) {
			rows.scrollTop = 0;
		}
	}

	if (promptOptions) {
		composerService.activeComposer.get()?.showPromptOptions(promptOptions);
		if (promptOptions.kind === 'resolved' && selectedOptionIndex !== undefined) {
			const buttons = view.element.querySelectorAll<HTMLElement>('.new-session-prompt-option.monaco-button');
			buttons[selectedOptionIndex]?.click();
			await Promise.resolve();
			await Promise.resolve();
		}
		if (editedInput !== undefined) {
			view.prefillInput(editedInput);
		}
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/newWidget/' }, {
	Migrations: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, migrationCount: 4 }),
	}),
	MigrationsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { width: 420, height: 560, withWorkspace: true, migrationCount: 4 }),
	}),
	MigrationsBackground: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['Over a loud repeating magenta, cyan, yellow, and blue striped background, the new-session composer shows the customization migration notice below the input on an opaque bordered surface. None of the stripes show through the notice.'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, migrationCount: 4, chatBackground: 'loud' }),
	}),
	ConnectorRecommendationsBefore: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The control state shows the centered new-session composer with no connector recommendation below it.'],
		render: context => renderNewChatWidget(context, { height: 700, withWorkspace: true, experimentalComposerLayout: true }),
	}),
	ConnectorRecommendations: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Below the centered new-session composer, three equal cards for Linear, Notion, and WorkIQ each show a product image, name, short benefit, and independent dismiss control. No section heading, subtitle, or arrow icon appears.'],
		render: context => renderNewChatWidget(context, { height: 700, withWorkspace: true, connectorRecommendations: true, experimentalComposerLayout: true }),
	}),
	ConnectorRecommendationsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['In a narrow Agents window, the three connector cards retain readable widths in one horizontally scrollable row instead of compressing their product images and copy.'],
		render: context => renderNewChatWidget(context, { width: 420, height: 760, withWorkspace: true, connectorRecommendations: true, experimentalComposerLayout: true }),
	}),
	ConnectorRecommendationsOneDismissed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['After dismissing Linear, the Notion and WorkIQ recommendation cards remain and expand evenly across the available row without leaving an empty slot.'],
		render: context => renderNewChatWidget(context, { height: 700, withWorkspace: true, connectorRecommendations: true, dismissedConnectorCount: 1, experimentalComposerLayout: true }),
	}),
	ConnectorRecommendationsTwoDismissed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['After dismissing Linear and Notion, the WorkIQ recommendation card remains as one full-width card without leaving empty slots.'],
		render: context => renderNewChatWidget(context, { height: 700, withWorkspace: true, connectorRecommendations: true, dismissedConnectorCount: 2, experimentalComposerLayout: true }),
	}),
	ConnectorRecommendationsFallbackIcons: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['When connector catalog images are unavailable, all three recommendation cards use the same standard MCP server fallback icon while retaining their names, benefits, and actions.'],
		render: context => renderNewChatWidget(context, { height: 700, withWorkspace: true, connectorRecommendations: true, connectorProductIcons: false, experimentalComposerLayout: true }),
	}),
	ConnectorRecommendationsBackground: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Over a loud repeating background, all three connector cards remain legible on opaque neutral card surfaces, and the section heading remains visually subordinate to the composer.'],
		render: context => renderNewChatWidget(context, { height: 700, withWorkspace: true, connectorRecommendations: true, experimentalComposerLayout: true, chatBackground: 'loud' }),
	}),
	ConnectorRecommendationsWithNotices: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The compact three-card connector recommendation section appears first, followed by the getting-started tip and then the migration notice in a consistently spaced stack below the composer.'],
		render: context => renderNewChatWidget(context, { height: 820, withWorkspace: true, migrationCount: 4, showTip: true, connectorRecommendations: true, experimentalComposerLayout: true }),
	}),
	ConnectorRecommendationsShortAfterLayoutToggle: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['After toggling the experimental composer off and on in a short desktop pane, connector cards, the getting-started tip, and migration notice retain their order in a scrollable support region while the composer remains visible.'],
		render: context => renderNewChatWidget(context, {
			height: 400,
			withWorkspace: true,
			migrationCount: 4,
			showTip: true,
			connectorRecommendations: true,
			unifiedWorkspacePicker: true,
			toggleExperimentalComposerLayout: true,
			expectBelowInputSurfacesScrollable: true,
		}),
	}),
	ConnectorRecommendationsFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Keyboard focus is visible around the first connector card primary action with the standard focus treatment while each card retains a separate reachable dismiss control.'],
		render: context => renderNewChatWidget(context, { height: 700, withWorkspace: true, connectorRecommendations: true, focusConnectorRecommendations: true, experimentalComposerLayout: true }),
	}),
	ConnectorRecommendationsPhone: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['On a phone-sized Agents window, the connector section sits immediately above the bottom-pinned composer and preserves readable cards in a horizontally scrollable row within the viewport.'],
		render: context => renderNewChatWidget(context, { width: 390, height: 760, withWorkspace: true, withControlPickers: true, connectorRecommendations: true, experimentalComposerLayout: true, phoneLayout: true }),
	}),
	ConnectorRecommendationsPhoneWithNotices: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['On a phone-sized Agents window, the connector cards, getting-started tip, and migration notice form a compact stack immediately above the bottom-pinned composer, without covering the workspace controls or overflowing the viewport.'],
		render: context => renderNewChatWidget(context, { width: 390, height: 760, withWorkspace: true, withControlPickers: true, migrationCount: 4, showTip: true, connectorRecommendations: true, experimentalComposerLayout: true, phoneLayout: true }),
	}),
	NewSessionDefault: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { withWorkspace: true }),
	}),
	NewSessionUnifiedWorkspacePicker: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, unifiedWorkspacePicker: true }),
	}),
	NewSessionExperimentalComposer: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The experimental new-session composer places workspace, worktree, branch, and harness controls in one row above the chat input. Inside the input, the Agent picker appears before the model picker, and mode and permissions remain available.'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, experimentalComposerLayout: true }),
	}),
	NewSessionExperimentalComposerBackground: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['Over a loud repeating magenta, cyan, yellow, and blue striped background, the experimental new-session composer paints only the workspace, worktree, branch, and harness options tray with the opaque main session surface. The picker controls use the tray surface instead of separate resting fills, and the tray has square bottom corners where it meets the unchanged chat input.'],
		render: context => renderNewChatWidget(context, {
			withWorkspace: true,
			withControlPickers: true,
			chatBackground: 'loud',
			experimentalComposerLayout: true,
		}),
	}),
	NewSessionOptionsExpanded: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, expandSessionOptions: true, experimentalComposerLayout: true }),
	}),
	NewSessionOptionsCollapsed: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, expandSessionOptions: false, experimentalComposerLayout: true }),
	}),
	NewSessionOptionsIconRail: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, expandSessionOptions: false, collapsedSessionOptionsShowIcons: true, experimentalComposerLayout: true }),
	}),
	NewSessionOptionsAnimated: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => {
			context.container.classList.remove('disable-animations');
			return renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, experimentalComposerLayout: true });
		},
	}),
	NewSessionOptionsExpandedNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { width: 380, withWorkspace: true, withControlPickers: true, expandSessionOptions: true, experimentalComposerLayout: true }),
	}),
	NewSessionPromptPickers: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, withConfiguredModel: true, experimentalComposerLayout: true }),
	}),
	NewSessionVoicePickerSpacing: defineComponentFixture({
		virtualTime: { enabled: false },
		render: async context => {
			await renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, withConfiguredModel: true, withVoiceInputMode: true, experimentalComposerLayout: true });
			const model = context.container.querySelector<HTMLElement>('.model-picker-config');
			const voice = context.container.querySelector<HTMLElement>('.chat-voice-input-mode');
			assert(!!model && !!voice && model.checkVisibility() && voice.checkVisibility());
			assert(voice.getBoundingClientRect().left - model.getBoundingClientRect().right === 8,
				'The model configuration and voice control must be separated by the same 8px as a running session.');
		},
	}),
	NewSessionPromptPickersNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, withConfiguredModel: true, width: 480, experimentalComposerLayout: true }),
	}),
	NewSessionPromptPickersCompact: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderNewChatWidget(context, { withWorkspace: true, withControlPickers: true, withConfiguredModel: true, expandSessionOptions: true, width: 320, experimentalComposerLayout: true }),
	}),
	NewSessionChatBackground: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['In regular themes, the new-session composer sits on a static layered Codicon constellation with compact, softer distant icons, brighter base-size near icons, and a quieter center. There is no card behind the composer; its controls have opaque surfaces and thin borders. High-contrast themes omit the wallpaper and Celebrate button, preserving opaque surfaces and visible control borders.'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, withAutoModel: true, chatBackground: 'codicons' }),
	}),
	NewSessionBackgroundControls: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { withWorkspace: true, chatBackground: 'codicons', withControlPickers: true }),
	}),
	NewSessionAutoModel: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The new-session input toolbar shows an Auto model picker whose background fits closely around the Copilot icon and Auto label without excessive empty horizontal space. The status row below the input shows rocket, warning, and connection status icons, followed by the full Status text action without clipping.'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, withAutoModel: true }),
	}),
	NewSessionCompactAutoModel: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The new-session input toolbar shows the Auto model picker in compact mode as a centered Copilot icon inside a 22-pixel square control aligned with the expanded toolbar height.'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, withAutoModel: true, primaryToolbarWidth: 56 }),
	}),
	NewSessionConfiguredModel: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderNewChatWidget(context, { withWorkspace: true, withConfiguredModel: true }),
	}),
	NewSessionCompactConfiguredModel: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderNewChatWidget(context, { withWorkspace: true, withConfiguredModel: true, primaryToolbarWidth: 166 }),
	}),
	NewSessionWorkspacePicker: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The new-session composer shows Copilot, microsoft/vscode, and Issue/PR pills. The microsoft/vscode workspace pill has the active treatment after opening the workspace picker. Pill and dropdown labels use the same body text size, and their leading icons use the same base icon size.'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, openWorkspacePicker: true }),
	}),
	NewSessionComparisonSetup: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		expectedVisualDescriptions: ['A wide, focused Run and Compare Agents dialog opens with the current prompt, workspace and base-branch controls, and an unchecked Allow all permissions for every participant checkbox followed by a compact information icon. The bulk permission and isolated-worktree explanation is hidden at rest and available from the icon hover or keyboard focus. Two aligned attempt rows are visible by default with Agent, Model, and Permissions controls on one line. The shared VS Code model picker uses the experimental provider-tab experience for model effort and context configuration, while each Permissions picker shows the exact provider choices, such as Manual permissions and Allow all for Copilot. The Model column receives the most room so configured model names and effort summaries remain readable. Remove actions are absent while only the required two attempts exist, Add attempt is a quiet inline action, Evaluation configures the Judge and Synthesizer independently with actions to save or clear defaults, and the primary action reads Start 2 sessions in parallel with a warning hover about token usage per session.'],
		render: context => renderNewChatWidget(context, { height: 760, withWorkspace: true, withConfiguredModel: true, openComparisonSetup: true, comparisonPrompt: 'Implement the issue and include focused tests.' }),
	}),
	NewSessionGitHubContextPicker: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The new-session composer shows Copilot, microsoft/vscode, and Issue/PR pills. The Issue/PR pill has the active treatment after opening its picker.'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, openGitHubContextPicker: true }),
	}),
	NewSessionAttachedContext: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The new-session workspace row shows Copilot, microsoft/vscode with a count badge showing 2, and Issue/PR with a count badge showing 1. The composer attachment row shows removable docs, microsoft/typescript, and microsoft/vscode#333053 context pills with compact dismiss icons. The input expands upward for the attachment row while its bottom controls remain aligned with the default new-session composer. The folder icon is fully visible without cropping, and the GitHub issue pill includes an issue icon.'],
		render: context => renderNewChatWidget(context, { withWorkspace: true, withAttachedContext: true }),
	}),
	NewSessionPhoneAttachedContext: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The phone new-session composer shows attachment pills without shifting the full-height content surface upward or leaving a gap below it. The status row below the input shows the status icons and the full Status text action.'],
		render: context => renderNewChatWidget(context, { width: 390, height: 760, withWorkspace: true, withAttachedContext: true, withAutoModel: true, phoneLayout: true }),
	}),
	NewSessionPhoneWelcomePhrase: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['With welcome phrases enabled, the phone keeps the greeting visually grouped with the centered Sessions logo and workspace controls instead of leaving it near the top of the screen.'],
		render: context => renderNewChatWidget(context, { width: 390, height: 760, withWorkspace: true, withControlPickers: true, welcomePhrases: true, phoneLayout: true }),
	}),
	NewSessionPhoneSettingsDisabled: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['With neither the unified workspace picker nor experimental composer setting enabled, the real phone path keeps permissions separate from the horizontally scrollable repository controls instead of forcing the desktop combined Mode/Permissions picker.'],
		render: context => renderNewChatWidget(context, { width: 390, height: 760, withWorkspace: true, withControlPickers: true, unifiedWorkspacePicker: false, experimentalComposerLayout: false, phoneLayout: true }),
	}),
	NewSessionPhoneUnifiedWorkspacePicker: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['With only the unified workspace picker enabled, the real phone presenter keeps workspace and harness controls centered below the Sessions logo. Manual permissions stays separate and fully visible before the horizontally scrollable Worktree and Branch controls.'],
		render: context => renderNewChatWidget(context, { width: 390, height: 760, withWorkspace: true, withControlPickers: true, openWorkspacePicker: true, closeWorkspacePickerAfterOpen: true, unifiedWorkspacePicker: true, experimentalComposerLayout: false, phoneLayout: true }),
	}),
	NewSessionPhoneExperimentalComposer: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['With the unified workspace picker and experimental composer enabled, the real phone presenter keeps workspace, worktree, branch, and harness controls in one bounded surface. Agent, separate Manual permissions, Model, and Send remain aligned inside the bottom-pinned input.'],
		render: context => renderNewChatWidget(context, { width: 390, height: 760, withWorkspace: true, withControlPickers: true, experimentalComposerLayout: true, phoneLayout: true }),
	}),
	NewSessionRemoteWorkspace: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The new-session composer shows Copilot and devbox · microsoft/vscode pills. No Issue/PR pill is visible because the remote workspace has no associated GitHub repository metadata.'],
		render: context => renderNewChatWidget(context, { withRemoteWorkspace: true }),
	}),
	NewSessionNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { width: 420, height: 760, withWorkspace: true }),
	}),
	NewSessionComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { commentCount: 3 }),
	}),
	NewSessionTip: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { showTip: true }),
	}),
	PromptOptionsLoading: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { promptOptions: { kind: 'loading' } }),
	}),
	PromptOptionsStandard: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { promptOptions: { kind: 'resolved', options: createStandardPromptOptions() } }),
	}),
	PromptOptionsGitHubMixed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { promptOptions: { kind: 'resolved', options: createMixedPromptOptions() } }),
	}),
	PromptOptionsSelected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, {
			promptOptions: { kind: 'resolved', options: createStandardPromptOptions() },
			selectedOptionIndex: 0,
		}),
	}),
	PromptOptionsEditedDisabled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			const promptOptions = createStandardPromptOptions();
			return renderNewChatWidget(context, {
				promptOptions: { kind: 'resolved', options: promptOptions },
				selectedOptionIndex: 0,
				editedInput: `${promptOptions[0].prompt} Add a regression test too.`,
			});
		},
	}),
	PromptOptionsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, {
			width: 420,
			height: 760,
			promptOptions: { kind: 'resolved', options: createMixedPromptOptions() },
		}),
	}),
});

function createFixtureWorkspace(remote: boolean): ISessionWorkspace {
	const resource = remote
		? URI.parse('vscode-remote://ssh-remote+devbox/workspaces/vscode')
		: URI.file('C:\\Code\\vscode');
	return {
		uri: resource,
		label: remote ? 'devbox · microsoft/vscode' : 'microsoft/vscode',
		icon: remote ? Codicon.remote : Codicon.repo,
		group: remote ? SESSION_WORKSPACE_GROUP_REMOTE : SESSION_WORKSPACE_GROUP_LOCAL,
		folders: [{
			root: resource,
			workingDirectory: resource,
			name: 'microsoft/vscode',
			description: undefined,
			gitRepository: remote ? undefined : {
				uri: resource,
				workTreeUri: undefined,
				baseBranchName: 'main',
				gitHubInfo: constObservable({ owner: 'microsoft', repo: 'vscode' }),
			},
		}],
		requiresWorkspaceTrust: true,
		isVirtualWorkspace: false,
	};
}

function createFixtureSessionTypes(): readonly ISessionType[] {
	return [
		{
			id: 'copilotcli',
			label: 'Copilot',
			icon: Codicon.terminal,
			authRequirement: SessionTypeAuthRequirement.None,
			supportsWorktreeConfiguration: true,
		},
		{
			id: 'claude',
			label: 'Claude',
			icon: Codicon.sparkle,
			authRequirement: SessionTypeAuthRequirement.None,
			supportsWorktreeConfiguration: true,
		},
	];
}

function createFixtureProvider(workspace: ISessionWorkspace, sessionTypes: readonly ISessionType[], models: readonly ILanguageModelChatMetadataAndIdentifier[], disposableStore: DisposableStore, withRepositoryConfig: boolean): ISessionsProvider {
	const changed = disposableStore.add(new Emitter<string>());
	const config: ResolveSessionConfigResult = {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.Isolation]: { type: 'string', title: 'Isolation', enum: ['worktree', 'folder'] },
				[SessionConfigKey.Branch]: { type: 'string', title: 'Branch', enum: ['main', 'feature'] },
				[SessionConfigKey.Mode]: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], enumLabels: ['Interactive', 'Plan', 'Autopilot'] },
				[SessionConfigKey.AutoApprove]: { type: 'string', title: 'Permissions', enum: ['default', 'assisted', 'autoApprove'], enumLabels: ['Manual permissions', 'Assisted permissions', 'Allow all'] },
			},
		},
		values: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main', [SessionConfigKey.Mode]: 'autopilot', [SessionConfigKey.AutoApprove]: 'assisted' },
	};
	return new class extends mock<IAgentHostSessionsProvider>() {
		override readonly id = withRepositoryConfig ? LOCAL_AGENT_HOST_PROVIDER_ID : 'fixture-provider';
		override readonly onDidChangeSessionConfig = changed.event;
		override getSessionConfig() { return withRepositoryConfig ? config : undefined; }
		override getCreateSessionConfig() { return withRepositoryConfig ? {} : undefined; }
		override isSessionConfigResolving() { return constObservable(false); }
		override trackSessionConfigOperation(): void { }
		override async setSessionConfigValue(sessionId: string, _chat: URI, property: string, value: unknown) {
			config.values[property] = value;
			changed.fire(sessionId);
		}
		override readonly label = 'Fixture Provider';
		override readonly icon = Codicon.terminal;
		override readonly order = 0;
		override readonly sessionTypes = sessionTypes;
		override readonly onDidChangeSessionTypes = Event.None;
		override getSessionTypes(_workspaceUri: URI): ISessionType[] { return [...this.sessionTypes]; }
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidChangeModels = Event.None;
		override readonly browseActions = [
			{
				label: 'Repository...',
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.repo,
				providerId: this.id,
				attachesContext: false,
				run: async () => workspace,
			},
			{
				label: 'Issue...',
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.issues,
				providerId: this.id,
				attachesContext: true,
				run: async () => undefined,
			},
			{
				label: 'Pull Request...',
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.gitPullRequest,
				providerId: this.id,
				attachesContext: true,
				run: async () => undefined,
			},
		];
		override readonly supportsLocalWorkspaces = true;
		override readonly supportsModelConfigurationForCreation = true;
		override readonly supportsPermissionsForCreation = true;

		override getSessions(): ISession[] {
			return [];
		}

		override resolveWorkspace(folderUri: URI): ISessionWorkspace | undefined {
			if (folderUri.toString() === workspace.folders[0].root.toString()) {
				return workspace;
			}
			if (folderUri.toString() === ATTACHED_FOLDER_URI.toString()) {
				return createAttachedFolderWorkspace();
			}
			if (folderUri.toString() === ATTACHED_REPOSITORY_ROOT.toString()) {
				return createAttachedRepositoryWorkspace();
			}
			return undefined;
		}

		override getModelsSnapshot() {
			return {
				models,
				desiredModelResolution: { kind: 'notRequested' as const },
				modelTarget: 'agent-host-copilotcli',
			};
		}

		override getModelsSnapshotForCreation() {
			return this.getModelsSnapshot();
		}

		override getModelPickerOptions() {
			return {
				showUnavailableFeatured: false,
				showManageModelsAction: false,
				showAutoModel: !models.length || models.some(model => model.metadata.id === 'auto'),
			};
		}

		override setModel(): void { }
	}();
}

function createFixtureAutoModel(): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/auto',
		metadata: {
			extension: new ExtensionIdentifier('github.copilot-chat'),
			id: 'auto',
			name: 'Auto',
			vendor: 'copilot',
			version: '1.0',
			family: 'auto',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
		},
	};
}

function createFixtureConfiguredModel(): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/gpt-5.6-sol-fast',
		metadata: {
			extension: new ExtensionIdentifier('github.copilot-chat'),
			id: 'gpt-5.6-sol-fast',
			name: 'GPT-5.6 Sol Fast (Internal only)',
			vendor: 'copilot',
			version: '1',
			family: 'gpt',
			maxInputTokens: 1000000,
			maxOutputTokens: 4096,
			isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
			configurationSchema: {
				properties: {
					thinkingLevel: {
						type: 'string',
						group: 'navigation',
						enum: ['low', 'medium', 'high', 'xhigh', 'max'],
						enumItemLabels: ['Low', 'Medium', 'High', 'Extra High', 'Max'],
						default: 'high',
					},
					context: {
						type: 'string',
						group: 'tokens',
						enum: ['default', 'long'],
						enumItemLabels: ['Default', '1M'],
						default: 'long',
					},
				},
			},
		},
	};
}

function createFixtureAttachments(): readonly IChatRequestVariableEntry[] {
	const issueUri = URI.parse('https://github.com/microsoft/vscode/issues/333053');
	return [
		{
			kind: 'directory',
			id: getAdditionalFolderContextId(ATTACHED_FOLDER_URI),
			name: 'docs',
			value: ATTACHED_FOLDER_URI,
		},
		{
			kind: 'generic',
			id: getAdditionalRepositoryContextId(ATTACHED_REPOSITORY_URI),
			name: 'microsoft/typescript',
			value: ATTACHED_REPOSITORY_ROOT,
			icon: Codicon.repo,
		},
		toPasteVariableEntry('microsoft/vscode#333053', `GitHub context: ${issueUri.toString()}`, {
			id: `github-context:${issueUri.toString()}`,
			icon: computeIssueIcon(GitHubIssueState.Open, undefined),
		}),
	];
}

function createAttachedFolderWorkspace(): ISessionWorkspace {
	return {
		uri: ATTACHED_FOLDER_URI,
		label: 'docs',
		icon: Codicon.folder,
		group: SESSION_WORKSPACE_GROUP_LOCAL,
		folders: [{
			root: ATTACHED_FOLDER_URI,
			workingDirectory: ATTACHED_FOLDER_URI,
			name: 'docs',
			description: undefined,
			gitRepository: undefined,
		}],
		requiresWorkspaceTrust: true,
		isVirtualWorkspace: false,
	};
}

function createAttachedRepositoryWorkspace(): ISessionWorkspace {
	return {
		uri: ATTACHED_REPOSITORY_URI,
		label: 'microsoft/typescript',
		icon: Codicon.repo,
		group: SESSION_WORKSPACE_GROUP_GITHUB,
		folders: [{
			root: ATTACHED_REPOSITORY_ROOT,
			workingDirectory: ATTACHED_REPOSITORY_ROOT,
			name: 'typescript',
			description: undefined,
			gitRepository: undefined,
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: true,
	};
}

function createFixtureActiveSession(workspace: ISessionWorkspace, sessionType: ISessionType, withMigrations = false, providerId = 'fixture-provider'): IActiveSession {
	const activeChat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('fixture-chat://new-session');
		// Read by model selection: an untitled chat with no model of its own.
		override readonly status = constObservable(SessionStatus.Untitled);
		override readonly modelId = constObservable<string | undefined>(undefined);
		override readonly modelSource = constObservable<ChatModelSource | undefined>(undefined);
		override readonly changesets = constObservable(undefined);
	}();
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.from({ scheme: withMigrations ? 'agent-host-copilotcli' : 'fixture-session', path: '/fixture-session' });
		override readonly sessionId = 'fixture-session';
		override readonly providerId = providerId;
		override readonly sessionType = sessionType.id;
		override readonly status = constObservable(SessionStatus.Untitled);
		override readonly isCreated = constObservable(false);
		override readonly loading = constObservable(false);
		override readonly workspace = constObservable(workspace);
		override readonly branch = constObservable<string | undefined>('main');
		override readonly modelId = constObservable<string | undefined>(undefined);
		override readonly mainChat = constObservable(activeChat);
		override readonly activeChat = constObservable(activeChat);
	}();
}

function createStandardPromptOptions(): readonly INewSessionPromptOption[] {
	return [
		{
			id: 'standard:implementFeature',
			title: 'Implement a feature',
			description: 'Describe what you want to build',
			prompt: 'Help me implement [describe the feature] in this project. Ask me questions if anything is unclear regarding the intended behaviour.',
			placeholder: '[describe the feature]',
			icon: Codicon.lightbulbSparkleAutofix,
		},
		{
			id: 'standard:fixBug',
			title: 'Fix a bug',
			description: 'Describe the unexpected behavior',
			prompt: 'Help me fix [describe the bug] in this project. Ask me questions if anything is unclear regarding the bug or the intended behaviour.',
			placeholder: '[describe the bug]',
			icon: Codicon.bug,
		},
		{
			id: 'standard:fixCi',
			title: 'Fix CI',
			description: 'Describe a failing check or paste a link',
			prompt: 'Help me fix the failing CI for [describe the CI failure or paste a link] in this project. Ask me questions if anything is unclear regarding the CI failure or how it should be fixed.',
			placeholder: '[describe the CI failure or paste a link]',
			icon: Codicon.runErrors,
		},
	];
}

function createMixedPromptOptions(): readonly INewSessionPromptOption[] {
	return [
		{
			id: 'githubIssue:327101',
			title: 'Tackle issue',
			titleDetail: '#327101',
			description: 'Improve the accessibility of inline chat controls',
			prompt: 'Tackle the following issue and create a pull request for it: "Improve the accessibility of inline chat controls" (https://github.com/microsoft/vscode/issues/327101).',
			placeholder: '',
			icon: computeIssueIcon(GitHubIssueState.Open, undefined),
		},
		{
			id: 'githubIssue:326842',
			title: 'Tackle issue',
			titleDetail: '#326842',
			description: 'Preserve editor state when switching sessions',
			prompt: 'Tackle the following issue and create a pull request for it: "Preserve editor state when switching sessions" (https://github.com/microsoft/vscode/issues/326842).',
			placeholder: '',
			icon: computeIssueIcon(GitHubIssueState.Open, undefined),
		},
		{
			id: 'githubCiFailure:329629',
			title: 'Fix CI',
			titleDetail: '#329629',
			description: 'Add GitHub prompt variation to onboarding',
			prompt: 'The following pull request has failing CI checks: "Add GitHub prompt variation to onboarding" (https://github.com/microsoft/vscode/pull/329629). Investigate the failures and resolve them.',
			placeholder: '',
			icon: computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }),
		},
	];
}
