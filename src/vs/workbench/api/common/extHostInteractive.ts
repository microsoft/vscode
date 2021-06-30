/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { ExtHostInteractiveShape, IMainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';

export class ExtHostInteractive implements ExtHostInteractiveShape {
	constructor(
		mainContext: IMainContext,
		private _extHostNotebooks: ExtHostNotebookController,
		private _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
	) {
	}

	$willAddInteractiveDocument(uri: UriComponents, eol: string, modeId: string, notebookUri: UriComponents) {
		this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				EOL: eol,
				lines: [''],
				modeId: modeId,
				uri: uri,
				isDirty: false,
				versionId: 1,
				notebook: this._extHostNotebooks.getNotebookDocument(URI.revive(notebookUri))?.apiNotebook
			}]
		});
	}

	$willRemoveInteractiveDocument(uri: UriComponents, notebookUri: UriComponents) {
		this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
			removedDocuments: [uri]
		});
	}
}
