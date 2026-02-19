/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, IQuickPickItemWithResource } from '../../../../platform/quickinput/common/quickInput.js';
import { AnythingQuickAccessProviderRunOptions } from '../../../../platform/quickinput/common/quickAccess.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { basename } from '../../../../base/common/resources.js';

import { AnythingQuickAccessProvider } from '../../../../workbench/contrib/search/browser/anythingQuickAccess.js';
import { IChatRequestVariableEntry, OmittedState } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { isSupportedChatFileScheme } from '../../../../workbench/contrib/chat/common/constants.js';
import { resizeImage } from '../../../../workbench/contrib/chat/browser/chatImageUtils.js';
import { imageToHash, isImage } from '../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js';
import { getPathForFile } from '../../../../platform/dnd/browser/dnd.js';

/**
 * Manages context attachments for the sessions new-chat widget.
 *
 * Supports:
 * - File picker via quick access ("Files and Open Folders...")
 * - Image from Clipboard
 * - Drag and drop files
 */
export class NewChatContextAttachments extends Disposable {

	private readonly _attachedContext: IChatRequestVariableEntry[] = [];
	private _container: HTMLElement | undefined;

	private readonly _onDidChangeContext = this._register(new Emitter<void>());
	readonly onDidChangeContext = this._onDidChangeContext.event;

	get attachments(): readonly IChatRequestVariableEntry[] {
		return this._attachedContext;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IFileService private readonly fileService: IFileService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
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
			this._register(dom.addDisposableListener(removeButton, dom.EventType.CLICK, (e) => {
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

	// --- Picker ---

	showPicker(): void {
		// Build addition picks for the quick access
		const additionPicks: IQuickPickItem[] = [];

		// "Files and Open Folders..." pick - opens a file dialog
		additionPicks.push({
			label: localize('filesAndFolders', "Files and Open Folders..."),
			iconClass: ThemeIcon.asClassName(Codicon.file),
			id: 'sessions.filesAndFolders',
		});

		// "Image from Clipboard" pick
		additionPicks.push({
			label: localize('imageFromClipboard', "Image from Clipboard"),
			iconClass: ThemeIcon.asClassName(Codicon.fileMedia),
			id: 'sessions.imageFromClipboard',
		});

		const providerOptions: AnythingQuickAccessProviderRunOptions = {
			filter: (pick) => {
				if (_isQuickPickItemWithResource(pick) && pick.resource) {
					return this.instantiationService.invokeFunction(accessor => isSupportedChatFileScheme(accessor, pick.resource!.scheme));
				}
				return true;
			},
			additionPicks,
			handleAccept: async (item: IQuickPickItem) => {
				if (item.id === 'sessions.filesAndFolders') {
					await this._handleFileDialog();
				} else if (item.id === 'sessions.imageFromClipboard') {
					await this._handleClipboardImage();
				} else {
					await this._handleFilePick(item as IQuickPickItemWithResource);
				}
			}
		};

		this.quickInputService.quickAccess.show('', {
			enabledProviderPrefixes: [AnythingQuickAccessProvider.PREFIX],
			placeholder: localize('chatContext.attach.placeholder', "Attach as context..."),
			providerOptions,
		});
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

	private async _handleFilePick(pick: IQuickPickItemWithResource): Promise<void> {
		if (!pick.resource) {
			return;
		}
		await this._attachFileUri(pick.resource, pick.label);
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

		this._addAttachments({
			id: await imageToHash(imageData),
			name: localize('pastedImage', "Pasted Image"),
			fullName: localize('pastedImage', "Pasted Image"),
			value: imageData,
			kind: 'image',
		});
	}

	// --- State management ---

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

function _isQuickPickItemWithResource(obj: unknown): obj is IQuickPickItemWithResource {
	return (
		isObject(obj)
		&& URI.isUri((obj as IQuickPickItemWithResource).resource));
}
