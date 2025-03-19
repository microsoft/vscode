/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vscode-uri';
import { FileStat, Disposable, workspace } from 'vscode';

import { ObservableDisposable } from '../utils/vscode';
import { IFileSystemService, FileChangeEvent } from './types';

/**
 * File system service implementation based on VSCode file system API.
 */
export class FileSystemService extends ObservableDisposable implements IFileSystemService {
	public async stat(uri: URI): Promise<FileStat> {
		return workspace.fs.stat(uri);
	}

	public async readFile(uri: URI): Promise<Uint8Array> {
		return workspace.fs.readFile(uri);
	}

	public async writeFile(uri: URI, content: Uint8Array): Promise<void> {
		return workspace.fs.writeFile(uri, content);
	}

	public async delete(uri: URI, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
		return workspace.fs.delete(uri, options);
	}

	public async createDirectory(uri: URI): Promise<void> {
		return workspace.fs.createDirectory(uri);
	}

	public onFileChange(uri: URI, callback: (event: FileChangeEvent) => void): Disposable {
		const watcher = workspace.createFileSystemWatcher(uri.fsPath);

		// TODO: @legomushroom - do we need to store the disposables here?
		watcher.onDidCreate(() => {
			callback(FileChangeEvent.ADDED);
		});

		watcher.onDidChange(() => {
			callback(FileChangeEvent.UPDATED);
		});

		watcher.onDidDelete(() => {
			callback(FileChangeEvent.DELETED);
		});

		return watcher;
	}
}
