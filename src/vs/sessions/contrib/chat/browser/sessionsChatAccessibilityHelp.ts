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
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionsChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'sessionsChat';
	readonly type = AccessibleViewType.Help;
	readonly when = IsSessionsWindowContext;

	getProvider(accessor: ServicesAccessor) {
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);

		const content: string[] = [];
		content.push(localize('sessionsChat.overview', "You are in the Agents window. The Agents window is a dedicated workspace for working with AI agents. It provides a chat interface, a changes view for reviewing agent-generated changes, a file explorer, and customization options."));
		content.push(localize('sessionsChat.input', "You are in the chat input. Type a message and press Enter to send it."));
		content.push(localize('sessionsChat.inputBackground', "Press Alt+Enter to start the session in the background without navigating into it. The started session appears in the Chat Sessions view."));
		content.push(localize('sessionsChat.workspace', "Shift+Tab to navigate to the workspace picker and choose a workspace for your session."));
		content.push(localize('sessionsChat.mobileConfig', "On mobile, the mode and model pickers appear as tappable chips below the input. Tap a chip to open a bottom sheet where you can change the selection."));
		content.push(localize('sessionsChat.history', "Use up and down arrows to navigate your request history in the input box."));
		content.push(localize('sessionsChat.navigatePreviousSession', "Navigate to the previous session in the list{0}.", '<keybinding:sessionsViewPane.navigatePreviousSession>'));
		content.push(localize('sessionsChat.navigateNextSession', "Navigate to the next session in the list{0}.", '<keybinding:sessionsViewPane.navigateNextSession>'));
		content.push(localize('sessionsChat.changes', "Focus the Changes view{0}.", '<keybinding:workbench.action.agentSessions.focusChangesView>'));
		content.push(localize('sessionsChat.filesView', "Focus the Files Explorer view{0}.", '<keybinding:workbench.action.agentSessions.focusChangesFileView>'));
		content.push(localize('sessionsChat.sessionsView', "Focus the Chat Sessions view{0}.", '<keybinding:workbench.action.chat.focusAgentSessionsViewer>'));
		content.push(localize('sessionsChat.customizations', "Focus the Chat Customizations view{0}.", `<keybinding:${FOCUS_AI_CUSTOMIZATION_VIEW_ID}>`));

		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsChat,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => {
				const view = sessionsPartService.getSessionView(sessionsManagementService.activeSession.get()?.sessionId);
				view?.focus();
			},
			AccessibilityVerbositySettingId.SessionsChat,
		);
	}
}
