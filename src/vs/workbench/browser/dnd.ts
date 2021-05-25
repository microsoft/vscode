/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { hasWorkspaceFileExtension, IWorkspaceFolderCreationData, IRecentFile, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { normalize } from 'vs/base/common/path';
import { basename, isEqual } from 'vs/base/common/resources';
import { IFileService } from 'vs/platform/files/common/files';
import { IWindowOpenable } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { bufferToReadable, VSBuffer } from 'vs/base/common/buffer';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { DataTransfers, IDragAndDropData } from 'vs/base/browser/dnd';
import { DragMouseEvent } from 'vs/base/browser/mouseEvent';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { MIME_BINARY } from 'vs/base/common/mime';
import { isWindows } from 'vs/base/common/platform';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorIdentifier, GroupIdentifier, IEditorInputFactoryRegistry, EditorExtensions, isEditorIdentifier } from 'vs/workbench/common/editor';
import { IEditorService, IResourceEditorInputType } from 'vs/workbench/services/editor/common/editorService';
import { Disposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspaces/common/workspaceEditing';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { Emitter } from 'vs/base/common/event';
import { NO_TYPE_ID } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { coalesce } from 'vs/base/common/arrays';
import { parse, stringify } from 'vs/base/common/marshalling';

export class DraggedEditorIdentifier {

	constructor(readonly identifier: IEditorIdentifier) { }
}

export class DraggedEditorGroupIdentifier {

	constructor(readonly identifier: GroupIdentifier) { }
}

export const CodeDataTransfers = {
	EDITORS: 'CodeEditors',
	FILES: 'CodeFiles'
};

interface IDraggedResource {
	resource: URI;
	isExternal?: boolean;
}

interface IDraggedEditor extends IResourceEditorInput {
	contents?: string;
	isExternal?: boolean;
}

export function extractResourceDropTransfers(e: DragEvent, externalOnly?: boolean): Array<IDraggedResource | IDraggedEditor> {
	const resources: Array<IDraggedResource | IDraggedEditor> = [];
	if (e.dataTransfer && e.dataTransfer.types.length > 0) {

		// Check for window-to-window DND
		if (!externalOnly) {

			// Data Transfer: Code Editors
			const rawEditorsData = e.dataTransfer.getData(CodeDataTransfers.EDITORS);
			if (rawEditorsData) {
				try {
					resources.push(...parse(rawEditorsData));
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
				if (file?.path /* Electron only */ && !resources.some(resource => resource.resource.fsPath === file.path) /* prevent duplicates */) {
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
					if (!resources.some(resource => resource.resource.fsPath === codeFile) /* prevent duplicates */) {
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
	 * Whether to open the actual workspace when a workspace configuration file is dropped
	 * or whether to open the configuration file within the editor as normal file.
	 */
	readonly allowWorkspaceOpen: boolean;
}

/**
 * Shared function across some components to handle drag & drop of resources. E.g. of folders and workspace files
 * to open them in the window instead of the editor or to handle dirty editors being dropped between instances of Code.
 */
export class ResourcesDropHandler {

	constructor(
		private readonly options: IResourcesDropHandlerOptions,
		@IFileService private readonly fileService: IFileService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IHostService private readonly hostService: IHostService
	) {
	}

	async handleDrop(event: DragEvent, resolveTargetGroup: () => IEditorGroup | undefined, afterDrop: (targetGroup: IEditorGroup | undefined) => void, targetIndex?: number): Promise<void> {
		const untitledOrFileResources = extractResourceDropTransfers(event).filter(resource => this.fileService.canHandleResource(resource.resource) || resource.resource.scheme === Schemas.untitled);
		if (!untitledOrFileResources.length) {
			return;
		}

		// Make the window active to handle the drop properly within
		await this.hostService.focus();

		// Check for special things being dropped
		const isWorkspaceOpening = await this.doHandleDrop(untitledOrFileResources);
		if (isWorkspaceOpening) {
			return; // return early if the drop operation resulted in this window changing to a workspace
		}

		// Add external ones to recently open list unless dropped resource is a workspace
		const recentFiles: IRecentFile[] = untitledOrFileResources.filter(untitledOrFileResource => untitledOrFileResource.isExternal && untitledOrFileResource.resource.scheme === Schemas.file).map(file => ({ fileUri: file.resource }));
		if (recentFiles.length) {
			this.workspacesService.addRecentlyOpened(recentFiles);
		}

		const editors: IResourceEditorInputType[] = untitledOrFileResources.map(untitledOrFileResource => ({
			resource: untitledOrFileResource.resource,
			encoding: (untitledOrFileResource as IDraggedEditor).encoding,
			mode: (untitledOrFileResource as IDraggedEditor).mode,
			options: {
				...(untitledOrFileResource as IDraggedEditor).options,
				pinned: true,
				index: targetIndex
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
		const dirtyEditors: IDraggedEditor[] = untitledOrFileResources.filter(untitledOrFileResource => !untitledOrFileResource.isExternal && typeof (untitledOrFileResource as IDraggedEditor).contents === 'string');
		if (dirtyEditors.length > 0) {
			await Promise.all(dirtyEditors.map(dirtyEditor => this.handleDirtyEditorDrop(dirtyEditor)));
			return false;
		}

		// Check for workspace file being dropped if we are allowed to do so
		if (this.options.allowWorkspaceOpen) {
			const externalFileOnDiskResources = untitledOrFileResources.filter(untitledOrFileResource => untitledOrFileResource.isExternal && untitledOrFileResource.resource.scheme === Schemas.file).map(file => file.resource);
			if (externalFileOnDiskResources.length > 0) {
				return this.handleWorkspaceFileDrop(externalFileOnDiskResources);
			}
		}

		return false;
	}

	private async handleDirtyEditorDrop(droppedDirtyEditor: IDraggedEditor): Promise<boolean> {
		const fileEditorFactory = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).getFileEditorInputFactory();

		// Untitled: always ensure that we open a new untitled text editor for each file we drop
		if (droppedDirtyEditor.resource.scheme === Schemas.untitled) {
			const untitledTextEditorResource = this.editorService.createEditorInput({ mode: droppedDirtyEditor.mode, encoding: droppedDirtyEditor.encoding, forceUntitled: true }).resource;
			if (untitledTextEditorResource) {
				droppedDirtyEditor = {
					...droppedDirtyEditor,
					resource: untitledTextEditorResource
				};
			}
		}

		// File: ensure the file is not dirty or opened already
		else if (this.textFileService.isDirty(droppedDirtyEditor.resource) || this.editorService.isOpened({ resource: droppedDirtyEditor.resource, typeId: fileEditorFactory.typeId })) {
			return false;
		}

		// If the dropped editor is dirty with content we simply take that
		// content and turn it into a backup so that it loads the contents
		if (typeof droppedDirtyEditor.contents === 'string') {
			try {
				await this.workingCopyBackupService.backup({ resource: droppedDirtyEditor.resource, typeId: NO_TYPE_ID }, bufferToReadable(VSBuffer.fromString(droppedDirtyEditor.contents)));
			} catch (e) {
				// Ignore error
			}
		}

		return false;
	}

	private async handleWorkspaceFileDrop(fileOnDiskResources: URI[]): Promise<boolean> {
		const toOpen: IWindowOpenable[] = [];
		const folderURIs: IWorkspaceFolderCreationData[] = [];

		await Promise.all(fileOnDiskResources.map(async fileOnDiskResource => {

			// Check for Workspace
			if (hasWorkspaceFileExtension(fileOnDiskResource)) {
				toOpen.push({ workspaceUri: fileOnDiskResource });

				return;
			}

			// Check for Folder
			try {
				const stat = await this.fileService.resolve(fileOnDiskResource);
				if (stat.isDirectory) {
					toOpen.push({ folderUri: stat.resource });
					folderURIs.push({ uri: stat.resource });
				}
			} catch (error) {
				// Ignore error
			}
		}));

		// Return early if no external resource is a folder or workspace
		if (toOpen.length === 0) {
			return false;
		}

		// Pass focus to window
		this.hostService.focus();

		// Open in separate windows if we drop workspaces or just one folder
		if (toOpen.length > folderURIs.length || folderURIs.length === 1) {
			await this.hostService.openWindow(toOpen);
		}

		// folders.length > 1: Multiple folders: Create new workspace with folders and open
		else {
			await this.workspaceEditingService.createAndEnterWorkspace(folderURIs);
		}

		return true;
	}
}

interface IResourceStat {
	resource: URI;
	isDirectory?: boolean;
}

export function fillResourceDragTransfers(accessor: ServicesAccessor, resources: URI[], event: DragMouseEvent | DragEvent): void;
export function fillResourceDragTransfers(accessor: ServicesAccessor, resources: IResourceStat[], event: DragMouseEvent | DragEvent): void;
export function fillResourceDragTransfers(accessor: ServicesAccessor, editors: IEditorIdentifier[], event: DragMouseEvent | DragEvent): void;
export function fillResourceDragTransfers(accessor: ServicesAccessor, resourcesOrEditors: Array<URI | IResourceStat | IEditorIdentifier>, event: DragMouseEvent | DragEvent): void {
	if (resourcesOrEditors.length === 0 || !event.dataTransfer) {
		return;
	}

	// Extract resources from URIs or Editors
	const resources: IResourceStat[] = coalesce(resourcesOrEditors.map(resourceOrEditor => {
		if (URI.isUri(resourceOrEditor)) {
			return { resource: resourceOrEditor };
		}

		if (isEditorIdentifier(resourceOrEditor)) {
			if (resourceOrEditor.editor.resource) {
				return { resource: resourceOrEditor.editor.resource };
			}

			return undefined; // editor without resource
		}

		return resourceOrEditor;
	}));

	// Text: allows to paste into text-capable areas
	const lineDelimiter = isWindows ? '\r\n' : '\n';
	event.dataTransfer.setData(DataTransfers.TEXT, resources.map(({ resource }) => resource.scheme === Schemas.file ? normalize(normalizeDriveLetter(resource.fsPath)) : resource.toString()).join(lineDelimiter));

	// Download URL: enables support to drag a tab as file to desktop (only single file supported)
	const firstFile = resources.find(resource => !resource.isDirectory);
	if (firstFile) {
		event.dataTransfer.setData(DataTransfers.DOWNLOAD_URL, [MIME_BINARY, basename(firstFile.resource), FileAccess.asBrowserUri(firstFile.resource).toString()].join(':'));
	}

	// Resource URLs: allows to drop multiple resources to a target in VS Code (not directories)
	const files = resources.filter(resource => !resource.isDirectory);
	if (files.length) {
		event.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(files.map(({ resource }) => resource.toString())));
	}

	// Editors: enables cross window DND of editors
	// into the editor area while presering UI state
	const textFileService = accessor.get(ITextFileService);
	const editorService = accessor.get(IEditorService);

	const draggedEditors: IDraggedEditor[] = [];

	for (const resourceOrEditor of resourcesOrEditors) {

		// Extract resource editor from provided object or URI
		let editor: IResourceEditorInput | undefined = undefined;
		if (isEditorIdentifier(resourceOrEditor)) {
			editor = resourceOrEditor.editor.asResourceEditorInput(resourceOrEditor.groupId);
		} else {
			let resource: URI | undefined = undefined;
			if (URI.isUri(resourceOrEditor)) {
				resource = resourceOrEditor;
			} else if (!resourceOrEditor.isDirectory) {
				resource = resourceOrEditor.resource;
			}

			if (!resource) {
				continue;
			}

			// If we only got a resource to work with, try to resolve as many
			// editor properties as possible. This currently only works with
			// text editors and not custom editors.
			const model = resource.scheme === Schemas.untitled ? textFileService.untitled.get(resource) : textFileService.files.get(resource);

			editor = {
				resource,
				encoding: model?.getEncoding(),
				mode: model?.getMode(),
				options: {
					viewState: (() => {
						for (const textEditorControl of editorService.visibleTextEditorControls) {
							if (isCodeEditor(textEditorControl)) {
								const model = textEditorControl.getModel();
								if (isEqual(model?.uri, resource)) {
									return withNullAsUndefined(textEditorControl.saveViewState());
								}
							}
						}

						return undefined;
					})()
				}
			};
		}

		if (!editor) {
			continue; // skip over editors that cannot be transferred via dnd
		}

		// Add as dragged editor
		draggedEditors.push({
			...editor,
			contents: (() => {
				// TODO@bpasero this should not happen from here but from the asResourceEditorInput() method
				const model = editor.resource.scheme === Schemas.untitled ? textFileService.untitled.get(editor.resource) : textFileService.files.get(editor.resource);
				if (model?.isDirty()) {
					return model.textEditorModel.getValue();
				}

				return undefined;
			})()
		});
	}

	if (draggedEditors.length) {
		event.dataTransfer.setData(CodeDataTransfers.EDITORS, stringify(draggedEditors));
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
	readonly onDragEnter: (e: DragEvent) => void;
	readonly onDragLeave: (e: DragEvent) => void;
	readonly onDrop: (e: DragEvent) => void;
	readonly onDragEnd: (e: DragEvent) => void;

	readonly onDragOver?: (e: DragEvent) => void;
}

export class DragAndDropObserver extends Disposable {

	// A helper to fix issues with repeated DRAG_ENTER / DRAG_LEAVE
	// calls see https://github.com/microsoft/vscode/issues/14470
	// when the element has child elements where the events are fired
	// repeadedly.
	private counter: number = 0;

	constructor(private readonly element: HTMLElement, private readonly callbacks: IDragAndDropObserverCallbacks) {
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

export function containsDragType(event: DragEvent, ...dragTypesToFind: string[]): boolean {
	if (!event.dataTransfer) {
		return false;
	}

	const dragTypes = event.dataTransfer.types;
	const lowercaseDragTypes: string[] = [];
	for (let i = 0; i < dragTypes.length; i++) {
		lowercaseDragTypes.push(dragTypes[i].toLowerCase()); // somehow the types are lowercase
	}

	for (const dragType of dragTypesToFind) {
		if (lowercaseDragTypes.indexOf(dragType.toLowerCase()) >= 0) {
			return true;
		}
	}

	return false;
}

export type Before2D = {
	readonly verticallyBefore: boolean;
	readonly horizontallyBefore: boolean;
};

export interface ICompositeDragAndDrop {
	drop(data: IDragAndDropData, target: string | undefined, originalEvent: DragEvent, before?: Before2D): void;
	onDragOver(data: IDragAndDropData, target: string | undefined, originalEvent: DragEvent): boolean;
	onDragEnter(data: IDragAndDropData, target: string | undefined, originalEvent: DragEvent): boolean;
}

export interface ICompositeDragAndDropObserverCallbacks {
	onDragEnter?: (e: IDraggedCompositeData) => void;
	onDragLeave?: (e: IDraggedCompositeData) => void;
	onDrop?: (e: IDraggedCompositeData) => void;
	onDragOver?: (e: IDraggedCompositeData) => void;
	onDragStart?: (e: IDraggedCompositeData) => void;
	onDragEnd?: (e: IDraggedCompositeData) => void;
}

export class CompositeDragAndDropData implements IDragAndDropData {

	constructor(private type: 'view' | 'composite', private id: string) { }

	update(dataTransfer: DataTransfer): void {
		// no-op
	}

	getData(): {
		type: 'view' | 'composite';
		id: string;
	} {
		return { type: this.type, id: this.id };
	}
}

export interface IDraggedCompositeData {
	readonly eventData: DragEvent;
	readonly dragAndDropData: CompositeDragAndDropData;
}

export class DraggedCompositeIdentifier {

	constructor(private compositeId: string) { }

	get id(): string {
		return this.compositeId;
	}
}

export class DraggedViewIdentifier {

	constructor(private viewId: string) { }

	get id(): string {
		return this.viewId;
	}
}

export type ViewType = 'composite' | 'view';

export class CompositeDragAndDropObserver extends Disposable {

	private static instance: CompositeDragAndDropObserver | undefined;

	static get INSTANCE(): CompositeDragAndDropObserver {
		if (!CompositeDragAndDropObserver.instance) {
			CompositeDragAndDropObserver.instance = new CompositeDragAndDropObserver();
		}

		return CompositeDragAndDropObserver.instance;
	}

	private readonly transferData = LocalSelectionTransfer.getInstance<DraggedCompositeIdentifier | DraggedViewIdentifier>();

	private readonly onDragStart = this._register(new Emitter<IDraggedCompositeData>());
	private readonly onDragEnd = this._register(new Emitter<IDraggedCompositeData>());

	private constructor() {
		super();

		this._register(this.onDragEnd.event(e => {
			const id = e.dragAndDropData.getData().id;
			const type = e.dragAndDropData.getData().type;
			const data = this.readDragData(type);
			if (data?.getData().id === id) {
				this.transferData.clearData(type === 'view' ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
			}
		}));
	}

	private readDragData(type: ViewType): CompositeDragAndDropData | undefined {
		if (this.transferData.hasData(type === 'view' ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype)) {
			const data = this.transferData.getData(type === 'view' ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
			if (data && data[0]) {
				return new CompositeDragAndDropData(type, data[0].id);
			}
		}

		return undefined;
	}

	private writeDragData(id: string, type: ViewType): void {
		this.transferData.setData([type === 'view' ? new DraggedViewIdentifier(id) : new DraggedCompositeIdentifier(id)], type === 'view' ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
	}

	registerTarget(element: HTMLElement, callbacks: ICompositeDragAndDropObserverCallbacks): IDisposable {
		const disposableStore = new DisposableStore();
		disposableStore.add(new DragAndDropObserver(element, {
			onDragEnd: e => {
				// no-op
			},
			onDragEnter: e => {
				e.preventDefault();

				if (callbacks.onDragEnter) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (data) {
						callbacks.onDragEnter({ eventData: e, dragAndDropData: data! });
					}
				}
			},
			onDragLeave: e => {
				const data = this.readDragData('composite') || this.readDragData('view');
				if (callbacks.onDragLeave && data) {
					callbacks.onDragLeave({ eventData: e, dragAndDropData: data! });
				}
			},
			onDrop: e => {
				if (callbacks.onDrop) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					callbacks.onDrop({ eventData: e, dragAndDropData: data! });

					// Fire drag event in case drop handler destroys the dragged element
					this.onDragEnd.fire({ eventData: e, dragAndDropData: data! });
				}
			},
			onDragOver: e => {
				e.preventDefault();

				if (callbacks.onDragOver) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					callbacks.onDragOver({ eventData: e, dragAndDropData: data! });
				}
			}
		}));

		if (callbacks.onDragStart) {
			this.onDragStart.event(e => {
				callbacks.onDragStart!(e);
			}, this, disposableStore);
		}

		if (callbacks.onDragEnd) {
			this.onDragEnd.event(e => {
				callbacks.onDragEnd!(e);
			});
		}

		return this._register(disposableStore);
	}

	registerDraggable(element: HTMLElement, draggedItemProvider: () => { type: ViewType, id: string }, callbacks: ICompositeDragAndDropObserverCallbacks): IDisposable {
		element.draggable = true;

		const disposableStore = new DisposableStore();

		disposableStore.add(addDisposableListener(element, EventType.DRAG_START, e => {
			const { id, type } = draggedItemProvider();
			this.writeDragData(id, type);

			e.dataTransfer?.setDragImage(element, 0, 0);

			this.onDragStart.fire({ eventData: e, dragAndDropData: this.readDragData(type)! });
		}));

		disposableStore.add(new DragAndDropObserver(element, {
			onDragEnd: e => {
				const { type } = draggedItemProvider();
				const data = this.readDragData(type);
				if (!data) {
					return;
				}

				this.onDragEnd.fire({ eventData: e, dragAndDropData: data! });
			},
			onDragEnter: e => {
				if (callbacks.onDragEnter) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					if (data) {
						callbacks.onDragEnter({ eventData: e, dragAndDropData: data! });
					}
				}
			},
			onDragLeave: e => {
				const data = this.readDragData('composite') || this.readDragData('view');
				if (!data) {
					return;
				}

				if (callbacks.onDragLeave) {
					callbacks.onDragLeave({ eventData: e, dragAndDropData: data! });
				}
			},
			onDrop: e => {
				if (callbacks.onDrop) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					callbacks.onDrop({ eventData: e, dragAndDropData: data! });

					// Fire drag event in case drop handler destroys the dragged element
					this.onDragEnd.fire({ eventData: e, dragAndDropData: data! });
				}
			},
			onDragOver: e => {
				if (callbacks.onDragOver) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					callbacks.onDragOver({ eventData: e, dragAndDropData: data! });
				}
			}
		}));

		if (callbacks.onDragStart) {
			this.onDragStart.event(e => {
				callbacks.onDragStart!(e);
			}, this, disposableStore);
		}

		if (callbacks.onDragEnd) {
			this.onDragEnd.event(e => {
				callbacks.onDragEnd!(e);
			}, this, disposableStore);
		}

		return this._register(disposableStore);
	}
}

export function toggleDropEffect(dataTransfer: DataTransfer | null, dropEffect: 'none' | 'copy' | 'link' | 'move', shouldHaveIt: boolean) {
	if (!dataTransfer) {
		return;
	}

	dataTransfer.dropEffect = shouldHaveIt ? dropEffect : 'none';
}
