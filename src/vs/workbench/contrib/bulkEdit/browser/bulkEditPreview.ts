/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { WorkspaceEdit, isResourceTextEdit, TextEdit } from 'vs/editor/common/modes';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { flatten, mergeSort } from 'vs/base/common/arrays';
import { Range } from 'vs/editor/common/core/range';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import * as files from 'vs/platform/files/common/files';
import { Event, Emitter } from 'vs/base/common/event';
import { TernarySearchTree } from 'vs/base/common/map';
import { basename } from 'vs/base/common/resources';

export class BulkEditPreviewProvider implements ITextModelContentProvider {

	static readonly Schema = 'vscode-bulkeditpreview';

	static asPreviewUri(uri: URI): URI {
		return URI.from({ scheme: BulkEditPreviewProvider.Schema, path: uri.toString() });
	}

	static fromPreviewUri(uri: URI): URI {
		return URI.parse(uri.path);
	}

	private readonly _reg: IDisposable;

	constructor(
		private readonly _edit: WorkspaceEdit,
		@IModeService private readonly _modeService: IModeService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly textModelResolverService: ITextModelService
	) {
		this._reg = this.textModelResolverService.registerTextModelContentProvider(BulkEditPreviewProvider.Schema, this);
	}

	dispose(): void {
		this._reg.dispose();
	}

	async provideTextContent(previewUri: URI) {

		const resourceUri = BulkEditPreviewProvider.fromPreviewUri(previewUri);

		const ref = await this.textModelResolverService.createModelReference(resourceUri);

		const sourceModel = ref.object.textEditorModel;

		const previewModel = this._modelService.createModel(
			createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()),
			this._modeService.create(sourceModel.getLanguageIdentifier().language),
			previewUri
		);

		const textEdits: TextEdit[][] = [];
		for (let edit of this._edit.edits) {
			if (isResourceTextEdit(edit) && edit.resource.toString() === resourceUri.toString()) {
				textEdits.push(edit.edits);
			}
		}

		let allEdits = flatten(textEdits).map(edit => EditOperation.replaceMove(Range.lift(edit.range), edit.text));
		allEdits = mergeSort(allEdits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
		previewModel.applyEdits(allEdits);
		ref.dispose();
		return previewModel;
	}
}


export function asPreviewUri(uri: URI): URI {
	return URI.from({ scheme: 'vscode-bulkedit-preview', path: uri.path, query: uri.toString() });
}

export function fromPreviewUri(uri: URI): URI {
	return URI.parse(uri.query);
}

export function asPreviewEdit(edit: WorkspaceEdit): WorkspaceEdit {
	const result: WorkspaceEdit = { edits: [] };
	for (let child of edit.edits) {
		if (isResourceTextEdit(child)) {
			result.edits.push({ ...child, resource: asPreviewUri(child.resource) });
		} else {
			result.edits.push({
				oldUri: child.oldUri && asPreviewUri(child.oldUri),
				newUri: child.newUri && asPreviewUri(child.newUri),
				options: child.options
			});
		}
	}
	return result;
}

class File implements files.IStat {

	type: files.FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	data?: Uint8Array;

	constructor(name: string) {
		this.type = files.FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

class Directory implements files.IStat {

	type: files.FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	entries: Map<string, File | Directory>;

	constructor(name: string) {
		this.type = files.FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entries = new Map();
	}
}

type Entry = File | Directory;

export class BulkEditFileSystem implements files.IFileSystemProvider {

	readonly capabilities = files.FileSystemProviderCapabilities.FileReadWrite;
	readonly onDidChangeCapabilities = Event.None;

	private readonly _registration: IDisposable;
	private readonly _onDidChangeFile = new Emitter<readonly files.IFileChange[]>();
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _entries = TernarySearchTree.forPaths<Entry>();
	private readonly _deleted = TernarySearchTree.forPaths<boolean>();

	private _pendingChanges: files.IFileChange[] = [];
	private _pendingHandle?: any;

	constructor(@files.IFileService private _fileService: files.IFileService) {
		this._registration = _fileService.registerProvider('vscode-bulkedit-preview', this);
	}

	dispose(): void {
		this._registration.dispose();
	}

	private _fireSoon(event: files.IFileChange): void {
		this._pendingChanges.push(event);
		clearTimeout(this._pendingHandle);
		this._pendingHandle = setTimeout(() => {
			this._onDidChangeFile.fire(this._pendingChanges.slice(0));
			this._pendingChanges = [];
		}, 0);
	}

	private _checkDeleted(resource: URI): void {
		if (this._deleted.findSubstr(resource.toString())) {
			throw new Error('deleted ' + resource.toString());
		}
	}

	watch(_resource: URI, _opts: files.IWatchOptions): IDisposable {
		return Disposable.None;
	}

	async stat(resource: URI): Promise<files.IStat> {
		this._checkDeleted(resource);
		const entry = this._entries.get(resource.toString());
		if (entry) {
			return entry;
		}

		const stat = await this._fileService.resolve(fromPreviewUri(resource), { resolveMetadata: true });
		return {
			type: (stat.isSymbolicLink ? files.FileType.SymbolicLink : 0) + (stat.isFile ? files.FileType.File : 0) + (stat.isDirectory ? files.FileType.Directory : 0),
			ctime: stat.ctime,
			mtime: stat.mtime,
			size: stat.size,
		};
	}

	async readdir(resource: URI): Promise<[string, files.FileType][]> {
		// resource = fromPreviewUri(resource);
		this._checkDeleted(resource);

		const entry = this._entries.get(resource.toString());
		const result: [string, files.FileType][] = [];
		if (entry instanceof Directory) {
			entry.entries.forEach(value => result.push([value.name, value.type]));
		}
		try {
			const stat = await this._fileService.resolve(fromPreviewUri(resource), { resolveMetadata: true });
			if (stat.children) {
				for (let child of stat.children) {
					result.push([
						child.name,
						(child.isSymbolicLink ? files.FileType.SymbolicLink : 0) + (child.isFile ? files.FileType.File : 0) + (child.isDirectory ? files.FileType.Directory : 0)
					]);
				}
			}


		} catch {
			// ignore
		}

		return result;
	}

	async mkdir(resource: URI): Promise<void> {
		// resource = fromPreviewUri(resource);

		const dir = new Directory(basename(resource));
		this._entries.set(resource.toString(), dir);
		this._fireSoon({ resource, type: files.FileChangeType.ADDED });
	}

	async delete(resource: URI, _opts: files.FileDeleteOptions): Promise<void> {
		// resource = fromPreviewUri(resource);
		this._deleted.set(resource.toString(), true);
	}

	async rename(from: URI, to: URI, opts: files.FileOverwriteOptions): Promise<void> {
		// from = fromPreviewUri(from);
		// to = fromPreviewUri(to);

		const target = new File(basename(to));
		target.type = (await this.stat(from)).type;

		this._deleted.set(from.toString(), true);
		this._entries.set(to.toString(), target);

		// todo@joh copy files
		// const iter = this._entries.findSuperstr(from.toString());
		// if (iter) {
		// 	for (let next = iter.next(); !next.done; next = iter.next()) {

		// 	}
		// }
		// this._entries.delete(from.toString());

		//todo@joh RENAME EVENT?
		this._fireSoon({ resource: from, type: files.FileChangeType.DELETED });
		this._fireSoon({ resource: to, type: files.FileChangeType.ADDED });
	}

	// copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;

	async readFile(resource: URI): Promise<Uint8Array> {
		this._checkDeleted(resource);

		const entry = this._entries.get(resource.toString());
		if (entry instanceof File) {
			return entry.data || new Uint8Array();
		}
		return (await this._fileService.readFile(fromPreviewUri(resource))).value.buffer;
	}

	async writeFile(resource: URI, content: Uint8Array, opts: files.FileWriteOptions): Promise<void> {

		let entry = this._entries.get(resource.toString());
		if (!entry && opts.create) {
			entry = new File(basename(resource));
			this._entries.set(resource.toString(), entry);
		}
		if (!(entry instanceof File)) {
			throw new Error();
		}
		entry.data = content;
		this._fireSoon({ resource, type: files.FileChangeType.UPDATED });
	}
}
