/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import errors = require('vs/base/common/errors');
import nls = require('vs/nls');
import {MIME_UNKNOWN} from 'vs/base/common/mime';
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import arrays = require('vs/base/common/arrays');
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {EditorInput, EditorOptions, IEditorStacksModel} from 'vs/workbench/common/editor';
import {Position} from 'vs/platform/editor/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {LocalFileChangeEvent, TextFileChangeEvent, VIEWLET_ID, BINARY_FILE_EDITOR_ID, EventType as FileEventType, ITextFileService, AutoSaveMode, ModelState} from 'vs/workbench/parts/files/common/files';
import {FileChangeType, FileChangesEvent, EventType as CommonFileEventType} from 'vs/platform/files/common/files';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {TextFileEditorModel, CACHE} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {EventType as WorkbenchEventType, UntitledEditorEvent} from 'vs/workbench/common/events';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IActivityService, NumberBadge} from 'vs/workbench/services/activity/common/activityService';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IHistoryService} from 'vs/workbench/services/history/common/history';

// This extension tracks files for changes to update editors and inputs accordingly.
export class FileTracker implements IWorkbenchContribution {

	// Delay in ms that we wait at minimum before we update a model from a file change event.
	// This reduces the chance that a save from the client triggers an update of the editor.
	private static FILE_CHANGE_UPDATE_DELAY = 2000;

	private lastDirtyCount: number;
	private stacks: IEditorStacksModel;
	private toUnbind: IDisposable[];

	private pendingDirtyResources: URI[];
	private pendingDirtyHandle: number;

	constructor(
		@IEventService private eventService: IEventService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IActivityService private activityService: IActivityService,
		@ITextFileService private textFileService: ITextFileService,
		@IHistoryService private historyService: IHistoryService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		this.toUnbind = [];
		this.stacks = editorGroupService.getStacksModel();
		this.pendingDirtyResources = [];

		this.registerListeners();
	}

	public getId(): string {
		return 'vs.files.filetracker';
	}

	private registerListeners(): void {

		// Update editors and inputs from local changes and saves
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
		this.toUnbind.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_SAVED, (e: UntitledEditorEvent) => this.onUntitledEditorSaved(e)));
		this.toUnbind.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_DIRTY, (e: UntitledEditorEvent) => this.onUntitledEditorDirty(e)));
		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_DIRTY, (e: TextFileChangeEvent) => this.onTextFileDirty(e)));
		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_SAVE_ERROR, (e: TextFileChangeEvent) => this.onTextFileSaveError(e)));
		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_SAVED, (e: TextFileChangeEvent) => this.onTextFileSaved(e)));
		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_REVERTED, (e: TextFileChangeEvent) => this.onTextFileReverted(e)));
		this.toUnbind.push(this.eventService.addListener2('files.internal:fileChanged', (e: LocalFileChangeEvent) => this.onLocalFileChange(e)));

		// Update editors and inputs from disk changes
		this.toUnbind.push(this.eventService.addListener2(CommonFileEventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFileChanges(e)));
	}

	private onEditorsChanged(): void {
		this.disposeUnusedTextFileModels();
	}

	private onTextFileDirty(e: TextFileChangeEvent): void {
		if (this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) {
			this.updateActivityBadge(); // no indication needed when auto save is enabled for short delay
		}

		// If a file becomes dirty but is not opened, we open it in the background
		// Since it might be the intent of whoever created the model to show it shortly
		// after, we delay this a little bit and check again if the editor has not been
		// opened meanwhile
		this.pendingDirtyResources.push(e.resource);
		if (!this.pendingDirtyHandle) {
			this.pendingDirtyHandle = setTimeout(() => this.doOpenDirtyResources(), 250);
		}
	}

	private doOpenDirtyResources(): void {
		const dirtyNotOpenedResources = arrays.distinct(this.pendingDirtyResources.filter(r => !this.stacks.isOpen(r) && this.textFileService.isDirty(r)), r => r.toString());

		// Reset
		this.pendingDirtyHandle = void 0;
		this.pendingDirtyResources = [];

		const activeEditor = this.editorService.getActiveEditor();
		const activePosition = activeEditor ? activeEditor.position : Position.LEFT;

		// Open
		this.editorService.openEditors(dirtyNotOpenedResources.map(resource => {
			return {
				input: {
					resource,
					options: { inactive: true, pinned: true, preserveFocus: true }
				},
				position: activePosition
			};
		})).done(null, errors.onUnexpectedError);
	}

	private onTextFileSaveError(e: TextFileChangeEvent): void {
		this.updateActivityBadge();
	}

	private onTextFileSaved(e: TextFileChangeEvent): void {
		if (this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private onTextFileReverted(e: TextFileChangeEvent): void {
		if (this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private onUntitledEditorDirty(e: UntitledEditorEvent): void {
		this.updateActivityBadge();
	}

	private onUntitledEditorSaved(e: UntitledEditorEvent): void {
		if (this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private updateActivityBadge(): void {
		let dirtyCount = this.textFileService.getDirty().length;
		this.lastDirtyCount = dirtyCount;
		if (dirtyCount > 0) {
			this.activityService.showActivity(VIEWLET_ID, new NumberBadge(dirtyCount, (num) => nls.localize('dirtyFiles', "{0} unsaved files", dirtyCount)), 'explorer-viewlet-label');
		} else {
			this.activityService.clearActivity(VIEWLET_ID);
		}
	}

	// Note: there is some duplication with the other file event handler below. Since we cannot always rely on the disk events
	// carrying all necessary data in all environments, we also use the local file events to make sure operations are handled.
	// In any case there is no guarantee if the local event is fired first or the disk one. Thus, code must handle the case
	// that the event ordering is random as well as might not carry all information needed.
	private onLocalFileChange(e: LocalFileChangeEvent): void {

		// Handle moves specially when file is opened
		if (e.gotMoved()) {
			let before = e.getBefore();
			let after = e.getAfter();

			this.handleMovedFileInVisibleEditors(before ? before.resource : null, after ? after.resource : null, after ? after.mime : null);
		}

		// Dispose all known inputs passed on resource
		let oldFile = e.getBefore();
		if ((e.gotMoved() || e.gotDeleted())) {
			this.handleDelete(oldFile.resource);
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Dispose inputs that got deleted
		let allDeleted = e.getDeleted();
		if (allDeleted && allDeleted.length > 0) {
			allDeleted.forEach((deleted) => {
				this.handleDelete(deleted.resource);
			});
		}

		// Dispose models that got changed and are not visible. We do this because otherwise
		// cached file models will be stale from the contents on disk.
		e.getUpdated()
			.map((u) => CACHE.get(u.resource))
			.filter((model) => {
				let canDispose = this.canDispose(model);
				if (!canDispose) {
					return false;
				}

				if (Date.now() - model.getLastDirtyTime() < FileTracker.FILE_CHANGE_UPDATE_DELAY) {
					return false; // this is a weak check to see if the change came from outside the editor or not
				}

				return true; // ok boss
			})
			.forEach((model) => CACHE.dispose(model.getResource()));

		// Update inputs that got updated
		let editors = this.editorService.getVisibleEditors();
		editors.forEach((editor) => {
			let input = editor.input;
			if (input instanceof DiffEditorInput) {
				input = this.getMatchingFileEditorInputFromDiff(<DiffEditorInput>input, e);
			}

			// File Editor Input
			if (input instanceof FileEditorInput) {
				let fileInput = <FileEditorInput>input;
				let fileInputResource = fileInput.getResource();

				// Input got added or updated, so check for model and update
				// Note: we also consider the added event because it could be that a file was added
				// and updated right after.
				if (e.contains(fileInputResource, FileChangeType.UPDATED) || e.contains(fileInputResource, FileChangeType.ADDED)) {
					let textModel = CACHE.get(fileInputResource);

					// Text file: check for last dirty time
					if (textModel) {
						let state = textModel.getState();

						// We only ever update models that are in good saved state
						if (state === ModelState.SAVED) {
							let lastDirtyTime = textModel.getLastDirtyTime();

							// Force a reopen of the input if this change came in later than our wait interval before we consider it
							if (Date.now() - lastDirtyTime > FileTracker.FILE_CHANGE_UPDATE_DELAY) {
								let codeEditor = (<BaseTextEditor>editor).getControl();
								let viewState = codeEditor.saveViewState();
								let currentMtime = textModel.getLastModifiedTime(); // optimize for the case where the file did actually not change
								textModel.load().done(() => {
									if (textModel.getLastModifiedTime() !== currentMtime && this.isEditorShowingPath(<BaseEditor>editor, textModel.getResource())) {
										codeEditor.restoreViewState(viewState);
									}
								}, errors.onUnexpectedError);
							}
						}
					}

					// Binary file: always update
					else if (editor.getId() === BINARY_FILE_EDITOR_ID) {
						let editorOptions = new EditorOptions();
						editorOptions.forceOpen = true;
						editorOptions.preserveFocus = true;

						this.editorService.openEditor(editor.input, editorOptions, editor.position).done(null, errors.onUnexpectedError);
					}
				}
			}
		});
	}

	private isEditorShowingPath(editor: BaseEditor, resource: URI): boolean {

		// Only relevant if Editor is visible
		if (!editor.isVisible()) {
			return false;
		}

		// Only relevant if Input is set
		let input = editor.getInput();
		if (!input) {
			return false;
		}

		// Support diff editor input too
		if (input instanceof DiffEditorInput) {
			input = (<DiffEditorInput>input).modifiedInput;
		}

		return input instanceof FileEditorInput && (<FileEditorInput>input).getResource().toString() === resource.toString();
	}

	private handleMovedFileInVisibleEditors(oldResource: URI, newResource: URI, mimeHint?: string): void {
		let stacks = this.editorGroupService.getStacksModel();
		let editors = this.editorService.getVisibleEditors();
		editors.forEach(editor => {
			let group = stacks.groupAt(editor.position);
			let input = editor.input;
			if (input instanceof DiffEditorInput) {
				input = (<DiffEditorInput>input).modifiedInput;
			}

			let inputResource: URI;
			if (input instanceof FileEditorInput) {
				inputResource = (<FileEditorInput>input).getResource();
			}

			// Editor Input with associated Resource
			if (inputResource) {

				// Update Editor if file (or any parent of the input) got renamed or moved
				let updateInput = false;
				if (paths.isEqualOrParent(inputResource.fsPath, oldResource.fsPath)) {
					updateInput = true;
				}

				// Do update from move
				if (updateInput) {
					let reopenFileResource: URI;
					if (oldResource.toString() === inputResource.toString()) {
						reopenFileResource = newResource;
					} else {
						let index = inputResource.fsPath.indexOf(oldResource.fsPath);
						reopenFileResource = URI.file(paths.join(newResource.fsPath, inputResource.fsPath.substr(index + oldResource.fsPath.length + 1))); // update the path by changing the old path value to the new one
					}

					let editorInput: EditorInput;

					let editorOptions = new EditorOptions();
					editorOptions.preserveFocus = true;
					editorOptions.pinned = group.isPinned(input);
					editorOptions.index = group.indexOf(input);

					// Reopen File Input
					if (input instanceof FileEditorInput) {
						editorInput = this.instantiationService.createInstance(FileEditorInput, reopenFileResource, mimeHint || MIME_UNKNOWN, void 0);
						this.editorService.openEditor(editorInput, editorOptions, editor.position).done(null, errors.onUnexpectedError);
					}
				}
			}
		});
	}

	private getMatchingFileEditorInputFromDiff(input: DiffEditorInput, deletedResource: URI): FileEditorInput;
	private getMatchingFileEditorInputFromDiff(input: DiffEditorInput, updatedFiles: FileChangesEvent): FileEditorInput;
	private getMatchingFileEditorInputFromDiff(input: DiffEditorInput, arg: any): FileEditorInput {

		// First try modifiedInput
		let modifiedInput = input.modifiedInput;
		let res = this.getMatchingFileEditorInputFromInput(modifiedInput, arg);
		if (res) {
			return res;
		}

		// Second try originalInput
		return this.getMatchingFileEditorInputFromInput(input.originalInput, arg);
	}

	private getMatchingFileEditorInputFromInput(input: EditorInput, deletedResource: URI): FileEditorInput;
	private getMatchingFileEditorInputFromInput(input: EditorInput, updatedFiles: FileChangesEvent): FileEditorInput;
	private getMatchingFileEditorInputFromInput(input: EditorInput, arg: any): FileEditorInput {
		if (input instanceof FileEditorInput) {
			if (arg instanceof URI) {
				let deletedResource = <URI>arg;
				if (this.containsResource(input, deletedResource)) {
					return input;
				}
			} else {
				let updatedFiles = <FileChangesEvent>arg;
				if (updatedFiles.contains(input.getResource(), FileChangeType.UPDATED)) {
					return input;
				}
			}
		}

		return null;
	}

	private handleDelete(resource: URI): void {
		if (this.textFileService.isDirty(resource)) {
			return; // never dispose dirty resources
		}

		// Add existing clients matching resource
		let inputsContainingPath: EditorInput[] = FileEditorInput.getAll(resource);

		// Collect from history and opened editors and see which ones to pick
		const candidates = this.historyService.getHistory();
		this.stacks.groups.forEach(group => candidates.push(...group.getEditors()));
		candidates.forEach(input => {
			if (input instanceof DiffEditorInput) {
				input = this.getMatchingFileEditorInputFromDiff(<DiffEditorInput>input, resource);
				if (input instanceof FileEditorInput) {
					inputsContainingPath.push(<FileEditorInput>input);
				}
			}

			// File Editor Input
			else if (input instanceof FileEditorInput && this.containsResource(<FileEditorInput>input, resource)) {
				inputsContainingPath.push(<FileEditorInput>input);
			}
		});

		inputsContainingPath.forEach((input) => {

			// Editor History
			this.historyService.remove(input);

			// Dispose Input
			if (!input.isDisposed()) {
				input.dispose();
			}
		});

		// Clean up model if any
		CACHE.dispose(resource);
	}

	private containsResource(input: FileEditorInput, resource: URI): boolean;
	private containsResource(input: EditorInput, resource: URI): boolean {
		let fileResource: URI;
		if (input instanceof FileEditorInput) {
			fileResource = (<FileEditorInput>input).getResource();
		}

		if (paths.isEqualOrParent(fileResource.fsPath, resource.fsPath)) {
			return true;
		}

		return false;
	}

	private disposeUnusedTextFileModels(): void {

		// To not grow our text file model cache infinitly, we dispose models that
		// are not showing up in any opened editor.

		// Get all cached file models
		CACHE.getAll()

			// Only take text file models and remove those that are under working files or opened
			.filter(model => !this.stacks.isOpen(model.getResource()) && this.canDispose(model))

			// Dispose
			.forEach(model => CACHE.dispose(model.getResource()));
	}

	private canDispose(textModel: TextFileEditorModel): boolean {
		if (!textModel) {
			return false; // we need data!
		}

		if (textModel.isDisposed()) {
			return false; // already disposed
		}

		if (textModel.textEditorModel && textModel.textEditorModel.isAttachedToEditor()) {
			return false; // never dispose when attached to editor
		}

		if (textModel.getState() !== ModelState.SAVED) {
			return false; // never dispose unsaved models
		}

		return true;
	}

	public dispose(): void {
		dispose(this.toUnbind);
	}
}