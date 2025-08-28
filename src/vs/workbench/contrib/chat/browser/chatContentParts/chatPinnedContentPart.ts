/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatRendererContent } from '../../common/chatViewModel.js';
import { $ } from '../../../../../base/browser/dom.js';
import { ChatTreeItem } from '../chat.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import * as nls from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration, ThinkingDisplayMode } from '../../common/constants.js';

export class ChatPinnedContentPart extends ChatCollapsibleContentPart {
	private body!: HTMLElement;
	private preview!: HTMLElement;
	private currentTitle: string;

	constructor(
		private content: HTMLElement | undefined,
		context: IChatContentPartRenderContext,
		customTitle: string | undefined,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		const thinkingTitle = nls.localize('chat.pinned.thinking.header.base', "Thinking...");
		super(customTitle || thinkingTitle, context);
		this.currentTitle = customTitle || thinkingTitle;

		const thinkingMode = this.getThinkingDisplayMode();
		this.setExpanded(thinkingMode === ThinkingDisplayMode.Expanded);

		this.domNode.classList.add('chat-thinking-box');
		this.domNode.tabIndex = 0;

		if (this.content) {
			this.appendItem(this.content);
		}
	}

	protected override initContent(): HTMLElement {
		const wrapper = $('.chat-thinking-wrapper');
		const container = $('.chat-used-context-list.chat-thinking-items');
		this.preview = $('.chat-pinned-preview');

		wrapper.appendChild(container);
		wrapper.appendChild(this.preview);

		const thinkingMode = this.getThinkingDisplayMode();

		if (thinkingMode !== ThinkingDisplayMode.CollapsedPreview) {
			this.preview.classList.toggle('hidden', true);
		}

		this.body = container;
		return wrapper;
	}

	private getThinkingDisplayMode(): ThinkingDisplayMode {
		const configValue = this.configurationService.getValue<string>(ChatConfiguration.ThinkingStyle);
		switch (configValue) {
			case 'collapsed':
				return ThinkingDisplayMode.Collapsed;
			case 'collapsedPreview':
				return ThinkingDisplayMode.CollapsedPreview;
			case 'expanded':
				return ThinkingDisplayMode.Expanded;
			case 'none':
				return ThinkingDisplayMode.None;
			default:
				return ThinkingDisplayMode.Collapsed;
		}
	}

	update(content: HTMLElement, startNewSection?: boolean) {
		if (content.parentElement === this.body || content.parentElement === this.preview) {
			return;
		}

		const thinkingMode = this.getThinkingDisplayMode();

		if (thinkingMode === ThinkingDisplayMode.None) {
			return;
		}

		if (startNewSection) {
			this.movePreviewToMain();
			this.appendItem(content);
		} else {
			if (thinkingMode === ThinkingDisplayMode.CollapsedPreview) {
				this.appendToPreview(content);
			} else {
				this.appendItem(content);
			}
		}

		this.updateBodyVisibility();
	}

	updateTitle(newTitle: string): void {
		this.currentTitle = newTitle;
		this.setTitle(newTitle);
	}

	hasCustomTitle(): boolean {
		return this.currentTitle !== nls.localize('chat.pinned.thinking.header.base', "Thinking...");
	}

	hidePreview(canceled?: boolean): void {
		const thinkingMode = this.getThinkingDisplayMode();

		if (canceled) {
			this.movePreviewToMain();
		}

		if (thinkingMode === ThinkingDisplayMode.CollapsedPreview && this.preview) {
			this.preview.classList.toggle('hidden', true);
		}

		this.updateBodyVisibility();
	}

	private updateBodyVisibility(): void {
		const hasBodyContent = this.body && this.body.children.length > 0;
		this.body.classList.toggle('hidden', !hasBodyContent);

		// hide when no content
		if (this._collapseButton) {
			this._collapseButton.element.classList.toggle('hidden', !hasBodyContent);
		}
	}

	private movePreviewToMain(): void {
		const previewChildren = this.preview.querySelectorAll('.chat-thinking-item');
		previewChildren.forEach(child => {
			this.body.appendChild(child);
		});
		this.updateBodyVisibility();
	}

	private appendToPreview(node: HTMLElement): void {
		const wrapper = $('.chat-thinking-item');
		wrapper.appendChild(node);
		this.preview.appendChild(wrapper);
		this.updateBodyVisibility();
	}

	private appendItem(node: HTMLElement) {
		const wrapper = $('.chat-thinking-item');
		wrapper.appendChild(node);
		this.body.appendChild(wrapper);
		this.updateBodyVisibility();
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'thinking' || other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized';
	}
}
