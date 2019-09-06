/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasWorkspaceFileExtension, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { normalize } from 'vs/base/common/path';
import { basename } from 'vs/base/common/resources';
import { IFileService } from 'vs/platform/files/common/files';
import { IWindowService, IURIToOpen } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Schemas } from 'vs/base/common/network';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { DefaultEndOfLine } from 'vs/editor/common/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { DataTransfers } from 'vs/base/browser/dnd';
import { DragMouseEvent } from 'vs/base/browser/mouseEvent';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { MIME_BINARY } from 'vs/base/common/mime';
import { isWindows, isLinux } from 'vs/base/common/platform';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorIdentifier, GroupIdentifier } from 'vs/workbench/common/editor';
import { IEditorService, IResourceEditor } from 'vs/workbench/services/editor/common/editorService';
import { Disposable } from 'vs/base/common/lifecycle';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IRecentFile } from 'vs/platform/history/common/history';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export interface IDraggedResource {
	resource: URI;
	isExternal: boolean;
}

export class DraggedEditorIdentifier {
	constructor(private _identifier: IEditorIdentifier) { }

	get identifier(): IEditorIdentifier {
		return this._identifier;
	}
}

export class DraggedEditorGroupIdentifier {
	constructor(private _identifier: GroupIdentifier) { }

	get identifier(): GroupIdentifier {
		return this._identifier;
	}
}

export interface IDraggedEditor extends IDraggedResource {
	backupResource?: URI;
	viewState?: IEditorViewState;
}

export interface ISerializedDraggedEditor {
	resource: string;
	backupResource?: string;
	viewState: IEditorViewState | null;
}

export const CodeDataTransfers = {
	EDITORS: 'CodeEditors',
	FILES: 'CodeFiles'
};

export function extractResources(e: DragEvent, externalOnly?: boolean): Array<IDraggedResource | IDraggedEditor> {
	const resources: Array<IDraggedResource | IDraggedEditor> = [];
	if (e.dataTransfer && e.dataTransfer.types.length > 0) {

		// Check for window-to-window DND
		if (!externalOnly) {

			// Data Transfer: Code Editors
			const rawEditorsData = e.dataTransfer.getData(CodeDataTransfers.EDITORS);
			if (rawEditorsData) {
				try {
					const draggedEditors: ISerializedDraggedEditor[] = JSON.parse(rawEditorsData);
					draggedEditors.forEach(draggedEditor => {
						resources.push({
							resource: URI.parse(draggedEditor.resource),
							backupResource: draggedEditor.backupResource ? URI.parse(draggedEditor.backupResource) : undefined,
							viewState: withNullAsUndefined(draggedEditor.viewState),
							isExternal: false
						});
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
				const file = e.dataTransfer.files[i];
				if (file && file.path /* Electron only */ && !resources.some(r => r.resource.fsPath === file.path) /* prevent duplicates */) {
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
				const codeFiles: string[] = JSON.parse(rawCodeFiles);
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
		@IFileService private readonly fileService: IFileService,
		@IWindowService private readonly windowService: IWindowService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService
	) {
	}

	async handleDrop(event: DragEvent, resolveTargetGroup: () => IEditorGroup | undefined, afterDrop: (targetGroup: IEditorGroup | undefined) => void, targetIndex?: number): Promise<void> {
		const untitledOrFileResources = extractResources(event).filter(r => this.fileService.canHandleResource(r.resource) || r.resource.scheme === Schemas.untitled);
		if (!untitledOrFileResources.length) {
			return;
		}

		// Make the window active to handle the drop properly within
		await this.windowService.focusWindow();

		// Check for special things being dropped
		const isWorkspaceOpening = await this.doHandleDrop(untitledOrFileResources);

		if (isWorkspaceOpening) {
			return; // return early if the drop operation resulted in this window changing to a workspace
		}

		// Add external ones to recently open list unless dropped resource is a workspace
		const recents: IRecentFile[] = untitledOrFileResources.filter(d => d.isExternal && d.resource.scheme === Schemas.file).map(d => ({ fileUri: d.resource }));
		if (recents.length) {
			this.windowService.addRecentlyOpened(recents);
		}

		const editors: IResourceEditor[] = untitledOrFileResources.map(untitledOrFileResource => ({
			resource: untitledOrFileResource.resource,
			options: {
				pinned: true,
				index: targetIndex,
				viewState: (untitledOrFileResource as IDraggedEditor).viewState
			}
		}));

		// Open in Editor
		const targetGroup = resolveTargetGroup();
		await this.editorService.openEditors(editors, targetGroup);

		// Finish with provided function
		afterDrop(targetGroup);
	}

	private async doHandleDrop(untitledOrFileResources: Array<IDraggedResource | IDraggedEditor>): Promise<boolean> {

		// Check for dirty editors being dropped
		const resourcesWithBackups: IDraggedEditor[] = untitledOrFileResources.filter(resource => !resource.isExternal && !!(resource as IDraggedEditor).backupResource);
		if (resourcesWithBackups.length > 0) {
			await Promise.all(resourcesWithBackups.map(resourceWithBackup => this.handleDirtyEditorDrop(resourceWithBackup)));
			return false;
		}

		// Check for workspace file being dropped if we are allowed to do so
		if (this.options.allowWorkspaceOpen) {
			const externalFileOnDiskResources = untitledOrFileResources.filter(d => d.isExternal && d.resource.scheme === Schemas.file).map(d => d.resource);
			if (externalFileOnDiskResources.length > 0) {
				return this.handleWorkspaceFileDrop(externalFileOnDiskResources);
			}
		}

		return false;
	}

	private async handleDirtyEditorDrop(droppedDirtyEditor: IDraggedEditor): Promise<boolean> {

		// Untitled: always ensure that we open a new untitled for each file we drop
		if (droppedDirtyEditor.resource.scheme === Schemas.untitled) {
			droppedDirtyEditor.resource = this.untitledEditorService.createOrGet().getResource();
		}

		// Return early if the resource is already dirty in target or opened already
		if (this.textFileService.isDirty(droppedDirtyEditor.resource) || this.editorService.isOpen({ resource: droppedDirtyEditor.resource })) {
			return false;
		}

		// Resolve the contents of the dropped dirty resource from source
		try {
			const content = await this.backupFileService.resolveBackupContent((droppedDirtyEditor.backupResource!));
			await this.backupFileService.backupResource(droppedDirtyEditor.resource, content.value.create(this.getDefaultEOL()).createSnapshot(true));
		} catch (e) {
			// Ignore error
		}

		return false;
	}

	private getDefaultEOL(): DefaultEndOfLine {
		const eol = this.configurationService.getValue('files.eol');
		if (eol === '\r\n') {
			return DefaultEndOfLine.CRLF;
		}

		return DefaultEndOfLine.LF;
	}

	private async handleWorkspaceFileDrop(fileOnDiskResources: URI[]): Promise<boolean> {
		const urisToOpen: IURIToOpen[] = [];
		const folderURIs: IWorkspaceFolderCreationData[] = [];

		await Promise.all(fileOnDiskResources.map(async fileOnDiskResource => {

			// Check for Workspace
			if (hasWorkspaceFileExtension(fileOnDiskResource)) {
				urisToOpen.push({ workspaceUri: fileOnDiskResource });

				return;
			}

			// Check for Folder
			try {
				const stat = await this.fileService.resolve(fileOnDiskResource);
				if (stat.isDirectory) {
					urisToOpen.push({ folderUri: stat.resource });
					folderURIs.push({ uri: stat.resource });
				}
			} catch (error) {
				// Ignore error
			}
		}));

		// Return early if no external resource is a folder or workspace
		if (urisToOpen.length === 0) {
			return false;
		}

		// Pass focus to window
		this.windowService.focusWindow();

		// Open in separate windows if we drop workspaces or just one folder
		if (urisToOpen.length > folderURIs.length || folderURIs.length === 1) {
			await this.windowService.openWindow(urisToOpen, { forceReuseWindow: true });
		}

		// folders.length > 1: Multiple folders: Create new workspace with folders and open
		else {
			await this.workspaceEditingService.createAndEnterWorkspace(folderURIs);
		}

		return true;
	}
}

export function fillResourceDataTransfers(accessor: ServicesAccessor, resources: (URI | { resource: URI, isDirectory: boolean })[], event: DragMouseEvent | DragEvent): void {
	if (resources.length === 0 || !event.dataTransfer) {
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
	event.dataTransfer.setData(DataTransfers.TEXT, sources.map(source => source.resource.scheme === Schemas.file ? normalize(normalizeDriveLetter(source.resource.fsPath)) : source.resource.toString()).join(lineDelimiter));

	const envService = accessor.get(IWorkbenchEnvironmentService);
	if (!(isLinux && envService.configuration.remoteAuthority)) {
		// Download URL: enables support to drag a tab as file to desktop (only single file supported)
		// Not supported on linux remote due to chrome limitation https://github.com/microsoft/vscode-remote-release/issues/849
		event.dataTransfer.setData(DataTransfers.DOWNLOAD_URL, [MIME_BINARY, basename(firstSource.resource), firstSource.resource.toString()].join(':'));
	}

	// Resource URLs: allows to drop multiple resources to a target in VS Code (not directories)
	const files = sources.filter(s => !s.isDirectory);
	if (files.length) {
		event.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(files.map(f => f.resource.toString())));
	}

	// Editors: enables cross window DND of tabs into the editor area
	const textFileService = accessor.get(ITextFileService);
	const backupFileService = accessor.get(IBackupFileService);
	const editorService = accessor.get(IEditorService);

	const draggedEditors: ISerializedDraggedEditor[] = [];
	files.forEach(file => {

		// Try to find editor view state from the visible editors that match given resource
		let viewState: IEditorViewState | null = null;
		const textEditorWidgets = editorService.visibleTextEditorWidgets;
		for (const textEditorWidget of textEditorWidgets) {
			if (isCodeEditor(textEditorWidget)) {
				const model = textEditorWidget.getModel();
				if (model && model.uri && model.uri.toString() === file.resource.toString()) {
					viewState = textEditorWidget.saveViewState();
					break;
				}
			}
		}

		// Add as dragged editor
		draggedEditors.push({
			resource: file.resource.toString(),
			backupResource: textFileService.isDirty(file.resource) ? backupFileService.toBackupResource(file.resource).toString() : undefined,
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

	private data?: T[];
	private proto?: T;

	private constructor() {
		// protect against external instantiation
	}

	static getInstance<T>(): LocalSelectionTransfer<T> {
		return LocalSelectionTransfer.INSTANCE as LocalSelectionTransfer<T>;
	}

	hasData(proto: T): boolean {
		return proto && proto === this.proto;
	}

	clearData(proto: T): void {
		if (this.hasData(proto)) {
			this.proto = undefined;
			this.data = undefined;
		}
	}

	getData(proto: T): T[] | undefined {
		if (this.hasData(proto)) {
			return this.data;
		}

		return undefined;
	}

	setData(data: T[], proto: T): void {
		if (proto) {
			this.data = data;
			this.proto = proto;
		}
	}
}

export interface IDragAndDropObserverCallbacks {
	onDragEnter: (e: DragEvent) => void;
	onDragLeave: (e: DragEvent) => void;
	onDrop: (e: DragEvent) => void;
	onDragEnd: (e: DragEvent) => void;

	onDragOver?: (e: DragEvent) => void;
}

export class DragAndDropObserver extends Disposable {

	// A helper to fix issues with repeated DRAG_ENTER / DRAG_LEAVE
	// calls see https://github.com/Microsoft/vscode/issues/14470
	// when the element has child elements where the events are fired
	// repeadedly.
	private counter: number = 0;

	constructor(private element: HTMLElement, private callbacks: IDragAndDropObserverCallbacks) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(addDisposableListener(this.element, EventType.DRAG_ENTER, (e: DragEvent) => {
			this.counter++;

			this.callbacks.onDragEnter(e);
		}));

		this._register(addDisposableListener(this.element, EventType.DRAG_OVER, (e: DragEvent) => {
			e.preventDefault(); // needed so that the drop event fires (https://stackoverflow.com/questions/21339924/drop-event-not-firing-in-chrome)

			if (this.callbacks.onDragOver) {
				this.callbacks.onDragOver(e);
			}
		}));

		this._register(addDisposableListener(this.element, EventType.DRAG_LEAVE, (e: DragEvent) => {
			this.counter--;

			if (this.counter === 0) {
				this.callbacks.onDragLeave(e);
			}
		}));

		this._register(addDisposableListener(this.element, EventType.DRAG_END, (e: DragEvent) => {
			this.counter = 0;
			this.callbacks.onDragEnd(e);
		}));

		this._register(addDisposableListener(this.element, EventType.DROP, (e: DragEvent) => {
			this.counter = 0;
			this.callbacks.onDrop(e);
		}));
	}
}
