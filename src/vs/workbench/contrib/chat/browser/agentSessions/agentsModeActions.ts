/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';

/** Whether the window can enter Agents mode: it supports the mode, is not in it, and the user has the mode turned on. */
export const CanEnterAgentsMode = new RawContextKey<boolean>('chatCanEnterAgentsMode', false, true);
export const AgentsModeActive = new RawContextKey<boolean>('chatAgentsModeActive', false, true);
/**
 * Matches where the Agents mode toggle can run and is shown in the title bar. Leaving the mode does not need chat, so a
 * window in the mode can always leave it, also once AI features are disabled.
 */
export const AgentsModeToggleAvailable = ContextKeyExpr.or(AgentsModeActive, ContextKeyExpr.and(ChatContextKeys.enabled, CanEnterAgentsMode))!;

export class ToggleAgentsModeAction extends Action2 {
	static readonly ID = 'workbench.action.chat.toggleAgentsMode';

	constructor() {
		super({
			id: ToggleAgentsModeAction.ID,
			title: localize2('toggleAgentsMode', "Toggle Agents Mode"),
			category: CHAT_CATEGORY,
			icon: Codicon.agent,
			precondition: AgentsModeToggleAvailable,
			toggled: AgentsModeActive,
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyM,
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: {
				id: MenuId.TitleBarAdjacentCenter,
				when: AgentsModeToggleAvailable,
				order: -999,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const contextKeyService = accessor.get(IContextKeyService);
		const agentsModeService = accessor.get(IAgentsModeService);
		if (!contextKeyService.contextMatchesRules(AgentsModeToggleAvailable) || !agentsModeService.isSupported) {
			throw new Error(localize('agentsMode.unavailable', "Agents mode is unavailable in this window."));
		}

		// Switching sessions in the mode clears the history of recently opened editors: the window gets its own history back
		// when the user leaves the mode, or when it enters another workspace from the mode.
		const historyService = accessor.get(IHistoryService);
		if (agentsModeService.isActive) {
			await agentsModeService.setActive(false);
			historyService.restoreRecentlyOpened();
		} else {
			// Saved only once the window is in the mode, also when entering fails after the switch: an entry that
			// did not switch, or a leave that followed it, leaves no saved history behind.
			try {
				await agentsModeService.setActive(true);
			} finally {
				if (agentsModeService.isActive) {
					historyService.saveRecentlyOpened();
				}
			}
		}
	}
}
