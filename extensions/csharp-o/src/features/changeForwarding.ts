/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Disposable, Uri, workspace} from 'vscode';
import {OmnisharpServer} from '../omnisharpServer';
import * as proto from '../protocol';

function forwardDocumentChanges(server: OmnisharpServer): Disposable {

	return workspace.onDidChangeTextDocument(event => {

		let {document} = event;
		if (document.isUntitled || document.languageId !== 'csharp') {
			return;
		}

		if (!server.isRunning()) {
			return;
		}

		server.makeRequest(proto.UpdateBuffer, <proto.Request>{
			Buffer: document.getText(),
			Filename: document.fileName
		}).catch(err => {
			console.error(err);
			return err;
		});
	});
}

function forwardFileChanges(server: OmnisharpServer): Disposable {

	function onFileSystemEvent(uri: Uri): void {
		if (!server.isRunning()) {
			return;
		}
		let req = { Filename: uri.fsPath };
		server.makeRequest<boolean>(proto.FilesChanged, [req]).catch(err => {
			console.warn('[o] failed to forward file change event for ' + uri.fsPath, err);
			return err;
		});
	}

	const watcher = workspace.createFileSystemWatcher('**/*.*');
	let d1 = watcher.onDidCreate(onFileSystemEvent);
	let d2 = watcher.onDidChange(onFileSystemEvent);
	let d3 = watcher.onDidDelete(onFileSystemEvent);

	return Disposable.from(watcher, d1, d2, d3);
}

export default function forwardChanges(server: OmnisharpServer): Disposable {

	// combine file watching and text document watching
	return Disposable.from(
		forwardDocumentChanges(server),
		forwardFileChanges(server));
}
