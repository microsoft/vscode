/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, DragAndDropObserver } from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { containsDragType, extractEditorsDropData, IDraggedResourceEditorInput } from '../../../../platform/dnd/browser/dnd.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { ChatInputPart } from './chatInputPart.js';
import { IChatWidgetStyles } from './chatWidget.js';

enum ChatDragAndDropType {
	FILE,
	IMAGE
}

export class ChatDragAndDrop extends Themable {

	private readonly overlay: HTMLElement;
	private overlayText?: HTMLElement;
	private overlayTextBackground: string = '';

	constructor(
		private readonly contianer: HTMLElement,
		private readonly inputPart: ChatInputPart,
		private readonly styles: IChatWidgetStyles,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(themeService);

		// If the mouse enters and leaves the overlay quickly,
		// the overlay may stick around due to too many drag enter events
		// Make sure the mouse enters only once
		let mouseInside = false;
		this._register(new DragAndDropObserver(this.contianer, {
			onDragEnter: (e) => {
				if (!mouseInside) {
					mouseInside = true;
					this.onDragEnter(e);
				}
			},
			onDragOver: (e) => {
				e.stopPropagation();
			},
			onDragLeave: (e) => {
				this.onDragLeave(e);
				mouseInside = false;
			},
			onDrop: (e) => {
				this.onDrop(e);
				mouseInside = false;
			},
		}));

		this.overlay = document.createElement('div');
		this.overlay.classList.add('chat-dnd-overlay');
		this.contianer.appendChild(this.overlay);

		this.updateStyles();
	}

	private onDragEnter(e: DragEvent): void {
		const estimatedDropType = this.guessDropType(e);
		if (estimatedDropType !== undefined) {
			e.stopPropagation();
			e.preventDefault();
		}
		this.updateDropFeedback(e, estimatedDropType);
	}

	private onDragLeave(e: DragEvent): void {
		this.updateDropFeedback(e, undefined);
	}

	private onDrop(e: DragEvent): void {
		this.updateDropFeedback(e, undefined);

		const contexts = this.getAttachContext(e);
		if (contexts.length === 0) {
			return;
		}

		e.stopPropagation();
		e.preventDefault();

		// Make sure to attach only new contexts
		const currentContextIds = new Set(Array.from(this.inputPart.attachedContext).map(context => context.id));
		const filteredContext = [];
		for (const context of contexts) {
			if (!currentContextIds.has(context.id)) {
				currentContextIds.add(context.id);
				filteredContext.push(context);
			}
		}

		this.inputPart.attachContext(false, ...filteredContext);
	}

	private updateDropFeedback(e: DragEvent, dropType: ChatDragAndDropType | undefined): void {
		const showOverlay = dropType !== undefined;
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = showOverlay ? 'copy' : 'none';
		}

		this.setOverlay(dropType);
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

	private guessDropType(e: DragEvent): ChatDragAndDropType | undefined {
		// This is an esstimation based on the datatransfer types/items
		if (this.isImageDnd(e)) {
			const imageDndSupported = this.configurationService.getValue<boolean>('chat.experimental.imageAttachments');
			return imageDndSupported ? ChatDragAndDropType.IMAGE : undefined;
		} else if (containsDragType(e, DataTransfers.FILES, DataTransfers.INTERNAL_URI_LIST)) {
			return ChatDragAndDropType.FILE;
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
			case ChatDragAndDropType.FILE: return localize('file', 'File');
			case ChatDragAndDropType.IMAGE: return localize('image', 'Image');
		}
	}

	private getAttachContext(e: DragEvent): IChatRequestVariableEntry[] {
		if (!this.isDragEventSupported(e)) {
			return [];
		}

		const data = extractEditorsDropData(e);
		return coalesce(data.map(editorInput => {
			return this.resolveAttachContext(editorInput);
		}));
	}

	private resolveAttachContext(editorInput: IDraggedResourceEditorInput): IChatRequestVariableEntry | undefined {
		// Image
		const imageContext = getImageAttachContext(editorInput);
		if (imageContext) {
			const isImageDndSupported = this.configurationService.getValue<boolean>('chat.experimental.imageAttachments');
			return isImageDndSupported ? imageContext : undefined;
		}

		// File
		return getEditorAttachContext(editorInput);
	}

	private setOverlay(type: ChatDragAndDropType | undefined): void {
		// Remove any previous overlay text
		this.overlayText?.remove();
		this.overlayText = undefined;

		if (type !== undefined) {
			// Render the overlay text
			const typeName = this.getDropTypeName(type);

			const iconAndtextElements = renderLabelWithIcons(`$(${Codicon.attach.id}) ${localize('attach', 'Attach')} ${typeName}`);
			const htmlElements = iconAndtextElements.map(element => {
				if (typeof element === 'string') {
					return $('span.overlay-text', undefined, element);
				}
				return element;
			});

			this.overlayText = $('span.attach-context-overlay-text', undefined, ...htmlElements);
			this.overlayText.style.backgroundColor = this.overlayTextBackground;
			this.overlay.appendChild(this.overlayText);
		}

		this.overlay.classList.toggle('visible', type !== undefined);
	}

	override updateStyles(): void {
		this.overlay.style.backgroundColor = this.getColor(this.styles.overlayBackground) || '';
		this.overlay.style.color = this.getColor(this.styles.listForeground) || '';
		this.overlayTextBackground = this.getColor(this.styles.listBackground) || '';
	}
}

function getEditorAttachContext(editor: EditorInput | IDraggedResourceEditorInput): IChatRequestVariableEntry | undefined {
	if (!editor.resource) {
		return undefined;
	}

	return getFileAttachContext(editor.resource);
}

function getFileAttachContext(resource: URI): IChatRequestVariableEntry | undefined {
	return {
		value: resource,
		id: resource.toString(),
		name: basename(resource),
		isFile: true,
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
