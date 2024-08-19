/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType, Connection } from 'vscode-languageserver';
import { FileStat, FileSystem, FileType } from '@volar/language-service';

export namespace FsStatRequest {
	export const type: RequestType<string, FileStat, any> = new RequestType('fs/stat');
}

export namespace FsReadDirRequest {
	export const type: RequestType<string, [string, FileType][], any> = new RequestType('fs/readDir');
}

export function getFileSystemProvider(connection: Connection): FileSystem {
	return {
		async stat(uri) {
			const res = await connection.sendRequest(FsStatRequest.type, uri.toString());
			return res;
		},
		readDirectory(uri) {
			return connection.sendRequest(FsReadDirRequest.type, uri.toString());
		},
		readFile() {
			return undefined;
		},
	};
}
