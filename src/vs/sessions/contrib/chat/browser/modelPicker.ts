/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { COMPARE_SESSION_MODELS_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { ModelComparisonAvailableContext, ModelComparisonPickerFocusedContext } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerComparison.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { resolveGridCommandView } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { ModelPickerToolbarsContribution, registerModelPickerAction } from '../../../../workbench/contrib/sessions/browser/chat/modelPicker.js';

registerModelPickerAction();

// -- Action --

registerAction2(class extends Action2 {
	constructor() {
		const precondition = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ModelComparisonAvailableContext);
		super({
			id: COMPARE_SESSION_MODELS_COMMAND_ID,
			title: localize2('sessions.compareModels', "Compare Models"),
			f1: true,
			precondition,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyM,
				when: ContextKeyExpr.and(precondition, ContextKeyExpr.or(ChatContextKeys.inputHasFocus, ChatContextKeys.inChatComposer, ModelComparisonPickerFocusedContext)),
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		const parts = accessor.get(ISessionsPartService);
		(parts.getFocusedSessionView() ?? resolveGridCommandView(accessor))?.openModelComparison();
	}
});

registerWorkbenchContribution2(ModelPickerToolbarsContribution.ID, ModelPickerToolbarsContribution, WorkbenchPhase.BlockRestore);
