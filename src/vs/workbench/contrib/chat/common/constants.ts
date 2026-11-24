/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IChatSessionsService, isAgentHostTarget, isRemoteAgentHostTarget, localChatSessionType, SessionType } from './chatSessionsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { hasVirtualWorkspaceContent, isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandMetadata } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { URI } from '../../../../base/common/uri.js';
import { getChatSessionType, getNewChatSessionResource } from './model/chatUri.js';
import { clearUserSelectedSessionType, getRememberedSessionType, storeUserSelectedSessionType } from './chatSessionTypePreference.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { isLocalAgentHostProviderDisabledByPolicy } from '../../../../platform/agentHost/common/agentService.js';
import { requiresCopilotAgentHost, IManagedSettingsService, isTemporaryDefaultToLocalHarnessEnabled } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { localize } from '../../../../nls.js';
import { ILocalChatAvailabilityService } from './localChatAvailability.js';

export function managedPolicyRequiresAgentHostMessage(): string {
	return localize('chat.managedPolicy.requireAgentHost', "Your organization requires the new Copilot experience. Move to Copilot to keep your conversation. If Copilot cannot start, try again or contact your administrator. Your original conversation is still available.");
}

/**
 * Why a new chat does not start as a local chat while a feature hides local chats ({@link ILocalChatAvailabilityService}):
 * no agent is available yet (`unavailable`), or its session type failed to start (`failed`).
 */
export function localChatHiddenMessage(reason: 'unavailable' | 'failed'): string {
	return reason === 'unavailable'
		? localize('chat.localChatHidden.unavailable', "No agent is available to start a chat yet. Try again once an agent is available.")
		: localize('chat.localChatHidden.failed', "The chat could not start. Try again or choose another available agent.");
}

/**
 * Why a new chat cannot fall back to a local chat, such as once its session type could not start: an organization that
 * requires the new Copilot experience, or a feature that hides local chats, outside the exceptions of
 * {@link isEditorLocalAgentEnabled}. Undefined where it can.
 */
export function getLocalChatFallbackRefusal(configurationService: IConfigurationService, workspace: IWorkspace, managedPolicyRequiresAgentHost: boolean, localChatHidden: boolean, reason: 'unavailable' | 'failed' = 'failed'): string | undefined {
	if (managedPolicyRequiresAgentHost) {
		return managedPolicyRequiresAgentHostMessage();
	}
	if (localChatHidden && !isLocalChatExemptFromHiding(configurationService, workspace)) {
		return localChatHiddenMessage(reason);
	}
	return undefined;
}

export function isLocalChatSessionSubjectToManagedPolicy(sessionResource: URI, location: ChatAgentLocation): boolean {
	// Preserve editor inline chat's limited read/edit flow; full Local agent sessions still require the runtime.
	return location !== ChatAgentLocation.EditorInline && getChatSessionType(sessionResource) === localChatSessionType;
}

export const CONTINUE_CHAT_IN_COPILOT_ACTION_ID = 'workbench.action.chat.continueInCopilot';
export const CONTINUE_AGENT_HOST_CHAT_IN_COPILOT_ACTION_ID = 'workbench.action.chat.continueAgentHostChatInCopilot';

export { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';

export const enum BYOKUtilityModelDefault {
	None = 'none',
	MainAgent = 'mainAgent',
	Copilot = 'copilot',
}

/** Where a session opens when selected in the sessions of the Chat view: {@link ChatConfiguration.ChatViewSessionsOpenChatIn}. */
export enum ChatViewSessionsOpenChatIn {
	ChatPanel = 'chatPanel',
	ChatArea = 'chatArea',
	EditorArea = 'editorArea',
}

export enum ChatConfiguration {
	PluginsEnabled = 'chat.plugins.enabled',
	PluginLocations = 'chat.pluginLocations',
	PluginMarketplaces = 'chat.plugins.marketplaces',
	ExtraMarketplaces = 'chat.plugins.extraMarketplaces',
	EnabledPlugins = 'chat.plugins.enabledPlugins',
	AgentEnabled = 'chat.agent.enabled',
	HooksShowWarnings = 'chat.hooks.showWarnings',
	ChatViewSessionsListEnabled = 'chat.viewSessions.sessionsList.enabled',
	AgentsPickerInAttachContextMenu = 'sessions.chat.experimental.agentsPickerInAttachContextMenu',
	/** Desktop only: lets chat attach a screenshot of the window of another app. */
	AppWindowScreenshotsEnabled = 'chat.appWindowScreenshots.enabled',
	/**
	 * Lets an editor window with one local folder move that folder between its own location and the worktrees its agent
	 * host sessions work in, following the chat that the user opens.
	 */
	EditorWindowEnableWorktree = 'chat.editorWindow.enableWorktree',
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
	ShowExternalAgentSessions = 'chat.agentSessions.showExternal',
	AutoMarkAsDoneMergedSessionsAfterDays = 'chat.agentSessions.autoMarkAsDoneMergedSessionsAfterDays',
	AutoDeleteMarkedAsDoneMergedSessionsAfterDays = 'chat.agentSessions.autoDeleteMarkedAsDoneMergedSessionsAfterDays',
	ExtensionToolsEnabled = 'chat.extensionTools.enabled',
	RepoInfoEnabled = 'chat.repoInfo.enabled',
	EditRequests = 'chat.editRequests',
	PasteAsAttachmentThreshold = 'chat.pasteAsAttachmentThreshold',
	InlineReferencesStyle = 'chat.inlineReferences.style',
	InlineAttachmentsEnabled = 'chat.inlineAttachments.enabled',
	AutoReply = 'chat.autoReply',
	GlobalAutoApprove = 'chat.tools.global.autoApprove',
	AssistedPermissionsInstructions = 'chat.permissions.assisted.instructions',
	AutoApproveEdits = 'chat.tools.edits.autoApprove',
	AutoApprovedUrls = 'chat.tools.urls.autoApprove',
	EligibleForAutoApproval = 'chat.tools.eligibleForAutoApproval',
	EnableMath = 'chat.math.enabled',
	HtmlPreviewEnabled = 'chat.htmlPreview.enabled',
	NativeComponentsEnabled = 'chat.nativeComponents.enabled',
	CheckpointsEnabled = 'chat.checkpoints.enabled',
	ThinkingStyle = 'chat.agent.thinkingStyle',
	ThinkingGenerateTitles = 'chat.agent.thinking.generateTitles',
	TerminalToolsInThinking = 'chat.agent.thinking.terminalTools',
	TerminalAgentHostEnabled = 'chat.terminal.agentHost.enabled',
	InlineChatAgentHostEnabled = 'chat.inlineChat.agentHost.enabled',
	CollapseCompletedResponses = 'chat.agent.collapseCompletedResponses',
	SimpleTerminalCollapsible = 'chat.tools.terminal.simpleCollapsible',
	TerminalOutputReflow = 'chat.tools.terminal.outputReflow',
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
	ChatViewSessionsOpenChatIn = 'chat.viewSessions.openChatIn',
	ChatViewProgressBadgeEnabled = 'chat.viewProgressBadge.enabled',
	ChatContextUsageEnabled = 'chat.contextUsage.enabled',
	Verbose = 'chat.verbose',
	ResponseStats = 'chat.responseStats',
	ResponseStatsTokens = 'chat.responseStatsTokens',
	ProgressBorder = 'chat.progressBorder.enabled',
	PersistentProgress = 'chat.persistentProgress',
	PersistentProgressVerbosity = 'chat.persistentProgressVerbosity',
	SessionStateIndicatorEnabled = 'chat.experimental.sessionStateIndicator.enabled',
	SubagentToolCustomAgents = 'chat.customAgentInSubagent.enabled',
	SubagentsAllowInvocationsFromSubagents = 'chat.subagents.allowInvocationsFromSubagents',
	SubagentsShowCreditUsage = 'chat.subagents.showCreditUsage',
	ShowCodeBlockProgressAnimation = 'chat.agent.codeBlockProgress',
	RestoreLastPanelSession = 'chat.restoreLastPanelSession',
	ExitAfterDelegation = 'chat.exitAfterDelegation',
	ExplainChangesEnabled = 'chat.editing.explainChanges.enabled',
	RevealNextChangeOnResolve = 'chat.editing.revealNextChangeOnResolve',
	OpenChangedFileInDiffEditor = 'chat.editing.openChangedFileInDiffEditor',
	EditorWorkingSetEnabled = 'chat.editor.workingSet.enabled',
	GrowthNotificationEnabled = 'chat.growthNotification.enabled',
	ChatClosedPromoNotification = 'chat.closedPromoNotification',
	TitleBarSignInEnabled = 'chat.titleBar.signIn.enabled',
	WelcomePageSignInEnabled = 'chat.welcomePage.signIn.enabled',
	WelcomePageSignInStyle = 'chat.welcomePage.signIn.style',
	WelcomePageAgentsWindowGraphic = 'chat.welcomePage.agentsWindowGraphic',
	WelcomePageAgentsWindowSectionStyle = 'chat.welcomePage.agentsWindowSectionStyle',
	WelcomePageCardSurface = 'chat.welcomePage.cardSurface',
	TitleBarOpenInAgentsWindowEnabled = 'chat.titleBar.openInAgentsWindow.enabled',
	OpenInAgentsWindowTransferDraft = 'chat.experimental.openInAgentsWindow.transferDraft',
	AgentsParallelWorkBannerEnabled = 'chat.agentsParallelWorkBanner.enabled',
	AgentsWindowBannerEnabled = 'chat.agentsWindowBanner.enabled',
	AgentsWindowBannerDeveloperMode = 'chat.agentsWindowBanner.developerMode',
	AgentsWindowBannerRevealCurrentSession = 'chat.agentsWindowBanner.revealCurrentSession',
	CopilotHarnessIntroductionMode = 'chat.copilotHarnessIntroduction.mode',
	HarnessSwitchFeedbackSurveyEnabled = 'chat.harnessSwitchFeedbackSurvey.enabled',

	ChatCustomizationsStructuredPreviewEnabled = 'chat.customizations.structuredPreview.enabled',
	ChatCustomizationsLocation = 'chat.customizations.location',
	ChatCustomizationsToggleStyle = 'chat.experimental.customizations.toggleStyle',
	ChatCustomizationsPromptMigrationEnabled = 'chat.customizations.promptMigration.enabled',
	ChatCustomizationsUserDataMigrationEnabled = 'chat.customizations.userDataMigration.enabled',
	ChatCustomizationsLocationsMigrationEnabled = 'chat.customizations.locationsMigration.enabled',
	ChatCustomizationsMcpServerMigrationEnabled = 'chat.customizations.mcpServerMigration.enabled',
	ChatCustomizationsMigrationEnabled = 'chat.customizations.migration.enabled',
	AutopilotAdvancedEnabled = 'chat.autopilot.advanced.enabled',
	DefaultPermissionLevel = 'chat.permissions.default',
	ExperimentalModePermissionsPicker = 'chat.experimentalModePermissionsPicker',
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
	AgentHostDebugLogsDefaultExportLocation = 'chat.agentHost.debugLogs.defaultExportLocation',
	EditorPreferCopilotHarness = 'chat.editor.preferCopilotHarness',
	DefaultToCopilotHarness = 'chat.defaultToCopilotHarness',
	TemporaryDefaultToLocalHarness = 'chat.temporaryDefaultToLocalHarness',
	EditorLocalAgentEnabled = 'chat.editor.localAgent.enabled',
	AgentsHandoffTipMode = 'chat.agentsHandoffTip.mode',
	AgentsHandoffTipDelaySeconds = 'chat.agentsHandoffTip.delaySeconds',
	BtwTipEnabled = 'chat.btwTip.enabled',
	AutomateTipEnabled = 'chat.automateTip.enabled',
	SendInBackgroundTipEnabled = 'chat.sendInBackgroundTip.enabled',
	CopilotCliCommandEnabled = 'chat.copilotCliCommand.enabled',

	IncrementalRendering = 'chat.experimental.incrementalRendering.enabled',
	IncrementalRenderingStyle = 'chat.experimental.incrementalRendering.animationStyle',
	IncrementalRenderingBuffering = 'chat.experimental.incrementalRendering.buffering',
	ExperimentalStickyScrollEnabled = 'chat.experimental.stickyScroll.enabled',
	RichLinks = 'chat.experimental.richLinks.enabled',

	CollectInstructionsInExtension = 'chat.experimental.collectInstructionsInExtension',
	ImplicitContextActiveEditor = 'chat.implicitContext.includeActiveEditor',
}

export const CHAT_ATTACH_CONTEXT_ACTION_ID = 'workbench.action.chat.attachContext';

export const enum CopilotHarnessIntroductionMode {
	Off = 'off',
	NewSession = 'newSession',
	AfterRequest = 'afterRequest',
}

export function getCopilotHarnessIntroductionMode(configurationService: IConfigurationService): CopilotHarnessIntroductionMode {
	const mode = configurationService.getValue<CopilotHarnessIntroductionMode>(ChatConfiguration.CopilotHarnessIntroductionMode);
	return mode === CopilotHarnessIntroductionMode.NewSession || mode === CopilotHarnessIntroductionMode.AfterRequest
		? mode
		: CopilotHarnessIntroductionMode.Off;
}

export const enum ChatClosedPromoNotification {
	None = 'none',
	CopilotIconPopup = 'copilotIconPopup',
}

/** How the Welcome page asks signed-out users to sign in with GitHub. */
export const enum WelcomeSignInStyle {
	/** A button at the bottom of the page. The default. */
	Button = 'button',
	/** A card at the bottom of the page that lists what GitHub Copilot does once signed in. */
	CopilotCard = 'copilotCard',
	/** A card at the bottom of the page that lists what working with GitHub brings: pull requests, issues, repositories and Copilot. */
	GitHubCard = 'githubCard',
	/** A card at the bottom of the page that sums up what signing in brings in one sentence. */
	CompactCard = 'compactCard',
}

/** Reads the sign-in style, falling back to the setting's default, {@link WelcomeSignInStyle.Button}. */
export function getWelcomeSignInStyle(configurationService: IConfigurationService): WelcomeSignInStyle {
	const style = configurationService.getValue<WelcomeSignInStyle>(ChatConfiguration.WelcomePageSignInStyle);
	switch (style) {
		case WelcomeSignInStyle.CopilotCard:
		case WelcomeSignInStyle.GitHubCard:
		case WelcomeSignInStyle.CompactCard:
			return style;
		default:
			return WelcomeSignInStyle.Button;
	}
}

/** The graphic that explains the Agents window on the Welcome page. */
export const enum AgentsWindowGraphicVariant {
	None = 'none',
	/** The editor window and the Agents window side by side, above the Agents window button. */
	WindowComparison = 'windowComparison',
	/** A banner at the top of the page that describes the Agents window next to a drawing of it, with a button that opens it. */
	Banner = 'banner',
}

export function getAgentsWindowGraphicVariant(configurationService: IConfigurationService): AgentsWindowGraphicVariant {
	const variant = configurationService.getValue<AgentsWindowGraphicVariant>(ChatConfiguration.WelcomePageAgentsWindowGraphic);
	switch (variant) {
		case AgentsWindowGraphicVariant.WindowComparison:
		case AgentsWindowGraphicVariant.Banner:
			return variant;
		default:
			return AgentsWindowGraphicVariant.None;
	}
}

/**
 * How the {@link AgentsWindowGraphicVariant.WindowComparison} graphic, its captions and the Agents window button are set apart
 * from the rest of the Welcome page. The {@link AgentsWindowGraphicVariant.Banner} sets itself apart.
 */
export const enum AgentsWindowSectionStyle {
	None = 'none',
	/** A subtle surface around the section, like the walkthrough tiles. */
	Card = 'card',
	/** A subtle border around the section. The default. */
	Outline = 'outline',
	/** A surface tinted with the accent color around the section. */
	Tint = 'tint',
	/** A subtle surface across the width of the page's content. */
	Band = 'band',
	/** Lines across the width of the page's content above and below the section. */
	Separator = 'separator',
}

/** Reads the section style, falling back to the setting's default, {@link AgentsWindowSectionStyle.Outline}. */
export function getAgentsWindowSectionStyle(configurationService: IConfigurationService): AgentsWindowSectionStyle {
	const style = configurationService.getValue<AgentsWindowSectionStyle>(ChatConfiguration.WelcomePageAgentsWindowSectionStyle);
	switch (style) {
		case AgentsWindowSectionStyle.None:
		case AgentsWindowSectionStyle.Card:
		case AgentsWindowSectionStyle.Outline:
		case AgentsWindowSectionStyle.Tint:
		case AgentsWindowSectionStyle.Band:
		case AgentsWindowSectionStyle.Separator:
			return style;
		default:
			return AgentsWindowSectionStyle.Outline;
	}
}

/** The surface of the Welcome page's cards that promote a feature, such as the {@link AgentsWindowGraphicVariant.Banner}. */
export const enum WelcomePageCardSurface {
	/** The walkthrough tiles' surface. The default. */
	Neutral = 'neutral',
	/** A surface tinted with the accent color. */
	Tint = 'tint',
}

/** Reads the card surface, falling back to the setting's default, {@link WelcomePageCardSurface.Neutral}. */
export function getWelcomePageCardSurface(configurationService: IConfigurationService): WelcomePageCardSurface {
	return configurationService.getValue<WelcomePageCardSurface>(ChatConfiguration.WelcomePageCardSurface) === WelcomePageCardSurface.Tint
		? WelcomePageCardSurface.Tint
		: WelcomePageCardSurface.Neutral;
}

export const AGENT_SESSION_CLEANUP_SETTINGS_TAG = 'agentSessionCleanup';
export const DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS = 5;

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

export enum ChatProgressAnimation {
	Off = 'off',
	Draw = 'draw',
	DrawMonochrome = 'drawMonochrome',
	DrawMonochromeNoIcon = 'drawMonochromeNoIcon',
}

export enum ChatProgressVerbosity {
	Verbose = 'verbose',
	Compact = 'compact',
	Conversation = 'conversation',
}

/** Whether, and where, a running response's working time and output speed show. */
export enum ChatResponseStats {
	Off = 'off',
	Title = 'title',
	/** In the working progress indicator, in place of its phrase. */
	Progress = 'progress',
	/** In the working progress indicator, after its phrase, which then changes periodically. */
	ProgressWithMessage = 'progressWithMessage',
}

/** How a running response's stats report its output tokens. */
export enum ChatResponseStatsTokens {
	/** The output speed of the latest model call. */
	Speed = 'speed',
	/** The output tokens of the response so far. */
	Count = 'count',
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
 * When the agent host is enabled and either `chat.defaultToCopilotHarness` is enabled or the
 * agent sandbox is enforced by policy, Agent Host Copilot CLI is the default. It falls back to
 * the local harness when enabled, or to the first visible non-local provider.
 */
export function getComputedDefaultSessionType(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	managedSandboxEnforced = false,
	managedPolicyRequiresAgentHost = false,
	localChatHidden = false
): string {
	if (managedPolicyRequiresAgentHost) {
		return SessionType.AgentHostCopilot;
	}

	if (agentHostEnabled && isCopilotHarnessDefault(configurationService, managedSandboxEnforced)) {
		return SessionType.AgentHostCopilot;
	}

	if (isEditorLocalAgentEnabled(configurationService, workspace, agentHostEnabled && managedSandboxEnforced, localChatHidden)) {
		return localChatSessionType;
	}

	// Without another session type, a new chat is local, unless a feature hides local chats: then it is Copilot, which reports
	// when it cannot start rather than a local chat starting in its place
	return getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace)[0]
		?? (localChatHidden && !isLocalChatExemptFromHiding(configurationService, workspace) ? SessionType.AgentHostCopilot : localChatSessionType);
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
	managedPolicyRequiresAgentHost = false,
	localChatHidden = false,
): boolean {
	if (managedPolicyRequiresAgentHost && sessionType === localChatSessionType) {
		return false;
	}
	const contribution = chatSessionsService.getChatSessionContribution(sessionType);
	if (contribution?.hideFromSessionTypePicker) {
		return false;
	}
	if (sessionType === localChatSessionType) {
		return isEditorLocalAgentEnabled(configurationService, workspace, agentHostEnabled && managedSandboxEnforced, localChatHidden);
	}
	if (isAgentHostTarget(sessionType)) {
		// Remote agent hosts are per-window; require that this window registered the host's contribution.
		return agentHostEnabled
			&& (!isRemoteAgentHostTarget(sessionType) || !!contribution)
			&& !isLocalAgentHostSessionTypeDisabledByPolicy(sessionType, configurationService)
			// In workspaces with virtual folders, defer to contribution visibility for non-Copilot harnesses.
			&& (!!contribution || !sessionType.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX) || sessionType === SessionType.AgentHostCopilot || !hasVirtualWorkspaceContent(workspace));
	}
	return isVisibleEditorChatSessionType(sessionType, configurationService, chatSessionsService, workspace, managedSandboxEnforced);
}

/**
 * Whether the session type belongs to a local Agent Host provider (Claude or Codex) that policy
 * disables. Saved chats of such a provider stay readable, but it cannot start new chats, so new-chat
 * resolution must not select it.
 */
export function isLocalAgentHostSessionTypeDisabledByPolicy(sessionType: string, configurationService: IConfigurationService): boolean {
	return sessionType.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX)
		&& isLocalAgentHostProviderDisabledByPolicy(sessionType.slice(LOCAL_AGENT_HOST_SCHEME_PREFIX.length), configurationService);
}

/** Why a new chat session type was selected. */
export type SessionTypeSelectionReason =
	/** A caller explicitly chose the session type. */
	| 'explicitOverride'
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
	/** Whether a feature hides new local chats ({@link ILocalChatAvailabilityService}), as if the setting turned them off. */
	readonly localChatHidden?: boolean;
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
	managedSandboxEnforced = false,
	managedPolicyRequiresAgentHost = false
): string {
	return getDefaultNewChatSessionTypeAndReasonFromServices(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options, managedSandboxEnforced, managedPolicyRequiresAgentHost).sessionType;
}

export function getDefaultNewChatSessionTypeAndReasonFromServices(
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	storageService: IStorageService,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	options?: IDefaultNewChatSessionTypeOptions,
	managedSandboxEnforced = false,
	managedPolicyRequiresAgentHost = false
): IResolvedNewChatSessionType {
	// A harness disabled by policy can only show saved chats read-only, so an explicit request for
	// it falls through to the regular resolution instead of opening an unusable new chat. So does
	// the retired extension-host Copilot CLI, which can no longer start a chat.
	const explicitOverride = options?.explicitOverride && options.explicitOverride !== SessionType.CopilotCLI && !isLocalAgentHostSessionTypeDisabledByPolicy(options.explicitOverride, configurationService) ? options.explicitOverride : undefined;
	if (managedPolicyRequiresAgentHost && (!explicitOverride || explicitOverride === localChatSessionType)) {
		return { sessionType: SessionType.AgentHostCopilot, selectionReason: 'copilotPreference' };
	}
	if (explicitOverride) {
		return { sessionType: explicitOverride, selectionReason: 'explicitOverride' };
	}

	const preferCopilotHarness = agentHostEnabled && isCopilotHarnessPreferred(configurationService, managedSandboxEnforced);
	const localChatHidden = options?.localChatHidden ?? false;
	const remembered = getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace, agentHostEnabled, managedSandboxEnforced, localChatHidden);
	if (remembered && (remembered !== localChatSessionType || !preferCopilotHarness)) {
		return { sessionType: remembered, selectionReason: 'rememberedSelection' };
	}

	let resolved: IResolvedNewChatSessionType;
	if (options?.currentSessionType && isNewChatSessionTypeUsable(options.currentSessionType, configurationService, chatSessionsService, workspace, agentHostEnabled, managedSandboxEnforced, false, localChatHidden)) {
		resolved = { sessionType: options.currentSessionType, selectionReason: 'currentSession' };
	} else if (remembered) {
		resolved = { sessionType: remembered, selectionReason: 'rememberedSelection' };
	} else {
		resolved = {
			sessionType: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled, managedSandboxEnforced, false, localChatHidden),
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

	const localChatHidden = options?.localChatHidden ?? accessor.get(ILocalChatAvailabilityService).hidden.get();

	return getDefaultNewChatSessionTypeAndReasonFromServices(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, { ...options, localChatHidden }, managedSandboxEnforced, requiresCopilotAgentHost(accessor.get(IManagedSettingsService), configurationService));
}

function getUsableRememberedSessionType(
	storageService: IStorageService,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	agentHostEnabled: boolean,
	managedSandboxEnforced = false,
	localChatHidden = false,
): string | undefined {
	const remembered = getRememberedSessionType(storageService);
	return remembered && isNewChatSessionTypeUsable(remembered, configurationService, chatSessionsService, workspace, agentHostEnabled, managedSandboxEnforced, false, localChatHidden) ? remembered : undefined;
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
	agentHostEnabled: boolean,
	localChatHidden = false
): void {
	// The default as the picker shows it, also while a feature hides new local chats, as the setting off would
	if (sessionType === getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled, false, false, localChatHidden)) {
		clearUserSelectedSessionType(storageService);
	} else {
		storeUserSelectedSessionType(storageService, sessionType);
	}
}

/**
 * Whether new editor and panel chats should default to the Agent Host Copilot SDK. Enterprises
 * whose managed settings mandate the SDK sandbox floor get this behavior regardless of
 * `chat.defaultToCopilotHarness`.
 */
function isCopilotHarnessDefault(configurationService: IConfigurationService, managedSandboxEnforced = false): boolean {
	return !isTemporaryDefaultToLocalHarnessEnabled(configurationService)
		&& (configurationService.getValue<boolean>(ChatConfiguration.DefaultToCopilotHarness) === true || managedSandboxEnforced);
}

/**
 * Whether the Agent Host Copilot SDK replaces the local harness whenever the local harness would
 * otherwise be picked for a new chat. Implied by an enterprise-mandated sandbox floor.
 */
function isCopilotHarnessPreferred(configurationService: IConfigurationService, managedSandboxEnforced = false): boolean {
	return !isTemporaryDefaultToLocalHarnessEnabled(configurationService)
		&& (configurationService.getValue<boolean>(ChatConfiguration.EditorPreferCopilotHarness) === true || managedSandboxEnforced);
}

/**
 * Whether the legacy local chat harness is enabled. Virtual workspaces always keep it. Outside
 * virtual workspaces, an enterprise-mandated sandbox floor disables it: the sandbox is implemented
 * by the Agent Host, so the enterprise has declared these users governed.
 *
 * A feature that hides local chats (`localChatHidden`, see `ILocalChatAvailabilityService`) turns
 * them off, also as the fallback of a new chat, except for the documented exceptions of
 * {@link isLocalChatExemptFromHiding}: virtual workspaces, and the managed policy that keeps
 * local chat the default.
 */
export function isEditorLocalAgentEnabled(configurationService: IConfigurationService, workspace: IWorkspace, managedSandboxEnforced = false, localChatHidden = false): boolean {
	if (isVirtualWorkspace(workspace) || isTemporaryDefaultToLocalHarnessEnabled(configurationService)) {
		return true;
	}

	if (managedSandboxEnforced) {
		return false;
	}

	// A feature that hides new local chats turns them off as the setting does, leaving the setting as it is
	return !localChatHidden && (configurationService.getValue<boolean>(ChatConfiguration.EditorLocalAgentEnabled) ?? true);
}

/**
 * Whether local chats stay available while a feature hides them: in virtual workspaces, whose files only local chat and
 * Copilot work on, and while the managed policy keeps local chat the default of new chats.
 */
function isLocalChatExemptFromHiding(configurationService: IConfigurationService, workspace: IWorkspace): boolean {
	return isVirtualWorkspace(workspace) || isTemporaryDefaultToLocalHarnessEnabled(configurationService);
}

export function isVisibleEditorChatSessionType(
	sessionType: string,
	configurationService: IConfigurationService,
	chatSessionsService: Pick<IChatSessionsService, 'getChatSessionContribution' | 'getAllChatSessionContributions'>,
	workspace: IWorkspace,
	managedSandboxEnforced = false,
	agentHostEnabled = true,
	managedPolicyRequiresAgentHost = false,
	localChatHidden = false
): boolean {
	if (managedPolicyRequiresAgentHost && sessionType === localChatSessionType) {
		return true;
	}
	if (sessionType === localChatSessionType) {
		return isEditorLocalAgentEnabled(configurationService, workspace, agentHostEnabled && managedSandboxEnforced, localChatHidden)
			|| (!localChatHidden && getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace).length === 0);
	}

	if (sessionType === SessionType.CopilotCLI) {
		return false;
	}

	// The sandbox-backed Cloud type stands in for the extension's cloud agent while it is
	// registered, so the picker offers a single Cloud entry whose backend follows the setting.
	if (sessionType === SessionType.CopilotCloud && chatSessionsService.getChatSessionContribution(SessionType.CloudSandbox)) {
		return false;
	}

	const contribution = chatSessionsService.getChatSessionContribution(sessionType);
	return !!contribution && !contribution.hideFromSessionTypePicker;
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
export { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, getAgentHostSessionResource } from '../../../../platform/agentHost/common/agentHostSessionIdentity.js';

export const OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID = 'workbench.action.openWorkspaceInAgentsWindow';
export const OPEN_AGENTS_WINDOW_COMMAND_ID = 'workbench.action.openAgentsWindow';
/** Shows the Agents Launcher, a small floating composer that starts agent sessions in the background. */
export const AGENTS_LAUNCHER_COMMAND_ID = 'workbench.action.agentsLauncher';
/** The arguments of {@link AGENTS_LAUNCHER_COMMAND_ID}, an `IAgentsLauncherOptions`, for completion in `keybindings.json`. */
export const AGENTS_LAUNCHER_COMMAND_METADATA: ICommandMetadata = {
	description: localize('agentsLauncher.description', "Shows or hides the Agents Launcher"),
	args: [{
		name: 'options',
		isOptional: true,
		schema: {
			type: 'object',
			properties: {
				workspace: {
					type: 'string',
					enum: [''],
					description: localize('agentsLauncher.workspace', "The workspace the launcher starts in. An empty string starts a chat without a workspace, as picking Chat in its workspace picker does. When omitted, the launcher keeps its workspace."),
				},
			},
		},
	}],
};
/** Attaches a screenshot of the window of another app to chat. Desktop only; its keybinding can be made system-wide. */
export const ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID = 'workbench.action.chat.attachAppWindowScreenshot';
export { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../../../platform/chat/common/agentsWindowInvitation.js';
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
