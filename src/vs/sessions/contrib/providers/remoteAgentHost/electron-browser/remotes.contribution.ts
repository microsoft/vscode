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
import { AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
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
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING, REMOTE_ENVIRONMENTS_THIS_COMPUTER_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { areDevContainerEnvironmentsEnabled, canUseDevContainerEnvironments, DevContainerEnvironmentsEnabledSettingId } from '../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';

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
		let sharingSetup = false;
		if (this.type === AccessibleViewType.Help && showThisComputer) {
			// The help describes the This Computer section differently in each arm.
			logSettingExperimentTrigger(accessor.get(ITelemetryService), REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING);
			sharingSetup = !!accessor.get(IConfigurationService).getValue<boolean>(REMOTE_ENVIRONMENTS_SHARING_SETUP_SETTING);
		}
		const showSandboxProfiles = accessor.get(IConfigurationService).getValue<boolean>(AgentSandboxSettingId.AgentSandboxProfilesEnabled) === true;
		let showDevContainers = false;
		if (this.type === AccessibleViewType.Help && canUseDevContainerEnvironments(accessor.get(IConfigurationService))) {
			// The help describes Dev Containers only in the treatment arm.
			logSettingExperimentTrigger(accessor.get(ITelemetryService), DevContainerEnvironmentsEnabledSettingId);
			showDevContainers = areDevContainerEnvironmentsEnabled(accessor.get(IConfigurationService));
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Remotes,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				...(showThisComputer ? [localize('remotes.help.sections', "This computer appears above Other environments. Both sections remain visible while choosing how to share this computer.")] : []),
				localize('remotes.help.overview', "Remote Environments lists connected and available environments first. Status groups environments under Connected, Available, or Offline. Available includes hosts you can try connecting to while a status check is pending or unavailable. Rows stay single-line at a fixed height. Name and Status lead, followed by Last Activity and System. Type is a secondary column at wider sizes; it hides before Last Activity and System as space decreases. At the narrowest sizes, Name, Status, and actions remain. Search and the Accessible View retain hidden details, including configured SSH addresses, not opaque registration IDs. Ambiguous names include their connection type when types differ, with stable numeric suffixes only for remaining collisions. Rename changes a display name; remove stale registrations only when you no longer need them. This computer's known registration is not repeated in Other environments. Select Connect to attempt a connection, or New Session on a connected environment to open the composer. Refresh updates discovery without connecting. The Refresh text button is disabled while discovery is running. Rows and metadata keep their previous values, or stay empty, until refresh finishes. System shows only the operating system. Its tooltip and the Accessible View show architecture, CPU count, and memory capacity on separate lines. WSL identifies Linux without starting a distribution. Last Activity shows a short age of the last observed activity, connection, or availability, and stays empty when no time is known. Session counts, including zero, appear only in its tooltip and the Accessible View. Hover the Last Activity cell for session details even when its time is empty. Offline or unconfirmed observations older than seven days show >7 days ago. Last Activity tooltips and the Accessible View show session counts and labeled activity, connection, or last-seen times on separate lines. After a failed connection, the environment's Connect action shows a warning; hover it or open the Accessible View to read the error."),
				...(showSandboxProfiles ? [localize('remotes.help.sandboxProfile', "In the Sandbox Profile column, choose which of your sandbox profiles a connected host uses for new sessions, or Default for the host's default sandbox settings. The host keeps a copy of the assigned profile, so every device connected to it sees the assignment. If another device assigned a profile you don't have, the column shows it as on host and offers Save to My Profiles. Disconnected hosts show their last-known assignment, disabled; connect to a host to refresh or change it. Create and edit profiles with Sandbox: Manage Sandbox Profiles; changes to a profile update the connected hosts using it. A profile assigned to a remote environment cannot be deleted, including a disconnected environment's last-known assignment.")] : []),
				localize('remotes.help.sorting', "Search and Filter are aligned to the right above the table, with Refresh beside them. The Filter button inside Search offers Sort By, Group By, and Reset Filter. Sort By uses Status, Name, Last Activity, System, or Type. Status is selected by default. Tab to a column header and press Enter or Space, or click it, to sort; activate it again to reverse the direction. Last Activity starts with recent observations first. Missing observations stay last in either direction. Group By offers None, selected by default, Type, or Status. Grouping replaces the corresponding column with group headings instead of repeating it in each row. Reset Filter restores Status ordering, no grouping, and an empty search. Search matches names, SSH addresses, connection types, status labels, system details, and activity text. Use arrow keys to navigate submenus and Enter to select an option."),
				...(showThisComputer && sharingSetup ? [localize('remotes.help.thisComputer', "This computer shows its sharing name, operating system, and sharing status. The pencil opens Rename in an input prompt. Select Share This Computer to show GitHub Environment (Preview) and Dev Tunnel choices directly below. Start Sharing and Cancel replace that button. The current method or first available method is selected. Use it as is or choose another with the arrow keys; the name updates to that method's sharing name and can be renamed with the pencil. GitHub Environment makes this computer discoverable through your GitHub account for supported Copilot clients. GitHub stores session actions for history; conversation content isn't end-to-end encrypted. Dev Tunnel supports VS Code and the browser-based Agents window. Keep VS Code open and this computer awake and online while sharing. Select Start Sharing to apply your choice. Progress is announced without moving the controls. Failures appear below the choices with access to the sharing log. Cancel or Escape closes the choices without starting sharing. Other environments remain available. Select Stop Sharing to end access from other devices. Select Change Connection Type to choose another type. Open Sharing Log to view sharing activity.")] : []),
				...(showThisComputer && !sharingSetup ? [localize('remotes.help.segmentedThisComputer', "This computer shows how it is shared with other devices. Its Allow Connections Here options are Off, GitHub Environments when available, and Dev Tunnels; they match the Remote Connections menu in the title bar. Use Tab to reach the options and the arrow keys to move between them, then press Enter or Space to choose one. Choosing an option starts or stops sharing; the status next to the options announces the result. Rename Sharing Name changes the name other devices see. Local sessions keep running directly on this computer whether sharing is on or off.")] : []),
				localize('remotes.help.tunnelSignIn', "If a saved Dev Tunnel requires sign-in, its status is unconfirmed and its row offers Sign In. After signing in, the list refreshes without connecting."),
				localize('remotes.help.emptySetup', "If discovery finds no environments, the table temporarily groups by Type and shows setup instructions and links. Your grouping choice applies again when environments are found. Search with no matches offers Clear Filter instead of setup guidance."),
				localize('remotes.help.configureSSH', "To add or correct an SSH host, select Open SSH Configuration. Add or edit the Host entry, save it, then refresh Remote Environments."),
				localize('remotes.help.rowActions', "Row actions are aligned to the right, with More Actions always in the trailing slot. Connecting or disconnecting does not resize the action column. At narrow widths, use More Actions for session and connection commands."),
				localize('remotes.help.environments', "Connect to an online GitHub Environment. Disconnecting keeps the environment and its tasks running. Rename changes its display name in this profile. Remove Environment clears the registration and disconnects this client. The remote computer and its files stay available; the entry returns when sharing resumes."),
				localize('remotes.help.navigation', "Enter a name, address, or connection type in Search to filter environments. Reset Filter in the Filter menu clears Search and restores the default ordering and grouping. An empty search result also offers Clear Filter to clear only the typed search. Search shows groups with matching environments. Use Down Arrow from Search to enter the table, and Up and Down Arrow to navigate rows. Use Left and Right Arrow on a group to collapse or expand it, or press Enter to toggle it. New Session, Connect, Disconnect, and More Actions appear on hover or keyboard focus. On an environment, press Tab to reach these controls. More Actions lists session and connection actions first, then picker visibility, copying, and management. Use Up and Down Arrow to move in a menu and Enter to run an action. Press Escape to close the menu. Drag column boundaries to resize columns. Narrow layouts hide secondary columns and keep connection actions in More Actions without horizontal scrolling."),
				localize('remotes.help.connection', "If Connect fails, a notification shows the error with a Troubleshoot action, and the environment's Connect action shows a warning until a later attempt succeeds. Hover the warning or open the Accessible View to read the error, then select Connect to try again. Environments that need a server update show Update required. When the server can be updated from here, Connect asks to update it first, and Update Server in More Actions updates it too. When a newer server version is available for a connected environment, its row says so and More Actions offers Update Server. It asks first, because installing the newer version restarts the server and interrupts sessions running on it. New Session opens the composer with a connected environment selected. It isn't offered for environments that the environment picker can't select, such as GitHub Environments. Sessions may continue running on the remote computer after disconnecting; this depends on their run behavior and the remote computer staying awake and online."),
				localize('remotes.help.troubleshoot', "Every environment's More Actions menu offers Troubleshoot Connection, and the Troubleshoot action of a failed connection notification opens the same page. It shows the environment's status, the last connection step this window observed, the server's and this client's versions, and facts read on this computer without connecting, such as the resolved SSH host, a WSL distribution's state, a Dev Tunnel's account, or a Dev Container's host and Docker availability. A server that isn't connected shows the version from the last connection. It explains what likely went wrong and offers actions that may help, such as Retry Connection, Update Server, Forget Saved Host Key, Restart Distribution, Sign In, or Show Log. Some failures include a command to copy and run in a terminal. Collect diagnostics copies or opens a diagnostic report, or exports agent host debug logs. Action progress and results are announced, and failures appear above the actions. Use Tab to reach the actions. Select Back or press Escape to return to the overview."),
				localize('remotes.help.visibility', "Use Show or Hide in an environment's More actions menu to control its visibility in the environment and workspace pickers, even while it is offline or disconnected. Hidden remotes stay in this editor and show a Show action. Showing an unavailable environment saves your preference without connecting it; it appears in pickers when available. Your choice is saved in this profile. Choose a folder through a remote subpicker to show that remote again."),
				localize('remotes.help.runBehavior', "SSH and Dev Tunnel rows offer Configure Agent Run Behavior. Under Preferred run behavior, your saved choice is selected, or Run in the Background if no choice is saved. Run in the Background is for tasks you want to leave running. Choose Use Remote VS Code to use an open window on the remote computer when available. Agents in that window stop when it closes. Keep the remote computer awake and online while agents work. If a Dev Tunnel is shared by VS Code, keep that remote window open to stay connected. Saved preference marks the saved choice; the selected card shows your changes. Select Save to keep the choice for the next connection without connecting. For a connected environment, select Save and Reconnect to apply the choice immediately. Existing sessions are not moved. Save progress and completion are announced and shown by the action icon. Failures appear below the buttons. Select Cancel, Back, or Escape to discard changes and return to the overview."),
				localize('remotes.help.manage', "Rename changes the environment's display name in this client. Clear the name to restore the default. Copy Address copies the SSH host for use with Connect via SSH. Update Server appears when supported. Remove Environment clears the GitHub Environment registration and disconnects this client. Forget SSH Connection removes the saved connection; your SSH configuration stays unchanged. Delete Dev Tunnel removes the tunnel registration and disconnects all its clients. Confirm each removal. The remote computer and its files stay available. Manage WSL distributions in WSL."),
				localize('remotes.help.discovery', "Select Refresh to find environments and check their online status. Dev Tunnels report whether the host is running, GitHub Environments report sharing status, and WSL reports installed distributions that are running. SSH hosts are read from your SSH configuration without contacting them, so they remain eligible for a connection attempt without a confirmed availability status. Discovery doesn't verify sign-in or agent compatibility, start remote agents, or start WSL distributions. With method grouping enabled, empty method groups remain visible and start collapsed. Expand one for its setup instructions and documentation. For Dev Tunnels, sign in with the GitHub or Microsoft account used on the remote computer. Known environments stay listed if a refresh fails. Without method grouping, partial discovery warnings and sign-in actions appear below the list rather than replacing environment rows. A failed method does not block connecting through another method. General setup guidance appears after discovery completes with no environments, not during initial discovery or in place of a discovery error. When Search has no matches, select Clear Filter to clear it. Use Tab to reach actions and links, or Down Arrow from Search to enter the environments."),
				localize('remotes.help.gitHubEnvironment', "When GitHub Environments are enabled and available, connected SSH, WSL, and Dev Tunnel environments whose agent host supports it offer Share as GitHub Environment in More Actions. This registers the remote's agent host for other applications signed in with your GitHub account. The environment keeps its original connection type and shows a GitHub icon beside its name; hover it or open the Accessible View for its sharing state. Sharing continues while this client is disconnected and is restored when the remote's agent host restarts and this client reconnects. Use Stop Sharing in More Actions to stop, including sharing started by another client with the same GitHub account. If another account or the remote itself shares it, the action is unavailable and its label explains why. Removing the environment also stops sharing it."),
				...(showDevContainers ? [localize('remotes.help.devContainers', "Dev Containers are containers from a base Linux image that keep their files in a Docker volume. The Dev Containers group appears while one exists or while this computer or a connected host has Docker. Its header offers Create Dev Container, which asks whether to create it on this computer or on a connected host when there is more than one choice. Connected SSH, WSL, and tunnel rows whose host has Docker also offer Create Dev Container for that host. A new Dev Container appears in the group right away and shows Connecting until its container has started, and you can create more in the meantime. While the group is empty, it describes Dev Containers and offers a Create Dev Container link. The group names each Dev Container with its host, and each can be chosen in the Environment picker. A Dev Container on a remote host connects and disconnects together with its host. One on this computer starts when you first use it, such as when you choose it in the Environment picker, and its row offers Connect and Disconnect. Every Dev Container row offers Rename and Delete. Delete asks for confirmation before removing the container and its files.")] : []),
			].join('\n\n') : editor.getAccessibilityContent(),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.Remotes,
		);
	}
}

AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.View));
