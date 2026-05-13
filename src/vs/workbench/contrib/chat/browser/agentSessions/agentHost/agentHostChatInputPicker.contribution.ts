/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ChatContextKeys, ChatContextKeyExprs } from '../../../common/actions/chatContextKeys.js';

/**
 * All three agent-host pickers live under `MenuId.ChatInputSecondary` group
 * `'navigation'` because non-navigation groups are routed to the overflow
 * menu by VS Code's menu/toolbar convention.
 *
 * Order layout in the secondary toolbar (existing items annotated):
 *   0    OpenSessionTargetPickerAction        (Copilot CLI - Agent Host)
 *   0.5  OpenDelegationPickerAction
 *   0.6  OpenWorkspacePickerAction
 *   0.7  OpenAgentHostModePickerAction        (NEW — Mode)
 *   1    OpenPermissionPickerAction           (Default Approvals)
 *   100  OpenAgentHostBranchPickerAction      (NEW — Branch)
 *   101  OpenAgentHostIsolationPickerAction   (NEW — Isolation)
 *
 * Branch + Isolation are pushed to the right of the row by CSS
 * (`margin-left: auto` on the first of the two; see picker CSS).
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

export class OpenAgentHostBranchPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openAgentHostBranchPicker';
	constructor() {
		super({
			id: OpenAgentHostBranchPickerAction.ID,
			title: localize2('agentHost.branchPicker', "Branch"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				// Large order so Branch always sorts after the existing
				// secondary chips (SessionTarget, Mode, Approvals, ...).
				order: 100,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}
	override async run(): Promise<void> { /* the action view item handles interaction */ }
}

export class OpenAgentHostIsolationPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openAgentHostIsolationPicker';
	constructor() {
		super({
			id: OpenAgentHostIsolationPickerAction.ID,
			title: localize2('agentHost.isolationPicker', "Isolation"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 101,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}
	override async run(): Promise<void> { /* the action view item handles interaction */ }
}

registerAction2(OpenAgentHostModePickerAction);
registerAction2(OpenAgentHostBranchPickerAction);
registerAction2(OpenAgentHostIsolationPickerAction);
