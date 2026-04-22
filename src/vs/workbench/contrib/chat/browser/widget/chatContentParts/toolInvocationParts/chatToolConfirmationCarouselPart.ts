/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ChatToolInvocationPart } from './chatToolInvocationPart.js';
import '../media/chatToolConfirmationCarousel.css';

const COLLAPSED_CAROUSEL_MAX_HEIGHT = 300;
const COLLAPSED_MESSAGE_MAX_HEIGHT = 200;
const COLLAPSED_CODE_BLOCK_MAX_HEIGHT = 150;
const MIN_CAROUSEL_MAX_HEIGHT = 80;
const EXPANDABLE_CONTENT_SELECTOR = '.interactive-result-editor, .chat-markdown-part.rendered-markdown';

export type ToolInvocationPartFactory = (tool: IChatToolInvocation) => ChatToolInvocationPart;

export type ScrollToSubagentCallback = (subAgentInvocationId: string) => void;

interface ICarouselToolItem {
	readonly tool: IChatToolInvocation;
	readonly toolCallId: string;
	readonly disposables: DisposableStore;
	readonly subAgentInvocationId?: string;
	readonly agentName?: string;
	readonly scrollToSubagent?: ScrollToSubagentCallback;
	ownsToolPart: boolean;
	toolPart?: ChatToolInvocationPart;
}

export class ChatToolConfirmationCarouselPart extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidEmpty = this._register(new Emitter<void>());
	readonly onDidEmpty = this._onDidEmpty.event;

	private readonly items: ICarouselToolItem[] = [];
	private readonly toolCallIds = new Set<string>();
	private activeIndex = 0;

	private readonly collapsedTitle: HTMLElement;
	private readonly agentLabel: HTMLButtonElement;
	private readonly contentContainer: HTMLElement;
	private readonly stepIndicator: HTMLElement;
	private readonly prevButton: Button;
	private readonly nextButton: Button;
	private readonly allowAllButton: Button;
	private readonly expandContentButton: Button;
	private readonly dismissButton: Button;
	private readonly activeContentDisposables: DisposableStore;
	private readonly contentResizeObserver: dom.DisposableResizeObserver;
	private readonly updateContentExpansionStateScheduler: dom.AnimationFrameScheduler;
	private _isContentExpanded = false;
	private canExpandContent = false;
	private maxHeight: number | undefined;

	constructor(
		private readonly toolPartFactory: ToolInvocationPartFactory,
		initialTools: IChatToolInvocation[],
		private readonly scrollToSubagent?: ScrollToSubagentCallback,
		private readonly initialSubAgentInvocationId?: string,
		private readonly initialAgentName?: string,
	) {
		super();

		const elements = dom.h('.chat-tool-confirmation-carousel@root', [
			dom.h('.chat-tool-carousel-overlay@overlay', [
				dom.h('.chat-tool-carousel-title-group@titleGroup', [
					dom.h('span.chat-tool-carousel-collapsed-title@collapsedTitle'),
					dom.h('button.chat-tool-carousel-agent-label@agentLabel'),
				]),
				dom.h('.chat-tool-carousel-overlay-actions@overlayActions', [
					dom.h('.chat-tool-carousel-step-indicator@stepIndicator'),
					dom.h('.chat-tool-carousel-nav-arrows@navArrows'),
				]),
			]),
			dom.h('.chat-tool-carousel-content@content'),
		]);

		this.domNode = elements.root;
		this.domNode.tabIndex = -1;
		this.domNode.setAttribute('role', 'group');
		this.domNode.setAttribute('aria-label', localize('toolConfirmationCarousel', "Tool confirmation carousel"));
		this.collapsedTitle = elements.collapsedTitle;
		this.agentLabel = elements.agentLabel;
		this.contentContainer = elements.content;
		this.contentContainer.id = generateUuid();
		this.stepIndicator = elements.stepIndicator;
		this.activeContentDisposables = this._register(new DisposableStore());
		this.updateContentExpansionStateScheduler = this._register(new dom.AnimationFrameScheduler(this.domNode, () => this.updateContentExpansionState()));
		this.contentResizeObserver = this._register(new dom.DisposableResizeObserver(() => this.updateContentExpansionStateScheduler.schedule()));
		this._register(this.contentResizeObserver.observe(this.contentContainer));

		this.allowAllButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, small: true }));
		this.allowAllButton.element.classList.add('chat-tool-carousel-allow-all-button');
		this.allowAllButton.label = localize('allowAll', "Allow All");
		this._register(this.allowAllButton.onDidClick(() => this.allowAll()));

		this.expandContentButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		this.expandContentButton.element.classList.add('chat-tool-carousel-header-button', 'chat-tool-carousel-expand-content-button');
		this.expandContentButton.element.setAttribute('aria-controls', this.contentContainer.id);
		this.updateExpandContentButton();
		dom.hide(this.expandContentButton.element);
		this._register(this.expandContentButton.onDidClick(() => this.toggleContentExpanded()));

		this.dismissButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		this.dismissButton.element.classList.add('chat-tool-carousel-dismiss-button');
		this.dismissButton.label = `$(${Codicon.close.id})`;
		const dismissButtonLabel = this.items.length === 1
			? localize('skip', "Skip")
			: localize('skipAll', "Skip All");
		this.dismissButton.element.setAttribute('aria-label', dismissButtonLabel);
		this.dismissButton.element.title = dismissButtonLabel;
		this._register(this.dismissButton.onDidClick(() => this.skipAll()));

		this.prevButton = this._register(new Button(elements.navArrows, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
		}));
		this.prevButton.element.classList.add('chat-tool-carousel-nav-arrow');
		this.prevButton.label = `$(${Codicon.chevronLeft.id})`;
		this.prevButton.element.setAttribute('aria-label', localize('previous', "Previous"));
		this._register(this.prevButton.onDidClick(() => this.navigateRelative(-1)));

		this.nextButton = this._register(new Button(elements.navArrows, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
		}));
		this.nextButton.element.classList.add('chat-tool-carousel-nav-arrow');
		this.nextButton.label = `$(${Codicon.chevronRight.id})`;
		this.nextButton.element.setAttribute('aria-label', localize('next', "Next"));
		this._register(this.nextButton.onDidClick(() => this.navigateRelative(1)));

		this._register(dom.addDisposableListener(this.agentLabel, 'click', e => {
			e.preventDefault();
			this.scrollToActiveSubagent();
		}));

		this._register(dom.addDisposableListener(this.domNode, 'keydown', e => this.onKeydown(e)));

		for (const tool of initialTools) {
			this.addToolInvocation(tool, this.initialSubAgentInvocationId, this.initialAgentName, this.scrollToSubagent);
		}
	}

	get pendingCount(): number {
		return this.items.length;
	}

	setMaxHeight(maxHeight: number | undefined): void {
		this.maxHeight = maxHeight;
		this.updateContentExpansionState();
	}

	hasToolInvocation(toolCallId: string): boolean {
		return this.toolCallIds.has(toolCallId);
	}

	addToolInvocation(tool: IChatToolInvocation, subAgentInvocationId?: string, agentName?: string, scrollToSubagent?: ScrollToSubagentCallback, toolPart?: ChatToolInvocationPart): void {
		if (this.toolCallIds.has(tool.toolCallId)) {
			const existing = this.items.find(item => item.toolCallId === tool.toolCallId);
			if (existing && toolPart && !existing.toolPart) {
				this.replaceExternalToolPart(existing, toolPart);
			}
			return;
		}

		this.toolCallIds.add(tool.toolCallId);

		const disposables = new DisposableStore();

		const item: ICarouselToolItem = {
			tool,
			toolCallId: tool.toolCallId,
			disposables,
			subAgentInvocationId,
			agentName,
			scrollToSubagent,
			ownsToolPart: !toolPart,
			toolPart,
		};
		this.items.push(item);
		if (toolPart) {
			this.watchExternalToolPart(item, toolPart);
		}

		disposables.add(autorun(reader => {
			const currentState = tool.state.read(reader);
			if (currentState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
				this.removeItem(tool.toolCallId);
			}
		}));

		this.updateUI();

		if (this.items.length === 1) {
			this.setActiveIndex(0);
		}
	}

	private replaceExternalToolPart(item: ICarouselToolItem, toolPart: ChatToolInvocationPart): void {
		if (item.toolPart === toolPart) {
			return;
		}

		if (item.toolPart && item.ownsToolPart) {
			item.toolPart.dispose();
		}

		item.toolPart = toolPart;
		item.ownsToolPart = false;
		this.watchExternalToolPart(item, toolPart);
		if (this.items[this.activeIndex] === item) {
			this.renderActiveContent();
		}
	}

	private watchExternalToolPart(item: ICarouselToolItem, toolPart: ChatToolInvocationPart): void {
		let isItemAlive = true;
		item.disposables.add(toDisposable(() => isItemAlive = false));

		const externalPartDisposeWatcher = new MutableDisposable();
		externalPartDisposeWatcher.value = toDisposable(() => {
			if (!isItemAlive || item.toolPart !== toolPart) {
				return;
			}

			item.toolPart = undefined;
			item.ownsToolPart = true;
			if (this.items[this.activeIndex] === item) {
				this.renderActiveContent();
			}
		});
		toolPart.addDisposable(externalPartDisposeWatcher);
		item.disposables.add(toDisposable(() => externalPartDisposeWatcher.clear()));
	}

	override dispose(): void {
		for (const item of this.items) {
			if (item.toolPart && item.ownsToolPart) {
				item.toolPart.dispose();
			}
			item.disposables.dispose();
		}
		this.items.splice(0);
		this.toolCallIds.clear();
		super.dispose();
	}

	private removeItem(toolCallId: string): void {
		const index = this.items.findIndex(i => i.toolCallId === toolCallId);
		if (index < 0) {
			return;
		}

		const [removed] = this.items.splice(index, 1);
		this.toolCallIds.delete(toolCallId);
		if (removed.toolPart && removed.ownsToolPart) {
			removed.toolPart.dispose();
		}
		removed.disposables.dispose();

		if (this.items.length === 0) {
			dom.hide(this.domNode);
			this._onDidEmpty.fire();
			return;
		}

		if (this.activeIndex >= this.items.length) {
			this.activeIndex = this.items.length - 1;
		}

		this.updateUI();
		this.renderActiveContent();
	}

	private setActiveIndex(index: number): void {
		this.activeIndex = index;
		this.updateUI();
		this.renderActiveContent();
	}

	private navigateRelative(delta: number): void {
		if (this.items.length <= 1) {
			return;
		}
		const newIndex = (this.activeIndex + delta + this.items.length) % this.items.length;
		this.setActiveIndex(newIndex);
	}

	private onKeydown(e: KeyboardEvent): void {
		if (this.items.length === 0) {
			return;
		}

		if (this.shouldIgnoreNavigationKeydown(e.target)) {
			return;
		}

		const event = new StandardKeyboardEvent(e);
		const focusContentAfterNavigation = dom.isHTMLElement(e.target) && this.contentContainer.contains(e.target);
		let didNavigate = false;

		switch (event.keyCode) {
			case KeyCode.LeftArrow:
				this.navigateRelative(-1);
				didNavigate = true;
				break;
			case KeyCode.RightArrow:
				this.navigateRelative(1);
				didNavigate = true;
				break;
			case KeyCode.Home:
				this.setActiveIndex(0);
				didNavigate = true;
				break;
			case KeyCode.End:
				this.setActiveIndex(this.items.length - 1);
				didNavigate = true;
				break;
		}

		if (!didNavigate) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		if (focusContentAfterNavigation) {
			this.focusActiveContent();
		}
	}

	private shouldIgnoreNavigationKeydown(target: EventTarget | null): boolean {
		if (!dom.isHTMLElement(target)) {
			return false;
		}

		return !!target.closest('.monaco-editor, .interactive-result-editor, .chat-confirmation-widget-message, input, textarea, select, [contenteditable="true"]');
	}

	private focusActiveContent(): void {
		this.domNode.focus();
	}

	private updateUI(): void {
		const item = this.items[this.activeIndex];

		this.collapsedTitle.textContent = this.getToolTitle(item) ?? '';
		dom.setVisibility(!!this.collapsedTitle.textContent, this.collapsedTitle);

		if (item?.agentName) {
			this.agentLabel.textContent = `\u2014 ${item.agentName}`;
			this.agentLabel.disabled = !item.subAgentInvocationId || !item.scrollToSubagent;
			this.agentLabel.title = localize('scrollToSubagent', "Scroll to {0}", item.agentName);
			this.agentLabel.setAttribute('aria-label', this.agentLabel.title);
			dom.show(this.agentLabel);
		} else {
			this.agentLabel.textContent = '';
			this.agentLabel.title = '';
			this.agentLabel.removeAttribute('aria-label');
			dom.hide(this.agentLabel);
		}

		this.stepIndicator.textContent = `${this.activeIndex + 1}/${this.items.length}`;

		const multi = this.items.length > 1;
		this.prevButton.enabled = multi;
		this.nextButton.enabled = multi;
		dom.setVisibility(multi, this.stepIndicator);
		dom.setVisibility(multi, this.prevButton.element);
		dom.setVisibility(multi, this.nextButton.element);
		dom.setVisibility(multi, this.allowAllButton.element);
		dom.setVisibility(this.canExpandContent, this.expandContentButton.element);

		this.allowAllButton.label = multi
			? localize('allowAll', "Allow All")
			: localize('allow', "Allow");
		this.updateExpandContentButton();
	}

	private renderActiveContent(): void {
		dom.clearNode(this.contentContainer);
		this.activeContentDisposables.clear();
		this._isContentExpanded = false;
		this.canExpandContent = false;

		const item = this.items[this.activeIndex];
		if (!item) {
			this.updateContentExpansionState();
			return;
		}

		if (!item.toolPart) {
			item.toolPart = this.toolPartFactory(item.tool);
			if (item.ownsToolPart) {
				item.disposables.add(item.toolPart);
			}
		}

		this.contentContainer.appendChild(item.toolPart.domNode);
		this.activeContentDisposables.add(this.contentResizeObserver.observe(item.toolPart.domNode));
		this.observeExpandableContentElements(item.toolPart.domNode);
		this.updateContentExpansionStateScheduler.schedule();
	}

	private toggleContentExpanded(): void {
		if (!this.canExpandContent) {
			return;
		}

		this._isContentExpanded = !this._isContentExpanded;
		this.updateContentExpansionState();
	}

	private updateContentExpansionState(): void {
		this.canExpandContent = this.items.length > 0 && this.isActiveContentLargerThanCollapsedLimit();
		if (!this.canExpandContent) {
			this._isContentExpanded = false;
		}

		this.domNode.classList.toggle('chat-tool-carousel-content-expanded', this.canExpandContent && this._isContentExpanded);
		this.updateMaxHeightStyle();
		dom.setVisibility(this.canExpandContent, this.expandContentButton.element);
		this.updateExpandContentButton();
	}

	private updateMaxHeightStyle(): void {
		if (this.maxHeight === undefined) {
			this.domNode.style.removeProperty('max-height');
			return;
		}

		const expanded = this.canExpandContent && this._isContentExpanded;
		const maxHeight = expanded ? Math.max(MIN_CAROUSEL_MAX_HEIGHT, this.maxHeight) : this.getCollapsedMaxHeight();
		this.domNode.style.maxHeight = `${Math.floor(maxHeight)}px`;
	}

	private updateExpandContentButton(): void {
		const expanded = this.canExpandContent && this._isContentExpanded;
		const label = expanded
			? localize('restoreConfirmationSize', "Restore Confirmation Size")
			: localize('expandConfirmationUp', "Expand Confirmation Up");
		this.expandContentButton.label = expanded
			? `$(${Codicon.screenNormal.id})`
			: `$(${Codicon.screenFull.id})`;
		this.expandContentButton.element.setAttribute('aria-label', label);
		this.expandContentButton.element.setAttribute('aria-expanded', String(expanded));
		this.expandContentButton.setTitle(label);
	}

	private isActiveContentLargerThanCollapsedLimit(): boolean {
		const activeContent = this.contentContainer.firstElementChild;
		if (!dom.isHTMLElement(activeContent)) {
			return false;
		}

		return this.hasInnerContentLargerThanCollapsedLimit(activeContent);
	}

	private hasInnerContentLargerThanCollapsedLimit(element: HTMLElement): boolean {
		if (this.isExpandableContentElement(element) && this.getElementHeight(element) > this.getExpandableContentHeightLimit(element) + 1) {
			return true;
		}

		for (const child of element.children) {
			if (!dom.isHTMLElement(child)) {
				continue;
			}

			if (this.hasInnerContentLargerThanCollapsedLimit(child)) {
				return true;
			}
		}

		return false;
	}

	private isExpandableContentElement(element: HTMLElement): boolean {
		return element.matches(EXPANDABLE_CONTENT_SELECTOR);
	}

	private observeExpandableContentElements(element: HTMLElement): void {
		if (this.isExpandableContentElement(element)) {
			this.activeContentDisposables.add(this.contentResizeObserver.observe(element));
		}

		for (const child of element.children) {
			if (dom.isHTMLElement(child)) {
				this.observeExpandableContentElements(child);
			}
		}
	}

	private getElementHeight(element: HTMLElement): number {
		return Math.max(element.offsetHeight, element.scrollHeight);
	}

	private getExpandableContentHeightLimit(element: HTMLElement): number {
		const window = dom.getWindow(this.domNode);
		if (element.classList.contains('interactive-result-editor')) {
			return Math.min(COLLAPSED_CODE_BLOCK_MAX_HEIGHT, window.innerHeight * 0.25);
		}

		return Math.min(COLLAPSED_MESSAGE_MAX_HEIGHT, window.innerHeight * 0.3);
	}

	private getCollapsedMaxHeight(): number {
		const configuredMaxHeight = this.maxHeight === undefined ? Number.POSITIVE_INFINITY : Math.max(MIN_CAROUSEL_MAX_HEIGHT, this.maxHeight);
		return Math.min(configuredMaxHeight, COLLAPSED_CAROUSEL_MAX_HEIGHT, dom.getWindow(this.domNode).innerHeight * 0.45);
	}

	allowAll(): void {
		for (const item of [...this.items]) {
			IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.UserAction });
		}
	}

	private skipAll(): void {
		for (const item of [...this.items]) {
			IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.Skipped });
		}
	}

	private getToolTitle(item: ICarouselToolItem | undefined): string | undefined {
		if (!item) {
			return undefined;
		}
		const messages = IChatToolInvocation.getConfirmationMessages(item.tool);
		if (!messages?.title) {
			return undefined;
		}
		return this.truncateTitle(this.toPlainText(messages.title));
	}

	private truncateTitle(text: string): string {
		text = text.replace(/\s+/g, ' ').trim();
		const maxLength = 100;
		return text.length > maxLength ? `${text.substring(0, maxLength)}\u2026` : text;
	}

	private toPlainText(message: string | IMarkdownString): string {
		const markdown = typeof message === 'string' ? message : message.value;
		return markdown
			.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, text, url) => text || this.basename(url))
			.replace(/\*\*([^*]+)\*\*/g, '$1')
			.replace(/__([^_]+)__/g, '$1')
			.replace(/`([^`]+)`/g, '$1')
			.replace(/[\\*_#>]/g, '');
	}

	private basename(url: string): string {
		try {
			const path = decodeURIComponent(url.split('?')[0].split('#')[0]);
			const segments = path.split('/').filter(Boolean);
			return segments.at(-1) ?? url;
		} catch {
			return url;
		}
	}

	private scrollToActiveSubagent(): void {
		const item = this.items[this.activeIndex];
		if (item?.subAgentInvocationId) {
			item.scrollToSubagent?.(item.subAgentInvocationId);
		}
	}

	activateFirstToolForSubagent(subAgentInvocationId: string): void {
		const index = this.items.findIndex(i => i.subAgentInvocationId === subAgentInvocationId);
		if (index >= 0) {
			this.setActiveIndex(index);
		}
	}
}
