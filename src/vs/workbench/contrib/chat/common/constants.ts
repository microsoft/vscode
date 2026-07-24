/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IChatSessionsService, isAgentHostTarget, localChatSessionType, SessionType } from './chatSessionsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspace } from '../../../../platform/workspace/common/workspace.js';
import { isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { LocalChatSessionUri } from './model/chatUri.js';
import { clearUserSelectedSessionType, getRememberedSessionType, hasPreferredCopilotHarness, storeUserSelectedSessionType } from './chatSessionTypePreference.js';

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
	Verbose = 'chat.verbose',
	ProgressBorder = 'chat.progressBorder.enabled',
	SubagentToolCustomAgents = 'chat.customAgentInSubagent.enabled',
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
	ChatCustomizationsPromptMigrationEnabled = 'chat.customizations.promptMigration.enabled',
	AutopilotAdvancedEnabled = 'chat.autopilot.advanced.enabled',
	PlanReviewInlineEditorEnabled = 'chat.planReview.inlineEditor.enabled',
	DefaultPermissionLevel = 'chat.permissions.default',
	AssistedPermissionsEnabled = 'chat.assistedPermissions.enabled',
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
	EditorPreferCopilotHarness = 'chat.editor.preferCopilotHarness',
	DefaultToCopilotHarness = 'chat.defaultToCopilotHarness',
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
	/** Delegate approval decisions to a model */
	Assisted = 'assisted',
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

/** Approval values exposed by the `chat.defaultConfiguration` setting. */
export enum ChatDefaultPermissionLevel {
	Default = 'default',
	Assisted = 'assisted',
	AllowAll = 'allowAll',
}

export interface IChatDefaultConfiguration {
	/** Starting agent mode: `interactive` / `plan` / `autopilot`. */
	readonly mode?: AgentSessionMode;
	/** Starting approval level: `default` / `assisted` / `allowAll`. */
	readonly approvals?: ChatDefaultPermissionLevel;
}

/** Maps a default-configuration value to the internal Agent Host permission level. */
export function getChatPermissionLevelFromDefaultConfiguration(value: unknown): ChatPermissionLevel | undefined {
	switch (value) {
		case ChatDefaultPermissionLevel.Default:
			return ChatPermissionLevel.Default;
		case ChatDefaultPermissionLevel.Assisted:
			return ChatPermissionLevel.Assisted;
		case ChatDefaultPermissionLevel.AllowAll:
		case ChatPermissionLevel.AutoApprove:
			return ChatPermissionLevel.AutoApprove;
		default:
			return undefined;
	}
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
 * editor window.
 *
 * Virtual workspaces always default to {@link localChatSessionType}. Otherwise,
 * when the agent host is enabled and `chat.defaultToCopilotHarness` is opted in,
 * Agent Host Copilot CLI is the default. It falls back to the local harness
 * when enabled, or to the first visible non-local provider.
 */
export function getComputedDefaultSessionType(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	agentHostEnabled: boolean
): string {
	if (isVirtualWorkspace(workspace)) {
		return localChatSessionType;
	}

	if (agentHostEnabled && configurationService.getValue<boolean>(ChatConfiguration.DefaultToCopilotHarness)) {
		return SessionType.AgentHostCopilot;
	}

	if (isEditorLocalAgentEnabled(configurationService, workspace)) {
		return localChatSessionType;
	}

	return getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace)[0] ?? localChatSessionType;
}

export function getComputedDefaultSessionResource(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	agentHostEnabled: boolean
): URI {
	const defaultType = getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled);
	return defaultType === localChatSessionType
		? LocalChatSessionUri.getNewSessionUri()
		: URI.from({ scheme: defaultType, path: `/untitled-${generateUuid()}` });
}

export function isRememberedSessionTypeUsable(
	sessionType: string,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace
): boolean {
	if (sessionType === localChatSessionType) {
		return isEditorLocalAgentEnabled(configurationService, workspace);
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

export interface IResolvedNewChatSessionType {
	/** The session type to open for the new chat. */
	readonly sessionType: string;
	/**
	 * True when {@link sessionType} is the one-time `chat.editor.preferCopilotHarness`
	 * swap. The caller must persist the marker (via `markPreferredCopilotHarness`)
	 * only once it has actually applied this session type, so the migration is not
	 * consumed by a caller that discards the result.
	 */
	readonly isPreferCopilotHarnessSwap: boolean;
}

export function getDefaultNewChatSessionType(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	options?: IDefaultNewChatSessionTypeOptions
): string {
	if (options?.explicitOverride) {
		return options.explicitOverride;
	}

	const remembered = getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace);
	if (remembered) {
		return remembered;
	}

	if (options?.currentSessionType) {
		return options.currentSessionType;
	}

	return getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled);
}

export function resolveDefaultNewChatSessionType(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	options?: IDefaultNewChatSessionTypeOptions
): IResolvedNewChatSessionType {
	if (options?.explicitOverride) {
		return { sessionType: options.explicitOverride, isPreferCopilotHarnessSwap: false };
	}

	const remembered = getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace);
	if (remembered && remembered !== localChatSessionType) {
		return { sessionType: remembered, isPreferCopilotHarnessSwap: false };
	}

	// One-time migration: when the agent host is enabled and the user has opted
	// in via `chat.editor.preferCopilotHarness`, swap an existing local editor
	// session to Copilot exactly once (guarded by the persisted marker). Never
	// swap when the agent host is disabled, since the Copilot harness would be
	// unavailable. This function does not persist the marker itself; the caller
	// marks it only after applying the swap, so a caller that discards the
	// result does not consume the one-time migration.
	if (options?.currentSessionType === localChatSessionType
		&& agentHostEnabled
		&& configurationService.getValue<boolean>(ChatConfiguration.EditorPreferCopilotHarness)
		&& !hasPreferredCopilotHarness(storageService)) {
		return { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true };
	}

	return { sessionType: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options), isPreferCopilotHarnessSwap: false };
}

function getUsableRememberedSessionType(
	storageService: IStorageService,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace
): string | undefined {
	const remembered = getRememberedSessionType(storageService);
	return remembered && isRememberedSessionTypeUsable(remembered, configurationService, chatSessionsService, workspace) ? remembered : undefined;
}

export function getDefaultNewChatSessionResource(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	options?: IDefaultNewChatSessionTypeOptions
): URI {
	const defaultType = getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options);
	return defaultType === localChatSessionType
		? LocalChatSessionUri.getNewSessionUri()
		: URI.from({ scheme: defaultType, path: `/untitled-${generateUuid()}` });
}

export function recordUserSelectedSessionType(
	storageService: IStorageService,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	sessionType: string,
	agentHostEnabled: boolean
): void {
	if (sessionType === getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled)) {
		clearUserSelectedSessionType(storageService);
	} else {
		storeUserSelectedSessionType(storageService, sessionType);
	}
}

export function isEditorLocalAgentEnabled(configurationService: IConfigurationService, workspace: IWorkspace): boolean {
	return isVirtualWorkspace(workspace) || (configurationService.getValue<boolean>(ChatConfiguration.EditorLocalAgentEnabled) ?? true);
}

export function isVisibleEditorChatSessionType(
	sessionType: string,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace
): boolean {
	if (sessionType === localChatSessionType) {
		return isEditorLocalAgentEnabled(configurationService, workspace) || getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace).length === 0;
	}

	if (sessionType === SessionType.CopilotCLI && configurationService.getValue<boolean>(ChatConfiguration.CopilotCliHideExtensionHostEditor)) {
		return false;
	}

	return !!chatSessionsService.getChatSessionContribution(sessionType);
}

function getVisibleNonLocalEditorChatSessionTypes(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace
): string[] {
	const sessionTypes = new Set<string>();
	for (const contribution of chatSessionsService.getAllChatSessionContributions()) {
		if (contribution.type !== localChatSessionType && isVisibleEditorChatSessionType(contribution.type, configurationService, chatSessionsService, workspace)) {
			sessionTypes.add(contribution.type);
		}
	}
	return Array.from(sessionTypes);
}

export const MANAGE_CHAT_COMMAND_ID = 'workbench.action.chat.manage';
export const CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID = 'workbench.action.chat.openAgentHostChat';

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
