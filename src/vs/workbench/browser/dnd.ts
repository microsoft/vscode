/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { WORKSPACE_EXTENSION, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { extname, basename } from 'vs/base/common/paths';
import { IFileService } from 'vs/platform/files/common/files';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import URI from 'vs/base/common/uri';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { TPromise } from 'vs/base/common/winjs.base';
import { Schemas } from 'vs/base/common/network';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError } from 'vs/base/common/errors';
import { DefaultEndOfLine } from 'vs/editor/common/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { DataTransfers } from 'vs/base/browser/dnd';
import { DefaultDragAndDrop } from 'vs/base/parts/tree/browser/treeDefaults';
import { DragMouseEvent } from 'vs/base/browser/mouseEvent';
import { getPathLabel } from 'vs/base/common/labels';
import { MIME_BINARY } from 'vs/base/common/mime';
import { ITree, IDragAndDropData } from 'vs/base/parts/tree/browser/tree';
import { isWindows } from 'vs/base/common/platform';
import { coalesce } from 'vs/base/common/arrays';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { IEditorIdentifier } from 'vs/workbench/common/editor';
import { basenameOrAuthority } from 'vs/base/common/resources';

export interface IDraggedResource {
	resource: URI;
	isExternal: boolean;
}

export class DraggedEditorIdentifier {
	constructor(private _identifier: IEditorIdentifier) {
	}

	public get identifier(): IEditorIdentifier {
		return this._identifier;
	}
}

export interface IDraggedEditor extends IDraggedResource {
	backupResource?: URI;
	viewState?: IEditorViewState;
}

export interface ISerializedDraggedEditor {
	resource: string;
	backupResource: string;
	viewState: IEditorViewState;
}

export const CodeDataTransfers = {
	EDITORS: 'CodeEditors',
	FILES: 'CodeFiles'
};

export function extractResources(e: DragEvent, externalOnly?: boolean): (IDraggedResource | IDraggedEditor)[] {
	const resources: (IDraggedResource | IDraggedEditor)[] = [];
	if (e.dataTransfer.types.length > 0) {

		// Check for window-to-window DND
		if (!externalOnly) {

			// Data Transfer: Code Editors
			const rawEditorsData = e.dataTransfer.getData(CodeDataTransfers.EDITORS);
			if (rawEditorsData) {
				try {
					const draggedEditors = JSON.parse(rawEditorsData) as ISerializedDraggedEditor[];
					draggedEditors.forEach(draggedEditor => {
						resources.push({ resource: URI.parse(draggedEditor.resource), backupResource: draggedEditor.backupResource ? URI.parse(draggedEditor.backupResource) : void 0, viewState: draggedEditor.viewState, isExternal: false });
					});
				} catch (error) {
					// Invalid transfer
				}
			}

			// Data Transfer: Resources
			else {
				try {
					const rawResourcesData = e.dataTransfer.getData(DataTransfers.RESOURCES);
					if (rawResourcesData) {
						const uriStrArray: string[] = JSON.parse(rawResourcesData);
						resources.push(...uriStrArray.map(uriStr => ({ resource: URI.parse(uriStr), isExternal: false })));
					}
				} catch (error) {
					// Invalid transfer
				}
			}
		}

		// Check for native file transfer
		if (e.dataTransfer && e.dataTransfer.files) {
			for (let i = 0; i < e.dataTransfer.files.length; i++) {
				const file = e.dataTransfer.files[i] as { path: string };
				if (file && file.path && !resources.some(r => r.resource.fsPath === file.path) /* prevent duplicates */) {
					try {
						resources.push({ resource: URI.file(file.path), isExternal: true });
					} catch (error) {
						// Invalid URI
					}
				}
			}
		}

		// Check for CodeFiles transfer
		const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
		if (rawCodeFiles) {
			try {
				const codeFiles = JSON.parse(rawCodeFiles) as string[];
				codeFiles.forEach(codeFile => {
					if (!resources.some(r => r.resource.fsPath === codeFile) /* prevent duplicates */) {
						resources.push({ resource: URI.file(codeFile), isExternal: true });
					}
				});
			} catch (error) {
				// Invalid transfer
			}
		}
	}

	return resources;
}

export interface IResourcesDropHandlerOptions {

	/**
	 * Wether to open the actual workspace when a workspace configuration file is dropped
	 * or wether to open the configuration file within the editor as normal file.
	 */
	allowWorkspaceOpen: boolean;
}

/**
 * Shared function across some components to handle drag & drop of resources. E.g. of folders and workspace files
 * to open them in the window instead of the editor or to handle dirty editors being dropped between instances of Code.
 */
export class ResourcesDropHandler {

	constructor(
		private options: IResourcesDropHandlerOptions,
		@IFileService private fileService: IFileService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IWorkspacesService private workspacesService: IWorkspacesService,
		@ITextFileService private textFileService: ITextFileService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@IEditorGroupService private groupService: IEditorGroupService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
	}

	public handleDrop(event: DragEvent, afterDrop: () => void, targetPosition: Position, targetIndex?: number): void {
		const untitledOrFileResources = extractResources(event).filter(r => this.fileService.canHandleResource(r.resource) || r.resource.scheme === Schemas.untitled);
		if (!untitledOrFileResources.length) {
			return;
		}

		// Make the window active to handle the drop properly within
		return this.windowService.focusWindow().then(() => {

			// Check for special things being dropped
			return this.doHandleDrop(untitledOrFileResources).then(isWorkspaceOpening => {
				if (isWorkspaceOpening) {
					return void 0; // return early if the drop operation resulted in this window changing to a workspace
				}

				// Add external ones to recently open list unless dropped resource is a workspace
				const filesToAddToHistory = untitledOrFileResources.filter(d => d.isExternal && d.resource.scheme === Schemas.file).map(d => d.resource);
				if (filesToAddToHistory.length) {
					this.windowsService.addRecentlyOpened(filesToAddToHistory.map(resource => resource.fsPath));
				}

				// Open in Editor
				return this.editorService.openEditors(untitledOrFileResources.map(untitledOrFileResource => {
					return {
						input: {
							resource: untitledOrFileResource.resource,
							options: {
								pinned: true,
								index: targetIndex,
								viewState: (untitledOrFileResource as IDraggedEditor).viewState
							}
						},
						position: targetPosition
					};
				})).then(() => {

					// Finish with provided function
					afterDrop();
				});
			});
		}).done(null, onUnexpectedError);
	}

	private doHandleDrop(untitledOrFileResources: (IDraggedResource | IDraggedEditor)[]): TPromise<boolean> {

		// Check for dirty editors being dropped
		const resourcesWithBackups: IDraggedEditor[] = untitledOrFileResources.filter(resource => !resource.isExternal && !!(resource as IDraggedEditor).backupResource);
		if (resourcesWithBackups.length > 0) {
			return TPromise.join(resourcesWithBackups.map(resourceWithBackup => this.handleDirtyEditorDrop(resourceWithBackup))).then(() => false);
		}

		// Check for workspace file being dropped if we are allowed to do so
		if (this.options.allowWorkspaceOpen) {
			const externalFileOnDiskResources = untitledOrFileResources.filter(d => d.isExternal && d.resource.scheme === Schemas.file).map(d => d.resource);
			if (externalFileOnDiskResources.length > 0) {
				return this.handleWorkspaceFileDrop(externalFileOnDiskResources);
			}
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
		return this.backupFileService.resolveBackupContent(droppedDirtyEditor.backupResource).then(content => {

			// Set the contents of to the resource to the target
			return this.backupFileService.backupResource(droppedDirtyEditor.resource, content.create(this.getDefaultEOL()).createSnapshot(true));
		}).then(() => false, () => false /* ignore any error */);
	}

	private getDefaultEOL(): DefaultEndOfLine {
		const eol = this.configurationService.getValue('files.eol');
		if (eol === '\r\n') {
			return DefaultEndOfLine.CRLF;
		}

		return DefaultEndOfLine.LF;
	}

	private handleWorkspaceFileDrop(fileOnDiskResources: URI[]): TPromise<boolean> {
		const workspaceResources: { workspaces: URI[], folders: URI[] } = {
			workspaces: [],
			folders: []
		};

		return TPromise.join(fileOnDiskResources.map(fileOnDiskResource => {

			// Check for Workspace
			if (extname(fileOnDiskResource.fsPath) === `.${WORKSPACE_EXTENSION}`) {
				workspaceResources.workspaces.push(fileOnDiskResource);

				return void 0;
			}

			// Check for Folder
			return this.fileService.resolveFile(fileOnDiskResource).then(stat => {
				if (stat.isDirectory) {
					workspaceResources.folders.push(stat.resource);
				}
			}, error => void 0);
		})).then(_ => {
			const { workspaces, folders } = workspaceResources;

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

export class SimpleFileResourceDragAndDrop extends DefaultDragAndDrop {

	constructor(
		private toResource: (obj: any) => URI,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
	}

	public getDragURI(tree: ITree, obj: any): string {
		const resource = this.toResource(obj);
		if (resource) {
			return resource.toString();
		}

		return void 0;
	}

	public getDragLabel(tree: ITree, elements: any[]): string {
		if (elements.length > 1) {
			return String(elements.length);
		}

		const resource = this.toResource(elements[0]);
		if (resource) {
			return basenameOrAuthority(resource);
		}

		return void 0;
	}

	public onDragStart(tree: ITree, data: IDragAndDropData, originalEvent: DragMouseEvent): void {

		// Apply some datatransfer types to allow for dragging the element outside of the application
		const resources: URI[] = data.getData().map(source => this.toResource(source));
		if (resources) {
			this.instantiationService.invokeFunction(fillResourceDataTransfers, coalesce(resources), originalEvent);
		}
	}
}

export function fillResourceDataTransfers(accessor: ServicesAccessor, resources: (URI | { resource: URI, isDirectory: boolean })[], event: DragMouseEvent | DragEvent): void {
	if (resources.length === 0) {
		return;
	}

	const sources = resources.map(obj => {
		if (URI.isUri(obj)) {
			return { resource: obj, isDirectory: false /* assume resource is not a directory */ };
		}

		return obj;
	});

	const firstSource = sources[0];

	// Text: allows to paste into text-capable areas
	const lineDelimiter = isWindows ? '\r\n' : '\n';
	event.dataTransfer.setData(DataTransfers.TEXT, sources.map(source => source.resource.scheme === Schemas.file ? getPathLabel(source.resource) : source.resource.toString()).join(lineDelimiter));

	// Download URL: enables support to drag a tab as file to desktop (only single file supported)
	if (firstSource.resource.scheme === Schemas.file) {
		event.dataTransfer.setData(DataTransfers.DOWNLOAD_URL, [MIME_BINARY, basename(firstSource.resource.fsPath), firstSource.resource.toString()].join(':'));
	}

	// Resource URLs: allows to drop multiple resources to a target in VS Code (not directories)
	const files = sources.filter(s => !s.isDirectory);
	if (files.length) {
		event.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(files.map(f => f.resource.toString())));
	}

	// Editors: enables cross window DND of tabs into the editor area
	const textFileService = accessor.get(ITextFileService);
	const backupFileService = accessor.get(IBackupFileService);
	const editorService = accessor.get(IWorkbenchEditorService);

	const draggedEditors: ISerializedDraggedEditor[] = [];
	files.forEach(file => {

		// Try to find editor view state from the visible editors that match given resource
		let viewState: IEditorViewState;
		const editors = editorService.getVisibleEditors();
		for (let i = 0; i < editors.length; i++) {
			const editor = editors[i];
			const codeEditor = getCodeEditor(editor);
			if (codeEditor) {
				const model = codeEditor.getModel();
				if (model && model.uri && model.uri.toString() === file.resource.toString()) {
					viewState = codeEditor.saveViewState();
					break;
				}
			}
		}

		// Add as dragged editor
		draggedEditors.push({
			resource: file.resource.toString(),
			backupResource: textFileService.isDirty(file.resource) ? backupFileService.toBackupResource(file.resource).toString() : void 0,
			viewState
		});
	});

	if (draggedEditors.length) {
		event.dataTransfer.setData(CodeDataTransfers.EDITORS, JSON.stringify(draggedEditors));
	}
}

/**
 * A singleton to store transfer data during drag & drop operations that are only valid within the application.
 */
export class LocalSelectionTransfer<T> {

	private static readonly INSTANCE = new LocalSelectionTransfer();

	private data: T[];
	private proto: T;

	private constructor() {
		// protect against external instantiation
	}

	public static getInstance<T>(): LocalSelectionTransfer<T> {
		return LocalSelectionTransfer.INSTANCE as LocalSelectionTransfer<T>;
	}

	public hasData(proto: T): boolean {
		return proto && proto === this.proto;
	}

	public clearData(): void {
		this.proto = void 0;
		this.data = void 0;
	}

	public getData(proto: T): T[] {
		if (this.hasData(proto)) {
			return this.data;
		}

		return void 0;
	}

	public setData(data: T[], proto: T): void {
		if (proto) {
			this.data = data;
			this.proto = proto;
		}
	}
}
