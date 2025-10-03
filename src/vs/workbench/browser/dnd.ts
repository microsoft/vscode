/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers, IDragAndDropData } from '../../base/browser/dnd.js';
import { DragAndDropObserver, EventType, addDisposableListener, onDidRegisterWindow } from '../../base/browser/dom.js';
import { DragMouseEvent } from '../../base/browser/mouseEvent.js';
import { IListDragAndDrop } from '../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../base/browser/ui/list/listView.js';
import { ITreeDragOverReaction } from '../../base/browser/ui/tree/tree.js';
import { coalesce } from '../../base/common/arrays.js';
import { UriList, VSDataTransfer } from '../../base/common/dataTransfer.js';
import { Emitter, Event } from '../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, markAsSingleton } from '../../base/common/lifecycle.js';
import { stringify } from '../../base/common/marshalling.js';
import { Mimes } from '../../base/common/mime.js';
import { FileAccess, Schemas } from '../../base/common/network.js';
import { isWindows } from '../../base/common/platform.js';
import { basename, isEqual } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { CodeDataTransfers, Extensions, IDragAndDropContributionRegistry, IDraggedResourceEditorInput, IResourceStat, LocalSelectionTransfer, createDraggedEditorInputFromRawResourcesData, extractEditorsAndFilesDropData } from '../../platform/dnd/browser/dnd.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { extractSelection, withSelection } from '../../platform/opener/common/opener.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IWindowOpenable } from '../../platform/window/common/window.js';
import { IWorkspaceContextService, hasWorkspaceFileExtension, isTemporaryWorkspace } from '../../platform/workspace/common/workspace.js';
import { IWorkspaceFolderCreationData, IWorkspacesService } from '../../platform/workspaces/common/workspaces.js';
import { EditorResourceAccessor, GroupIdentifier, IEditorIdentifier, isEditorIdentifier, isResourceDiffEditorInput, isResourceMergeEditorInput, isResourceSideBySideEditorInput } from '../common/editor.js';
import { IEditorGroup } from '../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IHostService } from '../services/host/browser/host.js';
import { ITextFileService } from '../services/textfile/common/textfiles.js';
import { IWorkspaceEditingService } from '../services/workspaces/common/workspaceEditing.js';
import { IEditorOptions } from '../../platform/editor/common/editor.js';
import { mainWindow } from '../../base/browser/window.js';
import { BroadcastDataChannel } from '../../base/browser/broadcast.js';

//#region Editor / Resources DND

export class DraggedEditorIdentifier {

	constructor(readonly identifier: IEditorIdentifier) { }
}

export class DraggedEditorGroupIdentifier {

	constructor(readonly identifier: GroupIdentifier) { }
}

export async function extractTreeDropData(dataTransfer: VSDataTransfer): Promise<Array<IDraggedResourceEditorInput>> {
	const editors: IDraggedResourceEditorInput[] = [];
	const resourcesKey = Mimes.uriList.toLowerCase();

	// Data Transfer: Resources
	if (dataTransfer.has(resourcesKey)) {
		try {
			const asString = await dataTransfer.get(resourcesKey)?.asString();
			const rawResourcesData = JSON.stringify(UriList.parse(asString ?? ''));
			editors.push(...createDraggedEditorInputFromRawResourcesData(rawResourcesData));
		} catch (error) {
			// Invalid transfer
		}
	}

	return editors;
}

export interface IResourcesDropHandlerOptions {

	/**
	 * Whether we probe for the dropped resource to be a workspace
	 * (i.e. code-workspace file or even a folder), allowing to
	 * open it as workspace instead of opening as editor.
	 */
	readonly allowWorkspaceOpen: boolean;
}

/**
 * Shared function across some components to handle drag & drop of resources.
 * E.g. of folders and workspace files to open them in the window instead of
 * the editor or to handle dirty editors being dropped between instances of Code.
 */
export class ResourcesDropHandler {

	constructor(
		private readonly options: IResourcesDropHandlerOptions,
		@IFileService private readonly fileService: IFileService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
	}

	async handleDrop(event: DragEvent, targetWindow: Window, resolveTargetGroup?: () => IEditorGroup | undefined, afterDrop?: (targetGroup: IEditorGroup | undefined) => void, options?: IEditorOptions): Promise<void> {
		const editors = await this.instantiationService.invokeFunction(accessor => extractEditorsAndFilesDropData(accessor, event));
		if (!editors.length) {
			return;
		}

		// Make the window active to handle the drop properly within
		await this.hostService.focus(targetWindow);

		// Check for workspace file / folder being dropped if we are allowed to do so
		if (this.options.allowWorkspaceOpen) {
			const localFilesAllowedToOpenAsWorkspace = coalesce(editors.filter(editor => editor.allowWorkspaceOpen && editor.resource?.scheme === Schemas.file).map(editor => editor.resource));
			if (localFilesAllowedToOpenAsWorkspace.length > 0) {
				const isWorkspaceOpening = await this.handleWorkspaceDrop(localFilesAllowedToOpenAsWorkspace);
				if (isWorkspaceOpening) {
					return; // return early if the drop operation resulted in this window changing to a workspace
				}
			}
		}

		// Add external ones to recently open list unless dropped resource is a workspace
		const externalLocalFiles = coalesce(editors.filter(editor => editor.isExternal && editor.resource?.scheme === Schemas.file).map(editor => editor.resource));
		if (externalLocalFiles.length) {
			this.workspacesService.addRecentlyOpened(externalLocalFiles.map(resource => ({ fileUri: resource })));
		}

		// Open in Editor
		const targetGroup = resolveTargetGroup?.();
		await this.editorService.openEditors(editors.map(editor => ({
			...editor,
			resource: editor.resource,
			options: {
				...editor.options,
				...options,
				pinned: true
			}
		})), targetGroup, { validateTrust: true });

		// Finish with provided function
		afterDrop?.(targetGroup);
	}

	private async handleWorkspaceDrop(resources: URI[]): Promise<boolean> {
		const toOpen: IWindowOpenable[] = [];
		const folderURIs: IWorkspaceFolderCreationData[] = [];

		await Promise.all(resources.map(async resource => {

			// Check for Workspace
			if (hasWorkspaceFileExtension(resource)) {
				toOpen.push({ workspaceUri: resource });

				return;
			}

			// Check for Folder
			try {
				const stat = await this.fileService.stat(resource);
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

		// Open in separate windows if we drop workspaces or just one folder
		if (toOpen.length > folderURIs.length || folderURIs.length === 1) {
			await this.hostService.openWindow(toOpen);
		}

		// Add to workspace if we are in a temporary workspace
		else if (isTemporaryWorkspace(this.contextService.getWorkspace())) {
			await this.workspaceEditingService.addFolders(folderURIs);
		}

		// Finally, enter untitled workspace when dropping >1 folders
		else {
			await this.workspaceEditingService.createAndEnterWorkspace(folderURIs);
		}

		return true;
	}
}

export function fillEditorsDragData(accessor: ServicesAccessor, resources: URI[], event: DragMouseEvent | DragEvent, options?: { disableStandardTransfer: boolean }): void;
export function fillEditorsDragData(accessor: ServicesAccessor, resources: IResourceStat[], event: DragMouseEvent | DragEvent, options?: { disableStandardTransfer: boolean }): void;
export function fillEditorsDragData(accessor: ServicesAccessor, editors: IEditorIdentifier[], event: DragMouseEvent | DragEvent, options?: { disableStandardTransfer: boolean }): void;
export function fillEditorsDragData(accessor: ServicesAccessor, resourcesOrEditors: Array<URI | IResourceStat | IEditorIdentifier>, event: DragMouseEvent | DragEvent, options?: { disableStandardTransfer: boolean }): void {
	if (resourcesOrEditors.length === 0 || !event.dataTransfer) {
		return;
	}

	const textFileService = accessor.get(ITextFileService);
	const editorService = accessor.get(IEditorService);
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);

	// Extract resources from URIs or Editors that
	// can be handled by the file service
	const resources = coalesce(resourcesOrEditors.map((resourceOrEditor): IResourceStat | undefined => {
		if (URI.isUri(resourceOrEditor)) {
			return { resource: resourceOrEditor };
		}

		if (isEditorIdentifier(resourceOrEditor)) {
			if (URI.isUri(resourceOrEditor.editor.resource)) {
				return { resource: resourceOrEditor.editor.resource };
			}

			return undefined; // editor without resource
		}

		return {
			resource: resourceOrEditor.selection ? withSelection(resourceOrEditor.resource, resourceOrEditor.selection) : resourceOrEditor.resource,
			isDirectory: resourceOrEditor.isDirectory,
			selection: resourceOrEditor.selection,
		};
	}));

	const fileSystemResources = resources.filter(({ resource }) => fileService.hasProvider(resource));
	if (!options?.disableStandardTransfer) {

		// Text: allows to paste into text-capable areas
		const lineDelimiter = isWindows ? '\r\n' : '\n';
		event.dataTransfer.setData(DataTransfers.TEXT, fileSystemResources.map(({ resource }) => labelService.getUriLabel(resource, { noPrefix: true })).join(lineDelimiter));

		// Download URL: enables support to drag a tab as file to desktop
		// Requirements:
		// - Chrome/Edge only
		// - only a single file is supported
		// - only file:/ resources are supported
		const firstFile = fileSystemResources.find(({ isDirectory }) => !isDirectory);
		if (firstFile) {
			const firstFileUri = FileAccess.uriToFileUri(firstFile.resource); // enforce `file:` URIs
			if (firstFileUri.scheme === Schemas.file) {
				event.dataTransfer.setData(DataTransfers.DOWNLOAD_URL, [Mimes.binary, basename(firstFile.resource), firstFileUri.toString()].join(':'));
			}
		}
	}

	// Resource URLs: allows to drop multiple file resources to a target in VS Code
	const files = fileSystemResources.filter(({ isDirectory }) => !isDirectory);
	if (files.length) {
		event.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(files.map(({ resource }) => resource.toString())));
	}

	// Contributions
	const contributions = Registry.as<IDragAndDropContributionRegistry>(Extensions.DragAndDropContribution).getAll();
	for (const contribution of contributions) {
		contribution.setData(resources, event);
	}

	// Editors: enables cross window DND of editors
	// into the editor area while presering UI state
	const draggedEditors: IDraggedResourceEditorInput[] = [];

	for (const resourceOrEditor of resourcesOrEditors) {

		// Extract resource editor from provided object or URI
		let editor: IDraggedResourceEditorInput | undefined = undefined;
		if (isEditorIdentifier(resourceOrEditor)) {
			const untypedEditor = resourceOrEditor.editor.toUntyped({ preserveViewState: resourceOrEditor.groupId });
			if (untypedEditor) {
				editor = { ...untypedEditor, resource: EditorResourceAccessor.getCanonicalUri(untypedEditor) };
			}
		} else if (URI.isUri(resourceOrEditor)) {
			const { selection, uri } = extractSelection(resourceOrEditor);
			editor = { resource: uri, options: selection ? { selection } : undefined };
		} else if (!resourceOrEditor.isDirectory) {
			editor = {
				resource: resourceOrEditor.resource,
				options: {
					selection: resourceOrEditor.selection,
				}
			};
		}

		if (!editor) {
			continue; // skip over editors that cannot be transferred via dnd
		}

		// Fill in some properties if they are not there already by accessing
		// some well known things from the text file universe.
		// This is not ideal for custom editors, but those have a chance to
		// provide everything from the `toUntyped` method.
		{
			const resource = editor.resource;
			if (resource) {
				const textFileModel = textFileService.files.get(resource);
				if (textFileModel) {

					// language
					if (typeof editor.languageId !== 'string') {
						editor.languageId = textFileModel.getLanguageId();
					}

					// encoding
					if (typeof editor.encoding !== 'string') {
						editor.encoding = textFileModel.getEncoding();
					}

					// contents (only if dirty and not too large)
					if (typeof editor.contents !== 'string' && textFileModel.isDirty() && !textFileModel.textEditorModel.isTooLargeForHeapOperation()) {
						editor.contents = textFileModel.textEditorModel.getValue();
					}
				}

				// viewState
				if (!editor.options?.viewState) {
					editor.options = {
						...editor.options,
						viewState: (() => {
							for (const visibleEditorPane of editorService.visibleEditorPanes) {
								if (isEqual(visibleEditorPane.input.resource, resource)) {
									const viewState = visibleEditorPane.getViewState();
									if (viewState) {
										return viewState;
									}
								}
							}

							return undefined;
						})()
					};
				}
			}
		}

		// Add as dragged editor
		draggedEditors.push(editor);
	}

	if (draggedEditors.length) {
		event.dataTransfer.setData(CodeDataTransfers.EDITORS, stringify(draggedEditors));
	}

	// Add a URI list entry
	const draggedDirectories: URI[] = fileSystemResources.filter(({ isDirectory }) => isDirectory).map(({ resource }) => resource);
	if (draggedEditors.length || draggedDirectories.length) {
		const uriListEntries: URI[] = [...draggedDirectories];
		for (const editor of draggedEditors) {
			if (editor.resource) {
				uriListEntries.push(editor.options?.selection ? withSelection(editor.resource, editor.options.selection) : editor.resource);
			} else if (isResourceDiffEditorInput(editor)) {
				if (editor.modified.resource) {
					uriListEntries.push(editor.modified.resource);
				}
			} else if (isResourceSideBySideEditorInput(editor)) {
				if (editor.primary.resource) {
					uriListEntries.push(editor.primary.resource);
				}
			} else if (isResourceMergeEditorInput(editor)) {
				uriListEntries.push(editor.result.resource);
			}
		}

		// Due to https://bugs.chromium.org/p/chromium/issues/detail?id=239745, we can only set
		// a single uri for the real `text/uri-list` type. Otherwise all uris end up joined together
		// However we write the full uri-list to an internal type so that other parts of VS Code
		// can use the full list.
		if (!options?.disableStandardTransfer) {
			event.dataTransfer.setData(Mimes.uriList, UriList.create(uriListEntries.slice(0, 1)));
		}
		event.dataTransfer.setData(DataTransfers.INTERNAL_URI_LIST, UriList.create(uriListEntries));
	}
}

//#endregion

//#region Composites DND

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
			markAsSingleton(CompositeDragAndDropObserver.instance);
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
			onDragEnter: e => {
				e.preventDefault();

				if (callbacks.onDragEnter) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (data) {
						callbacks.onDragEnter({ eventData: e, dragAndDropData: data });
					}
				}
			},
			onDragLeave: e => {
				const data = this.readDragData('composite') || this.readDragData('view');
				if (callbacks.onDragLeave && data) {
					callbacks.onDragLeave({ eventData: e, dragAndDropData: data });
				}
			},
			onDrop: e => {
				if (callbacks.onDrop) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					callbacks.onDrop({ eventData: e, dragAndDropData: data });

					// Fire drag event in case drop handler destroys the dragged element
					this.onDragEnd.fire({ eventData: e, dragAndDropData: data });
				}
			},
			onDragOver: e => {
				e.preventDefault();

				if (callbacks.onDragOver) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					callbacks.onDragOver({ eventData: e, dragAndDropData: data });
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

	registerDraggable(element: HTMLElement, draggedItemProvider: () => { type: ViewType; id: string }, callbacks: ICompositeDragAndDropObserverCallbacks): IDisposable {
		element.draggable = true;

		const disposableStore = new DisposableStore();

		disposableStore.add(new DragAndDropObserver(element, {
			onDragStart: e => {
				const { id, type } = draggedItemProvider();
				this.writeDragData(id, type);

				e.dataTransfer?.setDragImage(element, 0, 0);

				this.onDragStart.fire({ eventData: e, dragAndDropData: this.readDragData(type)! });
			},
			onDragEnd: e => {
				const { type } = draggedItemProvider();
				const data = this.readDragData(type);
				if (!data) {
					return;
				}

				this.onDragEnd.fire({ eventData: e, dragAndDropData: data });
			},
			onDragEnter: e => {
				if (callbacks.onDragEnter) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					if (data) {
						callbacks.onDragEnter({ eventData: e, dragAndDropData: data });
					}
				}
			},
			onDragLeave: e => {
				const data = this.readDragData('composite') || this.readDragData('view');
				if (!data) {
					return;
				}

				callbacks.onDragLeave?.({ eventData: e, dragAndDropData: data });
			},
			onDrop: e => {
				if (callbacks.onDrop) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					callbacks.onDrop({ eventData: e, dragAndDropData: data });

					// Fire drag event in case drop handler destroys the dragged element
					this.onDragEnd.fire({ eventData: e, dragAndDropData: data });
				}
			},
			onDragOver: e => {
				if (callbacks.onDragOver) {
					const data = this.readDragData('composite') || this.readDragData('view');
					if (!data) {
						return;
					}

					callbacks.onDragOver({ eventData: e, dragAndDropData: data });
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

export class ResourceListDnDHandler<T> implements IListDragAndDrop<T> {
	constructor(
		private readonly toResource: (e: T) => URI | null,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	getDragURI(element: T): string | null {
		const resource = this.toResource(element);
		return resource ? resource.toString() : null;
	}

	getDragLabel(elements: T[]): string | undefined {
		const resources = coalesce(elements.map(this.toResource));
		return resources.length === 1 ? basename(resources[0]) : resources.length > 1 ? String(resources.length) : undefined;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const resources: URI[] = [];
		const elements = (data as ElementsDragAndDropData<T>).elements;
		for (const element of elements) {
			const resource = this.toResource(element);
			if (resource) {
				resources.push(resource);
			}
		}
		this.onWillDragElements(elements, originalEvent);
		if (resources.length) {
			// Apply some datatransfer types to allow for dragging the element outside of the application
			this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, resources, originalEvent));
		}
	}

	protected onWillDragElements(elements: readonly T[], originalEvent: DragEvent): void {
		// noop
	}

	onDragOver(data: IDragAndDropData, targetElement: T, targetIndex: number, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		return false;
	}

	drop(data: IDragAndDropData, targetElement: T, targetIndex: number, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void { }

	dispose(): void { }
}

//#endregion

class GlobalWindowDraggedOverTracker extends Disposable {

	private static readonly CHANNEL_NAME = 'monaco-workbench-global-dragged-over';

	private readonly broadcaster = this._register(new BroadcastDataChannel<boolean>(GlobalWindowDraggedOverTracker.CHANNEL_NAME));

	constructor() {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(addDisposableListener(window, EventType.DRAG_OVER, () => this.markDraggedOver(false), true));
			disposables.add(addDisposableListener(window, EventType.DRAG_LEAVE, () => this.clearDraggedOver(false), true));
		}, { window: mainWindow, disposables: this._store }));

		this._register(this.broadcaster.onDidReceiveData(data => {
			if (data === true) {
				this.markDraggedOver(true);
			} else {
				this.clearDraggedOver(true);
			}
		}));
	}

	private draggedOver = false;
	get isDraggedOver(): boolean { return this.draggedOver; }

	private markDraggedOver(fromBroadcast: boolean): void {
		if (this.draggedOver === true) {
			return; // alrady marked
		}

		this.draggedOver = true;

		if (!fromBroadcast) {
			this.broadcaster.postData(true);
		}
	}

	private clearDraggedOver(fromBroadcast: boolean): void {
		if (this.draggedOver === false) {
			return; // alrady cleared
		}

		this.draggedOver = false;

		if (!fromBroadcast) {
			this.broadcaster.postData(false);
		}
	}
}

const globalDraggedOverTracker = new GlobalWindowDraggedOverTracker();

/**
 * Returns whether the workbench is currently dragged over in any of
 * the opened windows (main windows and auxiliary windows).
 */
export function isWindowDraggedOver(): boolean {
	return globalDraggedOverTracker.isDraggedOver;
}
