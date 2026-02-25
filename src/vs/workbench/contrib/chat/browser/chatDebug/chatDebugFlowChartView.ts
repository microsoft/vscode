/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { FilterWidget } from '../../../../browser/parts/views/viewFilter.js';
import { IChatDebugEvent, IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';
import { ChatDebugFilterState, bindFilterContextKeys } from './chatDebugFilters.js';
import { buildFlowGraph, filterFlowNodes, sliceFlowNodes, mergeDiscoveryNodes, mergeToolCallNodes, layoutFlowGraph, renderFlowChartSVG, FlowChartRenderResult } from './chatDebugFlowChart.js';
import { ChatDebugDetailPanel } from './chatDebugDetailPanel.js';

const $ = DOM.$;

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.15;
const WHEEL_ZOOM_FACTOR = 0.002;
const CLICK_THRESHOLD_SQ = 25;
const PAGE_SIZE = 100;

export const enum FlowChartNavigation {
	Home = 'home',
	Overview = 'overview',
}

export class ChatDebugFlowChartView extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<FlowChartNavigation>());
	readonly onNavigate = this._onNavigate.event;

	readonly container: HTMLElement;
	private readonly content: HTMLElement;
	private readonly breadcrumbWidget: BreadcrumbsWidget;
	private readonly filterWidget: FilterWidget;
	private readonly loadDisposables = this._register(new DisposableStore());

	// Pan/zoom state
	private scale = 1;
	private translateX = 0;
	private translateY = 0;
	private isPanning = false;
	private startX = 0;
	private startY = 0;

	// Click detection (distinguish click from drag)
	private mouseDownX = 0;
	private mouseDownY = 0;

	// Direct element references (avoid querySelector)
	private svgWrapper: HTMLElement | undefined;
	private svgElement: SVGElement | undefined;
	private renderResult: FlowChartRenderResult | undefined;

	private currentSessionResource: URI | undefined;
	private lastEventCount: number = 0;
	private hasUserPanned: boolean = false;

	// Focus state — preserved across re-renders
	private focusedElementId: string | undefined;

	// Collapse state — persists across refreshes, resets on session change
	private readonly collapsedNodeIds = new Set<string>();

	// Expanded merged-discovery nodes — persists across refreshes, resets on session change
	private readonly expandedMergedIds = new Set<string>();

	// Pagination state
	private visibleLimit: number = PAGE_SIZE;

	// Detail panel
	private readonly detailPanel: ChatDebugDetailPanel;
	private eventById = new Map<string, IChatDebugEvent>();

	constructor(
		parent: HTMLElement,
		private readonly filterState: ChatDebugFilterState,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-flowchart'));
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
					this._onNavigate.fire(FlowChartNavigation.Home);
				} else if (idx === 1) {
					this._onNavigate.fire(FlowChartNavigation.Overview);
				}
			}
		}));

		// Header with FilterWidget
		const headerContainer = DOM.append(this.container, $('.chat-debug-editor-header'));
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(headerContainer));
		const syncContextKeys = bindFilterContextKeys(this.filterState, scopedContextKeyService);
		syncContextKeys();

		const childInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])
		));
		this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, {
			placeholder: localize('chatDebug.flowchart.search', "Filter nodes..."),
			ariaLabel: localize('chatDebug.flowchart.filterAriaLabel', "Filter flow chart nodes"),
		}));
		const filterContainer = DOM.append(headerContainer, $('.viewpane-filter-container'));
		filterContainer.appendChild(this.filterWidget.element);

		this._register(this.filterWidget.onDidChangeFilterText(text => {
			this.filterState.setTextFilter(text);
		}));

		// React to shared filter state changes
		this._register(this.filterState.onDidChange(() => {
			syncContextKeys();
			this.filterWidget.checkMoreFilters(!this.filterState.isAllFiltersDefault());
			this.visibleLimit = PAGE_SIZE;
			// Reset pan/zoom so filtered content is visible
			this.hasUserPanned = false;
			this.lastEventCount = 0;
			this.load();
		}));

		// Content wrapper (flex row: chart canvas + detail panel)
		const contentWrapper = DOM.append(this.container, $('.chat-debug-flowchart-content-wrapper'));
		this.content = DOM.append(contentWrapper, $('.chat-debug-flowchart-content'));

		// Detail panel (sibling of chart canvas)
		this.detailPanel = this._register(this.instantiationService.createInstance(ChatDebugDetailPanel, contentWrapper));

		// Set up pan/zoom event listeners and keyboard handling
		this.setupPanZoom();
		this.setupKeyboard();
	}

	setSession(sessionResource: URI): void {
		if (!this.currentSessionResource || this.currentSessionResource.toString() !== sessionResource.toString()) {
			// Reset pan/zoom, focus, collapse, and pagination state on session change
			this.scale = 1;
			this.translateX = 0;
			this.translateY = 0;
			this.lastEventCount = 0;
			this.hasUserPanned = false;
			this.focusedElementId = undefined;
			this.collapsedNodeIds.clear();
			this.expandedMergedIds.clear();
			this.visibleLimit = PAGE_SIZE;
			this.detailPanel.hide();
		}
		this.currentSessionResource = sessionResource;
	}

	show(): void {
		DOM.show(this.container);
		this.load();
	}

	hide(): void {
		DOM.hide(this.container);
	}

	refresh(): void {
		if (this.container.style.display !== 'none') {
			this.load();
		}
	}

	updateBreadcrumb(): void {
		if (!this.currentSessionResource) {
			return;
		}
		const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
		this.breadcrumbWidget.setItems([
			new TextBreadcrumbItem(localize('chatDebug.title', "Agent Debug Panel"), true),
			new TextBreadcrumbItem(sessionTitle, true),
			new TextBreadcrumbItem(localize('chatDebug.flowChart', "Agent Flow Chart")),
		]);
	}

	private load(): void {
		DOM.clearNode(this.content);
		this.loadDisposables.clear();
		this.updateBreadcrumb();

		const events = this.chatDebugService.getEvents(this.currentSessionResource);
		const isFirstLoad = this.lastEventCount === 0;
		this.lastEventCount = events.length;

		// Build event ID → event map for detail panel lookups
		this.eventById.clear();
		for (const e of events) {
			if (e.id) {
				this.eventById.set(e.id, e);
			}
		}

		if (events.length === 0) {
			const emptyMsg = DOM.append(this.content, $('.chat-debug-flowchart-empty'));
			emptyMsg.textContent = localize('chatDebug.flowChart.noEvents', "No events recorded for this session.");
			return;
		}

		// Build, filter, slice, and render the flow chart
		const flowNodes = buildFlowGraph(events);
		const filtered = filterFlowNodes(flowNodes, {
			isKindVisible: (kind, category) => this.filterState.isKindVisible(kind, category),
			textFilter: this.filterState.textFilter,
		});

		if (filtered.length === 0) {
			const emptyMsg = DOM.append(this.content, $('.chat-debug-flowchart-empty'));
			emptyMsg.textContent = localize('chatDebug.flowChart.noMatches', "No nodes match the current filter.");
			return;
		}

		const slice = sliceFlowNodes(filtered, this.visibleLimit);
		const merged = mergeToolCallNodes(mergeDiscoveryNodes(slice.nodes));
		const layout = layoutFlowGraph(merged, { collapsedIds: this.collapsedNodeIds, expandedMergedIds: this.expandedMergedIds });
		this.renderResult = renderFlowChartSVG(layout);

		this.svgWrapper = DOM.append(this.content, $('.chat-debug-flowchart-svg-wrapper'));
		this.svgWrapper.appendChild(this.renderResult.svg);
		this.svgElement = this.renderResult.svg;

		// Show "Show More" button below the chart when there are more nodes
		if (slice.shownCount < slice.totalCount) {
			const remaining = slice.totalCount - slice.shownCount;
			const showMoreContainer = DOM.append(this.svgWrapper, $('.chat-debug-flowchart-show-more'));
			const showMoreBtn = this.loadDisposables.add(new Button(showMoreContainer, { ...defaultButtonStyles, secondary: true, title: localize('chatDebug.flowChart.showMoreTitle', "Load more nodes") }));
			showMoreBtn.label = localize('chatDebug.flowChart.showMore', "Show More ({0})", remaining);
			this.loadDisposables.add(showMoreBtn.onDidClick(() => {
				this.visibleLimit += PAGE_SIZE;
				this.load();
			}));
		}

		// Only center on first load when user hasn't panned yet
		if (isFirstLoad && !this.hasUserPanned) {
			DOM.getWindow(this.content).requestAnimationFrame(() => {
				this.centerContent();
			});
		} else {
			// Apply existing transform to preserve position
			this.applyTransform();
		}

		// Restore focus after re-render (e.g. after collapse toggle)
		if (this.focusedElementId) {
			this.restoreFocus(this.focusedElementId);
		}
	}

	private setupPanZoom(): void {
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.MOUSE_DOWN, e => this.handleMouseDown(e)));
		const targetDocument = DOM.getWindow(this.content).document;
		this._register(DOM.addDisposableListener(targetDocument, DOM.EventType.MOUSE_MOVE, e => this.handleMouseMove(e)));
		this._register(DOM.addDisposableListener(targetDocument, DOM.EventType.MOUSE_UP, e => this.handleMouseUp(e)));
		this._register(DOM.addDisposableListener(this.content, 'wheel', e => this.handleWheel(e), { passive: false }));
	}

	private setupKeyboard(): void {
		// Track which node/header gets focus
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.FOCUS_IN, (e: FocusEvent) => {
			const el = e.target as Element | null;
			if (!el) {
				return;
			}
			// Check for subgraph header or node
			const subgraphId = el.getAttribute?.('data-subgraph-id');
			if (subgraphId) {
				this.focusedElementId = `sg:${subgraphId}`;
				return;
			}
			const nodeId = el.getAttribute?.('data-node-id');
			if (nodeId) {
				this.focusedElementId = nodeId;
			}
		}));

		// Handle keyboard actions
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const target = e.target as Element | null;
			if (!target) {
				return;
			}
			const subgraphId = target.getAttribute?.('data-subgraph-id');

			switch (e.key) {
				case 'Tab': {
					e.preventDefault();
					if (this.focusedElementId) {
						this.focusAdjacentElement(this.focusedElementId, e.shiftKey ? -1 : 1);
					} else {
						this.focusFirstElement();
					}
					break;
				}
				case 'Enter':
				case ' ':
					if (subgraphId) {
						e.preventDefault();
						e.stopPropagation();
						this.toggleSubgraph(subgraphId);
					} else {
						const nodeId = target.getAttribute?.('data-node-id');
						if (nodeId) {
							e.preventDefault();
							const event = this.eventById.get(nodeId);
							if (event) {
								this.detailPanel.show(event);
							}
						}
					}
					break;
				case 'ArrowDown':
				case 'ArrowRight':
					e.preventDefault();
					if (this.focusedElementId) {
						this.focusAdjacentElement(this.focusedElementId, 1);
					} else {
						this.focusFirstElement();
					}
					break;
				case 'ArrowUp':
				case 'ArrowLeft':
					e.preventDefault();
					if (this.focusedElementId) {
						this.focusAdjacentElement(this.focusedElementId, -1);
					} else {
						this.focusFirstElement();
					}
					break;
				case 'Home':
					e.preventDefault();
					this.focusFirstElement();
					break;
				case 'End':
					e.preventDefault();
					this.focusLastElement();
					break;
				case '=':
				case '+':
					if (!e.ctrlKey && !e.metaKey) {
						e.preventDefault();
						this.zoomBy(ZOOM_STEP);
					}
					break;
				case '-':
					if (!e.ctrlKey && !e.metaKey) {
						e.preventDefault();
						this.zoomBy(-ZOOM_STEP);
					}
					break;
			}
		}));
	}

	private toggleSubgraph(subgraphId: string): void {
		if (this.collapsedNodeIds.has(subgraphId)) {
			this.collapsedNodeIds.delete(subgraphId);
		} else {
			this.collapsedNodeIds.add(subgraphId);
		}
		this.focusedElementId = `sg:${subgraphId}`;
		this.load();
	}

	private toggleMergedDiscovery(mergedId: string): void {
		if (this.expandedMergedIds.has(mergedId)) {
			this.expandedMergedIds.delete(mergedId);
		} else {
			this.expandedMergedIds.add(mergedId);
		}
		this.load();
	}

	private focusFirstElement(): void {
		if (!this.renderResult) {
			return;
		}
		const first = this.renderResult.focusableElements.values().next();
		if (!first.done) {
			(first.value as SVGElement).focus();
		}
	}

	private focusLastElement(): void {
		if (!this.renderResult) {
			return;
		}
		const entries = [...this.renderResult.focusableElements.values()];
		if (entries.length > 0) {
			(entries[entries.length - 1] as SVGElement).focus();
		}
	}

	private focusAdjacentElement(currentMapKey: string, direction: 1 | -1): void {
		if (!this.renderResult) {
			return;
		}
		const keys = [...this.renderResult.focusableElements.keys()];
		const idx = keys.indexOf(currentMapKey);
		if (idx === -1) {
			return;
		}
		const nextIdx = idx + direction;
		if (nextIdx < 0 || nextIdx >= keys.length) {
			return;
		}
		const el = this.renderResult.focusableElements.get(keys[nextIdx]);
		if (el) {
			(el as SVGElement).focus();
		}
	}

	private restoreFocus(elementId: string): void {
		const el = this.renderResult?.focusableElements.get(elementId);
		if (el) {
			el.focus();
		}
	}

	private zoomBy(delta: number): void {
		const rect = this.content.getBoundingClientRect();
		const centerX = rect.width / 2;
		const centerY = rect.height / 2;
		const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * (1 + delta)));
		const scaleFactor = newScale / this.scale;
		this.translateX = centerX - (centerX - this.translateX) * scaleFactor;
		this.translateY = centerY - (centerY - this.translateY) * scaleFactor;
		this.scale = newScale;
		this.hasUserPanned = true;
		this.applyTransform();
	}

	private handleMouseDown(e: MouseEvent): void {
		if (e.button !== 0) {
			return;
		}
		e.preventDefault();
		this.isPanning = true;
		this.hasUserPanned = true;
		this.startX = e.clientX - this.translateX;
		this.startY = e.clientY - this.translateY;
		this.mouseDownX = e.clientX;
		this.mouseDownY = e.clientY;
		this.content.style.cursor = 'grabbing';
	}

	private handleMouseMove(e: MouseEvent): void {
		if (!this.isPanning) {
			return;
		}
		if (e.buttons === 0) {
			this.handleMouseUp(e);
			return;
		}
		this.translateX = e.clientX - this.startX;
		this.translateY = e.clientY - this.startY;
		this.applyTransform();
	}

	private handleMouseUp(e: MouseEvent): void {
		if (this.isPanning) {
			this.isPanning = false;
			this.content.style.cursor = 'grab';

			// Detect click (not a drag) — distance < 5px
			const dx = e.clientX - this.mouseDownX;
			const dy = e.clientY - this.mouseDownY;
			if (dx * dx + dy * dy < CLICK_THRESHOLD_SQ) {
				this.handleClick(e);
			}
		}
	}

	private handleClick(e: MouseEvent): void {
		// Walk up from the click target to find a focusable element
		let target = e.target as Element | null;
		while (target && target !== this.content) {
			// Merged-discovery expand toggle
			const mergedId = target.getAttribute?.('data-merged-id');
			if (mergedId) {
				this.toggleMergedDiscovery(mergedId);
				return;
			}
			const subgraphId = target.getAttribute?.('data-subgraph-id');
			if (subgraphId) {
				this.toggleSubgraph(subgraphId);
				return;
			}
			const nodeId = target.getAttribute?.('data-node-id');
			if (nodeId) {
				(target as HTMLElement).focus();
				const event = this.eventById.get(nodeId);
				if (event) {
					this.detailPanel.show(event);
				}
				return;
			}
			target = target.parentElement;
		}
	}

	private handleWheel(e: WheelEvent): void {
		e.preventDefault();
		e.stopPropagation();

		this.hasUserPanned = true;

		const rect = this.content.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
		const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * (1 + delta)));

		const scaleFactor = newScale / this.scale;
		this.translateX = mouseX - (mouseX - this.translateX) * scaleFactor;
		this.translateY = mouseY - (mouseY - this.translateY) * scaleFactor;
		this.scale = newScale;

		this.applyTransform();
	}

	private applyTransform(): void {
		if (this.svgWrapper) {
			this.svgWrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
		}
	}

	private centerContent(): void {
		const containerRect = this.content.getBoundingClientRect();
		if (!this.svgElement) {
			return;
		}
		const svgWidth = parseFloat(this.svgElement.getAttribute('width') || '0');
		const svgHeight = parseFloat(this.svgElement.getAttribute('height') || '0');
		if (svgWidth <= 0 || svgHeight <= 0) {
			return;
		}

		const PADDING = 20;
		// Pin the top of the diagram near the top of the viewport so the start
		// of the flow is immediately visible. Center horizontally when the
		// diagram fits; otherwise align to the left edge with padding so
		// nothing is clipped behind overflow:hidden.
		this.translateX = Math.max(PADDING, (containerRect.width - svgWidth) / 2);
		this.translateY = PADDING;
		this.applyTransform();
	}
}
