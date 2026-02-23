/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

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
import { resizeImage } from '../../../../workbench/contrib/chat/browser/chatImageUtils.js';
import { imageToHash, isImage } from '../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js';
import { getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
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

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IFileService private readonly fileService: IFileService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ILabelService private readonly labelService: ILabelService,
		@ISearchService private readonly searchService: ISearchService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
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
			const icon = entry.kind === 'image' ? Codicon.fileMedia : Codicon.file;
			dom.append(pill, renderIcon(icon));
			dom.append(pill, dom.$('span.sessions-chat-attachment-name', undefined, entry.name));

			const removeButton = dom.append(pill, dom.$('.sessions-chat-attachment-remove'));
			removeButton.title = localize('removeAttachment', "Remove");
			removeButton.tabIndex = 0;
			removeButton.role = 'button';
			dom.append(removeButton, renderIcon(Codicon.close));
			this._renderDisposables.add(dom.addDisposableListener(removeButton, dom.EventType.CLICK, (e) => {
				e.stopPropagation();
				this._removeAttachment(entry.id);
			}));
		}
	}

	// --- Drag and drop ---

	registerDropTarget(element: HTMLElement): void {
		// Use a transparent overlay during drag to capture events over the Monaco editor
		const overlay = dom.append(element, dom.$('.sessions-chat-drop-overlay'));

		// Use capture phase to intercept drag events before Monaco editor handles them
		this._register(dom.addDisposableListener(element, dom.EventType.DRAG_ENTER, (e: DragEvent) => {
			if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'copy';
				overlay.style.display = 'block';
				element.classList.add('sessions-chat-drop-active');
			}
		}, true));

		this._register(dom.addDisposableListener(element, dom.EventType.DRAG_OVER, (e: DragEvent) => {
			if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'copy';
				if (overlay.style.display !== 'block') {
					overlay.style.display = 'block';
					element.classList.add('sessions-chat-drop-active');
				}
			}
		}, true));

		this._register(dom.addDisposableListener(overlay, dom.EventType.DRAG_OVER, (e) => {
			e.preventDefault();
			e.dataTransfer!.dropEffect = 'copy';
		}));

		this._register(dom.addDisposableListener(overlay, dom.EventType.DRAG_LEAVE, (e) => {
			if (e.relatedTarget && element.contains(e.relatedTarget as Node)) {
				return;
			}
			overlay.style.display = 'none';
			element.classList.remove('sessions-chat-drop-active');
		}));

		this._register(dom.addDisposableListener(overlay, dom.EventType.DROP, async (e) => {
			e.preventDefault();
			e.stopPropagation();
			overlay.style.display = 'none';
			element.classList.remove('sessions-chat-drop-active');

			// Try items first (for URI-based drops from VS Code tree views)
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
