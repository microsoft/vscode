/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { Extensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, WindowEnablement } from '../../../../workbench/common/views.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { PROJECT_BOARD_CHAT_CONTAINER_ID, PROJECT_BOARD_CHAT_VIEW_ID, ProjectBoardChatAvailableContext, ProjectBoardChatFocusContext, ProjectBoardChatViewPane } from './projectBoardChatSidePanel.js';

const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({
	id: PROJECT_BOARD_CHAT_CONTAINER_ID,
	title: localize2('kanban.chat', "Kanban Chat"),
	icon: Codicon.commentDiscussion,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [PROJECT_BOARD_CHAT_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	hideIfEmpty: true,
	windowEnablement: WindowEnablement.Sessions,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([{
	id: PROJECT_BOARD_CHAT_VIEW_ID,
	name: localize2('kanban.chat', "Kanban Chat"),
	ctorDescriptor: new SyncDescriptor(ProjectBoardChatViewPane),
	canToggleVisibility: false,
	canMoveView: false,
	when: ContextKeyExpr.and(ProjectBoardChatAvailableContext, ChatContextKeys.enabled),
	windowEnablement: WindowEnablement.Sessions,
}], container);

// ChatWidget supplies the existing response Accessible View and chat verbosity setting.
AccessibleViewRegistry.register({
	type: AccessibleViewType.Help,
	priority: 125,
	name: 'kanbanChat',
	when: ContextKeyExpr.and(ProjectBoardChatFocusContext, ChatContextKeys.enabled),
	getProvider: () => {
		const focused = getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.PanelChat,
			{ type: AccessibleViewType.Help },
			() => [
				localize('kanban.chatHelp.overview', "You are in the chat side panel beside Kanban. This panel shows the exact chat selected on the board without changing the main session."),
				localize('kanban.chatHelp.input', "Type in the chat input and press Enter to send. Use Tab and Shift+Tab to move among the input, model and agent pickers, and chat actions. Read-only chats have no composer."),
				localize('kanban.chatHelp.transcript', "Use Open Accessible View{0} to read chat responses. Use Find{1} to search the transcript.", '<keybinding:editor.action.accessibleView>', '<keybinding:actions.find>'),
				localize('kanban.chatHelp.close', "Use the Close Chat button in the panel header to return focus to the originating card. Closing this panel preserves the input and does not stop running agents."),
			].join('\n'),
			() => { if (isHTMLElement(focused) && focused.isConnected) { focused.focus(); } },
			AccessibilityVerbositySettingId.Chat,
		);
	},
});
