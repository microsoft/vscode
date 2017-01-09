/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import errors = require('vs/base/common/errors');
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import { IEditor, IEditorViewState, isCommonCodeEditor } from 'vs/editor/common/editorCommon';
import { IEditor as IBaseEditor } from 'vs/platform/editor/common/editor';
import { toResource, EditorInput, IEditorStacksModel, SideBySideEditorInput, IEditorGroup } from 'vs/workbench/common/editor';
import { BINARY_FILE_EDITOR_ID } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, ModelState } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationEvent, FileOperation, IFileService, FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class FileEditorTracker implements IWorkbenchContribution {

	// Delay in ms that we wait at minimum before we update a model from a file change event.
	// This reduces the chance that a save from the client triggers an update of the editor.
	private static FILE_CHANGE_UPDATE_DELAY = 2000;

	private stacks: IEditorStacksModel;
	private toUnbind: IDisposable[];

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFileService private fileService: IFileService
	) {
		this.toUnbind = [];
		this.stacks = editorGroupService.getStacksModel();

		this.registerListeners();
	}

	public getId(): string {
		return 'vs.files.fileEditorTracker';
	}

	private registerListeners(): void {

		// Update editors from operation changes
		this.toUnbind.push(this.fileService.onAfterOperation(e => this.onFileOperation(e)));

		// Update editors from disk changes
		this.toUnbind.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	// Note: there is some duplication with the other file event handler below. Since we cannot always rely on the disk events
	// carrying all necessary data in all environments, we also use the file operation events to make sure operations are handled.
	// In any case there is no guarantee if the local event is fired first or the disk one. Thus, code must handle the case
	// that the event ordering is random as well as might not carry all information needed.
	private onFileOperation(e: FileOperationEvent): void {

		// Handle moves specially when file is opened
		if (e.operation === FileOperation.MOVE) {
			this.handleMovedFileInOpenedEditors(e.resource, e.target.resource);
		}

		// Handle deletes
		if (e.operation === FileOperation.DELETE || e.operation === FileOperation.MOVE) {
			this.handleDeletes(e.resource, e.target ? e.target.resource : void 0);
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Handle updates to visible editors
		this.handleUpdatesToVisibleEditors(e);

		// Handle deletes
		if (e.gotDeleted()) {
			this.handleDeletes(e);
		}
	}

	private handleDeletes(arg1: URI | FileChangesEvent, movedTo?: URI): void {
		const fileInputs = this.getOpenedFileInputs();
		fileInputs.forEach(input => {
			if (input.isDirty()) {
				return; // we never dispose dirty files
			}

			// Special case: a resource was renamed to the same path with different casing. Since our paths
			// API is treating the paths as equal (they are on disk), we end up disposing the input we just
			// renamed. The workaround is to detect that we do not dispose any input we are moving the file to
			if (movedTo && movedTo.fsPath === input.getResource().fsPath) {
				return;
			}

			let matches = false;
			if (arg1 instanceof FileChangesEvent) {
				matches = arg1.contains(input.getResource(), FileChangeType.DELETED);
			} else {
				matches = paths.isEqualOrParent(input.getResource().toString(), arg1.toString());
			}

			if (matches) {
				input.dispose();
			}
		});
	}

	private getOpenedFileInputs(): FileEditorInput[] {
		const inputs: FileEditorInput[] = [];

		const stacks = this.editorGroupService.getStacksModel();
		stacks.groups.forEach(group => {
			group.getEditors().forEach(input => {
				if (input instanceof FileEditorInput) {
					inputs.push(input);
				} else if (input instanceof SideBySideEditorInput) {
					const master = input.master;
					const details = input.details;

					if (master instanceof FileEditorInput) {
						inputs.push(master);
					}

					if (details instanceof FileEditorInput) {
						inputs.push(details);
					}
				}
			});
		});

		return inputs;
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
						this.editorService.openEditor({
							resource: reopenFileResource,
							options: {
								preserveFocus: true,
								pinned: group.isPinned(input),
								index: group.indexOf(input),
								inactive: !group.isActive(input),
								viewState: this.getViewStateFor(oldResource, group)
							}
						}, stacks.positionOfGroup(group)).done(null, errors.onUnexpectedError);
					}
				}
			});
		});
	}

	private getViewStateFor(resource: URI, group: IEditorGroup): IEditorViewState {
		const stacks = this.editorGroupService.getStacksModel();
		const editors = this.editorService.getVisibleEditors();

		for (let i = 0; i < editors.length; i++) {
			const editor = editors[i];
			if (editor && editor.position === stacks.positionOfGroup(group)) {
				const resource = toResource(editor.input, { filter: 'file' });
				if (resource && resource.fsPath === resource.fsPath) {
					const control = editor.getControl();
					if (isCommonCodeEditor(control)) {
						return control.saveViewState();
					}
				}
			}
		}

		return void 0;
	}

	private handleUpdatesToVisibleEditors(e: FileChangesEvent) {
		const editors = this.editorService.getVisibleEditors();
		editors.forEach(editor => {
			let input = editor.input;
			if (input instanceof SideBySideEditorInput) {
				input = this.getMatchingFileEditorInputFromSideBySide(<SideBySideEditorInput>input, e);
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

		// Support side by side editor input too
		if (input instanceof SideBySideEditorInput) {
			input = (<SideBySideEditorInput>input).master;
		}

		return input instanceof FileEditorInput && input.getResource().toString() === resource.toString();
	}

	private getMatchingFileEditorInputFromSideBySide(input: SideBySideEditorInput, e: FileChangesEvent): FileEditorInput {

		// First try master
		const master = input.master;
		const res = this.getMatchingFileEditorInputFromInput(master, e);
		if (res) {
			return res;
		}

		// Second try details
		return this.getMatchingFileEditorInputFromInput(input.details, e);
	}

	private getMatchingFileEditorInputFromInput(input: EditorInput, e: FileChangesEvent): FileEditorInput {
		if (input instanceof FileEditorInput && e.contains(input.getResource(), FileChangeType.UPDATED)) {
			return input;
		}

		return null;
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}