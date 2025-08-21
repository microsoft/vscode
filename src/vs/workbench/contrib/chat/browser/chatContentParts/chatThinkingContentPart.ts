/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode } from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatThinkingPart } from '../../common/chatService.js';
import { IChatContentPartRenderContext, IChatContentPart } from './chatContentParts.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MarkdownRenderer, IMarkdownRenderResult } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';

export class ChatThinkingContentPart extends Disposable implements IChatContentPart {
	readonly domNode: HTMLElement;
	public readonly codeblocks: undefined;
	public readonly codeblocksPartId: undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private currentThinkingValue: string;
	private readonly renderer: MarkdownRenderer;
	private textContainer!: HTMLElement;
	private markdownResult: IMarkdownRenderResult | undefined;

	constructor(
		content: IChatThinkingPart,
		_context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.renderer = instantiationService.createInstance(MarkdownRenderer, {});
		this.currentThinkingValue = this.parseContent(content.value || '');

		this.domNode = $('.chat-thinking-box');
		this.domNode.tabIndex = 0;
		this.renderContent();
	}

	private parseContent(content: string): string {
		// Remove <|im_sep|>****
		return content
			.replace(/<\|im_sep\|>\*{4,}/g, '')
			.trim();
	}

	private renderContent(): void {
		this.textContainer = $('.chat-thinking-text.markdown-content');
		this.domNode.appendChild(this.textContainer);

		if (this.currentThinkingValue) {
			this.renderMarkdown(this.currentThinkingValue);
		}
	}

	private renderMarkdown(content: string): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}

		const cleanedContent = this.parseContent(content);
		if (!cleanedContent) {
			return;
		}

		clearNode(this.textContainer);
		this.markdownResult = this.renderer.render(new MarkdownString(cleanedContent));
		this.textContainer.appendChild(this.markdownResult.element);
	}

	hasSameContent(other: any): boolean {
		return other.kind === 'thinking';
	}

	override dispose(): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}
		super.dispose();
	}
}
