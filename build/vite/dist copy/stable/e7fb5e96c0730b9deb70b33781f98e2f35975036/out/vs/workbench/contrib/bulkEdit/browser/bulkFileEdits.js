/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RenameOperation_1;
import { IFileService } from '../../../../platform/files/common/files.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { Schemas } from '../../../../base/common/network.js';
class Noop {
    constructor() {
        this.uris = [];
    }
    async perform() { return this; }
    toString() {
        return '(noop)';
    }
}
class RenameEdit {
    constructor(newUri, oldUri, options) {
        this.newUri = newUri;
        this.oldUri = oldUri;
        this.options = options;
        this.type = 'rename';
    }
}
let RenameOperation = RenameOperation_1 = class RenameOperation {
    constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService) {
        this._edits = _edits;
        this._undoRedoInfo = _undoRedoInfo;
        this._workingCopyFileService = _workingCopyFileService;
        this._fileService = _fileService;
    }
    get uris() {
        return this._edits.flatMap(edit => [edit.newUri, edit.oldUri]);
    }
    async perform(token) {
        const moves = [];
        const undoes = [];
        for (const edit of this._edits) {
            // check: not overwriting, but ignoring, and the target file exists
            const skip = edit.options.overwrite === undefined && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri);
            if (!skip) {
                moves.push({
                    file: { source: edit.oldUri, target: edit.newUri },
                    overwrite: edit.options.overwrite
                });
                // reverse edit
                undoes.push(new RenameEdit(edit.oldUri, edit.newUri, edit.options));
            }
        }
        if (moves.length === 0) {
            return new Noop();
        }
        await this._workingCopyFileService.move(moves, token, this._undoRedoInfo);
        return new RenameOperation_1(undoes, { isUndoing: true }, this._workingCopyFileService, this._fileService);
    }
    toString() {
        return `(rename ${this._edits.map(edit => `${edit.oldUri} to ${edit.newUri}`).join(', ')})`;
    }
};
RenameOperation = RenameOperation_1 = __decorate([
    __param(2, IWorkingCopyFileService),
    __param(3, IFileService)
], RenameOperation);
class CopyEdit {
    constructor(newUri, oldUri, options) {
        this.newUri = newUri;
        this.oldUri = oldUri;
        this.options = options;
        this.type = 'copy';
    }
}
let CopyOperation = class CopyOperation {
    constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService, _instaService) {
        this._edits = _edits;
        this._undoRedoInfo = _undoRedoInfo;
        this._workingCopyFileService = _workingCopyFileService;
        this._fileService = _fileService;
        this._instaService = _instaService;
    }
    get uris() {
        return this._edits.flatMap(edit => [edit.newUri, edit.oldUri]);
    }
    async perform(token) {
        // (1) create copy operations, remove noops
        const copies = [];
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
        const stats = await this._workingCopyFileService.copy(copies, token, this._undoRedoInfo);
        const undoes = [];
        for (let i = 0; i < stats.length; i++) {
            const stat = stats[i];
            const edit = this._edits[i];
            undoes.push(new DeleteEdit(stat.resource, { recursive: true, folder: this._edits[i].options.folder || stat.isDirectory, ...edit.options }, false));
        }
        return this._instaService.createInstance(DeleteOperation, undoes, { isUndoing: true });
    }
    toString() {
        return `(copy ${this._edits.map(edit => `${edit.oldUri} to ${edit.newUri}`).join(', ')})`;
    }
};
CopyOperation = __decorate([
    __param(2, IWorkingCopyFileService),
    __param(3, IFileService),
    __param(4, IInstantiationService)
], CopyOperation);
class CreateEdit {
    constructor(newUri, options, contents) {
        this.newUri = newUri;
        this.options = options;
        this.contents = contents;
        this.type = 'create';
    }
}
let CreateOperation = class CreateOperation {
    constructor(_edits, _undoRedoInfo, _fileService, _workingCopyFileService, _instaService, _textFileService) {
        this._edits = _edits;
        this._undoRedoInfo = _undoRedoInfo;
        this._fileService = _fileService;
        this._workingCopyFileService = _workingCopyFileService;
        this._instaService = _instaService;
        this._textFileService = _textFileService;
    }
    get uris() {
        return this._edits.map(edit => edit.newUri);
    }
    async perform(token) {
        const folderCreates = [];
        const fileCreates = [];
        const undoes = [];
        for (const edit of this._edits) {
            if (edit.newUri.scheme === Schemas.untitled) {
                continue; // ignore, will be handled by a later edit
            }
            if (edit.options.overwrite === undefined && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
                continue; // not overwriting, but ignoring, and the target file exists
            }
            if (edit.options.folder) {
                folderCreates.push({ resource: edit.newUri });
            }
            else {
                // If the contents are part of the edit they include the encoding, thus use them. Otherwise get the encoding for a new empty file.
                const encodedReadable = typeof edit.contents !== 'undefined' ? edit.contents : await this._textFileService.getEncodedReadable(edit.newUri);
                fileCreates.push({ resource: edit.newUri, contents: encodedReadable, overwrite: edit.options.overwrite });
            }
            undoes.push(new DeleteEdit(edit.newUri, edit.options, !edit.options.folder && !edit.contents));
        }
        if (folderCreates.length === 0 && fileCreates.length === 0) {
            return new Noop();
        }
        await this._workingCopyFileService.createFolder(folderCreates, token, this._undoRedoInfo);
        await this._workingCopyFileService.create(fileCreates, token, this._undoRedoInfo);
        return this._instaService.createInstance(DeleteOperation, undoes, { isUndoing: true });
    }
    toString() {
        return `(create ${this._edits.map(edit => edit.options.folder ? `folder ${edit.newUri}` : `file ${edit.newUri} with ${edit.contents?.byteLength || 0} bytes`).join(', ')})`;
    }
};
CreateOperation = __decorate([
    __param(2, IFileService),
    __param(3, IWorkingCopyFileService),
    __param(4, IInstantiationService),
    __param(5, ITextFileService)
], CreateOperation);
class DeleteEdit {
    constructor(oldUri, options, undoesCreate) {
        this.oldUri = oldUri;
        this.options = options;
        this.undoesCreate = undoesCreate;
        this.type = 'delete';
    }
}
let DeleteOperation = class DeleteOperation {
    constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService, _configurationService, _instaService, _logService) {
        this._edits = _edits;
        this._undoRedoInfo = _undoRedoInfo;
        this._workingCopyFileService = _workingCopyFileService;
        this._fileService = _fileService;
        this._configurationService = _configurationService;
        this._instaService = _instaService;
        this._logService = _logService;
    }
    get uris() {
        return this._edits.map(edit => edit.oldUri);
    }
    async perform(token) {
        // delete file
        const deletes = [];
        const undoes = [];
        for (const edit of this._edits) {
            let fileStat;
            try {
                fileStat = await this._fileService.resolve(edit.oldUri, { resolveMetadata: true });
            }
            catch (err) {
                if (!edit.options.ignoreIfNotExists) {
                    throw new Error(`${edit.oldUri} does not exist and can not be deleted`);
                }
                continue;
            }
            deletes.push({
                resource: edit.oldUri,
                recursive: edit.options.recursive,
                useTrash: !edit.options.skipTrashBin && this._fileService.hasCapability(edit.oldUri, 4096 /* FileSystemProviderCapabilities.Trash */) && this._configurationService.getValue('files.enableTrash')
            });
            // read file contents for undo operation. when a file is too large it won't be restored
            let fileContent;
            let fileContentExceedsMaxSize = false;
            if (!edit.undoesCreate && !edit.options.folder) {
                fileContentExceedsMaxSize = typeof edit.options.maxSize === 'number' && fileStat.size > edit.options.maxSize;
                if (!fileContentExceedsMaxSize) {
                    try {
                        fileContent = await this._fileService.readFile(edit.oldUri);
                    }
                    catch (err) {
                        this._logService.error(err);
                    }
                }
            }
            if (!fileContentExceedsMaxSize) {
                undoes.push(new CreateEdit(edit.oldUri, edit.options, fileContent?.value));
            }
        }
        if (deletes.length === 0) {
            return new Noop();
        }
        await this._workingCopyFileService.delete(deletes, token, this._undoRedoInfo);
        if (undoes.length === 0) {
            return new Noop();
        }
        return this._instaService.createInstance(CreateOperation, undoes, { isUndoing: true });
    }
    toString() {
        return `(delete ${this._edits.map(edit => edit.oldUri).join(', ')})`;
    }
};
DeleteOperation = __decorate([
    __param(2, IWorkingCopyFileService),
    __param(3, IFileService),
    __param(4, IConfigurationService),
    __param(5, IInstantiationService),
    __param(6, ILogService)
], DeleteOperation);
class FileUndoRedoElement {
    constructor(label, code, operations, confirmBeforeUndo) {
        this.label = label;
        this.code = code;
        this.operations = operations;
        this.confirmBeforeUndo = confirmBeforeUndo;
        this.type = 1 /* UndoRedoElementType.Workspace */;
        this.resources = operations.flatMap(op => op.uris);
    }
    async undo() {
        await this._reverse();
    }
    async redo() {
        await this._reverse();
    }
    async _reverse() {
        for (let i = 0; i < this.operations.length; i++) {
            const op = this.operations[i];
            const undo = await op.perform(CancellationToken.None);
            this.operations[i] = undo;
        }
    }
    toString() {
        return this.operations.map(op => String(op)).join(', ');
    }
}
let BulkFileEdits = class BulkFileEdits {
    constructor(_label, _code, _undoRedoGroup, _undoRedoSource, _confirmBeforeUndo, _progress, _token, _edits, _instaService, _undoRedoService) {
        this._label = _label;
        this._code = _code;
        this._undoRedoGroup = _undoRedoGroup;
        this._undoRedoSource = _undoRedoSource;
        this._confirmBeforeUndo = _confirmBeforeUndo;
        this._progress = _progress;
        this._token = _token;
        this._edits = _edits;
        this._instaService = _instaService;
        this._undoRedoService = _undoRedoService;
    }
    async apply() {
        const undoOperations = [];
        const undoRedoInfo = { undoRedoGroupId: this._undoRedoGroup.id };
        const edits = [];
        for (const edit of this._edits) {
            if (edit.newResource && edit.oldResource && !edit.options?.copy) {
                edits.push(new RenameEdit(edit.newResource, edit.oldResource, edit.options ?? {}));
            }
            else if (edit.newResource && edit.oldResource && edit.options?.copy) {
                edits.push(new CopyEdit(edit.newResource, edit.oldResource, edit.options ?? {}));
            }
            else if (!edit.newResource && edit.oldResource) {
                edits.push(new DeleteEdit(edit.oldResource, edit.options ?? {}, false));
            }
            else if (edit.newResource && !edit.oldResource) {
                edits.push(new CreateEdit(edit.newResource, edit.options ?? {}, await edit.options.contents));
            }
        }
        if (edits.length === 0) {
            return [];
        }
        const groups = [];
        groups[0] = [edits[0]];
        for (let i = 1; i < edits.length; i++) {
            const edit = edits[i];
            const lastGroup = groups.at(-1);
            if (lastGroup?.[0].type === edit.type) {
                lastGroup.push(edit);
            }
            else {
                groups.push([edit]);
            }
        }
        for (const group of groups) {
            if (this._token.isCancellationRequested) {
                break;
            }
            let op;
            switch (group[0].type) {
                case 'rename':
                    op = this._instaService.createInstance(RenameOperation, group, undoRedoInfo);
                    break;
                case 'copy':
                    op = this._instaService.createInstance(CopyOperation, group, undoRedoInfo);
                    break;
                case 'delete':
                    op = this._instaService.createInstance(DeleteOperation, group, undoRedoInfo);
                    break;
                case 'create':
                    op = this._instaService.createInstance(CreateOperation, group, undoRedoInfo);
                    break;
            }
            if (op) {
                const undoOp = await op.perform(this._token);
                undoOperations.push(undoOp);
            }
            this._progress.report(undefined);
        }
        const undoRedoElement = new FileUndoRedoElement(this._label, this._code, undoOperations, this._confirmBeforeUndo);
        this._undoRedoService.pushElement(undoRedoElement, this._undoRedoGroup, this._undoRedoSource);
        return undoRedoElement.resources;
    }
};
BulkFileEdits = __decorate([
    __param(8, IInstantiationService),
    __param(9, IUndoRedoService)
], BulkFileEdits);
export { BulkFileEdits };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0ZpbGVFZGl0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa0ZpbGVFZGl0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFFLFlBQVksRUFBdUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUvSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsdUJBQXVCLEVBQXdILE1BQU0sZ0VBQWdFLENBQUM7QUFDL04sT0FBTyxFQUFrRCxnQkFBZ0IsRUFBaUMsTUFBTSxrREFBa0QsQ0FBQztBQUVuSyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHckUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBTzdELE1BQU0sSUFBSTtJQUFWO1FBQ1UsU0FBSSxHQUFHLEVBQUUsQ0FBQztJQUtwQixDQUFDO0lBSkEsS0FBSyxDQUFDLE9BQU8sS0FBSyxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDaEMsUUFBUTtRQUNQLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7Q0FDRDtBQUVELE1BQU0sVUFBVTtJQUVmLFlBQ1UsTUFBVyxFQUNYLE1BQVcsRUFDWCxPQUFpQztRQUZqQyxXQUFNLEdBQU4sTUFBTSxDQUFLO1FBQ1gsV0FBTSxHQUFOLE1BQU0sQ0FBSztRQUNYLFlBQU8sR0FBUCxPQUFPLENBQTBCO1FBSmxD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