/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { Link } from '../../../../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IChatSessionCreatedData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatSessionCreatedResult.css';

/**
 * Renders the title of a completed `create_session` / `create_chat` tool call
 * as a link to the created session. The link comes from the tool call's
 * structured {@link IChatSessionCreatedData} rather than the model's prose.
 */
export class ChatSessionCreatedResultSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly data: IChatSessionCreatedData,
		_context: IChatContentPartRenderContext,
		_renderer: IMarkdownRenderer,
		@IHoverService hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super(toolInvocation);

		this.domNode = dom.$('.chat-open-session-result');
		this._register(new Link(
			this.domNode,
			{ label: this.data.label, href: this.data.openLink, title: this.data.label },
			{
				opener: href => {
					void this.openerService.open(URI.parse(href), { fromUserGesture: true, allowContributedOpeners: true });
				},
			},
			hoverService,
			this.openerService,
		));
	}
}
