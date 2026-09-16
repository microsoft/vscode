/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../base/common/numbers.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { localize } from '../../../../nls.js';
import { getReasoningEffortLabel } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { IOTelDiagnosticsSpan, IOTelDiagnosticsTrace } from '../../../../platform/otel/common/otelDiagnosticsService.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getEventCreatedText, getEventDetailsText, getEventNameText } from '../../../../workbench/contrib/chat/browser/chatDebug/chatDebugEventList.js';
import { IChatDebugEvent } from '../../../../workbench/contrib/chat/common/chatDebugService.js';
import { ISessionDiagnosticsTurn, SessionDiagnosticsModel } from './sessionDiagnosticsModel.js';

interface ITraceNode {
	readonly element: HTMLElement;
	readonly button: Button;
	readonly detail: HTMLElement;
	readonly store: DisposableStore;
	readonly detailStore: DisposableStore;
}

interface ITurnNode {
	readonly element: HTMLElement;
	readonly store: DisposableStore;
	readonly header: Button;
	readonly body: HTMLElement;
	readonly model: HTMLElement;
	readonly traces: HTMLElement;
	readonly debugEvents: HTMLElement;
	readonly traceNodes: Map<string, ITraceNode>;
}

export class SessionInsightsView extends Disposable {

	readonly element: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly emptyState: HTMLElement;
	private readonly overview: HTMLElement;
	private readonly turnsContainer: HTMLElement;
	private readonly activityContainer: HTMLElement;
	private readonly turnNodes = new Map<string, ITurnNode>();
	private readonly expandedSpanIds = new Set<string>();
	private readonly expandedTurnBySession = new Map<string, string | null>();

	constructor(
		parent: HTMLElement,
		private readonly model: SessionDiagnosticsModel,
	) {
		super();
		const scrollContent = DOM.$('.agent-diagnostics-insights-scroll');
		this.scrollable = this._register(new DomScrollableElement(scrollContent, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			consumeMouseWheelIfScrollbarIsNeeded: true,
		}));
		this.element = this.scrollable.getDomNode();
		this.element.classList.add('agent-diagnostics-insights');
		DOM.append(parent, this.element);
		const resizeObserver = this._register(new DOM.DisposableResizeObserver('SessionInsightsView.scrollable', () => this.scrollable.scanDomNode()));
		this._register(resizeObserver.observe(this.element));

		this.emptyState = DOM.append(scrollContent, DOM.$('.agent-diagnostics-empty-state'));
		this.overview = DOM.append(scrollContent, DOM.$('.agent-diagnostics-overview'));
		this.turnsContainer = DOM.append(scrollContent, DOM.$('.agent-diagnostics-turns'));
		this.activityContainer = DOM.append(scrollContent, DOM.$('.agent-diagnostics-activity'));

		this._register(this.model.onDidChange(() => this.render()));
		this.render();
	}

	layout(): void {
		const parent = this.scrollable.getDomNode().parentElement;
		if (parent) {
			this.scrollable.getDomNode().style.height = `${parent.clientHeight}px`;
		}
		this.scrollable.scanDomNode();
	}

	private render(): void {
		const state = this.model.state;
		if (!state) {
			this.renderEmpty(localize('agentDiagnostics.sessionInsightsPlaceholder', "Focused-session insights will appear here."));
			return;
		}
		if (state.error) {
			this.renderEmpty(localize('agentDiagnostics.sessionInsightsError', "Failed to load native OpenTelemetry diagnostics: {0}", state.error));
			return;
		}
		if (!state.summary) {
			this.renderEmpty(localize('agentDiagnostics.sessionInsightsEmpty', "No native OpenTelemetry data is available for the focused session."));
			return;
		}

		DOM.hide(this.emptyState);
		DOM.show(this.overview);
		DOM.show(this.turnsContainer);
		this.renderOverview(state.summary.turns, state.summary.inputTokens + state.summary.outputTokens, state.summary.duration);
		this.renderTurns(state.turns, `${state.sessionResource.toString()}\0${state.chatResource.toString()}`);
		this.renderActivity(state.sessionActivity);
		this.scrollable.scanDomNode();
	}

	private renderEmpty(message: string): void {
		DOM.clearNode(this.emptyState);
		const heading = DOM.append(this.emptyState, DOM.$('h2.agent-diagnostics-heading'));
		heading.textContent = localize('agentDiagnostics.sessionInsights', "Session Insights");
		const description = DOM.append(this.emptyState, DOM.$('p.agent-diagnostics-description'));
		description.textContent = message;
		DOM.show(this.emptyState);
		DOM.hide(this.overview);
		DOM.hide(this.turnsContainer);
		DOM.hide(this.activityContainer);
		this.scrollable.scanDomNode();
	}

	private renderOverview(turns: number, tokens: number, duration: number): void {
		DOM.clearNode(this.overview);
		this.renderStat(this.overview, localize('agentDiagnostics.overview.turns', "Turns"), String(turns));
		this.renderStat(this.overview, localize('agentDiagnostics.overview.tokens', "Tokens"), tokens.toLocaleString());
		this.renderStat(this.overview, localize('agentDiagnostics.overview.duration', "Duration"), formatDuration(duration));
	}

	private renderStat(parent: HTMLElement, label: string, value: string): void {
		const stat = DOM.append(parent, DOM.$('.agent-diagnostics-stat'));
		const valueElement = DOM.append(stat, DOM.$('.agent-diagnostics-stat-value'));
		valueElement.textContent = value;
		const labelElement = DOM.append(stat, DOM.$('.agent-diagnostics-stat-label'));
		labelElement.textContent = label;
	}

	private renderTurns(turns: readonly ISessionDiagnosticsTurn[], sessionKey: string): void {
		const activeIds = new Set(turns.map(turn => turn.id));
		const savedExpandedTurn = this.expandedTurnBySession.get(sessionKey);
		if (!this.expandedTurnBySession.has(sessionKey) || (savedExpandedTurn && !activeIds.has(savedExpandedTurn))) {
			this.expandedTurnBySession.set(sessionKey, turns.at(-1)?.id ?? null);
		}
		for (const [id, node] of this.turnNodes) {
			if (!activeIds.has(id)) {
				node.store.dispose();
				node.element.remove();
				this.turnNodes.delete(id);
			}
		}

		for (const [index, turn] of turns.entries()) {
			let node = this.turnNodes.get(turn.id);
			if (!node) {
				node = this.createTurnNode(turn.id);
				this.turnNodes.set(turn.id, node);
			}
			this.updateTurnNode(node, turn, index);
			this.turnsContainer.appendChild(node.element);
		}
	}

	private createTurnNode(id: string): ITurnNode {
		const store = new DisposableStore();
		const element = DOM.$('section.agent-diagnostics-turn');
		element.dataset.turnId = id;
		const header = store.add(new Button(element, { ...defaultButtonStyles, secondary: true }));
		header.element.classList.add('agent-diagnostics-turn-header');
		store.add(header.onDidClick(() => this.toggleTurn(id)));
		const body = DOM.append(element, DOM.$('.agent-diagnostics-turn-body'));
		const model = DOM.append(body, DOM.$('.agent-diagnostics-model-context'));
		const otelSection = DOM.append(body, DOM.$('.agent-diagnostics-data-section.agent-diagnostics-otel-section'));
		const otelHeading = DOM.append(otelSection, DOM.$('h3.agent-diagnostics-section-heading'));
		otelHeading.textContent = localize('agentDiagnostics.openTelemetry', "OpenTelemetry");
		const traces = DOM.append(otelSection, DOM.$('.agent-diagnostics-traces'));
		const debugSection = DOM.append(body, DOM.$('.agent-diagnostics-data-section.agent-diagnostics-debug-section'));
		const debugHeading = DOM.append(debugSection, DOM.$('h3.agent-diagnostics-section-heading'));
		debugHeading.textContent = localize('agentDiagnostics.agentDebug', "Agent Debug");
		const debugEvents = DOM.append(debugSection, DOM.$('.agent-diagnostics-turn-debug-events'));
		return { element, store, header, body, model, traces, debugEvents, traceNodes: new Map() };
	}

	private updateTurnNode(node: ITurnNode, turn: ISessionDiagnosticsTurn, index: number): void {
		const expanded = this.isTurnExpanded(turn.id);
		node.element.classList.toggle('expanded', expanded);
		node.header.label = localize('agentDiagnostics.turnHeader', "Turn {0}: {1}", index + 1, turn.prompt);
		node.header.icon = expanded ? Codicon.chevronDown : Codicon.chevronRight;
		node.header.element.setAttribute('aria-expanded', String(expanded));
		node.body.toggleAttribute('hidden', !expanded);
		if (!expanded) {
			return;
		}

		DOM.clearNode(node.model);
		if (turn.resolvedModel) {
			const model = DOM.append(node.model, DOM.$('.agent-diagnostics-model'));
			model.textContent = localize('agentDiagnostics.model', "Model: {0}", turn.resolvedModel);
		}
		if (turn.thinkingLevel) {
			const thinking = DOM.append(node.model, DOM.$('.agent-diagnostics-model'));
			thinking.textContent = localize('agentDiagnostics.thinkingLevel', "Thinking: {0}", getReasoningEffortLabel(turn.thinkingLevel));
		}
		if (turn.context !== undefined) {
			const context = DOM.append(node.model, DOM.$('.agent-diagnostics-model'));
			context.textContent = localize('agentDiagnostics.context', "Context: {0}", formatContext(turn.context));
		}
		node.model.toggleAttribute('hidden', node.model.childElementCount === 0);

		this.renderTraceNodes(node, turn);
		this.renderDebugEvents(node.debugEvents, turn.debugEvents);
	}

	private isTurnExpanded(turnId: string): boolean {
		const state = this.model.state;
		if (!state) {
			return false;
		}
		return this.expandedTurnBySession.get(`${state.sessionResource.toString()}\0${state.chatResource.toString()}`) === turnId;
	}

	private toggleTurn(turnId: string): void {
		const state = this.model.state;
		if (!state) {
			return;
		}
		const sessionKey = `${state.sessionResource.toString()}\0${state.chatResource.toString()}`;
		this.expandedTurnBySession.set(sessionKey, this.expandedTurnBySession.get(sessionKey) === turnId ? null : turnId);
		this.render();
	}

	private renderDebugEvents(container: HTMLElement, events: readonly IChatDebugEvent[]): void {
		DOM.clearNode(container);
		if (events.length === 0) {
			const empty = DOM.append(container, DOM.$('.agent-diagnostics-debug-events-empty'));
			empty.textContent = localize('agentDiagnostics.noDebugEvents', "No Agent Debug events");
			return;
		}
		for (const event of events) {
			const row = DOM.append(container, DOM.$('.agent-diagnostics-debug-event'));
			const created = DOM.append(row, DOM.$('.agent-diagnostics-debug-event-time'));
			created.textContent = getEventCreatedText(event);
			const name = DOM.append(row, DOM.$('.agent-diagnostics-debug-event-name'));
			name.textContent = getEventNameText(event);
			const details = DOM.append(row, DOM.$('.agent-diagnostics-debug-event-details'));
			details.textContent = getEventDetailsText(event);
		}
	}

	private renderTraceNodes(turnNode: ITurnNode, turn: ISessionDiagnosticsTurn): void {
		const traceIds = new Set(turn.otelTraces.map(trace => trace.traceId));
		for (const [traceId, traceNode] of turnNode.traceNodes) {
			if (!traceIds.has(traceId)) {
				traceNode.store.dispose();
				traceNode.element.remove();
				turnNode.traceNodes.delete(traceId);
			}
		}
		if (turn.otelTraces.length === 0) {
			DOM.clearNode(turnNode.traces);
			const empty = DOM.append(turnNode.traces, DOM.$('.agent-diagnostics-traces-empty'));
			empty.textContent = localize('agentDiagnostics.noResponseTraces', "No Agent response traces");
			return;
		}

		for (const trace of turn.otelTraces) {
			let node = turnNode.traceNodes.get(trace.traceId);
			if (!node) {
				node = this.createTraceNode(trace.traceId);
				turnNode.store.add(node.store);
				turnNode.traceNodes.set(trace.traceId, node);
			}
			this.updateTraceNode(node, turn, trace);
			turnNode.traces.appendChild(node.element);
		}
	}

	private createTraceNode(traceId: string): ITraceNode {
		const store = new DisposableStore();
		const element = DOM.$('.agent-diagnostics-trace');
		element.dataset.traceId = traceId;
		const button = store.add(new Button(element, { ...defaultButtonStyles, secondary: true }));
		button.element.classList.add('agent-diagnostics-trace-button');
		const detail = DOM.append(element, DOM.$('.agent-diagnostics-trace-detail'));
		const detailStore = store.add(new DisposableStore());
		store.add(button.onDidClick(() => this.model.toggleTraceExpanded(traceId)));
		return { element, button, detail, store, detailStore };
	}

	private updateTraceNode(node: ITraceNode, turn: ISessionDiagnosticsTurn, trace: IOTelDiagnosticsTrace): void {
		const expanded = this.model.isTraceExpanded(trace.traceId);
		node.button.label = localize('agentDiagnostics.traceLabel', "{0} · {1} · {2} spans", trace.name, formatDuration(trace.duration), trace.spanCount);
		node.button.element.setAttribute('aria-expanded', String(expanded));
		node.element.classList.toggle('expanded', expanded);
		if (expanded) {
			this.renderTraceDetail(node, turn, trace);
			DOM.show(node.detail);
		} else {
			node.detailStore.clear();
			DOM.clearNode(node.detail);
			DOM.hide(node.detail);
		}
	}

	private renderTraceDetail(node: ITraceNode, turn: ISessionDiagnosticsTurn, trace: IOTelDiagnosticsTrace): void {
		node.detailStore.clear();
		DOM.clearNode(node.detail);
		const details = this.model.getTraceDetails(trace.traceId);
		if (!details) {
			return;
		}

		const conversation = DOM.append(node.detail, DOM.$('.agent-diagnostics-conversation'));
		const conversationHeading = DOM.append(conversation, DOM.$('h4.agent-diagnostics-detail-heading'));
		conversationHeading.textContent = localize('agentDiagnostics.conversation', "Conversation");
		const messages = turn.otelMessages.length > 0 ? turn.otelMessages : [{
			id: turn.id,
			traceId: trace.traceId,
			spanId: '',
			role: 'user',
			content: turn.prompt,
			timestamp: turn.startTime,
		}];
		for (const message of messages) {
			const row = DOM.append(conversation, DOM.$('.agent-diagnostics-message'));
			const role = DOM.append(row, DOM.$('.agent-diagnostics-message-role'));
			role.textContent = message.role;
			const content = DOM.append(row, DOM.$('.agent-diagnostics-message-content'));
			content.textContent = message.content;
		}

		const waterfall = DOM.append(node.detail, DOM.$('.agent-diagnostics-waterfall'));
		const waterfallHeading = DOM.append(waterfall, DOM.$('h4.agent-diagnostics-detail-heading'));
		waterfallHeading.textContent = localize('agentDiagnostics.waterfall', "Waterfall");
		for (const span of details.spans) {
			this.renderSpan(node, waterfall, trace, span);
		}
	}

	private renderSpan(traceNode: ITraceNode, parent: HTMLElement, trace: IOTelDiagnosticsTrace, span: IOTelDiagnosticsSpan): void {
		const row = DOM.append(parent, DOM.$('.agent-diagnostics-span'));
		const button = traceNode.detailStore.add(new Button(row, { ...defaultButtonStyles, secondary: true }));
		button.element.classList.add('agent-diagnostics-span-button');
		button.label = localize('agentDiagnostics.spanLabel', "{0} · {1}", span.name, formatDuration(span.duration));
		const expanded = this.expandedSpanIds.has(span.spanId);
		button.element.setAttribute('aria-expanded', String(expanded));
		const track = DOM.append(row, DOM.$('.agent-diagnostics-span-track'));
		const bar = DOM.append(track, DOM.$('.agent-diagnostics-span-bar'));
		const traceDuration = Math.max(1, trace.duration);
		bar.style.left = `${Math.max(0, (span.startTime - trace.startTime) / traceDuration * 100)}%`;
		bar.style.width = `${Math.max(1, span.duration / traceDuration * 100)}%`;
		traceNode.detailStore.add(button.onDidClick(() => {
			if (this.expandedSpanIds.has(span.spanId)) {
				this.expandedSpanIds.delete(span.spanId);
			} else {
				this.expandedSpanIds.add(span.spanId);
			}
			const state = this.model.state;
			const turn = state?.turns.find(candidate => candidate.otelTraces.some(candidateTrace => candidateTrace.traceId === trace.traceId));
			if (turn) {
				this.updateTraceNode(traceNode, turn, trace);
				this.scrollable.scanDomNode();
			}
		}));
		if (expanded) {
			const detail = DOM.append(row, DOM.$('pre.agent-diagnostics-span-detail'));
			detail.textContent = JSON.stringify({
				operation: span.operationName,
				provider: span.providerName,
				agent: span.agentName,
				requestModel: span.requestModel,
				responseModel: span.responseModel,
				tool: span.toolName,
				status: span.statusMessage ?? span.statusCode,
				attributes: span.attributes,
			}, undefined, 2);
		}
	}

	private renderActivity(activity: readonly { readonly id: string; readonly timestamp: number; readonly name: string; readonly body: string | undefined; readonly severity: 'info' | 'error' }[]): void {
		DOM.clearNode(this.activityContainer);
		if (activity.length === 0) {
			DOM.hide(this.activityContainer);
			return;
		}
		DOM.show(this.activityContainer);
		const heading = DOM.append(this.activityContainer, DOM.$('h3.agent-diagnostics-section-heading'));
		heading.textContent = localize('agentDiagnostics.sessionActivity', "Session Activity");
		for (const item of activity) {
			const row = DOM.append(this.activityContainer, DOM.$('.agent-diagnostics-activity-row'));
			row.classList.toggle('error', item.severity === 'error');
			const timestamp = DOM.append(row, DOM.$('time.agent-diagnostics-activity-time'));
			timestamp.setAttribute('datetime', new Date(item.timestamp).toISOString());
			timestamp.textContent = new Date(item.timestamp).toLocaleTimeString();
			const name = DOM.append(row, DOM.$('.agent-diagnostics-activity-name'));
			name.textContent = item.name;
			if (item.body) {
				const body = DOM.append(row, DOM.$('.agent-diagnostics-activity-body'));
				body.textContent = item.body;
			}
		}
	}

	override dispose(): void {
		for (const node of this.turnNodes.values()) {
			node.store.dispose();
		}
		this.turnNodes.clear();
		super.dispose();
	}
}

function formatDuration(duration: number): string {
	return duration >= 1000
		? localize('agentDiagnostics.durationSeconds', "{0}s", (duration / 1000).toFixed(1))
		: localize('agentDiagnostics.durationMilliseconds', "{0}ms", Math.round(duration));
}

function formatContext(context: string | number): string {
	if (typeof context === 'number') {
		return formatTokenCount(context);
	}
	if (context === 'long_context') {
		return localize('agentDiagnostics.contextLong', "Long");
	}
	if (context === 'default') {
		return localize('agentDiagnostics.contextDefault', "Default");
	}
	return context;
}
