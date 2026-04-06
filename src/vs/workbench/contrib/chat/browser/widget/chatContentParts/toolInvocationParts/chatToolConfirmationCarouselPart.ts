/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { localize } from '../../../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../../common/chat.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { ChatToolInvocationPart } from './chatToolInvocationPart.js';
import '../media/chatToolConfirmationCarousel.css';

export type ToolInvocationPartFactory = (tool: IChatToolInvocation) => ChatToolInvocationPart;

interface ICarouselToolItem {
	readonly tool: IChatToolInvocation;
	readonly toolCallId: string;
	readonly tabElement: HTMLElement;
	readonly disposables: DisposableStore;
	toolPart?: ChatToolInvocationPart;
}

export class ChatToolConfirmationCarouselPart extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidEmpty = this._register(new Emitter<void>());
	readonly onDidEmpty = this._onDidEmpty.event;

	private readonly items: ICarouselToolItem[] = [];
	private readonly toolCallIds = new Set<string>();
	private activeIndex = 0;

	private readonly headerElement: HTMLElement;
	private readonly tabsContainer: HTMLElement;
	private readonly contentContainer: HTMLElement;

	constructor(
		private readonly toolPartFactory: ToolInvocationPartFactory,
		initialTools: IChatToolInvocation[],
		private readonly toolsService: ILanguageModelToolsService,
	) {
		super();

		const elements = dom.h('.chat-tool-confirmation-carousel@root', [
			dom.h('.chat-tool-carousel-header@header', [
				dom.h('.chat-tool-carousel-tabs@tabs'),
				dom.h('.chat-tool-carousel-bulk-actions@bulkActions'),
			]),
			dom.h('.chat-tool-carousel-content@content'),
		]);

		this.domNode = elements.root;
		this.headerElement = elements.header;
		this.tabsContainer = elements.tabs;
		this.contentContainer = elements.content;

		// Header: bulk Allow All / Skip All
		const allowAllBtn = this._register(new Button(elements.bulkActions, { ...defaultButtonStyles, small: true }));
		allowAllBtn.label = localize('allowAll', "Allow All");
		this._register(allowAllBtn.onDidClick(() => this.allowAll()));

		const skipAllBtn = this._register(new Button(elements.bulkActions, { ...defaultButtonStyles, small: true, secondary: true }));
		skipAllBtn.label = localize('skipAll', "Skip All");
		this._register(skipAllBtn.onDidClick(() => this.skipAll()));

		// Track scroll position for fade indicators
		this._updateTabsScrollClasses();
		this._register(dom.addDisposableListener(this.tabsContainer, 'scroll', () => this._updateTabsScrollClasses()));

		// Add initial tools
		for (const tool of initialTools) {
			this.addToolInvocation(tool);
		}
	}

	get pendingCount(): number {
		return this.items.length;
	}

	hasToolInvocation(toolCallId: string): boolean {
		return this.toolCallIds.has(toolCallId);
	}

	addToolInvocation(tool: IChatToolInvocation): void {
		if (this.toolCallIds.has(tool.toolCallId)) {
			return;
		}

		this.toolCallIds.add(tool.toolCallId);

		const disposables = new DisposableStore();

		// Create the tab as a button with proper ARIA semantics
		const tabLabel = this.getTabLabel(tool);
		const tabElement = dom.$('button.chat-tool-carousel-tab', { role: 'tab', 'aria-selected': 'false', tabIndex: 0 });
		const labelEl = dom.$('.chat-tool-carousel-tab-label');
		labelEl.textContent = tabLabel;
		tabElement.appendChild(labelEl);

		const selectTab = () => {
			const idx = this.items.findIndex(i => i.toolCallId === tool.toolCallId);
			if (idx >= 0) {
				this.setActiveIndex(idx);
			}
		};

		const navigateToTab = (targetIndex: number) => {
			if (targetIndex < 0 || targetIndex >= this.items.length) {
				return;
			}
			this.setActiveIndex(targetIndex);
			this.items[targetIndex].tabElement.focus();
		};

		disposables.add(dom.addDisposableListener(tabElement, 'click', selectTab));
		disposables.add(dom.addDisposableListener(tabElement, 'keydown', (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
				e.preventDefault();
				selectTab();
				return;
			}

			const currentIndex = this.items.findIndex(i => i.toolCallId === tool.toolCallId);
			if (currentIndex < 0) {
				return;
			}

			switch (event.keyCode) {
				case KeyCode.LeftArrow:
					e.preventDefault();
					navigateToTab((currentIndex + this.items.length - 1) % this.items.length);
					break;
				case KeyCode.RightArrow:
					e.preventDefault();
					navigateToTab((currentIndex + 1) % this.items.length);
					break;
				case KeyCode.Home:
					e.preventDefault();
					navigateToTab(0);
					break;
				case KeyCode.End:
					e.preventDefault();
					navigateToTab(this.items.length - 1);
					break;
			}
		}));

		this.tabsContainer.appendChild(tabElement);

		const item: ICarouselToolItem = {
			tool,
			toolCallId: tool.toolCallId,
			tabElement,
			disposables,
		};
		this.items.push(item);

		// Watch tool state — remove from carousel when no longer waiting
		disposables.add(autorun(reader => {
			const currentState = tool.state.read(reader);
			if (currentState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
				this.removeItem(tool.toolCallId);
			}
		}));

		this.updateVisibility();

		// If this is the first item, render its content
		if (this.items.length === 1) {
			this.setActiveIndex(0);
		}
	}

	private removeItem(toolCallId: string): void {
		const index = this.items.findIndex(i => i.toolCallId === toolCallId);
		if (index < 0) {
			return;
		}

		const [removed] = this.items.splice(index, 1);
		this.toolCallIds.delete(toolCallId);
		removed.tabElement.remove();
		if (removed.toolPart) {
			removed.toolPart.dispose();
		}
		removed.disposables.dispose();

		if (this.items.length === 0) {
			dom.hide(this.domNode);
			this._onDidEmpty.fire();
			return;
		}

		// Adjust active index
		if (this.activeIndex >= this.items.length) {
			this.activeIndex = this.items.length - 1;
		}

		this.updateVisibility();
		this.updateTabs();
		this.renderActiveContent();
	}

	private setActiveIndex(index: number): void {
		this.activeIndex = index;
		this.updateTabs();
		this.renderActiveContent();
	}

	/**
	 * Show/hide multi-item elements (bulk actions, nav, tabs overflow)
	 * based on whether there's more than one item.
	 */
	private updateVisibility(): void {
		const multi = this.items.length > 1;
		dom.setVisibility(multi, this.headerElement);
		this.domNode.classList.toggle('single-item', !multi);
		this.updateTabs();
	}

	private updateTabs(): void {
		for (let i = 0; i < this.items.length; i++) {
			const isActive = i === this.activeIndex;
			this.items[i].tabElement.classList.toggle('active', isActive);
			this.items[i].tabElement.setAttribute('aria-selected', String(isActive));
		}
		this._updateTabsScrollClasses();
	}

	private _updateTabsScrollClasses(): void {
		const el = this.tabsContainer;
		const atStart = el.scrollLeft <= 0;
		const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
		el.classList.toggle('scroll-start', atStart);
		el.classList.toggle('scroll-end', atEnd);
	}

	private renderActiveContent(): void {
		dom.clearNode(this.contentContainer);

		const item = this.items[this.activeIndex];
		if (!item) {
			return;
		}

		// Create the tool part once and reuse it across tab switches
		if (!item.toolPart) {
			item.toolPart = this.toolPartFactory(item.tool);
			item.disposables.add(item.toolPart);
		}

		this.contentContainer.appendChild(item.toolPart.domNode);
	}

	/**
	 * Build a short tab label from the tool's invocation message and context.
	 * Falls back to the tool display name when no better label is available.
	 */
	private getTabLabel(tool: IChatToolInvocation): string {
		const toolData = this.toolsService.getTool(tool.toolId);
		const fallbackName = toolData?.displayName ?? tool.toolId;

		// For terminal tools, use the command as the label
		if (tool.toolSpecificData?.kind === 'terminal') {
			const terminalData = migrateLegacyTerminalToolSpecificData(tool.toolSpecificData);
			const cmd = (
				terminalData.presentationOverrides?.commandLine ??
				terminalData.commandLine.forDisplay ??
				terminalData.commandLine.userEdited ??
				terminalData.commandLine.toolEdited ??
				terminalData.commandLine.original ??
				terminalData.confirmation?.commandLine
			)?.trimStart() ?? '';
			return this.truncateLabel(cmd);
		}

		// Use the invocation message as the primary label (e.g. "Reading /path/to/file")
		const invocationText = this.toPlainText(tool.invocationMessage);
		if (invocationText) {
			return this.truncateLabel(invocationText);
		}

		// Use the confirmation title (e.g. from the generic confirmation tool)
		const confirmationMessages = IChatToolInvocation.getConfirmationMessages(tool);
		const titleText = this.toPlainText(confirmationMessages?.title);
		if (titleText) {
			return this.truncateLabel(titleText);
		}

		// Fall back to originMessage context if available
		const originText = this.toPlainText(tool.originMessage);
		if (originText) {
			return this.truncateLabel(originText);
		}

		return fallbackName;
	}

	private truncateLabel(text: string): string {
		// Normalize whitespace and truncate for stable tab layout
		text = text.replace(/\s+/g, ' ').trim();
		const maxLength = 60;
		if (text.length > maxLength) {
			text = text.substring(0, maxLength) + '\u2026';
		}
		return text;
	}

	/**
	 * Extract plain text from a string or IMarkdownString.
	 * For markdown links with empty display text like `[](uri)`, extracts the
	 * last path segment from the URI so labels read e.g. "Reading .vscode".
	 */
	private toPlainText(message: string | { value: string } | undefined | null): string {
		if (!message) {
			return '';
		}
		if (typeof message === 'string') {
			return message;
		}
		// Replace markdown links: [text](url) → text, or basename of url when text is empty
		const resolved = message.value.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, text, url) => {
			if (text) {
				return text;
			}
			// Extract last path segment as a readable name
			try {
				const path = decodeURIComponent(url.split('?')[0].split('#')[0]);
				const segments = path.split('/').filter(Boolean);
				return segments[segments.length - 1] ?? url;
			} catch {
				return url;
			}
		});
		return resolved;
	}

	allowAll(): void {
		for (const item of [...this.items]) {
			IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.UserAction });
		}
	}

	skipAll(): void {
		for (const item of [...this.items]) {
			IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.Skipped });
		}
	}
}
