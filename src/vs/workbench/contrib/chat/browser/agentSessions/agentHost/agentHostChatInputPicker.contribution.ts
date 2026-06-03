/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
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
 *   0.81 OpenAgentHostCodexSandboxPickerAction (NEW — Codex Sandbox)
 *   0.82 OpenAgentHostCodexApprovalPolicyPickerAction (NEW — Codex Approval Policy)
 *   0.9  OpenAgentHostPermissionModePickerAction (NEW — Claude Approvals)
 *   1    OpenPermissionPickerAction           (Default Approvals)
 */

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

export class OpenAgentHostCodexSandboxPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openAgentHostCodexSandboxPicker';
	constructor() {
		super({
			id: OpenAgentHostCodexSandboxPickerAction.ID,
			title: localize2('agentHost.codexSandboxPicker', "Sandbox"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 0.81,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}
	override async run(): Promise<void> { /* the action view item handles interaction */ }
}

export class OpenAgentHostCodexApprovalPolicyPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openAgentHostCodexApprovalPolicyPicker';
	constructor() {
		super({
			id: OpenAgentHostCodexApprovalPolicyPickerAction.ID,
			title: localize2('agentHost.codexApprovalPolicyPicker', "Approval Policy"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 0.82,
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
registerAction2(OpenAgentHostCodexSandboxPickerAction);
registerAction2(OpenAgentHostCodexApprovalPolicyPickerAction);
registerAction2(OpenAgentHostPermissionModePickerAction);
