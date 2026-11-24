/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { isMacintosh, isWeb } from '../../../../base/common/platform.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { getModePickerAccessibilityHelp } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
import { getBackgroundShellsPillAccessibilityHelp } from '../../../../workbench/contrib/chat/browser/sessionBackgroundShellsControl.js';
import { getAppWindowScreenshotAccessibilityHelp, getChatInputSessionLinkAccessibilityHelp, getChatResponseStatsAccessibilityHelp, getChatThinkingAccessibilityHelp, getChatViewModeAccessibilityHelp, getModelPickerConfigurationAccessibilityHelp, getSideChatsInSidePaneAccessibilityHelp } from '../../../../workbench/contrib/chat/browser/actions/chatAccessibilityHelp.js';
import { isResponseSelectionSupported } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { SESSIONS_LIST_PROMOTE_NEW_CHAT_ACTION_DEFAULT, SessionsListPromoteNewChatActionContext, SessionWorktreeCleanupEditorFocusedContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { CustomViewVisibleContext } from '../../../common/agentsWindowContextKeys.js';
import { localize } from '../../../../nls.js';
import { FOCUS_AI_CUSTOMIZATION_VIEW_ID } from '../../aiCustomizationTreeView/browser/aiCustomizationTreeView.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID } from '../../../../workbench/contrib/sessions/browser/chat/promptTemplatePlaceholder.js';
import { ARCHIVE_SESSION_COMMAND_ID, FOCUS_ACTIVE_SESSION_COMMAND_ID, FOCUS_NEXT_CHAT_GROUP_COMMAND_ID, FOCUS_PREVIOUS_CHAT_GROUP_COMMAND_ID, MARK_SESSION_READ_COMMAND_ID, MARK_SESSION_UNREAD_COMMAND_ID, MOVE_CHAT_TO_NEXT_GROUP_COMMAND_ID, MOVE_CHAT_TO_PREVIOUS_GROUP_COMMAND_ID, RENAME_CHAT_COMMAND_ID, RENAME_SESSION_COMMAND_ID, SEND_IN_BACKGROUND_COMMAND_ID, SESSION_GRID_FOCUS_COMMANDS, SPLIT_CHAT_GROUP_DOWN_COMMAND_ID, SPLIT_CHAT_GROUP_RIGHT_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ArtifactIntegrationsSettingId } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ChatSessionArchiveActionWording, getChatSessionArchiveActionWording } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { SESSION_ARCHIVE_NUDGE_SETTING } from '../../../../workbench/contrib/sessions/browser/chat/sessionArchiveNudge.js';
import { IChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING } from '../../../../workbench/contrib/sessions/browser/sessionInputBanners/sessionWorktreeCleanupService.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { NAVIGATE_VIEW_COMMANDS } from '../../../../workbench/browser/actions/navigationActions.js';
import { isPhoneLayout } from '../../../../workbench/browser/parts/sessions/mobileLayout.js';
import { AgentWorkbenchLayout, ISessionsHostLayoutService } from '../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionComparisonService } from '../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../chatWindow/common/chatWindows.js';
import { buildSessionComparisonAccessibleContent, isJudgeSession, SessionComparisonResultFocused } from '../../../../workbench/contrib/sessions/browser/chat/sessionComparisonResult.js';
import { SESSION_ACTIVITY_BAR_SETTING, SESSIONS_CHAT_TABS_DEFAULT, SESSIONS_CHAT_TABS_SETTING, SESSIONS_DRAFTS_ENABLED_SETTING, SESSIONS_SEND_LATER_ENABLED_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING, SESSIONS_LIST_INBOX_ENABLED_SETTING, SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING, SESSIONS_SIDEBAR_CUSTOMIZATIONS_CATEGORIES_SETTING, SessionsChatTabsMode } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING, AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING, COMPARE_AGENTS_ENABLED_SETTING, COMPARE_AGENTS_TOOLS_ENABLED_SETTING, ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, WORKSPACE_OPT_OUT_SETTING } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IAgentHostFilterService } from '../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { areDevContainerSamplesEnabled } from '../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from '../../../../workbench/contrib/webview/browser/webview.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { getChatNativeComponentsRenderer } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatNativeComponents.js';
import { readPaneSessions } from '../../../../workbench/services/sessions/browser/sessionGridPane.js';
import { canShowApplicationMenu, SESSIONS_SHOW_APPLICATION_MENU_SETTING } from '../../../browser/parts/applicationMenu.js';
export class SessionsChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'sessionsChat';
	readonly type = AccessibleViewType.Help;
	// Leave surfaces with their own help to their providers instead of this window-wide fallback.
	readonly when = ContextKeyExpr.and(IsSessionsWindowContext, CustomViewVisibleContext.negate(), SessionWorktreeCleanupEditorFocusedContext.negate(), KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED.toNegated());

	constructor(
		private readonly _responseSelectionSupported = isResponseSelectionSupported(),
		private readonly _supportsChatBackgrounds = true,
	) { }

	getProvider(accessor: ServicesAccessor) {
		const restoreFocus = createSessionsChatFocusRestorer(accessor);
		const configurationService = accessor.get(IConfigurationService);
		const archiveActionWording = getChatSessionArchiveActionWording(configurationService);
		const content: string[] = [];
		content.push(localize('sessionsChat.overview', "You are in the Agents window. Its main regions are the Sessions list, chat input and transcript, Changes, Files, and Customizations."));
		content.push(localize('sessionsChat.agentsLauncher', "Use {0} to open the Agents Launcher from anywhere. Enter starts and opens a session; {1} starts it in the background. Escape hides the composer while preserving its draft.", '<keybinding:workbench.action.agentsLauncher>', '<keybinding:workbench.action.agentsLauncher.sendInBackground>'));
		if (configurationService.getValue<boolean>(SESSIONS_DRAFTS_ENABLED_SETTING)) {
			content.push(localize('sessionsChat.savedDrafts', "Unsent new sessions appear in Drafts. Expand Drafts with Right Arrow, select a draft with Up or Down Arrow, and press Enter to resume it. Open the draft's context menu for Resume Draft or Delete Draft."));
		}
		if (configurationService.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING)) {
			content.push(localize('sessionsChat.sendLaterPicker', "In the Send Later picker, use Up and Down Arrow and Enter to choose a preset. Choose Date and Time opens a calendar: Left and Right Arrow move by day, Up and Down Arrow by week, Home and End to the start or end of the week, and Page Up and Page Down by month. Enter or Space selects a day. Tab reaches the month buttons, time dropdown, Schedule, and Cancel. Use arrow keys to choose a time. Escape cancels."));
			content.push(localize('sessionsChat.sendLater', "To schedule a message, focus Send, press Right Arrow to reach its dropdown, and choose Send Later. Scheduled messages offer Edit, Send Now, Reschedule, and Cancel Schedule in their toolbar, context menu, and Accessible View. Tab reaches the toolbar; arrow keys move between actions. Enter or Space on a scheduled message opens its editor when request editing is enabled. Enter saves the edit without sending immediately, Shift+Enter inserts a newline, and Escape cancels the edit. Scheduled new sessions appear in Drafts; Enter resumes their composer. Tab to Show Scheduled Messages in the Sessions list and press Enter or Space to preview pending messages; Escape closes the preview."));
		}
		if (!isPhoneLayout(accessor.get(IWorkbenchLayoutService))) {
			content.push(localize('sessionsChat.commandCenterSessions', "Focus the session command center in the title bar and press Enter or Space to open the recent sessions list. Use arrow keys to choose a session and Enter to open it. Escape closes the preview. Choose Show All Sessions for the searchable Sessions picker."));
		}
		if (canShowApplicationMenu(configurationService) && configurationService.getValue<boolean>(SESSIONS_SHOW_APPLICATION_MENU_SETTING)) {
			content.push(localize('sessionsChat.applicationMenu', "The Application Menu button at the start of the main window's title bar opens the window's menus, such as File, Edit, View, and Help. Press Alt to move focus to it, unless the window.customMenuBarAltFocus setting is off, or press Tab to reach it. Press Enter, Space, or Right Arrow to open it, Up and Down Arrow to move between menus and commands, Right Arrow to open a submenu, Left Arrow to close it, and Escape to close the menu. Turn the button off with the {0} setting.", SESSIONS_SHOW_APPLICATION_MENU_SETTING));
		}
		content.push(getChatInputSessionLinkAccessibilityHelp());
		if (!accessor.get(IChatEntitlementService).sentiment.hidden && configurationService.getValue<boolean>('chat.disableAIFeatures') !== true) {
			if (configurationService.getValue<boolean>(ChatConfiguration.HtmlPreviewEnabled)) {
				content.push(localize('sessionsChat.htmlPreview', "HTML previews enabled by {1} show content from an html-preview code fence. Use Tab to focus the HTML preview and press Shift+F10 to open its context menu. Choose Show Source to toggle the original HTML, Open Preview for a larger editor with its own Accessibility Help and Accessible View, or Save HTML to save the preview. The original source is also available in the chat Accessible View{0}. Find in Chat searches the original HTML and shows source when a match is selected.", '<keybinding:editor.action.accessibleView>', ChatConfiguration.HtmlPreviewEnabled));
			} else {
				content.push(localize('sessionsChat.htmlPreviewDisabled', "Inline HTML previews are disabled by {0}. Responses marked with an html-preview code fence are shown as source code. Enable this setting to render previews.", ChatConfiguration.HtmlPreviewEnabled));
			}
			if (getChatNativeComponentsRenderer(configurationService)) {
				content.push(localize('sessionsChat.nativeComponents', "Responses marked with a vscode-ui code fence can show tables, charts, and expandable details when {1} is enabled. A bar chart is read as a table of its labels and values. Press Enter or Space on expandable details to open or close them. Use Tab to focus a visual and press Shift+F10 to open its context menu. Choose Show Source to toggle the original markup. The chat Accessible View{0} presents each visual as text.", '<keybinding:editor.action.accessibleView>', ChatConfiguration.NativeComponentsEnabled));
			}
			if (!isWeb && configurationService.getValue<boolean>(ChatConfiguration.AppWindowScreenshotsEnabled)) {
				content.push(getAppWindowScreenshotAccessibilityHelp());
			}
			content.push(localize('sessionsChat.remoteConnections.renameHelp', "In the Remote Connections menu, press Tab to reach the name link in the footer, then Enter or Space to rename the shared environment. Enter saves and Escape cancels. Shift+Tab returns to the connection options."));
			content.push(localize('sessionsChat.remoteConnections.policyHelp', "If GitHub Environments is disabled by your organization, the footer explains the restriction. Press Tab to reach View Setting and Enter to open the managed setting. Shift+Tab returns to the connection options."));
			content.push(localize('sessionsChat.remoteConnections', "On desktop, the title bar offers Remote Connections. Use Tab to reach the title bar, arrow keys to reach the button, Enter or Space to open it, Up and Down Arrow to choose Off, Dev Tunnels, or GitHub Environments when available, and Enter to select. Escape returns focus to the button. The footer identifies this machine and its connection state."));
		}
		if (!accessor.get(IChatEntitlementService).sentiment.hidden
			&& configurationService.getValue<boolean>('chat.disableAIFeatures') !== true
			&& configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			content.push(localize('sessionsChat.missionControlHosts', "In the workspace picker, choose GitHub Environments. Use the arrow keys to choose an environment and Enter to connect. Tab reaches Refresh Environments. Escape returns to the previous control. Environment options offer Reconnect, Disconnect, and Rename."));
			content.push(localize('sessionsChat.environmentFolders', "Choose GitHub Environments in the workspace picker to connect to a GitHub environment, then select a folder on that host. The picker starts in the host's home directory. Enter a folder path to browse another location or drive. Use the arrow keys to navigate, Enter to select, and Escape to cancel either picker."));
			if (isWeb) {
				content.push(localize('sessionsChat.webMissionControlHosts', "On the web, use Tab to reach the host picker, Enter or Space to open it, and arrow keys and Enter to choose a host, Connect, Disconnect, or Re-discover Hosts. On phones, the Hosts sheet offers Re-discover hosts and Open Connection Information. The {0} setting controls automatic connections.", RemoteAgentHostAutoConnectSettingId));
			}
		}
		content.push(localize('sessionsChat.input', "You are in the chat input. Type a message and press Enter to send it."));
		content.push(localize('sessionsChat.offlineDraft', "While a cloud sandbox connects, you can read history and compose a draft; Send, mode, and permissions remain unavailable until it is ready. If connecting fails, use Tab to reach Retry in the banner and press Enter or Space. Retry does not send your draft."));
		content.push(localize('sessionsChat.reopenConversation', "If a conversation cannot be reopened, use Tab to reach Retry in its banner and press Enter or Space."));
		content.push(localize('sessionsChat.historyRefresh', "If recent messages cannot be loaded, use Tab to reach Refresh in the banner and press Enter or Space to retry loading recorded messages."));
		content.push(localize('sessionsChat.policyContinuation', "If a conversation is read-only because of your organization's restrictions, use Tab to focus Continue in Copilot in its banner, then press Enter or Space to continue there."));
		content.push(localize('sessionsChat.harnessSwitchFeedbackSurvey', "Use Shift+Tab to reach a feedback survey above the input. Use Up and Down Arrow to choose an answer, then Enter or Space to submit. Dismiss Survey or Escape closes it."));
		if (configurationService.getValue<boolean>(NEW_SESSION_WELCOME_PHRASES_SETTING)) {
			content.push(localize('sessionsChat.welcomeName', "In a new session, the welcome heading is announced when shown. To disable this announcement, set accessibility.verbosity.newSessionWelcome to false. Press Tab to reach Customize Welcome Message beside the welcome heading, or open its context menu{0}. Choose Name to enter a custom name, or clear it to use your GitHub first name when available. Choose Phrases to open the setting where you add or replace welcome phrases, using {1} to position the name.", '<keybinding:editor.action.showContextMenu>', '${name}'));
		}
		content.push(localize('sessionsChat.preparation', "While a session is being prepared, use Tab to reach Show Log beside its progress message and Enter to open the output channel. Use Stop or Cancel Chat{0} to cancel preparation.", '<keybinding:workbench.action.chat.cancel>'));
		content.push(localize('sessionsChat.cloudStartupError', "If cloud session creation or connection fails, focus the error notification, then use Tab to reach Show Details and Enter or Space to read the failure details."));
		content.push(localize('sessionsChat.connectionLog', "While connecting to a Dev Container for an existing session, use Tab to reach Show Log and press Enter to open the Dev Container output channel."));
		if (areDevContainerSamplesEnabled(configurationService)) {
			content.push(localize('sessionsChat.devContainerSamples', "In the workspace picker, open Dev Container Sample and choose a sample with the arrow keys and Enter."));
		}
		if (this._responseSelectionSupported) {
			if (configurationService.getValue<boolean>(AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING)) {
				content.push(localize('sessionsChat.responseSelectionMenu', "When you select assistant response text, an action menu appears. Press Tab to focus the menu, use the Up Arrow and Down Arrow keys to move between actions, and press Enter to activate one. Press Escape to dismiss the menu. Ask in a Side Chat opens a question input anchored to the selected text. Quote appends the selection as a blockquote in the chat input when the conversation is interactive. Copy copies the selected text."));
			}
		}
		content.push(getModePickerAccessibilityHelp());
		content.push(localize('sessionsChat.agentPicker.openFile', "In the Agent picker, use Up and Down Arrow to focus a custom agent, then Tab to reach its Edit or View action. Press Enter or Space to open the agent file without changing the selected agent. Shift+Tab returns to the agent list."));
		if (configurationService.getValue<boolean>(CHAT_WINDOWS_ENABLED_SETTING)) {
			content.push(localize('sessionsChat.chatWindow', "Use Open Chat in New Window, or New Window in a chat's Open in context submenu, to open a separate chat window. Its Layout menu arranges chat and editors{0}. Move to Main Window returns the chat to the main window.", '<keybinding:workbench.action.chatWindow.toggleArrangement>'));
			content.push(localize('sessionsChat.chatWindowNewSession', "In a chat window, New Session{0} opens a composer in that window. Enter sends its prompt; Send in Background{1} starts a session without opening it. Use Open Session in the status to reach a background session.", '<keybinding:sessions.chatWindow.newSession>', `<keybinding:${SEND_IN_BACKGROUND_COMMAND_ID}>`));
		}
		content.push(localize('sessionsChat.closePane', "When multiple session panes are visible, move focus to a pane header and activate Close to remove that pane from the grid. Closing a pane keeps the session and its worktree available in the Sessions list."));

		if (!isWeb && configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING)) {
			content.push(localize('sessionsChat.environmentPicker.beforeWorkspace', "Above the new-session input, Environment is before Workspace and remains visible when session options are collapsed."));
			content.push(localize('sessionsChat.environmentPicker', "Use Tab or the Left and Right arrow keys to reach Environment, Enter or Space to open it, arrow keys and Enter to select, and Escape to dismiss. Workspace and Session Type choices follow the selected environment. Screen-reader optimized mode keeps session options expanded."));
			if (configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
				logSettingExperimentTrigger(accessor.get(ITelemetryService), ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
				if (configurationService.getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING)) {
					content.push(localize('sessionsChat.environmentPicker.manage', "Choose Manage Remote Environments at the bottom of the Environment picker to open the Remote Environments dialog."));
				}
			}
		}
		content.push(...accessor.get(IChatViewFactory).newSessionPresentation?.getAccessibilityHelp(
			accessor.get(IAccessibilityService).isScreenReaderOptimized(),
			configurationService.getValue<boolean>(AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING),
		) ?? []);
		logSettingExperimentTrigger(accessor.get(ITelemetryService), WORKSPACE_OPT_OUT_SETTING);
		if (configurationService.getValue<boolean>(WORKSPACE_OPT_OUT_SETTING) === true) {
			content.push(localize('sessionsChat.clearWorkspace', "When the current environment and harness support chatting without a workspace, hover over or focus the workspace picker to reveal Chat without a workspace. Use Tab or the Left and Right arrow keys to reach this button, then Enter or Space to switch to Chat without discarding your prompt. You can send without choosing a workspace. Focus returns to the workspace picker so you can choose a workspace later. Chat remains available in the workspace list."));
		}
		if (isMacintosh && !isWeb) {
			content.push(localize('sessionsChat.systemWideKeybindingTip', "A chat tip can offer Ctrl+Cmd+A as a system-wide shortcut for opening the Agents window while VS Code is running, even when another application is active. Use Tab or Shift+Tab to reach Enable, then press Enter or Space to add the shortcut to your user keybindings."));
		}
		content.push(localize('sessionsChat.mcpAuthentication', "To focus pending chat confirmations or MCP authentication prompts, invoke Chat: Focus Chat Confirmation{0}. Use Tab to reach Authenticate and Enter or Space to activate it. Invoke the command again to return to the chat input.", '<keybinding:workbench.action.chat.focusConfirmation>'));
		content.push(localize('sessionsChat.terminalConfirmationExplain', "In a conversation that supports side chats, when a terminal command needs approval, use Tab to reach Explain and press Enter or Space to open a side chat explaining the command. Return to the confirmation to allow or skip it."));
		content.push(localize('sessionsChat.backgroundActivityProgressDropdown', "Use Tab to focus a running-subagent or background-command status at the bottom of a response and Enter or Space to open its dropdown. Use Up and Down Arrow to choose an entry and Enter to open a subagent or shell's live command details. Escape returns focus to the status."));
		content.push(localize('sessionsChat.inputPills2', "Press Shift+Tab from the input to reach metadata and status pills, Left and Right Arrow to move between them, and Enter or Space to activate one. Open a pill's context menu{0} to hide it or use Show Pills to choose which pills appear. Pull Requests Artifact Options and Subagent Options control their filters. If a filter hides every entry, use another pill's or the toolbar's context menu to change it.", '<keybinding:editor.action.showContextMenu>'));
		content.push(localize('sessionsChat.artifactSignIn', "When an artifact needs authentication, open its details and use Tab to reach Sign In, then Enter or Space to activate it."));
		content.push(localize('sessionsChat.artifactAutomationNotices', "Use Tab to reach an artifact automation notice in the transcript and Enter or Space to expand or collapse its details."));
		content.push(localize('sessionsChat.artifactAutopilot', "Activate the Autopilot heading in artifact details to expand its rules. Use Tab to reach a rule's switch and Space to change it. Switches grant standing permission for automatic actions."));
		content.push(localize('sessionsChat.artifactListInformation', "A list tab in artifact details can offer an information button. Focus it and press Enter or Space to read its explanation without changing tabs."));
		content.push(localize('sessionsChat.artifactActionDisclosure', "Use Tab to reach an artifact action's request card and Enter or Space to expand it. Use arrow keys within a details list and Enter to open an item. Agent Message switches to the full prompt. Open Accessible View{0} while the request is focused to read its details as text.", '<keybinding:editor.action.accessibleView>'));
		content.push(localize('sessionsChat.artifactIntegrationGroups', "A grouped artifact pill opens a list. Up and Down Arrow, Home and End move between artifacts; Left and Right Arrow move between their controls. Tab and Shift+Tab move through controls and stay in the list. Enter or Space opens a resource or its status details. Pin separates an artifact into its own pill; use its context menu{0} to Unpin. Escape returns focus to the pill.", '<keybinding:editor.action.showContextMenu>'));
		content.push(localize('sessionsChat.artifactIntegrations', "Activate an artifact pill's status or Details section to open its details. Use Tab and Shift+Tab between controls, Left and Right Arrow, Home and End to select a list tab, arrow keys to navigate rows, and Enter to open an item. Tab reaches row actions. Use the Accessible View{0} to read full list content. Activate the Autopilot or Activities heading to expand that section. Escape or Close dismisses details and restores pill focus.", '<keybinding:editor.action.accessibleView>'));
		content.push(localize('sessionsChat.removeSessionRecord', "To remove a recorded artifact or reference, use Tab to reach Remove Artifact or Remove Reference in its row actions. For a single-item pill, use its context menu. This removes the record, not the linked resource."));
		content.push(localize('sessionsChat.generatedImageArtifacts', "Generated images from this chat automatically appear in the Generated Images section of the Artifacts pill, separate from other images and files. When Images Preview is enabled for chat, open an image and use the Left and Right Arrow keys to browse generated images and user attachments from the conversation. Images shown from the transcript do not offer Remove Artifact unless they were also recorded as artifacts."));
		content.push(localize('sessionsChat.imageDownloads', "In Images Preview, use Download to save the selected image. In Artifacts and References, Tab reaches file, folder, and image row actions such as Reveal or Download; Enter or Space activates them. For a single-item pill, use its context menu."));
		content.push(localize('sessionsChat.generatedImageBatch', "Use Tab to focus the selected image thumbnail, then Left or Right Arrow, Home, or End to select another image or its progress. Expand the selected tool dropdown to inspect its prompt and output. Focus the main image and press Enter to open the carousel."));
		content.push(localize('sessionsChat.generatedImageBatchDownload', "Use Tab to reach the download action beside Image batch status and Enter or Space to save ready images as a ZIP archive."));
		content.push(localize('sessionsChat.copySessionRecord', "When a pill represents a single item, its context menu offers the item's copy actions, such as copying its URL or file path. For a collection, open the dropdown and use the individual row actions instead."));
		content.push(localize('sessionsChat.externalSessionFilter', "Use Created Externally in Filter Sessions to choose which sessions from other applications appear."));
		content.push(localize('sessionsChat.sessionOrdering', "On desktop, the Filter Sessions menu offers Ordering and Grouping submenus. Grouping by Repository lists the sessions of each GitHub repository together, whether they run on This Computer, in Cloud, or on a remote host. Sessions without a GitHub repository stay in their workspace section. Grouping by Environment lists sessions together under This Computer, Cloud, or their remote host, across agents and workspaces. When grouping by Workspace, Repository, or Environment, Show switches between Recent and All sessions. Current choices are checked inside the submenus. Use the Right arrow key to open a submenu, the Left arrow key to return, and Enter or Space to choose an option."));
		content.push(localize('sessionsChat.inboxDragAndDrop', "In Inbox Mode, open a session's context menu for Put on Hold, Return to Inbox, Pin, Unpin, Archive or Mark as Done, and Restore."));
		content.push(localize('sessionsChat.inboxToggle', "Enable {0} to show Toggle Inbox beside the Sessions list filters, or beside Sort on phone. Use Tab to reach the toolbar, arrow keys to reach Toggle Inbox, and Enter or Space to activate it. Its pressed state indicates Inbox Mode. Activate it again to restore your previous grouping.", SESSIONS_LIST_INBOX_ENABLED_SETTING));
		content.push(localize('sessionsChat.inboxMode', "Inbox Mode groups sessions in a single tree. Use Up and Down Arrow to navigate, Left Arrow to collapse categories, Right Arrow to expand them, and Tab to reach row actions."));
		content.push(localize('sessionsChat.inboxSendNavigation', "The {0} setting controls navigation after replying or approving a request in Inbox. Its default, auto, keeps you in the current conversation when a screen reader is attached. Set it to off to always stay, on to always advance to another Inbox session, or newSession to open New Session and focus its input.", SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING));
		content.push(localize('sessionsChat.inboxReadState', "In Inbox Mode, use Tab to reach Acknowledge in a session row and Enter or Space to clear its current activity. The action is also available in the session's context menu with Shift+F10. Left and Right Arrow collapse or expand Acknowledged."));
		content.push(localize('sessionsChat.inboxScope', "In Inbox Mode, use Tab to reach the workspace and environment pickers above the list. Enter, Space, or Down Arrow opens a dropdown. Use Up and Down Arrow and Enter to choose, or Escape to return focus. Choose All Workspaces and All Environments to clear the scope."));
		content.push(localize('sessionsChat.sessionFilters', "Open Filter Sessions for Environment, Created In, Harness, and Show options. Checked options are included. Reset Filters restores defaults; its Undo notice restores your previous filters. On desktop, More Actions offers Compact View and Collapse All Groups. On phone, use Sort and Find."));
		content.push(localize('sessionsChat.sessionApplicationHover', "A session created outside VS Code names its application in the session hover. Focus the hover, then use Tab to reach Created in and Enter or Space to open Filter Sessions with Created In focused. Use Right Arrow to open that submenu. The application remains visible after the session becomes a regular session."));
		content.push(localize('sessionsChat.nestedCustomGroups', "Focus a group's heading and open its context menu{0} for Create Subgroup and other group actions. Each group's level is announced.", '<keybinding:editor.action.showContextMenu>'));
		content.push(localize('sessionsChat.nestedGroupingSections', "Focus a section heading and open its context menu{0} for Move to Group or Remove from Group.", '<keybinding:editor.action.showContextMenu>'));
		if (configurationService.getValue<boolean>(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING) === true) {
			content.push(archiveActionWording === ChatSessionArchiveActionWording.MarkAsDone
				? localize('sessionsChat.externalSessionSectionDone', "External sessions appear in an External section above Done unless they are pinned or in a custom group. The section is hidden when empty. Focus its heading and open the context menu{0} to configure which external sessions are shown or mark the section's sessions as done.", '<keybinding:editor.action.showContextMenu>')
				: localize('sessionsChat.externalSessionSectionArchived', "External sessions appear in an External section above Archived unless they are pinned or in a custom group. The section is hidden when empty. Focus its heading and open the context menu{0} to configure which external sessions are shown or archive the section's sessions.", '<keybinding:editor.action.showContextMenu>'));
			content.push(localize('sessionsChat.externalSessionContinuationBanner', "In an external-session banner, use Tab to reach Close and Enter or Space to dismiss it and return focus to the input."));
		} else {
			content.push(localize('sessionsChat.externalSessionBanner', "When you first open a session created in another application, a banner appears at the top of the chat. Use Tab to reach its external-session picker, choose an option, and activate Save. The Close action dismisses the banner without changing the setting. Saving or closing permanently dismisses the banner."));
		}
		content.push(localize('sessionsChat.externalSessionImport', "To make an external session a regular session without sending a message, use Import in its row toolbar, before Archive or Mark as Done, or focus the session and choose Import from its context menu{0}. This action is available when the host supports importing sessions.", '<keybinding:editor.action.showContextMenu>'));
		if (configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING)) {
			content.push(localize('sessionsChat.automationSessions', "In Automations, open a session's context menu{0} and choose Show in Sessions List. Use Hide from Sessions List to reverse this. The {1} setting controls automatic listing.", '<keybinding:editor.action.showContextMenu>', SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING));
		}
		content.push(localize('sessionsChat.delegatedMessage', "Messages sent by another session or chat show a source annotation above the message. Press Tab to focus the annotation, then press Enter or Space to open the source chat."));
		const sideChatsInSidePane = ChatContextKeys.sideChatsInSidePane.getValue(accessor.get(IContextKeyService)) === true;
		// Side chats in the side pane are not listed in the Sessions list, archived or not.
		content.push(archiveActionWording === ChatSessionArchiveActionWording.MarkAsDone
			? sideChatsInSidePane
				? localize('sessionsChat.doneNestedChat', "To mark an individual nested chat as done without marking its session as done, open the chat's context menu in the Sessions list or chat tab and choose Mark as Done. The chat is closed but not deleted, and gets its own row in the Sessions list while done content is shown. If it is hidden, open the Sessions list Filter menu and enable Done. To restore the chat, open its context menu and choose Restore.")
				: localize('sessionsChat.doneChat', "To mark an individual nested chat, including a /btw side chat, as done without marking its session as done, open the chat's context menu in the Sessions list or chat tab and choose Mark as Done. The chat is closed but not deleted, and gets its own row in the Sessions list while done content is shown. If it is hidden, open the Sessions list Filter menu and enable Done. To restore the chat, open its context menu and choose Restore.")
			: sideChatsInSidePane
				? localize('sessionsChat.archiveNestedChat', "To archive an individual nested chat without archiving its session, open the chat's context menu in the Sessions list or chat tab and choose Archive. The chat is closed but not deleted, and gets its own row in the Sessions list while archived content is shown. If it is hidden, open the Sessions list Filter menu and enable Archived. To unarchive the chat, open its context menu and choose Unarchive.")
				: localize('sessionsChat.archiveChat', "To archive an individual nested chat, including a /btw side chat, without archiving its session, open the chat's context menu in the Sessions list or chat tab and choose Archive. The chat is closed but not deleted, and gets its own row in the Sessions list while archived content is shown. If it is hidden, open the Sessions list Filter menu and enable Archived. To unarchive the chat, open its context menu and choose Unarchive."));
		content.push(localize('sessionsChat.createdBySession', "When a session was created by another session, focus it in the Sessions list and use the Show Hover command{0}. Move focus to the Created by link, then press Enter or Space to open the creator session.", '<keybinding:workbench.action.showHover>'));
		content.push(localize('sessionsChat.promptOptions', "When prompt options appear above the input, use Tab and Shift+Tab to move between them, then Enter or Space to insert one. Use Close to hide the options and return focus to the input."));
		if (configurationService.getValue<boolean>(COMPARE_AGENTS_ENABLED_SETTING)) {
			if (configurationService.getValue<boolean>(COMPARE_AGENTS_TOOLS_ENABLED_SETTING)) {
				content.push(localize('sessionsChat.compareAgentsTools', "In a comparison tool result, use Tab to reach Open Comparison and Enter to open the attempts in a grid."));
			}
			content.push(localize('sessionsChat.compareAgentsDiscovery', "Use Compare Models{0}, or Tab to Compare Models in the model picker and press Enter or Space, to open comparison setup.", '<keybinding:sessions.compareModels>'));
			content.push(localize('sessionsChat.compareAgentsKeyboardAndSettings', "In comparison setup, use Up and Down Arrow to focus a model and Space or Enter to toggle its selection without closing the picker."));
			content.push(localize('sessionsChat.compareAgents', "In comparison setup, select at least two models for Attempts. Tab reaches Next for optional Judge and Synthesizer choices, Back, and Done. Done returns to the composer; activate Run N Attempts to launch. Escape closes setup without launching. Open the comparison parent in the Sessions list to reach the attempts in a grid. Screen-reader optimized mode keeps every attempt input visible. Focus a Judge result and use Open Accessible View{0} to read its verdict and metrics. Tab reaches attempt rows; Up and Down Arrow navigate them, and Enter or Space expands a row. Open Attempt opens its chat. Synthesize starts synthesis; Additional Synthesis Instructions in More Actions opens an editable instructions field.", '<keybinding:editor.action.accessibleView>'));
			content.push(localize('sessionsChat.compareAgentsInstructions', "The initial Judge and synthesis messages are collapsed under Judge Instructions or Synthesis Instructions. Use Tab to reach the summary, then press Enter or Space to expand or collapse the full instructions. The complete instructions remain in the conversation and in its Accessible View."));
			content.push(localize('sessionsChat.compareAgentsOpenInGrid', "Turn off sessions.chat.compareAgents.openInGrid to start attempts without automatic navigation. Select the comparison parent to open its grid later."));
		}
		if (!isPhoneLayout(accessor.get(IWorkbenchLayoutService))) {
			content.push(localize('sessionsChat.migrations', "When agent customizations need an update, a notice below the new-session input shows how many need attention. Use Tab to reach Review Migrations and open the Migrations page. Dismiss Migration Notice for This Workspace hides the notice for that workspace, including after restarting, and returns focus to the input."));
		}
		if (!isPhoneLayout(accessor.get(IWorkbenchLayoutService))
			&& configurationService.getValue<boolean>(NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING) === true
			&& configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) === true
			&& configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) === true) {
			content.push(localize('sessionsChat.connectorRecommendations', "Use Tab and Shift+Tab to reach a connector recommendation link and the Previous Tip and Next Tip actions. Activate the link to review the connector in the marketplace."));
		}
		content.push(localize('sessionsChat.promptTemplatePlaceholder', "When the new-session prompt contains a highlighted task placeholder, place the caret inside it and replace it{0} to type your task.", `<keybinding:${REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID}>`));
		content.push(configurationService.getValue<boolean>(ArtifactIntegrationsSettingId) === true
			? localize('sessionsChat.feedbackComments.artifactIntegrations', "While the {0} setting is enabled, pull request failing-check and review-comment banners do not appear above the input. Open a recorded pull request artifact's details to review its checks and comments. In-product agent review comments still appear in a banner above the input. For sessions that support artifact integrations, the title bar does not offer Fix Checks, Mark Ready, Merge, or Open Pull Request; use the pull request artifact's pill and details instead. Create PR remains in the title bar.", ArtifactIntegrationsSettingId)
			: localize('sessionsChat.feedbackComments', "When pull requests have failing checks or unreviewed comments, one banner appears above the input. If several pull requests need attention, use the Previous Banner and Next Banner buttons to move between them. A pull request with both failing checks and comments uses a split button. Activate the main action to address both. Open its More Actions menu to choose Fix Checks or Address Comments separately. Choose Reveal Checks in the More Actions menu to open the pull request. Choose Reveal Comments in the same menu to view the first comment. In-product agent review comments appear as their own carousel item."));
		if (accessor.get(IConfigurationService).getValue<boolean>(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING)) {
			content.push(localize('sessionsChat.worktreeCleanupSuggestion', "Use Open Worktree Cleanup from the Command Palette or Sessions More Actions to review session storage. In a storage suggestion, Tab reaches Open Worktree Cleanup, Don't Show Again, and Dismiss Session Storage Suggestion. Enter or Space activates them; Escape dismisses the suggestion. Don't Show Again disables future suggestions and announcements."));
		}
		if (accessor.get(IConfigurationService).getValue<boolean>(SESSION_ARCHIVE_NUDGE_SETTING)) {
			content.push(archiveActionWording === ChatSessionArchiveActionWording.MarkAsDone
				? localize('sessionsChat.doneNudge', "In a mark as done suggestion, use Tab or Shift+Tab to reach Mark as Done, Configure Automatic Cleanup, or Dismiss Mark as Done Suggestion, then Enter or Space to activate it. Use Tab to reach What Does \"Mark as Done\" Do? and Enter or Space to read its explanation. Escape dismisses the suggestion and returns focus to the input.")
				: localize('sessionsChat.archiveNudge', "In an archive suggestion, use Tab or Shift+Tab to reach Archive, Configure Automatic Cleanup, or Dismiss Archive Suggestion, then Enter or Space to activate it. Use Tab to reach What Does \"Archive\" Do? and Enter or Space to read its explanation. Escape dismisses the suggestion and returns focus to the input."));
		}
		content.push(localize('sessionsChat.feedbackAttachment', "When a feedback comments attachment appears above the input, focus it and press Enter or Space. A single comment opens directly. Multiple comments open a tree grouped by file; use the arrow keys to navigate, Enter to reveal a comment, and Escape to close the tree."));
		content.push(localize('sessionsChat.editorCommentCards', "Use Tab to reach editor comment actions and See more or See less, and Enter or Space to activate them. When content is taller than the editor, Tab to the scrollable comments region and use the arrow keys to scroll. The More Actions menu includes Edit and Add to Comment."));
		content.push(localize('sessionsChat.inputBackground', "Use Send in Background{0} to start a new session without opening it. Enter sends and opens the session as usual.", `<keybinding:${SEND_IN_BACKGROUND_COMMAND_ID}>`));
		content.push(localize('sessionsChat.workspace', "Use Tab or Shift+Tab to navigate to the workspace picker and choose a workspace for your session. Opening the picker focuses its search input so you can immediately type to filter workspaces. If quick chats are available, you can also choose Chat to start a workspace-less chat."));
		if (isPhoneLayout(accessor.get(IWorkbenchLayoutService))) {
			content.push(localize('sessionsChat.phoneCustomizations', "Use a desktop window to manage customizations. Phone sessions still use their configured customizations."));
		} else {
			content.push(localize('sessionsChat.customizationsLocation', "Activate Customizations with Enter or Space to open its editor. To reach links in its hover, including MCP sign-in and customization management, use Show or Focus Hover while the button is focused, then Tab or Shift+Tab and Enter."));
			content.push(localize('sessionsChat.customizationsMore', "Activate More with Enter or Space to show the other customization categories and focus the first one. Activate Less to hide them again and return focus to More. Set {0} to all to always show every category.", SESSIONS_SIDEBAR_CUSTOMIZATIONS_CATEGORIES_SETTING));
		}
		content.push(localize('sessionsChat.removeWorkspace', "Use arrow keys to focus a workspace row, then Tab to reach Remove. This hides the workspace without deleting its sessions or files."));
		if (isWeb) {
			content.push(localize('sessionsChat.repositorySelection', "When choosing a GitHub repository in the browser, search or enter a GitHub URL or owner/repository. Use the arrow keys to navigate results, Enter to select, and Escape to cancel. Sign in to GitHub if prompted."));
		}
		if (accessor.get(IAgentHostFilterService).selectedHost?.sessionCreationProviderId) {
			content.push(localize('sessionsChat.repositoryCreation', "Open Select Repository to choose a repository. Before sending, use the mode, permissions, and model pickers to configure the session. Use arrow keys to navigate options, Enter to select, and Escape to close a picker."));
		}
		content.push(localize('sessionsChat.branchPickerUpstream', "Use Tab to reach the branch picker and Enter or Space to open it. The selected branch is focused. Each branch is announced with its group name: Current Branch, Default Branch, or Branches. Use arrow keys to choose a branch and Enter to select it."));
		const inputHelp = accessor.get(IChatViewFactory).newSessionInput?.getAccessibilityHelp?.();
		if (inputHelp) {
			content.push(inputHelp);
		}
		content.push(localize('sessionsChat.syncChanges.experimental', "When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls above the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session's repository. The action is disabled while synchronization is running."));
		content.push(localize('sessionsChat.githubContext', "Use Add Context to attach files, images, and, when available, GitHub issues or pull requests."));
		content.push(localize('sessionsChat.devContainer', "In a supported folder's workspace submenu, choose Use Dev Container with arrow keys and Enter. Choose Use This Computer or Use Remote Host to switch back."));
		content.push(localize('sessionsChat.pullRequestSession', "In a repository section where New Session is a split button, focus New Session and press Right Arrow to reach its dropdown, then activate New Session from Pull Request to open a searchable pull request picker. Pull requests are grouped by review and assignment status. Use the arrow keys to navigate, Enter to create the session, and Escape to close the picker."));
		content.push(localize('sessionsChat.githubReferences', "Pull request and issue pills above the chat input open their GitHub item in the GitHub Pull Requests extension when it is available. Pills that represent several items open a keyboard-accessible picker."));
		if (configurationService.getValue<boolean>(ArtifactIntegrationsSettingId) !== true) {
			content.push(localize('sessionsChat.failingChecksPullRequest', "When a session pull request has failing checks, use Reveal in its banner item to open that pull request, or use Fix Checks to ask the agent to address the failures."));
		}
		content.push(localize('sessionsChat.pickFolderQuickPick', "To choose a folder from a searchable list instead, use the New Session in Folder command{0}.", '<keybinding:workbench.action.sessions.newSession.pickFolderQuickPick>'));
		content.push(localize('sessionsChat.quickChat', "To start a workspace-less quick chat, use the New Quick Chat command{0} or the plus button on the Chats section in the sessions list. This opens the new-session composer, where you can choose Chat. When GitHub sandboxes are enabled, choose Cloud in the Environment picker, then Chat in the workspace picker, to chat without a repository or pull request. If the Environment picker is disabled, choose Cloud in the harness picker instead. The Toggle Side Panel command is disabled for quick chats.", '<keybinding:sessionsView.newQuickChat>'));
		content.push(localize('sessionsChat.quickChatNestedChats', "Use New Nested Session{0} on a quick chat to open a nested composer. A chat with its own folder announces that folder in the Sessions list.", '<keybinding:sessions.chatCompositeBar.addChat>'));
		content.push(localize('sessionsChat.nestedSessionWorkspace', "New Nested Session{0} opens a composer for the session's host. Use its folder picker to choose a workspace or No Workspace. For a Git folder, the New Worktree checkbox and branch picker configure isolation.", '<keybinding:sessions.chatCompositeBar.addChat>'));
		content.push(getModelPickerConfigurationAccessibilityHelp());
		content.push(localize('sessionsChat.mobileConfig', "On mobile, activate a mode or model chip below the input to open its selection sheet."));
		content.push(localize('sessionsChat.history', "Use up and down arrows to navigate your request history in the input box."));
		if (this._supportsChatBackgrounds) {
			content.push(localize('sessionsChat.background', "When a chat background offers Celebrate, use Tab to reach it and Enter or Space to activate it."));
		}
		content.push(localize('sessionsChat.vscodePet', "Type /vscode-pet to show or hide the pet. Use Tab to focus it, Left and Right Arrow to move it, and Enter or Space to interact."));
		content.push(localize('sessionsChat.dictation', "Use Dictate{0} to start or stop dictating into the input. Activate the control again to cancel speech-to-text model preparation.", '<keybinding:workbench.action.chat.toggleSpeechToText>'));
		content.push(localize('sessionsChat.voiceMode', "Start or stop Voice Mode to interact with the agent using your microphone{0}.", '<keybinding:agentsVoice.startVoiceInChat>'));
		content.push(localize('sessionsChat.micContextMenu', "To choose a microphone or turn off dictation or Voice Mode, focus the microphone button in the input toolbar and open its context menu (for example Shift+F10)."));
		content.push(localize('sessionsChat.contextReferences', "Type # in the chat input to attach context. Use #file to reference a file or folder, or #session to reference another agent session and provide its context to the agent. Accept a suggestion with Tab or Enter. Openable references appear as buttons above the input; activate one to open it, or use its Remove button to detach it."));
		content.push(localize('sessionsChat.pastedText', "Long pasted text is stored as an attached text item and replaced in the input with a numbered inline reference."));
		content.push(localize('sessionsChat.pasteAsText', "To paste the clipboard as plain text, without converting it to Markdown or storing it as an attachment, invoke Paste as Text{0}.", '<keybinding:editor.action.pasteAsText>'));
		content.push(localize('sessionsChat.backgroundActivities', "Press Shift+Tab from the input to reach status pills, Left and Right Arrow to move between pills, and Enter or Space to activate one. In a picker, Up and Down Arrow navigate entries; Tab reaches row actions and detail links. Enter opens an entry; Escape returns focus to the pill. Use Pin to separate an entry into its own pill, and its context menu to Unpin."));
		content.push(localize('sessionsChat.canvases', "Activate the Canvas pill to open a canvas, or a picker when there are several. Use Close Canvas in its context menu to close the canvas rather than only its tab."));
		content.push(getBackgroundShellsPillAccessibilityHelp());
		if (!accessor.get(IChatEntitlementService).sentiment.hidden && configurationService.getValue<boolean>('chat.disableAIFeatures') !== true) {
			content.push(getChatViewModeAccessibilityHelp());
			content.push(getChatThinkingAccessibilityHelp());
			content.push(getChatResponseStatsAccessibilityHelp());
		}
		const chatTabsMode = configurationService.getValue<SessionsChatTabsMode>(SESSIONS_CHAT_TABS_SETTING) ?? SESSIONS_CHAT_TABS_DEFAULT;
		content.push(chatTabsMode === SessionsChatTabsMode.Single
			? localize('sessionsChat.conversationsAsSessionView', "Chats open directly in the session view without a tab row. Side-by-side chats each show a session header. Pin keeps that chat visible when another chat opens. Close removes that chat group. Closing the last group closes the session from the grid. Non-main chats are hidden and can be reopened later. For sessions that support multiple chats, use Show Chat Tabs in the session overflow menu to show multiple tabs.")
			: localize('sessionsChat.conversationsAsTabs', "When multiple chats appear as tabs in a single group, the tab row replaces the session header and includes the session actions. Side-by-side chat groups retain the session header and keep their tab rows compact. For sessions that support multiple chats, use Show Chat Tabs in the session overflow menu to show a single chat."));
		content.push(chatTabsMode === SessionsChatTabsMode.Single
			? localize('sessionsChat.sessionsListChatsAsSessionView', "Sessions with multiple user-facing chats show those chats nested beneath the session in the Sessions list. Use the arrow keys to navigate the list and Enter to show a chat as the session view. Side chats and subagent chats are omitted from this nested list: side chats are reachable from the Side Chats dropdown in the session's overflow menu, and subagent chats open from their pills in the chat transcript.")
			: localize('sessionsChat.sessionsListChatsAsTabs', "Sessions with multiple user-facing chats show those chats nested beneath the session in the Sessions list. Use the arrow keys to navigate the list and Enter to open a chat as a tab. Side chats and subagent chats are omitted from this nested list: side chats are reachable from the Side Chats dropdown in the session's overflow menu, and subagent chats open from their pills in the chat transcript."));
		if (sideChatsInSidePane) {
			content.push(getSideChatsInSidePaneAccessibilityHelp());
		}
		// Only where it applies: a shown session lets its new chats choose among its harnesses.
		const sessionsService = accessor.get(ISessionsService);
		if (sessionsService.slotPanes && readPaneSessions(sessionsService.slotPanes, undefined).some(session => (session.capabilities.get().supportsChatHarnesses?.length ?? 0) > 1)) {
			content.push(localize('sessionsChat.newChatAgentPicker', "When a session supports several harnesses, use Tab to reach Harness for New Chat in its session options and Enter or Space to open it. Use arrow keys and Enter to choose. Unavailable options describe why they cannot be selected."));
		}
		const promoteNewChatAction = SessionsListPromoteNewChatActionContext.getValue(accessor.get(IContextKeyService)) ?? SESSIONS_LIST_PROMOTE_NEW_CHAT_ACTION_DEFAULT;
		content.push(promoteNewChatAction
			? archiveActionWording === ChatSessionArchiveActionWording.MarkAsDone
				? localize('sessionsChat.sessionsListPromotedNewChatDoneActions', "For non-cloud sessions that support multiple chats, the session row toolbar offers New Nested Session before Mark as Done. Open the session's context menu to pin or unpin it.")
				: localize('sessionsChat.sessionsListPromotedNewChatArchiveActions', "For non-cloud sessions that support multiple chats, the session row toolbar offers New Nested Session before Archive. Open the session's context menu to pin or unpin it.")
			: archiveActionWording === ChatSessionArchiveActionWording.MarkAsDone
				? localize('sessionsChat.sessionsListDefaultDoneActions', "The session row toolbar offers Pin or Unpin before Mark as Done. For sessions that support multiple chats, open the session's context menu to start a new chat.")
				: localize('sessionsChat.sessionsListDefaultArchiveActions', "The session row toolbar offers Pin or Unpin before Archive. For sessions that support multiple chats, open the session's context menu to start a new chat."));
		content.push(archiveActionWording === ChatSessionArchiveActionWording.MarkAsDone
			? localize('sessionsChat.showDoneChats', "Use Done in the Sessions list Filter menu to control whether done sessions and nested chats are shown. A check mark means done content is shown.")
			: localize('sessionsChat.showArchivedChats', "Use Archived in the Sessions list Filter menu to control whether archived sessions and nested chats are shown. A check mark means archived content is shown."));
		if (!isPhoneLayout(accessor.get(IWorkbenchLayoutService))) {
			content.push(localize('sessionsChat.sessionCustomizations', "In the Sessions list, open a session's context menu{0} and choose Open Customizations to manage the customizations for that session's harness and workspace. This action is disabled when multiple sessions are selected.", '<keybinding:editor.action.showContextMenu>'));
		}
		content.push(localize('sessionsChat.sessionsListChatContextMenu', "Open a nested chat's context menu to rename it, open it to the side, or, when supported, permanently delete it. Agent Host chats also offer Copy Link."));
		content.push(localize('sessionsChat.markNestedSessionsRead', "When a parent session has unread nested sessions, open its context menu and choose Mark Nested Sessions as Read."));
		content.push(localize('sessionsChat.markSessionsRead', "When the Sessions list has focus, mark the focused session or selected sessions as read{0} or unread{1} without opening them. These shortcuts do not apply while typing in an input.", `<keybinding:${MARK_SESSION_READ_COMMAND_ID}>`, `<keybinding:${MARK_SESSION_UNREAD_COMMAND_ID}>`));
		content.push(localize('sessionsChat.markNestedSessionRead', "The same read and unread shortcuts work on nested sessions and change only the targeted nested sessions, not their parent."));
		content.push(localize('sessionsChat.mainChatToSide', "To open the main chat beside a peer chat, choose Split View from the Open in submenu of the session row's context menu. You can also Alt-click (Option-click on macOS) the row or drag it to a chat pane's edge."));
		content.push(localize('sessionsChat.openInEditorWindow', "To open a session or nested chat in an editor window, choose Editor Window from the Open in submenu of its context menu in the Sessions list."));
		content.push(localize('sessionsChat.forkToSide', "To open a fork beside its source with the keyboard, activate Fork Conversation, reopen the source from the Sessions list, then choose Split View from the Open in submenu of the fork's context menu."));
		content.push(localize('sessionsChat.copySessionLink', "To copy a browser link that opens an Agent Host session in the Agents window, open the session's context menu and choose Copy Link."));
		content.push(localize('sessionsChat.subagentPills', "Use Tab to focus a subagent pill and Enter or Space to open its chat beside the current one."));
		content.push(localize('sessionsChat.subagentPillDetails', "Subagent pills announce their model settings when available. Use Tab to focus file and markdown links in the activity row, then Enter to open them independently of the subagent chat."));
		content.push(localize('sessionsChat.nestedSubagentActivity', "When a subagent starts another subagent, its activity row identifies the nested subagent by name. Focus that link with Tab and press Enter or Space to open the nested subagent's chat beside the current chat. The enclosing pill still opens the parent subagent."));
		content.push(localize('sessionsChat.chatGroups', "Chats can be arranged in groups. Focus the previous group{0} or next group{1}. Split the active chat into a group to the right{2} or below{3}, or move it to the previous group{4} or next group{5}.", `<keybinding:${FOCUS_PREVIOUS_CHAT_GROUP_COMMAND_ID}>`, `<keybinding:${FOCUS_NEXT_CHAT_GROUP_COMMAND_ID}>`, `<keybinding:${SPLIT_CHAT_GROUP_RIGHT_COMMAND_ID}>`, `<keybinding:${SPLIT_CHAT_GROUP_DOWN_COMMAND_ID}>`, `<keybinding:${MOVE_CHAT_TO_PREVIOUS_GROUP_COMMAND_ID}>`, `<keybinding:${MOVE_CHAT_TO_NEXT_GROUP_COMMAND_ID}>`));
		content.push(localize('sessionsChat.chatHeaderHierarchy', "Independent sub-session panes announce their title and parent context. Use the split and move chat commands to arrange them; session grid commands navigate independent panes."));
		content.push(localize('sessionsChat.sessionGrid', "Session panes form a separate grid from each session's chat groups. Focus the session to the left{0}, right{1}, above{2}, or below{3}. Navigate to the View on the Left{4}, Right{5}, Above{6}, and Below{7} do the same in this grid. The Session Layout menu and Command Palette offer movement, resizing, and Arrange Sessions in a Balanced Grid commands.", `<keybinding:${SESSION_GRID_FOCUS_COMMANDS.left}>`, `<keybinding:${SESSION_GRID_FOCUS_COMMANDS.right}>`, `<keybinding:${SESSION_GRID_FOCUS_COMMANDS.up}>`, `<keybinding:${SESSION_GRID_FOCUS_COMMANDS.down}>`, `<keybinding:${NAVIGATE_VIEW_COMMANDS.left}>`, `<keybinding:${NAVIGATE_VIEW_COMMANDS.right}>`, `<keybinding:${NAVIGATE_VIEW_COMMANDS.up}>`, `<keybinding:${NAVIGATE_VIEW_COMMANDS.down}>`));
		content.push(localize('sessionsChat.detachChat', "To create an independent sub-session pane without dragging, focus the sub-session and run Detach Chat into New Pane{0} from the Command Palette. The new pane stays open when its parent pane closes.", '<keybinding:sessions.detachChat>'));
		content.push(localize('sessionsChat.positionalPaneFocus', "Focus Session 1 in Grid{0} and the other numbered focus commands follow visual pane order, including independent sub-session panes even when their parent is closed. Focus Last Session in Grid{1} selects the last pane.", '<keybinding:sessions.focusSessionInGrid1>', '<keybinding:sessions.focusSessionInGrid9>'));
		content.push(localize('sessionsChat.closeChat', "Use a chat tab's Close button to close it without deleting it. Reopen it from the Chats menu."));
		content.push(localize('sessionsChat.navigateChatTabs', "When a chat tab is focused, Left and Right Arrow activate adjacent tabs; Home and End activate the first and last tabs."));
		content.push(localize('sessionsChat.deleteChat', "Before a new nested session is committed, its session header and Sessions list row offer Delete without confirmation. After it is committed, those controls offer Archive or Mark as Done instead. To permanently delete a committed nested session, open the chat tab's context menu and choose Delete. This is destructive and cannot be undone."));
		content.push(localize('sessionsChat.promptTimeline', "When the prompt timeline is enabled, a handle on the left edge of the transcript lists your prompts. Activate it to expand the list, use the up and down arrows (or Home and End) to move between prompts, Enter or Space to jump to a prompt, and Escape to dismiss the list and return focus to the handle. When a prompt title is pinned above the transcript, activate its title to jump to that prompt."));
		content.push(localize('sessionsChat.find', "To search the chat transcript, invoke Find in Chat{0}. Find Next{1} and Find Previous{2} move between results, scrolling each one into view.", '<keybinding:workbench.action.chat.find>', '<keybinding:workbench.action.chat.findNext>', '<keybinding:workbench.action.chat.findPrevious>'));
		content.push(localize('sessionsChat.focusActiveSession', "Focus the active session{0}, the default Open Chat (Agent) shortcut. In the Agents window, the Toggle Chat shortcut, including one you customize, opens the Sessions view{1}.", `<keybinding:${FOCUS_ACTIVE_SESSION_COMMAND_ID}>`, '<keybinding:agentic.workbench.view.sessionsContainer>'));
		content.push(localize('sessionsChat.goBack', "Go back through visited sessions, the New Session view, custom views such as Automations, and canvas tabs such as Inbox{0}.", '<keybinding:sessions.goBack>'));
		content.push(localize('sessionsChat.goForward', "Go forward through visited sessions, views, and canvas tabs{0}.", '<keybinding:sessions.goForward>'));
		content.push(localize('sessionsChat.navigatePreviousSession', "Navigate to the previous session in the list{0}.", '<keybinding:sessionsViewPane.navigatePreviousSession>'));
		content.push(localize('sessionsChat.navigateNextSession', "Navigate to the next session in the list{0}.", '<keybinding:sessionsViewPane.navigateNextSession>'));
		content.push(localize('sessionsChat.moveNestedChat', "To reorder a session's nested chats in the Sessions list, focus a nested chat and invoke Move Up{0} or Move Down{1}, or choose them from its context menu. They are available only when the Sessions list is ordered by Created, and only for nested chats that their provider can move. Focus stays on the moved chat.", '<keybinding:sessionsViewPane.moveChatUp>', '<keybinding:sessionsViewPane.moveChatDown>'));
		content.push(localize('sessionsChat.moveToSession', "To move a nested chat into another session, or to nest a session that has one chat under another session, open its context menu and choose Move to Session..., then pick the destination session from the list. The moved chat becomes the destination's last chat and the result is announced, with an Undo. The command is shown only when another started, unarchived session of the same provider and agent can take it, and when moving chats is enabled."));
		content.push(localize('sessionsChat.renameSession', "Focus a session row and invoke Rename{0}, or choose Rename in its context menu. Enter confirms the new title; Escape cancels. From chat input or transcript, Rename edits the header or opens a prompt.", `<keybinding:${RENAME_SESSION_COMMAND_ID}>`));
		content.push(localize('sessionsChat.renameChat', "Focus a non-main chat tab or nested row and invoke Rename{0}. Enter confirms the new title; Escape cancels.", `<keybinding:${RENAME_CHAT_COMMAND_ID}>`));
		content.push(localize('sessionsChat.archiveSession', "To archive or mark one or more sessions as done, focus them in the Sessions list and invoke Archive or Mark as Done{0}.", `<keybinding:${ARCHIVE_SESSION_COMMAND_ID}>`));
		content.push(localize('sessionsChat.deleteSession', "To permanently delete a session, open its context menu and choose Delete. This is destructive and cannot be undone."));
		content.push(localize('sessionsChat.changes', "Focus the Changes view{0}.", '<keybinding:workbench.action.agentSessions.focusChangesView>'));
		content.push(localize('sessionsChat.viewAllChanges', "Status pills above the chat input include the session's diff stats (lines added and removed). Activate the Changes pill to open the multi-file diff editor with Session Changes for a folder session or Branch Changes for a worktree session{0}.", '<keybinding:workbench.agentSessions.action.viewChanges>'));
		content.push(localize('sessionsChat.openPullRequest', "When the session is associated with GitHub pull requests, a status pill above the chat input shows the pull request number or count. Activate it to open a single pull request or choose from the associated pull requests{0}.", '<keybinding:workbench.agentSessions.action.openPullRequest>'));
		content.push(localize('sessionsChat.filesView', "Focus the Files Explorer view{0}.", '<keybinding:workbench.action.agentSessions.focusChangesFileView>'));
		content.push(localize('sessionsChat.sessionsView', "Focus the Chat Sessions view{0}.", '<keybinding:workbench.action.chat.focusAgentSessionsViewer>'));
		if (accessor.get(ISessionsHostLayoutService).agentWorkbenchLayout === AgentWorkbenchLayout.Desktop && !isPhoneLayout(accessor.get(IWorkbenchLayoutService)) && configurationService.getValue<boolean>(SESSION_ACTIVITY_BAR_SETTING)) {
			content.push(localize('sessionsChat.sessionActivityBar', "When {0} is enabled, Tab past the input controls to reach the Session Activity Bar. Up and Down Arrow move between entries; Enter or Space opens one. The Changes label includes unread changes and diff counts. A Canvas submenu opens with Enter, Space, or Left Arrow and closes with Right Arrow or Escape. Open an entry's context menu{1} to hide it or the activity bar.", SESSION_ACTIVITY_BAR_SETTING, '<keybinding:editor.action.showContextMenu>'));
		}
		if (!isPhoneLayout(accessor.get(IWorkbenchLayoutService))) {
			content.push(localize('sessionsChat.emptyEditorAddTab', "When the side panel's editor has no open tabs, it shows Add Tab at the top and lists the Add Tab actions, such as Changes, Files, Browser, and Search, with their keybindings. Press Tab to reach the list, use the Up and Down arrow keys to move between actions, and press Enter or Space to open one. For an action with a submenu, such as Canvas, press Enter, Space, or the Right arrow key to open the submenu, the Up and Down arrow keys to choose an item, and the Left arrow key or Escape to return to the list."));
			content.push(localize('sessionsChat.customizations', "Focus Chat Customizations in the left sidebar{0}.", `<keybinding:${FOCUS_AI_CUSTOMIZATION_VIEW_ID}>`));
			content.push(localize('sessionsChat.detailPositions', "Use Details Position in View > Appearance or the Toggle Details dropdown to place details beside editor content or in a floating widget. To resize docked details with the keyboard, focus their view and run Increase Current View Size or Decrease Current View Size."));
			content.push(localize('sessionsChat.floatingDetails', "Tab to the floating details widget to open its preview and focus Keep Expanded. Activate Keep Expanded to pin it open, or Unpin to return to preview mode. Escape collapses it and returns focus to the editor. Toggle Details{0} shows or hides the widget. Tab to the Move grip and use Arrow keys to reposition it; Shift makes larger steps and Home resets it. Tab to a width or height resize handle and use its indicated arrow keys, Shift for larger steps, or Home to reset that dimension.", '<keybinding:workbench.action.agentSessions.toggleDetails>'));
		}
		content.push(localize('sessionsChat.toggleSidePanel', "Toggle the side panel (the editor area together with the auxiliary bar) open or closed{0}.", '<keybinding:workbench.action.agentToggleSidePanel>'));

		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsChat,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			restoreFocus,
			AccessibilityVerbositySettingId.SessionsChat,
		);
	}
}

export class SessionComparisonAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 121;
	readonly name = 'sessionComparison';
	readonly type = AccessibleViewType.View;
	readonly when = SessionComparisonResultFocused;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		// Comparisons show in the grid: the comparison of its active pane.
		const view = accessor.get(ISessionsPartService).getActiveSessionView();
		const session = view?.getSession();
		const chat = view?.pane.get()?.chat.get() ?? session?.mainChat.get();
		const comparison = session && chat
			? accessor.get(ISessionComparisonService).comparisons.get().find(candidate => isJudgeSession(candidate, session, chat.resource))
			: undefined;
		if (!comparison?.verdict) {
			return undefined;
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsChat,
			{ type: AccessibleViewType.View, language: 'plaintext' },
			() => buildSessionComparisonAccessibleContent(comparison),
			createSessionsChatFocusRestorer(accessor),
			AccessibilityVerbositySettingId.SessionsChat,
		);
	}
}

function createSessionsChatFocusRestorer(accessor: ServicesAccessor): () => void {
	const sessionsPartService = accessor.get(ISessionsPartService);
	const previouslyFocused = getActiveElement();
	return () => {
		if (isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
			previouslyFocused.focus();
			return;
		}
		sessionsPartService.getActiveSessionView()?.focus();
	};
}
