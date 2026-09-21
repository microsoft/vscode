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
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../../base/common/observable.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../../nls.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { CHAT_CARD_HEADER_ACTIONS_CLASS, CHAT_CARD_LARGE_CLASS, chatCardButtonStyles } from '../../chatCard.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ChatToolInvocationPart } from './chatToolInvocationPart.js';
import '../media/chatToolConfirmationCarousel.css';

const COLLAPSED_CAROUSEL_MAX_HEIGHT = 300;
const COLLAPSED_MESSAGE_MAX_HEIGHT = 200;
const COLLAPSED_CODE_BLOCK_MAX_HEIGHT = 150;
const MIN_CAROUSEL_MAX_HEIGHT = 80;
const EXPANDABLE_CONTENT_SELECTOR = '.interactive-result-editor, .chat-markdown-part.rendered-markdown';

export type ToolInvocationPartFactory = (tool: IChatToolInvocation) => ChatToolInvocationPart;

export type RevealSubagentCallback = (subAgentInvocationId: string) => void;

interface ICarouselToolItem {
	readonly tool?: IChatToolInvocation;
	readonly toolCallId: string;
	readonly disposables: DisposableStore;
	request?: IChatInputCarouselRequest;
	readonly subAgentInvocationId?: string;
	readonly subagentTitle?: string;
	readonly revealSubagent?: RevealSubagentCallback;
	readonly revealSubagentLabel?: string;
	ownsToolPart: boolean;
	toolPart?: IChatInputCarouselContent;
}

export interface IChatInputCarouselContent extends IDisposable {
	readonly domNode: HTMLElement;
}

export interface IChatInputCarouselRequest {
	readonly id: string;
	readonly title: string;
	readonly sourceLabel: string;
	readonly isActive: IObservable<boolean>;
	createContent(): IChatInputCarouselContent;
}

export class ChatToolConfirmationCarouselPart extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidEmpty = this._register(new Emitter<boolean>());
	readonly onDidEmpty = this._onDidEmpty.event;
	private readonly _onDidChangeActiveSubagent = this._register(new Emitter<string | undefined>());
	readonly onDidChangeActiveSubagent = this._onDidChangeActiveSubagent.event;

	private readonly items: ICarouselToolItem[] = [];
	private readonly toolCallIds = new Set<string>();
	private activeIndex = 0;

	private readonly collapsedTitle: HTMLElement;
	private readonly agentLabel: HTMLButtonElement;
	private readonly sourceLabel: HTMLElement;
	private readonly sourceHover = this._register(new MutableDisposable());
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
		private readonly revealSubagent?: RevealSubagentCallback,
		private readonly initialRevealSubagentLabel?: string,
		private readonly initialSubAgentInvocationId?: string,
		private readonly initialSubagentTitle?: string,
		private readonly hoverService?: IHoverService,
	) {
		super();

		const elements = dom.h(`.chat-tool-confirmation-carousel.${CHAT_CARD_LARGE_CLASS}@root`, [
			dom.h('.chat-tool-carousel-overlay@overlay', [
				dom.h('.chat-tool-carousel-title-group@titleGroup', [
					dom.h('span.chat-tool-carousel-collapsed-title@collapsedTitle'),
					dom.h('button.chat-tool-carousel-agent-label@agentLabel'),
					dom.h('span.chat-tool-carousel-source-label@sourceLabel'),
				]),
				dom.h(`.chat-tool-carousel-overlay-actions.${CHAT_CARD_HEADER_ACTIONS_CLASS}@overlayActions`, [
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
		this.sourceLabel = elements.sourceLabel;
		this.contentContainer = elements.content;
		this.contentContainer.id = generateUuid();
		this.stepIndicator = elements.stepIndicator;
		this.activeContentDisposables = this._register(new DisposableStore());
		this.updateContentExpansionStateScheduler = this._register(new dom.AnimationFrameScheduler(this.domNode, () => this.updateContentExpansionState()));
		this.contentResizeObserver = this._register(new dom.DisposableResizeObserver('ChatToolConfirmationCarouselPart.contentExpansion', () => this.updateContentExpansionStateScheduler.schedule()));
		this._register(this.contentResizeObserver.observe(this.contentContainer));

		this.allowAllButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, small: true }));
		this.allowAllButton.element.classList.add('chat-tool-carousel-allow-all-button');
		this.allowAllButton.label = localize('allowAll', "Allow All");
		this._register(this.allowAllButton.onDidClick(() => this.allowAll()));

		this.expandContentButton = this._register(new Button(elements.overlayActions, { ...chatCardButtonStyles, secondary: true, supportIcons: true }));
		this.expandContentButton.element.classList.add('chat-card-icon-button', 'chat-tool-carousel-header-button', 'chat-tool-carousel-expand-content-button');
		this.expandContentButton.element.setAttribute('aria-controls', this.contentContainer.id);
		this.updateExpandContentButton();
		dom.hide(this.expandContentButton.element);
		this._register(this.expandContentButton.onDidClick(() => this.toggleContentExpanded()));

		this.dismissButton = this._register(new Button(elements.overlayActions, { ...chatCardButtonStyles, secondary: true, supportIcons: true }));
		this.dismissButton.element.classList.add('chat-card-icon-button', 'chat-tool-carousel-dismiss-button');
		this.dismissButton.label = `$(${Codicon.closeSmall.id})`;
		const dismissButtonLabel = this.items.length === 1
			? localize('skip', "Skip")
			: localize('skipAll', "Skip All");
		this.dismissButton.element.setAttribute('aria-label', dismissButtonLabel);
		this.dismissButton.element.title = dismissButtonLabel;
		this._register(this.dismissButton.onDidClick(() => this.skipAll()));

		this.prevButton = this._register(new Button(elements.navArrows, {
			...chatCardButtonStyles,
			secondary: true,
			supportIcons: true,
		}));
		this.prevButton.element.classList.add('chat-card-icon-button', 'chat-card-icon-button-strong', 'chat-tool-carousel-nav-arrow');
		this.prevButton.label = `$(${Codicon.chevronLeft.id})`;
		this.prevButton.element.setAttribute('aria-label', localize('previous', "Previous"));
		this._register(this.prevButton.onDidClick(() => this.navigateRelative(-1)));

		this.nextButton = this._register(new Button(elements.navArrows, {
			...chatCardButtonStyles,
			secondary: true,
			supportIcons: true,
		}));
		this.nextButton.element.classList.add('chat-card-icon-button', 'chat-card-icon-button-strong', 'chat-tool-carousel-nav-arrow');
		this.nextButton.label = `$(${Codicon.chevronRight.id})`;
		this.nextButton.element.setAttribute('aria-label', localize('next', "Next"));
		this._register(this.nextButton.onDidClick(() => this.navigateRelative(1)));

		this._register(dom.addDisposableListener(this.agentLabel, 'click', e => {
			e.preventDefault();
			this.revealActiveSubagent();
		}));

		this._register(dom.addDisposableListener(this.domNode, 'keydown', e => this.onKeydown(e)));

		for (const tool of initialTools) {
			this.addToolInvocation(tool, this.initialSubAgentInvocationId, this.initialSubagentTitle, this.revealSubagent, this.initialRevealSubagentLabel);
		}
	}

	get pendingCount(): number {
		return this.items.length;
	}

	get activeSubAgentInvocationId(): string | undefined {
		return this.items[this.activeIndex]?.subAgentInvocationId;
	}

	get activeRequestId(): string | undefined {
		return this.items[this.activeIndex]?.request?.id;
	}

	activateRequest(id: string): void {
		const index = this.items.findIndex(item => item.request?.id === id);
		if (index >= 0) {
			this.setActiveIndex(index);
		}
	}

	setMaxHeight(maxHeight: number | undefined): void {
		this.maxHeight = maxHeight;
		this.updateContentExpansionState();
	}

	hasToolInvocation(toolCallId: string): boolean {
		return this.toolCallIds.has(toolCallId);
	}

	addToolInvocation(tool: IChatToolInvocation, subAgentInvocationId?: string, subagentTitle?: string, revealSubagent?: RevealSubagentCallback, revealSubagentLabel?: string, toolPart?: ChatToolInvocationPart): void {
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
			subagentTitle,
			revealSubagent,
			revealSubagentLabel,
			ownsToolPart: !toolPart,
			toolPart,
		};
		this.items.push(item);
		if (toolPart) {
			this.watchExternalToolPart(item, toolPart);
		}

		disposables.add(autorun(reader => {
			const currentState = tool.state.read(reader);
			if (currentState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation
				&& currentState.type !== IChatToolInvocation.StateKind.WaitingForPostApproval
				&& currentState.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
				this.removeItem(tool.toolCallId);
			}
		}));

		this.updateUI();

		if (this.items.length === 1) {
			this.setActiveIndex(0);
		}
	}

	addRequest(request: IChatInputCarouselRequest): IDisposable {
		if (this.toolCallIds.has(request.id)) {
			return toDisposable(() => { });
		}
		const item: ICarouselToolItem = {
			toolCallId: request.id,
			disposables: new DisposableStore(),
			request,
			ownsToolPart: true,
		};
		this.items.push(item);
		this.toolCallIds.add(request.id);
		this.domNode.setAttribute('aria-label', localize('chatInputRequests', "Chat requests needing attention"));
		item.disposables.add(autorun(reader => {
			if (!request.isActive.read(reader)) {
				this.removeItem(request.id);
			}
		}));
		dom.show(this.domNode);
		this.updateUI();
		if (this.items.length === 1) {
			this.setActiveIndex(0);
		}
		return toDisposable(() => this.removeItem(request.id));
	}

	updateRequestPresentation(id: string, title: string, sourceLabel: string): void {
		const item = this.items.find(item => item.request?.id === id);
		if (!item?.request || (item.request.title === title && item.request.sourceLabel === sourceLabel)) {
			return;
		}
		item.request = { ...item.request, title, sourceLabel };
		if (this.items[this.activeIndex] === item) {
			this.updateUI();
		}
	}

	private replaceExternalToolPart(item: ICarouselToolItem, toolPart: ChatToolInvocationPart): void {
		if (item.toolPart === toolPart) {
			return;
		}

		if (item.toolPart && item.ownsToolPart) {
			item.disposables.delete(item.toolPart);
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

		const activeItem = this.items[this.activeIndex];
		const restoreFocus = index === this.activeIndex && dom.isAncestorOfActiveElement(this.contentContainer);
		const [removed] = this.items.splice(index, 1);
		this.toolCallIds.delete(toolCallId);
		removed.disposables.dispose();

		if (this.items.length === 0) {
			this.activeContentDisposables.clear();
			dom.clearNode(this.contentContainer);
			dom.hide(this.domNode);
			this._onDidChangeActiveSubagent.fire(undefined);
			this._onDidEmpty.fire(restoreFocus);
			return;
		}

		this.activeIndex = activeItem && this.items.includes(activeItem)
			? this.items.indexOf(activeItem)
			: Math.min(this.activeIndex, this.items.length - 1);

		this.updateUI();
		if (activeItem !== this.items[this.activeIndex]) {
			this.renderActiveContent();
		}
		if (restoreFocus) {
			this.focusActiveContent();
		}
		this._onDidChangeActiveSubagent.fire(this.activeSubAgentInvocationId);
	}

	private setActiveIndex(index: number): void {
		this.activeIndex = index;
		this.updateUI();
		this.renderActiveContent();
		this._onDidChangeActiveSubagent.fire(this.activeSubAgentInvocationId);
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

		this.sourceHover.clear();
		this.sourceLabel.textContent = item?.request ? `\u2014 ${item.request.sourceLabel}` : '';
		dom.setVisibility(!!item?.request, this.sourceLabel);
		if (item?.request) {
			this.sourceHover.value = this.hoverService?.setupDelayedHover(this.sourceLabel, { content: item.request.sourceLabel });
		}
		if (item?.subagentTitle) {
			this.agentLabel.textContent = `\u2014 ${item.subagentTitle}`;
			this.agentLabel.disabled = !item.subAgentInvocationId || !item.revealSubagent;
			this.agentLabel.title = item.revealSubagentLabel ?? localize('scrollToSubagent', "Scroll to {0}", item.subagentTitle);
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
		const hasProjectedRequests = this.items.some(item => item.request);
		dom.setVisibility(multi && !hasProjectedRequests, this.allowAllButton.element);
		dom.setVisibility(!hasProjectedRequests, this.dismissButton.element);
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
			item.toolPart = item.request ? item.request.createContent() : this.toolPartFactory(item.tool!);
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
			if (!item.request) {
				IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.UserAction });
			}
		}
	}

	private skipAll(): void {
		for (const item of [...this.items]) {
			if (!item.request) {
				IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.Skipped });
			}
		}
	}

	private getToolTitle(item: ICarouselToolItem | undefined): string | undefined {
		if (!item) {
			return undefined;
		}
		if (item.request) {
			return item.request.title;
		}
		const messages = item.tool && IChatToolInvocation.getConfirmationMessages(item.tool);
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

	private revealActiveSubagent(): void {
		const item = this.items[this.activeIndex];
		if (item?.subAgentInvocationId) {
			item.revealSubagent?.(item.subAgentInvocationId);
		}
	}

	activateFirstToolForSubagent(subAgentInvocationId: string): void {
		const index = this.items.findIndex(i => i.subAgentInvocationId === subAgentInvocationId);
		if (index >= 0) {
			this.setActiveIndex(index);
		}
	}
}
