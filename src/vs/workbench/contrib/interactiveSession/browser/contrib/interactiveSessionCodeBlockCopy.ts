/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CopyAction } from 'vs/editor/contrib/clipboard/browser/clipboard';
import { codeBlockInfosByModelUri } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionListRenderer';
import { IInteractiveSessionService, InteractiveSessionCopyKind } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';


CopyAction?.addImplementation(50000, 'interactiveSession-codeblock', (accessor) => {
	// get active code editor
	const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	const editorUri = editor?.getModel()?.uri;
	if (!editorUri) {
		return false;
	}

	const info = codeBlockInfosByModelUri.get(editorUri);
	if (!info) {
		return false;
	}

	const editorModel = editor.getModel();
	if (!editorModel) {
		return false;
	}

	const copiedText = editor.getSelections()?.reduce((acc, selection) => acc + editorModel.getValueInRange(selection), '') ?? '';
	const totalCharacters = editorModel.getValueLength();

	const interactiveSessionService = accessor.get(IInteractiveSessionService);
	interactiveSessionService.notifyUserAction({
		providerId: info.providerId,
		action: {
			kind: 'copy',
			codeBlockIndex: info.codeBlockIndex,
			responseId: info.responseId,
			copyType: InteractiveSessionCopyKind.Action,
			copiedText,
			copiedCharacters: copiedText.length,
			totalCharacters,
		}
	});

	return false;
});
