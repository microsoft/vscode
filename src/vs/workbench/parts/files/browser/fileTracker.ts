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
import {EditorInput, IEditorStacksModel} from 'vs/workbench/common/editor';
import {Position} from 'vs/platform/editor/common/editor';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {asFileEditorInput} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {LocalFileChangeEvent, TextFileChangeEvent, VIEWLET_ID, BINARY_FILE_EDITOR_ID, EventType as FileEventType, ITextFileService, AutoSaveMode, ModelState} from 'vs/workbench/parts/files/common/files';
import {FileChangeType, FileChangesEvent, EventType as CommonFileEventType, IFileService} from 'vs/platform/files/common/files';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {TextFileEditorModel, CACHE} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {EventType as WorkbenchEventType, UntitledEditorEvent} from 'vs/workbench/common/events';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
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

	private activeOutOfWorkspaceWatchers: { [resource: string]: boolean; };

	private pendingDirtyResources: URI[];
	private pendingDirtyHandle: number;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEventService private eventService: IEventService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IActivityService private activityService: IActivityService,
		@IFileService private fileService: IFileService,
		@ITextFileService private textFileService: ITextFileService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IHistoryService private historyService: IHistoryService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		this.toUnbind = [];
		this.stacks = editorGroupService.getStacksModel();
		this.pendingDirtyResources = [];
		this.activeOutOfWorkspaceWatchers = Object.create(null);

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

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onEditorsChanged(): void {
		this.disposeUnusedTextFileModels();
		this.handleOutOfWorkspaceWatchers();
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
		const dirtyCount = this.textFileService.getDirty().length;
		this.lastDirtyCount = dirtyCount;
		if (dirtyCount > 0) {
			this.activityService.showActivity(VIEWLET_ID, new NumberBadge(dirtyCount, num => nls.localize('dirtyFiles', "{0} unsaved files", dirtyCount)), 'explorer-viewlet-label');
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
			const before = e.getBefore();
			const after = e.getAfter();

			this.handleMovedFileInOpenedEditors(before ? before.resource : null, after ? after.resource : null, after ? after.mime : null);
		}

		// Dispose all known inputs passed on resource if deleted or moved
		const oldFile = e.getBefore();
		const movedTo = e.gotMoved() && e.getAfter() && e.getAfter().resource;
		if (e.gotMoved() || e.gotDeleted()) {
			this.handleDeleteOrMove(oldFile.resource, movedTo);
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Dispose inputs that got deleted
		const allDeleted = e.getDeleted();
		if (allDeleted && allDeleted.length > 0) {
			allDeleted.forEach(deleted => {
				this.handleDeleteOrMove(deleted.resource);
			});
		}

		// Dispose models that got changed and are not visible. We do this because otherwise
		// cached file models will be stale from the contents on disk.
		e.getUpdated()
			.map(u => CACHE.get(u.resource))
			.filter(model => {
				const canDispose = this.canDispose(model);
				if (!canDispose) {
					return false;
				}

				if (Date.now() - model.getLastSaveAttemptTime() < FileTracker.FILE_CHANGE_UPDATE_DELAY) {
					return false; // this is a weak check to see if the change came from outside the editor or not
				}

				return true; // ok boss
			})
			.forEach(model => CACHE.dispose(model.getResource()));

		// Update inputs that got updated
		const editors = this.editorService.getVisibleEditors();
		editors.forEach(editor => {
			let input = editor.input;
			if (input instanceof DiffEditorInput) {
				input = this.getMatchingFileEditorInputFromDiff(<DiffEditorInput>input, e);
			}

			// File Editor Input
			if (input instanceof FileEditorInput) {
				const fileInput = <FileEditorInput>input;
				const fileInputResource = fileInput.getResource();

				// Input got added or updated, so check for model and update
				// Note: we also consider the added event because it could be that a file was added
				// and updated right after.
				if (e.contains(fileInputResource, FileChangeType.UPDATED) || e.contains(fileInputResource, FileChangeType.ADDED)) {
					const textModel = CACHE.get(fileInputResource);

					// Text file: check for last save time
					if (textModel) {

						// We only ever update models that are in good saved state
						if (textModel.getState() === ModelState.SAVED) {
							const lastSaveTime = textModel.getLastSaveAttemptTime();

							// Force a reopen of the input if this change came in later than our wait interval before we consider it
							if (Date.now() - lastSaveTime > FileTracker.FILE_CHANGE_UPDATE_DELAY) {
								const codeEditor = (<BaseTextEditor>editor).getControl();
								const viewState = codeEditor.saveViewState();
								const currentMtime = textModel.getLastModifiedTime(); // optimize for the case where the file did actually not change
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
						this.editorService.openEditor(editor.input, { forceOpen: true, preserveFocus: true }, editor.position).done(null, errors.onUnexpectedError);
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

	private handleMovedFileInOpenedEditors(oldResource: URI, newResource: URI, mimeHint?: string): void {
		const stacks = this.editorGroupService.getStacksModel();
		stacks.groups.forEach(group => {
			group.getEditors().forEach(input => {
				if (input instanceof FileEditorInput) {
					const resource = input.getResource();

					// Update Editor if file (or any parent of the input) got renamed or moved
					if (paths.isEqualOrParent(resource.fsPath, oldResource.fsPath)) {
						let reopenFileResource: URI;
						if (oldResource.toString() === resource.toString()) {
							reopenFileResource = newResource; // file got moved
						} else {
							const index = resource.fsPath.indexOf(oldResource.fsPath);
							reopenFileResource = URI.file(paths.join(newResource.fsPath, resource.fsPath.substr(index + oldResource.fsPath.length + 1))); // parent folder got moved
						}

						// Reopen
						const editorInput = this.instantiationService.createInstance(FileEditorInput, reopenFileResource, mimeHint || MIME_UNKNOWN, void 0);
						this.editorService.openEditor(editorInput, { preserveFocus: true, pinned: group.isPinned(input), index: group.indexOf(input), inactive: !group.isActive(input) }, stacks.positionOfGroup(group)).done(null, errors.onUnexpectedError);
					}
				}
			});
		});
	}

	private getMatchingFileEditorInputFromDiff(input: DiffEditorInput, deletedResource: URI): FileEditorInput;
	private getMatchingFileEditorInputFromDiff(input: DiffEditorInput, updatedFiles: FileChangesEvent): FileEditorInput;
	private getMatchingFileEditorInputFromDiff(input: DiffEditorInput, arg: any): FileEditorInput {

		// First try modifiedInput
		const modifiedInput = input.modifiedInput;
		const res = this.getMatchingFileEditorInputFromInput(modifiedInput, arg);
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
				const deletedResource = <URI>arg;
				if (this.containsResource(input, deletedResource)) {
					return input;
				}
			} else {
				const updatedFiles = <FileChangesEvent>arg;
				if (updatedFiles.contains(input.getResource(), FileChangeType.UPDATED)) {
					return input;
				}
			}
		}

		return null;
	}

	public handleDeleteOrMove(resource: URI, movedTo?: URI): void {
		if (this.textFileService.isDirty(resource)) {
			return; // never dispose dirty resources from a delete
		}

		// Add existing clients matching resource
		const inputsContainingPath: EditorInput[] = FileEditorInput.getAll(resource);

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

		inputsContainingPath.forEach(input => {
			if (input.isDirty()) {
				return; // never dispose dirty resources from a delete
			}

			// Special case: a resource was renamed to the same path with different casing. Since our paths
			// API is treating the paths as equal (they are on disk), we end up disposing the input we just
			// renamed. The workaround is to detect that we do not dispose any input we are moving the file to
			if (input instanceof FileEditorInput && movedTo && movedTo.fsPath === input.getResource().fsPath) {
				return;
			}

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

	private handleOutOfWorkspaceWatchers(): void {
		const visibleOutOfWorkspaceResources = this.editorService.getVisibleEditors().map(editor => {
			return asFileEditorInput(editor.input, true);
		}).filter(input => {
			return !!input && !this.contextService.isInsideWorkspace(input.getResource());
		}).map(input => {
			return input.getResource().toString();
		});

		// Handle no longer visible out of workspace resources
		Object.keys(this.activeOutOfWorkspaceWatchers).forEach(watchedResource => {
			if (visibleOutOfWorkspaceResources.indexOf(watchedResource) < 0) {
				this.fileService.unwatchFileChanges(watchedResource);
				delete this.activeOutOfWorkspaceWatchers[watchedResource];
			}
		});

		// Handle newly visible out of workspace resources
		visibleOutOfWorkspaceResources.forEach(resourceToWatch => {
			if (!this.activeOutOfWorkspaceWatchers[resourceToWatch]) {
				this.fileService.watchFileChanges(URI.parse(resourceToWatch));
				this.activeOutOfWorkspaceWatchers[resourceToWatch] = true;
			}
		});
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);

		// Dispose watchers if any
		for (const key in this.activeOutOfWorkspaceWatchers) {
			this.fileService.unwatchFileChanges(key);
		}
		this.activeOutOfWorkspaceWatchers = Object.create(null);
	}
}