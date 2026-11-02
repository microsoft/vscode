/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ActiveEditorContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { MultiDiffEditorFileListAvailableContext, MultiDiffEditorFileListEnabledContext } from '../../../../workbench/contrib/multiDiffEditor/common/multiDiffEditor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../browser/menus.js';
import { ChatWindowContext } from '../../../services/chatWindow/browser/chatWindowService.js';
import { SessionChangesEditor } from '../../changes/browser/sessionChangesEditor.js';

/**
 * The changed files list of the Changes editor in chat windows. The core multi diff editor
 * actions switch the shared list state, but are gated to the workbench's own multi diff editor,
 * so this only adds the toggle for them, in the right side of the editor header row, with the chat window conditions. The "…" menu is the Changes editor's own. Only focusing the
 * list needs an action of its own, because the core one looks for the workbench's editor.
 */
const ChangesFileListContext = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.has(ChatWindowContext.key),
	ActiveEditorContext.isEqualTo(SessionChangesEditor.ID),
	MultiDiffEditorFileListAvailableContext,
)!;

MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderLayout, {
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
