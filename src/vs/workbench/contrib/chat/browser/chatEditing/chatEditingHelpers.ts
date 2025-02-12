/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { parse } from '../../../../services/notebook/common/notebookDocumentService.js';
import { getNotebookCellChatEditorController } from '../../../notebook/browser/contrib/chatEdit/notebookChatEditController.js';
import { IChatEditorController } from './chatEditingBaseEditorController.js';
import { ChatEditorController } from './chatEditingEditorController.js';


export function getChatEditorController(editor: ICodeEditor): IChatEditorController | null {
	const modelUri = editor.getModel()?.uri;
	const notebookUri = modelUri ? parse(modelUri)?.notebook : undefined;
	const controller = notebookUri ? undefined : ChatEditorController.get(editor);
	if (controller) {
		return controller;
	}

	return getNotebookCellChatEditorController(editor);
}
