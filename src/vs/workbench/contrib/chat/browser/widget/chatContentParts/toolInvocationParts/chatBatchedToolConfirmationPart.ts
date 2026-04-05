/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../../common/chat.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { ChatTreeItem } from '../../../chat.js';
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../chatContentParts.js';
import { renderFileWidgets } from '../chatInlineAnchorWidget.js';
import { IChatMarkdownAnchorService } from '../chatMarkdownAnchorService.js';
import './media/chatBatchedToolConfirmation.css';

interface IBatchedToolItem {
	readonly toolInvocation: IChatToolInvocation;
	row: HTMLElement;
	readonly disposables: DisposableStore;
}

export class ChatBatchedToolConfirmationPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly items: IBatchedToolItem[] = [];
	private readonly itemsContainer: HTMLElement;
	private readonly headerLabel: HTMLElement;

	private readonly toolCallIds = new Set<string>();

	private _parentObserver: MutationObserver | undefined;

	private readonly _onDidEmpty = this._register(new Emitter<void>());
	public readonly onDidEmpty = this._onDidEmpty.event;

	constructor(
		toolInvocations: IChatToolInvocation[],
		_context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IHoverService private readonly hoverService: IHoverService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
	) {
		super();

		const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
		hasToolConfirmation.set(true);
		this._register({ dispose: () => hasToolConfirmation.reset() });

		const elements = dom.h('.chat-batched-tool-confirmation@root', [
			dom.h('.chat-batched-tool-confirmation-header@header', [
				dom.h('.chat-batched-tool-confirmation-header-label@headerLabel'),
			]),
			dom.h('.chat-batched-tool-confirmation-items@items'),
			dom.h('.chat-batched-tool-confirmation-buttons@buttons'),
		]);

		this.domNode = elements.root;
		this.itemsContainer = elements.items;
		this.headerLabel = elements.headerLabel;

		// Bulk action buttons
		const allowAllLabel = localize('allowAll', "Allow All");
		const skipAllLabel = localize('skipAll', "Skip All");

		const allowTooltip = this.keybindingService.appendKeybinding(allowAllLabel, AcceptToolConfirmationActionId);
		const skipTooltip = this.keybindingService.appendKeybinding(skipAllLabel, SkipToolConfirmationActionId);

		const allowAllButton = this._register(new Button(elements.buttons, { ...defaultButtonStyles, small: true, title: allowTooltip }));
		allowAllButton.label = allowAllLabel;
		this._register(allowAllButton.onDidClick(() => this.allowAll()));

		const skipAllButton = this._register(new Button(elements.buttons, { ...defaultButtonStyles, small: true, secondary: true, title: skipTooltip }));
		skipAllButton.label = skipAllLabel;
		this._register(skipAllButton.onDidClick(() => this.skipAll()));

		// Add initial tools
		for (const tool of toolInvocations) {
			this.addToolInvocation(tool);
		}

		this.updateHeader();

		// Watch for sibling DOM changes and re-append to stay at the bottom
		this._register(this.observeParentForReordering());
	}

	/**
	 * Observes the parent container for child additions and re-appends
	 * this element to stay at the bottom of the list.
	 */
	private observeParentForReordering(): IDisposable {
		const parent = this.domNode.parentElement;
		if (parent) {
			this.setupObserver(parent);
		}
		// If not yet parented, moveToEndOfParent will set up the observer
		// when first called after the element is attached.
		return { dispose: () => this._parentObserver?.disconnect() };
	}

	/**
	 * Re-appends this element to the end of its parent, temporarily
	 * disconnecting the MutationObserver to avoid self-triggering.
	 */
	private moveToEndOfParent(): void {
		const parent = this.domNode.parentElement;
		if (!parent) {
			return;
		}
		// Set up observer if not yet attached (handles deferred parenting)
		if (!this._parentObserver) {
			this.setupObserver(parent);
		}
		this._parentObserver?.disconnect();
		parent.appendChild(this.domNode);
		this._parentObserver?.observe(parent, { childList: true });
	}

	private setupObserver(parent: Element): void {
		this._parentObserver?.disconnect();
		this._parentObserver = new MutationObserver(() => {
			if (this.items.length > 0 && parent.lastChild !== this.domNode) {
				this._parentObserver?.disconnect();
				parent.appendChild(this.domNode);
				this._parentObserver?.observe(parent, { childList: true });
			}
		});
		this._parentObserver.observe(parent, { childList: true });
	}

	public addToolInvocation(tool: IChatToolInvocation): void {
		if (this.toolCallIds.has(tool.toolCallId)) {
			return;
		}
		this.toolCallIds.add(tool.toolCallId);

		const itemStore = new DisposableStore();
		this._register(itemStore);

		const state = tool.state.get();
		if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
			itemStore.dispose();
			return;
		}

		const title = state.confirmationMessages?.title;
		const titleStr = typeof title === 'string' ? title : title?.value ?? tool.toolId;

		const toolData = this.languageModelToolsService.getTool(tool.toolId);
		const icon = toolData?.icon && ThemeIcon.isThemeIcon(toolData.icon) ? toolData.icon : tool.icon ?? Codicon.tools;

		const row = dom.h('.chat-batched-tool-item@row', [
			dom.h('.chat-batched-tool-item-icon@icon'),
			dom.h('.chat-batched-tool-item-info@info', [
				dom.h('.chat-batched-tool-item-title@title'),
				dom.h('.chat-batched-tool-item-subtitle@subtitle'),
			]),
			dom.h('.chat-batched-tool-item-actions@actions'),
		]);

		const iconEl = dom.h('span.codicon');
		iconEl.root.classList.add(...ThemeIcon.asClassNameArray(icon));
		row.icon.appendChild(iconEl.root);

		row.title.textContent = titleStr;

		// Show command details as subtitle with markdown rendering
		const subtitleContent = this.getSubtitleMarkdown(tool);
		if (subtitleContent) {
			const rendered = itemStore.add(this.markdownRendererService.render(subtitleContent));
			rendered.element.classList.add('chat-batched-tool-item-subtitle-content');
			renderFileWidgets(rendered.element, this.instantiationService, this.chatMarkdownAnchorService, itemStore);
			row.subtitle.appendChild(rendered.element);
		}

		// Per-row Allow / Skip buttons
		const allowRowButton = itemStore.add(new Button(row.actions, { ...defaultButtonStyles, small: true, title: localize('allow', "Allow") }));
		allowRowButton.label = localize('allow', "Allow");
		itemStore.add(allowRowButton.onDidClick(() => {
			IChatToolInvocation.confirmWith(tool, { type: ToolConfirmKind.UserAction });
		}));

		const skipRowButton = itemStore.add(new Button(row.actions, { ...defaultButtonStyles, small: true, secondary: true, title: localize('skip', "Skip") }));
		skipRowButton.label = localize('skip', "Skip");
		itemStore.add(skipRowButton.onDidClick(() => {
			IChatToolInvocation.confirmWith(tool, { type: ToolConfirmKind.Skipped });
		}));

		// Show confirmation message details (e.g. explanation/goal) as hover
		const hoverContent = state.confirmationMessages?.message;
		if (hoverContent) {
			itemStore.add(this.hoverService.setupDelayedHover(row.root, {
				content: hoverContent,
			}));
		}

		this.itemsContainer.appendChild(row.root);

		const item: IBatchedToolItem = {
			toolInvocation: tool,
			row: row.root,
			disposables: itemStore,
		};
		this.items.push(item);

		// Watch for state changes — remove the item from the batch when it leaves confirmation
		itemStore.add(autorun(reader => {
			const currentState = tool.state.read(reader);
			if (currentState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
				this.removeItem(tool.toolCallId);
			}
		}));

		this.updateHeader();

		// Ensure the batch stays at the bottom after adding a new item
		this.moveToEndOfParent();
	}

	private removeItem(toolCallId: string): void {
		const index = this.items.findIndex(i => i.toolInvocation.toolCallId === toolCallId);
		if (index === -1) {
			return;
		}

		const item = this.items[index];
		item.row.remove();
		item.disposables.dispose();
		this.items.splice(index, 1);
		this.toolCallIds.delete(toolCallId);
		this.updateHeader();

		if (this.items.length === 0) {
			dom.hide(this.domNode);
			this._onDidEmpty.fire();
		} else {
			// Re-append to parent so the batch stays at the bottom
			this.moveToEndOfParent();
		}
	}

	private allowAll(): void {
		const snapshot = [...this.items];
		for (const item of snapshot) {
			IChatToolInvocation.confirmWith(item.toolInvocation, { type: ToolConfirmKind.UserAction });
		}
	}

	private skipAll(): void {
		const snapshot = [...this.items];
		for (const item of snapshot) {
			IChatToolInvocation.confirmWith(item.toolInvocation, { type: ToolConfirmKind.Skipped });
		}
	}

	/**
	 * Extracts a descriptive subtitle as a MarkdownString for the tool invocation.
	 * For terminal tools, shows the actual command being run.
	 * For other tools, shows the invocation message (e.g. "Reading [`file`](path)")
	 * or falls back to the confirmation message body.
	 */
	private getSubtitleMarkdown(tool: IChatToolInvocation): MarkdownString | undefined {
		// For terminal tools, show the command line as code
		if (tool.toolSpecificData?.kind === 'terminal') {
			const terminalData = migrateLegacyTerminalToolSpecificData(tool.toolSpecificData);
			const commandLine = terminalData.presentationOverrides?.commandLine
				?? terminalData.confirmation?.commandLine
				?? (terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
			if (commandLine) {
				return new MarkdownString('`' + commandLine + '`');
			}
		}

		// Use invocation message — preserve markdown (e.g. file links)
		if (typeof tool.invocationMessage === 'object' && tool.invocationMessage.value) {
			return new MarkdownString(tool.invocationMessage.value, tool.invocationMessage);
		}
		if (typeof tool.invocationMessage === 'string' && tool.invocationMessage) {
			return new MarkdownString(tool.invocationMessage);
		}

		// Fall back to confirmation message body
		const state = tool.state.get();
		if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
			const message = state.confirmationMessages?.message;
			if (message) {
				return typeof message === 'string' ? new MarkdownString(message) : new MarkdownString(message.value, message);
			}
		}

		// Fall back to origin message
		if (typeof tool.originMessage === 'object' && tool.originMessage?.value) {
			return new MarkdownString(tool.originMessage.value, tool.originMessage);
		}
		if (typeof tool.originMessage === 'string' && tool.originMessage) {
			return new MarkdownString(tool.originMessage);
		}

		return undefined;
	}

	private updateHeader(): void {
		const count = this.items.length;
		this.headerLabel.textContent = localize('toolsWaitingConfirmation', "{0} tools waiting for confirmation", count);
	}

	public hasToolInvocation(toolCallId: string): boolean {
		return this.toolCallIds.has(toolCallId);
	}

	public get pendingCount(): number {
		return this.items.length;
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		if (other.kind !== 'toolInvocation') {
			return false;
		}
		return this.toolCallIds.has(other.toolCallId);
	}
}
