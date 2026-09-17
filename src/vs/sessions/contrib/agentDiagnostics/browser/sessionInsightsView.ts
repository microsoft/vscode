/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../base/common/numbers.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AgentHostHookTypeAttribute } from '../../../../platform/agentHost/common/otel/agentHostOTelService.js';
import { getReasoningEffortLabel } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { CopilotChatAttr, CopilotCliSdkAttr, GenAiOperationName } from '../../../../platform/otel/common/genAiAttributes.js';
import { IOTelDiagnosticsMessage, IOTelDiagnosticsSpan, IOTelDiagnosticsTrace } from '../../../../platform/otel/common/otelDiagnosticsService.js';
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
	readonly spanButtons: Map<string, HTMLElement>;
}

interface ITurnNode {
	readonly element: HTMLElement;
	readonly store: DisposableStore;
	readonly header: Button;
	readonly body: HTMLElement;
	readonly model: HTMLElement;
	readonly renderStore: DisposableStore;
	readonly traces: HTMLElement;
	readonly debugEvents: HTMLElement;
	readonly traceNodes: Map<string, ITraceNode>;
}

export interface ISessionDiagnosticsTroubleshootRequest {
	readonly id: string;
	readonly label: string;
	readonly query: string;
	readonly content: string;
	readonly sessionResource: URI;
	readonly sourceChatResource: URI;
}

export class SessionInsightsView extends Disposable {

	private readonly _onDidRequestTroubleshoot = this._register(new Emitter<ISessionDiagnosticsTroubleshootRequest>());
	readonly onDidRequestTroubleshoot = this._onDidRequestTroubleshoot.event;

	readonly element: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly emptyState: HTMLElement;
	private readonly overview: HTMLElement;
	private readonly turnsContainer: HTMLElement;
	private readonly activityContainer: HTMLElement;
	private readonly turnNodes = new Map<string, ITurnNode>();
	private readonly expandedSpanIds = new Set<string>();
	private readonly expandedMessageIds = new Set<string>();
	private readonly expandedTurnBySession = new Map<string, string | null>();
	private readonly overviewDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		private readonly model: SessionDiagnosticsModel,
		@IHoverService private readonly hoverService: IHoverService,
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

	revealTrace(traceId: string, spanId: string | undefined, timestamp: number): boolean {
		const state = this.model.state;
		if (!state) {
			return false;
		}
		const matchingTurns = state.turns.filter(turn => turn.otelTraces.some(trace => trace.traceId === traceId));
		const turn = matchingTurns.find(candidate => timestamp >= candidate.startTime && timestamp <= candidate.endTime) ?? matchingTurns[0];
		if (!turn) {
			return false;
		}
		const sessionKey = `${state.sessionResource.toString()}\0${state.chatResource.toString()}`;
		this.expandedTurnBySession.set(sessionKey, turn.id);
		this.model.expandTrace(traceId);
		if (spanId) {
			this.expandedSpanIds.add(spanId);
		}
		this.render();
		const turnNode = this.turnNodes.get(turn.id);
		const traceNode = turnNode?.traceNodes.get(traceId);
		const target = spanId
			? traceNode?.spanButtons.get(spanId)
			: traceNode?.button.element;
		const fallback = traceNode?.button.element ?? turnNode?.header.element;
		(target ?? fallback)?.scrollIntoView({ block: 'center' });
		(target ?? fallback)?.focus();
		return true;
	}

	revealDebugEvent(debugEventId: string, parentDebugEventId: string | undefined, timestamp: number, hookType: string | undefined): boolean {
		const state = this.model.state;
		if (!state) {
			return false;
		}
		const turn = state.turns.find(candidate => candidate.debugEvents.some(event =>
			event.id === debugEventId || (parentDebugEventId !== undefined && event.id === parentDebugEventId)
		)) ?? state.turns.find(candidate => timestamp >= candidate.startTime && timestamp <= candidate.endTime);
		if (!turn) {
			return false;
		}
		const sessionKey = `${state.sessionResource.toString()}\0${state.chatResource.toString()}`;
		this.expandedTurnBySession.set(sessionKey, turn.id);
		const hookSpan = this.findHookSpan(turn, timestamp, hookType);
		if (hookSpan) {
			this.model.expandTrace(hookSpan.traceId);
			this.expandedSpanIds.add(hookSpan.spanId);
		}
		this.render();
		const turnNode = this.turnNodes.get(turn.id);
		const traceNode = hookSpan ? turnNode?.traceNodes.get(hookSpan.traceId) : undefined;
		const target = hookSpan
			? traceNode?.spanButtons.get(hookSpan.spanId)
			: turnNode?.header.element;
		target?.scrollIntoView({ block: 'center' });
		target?.focus();
		return true;
	}

	private findHookSpan(turn: ISessionDiagnosticsTurn, timestamp: number, hookType: string | undefined): IOTelDiagnosticsSpan | undefined {
		const candidates = turn.otelTraces.flatMap(trace => this.model.getTraceDetails(trace.traceId)?.spans ?? [])
			.filter(span => span.operationName === GenAiOperationName.EXECUTE_HOOK || span.name.toLowerCase().includes('hook'));
		const normalizedHookType = hookType ? normalizeHookType(hookType) : undefined;
		const matchingType = normalizedHookType
			? candidates.filter(span => {
				const spanHookType = span.attributes[AgentHostHookTypeAttribute] ?? span.attributes[CopilotChatAttr.HOOK_TYPE] ?? span.attributes[CopilotCliSdkAttr.HOOK_TYPE];
				return spanHookType && normalizeHookType(spanHookType) === normalizedHookType;
			})
			: [];
		return (matchingType.length > 0 ? matchingType : candidates)
			.sort((a, b) => distanceFromSpan(timestamp, a) - distanceFromSpan(timestamp, b))[0];
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
		this.overviewDisposables.clear();
		DOM.clearNode(this.overview);
		const button = this.overviewDisposables.add(new Button(this.overview, { ...defaultButtonStyles, secondary: true }));
		button.element.classList.add('agent-diagnostics-troubleshoot-button', 'agent-diagnostics-overview-troubleshoot');
		button.label = localize('agentDiagnostics.troubleshootSession', "Troubleshoot Session");
		this.overviewDisposables.add(button.onDidClick(() => this.requestSessionTroubleshoot()));
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
		const header = store.add(new Button(element, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		header.element.classList.add('agent-diagnostics-turn-header');
		store.add(header.onDidClick(() => this.toggleTurn(id)));
		const body = DOM.append(element, DOM.$('.agent-diagnostics-turn-body'));
		const model = DOM.append(body, DOM.$('.agent-diagnostics-model-context'));
		const renderStore = store.add(new DisposableStore());
		const otelSection = DOM.append(body, DOM.$('.agent-diagnostics-data-section.agent-diagnostics-otel-section'));
		const otelHeading = DOM.append(otelSection, DOM.$('h3.agent-diagnostics-section-heading'));
		otelHeading.textContent = localize('agentDiagnostics.openTelemetry', "OpenTelemetry");
		const traces = DOM.append(otelSection, DOM.$('.agent-diagnostics-traces'));
		const debugSection = DOM.append(body, DOM.$('.agent-diagnostics-data-section.agent-diagnostics-debug-section'));
		const debugHeading = DOM.append(debugSection, DOM.$('h3.agent-diagnostics-section-heading'));
		debugHeading.textContent = localize('agentDiagnostics.agentDebug', "Agent Debug");
		const debugEvents = DOM.append(debugSection, DOM.$('.agent-diagnostics-turn-debug-events'));
		return { element, store, header, body, model, renderStore, traces, debugEvents, traceNodes: new Map() };
	}

	private updateTurnNode(node: ITurnNode, turn: ISessionDiagnosticsTurn, index: number): void {
		const expanded = this.isTurnExpanded(turn.id);
		node.element.classList.toggle('expanded', expanded);
		const label = localize('agentDiagnostics.turnHeader', "Turn {0}: {1}", index + 1, turn.prompt);
		node.header.label = `$(${expanded ? Codicon.chevronDown.id : Codicon.chevronRight.id}) ${label}`;
		node.header.setAriaLabel(label);
		node.header.element.setAttribute('aria-expanded', String(expanded));
		node.body.toggleAttribute('hidden', !expanded);
		if (!expanded) {
			return;
		}

		node.renderStore.clear();
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
		const header = DOM.append(element, DOM.$('.agent-diagnostics-trace-header'));
		const button = store.add(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		button.element.classList.add('agent-diagnostics-trace-button');
		const detail = DOM.append(element, DOM.$('.agent-diagnostics-trace-detail'));
		const detailStore = store.add(new DisposableStore());
		store.add(button.onDidClick(() => this.model.toggleTraceExpanded(traceId)));
		return { element, button, detail, store, detailStore, spanButtons: new Map() };
	}

	private updateTraceNode(node: ITraceNode, turn: ISessionDiagnosticsTurn, trace: IOTelDiagnosticsTrace): void {
		const expanded = this.model.isTraceExpanded(trace.traceId);
		const label = localize('agentDiagnostics.traceLabel', "{0} · {1} · {2} spans", trace.name, formatDuration(trace.duration), trace.spanCount);
		node.button.label = `$(${expanded ? Codicon.chevronDown.id : Codicon.chevronRight.id}) ${label}`;
		node.button.setAriaLabel(label);
		node.button.element.setAttribute('aria-expanded', String(expanded));
		node.element.classList.toggle('expanded', expanded);
		node.spanButtons.clear();
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
			this.renderConversationMessage(node, conversation, turn, trace, message);
		}

		const waterfall = DOM.append(node.detail, DOM.$('.agent-diagnostics-waterfall'));
		const waterfallHeading = DOM.append(waterfall, DOM.$('h4.agent-diagnostics-detail-heading'));
		waterfallHeading.textContent = localize('agentDiagnostics.waterfall', "Waterfall");
		for (const span of details.spans.filter(span => span.startTime >= turn.startTime && span.startTime < turn.endTime)) {
			this.renderSpan(node, waterfall, trace, span);
		}
	}

	private renderConversationMessage(traceNode: ITraceNode, parent: HTMLElement, turn: ISessionDiagnosticsTurn, trace: IOTelDiagnosticsTrace, message: IOTelDiagnosticsMessage): void {
		const row = DOM.append(parent, DOM.$('.agent-diagnostics-message'));
		const header = DOM.append(row, DOM.$('.agent-diagnostics-message-header'));
		const button = traceNode.detailStore.add(new Button(header, { ...defaultButtonStyles, secondary: true }));
		button.element.classList.add('agent-diagnostics-message-pill');
		const expanded = this.expandedMessageIds.has(message.id);
		const roleLabel = message.toolName
			? localize('agentDiagnostics.messageRole.namedTool', "Tool: {0}", message.toolName)
			: formatMessageRole(message.role);
		button.label = localize('agentDiagnostics.messagePill', "{0} {1}", roleLabel, expanded ? '-' : '+');
		button.element.setAttribute('aria-expanded', String(expanded));
		traceNode.detailStore.add(button.onDidClick(() => {
			if (this.expandedMessageIds.has(message.id)) {
				this.expandedMessageIds.delete(message.id);
			} else {
				this.expandedMessageIds.add(message.id);
			}
			this.updateTraceNode(traceNode, turn, trace);
			this.scrollable.scanDomNode();
		}));
		if (expanded) {
			if (message.role === 'tool' && message.toolName) {
				this.renderToolMessageContent(row, message);
			} else {
				const content = DOM.append(row, DOM.$('.agent-diagnostics-message-content'));
				content.textContent = message.content;
			}
		}
	}

	private renderToolMessageContent(parent: HTMLElement, message: IOTelDiagnosticsMessage): void {
		const content = DOM.append(parent, DOM.$('.agent-diagnostics-message-content.agent-diagnostics-tool-message-content'));
		if (message.toolDescription || message.toolStatus || message.toolDuration !== undefined || message.toolCallId) {
			const metadata = DOM.append(content, DOM.$('.agent-diagnostics-tool-metadata'));
			if (message.toolDescription) {
				const descriptionLabel = DOM.append(metadata, DOM.$('.agent-diagnostics-tool-field-label'));
				descriptionLabel.textContent = localize('agentDiagnostics.toolDescription', "Description");
				const description = DOM.append(metadata, DOM.$('.agent-diagnostics-tool-description'));
				description.textContent = message.toolDescription;
			}
			const facts = DOM.append(metadata, DOM.$('.agent-diagnostics-tool-facts'));
			if (message.toolStatus) {
				const status = DOM.append(facts, DOM.$('.agent-diagnostics-tool-fact'));
				status.textContent = message.toolStatus === 'success'
					? localize('agentDiagnostics.toolStatus.success', "Succeeded")
					: localize('agentDiagnostics.toolStatus.error', "Failed");
			}
			if (message.toolDuration !== undefined) {
				const duration = DOM.append(facts, DOM.$('.agent-diagnostics-tool-fact'));
				duration.textContent = formatDuration(message.toolDuration);
			}
			if (message.toolCallId) {
				const callId = DOM.append(facts, DOM.$('.agent-diagnostics-tool-fact'));
				callId.textContent = localize('agentDiagnostics.toolCallId', "Call ID: {0}", message.toolCallId);
			}
		}
		this.renderToolField(content, localize('agentDiagnostics.toolInput', "Input"), message.toolInput);
		this.renderToolField(content, localize('agentDiagnostics.toolOutput', "Output"), message.toolOutput ?? message.content);
	}

	private renderToolField(parent: HTMLElement, label: string, value: string | undefined): void {
		if (!value) {
			return;
		}
		const field = DOM.append(parent, DOM.$('.agent-diagnostics-tool-field'));
		const heading = DOM.append(field, DOM.$('.agent-diagnostics-tool-field-label'));
		heading.textContent = label;
		const body = DOM.append(field, DOM.$('pre.agent-diagnostics-tool-field-value'));
		body.textContent = value;
	}

	private renderSpan(traceNode: ITraceNode, parent: HTMLElement, trace: IOTelDiagnosticsTrace, span: IOTelDiagnosticsSpan): void {
		const row = DOM.append(parent, DOM.$('.agent-diagnostics-span'));
		row.dataset.spanId = span.spanId;
		const button = traceNode.detailStore.add(new Button(row, {
			...defaultButtonStyles,
			secondary: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryBorder: 'transparent',
			buttonSecondaryForeground: 'var(--vscode-foreground)',
			buttonSecondaryHoverBackground: 'var(--vscode-list-hoverBackground)',
		}));
		button.element.classList.add('agent-diagnostics-span-button');
		traceNode.spanButtons.set(span.spanId, button.element);
		const label = localize('agentDiagnostics.spanLabel', "{0} · {1}", span.name, formatDuration(span.duration));
		button.label = label;
		button.setAriaLabel(label);
		traceNode.detailStore.add(this.hoverService.setupDelayedHover(button.element, { content: label }));
		const expanded = this.expandedSpanIds.has(span.spanId);
		button.element.setAttribute('aria-expanded', String(expanded));
		const track = DOM.append(row, DOM.$('.agent-diagnostics-span-track'));
		track.setAttribute('aria-hidden', 'true');
		const bar = DOM.append(track, DOM.$('.agent-diagnostics-span-bar'));
		const traceDuration = Math.max(1, trace.duration);
		const startRatio = Math.min(1, Math.max(0, (span.startTime - trace.startTime) / traceDuration));
		const durationRatio = Math.min(1 - startRatio, Math.max(0, span.duration / traceDuration));
		bar.style.left = `${startRatio * 100}%`;
		bar.style.width = `${durationRatio * 100}%`;
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

	private requestSessionTroubleshoot(): void {
		const state = this.model.state;
		if (!state) {
			return;
		}
		this._onDidRequestTroubleshoot.fire({
			id: `session:${state.sessionResource.toString()}`,
			label: localize('agentDiagnostics.context.session', "Session Diagnostics"),
			query: localize('agentDiagnostics.query.session', "Troubleshoot the attached agent session. Explain what it was asked to do, what happened, any failures or bottlenecks, and the best next diagnostic step."),
			sessionResource: state.sessionResource,
			sourceChatResource: state.chatResource,
			content: JSON.stringify({
				sessionUri: state.chatResource.with({ fragment: '' }).toString(),
				summary: state.summary,
				turns: state.turns.map(turn => ({
					id: turn.id,
					prompt: turn.prompt,
					model: turn.resolvedModel,
					thinkingLevel: turn.thinkingLevel,
					context: turn.context,
					traceIds: turn.otelTraces.map(trace => trace.traceId),
					debugEventIds: turn.debugEvents.map(event => event.id).filter(id => !!id),
				})),
			}, undefined, 2),
		});
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

function formatMessageRole(role: string): string {
	switch (role) {
		case 'user':
			return localize('agentDiagnostics.messageRole.user', "User");
		case 'assistant':
			return localize('agentDiagnostics.messageRole.assistant', "Assistant");
		case 'tool':
			return localize('agentDiagnostics.messageRole.tool', "Tool");
		case 'system':
			return localize('agentDiagnostics.messageRole.system', "System");
		default:
			return role.charAt(0).toUpperCase() + role.slice(1);
	}
}

function normalizeHookType(value: string): string {
	return value.replace(/[^a-z]/gi, '').toLowerCase();
}

function distanceFromSpan(timestamp: number, span: IOTelDiagnosticsSpan): number {
	if (timestamp < span.startTime) {
		return span.startTime - timestamp;
	}
	if (timestamp > span.endTime) {
		return timestamp - span.endTime;
	}
	return 0;
}
