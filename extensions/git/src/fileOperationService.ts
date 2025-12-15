/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, EventEmitter, Uri, workspace } from 'vscode';

export interface IFileMoveOperation {
	readonly source: Uri;
	readonly target: Uri;
}

export interface IFileMoveEvent {
	readonly files: readonly IFileMoveOperation[];
}

export interface IFileOperationService extends Disposable {
	readonly onDidMoveFiles: Event<IFileMoveEvent>;
}

/**
 * Wraps VS Code's workspace.onDidRenameFiles to provide file move events.
 */
export class FileOperationService implements IFileOperationService {
	private readonly disposables: Disposable[] = [];

	private readonly _onDidMoveFiles = new EventEmitter<IFileMoveEvent>();
	readonly onDidMoveFiles = this._onDidMoveFiles.event;

	constructor() {
		this.disposables.push(
			workspace.onDidRenameFiles(e => {
				// Only handle file: scheme URIs (skip vscode-userdata:, etc.)
				const files = e.files
					.filter(f => f.oldUri.scheme === 'file' && f.newUri.scheme === 'file')
					.map(f => ({
						source: f.oldUri,
						target: f.newUri
					}));
				if (files.length > 0) {
					this._onDidMoveFiles.fire({ files });
				}
			})
		);
	}

	dispose(): void {
		this._onDidMoveFiles.dispose();
		this.disposables.forEach(d => d.dispose());
	}
}
