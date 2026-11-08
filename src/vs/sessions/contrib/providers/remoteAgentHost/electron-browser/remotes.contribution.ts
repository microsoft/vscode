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
			throw new Error(localize('remotes.environmentPickerDisabled', "The Environment picker is disabled."));
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
				localize('remotes.help.overview', "Remote Environments groups environments by status: Ready to use, Available, and Offline. Group labels include the status explanation for screen readers; hover a label to read it visually. Ready to use means connected from this computer. Available environments can be connected when needed. Offline environments aren't reachable right now. Columns show Name, Type, System, Sessions, Last activity, and Actions. Sessions counts only active work, including sessions waiting for input, not completed sessions or history. Unobserved metadata cells are empty. Cached session counts are labeled last known. Last activity is the last successful connection observed from this device, not session activity."),
				...(showThisComputer ? [localize('remotes.help.thisComputer', "This computer shows its name, operating system, and sharing status. Share this computer opens a focused page with the labeled computer name beneath the task title. Radio cards compare GitHub Environment (Preview) when available, and Dev Tunnel, with both explanations visible before selection. Arrow keys select a method. Naming guidance precedes the input for the name other devices will see. Choose Start Sharing to apply the draft. No method is selected initially. Cancel, Escape, or Back returns to the overview without applying the draft. Actions follow the form in platform button order. While sharing, Stop Sharing stops access from other devices, and its Change Sharing Method chevron opens a menu to switch connection methods directly. Tab moves between the two parts. The Rename This Computer toolbar action next to the shared name renames the active registration. Controls are unavailable while applying a change. Unsuccessful setup leaves feedback separate from sharing status. Open Sharing Log closes management and opens the corresponding log.")] : []),
				localize('remotes.help.filters', "The type filters are separate buttons labeled All, GitHub Environment (Preview), Dev Tunnel, WSL, and SSH when available. Tab moves into the filter toolbar; Left and Right Arrow move between buttons, and Enter or Space applies the filter. The pressed button identifies the active filter."),
				localize('remotes.help.add', "Add Environment opens the existing remote agent host connection flow. Enter the host, host:port, or WebSocket address of an already running agent host, then its display name. This does not provision an environment."),
				localize('remotes.help.environments', "For GitHub Environments, Connect is disabled while the environment is offline. Disconnect retains the environment and doesn't stop its tasks. Rename applies only to the current account and profile. Forget asks for confirmation before removing the registration and disconnecting this client. The remote computer and its files are kept. The environment can reappear if sharing is still on."),
				localize('remotes.help.navigation', "Type in Search to filter remotes by name, address, or connection type. Clear Search and Collapse All are at the right of the search field; use Tab to reach these actions and Left and Right Arrow to move between them. Clear Search returns focus to the input. Collapse All preserves the search text. Groups without matches are hidden while searching. Use Down Arrow from Search to enter the table. Use Up and Down Arrow to navigate rows. On a group, use Left and Right Arrow to collapse or expand it, or press Enter to toggle it. Connect or Disconnect and More Actions appear on hover or keyboard focus. On a remote, press Tab to reach these controls. More Actions contains visibility, copy, rename, configuration, troubleshooting, and Forget when available. Use Up and Down Arrow in the menu and Enter to run an action. Escape closes the menu. Resize columns by dragging their boundaries, up to each column's minimum width. Narrow windows scroll horizontally."),
				localize('remotes.help.connection', "Connection progress appears in the connection button. A Troubleshoot action beside the name opens Troubleshoot connection. Environment name, connection method, operating system when known, and SSH host address or WSL distribution are labeled beneath the title. Registration IDs are kept out of this page. Connection status is followed by Try these steps, then Retry Connection, Refresh, or Update Server according to status and capabilities, and Done. More help links to the setup guide. A separate Diagnostic report section explains its purpose and contents before Open Diagnostic Report. This action closes management and opens the report in a text editor, where you can review, copy, or save it. The report includes names, addresses, and local connection activity for all environments, not remote logs, and works while disconnected. Review it before sharing. Done, Back, or Escape returns to the environment row without closing management."),
				localize('remotes.help.visibility', "Use Show or Hide in a remote's More Actions menu to change whether it appears in the Environment and workspace pickers. Hidden remotes remain in this editor with a dimmed name and a Show action. Remotes that cannot currently appear have a disabled menu item explaining why; the Accessible View also includes the reason. Newly discovered remotes must first be connected, and offline shared environments must come online. Your hidden preference is retained while a remote is unavailable. Choosing a folder through a remote subpicker shows that remote again. Hiding a remote does not prevent sending an existing draft when the remote is available and connected. This preference is local to your profile on this machine and does not connect, disconnect, or remove sessions."),
				localize('remotes.help.manage', "Rename changes the environment's display name in this client. Leave it empty to restore the default. Copy Address works without connecting. SSH and tunnel rows offer Agent Run Behavior. The page labels the environment name and connection method beneath the task title. Two radio cards explain whether to keep agents working after the remote editor closes or use agents in the remote VS Code window. Both explanations remain visible. Current beside an option identifies the saved preference; the selected card identifies the draft. Arrow keys select a choice; Save and Reconnect applies it without moving existing sessions. Cancel, Back, or Escape discards the draft and returns to the overview with its search and filters preserved. Update Server is offered when supported. Forget asks for confirmation and removes a registration or saved connection, not the remote computer or its files. Forgetting a tunnel removes its registration for all clients and disconnects them, not just this device. WSL distributions are managed at the source."),
				localize('remotes.help.discovery', "Refresh looks for environments without connecting. Its icon spins while discovery is running. Discovery warnings and the tunnel Sign In action appear above the table, never as extra type groups. Sign In refreshes discovery without connecting to an environment. Known environments remain listed when a refresh fails, and Refresh retries discovery."),
			].join('\n\n') : editor.getAccessibilityContent(),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.Remotes,
		);
	}
}

AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.View));
