/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, DragAndDropObserver } from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { UriList } from '../../../../base/common/dataTransfer.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData, extractMarkerDropData, extractSymbolDropData } from '../../../../platform/dnd/browser/dnd.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { IChatWidgetService } from './chat.js';
import { ImageTransferData, resolveEditorAttachContext, resolveImageAttachContext, resolveMarkerAttachContext, resolveSymbolsAttachContext } from './chatAttachmentResolve.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { IChatInputStyles } from './chatInputPart.js';
import { convertStringToUInt8Array } from './imageUtils.js';

enum ChatDragAndDropType {
	FILE_INTERNAL,
	FILE_EXTERNAL,
	FOLDER,
	IMAGE,
	SYMBOL,
	HTML,
	MARKER,
}

const IMAGE_DATA_REGEX = /^data:image\/[a-z]+;base64,/;
const URL_REGEX = /^https?:\/\/.+/;

export class ChatDragAndDrop extends Themable {

	private readonly overlays: Map<HTMLElement, { overlay: HTMLElement; disposable: IDisposable }> = new Map();
	private overlayText?: HTMLElement;
	private overlayTextBackground: string = '';

	constructor(
		private readonly attachmentModel: ChatAttachmentModel,
		private readonly styles: IChatInputStyles,
		@IThemeService themeService: IThemeService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IDialogService private readonly dialogService: IDialogService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ISharedWebContentExtractorService private readonly webContentExtractorService: ISharedWebContentExtractorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ILogService private readonly logService: ILogService,
	) {
		super(themeService);

		this.updateStyles();
	}

	addOverlay(target: HTMLElement, overlayContainer: HTMLElement): void {
		this.removeOverlay(target);

		const { overlay, disposable } = this.createOverlay(target, overlayContainer);
		this.overlays.set(target, { overlay, disposable });
	}

	removeOverlay(target: HTMLElement): void {
		if (this.currentActiveTarget === target) {
			this.currentActiveTarget = undefined;
		}

		const existingOverlay = this.overlays.get(target);
		if (existingOverlay) {
			existingOverlay.overlay.remove();
			existingOverlay.disposable.dispose();
			this.overlays.delete(target);
		}
	}

	private currentActiveTarget: HTMLElement | undefined = undefined;
	private createOverlay(target: HTMLElement, overlayContainer: HTMLElement): { overlay: HTMLElement; disposable: IDisposable } {
		const overlay = document.createElement('div');
		overlay.classList.add('chat-dnd-overlay');
		this.updateOverlayStyles(overlay);
		overlayContainer.appendChild(overlay);

		const disposable = new DragAndDropObserver(target, {
			onDragOver: (e) => {
				e.stopPropagation();
				e.preventDefault();

				if (target === this.currentActiveTarget) {
					return;
				}

				if (this.currentActiveTarget) {
					this.setOverlay(this.currentActiveTarget, undefined);
				}

				this.currentActiveTarget = target;

				this.onDragEnter(e, target);

			},
			onDragLeave: (e) => {
				if (target === this.currentActiveTarget) {
					this.currentActiveTarget = undefined;
				}

				this.onDragLeave(e, target);
			},
			onDrop: (e) => {
				e.stopPropagation();
				e.preventDefault();

				if (target !== this.currentActiveTarget) {
					return;
				}

				this.currentActiveTarget = undefined;
				this.onDrop(e, target);
			},
		});

		return { overlay, disposable };
	}

	private onDragEnter(e: DragEvent, target: HTMLElement): void {
		const estimatedDropType = this.guessDropType(e);
		this.updateDropFeedback(e, target, estimatedDropType);
	}

	private onDragLeave(e: DragEvent, target: HTMLElement): void {
		this.updateDropFeedback(e, target, undefined);
	}

	private onDrop(e: DragEvent, target: HTMLElement): void {
		this.updateDropFeedback(e, target, undefined);
		this.drop(e);
	}

	private async drop(e: DragEvent): Promise<void> {
		const contexts = await this.resolveAttachmentsFromDragEvent(e);
		if (contexts.length === 0) {
			return;
		}

		this.attachmentModel.addContext(...contexts);
	}

	private updateDropFeedback(e: DragEvent, target: HTMLElement, dropType: ChatDragAndDropType | undefined): void {
		const showOverlay = dropType !== undefined;
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = showOverlay ? 'copy' : 'none';
		}

		this.setOverlay(target, dropType);
	}

	private guessDropType(e: DragEvent): ChatDragAndDropType | undefined {
		// This is an esstimation based on the datatransfer types/items
		if (containsImageDragType(e)) {
			return this.extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData')) ? ChatDragAndDropType.IMAGE : undefined;
		} else if (containsDragType(e, 'text/html')) {
			return ChatDragAndDropType.HTML;
		} else if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
			return ChatDragAndDropType.SYMBOL;
		} else if (containsDragType(e, CodeDataTransfers.MARKERS)) {
			return ChatDragAndDropType.MARKER;
		} else if (containsDragType(e, DataTransfers.FILES)) {
			return ChatDragAndDropType.FILE_EXTERNAL;
		} else if (containsDragType(e, DataTransfers.INTERNAL_URI_LIST)) {
			return ChatDragAndDropType.FILE_INTERNAL;
		} else if (containsDragType(e, Mimes.uriList, CodeDataTransfers.FILES, DataTransfers.RESOURCES)) {
			return ChatDragAndDropType.FOLDER;
		}

		return undefined;
	}

	private isDragEventSupported(e: DragEvent): boolean {
		// if guessed drop type is undefined, it means the drop is not supported
		const dropType = this.guessDropType(e);
		return dropType !== undefined;
	}

	private getDropTypeName(type: ChatDragAndDropType): string {
		switch (type) {
			case ChatDragAndDropType.FILE_INTERNAL: return localize('file', 'File');
			case ChatDragAndDropType.FILE_EXTERNAL: return localize('file', 'File');
			case ChatDragAndDropType.FOLDER: return localize('folder', 'Folder');
			case ChatDragAndDropType.IMAGE: return localize('image', 'Image');
			case ChatDragAndDropType.SYMBOL: return localize('symbol', 'Symbol');
			case ChatDragAndDropType.MARKER: return localize('problem', 'Problem');
			case ChatDragAndDropType.HTML: return localize('url', 'URL');
		}
	}

	private async resolveAttachmentsFromDragEvent(e: DragEvent): Promise<IChatRequestVariableEntry[]> {
		if (!this.isDragEventSupported(e)) {
			return [];
		}

		const markerData = extractMarkerDropData(e);
		if (markerData) {
			return resolveMarkerAttachContext(markerData);
		}

		if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
			const symbolsData = extractSymbolDropData(e);
			return resolveSymbolsAttachContext(symbolsData);
		}

		const editorDragData = extractEditorsDropData(e);
		if (editorDragData.length > 0) {
			return coalesce(await Promise.all(editorDragData.map(editorInput => {
				return resolveEditorAttachContext(editorInput, this.fileService, this.editorService, this.textModelService, this.extensionService, this.dialogService);
			})));
		}

		if (!containsDragType(e, DataTransfers.INTERNAL_URI_LIST) && containsDragType(e, Mimes.uriList) && ((containsDragType(e, Mimes.html) || containsDragType(e, Mimes.text) /* Text mime needed for safari support */))) {
			return this.resolveHTMLAttachContext(e);
		}

		return [];
	}

	private async downloadImageAsUint8Array(url: string): Promise<Uint8Array | undefined> {
		try {
			const extractedImages = await this.webContentExtractorService.readImage(URI.parse(url), CancellationToken.None);
			if (extractedImages) {
				return extractedImages.buffer;
			}
		} catch (error) {
			this.logService.warn('Fetch failed:', error);
		}

		// TODO: use dnd provider to insert text @justschen
		const selection = this.chatWidgetService.lastFocusedWidget?.inputEditor.getSelection();
		if (selection && this.chatWidgetService.lastFocusedWidget) {
			this.chatWidgetService.lastFocusedWidget.inputEditor.executeEdits('chatInsertUrl', [{ range: selection, text: url }]);
		}

		this.logService.warn(`Image URLs must end in .jpg, .png, .gif, .webp, or .bmp. Failed to fetch image from this URL: ${url}`);
		return undefined;
	}

	private async resolveHTMLAttachContext(e: DragEvent): Promise<IChatRequestVariableEntry[]> {
		const existingAttachmentNames = new Set<string>(this.attachmentModel.attachments.map(attachment => attachment.name));
		const createDisplayName = (): string => {
			const baseName = localize('dragAndDroppedImageName', 'Image from URL');
			let uniqueName = baseName;
			let baseNameInstance = 1;

			while (existingAttachmentNames.has(uniqueName)) {
				uniqueName = `${baseName} ${++baseNameInstance}`;
			}

			existingAttachmentNames.add(uniqueName);
			return uniqueName;
		};

		const getImageTransferDataFromUrl = async (url: string): Promise<ImageTransferData | undefined> => {
			const resource = URI.parse(url);

			if (IMAGE_DATA_REGEX.test(url)) {
				return { data: await convertStringToUInt8Array(url), name: createDisplayName(), resource };
			}

			if (URL_REGEX.test(url)) {
				const data = await this.downloadImageAsUint8Array(url);
				if (data) {
					return { data, name: createDisplayName(), resource, id: url };
				}
			}

			return undefined;
		};

		const getImageTransferDataFromFile = async (file: File): Promise<ImageTransferData | undefined> => {
			try {
				const buffer = await file.arrayBuffer();
				return { data: new Uint8Array(buffer), name: createDisplayName() };
			} catch (error) {
				this.logService.error('Error reading file:', error);
			}

			return undefined;
		};

		const imageTransferData: ImageTransferData[] = [];

		// Image Web File Drag and Drop
		const imageFiles = extractImageFilesFromDragEvent(e);
		if (imageFiles.length) {
			const imageTransferDataFromFiles = await Promise.all(imageFiles.map(file => getImageTransferDataFromFile(file)));
			imageTransferData.push(...imageTransferDataFromFiles.filter(data => !!data));
		}

		// Image Web URL Drag and Drop
		const imageUrls = extractUrlsFromDragEvent(e);
		if (imageUrls.length) {
			const imageTransferDataFromUrl = await Promise.all(imageUrls.map(getImageTransferDataFromUrl));
			imageTransferData.push(...imageTransferDataFromUrl.filter(data => !!data));
		}

		return await resolveImageAttachContext(imageTransferData);
	}

	private setOverlay(target: HTMLElement, type: ChatDragAndDropType | undefined): void {
		// Remove any previous overlay text
		this.overlayText?.remove();
		this.overlayText = undefined;

		const { overlay } = this.overlays.get(target)!;
		if (type !== undefined) {
			// Render the overlay text

			const iconAndtextElements = renderLabelWithIcons(`$(${Codicon.attach.id}) ${this.getOverlayText(type)}`);
			const htmlElements = iconAndtextElements.map(element => {
				if (typeof element === 'string') {
					return $('span.overlay-text', undefined, element);
				}
				return element;
			});

			this.overlayText = $('span.attach-context-overlay-text', undefined, ...htmlElements);
			this.overlayText.style.backgroundColor = this.overlayTextBackground;
			overlay.appendChild(this.overlayText);
		}

		overlay.classList.toggle('visible', type !== undefined);
	}

	private getOverlayText(type: ChatDragAndDropType): string {
		const typeName = this.getDropTypeName(type);
		return localize('attacAsContext', 'Attach {0} as Context', typeName);
	}

	private updateOverlayStyles(overlay: HTMLElement): void {
		overlay.style.backgroundColor = this.getColor(this.styles.overlayBackground) || '';
		overlay.style.color = this.getColor(this.styles.listForeground) || '';
	}

	override updateStyles(): void {
		this.overlays.forEach(overlay => this.updateOverlayStyles(overlay.overlay));
		this.overlayTextBackground = this.getColor(this.styles.listBackground) || '';
	}
}

function containsImageDragType(e: DragEvent): boolean {
	// Image detection should not have false positives, only false negatives are allowed
	if (containsDragType(e, 'image')) {
		return true;
	}

	if (containsDragType(e, DataTransfers.FILES)) {
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			return Array.from(files).some(file => file.type.startsWith('image/'));
		}

		const items = e.dataTransfer?.items;
		if (items && items.length > 0) {
			return Array.from(items).some(item => item.type.startsWith('image/'));
		}
	}

	return false;
}

function extractUrlsFromDragEvent(e: DragEvent, logService?: ILogService): string[] {
	const textUrl = e.dataTransfer?.getData('text/uri-list');
	if (textUrl) {
		try {
			const urls = UriList.parse(textUrl);
			if (urls.length > 0) {
				return urls;
			}
		} catch (error) {
			logService?.error('Error parsing URI list:', error);
			return [];
		}
	}

	return [];
}

function extractImageFilesFromDragEvent(e: DragEvent): File[] {
	const files = e.dataTransfer?.files;
	if (!files) {
		return [];
	}

	return Array.from(files).filter(file => file.type.startsWith('image/'));
}
