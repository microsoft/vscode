/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../base/common/assert.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ITransaction, IObservable, constObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IEditorPane } from '../../../../common/editor.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IModifiedFileEntryEditorIntegration } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { AbstractChatEditingModifiedFileEntry, ISnapshotEntry } from './chatEditingModifiedFileEntry.js';

export class ChatEditingModifiedNotebookEntry extends AbstractChatEditingModifiedFileEntry {

	override originalURI: URI = URI.parse('todo://todo/todo');

	override initialContent: string = 'JSON.stringify(NotebookData)';

	override changesCount: IObservable<number> = constObservable(Number.MAX_SAFE_INTEGER);

	protected override _doAccept(tx: ITransaction | undefined): Promise<void> {
		throw new Error('Method not implemented.');
	}

	protected override _doReject(tx: ITransaction | undefined): Promise<void> {
		throw new Error('Method not implemented.');
	}

	protected override _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		throw new Error('Method not implemented.');
	}

	override async acceptAgentEdits(resource: URI, edits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {

		const isCellUri = resource.scheme === Schemas.vscodeNotebookCell;
		assert(isCellUri || isEqual(resource, this.modifiedURI));
		assertType(edits.every(edit => !TextEdit.isTextEdit(edit) || isCellUri));

		// needs to handle notebook and textual cell edits

		throw new Error('Method not implemented.');
	}

	override createSnapshot(requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry {
		throw new Error('Method not implemented.');
	}

	override equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean {
		throw new Error('Method not implemented.');
	}

	override restoreFromSnapshot(snapshot: ISnapshotEntry): void {
		throw new Error('Method not implemented.');
	}

	override resetToInitialContent(): void {
		throw new Error('Method not implemented.');
	}
}
