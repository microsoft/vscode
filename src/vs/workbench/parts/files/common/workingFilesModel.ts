/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import arrays = require('vs/base/common/arrays');
import uri from 'vs/base/common/uri';
import Event, {Emitter} from 'vs/base/common/event';
import paths = require('vs/base/common/paths');
import errors = require('vs/base/common/errors');
import labels = require('vs/base/common/labels');
import {disposeAll, IDisposable} from 'vs/base/common/lifecycle';
import {ITextFileService, IWorkingFilesModel, IWorkingFileModelChangeEvent, IWorkingFileEntry, EventType, LocalFileChangeEvent, WORKING_FILES_MODEL_ENTRY_CLASS_ID, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import {IFileStat, FileChangeType, FileChangesEvent, EventType as FileEventType} from 'vs/platform/files/common/files';
import {UntitledEditorEvent, EventType as WorkbenchEventType, EditorEvent} from 'vs/workbench/common/events';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {asFileEditorInput} from 'vs/workbench/common/editor';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';

export class WorkingFilesModel implements IWorkingFilesModel {

	private static STORAGE_KEY = 'workingFiles.model.entries';

	private entries: WorkingFileEntry[];
	private pathLabelProvider: labels.PathLabelProvider;
	private mapEntryToResource: { [resource: string]: WorkingFileEntry; };
	private _onModelChange: Emitter<IWorkingFileModelChangeEvent>;
	private _onWorkingFileChange: Emitter<WorkingFileEntry>;
	private toDispose: IDisposable[];

	constructor(
		@IStorageService private storageService: IStorageService,
		@IEventService private eventService: IEventService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ITextFileService private textFileService: ITextFileService
	) {
		this.pathLabelProvider = new labels.PathLabelProvider(this.contextService);
		this.entries = [];
		this.toDispose = [];
		this.mapEntryToResource = Object.create(null);
		this._onModelChange = new Emitter<IWorkingFileModelChangeEvent>();
		this._onWorkingFileChange = new Emitter<WorkingFileEntry>();

		this.load();
		this.registerListeners();
	}

	private registerListeners(): void {

		// listen to global file changes to clean up model
		this.toDispose.push(this.eventService.addListener2('files.internal:fileChanged', (e: LocalFileChangeEvent) => this.onLocalFileChange(e)));
		this.toDispose.push(this.eventService.addListener2(FileEventType.FILE_CHANGES, (e) => this.onFileChanges(e)));

		// listen to untitled
		this.toDispose.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_DIRTY, (e) => this.onUntitledFileDirty(e)));
		this.toDispose.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_DELETED, (e) => this.onUntitledFileDeleted(e)));

		// listen to files being changed locally
		this.toDispose.push(this.eventService.addListener2(EventType.FILE_DIRTY, (e: LocalFileChangeEvent) => this.onTextFileDirty(e)));
		this.toDispose.push(this.eventService.addListener2(EventType.FILE_SAVE_ERROR, (e: LocalFileChangeEvent) => this.onTextFileSaveError(e)));
		this.toDispose.push(this.eventService.addListener2(EventType.FILE_SAVED, (e: LocalFileChangeEvent) => this.onTextFileSaved(e)));
		this.toDispose.push(this.eventService.addListener2(EventType.FILE_REVERTED, (e: LocalFileChangeEvent) => this.onTextFileReverted(e)));

		// clean up model on set input error
		this.toDispose.push(this.eventService.addListener2(WorkbenchEventType.EDITOR_SET_INPUT_ERROR, (e: EditorEvent) => this.onEditorInputSetError(e)));
	}

	private onUntitledFileDirty(e: UntitledEditorEvent): void {
		this.updateDirtyState(e.resource, true);
	}

	private onUntitledFileDeleted(e: UntitledEditorEvent): void {
		let entry = this.mapEntryToResource[e.resource.toString()];
		if (entry) {
			this.removeEntry(entry);
		}
	}

	private onTextFileDirty(e: LocalFileChangeEvent): void {
		if (this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) {
			this.updateDirtyState(e.getAfter().resource, true); // no indication needed when auto save is enabled for short delay
		} else {
			this.addEntry(e.getAfter().resource);
		}
	}

	private onTextFileSaveError(e: LocalFileChangeEvent): void {
		this.updateDirtyState(e.getAfter().resource, true);
	}

	private onTextFileSaved(e: LocalFileChangeEvent): void {
		this.updateDirtyState(e.getAfter().resource, false);
	}

	private onTextFileReverted(e: LocalFileChangeEvent): void {
		if (this.hasEntry(e.getAfter().resource)) {
			this.updateDirtyState(e.getAfter().resource, false);
		}
	}

	private updateDirtyState(resource: uri, isDirty: boolean): void {

		// Add to model
		let entry = this.addEntry(resource);

		// Toggle dirty
		let oldDirty = entry.dirty;
		entry.setDirty(isDirty);

		if (oldDirty !== isDirty) {
			this.fireWorkingFileChange(entry);
		}
	}

	private onLocalFileChange(e: LocalFileChangeEvent): void {
		if (e.gotMoved()) {
			this.moveEntry(e.getBefore().resource, e.getAfter().resource);
		}
	}

	private onFileChanges(e: FileChangesEvent): void {
		for (let resource in this.mapEntryToResource) {
			let entry = this.mapEntryToResource[resource];
			if (!entry.dirty && e.contains(uri.parse(resource), FileChangeType.DELETED)) {
				this.removeEntry(entry);
			}
		}
	}

	private onEditorInputSetError(e: EditorEvent): void {
		let fileInput = asFileEditorInput(e.editorInput);
		if (fileInput) {
			let entry = this.mapEntryToResource[fileInput.getResource().toString()];
			if (entry && !entry.dirty) {
				this.removeEntry(fileInput.getResource());
			}
		}
	}

	public get onModelChange(): Event<IWorkingFileModelChangeEvent> {
		return this._onModelChange.event;
	}

	public get onWorkingFileChange(): Event<WorkingFileEntry> {
		return this._onWorkingFileChange.event;
	}

	public getEntries(excludeOutOfContext?: boolean): WorkingFileEntry[] {
		return this.entries;
	}

	public first(): WorkingFileEntry {
		if (!this.entries.length) {
			return null;
		}

		return this.entries.slice(0).sort(WorkingFilesModel.compare)[0];
	}

	public last(): WorkingFileEntry {
		if (!this.entries.length) {
			return null;
		}

		return this.entries.slice(0).sort(WorkingFilesModel.compare)[this.entries.length - 1];
	}

	public next(start?: uri): WorkingFileEntry {
		let entry = start && this.findEntry(start);
		if (entry) {
			let sorted = this.entries.slice(0).sort(WorkingFilesModel.compare);
			let index = sorted.indexOf(entry);
			if (index + 1 < sorted.length) {
				return sorted[index + 1];
			}
		}

		return this.first();
	}

	public previous(start?: uri): WorkingFileEntry {
		let entry = start && this.findEntry(start);
		if (entry) {
			let sorted = this.entries.slice(0).sort(WorkingFilesModel.compare);
			let index = sorted.indexOf(entry);
			if (index > 0) {
				return sorted[index - 1];
			}
		}

		return this.last();
	}

	public getOutOfWorkspaceContextEntries(): WorkingFileEntry[] {
		return this.entries.filter((entry) => this.isOutOfWorkspace(entry.resource));
	}

	private isOutOfWorkspace(resource: uri): boolean {
		if (resource.scheme !== 'file') {
			return false;
		}

		let workspace = this.contextService.getWorkspace();

		return !workspace || !paths.isEqualOrParent(resource.fsPath, workspace.resource.fsPath);
	}

	public count(): number {
		return this.entries.length;
	}

	public addEntry(resource: uri): WorkingFileEntry;
	public addEntry(stat: IFileStat): WorkingFileEntry;
	public addEntry(entry: WorkingFileEntry): WorkingFileEntry;
	public addEntry(arg1: IFileStat | WorkingFileEntry | uri): WorkingFileEntry {
		let resource: uri;
		if (arg1 instanceof WorkingFileEntry) {
			resource = (<WorkingFileEntry>arg1).resource;
		} else if (arg1 instanceof uri) {
			resource = <uri>arg1;
		} else {
			resource = (<IFileStat>arg1).resource;
		}

		let existing = this.findEntry(resource);
		if (existing) {
			return existing;
		}

		let entry: WorkingFileEntry;
		if (arg1 instanceof WorkingFileEntry) {
			entry = arg1;
		} else {
			entry = this.createEntry(resource);
		}

		this.entries.push(entry);
		this.mapEntryToResource[entry.resource.toString()] = entry;
		this.fireModelChange({ added: [entry] });

		return entry;
	}

	private createEntry(resource: uri, index?: number, dirty?: boolean): WorkingFileEntry {
		return new WorkingFileEntry(resource, typeof index === 'number' ? index : this.entries.length, dirty);
	}

	public moveEntry(oldResource: uri, newResource: uri): void {
		let oldEntry = this.findEntry(oldResource);
		if (oldEntry && !this.findEntry(newResource)) {

			// Add new with properties from old one
			let newEntry = this.createEntry(newResource, oldEntry.index, oldEntry.dirty);
			this.entries.push(newEntry);
			this.mapEntryToResource[newResource.toString()] = newEntry;

			// Remove old
			this.entries.splice(this.entries.indexOf(oldEntry), 1);
			delete this.mapEntryToResource[oldResource.toString()];

			this.fireModelChange({ added: [newEntry], removed: [oldEntry] });
		}
	}

	public removeEntry(resource: uri): WorkingFileEntry;
	public removeEntry(entry: WorkingFileEntry): WorkingFileEntry;
	public removeEntry(arg1: WorkingFileEntry | uri): WorkingFileEntry {
		let resource: uri = arg1 instanceof WorkingFileEntry ? (<WorkingFileEntry>arg1).resource : <uri>arg1;
		let index = this.indexOf(resource);
		if (index >= 0) {

			// Remove entry
			let removed = this.entries.splice(index, 1)[0];
			delete this.mapEntryToResource[resource.toString()];

			// Rebalance index
			let sortedEntries = this.entries.slice(0).sort(WorkingFilesModel.compare);
			let newTopIndex = 0;
			for (let i = 0; i < sortedEntries.length; i++) {
				if (sortedEntries[i] === removed) {
					continue;
				}

				sortedEntries[i].setIndex(newTopIndex++);
			}

			this.fireModelChange({ removed: [removed] });

			return removed;
		}

		return null;
	}

	public reorder(source: WorkingFileEntry, target: WorkingFileEntry): void {
		let sortedEntries = this.entries.slice(0).sort(WorkingFilesModel.compare);

		let indexOfSource = sortedEntries.indexOf(source);
		let indexOfTarget = sortedEntries.indexOf(target);

		arrays.move(sortedEntries, indexOfSource, indexOfTarget);

		// Rebalance index
		let newTopIndex = 0;
		for (let i = 0; i < sortedEntries.length; i++) {
			sortedEntries[i].setIndex(newTopIndex++);
		}

		// Fire event
		this.fireModelChange({});
	}

	public clear(): void {
		let deleted = this.entries;
		this.entries = [];
		this.mapEntryToResource = Object.create(null);
		this.fireModelChange({ removed: deleted });
	}

	public hasEntry(resource: uri): boolean {
		return !!this.findEntry(resource);
	}

	public findEntry(resource: uri): WorkingFileEntry {
		return this.mapEntryToResource[resource.toString()];
	}

	private indexOf(resource: uri): number {
		let entry = this.findEntry(resource);
		if (entry) {
			return this.entries.indexOf(entry);
		}

		return -1;
	}

	public shutdown(): void {
		let sortedEntries = this.entries.slice(0).sort(WorkingFilesModel.compare);
		let index = 0;
		let entries: ISerializedWorkingFileEntry[] = [];
		sortedEntries.forEach((entry) => {
			if (!entry.isUntitled) {
				entries.push({
					resource: entry.resource.toString(),
					index: index++
				});
			}
		});

		this.storageService.store(WorkingFilesModel.STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE);
	}

	private load(): void {

		// Load from settings
		let modelRaw = this.storageService.get(WorkingFilesModel.STORAGE_KEY, StorageScope.WORKSPACE);
		if (modelRaw) {
			let model: ISerializedWorkingFileEntry[] = JSON.parse(modelRaw);
			model.forEach((entry) => {
				this.addEntry(new WorkingFileEntry(uri.parse(entry.resource), entry.index, false));
			});
		}

		// Add those that are set to open on startup
		let options = this.contextService.getOptions();
		let files = (options && options.filesToOpen) || [];
		if (options && options.filesToDiff) {
			files.push(...options.filesToDiff);
		}
		
		arrays
			.distinct(files, (r) => r.resource.toString())							// no duplicates
			.map((f) => f.resource)													// just the resource
			.filter((r) => r.scheme === 'untitled' || this.isOutOfWorkspace(r))		// untitled or out of workspace
			.forEach((r) => {
				this.addEntry(r);
			});

		// Add untitled ones (after joinCreation() to make sure we catch everything)
		this.partService.joinCreation().done(() => {
			if (this.untitledEditorService) {
				this.untitledEditorService.getAll().map((u) => u.getResource())
					.filter((r) => !this.untitledEditorService.hasAssociatedFilePath(r))		// only those without association
					.forEach((r) => {
						this.addEntry(r);
					});
			}
		}, errors.onUnexpectedError);
	}

	public dispose(): void {
		this.toDispose = disposeAll(this.toDispose);
	}

	private fireModelChange(event: IWorkingFileModelChangeEvent): void {
		this._onModelChange.fire(event);
	}

	private fireWorkingFileChange(file: WorkingFileEntry): void {
		this._onWorkingFileChange.fire(file);
	}

	public static compare(element: WorkingFileEntry, otherElement: WorkingFileEntry): number {
		return element.index - otherElement.index;
	}
}

interface ISerializedWorkingFileEntry {
	resource: string;
	index: number;
}

export class WorkingFileEntry implements IWorkingFileEntry {
	private _resource: uri;
	private _index: number;
	private _dirty: boolean;

	constructor(resource: uri, index: number, dirty: boolean) {
		this._resource = resource;
		this._index = index;
		this._dirty = dirty;
	}

	public get resource(): uri {
		return this._resource;
	}

	public get index(): number {
		return this._index;
	}

	public setIndex(index: number): void {
		this._index = index;
	}

	public get dirty(): boolean {
		return this._dirty;
	}

	public setDirty(dirty: boolean): void {
		this._dirty = dirty;
	}

	public get CLASS_ID(): string {
		return WORKING_FILES_MODEL_ENTRY_CLASS_ID;
	}

	public get isFile(): boolean {
		return this._resource.scheme === 'file';
	}

	public get isUntitled(): boolean {
		return this._resource.scheme === 'untitled';
	}
}