/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { EditorMaximizedContext } from '../../../common/contextkeys.js';

class MaximizeMainEditorPartAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.maximizeMainEditorPart';

	constructor() {
		super({
			id: MaximizeMainEditorPartAction.ID,
			title: localize2('maximizeMainEditorPart', "Maximize Editor"),
			icon: Codicon.screenFull,
			f1: false,
			menu: {
				id: MenuId.EditorTitleLayout,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					EditorMaximizedContext.negate())
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		layoutService.setEditorMaximized(true);
	}
}

registerAction2(MaximizeMainEditorPartAction);

class RestoreMainEditorPartAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.restoreMainEditorPart';

	constructor() {
		super({
			id: RestoreMainEditorPartAction.ID,
			title: localize2('restoreMainEditorPart', "Restore Editor"),
			icon: Codicon.screenNormal,
			f1: false,
			menu: {
				id: MenuId.EditorTitleLayout,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					EditorMaximizedContext)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		layoutService.setEditorMaximized(false);
	}
}

registerAction2(RestoreMainEditorPartAction);

class CloseMainEditorPartAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.closeMainEditorPart';

	constructor() {
		super({
			id: CloseMainEditorPartAction.ID,
			title: localize2('closeMainEditorPart', "Close Editor"),
			icon: Codicon.close,
			f1: false,
			menu: {
				id: MenuId.EditorTitleLayout,
				group: 'navigation',
				order: 100,
				when: IsSessionsWindowContext
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.closeAllGroups');
	}
}

registerAction2(CloseMainEditorPartAction);
