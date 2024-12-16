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
import { basename, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { SymbolKinds } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { CodeDataTransfers, containsDragType, DocumentSymbolTransferData, extractEditorsDropData, extractSymbolDropData, IDraggedResourceEditorInput } from '../../../../platform/dnd/browser/dnd.js';
import { FileType, IFileService, IFileSystemProvider } from '../../../../platform/files/common/files.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { isUntitledResourceEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { IChatRequestVariableEntry, ISymbolVariableEntry } from '../common/chatModel.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { IChatInputStyles } from './chatInputPart.js';

enum ChatDragAndDropType {
	FILE_INTERNAL,
	FILE_EXTERNAL,
	FOLDER,
	IMAGE,
	SYMBOL
}

export class ChatDragAndDrop extends Themable {

	private readonly overlays: Map<HTMLElement, { overlay: HTMLElement; disposable: IDisposable }> = new Map();
	private overlayText?: HTMLElement;
	private overlayTextBackground: string = '';

	constructor(
		protected readonly attachmentModel: ChatAttachmentModel,
		private readonly styles: IChatInputStyles,
		@IThemeService themeService: IThemeService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IFileService protected readonly fileService: IFileService,
		@IEditorService protected readonly editorService: IEditorService,
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

		this.handleDrop(contexts);
	}

	protected handleDrop(contexts: IChatRequestVariableEntry[]): void {
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
		} else if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
			return ChatDragAndDropType.SYMBOL;
		} else if (containsDragType(e, DataTransfers.FILES)) {
			return ChatDragAndDropType.FILE_EXTERNAL;
		} else if (containsDragType(e, DataTransfers.INTERNAL_URI_LIST)) {
			return ChatDragAndDropType.FILE_INTERNAL;
		} else if (containsDragType(e, Mimes.uriList, CodeDataTransfers.FILES)) {
			return ChatDragAndDropType.FOLDER;
		}

		return undefined;
	}

	private isDragEventSupported(e: DragEvent): boolean {
		// if guessed drop type is undefined, it means the drop is not supported
		const dropType = this.guessDropType(e);
		return dropType !== undefined;
	}

	protected getDropTypeName(type: ChatDragAndDropType): string {
		switch (type) {
			case ChatDragAndDropType.FILE_INTERNAL: return localize('file', 'File');
			case ChatDragAndDropType.FILE_EXTERNAL: return localize('file', 'File');
			case ChatDragAndDropType.FOLDER: return localize('folder', 'Folder');
			case ChatDragAndDropType.IMAGE: return localize('image', 'Image');
			case ChatDragAndDropType.SYMBOL: return localize('symbol', 'Symbol');
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

		if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
			const data = extractSymbolDropData(e);
			return this.resolveSymbolsAttachContext(data);
		}

		const data = extractEditorsDropData(e);
		return coalesce(await Promise.all(data.map(editorInput => {
			return this.resolveAttachContext(editorInput);
		})));
	}

	private async resolveAttachContext(editorInput: IDraggedResourceEditorInput): Promise<IChatRequestVariableEntry | undefined> {
		// Image
		const imageContext = getImageAttachContext(editorInput);
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

		return getResourceAttachContext(editor.resource, stat.isDirectory);
	}

	private async resolveUntitledAttachContext(editor: IDraggedResourceEditorInput): Promise<IChatRequestVariableEntry | undefined> {
		// If the resource is known, we can use it directly
		if (editor.resource) {
			return getResourceAttachContext(editor.resource, false);
		}

		// Otherwise, we need to check if the contents are already open in another editor
		const openUntitledEditors = this.editorService.editors.filter(editor => editor instanceof UntitledTextEditorInput) as UntitledTextEditorInput[];
		for (const canidate of openUntitledEditors) {
			const model = await canidate.resolve();
			const contents = model.textEditorModel?.getValue();
			if (contents === editor.contents) {
				return getResourceAttachContext(canidate.resource, false);
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
				isDynamic: true
			};
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

	protected getOverlayText(type: ChatDragAndDropType): string {
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

export class EditsDragAndDrop extends ChatDragAndDrop {

	constructor(
		attachmentModel: ChatAttachmentModel,
		styles: IChatInputStyles,
		@IThemeService themeService: IThemeService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
		@IEditorService editorService: IEditorService,
	) {
		super(attachmentModel, styles, themeService, extensionService, fileService, editorService);
	}

	protected override handleDrop(context: IChatRequestVariableEntry[]): void {
		this.handleDropAsync(context);
	}

	protected async handleDropAsync(context: IChatRequestVariableEntry[]): Promise<void> {
		const nonDirectoryContext = context.filter(context => !context.isDirectory);
		const directories = context
			.filter(context => context.isDirectory)
			.map(context => context.value)
			.filter(value => !!value && URI.isUri(value));

		// If there are directories, we need to resolve the files and add them to the working set
		for (const directory of directories) {
			const fileSystemProvider = this.fileService.getProvider(directory.scheme);
			if (!fileSystemProvider) {
				continue;
			}

			const resolvedFiles = await resolveFilesInDirectory(directory, fileSystemProvider, true);
			const resolvedFileContext = resolvedFiles.map(file => getResourceAttachContext(file, false)).filter(context => !!context);
			nonDirectoryContext.push(...resolvedFileContext);
		}

		super.handleDrop(nonDirectoryContext);
	}

	protected override getOverlayText(type: ChatDragAndDropType): string {
		const typeName = this.getDropTypeName(type);
		switch (type) {
			case ChatDragAndDropType.FILE_INTERNAL:
			case ChatDragAndDropType.FILE_EXTERNAL:
				return localize('addToWorkingSet', 'Add {0} to Working Set', typeName);
			case ChatDragAndDropType.FOLDER:
				return localize('addToWorkingSet', 'Add {0} to Working Set', localize('files', 'Files'));
			default:
				return super.getOverlayText(type);
		}
	}
}

async function resolveFilesInDirectory(resource: URI, fileSystemProvider: IFileSystemProvider, shouldRecurse: boolean): Promise<URI[]> {
	const entries = await fileSystemProvider.readdir(resource);

	const files: URI[] = [];
	const folders: URI[] = [];

	for (const [name, type] of entries) {
		const entryResource = joinPath(resource, name);
		if (type === FileType.File) {
			files.push(entryResource);
		} else if (type === FileType.Directory && shouldRecurse) {
			folders.push(entryResource);
		}
	}

	const subFiles = await Promise.all(folders.map(folder => resolveFilesInDirectory(folder, fileSystemProvider, shouldRecurse)));

	return [...files, ...subFiles.flat()];
}

function getResourceAttachContext(resource: URI, isDirectory: boolean): IChatRequestVariableEntry | undefined {
	return {
		value: resource,
		id: resource.toString(),
		name: basename(resource),
		isFile: !isDirectory,
		isDirectory,
		isDynamic: true
	};
}

function getImageAttachContext(editor: EditorInput | IDraggedResourceEditorInput): IChatRequestVariableEntry | undefined {
	if (!editor.resource) {
		return undefined;
	}

	if (/\.(png|jpg|jpeg|bmp|gif|tiff)$/i.test(editor.resource.path)) {
		const fileName = basename(editor.resource);
		return {
			id: editor.resource.toString(),
			name: fileName,
			fullName: editor.resource.path,
			value: editor.resource,
			icon: Codicon.fileMedia,
			isDynamic: true,
			isImage: true,
			isFile: false
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
