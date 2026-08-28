/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileType, Uri, workspace } from 'vscode';
import { FileIdentifier, FileStat, ICompletionsFileSystemService } from '../../lib/src/fileSystem';

class ExtensionFileSystem implements ICompletionsFileSystemService {
	declare _serviceBrand: undefined;

	async readFileString(uri: FileIdentifier): Promise<string> {
		if (typeof uri !== 'string') {
			uri = uri.uri;
		}
		return new TextDecoder().decode(await workspace.fs.readFile(Uri.parse(uri, true)));
	}
	async stat(uri: FileIdentifier): Promise<FileStat> {
		if (typeof uri !== 'string') {
			uri = uri.uri;
		}
		return await workspace.fs.stat(Uri.parse(uri, true));
	}
	async readDirectory(uri: FileIdentifier): Promise<[string, FileType][]> {
		if (typeof uri !== 'string') {
			uri = uri.uri;
		}
		return await workspace.fs.readDirectory(Uri.parse(uri, true));
	}
}

export const extensionFileSystem = new ExtensionFileSystem();
