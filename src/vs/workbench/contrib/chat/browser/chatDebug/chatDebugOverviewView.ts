/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { defaultBreadcrumbsWidgetStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { getChatSessionType, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';
import { TextBreadcrumbItem } from './chatDebugTypes.js';

const $ = DOM.$;

export const enum OverviewNavigation {
	Home = 'home',
	Logs = 'logs',
	FlowChart = 'flowchart',
}

export class ChatDebugOverviewView extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<OverviewNavigation>());
	readonly onNavigate = this._onNavigate.event;

	readonly container: HTMLElement;
	private readonly content: HTMLElement;
	private readonly breadcrumbWidget: BreadcrumbsWidget;
	private readonly loadDisposables = this._register(new DisposableStore());

	private currentSessionId: string = '';

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-overview'));
		DOM.hide(this.container);

		// Breadcrumb
		const breadcrumbContainer = DOM.append(this.container, $('.chat-debug-breadcrumb'));
		this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, undefined, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
		this._register(this.breadcrumbWidget.onDidSelectItem(e => {
			if (e.type === 'select' && e.item instanceof TextBreadcrumbItem) {
				this.breadcrumbWidget.setSelection(undefined);
				const items = this.breadcrumbWidget.getItems();
				const idx = items.indexOf(e.item);
				if (idx === 0) {
					this._onNavigate.fire(OverviewNavigation.Home);
				}
			}
		}));

		this.content = DOM.append(this.container, $('.chat-debug-overview-content'));
	}

	setSession(sessionId: string): void {
		this.currentSessionId = sessionId;
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
		const sessionUri = LocalChatSessionUri.forSession(this.currentSessionId);
		const sessionTitle = this.chatService.getSessionTitle(sessionUri) || this.currentSessionId;
		this.breadcrumbWidget.setItems([
			new TextBreadcrumbItem(localize('chatDebug.title', "Chat Debug Panel"), true),
			new TextBreadcrumbItem(sessionTitle),
		]);
	}

	private load(): void {
		DOM.clearNode(this.content);
		this.loadDisposables.clear();
		this.updateBreadcrumb();

		const sessionUri = LocalChatSessionUri.forSession(this.currentSessionId);
		const sessionTitle = this.chatService.getSessionTitle(sessionUri) || this.currentSessionId;

		const titleRow = DOM.append(this.content, $('.chat-debug-overview-title-row'));
		const titleEl = DOM.append(titleRow, $('h2.chat-debug-overview-title'));
		DOM.append(titleEl, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));
		titleEl.append(sessionTitle);

		const titleActions = DOM.append(titleRow, $('.chat-debug-overview-title-actions'));

		const revealSessionBtn = DOM.append(titleActions, $('button.chat-debug-icon-button'));
		revealSessionBtn.setAttribute('aria-label', localize('chatDebug.revealChatSession', "Reveal Chat Session"));
		this.loadDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), revealSessionBtn, localize('chatDebug.revealChatSession', "Reveal Chat Session")));
		DOM.append(revealSessionBtn, $(`span${ThemeIcon.asCSSSelector(Codicon.goToFile)}`));
		this.loadDisposables.add(DOM.addDisposableListener(revealSessionBtn, DOM.EventType.CLICK, () => {
			const uri = LocalChatSessionUri.forSession(this.currentSessionId);
			this.chatWidgetService.openSession(uri);
		}));

		const deleteBtn = DOM.append(titleActions, $('button.chat-debug-icon-button'));
		deleteBtn.setAttribute('aria-label', localize('chatDebug.deleteDebugData', "Delete Debug Data"));
		this.loadDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), deleteBtn, localize('chatDebug.deleteDebugData', "Delete Debug Data")));
		DOM.append(deleteBtn, $(`span${ThemeIcon.asCSSSelector(Codicon.trash)}`));
		this.loadDisposables.add(DOM.addDisposableListener(deleteBtn, DOM.EventType.CLICK, () => {
			this.chatDebugService.clearSession(this.currentSessionId);
			this._onNavigate.fire(OverviewNavigation.Home);
		}));

		// Session details section
		this.renderSessionDetails(sessionUri);

		// Derived overview metrics
		const events = this.chatDebugService.getEvents(this.currentSessionId);
		this.renderDerivedOverview(events);
	}

	private renderSessionDetails(sessionUri: URI): void {
		const model = this.chatService.getSession(sessionUri);

		interface DetailItem { label: string; value: string }
		const details: DetailItem[] = [];

		// Session type
		const sessionType = getChatSessionType(sessionUri);
		const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
		const sessionTypeName = contribution?.displayName || (sessionType === 'local'
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
			} else if (timing.lastRequestStarted) {
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

	private getLocationLabel(location: ChatAgentLocation): string {
		switch (location) {
			case ChatAgentLocation.Chat: return localize('chatDebug.location.chat', "Chat Panel");
			case ChatAgentLocation.Terminal: return localize('chatDebug.location.terminal', "Terminal");
			case ChatAgentLocation.Notebook: return localize('chatDebug.location.notebook', "Notebook");
			case ChatAgentLocation.EditorInline: return localize('chatDebug.location.editor', "Editor Inline");
			default: return String(location);
		}
	}

	private renderDerivedOverview(events: readonly IChatDebugEvent[]): void {
		const modelTurns = events.filter(e => e.kind === 'modelTurn');
		const toolCalls = events.filter(e => e.kind === 'toolCall');
		const errors = events.filter(e =>
			(e.kind === 'generic' && e.level === ChatDebugLogLevel.Error) ||
			(e.kind === 'toolCall' && e.result === 'error')
		);

		const totalTokens = modelTurns.reduce((sum, e) => sum + (e.totalTokens ?? 0), 0);
		const totalCost = modelTurns.reduce((sum, e) => sum + (e.cost ?? 0), 0);

		interface OverviewMetric { label: string; value: string }
		const metrics: OverviewMetric[] = [];

		if (modelTurns.length > 0) {
			metrics.push({ label: localize('chatDebug.metric.modelTurns', "Model Turns"), value: String(modelTurns.length) });
		}
		if (toolCalls.length > 0) {
			metrics.push({ label: localize('chatDebug.metric.toolCalls', "Tool Calls"), value: String(toolCalls.length) });
		}
		if (totalTokens > 0) {
			metrics.push({ label: localize('chatDebug.metric.totalTokens', "Total Tokens"), value: totalTokens.toLocaleString() });
		}
		if (totalCost > 0) {
			metrics.push({ label: localize('chatDebug.metric.totalCost', "Total Cost"), value: `$${totalCost.toFixed(4)}` });
		}
		if (errors.length > 0) {
			metrics.push({ label: localize('chatDebug.metric.errors', "Errors"), value: String(errors.length) });
		}
		metrics.push({ label: localize('chatDebug.metric.totalEvents', "Total Events"), value: String(events.length) });

		if (metrics.length > 0) {
			const metricsSection = DOM.append(this.content, $('.chat-debug-overview-section'));
			DOM.append(metricsSection, $('h3.chat-debug-overview-section-label', undefined, localize('chatDebug.summary', "Summary")));

			const metricsRow = DOM.append(metricsSection, $('.chat-debug-overview-metrics'));
			for (const metric of metrics) {
				const card = DOM.append(metricsRow, $('.chat-debug-overview-metric-card'));
				DOM.append(card, $('div.chat-debug-overview-metric-label', undefined, metric.label));
				DOM.append(card, $('div.chat-debug-overview-metric-value', undefined, metric.value));
			}
		}

		// Explore actions
		const actionsSection = DOM.append(this.content, $('.chat-debug-overview-section'));
		DOM.append(actionsSection, $('h3.chat-debug-overview-section-label', undefined, localize('chatDebug.exploreTraceData', "Explore Trace Data")));

		const row = DOM.append(actionsSection, $('.chat-debug-overview-actions'));

		const viewLogsBtn = DOM.append(row, $('button.chat-debug-overview-action-button'));
		DOM.append(viewLogsBtn, $(`span${ThemeIcon.asCSSSelector(Codicon.listFlat)}`));
		viewLogsBtn.append(localize('chatDebug.viewLogs', "View Logs"));
		this.loadDisposables.add(DOM.addDisposableListener(viewLogsBtn, DOM.EventType.CLICK, () => {
			this._onNavigate.fire(OverviewNavigation.Logs);
		}));

		const flowChartBtn = DOM.append(row, $('button.chat-debug-overview-action-button'));
		DOM.append(flowChartBtn, $(`span${ThemeIcon.asCSSSelector(Codicon.typeHierarchy)}`));
		flowChartBtn.append(localize('chatDebug.agentFlowChart', "Agent Flow Chart"));
		this.loadDisposables.add(DOM.addDisposableListener(flowChartBtn, DOM.EventType.CLICK, () => {
			this._onNavigate.fire(OverviewNavigation.FlowChart);
		}));

	}
}
