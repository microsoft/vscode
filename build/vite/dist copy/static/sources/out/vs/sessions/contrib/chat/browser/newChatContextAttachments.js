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
import * as dom from '../../../../base/browser/dom.js';
import { DragAndDropObserver } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { renderIcon, renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { registerOpenEditorListeners } from '../../../../platform/editor/browser/editor.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatImageCarouselService } from '../../../../workbench/contrib/chat/browser/chatImageCarouselService.js';
import { coerceImageBuffer } from '../../../../workbench/contrib/chat/common/chatImageExtraction.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { basename } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { resizeImage } from '../../../../workbench/contrib/chat/browser/chatImageUtils.js';
import { imageToHash, isImage } from '../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData, getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { getExcludes, ISearchService } from '../../../../workbench/services/search/common/search.js';
/**
 * Manages context attachments for the sessions new-chat widget.
 *
 * Supports:
 * - File picker via quick access ("Files and Open Folders...")
 * - Image from Clipboard
 * - Drag and drop files
 * - Paste images from clipboard (Ctrl/Cmd+V)
 */
let NewChatContextAttachments = class NewChatContextAttachments extends Disposable {
    get attachments() {
        return this._attachedContext;
    }
    setAttachments(entries) {
        this._attachedContext.length = 0;
        this._attachedContext.push(...entries);
        this._updateRendering();
        this._onDidChangeContext.fire();
    }
    constructor(quickInputService, textModelService, fileService, clipboardService, fileDialogService, labelService, searchService, configurationService, openerService, instantiationService, modelService, languageService, chatImageCarouselService) {
        super();
        this.quickInputService = quickInputService;
        this.textModelService = textModelService;
        this.fileService = fileService;
        this.clipboardService = clipboardService;
        this.fileDialogService = fileDialogService;
        this.labelService = labelService;
        this.searchService = searchService;
        this.configurationService = configurationService;
        this.openerService = openerService;
        this.instantiationService = instantiationService;
        this.modelService = modelService;
        this.languageService = languageService;
        this.chatImageCarouselService = chatImageCarouselService;
        this._attachedContext = [];
        this._renderDisposables = this._register(new DisposableStore());
        this._onDidChangeContext = this._register(new Emitter());
        this.onDidChangeContext = this._onDidChangeContext.event;
        this._resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    }
    // --- Rendering ---
    renderAttachedContext(container) {
        this._container = container;
        this._updateRendering();
    }
    _updateRendering() {
        if (!this._container) {
            return;
        }
        this._renderDisposables.clear();
        this._resourceLabels.clear();
        dom.clearNode(this._container);
        if (this._attachedContext.length === 0) {
            this._container.style.display = 'none';
            return;
        }
        this._container.style.display = '';
        this._container.classList.add('show-file-icons');
        for (const entry of this._attachedContext) {
            const pill = dom.append(this._container, dom.$('.sessions-chat-attachment-pill'));
            pill.tabIndex = 0;
            pill.role = 'button';
            const resource = URI.isUri(entry.value) ? entry.value : isLocation(entry.value) ? entry.value.uri : undefined;
            if (entry.kind === 'image') {
                dom.append(pill, renderIcon(Codicon.fileMedia));
                dom.append(pill, dom.$('span.sessions-chat-attachment-name', undefined, entry.name));
            }
            else {
                const label = this._resourceLabels.create(pill, { supportIcons: true });
                this._renderDisposables.add(label);
                if (resource) {
                    label.setFile(resource, {
                        fileKind: entry.kind === 'directory' ? FileKind.FOLDER : FileKind.FILE,
                        hidePath: true,
                    });
                }
                else {
                    label.setLabel(entry.name);
                }
            }
            // Click to open the resource or image
            const imageData = entry.kind === 'image' ? coerceImageBuffer(entry.value) : undefined;
            if (imageData) {
                pill.style.cursor = 'pointer';
                this._renderDisposables.add(registerOpenEditorListeners(pill, async () => {
                    if (this.configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
                        const imageResource = resource ?? URI.from({ scheme: 'data', path: entry.name });
                        await this.chatImageCarouselService.openCarouselAtResource(imageResource, imageData);
                    }
                    else if (resource) {
                        await this.openerService.open(resource, { fromUserGesture: true });
                    }
                }));
            }
            else if (resource) {
                pill.style.cursor = 'pointer';
                this._renderDisposables.add(registerOpenEditorListeners(pill, async () => {
                    await this.openerService.open(resource, { fromUserGesture: true });
                }));
            }
            const removeButton = dom.append(pill, dom.$('.sessions-chat-attachment-remove'));
            removeButton.title = localize('removeAttachment', "Remove");
            removeButton.tabIndex = -1;
            dom.append(removeButton, renderIcon(Codicon.close));
            this._renderDisposables.add(dom.addDisposableListener(removeButton, dom.EventType.CLICK, (e) => {
                e.stopPropagation();
                this._removeAttachment(entry.id);
            }));
        }
    }
    // --- Drag and drop ---
    registerDropTarget(dndContainer) {
        const overlay = dom.append(dndContainer, dom.$('.sessions-chat-dnd-overlay'));
        let overlayText;
        const isDropSupported = (e) => {
            return containsDragType(e, DataTransfers.FILES, CodeDataTransfers.EDITORS, CodeDataTransfers.FILES, DataTransfers.RESOURCES, DataTransfers.INTERNAL_URI_LIST);
        };
        const showOverlay = () => {
            overlay.classList.add('visible');
            if (!overlayText) {
                const label = localize('attachAsContext', "Attach as Context");
                const iconAndTextElements = renderLabelWithIcons(`$(${Codicon.attach.id}) ${label}`);
                const htmlElements = iconAndTextElements.map(element => {
                    if (typeof element === 'string') {
                        return dom.$('span.overlay-text', undefined, element);
                    }
                    return element;
                });
                overlayText = dom.$('span.attach-context-overlay-text', undefined, ...htmlElements);
                overlay.appendChild(overlayText);
            }
        };
        const hideOverlay = () => {
            overlay.classList.remove('visible');
            overlayText?.remove();
            overlayText = undefined;
        };
        this._register(new DragAndDropObserver(dndContainer, {
            onDragOver: (e) => {
                if (isDropSupported(e)) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer) {
                        e.dataTransfer.dropEffect = 'copy';
                    }
                    showOverlay();
                }
            },
            onDragLeave: () => {
                hideOverlay();
            },
            onDrop: async (e) => {
                e.preventDefault();
                e.stopPropagation();
                hideOverlay();
                // Extract editor data from VS Code internal drags (e.g., explorer view)
                const editorDropData = extractEditorsDropData(e);
                if (editorDropData.length > 0) {
                    for (const editor of editorDropData) {
                        if (editor.resource) {
                            await this._attachFileUri(editor.resource, basename(editor.resource));
                        }
                    }
                    return;
                }
                // Fallback: try native file items
                const items = e.dataTransfer?.items;
                if (items) {
                    for (const item of Array.from(items)) {
                        if (item.kind === 'file') {
                            const file = item.getAsFile();
                            if (!file) {
                                continue;
                            }
                            const filePath = getPathForFile(file);
                            if (!filePath) {
                                continue;
                            }
                            const uri = URI.file(filePath);
                            await this._attachFileUri(uri, file.name);
                        }
                    }
                }
            },
        }));
    }
    // --- Paste ---
    registerPasteHandler(element) {
        const supportedMimeTypes = [
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/bmp',
            'image/gif',
            'image/tiff'
        ];
        this._register(dom.addDisposableListener(element, dom.EventType.PASTE, async (e) => {
            const items = e.clipboardData?.items;
            if (!items) {
                return;
            }
            // Check synchronously for image data before any async work
            // so preventDefault stops the editor from inserting text.
            let imageFile;
            for (const item of Array.from(items)) {
                if (!item.type.startsWith('image/') || !supportedMimeTypes.includes(item.type)) {
                    continue;
                }
                const file = item.getAsFile();
                if (file) {
                    imageFile = file;
                    break;
                }
            }
            if (!imageFile) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const arrayBuffer = await imageFile.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            if (!isImage(data)) {
                return;
            }
            const resizedData = await resizeImage(data, imageFile.type);
            const displayName = this._getUniqueImageName();
            this._addAttachments({
                id: await imageToHash(resizedData),
                name: displayName,
                fullName: displayName,
                value: resizedData,
                kind: 'image',
            });
        }, true));
    }
    // --- Picker ---
    showPicker(folderUri) {
        const picker = this.quickInputService.createQuickPick({ useSeparators: true });
        const disposables = new DisposableStore();
        picker.placeholder = localize('chatContext.attach.placeholder', "Attach as context...");
        picker.matchOnDescription = true;
        picker.sortByLabel = false;
        const staticPicks = [
            {
                label: localize('files', "Files..."),
                iconClass: ThemeIcon.asClassName(Codicon.file),
                id: 'sessions.filesAndFolders',
            },
            {
                label: localize('imageFromClipboard', "Image from Clipboard"),
                iconClass: ThemeIcon.asClassName(Codicon.fileMedia),
                id: 'sessions.imageFromClipboard',
            },
        ];
        picker.items = staticPicks;
        picker.show();
        if (folderUri) {
            let searchCts;
            let debounceTimer;
            const runSearch = (filePattern) => {
                searchCts?.dispose(true);
                searchCts = new CancellationTokenSource();
                const token = searchCts.token;
                picker.busy = true;
                this._collectFilePicks(folderUri, filePattern, token).then(filePicks => {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    picker.busy = false;
                    if (filePicks.length > 0) {
                        picker.items = [
                            ...staticPicks,
                            { type: 'separator', label: basename(folderUri) },
                            ...filePicks,
                        ];
                    }
                    else {
                        picker.items = staticPicks;
                    }
                });
            };
            // Initial search (no filter)
            runSearch();
            // Re-search on user input with debounce
            disposables.add(picker.onDidChangeValue(value => {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                debounceTimer = setTimeout(() => runSearch(value || undefined), 200);
            }));
            disposables.add({ dispose: () => { searchCts?.dispose(true); if (debounceTimer) {
                    clearTimeout(debounceTimer);
                } } });
        }
        disposables.add(picker.onDidAccept(async () => {
            const [selected] = picker.selectedItems;
            if (!selected) {
                picker.hide();
                return;
            }
            picker.hide();
            if (selected.id === 'sessions.filesAndFolders') {
                await this._handleFileDialog();
            }
            else if (selected.id === 'sessions.imageFromClipboard') {
                await this._handleClipboardImage();
            }
            else if (selected.id) {
                await this._attachFileUri(URI.parse(selected.id), selected.label);
            }
        }));
        disposables.add(picker.onDidHide(() => {
            picker.dispose();
            disposables.dispose();
        }));
    }
    async _collectFilePicks(rootUri, filePattern, token) {
        const maxFiles = 200;
        // For local file:// URIs, use the search service which respects .gitignore and excludes
        if (rootUri.scheme === Schemas.file || rootUri.scheme === Schemas.vscodeRemote) {
            return this._collectFilePicksViaSearch(rootUri, maxFiles, filePattern, token);
        }
        // For virtual filesystems (e.g. github-remote-file://), walk the tree via IFileService
        return this._collectFilePicksViaFileService(rootUri, maxFiles, filePattern);
    }
    async _collectFilePicksViaSearch(rootUri, maxFiles, filePattern, token) {
        const excludePattern = getExcludes(this.configurationService.getValue({ resource: rootUri }));
        try {
            const searchResult = await this.searchService.fileSearch({
                folderQueries: [{
                        folder: rootUri,
                        disregardIgnoreFiles: false,
                    }],
                type: 1 /* QueryType.File */,
                filePattern: filePattern || '',
                excludePattern,
                sortByScore: true,
                maxResults: maxFiles,
            }, token);
            return searchResult.results.map(result => ({
                label: basename(result.resource),
                description: this.labelService.getUriLabel(result.resource, { relative: true }),
                iconClasses: getIconClasses(this.modelService, this.languageService, result.resource, FileKind.FILE),
                id: result.resource.toString(),
            }));
        }
        catch {
            return [];
        }
    }
    async _collectFilePicksViaFileService(rootUri, maxFiles, filePattern) {
        const picks = [];
        const patternLower = filePattern?.toLowerCase();
        const maxDepth = 10;
        const collect = async (uri, depth) => {
            if (picks.length >= maxFiles || depth > maxDepth) {
                return;
            }
            try {
                const stat = await this.fileService.resolve(uri);
                if (!stat.children) {
                    return;
                }
                const children = stat.children.slice().sort((a, b) => {
                    if (a.isDirectory !== b.isDirectory) {
                        return a.isDirectory ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                });
                for (const child of children) {
                    if (picks.length >= maxFiles) {
                        break;
                    }
                    if (child.isDirectory) {
                        await collect(child.resource, depth + 1);
                    }
                    else {
                        if (patternLower && !child.name.toLowerCase().includes(patternLower)) {
                            continue;
                        }
                        picks.push({
                            label: child.name,
                            description: this.labelService.getUriLabel(child.resource, { relative: true }),
                            iconClasses: getIconClasses(this.modelService, this.languageService, child.resource, FileKind.FILE),
                            id: child.resource.toString(),
                        });
                    }
                }
            }
            catch {
                // ignore errors for individual directories
            }
        };
        await collect(rootUri, 0);
        return picks;
    }
    async _handleFileDialog() {
        const selected = await this.fileDialogService.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: true,
            canSelectMany: true,
            title: localize('selectFilesOrFolders', "Select Files or Folders"),
        });
        if (!selected) {
            return;
        }
        for (const uri of selected) {
            await this._attachFileUri(uri, basename(uri));
        }
    }
    async _attachFileUri(uri, name) {
        let stat;
        try {
            stat = await this.fileService.stat(uri);
        }
        catch {
            return;
        }
        if (stat.isDirectory) {
            this._addAttachments({
                kind: 'directory',
                id: uri.toString(),
                value: uri,
                name,
            });
            return;
        }
        if (/\.(png|jpg|jpeg|bmp|gif|tiff)$/i.test(uri.path)) {
            const readFile = await this.fileService.readFile(uri);
            const resizedImage = await resizeImage(readFile.value.buffer);
            this._addAttachments({
                id: uri.toString(),
                name,
                fullName: name,
                value: resizedImage,
                kind: 'image',
                references: [{ reference: uri, kind: 'reference' }]
            });
        }
        else {
            let omittedState = 0 /* OmittedState.NotOmitted */;
            try {
                const ref = await this.textModelService.createModelReference(uri);
                ref.dispose();
            }
            catch {
                omittedState = 2 /* OmittedState.Full */;
            }
            this._addAttachments({
                kind: 'file',
                id: uri.toString(),
                value: uri,
                name,
                omittedState,
            });
        }
    }
    async _handleClipboardImage() {
        const imageData = await this.clipboardService.readImage();
        if (!isImage(imageData)) {
            return;
        }
        const displayName = this._getUniqueImageName();
        this._addAttachments({
            id: await imageToHash(imageData),
            name: displayName,
            fullName: displayName,
            value: imageData,
            kind: 'image',
        });
    }
    // --- State management ---
    _getUniqueImageName() {
        const baseName = localize('pastedImage', "Pasted Image");
        let name = baseName;
        for (let i = 2; this._attachedContext.some(a => a.name === name); i++) {
            name = `${baseName} ${i}`;
        }
        return name;
    }
    _addAttachments(...entries) {
        for (const entry of entries) {
            if (!this._attachedContext.some(e => e.id === entry.id)) {
                this._attachedContext.push(entry);
            }
        }
        this._updateRendering();
        this._onDidChangeContext.fire();
    }
    _removeAttachment(id) {
        const index = this._attachedContext.findIndex(e => e.id === id);
        if (index >= 0) {
            this._attachedContext.splice(index, 1);
            this._updateRendering();
            this._onDidChangeContext.fire();
        }
    }
    clear() {
        this._attachedContext.length = 0;
        this._updateRendering();
        this._onDidChangeContext.fire();
    }
};
NewChatContextAttachments = __decorate([
    __param(0, IQuickInputService),
    __param(1, ITextModelService),
    __param(2, IFileService),
    __param(3, IClipboardService),
    __param(4, IFileDialogService),
    __param(5, ILabelService),
    __param(6, ISearchService),
    __param(7, IConfigurationService),
    __param(8, IOpenerService),
    __param(9, IInstantiationService),
    __param(10, IModelService),
    __param(11, ILanguageService),
    __param(12, IChatImageCarouselService)
], NewChatContextAttachments);
export { NewChatContextAttachments };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV3Q2hhdENvbnRleHRBdHRhY2htZW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL25ld0NoYXRDb250ZXh0QXR0YWNobWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLG9CQUFvQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM1RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDM0YsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDbkgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0VBQWtFLENB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