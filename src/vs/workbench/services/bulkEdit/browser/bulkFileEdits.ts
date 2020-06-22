/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { WorkspaceFileEdit } from 'vs/editor/common/modes';
import { IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { IProgress } from 'vs/platform/progress/common/progress';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';

export class BulkFileEdits {

	constructor(
		private readonly _progress: IProgress<void>,
		private readonly _edits: WorkspaceFileEdit[],
		@IFileService private readonly _fileService: IFileService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) { }

	async apply(): Promise<void> {
		for (const edit of this._edits) {
			this._progress.report(undefined);

			const options = edit.options || {};

			if (edit.newUri && edit.oldUri) {
				// rename
				if (options.overwrite === undefined && options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
					continue; // not overwriting, but ignoring, and the target file exists
				}
				await this._workingCopyFileService.move(edit.oldUri, edit.newUri, options.overwrite);

			} else if (!edit.newUri && edit.oldUri) {
				// delete file
				if (await this._fileService.exists(edit.oldUri)) {
					let useTrash = this._configurationService.getValue<boolean>('files.enableTrash');
					if (useTrash && !(this._fileService.hasCapability(edit.oldUri, FileSystemProviderCapabilities.Trash))) {
						useTrash = false; // not supported by provider
					}
					await this._workingCopyFileService.delete(edit.oldUri, { useTrash, recursive: options.recursive });
				} else if (!options.ignoreIfNotExists) {
					throw new Error(`${edit.oldUri} does not exist and can not be deleted`);
				}
			} else if (edit.newUri && !edit.oldUri) {
				// create file
				if (options.overwrite === undefined && options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
					continue; // not overwriting, but ignoring, and the target file exists
				}
				await this._textFileService.create(edit.newUri, undefined, { overwrite: options.overwrite });
			}
		}
	}
}
