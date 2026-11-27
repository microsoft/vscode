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
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AGENTS_MODE_ENABLED_SETTING } from '../../../../services/configuration/browser/agents/agentsModeWorkspaceService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { AgentsModeAuxiliaryBar } from './agentsModeAuxiliaryBar.js';

export const CanEnterAgentsMode = new RawContextKey<boolean>('chatCanEnterAgentsMode', false, true);
export const AgentsModeActive = new RawContextKey<boolean>('chatAgentsModeActive', false, true);
/**
 * Matches where the Agents mode toggle can run and is shown in the title bar. Leaving the mode does not need chat, so a
 * window in the mode can always leave it, also once AI features are disabled.
 */
export const AgentsModeToggleAvailable = ContextKeyExpr.or(AgentsModeActive, ContextKeyExpr.and(ChatContextKeys.enabled, CanEnterAgentsMode, ContextKeyExpr.has(`config.${AGENTS_MODE_ENABLED_SETTING}`)))!;
const precondition = AgentsModeToggleAvailable;

export class ToggleAgentsModeAction extends Action2 {
	static readonly ID = 'workbench.action.chat.toggleAgentsMode';

	constructor() {
		super({
			id: ToggleAgentsModeAction.ID,
			title: localize2('toggleAgentsMode', "Toggle Agents Mode"),
			category: CHAT_CATEGORY,
			icon: Codicon.agent,
			precondition,
			toggled: AgentsModeActive,
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyM,
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: {
				id: MenuId.TitleBarAdjacentCenter,
				when: precondition,
				order: -999,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const contextKeyService = accessor.get(IContextKeyService);
		const agentsModeService = accessor.get(IAgentsModeService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const storageService = accessor.get(IStorageService);
		if (!contextKeyService.contextMatchesRules(precondition) || !agentsModeService.isSupported) {
			throw new Error(localize('agentsMode.unavailable', "Agents mode is unavailable in this window."));
		}

		const entering = !agentsModeService.isActive;
		// Switching moves the side bars and can hide the editor area, so remember the secondary side bar's width before:
		// as the window leaves the mode, and the first time it enters, where it is visible. AgentsModeAuxiliaryBar gives
		// it that width once the window switched.
		const width = this.getAuxiliaryBarWidth(layoutService);
		if (width !== undefined && (!entering || storageService.getNumber(AgentsModeAuxiliaryBar.WIDTH_STORAGE_KEY, StorageScope.PROFILE) === undefined)) {
			storageService.store(AgentsModeAuxiliaryBar.WIDTH_STORAGE_KEY, width, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		await agentsModeService.setActive(entering);
	}

	private getAuxiliaryBarWidth(layoutService: IWorkbenchLayoutService): number | undefined {
		return layoutService.isVisible(Parts.AUXILIARYBAR_PART) && !layoutService.isAuxiliaryBarMaximized() ? layoutService.getSize(Parts.AUXILIARYBAR_PART).width : undefined;
	}
}
