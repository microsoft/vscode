/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { autoModeRoutingDetail, autoModeRoutingTitle } from '../../../common/chatAutoModeExplainability.js';
import { IChatAutoModeResolutionPart } from '../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatThinkingStyleContentPart } from './chatThinkingStyleContentPart.js';

/**
 * Explains Auto's routing decision. Shows "Routing task…" until the router
 * answers, then "Routed task", which expands to name the chosen model.
 */
export class ChatAutoModeResolutionContentPart extends ChatThinkingStyleContentPart {

	private readonly isRouting: boolean;

	constructor(
		private readonly content: IChatAutoModeResolutionPart,
		context: IChatContentPartRenderContext,
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(autoModeRoutingTitle(content), context, undefined, hoverService, configurationService);

		this.isRouting = !content.resolved;
		this.setThinkingActive(this.isRouting);
		if (this.isRouting) {
			// Nothing to explain yet, so this is a status line rather than a disclosure.
			this.setExpandable(false);
			this.setShimmerTitle(autoModeRoutingTitle(content));
		}
	}

	protected override initContent(): HTMLElement {
		const body = this.createThinkingBody();
		const detail = autoModeRoutingDetail(this.content);
		if (detail) {
			const row = this.createThinkingRow();
			const rendered = this._register(this.chatContentMarkdownRenderer.render(new MarkdownString(detail)));
			row.appendChild(rendered.element);
			body.appendChild(row);
		}
		return body;
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		if (other.kind !== 'autoModeResolution') {
			return false;
		}
		// Once the response ends, a row still routing is re-rendered so the
		// renderer can drop it rather than leave it shimmering forever.
		if (this.isRouting && element.isComplete) {
			return false;
		}
		return other.resolved?.id === this.content.resolved?.id;
	}
}
