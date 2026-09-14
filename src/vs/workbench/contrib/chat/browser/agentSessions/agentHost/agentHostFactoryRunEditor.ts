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
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, observableSignalFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ISessionFactoryRun, ISessionFactoryRunAgent, ISessionFactoryRunPhase, readSessionFactoryRuns, SessionFactoryRunPhaseStatus, SessionFactoryRunStatus } from '../../../../../../platform/agentHost/common/sessionFactoryRuns.js';
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
import { describeFactoryRun, formatFactoryCredits, formatFactoryDuration, getFactoryRunPhaseStatusLabel, getFactoryRunStatusIcon, getFactoryRunStatusLabel, selectDefaultFactoryRunPhase } from './agentHostFactoryRunPresentation.js';

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
	/** Phase the user picked; cleared when the input changes so each run opens on its own default. */
	private readonly selectedPhaseId = observableValue<string | undefined>(this, undefined);

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
			DOM.clearNode(container);
			if (!current) {
				this.renderUnavailable(container, input);
				return;
			}
			this.renderRun(container, current, selected, { sessionResource: input.sessionResource, resolution: currentResolution, agentChats: chats });
		}));
	}

	override clearInput(): void {
		this.inputDisposables.clear();
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
		// The editor is a scrolling document; the flex layout in CSS handles size.
	}

	private renderUnavailable(container: HTMLElement, input: AgentHostFactoryRunEditorInput): void {
		const empty = DOM.append(container, $('.agent-host-factory-run-empty'));
		DOM.append(empty, $('h2.agent-host-factory-run-title', undefined, input.factoryName));
		DOM.append(empty, $('p', undefined, localize('agentHostFactoryRun.unavailable', "This factory run is not available. The session may not be connected, or the run may have been removed.")));
	}

	private renderRun(container: HTMLElement, run: ISessionFactoryRun, selectedPhaseId: string | undefined, context: IFactoryRunRenderContext): void {
		this.renderHeader(container, run);
		this.renderOutcome(container, run);
		this.renderUsage(container, run);
		this.renderPhases(container, run, selectedPhaseId, context);
	}

	private renderHeader(container: HTMLElement, run: ISessionFactoryRun): void {
		const header = DOM.append(container, $('.agent-host-factory-run-header'));
		const titleRow = DOM.append(header, $('.agent-host-factory-run-title-row'));
		DOM.append(titleRow, $('h1.agent-host-factory-run-title', undefined, run.factoryName));
		const status = DOM.append(titleRow, $(`.agent-host-factory-run-status.status-${run.status}`));
		DOM.append(status, renderIcon(getFactoryRunStatusIcon(run.status)));
		DOM.append(status, $('span', undefined, getFactoryRunStatusLabel(run.status)));
		const timing = run.completedAt ?? run.startedAt ?? run.createdAt;
		DOM.append(status, $('span.agent-host-factory-run-status-time', undefined, fromNow(timing, true)));
		if (run.description) {
			DOM.append(header, $('p.agent-host-factory-run-description', undefined, run.description));
		}
		const summary = DOM.append(header, $('p.agent-host-factory-run-summary'));
		summary.textContent = describeFactoryRun(run);
	}

	private renderOutcome(container: HTMLElement, run: ISessionFactoryRun): void {
		const outcome = run.outcome;
		if (!outcome) {
			return;
		}
		const section = this.renderSection(container, localize('agentHostFactoryRun.outcome', "Outcome"));
		if (outcome.error) {
			const error = DOM.append(section, $('.agent-host-factory-run-outcome-message.is-error'));
			DOM.append(error, renderIcon(Codicon.error));
			DOM.append(error, $('span', undefined, outcome.error));
		}
		if (outcome.limitReached) {
			DOM.append(section, $('p.agent-host-factory-run-outcome-note', undefined, localize('agentHostFactoryRun.limitReached', "Stopped at the {0} limit. Resume the run to continue from its journal.", outcome.limitReached)));
		}
		if (outcome.reason) {
			DOM.append(section, $('p.agent-host-factory-run-outcome-note', undefined, outcome.reason));
		}
		if (outcome.resultText !== undefined) {
			const result = DOM.append(section, $('pre.agent-host-factory-run-result'));
			result.textContent = outcome.resultText;
			if (outcome.resultTruncated) {
				DOM.append(section, $('p.agent-host-factory-run-outcome-note', undefined, localize('agentHostFactoryRun.resultTruncated', "The result was truncated for display.")));
			}
		}
	}

	private renderUsage(container: HTMLElement, run: ISessionFactoryRun): void {
		const section = this.renderSection(container, localize('agentHostFactoryRun.usage', "Usage"));
		const grid = DOM.append(section, $('.agent-host-factory-run-usage'));
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
			DOM.append(element, $('.agent-host-factory-run-usage-title', undefined, card.title));
			DOM.append(element, $('.agent-host-factory-run-usage-value', undefined, localize('agentHostFactoryRun.usage.value', "{0} used · {1}", card.used, card.limit)));
		}
	}

	private renderPhases(container: HTMLElement, run: ISessionFactoryRun, selectedPhaseId: string | undefined, context: IFactoryRunRenderContext): void {
		const section = this.renderSection(container, localize('agentHostFactoryRun.phases', "Phases"));
		const layout = DOM.append(section, $('.agent-host-factory-run-phases'));
		const list = DOM.append(layout, $('.agent-host-factory-run-phase-list'));
		list.setAttribute('role', 'listbox');
		list.setAttribute('aria-label', localize('agentHostFactoryRun.phases', "Phases"));
		const selected = run.phases.find(phase => phase.id === selectedPhaseId) ?? selectDefaultFactoryRunPhase(run);

		if (run.phases.length === 0) {
			DOM.append(list, $('p.agent-host-factory-run-muted', undefined, localize('agentHostFactoryRun.noPhases', "This factory declares no phases.")));
		}
		run.phases.forEach((phase, index) => {
			const item = DOM.append(list, $(`.agent-host-factory-run-phase.status-${phase.status}`));
			item.setAttribute('role', 'option');
			item.tabIndex = 0;
			const isSelected = phase.id === selected?.id;
			item.classList.toggle('is-selected', isSelected);
			item.setAttribute('aria-selected', String(isSelected));
			const ordinal = phase.ordinal ?? index;
			DOM.append(item, $('.agent-host-factory-run-phase-title', undefined, localize('agentHostFactoryRun.phaseTitle', "{0}. {1}", ordinal + 1, phase.title)));
			const detail = phase.totalAgentCount === 1
				? localize('agentHostFactoryRun.phaseDetailSingle', "1 agent · {0}", formatFactoryDuration(phase.activeMs))
				: localize('agentHostFactoryRun.phaseDetail', "{0} agents · {1}", phase.totalAgentCount, formatFactoryDuration(phase.activeMs));
			DOM.append(item, $('.agent-host-factory-run-phase-meta', undefined, detail));
			DOM.append(item, $('.agent-host-factory-run-phase-status', undefined, getFactoryRunPhaseStatusLabel(phase.status)));
			const select = () => this.selectedPhaseId.set(phase.id, undefined);
			this.inputDisposables.value?.add(DOM.addDisposableListener(item, DOM.EventType.CLICK, select));
			this.inputDisposables.value?.add(DOM.addDisposableListener(item, DOM.EventType.KEY_DOWN, event => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					select();
				}
			}));
		});

		const detailPane = DOM.append(layout, $('.agent-host-factory-run-phase-detail'));
		this.renderPhaseDetail(detailPane, run, selected, context);
	}

	private renderPhaseDetail(container: HTMLElement, run: ISessionFactoryRun, phase: ISessionFactoryRunPhase | undefined, context: IFactoryRunRenderContext): void {
		const heading = DOM.append(container, $('.agent-host-factory-run-detail-heading'));
		if (phase) {
			DOM.append(heading, $('h3', undefined, phase.title));
			DOM.append(heading, $('span.agent-host-factory-run-detail-status', undefined, getFactoryRunPhaseStatusLabel(phase.status)));
			if (phase.detail) {
				DOM.append(container, $('p.agent-host-factory-run-muted', undefined, phase.detail));
			}
		} else {
			DOM.append(heading, $('h3', undefined, localize('agentHostFactoryRun.activity', "Activity")));
		}

		const agents = phase ? run.agents.filter(agent => agent.phaseId === phase.id) : run.agents;
		DOM.append(container, $('h4', undefined, localize('agentHostFactoryRun.agents', "Agents")));
		if (agents.length === 0) {
			DOM.append(container, $('p.agent-host-factory-run-muted', undefined, phase && phase.status === SessionFactoryRunPhaseStatus.Pending
				? localize('agentHostFactoryRun.noAgentsYet', "No agents have started in this phase yet.")
				: localize('agentHostFactoryRun.noAgents', "No agents ran in this phase.")));
		}
		for (const agent of agents) {
			const chatResource = context.agentChats.get(agent.agentId);
			const row = DOM.append(container, $('.agent-host-factory-run-agent'));
			const name = DOM.append(row, chatResource ? $('button.agent-host-factory-run-agent-name.is-openable') : $('.agent-host-factory-run-agent-name'));
			DOM.append(name, renderIcon(Codicon.agent));
			DOM.append(name, $('span', undefined, agent.label));
			if (agent.model) {
				DOM.append(name, $('span.agent-host-factory-run-muted', undefined, agent.model));
			}
			if (chatResource) {
				name.setAttribute('aria-label', localize('agentHostFactoryRun.openAgent', "Open {0} chat", agent.label));
				name.title = localize('agentHostFactoryRun.openAgentTooltip', "Open the chat for this agent");
				DOM.append(name, renderIcon(Codicon.linkExternal));
				this.inputDisposables.value?.add(DOM.addDisposableListener(name, DOM.EventType.CLICK, event => {
					event.preventDefault();
					void this.openAgentChat(chatResource, context, agent);
				}));
			}
			const meta = DOM.append(row, $('.agent-host-factory-run-agent-meta'));
			if (agent.activity && run.status === SessionFactoryRunStatus.Running) {
				DOM.append(meta, $('span.agent-host-factory-run-muted', undefined, agent.activity));
			}
			DOM.append(meta, $('span', undefined, agent.status));
		}

		const progress = phase ? run.progress.filter(line => line.phaseId === phase.id) : run.progress;
		DOM.append(container, $('h4', undefined, localize('agentHostFactoryRun.progress', "Progress")));
		if (progress.length === 0) {
			DOM.append(container, $('p.agent-host-factory-run-muted', undefined, localize('agentHostFactoryRun.noProgress', "No progress has been logged.")));
			return;
		}
		const log = DOM.append(container, $('ol.agent-host-factory-run-progress'));
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
