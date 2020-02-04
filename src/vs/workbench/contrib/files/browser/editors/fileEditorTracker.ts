/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { URI } from 'vs/base/common/uri';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { toResource, SideBySideEditorInput, IWorkbenchEditorConfiguration, SideBySideEditor as SideBySideEditorChoice } from 'vs/workbench/common/editor';
import { ITextFileService, ModelState } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationEvent, FileOperation, IFileService, FileChangeType, FileChangesEvent, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { distinct, coalesce } from 'vs/base/common/arrays';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ResourceMap } from 'vs/base/common/map';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { timeout, RunOnceWorker } from 'vs/base/common/async';
import { withNullAsUndefined } from 'vs/base/common/types';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { isEqualOrParent, joinPath } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';

export class FileEditorTracker extends Disposable implements IWorkbenchContribution {

	private readonly activeOutOfWorkspaceWatchers = new ResourceMap<IDisposable>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IHostService private readonly hostService: IHostService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
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

		// Ensure dirty text file and untitled models are always opened as editors
		this._register(this.textFileService.files.onDidChangeDirty(m => this.ensureDirtyFilesAreOpenedWorker.work(m.resource)));
		this._register(this.textFileService.files.onDidSaveError(m => this.ensureDirtyFilesAreOpenedWorker.work(m.resource)));
		this._register(this.textFileService.untitled.onDidChangeDirty(r => this.ensureDirtyFilesAreOpenedWorker.work(r)));

		// Out of workspace file watchers
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.onDidVisibleEditorsChange()));

		// Update visible editors when focus is gained
		this._register(this.hostService.onDidChangeFocus(e => this.onWindowFocusChange(e)));

		// Configuration
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IWorkbenchEditorConfiguration>())));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	//#region Handle deletes and moves in opened editors

	// Note: there is some duplication with the other file event handler below. Since we cannot always rely on the disk events
	// carrying all necessary data in all environments, we also use the file operation events to make sure operations are handled.
	// In any case there is no guarantee if the local event is fired first or the disk one. Thus, code must handle the case
	// that the event ordering is random as well as might not carry all information needed.
	private onFileOperation(e: FileOperationEvent): void {

		// Handle moves specially when file is opened
		if (e.isOperation(FileOperation.MOVE)) {
			this.handleMovedFileInOpenedFileEditors(e.resource, e.target.resource);
		}

		// Handle deletes
		if (e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.MOVE)) {
			this.handleDeletes(e.resource, false, e.target ? e.target.resource : undefined);
		}
	}

	private handleMovedFileInOpenedFileEditors(oldResource: URI, newResource: URI): void {
		this.editorGroupService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (editor instanceof FileEditorInput) {

					// Update Editor if file (or any parent of the input) got renamed or moved
					const resource = editor.getResource();
					if (isEqualOrParent(resource, oldResource)) {
						let reopenFileResource: URI;
						if (oldResource.toString() === resource.toString()) {
							reopenFileResource = newResource; // file got moved
						} else {
							const ignoreCase = !this.fileService.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive);
							const index = this.getIndexOfPath(resource.path, oldResource.path, ignoreCase);
							reopenFileResource = joinPath(newResource, resource.path.substr(index + oldResource.path.length + 1)); // parent folder got moved
						}

						let encoding: string | undefined = undefined;
						const model = this.textFileService.files.get(resource);
						if (model) {
							encoding = model.getEncoding();
						}

						this.editorService.replaceEditors([{
							editor: { resource },
							replacement: {
								resource: reopenFileResource,
								encoding,
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
			if (editor?.input && editor.group === group) {
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

	//#endregion

	//#region File Changes: Close editors of deleted files unless configured otherwise

	private closeOnFileDelete: boolean = false;

	private onConfigurationUpdated(configuration: IWorkbenchEditorConfiguration): void {
		if (typeof configuration.workbench?.editor?.closeOnFileDelete === 'boolean') {
			this.closeOnFileDelete = configuration.workbench.editor.closeOnFileDelete;
		} else {
			this.closeOnFileDelete = false; // default
		}
	}

	private onFileChanges(e: FileChangesEvent): void {
		if (e.gotDeleted()) {
			this.handleDeletes(e, true);
		}
	}

	private handleDeletes(arg1: URI | FileChangesEvent, isExternal: boolean, movedTo?: URI): void {
		const nonDirtyFileEditors = this.getNonDirtyFileEditors();
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
				if (movedTo && isEqualOrParent(resource, movedTo)) {
					return;
				}

				let matches = false;
				if (arg1 instanceof FileChangesEvent) {
					matches = arg1.contains(resource, FileChangeType.DELETED);
				} else {
					matches = isEqualOrParent(resource, arg1);
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

	private getNonDirtyFileEditors(): FileEditorInput[] {
		const editors: FileEditorInput[] = [];

		this.editorService.editors.forEach(editor => {
			if (editor instanceof FileEditorInput) {
				if (!editor.isDirty()) {
					editors.push(editor);
				}
			} else if (editor instanceof SideBySideEditorInput) {
				const master = editor.master;
				const details = editor.details;

				if (master instanceof FileEditorInput) {
					if (!master.isDirty()) {
						editors.push(master);
					}
				}

				if (details instanceof FileEditorInput) {
					if (!details.isDirty()) {
						editors.push(details);
					}
				}
			}
		});

		return editors;
	}

	//#endregion

	//#region Text File: Ensure every dirty text and untitled file is opened in an editor

	private readonly ensureDirtyFilesAreOpenedWorker = this._register(new RunOnceWorker<URI>(units => this.ensureDirtyFilesAreOpened(units), 250));

	private ensureDirtyFilesAreOpened(resources: URI[]): void {
		this.doEnsureDirtyFilesAreOpened(distinct(resources.filter(resource => {
			if (!this.textFileService.isDirty(resource)) {
				return false; // resource must be dirty
			}

			const model = this.textFileService.files.get(resource);
			if (model?.hasState(ModelState.PENDING_SAVE)) {
				return false; // resource must not be pending to save
			}

			if (this.editorService.isOpen(this.editorService.createInput({ resource, forceFile: resource.scheme !== Schemas.untitled, forceUntitled: resource.scheme === Schemas.untitled }))) {
				return false; // model must not be opened already as file
			}

			return true;
		}), resource => resource.toString()));
	}

	private doEnsureDirtyFilesAreOpened(resources: URI[]): void {
		if (!resources.length) {
			return;
		}

		this.editorService.openEditors(resources.map(resource => ({
			resource,
			options: { inactive: true, pinned: true, preserveFocus: true }
		})));
	}

	//#endregion

	//#region Visible Editors Change: Install file watchers for out of workspace resources that became visible

	private onDidVisibleEditorsChange(): void {
		const visibleOutOfWorkspaceResources = new ResourceMap<URI>();

		for (const editor of this.editorService.visibleEditors) {
			const resources = distinct(coalesce([
				toResource(editor, { supportSideBySide: SideBySideEditorChoice.MASTER }),
				toResource(editor, { supportSideBySide: SideBySideEditorChoice.DETAILS })
			]), resource => resource.toString());

			for (const resource of resources) {
				if (this.fileService.canHandleResource(resource) && !this.contextService.isInsideWorkspace(resource)) {
					visibleOutOfWorkspaceResources.set(resource, resource);
				}
			}
		}

		// Handle no longer visible out of workspace resources
		this.activeOutOfWorkspaceWatchers.keys().forEach(resource => {
			if (!visibleOutOfWorkspaceResources.get(resource)) {
				dispose(this.activeOutOfWorkspaceWatchers.get(resource));
				this.activeOutOfWorkspaceWatchers.delete(resource);
			}
		});

		// Handle newly visible out of workspace resources
		visibleOutOfWorkspaceResources.forEach(resource => {
			if (!this.activeOutOfWorkspaceWatchers.get(resource)) {
				const disposable = this.fileService.watch(resource);
				this.activeOutOfWorkspaceWatchers.set(resource, disposable);
			}
		});
	}

	//#endregion

	//#region Window Focus Change: Update visible code editors when focus is gained

	private onWindowFocusChange(focused: boolean): void {
		if (focused) {
			// the window got focus and we use this as a hint that files might have been changed outside
			// of this window. since file events can be unreliable, we queue a load for models that
			// are visible in any editor. since this is a fast operation in the case nothing has changed,
			// we tolerate the additional work.
			distinct(
				coalesce(this.codeEditorService.listCodeEditors()
					.map(codeEditor => {
						const resource = codeEditor.getModel()?.uri;
						if (!resource) {
							return undefined;
						}

						const model = this.textFileService.files.get(resource);
						if (!model) {
							return undefined;
						}

						if (model.isDirty()) {
							return undefined;
						}

						return model;
					})),
				model => model.resource.toString()
			).forEach(model => model.load());
		}
	}

	//#endregion

	dispose(): void {
		super.dispose();

		// Dispose remaining watchers if any
		this.activeOutOfWorkspaceWatchers.forEach(disposable => dispose(disposable));
		this.activeOutOfWorkspaceWatchers.clear();
	}
}
