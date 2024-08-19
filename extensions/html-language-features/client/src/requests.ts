/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FileStat, FileType } from '@volar/language-service';
import { Disposable, Uri, workspace } from 'vscode';
import { BaseLanguageClient, RequestType } from 'vscode-languageclient';

export namespace FsStatRequest {
	export const type: RequestType<string, FileStat, any> = new RequestType('fs/stat');
}

export namespace FsReadDirRequest {
	export const type: RequestType<string, [string, FileType][], any> = new RequestType('fs/readDir');
}

export function serveFileSystemRequests(client: BaseLanguageClient): Disposable {
	const disposables = [];
	disposables.push(client.onRequest(FsReadDirRequest.type, (uriString: string) => {
		const uri = Uri.parse(uriString);
		return workspace.fs.readDirectory(uri);
	}));
	disposables.push(client.onRequest(FsStatRequest.type, (uriString: string) => {
		const uri = Uri.parse(uriString);
		return workspace.fs.stat(uri);
	}));
	return Disposable.from(...disposables);
}
