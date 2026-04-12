/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { DataTransfers } from '../../base/browser/dnd.js';
import { DragAndDropObserver, EventType, addDisposableListener, onDidRegisterWindow } from '../../base/browser/dom.js';
import { coalesce } from '../../base/common/arrays.js';
import { UriList } from '../../base/common/dataTransfer.js';
import { Emitter, Event } from '../../base/common/event.js';
import { Disposable, DisposableStore, markAsSingleton } from '../../base/common/lifecycle.js';
import { stringify } from '../../base/common/marshalling.js';
import { Mimes } from '../../base/common/mime.js';
import { FileAccess, Schemas } from '../../base/common/network.js';
import { isWindows } from '../../base/common/platform.js';
import { basename, isEqual } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { CodeDataTransfers, Extensions, LocalSelectionTransfer, createDraggedEditorInputFromRawResourcesData, extractEditorsAndFilesDropData } from '../../platform/dnd/browser/dnd.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { extractSelection, withSelection } from '../../platform/opener/common/opener.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IWorkspaceContextService, hasWorkspaceFileExtension, isTemporaryWorkspace } from '../../platform/workspace/common/workspace.js';
import { IWorkspacesService } from '../../platform/workspaces/common/workspaces.js';
import { EditorResourceAccessor, isEditorIdentifier, isResourceDiffEditorInput, isResourceMergeEditorInput, isResourceSideBySideEditorInput } from '../common/editor.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IHostService } from '../services/host/browser/host.js';
import { ITextFileService } from '../services/textfile/common/textfiles.js';
import { IWorkspaceEditingService } from '../services/workspaces/common/workspaceEditing.js';
import { mainWindow } from '../../base/browser/window.js';
import { BroadcastDataChannel } from '../../base/browser/broadcast.js';
//#region Editor / Resources DND
export class DraggedEditorIdentifier {
    constructor(identifier) {
        this.identifier = identifier;
    }
}
export class DraggedEditorGroupIdentifier {
    constructor(identifier) {
        this.identifier = identifier;
    }
}
export async function extractTreeDropData(dataTransfer) {
    const editors = [];
    const resourcesKey = Mimes.uriList.toLowerCase();
    // Data Transfer: Resources
    if (dataTransfer.has(resourcesKey)) {
        try {
            const asString = await dataTransfer.get(resourcesKey)?.asString();
            const rawResourcesData = JSON.stringify(UriList.parse(asString ?? ''));
            editors.push(...createDraggedEditorInputFromRawResourcesData(rawResourcesData));
        }
        catch (error) {
            // Invalid transfer
        }
    }
    return editors;
}
/**
 * Shared function across some components to handle drag & drop of resources.
 * E.g. of folders and workspace files to open them in the window instead of
 * the editor or to handle dirty editors being dropped between instances of Code.
 */
let ResourcesDropHandler = class ResourcesDropHandler {
    constructor(options, fileService, workspacesService, editorService, workspaceEditingService, hostService, contextService, instantiationService) {
        this.options = options;
        this.fileService = fileService;
        this.workspacesService = workspacesService;
        this.editorService = editorService;
        this.workspaceEditingService = workspaceEditingService;
        this.hostService = hostService;
        this.contextService = contextService;
        this.instantiationService = instantiationService;
    }
    async handleDrop(event, targetWindow, resolveTargetGroup, afterDrop, options) {
        const editors = await this.instantiationService.invokeFunction(accessor => extractEditorsAndFilesDropData(accessor, event));
        if (!editors.length) {
            return;
        }
        // Make the window active to handle the drop properly within
        await this.hostService.focus(targetWindow);
        // Check for registered drop handlers
        const dndRegistry = Registry.as(Extensions.DragAndDropContribution);
        for (const { resource } of editors) {
            if (resource) {
                const handled = await this.instantiationService.invokeFunction(accessor => dndRegistry.handleResourceDrop(resource, accessor));
                if (handled) {
                    return;
                }
            }
        }
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
    async handleWorkspaceDrop(resources) {
        const toOpen = [];
        const folderURIs = [];
        await Promise.all(resources.map(async (resource) => {
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
            }
            catch (error) {
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
};
ResourcesDropHandler = __decorate([
    __param(1, IFileService),
    __param(2, IWorkspacesService),
    __param(3, IEditorService),
    __param(4, IWorkspaceEditingService),
    __param(5, IHostService),
    __param(6, IWorkspaceContextService),
    __param(7, IInstantiationService)
], ResourcesDropHandler);
export { ResourcesDropHandler };
export function fillEditorsDragData(accessor, resourcesOrEditors, event, options) {
    if (resourcesOrEditors.length === 0 || !event.dataTransfer) {
        return;
    }
    const textFileService = accessor.get(ITextFileService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const labelService = accessor.get(ILabelService);
    // Extract resources from URIs or Editors that
    // can be handled by the file service
    const resources = coalesce(resourcesOrEditors.map((resourceOrEditor) => {
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
    const contributions = Registry.as(Extensions.DragAndDropContribution).getAll();
    for (const contribution of contributions) {
        contribution.setData(resources, event);
    }
    // Editors: enables cross window DND of editors
    // into the editor area while presering UI state
    const draggedEditors = [];
    for (const resourceOrEditor of resourcesOrEditors) {
        // Extract resource editor from provided object or URI
        let editor = undefined;
        if (isEditorIdentifier(resourceOrEditor)) {
            const untypedEditor = resourceOrEditor.editor.toUntyped({ preserveViewState: resourceOrEditor.groupId });
            if (untypedEditor) {
                editor = { ...untypedEditor, resource: EditorResourceAccessor.getCanonicalUri(untypedEditor) };
            }
        }
        else if (URI.isUri(resourceOrEditor)) {
            const { selection, uri } = extractSelection(resourceOrEditor);
            editor = { resource: uri, options: selection ? { selection } : undefined };
        }
        else if (!resourceOrEditor.isDirectory) {
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
    const draggedDirectories = fileSystemResources.filter(({ isDirectory }) => isDirectory).map(({ resource }) => resource);
    if (draggedEditors.length || draggedDirectories.length) {
        const uriListEntries = [...draggedDirectories];
        for (const editor of draggedEditors) {
            if (editor.resource) {
                uriListEntries.push(editor.options?.selection ? withSelection(editor.resource, editor.options.selection) : editor.resource);
            }
            else if (isResourceDiffEditorInput(editor)) {
                if (editor.modified.resource) {
                    uriListEntries.push(editor.modified.resource);
                }
            }
            else if (isResourceSideBySideEditorInput(editor)) {
                if (editor.primary.resource) {
                    uriListEntries.push(editor.primary.resource);
                }
            }
            else if (isResourceMergeEditorInput(editor)) {
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
export class CompositeDragAndDropData {
    constructor(type, id) {
        this.type = type;
        this.id = id;
    }
    update(dataTransfer) {
        // no-op
    }
    getData() {
        return { type: this.type, id: this.id };
    }
}
export class DraggedCompositeIdentifier {
    constructor(compositeId) {
        this.compositeId = compositeId;
    }
    get id() {
        return this.compositeId;
    }
}
export class DraggedViewIdentifier {
    constructor(viewId) {
        this.viewId = viewId;
    }
    get id() {
        return this.viewId;
    }
}
export class CompositeDragAndDropObserver extends Disposable {
    static get INSTANCE() {
        if (!CompositeDragAndDropObserver.instance) {
            CompositeDragAndDropObserver.instance = new CompositeDragAndDropObserver();
            markAsSingleton(CompositeDragAndDropObserver.instance);
        }
        return CompositeDragAndDropObserver.instance;
    }
    constructor() {
        super();
        this.transferData = LocalSelectionTransfer.getInstance();
        this.onDragStart = this._register(new Emitter());
        this.onDragEnd = this._register(new Emitter());
        this._register(this.onDragEnd.event(e => {
            const id = e.dragAndDropData.getData().id;
            const type = e.dragAndDropData.getData().type;
            const data = this.readDragData(type);
            if (data?.getData().id === id) {
                this.transferData.clearData(type === 'view' ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
            }
        }));
    }
    readDragData(type) {
        if (this.transferData.hasData(type === 'view' ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype)) {
            const data = this.transferData.getData(type === 'view' ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
            if (data?.[0]) {
                return new CompositeDragAndDropData(type, data[0].id);
            }
        }
        return undefined;
    }
    writeDragData(id, type) {
        this.transferData.setData([type === 'view' ? new DraggedViewIdentifier(id) : new DraggedCompositeIdentifier(id)], type === 'view' ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
    }
    registerTarget(element, callbacks) {
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
                callbacks.onDragStart(e);
            }, this, disposableStore);
        }
        if (callbacks.onDragEnd) {
            this.onDragEnd.event(e => {
                callbacks.onDragEnd(e);
            }, this, disposableStore);
        }
        return this._register(disposableStore);
    }
    registerDraggable(element, draggedItemProvider, callbacks) {
        element.draggable = true;
        const disposableStore = new DisposableStore();
        disposableStore.add(new DragAndDropObserver(element, {
            onDragStart: e => {
                const { id, type } = draggedItemProvider();
                this.writeDragData(id, type);
                e.dataTransfer?.setDragImage(element, 0, 0);
                this.onDragStart.fire({ eventData: e, dragAndDropData: this.readDragData(type) });
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
                callbacks.onDragStart(e);
            }, this, disposableStore);
        }
        if (callbacks.onDragEnd) {
            this.onDragEnd.event(e => {
                callbacks.onDragEnd(e);
            }, this, disposableStore);
        }
        return this._register(disposableStore);
    }
}
export function toggleDropEffect(dataTransfer, dropEffect, shouldHaveIt) {
    if (!dataTransfer) {
        return;
    }
    dataTransfer.dropEffect = shouldHaveIt ? dropEffect : 'none';
}
let ResourceListDnDHandler = class ResourceListDnDHandler {
    constructor(toResource, instantiationService) {
        this.toResource = toResource;
        this.instantiationService = instantiationService;
    }
    getDragURI(element) {
        const resource = this.toResource(element);
        return resource ? resource.toString() : null;
    }
    getDragLabel(elements) {
        const resources = coalesce(elements.map(this.toResource));
        return resources.length === 1 ? basename(resources[0]) : resources.length > 1 ? String(resources.length) : undefined;
    }
    onDragStart(data, originalEvent) {
        const resources = [];
        const elements = data.elements;
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
    onWillDragElements(elements, originalEvent) {
        // noop
    }
    onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
        return false;
    }
    drop(data, targetElement, targetIndex, targetSector, originalEvent) { }
    dispose() { }
};
ResourceListDnDHandler = __decorate([
    __param(1, IInstantiationService)
], ResourceListDnDHandler);
export { ResourceListDnDHandler };
//#endregion
class GlobalWindowDraggedOverTracker extends Disposable {
    static { this.CHANNEL_NAME = 'monaco-workbench-global-dragged-over'; }
    constructor() {
        super();
        this.broadcaster = this._register(new BroadcastDataChannel(GlobalWindowDraggedOverTracker.CHANNEL_NAME));
        this.draggedOver = false;
        this.registerListeners();
    }
    registerListeners() {
        this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
            disposables.add(addDisposableListener(window, EventType.DRAG_OVER, () => this.markDraggedOver(false), true));
            disposables.add(addDisposableListener(window, EventType.DRAG_LEAVE, () => this.clearDraggedOver(false), true));
        }, { window: mainWindow, disposables: this._store }));
        this._register(this.broadcaster.onDidReceiveData(data => {
            if (data === true) {
                this.markDraggedOver(true);
            }
            else {
                this.clearDraggedOver(true);
            }
        }));
    }
    get isDraggedOver() { return this.draggedOver; }
    markDraggedOver(fromBroadcast) {
        if (this.draggedOver === true) {
            return; // alrady marked
        }
        this.draggedOver = true;
        if (!fromBroadcast) {
            this.broadcaster.postData(true);
        }
    }
    clearDraggedOver(fromBroadcast) {
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
export function isWindowDraggedOver() {
    return globalDraggedOverTracker.isDraggedOver;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvZG5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQW9CLE1BQU0sMkJBQTJCLENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBS3ZILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFrQixNQUFNLG1DQUFtQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0csT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsVUFBVSxFQUFnRixzQkFBc0IsRUFBRSw0Q0FBNEMsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RRLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxz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