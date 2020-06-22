/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { WorkspaceFileEdit, WorkspaceFileEditOptions } from 'vs/editor/common/modes';
import { IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { IProgress } from 'vs/platform/progress/common/progress';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IWorkspaceUndoRedoElement, UndoRedoElementType, IResourceUndoRedoElement, IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';


interface IFileOperation {
	perform(): Promise<IFileOperation>;
}

class Noop implements IFileOperation {
	async perform() { return this; }
}

class RenameOperation implements IFileOperation {

	constructor(
		readonly newUri: URI,
		readonly oldUri: URI,
		readonly options: WorkspaceFileEditOptions,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IFileService private readonly _fileService: IFileService,
	) { }

	async perform(): Promise<IFileOperation> {
		// rename
		if (this.options.overwrite === undefined && this.options.ignoreIfExists && await this._fileService.exists(this.newUri)) {
			return new Noop(); // not overwriting, but ignoring, and the target file exists
		}
		await this._workingCopyFileService.move(this.oldUri, this.newUri, this.options.overwrite);
		return new RenameOperation(this.oldUri, this.newUri, this.options, this._workingCopyFileService, this._fileService);
	}
}

class CreateOperation implements IFileOperation {

	constructor(
		readonly newUri: URI,
		readonly options: WorkspaceFileEditOptions,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) { }

	async perform(): Promise<IFileOperation> {
		// create file
		if (this.options.overwrite === undefined && this.options.ignoreIfExists && await this._fileService.exists(this.newUri)) {
			return new Noop(); // not overwriting, but ignoring, and the target file exists
		}
		await this._textFileService.create(this.newUri, undefined, { overwrite: this.options.overwrite });
		return this._instaService.createInstance(DeleteOperation, this.newUri, this.options);
	}
}

class DeleteOperation implements IFileOperation {

	constructor(
		readonly oldUri: URI,
		readonly options: WorkspaceFileEditOptions,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) { }

	async perform(): Promise<IFileOperation> {
		// delete file
		if (await this._fileService.exists(this.oldUri)) {
			let useTrash = this._configurationService.getValue<boolean>('files.enableTrash');
			if (useTrash && !(this._fileService.hasCapability(this.oldUri, FileSystemProviderCapabilities.Trash))) {
				useTrash = false; // not supported by provider
			}
			await this._workingCopyFileService.delete(this.oldUri, { useTrash, recursive: this.options.recursive });
		} else if (!this.options.ignoreIfNotExists) {
			throw new Error(`${this.oldUri} does not exist and can not be deleted`);
		}
		return this._instaService.createInstance(CreateOperation, this.oldUri, this.options);
	}
}

class FileUndoRedoElement implements IWorkspaceUndoRedoElement {

	readonly type = UndoRedoElementType.Workspace;

	readonly resources: readonly URI[] = [];

	constructor(
		readonly label: string,
		readonly operations: IFileOperation[]
	) { }

	undo(): void | Promise<void> {
		// throw new Error('Method not implemented.');
	}

	redo(): void | Promise<void> {
		// throw new Error('Method not implemented.');
	}

	split(): IResourceUndoRedoElement[] {
		return [];
	}
}

export class BulkFileEdits {

	constructor(
		private readonly _label: string,
		private readonly _progress: IProgress<void>,
		private readonly _edits: WorkspaceFileEdit[],
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
	) { }

	async apply(): Promise<void> {
		const undoOperations: IFileOperation[] = [];
		for (const edit of this._edits) {
			this._progress.report(undefined);

			const options = edit.options || {};
			let op: IFileOperation | undefined;
			if (edit.newUri && edit.oldUri) {
				// rename
				op = this._instaService.createInstance(RenameOperation, edit.newUri, edit.oldUri, options);
			} else if (!edit.newUri && edit.oldUri) {
				// delete file
				op = this._instaService.createInstance(DeleteOperation, edit.oldUri, options);
			} else if (edit.newUri && !edit.oldUri) {
				// create file
				op = this._instaService.createInstance(CreateOperation, edit.newUri, options);
			}
			if (op) {
				await op.perform();
				undoOperations.push(op);
			}
		}

		this._undoRedoService.pushElement(new FileUndoRedoElement(this._label, undoOperations));
	}
}
