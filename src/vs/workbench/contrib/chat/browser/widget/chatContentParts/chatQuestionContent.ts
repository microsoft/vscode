/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { IMarkdownString, isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatQuestion } from '../../../common/chatService/chatService.js';
import { getDisplayedQuestionText, getOptionsWithDefaultsFirst } from '../../../common/chatService/chatQuestionCarouselHelpers.js';
import { CHAT_CARD_HEADER_CLASS, CHAT_CARD_TITLE_CLASS } from '../chatCard.js';
import { getChatMarkdownRenderOptions } from '../chatContentMarkdownRenderer.js';
import './media/chatQuestionCarousel.css';

interface IChatQuestionContentOptions {
	readonly message?: string | IMarkdownString;
	readonly headerActions?: HTMLElement;
	readonly readOnly?: boolean;
}

/** Shared Ask User presentation. Interactive callers supply controls and scrolling; previews never edit answers. */
export class ChatQuestionContent extends Disposable {
	readonly inputContainer = dom.$('.chat-question-input-container');

	constructor(
		container: HTMLElement,
		question: IChatQuestion,
		options: IChatQuestionContentOptions,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
	) {
		super();
		container.classList.add('chat-question-carousel-content');
		container.classList.toggle('chat-question-readonly', !!options.readOnly);
		const renderMarkdown = (parent: HTMLElement, value: string | IMarkdownString) => {
			const markdown = isMarkdownString(value) ? MarkdownString.lift(value) : new MarkdownString(value);
			parent.appendChild(this._register(markdownRendererService.render(markdown, getChatMarkdownRenderOptions())).element);
		};

		const header = dom.append(container, dom.$('.chat-question-header-row'));
		if (options.message) {
			renderMarkdown(dom.append(header, dom.$('.chat-question-carousel-message')), options.message);
		}
		const questionText = getDisplayedQuestionText(question);
		const rawText = typeof questionText === 'string' ? questionText : questionText.value;
		if (options.readOnly && question.title && question.title !== rawText) {
			dom.append(header, dom.$('.chat-question-heading')).textContent = question.title;
		}
		const titleRow = dom.append(header, dom.$(`.chat-question-title-row.${CHAT_CARD_HEADER_CLASS}`));
		if (questionText) {
			const title = dom.append(titleRow, dom.$(`.chat-question-title.${CHAT_CARD_TITLE_CLASS}`));
			title.setAttribute('aria-label', renderAsPlaintext(typeof questionText === 'string' ? new MarkdownString(questionText) : questionText));
			const suffixed = question.required ? `${rawText} *` : rawText;
			renderMarkdown(title, isMarkdownString(questionText) ? { ...questionText, value: suffixed } : suffixed);
		}
		if (options.headerActions) {
			titleRow.appendChild(options.headerActions);
		}
		if (question.description) {
			dom.append(container, dom.$('.chat-question-description')).textContent = question.description;
		}
		if (question.detailedMessage) {
			renderMarkdown(dom.append(this.inputContainer, dom.$('.chat-question-detailed-message')), question.detailedMessage);
		}
		if (options.readOnly) {
			const orderedOptions = getOptionsWithDefaultsFirst(question);
			if (orderedOptions.length) {
				const list = dom.append(this.inputContainer, dom.$('ol.chat-question-list'));
				for (const [index, { option }] of orderedOptions.entries()) {
					const item = dom.append(list, dom.$('li.chat-question-list-item'));
					const number = dom.append(item, dom.$('.chat-question-list-number'));
					number.textContent = String(index + 1);
					number.setAttribute('aria-hidden', 'true');
					appendChatQuestionOptionLabel(item, option.label);
				}
			}
			container.appendChild(this.inputContainer);
		}
	}
}

/** Keep option titles and descriptions identical in interactive lists and read-only previews. */
export function appendChatQuestionOptionLabel(item: HTMLElement, value: string): void {
	const label = dom.append(item, dom.$('.chat-question-list-label'));
	const separatorIndex = value.indexOf(' - ');
	if (separatorIndex !== -1) {
		item.classList.add('has-description');
		dom.append(label, dom.$('span.chat-question-list-label-title')).textContent = value.substring(0, separatorIndex);
		dom.append(label, dom.$('span.chat-question-list-label-desc')).textContent = value.substring(separatorIndex + 3);
	} else {
		label.textContent = value;
	}
}
