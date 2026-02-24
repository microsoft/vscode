/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IObjectTreeElement } from '../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchList, WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { FilterWidget } from '../../../../browser/parts/views/viewFilter.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { ChatDebugEventRenderer, ChatDebugEventDelegate, ChatDebugEventTreeRenderer } from './chatDebugEventList.js';
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem, LogsViewMode } from './chatDebugTypes.js';
import { ChatDebugFilterState, bindFilterContextKeys } from './chatDebugFilters.js';
import { ChatDebugDetailPanel } from './chatDebugDetailPanel.js';

const $ = DOM.$;

export const enum LogsNavigation {
	Home = 'home',
	Overview = 'overview',
}

export class ChatDebugLogsView extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<LogsNavigation>());
	readonly onNavigate = this._onNavigate.event;

	readonly container: HTMLElement;
	private readonly breadcrumbWidget: BreadcrumbsWidget;
	private readonly headerContainer: HTMLElement;
	private readonly tableHeader: HTMLElement;
	private readonly bodyContainer: HTMLElement;
	private readonly listContainer: HTMLElement;
	private readonly treeContainer: HTMLElement;
	private readonly detailPanel: ChatDebugDetailPanel;
	private readonly filterWidget: FilterWidget;
	private readonly viewModeToggle: Button;

	private list: WorkbenchList<IChatDebugEvent>;
	private tree: WorkbenchObjectTree<IChatDebugEvent, void>;

	private currentSessionResource: URI | undefined;
	private logsViewMode: LogsViewMode = LogsViewMode.List;
	private events: IChatDebugEvent[] = [];
	private currentDimension: Dimension | undefined;
	private readonly eventListener = this._register(new MutableDisposable());
	private readonly sessionStateDisposable = this._register(new MutableDisposable());
	private shimmerRow!: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly filterState: ChatDebugFilterState,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-logs'));
		DOM.hide(this.container);

		// Breadcrumb
		const breadcrumbContainer = DOM.append(this.container, $('.chat-debug-breadcrumb'));
		this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, undefined, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
		this._register(setupBreadcrumbKeyboardNavigation(breadcrumbContainer, this.breadcrumbWidget));
		this._register(this.breadcrumbWidget.onDidSelectItem(e => {
			if (e.type === 'select' && e.item instanceof TextBreadcrumbItem) {
				this.breadcrumbWidget.setSelection(undefined);
				const items = this.breadcrumbWidget.getItems();
				const idx = items.indexOf(e.item);
				if (idx === 0) {
					this._onNavigate.fire(LogsNavigation.Home);
				} else if (idx === 1) {
					this._onNavigate.fire(LogsNavigation.Overview);
				}
			}
		}));

		// Header (filter)
		this.headerContainer = DOM.append(this.container, $('.chat-debug-editor-header'));

		// Scoped context key service for filter menu items
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.headerContainer));
		const syncContextKeys = bindFilterContextKeys(this.filterState, scopedContextKeyService);
		syncContextKeys();

		const childInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])
		));
		this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, {
			placeholder: localize('chatDebug.search', "Filter (e.g. text, !exclude)"),
			ariaLabel: localize('chatDebug.filterAriaLabel', "Filter debug events"),
		}));

		// View mode toggle
		this.viewModeToggle = this._register(new Button(this.headerContainer, { ...defaultButtonStyles, secondary: true, title: localize('chatDebug.toggleViewMode', "Toggle between list and tree view") }));
		this.viewModeToggle.element.classList.add('chat-debug-view-mode-toggle');
		this.updateViewModeToggle();
		this._register(this.viewModeToggle.onDidClick(() => {
			this.toggleViewMode();
		}));

		const filterContainer = DOM.append(this.headerContainer, $('.viewpane-filter-container'));
		filterContainer.appendChild(this.filterWidget.element);

		this._register(this.filterWidget.onDidChangeFilterText(text => {
			this.filterState.setTextFilter(text);
		}));

		// React to shared filter state changes
		this._register(this.filterState.onDidChange(() => {
			syncContextKeys();
			this.updateMoreFiltersChecked();
			this.refreshList();
		}));

		// Content wrapper (flex row: main column + detail panel)
		const contentContainer = DOM.append(this.container, $('.chat-debug-logs-content'));

		// Main column (table header + list/tree body)
		const mainColumn = DOM.append(contentContainer, $('.chat-debug-logs-main'));

		// Table header
		this.tableHeader = DOM.append(mainColumn, $('.chat-debug-table-header'));
		DOM.append(this.tableHeader, $('span.chat-debug-col-created', undefined, localize('chatDebug.col.created', "Created")));
		DOM.append(this.tableHeader, $('span.chat-debug-col-name', undefined, localize('chatDebug.col.name', "Name")));
		DOM.append(this.tableHeader, $('span.chat-debug-col-details', undefined, localize('chatDebug.col.details', "Details")));

		// Body container
		this.bodyContainer = DOM.append(mainColumn, $('.chat-debug-logs-body'));

		// List container
		this.listContainer = DOM.append(this.bodyContainer, $('.chat-debug-list-container'));

		const accessibilityProvider = {
			getAriaLabel: (e: IChatDebugEvent) => {
				switch (e.kind) {
					case 'toolCall': return localize('chatDebug.aria.toolCall', "Tool call: {0}{1}", e.toolName, e.result ? ` (${e.result})` : '');
					case 'modelTurn': return localize('chatDebug.aria.modelTurn', "Model turn: {0}{1}", e.model ?? localize('chatDebug.aria.model', "model"), e.totalTokens ? localize('chatDebug.aria.tokenCount', " {0} tokens", e.totalTokens) : '');
					case 'generic': return `${e.category ? e.category + ': ' : ''}${e.name}: ${e.details ?? ''}`;
					case 'subagentInvocation': return localize('chatDebug.aria.subagent', "Subagent: {0}{1}", e.agentName, e.description ? ` - ${e.description}` : '');
					case 'userMessage': return localize('chatDebug.aria.userMessage', "User message: {0}", e.message);
					case 'agentResponse': return localize('chatDebug.aria.agentResponse', "Agent response: {0}", e.message);
				}
			},
			getWidgetAriaLabel: () => localize('chatDebug.ariaLabel', "Chat Debug Events"),
		};
		let nextFallbackId = 0;
		const fallbackIds = new WeakMap<IChatDebugEvent, string>();
		const identityProvider = {
			getId: (e: IChatDebugEvent) => {
				if (e.id) {
					return e.id;
				}
				let fallback = fallbackIds.get(e);
				if (!fallback) {
					fallback = `_fallback_${nextFallbackId++}`;
					fallbackIds.set(e, fallback);
				}
				return fallback;
			}
		};

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IChatDebugEvent>,
			'ChatDebugEvents',
			this.listContainer,
			new ChatDebugEventDelegate(),
			[new ChatDebugEventRenderer()],
			{ identityProvider, accessibilityProvider }
		));

		// Tree container (initially hidden)
		this.treeContainer = DOM.append(this.bodyContainer, $('.chat-debug-list-container'));
		DOM.hide(this.treeContainer);

		this.tree = this._register(this.instantiationService.createInstance(
			WorkbenchObjectTree<IChatDebugEvent, void>,
			'ChatDebugEventsTree',
			this.treeContainer,
			new ChatDebugEventDelegate(),
			[new ChatDebugEventTreeRenderer()],
			{ identityProvider, accessibilityProvider }
		));

		// Shimmer row (positioned right below last row to indicate session is running)
		this.shimmerRow = DOM.append(this.bodyContainer, $('.chat-debug-logs-shimmer-row'));
		this.shimmerRow.setAttribute('aria-label', localize('chatDebug.loadingMore', "Loading more events…"));
		this.shimmerRow.setAttribute('aria-busy', 'true');
		DOM.append(this.shimmerRow, $('span.chat-debug-logs-shimmer-bar'));
		DOM.hide(this.shimmerRow);

		// Detail panel (sibling of main column so it aligns with table header)
		this.detailPanel = this._register(this.instantiationService.createInstance(ChatDebugDetailPanel, contentContainer));
		this._register(this.detailPanel.onDidHide(() => {
			if (this.list.getSelection().length > 0) {
				this.list.setSelection([]);
			}
			if (this.tree.getSelection().length > 0) {
				this.tree.setSelection([]);
			}
		}));

		// Resolve event details on selection
		this._register(this.list.onDidChangeSelection(e => {
			const selected = e.elements[0];
			if (selected) {
				this.detailPanel.show(selected);
			} else {
				this.detailPanel.hide();
			}
		}));

		this._register(this.tree.onDidChangeSelection(e => {
			const selected = e.elements[0];
			if (selected) {
				this.detailPanel.show(selected);
			} else {
				this.detailPanel.hide();
			}
		}));
	}

	setSession(sessionResource: URI): void {
		this.currentSessionResource = sessionResource;
	}

	show(): void {
		DOM.show(this.container);
		this.loadEvents();
		this.refreshList();
	}

	hide(): void {
		DOM.hide(this.container);
	}

	focus(): void {
		if (this.logsViewMode === LogsViewMode.Tree) {
			this.tree.domFocus();
		} else {
			this.list.domFocus();
		}
	}

	updateBreadcrumb(): void {
		if (!this.currentSessionResource) {
			return;
		}
		const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
		this.breadcrumbWidget.setItems([
			new TextBreadcrumbItem(localize('chatDebug.title', "Chat Debug Panel"), true),
			new TextBreadcrumbItem(sessionTitle, true),
			new TextBreadcrumbItem(localize('chatDebug.logs', "Logs")),
		]);
	}

	layout(dimension: Dimension): void {
		this.currentDimension = dimension;
		const breadcrumbHeight = 22;
		const headerHeight = this.headerContainer.offsetHeight;
		const tableHeaderHeight = this.tableHeader.offsetHeight;
		const detailVisible = this.detailPanel.element.style.display !== 'none';
		const detailWidth = detailVisible ? this.detailPanel.element.offsetWidth : 0;
		const listHeight = dimension.height - breadcrumbHeight - headerHeight - tableHeaderHeight;
		const listWidth = dimension.width - detailWidth;
		if (this.logsViewMode === LogsViewMode.Tree) {
			this.tree.layout(listHeight, listWidth);
		} else {
			this.list.layout(listHeight, listWidth);
		}
	}

	refreshList(): void {
		let filtered = this.events;

		// Filter by kind toggles
		filtered = filtered.filter(e => this.filterState.isKindVisible(e.kind));

		// Filter by level toggles
		filtered = filtered.filter(e => {
			if (e.kind === 'generic') {
				switch (e.level) {
					case ChatDebugLogLevel.Trace: return this.filterState.filterLevelTrace;
					case ChatDebugLogLevel.Info: return this.filterState.filterLevelInfo;
					case ChatDebugLogLevel.Warning: return this.filterState.filterLevelWarning;
					case ChatDebugLogLevel.Error: return this.filterState.filterLevelError;
				}
			}
			if (e.kind === 'toolCall' && e.result === 'error') {
				return this.filterState.filterLevelError;
			}
			return true;
		});

		// Filter by text search
		const filterText = this.filterState.textFilter;
		if (filterText) {
			const terms = filterText.split(/\s*,\s*/).filter(t => t.length > 0);
			const includeTerms = terms.filter(t => !t.startsWith('!')).map(t => t.trim());
			const excludeTerms = terms.filter(t => t.startsWith('!')).map(t => t.slice(1).trim()).filter(t => t.length > 0);

			filtered = filtered.filter(e => {
				const matchesText = (term: string): boolean => {
					if (e.kind.toLowerCase().includes(term)) {
						return true;
					}
					switch (e.kind) {
						case 'toolCall':
							return e.toolName.toLowerCase().includes(term) ||
								(e.input?.toLowerCase().includes(term) ?? false) ||
								(e.output?.toLowerCase().includes(term) ?? false);
						case 'modelTurn':
							return (e.model?.toLowerCase().includes(term) ?? false);
						case 'generic':
							return e.name.toLowerCase().includes(term) ||
								(e.details?.toLowerCase().includes(term) ?? false) ||
								(e.category?.toLowerCase().includes(term) ?? false);
						case 'subagentInvocation':
							return e.agentName.toLowerCase().includes(term) ||
								(e.description?.toLowerCase().includes(term) ?? false);
						case 'userMessage':
							return e.message.toLowerCase().includes(term) ||
								e.sections.some(s => s.name.toLowerCase().includes(term) || s.content.toLowerCase().includes(term));
						case 'agentResponse':
							return e.message.toLowerCase().includes(term) ||
								e.sections.some(s => s.name.toLowerCase().includes(term) || s.content.toLowerCase().includes(term));
					}
				};

				// Exclude terms: if any exclude term matches, filter out the event
				if (excludeTerms.some(term => matchesText(term))) {
					return false;
				}
				// Include terms: if present, at least one must match
				if (includeTerms.length > 0) {
					return includeTerms.some(term => matchesText(term));
				}
				return true;
			});
		}

		if (this.logsViewMode === LogsViewMode.List) {
			this.list.splice(0, this.list.length, filtered);
		} else {
			this.refreshTree(filtered);
		}
		this.updateShimmerPosition(filtered.length);
	}

	private updateShimmerPosition(itemCount: number): void {
		this.shimmerRow.style.top = `${itemCount * 28}px`;
	}

	addEvent(event: IChatDebugEvent): void {
		this.events.push(event);
		this.refreshList();
	}

	private loadEvents(): void {
		this.events = [...this.chatDebugService.getEvents(this.currentSessionResource || undefined)];
		this.eventListener.value = this.chatDebugService.onDidAddEvent(e => {
			if (!this.currentSessionResource || e.sessionResource.toString() === this.currentSessionResource.toString()) {
				this.events.push(e);
				this.refreshList();
			}
		});
		this.updateBreadcrumb();
		this.trackSessionState();
	}

	private trackSessionState(): void {
		if (!this.currentSessionResource) {
			DOM.hide(this.shimmerRow);
			this.sessionStateDisposable.clear();
			return;
		}

		const model = this.chatService.getSession(this.currentSessionResource);
		if (!model) {
			DOM.hide(this.shimmerRow);
			this.sessionStateDisposable.clear();
			return;
		}

		this.sessionStateDisposable.value = autorun(reader => {
			const inProgress = model.requestInProgress.read(reader);
			if (inProgress) {
				DOM.show(this.shimmerRow);
			} else {
				DOM.hide(this.shimmerRow);
			}
		});
	}

	private refreshTree(filtered: IChatDebugEvent[]): void {
		const treeElements = this.buildTreeHierarchy(filtered);
		this.tree.setChildren(null, treeElements);
	}

	private buildTreeHierarchy(events: IChatDebugEvent[]): IObjectTreeElement<IChatDebugEvent>[] {
		const idToEvent = new Map<string, IChatDebugEvent>();
		const idToChildren = new Map<string, IChatDebugEvent[]>();
		const roots: IChatDebugEvent[] = [];

		for (const event of events) {
			if (event.id) {
				idToEvent.set(event.id, event);
			}
		}

		for (const event of events) {
			if (event.parentEventId && idToEvent.has(event.parentEventId)) {
				let children = idToChildren.get(event.parentEventId);
				if (!children) {
					children = [];
					idToChildren.set(event.parentEventId, children);
				}
				children.push(event);
			} else {
				roots.push(event);
			}
		}

		const toTreeElement = (event: IChatDebugEvent): IObjectTreeElement<IChatDebugEvent> => {
			const children = event.id ? idToChildren.get(event.id) : undefined;
			return {
				element: event,
				children: children?.map(toTreeElement),
				collapsible: (children?.length ?? 0) > 0,
				collapsed: false,
			};
		};

		return roots.map(toTreeElement);
	}

	private toggleViewMode(): void {
		if (this.logsViewMode === LogsViewMode.List) {
			this.logsViewMode = LogsViewMode.Tree;
			DOM.hide(this.listContainer);
			DOM.show(this.treeContainer);
		} else {
			this.logsViewMode = LogsViewMode.List;
			DOM.show(this.listContainer);
			DOM.hide(this.treeContainer);
		}
		this.updateViewModeToggle();
		this.refreshList();
		if (this.currentDimension) {
			this.layout(this.currentDimension);
		}
	}

	private updateViewModeToggle(): void {
		const el = this.viewModeToggle.element;
		DOM.clearNode(el);
		const isTree = this.logsViewMode === LogsViewMode.Tree;
		DOM.append(el, $(`span${ThemeIcon.asCSSSelector(isTree ? Codicon.listTree : Codicon.listFlat)}`));

		const labelContainer = DOM.append(el, $('span.chat-debug-view-mode-labels'));
		const treeLabel = DOM.append(labelContainer, $('span.chat-debug-view-mode-label'));
		treeLabel.textContent = localize('chatDebug.treeView', "Tree View");
		const listLabel = DOM.append(labelContainer, $('span.chat-debug-view-mode-label'));
		listLabel.textContent = localize('chatDebug.listView', "List View");

		if (isTree) {
			listLabel.classList.add('hidden');
		} else {
			treeLabel.classList.add('hidden');
		}

		const activeLabel = isTree
			? localize('chatDebug.switchToListView', "Switch to List View")
			: localize('chatDebug.switchToTreeView', "Switch to Tree View");
		el.setAttribute('aria-label', activeLabel);
		this.viewModeToggle.setTitle(activeLabel);
	}

	private updateMoreFiltersChecked(): void {
		this.filterWidget.checkMoreFilters(!this.filterState.isAllFiltersDefault());
	}


}
