/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../../../base/browser/markdownRenderer.js';
import { decodeBase64 } from '../../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../../../base/common/errors.js';
import { Event } from '../../../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized } from '../../../../common/chatService/chatService.js';
import { IToolResultOutputDetails } from '../../../../common/tools/languageModelToolsService.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../../chat.js';
import { IChatOutputRendererService } from '../../../chatOutputItemRenderer.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { IChatToolOutputStateCache, IOutputState } from './chatToolOutputStateCache.js';

// TODO: see if we can reuse existing types instead of adding ChatToolOutputSubPart
export class ChatToolOutputSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;

	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	private readonly _disposeCts = this._register(new CancellationTokenSource());

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly onDidRemount: Event<void>,
		@IChatOutputRendererService private readonly chatOutputItemRendererService: IChatOutputRendererService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatToolOutputStateCache private readonly stateCache: IChatToolOutputStateCache,
	) {
		super(toolInvocation);

		const details: IToolResultOutputDetails = toolInvocation.kind === 'toolInvocation'
			? IChatToolInvocation.resultDetails(toolInvocation) as IToolResultOutputDetails
			: {
				output: {
					type: 'data',
					mimeType: (toolInvocation.resultDetails as IToolResultOutputDetailsSerialized).output.mimeType,
					value: decodeBase64((toolInvocation.resultDetails as IToolResultOutputDetailsSerialized).output.base64Data),
				},
			};

		this.domNode = dom.$('div.tool-output-part');

		if (toolInvocation.invocationMessage) {
			const titleEl = dom.$('.output-title');
			this.domNode.appendChild(titleEl);
			if (typeof toolInvocation.invocationMessage === 'string') {
				titleEl.textContent = toolInvocation.invocationMessage;
			} else {
				const md = this._register(renderMarkdown(toolInvocation.invocationMessage));
				titleEl.appendChild(md.element);
			}
		}

		this.domNode.appendChild(this.createOutputPart(toolInvocation, details));
	}

	public override dispose(): void {
		this._disposeCts.dispose(true);
		super.dispose();
	}

	private createOutputPart(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, details: IToolResultOutputDetails): HTMLElement {
		const parent = dom.$('div.webview-output');
		parent.style.maxHeight = '80vh';

		// Try to restore cached state, or create new state
		const partState: IOutputState = this.stateCache.get(toolInvocation.toolCallId) ?? { height: 0, webviewOrigin: generateUuid() };

		// Always update the cache with the current state reference
		this.stateCache.set(toolInvocation.toolCallId, partState);

		if (partState.height) {
			parent.style.height = `${partState.height}px`;
		}
		if (partState.webviewOrigin) {
			partState.webviewOrigin = partState.webviewOrigin;
		}

		const progressMessage = dom.$('span');
		progressMessage.textContent = localize('loading', 'Rendering tool output...');
		const progressPart = this._register(this.instantiationService.createInstance(ChatProgressSubPart, progressMessage, ThemeIcon.modify(Codicon.loading, 'spin'), undefined));
		parent.appendChild(progressPart.domNode);

		// TODO: we also need to show the tool output in the UI
		this.chatOutputItemRendererService.renderOutputPart(details.output.mimeType, details.output.value.buffer, parent, { origin: partState.webviewOrigin, webviewState: partState.webviewState }, this._disposeCts.token).then((renderedItem) => {
			if (this._disposeCts.token.isCancellationRequested) {
				return;
			}

			this._register(renderedItem);

			progressPart.domNode.remove();

			this._register(renderedItem.webview.onDidUpdateState(e => {
				partState.webviewState = e;
			}));

			this._register(renderedItem.onDidChangeHeight(newHeight => {
				partState.height = newHeight;
			}));

			this._register(renderedItem.webview.onDidWheel(e => {
				this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.delegateScrollFromMouseWheelEvent({
					...e,
					preventDefault: () => { },
					stopPropagation: () => { }
				});
			}));

			// When the webview is disconnected from the DOM due to being hidden, we need to reload it when it is shown again.
			this._register(this.context.onDidChangeVisibility(visible => {
				if (visible) {
					renderedItem.reinitialize();
				}
			}));

			this._register(this.onDidRemount(() => {
				renderedItem.reinitialize();
			}));
		}, (error) => {
			if (isCancellationError(error)) {
				return;
			}

			console.error('Error rendering tool output:', error);

			const errorNode = dom.$('.output-error');

			const errorHeaderNode = dom.$('.output-error-header');
			dom.append(errorNode, errorHeaderNode);

			const iconElement = dom.$('div');
			iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
			errorHeaderNode.append(iconElement);

			const errorTitleNode = dom.$('.output-error-title');
			errorTitleNode.textContent = localize('chat.toolOutputError', "Error rendering the tool output");
			errorHeaderNode.append(errorTitleNode);

			const errorMessageNode = dom.$('.output-error-details');
			errorMessageNode.textContent = error?.message || String(error);
			errorNode.append(errorMessageNode);

			progressPart.domNode.replaceWith(errorNode);
		});

		return parent;
	}
}
