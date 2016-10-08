/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import errors = require('vs/base/common/errors');
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IEditor as IBaseEditor } from 'vs/platform/editor/common/editor';
import { EditorInput, IEditorStacksModel } from 'vs/workbench/common/editor';
import { BINARY_FILE_EDITOR_ID } from 'vs/workbench/parts/files/common/files';
import { LocalFileChangeEvent, ITextFileService, ModelState } from 'vs/workbench/services/textfile/common/textfiles';
import { FileChangeType, FileChangesEvent, EventType as CommonFileEventType } from 'vs/platform/files/common/files';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEventService } from 'vs/platform/event/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class FileEditorTracker implements IWorkbenchContribution {

	// Delay in ms that we wait at minimum before we update a model from a file change event.
	// This reduces the chance that a save from the client triggers an update of the editor.
	private static FILE_CHANGE_UPDATE_DELAY = 2000;

	private stacks: IEditorStacksModel;
	private toUnbind: IDisposable[];

	constructor(
		@IEventService private eventService: IEventService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
	) {
		this.toUnbind = [];
		this.stacks = editorGroupService.getStacksModel();

		this.registerListeners();
	}

	public getId(): string {
		return 'vs.files.fileEditorTracker';
	}

	private registerListeners(): void {

		// Update editors from local changes and saves
		this.toUnbind.push(this.eventService.addListener2('files.internal:fileChanged', (e: LocalFileChangeEvent) => this.onLocalFileChange(e)));

		// Update editors from disk changes
		this.toUnbind.push(this.eventService.addListener2(CommonFileEventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFileChanges(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
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

			this.handleMovedFileInOpenedEditors(before ? before.resource : null, after ? after.resource : null);
		}
	}

	private handleMovedFileInOpenedEditors(oldResource: URI, newResource: URI): void {
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
						this.editorService.openEditor({ resource: reopenFileResource, options: { preserveFocus: true, pinned: group.isPinned(input), index: group.indexOf(input), inactive: !group.isActive(input) } }, stacks.positionOfGroup(group)).done(null, errors.onUnexpectedError);
					}
				}
			});
		});
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Handle updates to visible editors
		this.handleUpdatesToVisibleEditors(e);
	}

	private handleUpdatesToVisibleEditors(e: FileChangesEvent) {
		const editors = this.editorService.getVisibleEditors();
		editors.forEach(editor => {
			let input = editor.input;
			if (input instanceof DiffEditorInput) {
				input = this.getMatchingFileEditorInputFromDiff(<DiffEditorInput>input, e);
			}

			// File Editor Input
			if (input instanceof FileEditorInput) {
				const fileInputResource = input.getResource();

				// Input got added or updated, so check for model and update
				// Note: we also consider the added event because it could be that a file was added
				// and updated right after.
				if (e.contains(fileInputResource, FileChangeType.UPDATED) || e.contains(fileInputResource, FileChangeType.ADDED)) {
					const textModel = this.textFileService.models.get(fileInputResource);

					// Text file: check for last save time
					if (textModel) {

						// We only ever update models that are in good saved state
						if (textModel.getState() === ModelState.SAVED) {
							const lastSaveTime = textModel.getLastSaveAttemptTime();

							// Force a reopen of the input if this change came in later than our wait interval before we consider it
							if (Date.now() - lastSaveTime > FileEditorTracker.FILE_CHANGE_UPDATE_DELAY) {
								const codeEditor = <IEditor>editor.getControl();
								const viewState = codeEditor.saveViewState();
								const currentMtime = textModel.getLastModifiedTime(); // optimize for the case where the file did actually not change
								textModel.load().done(() => {
									if (textModel.getLastModifiedTime() !== currentMtime && this.isEditorShowingPath(editor, textModel.getResource())) {
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

	private isEditorShowingPath(editor: IBaseEditor, resource: URI): boolean {

		// Only relevant if Editor is visible
		if (!editor.isVisible()) {
			return false;
		}

		// Only relevant if Input is set
		let input = editor.input;
		if (!input) {
			return false;
		}

		// Support diff editor input too
		if (input instanceof DiffEditorInput) {
			input = (<DiffEditorInput>input).modifiedInput;
		}

		return input instanceof FileEditorInput && input.getResource().toString() === resource.toString();
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

	private containsResource(input: FileEditorInput, resource: URI): boolean;
	private containsResource(input: EditorInput, resource: URI): boolean {
		let fileResource: URI;
		if (input instanceof FileEditorInput) {
			fileResource = input.getResource();
		}

		if (paths.isEqualOrParent(fileResource.fsPath, resource.fsPath)) {
			return true;
		}

		return false;
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}