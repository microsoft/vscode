/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext, WorkspaceFolderCountContext } from '../../../../../common/contextkeys.js';
import { ChatContextKeys, ChatContextKeyExprs } from '../../../common/actions/chatContextKeys.js';

/**
 * Agent-host pickers live under `MenuId.ChatInputSecondary` group
 * `'navigation'` because non-navigation groups are routed to the overflow
 * menu by VS Code's menu/toolbar convention.
 *
 * Order layout in the secondary toolbar (existing items annotated):
 *   0    OpenSessionTargetPickerAction        (Copilot CLI - Agent Host)
 *   0.5  OpenDelegationPickerAction
 *   0.6  OpenWorkspacePickerAction
 *   0.7  OpenAgentHostModePickerAction        (NEW — Mode)
 *   0.8  OpenAgentHostAutoApprovePickerAction (NEW — Auto-Approve)
 *   0.9  OpenAgentHostPermissionModePickerAction (NEW — Claude Approvals)
 *   1    OpenPermissionPickerAction           (Default Approvals)
 *   1.1  OpenAgentHostFolderPickerAction      (NEW — Folder, multi-root only;
 *                                              ordered last to match the
 *                                              extension-host Copilot CLI)
 */

export class OpenAgentHostFolderPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openAgentHostFolderPicker';
	constructor() {
		super({
			id: OpenAgentHostFolderPickerAction.ID,
			title: localize2('agentHost.folderPicker', "Folder"),
			f1: false,
			// The working directory is an argument to session creation and is
			// fixed once the session has started (its first request), so the
			// chip stays visible afterwards but is disabled.
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.chatSessionIsEmpty),
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 1.1,
				// Only relevant when there is more than one root folder to choose
				// from and we are in a regular editor window (the agent sessions
				// window has its own workspace picker). Ordered last in the chip
				// row to match the extension-host Copilot CLI layout.
				when: ContextKeyExpr.and(
					ChatContextKeyExprs.isAgentHostSession,
					WorkspaceFolderCountContext.greater(1),
					IsSessionsWindowContext.negate(),
				),
			}],
		});
	}
	override async run(): Promise<void> { /* the action view item handles interaction */ }
}

export class OpenAgentHostModePickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openAgentHostModePicker';
	constructor() {
		super({
			id: OpenAgentHostModePickerAction.ID,
			title: localize2('agentHost.modePicker', "Agent Mode"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 0.7,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}
	override async run(): Promise<void> { /* the action view item handles interaction */ }
}

export class OpenAgentHostAutoApprovePickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openAgentHostAutoApprovePicker';
	constructor() {
		super({
			id: OpenAgentHostAutoApprovePickerAction.ID,
			title: localize2('agentHost.autoApprovePicker', "Auto-Approve"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 0.8,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}
	override async run(): Promise<void> { /* the action view item handles interaction */ }
}

export class OpenAgentHostPermissionModePickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openAgentHostPermissionModePicker';
	constructor() {
		super({
			id: OpenAgentHostPermissionModePickerAction.ID,
			title: localize2('agentHost.permissionModePicker', "Approvals"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 0.9,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}
	override async run(): Promise<void> { /* the action view item handles interaction */ }
}

registerAction2(OpenAgentHostModePickerAction);
registerAction2(OpenAgentHostAutoApprovePickerAction);
registerAction2(OpenAgentHostPermissionModePickerAction);
registerAction2(OpenAgentHostFolderPickerAction);
