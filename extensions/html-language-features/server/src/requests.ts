/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType, Connection } from 'vscode-languageserver';
import { RuntimeEnvironment } from './htmlServer';

export namespace FsStatRequest {
	export const type: RequestType<string, FileStat, any> = new RequestType('fs/stat');
}

export namespace FsReadDirRequest {
	export const type: RequestType<string, [string, FileType][], any> = new RequestType('fs/readDir');
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


export function getFileSystemProvider(handledSchemas: string[], connection: Connection, runtime: RuntimeEnvironment): FileSystemProvider {
	const fileFs = runtime.fileFs && handledSchemas.indexOf('file') !== -1 ? runtime.fileFs : undefined;
	return {
		async stat(uri: string): Promise<FileStat> {
			if (fileFs && uri.startsWith('file:')) {
				return fileFs.stat(uri);
			}
			const res = await connection.sendRequest(FsStatRequest.type, uri.toString());
			return res;
		},
		readDirectory(uri: string): Promise<[string, FileType][]> {
			if (fileFs && uri.startsWith('file:')) {
				return fileFs.readDirectory(uri);
			}
			return connection.sendRequest(FsReadDirRequest.type, uri.toString());
		}
	};
}
