/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IChatSessionsService, isAgentHostTarget, localChatSessionType, SessionType } from './chatSessionsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { URI } from '../../../../base/common/uri.js';
import { getNewChatSessionResource } from './model/chatUri.js';
import { clearUserSelectedSessionType, getRememberedSessionType, storeUserSelectedSessionType } from './chatSessionTypePreference.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';

export { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';

export const enum BYOKUtilityModelDefault {
	None = 'none',
	MainAgent = 'mainAgent',
	Copilot = 'copilot',
}

export const enum CustomizationMigrationHintMode {
	Never = 'never',
	Once = 'once',
	Always = 'always',
}

export enum ChatConfiguration {
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
	SaveBeforeSend = 'chat.saveBeforeSend',
	AgentStatusEnabled = 'chat.agentsControl.enabled',
	EditorAssociations = 'chat.editorAssociations',
	UnifiedAgentsBar = 'chat.unifiedAgentsBar.enabled',
	AgentSessionProjectionEnabled = 'chat.agentSessionProjection.enabled',
	MigrateLegacyCopilotCliSessions = 'chat.agentSessions.migrateLegacyCopilotCli',
	ShowExternalAgentSessions = 'chat.agentSessions.showExternal',
	ConsolidatedRemoteWorkspaces = 'chat.agentSessions.consolidatedRemoteWorkspaces',
	ExtensionToolsEnabled = 'chat.extensionTools.enabled',
	RepoInfoEnabled = 'chat.repoInfo.enabled',
	EditRequests = 'chat.editRequests',
	PasteAsAttachmentThreshold = 'chat.pasteAsAttachmentThreshold',
	PasteGitHubLinksAsReferences = 'chat.pasteGitHubLinksAsReferences',
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
	TerminalAgentHostEnabled = 'chat.terminal.agentHost.enabled',
	InlineChatAgentHostEnabled = 'chat.inlineChat.agentHost.enabled',
	CollapseCompletedResponses = 'chat.agent.collapseCompletedResponses',
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
	SessionStateIndicatorEnabled = 'chat.experimental.sessionStateIndicator.enabled',
	SubagentToolCustomAgents = 'chat.customAgentInSubagent.enabled',
	SubagentsAllowInvocationsFromSubagents = 'chat.subagents.allowInvocationsFromSubagents',
	SubagentsUseRichRendering = 'chat.subagents.useRichRendering',
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
	ChatCustomizationsUserDataMigrationEnabled = 'chat.customizations.userDataMigration.enabled',
	ChatCustomizationsMigrationHint = 'chat.customizations.migrationHint',
	AutopilotAdvancedEnabled = 'chat.autopilot.advanced.enabled',
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
	EditorPreferCopilotHarness = 'chat.editor.preferCopilotHarness',
	DefaultToCopilotHarness = 'chat.defaultToCopilotHarness',
	EditorLocalAgentEnabled = 'chat.editor.localAgent.enabled',
	AgentsHandoffTipMode = 'chat.agentsHandoffTip.mode',
	TurnStatusPills = 'chat.turnStatusPills',

	IncrementalRendering = 'chat.experimental.incrementalRendering.enabled',
	IncrementalRenderingStyle = 'chat.experimental.incrementalRendering.animationStyle',
	IncrementalRenderingBuffering = 'chat.experimental.incrementalRendering.buffering',
	ExperimentalStickyScrollEnabled = 'chat.experimental.stickyScroll.enabled',
	RichLinks = 'chat.experimental.richLinks.enabled',

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
	Manual = 'manual',
	Assisted = 'assisted',
	AllowAll = 'allowAll',
}

export interface IChatDefaultConfiguration {
	/** Starting agent mode: `interactive` / `plan` / `autopilot`. */
	readonly mode?: AgentSessionMode;
	/** Starting approval level: `manual` / `assisted` / `allowAll`. */
	readonly approvals?: ChatDefaultPermissionLevel;
}

/** Maps a default-configuration value to the internal Agent Host permission level. */
export function getChatPermissionLevelFromDefaultConfiguration(value: unknown): ChatPermissionLevel | undefined {
	switch (value) {
		case ChatDefaultPermissionLevel.Manual:
		case ChatPermissionLevel.Default:
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
	// Chat's own read-only resources, such as a pasted-text artifact: their
	// contents already reach the model through the attachment they belong to.
	Schemas.vscodeChatResponseResource,
	Schemas.walkThrough,
	Schemas.vscodeLocalChatSession,
	Schemas.vscodeSettings,
	Schemas.webviewPanel,
	Schemas.vscodeUserData,
	Schemas.extension,
	'ccreq',
	'openai-codex', // Codex session custom editor scheme
]);

/** Schemes whose models are chat input editors. */
export const chatInputSchemes: readonly string[] = [Schemas.vscodeChatInput, Schemas.sessionsChatInput];

export function isChatInputModel(uri: URI): boolean {
	return chatInputSchemes.includes(uri.scheme);
}

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
 * when the agent host is enabled and either `chat.defaultToCopilotHarness` is opted in or the
 * agent sandbox is enforced by policy, Agent Host Copilot CLI is the default. It falls back to
 * the local harness when enabled, or to the first visible non-local provider.
 */
export function getComputedDefaultSessionType(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	managedSandboxEnforced = false
): string {
	if (isVirtualWorkspace(workspace)) {
		return localChatSessionType;
	}

	if (agentHostEnabled && isCopilotHarnessDefault(configurationService, managedSandboxEnforced)) {
		return SessionType.AgentHostCopilot;
	}

	if (isEditorLocalAgentEnabled(configurationService, workspace, agentHostEnabled && managedSandboxEnforced)) {
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
	return getNewChatSessionResource(defaultType);
}

export function isNewChatSessionTypeUsable(
	sessionType: string,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	agentHostEnabled = true,
	managedSandboxEnforced = false,
): boolean {
	if (sessionType === localChatSessionType) {
		return isEditorLocalAgentEnabled(configurationService, workspace, agentHostEnabled && managedSandboxEnforced);
	}
	if (isAgentHostTarget(sessionType)) {
		return agentHostEnabled;
	}
	return isVisibleEditorChatSessionType(sessionType, configurationService, chatSessionsService, workspace, managedSandboxEnforced);
}

/** Why a new chat session type was selected. */
export type SessionTypeSelectionReason =
	/** A caller explicitly chose the session type. */
	| 'explicitOverride'
	/** The session type was automatically set to Local in a virtual workspace. */
	| 'virtualWorkspace'
	/** The user's last usable session type was restored. */
	| 'rememberedSelection'
	/** The current session's usable type was preserved. */
	| 'currentSession'
	/** The Copilot harness preference replaced a local current session. */
	| 'copilotPreference'
	/** An intended Agent Host session could not be acquired, so Local was used. */
	| 'agentHostUnavailable'
	/** Settings and available capabilities determined the default type. */
	| 'computedDefault';

export function getLocalFallbackSessionTypeSelectionReason(sessionType: string, didAcquireSession: boolean, inheritedReason?: SessionTypeSelectionReason): SessionTypeSelectionReason | undefined {
	return !didAcquireSession && isAgentHostTarget(sessionType) ? 'agentHostUnavailable' : inheritedReason;
}

export interface IDefaultNewChatSessionTypeOptions {
	readonly explicitOverride?: string;
	readonly currentSessionType?: string;
}

export interface IResolvedNewChatSessionType {
	/** The session type to open for the new chat. */
	readonly sessionType: string;
	readonly selectionReason: SessionTypeSelectionReason;
}

export function getDefaultNewChatSessionType(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	options?: IDefaultNewChatSessionTypeOptions,
	managedSandboxEnforced = false
): string {
	return getDefaultNewChatSessionTypeAndReasonFromServices(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options, managedSandboxEnforced).sessionType;
}

export function getDefaultNewChatSessionTypeAndReasonFromServices(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	options?: IDefaultNewChatSessionTypeOptions,
	managedSandboxEnforced = false
): IResolvedNewChatSessionType {
	if (options?.explicitOverride) {
		return { sessionType: options.explicitOverride, selectionReason: 'explicitOverride' };
	}

	if (isVirtualWorkspace(workspace)) {
		return { sessionType: localChatSessionType, selectionReason: 'virtualWorkspace' };
	}

	const preferCopilotHarness = agentHostEnabled && isCopilotHarnessPreferred(configurationService, managedSandboxEnforced);
	const remembered = getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace, agentHostEnabled, managedSandboxEnforced);
	if (remembered && (remembered !== localChatSessionType || !preferCopilotHarness)) {
		return { sessionType: remembered, selectionReason: 'rememberedSelection' };
	}

	let resolved: IResolvedNewChatSessionType;
	if (options?.currentSessionType && isNewChatSessionTypeUsable(options.currentSessionType, configurationService, chatSessionsService, workspace, agentHostEnabled, managedSandboxEnforced)) {
		resolved = { sessionType: options.currentSessionType, selectionReason: 'currentSession' };
	} else if (remembered) {
		resolved = { sessionType: remembered, selectionReason: 'rememberedSelection' };
	} else {
		resolved = {
			sessionType: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled, managedSandboxEnforced),
			selectionReason: 'computedDefault'
		};
	}

	return resolved.sessionType === localChatSessionType && preferCopilotHarness
		? { sessionType: SessionType.AgentHostCopilot, selectionReason: 'copilotPreference' }
		: resolved;
}

export function getDefaultNewChatSessionTypeAndReason(
	accessor: ServicesAccessor,
	options?: IDefaultNewChatSessionTypeOptions
): IResolvedNewChatSessionType {
	const configurationService = accessor.get(IConfigurationService);
	const chatSessionsService = accessor.get(IChatSessionsService);
	const storageService = accessor.get(IStorageService);
	const workspace = accessor.get(IWorkspaceContextService).getWorkspace();
	const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
	const agentHostEnabled = agentHostEnablementService.enabled.get();
	const managedSandboxEnforced = agentHostEnablementService.managedSandboxEnforced.get();

	return getDefaultNewChatSessionTypeAndReasonFromServices(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options, managedSandboxEnforced);
}

function getUsableRememberedSessionType(
	storageService: IStorageService,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	managedSandboxEnforced = false,
): string | undefined {
	const remembered = getRememberedSessionType(storageService);
	return remembered && isNewChatSessionTypeUsable(remembered, configurationService, chatSessionsService, workspace, agentHostEnabled, managedSandboxEnforced) ? remembered : undefined;
}

export function getDefaultNewChatSessionResource(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	options?: IDefaultNewChatSessionTypeOptions,
	managedSandboxEnforced = false
): URI {
	const defaultType = getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options, managedSandboxEnforced);
	return getNewChatSessionResource(defaultType);
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

/**
 * Whether new editor and panel chats should default to the Agent Host Copilot SDK. Enterprises
 * whose managed settings mandate the SDK sandbox floor get this behavior without opting into
 * `chat.defaultToCopilotHarness`.
 */
function isCopilotHarnessDefault(configurationService: IConfigurationService, managedSandboxEnforced = false): boolean {
	return configurationService.getValue<boolean>(ChatConfiguration.DefaultToCopilotHarness) === true
		|| managedSandboxEnforced;
}

/**
 * Whether the Agent Host Copilot SDK replaces the local harness whenever the local harness would
 * otherwise be picked for a new chat. Implied by an enterprise-mandated sandbox floor.
 */
function isCopilotHarnessPreferred(configurationService: IConfigurationService, managedSandboxEnforced = false): boolean {
	return configurationService.getValue<boolean>(ChatConfiguration.EditorPreferCopilotHarness) === true
		|| managedSandboxEnforced;
}

/**
 * Whether the legacy local chat harness is offered. Virtual workspaces always keep it. Outside
 * virtual workspaces, an enterprise-mandated sandbox floor retires it: the sandbox is implemented
 * by the Agent Host, so the enterprise has declared these users governed.
 */
export function isEditorLocalAgentEnabled(configurationService: IConfigurationService, workspace: IWorkspace, managedSandboxEnforced = false): boolean {
	if (isVirtualWorkspace(workspace)) {
		return true;
	}

	if (managedSandboxEnforced) {
		return false;
	}

	return configurationService.getValue<boolean>(ChatConfiguration.EditorLocalAgentEnabled) ?? true;
}

export function isVisibleEditorChatSessionType(
	sessionType: string,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	managedSandboxEnforced = false,
	agentHostEnabled = true
): boolean {
	if (sessionType === localChatSessionType) {
		return isEditorLocalAgentEnabled(configurationService, workspace, agentHostEnabled && managedSandboxEnforced) || getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace).length === 0;
	}

	if (sessionType === SessionType.CopilotCLI) {
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
export const CHAT_SUBAGENT_RESOURCE_QUERY_PARAM = 'subagentChatResource';

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
