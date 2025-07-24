/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized } from '../../../common/chatService.js';
import { IToolResultOutputDetails } from '../../../common/languageModelToolsService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { IChatOutputRendererService } from '../../chatOutputItemRenderer.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatCustomProgressPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

// TODO: see if we can reuse existing types instead of adding ChatToolOutputSubPart
export class ChatToolOutputSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	private readonly _disposeCts = this._register(new CancellationTokenSource());

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		_context: IChatContentPartRenderContext,
		@IChatOutputRendererService private readonly chatOutputItemRendererService: IChatOutputRendererService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		const details: IToolResultOutputDetails = toolInvocation.kind === 'toolInvocation'
			? toolInvocation.resultDetails as IToolResultOutputDetails
			: {
				output: {
					type: 'data',
					mimeType: (toolInvocation.resultDetails as IToolResultOutputDetailsSerialized).output.mimeType,
					value: decodeBase64((toolInvocation.resultDetails as IToolResultOutputDetailsSerialized).output.base64Data),
				},
			};

		this.domNode = this.createOutputPart(details);
	}

	public override dispose(): void {
		this._disposeCts.dispose(true);
		super.dispose();
	}

	private createOutputPart(details: IToolResultOutputDetails): HTMLElement {
		const parent = dom.$('div.webview-output');
		parent.style.maxHeight = '80vh';

		const progressMessage = dom.$('span');
		progressMessage.textContent = localize('loading', 'Rendering tool output...');
		const progressPart = this.instantiationService.createInstance(ChatCustomProgressPart, progressMessage, ThemeIcon.modify(Codicon.loading, 'spin'));
		parent.appendChild(progressPart.domNode);

		// TODO: we also need to show the tool output in the UI
		this.chatOutputItemRendererService.renderOutputPart(details.output.mimeType, details.output.value.buffer, parent, this._disposeCts.token).then((renderedItem) => {
			if (this._disposeCts.token.isCancellationRequested) {
				return;
			}

			this._register(renderedItem);

			progressPart.domNode.remove();

			this._onDidChangeHeight.fire();
			this._register(renderedItem.onDidChangeHeight(() => {
				this._onDidChangeHeight.fire();
			}));
		}, (error) => {
			// TODO: show error in UI too
			console.error('Error rendering tool output:', error);
		});

		return parent;
	}
}
