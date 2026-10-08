/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatDebugSessionTimeline.css';

import * as DOM from '../../../../../base/browser/dom.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../../nls.js';
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { resolveEventsUri } from '../copilotCliEventsUri.js';
import { createSessionTimelineModel, ISessionTimelineEvent, ISessionTimelineModel, SessionTimelineCategory, SessionTimelinePromptSection } from './chatDebugSessionTimelineModel.js';
import { CHAT_DEBUG_SESSION_TIMELINE_FOCUSED, setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';

const $ = DOM.$;
const categories: readonly SessionTimelineCategory[] = ['system', 'user', 'assistant', 'tool', 'subagent'];
const filterCategories: readonly SessionTimelineCategory[] = ['system', 'assistant', 'tool', 'subagent'];

interface ISessionTimelineSearchMatch {
	readonly kind: 'visible' | 'section' | 'eventData';
	readonly text: string;
	readonly label?: string;
}

function getCategoryLabel(category: SessionTimelineCategory): string {
	switch (category) {
		case 'system': return localize('chatDebug.sessionTimeline.category.system', "System");
		case 'user': return localize('chatDebug.sessionTimeline.category.user', "User");
		case 'assistant': return localize('chatDebug.sessionTimeline.category.assistant', "Assistant");
		case 'tool': return localize('chatDebug.sessionTimeline.category.tool', "Tool");
		case 'subagent': return localize('chatDebug.sessionTimeline.category.subagent', "Subagent");
	}
}

export const enum SessionTimelineNavigation {
	Home = 'home',
	Overview = 'overview',
}

export class ChatDebugSessionTimeline extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<SessionTimelineNavigation>());
	readonly onNavigate = this._onNavigate.event;

	readonly container: HTMLElement;
	private readonly breadcrumbWidget: BreadcrumbsWidget;
	private readonly sourceSummary: HTMLElement;
	private readonly sourcePath: HTMLButtonElement;
	private readonly filters: HTMLElement;
	private readonly content: HTMLElement;
	private readonly status: HTMLElement;
	private readonly filterInput: HTMLInputElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly renderedEventElements = new Map<string, { readonly item: HTMLElement; readonly focusTarget: HTMLElement }>();
	private readonly renderedPromptSections = new Map<string, HTMLElement>();
	private readonly expandedEventIds = new Set<string>();
	private readonly enabledCategories = new Set<SessionTimelineCategory>(categories);
	private readonly refreshScheduler: RunOnceScheduler;
	private readonly focusedContextKey: IContextKey<boolean>;
	private currentSessionResource: URI | undefined;
	private sourceResource: URI | undefined;
	private model: ISessionTimelineModel | undefined;
	private loadGeneration = 0;

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		this.focusedContextKey = CHAT_DEBUG_SESSION_TIMELINE_FOCUSED.bindTo(contextKeyService);
		this._register(toDisposable(() => this.focusedContextKey.reset()));
		this.container = DOM.append(parent, $('.chat-debug-session-timeline'));
		this.container.setAttribute('role', 'region');
		this.container.setAttribute('aria-label', localize('chatDebug.sessionTimeline.ariaLabel', "Session Timeline"));
		DOM.hide(this.container);
		const focusTracker = this._register(DOM.trackFocus(this.container));
		this._register(focusTracker.onDidFocus(() => this.focusedContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this.focusedContextKey.set(false)));

		const breadcrumbContainer = DOM.append(this.container, $('.chat-debug-breadcrumb'));
		this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, undefined, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
		this._register(setupBreadcrumbKeyboardNavigation(breadcrumbContainer, this.breadcrumbWidget));
		this._register(this.breadcrumbWidget.onDidSelectItem(e => {
			if (e.type !== 'select' || !(e.item instanceof TextBreadcrumbItem)) {
				return;
			}
			this.breadcrumbWidget.setSelection(undefined);
			const index = this.breadcrumbWidget.getItems().indexOf(e.item);
			if (index === 0) {
				this._onNavigate.fire(SessionTimelineNavigation.Home);
			} else if (index === 1) {
				this._onNavigate.fire(SessionTimelineNavigation.Overview);
			}
		}));

		const source = DOM.append(this.container, $('.chat-debug-session-timeline-source'));
		DOM.append(source, $('h2.chat-debug-session-timeline-title', undefined, localize('chatDebug.sessionTimeline.title', "Session Timeline")));
		this.sourceSummary = DOM.append(source, $('div.chat-debug-session-timeline-source-summary'));
		this.sourcePath = DOM.append(source, $('button.chat-debug-session-timeline-source-path', { type: 'button', disabled: true }));
		this._register(DOM.addDisposableListener(this.sourcePath, DOM.EventType.CLICK, () => {
			if (this.sourceResource) {
				void this.editorService.openEditor({ resource: this.sourceResource, options: { pinned: true } });
			}
		}));

		const controls = DOM.append(this.container, $('.chat-debug-session-timeline-controls'));
		this.filterInput = DOM.append(controls, $('input.chat-debug-session-timeline-filter', {
			type: 'search',
			placeholder: localize('chatDebug.sessionTimeline.search', "Search messages, tool names, arguments, and results"),
			'aria-label': localize('chatDebug.sessionTimeline.searchAriaLabel', "Search session events"),
		}));
		this._register(DOM.addDisposableListener(this.filterInput, DOM.EventType.INPUT, () => this.render()));

		const actions = DOM.append(controls, $('.chat-debug-session-timeline-actions'));
		const expandAllButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true, title: localize('chatDebug.sessionTimeline.expandAll', "Expand All") }));
		expandAllButton.label = localize('chatDebug.sessionTimeline.expandAll', "Expand All");
		this._register(expandAllButton.onDidClick(() => {
			for (const event of this.getFilteredEvents()) {
				this.expandedEventIds.add(event.id);
			}
			this.render();
		}));

		const collapseAllButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true, title: localize('chatDebug.sessionTimeline.collapseAll', "Collapse All") }));
		collapseAllButton.label = localize('chatDebug.sessionTimeline.collapseAll', "Collapse All");
		this._register(collapseAllButton.onDidClick(() => {
			this.expandedEventIds.clear();
			this.render();
		}));

		this.filters = DOM.append(controls, $('.chat-debug-session-timeline-filters'));
		this.status = DOM.append(controls, $('span.chat-debug-session-timeline-aria-status', { role: 'status', 'aria-live': 'polite' }));
		this.content = DOM.append(this.container, $('.chat-debug-session-timeline-content'));
		this.refreshScheduler = this._register(new RunOnceScheduler(() => this.load(), 300));
	}

	setSession(sessionResource: URI): void {
		this.currentSessionResource = sessionResource;
		this.sourceResource = undefined;
		this.model = undefined;
		this.expandedEventIds.clear();
		this.enabledCategories.clear();
		for (const category of categories) {
			this.enabledCategories.add(category);
		}
		this.filterInput.value = '';
	}

	show(): void {
		DOM.show(this.container);
		this.updateBreadcrumb();
		this.load();
	}

	hide(): void {
		DOM.hide(this.container);
		this.loadGeneration++;
		this.refreshScheduler.cancel();
	}

	refresh(): void {
		if (this.container.style.display !== 'none' && !this.refreshScheduler.isScheduled()) {
			this.refreshScheduler.schedule();
		}
	}

	focus(): void {
		this.filterInput.focus();
	}

	getAccessibilityContent(): string {
		const events = this.getFilteredEvents();
		const visibleEvents = new Map(events.map(event => [event.id, event]));
		return events.map(event => {
			let depth = 0;
			let parentEventId = event.parentEventId;
			while (parentEventId && visibleEvents.has(parentEventId)) {
				depth++;
				parentEventId = visibleEvents.get(parentEventId)?.parentEventId;
			}
			const indent = '  '.repeat(depth);
			const header = [getCategoryLabel(event.category), event.title, ...event.metadata].filter(Boolean).join(' · ');
			const lines = [`${indent}${header}`];
			if (event.summary) {
				lines.push(`${indent}${event.summary}`);
			}
			for (const section of event.sections) {
				lines.push(`${indent}${section.label}:`, ...section.content.split(/\r?\n/).map(line => `${indent}  ${line}`));
			}
			return lines.join('\n');
		}).join('\n\n');
	}

	updateBreadcrumb(): void {
		if (!this.currentSessionResource) {
			return;
		}
		const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource)
			|| LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource)
			|| this.currentSessionResource.toString();
		this.breadcrumbWidget.setItems([
			new TextBreadcrumbItem(localize('chatDebug.title', "Agent Debug Logs"), true),
			new TextBreadcrumbItem(sessionTitle, true),
			new TextBreadcrumbItem(localize('chatDebug.sessionTimeline', "Session Timeline")),
		]);
	}

	private resolveSource(): URI | undefined {
		const result = resolveEventsUri(
			this.currentSessionResource,
			this.pathService.userHome({ preferLocal: true }),
			authority => this.remoteAgentHostService.connections.find(connection => agentHostAuthority(connection.address) === authority),
		);
		return result.kind === 'ok' ? result.resource : undefined;
	}

	private async load(): Promise<void> {
		const generation = ++this.loadGeneration;
		const sourceResource = this.resolveSource();
		if (!sourceResource) {
			this.model = undefined;
			this.sourceResource = undefined;
			this.renderMessage(localize('chatDebug.sessionTimeline.noSource', "The events.jsonl source is unavailable for this session."));
			return;
		}
		if (!this.model) {
			this.sourceResource = sourceResource;
			this.renderMessage(localize('chatDebug.sessionTimeline.loading', "Loading events.jsonl…"));
		}

		try {
			const content = await this.fileService.readFile(sourceResource);
			if (generation !== this.loadGeneration) {
				return;
			}
			this.sourceResource = sourceResource;
			this.model = createSessionTimelineModel(content.value.toString());
			this.render();
		} catch (error) {
			if (generation !== this.loadGeneration) {
				return;
			}
			this.model = undefined;
			this.sourceResource = sourceResource;
			this.renderMessage(localize('chatDebug.sessionTimeline.readError', "Failed to read events.jsonl: {0}", error instanceof Error ? error.message : String(error)));
		}
	}

	private getFilteredEvents(): readonly ISessionTimelineEvent[] {
		if (!this.model) {
			return [];
		}
		const filter = this.filterInput.value.trim();
		const normalizedFilter = filter.toLowerCase();
		return this.model.events.filter(event =>
			this.enabledCategories.has(event.category)
			&& (!filter || (event.searchableText.includes(normalizedFilter) && !!this.findSearchMatch(event, filter)))
		);
	}

	private findSearchMatch(event: ISessionTimelineEvent, query: string): ISessionTimelineSearchMatch | undefined {
		const normalizedQuery = query.toLowerCase();
		const visibleValues = [getCategoryLabel(event.category), event.title, ...event.metadata, event.summary];
		const visibleMatch = visibleValues.find(value => value.toLowerCase().includes(normalizedQuery));
		if (visibleMatch !== undefined) {
			return { kind: 'visible', text: visibleMatch };
		}
		for (const section of event.sections) {
			if (section.label.toLowerCase().includes(normalizedQuery)) {
				return { kind: 'section', label: section.label, text: section.content.split(/\r?\n/).find(line => line.trim()) ?? section.label };
			}
			const matchingLine = section.content.split(/\r?\n/).find(line => line.toLowerCase().includes(normalizedQuery));
			if (matchingLine !== undefined) {
				return { kind: 'section', label: section.label, text: matchingLine.trim() };
			}
		}
		const rawMatch = this.findRawSearchMatch(event.rawRecords, normalizedQuery);
		return rawMatch ? { kind: 'eventData', label: localize('chatDebug.sessionTimeline.eventData', "Event Data"), text: rawMatch } : undefined;
	}

	private findRawSearchMatch(value: unknown, normalizedQuery: string, label?: string): string | undefined {
		if (value === null || typeof value !== 'object') {
			const text = label ? `${label}: ${String(value ?? '')}` : String(value ?? '');
			return text.toLowerCase().includes(normalizedQuery) ? text : undefined;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				const match = this.findRawSearchMatch(item, normalizedQuery, label);
				if (match) {
					return match;
				}
			}
			return undefined;
		}
		for (const [key, item] of Object.entries(value)) {
			const match = this.findRawSearchMatch(item, normalizedQuery, key);
			if (match) {
				return match;
			}
		}
		return undefined;
	}

	private appendHighlightedText(container: HTMLElement, text: string, query: string): void {
		if (!query) {
			container.textContent = text;
			return;
		}
		const normalizedText = text.toLowerCase();
		const normalizedQuery = query.toLowerCase();
		let offset = 0;
		while (offset < text.length) {
			const matchIndex = normalizedText.indexOf(normalizedQuery, offset);
			if (matchIndex < 0) {
				container.append(text.slice(offset));
				break;
			}
			container.append(text.slice(offset, matchIndex));
			const mark = DOM.append(container, $('mark.chat-debug-session-timeline-search-match'));
			mark.textContent = text.slice(matchIndex, matchIndex + query.length);
			offset = matchIndex + query.length;
		}
	}

	private appendHighlightedPath(container: HTMLElement, path: { readonly directory: string; readonly basename: string }, query: string): void {
		const directory = DOM.append(container, $('span.chat-debug-session-timeline-event-path-directory'));
		this.appendHighlightedText(directory, path.directory, query);
		const basename = DOM.append(container, $('span.chat-debug-session-timeline-event-path-basename'));
		this.appendHighlightedText(basename, path.basename, query);
	}

	private render(): void {
		this.renderDisposables.clear();
		this.renderedEventElements.clear();
		this.renderedPromptSections.clear();
		DOM.clearNode(this.filters);
		DOM.clearNode(this.content);
		if (!this.model) {
			return;
		}

		const filteredEvents = this.getFilteredEvents();
		const searchQuery = this.filterInput.value.trim();
		this.sourceSummary.textContent = this.model.errors.length > 0
			? localize('chatDebug.sessionTimeline.sourceSummaryWithErrors', "{0} source records · {1} relevant events · {2} malformed lines", this.model.totalRecords, this.model.events.length, this.model.errors.length)
			: localize('chatDebug.sessionTimeline.sourceSummary', "{0} source records · {1} relevant events", this.model.totalRecords, this.model.events.length);
		this.updateSourcePath();

		const shown = DOM.append(this.filters, $('span.chat-debug-session-timeline-filter-chip.chat-debug-session-timeline-shown'));
		shown.textContent = localize('chatDebug.sessionTimeline.shown', "{0} shown", filteredEvents.length);
		const counts = this.model.events.reduce((result, event) => {
			result[event.category]++;
			return result;
		}, { system: 0, user: 0, assistant: 0, tool: 0, subagent: 0 });
		for (const category of filterCategories) {
			const enabled = this.enabledCategories.has(category);
			const categoryLabel = getCategoryLabel(category);
			const button = this.renderDisposables.add(new Button(this.filters, {
				...defaultButtonStyles,
				secondary: true,
				supportIcons: true,
				title: enabled
					? localize('chatDebug.sessionTimeline.hideCategoryWithCount', "Hide {0} events ({1} total)", categoryLabel, counts[category])
					: localize('chatDebug.sessionTimeline.showCategoryWithCount', "Show {0} events ({1} total)", categoryLabel, counts[category]),
			}));
			button.element.classList.add('chat-debug-session-timeline-filter-chip');
			button.label = `$(${enabled ? Codicon.check.id : Codicon.blank.id}) ${categoryLabel}`;
			button.element.setAttribute('aria-pressed', String(enabled));
			this.renderDisposables.add(button.onDidClick(() => {
				if (this.enabledCategories.has(category)) {
					this.enabledCategories.delete(category);
				} else {
					this.enabledCategories.add(category);
				}
				this.render();
			}));
		}
		this.status.textContent = localize('chatDebug.sessionTimeline.eventCount', "{0} events match the current filters.", filteredEvents.length);

		if (filteredEvents.length === 0) {
			DOM.append(this.content, $('p.chat-debug-session-timeline-empty', undefined, localize('chatDebug.sessionTimeline.empty', "No events match the current filters.")));
			return;
		}

		const timeline = DOM.append(this.content, $('ol.chat-debug-session-timeline-timeline', { 'aria-label': localize('chatDebug.sessionTimeline.timelineAriaLabel', "Session timeline") }));
		const visibleEventIds = new Set(filteredEvents.map(event => event.id));
		const childrenByParentId = new Map<string, ISessionTimelineEvent[]>();
		const rootEvents: ISessionTimelineEvent[] = [];
		for (const event of filteredEvents) {
			if (event.parentEventId && visibleEventIds.has(event.parentEventId)) {
				const children = childrenByParentId.get(event.parentEventId) ?? [];
				children.push(event);
				childrenByParentId.set(event.parentEventId, children);
			} else {
				rootEvents.push(event);
			}
		}
		const renderedEventIds = new Set<string>();
		const userEvents = filteredEvents.filter(event => event.category === 'user');
		const userEventIndexes = new Map(userEvents.map((event, index) => [event.id, index]));
		const orderedRootEvents = [
			...rootEvents.filter(event => event.category === 'system'),
			...rootEvents.filter(event => event.category !== 'system'),
		];
		for (const event of orderedRootEvents) {
			this.renderEvent(timeline, event, childrenByParentId, renderedEventIds, userEvents, userEventIndexes, searchQuery);
		}
	}

	private renderEvent(
		timeline: HTMLElement,
		event: ISessionTimelineEvent,
		childrenByParentId: ReadonlyMap<string, readonly ISessionTimelineEvent[]>,
		renderedEventIds: Set<string>,
		userEvents: readonly ISessionTimelineEvent[],
		userEventIndexes: ReadonlyMap<string, number>,
		searchQuery: string,
	): void {
		if (renderedEventIds.has(event.id)) {
			return;
		}
		renderedEventIds.add(event.id);
		const item = DOM.append(timeline, $('li.chat-debug-session-timeline-event'));
		item.classList.add(`chat-debug-session-timeline-event-${event.category}`);
		const card = DOM.append(item, $('.chat-debug-session-timeline-event-card'));
		const expanded = this.expandedEventIds.has(event.id);
		const hasHeaderActions = event.category === 'user' || !!event.promptCapabilities;
		const header = DOM.append(card, hasHeaderActions
			? $('.chat-debug-session-timeline-event-header')
			: $('button.chat-debug-session-timeline-event-header', { type: 'button', 'aria-expanded': String(expanded) }));
		const toggle = hasHeaderActions
			? DOM.append(header, $('button.chat-debug-session-timeline-event-header-toggle', { type: 'button', 'aria-expanded': String(expanded) }))
			: header;
		this.renderedEventElements.set(event.id, { item, focusTarget: toggle });
		const category = DOM.append(toggle, $('span.chat-debug-session-timeline-event-category'));
		this.appendHighlightedText(category, getCategoryLabel(event.category), searchQuery);
		if (event.title) {
			const title = DOM.append(toggle, $('span.chat-debug-session-timeline-event-title'));
			this.appendHighlightedText(title, event.title, searchQuery);
		}
		if (event.metadata.length > 0) {
			const metadata = DOM.append(toggle, $('span.chat-debug-session-timeline-event-metadata'));
			this.appendHighlightedText(metadata, event.metadata.join(' · '), searchQuery);
		}
		if (event.category === 'tool' && event.summary) {
			const inlineSummary = DOM.append(toggle, $('span.chat-debug-session-timeline-event-inline-summary'));
			if (event.summaryPath) {
				inlineSummary.classList.add('chat-debug-session-timeline-event-path');
				this.appendHighlightedPath(inlineSummary, event.summaryPath, searchQuery);
			} else {
				this.appendHighlightedText(inlineSummary, event.summary, searchQuery);
			}
		}
		if (event.category === 'user') {
			const userEventIndex = userEventIndexes.get(event.id);
			if (userEventIndex !== undefined) {
				this.renderUserNavigation(header, userEvents, userEventIndex);
			}
		}
		if (event.promptCapabilities) {
			this.renderPromptCapabilities(header, event);
		}
		if (event.category === 'user') {
			DOM.append(header, $('time.chat-debug-session-timeline-event-time', { dateTime: event.timestamp }, new Date(event.timestamp).toLocaleTimeString(undefined, {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				fractionalSecondDigits: 3,
			})));
		}
		let summary: HTMLElement | undefined;
		if (event.category === 'tool') {
			summary = undefined;
		} else if (event.summaryPath) {
			summary = DOM.append(card, $('div.chat-debug-session-timeline-event-summary.chat-debug-session-timeline-event-path'));
			this.appendHighlightedPath(summary, event.summaryPath, searchQuery);
		} else if (event.summary) {
			summary = DOM.append(card, $('div.chat-debug-session-timeline-event-summary'));
			this.appendHighlightedText(summary, event.summary, searchQuery);
		}
		const searchMatch = searchQuery ? this.findSearchMatch(event, searchQuery) : undefined;
		const toggleExpanded = () => {
			if (expanded) {
				this.expandedEventIds.delete(event.id);
			} else {
				this.expandedEventIds.add(event.id);
			}
			this.render();
		};
		this.renderDisposables.add(DOM.addDisposableListener(hasHeaderActions ? header : toggle, DOM.EventType.CLICK, toggleExpanded));
		if (event.category === 'user' && summary) {
			summary.classList.add('chat-debug-session-timeline-event-summary-clickable');
			this.renderDisposables.add(DOM.addDisposableListener(summary, DOM.EventType.CLICK, toggleExpanded));
		}
		if (!expanded && searchMatch && searchMatch.kind !== 'visible') {
			const searchContext = DOM.append(card, $('.chat-debug-session-timeline-search-context'));
			if (searchMatch.label) {
				const label = DOM.append(searchContext, $('span.chat-debug-session-timeline-search-context-label'));
				this.appendHighlightedText(label, `${searchMatch.label}:`, searchQuery);
			}
			const text = DOM.append(searchContext, $('span.chat-debug-session-timeline-search-context-text'));
			this.appendHighlightedText(text, searchMatch.text, searchQuery);
		}

		if (expanded) {
			if (summary) {
				summary.hidden = true;
			}
			const body = DOM.append(event.category === 'user' ? item : card, $('div.chat-debug-session-timeline-event-body'));
			if (event.category === 'user') {
				body.classList.add('chat-debug-session-timeline-event-body-detached');
			}
			for (const section of event.sections) {
				const sectionElement = DOM.append(body, $('section.chat-debug-session-timeline-section'));
				if (section.id) {
					sectionElement.tabIndex = -1;
					this.renderedPromptSections.set(`${event.id}:${section.id}`, sectionElement);
				}
				const sectionTitle = DOM.append(sectionElement, $('h3.chat-debug-session-timeline-section-title'));
				this.appendHighlightedText(sectionTitle, section.label, searchQuery);
				const sectionContent = DOM.append(sectionElement, $('pre.chat-debug-session-timeline-event-content', { tabIndex: 0 }));
				this.appendHighlightedText(sectionContent, section.content, searchQuery);
			}
			if (searchMatch?.kind === 'eventData') {
				const sectionElement = DOM.append(body, $('section.chat-debug-session-timeline-section'));
				DOM.append(sectionElement, $('h3.chat-debug-session-timeline-section-title', undefined,
					localize('chatDebug.sessionTimeline.matchingEventData', "Matching Event Data")));
				const sectionContent = DOM.append(sectionElement, $('pre.chat-debug-session-timeline-event-content', { tabIndex: 0 }));
				this.appendHighlightedText(sectionContent, searchMatch.text, searchQuery);
			}
		}

		const children = childrenByParentId.get(event.id);
		if (children?.length) {
			const childList = DOM.append(item, $('ol.chat-debug-session-timeline-children'));
			for (const child of children) {
				this.renderEvent(childList, child, childrenByParentId, renderedEventIds, userEvents, userEventIndexes, searchQuery);
			}
		}
	}

	private renderPromptCapabilities(header: HTMLElement, event: ISessionTimelineEvent): void {
		const capabilities = event.promptCapabilities;
		if (!capabilities) {
			return;
		}
		const container = DOM.append(header, $('.chat-debug-session-timeline-prompt-capabilities'));
		this.renderPromptCapability(container, event.id, 'skills', capabilities.skills.length, capabilities.skills,
			localize('chatDebug.sessionTimeline.skillsCount', "{0} Skills", capabilities.skills.length));
		this.renderPromptCapability(container, event.id, 'tools', capabilities.tools.length, capabilities.tools,
			localize('chatDebug.sessionTimeline.toolsCount', "{0} Tools", capabilities.tools.length));
		this.renderPromptCapability(container, event.id, 'instructions', capabilities.instructionCount, capabilities.instructions,
			localize('chatDebug.sessionTimeline.instructionsCount', "{0} Instructions", capabilities.instructionCount));
	}

	private renderPromptCapability(container: HTMLElement, eventId: string, section: SessionTimelinePromptSection, count: number, names: readonly string[], label: string): void {
		if (count === 0) {
			return;
		}
		const button = DOM.append(container, $<HTMLButtonElement>('button.chat-debug-session-timeline-prompt-capability', {
			type: 'button',
			'aria-label': localize('chatDebug.sessionTimeline.openPromptSection', "{0}. Open section.", label),
		}, label));
		this.renderDisposables.add(this.hoverService.setupDelayedHover(button, {
			content: names.length ? names.join('\n') : label,
		}));
		this.renderDisposables.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, clickEvent => {
			clickEvent.stopPropagation();
			this.navigateToPromptSection(eventId, section);
		}));
	}

	private navigateToPromptSection(eventId: string, section: SessionTimelinePromptSection): void {
		this.expandedEventIds.add(eventId);
		this.render();
		const sectionElement = this.renderedPromptSections.get(`${eventId}:${section}`);
		sectionElement?.scrollIntoView({ block: 'center' });
		sectionElement?.focus();
	}

	private renderUserNavigation(header: HTMLElement, userEvents: readonly ISessionTimelineEvent[], userEventIndex: number): void {
		const navigation = DOM.append(header, $('.chat-debug-session-timeline-request-navigation'));
		const first = DOM.append(navigation, $<HTMLButtonElement>('button.chat-debug-session-timeline-request-navigation-button', {
			type: 'button',
			'aria-label': localize('chatDebug.sessionTimeline.firstRequest', "Go to First Request"),
			title: localize('chatDebug.sessionTimeline.firstRequest', "Go to First Request"),
		}, '<<'));
		first.disabled = userEventIndex === 0;
		const previous = DOM.append(navigation, $<HTMLButtonElement>('button.chat-debug-session-timeline-request-navigation-button', {
			type: 'button',
			'aria-label': localize('chatDebug.sessionTimeline.previousRequest', "Previous Request"),
			title: localize('chatDebug.sessionTimeline.previousRequest', "Previous Request"),
		}, '<'));
		previous.disabled = userEventIndex === 0;
		DOM.append(navigation, $('span.chat-debug-session-timeline-request-position', undefined,
			localize('chatDebug.sessionTimeline.compactRequestPosition', "{0} of {1}", userEventIndex + 1, userEvents.length)));
		const next = DOM.append(navigation, $<HTMLButtonElement>('button.chat-debug-session-timeline-request-navigation-button', {
			type: 'button',
			'aria-label': localize('chatDebug.sessionTimeline.nextRequest', "Next Request"),
			title: localize('chatDebug.sessionTimeline.nextRequest', "Next Request"),
		}, '>'));
		next.disabled = userEventIndex === userEvents.length - 1;
		const last = DOM.append(navigation, $<HTMLButtonElement>('button.chat-debug-session-timeline-request-navigation-button', {
			type: 'button',
			'aria-label': localize('chatDebug.sessionTimeline.lastRequest', "Go to Last Request"),
			title: localize('chatDebug.sessionTimeline.lastRequest', "Go to Last Request"),
		}, '>>'));
		last.disabled = userEventIndex === userEvents.length - 1;
		this.renderDisposables.add(DOM.addDisposableListener(first, DOM.EventType.CLICK, event => {
			event.stopPropagation();
			this.navigateToRequest(userEvents[0]);
		}));
		this.renderDisposables.add(DOM.addDisposableListener(previous, DOM.EventType.CLICK, event => {
			event.stopPropagation();
			this.navigateToRequest(userEvents[userEventIndex - 1]);
		}));
		this.renderDisposables.add(DOM.addDisposableListener(next, DOM.EventType.CLICK, event => {
			event.stopPropagation();
			this.navigateToRequest(userEvents[userEventIndex + 1]);
		}));
		this.renderDisposables.add(DOM.addDisposableListener(last, DOM.EventType.CLICK, event => {
			event.stopPropagation();
			this.navigateToRequest(userEvents.at(-1));
		}));
	}

	private navigateToRequest(event: ISessionTimelineEvent | undefined): void {
		if (!event) {
			return;
		}
		const renderedEvent = this.renderedEventElements.get(event.id);
		renderedEvent?.item.scrollIntoView({ block: 'start' });
		renderedEvent?.focusTarget.focus();
	}

	private renderMessage(message: string): void {
		this.renderDisposables.clear();
		this.renderedEventElements.clear();
		this.renderedPromptSections.clear();
		DOM.clearNode(this.filters);
		DOM.clearNode(this.content);
		this.sourceSummary.textContent = '';
		this.updateSourcePath();
		DOM.append(this.content, $('p.chat-debug-session-timeline-empty', undefined, message));
	}

	private updateSourcePath(): void {
		const sourceResource = this.sourceResource;
		const path = sourceResource ? sourceResource.scheme === Schemas.file ? sourceResource.fsPath : sourceResource.toString() : '';
		this.sourcePath.textContent = path;
		this.sourcePath.disabled = !this.sourceResource;
		this.sourcePath.title = this.sourceResource ? localize('chatDebug.sessionTimeline.openSource', "Open {0}", path) : '';
		this.sourcePath.setAttribute('aria-label', this.sourcePath.title);
	}
}
