/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../../workbench/browser/editor.js';
import { EditorExtensions } from '../../../../../workbench/common/editor.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { Menus } from '../../../../browser/menus.js';
import { RemotesEditorInput } from '../browser/remotesEditorInput.js';
import { RemotesEditor, RemotesEditorFocusedContext } from './remotesEditor.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../chat/common/constants.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(RemotesEditor, RemotesEditor.ID, localize('remotes.editorLabel', "Remote Environments")),
	[new SyncDescriptor(RemotesEditorInput)],
);

registerAction2(class extends Action2 {
	constructor() {
		const enabled = ContextKeyExpr.and(
			ChatContextKeys.enabled,
			ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
			ContextKeyExpr.equals(`config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`, true),
			ContextKeyExpr.equals(`config.${ENVIRONMENT_PICKER_SETTING}`, true),
		);
		super({
			id: OPEN_REMOTES_EDITOR_COMMAND_ID,
			title: localize2('remotes.openEditor', "Manage Remote Environments"),
			category: SessionsCategories.Sessions,
			icon: Codicon.remote,
			f1: true,
			precondition: enabled,
			menu: {
				id: Menus.SidebarSessionsHeader,
				group: 'manage',
				order: 0,
				when: ContextKeyExpr.and(enabled, IsPhoneLayoutContext.negate()),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		if (!accessor.get(IConfigurationService).getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING)) {
			throw new Error(localize('remotes.managementDisabled', "Remote Environments management is disabled."));
		}
		if (!accessor.get(IConfigurationService).getValue<boolean>(ENVIRONMENT_PICKER_SETTING)) {
			throw new Error(localize('remotes.environmentPickerDisabled', "The Environment picker is disabled."));
		}
		if (!accessor.get(IConfigurationService).getValue<boolean>(RemoteAgentHostsEnabledSettingId) || accessor.get(IChatEntitlementService).sentiment.hidden) {
			throw new Error(localize('remotes.editorDisabled', "Remote agent hosts are disabled."));
		}
		await accessor.get(IEditorService).openEditor(RemotesEditorInput.getOrCreate(), { pinned: true });
	}
});

class RemotesAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 125;
	readonly name = 'remotes';
	readonly when = ContextKeyExpr.and(ChatContextKeys.enabled, RemotesEditorFocusedContext);

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof RemotesEditor)) {
			return undefined;
		}
		const focused = dom.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Remotes,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				localize('remotes.help.overview', "Remote Environments lists known SSH hosts and tunnels in a table grouped by connection type. Open it with Manage Remote Environments in the Command Palette, from the Sessions section's More Actions menu, or with Manage in the Environment picker. WSL distributions are also available on Windows. When GitHub Environments is enabled and available, Environments lists known user-shared machines, including offline machines. The columns are Name, Connection, and Actions."),
				localize('remotes.help.environments', "For environments, Connect is disabled when the owning application is offline. Disconnect retains the environment and follows its existing reconnection preferences. Rename applies only to the current account and profile. Delete asks for confirmation before removing the user-shared environment registration and disconnecting this client. It does not delete files on the machine. The environment can reappear if its owning application registers it again. The Environments gear opens its settings."),
				localize('remotes.help.navigation', "Type in Search to filter remotes by name, address, or connection type. Clear Search and Collapse All are at the right of the search field; use Tab to reach these actions and Left and Right Arrow to move between them. Clear Search returns focus to the input. Collapse All preserves the search text. Groups without matches are hidden while searching. Use Down Arrow from Search to enter the table. Use Up and Down Arrow to navigate rows. On a group, use Left and Right Arrow to collapse or expand it, or press Enter to toggle it. Visibility icons are always shown; other row actions appear on hover or keyboard focus. On a remote, press Tab to reach its actions and use Left and Right Arrow to move between Connect or Disconnect and Rename. Use Enter or Space to activate an action. Resize columns by dragging their boundaries. Narrow windows scroll horizontally."),
				localize('remotes.help.connection', "Connection labels include Connected, Connecting, and Disconnected. A warning indicates that a connection you requested failed. Hover the warning or open the Accessible View to read the error. Automatic connection failures do not create a warning, but automatic retries retain an existing warning until they finish. A failed retry updates the error; a successful retry clears it. Environments whose owning application is not online show Offline. Use Connect or Disconnect to manage the connection. Connection actions are unavailable while connecting or reconnecting. Disconnect follows the existing remote behavior and may remove it from the picker."),
				localize('remotes.help.visibility', "Use the eye action at the start of an eligible remote row to show or hide it in the Environment and workspace pickers. Focus the row and press Tab, then Enter or Space to toggle it. Hidden remotes remain in this editor with a dimmed name and a Show action. Remotes that cannot currently appear have a disabled unavailable indicator instead of an eye; hover it or open the Accessible View for the reason. Newly discovered remotes must first be connected, and offline shared environments must come online. Your hidden preference is retained while a remote is unavailable. Choosing a folder through a remote subpicker shows that remote again. Hiding a remote does not prevent sending an existing draft when the remote is available and connected. This preference is local to your profile on this machine and does not connect, disconnect, or remove sessions."),
				localize('remotes.help.manage', "Rename changes the remote's display name in this client. Leave the name empty to restore its default. Environment rows also offer Delete after Rename. Use the arrow keys to reach it in the row actions. Other remote types do not offer Delete; manage their SSH configuration, WSL distribution, or tunnel at the source."),
				localize('remotes.help.discovery', "Refresh looks for remotes without connecting. Its icon spins while discovery is running. Each group also shows a spinner after its count while that group's discovery is running. A failed group immediately shows a warning instead of its spinner, even if other groups are still loading. The tooltip and group label explain the problem; the Window log contains diagnostic details. If tunnel sign-in permissions are missing, a Sign In action appears instead of an error. Focus that row and press Tab, then Enter or Space to sign in and grant access to your tunnels. Sign In is disabled with a spinner while sign-in is in progress. This refreshes the list without connecting to a remote. Known locations remain available, and Refresh retries discovery."),
				localize('remotes.help.setup', "Empty groups show setup guidance and a documentation link. Focus the placeholder row and press Tab to reach its link. Groups with documentation also have an info action that opens the same guide, even when they contain remotes or are collapsed. Focus the group and use Tab and the arrow keys to reach its actions. The SSH settings action opens your user SSH config in a modal editor and creates it if necessary. The Tunnels group has an Open Tunnel Settings action. After configuring a host, return to Remotes and choose Refresh."),
			].join('\n\n') : editor.getAccessibilityContent(),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.Remotes,
		);
	}
}

AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.View));
