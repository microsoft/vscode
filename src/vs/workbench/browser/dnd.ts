/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { VSBuffer } from 'vs/base/common/buffer';
import Severity from 'vs/base/common/severity';
import { IWorkspaceFolderCreationData, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { basename, isEqual } from 'vs/base/common/resources';
import { ByteSize, IFileService } from 'vs/platform/files/common/files';
import { IWindowOpenable } from 'vs/platform/window/common/window';
import { URI } from 'vs/base/common/uri';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { IBaseTextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { DataTransfers, IDragAndDropData } from 'vs/base/browser/dnd';
import { DragMouseEvent } from 'vs/base/browser/mouseEvent';
import { Mimes } from 'vs/base/common/mime';
import { isWeb, isWindows } from 'vs/base/common/platform';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorIdentifier, GroupIdentifier, isEditorIdentifier, EditorResourceAccessor } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Disposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspaces/common/workspaceEditing';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { Emitter } from 'vs/base/common/event';
import { coalesce } from 'vs/base/common/arrays';
import { parse, stringify } from 'vs/base/common/marshalling';
import { ILabelService } from 'vs/platform/label/common/label';
import { hasWorkspaceFileExtension, isTemporaryWorkspace, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { withNullAsUndefined } from 'vs/base/common/types';
import { ITreeDataTransfer } from 'vs/workbench/common/views';
import { extractSelection } from 'vs/platform/opener/common/opener';
import { IListDragAndDrop } from 'vs/base/browser/ui/list/list';
import { ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';
import { ITreeDragOverReaction } from 'vs/base/browser/ui/tree/tree';
import { WebFileSystemAccess } from 'vs/platform/files/browser/webFileSystemAccess';
import { HTMLFileSystemProvider } from 'vs/platform/files/browser/htmlFileSystemProvider';
import { DeferredPromise } from 'vs/base/common/async';

//#region Editor / Resources DND

export class DraggedEditorIdentifier {

	constructor(readonly identifier: IEditorIdentifier) { }
}

export class DraggedEditorGroupIdentifier {

	constructor(readonly identifier: GroupIdentifier) { }
}

export class DraggedTreeItemsIdentifier {

	constructor(readonly identifier: string) { }
}

export const CodeDataTransfers = {
	EDITORS: 'CodeEditors',
	FILES: 'CodeFiles'
};

export interface IDraggedResourceEditorInput extends IBaseTextResourceEditorInput {
	resource: URI | undefined;

	/**
	 * A hint that the source of the dragged editor input
	 * might not be the application but some external tool.
	 */
	isExternal?: boolean;

	/**
	 * Whether we probe for the dropped editor to be a workspace
	 * (i.e. code-workspace file or even a folder), allowing to
	 * open it as workspace instead of opening as editor.
	 */
	allowWorkspaceOpen?: boolean;
}

export async function extractEditorsDropData(accessor: ServicesAccessor, e: DragEvent): Promise<Array<IDraggedResourceEditorInput>> {
	const editors: IDraggedResourceEditorInput[] = [];
	if (e.dataTransfer && e.dataTransfer.types.length > 0) {

		// Data Transfer: Code Editors
		const rawEditorsData = e.dataTransfer.getData(CodeDataTransfers.EDITORS);
		if (rawEditorsData) {
			try {
				editors.push(...parse(rawEditorsData));
			} catch (error) {
				// Invalid transfer
			}
		}

		// Data Transfer: Resources
		else {
			try {
				const rawResourcesData = e.dataTransfer.getData(DataTransfers.RESOURCES);
				editors.push(...createDraggedEditorInputFromRawResourcesData(rawResourcesData));
			} catch (error) {
				// Invalid transfer
			}
		}

		// Check for native file transfer
		if (e.dataTransfer?.files) {
			for (let i = 0; i < e.dataTransfer.files.length; i++) {
				const file = e.dataTransfer.files[i];
				if (file?.path /* Electron only */) {
					try {
						editors.push({ resource: URI.file(file.path), isExternal: true, allowWorkspaceOpen: true });
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
				for (const codeFile of codeFiles) {
					editors.push({ resource: URI.file(codeFile), isExternal: true, allowWorkspaceOpen: true });
				}
			} catch (error) {
				// Invalid transfer
			}
		}

		// Check for terminals transfer
		const terminals = e.dataTransfer.getData(DataTransfers.TERMINALS);
		if (terminals) {
			try {
				const terminalEditors: string[] = JSON.parse(terminals);
				for (const terminalEditor of terminalEditors) {
					editors.push({ resource: URI.parse(terminalEditor) });
				}
			} catch (error) {
				// Invalid transfer
			}
		}

		// Web: Check for file transfer
		if (isWeb && containsDragType(e, DataTransfers.FILES)) {
			const files = e.dataTransfer.items;
			if (files) {
				const instantiationService = accessor.get(IInstantiationService);
				const filesData = await instantiationService.invokeFunction(accessor => extractFilesDropData(accessor, e));
				for (const fileData of filesData) {
					editors.push({ resource: fileData.resource, contents: fileData.contents?.toString(), isExternal: true, allowWorkspaceOpen: fileData.isDirectory });
				}
			}
		}
	}

	return editors;
}

function createDraggedEditorInputFromRawResourcesData(rawResourcesData: string | undefined): IDraggedResourceEditorInput[] {
	const editors: IDraggedResourceEditorInput[] = [];

	if (rawResourcesData) {
		const resourcesRaw: string[] = JSON.parse(rawResourcesData);
		for (const resourceRaw of resourcesRaw) {
			if (resourceRaw.indexOf(':') > 0) { // mitigate https://github.com/microsoft/vscode/issues/124946
				const { selection, uri } = extractSelection(URI.parse(resourceRaw));
				editors.push({ resource: uri, options: { selection } });
			}
		}
	}

	return editors;
}

export async function extractTreeDropData(dataTransfer: ITreeDataTransfer): Promise<Array<IDraggedResourceEditorInput>> {
	const editors: IDraggedResourceEditorInput[] = [];
	const resourcesKey = Mimes.uriList.toLowerCase();

	// Data Transfer: Resources
	if (dataTransfer.has(resourcesKey)) {
		try {
			const asString = await dataTransfer.get(resourcesKey)?.asString();
			const rawResourcesData = JSON.stringify(asString?.split('\\n').filter(value => !value.startsWith('#')));
			editors.push(...createDraggedEditorInputFromRawResourcesData(rawResourcesData));
		} catch (error) {
			// Invalid transfer
		}
	}

	return editors;
}

interface IFileTransferData {
	resource: URI;
	isDirectory?: boolean;
	contents?: VSBuffer;
}

async function extractFilesDropData(accessor: ServicesAccessor, event: DragEvent): Promise<IFileTransferData[]> {

	// Try to extract via `FileSystemHandle`
	if (WebFileSystemAccess.supported(window)) {
		const items = event.dataTransfer?.items;
		if (items) {
			return extractFileTransferData(accessor, items);
		}
	}

	// Try to extract via `FileList`
	const files = event.dataTransfer?.files;
	if (!files) {
		return [];
	}

	return extractFileListData(accessor, files);
}

async function extractFileTransferData(accessor: ServicesAccessor, items: DataTransferItemList): Promise<IFileTransferData[]> {
	const fileSystemProvider = accessor.get(IFileService).getProvider(Schemas.file);
	if (!(fileSystemProvider instanceof HTMLFileSystemProvider)) {
		return []; // only supported when running in web
	}

	const results: DeferredPromise<IFileTransferData | undefined>[] = [];

	for (let i = 0; i < items.length; i++) {
		const file = items[i];
		if (file) {
			const result = new DeferredPromise<IFileTransferData | undefined>();
			results.push(result);

			(async () => {
				try {
					const handle = await file.getAsFileSystemHandle();
					if (!handle) {
						result.complete(undefined);
						return;
					}

					if (WebFileSystemAccess.isFileSystemFileHandle(handle)) {
						result.complete({
							resource: await fileSystemProvider.registerFileHandle(handle),
							isDirectory: false
						});
					} else if (WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
						result.complete({
							resource: await fileSystemProvider.registerDirectoryHandle(handle),
							isDirectory: true
						});
					} else {
						result.complete(undefined);
					}
				} catch (error) {
					result.complete(undefined);
				}
			})();
		}
	}

	return coalesce(await Promise.all(results.map(result => result.p)));
}

export async function extractFileListData(accessor: ServicesAccessor, files: FileList): Promise<IFileTransferData[]> {
	const dialogService = accessor.get(IDialogService);

	const results: DeferredPromise<IFileTransferData | undefined>[] = [];

	for (let i = 0; i < files.length; i++) {
		const file = files.item(i);
		if (file) {

			// Skip for very large files because this operation is unbuffered
			if (file.size > 100 * ByteSize.MB) {
				dialogService.show(Severity.Warning, localize('fileTooLarge', "File is too large to open as untitled editor. Please upload it first into the file explorer and then try again."));
				continue;
			}

			const result = new DeferredPromise<IFileTransferData | undefined>();
			results.push(result);

			const reader = new FileReader();

			reader.onerror = () => result.complete(undefined);
			reader.onabort = () => result.complete(undefined);

			reader.onload = async event => {
				const name = file.name;
				const loadResult = withNullAsUndefined(event.target?.result);
				if (typeof name !== 'string' || typeof loadResult === 'undefined') {
					result.complete(undefined);
					return;
				}

				result.complete({
					resource: URI.from({ scheme: Schemas.untitled, path: name }),
					contents: typeof loadResult === 'string' ? VSBuffer.fromString(loadResult) : VSBuffer.wrap(new Uint8Array(loadResult))
				});
			};

			// Start reading
			reader.readAsArrayBuffer(file);
		}
	}

	return coalesce(await Promise.all(results.map(result => result.p)));
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

	async handleDrop(event: DragEvent, resolveTargetGroup: () => IEditorGroup | undefined, afterDrop: (targetGroup: IEditorGroup | undefined) => void, targetIndex?: number): Promise<void> {
		const editors = await this.instantiationService.invokeFunction(accessor => extractEditorsDropData(accessor, event));
		if (!editors.length) {
			return;
		}

		// Make the window active to handle the drop properly within
		await this.hostService.focus();

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
		// and only for resources that are outside of the currently opened workspace
		const externalLocalFiles = coalesce(editors.filter(editor => editor.isExternal && editor.resource?.scheme === Schemas.file).map(editor => editor.resource));
		if (externalLocalFiles.length) {
			this.workspacesService.addRecentlyOpened(externalLocalFiles
				.filter(resource => !this.contextService.isInsideWorkspace(resource))
				.map(resource => ({ fileUri: resource }))
			);
		}

		// Open in Editor
		const targetGroup = resolveTargetGroup();
		await this.editorService.openEditors(editors.map(editor => ({
			...editor,
			resource: editor.resource,
			options: {
				...editor.options,
				pinned: true,
				index: targetIndex
			}
		})), targetGroup, { validateTrust: true });

		// Finish with provided function
		afterDrop(targetGroup);
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

		// Pass focus to window
		this.hostService.focus();

		// Open in separate windows if we drop workspaces or just one folder
		if (toOpen.length > folderURIs.length || folderURIs.length === 1) {
			await this.hostService.openWindow(toOpen);
		}

		// Add to workspace if we are in a temporary workspace
		else if (isTemporaryWorkspace(this.contextService.getWorkspace())) {
			await this.workspaceEditingService.addFolders(folderURIs);
		}

		// Finaly, enter untitled workspace when dropping >1 folders
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

export function fillEditorsDragData(accessor: ServicesAccessor, resources: URI[], event: DragMouseEvent | DragEvent): void;
export function fillEditorsDragData(accessor: ServicesAccessor, resources: IResourceStat[], event: DragMouseEvent | DragEvent): void;
export function fillEditorsDragData(accessor: ServicesAccessor, editors: IEditorIdentifier[], event: DragMouseEvent | DragEvent): void;
export function fillEditorsDragData(accessor: ServicesAccessor, resourcesOrEditors: Array<URI | IResourceStat | IEditorIdentifier>, event: DragMouseEvent | DragEvent): void {
	if (resourcesOrEditors.length === 0 || !event.dataTransfer) {
		return;
	}

	const textFileService = accessor.get(ITextFileService);
	const editorService = accessor.get(IEditorService);
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);

	// Extract resources from URIs or Editors that
	// can be handled by the file service
	const resources = coalesce(resourcesOrEditors.map(resourceOrEditor => {
		if (URI.isUri(resourceOrEditor)) {
			return { resource: resourceOrEditor };
		}

		if (isEditorIdentifier(resourceOrEditor)) {
			if (URI.isUri(resourceOrEditor.editor.resource)) {
				return { resource: resourceOrEditor.editor.resource };
			}

			return undefined; // editor without resource
		}

		return resourceOrEditor;
	}));
	const fileSystemResources = resources.filter(({ resource }) => fileService.hasProvider(resource));

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
		const firstFileUri = FileAccess.asFileUri(firstFile.resource); // enforce `file:` URIs
		if (firstFileUri.scheme === Schemas.file) {
			event.dataTransfer.setData(DataTransfers.DOWNLOAD_URL, [Mimes.binary, basename(firstFile.resource), firstFileUri.toString()].join(':'));
		}
	}

	// Resource URLs: allows to drop multiple file resources to a target in VS Code
	const files = fileSystemResources.filter(({ isDirectory }) => !isDirectory);
	if (files.length) {
		event.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(files.map(({ resource }) => resource.toString())));
	}

	// Terminal URI
	const terminalResources = resources.filter(({ resource }) => resource.scheme === Schemas.vscodeTerminal);
	if (terminalResources.length) {
		event.dataTransfer.setData(DataTransfers.TERMINALS, JSON.stringify(terminalResources.map(({ resource }) => resource.toString())));
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
			editor = { resource: resourceOrEditor.resource };
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

					// contents (only if dirty)
					if (typeof editor.contents !== 'string' && textFileModel.isDirty()) {
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
}

//#endregion

//#region DND Utilities

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

	registerDraggable(element: HTMLElement, draggedItemProvider: () => { type: ViewType; id: string }, callbacks: ICompositeDragAndDropObserverCallbacks): IDisposable {
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
		for (const element of (data as ElementsDragAndDropData<T>).elements) {
			const resource = this.toResource(element);
			if (resource) {
				resources.push(resource);
			}
		}
		if (resources.length) {
			// Apply some datatransfer types to allow for dragging the element outside of the application
			this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, resources, originalEvent));
		}
	}

	onDragOver(data: IDragAndDropData, targetElement: T, targetIndex: number, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		return false;
	}

	drop(data: IDragAndDropData, targetElement: T, targetIndex: number, originalEvent: DragEvent): void { }
}

//#endregion
