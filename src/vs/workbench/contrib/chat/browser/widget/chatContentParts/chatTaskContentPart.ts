/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressRenderableResponseContent } from '../../../common/model/chatModel.js';
import { IChatTask, IChatTaskSerialized } from '../../../common/chatService/chatService.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatProgressContentPart } from './chatProgressContentPart.js';
import { ChatCollapsibleListContentPart, CollapsibleListPool } from './chatReferencesContentPart.js';

export class ChatTaskContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	public readonly onDidChangeHeight: Event<void>;

	private isSettled: boolean;

	constructor(
		private readonly task: IChatTask | IChatTaskSerialized,
		contentReferencesListPool: CollapsibleListPool,
		chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (task.progress.length) {
			this.isSettled = true;
			const refsPart = this._register(instantiationService.createInstance(ChatCollapsibleListContentPart, task.progress, task.content.value, context, contentReferencesListPool));
			this.domNode = dom.$('.chat-progress-task');
			this.domNode.appendChild(refsPart.domNode);
			this.onDidChangeHeight = refsPart.onDidChangeHeight;
		} else {
			const isSettled = task.kind === 'progressTask' ?
				task.isSettled() :
				true;
			this.isSettled = isSettled;
			const showSpinner = !isSettled && !context.element.isComplete;
			const progressPart = this._register(instantiationService.createInstance(ChatProgressContentPart, task, chatContentMarkdownRenderer, context, showSpinner, true, undefined, undefined));
			this.domNode = progressPart.domNode;
			this.onDidChangeHeight = Event.None;
		}
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		if (
			other.kind === 'progressTask' &&
			this.task.kind === 'progressTask' &&
			other.isSettled() !== this.isSettled
		) {
			return false;
		}

		return other.kind === this.task.kind &&
			other.progress.length === this.task.progress.length;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
