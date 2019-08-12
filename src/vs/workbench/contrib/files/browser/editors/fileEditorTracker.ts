/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { toResource, SideBySideEditorInput, IWorkbenchEditorConfiguration, SideBySideEditor as SideBySideEditorChoice } from 'vs/workbench/common/editor';
import { ITextFileService, ITextFileEditorModel } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationEvent, FileOperation, IFileService, FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { distinct, coalesce } from 'vs/base/common/arrays';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ResourceMap } from 'vs/base/common/map';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { BINARY_FILE_EDITOR_ID } from 'vs/workbench/contrib/files/common/files';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ResourceQueue, timeout } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { withNullAsUndefined } from 'vs/base/common/types';

export class FileEditorTracker extends Disposable implements IWorkbenchContribution {

	private closeOnFileDelete: boolean | undefined;
	private modelLoadQueue = new ResourceQueue();
	private activeOutOfWorkspaceWatchers = new ResourceMap<IDisposable>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWindowService private readonly windowService: IWindowService
	) {
		super();

		this.onConfigurationUpdated(configurationService.getValue<IWorkbenchEditorConfiguration>());

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update editors from operation changes
		this._register(this.fileService.onAfterOperation(e => this.onFileOperation(e)));

		// Update editors from disk changes
		this._register(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		// Editor changing
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.handleOutOfWorkspaceWatchers()));

		// Update visible editors when focus is gained
		this._register(this.windowService.onDidChangeFocus(e => this.onWindowFocusChange(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);

		// Configuration
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IWorkbenchEditorConfiguration>())));
	}

	private onConfigurationUpdated(configuration: IWorkbenchEditorConfiguration): void {
		if (configuration.workbench && configuration.workbench.editor && typeof configuration.workbench.editor.closeOnFileDelete === 'boolean') {
			this.closeOnFileDelete = configuration.workbench.editor.closeOnFileDelete;
		} else {
			this.closeOnFileDelete = false; // default
		}
	}

	private onWindowFocusChange(focused: boolean): void {
		if (focused) {
			// the window got focus and we use this as a hint that files might have been changed outside
			// of this window. since file events can be unreliable, we queue a load for models that
			// are visible in any editor. since this is a fast operation in the case nothing has changed,
			// we tolerate the additional work.
			distinct(
				coalesce(this.editorService.visibleEditors
					.map(editorInput => {
						const resource = toResource(editorInput, { supportSideBySide: SideBySideEditorChoice.MASTER });
						return resource ? this.textFileService.models.get(resource) : undefined;
					}))
					.filter(model => !model.isDirty()),
				m => m.getResource().toString()
			).forEach(model => this.queueModelLoad(model));
		}
	}

	// Note: there is some duplication with the other file event handler below. Since we cannot always rely on the disk events
	// carrying all necessary data in all environments, we also use the file operation events to make sure operations are handled.
	// In any case there is no guarantee if the local event is fired first or the disk one. Thus, code must handle the case
	// that the event ordering is random as well as might not carry all information needed.
	private onFileOperation(e: FileOperationEvent): void {

		// Handle moves specially when file is opened
		if (e.isOperation(FileOperation.MOVE)) {
			this.handleMovedFileInOpenedEditors(e.resource, e.target.resource);
		}

		// Handle deletes
		if (e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.MOVE)) {
			this.handleDeletes(e.resource, false, e.target ? e.target.resource : undefined);
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Handle updates
		if (e.gotAdded() || e.gotUpdated()) {
			this.handleUpdates(e);
		}

		// Handle deletes
		if (e.gotDeleted()) {
			this.handleDeletes(e, true);
		}
	}

	private handleDeletes(arg1: URI | FileChangesEvent, isExternal: boolean, movedTo?: URI): void {
		const nonDirtyFileEditors = this.getOpenedFileEditors(false /* non-dirty only */);
		nonDirtyFileEditors.forEach(async editor => {
			const resource = editor.getResource();

			// Handle deletes in opened editors depending on:
			// - the user has not disabled the setting closeOnFileDelete
			// - the file change is local or external
			// - the input is not resolved (we need to dispose because we cannot restore otherwise since we do not have the contents)
			if (this.closeOnFileDelete || !isExternal || !editor.isResolved()) {

				// Do NOT close any opened editor that matches the resource path (either equal or being parent) of the
				// resource we move to (movedTo). Otherwise we would close a resource that has been renamed to the same
				// path but different casing.
				if (movedTo && resources.isEqualOrParent(resource, movedTo)) {
					return;
				}

				let matches = false;
				if (arg1 instanceof FileChangesEvent) {
					matches = arg1.contains(resource, FileChangeType.DELETED);
				} else {
					matches = resources.isEqualOrParent(resource, arg1);
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
				let exists = false;
				if (isExternal) {
					await timeout(100);
					exists = await this.fileService.exists(resource);
				}

				if (!exists && !editor.isDisposed()) {
					editor.dispose();
				} else if (this.environmentService.verbose) {
					console.warn(`File exists even though we received a delete event: ${resource.toString()}`);
				}
			}
		});
	}

	private getOpenedFileEditors(dirtyState: boolean): FileEditorInput[] {
		const editors: FileEditorInput[] = [];

		this.editorService.editors.forEach(editor => {
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

		return editors;
	}

	private handleMovedFileInOpenedEditors(oldResource: URI, newResource: URI): void {
		this.editorGroupService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (editor instanceof FileEditorInput) {
					const resource = editor.getResource();

					// Update Editor if file (or any parent of the input) got renamed or moved
					if (resources.isEqualOrParent(resource, oldResource)) {
						let reopenFileResource: URI;
						if (oldResource.toString() === resource.toString()) {
							reopenFileResource = newResource; // file got moved
						} else {
							const index = this.getIndexOfPath(resource.path, oldResource.path, resources.hasToIgnoreCase(resource));
							reopenFileResource = resources.joinPath(newResource, resource.path.substr(index + oldResource.path.length + 1)); // parent folder got moved
						}

						this.editorService.replaceEditors([{
							editor: { resource },
							replacement: {
								resource: reopenFileResource,
								options: {
									preserveFocus: true,
									pinned: group.isPinned(editor),
									index: group.getIndexOfEditor(editor),
									inactive: !group.isActive(editor),
									viewState: this.getViewStateFor(oldResource, group)
								}
							},
						}], group);
					}
				}
			});
		});
	}

	private getIndexOfPath(path: string, candidate: string, ignoreCase: boolean): number {
		if (candidate.length > path.length) {
			return -1;
		}

		if (path === candidate) {
			return 0;
		}

		if (ignoreCase) {
			path = path.toLowerCase();
			candidate = candidate.toLowerCase();
		}

		return path.indexOf(candidate);
	}

	private getViewStateFor(resource: URI, group: IEditorGroup): IEditorViewState | undefined {
		const editors = this.editorService.visibleControls;

		for (const editor of editors) {
			if (editor && editor.input && editor.group === group) {
				const editorResource = editor.input.getResource();
				if (editorResource && resource.toString() === editorResource.toString()) {
					const control = editor.getControl();
					if (isCodeEditor(control)) {
						return withNullAsUndefined(control.saveViewState());
					}
				}
			}
		}

		return undefined;
	}

	private handleUpdates(e: FileChangesEvent): void {

		// Handle updates to text models
		this.handleUpdatesToTextModels(e);

		// Handle updates to visible binary editors
		this.handleUpdatesToVisibleBinaryEditors(e);
	}

	private handleUpdatesToTextModels(e: FileChangesEvent): void {

		// Collect distinct (saved) models to update.
		//
		// Note: we also consider the added event because it could be that a file was added
		// and updated right after.
		distinct(coalesce([...e.getUpdated(), ...e.getAdded()]
			.map(u => this.textFileService.models.get(u.resource)))
			.filter(model => model && !model.isDirty()), m => m.getResource().toString())
			.forEach(model => this.queueModelLoad(model));
	}

	private queueModelLoad(model: ITextFileEditorModel): void {

		// Load model to update (use a queue to prevent accumulation of loads
		// when the load actually takes long. At most we only want the queue
		// to have a size of 2 (1 running load and 1 queued load).
		const queue = this.modelLoadQueue.queueFor(model.getResource());
		if (queue.size <= 1) {
			queue.queue(() => model.load().then<void>(undefined, onUnexpectedError));
		}
	}

	private handleUpdatesToVisibleBinaryEditors(e: FileChangesEvent): void {
		const editors = this.editorService.visibleControls;
		editors.forEach(editor => {
			const resource = editor.input ? toResource(editor.input, { supportSideBySide: SideBySideEditorChoice.MASTER }) : undefined;

			// Support side-by-side binary editors too
			let isBinaryEditor = false;
			if (editor instanceof SideBySideEditor) {
				const masterEditor = editor.getMasterEditor();
				isBinaryEditor = !!masterEditor && masterEditor.getId() === BINARY_FILE_EDITOR_ID;
			} else {
				isBinaryEditor = editor.getId() === BINARY_FILE_EDITOR_ID;
			}

			// Binary editor that should reload from event
			if (resource && editor.input && isBinaryEditor && (e.contains(resource, FileChangeType.UPDATED) || e.contains(resource, FileChangeType.ADDED))) {
				this.editorService.openEditor(editor.input, { forceReload: true, preserveFocus: true }, editor.group);
			}
		});
	}

	private handleOutOfWorkspaceWatchers(): void {
		const visibleOutOfWorkspacePaths = new ResourceMap<URI>();
		coalesce(this.editorService.visibleEditors.map(editorInput => {
			return toResource(editorInput, { supportSideBySide: SideBySideEditorChoice.MASTER });
		})).filter(resource => {
			return this.fileService.canHandleResource(resource) && !this.contextService.isInsideWorkspace(resource);
		}).forEach(resource => {
			visibleOutOfWorkspacePaths.set(resource, resource);
		});

		// Handle no longer visible out of workspace resources
		this.activeOutOfWorkspaceWatchers.keys().forEach(resource => {
			if (!visibleOutOfWorkspacePaths.get(resource)) {
				dispose(this.activeOutOfWorkspaceWatchers.get(resource));
				this.activeOutOfWorkspaceWatchers.delete(resource);
			}
		});

		// Handle newly visible out of workspace resources
		visibleOutOfWorkspacePaths.forEach(resource => {
			if (!this.activeOutOfWorkspaceWatchers.get(resource)) {
				const disposable = this.fileService.watch(resource);
				this.activeOutOfWorkspaceWatchers.set(resource, disposable);
			}
		});
	}

	dispose(): void {
		super.dispose();

		// Dispose remaining watchers if any
		this.activeOutOfWorkspaceWatchers.forEach(disposable => dispose(disposable));
		this.activeOutOfWorkspaceWatchers.clear();
	}
}
