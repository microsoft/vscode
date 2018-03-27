/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import * as errors from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { toResource, SideBySideEditorInput, IEditorGroup, IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { BINARY_FILE_EDITOR_ID } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, ITextFileEditorModel } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationEvent, FileOperation, IFileService, FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { distinct } from 'vs/base/common/arrays';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isLinux } from 'vs/base/common/platform';
import { ResourceQueue } from 'vs/base/common/async';
import { ResourceMap } from 'vs/base/common/map';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';

export class FileEditorTracker implements IWorkbenchContribution {

	protected closeOnFileDelete: boolean;

	private toUnbind: IDisposable[];
	private modelLoadQueue: ResourceQueue;
	private activeOutOfWorkspaceWatchers: ResourceMap<URI>;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFileService private fileService: IFileService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
	) {
		this.toUnbind = [];
		this.modelLoadQueue = new ResourceQueue();
		this.activeOutOfWorkspaceWatchers = new ResourceMap<URI>();

		this.onConfigurationUpdated(configurationService.getValue<IWorkbenchEditorConfiguration>());

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update editors from operation changes
		this.toUnbind.push(this.fileService.onAfterOperation(e => this.onFileOperation(e)));

		// Update editors from disk changes
		this.toUnbind.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		// Editor changing
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);

		// Configuration
		this.toUnbind.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IWorkbenchEditorConfiguration>())));
	}

	private onConfigurationUpdated(configuration: IWorkbenchEditorConfiguration): void {
		if (configuration.workbench && configuration.workbench.editor && typeof configuration.workbench.editor.closeOnFileDelete === 'boolean') {
			this.closeOnFileDelete = configuration.workbench.editor.closeOnFileDelete;
		} else {
			this.closeOnFileDelete = true; // default
		}
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
			this.handleDeletes(e.resource, false, e.target ? e.target.resource : void 0);
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Handle updates
		this.handleUpdates(e);

		// Handle deletes
		if (e.gotDeleted()) {
			this.handleDeletes(e, true);
		}
	}

	private handleDeletes(arg1: URI | FileChangesEvent, isExternal: boolean, movedTo?: URI): void {
		const nonDirtyFileEditors = this.getOpenedFileEditors(false /* non-dirty only */);
		nonDirtyFileEditors.forEach(editor => {
			const resource = editor.getResource();

			// Handle deletes in opened editors depending on:
			// - the user has not disabled the setting closeOnFileDelete
			// - the file change is local or external
			// - the input is not resolved (we need to dispose because we cannot restore otherwise since we do not have the contents)
			if (this.closeOnFileDelete || !isExternal || !editor.isResolved()) {

				// Do NOT close any opened editor that matches the resource path (either equal or being parent) of the
				// resource we move to (movedTo). Otherwise we would close a resource that has been renamed to the same
				// path but different casing.
				if (movedTo && paths.isEqualOrParent(resource.fsPath, movedTo.fsPath, !isLinux /* ignorecase */) && resource.fsPath.indexOf(movedTo.fsPath) === 0) {
					return;
				}

				let matches = false;
				if (arg1 instanceof FileChangesEvent) {
					matches = arg1.contains(resource, FileChangeType.DELETED);
				} else {
					matches = paths.isEqualOrParent(resource.fsPath, arg1.fsPath, !isLinux /* ignorecase */);
				}

				if (!matches) {
					return;
				}

				// We have received reports of users seeing delete events even though the file still
				// exists (network shares issue: https://github.com/Microsoft/vscode/issues/13665).
				// Since we do not want to close an editor without reason, we have to check if the
				// file is really gone and not just a faulty file event.
				// This only applies to external file events, so we need to check for the isExternal
				// flag.
				let checkExists: TPromise<boolean>;
				if (isExternal) {
					checkExists = TPromise.timeout(100).then(() => this.fileService.existsFile(resource));
				} else {
					checkExists = TPromise.as(false);
				}

				checkExists.done(exists => {
					if (!exists && !editor.isDisposed()) {
						editor.dispose();
					} else if (this.environmentService.verbose) {
						console.warn(`File exists even though we received a delete event: ${resource.toString()}`);
					}
				});
			}
		});
	}

	private getOpenedFileEditors(dirtyState: boolean): FileEditorInput[] {
		const editors: FileEditorInput[] = [];

		const stacks = this.editorGroupService.getStacksModel();
		stacks.groups.forEach(group => {
			group.getEditors().forEach(editor => {
				if (editor instanceof FileEditorInput) {
					if (!!editor.isDirty() === dirtyState) {
						editors.push(editor);
					}
				} else if (editor instanceof SideBySideEditorInput) {
					const master = editor.master;
					const details = editor.details;

					if (master instanceof FileEditorInput) {
						if (!!master.isDirty() === dirtyState) {
							editors.push(master);
						}
					}

					if (details instanceof FileEditorInput) {
						if (!!details.isDirty() === dirtyState) {
							editors.push(details);
						}
					}
				}
			});
		});

		return editors;
	}

	private handleMovedFileInOpenedEditors(oldResource: URI, newResource: URI): void {
		const stacks = this.editorGroupService.getStacksModel();
		stacks.groups.forEach(group => {
			group.getEditors().forEach(input => {
				if (input instanceof FileEditorInput) {
					const resource = input.getResource();

					// Update Editor if file (or any parent of the input) got renamed or moved
					if (paths.isEqualOrParent(resource.fsPath, oldResource.fsPath, !isLinux /* ignorecase */)) {
						let reopenFileResource: URI;
						if (oldResource.toString() === resource.toString()) {
							reopenFileResource = newResource; // file got moved
						} else {
							const index = this.getIndexOfPath(resource.path, oldResource.path);
							reopenFileResource = newResource.with({ path: paths.join(newResource.path, resource.path.substr(index + oldResource.path.length + 1)) }); // parent folder got moved
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

	private getIndexOfPath(path: string, candidate: string): number {
		if (candidate.length > path.length) {
			return -1;
		}

		if (path === candidate) {
			return 0;
		}

		if (!isLinux /* ignore case */) {
			path = path.toLowerCase();
			candidate = candidate.toLowerCase();
		}

		return path.indexOf(candidate);
	}

	private getViewStateFor(resource: URI, group: IEditorGroup): IEditorViewState | undefined {
		const stacks = this.editorGroupService.getStacksModel();
		const editors = this.editorService.getVisibleEditors();

		for (let i = 0; i < editors.length; i++) {
			const editor = editors[i];
			if (editor && editor.input && editor.position === stacks.positionOfGroup(group)) {
				const editorResource = editor.input.getResource();
				if (editorResource && resource.toString() === editorResource.toString()) {
					const control = editor.getControl();
					if (isCodeEditor(control)) {
						return control.saveViewState();
					}
				}
			}
		}

		return void 0;
	}

	private handleUpdates(e: FileChangesEvent): void {

		// Handle updates to visible binary editors
		this.handleUpdatesToVisibleBinaryEditors(e);

		// Handle updates to text models
		this.handleUpdatesToTextModels(e);
	}

	private handleUpdatesToVisibleBinaryEditors(e: FileChangesEvent): void {
		const editors = this.editorService.getVisibleEditors();
		editors.forEach(editor => {
			const resource = toResource(editor.input, { supportSideBySide: true });

			// Support side-by-side binary editors too
			let isBinaryEditor = false;
			if (editor instanceof SideBySideEditor) {
				isBinaryEditor = editor.getMasterEditor().getId() === BINARY_FILE_EDITOR_ID;
			} else {
				isBinaryEditor = editor.getId() === BINARY_FILE_EDITOR_ID;
			}

			// Binary editor that should reload from event
			if (resource && isBinaryEditor && (e.contains(resource, FileChangeType.UPDATED) || e.contains(resource, FileChangeType.ADDED))) {
				this.editorService.openEditor(editor.input, { forceOpen: true, preserveFocus: true }, editor.position).done(null, errors.onUnexpectedError);
			}
		});
	}

	private handleUpdatesToTextModels(e: FileChangesEvent): void {

		// Collect distinct (saved) models to update.
		//
		// Note: we also consider the added event because it could be that a file was added
		// and updated right after.
		distinct([...e.getUpdated(), ...e.getAdded()]
			.map(u => this.textFileService.models.get(u.resource))
			.filter(model => model && !model.isDirty()), m => m.getResource().toString())
			.forEach(model => this.queueModelLoad(model));
	}

	private queueModelLoad(model: ITextFileEditorModel): void {

		// Load model to update (use a queue to prevent accumulation of loads
		// when the load actually takes long. At most we only want the queue
		// to have a size of 2 (1 running load and 1 queued load).
		const queue = this.modelLoadQueue.queueFor(model.getResource());
		if (queue.size <= 1) {
			queue.queue(() => model.load().then(null, errors.onUnexpectedError));
		}
	}

	private onEditorsChanged(): void {
		this.handleOutOfWorkspaceWatchers();
	}

	private handleOutOfWorkspaceWatchers(): void {
		const visibleOutOfWorkspacePaths = new ResourceMap<URI>();
		this.editorService.getVisibleEditors().map(editor => {
			return toResource(editor.input, { supportSideBySide: true });
		}).filter(resource => {
			return !!resource && this.fileService.canHandleResource(resource) && !this.contextService.isInsideWorkspace(resource);
		}).forEach(resource => {
			visibleOutOfWorkspacePaths.set(resource, resource);
		});

		// Handle no longer visible out of workspace resources
		this.activeOutOfWorkspaceWatchers.forEach(resource => {
			if (!visibleOutOfWorkspacePaths.get(resource)) {
				this.fileService.unwatchFileChanges(resource);
				this.activeOutOfWorkspaceWatchers.delete(resource);
			}
		});

		// Handle newly visible out of workspace resources
		visibleOutOfWorkspacePaths.forEach(resource => {
			if (!this.activeOutOfWorkspaceWatchers.get(resource)) {
				this.fileService.watchFileChanges(resource);
				this.activeOutOfWorkspaceWatchers.set(resource, resource);
			}
		});
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);

		// Dispose watchers if any
		this.activeOutOfWorkspaceWatchers.forEach(resource => this.fileService.unwatchFileChanges(resource));
		this.activeOutOfWorkspaceWatchers.clear();
	}
}
