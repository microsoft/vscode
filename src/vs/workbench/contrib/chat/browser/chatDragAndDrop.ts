/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, DragAndDropObserver } from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData, IDraggedResourceEditorInput, LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { DraggedEditorIdentifier } from '../../../browser/dnd.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { ChatInputPart } from './chatInputPart.js';

enum ChatDragAndDropType {
	EDITOR,
	FILE,
	TREE
}

export class ChatDragAndDrop extends Disposable {

	private readonly overlay: HTMLElement;

	protected readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	constructor(
		private readonly contianer: HTMLElement,
		private readonly inputPart: ChatInputPart,
	) {
		super();

		this._register(new DragAndDropObserver(this.contianer, {
			onDragEnter: (e) => this.onDragEnter(e),
			onDragOver: (e) => this.onDragOver(e),
			onDragLeave: (e) => this.onDragLeave(e),
			onDrop: (e) => this.onDrop(e),
		}));

		this.overlay = document.createElement('div');
		this.overlay.classList.add('chat-dnd-overlay');
		this.contianer.appendChild(this.overlay);

		/* TODO: Make overlay text nicer */
		const overlayText = $('span.attach-context-overlay-text', undefined, ...renderLabelWithIcons(`$(${Codicon.attach.id}) Attach File`));
		this.overlay.appendChild(overlayText);
	}

	private onDragEnter(e: DragEvent): void {
		this.updateDropFeedback(e, this.canDrop(e));
	}

	private onDragOver(e: DragEvent): void {

	}

	private onDragLeave(e: DragEvent): void {
		this.updateDropFeedback(e, false);
	}

	private onDrop(e: DragEvent): void {
		this.updateDropFeedback(e, false);

		const contexts = this.getAttachContext(e);
		if (contexts.length === 0) {
			return;
		}

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

	private updateDropFeedback(e: DragEvent, showOverlay: boolean): void {
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = showOverlay ? 'move' : 'none';
		}
		this.overlay.classList.toggle('visible', showOverlay);
	}

	private canDrop(e: DragEvent): boolean {
		return containsDragType(e, DataTransfers.FILES, DataTransfers.RESOURCES, CodeDataTransfers.FILES);
	}

	private getActiveDropType(e: DragEvent): ChatDragAndDropType | undefined {
		if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			return ChatDragAndDropType.EDITOR;
		}

		if (containsDragType(e, DataTransfers.FILES, DataTransfers.RESOURCES, CodeDataTransfers.FILES)) {
			return ChatDragAndDropType.FILE;
		}

		return undefined;
	}

	private getAttachContext(e: DragEvent): IChatRequestVariableEntry[] {
		switch (this.getActiveDropType(e)) {

			case ChatDragAndDropType.EDITOR: {
				const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
				if (!Array.isArray(data) || data.length === 0) {
					return [];
				}
				return data.map(de => getEditorAttachContext(de.identifier.editor)).filter(context => !!context);
			}

			case ChatDragAndDropType.FILE: {
				const data = extractEditorsDropData(e);
				return data.map(editorInput => getEditorAttachContext(editorInput)).filter(context => !!context);
			}
		}

		return [];
	}
}

function getEditorAttachContext(editor: EditorInput | IDraggedResourceEditorInput): IChatRequestVariableEntry | undefined {
	if (!editor.resource) {
		return undefined;
	}

	return getFileAttachContext(editor.resource);
}

function getFileAttachContext(resource: URI): IChatRequestVariableEntry | undefined {
	if (resource.scheme !== 'file') {
		return undefined;
	}

	return {
		value: resource,
		id: resource.toString(),
		name: basename(resource),
		isFile: true,
		isDynamic: true
	};
}
