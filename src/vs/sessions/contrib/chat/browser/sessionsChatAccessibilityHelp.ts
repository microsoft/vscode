/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { CustomViewVisibleContext } from '../../../common/contextkeys.js';
import { localize } from '../../../../nls.js';
import { FOCUS_AI_CUSTOMIZATION_VIEW_ID } from '../../aiCustomizationTreeView/browser/aiCustomizationTreeView.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID } from './promptTemplatePlaceholder.js';
import { ARCHIVE_SESSION_COMMAND_ID, FOCUS_ACTIVE_SESSION_COMMAND_ID, FOCUS_NEXT_CHAT_GROUP_COMMAND_ID, FOCUS_PREVIOUS_CHAT_GROUP_COMMAND_ID, MOVE_CHAT_TO_NEXT_GROUP_COMMAND_ID, MOVE_CHAT_TO_PREVIOUS_GROUP_COMMAND_ID, RENAME_CHAT_COMMAND_ID, RENAME_SESSION_COMMAND_ID, SPLIT_CHAT_GROUP_DOWN_COMMAND_ID, SPLIT_CHAT_GROUP_RIGHT_COMMAND_ID } from '../../../common/sessionCommands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { SESSION_ARCHIVE_NUDGE_SETTING } from './sessionArchiveNudge.js';
export class SessionsChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'sessionsChat';
	readonly type = AccessibleViewType.Help;
	// A custom view replaces the chat surface this help describes, so it does not apply then.
	readonly when = ContextKeyExpr.and(IsSessionsWindowContext, CustomViewVisibleContext.negate());

	getProvider(accessor: ServicesAccessor) {
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionsService = accessor.get(ISessionsService);
		const previouslyFocused = getActiveElement();

		const content: string[] = [];
		content.push(localize('sessionsChat.overview', "You are in the Agents window. The Agents window is a dedicated workspace for working with AI agents. It provides a chat interface, a changes view for reviewing agent-generated changes, a file explorer, and customization options."));
		content.push(localize('sessionsChat.input', "You are in the chat input. Type a message and press Enter to send it."));
		content.push(localize('sessionsChat.inputPills', "When session metadata or active-turn status pills appear above the input, press Tab to reach them, use the Left and Right arrow keys to move between them, and press Enter or Space to activate one. Open the context menu{0} to choose which pills are shown. Pull Requests Options lets you show all pull requests or only open and draft ones, remembered across sessions. If every pull request is filtered out, use the toolbar context menu to show all again.", '<keybinding:editor.action.showContextMenu>'));
		content.push(localize('sessionsChat.externalSessionFilter', "The Sessions list Filter menu includes an External submenu. Use it to choose whether external sessions from another application are shown for the last 24 hours, the last 7 days, always, or not at all."));
		content.push(localize('sessionsChat.externalSessionBanner', "When you first open a session created in another application, a banner appears at the top of the chat. Use Tab to reach its external-session picker, choose an option, and activate Save. The Close action dismisses the banner without changing the setting. Saving or closing permanently dismisses the banner."));
		content.push(localize('sessionsChat.delegatedMessage', "Messages sent by another session or chat show a source annotation above the message. Press Tab to focus the annotation, then press Enter or Space to open the source chat."));
		content.push(localize('sessionsChat.createdBySession', "When a session was created by another session, focus it in the Sessions list and use the Show Hover command{0}. Move focus to the Created by link, then press Enter or Space to open the creator session.", '<keybinding:workbench.action.showHover>'));
		content.push(localize('sessionsChat.promptOptions', "When prompt options appear above the new-session input, use Tab and Shift+Tab to move between them, then press Enter or Space to insert one. You can select a different option while the input is empty, exactly matches the inserted prompt, or only has its editable placeholder removed; other edits disable the options without hiding them. Clearing the input also clears the selected option. Use the Close action to hide the options and return focus to the input."));
		content.push(localize('sessionsChat.promptTemplatePlaceholder', "When the new-session prompt contains a highlighted task placeholder, place the caret inside it and replace it{0} to type your task.", `<keybinding:${REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID}>`));
		content.push(localize('sessionsChat.feedbackComments', "When pull requests have failing checks or unreviewed comments, one banner appears above the input. If several pull requests need attention, use the Previous Banner and Next Banner buttons to move between them. A pull request with both failing checks and comments uses a split button: activate the main action to address both, or use its More Actions button to address only the checks or comments. In-product agent review comments appear as their own carousel item."));
		if (accessor.get(IConfigurationService).getValue<boolean>(SESSION_ARCHIVE_NUDGE_SETTING)) {
			content.push(localize('sessionsChat.archiveNudge', "When all GitHub pull request artifacts have merged and no chat is working or waiting for input, an archive suggestion may appear above the chat input. Use Tab or Shift+Tab to reach Archive or Close, then Enter or Space to activate it. Close hides the suggestion for this session, including after a reload, until it is archived or deleted. Archiving marks the session as done. The conversation remains available to you and your agents; use the session list filter to find it and unarchive it at any time. For worktree sessions, archiving cleans up the worktree and unarchiving recreates it."));
		}
		content.push(localize('sessionsChat.feedbackAttachment', "When a feedback comments attachment appears above the input, focus it and press Enter or Space. A single comment opens directly. Multiple comments open a tree grouped by file; use the arrow keys to navigate, Enter to reveal a comment, and Escape to close the tree."));
		content.push(localize('sessionsChat.inputBackground', "Press Alt+Enter to start the session in the background without navigating into it. The started session appears in the Chat Sessions view."));
		content.push(localize('sessionsChat.workspace', "Shift+Tab to navigate to the workspace picker and choose a workspace for your session. When consolidated remote workspaces are enabled, opening the picker focuses its search input so you can immediately type to filter workspaces. If quick chats are available, you can also choose No workspace to start a workspace-less chat."));
		content.push(localize('sessionsChat.githubContext', "Use Add Context to attach files, images, and, when available, GitHub issues or pull requests."));
		content.push(localize('sessionsChat.devContainer', "When Dev Container Agent Host sessions are enabled, Docker is available, and the selected local folder contains a Dev Container configuration, a Dev Container checkbox appears before New Worktree. Select it to run the session on an Agent Host inside that folder's Dev Container."));
		content.push(localize('sessionsChat.pullRequestSession', "In a repository section where New Session is a split button, focus New Session and press Right Arrow to reach its dropdown, then activate New Session from Pull Request to open a searchable pull request picker. Pull requests are grouped by review and assignment status. Use the arrow keys to navigate, Enter to create the session, and Escape to close the picker."));
		content.push(localize('sessionsChat.githubReferences', "Pull request and issue pills above the chat input open their GitHub item in the GitHub Pull Requests extension when it is available. Pills that represent several items open a keyboard-accessible picker."));
		content.push(localize('sessionsChat.failingChecksPullRequest', "When a session pull request has failing checks, use Reveal in its banner item to open that pull request, or use Fix Checks to ask the agent to address the failures."));
		content.push(localize('sessionsChat.pickFolderQuickPick', "To choose a folder from a searchable list instead, use the New Session in Folder command{0}.", '<keybinding:workbench.action.sessions.newSession.pickFolderQuickPick>'));
		content.push(localize('sessionsChat.quickChat', "To start a workspace-less quick chat, use the New Quick Chat command{0} or the plus button on the Chats section in the sessions list. When consolidated remote workspaces are enabled, this opens the new-session composer, where you can choose No workspace. Otherwise, it starts a workspace-less chat directly. The Toggle Side Panel command is disabled for quick chats.", '<keybinding:sessionsView.newQuickChat>'));
		content.push(localize('sessionsChat.mobileConfig', "On mobile, the mode and model pickers appear as tappable chips below the input. Tap a chip to open a bottom sheet where you can change the selection."));
		content.push(localize('sessionsChat.history', "Use up and down arrows to navigate your request history in the input box."));
		content.push(localize('sessionsChat.background', "Outside high contrast themes, use Set Background to choose no background, the built-in theme-aware Codicons pattern, a new image, or one of the five most recently selected images. Use Change Background Layout to choose whether an image repeats, stretches, or appears at an edge or corner for the current color theme. Moving through the layout picker previews each option; select one to save it, or press Escape to restore the previous layout. Both commands are available from the Command Palette and by right-clicking empty chat space. Change Background Layout is shown only for images. Background customization is unavailable while a high contrast theme is active."));
		content.push(localize('sessionsChat.vscodePet', "Use the checked Pet item in the new-session view context menu, or type /vscode-pet, to show or hide the VS Code pet above the input. Drag it horizontally to reposition it, or use Tab to focus it and the left and right arrow keys to move it. Press Enter or Space to show it some love."));
		content.push(localize('sessionsChat.vscodePetAchievements', "When the pet is enabled, the user account menu lists unlocked achievement badges before locked badges and provides a View Achievements button. A gold star on the pet announces a newly unlocked achievement; activate the pet while the star is visible to open Achievements."));
		content.push(localize('sessionsChat.aquariumAction', "To show or hide the aquarium action on the new-session view, use the checked Aquarium item in the context menu outside the composer, or run the Toggle Aquarium Action Visibility command."));
		content.push(localize('sessionsChat.dictation', "When dictation is configured, dictate your message into the input{0}. Tap to start and stop, or hold to dictate only while pressed. If the speech-to-text model is still preparing, activate the dictation control again to cancel.", '<keybinding:sessions.action.chat.toggleDictation>'));
		content.push(localize('sessionsChat.voiceMode', "Start or stop Voice Mode to interact with the agent using your microphone{0}.", '<keybinding:agentsVoice.startVoiceInChat>'));
		content.push(localize('sessionsChat.micContextMenu', "To choose a microphone or turn off dictation or Voice Mode, focus the microphone button in the input toolbar and open its context menu (for example Shift+F10)."));
		content.push(localize('sessionsChat.contextReferences', "Type # in the chat input to attach context. Use #file to reference a file or folder, or #session to reference another agent session. Referencing a session together with the /troubleshoot command analyzes that session's logs instead of the current one. Accept a suggestion with Tab or Enter. Openable references appear as buttons above the input; activate one to open it, or use its Remove button to detach it."));
		content.push(localize('sessionsChat.pastedText', "Long pasted text is stored as an attached text item and replaced in the input with a numbered inline reference."));
		content.push(localize('sessionsChat.pasteAsText', "To paste the clipboard as plain text, without converting it to Markdown or storing it as an attachment, invoke Paste as Text{0}.", '<keybinding:editor.action.pasteAsText>'));
		content.push(localize('sessionsChat.backgroundActivities', "Press Shift+Tab from the chat input to reach metadata and status pills above it, then press Enter or Space to activate a pill. Live browsers appear in their own pill, and the chat's subagents of any status appear in another. A pill with more than one entry opens a picker; use the up and down arrows to navigate, Enter to open an entry, and Escape to dismiss the picker and return focus to the pill."));
		content.push(localize('sessionsChat.conversations', "When multiple chats appear as tabs in a single group, the tab row replaces the session header and includes the session actions. Side-by-side chat groups retain the session header and keep their tab rows compact."));
		content.push(localize('sessionsChat.sessionsListChats', "Sessions with multiple user-facing chats show those chats nested beneath the session in the Sessions list. Use the arrow keys to navigate the list and Enter to open a chat. Side chats and subagent chats are omitted from this nested list: side chats are reachable from the Side Chats dropdown in the session's overflow menu, and subagent chats open from their pills in the chat transcript."));
		content.push(localize('sessionsChat.sessionsListChatContextMenu', "Open a nested chat's context menu to rename it, open it to the side, or, when supported, permanently delete it. Agent Host chats also offer Copy Link."));
		content.push(localize('sessionsChat.copySessionLink', "To copy a browser link that opens an Agent Host session in the Agents window, open the session's context menu and choose Copy Link."));
		content.push(localize('sessionsChat.subagentPills', "Subagent pills in the chat transcript can be dragged to a chat group's edge to open the subagent beside the current chat. With the keyboard, focus a subagent pill and press Alt+Enter to open it beside the current chat."));
		content.push(localize('sessionsChat.chatGroups', "Chats can be arranged in groups. Focus the previous group{0} or next group{1}. Split the active chat into a group to the right{2} or below{3}, or move it to the previous group{4} or next group{5}.", `<keybinding:${FOCUS_PREVIOUS_CHAT_GROUP_COMMAND_ID}>`, `<keybinding:${FOCUS_NEXT_CHAT_GROUP_COMMAND_ID}>`, `<keybinding:${SPLIT_CHAT_GROUP_RIGHT_COMMAND_ID}>`, `<keybinding:${SPLIT_CHAT_GROUP_DOWN_COMMAND_ID}>`, `<keybinding:${MOVE_CHAT_TO_PREVIOUS_GROUP_COMMAND_ID}>`, `<keybinding:${MOVE_CHAT_TO_NEXT_GROUP_COMMAND_ID}>`));
		content.push(localize('sessionsChat.closeChat', "Activate a chat tab's close button to close (hide) that chat from the tab strip without deleting it; reopen it later from the Chats menu. The session's main chat cannot be closed."));
		content.push(localize('sessionsChat.deleteChat', "To permanently delete a chat, open the chat tab's context menu and choose Delete Chat. This is destructive and cannot be undone."));
		content.push(localize('sessionsChat.promptTimeline', "When the prompt timeline is enabled, a handle on the left edge of the transcript lists your prompts. Activate it to expand the list, use the up and down arrows (or Home and End) to move between prompts, Enter or Space to jump to a prompt, and Escape to dismiss the list and return focus to the handle. When a prompt title is pinned above the transcript, activate its title to jump to that prompt."));
		content.push(localize('sessionsChat.find', "To search the chat transcript, invoke Find in Chat{0}. Find Next{1} and Find Previous{2} move between results, scrolling each one into view.", '<keybinding:workbench.action.chat.find>', '<keybinding:workbench.action.chat.findNext>', '<keybinding:workbench.action.chat.findPrevious>'));
		content.push(localize('sessionsChat.focusActiveSession', "Focus the active session{0}. The default Open Chat (Agent) shortcut also focuses the active session in the Agents window.", `<keybinding:${FOCUS_ACTIVE_SESSION_COMMAND_ID}>`));
		content.push(localize('sessionsChat.goBack', "Go back through visited sessions{0}.", '<keybinding:sessions.goBack>'));
		content.push(localize('sessionsChat.goForward', "Go forward through visited sessions{0}.", '<keybinding:sessions.goForward>'));
		content.push(localize('sessionsChat.navigatePreviousSession', "Navigate to the previous session in the list{0}.", '<keybinding:sessionsViewPane.navigatePreviousSession>'));
		content.push(localize('sessionsChat.navigateNextSession', "Navigate to the next session in the list{0}.", '<keybinding:sessionsViewPane.navigateNextSession>'));
		content.push(localize('sessionsChat.renameSession', "To rename a session, focus its row in the Sessions list or focus its main chat transcript or input, then invoke Rename{0}. You can also double-click its title in the Sessions list or open its context menu and choose Rename.", `<keybinding:${RENAME_SESSION_COMMAND_ID}>`));
		content.push(localize('sessionsChat.renameChat', "When Rename is available for a non-main chat, focus its transcript or input or its nested row in the Sessions list, then invoke Rename{0}.", `<keybinding:${RENAME_CHAT_COMMAND_ID}>`));
		content.push(localize('sessionsChat.archiveSession', "To archive or mark one or more sessions as done, focus them in the Sessions list and invoke Archive or Mark as Done{0}.", `<keybinding:${ARCHIVE_SESSION_COMMAND_ID}>`));
		content.push(localize('sessionsChat.deleteSession', "To permanently delete a session, open its context menu and choose Delete. This is destructive and cannot be undone."));
		content.push(localize('sessionsChat.changes', "Focus the Changes view{0}.", '<keybinding:workbench.action.agentSessions.focusChangesView>'));
		content.push(localize('sessionsChat.viewAllChanges', "Status pills above the chat input include the session's diff stats (lines added and removed). Activate the Changes pill to open the multi-file diff editor for all of the session's changes{0}.", '<keybinding:workbench.agentSessions.action.viewChanges>'));
		content.push(localize('sessionsChat.openPullRequest', "When the session is associated with GitHub pull requests, a status pill above the chat input shows the pull request number or count. Activate it to open a single pull request or choose from the associated pull requests{0}.", '<keybinding:workbench.agentSessions.action.openPullRequest>'));
		content.push(localize('sessionsChat.filesView', "Focus the Files Explorer view{0}.", '<keybinding:workbench.action.agentSessions.focusChangesFileView>'));
		content.push(localize('sessionsChat.sessionsView', "Focus the Chat Sessions view{0}.", '<keybinding:workbench.action.chat.focusAgentSessionsViewer>'));
		content.push(accessor.get(IConfigurationService).getValue<boolean>(ChatConfiguration.CustomizationEntryPoints)
			? localize('sessionsChat.openCustomizations', "Open the Chat Customizations overview{0}.", `<keybinding:${FOCUS_AI_CUSTOMIZATION_VIEW_ID}>`)
			: localize('sessionsChat.focusCustomizations', "Focus the Chat Customizations view{0}.", `<keybinding:${FOCUS_AI_CUSTOMIZATION_VIEW_ID}>`));
		content.push(localize('sessionsChat.toggleSidePanel', "Toggle the side panel (the editor area together with the auxiliary bar) open or closed{0}.", '<keybinding:workbench.action.agentToggleSidePanel>'));

		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsChat,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => {
				if (isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
					previouslyFocused.focus();
					return;
				}
				const view = sessionsPartService.getSessionView(sessionsService.activeSession.get()?.sessionId);
				view?.focus();
			},
			AccessibilityVerbositySettingId.SessionsChat,
		);
	}
}
