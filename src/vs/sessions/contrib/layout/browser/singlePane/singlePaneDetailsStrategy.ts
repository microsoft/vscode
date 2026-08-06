/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { HasDockedDetailsContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/** Command that toggles the single-pane detail panel (auxiliary bar) from the editor header. */
export const TOGGLE_DETAILS_COMMAND_ID = 'workbench.action.agentSessions.toggleDetails';
const singlePaneHeaderToggleDetailsOrder = 10;

/**
 * Owns the single-pane Toggle Details action. The Sessions sidebar remains under
 * explicit user control and is never changed as a side effect of this action.
 */
export class SinglePaneDetailsStrategy extends SinglePaneLayoutStrategy {

	constructor(
		ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
	) {
		super(ctx);
		this._register(this._registerToggleDetailsAction());
	}

	/** Toggle the detail panel and return whether it is now visible. */
	toggleDetails(): boolean {
		const nowVisible = !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._layoutService.setPartHidden(!nowVisible, Parts.AUXILIARYBAR_PART);
		return nowVisible;
	}

	private _registerToggleDetailsAction(): IDisposable {
		const that = this;
		return registerAction2(class extends Action2 {
			constructor() {
				super({
					id: TOGGLE_DETAILS_COMMAND_ID,
					title: localize2('toggleDetails', "Toggle Details"),
					icon: Codicon.listSelection,
					f1: false,
					toggled: AuxiliaryBarVisibleContext,
					keybinding: {
						weight: KeybindingWeight.SessionsContrib,
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL,
						when: ContextKeyExpr.and(
							IsSessionsWindowContext,
							IsAuxiliaryWindowContext.toNegated(),
							SinglePaneLayoutEnabledContext)
					},
					menu: {
						id: Menus.SessionsEditorHeaderLayout,
						group: 'navigation',
						order: singlePaneHeaderToggleDetailsOrder,
						// Not every tab type has a detail panel to show/hide (e.g. browser
						// and search tabs), so only surface the toggle for tab types that do.
						when: ContextKeyExpr.and(
							IsSessionsWindowContext,
							IsAuxiliaryWindowContext.toNegated(),
							IsTopRightEditorGroupContext,
							SinglePaneLayoutEnabledContext,
							MainEditorAreaVisibleContext,
							HasDockedDetailsContext)
					}
				});
			}

			run(): void {
				that.toggleDetails();
			}
		});
	}
}
