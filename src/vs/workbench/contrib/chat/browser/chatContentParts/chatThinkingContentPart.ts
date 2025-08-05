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
import { isResponseVM, ChatResponseViewModel } from '../../common/chatViewModel.js';

export class ChatThinkingContentPart extends Disposable implements IChatContentPart {

	private static readonly timerRegistry = new Map<string, {
		startTime: number;
		completionTime?: number;
		isComplete: boolean;
		elapsedAtLastUpdate: number;
	}>();

	private static getTimerState(responseId: string): { startTime: number; completionTime?: number; isComplete: boolean; elapsedAtLastUpdate: number } {
		if (!this.timerRegistry.has(responseId)) {
			const startTime = Date.now();
			this.timerRegistry.set(responseId, {
				startTime,
				isComplete: false,
				elapsedAtLastUpdate: 0
			});
		}
		return this.timerRegistry.get(responseId)!;
	}

	private static markResponseComplete(responseId: string): void {
		const state = this.getTimerState(responseId);
		if (!state.isComplete) {
			state.completionTime = Date.now();
			state.isComplete = true;
		}
	}

	readonly domNode: HTMLElement;
	public readonly codeblocks: undefined;
	public readonly codeblocksPartId: undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private currentThinkingValue: string;
	private currentMetadata?: string;
	private readonly thinkingChunks: Map<string, string> = new Map();
	private readonly toolInvocations: HTMLElement[] = [];

	private readonly renderer: MarkdownRenderer;
	private contentContainer!: HTMLElement;
	private textContainer!: HTMLElement;
	private metadataContainer?: HTMLElement;

	private isCollapsed: boolean = true;
	private markdownResult: IDisposable | undefined;
	private markdownResults: IDisposable[] = [];
	private metadataMarkdownResult: IDisposable | undefined;

	private readonly responseId: string;
	private timerInterval?: number;
	private expandButton?: ButtonWithIcon;
	private _isDisposed: boolean = false;

	constructor(
		content: IChatThinkingPart,
		private readonly _context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.responseId = this._context.element.id;
		ChatThinkingContentPart.getTimerState(this.responseId);

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

		// Listen for response completion to immediately update the timer
		if (isResponseVM(this._context.element)) {
			const responseVM = this._context.element as ChatResponseViewModel;
			this._register(responseVM.onDidChange(() => {
				if (this._context.element.isComplete && !this._isDisposed) {
					const timerState = ChatThinkingContentPart.getTimerState(this.responseId);
					if (!timerState.isComplete) {
						this.markComplete();
					}
				}
			}));
		}

		this.startTimer();
	}

	public get chatResponseId(): string {
		return this.responseId;
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

		const disposables = new DisposableStore();
		disposables.add(expandButton);
		disposables.add(expandButton.onDidClick(() => {
			this.isCollapsed = !this.isCollapsed;
			setExpansionState();
		}));

		return toDisposable(() => disposables.dispose());
	}

	private startTimer(): void {
		const timerState = ChatThinkingContentPart.getTimerState(this.responseId);

		if (this.timerInterval || this._isDisposed || timerState.isComplete) {
			return;
		}

		const targetWindow = dom.getWindow(this.domNode);
		this.timerInterval = targetWindow.setInterval(() => {
			const currentState = ChatThinkingContentPart.getTimerState(this.responseId);
			if (this._isDisposed || currentState.isComplete || !this.expandButton) {
				this.stopTimer();
				return;
			}
			this.updateLabel();
		}, 500);
	}

	private stopTimer(): void {
		if (this.timerInterval !== undefined) {
			const targetWindow = dom.getWindow(this.domNode);
			targetWindow.clearInterval(this.timerInterval);
			this.timerInterval = undefined;
		}
	}

	private updateLabel(): void {
		if (!this.expandButton || this._isDisposed) {
			return;
		}

		const timerState = ChatThinkingContentPart.getTimerState(this.responseId);
		const currentTime = timerState.completionTime || Date.now();
		const elapsedMs = currentTime - timerState.startTime;

		let elapsedSeconds: number;
		if (timerState.isComplete) {
			elapsedSeconds = Math.max(1, Math.ceil(elapsedMs / 1000));
		} else {
			elapsedSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
		}

		if (timerState.isComplete) {
			this.expandButton.label = `Thought for ${elapsedSeconds}s`;
		} else {
			this.expandButton.label = `Thinking for ${elapsedSeconds}s...`;
		}
	}

	private markComplete(): void {
		const timerState = ChatThinkingContentPart.getTimerState(this.responseId);
		if (timerState.isComplete) {
			return;
		}

		ChatThinkingContentPart.markResponseComplete(this.responseId);
		this.stopTimer();
		this.updateLabel();
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
		// Early exit if disposed to prevent any interference
		if (this._isDisposed) {
			return;
		}

		let contentChanged = false;

		const chunkValue = newContent.value || '';
		const parsedChunkValue = chunkValue.replace(/<\|im_sep\|>\*{4,}/g, '');

		if (newContent.id && !this.thinkingChunks.has(newContent.id)) {
			this.thinkingChunks.set(newContent.id, parsedChunkValue);

			if (parsedChunkValue.trim()) {
				this.addThinkingText(parsedChunkValue.trim());
				this.currentThinkingValue = (this.currentThinkingValue || '') + (this.currentThinkingValue ? '\n\n' : '') + parsedChunkValue.trim();
				contentChanged = true;
			}
		} else if (parsedChunkValue && parsedChunkValue !== this.currentThinkingValue) {
			const existingContent = this.currentThinkingValue || '';

			if (parsedChunkValue.length > existingContent.length && parsedChunkValue.includes(existingContent)) {
				const newPart = parsedChunkValue.substring(existingContent.length).trim();
				if (newPart) {
					this.addThinkingText(newPart);
					this.currentThinkingValue = parsedChunkValue;
					contentChanged = true;
				}
			} else if (!existingContent.includes(parsedChunkValue)) {
				this.addThinkingText(parsedChunkValue.trim());
				const separator = existingContent ? '\n\n' : '';
				this.currentThinkingValue = existingContent + separator + parsedChunkValue.trim();
				contentChanged = true;
			}
		}

		if (newContent.metadata && newContent.metadata !== this.currentMetadata) {
			this.currentMetadata = newContent.metadata;
			this.renderMetadata();
			contentChanged = true;
		}

		if (contentChanged) {
			this._onDidChangeHeight.fire();
		}

		// Check for completion immediately
		if (this._context.element.isComplete) {
			const timerState = ChatThinkingContentPart.getTimerState(this.responseId);
			if (!timerState.isComplete) {
				this.markComplete();
			}
		}
	}

	/**
	 * Add a tool invocation element to the thinking content
	 */
	addToolInvocation(toolElement: HTMLElement): void {
		if (this._isDisposed) {
			return;
		}

		// Store reference to the tool invocation
		this.toolInvocations.push(toolElement);

		// Add the tool element to the content container
		if (this.contentContainer) {
			this.contentContainer.appendChild(toolElement);
			this._onDidChangeHeight.fire();
		}
	}

	private addThinkingText(content: string): void {
		// Create a new thinking-text container and append it to chat-thinking-content
		const newTextContainer = $('.thinking-text.markdown-content');

		const markdownResult = this.renderer.render(new MarkdownString(content));
		newTextContainer.appendChild(markdownResult.element);
		this.contentContainer.appendChild(newTextContainer);

		if (!this.markdownResults) {
			this.markdownResults = [];
		}
		this.markdownResults.push(markdownResult);
	}

	private renderMarkdown(content: string): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}

		// Clean the content to remove unwanted markers
		const cleanedContent = content
			.replace(/<\|im_sep\|>\*{4,}/g, '')  // Remove <|im_sep|>**** markers
			.replace(/<\|lim_sep\|>\*{4,}/g, '') // Remove <|lim_sep|>**** markers
			.trim();

		if (!cleanedContent) {
			return; // Don't render empty content
		}

		// Create a new thinking-text container and append it to chat-thinking-content
		const newTextContainer = $('.thinking-text.markdown-content');

		const markdownResult = this.renderer.render(new MarkdownString(cleanedContent));
		this.markdownResult = markdownResult;

		newTextContainer.appendChild(markdownResult.element);

		// Append the new thinking text to the bottom of chat-thinking-content
		this.contentContainer.appendChild(newTextContainer);

		// Update textContainer reference to the newest one
		this.textContainer = newTextContainer;
	}

	addDisposable<T extends IDisposable>(disposable: T): T {
		return this._register(disposable);
	}

	override dispose(): void {
		this._isDisposed = true;
		this.stopTimer();
		this.expandButton = undefined;
		this.toolInvocations.forEach(element => {
			if (element.parentNode) {
				element.parentNode.removeChild(element);
			}
		});
		this.toolInvocations.length = 0;

		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}
		this.markdownResults.forEach(result => result.dispose());
		this.markdownResults.length = 0;

		if (this.metadataMarkdownResult) {
			this.metadataMarkdownResult.dispose();
			this.metadataMarkdownResult = undefined;
		}

		super.dispose();
	}
}
