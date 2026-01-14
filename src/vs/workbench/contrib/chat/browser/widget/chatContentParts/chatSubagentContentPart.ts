/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
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
import { RunSubagentTool } from '../../../common/tools/builtinTools/runSubagentTool.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { createThinkingIcon, getToolInvocationIcon } from './chatThinkingContentPart.js';
import './media/chatSubagentContent.css';

/**
 * This is generally copied from ChatThinkingContentPart. We are still experimenting with both UIs so I'm not
 * trying to refactor to share code. Both could probably be simplified when stable.
 */
export class ChatSubagentContentPart extends ChatCollapsibleContentPart implements IChatContentPart {
	private wrapper!: HTMLElement;
	private isActive: boolean = true;
	private readonly isInitiallyComplete: boolean;
	private resultContainer: HTMLElement | undefined;
	private lastItemWrapper: HTMLElement | undefined;
	private readonly layoutScheduler: RunOnceScheduler;

	constructor(
		public readonly subAgentInvocationId: string,
		private readonly description: string,
		private readonly agentName: string | undefined,
		private readonly context: IChatContentPartRenderContext,
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
	) {
		// Build title: "AgentName: description" or "Subagent: description"
		const prefix = agentName || localize('chat.subagent.prefix', 'Subagent');
		const initialTitle = `${prefix}: ${description}`;
		super(initialTitle, context, undefined, hoverService);

		this.isInitiallyComplete = this.element.isComplete;

		const node = this.domNode;
		node.classList.add('chat-thinking-box', 'chat-thinking-fixed-mode', 'chat-subagent-part');
		node.tabIndex = 0;

		// Hide initially until there are tool calls
		node.style.display = 'none';

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

		// Start collapsed - fixed scrolling mode shows limited height when collapsed
		this.setExpanded(false);

		// Scheduler for coalescing layout operations
		this.layoutScheduler = this._register(new RunOnceScheduler(() => this.performLayout(), 0));
	}

	protected override initContent(): HTMLElement {
		const baseClasses = '.chat-used-context-list.chat-thinking-collapsible';
		const classes = this.isInitiallyComplete
			? baseClasses
			: `${baseClasses}.chat-thinking-streaming`;
		this.wrapper = $(classes);
		return this.wrapper;
	}

	public getIsActive(): boolean {
		return this.isActive;
	}

	public markAsInactive(): void {
		this.isActive = false;
		this.wrapper.classList.remove('chat-thinking-streaming');
		if (this._collapseButton) {
			this._collapseButton.icon = Codicon.check;
		}
		this.finalizeTitleIfDefault();
		// Collapse when done
		this.setExpanded(false);
		this._onDidChangeHeight.fire();
	}

	public finalizeTitleIfDefault(): void {
		const prefix = this.agentName || localize('chat.subagent.prefix', 'Subagent');
		const finalLabel = `${prefix}: ${this.description}`;

		if (this._collapseButton) {
			this._collapseButton.icon = Codicon.check;
			this._collapseButton.label = finalLabel;
		}
	}

	/**
	 * Sets the tool invocation for this subagent part. Handles both live and serialized invocations.
	 * For the runSubagent tool, this watches for completion and renders the result.
	 */
	public setToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		if (toolInvocation.toolId !== RunSubagentTool.Id) {
			return;
		}

		if (toolInvocation.kind === 'toolInvocation') {
			// Watch for completion and render the result
			this._register(autorun(r => {
				const state = toolInvocation.state.read(r);
				if (state.type === IChatToolInvocation.StateKind.Completed) {
					// Extract text from result
					const textParts = (state.contentForModel || [])
						.filter((part): part is { kind: 'text'; value: string } => part.kind === 'text')
						.map(part => part.value);

					if (textParts.length > 0) {
						this.renderResultText(textParts.join('\n'));
					}

					// Mark as inactive when the tool completes
					this.markAsInactive();
				}
			}));
		} else if (toolInvocation.toolSpecificData?.kind === 'subagent' && toolInvocation.toolSpecificData.result) {
			// Render the persisted result for serialized invocations
			this.renderResultText(toolInvocation.toolSpecificData.result);
			// Already complete, mark as inactive
			this.markAsInactive();
		}
	}

	public renderResultText(resultText: string): void {
		if (this.resultContainer || !resultText) {
			return; // Already rendered or no content
		}

		// Split into first line (title) and rest (content)
		const lines = resultText.split('\n');
		const firstLine = lines[0] || '';
		const restOfText = lines.slice(1).join('\n').trim();

		// Create collapsible result part
		const collapsiblePart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleMarkdownContentPart,
			firstLine,
			restOfText,
			this.context,
			this.chatContentMarkdownRenderer
		));
		this._register(collapsiblePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this.resultContainer = collapsiblePart.domNode;
		dom.append(this.wrapper, this.resultContainer);

		// Show the container if it was hidden
		if (this.domNode.style.display === 'none') {
			this.domNode.style.display = '';
		}

		this._onDidChangeHeight.fire();
	}

	public appendItem(content: HTMLElement, toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): void {
		if (!content.hasChildNodes() || content.textContent?.trim() === '') {
			return;
		}

		// Expand when first item is added, but not for already-completed responses
		if (!this.wrapper.hasChildNodes()) {
			// Show the container now that we have content
			this.domNode.style.display = '';
		}

		// Wrap with icon like thinking parts do, but skip icon for tools needing confirmation
		const itemWrapper = $('.chat-thinking-tool-wrapper');
		const needsConfirmation = toolInvocation.kind === 'toolInvocation' && toolInvocation.confirmationMessages;
		if (!needsConfirmation) {
			const icon = getToolInvocationIcon(toolInvocation.toolId);
			const iconElement = createThinkingIcon(icon);
			itemWrapper.appendChild(iconElement);
		}
		itemWrapper.appendChild(content);

		// Insert before result container if it exists, otherwise append
		if (this.resultContainer) {
			this.wrapper.insertBefore(itemWrapper, this.resultContainer);
		} else {
			this.wrapper.appendChild(itemWrapper);
		}
		this.lastItemWrapper = itemWrapper;

		// Watch for tool completion to update height when label changes
		if (toolInvocation.kind === 'toolInvocation') {
			this._register(autorun(r => {
				const state = toolInvocation.state.read(r);
				if (state.type === IChatToolInvocation.StateKind.Completed) {
					this._onDidChangeHeight.fire();
				}
			}));
		}

		// Schedule layout to measure last item and scroll
		this.layoutScheduler.schedule();
	}

	private performLayout(): void {
		// Measure last item height once after layout, set CSS variable for collapsed max-height
		if (this.lastItemWrapper) {
			const itemHeight = this.lastItemWrapper.offsetHeight;
			const height = itemHeight + 4;
			if (height > 0) {
				this.wrapper.style.setProperty('--chat-subagent-last-item-height', `${height}px`);
			}
		}

		// Auto-scroll to bottom only when actively streaming (not for completed responses)
		if (this.isActive && !this.isInitiallyComplete) {
			const scrollHeight = this.wrapper.scrollHeight;
			this.wrapper.scrollTop = scrollHeight;
		}

		this._onDidChangeHeight.fire();
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
