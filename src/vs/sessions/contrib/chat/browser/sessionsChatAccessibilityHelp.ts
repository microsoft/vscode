/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { localize } from '../../../../nls.js';
import { FOCUS_AI_CUSTOMIZATION_VIEW_ID } from '../../aiCustomizationTreeView/browser/aiCustomizationTreeView.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
export class SessionsChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'sessionsChat';
	readonly type = AccessibleViewType.Help;
	readonly when = IsSessionsWindowContext;

	getProvider(accessor: ServicesAccessor) {
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionsService = accessor.get(ISessionsService);

		const content: string[] = [];
		content.push(localize('sessionsChat.overview', "You are in the Agents window. The Agents window is a dedicated workspace for working with AI agents. It provides a chat interface, a changes view for reviewing agent-generated changes, a file explorer, and customization options."));
		content.push(localize('sessionsChat.input', "You are in the chat input. Type a message and press Enter to send it."));
		content.push(localize('sessionsChat.inputBackground', "Press Alt+Enter to start the session in the background without navigating into it. The started session appears in the Chat Sessions view."));
		content.push(localize('sessionsChat.workspace', "Shift+Tab to navigate to the workspace picker and choose a workspace for your session."));
		content.push(localize('sessionsChat.quickChat', "To start a workspace-less quick chat, use the New Quick Chat command{0} or the plus button on the Chats section in the sessions list. A quick chat has no workspace, so the workspace picker does not apply and the Toggle Side Panel command is disabled.", '<keybinding:sessionsView.newQuickChat>'));
		content.push(localize('sessionsChat.mobileConfig', "On mobile, the mode and model pickers appear as tappable chips below the input. Tap a chip to open a bottom sheet where you can change the selection."));
		content.push(localize('sessionsChat.history', "Use up and down arrows to navigate your request history in the input box."));
		content.push(localize('sessionsChat.dictation', "When speech to text is configured, dictate your message into the input using on-device speech to text{0}. Tap to start and stop, or hold to dictate only while pressed.", '<keybinding:sessions.action.chat.toggleDictation>'));
		content.push(localize('sessionsChat.contextReferences', "Type # in the chat input to attach context. Use #file to reference a file or folder, or #session to reference another agent session. Referencing a session together with the /troubleshoot command analyzes that session's logs instead of the current one. Accept a suggestion with Tab or Enter; the reference appears as a pill above the input that you can remove."));
		content.push(localize('sessionsChat.backgroundActivities', "Press Shift+Tab from the chat input to reach status pills above it, then press Enter or Space to activate a pill. A pill with multiple background activities opens a picker; use the up and down arrows to navigate, Enter to open an activity, and Escape to dismiss the picker and return focus to the pill."));
		content.push(localize('sessionsChat.conversations', "When a session supports multiple chats, a New Chat button is always shown: as a labeled button in the session header while the session has a single open chat, and as a compact button at the end of the chat tab strip once the session has more than one open chat. Activate it to start a new chat. Once the session has more than one committed chat, a Conversations menu is also shown: in the session header while the tab strip is hidden, and at the end of the chat tab strip once it is shown. Open it to reopen a closed chat: each chat is listed with a checkbox, where checked chats are shown as tabs and unchecked chats are closed (hidden)."));
		content.push(localize('sessionsChat.closeChat', "Activate a chat tab's close button to close (hide) that chat from the tab strip without deleting it; reopen it later from the Conversations menu. The session's main chat cannot be closed."));
		content.push(localize('sessionsChat.deleteChat', "To permanently delete a chat, open the chat tab's context menu and choose Delete Chat. This is destructive and cannot be undone."));
		content.push(localize('sessionsChat.navigatePreviousSession', "Navigate to the previous session in the list{0}.", '<keybinding:sessionsViewPane.navigatePreviousSession>'));
		content.push(localize('sessionsChat.navigateNextSession', "Navigate to the next session in the list{0}.", '<keybinding:sessionsViewPane.navigateNextSession>'));
		content.push(localize('sessionsChat.changes', "Focus the Changes view{0}.", '<keybinding:workbench.action.agentSessions.focusChangesView>'));
		content.push(localize('sessionsChat.viewAllChanges', "The session header shows the diff stats (lines added and removed) as a button. Activate it to open the multi-file diff editor for all of the session's changes{0}.", '<keybinding:workbench.agentSessions.action.viewChanges>'));
		content.push(localize('sessionsChat.openPullRequest', "When the session is associated with a GitHub pull request, the session header shows the pull request number as a button. Activate it to open the pull request on GitHub{0}.", '<keybinding:workbench.agentSessions.action.openPullRequest>'));
		content.push(localize('sessionsChat.filesView', "Focus the Files Explorer view{0}.", '<keybinding:workbench.action.agentSessions.focusChangesFileView>'));
		content.push(localize('sessionsChat.sessionsView', "Focus the Chat Sessions view{0}.", '<keybinding:workbench.action.chat.focusAgentSessionsViewer>'));
		content.push(localize('sessionsChat.customizations', "Focus the Chat Customizations view{0}.", `<keybinding:${FOCUS_AI_CUSTOMIZATION_VIEW_ID}>`));
		content.push(localize('sessionsChat.toggleSidePanel', "Toggle the side panel (the editor area together with the auxiliary bar) open or closed{0}.", '<keybinding:workbench.action.agentToggleSidePanel>'));

		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsChat,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => {
				const view = sessionsPartService.getSessionView(sessionsService.activeSession.get()?.sessionId);
				view?.focus();
			},
			AccessibilityVerbositySettingId.SessionsChat,
		);
	}
}
