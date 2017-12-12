/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDraggedResource, IDraggedEditor, extractResources } from 'vs/workbench/browser/editor';
import { WORKSPACE_EXTENSION, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { extname } from 'vs/base/common/paths';
import { IFileService } from 'vs/platform/files/common/files';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import URI from 'vs/base/common/uri';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { BACKUP_FILE_RESOLVE_OPTIONS, IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { TPromise } from 'vs/base/common/winjs.base';
import { Schemas } from 'vs/base/common/network';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError } from 'vs/base/common/errors';

/**
 * Shared function across some editor components to handle drag & drop of external resources. E.g. of folders and workspace files
 * to open them in the window instead of the editor or to handle dirty editors being dropped between instances of Code.
 */
export class EditorAreaDropHandler {

	constructor(
		@IFileService private fileService: IFileService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IWorkspacesService private workspacesService: IWorkspacesService,
		@ITextFileService private textFileService: ITextFileService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@IEditorGroupService private groupService: IEditorGroupService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
	) {
	}

	public handleDrop(event: DragEvent, afterDrop: () => void, targetPosition: Position, targetIndex?: number): void {
		const resources = extractResources(event).filter(r => r.resource.scheme === Schemas.file || r.resource.scheme === Schemas.untitled);
		if (!resources.length) {
			return;
		}

		return this.doHandleDrop(resources).then(isWorkspaceOpening => {
			if (isWorkspaceOpening) {
				return void 0; // return early if the drop operation resulted in this window changing to a workspace
			}

			// Add external ones to recently open list unless dropped resource is a workspace
			const externalResources = resources.filter(d => d.isExternal).map(d => d.resource);
			if (externalResources.length) {
				this.windowsService.addRecentlyOpened(externalResources.map(resource => resource.fsPath));
			}

			// Open in Editor
			return this.windowService.focusWindow()
				.then(() => this.editorService.openEditors(resources.map(r => {
					return {
						input: {
							resource: r.resource,
							options: {
								pinned: true,
								index: targetIndex,
								viewState: (r as IDraggedEditor).viewState
							}
						},
						position: targetPosition
					};
				}))).then(() => {

					// Finish with provided function
					afterDrop();
				});
		}).done(null, onUnexpectedError);
	}

	private doHandleDrop(resources: (IDraggedResource | IDraggedEditor)[]): TPromise<boolean> {

		// Check for dirty editor being dropped
		if (resources.length === 1 && !resources[0].isExternal && (resources[0] as IDraggedEditor).backupResource) {
			return this.handleDirtyEditorDrop(resources[0]);
		}

		// Check for workspace file being dropped
		if (resources.some(r => r.isExternal)) {
			return this.handleWorkspaceFileDrop(resources);
		}

		return TPromise.as(false);
	}

	private handleDirtyEditorDrop(droppedDirtyEditor: IDraggedEditor): TPromise<boolean> {

		// Untitled: always ensure that we open a new untitled for each file we drop
		if (droppedDirtyEditor.resource.scheme === Schemas.untitled) {
			droppedDirtyEditor.resource = this.untitledEditorService.createOrGet().getResource();
		}

		// Return early if the resource is already dirty in target or opened already
		if (this.textFileService.isDirty(droppedDirtyEditor.resource) || this.groupService.getStacksModel().isOpen(droppedDirtyEditor.resource)) {
			return TPromise.as(false);
		}

		// Resolve the contents of the dropped dirty resource from source
		return this.textFileService.resolveTextContent(droppedDirtyEditor.backupResource, BACKUP_FILE_RESOLVE_OPTIONS).then(content => {

			// Set the contents of to the resource to the target
			return this.backupFileService.backupResource(droppedDirtyEditor.resource, this.backupFileService.parseBackupContent(content.value));
		}).then(() => false, () => false /* ignore any error */);
	}

	private handleWorkspaceFileDrop(resources: (IDraggedResource | IDraggedEditor)[]): TPromise<boolean> {
		const externalResources = resources.filter(d => d.isExternal).map(d => d.resource);

		const externalWorkspaceResources: { workspaces: URI[], folders: URI[] } = {
			workspaces: [],
			folders: []
		};

		return TPromise.join(externalResources.map(resource => {

			// Check for Workspace
			if (extname(resource.fsPath) === `.${WORKSPACE_EXTENSION}`) {
				externalWorkspaceResources.workspaces.push(resource);

				return void 0;
			}

			// Check for Folder
			return this.fileService.resolveFile(resource).then(stat => {
				if (stat.isDirectory) {
					externalWorkspaceResources.folders.push(stat.resource);
				}
			}, error => void 0);
		})).then(_ => {
			const { workspaces, folders } = externalWorkspaceResources;

			// Return early if no external resource is a folder or workspace
			if (workspaces.length === 0 && folders.length === 0) {
				return false;
			}

			// Pass focus to window
			this.windowService.focusWindow();

			let workspacesToOpen: TPromise<string[]>;

			// Open in separate windows if we drop workspaces or just one folder
			if (workspaces.length > 0 || folders.length === 1) {
				workspacesToOpen = TPromise.as([...workspaces, ...folders].map(resources => resources.fsPath));
			}

			// Multiple folders: Create new workspace with folders and open
			else if (folders.length > 1) {
				workspacesToOpen = this.workspacesService.createWorkspace(folders.map(folder => ({ uri: folder }))).then(workspace => [workspace.configPath]);
			}

			// Open
			workspacesToOpen.then(workspaces => {
				this.windowsService.openWindow(workspaces, { forceReuseWindow: true });
			});

			return true;
		});
	}
}