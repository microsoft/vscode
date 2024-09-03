/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ExtHostInteractiveShape, IMainContext } from './extHost.protocol.js';
import { ApiCommand, ApiCommandArgument, ApiCommandResult, ExtHostCommands } from './extHostCommands.js';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { ExtHostNotebookController } from './extHostNotebook.js';
import { NotebookEditor } from 'vscode';

export class ExtHostInteractive implements ExtHostInteractiveShape {
	constructor(
		mainContext: IMainContext,
		private _extHostNotebooks: ExtHostNotebookController,
		private _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private _commands: ExtHostCommands,
		_logService: ILogService
	) {
		const openApiCommand = new ApiCommand(
			'interactive.open',
			'_interactive.open',
			'Open interactive window and return notebook editor and input URI',
			[
				new ApiCommandArgument('showOptions', 'Show Options', v => true, v => v),
				new ApiCommandArgument('resource', 'Interactive resource Uri', v => true, v => v),
				new ApiCommandArgument('controllerId', 'Notebook controller Id', v => true, v => v),
				new ApiCommandArgument('title', 'Interactive editor title', v => true, v => v)
			],
			new ApiCommandResult<{ notebookUri: UriComponents; inputUri: UriComponents; notebookEditorId?: string }, { notebookUri: URI; inputUri: URI; notebookEditor?: NotebookEditor }>('Notebook and input URI', (v: { notebookUri: UriComponents; inputUri: UriComponents; notebookEditorId?: string }) => {
				_logService.debug('[ExtHostInteractive] open iw with notebook editor id', v.notebookEditorId);
				if (v.notebookEditorId !== undefined) {
					const editor = this._extHostNotebooks.getEditorById(v.notebookEditorId);
					_logService.debug('[ExtHostInteractive] notebook editor found', editor.id);
					return { notebookUri: URI.revive(v.notebookUri), inputUri: URI.revive(v.inputUri), notebookEditor: editor.apiEditor };
				}
				_logService.debug('[ExtHostInteractive] notebook editor not found, uris for the interactive document', v.notebookUri, v.inputUri);
				return { notebookUri: URI.revive(v.notebookUri), inputUri: URI.revive(v.inputUri) };
			})
		);
		this._commands.registerApiCommand(openApiCommand);
	}

	$willAddInteractiveDocument(uri: UriComponents, eol: string, languageId: string, notebookUri: UriComponents) {
		this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				EOL: eol,
				lines: [''],
				languageId: languageId,
				uri: uri,
				isDirty: false,
				versionId: 1,
			}]
		});
	}

	$willRemoveInteractiveDocument(uri: UriComponents, notebookUri: UriComponents) {
		this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
			removedDocuments: [uri]
		});
	}
}
