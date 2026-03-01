/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DragAndDropObserver } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { renderIcon, renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { registerOpenEditorListeners } from '../../../../platform/editor/browser/editor.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { basename } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';

import { IChatRequestVariableEntry, OmittedState } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { resizeImage } from '../../../../workbench/contrib/chat/browser/chatImageUtils.js';
import { imageToHash, isImage } from '../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData, getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { getExcludes, ISearchConfiguration, ISearchService, QueryType } from '../../../../workbench/services/search/common/search.js';

/**
 * Manages context attachments for the sessions new-chat widget.
 *
 * Supports:
 * - File picker via quick access ("Files and Open Folders...")
 * - Image from Clipboard
 * - Drag and drop files
 * - Paste images from clipboard (Ctrl/Cmd+V)
 */
export class NewChatContextAttachments extends Disposable {

	private readonly _attachedContext: IChatRequestVariableEntry[] = [];
	private _container: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	private readonly _onDidChangeContext = this._register(new Emitter<void>());
	readonly onDidChangeContext = this._onDidChangeContext.event;

	get attachments(): readonly IChatRequestVariableEntry[] {
		return this._attachedContext;
	}

	setAttachments(entries: readonly IChatRequestVariableEntry[]): void {
		this._attachedContext.length = 0;
		this._attachedContext.push(...entries);
		this._updateRendering();
		this._onDidChangeContext.fire();
	}

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IFileService private readonly fileService: IFileService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ILabelService private readonly labelService: ILabelService,
		@ISearchService private readonly searchService: ISearchService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
	}

	// --- Rendering ---

	renderAttachedContext(container: HTMLElement): void {
		this._container = container;
		this._updateRendering();
	}

	private _updateRendering(): void {
		if (!this._container) {
			return;
		}

		this._renderDisposables.clear();
		dom.clearNode(this._container);

		if (this._attachedContext.length === 0) {
			this._container.style.display = 'none';
			return;
		}

		this._container.style.display = '';

		for (const entry of this._attachedContext) {
			const pill = dom.append(this._container, dom.$('.sessions-chat-attachment-pill'));
			pill.tabIndex = 0;
			pill.role = 'button';
			const icon = entry.kind === 'image' ? Codicon.fileMedia : entry.kind === 'directory' ? Codicon.folder : Codicon.file;
			dom.append(pill, renderIcon(icon));
			dom.append(pill, dom.$('span.sessions-chat-attachment-name', undefined, entry.name));

			// Click to open the resource
			const resource = URI.isUri(entry.value) ? entry.value : isLocation(entry.value) ? entry.value.uri : undefined;
			if (resource) {
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

	registerDropTarget(dndContainer: HTMLElement): void {
		const overlay = dom.append(dndContainer, dom.$('.sessions-chat-dnd-overlay'));
		let overlayText: HTMLElement | undefined;

		const isDropSupported = (e: DragEvent): boolean => {
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

	registerPasteHandler(element: HTMLElement): void {
		const supportedMimeTypes = [
			'image/png',
			'image/jpeg',
			'image/jpg',
			'image/bmp',
			'image/gif',
			'image/tiff'
		];

		this._register(dom.addDisposableListener(element, dom.EventType.PASTE, async (e: ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) {
				return;
			}

			// Check synchronously for image data before any async work
			// so preventDefault stops the editor from inserting text.
			let imageFile: File | undefined;
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

	showPicker(folderUri?: URI): void {
		const picker = this.quickInputService.createQuickPick<IQuickPickItem>({ useSeparators: true });
		const disposables = new DisposableStore();
		picker.placeholder = localize('chatContext.attach.placeholder', "Attach as context...");
		picker.matchOnDescription = true;
		picker.sortByLabel = false;

		const staticPicks: (IQuickPickItem | IQuickPickSeparator)[] = [
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
			let searchCts: CancellationTokenSource | undefined;
			let debounceTimer: ReturnType<typeof setTimeout> | undefined;

			const runSearch = (filePattern?: string) => {
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
					} else {
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

			disposables.add({ dispose: () => { searchCts?.dispose(true); if (debounceTimer) { clearTimeout(debounceTimer); } } });
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
			} else if (selected.id === 'sessions.imageFromClipboard') {
				await this._handleClipboardImage();
			} else if (selected.id) {
				await this._attachFileUri(URI.parse(selected.id), selected.label);
			}
		}));

		disposables.add(picker.onDidHide(() => {
			picker.dispose();
			disposables.dispose();
		}));
	}

	private async _collectFilePicks(rootUri: URI, filePattern?: string, token?: CancellationToken): Promise<IQuickPickItem[]> {
		const maxFiles = 200;

		// For local file:// URIs, use the search service which respects .gitignore and excludes
		if (rootUri.scheme === Schemas.file || rootUri.scheme === Schemas.vscodeRemote) {
			return this._collectFilePicksViaSearch(rootUri, maxFiles, filePattern, token);
		}

		// For virtual filesystems (e.g. github-remote-file://), walk the tree via IFileService
		return this._collectFilePicksViaFileService(rootUri, maxFiles, filePattern);
	}

	private async _collectFilePicksViaSearch(rootUri: URI, maxFiles: number, filePattern?: string, token?: CancellationToken): Promise<IQuickPickItem[]> {
		const excludePattern = getExcludes(this.configurationService.getValue<ISearchConfiguration>({ resource: rootUri }));

		try {
			const searchResult = await this.searchService.fileSearch({
				folderQueries: [{
					folder: rootUri,
					disregardIgnoreFiles: false,
				}],
				type: QueryType.File,
				filePattern: filePattern || '',
				excludePattern,
				sortByScore: true,
				maxResults: maxFiles,
			}, token);

			return searchResult.results.map(result => ({
				label: basename(result.resource),
				description: this.labelService.getUriLabel(result.resource, { relative: true }),
				iconClass: ThemeIcon.asClassName(Codicon.file),
				id: result.resource.toString(),
			} satisfies IQuickPickItem));
		} catch {
			return [];
		}
	}

	private async _collectFilePicksViaFileService(rootUri: URI, maxFiles: number, filePattern?: string): Promise<IQuickPickItem[]> {
		const picks: IQuickPickItem[] = [];
		const patternLower = filePattern?.toLowerCase();
		const maxDepth = 10;

		const collect = async (uri: URI, depth: number): Promise<void> => {
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
					} else {
						if (patternLower && !child.name.toLowerCase().includes(patternLower)) {
							continue;
						}
						picks.push({
							label: child.name,
							description: this.labelService.getUriLabel(child.resource, { relative: true }),
							iconClass: ThemeIcon.asClassName(Codicon.file),
							id: child.resource.toString(),
						});
					}
				}
			} catch {
				// ignore errors for individual directories
			}
		};

		await collect(rootUri, 0);
		return picks;
	}

	private async _handleFileDialog(): Promise<void> {
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

	private async _attachFileUri(uri: URI, name: string): Promise<void> {
		let stat;
		try {
			stat = await this.fileService.stat(uri);
		} catch {
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
		} else {
			let omittedState = OmittedState.NotOmitted;
			try {
				const ref = await this.textModelService.createModelReference(uri);
				ref.dispose();
			} catch {
				omittedState = OmittedState.Full;
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

	private async _handleClipboardImage(): Promise<void> {
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

	private _getUniqueImageName(): string {
		const baseName = localize('pastedImage', "Pasted Image");
		let name = baseName;
		for (let i = 2; this._attachedContext.some(a => a.name === name); i++) {
			name = `${baseName} ${i}`;
		}
		return name;
	}

	private _addAttachments(...entries: IChatRequestVariableEntry[]): void {
		for (const entry of entries) {
			if (!this._attachedContext.some(e => e.id === entry.id)) {
				this._attachedContext.push(entry);
			}
		}
		this._updateRendering();
		this._onDidChangeContext.fire();
	}

	private _removeAttachment(id: string): void {
		const index = this._attachedContext.findIndex(e => e.id === id);
		if (index >= 0) {
			this._attachedContext.splice(index, 1);
			this._updateRendering();
			this._onDidChangeContext.fire();
		}
	}

	clear(): void {
		this._attachedContext.length = 0;
		this._updateRendering();
		this._onDidChangeContext.fire();
	}
}
