/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Sequencer } from '../../../base/common/async.js';
import type { IAgentProviderSendStageRecorder } from './agentHostTelemetry.js';

export const agentHostProviderOperations = [
	'attachments', 'command', 'mode', 'permission', 'permissionOptions', 'permissionRpc', 'managedSettings',
	'sandbox', 'sandboxRpc', 'sandboxDiagnostics', 'shell', 'shellFile', 'shellRpc',
	'mcp', 'mcpList', 'mcpEnable', 'mcpDisable', 'execution', 'executionMarker', 'sdkSend',
	'permissionRequest', 'userInputRequest', 'elicitationRequest', 'mcpAuthRequest', 'exitPlanModeRequest', 'unsandboxedConfirmation',
] as const;
export type AgentHostProviderOperation = typeof agentHostProviderOperations[number];

export const agentHostProviderMilestones = [
	'sdkSend', 'sdkSendReturned', 'sdkSendRejected', 'sdkFirstEvent', 'sdkUserMessage',
	'sdkAssistantTurnStart', 'sdkText', 'sdkReasoning', 'sdkTool', 'sdkError', 'sdkIdle',
	'permissionRequest', 'userInputRequest', 'elicitationRequest', 'mcpAuthRequest', 'promptHook',
	'exitPlanModeRequest', 'unsandboxedConfirmation',
	'hostProgress', 'hostSubstantiveProgress', 'modelCallFinished',
] as const;
export type AgentHostProviderMilestone = typeof agentHostProviderMilestones[number];

export const agentHostProviderTimingMeasurements = [
	'startMs', 'endMs', 'queueMs', 'executionMs', 'queueBeforeProgressMs', 'executionBeforeProgressMs',
	'count', 'errorCount', 'incompleteCount',
] as const;

type ProviderOperationMeasurement = `${AgentHostProviderOperation}.${typeof agentHostProviderTimingMeasurements[number]}`;
type ProviderMilestoneMeasurement = `milestone.${AgentHostProviderMilestone}`;
export type AgentHostProviderTimingMeasurement = ProviderOperationMeasurement | ProviderMilestoneMeasurement;
export type AgentHostProviderTimingMeasurements = Partial<Record<AgentHostProviderTimingMeasurement, number>>;
type ProviderTimingGroup = 'input' | 'permissions' | 'sandboxShell' | 'mcp' | 'execution' | 'interactions' | 'milestones';

const operationGroups: Record<AgentHostProviderOperation, Exclude<ProviderTimingGroup, 'milestones'>> = {
	attachments: 'input', command: 'input', mode: 'input',
	permission: 'permissions', permissionOptions: 'permissions', permissionRpc: 'permissions', managedSettings: 'permissions',
	sandbox: 'sandboxShell', sandboxRpc: 'sandboxShell', sandboxDiagnostics: 'sandboxShell',
	shell: 'sandboxShell', shellFile: 'sandboxShell', shellRpc: 'sandboxShell',
	mcp: 'mcp', mcpList: 'mcp', mcpEnable: 'mcp', mcpDisable: 'mcp',
	execution: 'execution', executionMarker: 'execution', sdkSend: 'execution',
	permissionRequest: 'interactions', userInputRequest: 'interactions', elicitationRequest: 'interactions',
	mcpAuthRequest: 'interactions', exitPlanModeRequest: 'interactions', unsandboxedConfirmation: 'interactions',
};

/** Packs sanitized timings into at most seven events, with at most 54 timing measurements per event. */
export function groupAgentHostProviderTimings(timings: readonly IAgentHostProviderTiming[]): Map<ProviderTimingGroup, AgentHostProviderTimingMeasurements> {
	const groups = new Map<ProviderTimingGroup, AgentHostProviderTimingMeasurements>();
	for (const timing of timings) {
		if (timing.kind === 'milestone') {
			const measurements = groups.get('milestones') ?? {};
			measurements[`milestone.${timing.name as AgentHostProviderMilestone}`] = timing.startMs;
			groups.set('milestones', measurements);
		} else {
			const name = timing.name as AgentHostProviderOperation;
			const group = operationGroups[name];
			const measurements = groups.get(group) ?? {};
			for (const key of agentHostProviderTimingMeasurements) {
				measurements[`${name}.${key}`] = timing[key];
			}
			groups.set(group, measurements);
		}
	}
	return groups;
}

export interface IAgentHostProviderTiming {
	readonly kind: 'operation' | 'milestone';
	readonly name: AgentHostProviderOperation | AgentHostProviderMilestone;
	readonly startMs: number;
	readonly endMs: number;
	readonly queueMs: number;
	readonly executionMs: number;
	readonly queueBeforeProgressMs: number;
	readonly executionBeforeProgressMs: number;
	readonly count: number;
	readonly errorCount: number;
	readonly incompleteCount: number;
}

export interface IAgentProviderOperationTiming {
	start(): void;
	end(failed: boolean): void;
}

export function sanitizeAgentHostProviderTiming(timing: IAgentHostProviderTiming): IAgentHostProviderTiming | undefined {
	const names: readonly string[] = timing.kind === 'operation' ? agentHostProviderOperations : timing.kind === 'milestone' ? agentHostProviderMilestones : [];
	if (!names.includes(timing.name) || agentHostProviderTimingMeasurements.some(key => !Number.isFinite(timing[key]) || timing[key] < 0)) {
		return undefined;
	}
	return {
		kind: timing.kind, name: timing.name, startMs: timing.startMs, endMs: timing.endMs,
		queueMs: timing.queueMs, executionMs: timing.executionMs,
		queueBeforeProgressMs: timing.queueBeforeProgressMs, executionBeforeProgressMs: timing.executionBeforeProgressMs,
		count: timing.count, errorCount: timing.errorCount, incompleteCount: timing.incompleteCount,
	};
}

interface IOperation {
	readonly name: AgentHostProviderOperation;
	readonly queued: number;
	started?: number;
}

type MutableTiming = { -readonly [K in keyof IAgentHostProviderTiming]: IAgentHostProviderTiming[K] };

/** Bounded, turn-local timings on the host turn's clock; nested operations are not additive. */
export class AgentHostProviderTiming {
	private readonly operations = new Map<AgentHostProviderOperation, MutableTiming>();
	private readonly milestones = new Map<AgentHostProviderMilestone, number>();
	private readonly pending = new Set<IOperation>();
	private firstProgress: number | undefined;
	private finished = false;

	constructor(private readonly now: () => number) { }

	get hasTimings(): boolean {
		return this.operations.size > 0 || this.pending.size > 0 || this.milestones.size > 0;
	}

	markFirstProgress(time: number): void {
		this.firstProgress ??= time;
	}

	markMilestone(name: AgentHostProviderMilestone): void {
		if (!this.finished && agentHostProviderMilestones.includes(name) && !this.milestones.has(name)) {
			this.milestones.set(name, this.now());
		}
	}

	startOperation(name: AgentHostProviderOperation): IAgentProviderOperationTiming | undefined {
		if (this.finished || !agentHostProviderOperations.includes(name)) {
			return undefined;
		}
		const operation: IOperation = { name, queued: this.now() };
		this.pending.add(operation);
		return {
			start: () => {
				if (!this.finished && this.pending.has(operation)) {
					operation.started ??= this.now();
				}
			},
			end: failed => {
				if (!this.finished && this.pending.delete(operation)) {
					this.record(operation, this.now(), failed, false);
				}
			},
		};
	}

	finish(time: number): readonly IAgentHostProviderTiming[] {
		if (this.finished) {
			return [];
		}
		this.finished = true;
		for (const operation of this.pending) {
			this.record(operation, time, false, true);
		}
		this.pending.clear();
		return [
			...this.operations.values(),
			...[...this.milestones].map(([name, time]): IAgentHostProviderTiming => ({
				kind: 'milestone', name, startMs: time, endMs: time, queueMs: 0, executionMs: 0,
				queueBeforeProgressMs: 0, executionBeforeProgressMs: 0, count: 1, errorCount: 0, incompleteCount: 0,
			})),
		];
	}

	private record(operation: IOperation, end: number, failed: boolean, incomplete: boolean): void {
		const start = Math.min(operation.started ?? end, end);
		const cutoff = this.firstProgress ?? end;
		const timing = this.operations.get(operation.name) ?? {
			kind: 'operation', name: operation.name, startMs: operation.queued, endMs: end,
			queueMs: 0, executionMs: 0, queueBeforeProgressMs: 0, executionBeforeProgressMs: 0,
			count: 0, errorCount: 0, incompleteCount: 0,
		};
		timing.startMs = Math.min(timing.startMs, operation.queued);
		timing.endMs = Math.max(timing.endMs, end);
		timing.queueMs += Math.max(0, start - operation.queued);
		timing.executionMs += Math.max(0, end - start);
		timing.queueBeforeProgressMs += Math.max(0, Math.min(start, cutoff) - operation.queued);
		timing.executionBeforeProgressMs += Math.max(0, Math.min(end, cutoff) - start);
		timing.count++;
		timing.errorCount += Number(failed);
		timing.incompleteCount += Number(incomplete);
		this.operations.set(operation.name, timing);
	}
}

/** Measures queue admission separately from execution, retaining the operation's result or rejection. */
export function measureAgentProviderOperation<T>(recorder: IAgentProviderSendStageRecorder | undefined, name: AgentHostProviderOperation, operation: () => Promise<T>, sequencer?: Sequencer): Promise<T> {
	const timing = recorder?.startOperation?.(name);
	if (!timing) {
		return sequencer ? sequencer.queue(operation) : operation();
	}
	const run = async () => {
		timing?.start();
		let failed = true;
		try {
			const result = await operation();
			failed = false;
			return result;
		} finally {
			timing?.end(failed);
		}
	};
	return sequencer ? sequencer.queue(run) : run();
}
