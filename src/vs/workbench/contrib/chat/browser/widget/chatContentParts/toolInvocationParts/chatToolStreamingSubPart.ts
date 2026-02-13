/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressMessage, IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatProgressContentPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

/**
 * Sub-part for rendering a tool invocation in the streaming state.
 * This shows progress while the tool arguments are being streamed from the LM.
 */
export class ChatToolStreamingSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: IMarkdownRenderer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		this.domNode = this.createStreamingPart();
	}

	private createStreamingPart(): HTMLElement {
		const container = document.createElement('div');

		if (this.toolInvocation.kind !== 'toolInvocation') {
			return container;
		}

		const toolInvocation = this.toolInvocation;
		const state = toolInvocation.state.get();
		if (state.type !== IChatToolInvocation.StateKind.Streaming) {
			return container;
		}

		// Observe streaming message changes
		this._register(autorun(reader => {
			const currentState = toolInvocation.state.read(reader);
			if (currentState.type !== IChatToolInvocation.StateKind.Streaming) {
				// State changed - clear the container DOM before triggering re-render
				// This prevents the old streaming message from lingering
				dom.clearNode(container);
				this._onNeedsRerender.fire();
				return;
			}

			// Read the streaming message
			const streamingMessage = currentState.streamingMessage.read(reader);
			const displayMessage = streamingMessage ?? toolInvocation.invocationMessage;

			// Don't render anything if there's no meaningful content
			const messageText = typeof displayMessage === 'string' ? displayMessage : displayMessage.value;
			if (!messageText || messageText.trim().length === 0) {
				dom.clearNode(container);
				return;
			}

			const content: IMarkdownString = typeof displayMessage === 'string'
				? new MarkdownString().appendText(displayMessage)
				: displayMessage;

			const progressMessage: IChatProgressMessage = {
				kind: 'progressMessage',
				content
			};

			const part = reader.store.add(this.instantiationService.createInstance(
				ChatProgressContentPart,
				progressMessage,
				this.renderer,
				this.context,
				undefined,
				true,
				this.getIcon(),
				toolInvocation
			));

			dom.reset(container, part.domNode);
		}));

		return container;
	}
}
