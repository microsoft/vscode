/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspaceFileEdit, IWorkspaceTextEdit } from '../../../../../editor/common/languages.js';
import { IChatProgressRenderableResponseContent, IChatWorkspaceEdit } from '../../common/chatModel.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { CollapsedCodeBlock } from './chatMarkdownContentPart.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

export class ChatWorkspaceEditContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		chatWorkspaceEdit: IChatWorkspaceEdit,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-workspace-edit');

		const edits = chatWorkspaceEdit.edit.edits;
		if (!edits.length) {
			return;
		}

		// Group edits by resource for better organization
		const editsByResource = new ResourceMap<{ textEdits: IWorkspaceTextEdit[]; fileEdits: IWorkspaceFileEdit[] }>();

		for (const edit of edits) {
			const resourceUri = 'resource' in edit ? edit.resource :
				('newResource' in edit && edit.newResource) ? edit.newResource :
					('oldResource' in edit && edit.oldResource) ? edit.oldResource : undefined;

			if (!resourceUri) {
				continue;
			}

			if (!editsByResource.has(resourceUri)) {
				editsByResource.set(resourceUri, { textEdits: [], fileEdits: [] });
			}

			const resourceEdits = editsByResource.get(resourceUri)!;

			if ('resource' in edit && 'textEdit' in edit) {
				resourceEdits.textEdits.push(edit as IWorkspaceTextEdit);
			} else {
				resourceEdits.fileEdits.push(edit as IWorkspaceFileEdit);
			}
		}		// Render all resource edits
		for (const [resourceUri, edits] of editsByResource.entries()) {
			// For text edits, show a collapsed code block that can be expanded
			if (edits.textEdits.length > 0) {
				this.renderTextEdits(resourceUri, edits.textEdits, context);
			}

			// For file edits, show a collapsed code block with file operation info
			if (edits.fileEdits.length > 0) {
				this.renderFileEdits(edits.fileEdits, context);
			}
		}
	}

	private renderTextEdits(resource: URI, textEdits: IWorkspaceTextEdit[], context: IChatContentPartRenderContext): void {
		const codeBlock = this.instantiationService.createInstance(
			CollapsedCodeBlock,
			context.element.sessionId,
			context.element.id,
			findUndoStopId(context)
		);

		codeBlock.render(resource, false);
		this.domNode.appendChild(codeBlock.element);
	}

	private renderFileEdits(fileEdits: IWorkspaceFileEdit[], context: IChatContentPartRenderContext): void {
		for (const fileEdit of fileEdits) {
			const resourceUri = fileEdit.newResource || fileEdit.oldResource;
			if (!resourceUri) {
				continue;
			}

			// Create a collapsed code block for the file edit
			const codeBlock = this.instantiationService.createInstance(
				CollapsedCodeBlock,
				context.element.sessionId,
				context.element.id,
				findUndoStopId(context)
			);

			codeBlock.render(resourceUri, false);
			this.domNode.appendChild(codeBlock.element);
		}
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'workspaceEdit';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

function findUndoStopId(context: IChatContentPartRenderContext): string | undefined {
	// Look through the content items to find the most recent undoStop
	for (let i = context.contentIndex; i >= 0; i--) {
		const item = context.content[i];
		if (item.kind === 'undoStop') {
			return item.id;
		}
	}
	return undefined;
}
