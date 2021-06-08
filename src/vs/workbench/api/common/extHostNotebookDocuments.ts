/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostNotebookDocumentsShape, INotebookDocumentPropertiesChangeData } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { NotebookCellsChangedEventDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import type * as vscode from 'vscode';

export class ExtHostNotebookDocuments implements ExtHostNotebookDocumentsShape {

	private readonly _onDidChangeNotebookDocumentMetadata = new Emitter<vscode.NotebookDocumentMetadataChangeEvent>();
	readonly onDidChangeNotebookDocumentMetadata = this._onDidChangeNotebookDocumentMetadata.event;

	private _onDidSaveNotebookDocument = new Emitter<vscode.NotebookDocument>();
	readonly onDidSaveNotebookDocument = this._onDidSaveNotebookDocument.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		private readonly _notebooksAndEditors: ExtHostNotebookController,
	) { }

	$acceptModelChanged(uri: UriComponents, event: NotebookCellsChangedEventDto, isDirty: boolean): void {
		const document = this._notebooksAndEditors.getNotebookDocument(URI.revive(uri));
		document.acceptModelChanged(event, isDirty);
	}

	$acceptDirtyStateChanged(uri: UriComponents, isDirty: boolean): void {
		const document = this._notebooksAndEditors.getNotebookDocument(URI.revive(uri));
		document.acceptModelChanged({ rawEvents: [], versionId: document.apiNotebook.version }, isDirty);
	}

	$acceptModelSaved(uri: UriComponents): void {
		const document = this._notebooksAndEditors.getNotebookDocument(URI.revive(uri));
		this._onDidSaveNotebookDocument.fire(document.apiNotebook);
	}

	$acceptDocumentPropertiesChanged(uri: UriComponents, data: INotebookDocumentPropertiesChangeData): void {
		this._logService.debug('ExtHostNotebook#$acceptDocumentPropertiesChanged', uri.path, data);
		const document = this._notebooksAndEditors.getNotebookDocument(URI.revive(uri));
		document.acceptDocumentPropertiesChanged(data);
		if (data.metadata) {
			this._onDidChangeNotebookDocumentMetadata.fire({ document: document.apiNotebook });
		}
	}
}
