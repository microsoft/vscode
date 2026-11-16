/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../../workbench/browser/editor.js';
import { EditorExtensions } from '../../../../../workbench/common/editor.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { SessionsCategories } from '../../../../../workbench/contrib/sessions/common/categories.js';
import { IsPhoneLayoutContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { RemotesEditorInput } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remotesEditorInput.js';
import { RemotesDetailsExpandedContext } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remotesWidget.js';
import { RemotesEditor, RemotesEditorFocusedContext, RemotesSharingExpandedContext } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/electron-browser/remotesEditor.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(RemotesEditor, RemotesEditor.ID, localize('remotes.editorLabel', "Remote Environments")),
	[new SyncDescriptor(RemotesEditorInput)],
);

const remotesEnabled = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
	ContextKeyExpr.equals(`config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`, true),
	ContextKeyExpr.equals(`config.${ENVIRONMENT_PICKER_SETTING}`, true),
);

async function openRemotesEditor(accessor: ServicesAccessor): Promise<void> {
	if (!accessor.get(IConfigurationService).getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING)) {
		throw new Error(localize('remotes.managementDisabled', "Remote Environments management is disabled."));
	}
	if (!accessor.get(IConfigurationService).getValue<boolean>(ENVIRONMENT_PICKER_SETTING)) {
		throw new Error(localize('remotes.environmentPickerDisabled', "The environment picker is disabled."));
	}
	if (!accessor.get(IConfigurationService).getValue<boolean>(RemoteAgentHostsEnabledSettingId) || accessor.get(IChatEntitlementService).sentiment.hidden) {
		throw new Error(localize('remotes.editorDisabled', "Remote agent hosts are disabled."));
	}
	await accessor.get(IEditorService).openEditor(RemotesEditorInput.getOrCreate(), { pinned: true });
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_REMOTES_EDITOR_COMMAND_ID,
			title: localize2('remotes.openEditor', "Manage Remote Environments"),
			category: SessionsCategories.Sessions,
			icon: Codicon.remote,
			f1: true,
			precondition: remotesEnabled,
			menu: {
				id: Menus.SidebarSessionsHeader,
				group: '2_manage',
				order: 0,
				when: ContextKeyExpr.and(remotesEnabled, IsPhoneLayoutContext.negate()),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await openRemotesEditor(accessor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.remotes.closeDetails',
			title: localize2('remotes.closeDetails', "Close Environment Details"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, RemotesEditorFocusedContext, RemotesDetailsExpandedContext),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.SessionsContrib + 1,
				when: ContextKeyExpr.and(RemotesEditorFocusedContext, RemotesDetailsExpandedContext),
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (editor instanceof RemotesEditor) {
			editor.closeEnvironmentDetails();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.remotes.collapseSharing',
			title: localize2('remotes.collapseSharing', "Collapse Sharing Options"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, RemotesEditorFocusedContext, RemotesSharingExpandedContext),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.and(RemotesEditorFocusedContext, RemotesSharingExpandedContext),
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (editor instanceof RemotesEditor) {
			editor.collapseSharing();
		}
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
		if (this.type === AccessibleViewType.Help) {
			// The help describes the This Computer section only in the treatment arm.
			logSettingExperimentTrigger(accessor.get(ITelemetryService), REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING);
		}
		const showThisComputer = accessor.get(IConfigurationService).getValue<boolean>(REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Remotes,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				...(showThisComputer ? [localize('remotes.help.sections', "This computer appears above Other environments. Both sections remain visible while choosing how to share this computer. Empty connection-method groups show Expand to get started after discovery completes; expand a group for its setup instructions and actions. Search with no matches offers Clear Filter instead of setup guidance.")] : []),
				localize('remotes.help.overview', "Remote Environments lists connected environments first, then available environments, unverified environments, and offline environments. Rows stay single-line at a fixed height. Name and Availability lead, followed by Activity and System. Connection method and Address are secondary columns at wider sizes; they hide before Activity and System as space decreases. At the narrowest sizes, Name, Availability, and actions remain. Search and the Accessible View retain hidden column details. Address shows a configured SSH address, not an opaque registration ID. Ambiguous names include their connection method when methods differ, with stable numeric suffixes only for remaining collisions. Rename changes a display name; remove stale registrations only when you no longer need them. This computer's known registration is not repeated in Other environments. Not verified does not mean Offline. Available does not verify sign-in or agent compatibility. Select Connect to attempt a connection, or New Session on a connected environment to open the composer. Refresh updates discovery without connecting. The Refresh icon is the only discovery spinner. Rows and metadata keep their previous values, or stay empty, until refresh finishes. System uses validated host-reported OS, architecture, CPU count, and memory capacity; retained system information is marked last known. WSL identifies Linux without starting a distribution. Activity shows reconciled session counts, including zero, and observed session activity. GitHub Environments can show their service-reported last heartbeat and session count without connecting. Reported counts and timestamps describe their observation, not current machine-wide activity or uptime. Connection errors and recovery actions remain in Troubleshoot connection."),
				localize('remotes.help.sorting', "View Options before Refresh offers Sort By and Group By. Sort By uses the table's Availability, Name, or Activity fields. Availability is selected by default. Activity orders the timestamps represented in the Activity column, with known recent times first. Group By offers None, selected by default, Connection Method, or Availability. Grouping replaces the corresponding column with group headings instead of repeating it in each row. Empty method groups start collapsed; expand one for setup guidance. Reset View restores availability ordering, no grouping, and an empty search. Search matches names, SSH addresses, connection methods, availability labels, system details, and activity text. Clear Filter clears Search. Use arrow keys to navigate submenus and Enter to select an option."),
				...(showThisComputer ? [localize('remotes.help.thisComputer', "This computer shows its sharing name, operating system, and sharing status. The pencil opens Rename in an input prompt. Select Share This Computer to show GitHub Environment (Preview) and Dev Tunnel choices directly below. Start Sharing and Cancel replace that button. Choose a method with the arrow keys; the name updates to that method's sharing name and can be renamed with the pencil. GitHub Environment makes this computer discoverable through your GitHub account for supported Copilot clients. GitHub stores session actions for history; conversation content isn't end-to-end encrypted. Dev Tunnel supports VS Code and the browser-based Agents window. Keep VS Code open and this computer awake and online while sharing. Select Start Sharing to apply your choice. Progress is announced without moving the controls. Failures appear below the choices with access to the sharing log. Cancel or Escape closes the choices without starting sharing. Other environments remain available. Select Stop Sharing to end access from other devices. Select Change Connection Method to choose another method. Open Sharing Log to view sharing activity.")] : []),
				localize('remotes.help.configureSSH', "To add or correct an SSH host, select Open SSH Configuration. Offline SSH hosts also offer this action in More Actions. Add or edit the Host entry, save it, then refresh Remote Environments."),
				localize('remotes.help.environments', "Connect to an online GitHub Environment. Disconnecting keeps the environment and its tasks running. Rename changes its display name in this profile. Remove Environment clears the registration and disconnects this client. The remote computer and its files stay available; the entry returns when sharing resumes."),
				localize('remotes.help.navigation', "Enter a name, address, or connection method in Search to filter environments. Clear Filter clears Search and returns focus to Search. Collapse All preserves your search. Search shows groups with matching environments. Use Down Arrow from Search to enter the table, and Up and Down Arrow to navigate rows. Use Left and Right Arrow on a group to collapse or expand it, or press Enter to toggle it. New Session, Connect, Disconnect, and More Actions appear on hover or keyboard focus. On an environment, press Tab to reach these controls. More Actions lists session, connection, and troubleshooting first, then picker visibility, copying, and management. Use Up and Down Arrow to move in a menu and Enter to run an action. Press Escape to close the menu. Drag column boundaries to resize columns. Narrow layouts hide secondary columns and keep connection actions in More Actions without horizontal scrolling."),
				localize('remotes.help.connection', "A failed Connect attempt opens the environment's connection details with its error and recovery actions, even when a status check marks it offline. If another task is open or diagnostics are being collected, a notification identifies the failed environment instead. You can also select Troubleshoot Connection in any environment's More actions menu. The Status row shows its current connection state and progress during recovery. Guidance appears only when the connection error or environment state supports a specific action. Otherwise, use the documentation link for that connection method. An unconfirmed availability check isn't a diagnosis. SSH failures offer Open SSH Configuration. Other recovery actions include Retry Connection and Update Server when applicable. Progress and results are announced. Failures remain below the action buttons. Once connected, New Session and Disconnect work just as they do in the environment list. New Session opens the composer with this environment selected. Sessions may continue running on the remote computer after disconnecting; this depends on their run behavior and the remote computer staying awake and online. Copy Report and Open Diagnostic Report have separate feedback in Collect diagnostics and are available in any connection state. The Copy Report icon shows collection progress and confirms a successful copy without moving the controls. Open Diagnostic Report closes management and opens the report in the editor; Copy Report keeps management open. Reports may include names, addresses, and local logs for all environments. Review and remove sensitive details before sharing. Back or Escape returns to the environment list."),
				localize('remotes.help.visibility', "Use Show or Hide in an environment's More actions menu to control its visibility in the environment and workspace pickers, even while it is offline or disconnected. Hidden remotes stay in this editor and show a Show action. Showing an unavailable environment saves your preference without connecting it; it appears in pickers when available. Your choice is saved in this profile. Choose a folder through a remote subpicker to show that remote again."),
				localize('remotes.help.runBehavior', "SSH and Dev Tunnel rows offer Configure Agent Run Behavior. Under Preferred run behavior, choose Run in the Background for tasks you want to leave running, or Use Remote VS Code to use an open window on the remote computer when available. Agents in that window stop when it closes. Keep the remote computer awake and online while agents work. If a Dev Tunnel is shared by VS Code, keep that remote window open to stay connected. Saved preference marks the saved choice; the selected card shows your changes. Select Save to keep the choice for the next connection without connecting. For a connected environment, select Save and Reconnect to apply the choice immediately. Existing sessions are not moved. Save progress and completion are announced and shown by the action icon. Failures appear below the buttons. Select Cancel, Back, or Escape to discard changes and return to the overview."),
				localize('remotes.help.manage', "Rename changes the environment's display name in this profile. Clear the name to restore the default. Copy Address copies the SSH host for use with Connect via SSH. Update Server appears when supported. Remove Environment clears the GitHub Environment registration and disconnects this client. Forget SSH Connection removes the saved connection; your SSH configuration stays unchanged. Delete Dev Tunnel removes the tunnel registration and disconnects all its clients. Confirm each removal. The remote computer and its files stay available. Manage WSL distributions in WSL."),
				localize('remotes.help.discovery', "Select Refresh to find environments and check their online status. Dev Tunnels report whether the host is running, GitHub Environments report sharing status, and WSL reports installed distributions that are running. SSH checks whether an SSH server responds at the configured address and port; it doesn't sign in. A failed direct SSH check is Offline from this network. Proxy and jump-host connections that cannot be checked directly remain eligible for a connection attempt without a confirmed availability status. Discovery doesn't verify sign-in or agent compatibility, start remote agents, or start WSL distributions. With method grouping enabled, empty method groups remain visible and start collapsed. Expand one for its setup instructions and documentation. For Dev Tunnels, sign in with the GitHub or Microsoft account used on the remote computer. Known environments stay listed if a refresh fails. When Search has no matches, select Clear Filter to clear it. Use Tab to reach actions and links, or Down Arrow from Search to enter the environments."),
				localize('remotes.help.gitHubEnvironment', "When GitHub Environments are enabled and available, connected SSH, WSL, and Dev Tunnel environments whose agent host supports it offer Share as GitHub Environment in More Actions. This registers the remote's agent host for other applications signed in with your GitHub account. The environment keeps its original connection method and shows a GitHub icon beside its name; hover it or open the Accessible View for its sharing state. Sharing continues while this client is disconnected and is restored when the remote's agent host restarts and this client reconnects. Use Stop Sharing in More Actions to stop, including sharing started by another client with the same GitHub account. If another account or the remote itself shares it, the action is unavailable and its label explains why. Removing the environment also stops sharing it."),
			].join('\n\n') : editor.getAccessibilityContent(),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.Remotes,
		);
	}
}

AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.View));
