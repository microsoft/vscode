/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { IProjectBoardService } from './projectBoardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { OPEN_AGENT_PROJECT_BOARD_COMMAND_ID } from '../../../../platform/window/common/window.js';
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ChatEditorInput } from '../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { KanbanCustomViewContribution } from './kanbanView.js';

registerWorkbenchContribution2(KanbanCustomViewContribution.ID, KanbanCustomViewContribution, WorkbenchPhase.BlockRestore);

registerAction2(class OpenProjectBoardAction extends Action2 {
	constructor() {
		super({
			id: OPEN_AGENT_PROJECT_BOARD_COMMAND_ID,
			title: localize2('openAgentProjectBoard', "Agents: Open Project Board"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const lifecycleService = accessor.get(ILifecycleService);
		const projectBoardService = accessor.get(IProjectBoardService);
		await lifecycleService.when(LifecyclePhase.Restored);
		await projectBoardService.open();
	}
});

registerAction2(class CloseStandaloneSessionAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentProjectBoard.closeSession',
			title: localize2('closeStandaloneSession', "Close Standalone Chat"),
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, IsAuxiliaryWindowContext, ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID)),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib - 10,
				when: ContextKeyExpr.and(
					EditorContextKeys.hasNonEmptySelection.toNegated(),
					EditorContextKeys.hasMultipleSelections.toNegated(),
					ChatContextKeys.findWidgetVisible.toNegated(),
				),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IProjectBoardService).closeSession(getActiveWindow().vscodeWindowId);
	}
});
