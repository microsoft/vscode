/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { WorkspaceFileEditOptions } from 'vs/editor/common/modes';
import { IFileService, FileSystemProviderCapabilities, IFileContent } from 'vs/platform/files/common/files';
import { IProgress } from 'vs/platform/progress/common/progress';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkingCopyFileService, IFileOperationUndoRedoInfo, IMoveOperation, ICopyOperation, IDeleteOperation } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IWorkspaceUndoRedoElement, UndoRedoElementType, IUndoRedoService, UndoRedoGroup, UndoRedoSource } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { VSBuffer } from 'vs/base/common/buffer';
import { ResourceFileEdit } from 'vs/editor/browser/services/bulkEditService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { flatten } from 'vs/base/common/arrays';

interface IFileOperation {
	uris: URI[];
	perform(token: CancellationToken): Promise<IFileOperation>;
}

class Noop implements IFileOperation {
	readonly uris = [];
	async perform() { return this; }
	toString(): string {
		return '(noop)';
	}
}

interface RenameOrCopyEdit {
	readonly newUri: URI,
	readonly oldUri: URI,
	readonly options: WorkspaceFileEditOptions
}

class RenameOperation implements IFileOperation {

	constructor(
		private readonly _edits: RenameOrCopyEdit[],
		private readonly _undoRedoInfo: IFileOperationUndoRedoInfo,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IFileService private readonly _fileService: IFileService,
	) { }

	get uris() {
		return flatten(this._edits.map(edit => [edit.newUri, edit.oldUri]));
	}

	async perform(token: CancellationToken): Promise<IFileOperation> {

		const moves: IMoveOperation[] = [];
		const undoes: RenameOrCopyEdit[] = [];
		for (const edit of this._edits) {
			// check: not overwriting, but ignoring, and the target file exists
			const skip = edit.options.overwrite === undefined && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri);
			if (!skip) {
				moves.push({
					file: { source: edit.oldUri, target: edit.newUri },
					overwrite: edit.options.overwrite
				});

				// reverse edit
				undoes.push({
					newUri: edit.oldUri,
					oldUri: edit.newUri,
					options: edit.options
				});
			}
		}

		if (moves.length === 0) {
			return new Noop();
		}

		await this._workingCopyFileService.move(moves, this._undoRedoInfo, token);
		return new RenameOperation(undoes, { isUndoing: true }, this._workingCopyFileService, this._fileService);
	}

	toString(): string {
		return `(rename ${this._edits.map(edit => `${edit.oldUri} to ${edit.newUri}`).join(', ')})`;
	}
}

class CopyOperation implements IFileOperation {

	constructor(
		private readonly _edits: RenameOrCopyEdit[],
		private readonly _undoRedoInfo: IFileOperationUndoRedoInfo,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instaService: IInstantiationService
	) { }

	get uris() {
		return flatten(this._edits.map(edit => [edit.newUri, edit.oldUri]));
	}

	async perform(token: CancellationToken): Promise<IFileOperation> {

		// (1) create copy operations, remove noops
		const copies: ICopyOperation[] = [];
		for (const edit of this._edits) {
			//check: not overwriting, but ignoring, and the target file exists
			const skip = edit.options.overwrite === undefined && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri);
			if (!skip) {
				copies.push({ file: { source: edit.oldUri, target: edit.newUri }, overwrite: edit.options.overwrite });
			}
		}

		if (copies.length === 0) {
			return new Noop();
		}

		// (2) perform the actual copy and use the return stats to build undo edits
		const stats = await this._workingCopyFileService.copy(copies, this._undoRedoInfo, token);
		const undoes: DeleteEdit[] = [];

		for (let i = 0; i < stats.length; i++) {
			const stat = stats[i];
			const edit = this._edits[i];
			undoes.push({
				oldUri: stat.resource,
				options: { recursive: true, folder: this._edits[i].options.folder || stat.isDirectory, ...edit.options },
				undoesCreate: false
			});
		}

		return this._instaService.createInstance(DeleteOperation, undoes, { isUndoing: true });
	}

	toString(): string {
		return `(copy ${this._edits.map(edit => `${edit.oldUri} to ${edit.newUri}`).join(', ')})`;
	}
}

interface CreateEdit {
	readonly newUri: URI;
	readonly options: WorkspaceFileEditOptions,
	readonly contents: VSBuffer | undefined,
}

class CreateOperation implements IFileOperation {

	constructor(
		private readonly _edits: CreateEdit[],
		private readonly _undoRedoInfo: IFileOperationUndoRedoInfo,
		@IFileService private readonly _fileService: IFileService,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) { }

	get uris() {
		return this._edits.map(edit => edit.newUri);
	}

	async perform(token: CancellationToken): Promise<IFileOperation> {

		const undoes: DeleteEdit[] = [];

		for (const edit of this._edits) {
			if (edit.options.overwrite === undefined && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
				continue; // not overwriting, but ignoring, and the target file exists
			}
			if (edit.options.folder) {
				await this._workingCopyFileService.createFolder({ resource: edit.newUri }, this._undoRedoInfo, token);
			} else {
				await this._workingCopyFileService.create({ resource: edit.newUri, contents: edit.contents, overwrite: edit.options.overwrite }, this._undoRedoInfo, token);
			}

			undoes.push({
				oldUri: edit.newUri,
				options: edit.options,
				undoesCreate: !edit.options.folder && !edit.contents
			});
		}

		return this._instaService.createInstance(DeleteOperation, undoes, { isUndoing: true });
	}

	toString(): string {
		return `(create ${this._edits.map(edit => edit.options.folder ? `folder ${edit.newUri}` : `file ${edit.newUri} with ${edit.contents?.byteLength || 0} bytes`).join(', ')})`;
	}
}

interface DeleteEdit {
	readonly oldUri: URI;
	readonly options: WorkspaceFileEditOptions;
	readonly undoesCreate: boolean;
}

class DeleteOperation implements IFileOperation {

	constructor(
		private _edits: DeleteEdit[],
		private readonly _undoRedoInfo: IFileOperationUndoRedoInfo,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ILogService private readonly _logService: ILogService
	) { }

	get uris() {
		return this._edits.map(edit => edit.oldUri);
	}

	async perform(token: CancellationToken): Promise<IFileOperation> {
		// delete file

		const deletes: IDeleteOperation[] = [];
		const undoes: CreateEdit[] = [];

		for (const edit of this._edits) {
			if (!await this._fileService.exists(edit.oldUri)) {
				if (!edit.options.ignoreIfNotExists) {
					throw new Error(`${edit.oldUri} does not exist and can not be deleted`);
				}
				continue;
			}

			deletes.push({
				resource: edit.oldUri,
				recursive: edit.options.recursive,
				useTrash: !edit.options.skipTrashBin && this._fileService.hasCapability(edit.oldUri, FileSystemProviderCapabilities.Trash) && this._configurationService.getValue<boolean>('files.enableTrash')
			});


			// read file contents for undo operation. when a file is too large it won't be restored
			let fileContent: IFileContent | undefined;
			if (!edit.undoesCreate && !edit.options.folder) {
				try {
					fileContent = await this._fileService.readFile(edit.oldUri);
				} catch (err) {
					this._logService.critical(err);
				}
			}
			if (!(typeof edit.options.maxSize === 'number' && fileContent && (fileContent?.size > edit.options.maxSize))) {
				undoes.push({
					newUri: edit.oldUri,
					options: edit.options,
					contents: fileContent?.value,
				});
			}
		}

		if (deletes.length === 0) {
			return new Noop();
		}

		await this._workingCopyFileService.delete(deletes, this._undoRedoInfo, token);

		if (undoes.length === 0) {
			return new Noop();
		}
		return this._instaService.createInstance(CreateOperation, undoes, { isUndoing: true });
	}

	toString(): string {
		return `(delete ${this._edits.map(edit => edit.oldUri).join(', ')})`;
	}
}

class FileUndoRedoElement implements IWorkspaceUndoRedoElement {

	readonly type = UndoRedoElementType.Workspace;

	readonly resources: readonly URI[];

	constructor(
		readonly label: string,
		readonly operations: IFileOperation[]
	) {
		this.resources = (<URI[]>[]).concat(...operations.map(op => op.uris));
	}

	async undo(): Promise<void> {
		await this._reverse();
	}

	async redo(): Promise<void> {
		await this._reverse();
	}

	private async _reverse() {
		for (let i = 0; i < this.operations.length; i++) {
			const op = this.operations[i];
			const undo = await op.perform(CancellationToken.None);
			this.operations[i] = undo;
		}
	}

	public toString(): string {
		return this.operations.map(op => String(op)).join(', ');
	}
}

export class BulkFileEdits {

	constructor(
		private readonly _label: string,
		private readonly _undoRedoGroup: UndoRedoGroup,
		private readonly _undoRedoSource: UndoRedoSource | undefined,
		private readonly _progress: IProgress<void>,
		private readonly _token: CancellationToken,
		private readonly _edits: ResourceFileEdit[],
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
	) { }

	async apply(): Promise<void> {
		const undoOperations: IFileOperation[] = [];
		const undoRedoInfo = { undoRedoGroupId: this._undoRedoGroup.id };
		for (const edit of this._edits) {

			if (this._token.isCancellationRequested) {
				break;
			}

			const options = edit.options || {};
			let op: IFileOperation | undefined;
			if (edit.newResource && edit.oldResource && !options.copy) {
				// rename
				op = this._instaService.createInstance(RenameOperation, [{ newUri: edit.newResource, oldUri: edit.oldResource, options }], undoRedoInfo);
			} else if (edit.newResource && edit.oldResource && options.copy) {
				op = this._instaService.createInstance(CopyOperation, [{ newUri: edit.newResource, oldUri: edit.oldResource, options }], undoRedoInfo);
			} else if (!edit.newResource && edit.oldResource) {
				// delete file
				op = this._instaService.createInstance(DeleteOperation, [{ oldUri: edit.oldResource, options, undoesCreate: false }], undoRedoInfo);
			} else if (edit.newResource && !edit.oldResource) {
				// create file
				op = this._instaService.createInstance(CreateOperation, [{ newUri: edit.newResource, options, contents: undefined }], undoRedoInfo,);
			}
			if (op) {
				const undoOp = await op.perform(this._token);
				undoOperations.push(undoOp);
			}

			this._progress.report(undefined);
		}

		this._undoRedoService.pushElement(new FileUndoRedoElement(this._label, undoOperations), this._undoRedoGroup, this._undoRedoSource);
	}
}
