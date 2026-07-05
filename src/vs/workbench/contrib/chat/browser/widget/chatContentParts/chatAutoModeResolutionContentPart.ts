/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatAutoModeResolutionPart } from '../../../common/chatService/chatService.js';
import { ILanguageModelChatMetadata } from '../../../common/languageModels.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import './media/chatAutoModeResolution.css';

/**
 * A collapsible content part that displays auto-mode model routing resolution.
 * Collapsed: "Routed to <model>"
 * Expanded: Explanation of auto routing + reasoning label with confidence.
 */
export class ChatAutoModeResolutionContentPart extends ChatCollapsibleContentPart {

	constructor(
		private readonly content: IChatAutoModeResolutionPart,
		context: IChatContentPartRenderContext,
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(
			localize('autoModeResolution.title', "Routed to {0}", content.resolvedModelName),
			context,
			undefined,
			hoverService,
			configurationService,
		);
	}

	protected override initContent(): HTMLElement {
		const wrapper = $('.chat-auto-mode-resolution-content.chat-used-context-list');

		const body = $('.chat-auto-mode-resolution-body');

		const explanation = $('.chat-auto-mode-resolution-explanation');
		const explanationMd = new MarkdownString(ILanguageModelChatMetadata.getAutoModelDescription());
		const rendered = this._register(this.chatContentMarkdownRenderer.render(explanationMd));
		explanation.appendChild(rendered.element);
		body.appendChild(explanation);

		const detailLine = $('.chat-auto-mode-resolution-detail');
		let detailText: string;
		if (this.content.predictedLabel === 'fallback') {
			detailText = localize('autoModeResolution.fallback', "Unable to resolve");
		} else {
			const label = this.content.predictedLabel === 'needs_reasoning'
				? localize('autoModeResolution.reasoning', "Reasoning")
				: localize('autoModeResolution.nonReasoning', "Non-reasoning");
			const confidencePercent = (this.content.confidence * 100).toFixed(0);
			detailText = localize('autoModeResolution.detail', "{0} - Confidence {1}%", label, confidencePercent);
		}
		const detailRendered = this._register(this.chatContentMarkdownRenderer.render(new MarkdownString(detailText)));
		detailLine.appendChild(detailRendered.element);
		body.appendChild(detailLine);

		wrapper.appendChild(body);
		return wrapper;
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'autoModeResolution'
			&& other.resolvedModel === this.content.resolvedModel
			&& other.resolvedModelName === this.content.resolvedModelName
			&& other.confidence === this.content.confidence
			&& other.predictedLabel === this.content.predictedLabel;
	}
}
