/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AGENTIC_MODE_ENABLED_SETTING } from '../../../../services/configuration/browser/agents/agenticModeWorkspaceService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IAgenticModeService } from '../../../../services/agenticMode/common/agenticMode.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';

export const agenticModeEnabledSetting = AGENTIC_MODE_ENABLED_SETTING;
export const CanEnterAgenticMode = new RawContextKey<boolean>('chatCanEnterAgenticMode', false, true);
export const AgenticModeActive = new RawContextKey<boolean>('chatAgenticModeActive', false, true);
/** Matches where the Agentic Mode toggle can run and is shown in the title bar. */
export const AgenticModeToggleAvailable = ContextKeyExpr.or(AgenticModeActive, ContextKeyExpr.and(ChatContextKeys.enabled, CanEnterAgenticMode, ContextKeyExpr.has(`config.${agenticModeEnabledSetting}`)))!;
const precondition = AgenticModeToggleAvailable;

export class ToggleAgenticModeAction extends Action2 {
	static readonly ID = 'workbench.action.chat.toggleAgenticMode';
	/** The secondary side bar's width in the mode, as the window last left it. */
	static readonly AUXILIARY_BAR_WIDTH_STORAGE_KEY = 'chat.agenticMode.auxiliaryBarWidth';

	constructor() {
		super({
			id: ToggleAgenticModeAction.ID,
			title: localize2('toggleAgenticMode', "Toggle Agentic Mode"),
			category: CHAT_CATEGORY,
			icon: Codicon.agent,
			precondition,
			toggled: AgenticModeActive,
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
		const agenticModeService = accessor.get(IAgenticModeService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const storageService = accessor.get(IStorageService);
		if (!contextKeyService.contextMatchesRules(precondition) || !agenticModeService.isSupported) {
			throw new Error(localize('agenticMode.unavailable', "Agentic Mode is unavailable in this window."));
		}

		const entering = !agenticModeService.isActive;
		const currentWidth = this.getAuxiliaryBarWidth(layoutService);
		if (!entering && currentWidth !== undefined) {
			storageService.store(ToggleAgenticModeAction.AUXILIARY_BAR_WIDTH_STORAGE_KEY, currentWidth, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		await agenticModeService.setActive(entering);

		// The secondary side bar comes back at the width it had in the mode, whatever the Chat view did with it outside.
		// The first time, it keeps its width, or takes the layout's default width when it was hidden or maximized
		// (as `LayoutStateKeys.AUXILIARYBAR_SIZE.defaultValue` in vs/workbench/browser/layout.ts computes it).
		const auxiliaryBarWidth = entering
			? storageService.getNumber(ToggleAgenticModeAction.AUXILIARY_BAR_WIDTH_STORAGE_KEY, StorageScope.PROFILE) ?? currentWidth ?? Math.round(Math.min(300, layoutService.mainContainerDimension.width / 4))
			: currentWidth;
		if (auxiliaryBarWidth === undefined) {
			return;
		}

		// Switching moves the side bars and hides the editor area, which can squeeze
		// the secondary side bar: keep the width it had before the switch
		await timeout(0);
		const width = this.getAuxiliaryBarWidth(layoutService);
		if (width !== undefined && width !== auxiliaryBarWidth) {
			layoutService.setSize(Parts.AUXILIARYBAR_PART, { width: auxiliaryBarWidth, height: layoutService.getSize(Parts.AUXILIARYBAR_PART).height });
		}
	}

	private getAuxiliaryBarWidth(layoutService: IWorkbenchLayoutService): number | undefined {
		return layoutService.isVisible(Parts.AUXILIARYBAR_PART) && !layoutService.isAuxiliaryBarMaximized() ? layoutService.getSize(Parts.AUXILIARYBAR_PART).width : undefined;
	}
}
