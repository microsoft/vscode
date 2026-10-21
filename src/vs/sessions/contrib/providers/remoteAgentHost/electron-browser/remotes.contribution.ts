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
				localize('remotes.help.overview', "Remotes groups known SSH hosts, tunnels, and Dev Containers in a tree. WSL distributions are also available on Windows."),
				localize('remotes.help.navigation', "Type in Search to filter remotes. Use Down Arrow from Search to enter the tree. Use Up and Down Arrow to navigate, and Left and Right Arrow to collapse or expand groups. On a remote, press Tab to reach its switch, then Space to show or hide it."),
				localize('remotes.help.toggle', "Remotes with their switch on appear in the New Session location picker. Switching off removes the remote and may disconnect it. Switching on registers it without explicitly connecting; existing automatic connection settings still apply."),
				localize('remotes.help.discovery', "Refresh looks for remotes without connecting or starting containers. A warning icon on a group means its locations could not be refreshed. The tooltip and group label explain the problem; the Window log contains diagnostic details. Known locations remain available, and Refresh retries discovery. Containers without a local source folder cannot currently be added."),
			].join('\n\n') : editor.getAccessibilityContent(),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.Remotes,
		);
	}
}

AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.View));
