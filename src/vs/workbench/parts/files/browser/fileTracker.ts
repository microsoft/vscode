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
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {LocalFileChangeEvent, VIEWLET_ID, BINARY_FILE_EDITOR_ID, EventType as FileEventType, IWorkingFilesModel, ITextFileService, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import {FileChangeType, FileChangesEvent, EventType as CommonFileEventType} from 'vs/platform/files/common/files';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {IFrameEditorInput} from 'vs/workbench/common/editor/iframeEditorInput';
import {State, TextFileEditorModel, CACHE} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {IFrameEditor} from 'vs/workbench/browser/parts/editor/iframeEditor';
import {EventType as WorkbenchEventType, EditorInputEvent, UntitledEditorEvent} from 'vs/workbench/common/events';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IActivityService, NumberBadge} from 'vs/workbench/services/activity/common/activityService';
import {IEditorInput} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

// This extension tracks files for changes to update editors and inputs accordingly.
export class FileTracker implements IWorkbenchContribution {

	// Delay in ms that we wait at minimum before we update a model from a file change event.
	// This reduces the chance that a save from the client triggers an update of the editor.
	private static FILE_CHANGE_UPDATE_DELAY = 2000;

	private lastDirtyCount: number;
	private workingFiles: IWorkingFilesModel;

	private toUnbind: { (): void; }[];

	constructor(
		@IEventService private eventService: IEventService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IActivityService private activityService: IActivityService,
		@ITextFileService private textFileService: ITextFileService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		this.toUnbind = [];
		this.workingFiles = textFileService.getWorkingFilesModel();

		this.registerListeners();
	}

	public getId(): string {
		return 'vs.files.filetracker';
	}

	private registerListeners(): void {

		// Update editors and inputs from local changes and saves
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.EDITOR_INPUT_CHANGED, (e: EditorInputEvent) => this.onEditorInputChanged(e)));
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.UNTITLED_FILE_DELETED, (e: UntitledEditorEvent) => this.onUntitledEditorDeleted(e)));
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.UNTITLED_FILE_DIRTY, (e: UntitledEditorEvent) => this.onUntitledEditorDirty(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_DIRTY, (e: LocalFileChangeEvent) => this.onTextFileDirty(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_SAVING, (e: LocalFileChangeEvent) => this.onTextFileSaving(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_SAVE_ERROR, (e: LocalFileChangeEvent) => this.onTextFileSaveError(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_SAVED, (e: LocalFileChangeEvent) => this.onTextFileSaved(e)));
		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_REVERTED, (e: LocalFileChangeEvent) => this.onTextFileReverted(e)));
		this.toUnbind.push(this.eventService.addListener('files.internal:fileChanged', (e: LocalFileChangeEvent) => this.onLocalFileChange(e)));

		// Update editors and inputs from disk changes
		this.toUnbind.push(this.eventService.addListener(CommonFileEventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFileChanges(e)));
	}

	private onEditorInputChanged(e: EditorInputEvent): void {
		this.disposeTextFileModels();
	}

	private onTextFileDirty(e: LocalFileChangeEvent): void {
		this.emitInputStateChangeEvent(e.getAfter().resource);

		if (this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) {
			this.updateActivityBadge(); // no indication needed when auto save is enabled for short delay
		}
	}

	private onTextFileSaving(e: LocalFileChangeEvent): void {
		this.emitInputStateChangeEvent(e.getAfter().resource);
	}

	private onTextFileSaveError(e: LocalFileChangeEvent): void {
		this.emitInputStateChangeEvent(e.getAfter().resource);
		this.updateActivityBadge();
	}

	private onTextFileSaved(e: LocalFileChangeEvent): void {
		this.emitInputStateChangeEvent(e.getAfter().resource);

		if (this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private onTextFileReverted(e: LocalFileChangeEvent): void {
		this.emitInputStateChangeEvent(e.getAfter().resource);

		if (this.lastDirtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	private onUntitledEditorDirty(e: UntitledEditorEvent): void {
		let input = this.untitledEditorService.get(e.resource);
		if (input) {
			this.eventService.emit(WorkbenchEventType.EDITOR_INPUT_STATE_CHANGED, new EditorInputEvent(input));
		}

		this.updateActivityBadge();
	}

	private onUntitledEditorDeleted(e: UntitledEditorEvent): void {
		let input = this.untitledEditorService.get(e.resource);
		if (input) {
			this.eventService.emit(WorkbenchEventType.EDITOR_INPUT_STATE_CHANGED, new EditorInputEvent(input));
		}

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

	private emitInputStateChangeEvent(resource: URI): void {

		// Find all file editor inputs that are open from the given file resource and emit a editor input state change event.
		// We could do all of this within the file editor input but having all the file change listeners in
		// one place is more elegant and keeps the logic together at once place.
		let editors = this.editorService.getVisibleEditors();
		editors.forEach((editor) => {
			let input = editor.input;
			if (input instanceof DiffEditorInput) {
				input = (<DiffEditorInput>input).getModifiedInput();
			}

			// File Editor Input
			if (input instanceof FileEditorInput) {
				let fileInput = <FileEditorInput>input;
				if (fileInput.getResource().toString() === resource.toString()) {
					let inputEvent = editor.input instanceof DiffEditorInput ? <DiffEditorInput>editor.input : fileInput; // make sure to still send around the input from the diff editor if given

					this.eventService.emit(WorkbenchEventType.EDITOR_INPUT_STATE_CHANGED, new EditorInputEvent(inputEvent));
				}
			}
		});
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
			this.disposeAll(oldFile.resource, this.quickOpenService.getEditorHistory());
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Dispose inputs that got deleted
		let allDeleted = e.getDeleted();
		if (allDeleted && allDeleted.length > 0) {
			allDeleted.forEach((deleted) => {
				this.disposeAll(deleted.resource, this.quickOpenService.getEditorHistory());
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

				if (new Date().getTime() - model.getLastDirtyTime() < FileTracker.FILE_CHANGE_UPDATE_DELAY) {
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
						if (state === State.SAVED) {
							let lastDirtyTime = textModel.getLastDirtyTime();

							// Force a reopen of the input if this change came in later than our wait interval before we consider it
							if (new Date().getTime() - lastDirtyTime > FileTracker.FILE_CHANGE_UPDATE_DELAY) {
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

			// IFrame Editor Input
			else if (input instanceof IFrameEditorInput) {
				let iFrameInput = <IFrameEditorInput>input;
				if (e.contains(iFrameInput.getResource(), FileChangeType.UPDATED)) {
					(<IFrameEditor>editor).reload();
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
			input = (<DiffEditorInput>input).getModifiedInput();
		}

		return input instanceof FileEditorInput && (<FileEditorInput>input).getResource().toString() === resource.toString();
	}

	private handleMovedFileInVisibleEditors(oldResource: URI, newResource: URI, mimeHint?: string): void {
		let editors = this.editorService.getVisibleEditors();
		editors.forEach((editor) => {
			let input = editor.input;
			if (input instanceof DiffEditorInput) {
				input = (<DiffEditorInput>input).getModifiedInput();
			}

			let inputResource: URI;
			if (input instanceof FileEditorInput) {
				inputResource = (<FileEditorInput>input).getResource();
			} else if (input instanceof IFrameEditorInput) {
				inputResource = (<IFrameEditorInput>input).getResource();
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

					// Reopen File Input
					if (input instanceof FileEditorInput) {
						editorInput = this.instantiationService.createInstance(FileEditorInput, reopenFileResource, mimeHint || MIME_UNKNOWN, void 0);
					}

					// Reopen IFrame Input
					else if (input instanceof IFrameEditorInput) {
						let iFrameInput = <IFrameEditorInput>input;

						editorInput = iFrameInput.createNew(reopenFileResource);
					}

					if (editorInput) {
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
		let modifiedInput = input.getModifiedInput();
		let res = this.getMatchingFileEditorInputFromInput(modifiedInput, arg);
		if (res) {
			return res;
		}

		// Second try originalInput
		let originalInput = input.getOriginalInput();
		return this.getMatchingFileEditorInputFromInput(originalInput, arg);
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

	private disposeAll(deletedResource: URI, history: IEditorInput[]): void {
		if (this.textFileService.isDirty(deletedResource)) {
			return; // never dispose dirty resources
		}

		// Add existing clients matching resource
		let inputsContainingPath: EditorInput[] = FileEditorInput.getAll(deletedResource);

		// Add those from history as well
		for (let i = 0; i < history.length; i++) {
			let element = history[i];

			// File Input
			if (element instanceof FileEditorInput && this.containsResource(<FileEditorInput>element, deletedResource)) {
				inputsContainingPath.push(<FileEditorInput>element);
			}

			// IFrame Input
			else if (element instanceof IFrameEditorInput && this.containsResource(<IFrameEditorInput>element, deletedResource)) {
				inputsContainingPath.push(<IFrameEditorInput>element);
			}
		}

		// Add those from visible editors too
		let editors = this.editorService.getVisibleEditors();
		editors.forEach((editor) => {
			let input = editor.input;
			if (input instanceof DiffEditorInput) {
				input = this.getMatchingFileEditorInputFromDiff(<DiffEditorInput>input, deletedResource);
				if (input instanceof FileEditorInput) {
					inputsContainingPath.push(<FileEditorInput>input);
				}
			}

			// File Editor Input
			else if (input instanceof FileEditorInput && this.containsResource(<FileEditorInput>input, deletedResource)) {
				inputsContainingPath.push(<FileEditorInput>input);
			}

			// IFrame Input
			else if (input instanceof IFrameEditorInput && this.containsResource(<IFrameEditorInput>input, deletedResource)) {
				inputsContainingPath.push(<IFrameEditorInput>input);
			}
		});

		// Dispose all
		inputsContainingPath.forEach((input) => {
			if (!input.isDisposed()) {
				if (input instanceof FileEditorInput) {
					let fileInputToDispose = <FileEditorInput>input;
					fileInputToDispose.dispose(true /* force */);
				} else {
					input.dispose();
				}
			}
		});
	}

	private containsResource(input: FileEditorInput, resource: URI): boolean;
	private containsResource(input: IFrameEditorInput, resource: URI): boolean;
	private containsResource(input: EditorInput, resource: URI): boolean {
		let fileResource: URI;
		if (input instanceof FileEditorInput) {
			fileResource = (<FileEditorInput>input).getResource();
		} else {
			fileResource = (<IFrameEditorInput>input).getResource();
		}

		if (paths.isEqualOrParent(fileResource.fsPath, resource.fsPath)) {
			return true;
		}

		return false;
	}

	private disposeTextFileModels(): void {

		// To not grow our text file model cache infinitly, we dispose models that
		// are not showing up in any editor and are not in the working file set or dirty.

		// Get all cached file models
		CACHE.getAll()

		// Only take text file models and remove those that are under working files or opened
			.filter((model) => !this.workingFiles.hasEntry(model.getResource()) && this.canDispose(model))

		// Dispose
			.forEach((model) => CACHE.dispose(model.getResource()));
	}

	private canDispose(textModel: TextFileEditorModel): boolean {
		if (!textModel) {
			return false; // we need data!
		}

		if (textModel.textEditorModel && textModel.textEditorModel.isAttachedToEditor()) {
			return false; // never dispose when attached to editor
		}

		if (textModel.getState() !== State.SAVED) {
			return false; // never dispose unsaved models
		}

		if (this.editorService.getVisibleEditors().some(e => {
			if (e.input instanceof IFrameEditorInput) {
				let iFrameInputResource = (<IFrameEditorInput>e.input).getResource();

				return iFrameInputResource && iFrameInputResource.toString() === textModel.getResource().toString();
			}

			return false;
		})) {
			return false; // never dispose models that are used in iframe inputs
		}

		return true;
	}

	public dispose(): void {
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}
	}
}