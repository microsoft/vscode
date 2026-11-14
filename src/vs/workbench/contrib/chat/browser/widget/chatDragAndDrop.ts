/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from '../../../../../base/browser/dnd.js';
import { $, DragAndDropObserver, getWindow } from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { UriList } from '../../../../../base/common/dataTransfer.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CodeDataTransfers, containsDragType, extractChatReferenceDropData, extractEditorsDropData, extractMarkerDropData, extractNotebookCellOutputDropData, extractSymbolDropData } from '../../../../../platform/dnd/browser/dnd.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IThemeService, Themable } from '../../../../../platform/theme/common/themeService.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { extractSCMHistoryItemDropData } from '../../../scm/browser/scmHistoryChatContext.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { isAgentHostTarget } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatAttachmentTarget, IChatWidget } from '../chat.js';
import { IChatAttachmentResolveService, ImageTransferData } from '../attachments/chatAttachmentResolveService.js';
import { isCrossAgentHostChatReferenceDrop, isSelfChatReferenceDrop, resolveChatReferenceDropEntry } from './chatReferenceDrop.js';
import { IChatInputStyles } from './input/chatInputPart.js';
import { convertStringToUInt8Array } from '../chatImageUtils.js';
import { isPassThroughDrag, registerInputDropTarget } from '../../../../browser/dnd.js';

enum ChatDragAndDropType {
	CHAT_REFERENCE,
	FILE_INTERNAL,
	FILE_EXTERNAL,
	FOLDER,
	IMAGE,
	SYMBOL,
	HTML,
	MARKER,
	NOTEBOOK_CELL_OUTPUT,
	SCM_HISTORY_ITEM
}

const IMAGE_DATA_REGEX = /^data:image\/[a-z]+;base64,/;
const URL_REGEX = /^https?:\/\/.+/;

export class ChatDragAndDrop extends Themable {

	private readonly overlays: Map<HTMLElement, { overlay: HTMLElement; disposable: IDisposable; observer: DragAndDropObserver }> = new Map();
	private overlayText?: HTMLElement;
	private overlayTextBackground: string = '';
	private disableOverlay: boolean = false;

	constructor(
		private readonly widgetRef: () => IChatWidget | undefined,
		private readonly attachmentTarget: IChatAttachmentTarget,
		private readonly styles: IChatInputStyles,
		@IThemeService themeService: IThemeService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ISharedWebContentExtractorService private readonly webContentExtractorService: ISharedWebContentExtractorService,
		@ILogService private readonly logService: ILogService,
		@IChatAttachmentResolveService private readonly chatAttachmentResolveService: IChatAttachmentResolveService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
	) {
		super(themeService);

		this.updateStyles();

		this._register(toDisposable(() => {
			this.overlays.forEach(({ overlay, disposable }) => {
				disposable.dispose();
				overlay.remove();
			});

			this.overlays.clear();
			this.currentActiveTarget = undefined;
			this.overlayText?.remove();
			this.overlayText = undefined;
		}));
	}

	addOverlay(target: HTMLElement, overlayContainer: HTMLElement, inputTarget: HTMLElement = target): void {
		this.removeOverlay(target);

		this.overlays.set(target, this.createOverlay(target, overlayContainer, inputTarget));
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

	setDisabledOverlay(disable: boolean) {
		this.disableOverlay = disable;
	}

	/** Clears feedback and enter/leave tracking after an internally handled drag. */
	resetDragState(): void {
		if (this.currentActiveTarget) {
			this.setOverlay(this.currentActiveTarget, undefined);
			this.currentActiveTarget = undefined;
		}
		for (const { observer } of this.overlays.values()) {
			observer.reset();
		}
	}

	private currentActiveTarget: HTMLElement | undefined = undefined;
	private createOverlay(target: HTMLElement, overlayContainer: HTMLElement, inputTarget: HTMLElement): { overlay: HTMLElement; disposable: IDisposable; observer: DragAndDropObserver } {
		const overlay = document.createElement('div');
		overlay.classList.add('chat-dnd-overlay');
		this.updateOverlayStyles(overlay);
		overlayContainer.appendChild(overlay);

		const disposable = new DisposableStore();
		// The pane around the input, such as a grid that opens what is dropped on it, leaves the input the drags it takes.
		disposable.add(registerInputDropTarget(inputTarget, {
			accepts: e => !this.disableOverlay && this.isDragEventSupported(e),
			area: target,
			getHint: passThroughModifier => passThroughModifier
				? localize({ key: 'chatInputDropHintWithModifier', comment: ['{0} is a key, such as Shift. Keep the underscores around it: they show it as a key.'] }, "Drag here or hold __{0}__ to attach to chat", passThroughModifier)
				: localize('chatInputDropHint', "Drag here to attach to chat"),
		}));
		// Whether a pane around the target lets the drag through to it, such as the editor area of a chat editor while the key
		// to drop into the editor is held. The input takes it then, as with the drag over it, until the drag leaves: also
		// once the key is released, as the drop still attaches until the pane takes the drag again.
		let letThrough = false;
		const observer = disposable.add(new DragAndDropObserver(target, {
			onDragOver: (e) => {
				if (this.disableOverlay) {
					return;
				}

				e.stopPropagation();
				e.preventDefault();

				const entering = target !== this.currentActiveTarget;
				letThrough = (letThrough && !entering) || isPassThroughDrag(target, e);
				this.layoutOverlay(overlay, overlayContainer, target, inputTarget, e, letThrough);

				if (!entering) {
					return;
				}

				if (this.currentActiveTarget) {
					this.setOverlay(this.currentActiveTarget, undefined);
				}

				this.currentActiveTarget = target;

				this.onDragEnter(e, target);

			},
			onDragLeave: (e) => {
				if (this.disableOverlay) {
					return;
				}
				if (target === this.currentActiveTarget) {
					this.currentActiveTarget = undefined;
				}

				this.onDragLeave(e, target);
			},
			onDrop: (e) => {
				if (this.disableOverlay) {
					return;
				}
				e.stopPropagation();
				e.preventDefault();

				if (target !== this.currentActiveTarget) {
					return;
				}

				this.currentActiveTarget = undefined;
				this.onDrop(e, target);
			},
		}));

		return { overlay, disposable, observer };
	}

	/**
	 * Fits the overlay to what takes the drop: the input while the drag is over it, as the pane around the input, such as
	 * a grid that opens what is dropped on it, can take the drag elsewhere, and while that pane lets the drag through to
	 * the target (`letThrough`); else the whole target, whose drags outside the input reach it only where nothing around
	 * it takes them.
	 */
	private layoutOverlay(overlay: HTMLElement, overlayContainer: HTMLElement, target: HTMLElement, inputTarget: HTMLElement, e: DragEvent, letThrough: boolean): void {
		if (inputTarget === target) {
			return;
		}

		const input = inputTarget.getBoundingClientRect();
		const overInput = e.clientX >= input.left && e.clientX <= input.right && e.clientY >= input.top && e.clientY <= input.bottom;
		if (input.width <= 0 || input.height <= 0 || !(overInput || letThrough)) {
			overlay.style.top = overlay.style.left = overlay.style.width = overlay.style.height = overlay.style.borderRadius = '';
			return;
		}

		// Measures before it writes, as this runs on every `dragover`
		const container = overlayContainer.getBoundingClientRect();
		const top = input.top - container.top - overlayContainer.clientTop;
		const left = input.left - container.left - overlayContainer.clientLeft;
		// Shaped as the input is, whose corners depend on where it shows and on what is docked on it.
		const borderRadius = getWindow(inputTarget).getComputedStyle(inputTarget).borderRadius;
		overlay.style.top = `${top}px`;
		overlay.style.left = `${left}px`;
		overlay.style.width = `${input.width}px`;
		overlay.style.height = `${input.height}px`;
		overlay.style.borderRadius = borderRadius;
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
		// Resolving the dropped attachments takes time, so the drop point is mapped while the input is as it was dropped on.
		const dropPosition = this.attachmentTarget.getDropPosition?.(e.clientX, e.clientY);
		const contexts = await this.resolveAttachmentsFromDragEvent(e);
		if (contexts.length === 0) {
			return;
		}

		this.attachmentTarget.addAttachments(contexts, dropPosition);
	}

	private updateDropFeedback(e: DragEvent, target: HTMLElement, dropType: ChatDragAndDropType | undefined): void {
		const showOverlay = dropType !== undefined;
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = showOverlay ? 'copy' : 'none';
		}

		this.setOverlay(target, dropType);
	}

	private guessDropType(e: DragEvent): ChatDragAndDropType | undefined {
		// This is an estimation based on the datatransfer types/items
		if (containsDragType(e, CodeDataTransfers.CHAT_REFERENCE)) {
			return this.guessChatReferenceDropType(e);
		} else if (containsDragType(e, CodeDataTransfers.NOTEBOOK_CELL_OUTPUT)) {
			return ChatDragAndDropType.NOTEBOOK_CELL_OUTPUT;
		} else if (containsDragType(e, CodeDataTransfers.SCM_HISTORY_ITEM)) {
			return ChatDragAndDropType.SCM_HISTORY_ITEM;
		} else if (containsImageDragType(e)) {
			return this.extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData')) ? ChatDragAndDropType.IMAGE : undefined;
		} else if (containsDragType(e, 'text/html')) {
			return ChatDragAndDropType.HTML;
		} else if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
			return ChatDragAndDropType.SYMBOL;
		} else if (containsDragType(e, CodeDataTransfers.MARKERS)) {
			return ChatDragAndDropType.MARKER;
		} else if (containsDragType(e, DataTransfers.FILES)) {
			return ChatDragAndDropType.FILE_EXTERNAL;
		} else if (containsDragType(e, CodeDataTransfers.EDITORS)) {
			return ChatDragAndDropType.FILE_INTERNAL;
		} else if (containsDragType(e, Mimes.uriList, CodeDataTransfers.FILES, DataTransfers.RESOURCES, DataTransfers.INTERNAL_URI_LIST)) {
			return ChatDragAndDropType.FOLDER;
		}

		return undefined;
	}

	/**
	 * Resolves the drop type for a dragged chat reference. Only agent-host-backed
	 * chat inputs can reference another chat, and a chat may reference any other
	 * chat of the *same agent host* — including one from a different session shown
	 * side by side in the Agents window.
	 *
	 * Two payload-dependent guards suppress the overlay entirely (rather than
	 * appearing droppable and then doing nothing):
	 * - a self-reference (a chat dropped onto its *own* input), and
	 * - a cross-agent-host reference, which the owning host could never resolve.
	 *
	 * The dragged chat's client resource is read with {@link extractChatReferenceDropData}
	 * (from the drag in progress during `dragover`, from the `dataTransfer` payload
	 * on `drop`), and compared against this input's own client session resource.
	 * Both are opaque client URIs, so the workbench never touches an AHP chat URI.
	 */
	private guessChatReferenceDropType(e: DragEvent): ChatDragAndDropType | undefined {
		const sessionResource = this.widgetRef()?.viewModel?.model.sessionResource;
		if (!sessionResource || !isAgentHostTarget(getChatSessionType(sessionResource))) {
			return undefined;
		}
		const droppedClientResource = extractChatReferenceDropData(e)?.clientResource;
		if (droppedClientResource !== undefined
			&& (isSelfChatReferenceDrop(droppedClientResource, sessionResource.toString())
				|| isCrossAgentHostChatReferenceDrop(droppedClientResource, sessionResource.toString(), this.agentHostConnectionsService))) {
			return undefined;
		}
		return ChatDragAndDropType.CHAT_REFERENCE;
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
			case ChatDragAndDropType.NOTEBOOK_CELL_OUTPUT: return localize('notebookOutput', 'Output');
			case ChatDragAndDropType.SCM_HISTORY_ITEM: return localize('scmHistoryItem', 'Change');
			case ChatDragAndDropType.CHAT_REFERENCE: return localize('chat', 'Chat');
		}
	}

	private async resolveAttachmentsFromDragEvent(e: DragEvent): Promise<IChatRequestVariableEntry[]> {
		if (!this.isDragEventSupported(e)) {
			return [];
		}

		if (containsDragType(e, CodeDataTransfers.CHAT_REFERENCE)) {
			return this.resolveChatReferenceAttachContext(e);
		}

		if (containsDragType(e, CodeDataTransfers.NOTEBOOK_CELL_OUTPUT)) {
			const notebookOutputData = extractNotebookCellOutputDropData(e);
			if (notebookOutputData) {
				return this.chatAttachmentResolveService.resolveNotebookOutputAttachContext(notebookOutputData);
			}
		}

		if (containsDragType(e, CodeDataTransfers.SCM_HISTORY_ITEM)) {
			const scmHistoryItemData = extractSCMHistoryItemDropData(e);
			if (scmHistoryItemData) {
				return this.chatAttachmentResolveService.resolveSourceControlHistoryItemAttachContext(scmHistoryItemData);
			}
		}

		const markerData = extractMarkerDropData(e);
		if (markerData) {
			return this.chatAttachmentResolveService.resolveMarkerAttachContext(markerData);
		}

		if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
			const symbolsData = extractSymbolDropData(e);
			return this.chatAttachmentResolveService.resolveSymbolsAttachContext(symbolsData);
		}

		const editorDragData = extractEditorsDropData(e);
		if (editorDragData.length > 0) {
			return coalesce(await Promise.all(editorDragData.map(editorInput => {
				return this.chatAttachmentResolveService.resolveEditorAttachContext(editorInput);
			})));
		}

		const internal = e.dataTransfer?.getData(DataTransfers.INTERNAL_URI_LIST);
		if (internal) {
			const uriList = UriList.parse(internal);
			if (uriList.length) {
				return coalesce(await Promise.all(
					uriList.map(uri => this.chatAttachmentResolveService.resolveEditorAttachContext({ resource: URI.parse(uri) }))
				));
			}
		}

		if (!containsDragType(e, DataTransfers.INTERNAL_URI_LIST) && containsDragType(e, Mimes.uriList) && ((containsDragType(e, Mimes.html) || containsDragType(e, Mimes.text) /* Text mime needed for safari support */))) {
			return this.resolveHTMLAttachContext(e);
		}

		return [];
	}

	/**
	 * Resolves a dropped chat reference (a chat tab from the Agents window) to a
	 * plain chat-reference attachment (a pill) — the same shape every other drop
	 * type produces, with no inline text, range, or editor manipulation.
	 *
	 * The target must be an agent-host-backed input; the actual resolution and
	 * the self / cross-agent-host guards live in {@link resolveChatReferenceDropEntry}.
	 * Returns `[]` when any guard rejects.
	 */
	private resolveChatReferenceAttachContext(e: DragEvent): IChatRequestVariableEntry[] {
		const data = extractChatReferenceDropData(e);
		if (!data) {
			return [];
		}

		const sessionResource = this.widgetRef()?.viewModel?.model.sessionResource;
		const ownClientResource = sessionResource && isAgentHostTarget(getChatSessionType(sessionResource))
			? sessionResource.toString()
			: undefined;

		const entry = resolveChatReferenceDropEntry(data, ownClientResource, this.agentHostConnectionsService);
		return entry ? [entry] : [];
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
		const widget = this.widgetRef();
		const selection = widget?.inputEditor.getSelection();
		if (selection && widget) {
			widget.inputEditor.executeEdits('chatInsertUrl', [{ range: selection, text: url }]);
		}

		this.logService.warn(`Image URLs must end in .jpg, .png, .gif, .webp, or .bmp. Failed to fetch image from this URL: ${url}`);
		return undefined;
	}

	private async resolveHTMLAttachContext(e: DragEvent): Promise<IChatRequestVariableEntry[]> {
		const existingAttachmentNames = new Set<string>(this.attachmentTarget.attachments.map(attachment => attachment.name));
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
				return { data: convertStringToUInt8Array(url), name: createDisplayName(), resource };
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

		return await this.chatAttachmentResolveService.resolveImageAttachContext(imageTransferData);
	}

	private setOverlay(target: HTMLElement, type: ChatDragAndDropType | undefined): void {
		// Remove any previous overlay text
		this.overlayText?.remove();
		this.overlayText = undefined;

		const { overlay } = this.overlays.get(target)!;
		if (type !== undefined) {
			// Render the overlay text

			const iconAndtextElements = renderLabelWithIcons(`$(${Codicon.attachCompact.id}) ${this.getOverlayText(type)}`);
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
