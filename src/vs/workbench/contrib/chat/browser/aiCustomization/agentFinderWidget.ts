/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFinder.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { alert, status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage, isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { AgentFinderMediaType, IAgentFinderPage, IAgentFinderResource, IAgentFinderService } from '../../../../../platform/agentFinder/common/agentFinderService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { AgentFinderInstallState, IAgentFinderInstallService } from '../../common/agentFinderInstallService.js';

const resourceTypes: readonly { readonly mediaType: AgentFinderMediaType | undefined; readonly label: string }[] = [
	{ mediaType: undefined, label: localize('agentFinder.allTypes', "All Resource Types") },
	{ mediaType: AgentFinderMediaType.Skill, label: localize('agentFinder.skills', "Skills") },
	{ mediaType: AgentFinderMediaType.McpServer, label: localize('agentFinder.mcpServers', "MCP Servers") },
	{ mediaType: AgentFinderMediaType.CopilotPlugin, label: localize('agentFinder.copilotPlugins', "Copilot Plugins") },
	{ mediaType: AgentFinderMediaType.ClaudePlugin, label: localize('agentFinder.claudePlugins', "Claude Plugins") },
	{ mediaType: AgentFinderMediaType.CursorPlugin, label: localize('agentFinder.cursorPlugins', "Cursor Plugins") },
];

function getResourceTypeLabel(mediaType: string): string {
	switch (mediaType) {
		case AgentFinderMediaType.Skill: return localize('agentFinder.skill', "Skill");
		case AgentFinderMediaType.McpServer: return localize('agentFinder.mcpServer', "MCP server");
		case AgentFinderMediaType.CopilotPlugin: return localize('agentFinder.copilotPlugin', "Copilot plugin");
		case AgentFinderMediaType.ClaudePlugin: return localize('agentFinder.claudePlugin', "Claude plugin");
		case AgentFinderMediaType.CursorPlugin: return localize('agentFinder.cursorPlugin', "Cursor plugin");
		default: return mediaType;
	}
}

function getInstallStateDescription(state: AgentFinderInstallState): string {
	switch (state.kind) {
		case 'available': return localize('agentFinder.installAvailable', "Available to install");
		case 'installing': return localize('agentFinder.installing', "Installing...");
		case 'installed': return localize('agentFinder.installed', "Installed");
		case 'unavailable': return localize('agentFinder.installUnavailable', "Installation unavailable. {0}", state.message);
	}
}

export class AgentFinderWidget extends Disposable {
	readonly element: HTMLElement;
	private readonly searchInput: InputBox;
	private readonly refreshButton: Button;
	private readonly loadMoreButton: Button;
	private readonly retryButton: Button;
	private readonly statusElement: HTMLElement;
	private readonly errorElement: HTMLElement;
	private readonly resultsElement: HTMLElement;
	private readonly emptyElement: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly requestDisposables = this._register(new DisposableStore());
	private readonly cardDisposables = this._register(new DisposableStore());
	private readonly installActions = new Map<string, { update(): void; getAccessibilityContent(): string }>();
	private readonly searchScheduler = this._register(new RunOnceScheduler(() => void this.loadPage(), 300));
	private items: readonly IAgentFinderResource[] = [];
	private nextCursor: IAgentFinderPage['nextCursor'];
	private total: number | undefined;
	private query = '';
	private mediaType: AgentFinderMediaType | undefined;
	private visible = false;
	private loading = false;
	private loaded = false;
	private errorMessage: string | undefined;
	private aiHidden: boolean;

	constructor(
		container: HTMLElement,
		@IAgentFinderService private readonly agentFinderService: IAgentFinderService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
		@IAgentFinderInstallService private readonly installService: IAgentFinderInstallService,
	) {
		super();
		this.aiHidden = !!this.chatEntitlementService.sentiment.hidden;
		this.element = DOM.append(container, DOM.$('.agent-finder-widget'));
		const header = DOM.append(this.element, DOM.$('.agent-finder-header'));
		DOM.append(header, DOM.$('h2')).textContent = localize('agentFinder.title', "AgentFinder");
		DOM.append(header, DOM.$('p.agent-finder-description')).textContent = localize('agentFinder.subtitle', "Discover skills, MCP servers, and plugins from GitHub's public catalog.");

		const controls = DOM.append(header, DOM.$('.agent-finder-controls'));
		this.searchInput = this._register(new InputBox(DOM.append(controls, DOM.$('.agent-finder-search')), contextViewService, {
			placeholder: localize('agentFinder.searchPlaceholder', "Search the catalog"),
			ariaLabel: localize('agentFinder.searchLabel', "Search AgentFinder"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		const typeSelector = this._register(new SelectBox(
			resourceTypes.map(type => ({ text: type.label })),
			0,
			contextViewService,
			defaultSelectBoxStyles,
			{ ariaLabel: localize('agentFinder.filterLabel', "Resource type") },
		));
		typeSelector.render(DOM.append(controls, DOM.$('.agent-finder-type-filter')));
		this.refreshButton = this._register(new Button(controls, { ...defaultButtonStyles, secondary: true }));
		this.refreshButton.label = localize('agentFinder.refresh', "Refresh");
		this.statusElement = DOM.append(header, DOM.$('.agent-finder-status'));

		const content = DOM.$('.agent-finder-scroll-content');
		this.resultsElement = DOM.append(content, DOM.$('ul.agent-finder-results'));
		this.resultsElement.setAttribute('aria-label', localize('agentFinder.results', "AgentFinder results"));
		this.emptyElement = DOM.append(content, DOM.$('.agent-finder-empty'));
		const footer = DOM.append(content, DOM.$('.agent-finder-footer'));
		this.errorElement = DOM.append(footer, DOM.$('p.agent-finder-error'));
		this.retryButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true }));
		this.retryButton.label = localize('agentFinder.retry', "Retry");
		this.loadMoreButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true }));
		this.loadMoreButton.label = localize('agentFinder.loadMore', "Load More");

		this.scrollable = this._register(new DomScrollableElement(content, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		this.scrollable.getDomNode().classList.add('agent-finder-scrollable');
		this.element.appendChild(this.scrollable.getDomNode());
		DOM.append(this.element, DOM.$('p.agent-finder-disclaimer')).textContent = localize('agentFinder.disclaimer', "Review each resource's source before installing. Install uses VS Code's existing prompts and destination choices. Repository images identify GitHub owners, not verified publishers.");

		const resizeObserver = this._register(new DOM.DisposableResizeObserver('AgentFinderWidget', () => this.layout(), DOM.getWindow(this.element)));
		this._register(resizeObserver.observe(this.element));
		this._register(this.searchInput.onDidChange(value => {
			if (this.query !== value.trim()) {
				this.query = value.trim();
				this.resetSearch(true);
			}
		}));
		this._register(DOM.addDisposableListener(this.searchInput.inputElement, DOM.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.Enter && !event.isComposing) {
				keyboardEvent.preventDefault();
				this.searchScheduler.cancel();
				if (!this.loading) {
					this.resetSearch(false);
				}
			}
		}));
		this._register(typeSelector.onDidSelect(event => {
			this.mediaType = resourceTypes[event.index].mediaType;
			this.resetSearch(false);
		}));
		this._register(this.refreshButton.onDidClick(() => this.resetSearch(false)));
		this._register(this.retryButton.onDidClick(() => void this.loadPage(this.items.length > 0)));
		this._register(this.loadMoreButton.onDidClick(() => void this.loadPage(true)));
		this._register(DOM.addDisposableListener(this.resultsElement, DOM.EventType.KEY_DOWN, event => this.navigateCards(event)));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
			const hidden = !!this.chatEntitlementService.sentiment.hidden;
			if (hidden === this.aiHidden) {
				return;
			}
			this.aiHidden = hidden;
			this.resetSearch(false);
			this.updateVisibility();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AccessibilityVerbositySettingId.AgentFinder)) {
				this.updateSearchAriaLabel();
			}
		}));
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateSearchAriaLabel()));
		this._register(this.installService.onDidChange(() => {
			for (const action of this.installActions.values()) {
				action.update();
			}
			this.layout();
		}));
		this.updateSearchAriaLabel();
		this.updateVisibility();
		this.renderStatus();
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		this.updateVisibility();
	}

	private updateVisibility(): void {
		const visible = this.visible && !this.chatEntitlementService.sentiment.hidden;
		this.element.style.display = visible ? '' : 'none';
		if (!visible) {
			this.searchScheduler.cancel();
			this.requestDisposables.clear();
			this.loading = false;
		} else if (!this.loaded && !this.errorMessage) {
			void this.loadPage();
		}
		this.renderStatus();
	}

	private resetSearch(delayed: boolean): void {
		this.searchScheduler.cancel();
		this.requestDisposables.clear();
		this.loading = false;
		this.loaded = false;
		this.items = [];
		this.nextCursor = undefined;
		this.total = undefined;
		this.errorMessage = undefined;
		this.cardDisposables.clear();
		DOM.clearNode(this.resultsElement);
		this.scrollable.setScrollPosition({ scrollTop: 0 });
		this.renderStatus();
		if (this.visible && !this.chatEntitlementService.sentiment.hidden) {
			if (delayed) {
				this.searchScheduler.schedule();
			} else {
				void this.loadPage();
			}
		}
	}

	private async loadPage(append = false): Promise<void> {
		if (this.loading || !this.visible || this.chatEntitlementService.sentiment.hidden || (append && !this.nextCursor)) {
			return;
		}
		this.requestDisposables.clear();
		const token = cancelOnDispose(this.requestDisposables);
		const focusedAction = [this.loadMoreButton, this.retryButton].find(button => button.element.contains(DOM.getActiveElement()));
		this.loading = true;
		this.renderStatus();
		try {
			const page = await this.agentFinderService.query({
				query: this.query,
				mediaType: this.mediaType,
				pageSize: 24,
				cursor: append ? this.nextCursor : undefined,
			}, token);
			if (token.isCancellationRequested) {
				return;
			}
			const identifiers = new Set(this.items.map(item => item.identifier));
			const newItems = page.items.filter(item => {
				if (identifiers.has(item.identifier)) {
					return false;
				}
				identifiers.add(item.identifier);
				return true;
			});
			this.items = [...this.items, ...newItems];
			this.nextCursor = page.nextCursor;
			this.total = page.total;
			this.loaded = true;
			this.errorMessage = undefined;
			let firstCard: HTMLElement | undefined;
			for (const item of newItems) {
				const card = this.renderCard(item);
				firstCard ??= card;
			}
			if (focusedAction?.element.contains(DOM.getActiveElement())) {
				(firstCard ?? this.resultsElement.lastElementChild)?.scrollIntoView({ block: 'nearest' });
				if (firstCard) {
					firstCard.focus();
				} else if (!this.nextCursor) {
					this.searchInput.focus();
				}
			}
			status(this.getResultsLabel());
		} catch (error) {
			if (!token.isCancellationRequested && !isCancellationError(error)) {
				this.errorMessage = localize('agentFinder.loadError', "Could not load AgentFinder. {0}", getErrorMessage(error));
				alert(this.errorMessage);
				void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
			}
		} finally {
			if (!token.isCancellationRequested) {
				const restoreActionFocus = focusedAction?.element.contains(DOM.getActiveElement());
				this.loading = false;
				this.requestDisposables.clear();
				this.renderStatus();
				if (this.errorMessage && restoreActionFocus) {
					this.retryButton.focus();
				}
			}
		}
	}

	private renderStatus(): void {
		this.statusElement.textContent = this.loading
			? localize('agentFinder.loading', "Loading resources...")
			: this.loaded ? this.getResultsLabel() : '';
		this.resultsElement.setAttribute('aria-busy', String(this.loading));
		this.refreshButton.enabled = !this.loading;
		this.loadMoreButton.enabled = !this.loading;
		this.retryButton.enabled = !this.loading;
		this.loadMoreButton.element.style.display = this.nextCursor && !this.errorMessage ? '' : 'none';
		this.errorElement.textContent = this.errorMessage ?? '';
		this.errorElement.style.display = this.errorMessage ? '' : 'none';
		this.retryButton.element.style.display = this.errorMessage ? '' : 'none';
		this.emptyElement.style.display = this.loaded && !this.items.length && !this.loading && !this.errorMessage ? '' : 'none';
		this.emptyElement.textContent = localize('agentFinder.noResults', "No resources found. Try a different search or resource type.");
		this.layout();
	}

	private getResultsLabel(): string {
		return this.total !== undefined
			? localize('agentFinder.resultCount', "Showing {0} of {1} resources", this.items.length.toLocaleString(), this.total.toLocaleString())
			: localize('agentFinder.resultsLoaded', "{0} resources loaded", this.items.length.toLocaleString());
	}

	private renderCard(item: IAgentFinderResource): HTMLElement {
		const card = DOM.append(this.resultsElement, DOM.$('li.agent-finder-card'));
		card.tabIndex = 0;
		const typeLabel = getResourceTypeLabel(item.mediaType);
		card.setAttribute('aria-label', localize('agentFinder.cardLabel', "{0}, {1}. {2}", item.displayName, typeLabel, item.description));
		const header = DOM.append(card, DOM.$('.agent-finder-card-header'));
		const iconContainer = DOM.append(header, DOM.$('.agent-finder-icon'));
		iconContainer.setAttribute('aria-hidden', 'true');
		const fallback = DOM.append(iconContainer, DOM.$('span'));
		fallback.classList.add(...ThemeIcon.asClassNameArray(
			item.mediaType === AgentFinderMediaType.Skill ? Codicon.lightbulb
				: item.mediaType === AgentFinderMediaType.McpServer ? Codicon.server : Codicon.extensions,
		));
		if (item.icon) {
			const image = DOM.append(iconContainer, DOM.$<HTMLImageElement>('img'));
			image.alt = '';
			image.loading = 'lazy';
			image.referrerPolicy = 'no-referrer';
			image.style.opacity = '0';
			this.cardDisposables.add(DOM.addDisposableListener(image, DOM.EventType.LOAD, () => {
				fallback.style.display = 'none';
				image.style.opacity = '1';
			}));
			this.cardDisposables.add(DOM.addDisposableListener(image, DOM.EventType.ERROR, () => {
				image.remove();
				fallback.style.display = '';
			}));
			image.src = item.icon.toString(true);
		}
		const identity = DOM.append(header, DOM.$('.agent-finder-identity'));
		const name = DOM.append(identity, DOM.$('h3.agent-finder-name'));
		name.textContent = item.displayName;
		this.cardDisposables.add(this.hoverService.setupDelayedHover(name, { content: item.displayName }));
		const publisher = DOM.append(identity, DOM.$('.agent-finder-publisher'));
		publisher.textContent = item.publisher ?? localize('agentFinder.unknownPublisher', "Publisher not provided");
		this.cardDisposables.add(this.hoverService.setupDelayedHover(publisher, { content: publisher.textContent }));

		const metadata = DOM.append(card, DOM.$('.agent-finder-metadata'));
		DOM.append(metadata, DOM.$('span.agent-finder-kind')).textContent = typeLabel;
		if (item.version) {
			DOM.append(metadata, DOM.$('span')).textContent = localize('agentFinder.version', "Version {0}", item.version);
		}
		if (item.stars !== undefined) {
			DOM.append(metadata, DOM.$('span')).textContent = localize('agentFinder.stars', "{0} GitHub stars", item.stars.toLocaleString());
		}
		const description = DOM.append(card, DOM.$('p.agent-finder-card-description'));
		description.textContent = item.description;
		this.cardDisposables.add(this.hoverService.setupDelayedHover(description, { content: item.description }));
		if (item.tags.length) {
			const tags = DOM.append(card, DOM.$('.agent-finder-tags'));
			for (const tag of item.tags.slice(0, 4)) {
				const tagElement = DOM.append(tags, DOM.$('span.agent-finder-tag'));
				tagElement.textContent = tag;
				this.cardDisposables.add(this.hoverService.setupDelayedHover(tagElement, { content: tag }));
			}
		}
		if (item.capabilities.length || item.representativeQueries.length || item.tags.length > 4) {
			const details = DOM.append(card, DOM.$('details.agent-finder-details'));
			DOM.append(details, DOM.$('summary')).textContent = localize('agentFinder.details', "Details");
			const sections = [
				{ label: localize('agentFinder.capabilities', "Capabilities"), values: item.capabilities },
				{ label: localize('agentFinder.examples', "Example queries"), values: item.representativeQueries },
				{ label: localize('agentFinder.tags', "Tags"), values: item.tags.length > 4 ? item.tags : [] },
			];
			for (const section of sections) {
				if (section.values.length) {
					DOM.append(details, DOM.$('h4')).textContent = section.label;
					const list = DOM.append(details, DOM.$('ul'));
					for (const value of section.values) {
						DOM.append(list, DOM.$('li')).textContent = value;
					}
				}
			}
			this.cardDisposables.add(DOM.addDisposableListener(details, 'toggle', () => this.layout()));
		}
		const actions = DOM.append(card, DOM.$('.agent-finder-card-actions'));
		this.renderInstallAction(card, actions, item);
		const resourceUrl = item.externalUrl ?? item.url;
		if (resourceUrl) {
			this.renderLink(actions, localize('agentFinder.openResource', "Open Resource"), resourceUrl);
		}
		if (item.repository) {
			this.renderLink(actions, localize('agentFinder.viewRepository', "View Repository"), item.repository);
		}
		return card;
	}

	private renderInstallAction(card: HTMLElement, actions: HTMLElement, item: IAgentFinderResource): void {
		const disposables = this.cardDisposables.add(new DisposableStore());
		const button = disposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, small: true }));
		button.element.classList.add('agent-finder-install-button');
		const errorElement = DOM.append(card, DOM.$('p.agent-finder-install-error'));
		errorElement.id = `agent-finder-install-error-${generateUuid()}`;
		let pending = false;
		let errorMessage: string | undefined;
		const getState = (): AgentFinderInstallState => {
			const state = this.installService.getInstallState(item);
			return pending && state.kind === 'available' ? { kind: 'installing' } : state;
		};
		const getAccessibilityContent = () => [getInstallStateDescription(getState()), errorMessage].filter(Boolean).join('\n');
		const update = () => {
			const state = getState();
			if (state.kind === 'installed') {
				errorMessage = undefined;
			}
			button.label = state.kind === 'installing' || state.kind === 'installed' ? getInstallStateDescription(state)
				: errorMessage && state.kind === 'available' ? localize('agentFinder.retryInstall', "Retry Install")
					: localize('agentFinder.install', "Install");
			button.enabled = state.kind === 'available';
			button.setAriaLabel(state.kind === 'unavailable'
				? localize('agentFinder.unavailableInstallLabel', "Install {0}. {1}", item.displayName, state.message)
				: localize('agentFinder.installLabel', "{0}: {1}", button.label, item.displayName));
			button.element.setAttribute('aria-busy', String(state.kind === 'installing'));
			errorElement.textContent = errorMessage ?? '';
			errorElement.hidden = !errorMessage;
			if (errorMessage) {
				button.element.setAttribute('aria-describedby', errorElement.id);
			} else {
				button.element.removeAttribute('aria-describedby');
			}
		};
		this.installActions.set(item.identifier, { update, getAccessibilityContent });
		disposables.add(toDisposable(() => this.installActions.delete(item.identifier)));
		disposables.add(this.hoverService.setupDelayedHover(button.element, () => ({
			content: getState().kind === 'available' && !errorMessage
				? localize('agentFinder.installHint', "Review the source, then follow VS Code's installation prompts to choose where to install.")
				: getAccessibilityContent(),
		})));

		const install = async () => {
			if (disposables.isDisposed || !this.visible || this.chatEntitlementService.sentiment.hidden
				|| pending || this.installService.getInstallState(item).kind !== 'available') {
				return;
			}
			pending = true;
			errorMessage = undefined;
			update();
			this.layout();
			status(localize('agentFinder.installStarted', "Installing {0}.", item.displayName));
			try {
				await this.installService.install(item);
				if (!disposables.isDisposed && this.visible && !this.chatEntitlementService.sentiment.hidden
					&& this.installService.getInstallState(item).kind === 'installed') {
					status(localize('agentFinder.installComplete', "Installed {0}.", item.displayName));
				}
			} catch (error) {
				if (isCancellationError(error)) {
					if (!disposables.isDisposed && this.visible && !this.chatEntitlementService.sentiment.hidden) {
						status(localize('agentFinder.installCancelled', "Installation cancelled for {0}.", item.displayName));
					}
				} else {
					const message = localize('agentFinder.installFailed', "Could not install {0}. {1}", item.displayName, getErrorMessage(error));
					if (!disposables.isDisposed) {
						errorMessage = message;
					}
					if (!disposables.isDisposed && this.visible && !this.chatEntitlementService.sentiment.hidden) {
						alert(message);
						void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
					} else {
						this.notificationService.error(message);
					}
				}
			} finally {
				pending = false;
				if (!disposables.isDisposed) {
					update();
					this.layout();
				}
			}
		};
		disposables.add(button.onDidClick(() => void install().catch(onUnexpectedError)));
		update();
	}

	private renderLink(parent: HTMLElement, label: string, uri: URI | string): void {
		const href = typeof uri === 'string' ? uri : uri.toString(true);
		const link = DOM.append(parent, DOM.$<HTMLAnchorElement>('a'));
		link.textContent = label;
		link.href = href;
		link.rel = 'noopener noreferrer';
		this.cardDisposables.add(this.hoverService.setupDelayedHover(link, { content: href }));
		this.cardDisposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, async event => {
			event.preventDefault();
			try {
				await this.openerService.open(uri, { openExternal: true, allowCommands: false, allowContributedOpeners: false });
			} catch (error) {
				this.notificationService.error(localize('agentFinder.openError', "Could not open the AgentFinder resource. {0}", getErrorMessage(error)));
			}
		}));
	}

	private navigateCards(event: KeyboardEvent): void {
		const cards = Array.from(this.resultsElement.children).filter(DOM.isHTMLElement);
		const index = cards.findIndex(card => card === event.target);
		if (index < 0) {
			return;
		}
		const keyboardEvent = new StandardKeyboardEvent(event);
		const nextRow = cards.findIndex(card => card.offsetTop > cards[0].offsetTop);
		const columns = nextRow > 0 ? nextRow : cards.length;
		let next: number;
		switch (keyboardEvent.keyCode) {
			case KeyCode.LeftArrow: next = index - 1; break;
			case KeyCode.RightArrow: next = index + 1; break;
			case KeyCode.UpArrow: next = index - columns; break;
			case KeyCode.DownArrow: next = index + columns; break;
			case KeyCode.Home: next = 0; break;
			case KeyCode.End: next = cards.length - 1; break;
			default: return;
		}
		keyboardEvent.preventDefault();
		keyboardEvent.stopPropagation();
		const target = cards[Math.max(0, Math.min(next, cards.length - 1))];
		target.focus();
		target.scrollIntoView({ block: 'nearest' });
	}

	private updateSearchAriaLabel(): void {
		const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		this.searchInput.setAriaLabel(this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.AgentFinder) && keybinding
			? localize('agentFinder.searchWithHelp', "Search AgentFinder. Use {0} for accessibility help.", keybinding)
			: localize('agentFinder.searchLabel', "Search AgentFinder"));
	}

	getAccessibilityContent(): string {
		return [
			localize('agentFinder.title', "AgentFinder"),
			this.statusElement.textContent,
			this.errorMessage,
			...this.items.map(item => [
				item.displayName,
				getResourceTypeLabel(item.mediaType),
				item.publisher,
				item.description,
				item.version ? localize('agentFinder.version', "Version {0}", item.version) : undefined,
				item.stars !== undefined ? localize('agentFinder.stars', "{0} GitHub stars", item.stars.toLocaleString()) : undefined,
				item.tags.length ? localize('agentFinder.accessibleTags', "Tags:\n{0}", item.tags.join('\n')) : undefined,
				item.capabilities.length ? localize('agentFinder.accessibleCapabilities', "Capabilities:\n{0}", item.capabilities.join('\n')) : undefined,
				item.representativeQueries.length ? localize('agentFinder.accessibleExamples', "Example queries:\n{0}", item.representativeQueries.join('\n')) : undefined,
				this.installActions.get(item.identifier)?.getAccessibilityContent(),
				item.externalUrl || item.url ? localize('agentFinder.accessibleResource', "Resource: {0}", item.externalUrl ?? item.url?.toString(true)) : undefined,
				item.repository ? localize('agentFinder.accessibleRepository', "Repository: {0}", item.repository.toString(true)) : undefined,
			].filter(Boolean).join('\n')),
			this.loaded && !this.items.length ? this.emptyElement.textContent : undefined,
		].filter(Boolean).join('\n\n');
	}

	focus(): void {
		this.searchInput.focus();
	}

	layout(): void {
		this.scrollable.scanDomNode();
	}
}
