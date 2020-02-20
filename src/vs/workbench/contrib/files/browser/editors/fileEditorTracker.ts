/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { URI } from 'vs/base/common/uri';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { toResource, SideBySideEditor as SideBySideEditorChoice } from 'vs/workbench/common/editor';
import { ITextFileService, TextFileEditorModelState } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationEvent, FileOperation, IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { distinct, coalesce } from 'vs/base/common/arrays';
import { ResourceMap } from 'vs/base/common/map';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { RunOnceWorker } from 'vs/base/common/async';
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
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IHostService private readonly hostService: IHostService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update editors from operation changes
		this._register(this.fileService.onDidRunOperation(e => this.onDidRunFileOperation(e)));

		// Ensure dirty text file and untitled models are always opened as editors
		this._register(this.textFileService.files.onDidChangeDirty(model => this.ensureDirtyFilesAreOpenedWorker.work(model.resource)));
		this._register(this.textFileService.files.onDidSaveError(model => this.ensureDirtyFilesAreOpenedWorker.work(model.resource)));
		this._register(this.textFileService.untitled.onDidChangeDirty(model => this.ensureDirtyFilesAreOpenedWorker.work(model.resource)));

		// Out of workspace file watchers
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.onDidVisibleEditorsChange()));

		// Update visible editors when focus is gained
		this._register(this.hostService.onDidChangeFocus(e => this.onWindowFocusChange(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	//#region Handle deletes and moves in opened editors

	// Note: there is some duplication with the other file event handler below. Since we cannot always rely on the disk events
	// carrying all necessary data in all environments, we also use the file operation events to make sure operations are handled.
	// In any case there is no guarantee if the local event is fired first or the disk one. Thus, code must handle the case
	// that the event ordering is random as well as might not carry all information needed.
	private onDidRunFileOperation(e: FileOperationEvent): void {

		// Handle moves specially when file is opened
		if (e.isOperation(FileOperation.MOVE)) {
			this.handleMovedFileInOpenedFileEditors(e.resource, e.target.resource);
		}
	}

	private handleMovedFileInOpenedFileEditors(oldResource: URI, newResource: URI): void {
		this.editorGroupService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (editor instanceof FileEditorInput) {

					// Update Editor if file (or any parent of the input) got renamed or moved
					const resource = editor.resource;
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
				const editorResource = editor.input.resource;
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

	//#region Text File: Ensure every dirty text and untitled file is opened in an editor

	private readonly ensureDirtyFilesAreOpenedWorker = this._register(new RunOnceWorker<URI>(units => this.ensureDirtyTextFilesAreOpened(units), 250));

	private ensureDirtyTextFilesAreOpened(resources: URI[]): void {
		this.doEnsureDirtyFilesAreOpened(distinct(resources.filter(resource => {
			if (!this.textFileService.isDirty(resource)) {
				return false; // resource must be dirty
			}

			const model = this.textFileService.files.get(resource);
			if (model?.hasState(TextFileEditorModelState.PENDING_SAVE)) {
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

	//#region Window Focus Change: Update visible code editors when focus is gained that have a known text file model

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
						if (!model || model.isDirty() || !model.isResolved()) {
							return undefined;
						}

						return model;
					})),
				model => model.resource.toString()
			).forEach(model => this.textFileService.files.resolve(model.resource, { reload: { async: true } }));
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
