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
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatDebugLogLevel, IChatDebugService } from '../../common/chatDebugService.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { getChatSessionType, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';
const $ = DOM.$;
const numberFormatter = safeIntl.NumberFormat();
export var OverviewNavigation;
(function (OverviewNavigation) {
    OverviewNavigation["Home"] = "home";
    OverviewNavigation["Logs"] = "logs";
    OverviewNavigation["FlowChart"] = "flowchart";
})(OverviewNavigation || (OverviewNavigation = {}));
let ChatDebugOverviewView = class ChatDebugOverviewView extends Disposable {
    constructor(parent, chatService, chatDebugService, chatWidgetService, chatSessionsService) {
        super();
        this.chatService = chatService;
        this.chatDebugService = chatDebugService;
        this.chatWidgetService = chatWidgetService;
        this.chatSessionsService = chatSessionsService;
        this._onNavigate = this._register(new Emitter());
        this.onNavigate = this._onNavigate.event;
        this.loadDisposables = this._register(new DisposableStore());
        this.isFirstLoad = true;
        this.container = DOM.append(parent, $('.chat-debug-overview'));
        DOM.hide(this.container);
        this.refreshScheduler = this._register(new RunOnceScheduler(() => this.doRefresh(), 100));
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
                    this._onNavigate.fire("home" /* OverviewNavigation.Home */);
                }
            }
        }));
        this.content = DOM.append(this.container, $('.chat-debug-overview-content'));
    }
    setSession(sessionResource) {
        this.currentSessionResource = sessionResource;
        this.isFirstLoad = true;
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
    doRefresh() {
        // On refresh, only update the metrics section in-place
        if (this.metricsContainer && this.currentSessionResource) {
            DOM.clearNode(this.metricsContainer);
            const events = this.chatDebugService.getEvents(this.currentSessionResource);
            this.renderMetricsContent(this.metricsContainer, events);
            this.isFirstLoad = false;
        }
        else {
            this.load();
        }
    }
    updateBreadcrumb() {
        if (!this.currentSessionResource) {
            return;
        }
        const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
        this.breadcrumbWidget.setItems([
            new TextBreadcrumbItem(localize('chatDebug.title', "Agent Debug Logs"), true),
            new TextBreadcrumbItem(sessionTitle),
        ]);
    }
    load() {
        DOM.clearNode(this.content);
        this.loadDisposables.clear();
        this.updateBreadcrumb();
        if (!this.currentSessionResource) {
            return;
        }
        const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
        const titleRow = DOM.append(this.content, $('.chat-debug-overview-title-row'));
        const titleEl = DOM.append(titleRow, $('h2.chat-debug-overview-title'));
        DOM.append(titleEl, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));
        titleEl.append(sessionTitle);
        const titleActions = DOM.append(titleRow, $('.chat-debug-overview-title-actions'));
        const revealSessionBtn = this.loadDisposables.add(new Button(titleActions, { ariaLabel: localize('chatDebug.revealChatSession', "Reveal Chat Session"), title: localize('chatDebug.revealChatSession', "Reveal Chat Session") }));
        revealSessionBtn.element.classList.add('chat-debug-icon-button');
        revealSessionBtn.icon = Codicon.goToFile;
        this.loadDisposables.add(revealSessionBtn.onDidClick(() => {
            if (this.currentSessionResource) {
                this.chatWidgetService.openSession(this.currentSessionResource);
            }
        }));
        // Session details section
        this.renderSessionDetails(this.currentSessionResource);
        // Derived overview metrics — show shimmer only on the very first load
        // AND when there are no events yet. If events were already streamed
        // (e.g. while viewing logs), render them immediately so the shimmer
        // doesn't get stuck forever waiting for an event that already fired.
        const events = this.chatDebugService.getEvents(this.currentSessionResource);
        this.renderDerivedOverview(events, this.isFirstLoad && events.length === 0);
        this.isFirstLoad = false;
    }
    renderSessionDetails(sessionUri) {
        const model = this.chatService.getSession(sessionUri);
        const details = [];
        // Session type
        const sessionType = getChatSessionType(sessionUri);
        const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
        const sessionTypeName = contribution?.displayName || (sessionType === localChatSessionType
            ? localize('chatDebug.sessionType.local', "Local")
            : sessionType);
        details.push({ label: localize('chatDebug.detail.sessionType', "Session Type"), value: sessionTypeName });
        if (model) {
            const locationLabel = this.getLocationLabel(model.initialLocation);
            details.push({ label: localize('chatDebug.detail.location', "Location"), value: locationLabel });
            const inProgress = model.requestInProgress.get();
            const statusLabel = inProgress
                ? localize('chatDebug.status.inProgress', "In Progress")
                : localize('chatDebug.status.idle', "Idle");
            details.push({ label: localize('chatDebug.detail.status', "Status"), value: statusLabel });
            const timing = model.timing;
            details.push({ label: localize('chatDebug.detail.created', "Created"), value: new Date(timing.created).toLocaleString() });
            if (timing.lastRequestEnded) {
                details.push({ label: localize('chatDebug.detail.lastActivity', "Last Activity"), value: new Date(timing.lastRequestEnded).toLocaleString() });
            }
            else if (timing.lastRequestStarted) {
                details.push({ label: localize('chatDebug.detail.lastActivity', "Last Activity"), value: new Date(timing.lastRequestStarted).toLocaleString() });
            }
        }
        if (details.length > 0) {
            const section = DOM.append(this.content, $('.chat-debug-overview-section'));
            DOM.append(section, $('h3.chat-debug-overview-section-label', undefined, localize('chatDebug.sessionDetails', "Session Details")));
            const detailsGrid = DOM.append(section, $('.chat-debug-overview-details'));
            for (const detail of details) {
                const row = DOM.append(detailsGrid, $('.chat-debug-overview-detail-row'));
                DOM.append(row, $('span.chat-debug-overview-detail-label', undefined, detail.label));
                DOM.append(row, $('span.chat-debug-overview-detail-value', undefined, detail.value));
            }
        }
    }
    getLocationLabel(location) {
        switch (location) {
            case ChatAgentLocation.Chat: return localize('chatDebug.location.chat', "Chat Panel");
            case ChatAgentLocation.Terminal: return localize('chatDebug.location.terminal', "Terminal");
            case ChatAgentLocation.Notebook: return localize('chatDebug.location.notebook', "Notebook");
            case ChatAgentLocation.EditorInline: return localize('chatDebug.location.editor', "Editor Inline");
            default: return String(location);
        }
    }
    renderDerivedOverview(events, showShimmer) {
        const metricsSection = DOM.append(this.content, $('.chat-debug-overview-section'));
        DOM.append(metricsSection, $('h3.chat-debug-overview-section-label', undefined, localize('chatDebug.summary', "Summary")));
        this.metricsContainer = DOM.append(metricsSection, $('.chat-debug-overview-metrics'));
        if (showShimmer) {
            this.renderMetricsShimmer(this.metricsContainer);
        }
        else {
            this.renderMetricsContent(this.metricsContainer, events);
        }
        // Explore actions
        const actionsSection = DOM.append(this.content, $('.chat-debug-overview-section'));
        DOM.append(actionsSection, $('h3.chat-debug-overview-section-label', undefined, localize('chatDebug.exploreTraceData', "Explore Trace Data")));
        const row = DOM.append(actionsSection, $('.chat-debug-overview-actions'));
        const viewLogsBtn = this.loadDisposables.add(new Button(row, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize('chatDebug.viewLogs', "View Logs") }));
        viewLogsBtn.element.classList.add('chat-debug-overview-action-button');
        viewLogsBtn.label = `$(list-flat) ${localize('chatDebug.viewLogs', "View Logs")}`;
        this.loadDisposables.add(viewLogsBtn.onDidClick(() => {
            this._onNavigate.fire("logs" /* OverviewNavigation.Logs */);
        }));
        const flowChartBtn = this.loadDisposables.add(new Button(row, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize('chatDebug.agentFlowChart', "Agent Flow Chart") }));
        flowChartBtn.element.classList.add('chat-debug-overview-action-button');
        flowChartBtn.label = `$(type-hierarchy) ${localize('chatDebug.agentFlowChart', "Agent Flow Chart")}`;
        this.loadDisposables.add(flowChartBtn.onDidClick(() => {
            this._onNavigate.fire("flowchart" /* OverviewNavigation.FlowChart */);
        }));
    }
    renderMetricsShimmer(container) {
        // Show placeholder shimmer cards while provider data is loading
        const placeholderLabels = [
            localize('chatDebug.metric.modelTurns', "Model Turns"),
            localize('chatDebug.metric.toolCalls', "Tool Calls"),
            localize('chatDebug.metric.totalTokens', "Total Tokens"),
            localize('chatDebug.metric.errors', "Errors"),
            localize('chatDebug.metric.totalEvents', "Total Events"),
        ];
        for (const label of placeholderLabels) {
            const card = DOM.append(container, $('.chat-debug-overview-metric-card'));
            DOM.append(card, $('div.chat-debug-overview-metric-label', undefined, label));
            const valueEl = DOM.append(card, $('div.chat-debug-overview-metric-value'));
            const shimmer = DOM.append(valueEl, $('span.chat-debug-overview-metric-shimmer'));
            shimmer.textContent = '\u00A0'; // non-breaking space for height
        }
    }
    renderMetricsContent(container, events) {
        const modelTurns = events.filter(e => e.kind === 'modelTurn');
        const toolCalls = events.filter(e => e.kind === 'toolCall');
        const errors = events.filter(e => (e.kind === 'generic' && e.level === ChatDebugLogLevel.Error) ||
            (e.kind === 'toolCall' && e.result === 'error'));
        const totalTokens = modelTurns.reduce((sum, e) => sum + (e.totalTokens ?? 0), 0);
        const metrics = [
            { label: localize('chatDebug.metric.modelTurns', "Model Turns"), value: String(modelTurns.length) },
            { label: localize('chatDebug.metric.toolCalls', "Tool Calls"), value: String(toolCalls.length) },
            { label: localize('chatDebug.metric.totalTokens', "Total Tokens"), value: numberFormatter.value.format(totalTokens) },
            { label: localize('chatDebug.metric.errors', "Errors"), value: String(errors.length) },
            { label: localize('chatDebug.metric.totalEvents', "Total Events"), value: String(events.length) },
        ];
        for (const metric of metrics) {
            const card = DOM.append(container, $('.chat-debug-overview-metric-card'));
            DOM.append(card, $('div.chat-debug-overview-metric-label', undefined, metric.label));
            DOM.append(card, $('div.chat-debug-overview-metric-value', undefined, metric.value));
        }
    }
};
ChatDebugOverviewView = __decorate([
    __param(1, IChatService),
    __param(2, IChatDebugService),
    __param(3, IChatWidgetService),
    __param(4, IChatSessionsService)
], ChatDebugOverviewView);
export { ChatDebugOverviewView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnT3ZlcnZpZXdWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXREZWJ1Zy9jaGF0RGVidWdPdmVydmlld1ZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDekUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLDhCQUE4QixFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0gsT0FBTyxFQUFFLGlCQUFpQixFQUFtQixpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDOUQsT0FBTyxFQUFFLG9CQUFvQixFQUFF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