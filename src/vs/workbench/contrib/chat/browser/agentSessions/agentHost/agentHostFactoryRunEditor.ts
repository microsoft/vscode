/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentHostFactoryRun.css';

import * as DOM from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { raceTimeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../../base/common/date.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { defaultGenerator } from '../../../../../../base/common/idGenerator.js';
import { DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, observableSignalFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ISessionFactoryRun, ISessionFactoryRunAgent, ISessionFactoryRunPhase, isSessionFactoryRunTerminal, readSessionFactoryRuns, SessionFactoryRunPhaseStatus, SessionFactoryRunStatus } from '../../../../../../platform/agentHost/common/sessionFactoryRuns.js';
import { observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { buildSubagentChatUri, SessionState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../../services/editor/common/editorGroupsService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from '../../../common/constants.js';
import type { IOpenSubagentChatContext } from '../../widget/chatContentParts/chatSubagentOpenChat.js';
import { AgentHostFactoryRunEditorInput } from './agentHostFactoryRunEditorInput.js';
import { formatFactoryCredits, formatFactoryDuration, getFactoryRunPhasePresentation, getFactoryRunStatusIcon, getFactoryRunStatusLabel, selectDefaultFactoryRunPhase } from './agentHostFactoryRunPresentation.js';

const $ = DOM.$;

/**
 * Shows one Agent Factory run: its outcome, resource usage against the
 * approved limits, declared phases, the agents each phase spawned, and the
 * narrator progress. Follows the owning session's live state so a running
 * factory updates in place.
 */
export class AgentHostFactoryRunEditor extends EditorPane {

	static readonly ID = AgentHostFactoryRunEditorInput.ID;

	private container: HTMLElement | undefined;
	private readonly inputDisposables = this._register(new MutableDisposable<DisposableStore>());
	/** Undefined follows execution, null collapses all rows, and an id pins inspection. */
	private readonly selectedPhaseId = observableValue<string | null | undefined>(this, undefined);
	private readonly phaseDetailId = defaultGenerator.nextId();
	private readonly focusTargets = new Map<string, HTMLElement>();
	private readonly detailsElements = new Map<string, HTMLDetailsElement>();
	private readonly expandedDetails = new Set<string>();

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(AgentHostFactoryRunEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = DOM.append(parent, $('.agent-host-factory-run-editor'));
		this.container.tabIndex = 0;
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!(input instanceof AgentHostFactoryRunEditorInput) || !this.container) {
			return;
		}
		const disposables = new DisposableStore();
		this.inputDisposables.value = disposables;
		this.selectedPhaseId.set(undefined, undefined);
		this.detailsElements.clear();
		this.expandedDetails.clear();

		const resolutionChanged = observableSignalFromEvent(this, this.connectionsService.onDidChangeSessionResolution);
		const resolution = derived(this, reader => {
			resolutionChanged.read(reader);
			return this.connectionsService.resolveSessionResource(input.sessionResource);
		});
		const sessionState = derived(this, reader => {
			const current = resolution.read(reader);
			if (!current) {
				return constObservable<SessionState | undefined>(undefined);
			}
			const subscription = reader.store.add(current.connection.getSubscription(StateComponents.Session, current.backendSession, 'AgentHostFactoryRunEditor'));
			return observableFromSubscription(this, subscription.object);
		});
		// Re-render only when the run itself changed; other session activity is noise here.
		const run = derivedOpts<ISessionFactoryRun | undefined>({
			owner: this,
			equalsFn: (first, second) => first === second || (!!first && !!second
				&& first.revision === second.revision
				&& first.status === second.status
				&& first.updatedAt === second.updatedAt
				&& first.liveAgentCount === second.liveAgentCount
				&& first.usage.activeMs === second.usage.activeMs
				&& first.progress.length === second.progress.length
				&& first.agents.length === second.agents.length),
		}, reader => readSessionFactoryRuns(sessionState.read(reader).read(reader)?._meta).find(candidate => candidate.runId === input.runId));
		// Factory agents run as background subagents, so the host owns a chat for
		// each one at the address a `Task` subagent's would use. Opening one that the
		// session does not list yet (after a host restart) makes the host restore
		// it from the event log, so every agent with a tool-call id is openable.
		const agentChats = derivedOpts<ReadonlyMap<string, string>>({ owner: this, equalsFn: mapsEqual }, reader => {
			const current = resolution.read(reader);
			const currentRun = run.read(reader);
			return current && currentRun ? resolveFactoryRunAgentChats(currentRun, current.backendSession) : new Map();
		});

		const container = this.container;
		disposables.add(autorun(reader => {
			const current = run.read(reader);
			const selected = this.selectedPhaseId.read(reader);
			const chats = agentChats.read(reader);
			const currentResolution = resolution.read(reader);
			const activeElement = container.ownerDocument.activeElement;
			const focusId = DOM.isHTMLElement(activeElement) && container.contains(activeElement) ? activeElement.dataset.factoryFocusId : undefined;
			const scrollTop = container.scrollTop;
			for (const [id, details] of this.detailsElements) {
				if (details.open) {
					this.expandedDetails.add(id);
				} else {
					this.expandedDetails.delete(id);
				}
			}
			this.detailsElements.clear();
			this.focusTargets.clear();
			DOM.clearNode(container);
			if (!current) {
				this.renderUnavailable(container, input);
				return;
			}
			this.renderRun(container, current, selected, { sessionResource: input.sessionResource, resolution: currentResolution, agentChats: chats, store: reader.store });
			if (focusId) {
				const target = this.focusTargets.get(focusId);
				(target ?? container).focus({ preventScroll: true });
			}
			container.scrollTop = scrollTop;
		}));
	}

	override clearInput(): void {
		this.inputDisposables.clear();
		this.focusTargets.clear();
		this.detailsElements.clear();
		if (this.container) {
			DOM.clearNode(this.container);
		}
		super.clearInput();
	}

	override focus(): void {
		super.focus();
		this.container?.focus();
	}

	override layout(): void {
		// The table adapts to the editor width without moving the user's viewport.
	}

	private trackFocus(element: HTMLElement, id: string): void {
		element.dataset.factoryFocusId = id;
		this.focusTargets.set(id, element);
	}

	private renderUnavailable(container: HTMLElement, input: AgentHostFactoryRunEditorInput): void {
		const empty = DOM.append(container, $('.agent-host-factory-run-empty'));
		DOM.append(empty, $('h2.agent-host-factory-run-title', undefined, input.factoryName));
		DOM.append(empty, $('p', undefined, localize('agentHostFactoryRun.unavailable', "This factory run is not available. The session may not be connected, or the run may have been removed.")));
	}

	private renderRun(container: HTMLElement, run: ISessionFactoryRun, selectedPhaseId: string | null | undefined, context: IFactoryRunRenderContext): void {
		this.renderHeader(container, run);
		this.renderInterruption(container, run);
		this.renderPhases(container, run, selectedPhaseId, context);
		this.renderOutcome(container, run);
		this.renderRunDetails(container, run);
	}

	private renderHeader(container: HTMLElement, run: ISessionFactoryRun): void {
		const header = DOM.append(container, $('.agent-host-factory-run-header'));
		const titleRow = DOM.append(header, $('.agent-host-factory-run-title-row'));
		DOM.append(titleRow, $('h1.agent-host-factory-run-title', undefined, run.factoryName));
		const status = DOM.append(titleRow, $(`.agent-host-factory-run-status.status-${run.status}`));
		DOM.append(status, $('span', undefined, getFactoryRunStatusLabel(run.status)));
		const reached = run.phases.filter(phase => phase.status === SessionFactoryRunPhaseStatus.Active || phase.status === SessionFactoryRunPhaseStatus.Completed).length;
		const phases = localize('agentHostFactoryRun.phasesReached', "{0} of {1} phases reached", reached, run.phases.length);
		const agents = run.totalSpawnedAgentCount === 1
			? localize('agentHostFactoryRun.oneAgent', "1 agent")
			: localize('agentHostFactoryRun.agentCount', "{0} agents", run.totalSpawnedAgentCount);
		DOM.append(header, $('p.agent-host-factory-run-summary', undefined, localize('agentHostFactoryRun.executionSummary', "{0} · {1} · {2} · {3} credits · {4}", phases, agents, formatFactoryDuration(run.usage.activeMs), formatFactoryCredits(run.usage.aiCredits), fromNow(run.completedAt ?? run.updatedAt, true))));
	}

	private renderInterruption(container: HTMLElement, run: ISessionFactoryRun): void {
		const outcome = run.outcome;
		const interrupted = run.status === SessionFactoryRunStatus.Halted || run.status === SessionFactoryRunStatus.Cancelled || run.status === SessionFactoryRunStatus.Error;
		if (!interrupted && !outcome?.error && !outcome?.reason && !outcome?.limitReached) {
			return;
		}
		const banner = DOM.append(container, $('.agent-host-factory-run-interruption'));
		DOM.append(banner, renderIcon(getFactoryRunStatusIcon(interrupted ? run.status : SessionFactoryRunStatus.Error))).setAttribute('aria-hidden', 'true');
		const body = DOM.append(banner, $('.agent-host-factory-run-interruption-body'));
		const reason = outcome?.error ?? outcome?.reason ?? (run.status === SessionFactoryRunStatus.Halted
			? localize('agentHostFactoryRun.halted', "Run halted")
			: run.status === SessionFactoryRunStatus.Cancelled
				? localize('agentHostFactoryRun.cancelled', "Run cancelled")
				: localize('agentHostFactoryRun.stopped', "Run stopped"));
		DOM.append(body, $('p.agent-host-factory-run-outcome-message', undefined, reason));
		if (outcome?.reason && outcome.reason !== reason) {
			DOM.append(body, $('p.agent-host-factory-run-outcome-note', undefined, outcome.reason));
		}
		if (interrupted) {
			const cancelledCount = run.agents.filter(agent => agent.status === 'cancelled').length;
			const unreachedCount = run.phases.filter(phase => phase.status === SessionFactoryRunPhaseStatus.Pending).length;
			const cancelled = cancelledCount === 1
				? localize('agentHostFactoryRun.oneCancelled', "1 agent cancelled")
				: localize('agentHostFactoryRun.cancelledCount', "{0} agents cancelled", cancelledCount);
			const unreached = unreachedCount === 1
				? localize('agentHostFactoryRun.oneUnreached', "1 phase not reached")
				: localize('agentHostFactoryRun.unreachedCount', "{0} phases not reached", unreachedCount);
			DOM.append(body, $('p.agent-host-factory-run-outcome-note', undefined, localize('agentHostFactoryRun.interruptionCounts', "{0} · {1}", cancelled, unreached)));
		}
		if (outcome?.limitReached) {
			DOM.append(body, $('p.agent-host-factory-run-outcome-note', undefined, localize('agentHostFactoryRun.limitReached', "Stopped at the {0} limit. Resume the run to continue from its journal.", outcome.limitReached)));
		}
	}

	private renderOutcome(container: HTMLElement, run: ISessionFactoryRun): void {
		if (run.outcome?.resultText === undefined) {
			return;
		}
		const section = this.renderSection(container, localize('agentHostFactoryRun.outcome', "Outcome"));
		DOM.append(section, $('pre.agent-host-factory-run-result', undefined, run.outcome.resultText));
		if (run.outcome.resultTruncated) {
			DOM.append(section, $('p.agent-host-factory-run-outcome-note', undefined, localize('agentHostFactoryRun.resultTruncated', "The result was truncated for display.")));
		}
	}

	private renderRunDetails(container: HTMLElement, run: ISessionFactoryRun): void {
		const details = DOM.append(container, $<HTMLDetailsElement>('details.agent-host-factory-run-details'));
		details.open = this.expandedDetails.has('run-details');
		this.detailsElements.set('run-details', details);
		const summary = DOM.append(details, $('summary', undefined, localize('agentHostFactoryRun.details', "Run Details")));
		this.trackFocus(summary, 'run-details');
		if (run.description) {
			DOM.append(details, $('p.agent-host-factory-run-muted', undefined, run.description));
		}
		this.renderUsage(details, run);
		DOM.append(details, $('p.agent-host-factory-run-muted', undefined, localize('agentHostFactoryRun.availableData', "Credits are reported for the whole run. Per-phase costs and checkpoint boundaries are not available.")));
	}

	private renderUsage(container: HTMLElement, run: ISessionFactoryRun): void {
		const section = this.renderSection(container, localize('agentHostFactoryRun.usage', "Usage"));
		const grid = DOM.append(section, $('dl.agent-host-factory-run-usage'));
		const noLimit = localize('agentHostFactoryRun.noLimit', "No limit");
		const limitLabel = (value: string | undefined) => value === undefined ? noLimit : value;
		const cards: { readonly title: string; readonly used: string; readonly limit: string }[] = [
			{
				title: localize('agentHostFactoryRun.usage.credits', "AI credits"),
				used: formatFactoryCredits(run.usage.aiCredits),
				limit: limitLabel(run.limits.maxAiCredits === undefined ? undefined : formatFactoryCredits(run.limits.maxAiCredits)),
			},
			{
				title: localize('agentHostFactoryRun.usage.activeTime', "Active time"),
				used: formatFactoryDuration(run.usage.activeMs),
				limit: limitLabel(run.limits.timeoutSeconds === undefined ? undefined : formatFactoryDuration(run.limits.timeoutSeconds * 1000)),
			},
			{
				title: localize('agentHostFactoryRun.usage.agentsStarted', "Agents started"),
				used: String(run.totalSpawnedAgentCount),
				limit: limitLabel(run.limits.maxTotalSubagents === undefined ? undefined : String(run.limits.maxTotalSubagents)),
			},
			{
				title: localize('agentHostFactoryRun.usage.liveAgents', "Live agents"),
				used: String(run.liveAgentCount),
				limit: limitLabel(run.limits.maxConcurrentSubagents === undefined ? undefined : String(run.limits.maxConcurrentSubagents)),
			},
		];
		for (const card of cards) {
			const element = DOM.append(grid, $('.agent-host-factory-run-usage-card'));
			DOM.append(element, $('dt.agent-host-factory-run-usage-title', undefined, card.title));
			const value = DOM.append(element, $('dd.agent-host-factory-run-usage-value'));
			DOM.append(value, $('strong', undefined, card.used));
			DOM.append(value, $('span.agent-host-factory-run-muted', undefined, localize('agentHostFactoryRun.usage.limit', " / {0}", card.limit)));
		}
	}

	private renderPhases(container: HTMLElement, run: ISessionFactoryRun, selectedPhaseId: string | null | undefined, context: IFactoryRunRenderContext): void {
		const section = DOM.append(container, $('section.agent-host-factory-run-section'));
		if (run.phases.length === 0) {
			DOM.append(section, $('p.agent-host-factory-run-muted', undefined, localize('agentHostFactoryRun.noPhases', "This factory declares no phases.")));
			this.renderPhaseDetail(section, run, undefined, context);
			return;
		}
		if (run.status === SessionFactoryRunStatus.Running) {
			const toolbar = DOM.append(section, $('.agent-host-factory-run-workflow-toolbar'));
			const follow = DOM.append(toolbar, $('button.agent-host-factory-run-follow', { type: 'button' }, localize('agentHostFactoryRun.followActive', "Follow Active Phase")));
			this.trackFocus(follow, 'follow');
			follow.setAttribute('aria-pressed', String(selectedPhaseId === undefined));
			context.store.add(DOM.addDisposableListener(follow, DOM.EventType.CLICK, () => this.selectedPhaseId.set(undefined, undefined)));
		}
		const table = DOM.append(section, $('table.agent-host-factory-run-table'));
		table.setAttribute('aria-label', localize('agentHostFactoryRun.phaseTable', "Phases, agent counts, and active execution durations"));
		const columns = DOM.append(table, $('colgroup'));
		DOM.append(columns, $('col.phase-column'));
		DOM.append(columns, $('col.agents-column'));
		DOM.append(columns, $('col.duration-column'));
		const header = DOM.append(DOM.append(table, $('thead')), $('tr'));
		for (const label of [
			localize('agentHostFactoryRun.phaseColumn', "Phase"),
			localize('agentHostFactoryRun.agents', "Agents"),
			localize('agentHostFactoryRun.durationColumn', "Duration"),
		]) {
			DOM.append(header, $('th', { scope: 'col' }, label));
		}
		const defaultPhase = selectDefaultFactoryRunPhase(run);
		const selected = selectedPhaseId === null ? undefined : run.phases.find(phase => phase.id === selectedPhaseId)
			?? (defaultPhase?.status === SessionFactoryRunPhaseStatus.Active || defaultPhase?.status === SessionFactoryRunPhaseStatus.Completed ? defaultPhase : undefined);
		const maxDuration = run.phases.reduce((max, phase) => Math.max(max, phase.activeMs), 1);
		run.phases.forEach((phase, index) => {
			const presentation = getFactoryRunPhasePresentation(run, phase);
			const expanded = phase.id === selected?.id;
			const group = DOM.append(table, $(`tbody.agent-host-factory-run-phase-group.status-${presentation.state}`));
			group.classList.toggle('is-expanded', expanded);
			const row = DOM.append(group, $('tr.agent-host-factory-run-phase-row'));
			const heading = DOM.append(row, $('th', { scope: 'row' }));
			const item = DOM.append(heading, $('button.agent-host-factory-run-phase', { type: 'button' }));
			item.id = `${this.phaseDetailId}-${index}`;
			const detailId = `${item.id}-detail`;
			this.trackFocus(item, `phase:${phase.id}`);
			item.setAttribute('aria-expanded', String(expanded));
			if (expanded) {
				item.setAttribute('aria-controls', detailId);
			}
			const ordinal = phase.ordinal ?? index;
			item.setAttribute('aria-label', localize('agentHostFactoryRun.phaseAccessibleLabel', "{0}. {1}, {2}", ordinal + 1, phase.title, presentation.label));
			const twistie = DOM.append(item, renderIcon(expanded ? Codicon.chevronDown : Codicon.chevronRight));
			twistie.classList.add('agent-host-factory-run-phase-twistie');
			twistie.setAttribute('aria-hidden', 'true');
			DOM.append(item, renderIcon(presentation.icon)).setAttribute('aria-hidden', 'true');
			DOM.append(item, $('span.agent-host-factory-run-phase-title', undefined, localize('agentHostFactoryRun.phaseRowTitle', "{0} · {1}", ordinal + 1, phase.title)));
			if (presentation.state === 'active' || presentation.state === 'partial') {
				DOM.append(item, $('span.agent-host-factory-run-phase-status', undefined, presentation.label));
			}
			if (phase.status === SessionFactoryRunPhaseStatus.Pending || phase.status === SessionFactoryRunPhaseStatus.Skipped) {
				DOM.append(row, $('td.agent-host-factory-run-unreached', { colspan: '2' }, presentation.label));
			} else {
				DOM.append(row, $('td.agent-host-factory-run-phase-agents', undefined, String(phase.totalAgentCount)));
				const duration = DOM.append(DOM.append(row, $('td')), $('.agent-host-factory-run-duration'));
				DOM.append(duration, $('span.agent-host-factory-run-duration-value', undefined, formatFactoryDuration(phase.activeMs)));
				const track = DOM.append(duration, $('.agent-host-factory-run-duration-track', { 'aria-hidden': 'true' }));
				const bar = DOM.append(track, $('.agent-host-factory-run-duration-bar'));
				bar.style.width = `${Math.max(0, phase.activeMs) / maxDuration * 100}%`;
			}
			context.store.add(DOM.addDisposableListener(item, DOM.EventType.CLICK, () => this.selectedPhaseId.set(expanded ? null : phase.id, undefined)));
			context.store.add(DOM.addDisposableListener(item, DOM.EventType.KEY_DOWN, event => {
				let targetIndex: number;
				switch (event.key) {
					case 'ArrowDown': targetIndex = (index + 1) % run.phases.length; break;
					case 'ArrowUp': targetIndex = (index - 1 + run.phases.length) % run.phases.length; break;
					case 'Home': targetIndex = 0; break;
					case 'End': targetIndex = run.phases.length - 1; break;
					default: return;
				}
				event.preventDefault();
				this.focusTargets.get(`phase:${run.phases[targetIndex].id}`)?.focus();
			}));
			if (expanded) {
				const detailRow = DOM.append(group, $('tr'));
				const detail = DOM.append(detailRow, $('td.agent-host-factory-run-phase-detail', { colspan: '3' }));
				detail.id = detailId;
				const content = DOM.append(detail, $('.agent-host-factory-run-phase-content'));
				content.setAttribute('role', 'region');
				content.setAttribute('aria-labelledby', item.id);
				this.renderPhaseDetail(content, run, phase, context);
			}
		});
	}

	private renderPhaseDetail(container: HTMLElement, run: ISessionFactoryRun, phase: ISessionFactoryRunPhase | undefined, context: IFactoryRunRenderContext): void {
		if (phase?.detail) {
			DOM.append(container, $('p.agent-host-factory-run-muted', undefined, phase.detail));
		}
		if (phase?.status === SessionFactoryRunPhaseStatus.Pending) {
			DOM.append(container, $('p.agent-host-factory-run-empty-phase', undefined, isSessionFactoryRunTerminal(run.status)
				? localize('agentHostFactoryRun.phaseUnreached', "This phase was not reached before the run ended.")
				: localize('agentHostFactoryRun.phaseNotStarted', "This phase has not started. Agents and progress will appear here when it is reached.")));
			return;
		}
		if (phase?.status === SessionFactoryRunPhaseStatus.Skipped) {
			DOM.append(container, $('p.agent-host-factory-run-empty-phase', undefined, localize('agentHostFactoryRun.phaseSkipped', "This phase was skipped.")));
			return;
		}

		const agents = phase ? run.agents.filter(agent => agent.phaseId === phase.id) : run.agents;
		if (agents.length === 0) {
			DOM.append(container, $('p.agent-host-factory-run-muted', undefined, run.status === SessionFactoryRunStatus.Running
				? localize('agentHostFactoryRun.noAgentsYet', "No agents have started yet. The factory may be working directly.")
				: localize('agentHostFactoryRun.noAgents', "No agents ran in this phase.")));
		}
		const agentList = DOM.append(container, $('.agent-host-factory-run-agents'));
		for (const agent of agents) {
			const chatResource = context.agentChats.get(agent.agentId);
			const row = DOM.append(agentList, $('.agent-host-factory-run-agent'));
			row.dataset.status = agent.status;
			const meta = DOM.append(row, $('.agent-host-factory-run-agent-meta'));
			const icon = agent.status === 'cancelled' || agent.status === 'failed' || agent.status === 'error'
				? Codicon.close
				: agent.status === 'completed' ? Codicon.check : Codicon.agent;
			DOM.append(meta, renderIcon(icon)).setAttribute('aria-hidden', 'true');
			DOM.append(meta, $('span.agent-host-factory-run-agent-name', undefined, agent.label));
			if (agent.model) {
				DOM.append(meta, $('span', undefined, agent.model));
			}
			DOM.append(meta, $('span.agent-host-factory-run-agent-state', undefined, agent.status));
			if (agent.activeMs > 0) {
				DOM.append(meta, $('span', undefined, formatFactoryDuration(agent.activeMs)));
			}
			const activity = DOM.append(row, $('.agent-host-factory-run-agent-activity'));
			if (agent.activity) {
				DOM.append(activity, $('span.agent-host-factory-run-muted', undefined, agent.activity));
			}
			if (chatResource) {
				const link = DOM.append(activity, $('button.agent-host-factory-run-agent-trace', { type: 'button' }, localize('agentHostFactoryRun.viewTrace', "View Trace")));
				this.trackFocus(link, `agent:${agent.agentId}`);
				link.setAttribute('aria-label', localize('agentHostFactoryRun.viewAgentTrace', "View Trace for {0}", agent.label));
				DOM.append(link, renderIcon(Codicon.linkExternal)).setAttribute('aria-hidden', 'true');
				context.store.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, () => {
					void this.openAgentChat(chatResource, context, agent).catch(onUnexpectedError);
				}));
			}
		}

		const progress = run.progress.filter(line => line.kind === 'log' && (!phase || line.phaseId === phase.id));
		if (progress.length === 0) {
			return;
		}
		const details = DOM.append(container, $<HTMLDetailsElement>('details.agent-host-factory-run-progress-details'));
		const progressId = `progress:${phase?.id ?? 'run'}`;
		details.open = this.expandedDetails.has(progressId);
		this.detailsElements.set(progressId, details);
		const summary = DOM.append(details, $('summary', undefined, localize('agentHostFactoryRun.progressCount', "Progress ({0})", progress.length)));
		this.trackFocus(summary, progressId);
		const log = DOM.append(details, $('ol.agent-host-factory-run-progress'));
		for (const line of progress) {
			DOM.append(log, $(`li.kind-${line.kind}`, undefined, line.text));
		}
	}

	private renderSection(container: HTMLElement, title: string): HTMLElement {
		const section = DOM.append(container, $('section.agent-host-factory-run-section'));
		DOM.append(section, $('h2.agent-host-factory-run-section-title', undefined, title));
		return section;
	}

	/**
	 * Opens the agent's subagent chat through the same command the chat
	 * transcript uses for `Task` subagents, so the Agents window opens it to
	 * the side and the editor window opens a chat editor.
	 *
	 * The chat is primed first: subscribing to its channel makes the host
	 * restore it from the parent's event log when it is not live, which also
	 * lists it on the session so the Agents window can find it.
	 */
	private async openAgentChat(chatResource: string, context: IFactoryRunRenderContext, agent: ISessionFactoryRunAgent): Promise<void> {
		if (context.resolution) {
			await primeSubagentChat(context.resolution, chatResource);
		}
		const openContext: IOpenSubagentChatContext = {
			chatResource,
			parentSessionResource: context.sessionResource.toString(),
			title: agent.label,
			agentType: agent.agentType,
			modelId: agent.model,
			startedAt: agent.startedAt,
			duration: agent.completedAt !== undefined && agent.startedAt !== undefined ? agent.completedAt - agent.startedAt : undefined,
			isActive: agent.completedAt === undefined,
		};
		await this.commandService.executeCommand(CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, openContext);
	}
}

interface IFactoryRunRenderContext {
	readonly sessionResource: URI;
	readonly resolution: IAgentHostSessionResolution | undefined;
	/** Subagent chat resource per factory `agentId`, for every agent the runtime launched under a tool-call id. */
	readonly agentChats: ReadonlyMap<string, string>;
	readonly store: DisposableStore;
}

/** How long to wait for the host to restore a subagent chat before opening it regardless. */
const PRIME_SUBAGENT_CHAT_TIMEOUT_MS = 5_000;

/**
 * Subscribes to a subagent chat channel until its first snapshot arrives. The
 * host restores an unlisted subagent chat from the parent's event log on
 * subscribe, so this turns a stale reference into an openable chat.
 */
async function primeSubagentChat(resolution: IAgentHostSessionResolution, chatResource: string): Promise<void> {
	const subscription = resolution.connection.getSubscription(StateComponents.Chat, URI.parse(chatResource), 'AgentHostFactoryRunEditor.openAgent');
	try {
		if (subscription.object.value !== undefined) {
			return;
		}
		await raceTimeout(Event.toPromise(Event.once(subscription.object.onDidChange)), PRIME_SUBAGENT_CHAT_TIMEOUT_MS);
	} finally {
		subscription.dispose();
	}
}

/**
 * Maps each factory agent to the subagent chat the host owns for it, keyed by
 * `agentId`. Factory agents launch as background subagents under a tool-call
 * id, so the chat lives at the same address a `Task` subagent's would.
 */
export function resolveFactoryRunAgentChats(run: ISessionFactoryRun, backendSession: URI): ReadonlyMap<string, string> {
	const result = new Map<string, string>();
	for (const agent of run.agents) {
		if (agent.toolCallId) {
			result.set(agent.agentId, buildSubagentChatUri(backendSession, agent.toolCallId));
		}
	}
	return result;
}

function mapsEqual(first: ReadonlyMap<string, string>, second: ReadonlyMap<string, string>): boolean {
	if (first === second) {
		return true;
	}
	if (first.size !== second.size) {
		return false;
	}
	for (const [key, value] of first) {
		if (second.get(key) !== value) {
			return false;
		}
	}
	return true;
}
