/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { derived, waitForState } from '../../../../../base/common/observable.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { EditSuggestionId } from '../../../../../editor/common/textModelEditSource.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { ChatModel } from '../../common/model/chatModel.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';


export async function reviewEdits(accessor: ServicesAccessor, editor: ICodeEditor, stream: AsyncIterable<TextEdit[]>, token: CancellationToken, applyCodeBlockSuggestionId: EditSuggestionId | undefined): Promise<boolean> {
	if (!editor.hasModel()) {
		return false;
	}

	const chatService = accessor.get(IChatService);
	const uri = editor.getModel().uri;
	const chatModelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
	const chatModel = chatModelRef.object as ChatModel;

	chatModel.startEditingSession(true);

	const store = new DisposableStore();
	store.add(chatModelRef);

	// STREAM
	const chatRequest = chatModel?.addRequest({ text: '', parts: [] }, { variables: [] }, 0, {
		kind: undefined,
		modeId: 'applyCodeBlock',
		modeInstructions: undefined,
		isBuiltin: true,
		applyCodeBlockSuggestionId,
	});
	assertType(chatRequest.response);
	chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
	for await (const chunk of stream) {

		if (token.isCancellationRequested) {
			chatRequest.response.cancel();
			break;
		}

		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: chunk, done: false });
	}
	chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });

	if (!token.isCancellationRequested) {
		chatRequest.response.complete();
	}

	const isSettled = derived(r => {
		const entry = chatModel.editingSession?.readEntry(uri, r);
		if (!entry) {
			return false;
		}
		const state = entry.state.read(r);
		return state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected;
	});
	const whenDecided = waitForState(isSettled, Boolean);
	await raceCancellation(whenDecided, token);
	store.dispose();
	return true;
}

export async function reviewNotebookEdits(accessor: ServicesAccessor, uri: URI, stream: AsyncIterable<[URI, TextEdit[]] | ICellEditOperation[]>, token: CancellationToken): Promise<boolean> {

	const chatService = accessor.get(IChatService);
	const notebookService = accessor.get(INotebookService);
	const isNotebook = notebookService.hasSupportedNotebooks(uri);
	const chatModelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
	const chatModel = chatModelRef.object as ChatModel;

	chatModel.startEditingSession(true);

	const store = new DisposableStore();
	store.add(chatModelRef);

	// STREAM
	const chatRequest = chatModel?.addRequest({ text: '', parts: [] }, { variables: [] }, 0);
	assertType(chatRequest.response);
	if (isNotebook) {
		chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: [], done: false });
	} else {
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
	}
	for await (const chunk of stream) {

		if (token.isCancellationRequested) {
			chatRequest.response.cancel();
			break;
		}
		if (chunk.every(isCellEditOperation)) {
			chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: chunk, done: false });
		} else {
			chatRequest.response.updateContent({ kind: 'textEdit', uri: chunk[0], edits: chunk[1], done: false });
		}
	}
	if (isNotebook) {
		chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: [], done: true });
	} else {
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });
	}

	if (!token.isCancellationRequested) {
		chatRequest.response.complete();
	}

	const isSettled = derived(r => {
		const entry = chatModel.editingSession?.readEntry(uri, r);
		if (!entry) {
			return false;
		}
		const state = entry.state.read(r);
		return state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected;
	});

	const whenDecided = waitForState(isSettled, Boolean);

	await raceCancellation(whenDecided, token);

	store.dispose();

	return true;
}
function isCellEditOperation(edit: URI | TextEdit[] | ICellEditOperation): edit is ICellEditOperation {
	if (URI.isUri(edit)) {
		return false;
	}
	if (Array.isArray(edit)) {
		return false;
	}
	return true;
}
