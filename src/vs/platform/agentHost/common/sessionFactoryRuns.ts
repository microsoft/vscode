/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionSummaryMeta } from './state/sessionState.js';

/**
 * Lifecycle state of an Agent Factory run, mirroring the Copilot SDK's
 * `FactoryRunStatus`. `pending` and `running` are in flight; the rest are
 * terminal and never change again.
 */
export const enum SessionFactoryRunStatus {
	Pending = 'pending',
	Running = 'running',
	Completed = 'completed',
	Halted = 'halted',
	Cancelled = 'cancelled',
	Error = 'error',
}

export const SESSION_FACTORY_RUN_STATUSES: readonly SessionFactoryRunStatus[] = [
	SessionFactoryRunStatus.Pending,
	SessionFactoryRunStatus.Running,
	SessionFactoryRunStatus.Completed,
	SessionFactoryRunStatus.Halted,
	SessionFactoryRunStatus.Cancelled,
	SessionFactoryRunStatus.Error,
];

export function isSessionFactoryRunTerminal(status: SessionFactoryRunStatus): boolean {
	return status !== SessionFactoryRunStatus.Pending && status !== SessionFactoryRunStatus.Running;
}

/** Lifecycle state of one declared factory phase. */
export const enum SessionFactoryRunPhaseStatus {
	Pending = 'pending',
	Active = 'active',
	Completed = 'completed',
	Skipped = 'skipped',
}

const SESSION_FACTORY_RUN_PHASE_STATUSES: readonly SessionFactoryRunPhaseStatus[] = [
	SessionFactoryRunPhaseStatus.Pending,
	SessionFactoryRunPhaseStatus.Active,
	SessionFactoryRunPhaseStatus.Completed,
	SessionFactoryRunPhaseStatus.Skipped,
];

/** Resource ceilings a factory run executes under. */
export interface ISessionFactoryRunLimits {
	readonly maxConcurrentSubagents?: number;
	readonly maxTotalSubagents?: number;
	readonly timeoutSeconds?: number;
	readonly maxAiCredits?: number;
}

/** Resources a factory run has consumed so far. */
export interface ISessionFactoryRunUsage {
	/** Accumulated active execution time in milliseconds. */
	readonly activeMs: number;
	/** Total subagents spawned by the run. */
	readonly subagents: number;
	/** AI credits consumed by the run. */
	readonly aiCredits: number;
}

/** Prompt-safe terminal outcome of a factory run. */
export interface ISessionFactoryRunOutcome {
	/** The completed result, serialized for display. */
	readonly resultText?: string;
	/** Whether {@link resultText} was cut short to stay within the state budget. */
	readonly resultTruncated?: boolean;
	/** Human-readable error for an errored run. */
	readonly error?: string;
	/** Human-readable reason for a halted or cancelled run. */
	readonly reason?: string;
	/** Which resource ceiling stopped the run, when one did. */
	readonly limitReached?: string;
}

export interface ISessionFactoryRunPhase {
	readonly id: string;
	/** Zero-based declared ordinal, or `undefined` for an undeclared phase. */
	readonly ordinal?: number;
	readonly title: string;
	readonly detail?: string;
	readonly status: SessionFactoryRunPhaseStatus;
	readonly startedAt?: number;
	readonly completedAt?: number;
	/** Active time this phase has accumulated in milliseconds, live segment included. */
	readonly activeMs: number;
	readonly totalAgentCount: number;
	readonly liveAgentCount: number;
}

export interface ISessionFactoryRunAgent {
	readonly agentId: string;
	/**
	 * Tool-call identifier the runtime spawned the agent under. Factory agents
	 * are launched as background subagents, so this also keys the subagent chat
	 * the host creates for them.
	 */
	readonly toolCallId?: string;
	/** Phase active when the agent launched, if any. */
	readonly phaseId?: string;
	readonly label: string;
	readonly agentType: string;
	readonly status: string;
	readonly model?: string;
	readonly startedAt?: number;
	readonly completedAt?: number;
	readonly activeMs: number;
	/** Prompt-safe live activity text. */
	readonly activity?: string;
}

export interface ISessionFactoryRunProgressLine {
	readonly seq: number;
	readonly phaseId?: string;
	readonly recordedAt: number;
	readonly kind: 'log' | 'phase';
	readonly text: string;
}

/**
 * One Agent Factory run owned by a session, as the host publishes it to
 * clients. A prompt-safe projection of the SDK's `FactoryRunDetail`.
 */
export interface ISessionFactoryRun {
	readonly runId: string;
	readonly factoryName: string;
	readonly description: string;
	readonly status: SessionFactoryRunStatus;
	/** Monotonic durable revision; equal revisions carry equal durable state. */
	readonly revision: number;
	readonly createdAt: number;
	readonly startedAt?: number;
	readonly updatedAt: number;
	readonly completedAt?: number;
	readonly currentPhaseId?: string;
	readonly liveAgentCount: number;
	readonly totalSpawnedAgentCount: number;
	readonly usage: ISessionFactoryRunUsage;
	/** Approved ceilings when the run was admitted, otherwise the declared ones. */
	readonly limits: ISessionFactoryRunLimits;
	readonly outcome?: ISessionFactoryRunOutcome;
	readonly phases: readonly ISessionFactoryRunPhase[];
	readonly agents: readonly ISessionFactoryRunAgent[];
	/** Latest progress lines, oldest first. */
	readonly progress: readonly ISessionFactoryRunProgressLine[];
}

/**
 * Reserved key under {@link SessionSummaryMeta} holding the session's Agent
 * Factory runs. VS Code convention layered on the protocol's generic `_meta`
 * bag, like `agentHost/sessionArtifacts`.
 */
export const SESSION_META_FACTORY_RUNS_KEY = 'agentHost/factoryRuns';

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function parseLimits(value: unknown): ISessionFactoryRunLimits {
	if (!isRecord(value)) {
		return {};
	}
	const limits: { -readonly [K in keyof ISessionFactoryRunLimits]: ISessionFactoryRunLimits[K] } = {};
	const maxConcurrentSubagents = optionalNumber(value.maxConcurrentSubagents);
	const maxTotalSubagents = optionalNumber(value.maxTotalSubagents);
	const timeoutSeconds = optionalNumber(value.timeoutSeconds);
	const maxAiCredits = optionalNumber(value.maxAiCredits);
	if (maxConcurrentSubagents !== undefined) { limits.maxConcurrentSubagents = maxConcurrentSubagents; }
	if (maxTotalSubagents !== undefined) { limits.maxTotalSubagents = maxTotalSubagents; }
	if (timeoutSeconds !== undefined) { limits.timeoutSeconds = timeoutSeconds; }
	if (maxAiCredits !== undefined) { limits.maxAiCredits = maxAiCredits; }
	return limits;
}

function parseUsage(value: unknown): ISessionFactoryRunUsage {
	const usage = isRecord(value) ? value : {};
	return {
		activeMs: optionalNumber(usage.activeMs) ?? 0,
		subagents: optionalNumber(usage.subagents) ?? 0,
		aiCredits: optionalNumber(usage.aiCredits) ?? 0,
	};
}

function parseOutcome(value: unknown): ISessionFactoryRunOutcome | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const outcome: { -readonly [K in keyof ISessionFactoryRunOutcome]: ISessionFactoryRunOutcome[K] } = {};
	const resultText = optionalString(value.resultText);
	const error = optionalString(value.error);
	const reason = optionalString(value.reason);
	const limitReached = optionalString(value.limitReached);
	if (resultText !== undefined) { outcome.resultText = resultText; }
	if (value.resultTruncated === true) { outcome.resultTruncated = true; }
	if (error !== undefined) { outcome.error = error; }
	if (reason !== undefined) { outcome.reason = reason; }
	if (limitReached !== undefined) { outcome.limitReached = limitReached; }
	return Object.keys(outcome).length > 0 ? outcome : undefined;
}

function parsePhase(value: unknown): ISessionFactoryRunPhase | undefined {
	if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
		return undefined;
	}
	const status = value.status;
	if (typeof status !== 'string' || !(SESSION_FACTORY_RUN_PHASE_STATUSES as readonly string[]).includes(status)) {
		return undefined;
	}
	const phase: { -readonly [K in keyof ISessionFactoryRunPhase]: ISessionFactoryRunPhase[K] } = {
		id: value.id,
		title: value.title,
		status: status as SessionFactoryRunPhaseStatus,
		activeMs: optionalNumber(value.activeMs) ?? 0,
		totalAgentCount: optionalNumber(value.totalAgentCount) ?? 0,
		liveAgentCount: optionalNumber(value.liveAgentCount) ?? 0,
	};
	const ordinal = optionalNumber(value.ordinal);
	const detail = optionalString(value.detail);
	const startedAt = optionalNumber(value.startedAt);
	const completedAt = optionalNumber(value.completedAt);
	if (ordinal !== undefined) { phase.ordinal = ordinal; }
	if (detail !== undefined) { phase.detail = detail; }
	if (startedAt !== undefined) { phase.startedAt = startedAt; }
	if (completedAt !== undefined) { phase.completedAt = completedAt; }
	return phase;
}

function parseAgent(value: unknown): ISessionFactoryRunAgent | undefined {
	if (!isRecord(value) || typeof value.agentId !== 'string' || typeof value.label !== 'string') {
		return undefined;
	}
	const agent: { -readonly [K in keyof ISessionFactoryRunAgent]: ISessionFactoryRunAgent[K] } = {
		agentId: value.agentId,
		label: value.label,
		agentType: optionalString(value.agentType) ?? '',
		status: optionalString(value.status) ?? '',
		activeMs: optionalNumber(value.activeMs) ?? 0,
	};
	const toolCallId = optionalString(value.toolCallId);
	const phaseId = optionalString(value.phaseId);
	const model = optionalString(value.model);
	const startedAt = optionalNumber(value.startedAt);
	const completedAt = optionalNumber(value.completedAt);
	const activity = optionalString(value.activity);
	if (toolCallId !== undefined) { agent.toolCallId = toolCallId; }
	if (phaseId !== undefined) { agent.phaseId = phaseId; }
	if (model !== undefined) { agent.model = model; }
	if (startedAt !== undefined) { agent.startedAt = startedAt; }
	if (completedAt !== undefined) { agent.completedAt = completedAt; }
	if (activity !== undefined) { agent.activity = activity; }
	return agent;
}

function parseProgressLine(value: unknown): ISessionFactoryRunProgressLine | undefined {
	if (!isRecord(value) || typeof value.seq !== 'number' || typeof value.text !== 'string') {
		return undefined;
	}
	const kind = value.kind === 'phase' ? 'phase' : 'log';
	const line: { -readonly [K in keyof ISessionFactoryRunProgressLine]: ISessionFactoryRunProgressLine[K] } = {
		seq: value.seq,
		recordedAt: optionalNumber(value.recordedAt) ?? 0,
		kind,
		text: value.text,
	};
	const phaseId = optionalString(value.phaseId);
	if (phaseId !== undefined) { line.phaseId = phaseId; }
	return line;
}

function parseArray<T>(value: unknown, parse: (entry: unknown) => T | undefined): T[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const result: T[] = [];
	for (const entry of value) {
		const parsed = parse(entry);
		if (parsed) {
			result.push(parsed);
		}
	}
	return result;
}

function parseSessionFactoryRun(value: unknown): ISessionFactoryRun | undefined {
	if (!isRecord(value) || typeof value.runId !== 'string' || typeof value.factoryName !== 'string') {
		return undefined;
	}
	const status = value.status;
	if (typeof status !== 'string' || !(SESSION_FACTORY_RUN_STATUSES as readonly string[]).includes(status)) {
		return undefined;
	}
	const run: { -readonly [K in keyof ISessionFactoryRun]: ISessionFactoryRun[K] } = {
		runId: value.runId,
		factoryName: value.factoryName,
		description: optionalString(value.description) ?? '',
		status: status as SessionFactoryRunStatus,
		revision: optionalNumber(value.revision) ?? 0,
		createdAt: optionalNumber(value.createdAt) ?? 0,
		updatedAt: optionalNumber(value.updatedAt) ?? 0,
		liveAgentCount: optionalNumber(value.liveAgentCount) ?? 0,
		totalSpawnedAgentCount: optionalNumber(value.totalSpawnedAgentCount) ?? 0,
		usage: parseUsage(value.usage),
		limits: parseLimits(value.limits),
		phases: parseArray(value.phases, parsePhase),
		agents: parseArray(value.agents, parseAgent),
		progress: parseArray(value.progress, parseProgressLine),
	};
	const startedAt = optionalNumber(value.startedAt);
	const completedAt = optionalNumber(value.completedAt);
	const currentPhaseId = optionalString(value.currentPhaseId);
	const outcome = parseOutcome(value.outcome);
	if (startedAt !== undefined) { run.startedAt = startedAt; }
	if (completedAt !== undefined) { run.completedAt = completedAt; }
	if (currentPhaseId !== undefined) { run.currentPhaseId = currentPhaseId; }
	if (outcome) { run.outcome = outcome; }
	return run;
}

/** Reads the factory runs recorded on a session's `_meta` bag, in durable creation order. */
export function readSessionFactoryRuns(meta: SessionSummaryMeta | undefined): readonly ISessionFactoryRun[] {
	return parseArray(meta?.[SESSION_META_FACTORY_RUNS_KEY], parseSessionFactoryRun);
}

/** The factory runs recorded on a session's `_meta` bag, most recently created first. */
export function readSessionFactoryRunsNewestFirst(meta: SessionSummaryMeta | undefined): readonly ISessionFactoryRun[] {
	return readSessionFactoryRuns(meta).slice().reverse();
}

/** Returns `meta` with the factory run slot replaced, dropping it when empty. */
export function withSessionFactoryRuns(meta: SessionSummaryMeta | undefined, runs: readonly ISessionFactoryRun[]): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (runs.length > 0) {
		next[SESSION_META_FACTORY_RUNS_KEY] = runs;
	} else {
		delete next[SESSION_META_FACTORY_RUNS_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}
