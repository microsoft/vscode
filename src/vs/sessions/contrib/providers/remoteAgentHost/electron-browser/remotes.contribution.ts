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
				group: '2_manage',
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
			throw new Error(localize('remotes.environmentPickerDisabled', "The environment picker is disabled."));
		}
		if (!accessor.get(IConfigurationService).getValue<boolean>(RemoteAgentHostsEnabledSettingId) || accessor.get(IChatEntitlementService).sentiment.hidden) {
			throw new Error(localize('remotes.editorDisabled', "Remote agent hosts are disabled."));
		}
		await accessor.get(IEditorService).openEditor(RemotesEditorInput.getOrCreate(), { pinned: true });
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
				localize('remotes.help.overview', "Remote Environments groups environments by status: Ready to use, Available, and Offline. Group labels include the status explanation for screen readers; hover a label to read it. Ready to use means connected from this computer. Available environments can be connected when needed. Offline environments can't be reached right now. Columns are Name, Type, System, Sessions, Last connection, and Actions. Sessions counts only active work, including sessions waiting for input, not completed sessions or history. Empty metadata cells mean no value was observed. Cached session counts are labeled as last known. Last connection is the most recent successful connection observed from this device; it doesn't describe session activity."),
				...(showThisComputer ? [localize('remotes.help.thisComputer', "This computer shows its name, operating system, and sharing status. Share this computer opens sharing settings for the computer you're using. The Computer name field shows the name other devices will see and lets you change it before sharing. Tab reaches the name field before the connection methods. The radio cards compare GitHub Environment (Preview), when available, with Dev Tunnel; both descriptions are visible before you choose. The descriptions explain supported apps, account requirements, and that GitHub stores session history without end-to-end encryption. Arrow keys move between methods. Each method has its own saved name and naming requirements. A name changed before you choose a method is saved with the first choice. Sharing gives connected devices access to agent sessions, tools, and folders on this computer. Keep VS Code running, and keep this computer awake and online. Choose Start sharing to apply the selected method. No method is selected initially. Cancel, Escape, or Back returns to the overview without applying changes. Actions follow the form in platform button order, with the remote connection setup and security guide below. While sharing, Stop sharing ends access from other devices. The Change sharing method menu lets you switch methods directly. Tab moves between the two areas. The Rename This Computer toolbar action next to the shared name renames the active registration. Controls are unavailable while a change is being applied. If setup fails, feedback appears separately from sharing status. Open sharing log closes management and opens the corresponding log.")] : []),
				localize('remotes.help.filters', "The type filters are separate buttons labeled All, GitHub Environment (Preview), Dev Tunnel, WSL, and SSH when available. Tab moves into the filter toolbar; Left and Right Arrow move between buttons, and Enter or Space applies the filter. The pressed button identifies the active filter."),
				localize('remotes.help.add', "Add remote host opens a flow for connecting to an existing remote agent host. Enter its host, host:port, or WebSocket address, then choose a display name. This doesn't provision an environment."),
				localize('remotes.help.environments', "For GitHub Environments, Connect is disabled while the environment is offline. Disconnect retains the environment and doesn't stop its tasks. Rename applies only to the current account and profile. Remove Environment asks for confirmation before removing the registration and disconnecting this client. The remote computer and its files are kept. The environment can reappear if sharing is still on."),
				localize('remotes.help.navigation', "Type in Search to filter remotes by name, address, or connection type. Clear search and Collapse all are at the right of the search field; use Tab to reach these actions and Left and Right Arrow to move between them. Clear search returns focus to the input. Collapse all preserves the search text. Groups without matches are hidden while searching. Use Down Arrow from Search to enter the table. Use Up and Down Arrow to navigate rows. On a group, use Left and Right Arrow to collapse or expand it, or press Enter to toggle it. Connect or Disconnect and More Actions appear on hover or keyboard focus. On a remote, press Tab to reach these controls. More Actions groups connection and troubleshooting first, then picker visibility, copying, and management. Removal actions appear last when available. Use Up and Down Arrow in the menu and Enter to run an action. Escape closes the menu. Resize columns by dragging their boundaries, up to each column's minimum width. Narrow windows scroll horizontally."),
				localize('remotes.help.connection', "Select Troubleshoot to open Troubleshoot connection. Both task pages use the same labeled rows: Environment, Status, Type, operating system when known, and SSH host address or WSL distribution. Status icons match the environment list. Disconnected environments show Try these steps, followed by action feedback and Connect, Retry connection, Refresh, or Update server when available. The remote connection setup guide is below the actions. On a shared remote computer, select Share this computer to turn on sharing. Collect diagnostics explains the report contents, then shows report feedback, Copy report, and Open diagnostic report on separate lines. Both report actions work while disconnected. Open diagnostic report closes management and opens the report in the editor. Copy report keeps management open. Reports may include names, addresses, and local logs for all environments. Review and remove sensitive details before sharing. Back or Escape returns to the environment list."),
				localize('remotes.help.visibility', "Use Show or Hide in a remote's More Actions menu to change whether it appears in the Environment and workspace pickers. Hidden remotes remain in this editor with a dimmed name and a Show action. Remotes that cannot currently appear have a disabled menu item explaining why; the Accessible View also includes the reason. Newly discovered remotes must first be connected, and offline shared environments must come online. Your hidden preference is retained while a remote is unavailable. Choosing a folder through a remote subpicker shows that remote again. Hiding a remote does not prevent sending an existing draft when the remote is available and connected. This preference is local to your profile on this machine and does not connect, disconnect, or remove sessions."),
				localize('remotes.help.manage', "Rename changes the environment's display name in this profile. Leave it empty to restore the default. Copy Address works without connecting. SSH and tunnel rows offer Configure Agent Run Behavior. The page uses the same environment details as Troubleshoot Connection. Two radio cards explain whether to keep agents working after the remote editor closes or use agents in the remote VS Code window. Both explanations remain visible. Current beside an option identifies the saved preference; the selected card identifies the draft. Arrow keys select a choice; Save and reconnect applies it without moving existing sessions. Cancel, Back, or Escape discards the draft and returns to the overview with its search and filters preserved. Update Server is offered when supported. Remove Environment removes a GitHub Environment registration. Forget SSH Connection forgets an eligible saved connection without changing your SSH configuration. Delete Dev Tunnel deletes the tunnel registration and disconnects all its clients, not just this device. Each removal action asks for confirmation and keeps the remote computer and its files. WSL distributions are managed at the source."),
				localize('remotes.help.discovery', "Refresh looks for environments without connecting. Its icon spins while discovery is running. When there are no results, setup guidance replaces the status table. Each environment type has its own discovery status, setup guide link, and recovery actions. Choose Dev Tunnel to sign in to the GitHub or Microsoft account used on the remote computer; signing in isn't required for other types. Setup guide links open documentation in your browser. With known environments, discovery problems appear in a group labeled with the affected type. Known environments remain listed when a refresh fails. Signing in refreshes discovery without connecting, and Refresh retries discovery. Search misses offer Clear search rather than setup or sign-in guidance. Show all types removes the type filter and is grouped with the other recovery actions. Use Tab to reach these actions and links, or Down Arrow from Search to reach the first empty-state action."),
			].join('\n\n') : editor.getAccessibilityContent(),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.Remotes,
		);
	}
}

AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.View));
