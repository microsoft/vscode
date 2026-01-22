/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { $, AnimationFrameScheduler, DisposableResizeObserver } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
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
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { IRunSubagentToolInputParams, RunSubagentTool } from '../../../common/tools/builtinTools/runSubagentTool.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { createThinkingIcon, getToolInvocationIcon } from './chatThinkingContentPart.js';
import { CollapsibleListPool } from './chatReferencesContentPart.js';
import { EditorPool } from './chatContentCodePools.js';
import { CodeBlockModelCollection } from '../../../common/widget/codeBlockModelCollection.js';
import { ChatToolInvocationPart } from './toolInvocationParts/chatToolInvocationPart.js';
import './media/chatSubagentContent.css';

const MAX_TITLE_LENGTH = 100;

/**
 * Represents a lazy tool item that will be created when the subagent section is expanded.
 */
interface ILazyToolItem {
	lazy: Lazy<ChatToolInvocationPart>;
	toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized;
	codeBlockStartIndex: number;
}

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
	private readonly lazyItems: ILazyToolItem[] = [];
	private hasExpandedOnce: boolean = false;
	private pendingPromptRender: boolean = false;
	private pendingResultText: string | undefined;

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
		node.tabIndex = 0;

		// Note: wrapper is created lazily in initContent(), so we can't set its style here

		if (this._collapseButton && !this.element.isComplete) {
			this._collapseButton.icon = ThemeIcon.modify(Codicon.loading, 'spin');
		}

		this._register(autorun(r => {
			this.expanded.read(r);
			if (this._collapseButton && this.wrapper) {
				if (this.wrapper.classList.contains('chat-thinking-streaming') && !this.element.isComplete && this.isActive) {
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

		// Scheduler for coalescing layout operations
		this.layoutScheduler = this._register(new AnimationFrameScheduler(this.domNode, () => this.performLayout()));

		// Render the prompt section at the start if available (must be after wrapper is initialized)
		this.renderPromptSection();

		// Watch for completion and render result
		this.watchToolCompletion(toolInvocation);
	}

	protected override initContent(): HTMLElement {
		const baseClasses = '.chat-used-context-list.chat-thinking-collapsible';
		const classes = this.isInitiallyComplete
			? baseClasses
			: `${baseClasses}.chat-thinking-streaming`;
		this.wrapper = $(classes);

		// Hide initially until there are tool calls
		if (!this.hasToolItems) {
			this.wrapper.style.display = 'none';
		}

		// Use ResizeObserver to trigger layout when wrapper content changes
		const resizeObserver = this._register(new DisposableResizeObserver(() => this.layoutScheduler.schedule()));
		this._register(resizeObserver.observe(this.wrapper));

		return this.wrapper;
	}

	/**
	 * Renders the prompt as a collapsible section at the start of the content.
	 * If the subagent is initially complete (old/restored), this is deferred until expanded.
	 */
	private renderPromptSection(): void {
		if (!this.prompt || this.promptContainer) {
			return;
		}

		// Defer rendering for old completed subagents until expanded
		if (this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce) {
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
		}
	}

	public getIsActive(): boolean {
		return this.isActive;
	}

	public markAsInactive(): void {
		this.isActive = false;
		// With lazy rendering, wrapper may not be created yet if content hasn't been expanded
		if (this.wrapper) {
			this.wrapper.classList.remove('chat-thinking-streaming');
		}
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
		if (this._collapseButton) {
			const prefix = this.agentName || localize('chat.subagent.prefix', 'Subagent');
			const finalLabel = `${prefix}: ${this.description}`;
			this._collapseButton.label = finalLabel;
		}
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
	 * If the subagent is initially complete (old/restored), this is deferred until expanded.
	 */
	public renderResultText(resultText: string): void {
		if (this.resultContainer || !resultText) {
			return; // Already rendered or no content
		}

		// Defer rendering for old completed subagents until expanded
		if (this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce) {
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

		// Render immediately if:
		// - The section is expanded
		// - It has been expanded once before
		// - It's actively streaming (not an old completed subagent being restored)
		if (this.isExpanded() || this.hasExpandedOnce || !this.isInitiallyComplete) {
			const part = this.createToolPart(toolInvocation, codeBlockStartIndex);
			this.appendToolPartToDOM(part, toolInvocation);
		} else {
			// Defer rendering until expanded (for old completed subagents)
			const item: ILazyToolItem = {
				lazy: new Lazy(() => this.createToolPart(toolInvocation, codeBlockStartIndex)),
				toolInvocation,
				codeBlockStartIndex,
			};
			this.lazyItems.push(item);
		}
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

		// Wrap with icon like thinking parts do, but skip icon for tools needing confirmation
		const itemWrapper = $('.chat-thinking-tool-wrapper');
		const icon = getToolInvocationIcon(toolInvocation.toolId);
		const iconElement = createThinkingIcon(icon);
		itemWrapper.appendChild(iconElement);
		itemWrapper.appendChild(content);

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
	 * Materializes a lazy tool item by creating the tool part and adding it to the DOM.
	 */
	private materializeLazyItem(item: ILazyToolItem): void {
		if (item.lazy.hasValue) {
			return; // Already materialized
		}

		const part = item.lazy.value;
		this.appendToolPartToDOM(part, item.toolInvocation);
	}

	/**
	 * Materializes all pending lazy content (prompt, tool items, result) when the section is expanded.
	 */
	private materializePendingContent(): void {
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
