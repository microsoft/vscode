/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized } from '../../../common/chatService.js';
import { IToolResultOutputDetails } from '../../../common/languageModelToolsService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { IChatOutputRendererService } from '../../chatOutputItemRenderer.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatToolOutputSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		_context: IChatContentPartRenderContext,
		@IChatOutputRendererService private readonly chatOutputItemRendererService: IChatOutputRendererService,
	) {
		super(toolInvocation);


		const details: IToolResultOutputDetails = toolInvocation.kind === 'toolInvocation'
			? toolInvocation.resultDetails as IToolResultOutputDetails
			: {
				output: {
					type: 'data',
					mimeType: (toolInvocation.resultDetails as IToolResultOutputDetailsSerialized).mimeType,
					value: decodeBase64((toolInvocation.resultDetails as IToolResultOutputDetailsSerialized).base64Data),
				},
			};

		this.domNode = this.createOutputPart(details);
	}

	private createOutputPart(details: IToolResultOutputDetails): HTMLElement {
		// TODO: Show progress while rendering

		const parent = dom.$('div.webview-output');
		parent.style.maxHeight = '80vh';

		this.chatOutputItemRendererService.renderOutputPart(details.output.mimeType, details.output.value.buffer, parent, CancellationToken.None).then((renderedItem) => {
			this._register(renderedItem);

			this._onDidChangeHeight.fire();
			this._register(renderedItem.onDidChangeHeight(() => {
				this._onDidChangeHeight.fire();
			}));
		});

		return parent;
	}
}
