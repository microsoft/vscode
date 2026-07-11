/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IChatSessionsService, isAgentHostTarget, localChatSessionType, SessionType } from './chatSessionsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { LocalChatSessionUri } from './model/chatUri.js';
import { clearUserSelectedSessionType, getRememberedSessionType, storeUserSelectedSessionType } from './chatSessionTypePreference.js';

export const enum BYOKUtilityModelDefault {
	None = 'none',
	MainAgent = 'mainAgent',
	Copilot = 'copilot',
}

export enum ChatConfiguration {
	AIDisabled = 'chat.disableAIFeatures',
	PluginsEnabled = 'chat.plugins.enabled',
	PluginLocations = 'chat.pluginLocations',
	PluginMarketplaces = 'chat.plugins.marketplaces',
	ExtraMarketplaces = 'chat.plugins.extraMarketplaces',
	StrictMarketplaces = 'chat.plugins.strictMarketplaces',
	EnabledPlugins = 'chat.plugins.enabledPlugins',
	AgentEnabled = 'chat.agent.enabled',
	PlanAgentDefaultModel = 'chat.planAgent.defaultModel',
	ExploreAgentDefaultModel = 'chat.exploreAgent.defaultModel',
	UtilityModel = 'chat.utilityModel',
	UtilitySmallModel = 'chat.utilitySmallModel',
	BYOKUtilityModelDefault = 'chat.byokUtilityModelDefault',
	RequestQueueingDefaultAction = 'chat.requestQueuing.defaultAction',
	AgentStatusEnabled = 'chat.agentsControl.enabled',
	EditorAssociations = 'chat.editorAssociations',
	UnifiedAgentsBar = 'chat.unifiedAgentsBar.enabled',
	AgentSessionProjectionEnabled = 'chat.agentSessionProjection.enabled',
	ExtensionToolsEnabled = 'chat.extensionTools.enabled',
	RepoInfoEnabled = 'chat.repoInfo.enabled',
	EditRequests = 'chat.editRequests',
	InlineReferencesStyle = 'chat.inlineReferences.style',
	AutoReply = 'chat.autoReply',
	GlobalAutoApprove = 'chat.tools.global.autoApprove',
	AutoApproveEdits = 'chat.tools.edits.autoApprove',
	AutoApprovedUrls = 'chat.tools.urls.autoApprove',
	EligibleForAutoApproval = 'chat.tools.eligibleForAutoApproval',
	EnableMath = 'chat.math.enabled',
	CheckpointsEnabled = 'chat.checkpoints.enabled',
	ThinkingStyle = 'chat.agent.thinkingStyle',
	ThinkingGenerateTitles = 'chat.agent.thinking.generateTitles',
	TerminalToolsInThinking = 'chat.agent.thinking.terminalTools',
	SimpleTerminalCollapsible = 'chat.tools.terminal.simpleCollapsible',
	CompressOutputEnabled = 'chat.tools.compressOutput.enabled',
	ThinkingPhrases = 'chat.agent.thinking.phrases',
	AutoExpandToolFailures = 'chat.tools.autoExpandFailures',
	TodosShowWidget = 'chat.tools.todos.showWidget',
	NotifyWindowOnConfirmation = 'chat.notifyWindowOnConfirmation',
	NotifyWindowOnResponseReceived = 'chat.notifyWindowOnResponseReceived',
	ChatViewSessionsEnabled = 'chat.viewSessions.enabled',
	SessionSyncEnabled = 'chat.sessionSync.enabled',
	SessionSyncExcludeRepositories = 'chat.sessionSync.excludeRepositories',
	ChatViewSessionsGrouping = 'chat.viewSessions.grouping',
	ChatViewSessionsOrientation = 'chat.viewSessions.orientation',
	ChatViewProgressBadgeEnabled = 'chat.viewProgressBadge.enabled',
	ChatContextUsageEnabled = 'chat.contextUsage.enabled',
	ChatPersistentProgressEnabled = 'chat.persistentProgress.enabled',
	ProgressBorder = 'chat.progressBorder.enabled',
	SubagentToolCustomAgents = 'chat.customAgentInSubagent.enabled',
	GeneralPurposeAgentEnabled = 'chat.generalPurposeAgent.enabled',
	SubagentsAllowInvocationsFromSubagents = 'chat.subagents.allowInvocationsFromSubagents',
	ShowCodeBlockProgressAnimation = 'chat.agent.codeBlockProgress',
	RestoreLastPanelSession = 'chat.restoreLastPanelSession',
	ExitAfterDelegation = 'chat.exitAfterDelegation',
	ExplainChangesEnabled = 'chat.editing.explainChanges.enabled',
	RevealNextChangeOnResolve = 'chat.editing.revealNextChangeOnResolve',
	OpenChangedFileInDiffEditor = 'chat.editing.openChangedFileInDiffEditor',
	GrowthNotificationEnabled = 'chat.growthNotification.enabled',
	TitleBarSignInEnabled = 'chat.titleBar.signIn.enabled',
	TitleBarOpenInAgentsWindowEnabled = 'chat.titleBar.openInAgentsWindow.enabled',

	ChatCustomizationsStructuredPreviewEnabled = 'chat.customizations.structuredPreview.enabled',
	AutopilotAdvancedEnabled = 'chat.autopilot.advanced.enabled',
	PlanReviewInlineEditorEnabled = 'chat.planReview.inlineEditor.enabled',
	DefaultPermissionLevel = 'chat.permissions.default',
	PermissionsSandboxToggleEnabled = 'chat.experimental.permissionsSandboxToggle.enabled',
	DefaultConfiguration = 'chat.defaultConfiguration',
	DefaultModel = 'chat.defaultModel',
	ImageCarouselEnabled = 'imageCarousel.chat.enabled',
	ArtifactsEnabled = 'chat.artifacts.enabled',
	ArtifactsRulesByMimeType = 'chat.artifacts.rules.byMimeType',
	ArtifactsRulesByFilePath = 'chat.artifacts.rules.byFilePath',
	ArtifactsRulesByMemoryFilePath = 'chat.artifacts.rules.byMemoryFilePath',
	ToolConfirmationCarousel = 'chat.tools.confirmationCarousel.enabled',
	ToolRiskAssessmentEnabled = 'chat.tools.riskAssessment.enabled',
	ToolRiskAssessmentModel = 'chat.tools.riskAssessment.model',
	DefaultNewSessionMode = 'chat.newSession.defaultMode',
	CopilotCliHideExtensionHostAgents = 'chat.agents.copilotCli.hideExtensionHost',
	EditorDefaultProvider = 'chat.editor.defaultProvider',
	EditorLocalAgentEnabled = 'chat.editor.localAgent.enabled',
	CopilotCliHideExtensionHostEditor = 'chat.editor.copilotCli.hideExtensionHost',
	AgentsHandoffTipMode = 'chat.agentsHandoffTip.mode',
	TurnStatusPills = 'chat.turnStatusPills',

	IncrementalRendering = 'chat.experimental.incrementalRendering.enabled',
	IncrementalRenderingStyle = 'chat.experimental.incrementalRendering.animationStyle',
	IncrementalRenderingBuffering = 'chat.experimental.incrementalRendering.buffering',

	CollectInstructionsInExtension = 'chat.experimental.collectInstructionsInExtension',
	ImplicitContextActiveEditor = 'chat.implicitContext.includeActiveEditor',
}

/**
 * The "kind" of agents for custom agents.
 */
export enum ChatModeKind {
	Ask = 'ask',
	Edit = 'edit',
	Agent = 'agent'
}

/**
 * The permission level controlling tool auto-approval behavior.
 */
export enum ChatPermissionLevel {
	/** Use existing auto-approve settings */
	Default = 'default',
	/** Auto-approve all tool calls, auto-retry on error */
	AutoApprove = 'autoApprove',
	/** Everything AutoApprove does plus an internal stop hook that continues until the task is done */
	Autopilot = 'autopilot'
}

const chatPermissionLevels = new Set<string>(Object.values(ChatPermissionLevel));

export function isChatPermissionLevel(level: unknown | undefined): level is ChatPermissionLevel {
	return chatPermissionLevels.has(level as string);
}

/**
 * Shape of the {@link ChatConfiguration.DefaultConfiguration}
 * object setting. Controls the starting `mode` and `approvals` for new agent-host
 * sessions (such as Copilot CLI). All properties are optional — a missing property
 * falls back to the per-axis default.
 */
export type AgentSessionMode = 'interactive' | 'plan' | 'autopilot';

export interface IChatDefaultConfiguration {
	/** Starting agent mode: `interactive` / `plan` / `autopilot`. */
	readonly mode?: AgentSessionMode;
	/** Starting approval level: `default` / `autoApprove`. */
	readonly approvals?: ChatPermissionLevel.Default | ChatPermissionLevel.AutoApprove;
}

/**
 * Returns true if the permission level enables auto-approval of all tool calls.
 * Both {@link ChatPermissionLevel.AutoApprove} and {@link ChatPermissionLevel.Autopilot} enable auto-approval.
 */
export function isAutoApproveLevel(level: ChatPermissionLevel | undefined): boolean {
	return level === ChatPermissionLevel.AutoApprove || level === ChatPermissionLevel.Autopilot;
}

/**
 * True for {@link ChatPermissionLevel.Autopilot} only. Unlike {@link isAutoApproveLevel}, this
 * excludes {@link ChatPermissionLevel.AutoApprove}, so it can gate Autopilot-only behavior such as
 * risk-based skipping of tool calls.
 */
export function isAutopilotLevel(level: ChatPermissionLevel | undefined): boolean {
	return level === ChatPermissionLevel.Autopilot;
}

// Thinking display modes for pinned content
export enum ThinkingDisplayMode {
	Collapsed = 'collapsed',
	CollapsedPreview = 'collapsedPreview',
	FixedScrolling = 'fixedScrolling',
}

export enum CollapsedToolsDisplayMode {
	Off = 'off',
	WithThinking = 'withThinking',
	Always = 'always',
}

export enum ChatNotificationMode {
	Off = 'off',
	WindowNotFocused = 'windowNotFocused',
	Always = 'always',
}

export type RawChatParticipantLocation = 'panel' | 'terminal' | 'notebook' | 'editing-session';

export enum ChatAgentLocation {
	/**
	 * This is chat, whether it's in the sidebar, a chat editor, or quick chat.
	 * Leaving the values alone as they are in stored data so we don't have to normalize them.
	 */
	Chat = 'panel',
	Terminal = 'terminal',
	Notebook = 'notebook',
	/**
	 * EditorInline means inline chat in a text editor.
	 */
	EditorInline = 'editor',
}

export namespace ChatAgentLocation {
	export function fromRaw(value: RawChatParticipantLocation | string): ChatAgentLocation {
		switch (value) {
			case 'panel': return ChatAgentLocation.Chat;
			case 'terminal': return ChatAgentLocation.Terminal;
			case 'notebook': return ChatAgentLocation.Notebook;
			case 'editor': return ChatAgentLocation.EditorInline;
		}
		return ChatAgentLocation.Chat;
	}
}

/**
 * List of file schemes that are always unsupported for use in chat
 */
const chatAlwaysUnsupportedFileSchemes = new Set([
	Schemas.vscodeChatEditor,
	Schemas.walkThrough,
	Schemas.vscodeLocalChatSession,
	Schemas.vscodeSettings,
	Schemas.webviewPanel,
	Schemas.vscodeUserData,
	Schemas.extension,
	'ccreq',
	'openai-codex', // Codex session custom editor scheme
]);

export function isSupportedChatFileScheme(accessor: ServicesAccessor, scheme: string): boolean {
	const chatService = accessor.get(IChatSessionsService);

	// Exclude schemes we always know are bad
	if (chatAlwaysUnsupportedFileSchemes.has(scheme)) {
		return false;
	}

	// Plus any schemes used by content providers
	if (chatService.getContentProviderSchemes().includes(scheme)) {
		return false;
	}

	// Everything else is supported
	return true;
}

/**
 * Returns the effective default session type for a new chat in the VS Code
 * editor window, honoring the experimental
 * {@link ChatConfiguration.EditorDefaultProvider} setting:
 * - `'copilotAh'` selects the Agent Host Copilot CLI when its contribution is registered.
 * - `'copilotEh'` selects the Extension Host Copilot CLI when its contribution is
 *   registered and it is not hidden by {@link ChatConfiguration.CopilotCliHideExtensionHostEditor}.
 *
 * Falls back to {@link localChatSessionType} when local is enabled, or when no
 * visible non-local provider is available.
 */
export function getComputedDefaultSessionType(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>
): string {
	const defaultProvider = configurationService.getValue<string>(ChatConfiguration.EditorDefaultProvider);
	const defaultType = getConfiguredEditorDefaultSessionType(defaultProvider);
	if (defaultType === SessionType.AgentHostCopilot && !isEditorLocalAgentEnabled(configurationService)) {
		return defaultType;
	}

	if (defaultType && isVisibleEditorChatSessionType(defaultType, configurationService, chatSessionsService)) {
		return defaultType;
	}

	if (isEditorLocalAgentEnabled(configurationService)) {
		return localChatSessionType;
	}

	return getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService)[0] ?? localChatSessionType;
}

export function getComputedDefaultSessionResource(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>
): URI {
	const defaultType = getComputedDefaultSessionType(configurationService, chatSessionsService);
	return defaultType === localChatSessionType
		? LocalChatSessionUri.getNewSessionUri()
		: URI.from({ scheme: defaultType, path: `/untitled-${generateUuid()}` });
}

export function isRememberedSessionTypeUsable(
	sessionType: string,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>
): boolean {
	if (sessionType === localChatSessionType) {
		return isEditorLocalAgentEnabled(configurationService);
	}
	if (isAgentHostTarget(sessionType)) {
		return true;
	}
	return !!chatSessionsService.getChatSessionContribution(sessionType);
}

export interface IDefaultNewChatSessionTypeOptions {
	readonly explicitOverride?: string;
	readonly currentSessionType?: string;
}

export function getDefaultNewChatSessionType(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	options?: IDefaultNewChatSessionTypeOptions
): string {
	if (options?.explicitOverride) {
		return options.explicitOverride;
	}

	const remembered = getRememberedSessionType(storageService);
	if (remembered && isRememberedSessionTypeUsable(remembered, configurationService, chatSessionsService)) {
		return remembered;
	}

	if (options?.currentSessionType) {
		return options.currentSessionType;
	}

	return getComputedDefaultSessionType(configurationService, chatSessionsService);
}

export function getDefaultNewChatSessionResource(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	options?: IDefaultNewChatSessionTypeOptions
): URI {
	const defaultType = getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, options);
	return defaultType === localChatSessionType
		? LocalChatSessionUri.getNewSessionUri()
		: URI.from({ scheme: defaultType, path: `/untitled-${generateUuid()}` });
}

export function recordUserSelectedSessionType(
	storageService: IStorageService,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	sessionType: string
): void {
	if (sessionType === getComputedDefaultSessionType(configurationService, chatSessionsService)) {
		clearUserSelectedSessionType(storageService);
	} else {
		storeUserSelectedSessionType(storageService, sessionType);
	}
}

export function isEditorLocalAgentEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(ChatConfiguration.EditorLocalAgentEnabled) ?? true;
}

export function isVisibleEditorChatSessionType(
	sessionType: string,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>
): boolean {
	if (sessionType === localChatSessionType) {
		if (!isEditorLocalAgentEnabled(configurationService) && configurationService.getValue<string>(ChatConfiguration.EditorDefaultProvider) === 'copilotAh') {
			return false;
		}
		return isEditorLocalAgentEnabled(configurationService) || getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService).length === 0;
	}

	if (sessionType === SessionType.CopilotCLI && configurationService.getValue<boolean>(ChatConfiguration.CopilotCliHideExtensionHostEditor)) {
		return false;
	}

	return !!chatSessionsService.getChatSessionContribution(sessionType);
}

function getConfiguredEditorDefaultSessionType(defaultProvider: string | undefined): string | undefined {
	switch (defaultProvider) {
		case 'local':
			return localChatSessionType;
		case 'copilotAh':
			return SessionType.AgentHostCopilot;
		case 'copilotEh':
			return SessionType.CopilotCLI;
		default:
			return undefined;
	}
}

function getVisibleNonLocalEditorChatSessionTypes(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>
): string[] {
	const sessionTypes = new Set<string>();
	for (const contribution of chatSessionsService.getAllChatSessionContributions()) {
		if (contribution.type !== localChatSessionType && isVisibleEditorChatSessionType(contribution.type, configurationService, chatSessionsService)) {
			sessionTypes.add(contribution.type);
		}
	}
	return Array.from(sessionTypes);
}

export const MANAGE_CHAT_COMMAND_ID = 'workbench.action.chat.manage';

export const OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID = 'workbench.action.openWorkspaceInAgentsWindow';
export const OPEN_AGENTS_WINDOW_COMMAND_ID = 'workbench.action.openAgentsWindow';
export const OPEN_AGENTS_WINDOW_PRECONDITION = ContextKeyExpr.and(
	ChatEntitlementContextKeys.Setup.hidden.negate(),
	ChatEntitlementContextKeys.Setup.disabledInWorkspace.negate(),
	IsSessionsWindowContext.negate(),
	ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
	IsAuxiliaryWindowContext.negate()
);

export const ChatEditorTitleMaxLength = 30;

export const CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES = 1000;
export const CONTEXT_MODELS_EDITOR = new RawContextKey<boolean>('inModelsEditor', false);
export const CONTEXT_MODELS_SEARCH_FOCUS = new RawContextKey<boolean>('inModelsSearch', false);

/**
 * The built-in general-purpose agent name. When the model uses this name,
 * the subagent inherits the parent's system prompt, model, and tools.
 */
export const GeneralPurposeAgentName = 'General Purpose';
