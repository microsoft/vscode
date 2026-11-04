/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';

export class CachedAgentFileWriter {
	private _cachedWrite: { readonly contentHash: string; readonly result: Promise<vscode.Uri> } | undefined;

	constructor(
		private readonly _cacheDirectory: string,
		private readonly _fileName: string,
		private readonly _logPrefix: string,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@ILogService private readonly _logService: ILogService,
	) { }

	write(content: string): Promise<vscode.Uri> {
		const contentHash = createHash('sha256').update(content).digest('hex');
		if (this._cachedWrite?.contentHash === contentHash) {
			return this._cachedWrite.result;
		}

		const result = this._write(content);
		this._cachedWrite = { contentHash, result };
		void result.catch(() => {
			if (this._cachedWrite?.result === result) {
				this._cachedWrite = undefined;
			}
		});
		return result;
	}

	private async _write(content: string): Promise<vscode.Uri> {
		const cacheDirectory = vscode.Uri.joinPath(this._extensionContext.globalStorageUri, this._cacheDirectory);
		try {
			await this._fileSystemService.stat(cacheDirectory);
		} catch {
			await this._fileSystemService.createDirectory(cacheDirectory);
		}

		const file = vscode.Uri.joinPath(cacheDirectory, this._fileName);
		await this._fileSystemService.writeFile(file, new TextEncoder().encode(content));
		this._logService.trace(`[${this._logPrefix}] Wrote agent file: ${file.toString()}`);
		return file;
	}
}
