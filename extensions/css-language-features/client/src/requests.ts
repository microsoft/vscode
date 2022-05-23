/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, workspace } from 'vscode';
import { RequestType, BaseLanguageClient } from 'vscode-languageclient';
import { Runtime } from './cssClient';

export namespace FsContentRequest {
	export const type: RequestType<{ uri: string; encoding?: string }, string, any> = new RequestType('fs/content');
}
export namespace FsStatRequest {
	export const type: RequestType<string, FileStat, any> = new RequestType('fs/stat');
}

export namespace FsReadDirRequest {
	export const type: RequestType<string, [string, FileType][], any> = new RequestType('fs/readDir');
}

export function serveFileSystemRequests(client: BaseLanguageClient, runtime: Runtime) {
	client.onRequest(FsContentRequest.type, (param: { uri: string; encoding?: string }) => {
		const uri = Uri.parse(param.uri);
		if (uri.scheme === 'file' && runtime.fs) {
			return runtime.fs.getContent(param.uri);
		}
		return workspace.fs.readFile(uri).then(buffer => {
			return new runtime.TextDecoder(param.encoding).decode(buffer);
		});
	});
	client.onRequest(FsReadDirRequest.type, (uriString: string) => {
		const uri = Uri.parse(uriString);
		if (uri.scheme === 'file' && runtime.fs) {
			return runtime.fs.readDirectory(uriString);
		}
		return workspace.fs.readDirectory(uri);
	});
	client.onRequest(FsStatRequest.type, (uriString: string) => {
		const uri = Uri.parse(uriString);
		if (uri.scheme === 'file' && runtime.fs) {
			return runtime.fs.stat(uriString);
		}
		return workspace.fs.stat(uri);
	});
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

export interface RequestService {
	getContent(uri: string, encoding?: string): Promise<string>;

	stat(uri: string): Promise<FileStat>;
	readDirectory(uri: string): Promise<[string, FileType][]>;
}
