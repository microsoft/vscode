/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
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
import { RemotesEditorInput } from '../browser/remotesEditorInput.js';
import { RemotesEditor, RemotesEditorFocusedContext } from './remotesEditor.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(RemotesEditor, RemotesEditor.ID, localize('remotes.editorLabel', "Remotes")),
	[new SyncDescriptor(RemotesEditorInput)],
);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_REMOTES_EDITOR_COMMAND_ID,
			title: localize('remotes.openEditor', "Manage Remotes"),
			icon: Codicon.remote,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
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
				localize('remotes.help.overview', "Remotes lists known SSH hosts and tunnels in a table grouped by connection type. WSL distributions are also available on Windows. When GitHub Environments is enabled and available, Environments lists known user-shared machines, including offline machines. The columns are Name, Address, Connection, and Actions."),
				localize('remotes.help.environments', "For environments, Connect is disabled when the owning application is offline. Disconnect retains the environment and follows its existing reconnection preferences. Rename applies only to the current account and profile. Removing environments is not supported here. Manage sharing in the application running on that machine. The Environments gear opens its settings."),
				localize('remotes.help.navigation', "Type in Search to filter remotes. Use Down Arrow from Search to enter the table. Use Up and Down Arrow to navigate rows. On a group, use Left and Right Arrow to collapse or expand it, or press Enter to toggle it. On a remote, press Tab to reach its actions and use Left and Right Arrow to move between Connect or Disconnect and Rename. Use Enter or Space to activate an action. Resize columns by dragging their boundaries. Narrow windows scroll horizontally."),
				localize('remotes.help.connection', "Connection labels match the Environment picker: Connected, Connecting, and Disconnected. Use Connect or Disconnect to manage the connection. Connection actions are unavailable while connecting or reconnecting. Disconnect follows the existing remote behavior and may remove it from the picker."),
				localize('remotes.help.connectionInfo', "Addresses remain visible when a remote is unavailable. An info icon after Disconnected explains why connecting is unavailable. Focus the row and press Tab to reach the icon, then Enter or Space to read its explanation. Press Escape to dismiss the tooltip."),
				localize('remotes.help.manage', "Rename changes the remote's display name in this client. Leave the name empty to restore its default. This table does not delete remote locations. Manage their SSH configuration, WSL distribution, tunnel, or environment sharing at the source."),
				localize('remotes.help.discovery', "Refresh looks for remotes without connecting. A warning icon on a group means its locations could not be refreshed. The tooltip and group label explain the problem; the Window log contains diagnostic details. Known locations remain available, and Refresh retries discovery."),
				localize('remotes.help.setup', "Empty groups show setup guidance and a documentation link. Focus the placeholder row and press Tab to reach its link. On the SSH group, Tab moves through the expand or collapse action and Open SSH Configuration, which opens your user SSH config in a modal editor and creates it if necessary. The Tunnels group has an Open Tunnel Settings action. After configuring a host, return to Remotes and choose Refresh."),
			].join('\n\n') : editor.getAccessibilityContent(),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.Remotes,
		);
	}
}

AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.View));
