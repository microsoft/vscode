/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ActiveEditorContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { MultiDiffEditorFileListAvailableContext, MultiDiffEditorFileListEnabledContext, MultiDiffEditorFileListPositionContext, MultiDiffEditorFileListViewModeContext, MultiDiffEditorFilesViewAndPositionMenu } from '../../../../workbench/contrib/multiDiffEditor/common/multiDiffEditor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ChatWindowContext } from '../../../services/chatWindow/browser/chatWindowService.js';
import { SessionChangesEditor } from '../../changes/browser/sessionChangesEditor.js';

/**
 * The changed files list of the Changes editor in chat windows. The core multi diff editor
 * actions switch the shared list state, but are gated to the workbench's own multi diff editor,
 * so this only adds menu entries for them with the chat window conditions. Only focusing the
 * list needs an action of its own, because the core one looks for the workbench's editor.
 */
const ChangesFileListContext = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.has(ChatWindowContext.key),
	ActiveEditorContext.isEqualTo(SessionChangesEditor.ID),
	MultiDiffEditorFileListAvailableContext,
)!;

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: 'multiDiffEditor.toggleFileList',
		title: localize2('chatWindowChangesToggleFiles', "Toggle Files"),
		icon: Codicon.listFlat,
		toggled: MultiDiffEditorFileListEnabledContext,
		precondition: ChangesFileListContext,
	},
	group: 'navigation',
	order: 100001,
	when: ChangesFileListContext,
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	submenu: MultiDiffEditorFilesViewAndPositionMenu,
	title: localize('chatWindowChangesFilesViewAndPosition', "Files View & Position"),
	group: '2_files',
	order: 10,
	when: ChangesFileListContext,
});

const entries = [
	{ id: 'multiDiffEditor.viewFileListAsList', title: localize2('chatWindowChangesViewAsList', "View as List"), group: '1_view', order: 1, toggled: MultiDiffEditorFileListViewModeContext.isEqualTo('list') },
	{ id: 'multiDiffEditor.viewFileListAsTree', title: localize2('chatWindowChangesViewAsTree', "View as Tree"), group: '1_view', order: 2, toggled: MultiDiffEditorFileListViewModeContext.isEqualTo('tree') },
	{ id: 'multiDiffEditor.positionFileListLeft', title: localize2('chatWindowChangesFilesLeft', "On the Left"), group: '2_position', order: 1, toggled: MultiDiffEditorFileListPositionContext.isEqualTo('left') },
	{ id: 'multiDiffEditor.positionFileListRight', title: localize2('chatWindowChangesFilesRight', "On the Right"), group: '2_position', order: 2, toggled: MultiDiffEditorFileListPositionContext.isEqualTo('right') },
];
for (const { id, title, group, order, toggled } of entries) {
	MenuRegistry.appendMenuItem(MultiDiffEditorFilesViewAndPositionMenu, {
		command: { id, title, toggled, precondition: ChangesFileListContext },
		group,
		order,
		when: ChangesFileListContext,
	});
}

registerAction2(class FocusChatWindowChangesFilesAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatWindow.changes.focusFiles',
			title: localize2('chatWindowChangesFocusFiles', "Focus Changed Files List"),
			category: localize2('chatWindowChangesCategory', "Chat Window"),
			f1: true,
			precondition: ChangesFileListContext,
		});
	}

	run(accessor: ServicesAccessor): void {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (editor instanceof SessionChangesEditor) {
			editor.focusFileList();
		}
	}
});
