/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { FilterWidget } from '../../../../browser/parts/views/viewFilter.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';
import { bindFilterContextKeys } from './chatDebugFilters.js';
import { buildFlowGraph, filterFlowNodes, sliceFlowNodes, mergeDiscoveryNodes, mergeToolCallNodes, layoutFlowGraph, renderFlowChartSVG } from './chatDebugFlowChart.js';
import { ChatDebugDetailPanel } from './chatDebugDetailPanel.js';
const $ = DOM.$;
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.15;
const WHEEL_ZOOM_FACTOR = 0.002;
const CLICK_THRESHOLD_SQ = 25;
const PAGE_SIZE = 100;
export var FlowChartNavigation;
(function (FlowChartNavigation) {
    FlowChartNavigation["Home"] = "home";
    FlowChartNavigation["Overview"] = "overview";
})(FlowChartNavigation || (FlowChartNavigation = {}));
let ChatDebugFlowChartView = class ChatDebugFlowChartView extends Disposable {
    constructor(parent, filterState, chatService, chatDebugService, contextKeyService, instantiationService) {
        super();
        this.filterState = filterState;
        this.chatService = chatService;
        this.chatDebugService = chatDebugService;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this._onNavigate = this._register(new Emitter());
        this.onNavigate = this._onNavigate.event;
        this.loadDisposables = this._register(new DisposableStore());
        // Pan/zoom state
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
        // Click detection (distinguish click from drag)
        this.mouseDownX = 0;
        this.mouseDownY = 0;
        this.lastEventCount = 0;
        this.hasUserPanned = false;
        // Collapse state — persists across refreshes, resets on session change
        this.collapsedNodeIds = new Set();
        // Expanded merged-discovery nodes — persists across refreshes, resets on session change
        this.expandedMergedIds = new Set();
        // Pagination state
        this.visibleLimit = PAGE_SIZE;
        this.eventById = new Map();
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
                    this._onNavigate.fire("home" /* FlowChartNavigation.Home */);
                }
                else if (idx === 1) {
                    this._onNavigate.fire("overview" /* FlowChartNavigation.Overview */);
                }
            }
        }));
        // Header with FilterWidget
        this.headerContainer = DOM.append(this.container, $('.chat-debug-editor-header'));
        const headerContainer = this.headerContainer;
        const scopedContextKeyService = this._register(this.contextKeyService.createScoped(headerContainer));
        const syncContextKeys = bindFilterContextKeys(this.filterState, scopedContextKeyService);
        syncContextKeys();
        const childInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
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
        this.refreshScheduler = this._register(new RunOnceScheduler(() => this.load(), 100));
    }
    setSession(sessionResource) {
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
    show() {
        DOM.show(this.container);
        this.load();
    }
    hide() {
        DOM.hide(this.container);
        this.refreshScheduler.cancel();
    }
    refresh() {
        if (this.container.style.display !== 'none') {
            if (!this.refreshScheduler.isScheduled()) {
                this.refreshScheduler.schedule();
            }
        }
    }
    updateBreadcrumb() {
        if (!this.currentSessionResource) {
            return;
        }
        const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
        this.breadcrumbWidget.setItems([
            new TextBreadcrumbItem(localize('chatDebug.title', "Agent Debug Logs"), true),
            new TextBreadcrumbItem(sessionTitle, true),
            new TextBreadcrumbItem(localize('chatDebug.flowChart', "Agent Flow Chart")),
        ]);
    }
    load() {
        // Check whether the chart content currently has focus before clearing it,
        // so we only restore focus if it was taken away by the re-render.
        const hadFocus = DOM.isAncestorOfActiveElement(this.content);
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
        }
        else {
            // Apply existing transform to preserve position
            this.applyTransform();
        }
        // Restore focus after re-render only when the chart itself had focus
        // before clearNode removed it (e.g. after collapse toggle). Skip when
        // focus was elsewhere (detail panel, filter, or outside the chart)
        // so that new events arriving don't steal focus.
        if (this.focusedElementId && hadFocus && !DOM.isAncestorOfActiveElement(this.headerContainer)) {
            this.restoreFocus(this.focusedElementId);
        }
    }
    setupPanZoom() {
        this._register(DOM.addDisposableListener(this.content, DOM.EventType.MOUSE_DOWN, e => this.handleMouseDown(e)));
        const targetDocument = DOM.getWindow(this.content).document;
        this._register(DOM.addDisposableListener(targetDocument, DOM.EventType.MOUSE_MOVE, e => this.handleMouseMove(e)));
        this._register(DOM.addDisposableListener(targetDocument, DOM.EventType.MOUSE_UP, e => this.handleMouseUp(e)));
        this._register(DOM.addDisposableListener(this.content, 'wheel', e => this.handleWheel(e), { passive: false }));
    }
    setupKeyboard() {
        // Track which node/header gets focus
        this._register(DOM.addDisposableListener(this.content, DOM.EventType.FOCUS_IN, (e) => {
            const el = e.target;
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
        this._register(DOM.addDisposableListener(this.content, DOM.EventType.KEY_DOWN, (e) => {
            const target = e.target;
            if (!target) {
                return;
            }
            const subgraphId = target.getAttribute?.('data-subgraph-id');
            switch (e.key) {
                case 'Tab': {
                    // Navigate between flow chart nodes. When at the boundary,
                    // explicitly move focus to the detail panel (forward) or
                    // let it leave the chart (backward). We cannot rely on
                    // natural tab-out because DOM order of SVG elements does
                    // not match the visual sorted order, which would cause
                    // focus to jump to a random chart node instead of leaving.
                    if (this.focusedElementId) {
                        const moved = this.focusAdjacentElement(this.focusedElementId, e.shiftKey ? -1 : 1);
                        if (moved) {
                            e.preventDefault();
                        }
                        else if (!e.shiftKey && this.detailPanel.isVisible) {
                            // Forward Tab at end of chart: move to the detail panel
                            e.preventDefault();
                            this.detailPanel.focus();
                        }
                    }
                    else if (!e.shiftKey) {
                        e.preventDefault();
                        this.focusFirstElement();
                    }
                    break;
                }
                case 'Enter':
                case ' ':
                    if (subgraphId) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.detailPanel.hide();
                        this.toggleSubgraph(subgraphId);
                    }
                    else {
                        const nodeId = target.getAttribute?.('data-node-id');
                        if (nodeId) {
                            e.preventDefault();
                            if (target.getAttribute?.('data-is-toggle')) {
                                this.detailPanel.hide();
                                this.toggleMergedDiscovery(nodeId);
                            }
                            else {
                                const event = this.eventById.get(nodeId);
                                if (event) {
                                    this.detailPanel.show(event);
                                }
                            }
                        }
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (this.focusedElementId) {
                        this.focusEdgeNeighbor(this.focusedElementId, 'next');
                    }
                    else {
                        this.focusFirstElement();
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (this.focusedElementId) {
                        // Expand collapsed subgraph or merged discovery node,
                        // then jump focus to the first revealed child.
                        if (subgraphId && this.collapsedNodeIds.has(subgraphId)) {
                            this.detailPanel.hide();
                            this.collapsedNodeIds.delete(subgraphId);
                            this.focusedElementId = `sg:${subgraphId}`;
                            this.load();
                            this.focusFirstChildOf(`sg:${subgraphId}`);
                        }
                        else if (target.getAttribute?.('data-is-toggle')) {
                            if (!this.expandedMergedIds.has(this.focusedElementId)) {
                                // Expand and jump to the first child
                                this.detailPanel.hide();
                                const mergedId = this.focusedElementId;
                                this.expandedMergedIds.add(mergedId);
                                this.focusedElementId = mergedId;
                                this.load();
                                this.focusFirstChildOf(mergedId);
                            }
                            else {
                                // Already expanded: jump to the first child
                                this.focusFirstChildOf(this.focusedElementId);
                            }
                        }
                    }
                    else {
                        this.focusFirstElement();
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (this.focusedElementId) {
                        this.focusEdgeNeighbor(this.focusedElementId, 'prev');
                    }
                    else {
                        this.focusFirstElement();
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (this.focusedElementId) {
                        // Collapse expanded subgraph or merged discovery node
                        if (subgraphId && !this.collapsedNodeIds.has(subgraphId)) {
                            this.detailPanel.hide();
                            this.toggleSubgraph(subgraphId);
                        }
                        else if (target.getAttribute?.('data-is-toggle') && this.expandedMergedIds.has(this.focusedElementId)) {
                            this.detailPanel.hide();
                            this.toggleMergedDiscovery(this.focusedElementId);
                        }
                        else {
                            // Navigate back to parent (follow edge backward)
                            this.focusEdgeNeighbor(this.focusedElementId, 'prev');
                        }
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
    toggleSubgraph(subgraphId) {
        if (this.collapsedNodeIds.has(subgraphId)) {
            this.collapsedNodeIds.delete(subgraphId);
        }
        else {
            this.collapsedNodeIds.add(subgraphId);
        }
        this.focusedElementId = `sg:${subgraphId}`;
        this.load();
    }
    toggleMergedDiscovery(mergedId) {
        if (this.expandedMergedIds.has(mergedId)) {
            this.expandedMergedIds.delete(mergedId);
        }
        else {
            this.expandedMergedIds.add(mergedId);
        }
        this.focusedElementId = mergedId;
        this.load();
    }
    focusFirstElement() {
        if (!this.renderResult) {
            return;
        }
        const first = this.renderResult.focusableElements.values().next();
        if (!first.done) {
            first.value.focus();
        }
    }
    focusLastElement() {
        if (!this.renderResult) {
            return;
        }
        const entries = [...this.renderResult.focusableElements.values()];
        if (entries.length > 0) {
            entries[entries.length - 1].focus();
        }
    }
    focusAdjacentElement(currentMapKey, direction) {
        if (!this.renderResult) {
            return false;
        }
        const keys = [...this.renderResult.focusableElements.keys()];
        const idx = keys.indexOf(currentMapKey);
        if (idx === -1) {
            return false;
        }
        const nextIdx = idx + direction;
        if (nextIdx < 0 || nextIdx >= keys.length) {
            return false;
        }
        const el = this.renderResult.focusableElements.get(keys[nextIdx]);
        if (el) {
            el.focus();
            return true;
        }
        return false;
    }
    focusEdgeNeighbor(currentId, direction) {
        if (!this.renderResult) {
            return false;
        }
        const entry = this.renderResult.adjacency.get(currentId);
        const neighbors = entry?.[direction];
        if (!neighbors || neighbors.length === 0) {
            return false;
        }
        // Focus the first neighbor that has a focusable element
        for (const id of neighbors) {
            const el = this.renderResult.focusableElements.get(id);
            if (el) {
                el.focus();
                return true;
            }
        }
        return false;
    }
    focusFirstChildOf(parentId) {
        if (!this.renderResult) {
            return;
        }
        const entry = this.renderResult.adjacency.get(parentId);
        if (!entry?.next || entry.next.length === 0) {
            return;
        }
        // Prefer a neighbor positioned to the right of the parent
        // (expanded child) over one below (next in main flow).
        const parentPos = this.renderResult.positions.get(parentId);
        let bestId;
        for (const id of entry.next) {
            if (!this.renderResult.focusableElements.has(id)) {
                continue;
            }
            if (!bestId) {
                bestId = id;
            }
            if (parentPos) {
                const pos = this.renderResult.positions.get(id);
                if (pos && pos.x > parentPos.x) {
                    bestId = id;
                    break;
                }
            }
        }
        if (bestId) {
            const el = this.renderResult.focusableElements.get(bestId);
            if (el) {
                this.focusedElementId = bestId;
                el.focus();
            }
        }
    }
    restoreFocus(elementId) {
        const el = this.renderResult?.focusableElements.get(elementId);
        if (el) {
            el.focus();
        }
    }
    zoomBy(delta) {
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
    handleMouseDown(e) {
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
    handleMouseMove(e) {
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
    handleMouseUp(e) {
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
    handleClick(e) {
        // Walk up from the click target to find a focusable element
        let target = e.target;
        while (target && target !== this.content) {
            // Merged-discovery expand toggle
            const mergedId = target.getAttribute?.('data-merged-id');
            if (mergedId) {
                this.detailPanel.hide();
                this.toggleMergedDiscovery(mergedId);
                return;
            }
            const subgraphId = target.getAttribute?.('data-subgraph-id');
            if (subgraphId) {
                this.detailPanel.hide();
                this.toggleSubgraph(subgraphId);
                return;
            }
            const nodeId = target.getAttribute?.('data-node-id');
            if (nodeId) {
                target.focus();
                if (target.getAttribute?.('data-is-toggle')) {
                    this.detailPanel.hide();
                    this.toggleMergedDiscovery(nodeId);
                }
                else {
                    const event = this.eventById.get(nodeId);
                    if (event) {
                        this.detailPanel.show(event);
                    }
                }
                return;
            }
            target = target.parentElement;
        }
    }
    handleWheel(e) {
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
    applyTransform() {
        if (this.svgWrapper) {
            this.svgWrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
        }
    }
    centerContent() {
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
};
ChatDebugFlowChartView = __decorate([
    __param(2, IChatService),
    __param(3, IChatDebugService),
    __param(4, IContextKeyService),
    __param(5, IInstantiationService)
], ChatDebugFlowChartView);
export { ChatDebugFlowChartView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRmxvd0NoYXJ0Vmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnRmxvd0NoYXJ0Vmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN6RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQW1CLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlD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