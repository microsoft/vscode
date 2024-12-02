/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { NotebookChatEditorController } from '../../notebook/browser/contrib/chatEdit/notebookChatEditorController.js';
import { ChatEditorController } from './chatEditorController.js';
import { IChatEditorController } from './chatEditorControllerBase.js';

export function getChatEditorController(editor: ICodeEditor): IChatEditorController | null {
	const controller = ChatEditorController.get(editor);
	if (controller?.entry.get()) {
		return controller;
	}

	return NotebookChatEditorController.get(editor);
}
