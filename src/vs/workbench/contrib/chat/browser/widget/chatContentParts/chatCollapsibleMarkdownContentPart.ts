/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';

/**
 * A collapsible content part that displays markdown content.
 * The title is shown in the collapsed state, and the full content is shown when expanded.
 */
export class ChatCollapsibleMarkdownContentPart extends ChatCollapsibleContentPart {

	private contentElement: HTMLElement | undefined;

	constructor(
		title: string,
		private readonly markdownContent: string,
		context: IChatContentPartRenderContext,
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		@IHoverService hoverService: IHoverService,
	) {
		super(title, context, undefined, hoverService);
		this.icon = Codicon.check;
	}

	protected override initContent(): HTMLElement {
		const wrapper = $('.chat-collapsible-markdown-content.chat-used-context-list');

		if (this.markdownContent) {
			this.contentElement = $('.chat-collapsible-markdown-body');
			const rendered = this._register(this.chatContentMarkdownRenderer.render(new MarkdownString(this.markdownContent)));
			this.contentElement.appendChild(rendered.element);
			wrapper.appendChild(this.contentElement);
		}

		return wrapper;
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		// This part is embedded in the subagent part, not rendered directly
		return false;
	}
}
