/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { parseLivingDoc } from '../common/livingDocMarkdown.js';
import { AgentTriggerKind, IAgentDef, IAgentRun, IDirtyEntry } from '../common/livingDocsModel.js';
import { IAgentStore } from './agentStore.js';
import { IClock, RealClock } from './clock.js';

// How the orchestrator runs an agent once a trigger fires: the host (the service) supplies the actual
// work (re-derive figures, impact-pass, draft) given the agent + the documents in scope, and reports
// what landed/queued so the orchestrator can set status and record the run.
export interface IAgentRunContext {
	readonly trigger: AgentTriggerKind;
	readonly docs: readonly URI[];
	// The per-run cancellation token (plan 27 iter 4): the runner checks it between documents so a Stop
	// leaves the remaining documents unprocessed (reported as `skipped`) rather than running to completion.
	readonly token?: CancellationToken;
}
export interface IAgentRunResult {
	readonly applied: number;
	readonly queued: number;
	readonly blocked?: string;
	// Documents the run did not process because it was cancelled mid-flight (plan 27 iter 4).
	readonly skipped?: number;
}
export type AgentRunner = (agent: IAgentDef, context: IAgentRunContext) => Promise<IAgentRunResult>;

// Map a weekday abbreviation to its UTC day index (cron is interpreted in UTC for test determinism).
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const TICK_MS = 60_000;

// The orchestration engine (spec 09): the agent registry, the dependency-graph event-bus, and (in
// later items) the trigger layer, policy router, and verify gate. Owned by LivingDocsService - it is
// not a DI singleton, so it has a plain constructor.
//
// The propagation rule (spec 4.1): triggers wake the loop, the dependency graph decides what is
// affected, the review rail is where output lands. There is no doc-to-doc wiring: a write to any node
// emits a single event, and the orchestrator walks the graph's reverse edges to mark dependents dirty.

// The default automation set (spec 7) seeded when no registry exists yet.
function defaultAgents(): IAgentDef[] {
	return [
		{ id: 'weekly-refresh', name: 'Weekly refresh', trigger: { kind: 'cron', cron: 'Mon 09:00' }, flow: { sources: [], docs: [] }, policy: 'auto-figures', status: 'idle' },
		{ id: 'source-watcher', name: 'Source-change watcher', trigger: { kind: 'event', source: '*' }, flow: { sources: [], docs: [] }, policy: 'auto-figures', status: 'idle' },
		{ id: 'freshness-sweep', name: 'Freshness sweep', trigger: { kind: 'heartbeat', everyHours: 6 }, flow: { sources: [], docs: [] }, policy: 'draft-only', status: 'idle' },
		{ id: 'before-export-gate', name: 'Before-export gate', trigger: { kind: 'lifecycle', lifecycle: 'before-export' }, flow: { sources: [], docs: [] }, policy: 'ask-before-apply', status: 'idle' },
		{ id: 'on-publish-snapshot', name: 'On-publish snapshot', trigger: { kind: 'lifecycle', lifecycle: 'on-publish' }, flow: { sources: [], docs: [] }, policy: 'auto-figures', status: 'idle' },
	];
}

// The final path segment, used as the dependency-graph key so a watcher event (full URI) matches a
// document's relative `sources:` / `context:` entry.
function pathKey(path: string): string {
	return path.split('/').pop() ?? path;
}

interface IReverseEdges {
	readonly value: URI[];       // docs that bind this source (value edges)
	readonly influence: URI[];   // docs that draw on this source as context (influence edges)
}

export class AgentOrchestrator extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _agents: IAgentDef[] = [];
	private _loaded = false;
	// The workspace-wide dirty queue: doc URI -> changed dependency paths, split by edge kind. The
	// Freshness-sweep heartbeat drains this.
	private readonly _dirty = new Map<string, IDirtyEntry>();
	private _runner: AgentRunner | undefined;
	private readonly _ticker = this._register(new MutableDisposable());
	private readonly _lastRuns = new Map<string, IAgentRun>();

	constructor(
		private readonly _files: IFileService,
		private readonly _log: ILogService,
		private readonly _agentStore: IAgentStore,
		private readonly _provideDocUris: () => Promise<URI[]>,
		private readonly _clock: IClock = new RealClock(),
	) {
		super();
	}

	// The host (the service) registers how an agent actually does its work. Kept as a setter so the
	// service can wire it after construction without a circular dependency.
	setRunner(runner: AgentRunner): void { this._runner = runner; }

	// --- agent registry ---

	async ensureLoaded(): Promise<void> {
		if (this._loaded) { return; }
		this._loaded = true;
		const stored = await this._agentStore.read();
		if (stored && stored.length) {
			this._agents = stored;
		} else {
			this._agents = defaultAgents();
			await this._persistAgents();
		}
		this._onDidChange.fire();
	}

	getAgents(): readonly IAgentDef[] { return this._agents; }
	getAgent(id: string): IAgentDef | undefined { return this._agents.find(a => a.id === id); }

	private async _persistAgents(): Promise<void> {
		try {
			await this._agentStore.write(this._agents);
		} catch (e) {
			this._log.warn('[livingDocs] agents write failed', e instanceof Error ? e.message : String(e));
		}
	}

	// --- the dependency-graph event-bus (spec 4.1) ---

	// Build the reverse edges of the workspace dependency graph: source/context path -> dependent docs.
	// Keyed by final path segment so a watcher's full URI matches a doc's relative declaration.
	private async _buildReverseEdges(): Promise<Map<string, IReverseEdges>> {
		const graph = new Map<string, IReverseEdges>();
		const ensure = (key: string): IReverseEdges => {
			let edges = graph.get(key);
			if (!edges) { edges = { value: [], influence: [] }; graph.set(key, edges); }
			return edges;
		};
		for (const uri of await this._provideDocUris()) {
			let sources: readonly string[];
			let context: readonly string[];
			try {
				const doc = parseLivingDoc((await this._files.readFile(uri)).value.toString());
				if (!doc.isLiving) { continue; }
				sources = doc.sources;
				context = doc.context;
			} catch (e) {
				this._log.trace('[livingDocs] graph parse skipped', e instanceof Error ? e.message : String(e));
				continue;
			}
			for (const s of sources) { ensure(pathKey(s)).value.push(uri); }
			for (const c of context) { ensure(pathKey(c)).influence.push(uri); }
		}
		return graph;
	}

	/**
	 * The propagation rule: a single write to `changedPath` walks the graph's reverse edges and marks
	 * every dependent document dirty (value bindings vs influence context distinguished by edge kind).
	 * Returns the dirtied document URIs. No prose is touched - this is the cheap, workspace-wide hook.
	 */
	async propagate(changedPath: string): Promise<URI[]> {
		const key = pathKey(changedPath);
		const edges = (await this._buildReverseEdges()).get(key);
		if (!edges) { return []; }
		const dirtied: URI[] = [];
		const mark = (uri: URI, kind: 'value' | 'influence') => {
			const id = uri.toString();
			const prior = this._dirty.get(id) ?? { value: [], influence: [] };
			const next: IDirtyEntry = { value: [...prior.value], influence: [...prior.influence] };
			if (!next[kind].includes(key)) { next[kind].push(key); }
			this._dirty.set(id, next);
			if (!dirtied.some(u => u.toString() === id)) { dirtied.push(uri); }
		};
		for (const uri of edges.value) { mark(uri, 'value'); }
		for (const uri of edges.influence) { mark(uri, 'influence'); }
		if (dirtied.length) { this._onDidChange.fire(); }
		return dirtied;
	}

	// --- the trigger layer (spec 3): event + scheduled (cron/heartbeat) + manual ---

	// Start the scheduler: a single periodic tick checks which cron/heartbeat agents are due. Idempotent.
	start(): void {
		this._ticker.value = this._clock.scheduleInterval(TICK_MS, () => void this.runDueAgents());
	}

	// Fire every cron/heartbeat agent that is due at the clock's current time. Public + awaitable so a
	// fake clock can drive it deterministically in tests.
	async runDueAgents(): Promise<void> {
		for (const agent of this._agents) {
			if (agent.trigger.kind === 'cron' && this._cronDue(agent)) {
				await this.runAgent(agent.id, 'cron', await this._provideDocUris());
			} else if (agent.trigger.kind === 'heartbeat' && this._heartbeatDue(agent)) {
				await this.runHeartbeat(agent.id);
			}
		}
	}

	// Cron "Mon 09:00" is due when now (UTC) matches its weekday + time and it has not already fired
	// within this minute.
	private _cronDue(agent: IAgentDef): boolean {
		const match = /^(\w{3})\s+(\d{2}):(\d{2})$/.exec(agent.trigger.cron ?? '');
		if (!match) { return false; }
		const day = WEEKDAYS[match[1]];
		const now = this._clock.now();
		const d = new Date(now);
		if (day === undefined || d.getUTCDay() !== day || d.getUTCHours() !== Number(match[2]) || d.getUTCMinutes() !== Number(match[3])) {
			return false;
		}
		return !agent.lastRun || now - Date.parse(agent.lastRun) >= TICK_MS;
	}

	private _heartbeatDue(agent: IAgentDef): boolean {
		const everyMs = (agent.trigger.everyHours ?? 6) * 3_600_000;
		const last = agent.lastRun ? Date.parse(agent.lastRun) : 0;
		return this._clock.now() - last >= everyMs;
	}

	// A source/folder change (from a correlated watcher): walk the graph (cheap dirty flagging) and fire
	// any event-triggered agent whose source matches ('*' = any).
	async onSourceChanged(changedPath: string): Promise<void> {
		const dirtied = await this.propagate(changedPath);
		for (const agent of this._agents) {
			const source = agent.trigger.source;
			if (agent.trigger.kind === 'event' && (source === '*' || (source && pathKey(source) === pathKey(changedPath)))) {
				await this.runAgent(agent.id, 'event', dirtied);
			}
		}
	}

	// The heartbeat drains the dirty queue: it only ever processes flagged docs, and is a no-op when the
	// queue is empty (it does NOT re-derive everything - spec 3).
	async runHeartbeat(agentId: string): Promise<void> {
		const docs = this.getDirtyDocs();
		if (!docs.length) { return; }
		await this.runAgent(agentId, 'heartbeat', docs);
	}

	getLastRun(agentId: string): IAgentRun | undefined { return this._lastRuns.get(agentId); }

	// Run one agent end-to-end via the host runner (also the manual "Run now" path). Sets status from
	// the result (blocked / needs-approval / idle) and records the run for the Agents view + History.
	async runAgent(agentId: string, trigger: AgentTriggerKind, docs: readonly URI[], token: CancellationToken = CancellationToken.None): Promise<IAgentRun | undefined> {
		const agent = this.getAgent(agentId);
		if (!agent || !this._runner) { return undefined; }
		const startedAt = new Date(this._clock.now()).toISOString();
		agent.status = 'running';
		this._onDidChange.fire();
		const run: IAgentRun = { agentId, startedAt, applied: 0, queued: 0 };
		try {
			const result = await this._runner(agent, { trigger, docs, token });
			run.applied = result.applied;
			run.queued = result.queued;
			run.blocked = result.blocked;
			agent.status = result.blocked ? 'blocked' : result.queued > 0 ? 'needs-approval' : 'idle';
		} catch (e) {
			agent.status = 'error';
			this._log.warn('[livingDocs] agent run failed', agentId, e instanceof Error ? e.message : String(e));
		}
		run.finishedAt = new Date(this._clock.now()).toISOString();
		agent.lastRun = run.finishedAt;
		this._lastRuns.set(agentId, run);
		await this._persistAgents();
		this._onDidChange.fire();
		return run;
	}

	// --- the dirty queue (drained by the heartbeat) ---

	getDirty(resource: URI): IDirtyEntry | undefined { return this._dirty.get(resource.toString()); }
	getDirtyDocs(): URI[] { return [...this._dirty.keys()].map(s => URI.parse(s)); }
	isDirty(resource: URI): boolean { return this._dirty.has(resource.toString()); }
	clearDirty(resource: URI): void {
		if (this._dirty.delete(resource.toString())) { this._onDidChange.fire(); }
	}
}
