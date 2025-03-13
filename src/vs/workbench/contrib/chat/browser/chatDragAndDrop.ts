/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, DragAndDropObserver } from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { SymbolKinds } from '../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { CodeDataTransfers, containsDragType, DocumentSymbolTransferData, extractEditorsDropData, extractMarkerDropData, extractSymbolDropData, IDraggedResourceEditorInput, MarkerTransferData } from '../../../../platform/dnd/browser/dnd.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { isUntitledResourceEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntry, IDiagnosticVariableEntryFilterData, ISymbolVariableEntry } from '../common/chatModel.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { IChatInputStyles } from './chatInputPart.js';
import { resizeImage } from './imageUtils.js';

enum ChatDragAndDropType {
	FILE_INTERNAL,
	FILE_EXTERNAL,
	FOLDER,
	IMAGE,
	SYMBOL,
	HTML,
	MARKER,
}

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
		@ITextModelService private readonly textModelService: ITextModelService
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
		const contexts = await this.getAttachContext(e);
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
		if (this.isImageDnd(e)) {
			return this.extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData')) ? ChatDragAndDropType.IMAGE : undefined;
			// } else if (containsDragType(e, 'text/html')) {
			// 	return ChatDragAndDropType.HTML;
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

	private isImageDnd(e: DragEvent): boolean {
		// Image detection should not have false positives, only false negatives are allowed
		if (containsDragType(e, 'image')) {
			return true;
		}

		if (containsDragType(e, DataTransfers.FILES)) {
			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				const file = files[0];
				return file.type.startsWith('image/');
			}

			const items = e.dataTransfer?.items;
			if (items && items.length > 0) {
				const item = items[0];
				return item.type.startsWith('image/');
			}
		}

		return false;
	}

	private async getAttachContext(e: DragEvent): Promise<IChatRequestVariableEntry[]> {
		if (!this.isDragEventSupported(e)) {
			return [];
		}

		const markerData = extractMarkerDropData(e);
		if (markerData) {
			return this.resolveMarkerAttachContext(markerData);
		}

		if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
			const data = extractSymbolDropData(e);
			return this.resolveSymbolsAttachContext(data);
		}

		// Removing HTML support for now
		// if (containsDragType(e, 'text/html')) {
		// 	const data = e.dataTransfer?.getData('text/html');
		// 	return data ? this.resolveHTMLAttachContext(data) : [];
		// }

		const data = extractEditorsDropData(e);
		return coalesce(await Promise.all(data.map(editorInput => {
			return this.resolveAttachContext(editorInput);
		})));
	}

	private async resolveAttachContext(editorInput: IDraggedResourceEditorInput): Promise<IChatRequestVariableEntry | undefined> {
		// Image
		const imageContext = await getImageAttachContext(editorInput, this.fileService, this.dialogService);
		if (imageContext) {
			return this.extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData')) ? imageContext : undefined;
		}

		// File
		return await this.getEditorAttachContext(editorInput);
	}

	private async getEditorAttachContext(editor: EditorInput | IDraggedResourceEditorInput): Promise<IChatRequestVariableEntry | undefined> {

		// untitled editor
		if (isUntitledResourceEditorInput(editor)) {
			return await this.resolveUntitledAttachContext(editor);
		}

		if (!editor.resource) {
			return undefined;
		}

		let stat;
		try {
			stat = await this.fileService.stat(editor.resource);
		} catch {
			return undefined;
		}

		if (!stat.isDirectory && !stat.isFile) {
			return undefined;
		}

		return await getResourceAttachContext(editor.resource, stat.isDirectory, this.textModelService);
	}

	private async resolveUntitledAttachContext(editor: IDraggedResourceEditorInput): Promise<IChatRequestVariableEntry | undefined> {
		// If the resource is known, we can use it directly
		if (editor.resource) {
			return await getResourceAttachContext(editor.resource, false, this.textModelService);
		}

		// Otherwise, we need to check if the contents are already open in another editor
		const openUntitledEditors = this.editorService.editors.filter(editor => editor instanceof UntitledTextEditorInput) as UntitledTextEditorInput[];
		for (const canidate of openUntitledEditors) {
			const model = await canidate.resolve();
			const contents = model.textEditorModel?.getValue();
			if (contents === editor.contents) {
				return await getResourceAttachContext(canidate.resource, false, this.textModelService);
			}
		}

		return undefined;
	}

	private resolveSymbolsAttachContext(symbols: DocumentSymbolTransferData[]): ISymbolVariableEntry[] {
		return symbols.map(symbol => {
			const resource = URI.file(symbol.fsPath);
			return {
				kind: 'symbol',
				id: symbolId(resource, symbol.range),
				value: { uri: resource, range: symbol.range },
				symbolKind: symbol.kind,
				fullName: `$(${SymbolKinds.toIcon(symbol.kind).id}) ${symbol.name}`,
				name: symbol.name,
			};
		});
	}

	// private async resolveHTMLAttachContext(data: string): Promise<IChatRequestVariableEntry[]> {
	// 	const displayName = localize('dragAndDroppedImageName', 'Image from URL');
	// 	let finalDisplayName = displayName;

	// 	for (let appendValue = 2; this.attachmentModel.attachments.some(attachment => attachment.name === finalDisplayName); appendValue++) {
	// 		finalDisplayName = `${displayName} ${appendValue}`;
	// 	}

	// 	const { src, alt } = extractImageAttributes(data);
	// 	finalDisplayName = alt ?? finalDisplayName;

	// 	if (/^data:image\/[a-z]+;base64,/.test(src)) {
	// 		const resizedImage = await resizeImage(src);
	// 		return [{
	// 			id: await imageToHash(resizedImage),
	// 			name: finalDisplayName,
	// 			value: resizedImage,
	// 			isImage: true,
	// 			isFile: false,
	// 			isDirectory: false
	// 		}];
	// 	} else if (/^https?:\/\/.+/.test(src)) {
	// 		const url = new URL(src);
	// 		const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url.pathname);
	// 		if (isImage) {
	// 			const buffer = convertStringToUInt8Array(src);
	// 			return [{
	// 				kind: 'image',
	// 				id: url.toString(),
	// 				name: finalDisplayName,
	// 				value: buffer,
	// 				isImage,
	// 				isFile: false,
	// 				isDirectory: false,
	// 				isURL: true,
	// 			}];
	// 		} else {
	// 			return [{
	// 				kind: 'link',
	// 				id: url.toString(),
	// 				name: finalDisplayName,
	// 				value: URI.parse(url.toString()),
	// 				isFile: false,
	// 				isDirectory: false,
	// 			}];
	// 		}
	// 	}
	// 	return [];
	// }

	private resolveMarkerAttachContext(markers: MarkerTransferData[]): IDiagnosticVariableEntry[] {
		return markers.map((marker): IDiagnosticVariableEntry => {
			let filter: IDiagnosticVariableEntryFilterData;
			if (!('severity' in marker)) {
				filter = { filterUri: URI.revive(marker.uri), filterSeverity: MarkerSeverity.Warning };
			} else {
				filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
			}

			return IDiagnosticVariableEntryFilterData.toEntry(filter);
		});
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

async function getResourceAttachContext(resource: URI, isDirectory: boolean, textModelService: ITextModelService): Promise<IChatRequestVariableEntry | undefined> {
	let isOmitted = false;

	if (!isDirectory) {
		try {
			const createdModel = await textModelService.createModelReference(resource);
			createdModel.dispose();
		} catch {
			isOmitted = true;
		}

		if (/\.(svg)$/i.test(resource.path)) {
			isOmitted = true;
		}
	}

	return {
		value: resource,
		id: resource.toString(),
		name: basename(resource),
		isFile: !isDirectory,
		isDirectory,
		isOmitted
	};
}

async function getImageAttachContext(editor: EditorInput | IDraggedResourceEditorInput, fileService: IFileService, dialogService: IDialogService): Promise<IChatRequestVariableEntry | undefined> {
	if (!editor.resource) {
		return undefined;
	}

	if (/\.(png|jpg|jpeg|gif|webp)$/i.test(editor.resource.path)) {
		const fileName = basename(editor.resource);
		const readFile = await fileService.readFile(editor.resource);
		if (readFile.size > 30 * 1024 * 1024) { // 30 MB
			dialogService.error(localize('imageTooLarge', 'Image is too large'), localize('imageTooLargeMessage', 'The image {0} is too large to be attached.', fileName));
			throw new Error('Image is too large');
		}
		const resizedImage = await resizeImage(readFile.value.buffer);
		return {
			id: editor.resource.toString(),
			name: fileName,
			fullName: editor.resource.path,
			value: resizedImage,
			icon: Codicon.fileMedia,
			isImage: true,
			isFile: false,
			references: [{ reference: editor.resource, kind: 'reference' }]
		};
	}

	return undefined;
}

function symbolId(resource: URI, range?: IRange): string {
	let rangePart = '';
	if (range) {
		rangePart = `:${range.startLineNumber}`;
		if (range.startLineNumber !== range.endLineNumber) {
			rangePart += `-${range.endLineNumber}`;
		}
	}
	return resource.fsPath + rangePart;
}

// function extractImageAttributes(html: string): { src: string; alt?: string } {
// 	const imgTagRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/;
// 	const altRegex = /alt=["']([^"']+)["']/;

// 	const match = imgTagRegex.exec(html);
// 	if (match) {
// 		const src = match[1];
// 		const altMatch = match[0].match(altRegex);
// 		return { src, alt: altMatch ? altMatch[1] : undefined };
// 	}

// 	return { src: '', alt: undefined };
// }
