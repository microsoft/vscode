/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { $, AnimationFrameScheduler, DisposableResizeObserver } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { rcut } from '../../../../../../base/common/strings.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { ChatCollapsibleMarkdownContentPart } from './chatCollapsibleMarkdownContentPart.js';
import { IChatMarkdownContent, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { IRunSubagentToolInputParams, RunSubagentTool } from '../../../common/tools/builtinTools/runSubagentTool.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { createThinkingIcon, getToolInvocationIcon } from './chatThinkingContentPart.js';
import { CollapsibleListPool } from './chatReferencesContentPart.js';
import { EditorPool } from './chatContentCodePools.js';
import { CodeBlockModelCollection } from '../../../common/widget/codeBlockModelCollection.js';
import { ChatToolInvocationPart } from './toolInvocationParts/chatToolInvocationPart.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import './media/chatSubagentContent.css';

const MAX_TITLE_LENGTH = 100;

/**
 * Represents a lazy tool item that will be created when the subagent section is expanded.
 */
interface ILazyToolItem {
	kind: 'tool';
	lazy: Lazy<ChatToolInvocationPart>;
	toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized;
	codeBlockStartIndex: number;
}

/**
 * Represents a lazy markdown item (e.g., edit pill) that will be rendered when expanded.
 */
interface ILazyMarkdownItem {
	kind: 'markdown';
	lazy: Lazy<{ domNode: HTMLElement; disposable?: IDisposable }>;
}

type ILazyItem = ILazyToolItem | ILazyMarkdownItem;

/**
 * This is generally copied from ChatThinkingContentPart. We are still experimenting with both UIs so I'm not
 * trying to refactor to share code. Both could probably be simplified when stable.
 */
export class ChatSubagentContentPart extends ChatCollapsibleContentPart implements IChatContentPart {
	private wrapper!: HTMLElement;
	private isActive: boolean = true;
	private hasToolItems: boolean = false;
	private readonly isInitiallyComplete: boolean;
	private promptContainer: HTMLElement | undefined;
	private resultContainer: HTMLElement | undefined;
	private lastItemWrapper: HTMLElement | undefined;
	private readonly layoutScheduler: AnimationFrameScheduler;
	private description: string;
	private agentName: string | undefined;
	private prompt: string | undefined;

	// Lazy rendering support
	private readonly lazyItems: ILazyItem[] = [];
	private hasExpandedOnce: boolean = false;
	private pendingPromptRender: boolean = false;
	private pendingResultText: string | undefined;

	// Current tool message for collapsed title (persists even after tool completes)
	private currentRunningToolMessage: string | undefined;

	// Confirmation auto-expand tracking
	private toolsWaitingForConfirmation: number = 0;
	private userManuallyExpanded: boolean = false;
	private autoExpandedForConfirmation: boolean = false;

	/**
	 * Extracts subagent info (description, agentName, prompt) from a tool invocation.
	 */
	private static extractSubagentInfo(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): { description: string; agentName: string | undefined; prompt: string | undefined } {
		const defaultDescription = localize('chat.subagent.defaultDescription', 'Running subagent...');

		if (toolInvocation.toolId !== RunSubagentTool.Id) {
			return { description: defaultDescription, agentName: undefined, prompt: undefined };
		}

		// Check toolSpecificData first (works for both live and serialized)
		if (toolInvocation.toolSpecificData?.kind === 'subagent') {
			return {
				description: toolInvocation.toolSpecificData.description ?? defaultDescription,
				agentName: toolInvocation.toolSpecificData.agentName,
				prompt: toolInvocation.toolSpecificData.prompt,
			};
		}

		// Fallback to parameters for live invocations
		if (toolInvocation.kind === 'toolInvocation') {
			const state = toolInvocation.state.get();
			const params = state.type !== IChatToolInvocation.StateKind.Streaming ?
				state.parameters as IRunSubagentToolInputParams | undefined
				: undefined;
			return {
				description: params?.description ?? defaultDescription,
				agentName: params?.agentName,
				prompt: params?.prompt,
			};
		}

		return { description: defaultDescription, agentName: undefined, prompt: undefined };
	}

	constructor(
		public readonly subAgentInvocationId: string,
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		private readonly listPool: CollapsibleListPool,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly announcedToolProgressKeys: Set<string>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IHoverService hoverService: IHoverService,
	) {
		// Extract description, agentName, and prompt from toolInvocation
		const { description, agentName, prompt } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);

		// Build title: "AgentName: description" or "Subagent: description"
		const prefix = agentName || localize('chat.subagent.prefix', 'Subagent');
		const initialTitle = `${prefix}: ${description}`;
		super(initialTitle, context, undefined, hoverService);

		this.description = description;
		this.agentName = agentName;
		this.prompt = prompt;
		this.isInitiallyComplete = this.element.isComplete;

		const node = this.domNode;
		node.classList.add('chat-thinking-box', 'chat-thinking-fixed-mode', 'chat-subagent-part');

		// Note: wrapper is created lazily in initContent(), so we can't set its style here

		if (this._collapseButton && !this.element.isComplete) {
			this._collapseButton.icon = ThemeIcon.modify(Codicon.loading, 'spin');
		}

		this._register(autorun(r => {
			this.expanded.read(r);
			if (this._collapseButton) {
				if (!this.element.isComplete && this.isActive) {
					this._collapseButton.icon = ThemeIcon.modify(Codicon.loading, 'spin');
				} else {
					this._collapseButton.icon = Codicon.check;
				}
			}
		}));

		// Materialize lazy items when first expanded
		this._register(autorun(r => {
			if (this._isExpanded.read(r) && !this.hasExpandedOnce) {
				this.hasExpandedOnce = true;
				this.materializePendingContent();
			}
		}));

		// Start collapsed - fixed scrolling mode shows limited height when collapsed
		this.setExpanded(false);

		// Track user manual expansion
		// If the user expands (not via auto-expand for confirmation), mark it as manual
		// Only clear autoExpandedForConfirmation when user collapses, so re-expand is detected as manual
		this._register(autorun(r => {
			const expanded = this._isExpanded.read(r);
			if (expanded) {
				if (!this.autoExpandedForConfirmation) {
					this.userManuallyExpanded = true;
				}
			} else {
				// User collapsed - reset flags so next confirmation cycle can auto-collapse again
				if (this.autoExpandedForConfirmation) {
					this.autoExpandedForConfirmation = false;
				}
				// Reset manual expansion flag when user collapses, so future confirmation cycles can auto-collapse
				if (this.userManuallyExpanded) {
					this.userManuallyExpanded = false;
				}
			}
		}));

		// Scheduler for coalescing layout operations
		this.layoutScheduler = this._register(new AnimationFrameScheduler(this.domNode, () => this.performLayout()));

		// Render the prompt section at the start if available (must be after wrapper is initialized)
		this.renderPromptSection();

		// Watch for completion and render result
		this.watchToolCompletion(toolInvocation);
	}

	protected override initContent(): HTMLElement {
		this.wrapper = $('.chat-used-context-list.chat-thinking-collapsible');

		// Hide initially until there are tool calls
		if (!this.hasToolItems) {
			this.wrapper.style.display = 'none';
		}

		// Materialize any deferred content now that wrapper exists
		// This handles the case where the subclass autorun ran before this base class autorun
		this.materializePendingContent();

		// Use ResizeObserver to trigger layout when wrapper content changes
		const resizeObserver = this._register(new DisposableResizeObserver(() => this.layoutScheduler.schedule()));
		this._register(resizeObserver.observe(this.wrapper));

		return this.wrapper;
	}

	/**
	 * Renders the prompt as a collapsible section at the start of the content.
	 * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
	 * this is deferred until expanded.
	 */
	private renderPromptSection(): void {
		if (!this.prompt || this.promptContainer) {
			return;
		}

		// Defer rendering when wrapper doesn't exist yet (lazy init) or for old completed subagents until expanded
		if (!this.wrapper || (this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce)) {
			this.pendingPromptRender = true;
			return;
		}

		this.pendingPromptRender = false;
		this.doRenderPromptSection();
	}

	private doRenderPromptSection(): void {
		if (!this.prompt || this.promptContainer) {
			return;
		}

		// Split into first line and rest
		const lines = this.prompt.split('\n');
		const rawFirstLine = lines[0] || localize('chat.subagent.prompt', 'Prompt');
		const restOfLines = lines.slice(1).join('\n').trim();

		// Limit first line length, moving overflow to content
		const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
		const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
		const title = wasTruncated ? titleContent + '…' : titleContent;
		const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : '';
		const content = titleRemainder
			? (titleRemainder + (restOfLines ? '\n' + restOfLines : ''))
			: (restOfLines || this.prompt);

		// Create collapsible prompt part
		const collapsiblePart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleMarkdownContentPart,
			title,
			content,
			this.context,
			this.chatContentMarkdownRenderer
		));

		// Wrap in a container for chain of thought line styling
		this.promptContainer = $('.chat-thinking-tool-wrapper.chat-subagent-section');
		const promptIcon = createThinkingIcon(Codicon.comment);
		this.promptContainer.appendChild(promptIcon);
		this.promptContainer.appendChild(collapsiblePart.domNode);

		// Insert at the beginning of the wrapper
		// With lazy rendering, wrapper may not be created yet if content hasn't been expanded
		if (this.wrapper) {
			if (this.wrapper.firstChild) {
				this.wrapper.insertBefore(this.promptContainer, this.wrapper.firstChild);
			} else {
				dom.append(this.wrapper, this.promptContainer);
			}

			// Show the container if it was hidden (no tool items yet)
			if (this.wrapper.style.display === 'none') {
				this.wrapper.style.display = '';
			}
		}
	}

	public getIsActive(): boolean {
		return this.isActive;
	}

	public markAsInactive(): void {
		this.isActive = false;
		if (this._collapseButton) {
			this._collapseButton.icon = Codicon.check;
		}
		this.finalizeTitle();
		// Collapse when done
		this.setExpanded(false);
	}

	public finalizeTitle(): void {
		this.updateTitle();
		if (this._collapseButton) {
			this._collapseButton.icon = Codicon.check;
		}
	}

	private updateTitle(): void {
		const prefix = this.agentName || localize('chat.subagent.prefix', 'Subagent');
		let finalLabel = `${prefix}: ${this.description}`;
		if (this.currentRunningToolMessage && this.isActive) {
			finalLabel += ` \u2014 ${this.currentRunningToolMessage}`;
		}
		this.setTitleWithWidgets(new MarkdownString(finalLabel), this.instantiationService, this.chatMarkdownAnchorService, this.chatContentMarkdownRenderer);
	}

	/**
	 * Tracks a tool invocation's state for:
	 * 1. Updating the title with the current tool message (persists even after completion)
	 * 2. Auto-expanding when a tool is waiting for confirmation
	 * 3. Auto-collapsing when the confirmation is addressed
	 * This method is public to support testing.
	 */
	public trackToolState(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		// Only track live tool invocations
		if (toolInvocation.kind !== 'toolInvocation') {
			return;
		}

		// Set the title immediately when tool is added - like thinking part does
		const message = toolInvocation.invocationMessage;
		const messageText = typeof message === 'string' ? message : message.value;
		this.currentRunningToolMessage = messageText;
		this.updateTitle();

		let wasWaitingForConfirmation = false;
		this._register(autorun(r => {
			const state = toolInvocation.state.read(r);

			// Track confirmation state changes
			const isWaitingForConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ||
				state.type === IChatToolInvocation.StateKind.WaitingForPostApproval;

			if (isWaitingForConfirmation && !wasWaitingForConfirmation) {
				// Tool just started waiting for confirmation
				this.toolsWaitingForConfirmation++;
				if (!this.isExpanded()) {
					this.autoExpandedForConfirmation = true;
					this.setExpanded(true);
				}
			} else if (!isWaitingForConfirmation && wasWaitingForConfirmation) {
				// Tool is no longer waiting for confirmation
				this.toolsWaitingForConfirmation--;
				if (this.toolsWaitingForConfirmation === 0 && this.autoExpandedForConfirmation && !this.userManuallyExpanded) {
					// Auto-collapse only if we auto-expanded and user didn't manually expand
					this.autoExpandedForConfirmation = false;
					this.setExpanded(false);
				}
			}

			wasWaitingForConfirmation = isWaitingForConfirmation;
		}));
	}

	/**
	 * Watches the tool invocation for completion and renders the result.
	 * Handles both live and serialized invocations.
	 */
	private watchToolCompletion(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		if (toolInvocation.toolId !== RunSubagentTool.Id) {
			return;
		}

		if (toolInvocation.kind === 'toolInvocation') {
			// Watch for completion and render the result
			let wasStreaming = toolInvocation.state.get().type === IChatToolInvocation.StateKind.Streaming;
			this._register(autorun(r => {
				const state = toolInvocation.state.read(r);
				if (state.type === IChatToolInvocation.StateKind.Completed) {
					wasStreaming = false;
					// Extract text from result
					const textParts = (state.contentForModel || [])
						.filter((part): part is { kind: 'text'; value: string } => part.kind === 'text')
						.map(part => part.value);

					if (textParts.length > 0) {
						this.renderResultText(textParts.join('\n'));
					}

					// Mark as inactive when the tool completes
					this.markAsInactive();
				} else if (wasStreaming && state.type !== IChatToolInvocation.StateKind.Streaming) {
					wasStreaming = false;
					// Update things that change when tool is done streaming
					const { description, agentName, prompt } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
					this.description = description;
					this.agentName = agentName;
					this.prompt = prompt;
					this.renderPromptSection();
					this.updateTitle();
				}
			}));
		} else if (toolInvocation.toolSpecificData?.kind === 'subagent' && toolInvocation.toolSpecificData.result) {
			// Render the persisted result for serialized invocations
			this.renderResultText(toolInvocation.toolSpecificData.result);
			// Already complete, mark as inactive
			this.markAsInactive();
		}
	}

	/**
	 * Renders the result text as a collapsible section.
	 * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
	 * this is deferred until expanded.
	 */
	public renderResultText(resultText: string): void {
		if (this.resultContainer || !resultText) {
			return; // Already rendered or no content
		}

		// Defer rendering when wrapper doesn't exist yet (lazy init) or for old completed subagents until expanded
		if (!this.wrapper || (this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce)) {
			this.pendingResultText = resultText;
			return;
		}

		this.pendingResultText = undefined;
		this.doRenderResultText(resultText);
	}

	private doRenderResultText(resultText: string): void {
		if (this.resultContainer || !resultText) {
			return;
		}

		// Split into first line and rest
		const lines = resultText.split('\n');
		const rawFirstLine = lines[0] || '';
		const restOfLines = lines.slice(1).join('\n').trim();

		// Limit first line length, moving overflow to content
		const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
		const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
		const title = wasTruncated ? titleContent + '…' : titleContent;
		const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : '';
		const content = titleRemainder
			? (titleRemainder + (restOfLines ? '\n' + restOfLines : ''))
			: restOfLines;

		// Create collapsible result part
		const collapsiblePart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleMarkdownContentPart,
			title,
			content,
			this.context,
			this.chatContentMarkdownRenderer
		));

		// Wrap in a container for chain of thought line styling
		this.resultContainer = $('.chat-thinking-tool-wrapper.chat-subagent-section');
		const resultIcon = createThinkingIcon(Codicon.check);
		this.resultContainer.appendChild(resultIcon);
		this.resultContainer.appendChild(collapsiblePart.domNode);

		// With lazy rendering, wrapper may not be created yet if content hasn't been expanded
		if (this.wrapper) {
			dom.append(this.wrapper, this.resultContainer);

			// Show the container if it was hidden
			if (this.wrapper.style.display === 'none') {
				this.wrapper.style.display = '';
			}
		}
	}

	/**
	 * Appends a tool invocation to the subagent group.
	 * The tool part is created lazily - only when the subagent section is expanded,
	 * unless it's actively streaming (not initially complete), in which case render immediately.
	 */
	public appendToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, codeBlockStartIndex: number): void {
		// Show the container when first tool item is added
		if (!this.hasToolItems) {
			this.hasToolItems = true;
			// With lazy rendering, wrapper may not be created yet if content hasn't been expanded
			if (this.wrapper) {
				this.wrapper.style.display = '';
			}
		}

		// Track tool state for title updates and auto-expand/collapse on confirmation
		this.trackToolState(toolInvocation);

		// Render immediately only if already expanded or has been expanded before
		if (this.isExpanded() || this.hasExpandedOnce) {
			const part = this.createToolPart(toolInvocation, codeBlockStartIndex);
			this.appendToolPartToDOM(part, toolInvocation);
		} else {
			// Defer rendering until expanded
			const item: ILazyToolItem = {
				kind: 'tool',
				lazy: new Lazy(() => this.createToolPart(toolInvocation, codeBlockStartIndex)),
				toolInvocation,
				codeBlockStartIndex,
			};
			this.lazyItems.push(item);
		}
	}

	/**
	 * Appends a markdown item (e.g., an edit pill) to the subagent content part.
	 * This is used to route codeblockUri parts with subAgentInvocationId to this subagent's container.
	 */
	public appendMarkdownItem(
		factory: () => { domNode: HTMLElement; disposable?: IDisposable },
		_codeblocksPartId: string | undefined,
		_markdown: IChatMarkdownContent,
		_originalParent?: HTMLElement
	): void {
		// If expanded or has been expanded once, render immediately
		if (this.isExpanded() || this.hasExpandedOnce) {
			const result = factory();
			this.appendMarkdownItemToDOM(result.domNode);
			if (result.disposable) {
				this._register(result.disposable);
			}
		} else {
			// Defer rendering until expanded
			const item: ILazyMarkdownItem = {
				kind: 'markdown',
				lazy: new Lazy(factory),
			};
			this.lazyItems.push(item);
		}
	}

	/**
	 * Appends a markdown item's DOM node to the wrapper.
	 */
	private appendMarkdownItemToDOM(domNode: HTMLElement): void {
		if (!domNode.hasChildNodes() || domNode.textContent?.trim() === '') {
			return;
		}

		// Wrap with icon like other items
		const itemWrapper = $('.chat-thinking-tool-wrapper');
		const iconElement = createThinkingIcon(Codicon.edit);
		itemWrapper.appendChild(domNode);
		itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);

		// Insert before result container if it exists, otherwise append
		if (this.wrapper) {
			if (this.resultContainer) {
				this.wrapper.insertBefore(itemWrapper, this.resultContainer);
			} else {
				this.wrapper.appendChild(itemWrapper);
			}
		}
		this.lastItemWrapper = itemWrapper;

		// Schedule layout to measure last item and scroll
		this.layoutScheduler.schedule();
	}

	protected override shouldInitEarly(): boolean {
		// Never init early - subagent is collapsed while running, content only shown on expand
		return false;
	}

	/**
	 * Creates a ChatToolInvocationPart for the given tool invocation.
	 */
	private createToolPart(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, codeBlockStartIndex: number): ChatToolInvocationPart {
		const part = this.instantiationService.createInstance(
			ChatToolInvocationPart,
			toolInvocation,
			this.context,
			this.chatContentMarkdownRenderer,
			this.listPool,
			this.editorPool,
			this.currentWidthDelegate,
			this.codeBlockModelCollection,
			this.announcedToolProgressKeys,
			codeBlockStartIndex
		);

		this._register(part);
		return part;
	}

	/**
	 * Appends a tool part's DOM node to the wrapper with appropriate icon wrapper.
	 */
	private appendToolPartToDOM(part: ChatToolInvocationPart, toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		const content = part.domNode;
		if (!content.hasChildNodes() || content.textContent?.trim() === '') {
			return;
		}

		// Wrap with icon like thinking parts do
		const itemWrapper = $('.chat-thinking-tool-wrapper');
		const icon = getToolInvocationIcon(toolInvocation.toolId);
		const iconElement = createThinkingIcon(icon);
		itemWrapper.appendChild(content);

		// Dynamically add/remove icon based on confirmation state
		if (toolInvocation.kind === 'toolInvocation') {
			this._register(autorun(r => {
				const state = toolInvocation.state.read(r);
				const hasConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ||
					state.type === IChatToolInvocation.StateKind.WaitingForPostApproval;
				if (hasConfirmation) {
					iconElement.remove();
				} else if (!iconElement.parentElement) {
					itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
				}
			}));
		} else {
			// For serialized invocations, always show icon (already completed)
			itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
		}

		// Insert before result container if it exists, otherwise append
		// With lazy rendering, wrapper may not be created yet if content hasn't been expanded
		if (this.wrapper) {
			if (this.resultContainer) {
				this.wrapper.insertBefore(itemWrapper, this.resultContainer);
			} else {
				this.wrapper.appendChild(itemWrapper);
			}
		}
		this.lastItemWrapper = itemWrapper;

		// Schedule layout to measure last item and scroll
		this.layoutScheduler.schedule();
	}

	/**
	 * Materializes a lazy item by creating the content and adding it to the DOM.
	 */
	private materializeLazyItem(item: ILazyItem): void {
		if (item.lazy.hasValue) {
			return; // Already materialized
		}

		if (item.kind === 'tool') {
			const part = item.lazy.value;
			this.appendToolPartToDOM(part, item.toolInvocation);
		} else if (item.kind === 'markdown') {
			const result = item.lazy.value;
			this.appendMarkdownItemToDOM(result.domNode);
			if (result.disposable) {
				this._register(result.disposable);
			}
		}
	}

	/**
	 * Materializes all pending lazy content (prompt, tool items, result) when the section is expanded.
	 * This is called when first expanded, but the wrapper must exist (created by base class initContent).
	 */
	private materializePendingContent(): void {
		// Wrapper may not be created yet if this autorun runs before the base class autorun
		// that calls initContent(). In that case, initContent() will call this logic.
		if (!this.wrapper) {
			return;
		}

		// Render pending prompt section
		if (this.pendingPromptRender) {
			this.pendingPromptRender = false;
			this.doRenderPromptSection();
		}

		// Materialize lazy tool items
		for (const item of this.lazyItems) {
			this.materializeLazyItem(item);
		}

		// Render pending result text
		if (this.pendingResultText) {
			const resultText = this.pendingResultText;
			this.pendingResultText = undefined;
			this.doRenderResultText(resultText);
		}
	}

	private performLayout(): void {
		// Measure last item height once after layout, set CSS variable for collapsed max-height
		if (this.lastItemWrapper && this.wrapper) {
			const height = this.lastItemWrapper.offsetHeight;
			if (height > 0) {
				this.wrapper.style.setProperty('--chat-subagent-last-item-height', `${height}px`);
			}
		}

		// Auto-scroll to bottom only when actively streaming (not for completed responses)
		if (this.isActive && !this.isInitiallyComplete && this.wrapper) {
			const scrollHeight = this.wrapper.scrollHeight;
			this.wrapper.scrollTop = scrollHeight;
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		if (other.kind === 'markdownContent') {
			return true;
		}

		// Match subagent tool invocations with the same subAgentInvocationId to keep them grouped
		if ((other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') && (other.subAgentInvocationId || other.toolId === RunSubagentTool.Id)) {
			// For runSubagent tool, use toolCallId as the effective ID
			const otherEffectiveId = other.toolId === RunSubagentTool.Id ? other.toolCallId : other.subAgentInvocationId;
			// If both have IDs, they must match
			if (this.subAgentInvocationId && otherEffectiveId) {
				return this.subAgentInvocationId === otherEffectiveId;
			}
			// Fallback for tools without IDs - group if this part has no ID and tool has no ID
			return !this.subAgentInvocationId && !otherEffectiveId;
		}
		return false;
	}
}
