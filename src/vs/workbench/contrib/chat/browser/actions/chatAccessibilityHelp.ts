/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, getWindow, isHTMLElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { AccessibleDiffViewerNext } from '../../../../../editor/browser/widget/diffEditor/commands.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { LocalModelEnabledSettingId } from '../../../../../platform/agentHost/common/localModel.js';
import { ChatSessionArchiveActionWording, getChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { getTabbedActionListKeybindingLabels } from '../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICodexContinuationService } from '../../../../services/agentHost/browser/codexContinuationService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { INLINE_CHAT_ID } from '../../../inlineChat/common/inlineChat.js';
import { TerminalContribCommandId } from '../../../terminal/terminalContribExports.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { getPromptTimelineRailStyle, isStickyPromptHeaderShown } from '../promptTimeline/promptTimelineWidgetContrib.js';
import { FocusAgentSessionsAction } from '../agentSessions/agentSessionsActions.js';
import { AGENT_SESSION_RENAME_ACTION_ID } from '../agentSessions/agentSessions.js';
import { IChatWidgetService, isIChatResourceViewContext, isResponseSelectionSupported } from '../chat.js';
import { ChatEditingShowChangesAction, ViewPreviousEditsAction } from '../chatEditing/chatEditingActions.js';
import { getModePickerAccessibilityHelp } from '../agentSessions/agentHost/agentHostModePickerPresentation.js';
import { getBackgroundShellsPillAccessibilityHelp } from '../sessionBackgroundShellsControl.js';
import { ChatResourcesEnabledSettingId } from '../chatResources/chatResources.js';
import { AGENT_SESSION_MARK_READ_ACTION_ID, AGENT_SESSION_MARK_UNREAD_ACTION_ID } from '../../../../common/chatSessionCommands.js';

export class PanelChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 107;
	readonly name = 'panelChat';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ChatContextKeys.inQuickChat.negate(), ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask), ContextKeyExpr.or(ChatContextKeys.inChatSession, ChatContextKeys.isResponse, ChatContextKeys.isRequest));
	getProvider(accessor: ServicesAccessor) {
		return getChatAccessibilityHelpProvider(accessor, undefined, 'panelChat');
	}
}

export class QuickChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 107;
	readonly name = 'quickChat';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(ChatContextKeys.inQuickChat, ContextKeyExpr.or(ChatContextKeys.inChatSession, ChatContextKeys.isResponse, ChatContextKeys.isRequest));
	getProvider(accessor: ServicesAccessor) {
		return getChatAccessibilityHelpProvider(accessor, undefined, 'quickChat');
	}
}

export class EditsChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 119;
	readonly name = 'editsView';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(ChatContextKeyExprs.inEditingMode, ContextKeyExpr.or(ChatContextKeys.inChatInput, ChatContextKeys.inChatSessionWorkingSet));
	getProvider(accessor: ServicesAccessor) {
		return getChatAccessibilityHelpProvider(accessor, undefined, 'editsView');
	}
}

export class AgentChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'agentView';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent), ContextKeyExpr.or(ChatContextKeys.inChatInput, ChatContextKeys.inChatSessionWorkingSet));
	getProvider(accessor: ServicesAccessor) {
		return getChatAccessibilityHelpProvider(accessor, undefined, 'agentView');
	}
}

/** Where side chats open, and how to reach them, while the Agents window shows them as tabs of its side panel. */
export function getSideChatsInSidePaneAccessibilityHelp(): string {
	return localize('chat.sideChatsInSidePane', "Side chats, such as those started with /btw, open as tabs of the side panel. Choose Side Chat in Add Tab, or New Side Chat from the Command Palette, to ask a side question. Reopen a side chat from Side Chats in the session's overflow menu.");
}

export function getChatViewModeAccessibilityHelp(): string {
	return localize('chat.viewMode.help', "Open the chat menu and choose View Mode to select Compact, Verbose, or Conversation. The active mode is checked. Press Right Arrow to open the submenu, Up or Down Arrow to choose a mode, Enter to apply it, and Left Arrow or Escape to go back.");
}

export function getChatThinkingAccessibilityHelp(): string {
	return localize('chat.thinkingGeneratedTitles', "Focus a thinking header and press Enter or Space to expand or collapse its reasoning. Reasoning content is also available in Accessible View.");
}

export function getChatResponseStatsAccessibilityHelp(): string {
	return localize('chat.responseStats', "When {0} is enabled, response statistics are not announced as they update. Tab to the completed response's footer details to read its working time. The {1} setting chooses whether token statistics show a count or speed.", ChatConfiguration.ResponseStats, ChatConfiguration.ResponseStatsTokens);
}

export function getChatInputSessionLinkAccessibilityHelp(): string {
	return [
		localize('chat.inputSessionLinks', "Session links in the chat input can be opened without sending your message. Place the cursor in a session link and run Open Link{0} from the Command Palette.", '<keybinding:editor.action.openLink>'),
		localize('chat.inputSessionLinkPills', "When {0} shows a session link as an inline pill, place the cursor right after it and press Enter{1} to open it, or open its context menu{2} to copy its link.", ChatConfiguration.InlineAttachmentsEnabled, '<keybinding:workbench.action.chat.openInlineAttachment>', '<keybinding:editor.action.showContextMenu>'),
		localize('chat.sentSessionLinks', "In a sent message, a session link shows the title and status of the session or chat that it opens. Use Tab to focus it and Enter to open it."),
	].join('\n');
}

export function getModelPickerConfigurationAccessibilityHelp(): string {
	return localize('chat.modelPicker.configurationMeaning', "In model configuration, use arrow keys to focus an effort or context option and Enter or Space to choose it. Focusing an option does not select it. Model default means no effort override; Max identifies capacity, not a selected context window.");
}

/** Describes attaching a screenshot of the window of another app, for the accessibility help of chat and of the Agents window. */
export function getAppWindowScreenshotAccessibilityHelp(): string {
	return localize('chat.attachments.appWindowScreenshot', "Use Attach Screenshot of App Window{0} to capture the app window you are using or just left. Pick App Window to Screenshot offers a list of windows instead. If macOS requires permission, follow the setup dialog and activate Allow in Settings.", '<keybinding:workbench.action.chat.attachAppWindowScreenshot>');
}

export function getAccessibilityHelpText(type: 'panelChat' | 'inlineChat' | 'quickChat' | 'editsView' | 'agentView', keybindingService: IKeybindingService, supportsFileReferences: boolean, isSessionsWindow: boolean = false, stickyPromptHeaderShown: boolean = false, sessionStatusPillsSupported: boolean = type === 'panelChat' || type === 'agentView', sessionArchiveNudgeShown: boolean = false, sessionArchiveActionWording = ChatSessionArchiveActionWording.Archive, codexContinuationShown: boolean = false, localModelEnabled: boolean = false, responseSelectionSupported = isResponseSelectionSupported(), sessionWorkingSetEnabled: boolean = false, sessionWorkingSetUndo: boolean = false, sessionWorkingSetReviewEnabled: boolean = true, inlineAttachmentsEnabled: boolean = false, chatResourcesEnabled: boolean = false, appWindowScreenshotsEnabled: boolean = false, sideChatsInSidePane: boolean = false, promptTimelineGutterShown: boolean = false): string {
	const content = [];
	if (type !== 'inlineChat' && type !== 'quickChat') {
		content.push(localize('chat.agentPickerSources', "When an Agent Host picker lists agents with the same name, each entry includes its source, using the extension name when available. If sources also match, a file name or location helps distinguish the agents."));
	}
	if (type !== 'inlineChat') {
		content.push(getChatInputSessionLinkAccessibilityHelp());
		if (!isSessionsWindow) {
			content.push(localize('chat.pasteOptions', "When the paste options button is available, Change Paste Type{0} opens paste choices instead of the agent picker. Use Up or Down Arrow to choose, Enter to apply, and Escape to close the choices and return to the input.", '<keybinding:editor.changePasteType>'));
		}
	}
	content.push(localize('chat.attachments.filesPicker', "To attach files without searching a workspace, open Add Context{0} and choose Files. Select one or more files in the file dialog and choose Attach. In the simplified file dialog, use the checkboxes or Space to select items and Enter to attach them. Images can also be attached when the chat and selected model support them. Closing the dialog returns focus to the chat input.", '<keybinding:workbench.action.chat.attachContext>'));
	if (appWindowScreenshotsEnabled && type !== 'inlineChat') {
		content.push(getAppWindowScreenshotAccessibilityHelp());
	}
	if (!isSessionsWindow && type !== 'inlineChat' && type !== 'quickChat') {
		content.push(localize('chat.worktreeCleanup', "Choose Open Worktree Cleanup in the Chat view's More Actions menu or the Command Palette to review agent worktree storage."));
		content.push(localize('chat.agentPickerInAttachContext', "When {0} is enabled, open Add Context and choose Agent to change the default agent. A custom agent's picker remains in the toolbar. Open Agent Picker{1} opens either placement.", ChatConfiguration.AgentsPickerInAttachContextMenu, '<keybinding:workbench.action.chat.openModePicker>'));
	}
	const hasSessionWorkingSet = sessionWorkingSetEnabled && !isSessionsWindow && type !== 'inlineChat' && type !== 'quickChat';
	if (hasSessionWorkingSet) {
		const headingActions = !sessionWorkingSetReviewEnabled
			? localize('chat.sessionWorkingSet.headingView', "The View All Edits button after the heading opens all changed files in a diff editor. Keep and Undo are hidden in both the working set and the editor.")
			: sessionWorkingSetUndo
				? localize('chat.sessionWorkingSet.headingKeepUndo', "The Keep, Undo, and View All Edits buttons after the heading keep or undo the changes to every file in the working set, or open all of them in a diff editor. Undo in the heading asks for confirmation.")
				: localize('chat.sessionWorkingSet.headingKeep', "The Keep and View All Edits buttons after the heading keep the changes to every file in the working set, or open all of them in a diff editor.");
		content.push(localize('chat.sessionWorkingSet', "The working set above the input lists changes across the whole session instead of showing a Changes pill. Use Tab or Shift+Tab to reach its heading and press Enter or Space to expand or collapse it. {0} Use Tab to reach the file list, Up and Down Arrow to choose a file, and Enter to open it in a regular editor at its first edit. Each file announces its path and added and removed line counts.", headingActions));
		content.push(!sessionWorkingSetReviewEnabled
			? localize('chat.sessionWorkingSet.fileView', "To inspect the chosen file's changes, press Tab to reach Open Changes in Diff Editor, then Enter or Space.")
			: sessionWorkingSetUndo
				? localize('chat.sessionWorkingSet.fileActions', "Press Tab to reach a file's Keep button, Left and Right Arrow to move between Keep, Undo, and Open Changes in Diff Editor, and Enter or Space to activate one. The accessibility.signals.editsKept and accessibility.signals.editsUndone settings control review sounds.")
				: localize('chat.sessionWorkingSet.fileKeep', "Press Tab to reach a file's Keep button, Left and Right Arrow to move between Keep and Open Changes in Diff Editor, and Enter or Space to activate one. The accessibility.signals.editsKept setting controls its review sound."));
		content.push(localize('chat.sessionWorkingSet.contextMenu', "Open the working set heading's or a file's context menu with Shift+F10 or the Context Menu key. Keep and Undo toggles review controls; Show Pill replaces the working set with the Changes pill. Use Show Working Set in that pill's context menu to restore the file list."));
	}
	if (type !== 'inlineChat' && type !== 'quickChat') {
		content.push(getChatViewModeAccessibilityHelp());
		content.push(localize('chat.olderHistory', "In an Agent Host conversation, focus the message list and use Up Arrow or Page Up near the top to load earlier messages. Focus stays on the current message."));
		content.push(localize('chat.findOlderHistory', "Find searches loaded messages first. If there are no matches, or you move past the known matches, it checks earlier pages. Escape closes Find and stops the search."));
		content.push(localize('chat.agentRequiredModels', "When the selected agent requires specific models, the model picker only offers those models. Its footer explains that the agent defines the models. Use Tab to reach the agent link, then Enter or Space to open its definition."));
		content.push(localize('chat.manageToolApprovals', "Run Chat: Manage Tool Approval from the Command Palette to manage approval rules. Expand the terminal tool to change or delete user command rules, or choose Add Command Rule. Expand the fetch tool and choose Add URL Pattern to allow requests without approving responses. Enter accepts a new rule and Escape cancels. These settings also apply to local Agent Host sessions, not remote hosts."));
		content.push(localize('chat.historyRefresh', "If recent messages cannot be loaded, use Tab to reach Refresh in the banner and press Enter or Space to retry loading recorded history."));
		content.push(localize('chat.remoteConnections.renameHelp', "In the Remote Connections menu, press Tab to reach the name link in the footer, then Enter or Space to rename the shared environment. Enter saves and Escape cancels. Shift+Tab returns to the connection options."));
		content.push(localize('chat.remoteConnections.policyHelp', "If GitHub Environments is disabled by your organization, the footer explains the restriction. Press Tab to reach View Setting and Enter to open the managed setting. Shift+Tab returns to the connection options."));
		content.push(localize('chat.remoteConnections.help', "Remote Connections is available in the local Agent Host toolbar or Agents window title bar. Use Tab to reach the button in chat or arrow keys in the title bar, Enter or Space to open it, Up and Down Arrow to choose Off, Dev Tunnels, or GitHub Environments when available, and Enter to select. Escape returns focus to the button. The footer identifies this machine and its connection state."));
	}
	if (codexContinuationShown && type !== 'inlineChat' && type !== 'quickChat') {
		content.push(localize('chat.codexContinuation', "A ChatGPT limit suggestion may offer Continue with Copilot. If the eligible Codex session is not active, the guide highlights its row in the Sessions list. Activate Open Session in the guide or open the row using the list's usual keyboard shortcut: by default, Command+Down Arrow on macOS or Enter on Windows and Linux. The next step opens its model picker with a matching Copilot model in the search. Activate Use Copilot in the guide or use Up and Down Arrow and Enter in the picker to select the Copilot model. Use Tab or Shift+Tab to reach the guide's buttons and Enter or Space to activate them. An already-active eligible session goes directly to the picker. End Tour or Escape cancels the remaining guidance; it does not undo a model selection."));
	}
	if (isSessionsWindow) {
		content.push(localize('chat.gutterOlderHistory', "At the top of the prompt gutter, activate Load Earlier Prompts to show the previous page. Or press Up Arrow on the first prompt to load earlier prompts without losing your place."));
		content.push(localize('chat.missionControl.help', "Use Connect to Mission Control Environment to list existing hosts. Use Up and Down Arrow to choose a host and Enter to connect, or Escape to cancel."));
		content.push(localize('chat.sessionPreparation', "While a session is being prepared, a progress message appears in the transcript. Use Tab or Shift+Tab to reach Show Log, when available, and press Enter or Space to open the output log. Use Stop to cancel preparation. The chat input and attachment controls are disabled until preparation finishes."));
	}
	if (!isSessionsWindow && type !== 'inlineChat' && type !== 'quickChat') {
		content.push(localize('chat.localHarnessPolicy', "When your organization disables Local, it remains in the harness picker as a disabled option. Use Tab to reach its Learn why link and Enter to open policy guidance. Its hover also includes a Learn why Local is disabled link. Disabled options cannot be selected."));
		content.push(localize('chat.copilotHarnessIntroduction', "In a Copilot introduction above the input, use Tab to reach its feedback, Learn More, or dismissal actions and Enter or Space to activate them."));
		content.push(localize('chat.harnessSwitchFeedbackSurvey', "Use Shift+Tab to reach a feedback survey above the input. Use Up and Down Arrow to choose an answer, then Enter or Space to submit. Dismiss Survey or Escape closes it."));
		content.push(localize('chat.agentsWindowInvitation', "In an Agents Window invitation above the input, use Tab or Shift+Tab to reach Open, Don't Show Again, or Dismiss notification. During its tour, Tab reaches highlighted controls and guide actions; Understood or Escape dismisses the guide."));
	}
	if (type === 'panelChat') {
		content.push(localize('chat.customizationsLocation', "Use the Customizations button to open its editor. Focus the button and use Show or Focus Hover, then Tab or Shift+Tab to reach customization management and MCP sign-in links and Enter to activate them."));
		content.push(localize('chat.customizationMigrations', "When workspace customizations need an update, a notice above the new-chat input shows how many need attention. Use Tab to reach Review Migrations and open the Migrations page. Dismiss Migration Notice for This Workspace hides the notice for that workspace, including after restarting, and returns focus to the input. The Customizations toolbar button also announces when migrations are available."));
	}
	if (sessionArchiveNudgeShown) {
		content.push(sessionArchiveActionWording === ChatSessionArchiveActionWording.MarkAsDone
			? localize('chat.sessionDoneNudge', "In a mark as done suggestion, use Tab or Shift+Tab to reach Mark as Done, Configure Automatic Cleanup, or Dismiss Mark as Done Suggestion, then Enter or Space to activate it. Use Tab to reach What Does \"Mark as Done\" Do? and Enter or Space to read its explanation. Escape dismisses the suggestion and returns focus to the input.")
			: localize('chat.sessionArchiveNudge', "In an archive suggestion, use Tab or Shift+Tab to reach Archive, Configure Automatic Cleanup, or Dismiss Archive Suggestion, then Enter or Space to activate it. Use Tab to reach What Does \"Archive\" Do? and Enter or Space to read its explanation. Escape dismisses the suggestion and returns focus to the input."));
	}
	if (type === 'panelChat' || type === 'quickChat' || type === 'editsView' || type === 'agentView') {
		const tabbedPickerKeys = getTabbedActionListKeybindingLabels(keybindingService);
		content.push(localize('chat.modelPicker.providerTabs', "In the model picker, use {0} and {1} to switch to the next or previous provider tab. When a provider tab is focused, Left and Right Arrow also switch tabs.", tabbedPickerKeys.nextTab, tabbedPickerKeys.previousTab));
		content.push(localize('chat.modelPicker.otherModelsSection', "In the model picker, less common models are grouped under Other Models, which reports whether it is expanded. With Other Models focused, press Right Arrow or Enter to expand it. Press Left Arrow on Other Models or on any model in it to collapse it and return focus to Other Models."));
		content.push(localize('chat.modelPicker.managedDefault', "In the model picker, Org default identifies the model your organization sets for new chats. It remains on that model when you choose another model for this chat; the checkmark identifies your current selection. Auto carries the same label when it is the organization default."));
		content.push(localize('chat.modelPicker.managedOptions', "An agent host can make effort level or context read-only. Its value is announced as managed by the agent host and cannot be changed. An overridable default remains selectable. Changing models uses the options available for the newly selected model."));
		content.push(getModelPickerConfigurationAccessibilityHelp());
		content.push(localize('chat.modelPicker.detailsPage', "Use Up and Down Arrow to focus a model and Enter to select it. Right Arrow, or Tab to its configuration button and Enter or Space, opens details without selecting it. The readout beside the model name in the input opens the same page. Back to Models, or {0}, returns focus to the model list. Escape closes the picker.", tabbedPickerKeys.back));
		content.push(localize('chat.modelPicker.optimizeFor', "Auto's details hold its \"Optimize for\" preference: Efficiency, Balance, or Intelligence. Open them from Auto like any model's details, then use arrow keys to move between preferences and Enter or Space to choose one. Choosing a preference selects Auto and keeps its details open. When Auto has a discount, it is described below the preferences. The preference readout beside Auto in the chat input opens the same details."));
		content.push(localize('chat.modelPicker.fusion', "When Auto's tiers come from the Copilot service, Auto is presented as Copilot Fusion, and its details hold an \"Effort Level\" setting instead, such as Standard, High, and Max. The selected effort level is described below the setting, and a Learn more link follows Copilot Fusion's description. Choosing an effort level keeps Copilot Fusion checked with that effort level."));
		content.push(localize('chat.modelPicker.resetToDefault', "In model details, Tab reaches effort, context, and model actions. Arrow keys focus options; Enter or Space selects one. Reset to Default restores effort and context. Back to Models returns to the list; Escape closes the picker."));
		content.push(localize('chat.modelPicker.pricingDetails', "Activate Pricing Details to expand it. Use Page Up or Page Down while model details have focus to scroll."));
		content.push(localize('chat.modelPicker.search', "Type while the model list is focused to search across all providers. In the search field, use Up and Down Arrow to navigate results, Enter to select a model, and Escape to close the picker. Left and Right Arrow move the text cursor."));
		if (localModelEnabled) {
			content.push(localize('chat.localModel.rows', "When on-device models are enabled, the model picker offers On This Device. Use provider tab shortcuts to reach it, Up and Down Arrow to focus a model, and Right Arrow or its configuration button to open details. A model's accessible label includes its state. Enter selects an installed model; for a model not downloaded, it opens setup."));
			content.push(localize('chat.localModel.details', "In on-device model details, Tab and Shift+Tab move between controls. Use Left and Right Arrow in the header to reach model actions such as Load, Stop, Update, and Remove; Enter or Space activates one. Use arrow keys in effort and context choices, then Enter or Space to select. Use Back to Models to return to the list or Escape to close. State changes are announced."));
			content.push(localize('chat.localModel.notice', "An on-device model notice above the input offers actions for its current state, such as Pause, Cancel, Retry, or Resume. Use Tab or Shift+Tab to reach them. Open the readout beside the model name to reach its details. The Command Palette also offers on-device model setup and management commands."));
		}
		content.push(localize('chat.fileChangesDisclosure', 'File change summaries show the total files, additions, and deletions. Focus the disclosure and press Enter or Space to show or hide the individual files. Focus an additions and deletions label and press Enter or Space to open the changes in a diff editor.'));
	}
	if (type === 'panelChat' || type === 'quickChat' || type === 'agentView') {
		if (type === 'quickChat') {
			content.push(localize('chat.overview', 'The quick chat view is comprised of an input box and a request/response list. The input box is used to make requests and the list is used to display responses.'));
		} else {
			content.push(localize('workbench.action.chat.newChat', 'To create a new chat session, invoke the New Chat command{0}.', '<keybinding:workbench.action.chat.newChat>'));
			content.push(localize('workbench.action.chat.focusAgentSessionsViewer', 'You can focus the agent sessions list by invoking the Focus Agent Sessions command{0}.', `<keybinding:${FocusAgentSessionsAction.id}>`));
			content.push(localize('chat.externalSessionFilter', 'The agent sessions filter includes an External submenu. Use it to choose whether external sessions from another application are shown for the last 24 hours, the last 7 days, always, or not at all.'));
			content.push(localize('workbench.action.openAgentsWindow', "To open the Agents Window, invoke the Open Agents Window command{0}. The default keybinding is enabled after you create your first session in the Agents Window. In screen reader mode, this keybinding includes Alt to avoid conflicts with screen reader shortcuts.", '<keybinding:workbench.action.openAgentsWindow>'));
			content.push(localize('workbench.action.chat.openAgentHostFolderPicker', 'When starting an agent session in a multi-root workspace, you can choose which root folder it runs in by invoking the Folder command{0}, then selecting a folder from the list.', '<keybinding:workbench.action.chat.openAgentHostFolderPicker>'));
			content.push(localize('chat.editorWindowWorktree', "When {0} is on, a folder with no worktrees shows a New Worktree checkbox instead of the Folder picker. Use Tab to reach it and Space to check or uncheck it. Once the folder has worktrees, the Folder picker appears; use Up or Down Arrow to choose and Enter to select.", ChatConfiguration.EditorWindowEnableWorktree));
			content.push(localize('chat.agentHostApprovalsPicker', 'When an agent session exposes approval presets, use Tab to reach the Approvals picker and choose how it handles workspace access, commands, and the internet.'));
			content.push(localize('chat.agentHostSandboxPolicy', "In Copilot agent-host sessions, use /sandbox policy to view the effective sandbox policy. In the response, use Tab to focus Open Sandbox Policy and Enter to open the formatted report."));
			content.push(localize('chat.agentHostSandboxDiagnostics', "When a sandbox dependency warning appears above the input, use Tab to reach Troubleshooting Guide or, when permitted, Disable Sandboxing. Press Enter or Space to activate the button. Disable Sandboxing turns sandboxing off for this session and in settings; your organization's requirements still apply."));
			content.push(getModePickerAccessibilityHelp());
		}
		if (sessionStatusPillsSupported) {
			if (chatResourcesEnabled) {
				content.push(localize('chat.resourcesAboveInput', "With chat.resources.enabled turned on, the context menu of a pinned pill of a file the chat recorded offers Show Above Chat Input. While it is checked, activating the pill shows or hides the file above the chat input, and the pill is announced as pressed while the file is shown; uncheck it to open the file in an editor again. To resize the shown file, Tab to its resize handle and use the Up and Down Arrow keys; Home makes it follow its content again."));
			}
			content.push(localize('chat.sessionStatusPillCopy', "When a pill represents a single item, its context menu offers the item's copy actions, such as copying its URL or file path. For a collection, open the dropdown and use the individual row actions instead."));
			content.push(localize('chat.sessionStatusPills', "Use Tab to focus the status toolbar above the input, Left and Right Arrow to move between pills, and Enter or Space to activate one. In an aggregated picker, use Pin to separate an entry into its own pill. Open its context menu{0} to Unpin, hide it, or use Show Pills to choose visible pills. Pull Requests Artifact Options controls pull request filters; if all entries are hidden, use another pill's or the toolbar's context menu to change the filter.", '<keybinding:editor.action.showContextMenu>'));
			if (isSessionsWindow) {
				content.push(localize('chat.sessionPullRequestChanges', "In the Pull Requests pill, or for a pull request in the References pill, open the dropdown and use the pull request's Open Pull Request Changes row action to view its changed files in a multi-file diff editor."));
			}
			content.push(localize('chat.canvasesAddContext', "In Copilot agent-host sessions with chat.canvases.enabled turned on, Add Context includes Canvas immediately after Sessions. Sessions on remote agent hosts also require workbench.browser.enableRemoteProxy. Open Canvas to choose a registered or closed canvas by name. Activating one opens or refocuses its tab; it does not attach anything to the prompt."));
			if (!isSessionsWindow) {
				content.push(localize('chat.sessionStatusPillsCompact', "When session status pills show only icons, their accessible names still identify them. Use arrow keys to reach every pill, including those scrolled out of view."));
				content.push(localize('chat.editorArtifactsPill', "A single Artifacts pill opens directly; multiple artifacts open a dropdown. Use the pill's context menu or row actions to save an artifact or copy its path."));
				content.push(localize('chat.editorCanvasesPill', "Use Canvas in the New Chat menu to open or refocus a canvas. Navigate menus with Up and Down Arrow, Right Arrow, and Enter. The Canvas pill opens directly for one canvas or offers a picker for several. Use Close Canvas in its context menu to close the canvas rather than only its tab."));
			}
			content.push(localize('chat.sessionActivityPills', "Subagents and Customizations are available in both the Agents Window and editor window, and are hidden by default. Enable them from the session status toolbar context menu. Subagents lists the current chat's direct subagents, grouped into in-progress and completed chats. Activate an entry to open its chat to the side. Subagent Options lets you show all subagents or only those in progress, remembered across windows. Customizations lists the agents, skills, instructions, hooks, prompts, MCP servers, and plugins used by the current chat. Activate an entry to reveal it in the Customizations editor."));
			content.push(getBackgroundShellsPillAccessibilityHelp());
		}
		content.push(localize('chat.requestHistory', 'In the input box, use up and down arrows to navigate your request history. Edit input and use enter or the submit button to run a new request.'));
		content.push(localize('chat.managedSettingsRetry', "If loading your organization's managed settings fails, your request remains in the conversation. Use Tab to focus Retry below the error, then press Enter or Space to resend that request. While settings are loading, Stop cancels the pending request."));
		if (!isSessionsWindow) {
			content.push(localize('chat.cloudStartupError', "If cloud session creation or connection fails, the current response offers Show Details. Use Tab to focus Show Details and Enter or Space to open a dialog with the failed step and available request details. Opening details does not sign in or retry the request. As with other response buttons, Show Details is unavailable after the conversation is restored."));
		}
		content.push(localize('chat.inputBlocked', 'When another Codex app is using a conversation, a banner above the input explains how to release it. You can keep editing your draft, but sending is disabled. Quit the app holding the conversation, such as ChatGPT, or exit the Codex CLI session. Use Tab to focus Retry in the banner, then press Enter or Space to check again. Retry does not send your draft.'));
		content.push(localize('chat.policyInputBlocked', "If a Local chat is read-only under your organization's restrictions, use Tab to reach Move to Copilot, Continue in Copilot, or New Copilot Chat in its banner, then Enter or Space. These actions open an eligible chat without sending your draft."));
		content.push(localize('chat.agentHostPolicyContinuation', "If a conversation is read-only because of your organization's restrictions, use Tab to focus Continue in Copilot in its banner, then press Enter or Space to continue there."));
		content.push(localize('chat.subagentPills', "Subagents appear as pills in the response, completion notifications, and read-agent and write-to-agent messages. Use Tab to focus a subagent pill, then Enter or Space to open its chat to the side. If the subagent has no separate chat, Enter or Space expands or collapses its inline details instead. The pill announces its running state, model settings, and any pending confirmations. File and markdown links in its activity row can be focused with Tab and opened independently with Enter."));
		content.push(localize('chat.nestedSubagentActivity', "When a subagent starts another subagent, its activity row identifies the nested subagent by name. Focus that link with Tab and press Enter or Space to open the nested subagent's chat to the side. The enclosing pill still opens the parent subagent."));
		content.push(localize('chat.vscodePet', "Type /vscode-pet to show or hide the pet. Use Tab to focus it, Left and Right Arrow to move it, Shift with an arrow to throw it, and Enter or Space to interact or bounce it. Open its context menu{0} for Achievements, size, and color controls.", '<keybinding:editor.action.showContextMenu>'));
		if (isSessionsWindow) {
			content.push(localize('chat.vscodePetJumpGame', "In a new session, focus the pet with Tab and open its context menu{0} to choose Play Jump Game. Hold Space to charge and release to jump; Left and Right Arrow aim. Escape or Tab back to the input ends the game.", '<keybinding:editor.action.showContextMenu>'));
		}
		content.push(localize('chat.inputSkills', "To open a skill accepted from slash-command suggestions, place the cursor within its reference, not after it, in the chat input or while editing a sent message. Open the Command Palette{0} and run Chat: Open Skill at Cursor. This opens the bound skill file without sending your message. Skills without a resource cannot be opened. In a sent message, use Tab to focus a skill link and Enter to open it.", '<keybinding:workbench.action.showCommands>'));
		if (inlineAttachmentsEnabled) {
			content.push(localize('chat.attachments.inline', "Attached context appears as inline pills when {3} is enabled. Use arrow keys to move across a pill, Shift to select it, and Backspace or Delete to remove it. Its name is announced as the cursor passes it. With the cursor right after a resource pill, Enter opens it{0} instead of sending, and the context menu{1} offers its actions. Use Show or Focus Hover{2} to inspect it. Turn off {3} to show attachments above the input instead.", '<keybinding:workbench.action.chat.openInlineAttachment>', '<keybinding:editor.action.showContextMenu>', '<keybinding:editor.action.showHover>', ChatConfiguration.InlineAttachmentsEnabled));
			content.push(localize('chat.attachments.inlineMove', "To move an inline pill with the keyboard, select it with Shift and an arrow key, cut{0}, move the cursor, and paste{1}.", '<keybinding:editor.action.clipboardCutAction>', '<keybinding:editor.action.clipboardPasteAction>'));
			content.push(localize('chat.attachments.removal', 'To remove attached contexts, focus an attachment and press Delete or Backspace.'));
			content.push(localize('chat.attachments.githubHover', "Place the cursor immediately after an inline GitHub pill to preview it. Enter opens the referenced item instead of sending. Use Show or Focus Hover{0} to enter its hover, which supports Accessible View{1} and Accessibility Help{2}. Escape dismisses the preview.", '<keybinding:editor.action.showHover>', '<keybinding:editor.action.accessibleView>', '<keybinding:editor.action.accessibilityHelp>'));
		} else {
			if (supportsFileReferences) {
				content.push(localize('chat.attachments.inlineReferences', 'To mention an attached context item at a specific position without removing it from the attached context, type # or @ and select the attachment from the suggestions.'));
				content.push(localize('chat.attachments.inlineReferenceHover', 'To inspect an inline attachment reference, place the cursor on it and invoke Show or Focus Hover{0}. Image references include a preview, while file and folder references include their path.', '<keybinding:editor.action.showHover>'));
			}
			content.push(localize('chat.attachments.removal', 'To remove attached contexts, focus an attachment and press Delete or Backspace.'));
		}
		content.push(localize('chat.attachments.githubRequestPills', "In a sent request, use Tab to focus a GitHub issue or pull request pill and preview its details. Enter or Space opens the item instead of editing the request; Escape dismisses the preview."));
		content.push(localize('workbench.action.chat.toggleSpeechToText', 'To dictate your request into the input box, invoke the Dictate command{0}. Invoke it again to stop; recording start and stop are indicated by accessibility signals.', '<keybinding:workbench.action.chat.toggleSpeechToText>'));
		content.push(localize('workbench.action.chat.cancelSpeechToText', 'While dictating, invoke the Cancel Dictation command{0} to stop and discard the dictated text.', '<keybinding:workbench.action.chat.cancelSpeechToText>'));
		content.push(localize('chat.speechToText.contextMenu', 'To choose a microphone or turn off dictation or Voice Mode, focus the microphone button in the input toolbar and open its context menu{0} (for example Shift+F10).', '<keybinding:editor.action.showContextMenu>'));
		content.push(localize('chat.voiceInputMode.segmented', 'When the segmented voice input control is enabled, the input toolbar offers Dictation and Voice Mode. A connected hands-free session also offers Mute or Unmute Microphone; manual Voice Mode instead offers Start or Stop Listening, where stopping sends the completed turn. Each button can be focused and activated with Enter or Space.'));
		content.push(localize('chat.voiceInputMode.holdToTalk', 'In manual Voice Mode, the Start or Stop Listening button toggles listening when tapped, or you can press and hold it to talk and release to send. You can also hold the Voice Mode: Hold to Talk keybinding{0} to talk and release to send; this interrupts the assistant to barge in.', '<keybinding:workbench.action.chat.voiceInputMode.holdToTalk>'));
		content.push(localize('chat.voiceMode.byokSession', "Voice Mode belongs to the input where you start it. If switching inputs stops Voice Mode, start it again in the intended input."));
		content.push(localize('chat.voiceMode.questionSequence', "For forms with multiple questions, Voice Mode identifies the current question by number. Answer only that question, then wait for the next one. Each spoken reply fills one field, not several fields."));
		content.push(localize('chat.voiceMode.byokAnswers', "In OpenAI BYOK Voice Mode, say approve or reject to answer a confirmation. For a question, say its displayed choice or number; separate multiple choices with commas or and. Answer text questions directly, or say other followed by a custom answer when allowed. Answer one question at a time; say skip only when offered."));
		content.push(localize('chat.voiceMode.introduction', 'The first time Voice Mode starts, an introduction appears above the input box. Tab to reach it, then use the arrow keys to move between the available voices; Enter or Space plays a voice and keeps it for future conversations. Its description also contains two links: Settings, which opens the Voice Mode settings, and How It Responds, which opens a file for customizing what the agent says back. Voice Mode stays connected but does not listen while the introduction is open. Press Escape, or activate the Close button, to dismiss it and return to the input box.'));
		content.push(localize('chat.inspectResponse', 'In the input box, inspect the last response in the accessible view{0}. Thinking content is included in order by default.', '<keybinding:editor.action.accessibleView>'));
		content.push(localize('chat.inspectResponseThinkingToggle', 'To include or exclude thinking content in the accessible view, run the Toggle Thinking Content in Accessible View command from the Command Palette.'));
		content.push(localize('chat.artifactActionDisclosure', "Use Tab to reach an artifact action's request card and Enter or Space to expand it. Use arrow keys within a details list and Enter to open an item. Agent Message switches to the full prompt. Open Accessible View{0} while the request is focused to read its details as text.", '<keybinding:editor.action.accessibleView>'));
		content.push(localize('chat.completedResponseDisclosure', 'When completed response collapsing is enabled, the final response remains visible while earlier work is collapsed. Use Tab to focus the work disclosure and press Enter or Space to show or hide that work. With persistent progress enabled, a separate file changes button shows lines added and deleted when the collapsed work includes edits. Activate it to open those file changes without expanding the work.'));
		content.push(localize('chat.generatedImages', "Use Tab to focus an image-generation dropdown and Enter or Space to expand or collapse it and inspect the prompt or error. Use Tab or Shift+Tab to focus an image and Enter to open it. Use its Save action to save the generated image."));
		content.push(localize('chat.generatedImageBatch', "Use Tab to focus the selected image thumbnail, then Left or Right Arrow, Home, or End to select another image or its progress. Expand the selected tool dropdown to inspect its prompt and output. Focus the main image and press Enter to open the carousel."));
		content.push(localize('chat.generatedImageBatchDownload', "Use Tab to reach the download action beside Image batch status and Enter or Space to save ready images as a ZIP archive."));
		content.push(localize('chat.generatedImageCarousel', "Generated images also appear in artifacts. When Images Preview is enabled for chat, opening an image lets you browse generated images, user-attached images, and images shown in responses from the same conversation. Use the Left and Right Arrow keys to move between images."));
		content.push(localize('chat.responseImages', "To open a file image shown in a response, use Tab to focus it and press Enter or Space. To attach it to your next request, drag it into the chat input, or use Copy Image and paste it into the input."));
		content.push(localize('chat.copyImages', "To copy a response image or image attachment for pasting into another application, focus it and press Shift+F10 to open its context menu, then choose Copy Image. For images stored in a file, Copy Image Path copies the file path. You can also open the menu by right-clicking the image."));
		if (type === 'agentView') {
			content.push(localize('chat.systemNotificationDisclosure', 'Some session status messages have additional details. Use Tab to focus the status message and press Enter or Space to show or hide its details.'));
		}
		content.push(localize('chat.backgroundActivityProgressDropdown', "Use Tab to focus a running-subagent or background-command status at the bottom of a response and Enter or Space to open its dropdown. Use Up and Down Arrow to choose an entry and Enter to open a subagent or shell's live command details. Escape returns focus to the status."));
		content.push(localize('chat.mcpStartupSkip', "When a chat turn is waiting for MCP servers to start, a Skip link may appear. Use Tab to focus Skip and press Enter or Space to continue the turn while those servers start in the background. The current startup message disappears immediately and focus returns to the chat input. New server startups may show another message."));
		content.push(localize('workbench.action.chat.focus', 'To focus the chat request and response list, invoke the Focus Chat command{0}. This will move focus to the most recent response, which you can then navigate using the up and down arrow keys.', getChatFocusKeybindingLabel(keybindingService, type, 'last')));
		content.push(localize('workbench.action.chat.focusLastFocusedItem', 'To return to the last chat response you focused, invoke the Focus Last Focused Chat Response command{0}.', getChatFocusKeybindingLabel(keybindingService, type, 'lastFocused')));
		content.push(localize('workbench.action.chat.focusInput', 'To focus the input box for chat requests, invoke the Focus Chat Input command{0}.', getChatFocusKeybindingLabel(keybindingService, type, 'input')));
		content.push(localize('chat.progressVerbosity', 'As the chat request is being processed, you will hear verbose progress updates if the request takes more than 4 seconds. This includes information like searched text for <search term> with X results, created file <file_name>, or read file <file path>. This can be disabled with accessibility.verboseChatProgressUpdates.'));
		content.push(localize('chat.persistentProgress', "Use Tab to focus a reasoning or tool summary and Enter or Space to expand or collapse it. Spoken progress updates are controlled by accessibility.verboseChatProgressUpdates. View Mode in the chat menu chooses the level of displayed detail.", ChatConfiguration.PersistentProgress, ChatConfiguration.PersistentProgressVerbosity, ChatConfiguration.CollapseCompletedResponses));
		content.push(getChatThinkingAccessibilityHelp());
		content.push(getChatResponseStatsAccessibilityHelp());
		content.push(localize('chat.toolFailureIcon', "Use Accessible View to read tool failure reasons or terminal exit codes."));
		content.push(localize('chat.announcement', 'Chat responses will be announced as they come in. A response will indicate the number of code blocks, if any, and then the rest of the response.'));
		content.push(localize('workbench.action.chat.nextCodeBlock', 'To focus the next code block within a response, invoke the Chat: Next Code Block command{0}.', '<keybinding:workbench.action.chat.nextCodeBlock>'));
		content.push(localize('workbench.action.chat.nextUserPrompt', 'To navigate to the next user prompt in the conversation, invoke the Next User Prompt command{0}.', '<keybinding:workbench.action.chat.nextUserPrompt>'));
		content.push(localize('workbench.action.chat.previousUserPrompt', 'To navigate to the previous user prompt in the conversation, invoke the Previous User Prompt command{0}.', '<keybinding:workbench.action.chat.previousUserPrompt>'));
		if (stickyPromptHeaderShown) {
			content.push(localize('chat.stickyPromptHeader', 'The prompt you have scrolled past is pinned to the top of the transcript. Activate its title to jump back to that prompt.'));
		}
		if (promptTimelineGutterShown) {
			content.push(localize('chat.promptTimelineGutter', "A handle on the left edge of the transcript lists your prompts. Activate it to expand the list, use the up and down arrows (or Home and End) to move between prompts, Enter or Space to jump to a prompt, and Escape to dismiss the list and return focus to the handle."));
		}
		content.push(localize('workbench.action.chat.announceConfirmation', "To focus pending chat confirmation dialogs or MCP authentication prompts, invoke the Chat: Focus Chat Confirmation command{0}. Use Tab to reach a button and Enter or Space to activate it. Invoke the command again to return to the chat input.", '<keybinding:workbench.action.chat.focusConfirmation>'));
		content.push(localize('chat.sandboxPathGrant', "In a sandbox path-access confirmation, use Tab to reach More Actions, Enter or Space to open the approval dropdown, Up or Down Arrow to choose an available scope, and Enter to approve. Escape closes the dropdown without approving. Skip declines access."));
		content.push(localize('chat.assistedPermissionsFeedback', "If a confirmation includes an optional feedback field, use Tab to reach it. Enter feedback, then choose a decision button or use Accept Tool Confirmation{0}.", '<keybinding:workbench.action.chat.acceptTool>'));
		content.push(localize('chat.showHiddenTerminals', 'If there are any hidden chat terminals, you can view them by invoking the View Hidden Chat Terminals command{0}.', '<keybinding:workbench.action.terminal.chat.viewHiddenChatTerminals>'));
		content.push(localize('chat.focusMostRecentTerminal', 'To focus the last chat terminal that ran a tool, invoke the Focus Most Recent Chat Terminal command{0}.', `<keybinding:${TerminalContribCommandId.FocusMostRecentChatTerminal}>`));
		content.push(localize('chat.focusMostRecentTerminalOutput', 'To focus the output from the last chat terminal tool, invoke the Focus Most Recent Chat Terminal Output command{0}.', `<keybinding:${TerminalContribCommandId.FocusMostRecentChatTerminalOutput}>`));
		content.push(localize('chat.restoredTerminalOutput', "Expand a terminal output section with Enter or Space to read it. Recorded output is also available in Accessible View."));
		content.push(localize('chat.openTerminalFullOutput', "When retained full output is available for a completed command, use the View Full Output link below the output preview, or the Open Full Output (Read-Only) action in the command header or terminal output Accessible View, to open it in a read-only editor. You can also focus the output region and press Enter."));
		content.push(localize('chat.focusQuestionCarousel', 'When a chat question appears, toggle focus between the question and the chat input{0}.', '<keybinding:workbench.action.chat.focusQuestionCarousel>'));
		content.push(localize('chat.scrollQuestionDetails', "The question title stays visible while its details and answers scroll together. Use Tab to focus Question details, then use the arrow keys or Page Up and Page Down to scroll."));
		content.push(localize('chat.maximizeQuestion', "Use the Maximize button in the question header to give a long question more room, and Restore Size to shrink it again. Escape also restores the size."));
		content.push(localize('chat.questionPrimaryButton', "The primary button scrolls to the answers while they are out of view. Once they are visible, it moves to the next question or submits."));
		content.push(localize('chat.questionYesNo', "Yes or no questions use a single-select list with Yes followed by No. Use the arrow keys to select an option and Enter to confirm."));
		content.push(localize('chat.questionCustomAnswer', "When a custom answer is allowed, Down Arrow from the last option moves to the custom answer field below the options, and Up Arrow at the start of the field returns to the last option. In single-select questions, a selected option is the answer and any custom answer text is kept but ignored; typing in the field answers with the text instead."));
		content.push(localize('chat.previousQuestionCarouselQuestion', 'When a chat question is focused, move to the previous question{0}.', '<keybinding:workbench.action.chat.previousQuestion>'));
		content.push(localize('chat.nextQuestionCarouselQuestion', 'When a chat question is focused, move to the next question{0}.', '<keybinding:workbench.action.chat.nextQuestion>'));
		content.push(localize('chat.planReviewEditor', 'When a plan is ready for review, open it from the chat response to edit the plan and add line comments. Use the editor toolbar to navigate, clear, or submit feedback. Choose an implementation action from the plan review in Chat.'));
		content.push(localize('chat.focusNotice', 'When a tip, notification or introduction appears above the input, toggle focus between it and the chat input{0}.', '<keybinding:workbench.action.chat.focusTip>'));
		if (!isSessionsWindow) {
			content.push(localize('chat.remoteByokNotification', "If you have bring your own key (BYOK) models configured and select Copilot on a connected remote host, the first eligible chat input in this editor window shows a warning that these models are not supported. The warning does not repeat in other chats in the same window. Use Tab to reach Dismiss notification or Don't Show Again, then Enter or Space to activate it. Dismiss notification hides the warning until the window reloads. Don't Show Again permanently hides this warning for your profile, including when new models are added."));
		}
		content.push(localize('chat.sandboxUnavailable', "If the agent host cannot support the configured sandbox, a notification above the input explains why. You can select and copy the warning text. Use Tab to reach support links or Dismiss notification, and Enter to open a focused link. Dismissing hides the warning for this session until the window reloads, without changing sandboxing or preventing messages."));
		content.push(localize('chat.sandboxCertificateMissing', "If the agent host reports a missing sandbox certificate that it can install, an informational notice appears above the focused chat input. Installation is optional and chatting is not blocked. Dependency warnings take priority over this notice. Use Tab to reach Dismiss notification and Enter or Space to hide certificate notices for that host runtime in this window."));
		content.push(localize('chat.sandboxCertificateCommands', "Run Sandbox: Manage Trusted CA from the Command Palette{0}. Use Up and Down Arrow to choose an action, Enter to continue, or Escape to cancel.", '<keybinding:workbench.action.showCommands>'));
		content.push(localize('chat.sandboxCertificateInstall', "Use Tab to reach Learn more or Install in a certificate notice and Enter or Space to activate it. For a remote host without Install, run Sandbox: Manage Trusted CA in a local desktop window on that computer."));
		content.push(localize('chat.sandboxCertificateRefresh', "In a remote certificate notice, use Tab to reach Refresh and Enter or Space to check the certificate again."));
	}
	if (type !== 'inlineChat' && type !== 'quickChat') {
		content.push(localize('chat.btw', "In a conversation that supports side chats, type /btw followed by a question to open a side chat with the prior conversation as context. You can ask while a response is in progress without stopping it."));
		if (isSessionsWindow && sideChatsInSidePane) {
			content.push(getSideChatsInSidePaneAccessibilityHelp());
		}
		content.push(localize('chat.terminalConfirmationExplain', "In a conversation that supports side chats, when a terminal command needs approval, use Tab to reach Explain and press Enter or Space to open a side chat explaining the command. Return to the confirmation to allow or skip it."));
		if (responseSelectionSupported) {
			content.push(isSessionsWindow
				? localize('sessions.selectionSideChat', 'When you select text within an assistant response, an Ask Question input or selected text actions appear near the selection. Choose Ask in a Side Chat if a menu appears. Type a question and press Enter to start a new side chat scoped to that selection. Escape closes the input and returns focus to the response.')
				: localize('chat.selectionSideChat', 'Select text within an assistant response and open the context menu with Shift+F10 or the context menu key. Choose Ask in Side Chat... to open a small Ask Question input. Type a question and press Enter to open a side chat with conversation context through the selected response and its quoted text. Escape closes the input and returns focus to the response. Asking requires a writable conversation that supports side chats.'));
		}
		content.push(localize('sessions.requestOrigin', 'Some requests include a source chat button above the message. Use Tab to focus it, then Enter or Space to open the originating chat.'));
		if (isSessionsWindow) {
			content.push(localize('sessions.threadCoordinationResult', 'Completed create-session, create-chat, and send-message operations can include a target session or chat button in the response. Use Tab to focus it, Enter or Space to open it normally, or Alt+Enter (Option+Enter on macOS) to open it to the side.'));
		}
	}
	if (type === 'editsView' || type === 'agentView') {
		if (type === 'agentView') {
			content.push(localize('chatAgent.overview', 'The chat agent view is used to apply edits across files in your workspace, enable running commands in the terminal, and more.'));
		} else {
			content.push(localize('chatEditing.overview', 'The chat editing view is used to apply edits across files.'));
		}
		content.push(localize('chatEditing.format', 'It is comprised of an input box and a file working set (Shift+Tab).'));
		content.push(localize('chatEditing.review', 'Once the edits are applied, a sound will play to indicate the document has been opened and is ready for review. The sound can be disabled with accessibility.signals.chatEditModifiedFile.'));
		content.push(localize('chatEditing.sections', 'Navigate between edits in the editor with navigate previous{0} and next{1}', '<keybinding:chatEditor.action.navigatePrevious>', '<keybinding:chatEditor.action.navigateNext>'));
		content.push(localize('chatEditing.acceptHunk', 'In the editor, Keep{0}, Undo{1}, or Toggle the Diff{2} for the current Change.', '<keybinding:chatEditor.action.acceptHunk>', '<keybinding:chatEditor.action.undoHunk>', '<keybinding:chatEditor.action.toggleDiff>'));
		content.push(localize('chatEditing.undoKeepSounds', 'Sounds will play when a change is accepted or undone. The sounds can be disabled with accessibility.signals.editsKept and accessibility.signals.editsUndone.'));
		if (type === 'agentView') {
			content.push(localize('chatAgent.userActionRequired', 'An alert will indicate when user action is required. For example, if the agent wants to run something in the terminal, you will hear Action Required: Run Command in Terminal.'));
			content.push(localize('chatAgent.acceptTool', "To accept a tool action, use the Accept Tool Confirmation command{0}. When the confirmation carousel is shown, this activates the primary button of the selected confirmation. Disabled actions cannot be accepted.", '<keybinding:workbench.action.chat.acceptTool>'));
			content.push(localize('chatAgent.openEditedFilesSetting', 'By default, when edits are made to files, they will be opened. To change this behavior, set accessibility.openChatEditedFiles to false in your settings.'));
			content.push(localize('chatAgent.focusTodosView', 'To toggle focus between the Agent TODOs view and the chat input, use Agent TODOs: Toggle Focus{0}.', '<keybinding:workbench.action.chat.focusTodosView>'));
		}
		content.push(localize('chatEditing.helpfulCommands', 'Some helpful commands include:'));
		content.push(localize('workbench.action.chat.undoEdits', '- Undo Edits{0}.', '<keybinding:workbench.action.chat.undoEdits>'));
		content.push(localize('workbench.action.chat.restoreLastCheckpoint', '- Restore to Last Checkpoint{0}.', '<keybinding:workbench.action.chat.restoreLastCheckpoint>'));
		content.push(localize('workbench.action.chat.editing.attachFiles', '- Attach Files{0}.', '<keybinding:workbench.action.chat.editing.attachFiles>'));
		content.push(localize('chatEditing.removeFileFromWorkingSet', '- Remove File from Working Set{0}.', '<keybinding:chatEditing.removeFileFromWorkingSet>'));
		content.push(localize('chatEditing.acceptFile', '- Keep{0} and Undo File{1}.', '<keybinding:chatEditing.acceptFile>', '<keybinding:chatEditing.discardFile>'));
		content.push(localize('chatEditing.saveAllFiles', '- Save All Files{0}.', '<keybinding:chatEditing.saveAllFiles>'));
		content.push(localize('chatEditing.acceptAllFiles', '- Keep All Edits{0}.', '<keybinding:chatEditing.acceptAllFiles>'));
		content.push(localize('chatEditing.discardAllFiles', '- Undo All Edits{0}.', '<keybinding:chatEditing.discardAllFiles>'));
		content.push(localize('chatEditing.openFileInDiff', '- Open File in Diff{0}.', '<keybinding:chatEditing.openFileInDiff>'));
		content.push(`- ${ChatEditingShowChangesAction.LABEL}<keybinding:chatEditing.viewChanges>`);
		content.push(`- ${ViewPreviousEditsAction.Label}<keybinding:chatEditing.viewPreviousEdits>`);
	}
	else {
		content.push(localize('inlineChat.overview', "Inline chat occurs within a code editor and takes into account the current selection. It is useful for making changes to the current editor. For example, fixing diagnostics, documenting or refactoring code. Keep in mind that AI generated code may be incorrect."));
		content.push(localize('inlineChat.access', "It can be activated via code actions or directly using the command: Inline Chat: Start Inline Chat{0}.", '<keybinding:inlineChat.start>'));
		content.push(localize('inlineChat.requestHistory', 'In the input box, use Show Previous{0} and Show Next{1} to navigate your request history. Edit input and use enter or the submit button to run a new request.', '<keybinding:history.showPrevious>', '<keybinding:history.showNext>'));
		content.push(localize('inlineChat.inspectResponse', 'In the input box, inspect the response in the accessible view{0}.', '<keybinding:editor.action.accessibleView>'));
		content.push(localize('inlineChat.contextActions', "Context menu actions may run a request prefixed with a /. Type / to discover such ready-made commands."));
		content.push(localize('inlineChat.fix', "If a fix action is invoked, a response will indicate the problem with the current code. A diff editor will be rendered and can be reached by tabbing."));
		content.push(localize('inlineChat.diff', "Once in the diff editor, enter review mode with{0}. Use up and down arrows to navigate lines with the proposed changes.", AccessibleDiffViewerNext.id));
		content.push(localize('inlineChat.toolbar', "Use tab to reach conditional parts like commands, status, message responses and more."));
	}
	// Find is enabled on the chat view, chat editors and the Agents window, but not on quick
	// chat, inline chat or the input window (see `enableFind` in each host's view options).
	if (type === 'panelChat' || type === 'editsView' || type === 'agentView') {
		content.push(localize('chat.find', 'To search the chat transcript, invoke Find in Chat{0}. Find Next{1} and Find Previous{2} move between results, scrolling each one into view.', '<keybinding:workbench.action.chat.find>', '<keybinding:workbench.action.chat.findNext>', '<keybinding:workbench.action.chat.findPrevious>'));
	}
	if (!isSessionsWindow && (type === 'panelChat' || type === 'editsView' || type === 'agentView')) {
		content.push(localize('chat.renameSession', 'To rename the current chat session when supported, invoke the Rename command{0}. Agent Host sessions can be renamed after sending the first request.', `<keybinding:${AGENT_SESSION_RENAME_ACTION_ID}>`));
		content.push(localize('chat.sessionCustomizations', "In the Sessions list, open a session's context menu{0} and choose Open Customizations to manage the customizations for that session's harness and workspace. This action is disabled when multiple sessions are selected.", '<keybinding:editor.action.showContextMenu>'));
		content.push(localize('chat.markSessionsRead', "When the Sessions list has focus, mark the focused session or selected sessions as read{0} or unread{1} without opening them. These shortcuts do not apply while typing in an input.", `<keybinding:${AGENT_SESSION_MARK_READ_ACTION_ID}>`, `<keybinding:${AGENT_SESSION_MARK_UNREAD_ACTION_ID}>`));
		content.push(localize('chat.markNestedSessionRead', "The same read and unread shortcuts work on nested sessions and change only the targeted nested sessions, not their parent."));
		content.push(sessionArchiveActionWording === ChatSessionArchiveActionWording.MarkAsDone
			? localize('chat.markNestedSessionDone', "In the Sessions list, nested Agent Host chats, including /btw side chats, offer Mark as Done in their row toolbar and context menu when supported by the host. This marks only the targeted chats as done, not their parent session. Enable Done in the Sessions list filter to show them again, then choose Restore.")
			: localize('chat.archiveNestedSession', "In the Sessions list, nested Agent Host chats, including /btw side chats, offer Archive in their row toolbar and context menu when supported by the host. This archives only the targeted chats, not their parent session. Enable Archived in the Sessions list filter to show them again, then choose Unarchive."));
	}
	if (type === 'panelChat' || type === 'editsView' || type === 'agentView') {
		content.push(localize('chat.forkSession', "In an Agent Host chat that supports forking, type /fork to create a forked chat beside the current one. Add a title after /fork to name it, or type /fork prompt followed by a prompt to also send that prompt in the new chat."));
	}
	if (type !== 'inlineChat') {
		content.push(localize('chat.linkContextMenu', "Focus a link in the chat transcript and press Shift+F10 to open its context menu. Use Copy Link to copy its target. File links with additional editor choices also provide Open With."));
	}
	if (!isSessionsWindow && (type === 'panelChat' || type === 'editsView' || type === 'agentView')) {
		content.push(localize('chat.editorCopySessionLink', "For an Agent Host chat editor, open the editor tab context menu and choose Copy Link to copy a session URL that renders as a session link in Markdown. Selecting multiple chat tabs copies one link per line."));
	}
	content.push(localize('chat.attachments.pastedText', "Long pasted text, including single-line text, is stored as an attached text item and replaced in the input with a numbered inline reference."));
	content.push(localize('chat.paste.asText', "To paste the clipboard as plain text, without converting it to Markdown or storing it as an attachment, invoke Paste as Text{0}.", '<keybinding:editor.action.pasteAsText>'));
	content.push(localize('chat.signals', "Use accessibility.signals.chat settings to control chat sounds and announcements."));
	return content.join('\n');
}

export function getChatAccessibilityHelpProvider(accessor: ServicesAccessor, editor: ICodeEditor | undefined, type: 'panelChat' | 'inlineChat' | 'quickChat' | 'editsView' | 'agentView'): AccessibleContentProvider | undefined {
	const widgetService = accessor.get(IChatWidgetService);
	const keybindingService = accessor.get(IKeybindingService);
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
	const configurationService = accessor.get(IConfigurationService);
	const widget = widgetService.lastFocusedWidget;

	if (!widget) {
		return;
	}
	const inputEditor: ICodeEditor = widget.inputEditor;
	const domNode = inputEditor.getDomNode() ?? undefined;
	if (!domNode) {
		return;
	}

	const cachedPosition = inputEditor.getPosition();
	const focusedElement = getActiveElement();
	const workingSetFocus = isHTMLElement(focusedElement) && focusedElement.closest('.chat-session-working-set') ? focusedElement : undefined;
	inputEditor.getSupportedActions();
	const isInlineChat = isIChatResourceViewContext(widget.viewContext) && widget.viewContext.isInlineChat;
	const helpText = getAccessibilityHelpText(type, keybindingService, widget.supportsFileReferences, environmentService.isSessionsWindow, isStickyPromptHeaderShown(widget, configurationService), !widget.rendersInputOnTop && !isInlineChat, widget.inputPart.hasSessionArchiveNudge, getChatSessionArchiveActionWording(configurationService), accessor.get(ICodexContinuationService).isVisible.get(), configurationService.getValue<boolean>(LocalModelEnabledSettingId) === true, undefined, widget.inputPart.hasSessionWorkingSet, widget.inputPart.hasSessionWorkingSetUndo, widget.inputPart.sessionWorkingSet?.keepUndoEnabled, !!widget.input.inlineAttachments?.isEnabled, configurationService.getValue<boolean>(ChatResourcesEnabledSettingId) === true, configurationService.getValue<boolean>(ChatConfiguration.AppWindowScreenshotsEnabled) === true, ChatContextKeys.sideChatsInSidePane.getValue(accessor.get(IContextKeyService)) === true && getWindow(domNode) === mainWindow, !environmentService.isSessionsWindow && getPromptTimelineRailStyle(widget, configurationService, false) === 'gutter');
	return new AccessibleContentProvider(
		type === 'panelChat' ? AccessibleViewProviderId.PanelChat : type === 'inlineChat' ? AccessibleViewProviderId.InlineChat : type === 'agentView' ? AccessibleViewProviderId.AgentChat : AccessibleViewProviderId.QuickChat,
		{ type: AccessibleViewType.Help },
		() => helpText,
		() => {
			if (workingSetFocus?.isConnected) {
				workingSetFocus.focus();
				return;
			}
			if (type === 'quickChat' || type === 'editsView' || type === 'agentView' || type === 'panelChat') {
				if (cachedPosition) {
					inputEditor.setPosition(cachedPosition);
				}
				inputEditor.focus();

			} else if (type === 'inlineChat') {
				// TODO@jrieken find a better way for this
				const ctrl = <{ focus(): void } | undefined>editor?.getContribution(INLINE_CHAT_ID);
				ctrl?.focus();

			}
		},
		type === 'inlineChat' ? AccessibilityVerbositySettingId.InlineChat : AccessibilityVerbositySettingId.Chat,
	);
}

// The when clauses for actions may not be true when we invoke the accessible view, so we need to provide the keybinding label manually
// to ensure it's correct
function getChatFocusKeybindingLabel(keybindingService: IKeybindingService, type: 'agentView' | 'panelChat' | 'inlineChat' | 'quickChat', focus?: 'lastFocused' | 'last' | 'input'): string | undefined {
	let kbs;
	const fallback = ' (unassigned keybinding)';
	if (focus === 'input') {
		kbs = keybindingService.lookupKeybindings('workbench.action.chat.focusInput');
	} else if (focus === 'lastFocused') {
		kbs = keybindingService.lookupKeybindings('workbench.chat.action.focusLastFocused');
	} else {
		kbs = keybindingService.lookupKeybindings('chat.action.focus');
	}
	if (!kbs?.length) {
		return fallback;
	}
	let kb;
	if (type === 'agentView' || type === 'panelChat') {
		if (focus !== 'input') {
			kb = kbs.find(kb => kb.getAriaLabel()?.includes('UpArrow'))?.getAriaLabel();
		} else {
			kb = kbs.find(kb => kb.getAriaLabel()?.includes('DownArrow'))?.getAriaLabel();
		}
	} else {
		// Quick chat
		if (focus !== 'input') {
			kb = kbs.find(kb => kb.getAriaLabel()?.includes('DownArrow'))?.getAriaLabel();
		} else {
			kb = kbs.find(kb => kb.getAriaLabel()?.includes('UpArrow'))?.getAriaLabel();
		}
	}
	return !!kb ? ` (${kb})` : fallback;
}
