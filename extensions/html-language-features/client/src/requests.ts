/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, workspace, Disposable } from 'vscode';
import { RequestType, BaseLanguageClient } from 'vscode-languageclient';
import { Runtime } from './htmlClient';

export namespace FsStatRequest {
	export const type: RequestType<string, FileStat, any> = new RequestType('fs/stat');
}

export namespace FsReadDirRequest {
	export const type: RequestType<string, [string, FileType][], any> = new RequestType('fs/readDir');
}

export function serveFileSystemRequests(client: BaseLanguageClient, runtime: Runtime): Disposable {
	const disposables = [];
	disposables.push(client.onRequest(FsReadDirRequest.type, (uriString: string) => {
		const uri = Uri.parse(uriString);
		if (uri.scheme === 'file' && runtime.fileFs) {
			return runtime.fileFs.readDirectory(uriString);
		}
		return workspace.fs.readDirectory(uri);
	}));
	disposables.push(client.onRequest(FsStatRequest.type, (uriString: string) => {
		const uri = Uri.parse(uriString);
		if (uri.scheme === 'file' && runtime.fileFs) {
			return runtime.fileFs.stat(uriString);
		}
		return workspace.fs.stat(uri);
	}));
	return Disposable.from(...disposables);
}

export enum FileType {
	/**
	 * The file type is unknown.
	 */
	Unknown = 0,
	/**
	 * A regular file.
	 */
	File = 1,
	/**
	 * A directory.
	 */
	Directory = 2,
	/**
	 * A symbolic link to a file.
	 */
	SymbolicLink = 64
}
export interface FileStat {
	/**
	 * The type of the file, e.g. is a regular file, a directory, or symbolic link
	 * to a file.
	 */
	type: FileType;
	/**
	 * The creation timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
	 */
	ctime: number;
	/**
	 * The modification timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
	 */
	mtime: number;
	/**
	 * The size in bytes.
	 */
	size: number;
}

export interface FileSystemProvider {
	stat(uri: string): Promise<FileStat>;
	readDirectory(uri: string): Promise<[string, FileType][]>;
}
