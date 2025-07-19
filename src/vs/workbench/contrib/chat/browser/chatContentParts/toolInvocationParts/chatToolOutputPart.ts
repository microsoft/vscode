/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
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
		output: IToolResultOutputDetails,
		_context: IChatContentPartRenderContext,
		@IChatOutputRendererService private readonly chatOutputItemRendererService: IChatOutputRendererService,
	) {
		super(toolInvocation);

		this.domNode = this.createOutputPart(output);
	}

	private createOutputPart(detauls: IToolResultOutputDetails): HTMLElement {
		const parent = dom.$('div.webview-output');
		parent.style.maxHeight = '80vh';

		this.chatOutputItemRendererService.renderOutputPart(detauls.output.mimeType, detauls.output.value.buffer, parent, CancellationToken.None).then((disposable) => {
			this._register(disposable);
			this._onDidChangeHeight.fire();
		});
		return parent;
	}
}
