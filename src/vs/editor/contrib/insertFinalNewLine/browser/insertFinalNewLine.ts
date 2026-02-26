/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, registerEditorAction, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { InsertFinalNewLineCommand } from './insertFinalNewLineCommand.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import * as nls from '../../../../nls.js';

export class InsertFinalNewLineAction extends EditorAction {

	public static readonly ID = 'editor.action.insertFinalNewLine';

	constructor() {
		super({
			id: InsertFinalNewLineAction.ID,
			label: nls.localize2('insertFinalNewLine', "Insert Final New Line"),
			precondition: EditorContextKeys.writable
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void {
		const selection = editor.getSelection();
		if (selection === null) {
			return;
		}

		const command = new InsertFinalNewLineCommand(selection);

		editor.pushUndoStop();
		editor.executeCommands(this.id, [command]);
		editor.pushUndoStop();
	}
}

registerEditorAction(InsertFinalNewLineAction);
