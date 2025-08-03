/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { $ } from '../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatThinkingPart } from '../../common/chatService.js';
import { IChatContentPartRenderContext, IChatContentPart } from './chatContentParts.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';

export class ChatThinkingContentPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;
	public readonly codeblocks: undefined;
	public readonly codeblocksPartId: undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private currentThinkingValue: string;
	private currentMetadata?: string;
	private readonly thinkingChunks: Map<string, string> = new Map();

	private readonly renderer: MarkdownRenderer;
	private contentContainer!: HTMLElement;
	private textContainer!: HTMLElement;
	private metadataContainer?: HTMLElement;

	private isCollapsed: boolean = true;
	private markdownResult: IDisposable | undefined;
	private metadataMarkdownResult: IDisposable | undefined;

	// Time tracking for dynamic label
	private startTime: number = Date.now();
	private isComplete: boolean = false;
	private labelUpdateInterval: number | undefined;
	private expandButton: ButtonWithIcon | undefined;

	constructor(
		content: IChatThinkingPart,
		private readonly _context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.renderer = instantiationService.createInstance(MarkdownRenderer, {});
		this.currentThinkingValue = content.value || '';
		this.currentMetadata = content.metadata;

		if (content.id) {
			this.thinkingChunks.set(content.id, content.value || '');
		}

		const headerDomNode = $('.chat-thinking-summary-header');
		this.domNode = $('.chat-thinking-summary', undefined, headerDomNode);
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-label', 'Thinking process');

		this._register(this.renderHeader(headerDomNode));
		this._register(this.renderContent());
	}

	private renderHeader(container: HTMLElement): IDisposable {
		const buttonContainer = container.appendChild($('.chat-thinking-label'));
		const expandButton = new ButtonWithIcon(buttonContainer, {});
		this.expandButton = expandButton;
		this.updateLabel();

		const setExpansionState = () => {
			expandButton.icon = this.isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
			this.domNode.classList.toggle('chat-thinking-collapsed', this.isCollapsed);
			this._onDidChangeHeight.fire();
		};
		setExpansionState();

		// Start updating the label periodically
		this.startLabelUpdates();

		const disposables = new DisposableStore();
		disposables.add(expandButton);
		disposables.add(expandButton.onDidClick(() => {
			this.isCollapsed = !this.isCollapsed;
			setExpansionState();
		}));

		return toDisposable(() => disposables.dispose());
	}

	private updateLabel(): void {
		if (!this.expandButton) {
			return;
		}

		const elapsedMs = Date.now() - this.startTime;
		const elapsedSeconds = Math.floor(elapsedMs / 1000);

		if (this.isComplete) {
			this.expandButton.label = `Thought for ${elapsedSeconds}s`;
		} else {
			this.expandButton.label = `Thinking for ${elapsedSeconds}s...`;
		}
	}

	private startLabelUpdates(): void {
		if (this.labelUpdateInterval) {
			const targetWindow = dom.getWindow(this.domNode);
			targetWindow.clearInterval(this.labelUpdateInterval);
		}

		// Update every second while thinking
		const targetWindow = dom.getWindow(this.domNode);
		this.labelUpdateInterval = targetWindow.setInterval(() => {
			if (!this.isComplete) {
				this.updateLabel();
			} else {
				this.stopLabelUpdates();
			}
		}, 1000);
	}

	private stopLabelUpdates(): void {
		if (this.labelUpdateInterval) {
			const targetWindow = dom.getWindow(this.domNode);
			targetWindow.clearInterval(this.labelUpdateInterval);
			this.labelUpdateInterval = undefined;
		}
	}

	private renderContent(): IDisposable {
		this.contentContainer = $('.chat-thinking-content');
		this.textContainer = $('.thinking-text.markdown-content');
		this.contentContainer.appendChild(this.textContainer);
		this.domNode.appendChild(this.contentContainer);

		if (this.currentThinkingValue) {
			this.renderMarkdown(this.currentThinkingValue);
		}

		if (this.currentMetadata) {
			this.renderMetadata();
		}

		return {
			dispose: () => { }
		};
	}

	private renderMetadata(): void {
		if (!this.metadataContainer) {
			this.metadataContainer = $('.thinking-metadata');
			this.contentContainer.appendChild(this.metadataContainer);
		}

		dom.clearNode(this.metadataContainer);

		if (this.metadataMarkdownResult) {
			this.metadataMarkdownResult.dispose();
			this.metadataMarkdownResult = undefined;
		}

		if (this.currentMetadata) {
			const metadataMarkdown = this.renderer.render(new MarkdownString(this.currentMetadata));
			this.metadataMarkdownResult = metadataMarkdown;
			this.metadataContainer.appendChild(metadataMarkdown.element);
		}
	}

	hasSameContent(other: any): boolean {
		if (other.kind !== 'thinking') {
			return false;
		}

		return true;
	}

	update(newContent: IChatThinkingPart): void {
		let contentChanged = false;

		if (newContent.id && newContent.id.startsWith('combined-thinking-')) {
			if (newContent.value && newContent.value !== this.currentThinkingValue) {
				const formattedValue = newContent.value
					.split(/(<\|im_sep\|>|<\|lim_sep\|>)/g)
					.filter(part => part && !part.match(/(<\|im_sep\|>|<\|lim_sep\|>)/))
					.map(part => part.trim())
					.join('\n\n');

				this.currentThinkingValue = formattedValue;
				this.renderMarkdown(formattedValue);
				contentChanged = true;
			}
		}
		else if (newContent.id && !this.thinkingChunks.has(newContent.id)) {
			this.thinkingChunks.set(newContent.id, newContent.value || '');

			const combinedValue = Array.from(this.thinkingChunks.values())
				.map(chunk => chunk.trim())
				.join('\n\n');

			if (combinedValue.length > 0 && combinedValue !== this.currentThinkingValue) {
				this.currentThinkingValue = combinedValue;
				this.renderMarkdown(combinedValue);
				contentChanged = true;
			}
		} else if (newContent.value && newContent.value !== this.currentThinkingValue) {
			const existingContent = this.currentThinkingValue || '';

			if (newContent.value.length > existingContent.length && newContent.value.includes(existingContent)) {
				this.currentThinkingValue = newContent.value;
				this.renderMarkdown(newContent.value);
				contentChanged = true;
			} else if (!existingContent.includes(newContent.value)) {
				const separator = existingContent ? '\n\n' : '';
				const newFullContent = existingContent + separator + newContent.value.trim();
				this.currentThinkingValue = newFullContent;
				this.renderMarkdown(newFullContent);
				contentChanged = true;
			}
		}

		if (newContent.metadata && newContent.metadata !== this.currentMetadata) {
			this.currentMetadata = newContent.metadata;
			this.renderMetadata();
			contentChanged = true;
		}

		if (contentChanged) {
			if (this.isCollapsed) {
				this.isCollapsed = false;
				this.domNode.classList.remove('chat-thinking-collapsed');
				this._onDidChangeHeight.fire();
			}

			this._onDidChangeHeight.fire();
		}

		// Check if the entire response is complete
		if (this._context.element.isComplete && !this.isComplete) {
			this.markAsComplete();
		}
	}

	private markAsComplete(): void {
		this.isComplete = true;
		this.updateLabel();
		this.stopLabelUpdates();
	}

	private renderMarkdown(content: string): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}

		dom.clearNode(this.textContainer);

		const markdownResult = this.renderer.render(new MarkdownString(content));
		this.markdownResult = markdownResult;

		this.textContainer.appendChild(markdownResult.element);
	}

	addDisposable<T extends IDisposable>(disposable: T): T {
		return this._register(disposable);
	}

	override dispose(): void {
		this.stopLabelUpdates();

		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}

		if (this.metadataMarkdownResult) {
			this.metadataMarkdownResult.dispose();
			this.metadataMarkdownResult = undefined;
		}

		super.dispose();
	}
}
