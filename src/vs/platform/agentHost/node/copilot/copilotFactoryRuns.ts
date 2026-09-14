/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FactoryRunDetail, FactoryRunResult, FactoryRunSummary, SessionFactoryApi } from '@github/copilot-sdk';
import { isSessionFactoryRunTerminal, SessionFactoryRunPhaseStatus, SessionFactoryRunStatus, type ISessionFactoryRun, type ISessionFactoryRunAgent, type ISessionFactoryRunOutcome, type ISessionFactoryRunPhase, type ISessionFactoryRunProgressLine } from '../../common/sessionFactoryRuns.js';

const NANO_AIU_PER_AIU = 1_000_000_000;

/** Upper bound on the serialized factory result carried in session state. */
export const FACTORY_RESULT_TEXT_LIMIT = 16_000;

/** Reads the SDK's factory API for one session. Split out so the session can be exercised without a live runtime. */
export interface ICopilotFactoryRunReader {
	listRuns(): Promise<readonly FactoryRunSummary[]>;
	getRunDetail(runId: string): Promise<FactoryRunDetail>;
	getRun(runId: string): Promise<FactoryRunResult>;
}

export function createCopilotFactoryRunReader(api: SessionFactoryApi): ICopilotFactoryRunReader {
	return {
		listRuns: () => api.listRuns(),
		getRunDetail: runId => api.getRunDetail(runId),
		getRun: runId => api.getRun(runId),
	};
}

function toStatus(status: FactoryRunDetail['status']): SessionFactoryRunStatus {
	switch (status) {
		case 'pending': return SessionFactoryRunStatus.Pending;
		case 'running': return SessionFactoryRunStatus.Running;
		case 'completed': return SessionFactoryRunStatus.Completed;
		case 'halted': return SessionFactoryRunStatus.Halted;
		case 'cancelled': return SessionFactoryRunStatus.Cancelled;
		case 'error': return SessionFactoryRunStatus.Error;
	}
}

function toPhaseStatus(status: FactoryRunDetail['phases'][number]['status']): SessionFactoryRunPhaseStatus {
	switch (status) {
		case 'pending': return SessionFactoryRunPhaseStatus.Pending;
		case 'active': return SessionFactoryRunPhaseStatus.Active;
		case 'completed': return SessionFactoryRunPhaseStatus.Completed;
		case 'skipped': return SessionFactoryRunPhaseStatus.Skipped;
	}
}

function toPhase(phase: FactoryRunDetail['phases'][number]): ISessionFactoryRunPhase {
	return {
		id: phase.id,
		...(phase.ordinal !== null ? { ordinal: phase.ordinal } : {}),
		title: phase.title,
		...(phase.detail !== undefined ? { detail: phase.detail } : {}),
		status: toPhaseStatus(phase.status),
		...(phase.startedAt !== undefined ? { startedAt: phase.startedAt } : {}),
		...(phase.completedAt !== undefined ? { completedAt: phase.completedAt } : {}),
		activeMs: phase.accumulatedActiveMs + phase.currentActiveMs,
		totalAgentCount: phase.totalAgentCount,
		liveAgentCount: phase.liveAgentCount,
	};
}

function toAgent(agent: FactoryRunDetail['agents'][number]): ISessionFactoryRunAgent {
	const model = agent.resolvedModel ?? agent.requestedModel;
	return {
		agentId: agent.agentId,
		toolCallId: agent.toolCallId,
		...(agent.phaseId !== null ? { phaseId: agent.phaseId } : {}),
		label: agent.displayName ?? agent.label,
		agentType: agent.agentType,
		status: agent.status,
		...(model !== undefined ? { model } : {}),
		...(agent.startedAt !== undefined ? { startedAt: agent.startedAt } : {}),
		...(agent.completedAt !== undefined ? { completedAt: agent.completedAt } : {}),
		activeMs: agent.activeMs,
		...(agent.activity !== undefined ? { activity: agent.activity } : {}),
	};
}

function toProgressLine(line: FactoryRunDetail['progress']['records'][number]): ISessionFactoryRunProgressLine {
	return {
		seq: line.seq,
		...(line.phaseId !== null ? { phaseId: line.phaseId } : {}),
		recordedAt: line.recordedAt,
		kind: line.kind === 'phase' ? 'phase' : 'log',
		text: line.text,
	};
}

/** Serializes a factory result for display, bounded so one run cannot bloat session state. */
export function serializeFactoryResult(result: unknown): { readonly resultText: string; readonly resultTruncated: boolean } | undefined {
	if (result === undefined) {
		return undefined;
	}
	let text: string;
	if (typeof result === 'string') {
		text = result;
	} else {
		try {
			text = JSON.stringify(result, undefined, 2) ?? String(result);
		} catch {
			text = String(result);
		}
	}
	if (text.length > FACTORY_RESULT_TEXT_LIMIT) {
		return { resultText: text.slice(0, FACTORY_RESULT_TEXT_LIMIT), resultTruncated: true };
	}
	return { resultText: text, resultTruncated: false };
}

function toOutcome(detail: FactoryRunDetail, result: FactoryRunResult | undefined): ISessionFactoryRunOutcome | undefined {
	const terminal = detail.terminal;
	const outcome: { -readonly [K in keyof ISessionFactoryRunOutcome]: ISessionFactoryRunOutcome[K] } = {};
	const serialized = serializeFactoryResult(result?.result);
	if (serialized) {
		outcome.resultText = serialized.resultText;
		if (serialized.resultTruncated) {
			outcome.resultTruncated = true;
		}
	}
	const error = terminal?.error ?? result?.error;
	const reason = terminal?.reason ?? result?.reason;
	const failure = terminal?.failure ?? result?.failure;
	if (error !== undefined) { outcome.error = error; }
	if (reason !== undefined) { outcome.reason = reason; }
	if (failure && failure.type === 'factory_limit_reached') { outcome.limitReached = failure.kind; }
	return Object.keys(outcome).length > 0 ? outcome : undefined;
}

/** Projects an SDK factory run onto the prompt-safe shape published to clients. */
export function toSessionFactoryRun(detail: FactoryRunDetail, result?: FactoryRunResult): ISessionFactoryRun {
	const limits = detail.approved ?? detail.declaredLimits;
	return {
		runId: detail.runId,
		factoryName: detail.factoryName,
		description: detail.description,
		status: toStatus(detail.status),
		revision: detail.revision,
		createdAt: detail.createdAt,
		...(detail.startedAt !== null ? { startedAt: detail.startedAt } : {}),
		updatedAt: detail.updatedAt,
		...(detail.completedAt !== null ? { completedAt: detail.completedAt } : {}),
		...(detail.currentPhase ? { currentPhaseId: detail.currentPhase.id } : {}),
		liveAgentCount: detail.liveAgentCount,
		totalSpawnedAgentCount: detail.totalSpawnedAgentCount,
		usage: {
			activeMs: detail.consumed.activeMs,
			subagents: detail.consumed.subagents,
			aiCredits: detail.consumed.nanoAiu / NANO_AIU_PER_AIU,
		},
		limits: {
			...(limits.maxConcurrentSubagents !== undefined ? { maxConcurrentSubagents: limits.maxConcurrentSubagents } : {}),
			...(limits.maxTotalSubagents !== undefined ? { maxTotalSubagents: limits.maxTotalSubagents } : {}),
			...(limits.timeoutSeconds !== undefined ? { timeoutSeconds: limits.timeoutSeconds } : {}),
			...(limits.maxAiCredits !== undefined ? { maxAiCredits: limits.maxAiCredits } : {}),
		},
		...(toOutcome(detail, result) ? { outcome: toOutcome(detail, result) } : {}),
		phases: detail.phases.map(toPhase),
		agents: detail.agents.map(toAgent),
		progress: detail.progress.records.map(toProgressLine),
	};
}

/**
 * Reads every factory run the session owns. A run whose detail cannot be read
 * is skipped rather than failing the whole refresh; the completed result is
 * fetched only for completed runs, which are the only ones that carry one.
 */
export async function readCopilotFactoryRuns(reader: ICopilotFactoryRunReader, onRunError?: (runId: string, error: unknown) => void): Promise<ISessionFactoryRun[]> {
	const summaries = await reader.listRuns();
	const runs = await Promise.all(summaries.map(async summary => {
		try {
			const detail = await reader.getRunDetail(summary.runId);
			const status = toStatus(detail.status);
			const result = status === SessionFactoryRunStatus.Completed || (isSessionFactoryRunTerminal(status) && detail.terminal?.failure)
				? await reader.getRun(summary.runId).catch(() => undefined)
				: undefined;
			return toSessionFactoryRun(detail, result);
		} catch (error) {
			onRunError?.(summary.runId, error);
			return undefined;
		}
	}));
	return runs.filter((run): run is ISessionFactoryRun => run !== undefined);
}
