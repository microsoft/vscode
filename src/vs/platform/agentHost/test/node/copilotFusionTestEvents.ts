/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent, SessionEventPayload, SessionEventType } from '@github/copilot-sdk';

const phase = { fusionId: 'fusion-1', phaseId: 'phase-1', phaseKind: 'repair', role: 'solver', conversationScope: 'root', model: 'model-a' } as const;
const usage = { requestCount: 1, inputTokens: 10, outputTokens: 4, cachedTokens: 0, totalNanoAiu: 100 };

export const fusionTestData = {
	routeStarted: { attemptId: 'attempt-1', turnKind: 'user', syntheticModel: 'hydrafusion' } satisfies SessionEventPayload<'session.fusion_route_started'>['data'],
	resolved: {
		fusionId: 'fusion-1', turnId: 'sdk-turn', syntheticModel: 'hydrafusion', policy: 'max', contractVersion: 1,
		pattern: 'cascade', primaryModel: 'model-a', secondaryModel: 'model-b', fallbackModel: 'model-a', followUpModel: 'model-a',
		hint: 'SDK-provided workflow description.',
		phasePlan: [
			{ kind: 'primary', role: 'solver', scope: 'root', conditional: false },
			{ kind: 'judge', role: 'judge', scope: 'review', conditional: false },
			{ kind: 'repair', role: 'solver', scope: 'root', conditional: true },
		],
	} satisfies SessionEventPayload<'session.fusion_resolved'>['data'],
	started: { ...phase, pattern: 'cascade' } satisfies SessionEventPayload<'assistant.fusion_phase_started'>['data'],
	activity: {
		fusionId: phase.fusionId, phaseId: phase.phaseId, phaseKind: phase.phaseKind, role: phase.role, conversationScope: phase.conversationScope,
		pattern: 'cascade', activity: 'model_output', totalResponseSizeBytes: 200,
	} satisfies SessionEventPayload<'assistant.fusion_phase_activity'>['data'],
	phaseCompleted: {
		...phase, status: 'succeeded', content: 'PRIVATE PHASE TEXT', verdict: null, durationMs: 2000, usage,
	} satisfies SessionEventPayload<'assistant.fusion_phase_completed'>['data'],
	phaseFailed: {
		...phase, status: 'failed', reason: 'provider_error', errorMessage: 'PRIVATE ERROR DETAIL', durationMs: 1000, usage,
	} satisfies SessionEventPayload<'assistant.fusion_phase_failed'>['data'],
	routeFailed: {
		attemptId: 'attempt-1', syntheticModel: 'hydrafusion', policy: 'max', reason: 'router_unavailable', fallbackModel: 'model-a',
	} satisfies SessionEventPayload<'session.fusion_route_failed'>['data'],
	completed: {
		fusionId: 'fusion-1', commitId: 'commit-1', turnId: 'sdk-turn', syntheticModel: 'hydrafusion', pattern: 'cascade',
		outcome: 'completed', finalSourcePhaseId: 'phase-1', finalSourceModel: 'model-a', followUpModel: 'model-a',
		degradedReason: null, phaseCount: 1, durationMs: 2300, ...usage,
	} satisfies SessionEventPayload<'session.fusion_completed'>['data'],
};

export const fusionMainPassTestData = {
	started: { ...fusionTestData.started, phaseKind: 'primary' } satisfies SessionEventPayload<'assistant.fusion_phase_started'>['data'],
	phaseCompleted: { ...fusionTestData.phaseCompleted, phaseKind: 'primary' } satisfies SessionEventPayload<'assistant.fusion_phase_completed'>['data'],
};

export function fusionTestEvent<K extends SessionEventType>(type: K, data: SessionEventPayload<K>['data'], overrides?: Partial<Omit<SessionEventPayload<K>, 'type' | 'data'>>): SessionEventPayload<K> {
	// K checks the payload at the call site; TypeScript cannot reconstruct the generic discriminated union.
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	return { type, data, id: `event:${type}`, timestamp: '2026-09-18T12:00:00Z', parentId: null, ephemeral: type === 'session.fusion_route_started' || type === 'assistant.fusion_phase_started' || type === 'assistant.fusion_phase_activity', ...overrides } as SessionEventPayload<K>;
}

/**
 * A Cascade turn the user cancels during its review or fix-up pass with `HYDRAFUSION_INTERRUPTED_COMMIT`,
 * in the order the runtime emits it. The abort comes first, then the record of the cancelled phase,
 * then one commit of the main pass and, after a fix-up pass that did work, one of its partial work,
 * whose last tool never completed. Ephemeral events are absent from history.
 */
export function interruptedCascadeTestEvents(cancelledPhase: 'judge' | 'repair'): { readonly beforeAbort: SessionEvent[]; readonly afterAbort: SessionEvent[] } {
	let sequence = 0;
	const at = <K extends SessionEventType>(type: K, data: SessionEventPayload<K>['data'], overrides?: Partial<Omit<SessionEventPayload<K>, 'type' | 'data'>>): SessionEvent => {
		const event = fusionTestEvent(type, data, overrides);
		event.id = overrides?.id ?? `e${++sequence}`;
		return event;
	};
	const route = { fusionId: 'fusion-1', syntheticModel: 'hydrafusion', policy: 'max', pattern: 'cascade' } as const;
	const primary = { ...fusionMainPassTestData.started, phaseId: 'primary' } as const;
	const judge = { ...fusionTestData.started, phaseId: 'judge', phaseKind: 'judge', role: 'judge', conversationScope: 'review' } as const;
	const repair = { ...fusionTestData.started, phaseId: 'repair' } as const;
	const solverWork = (phaseId: string, commitId: string | undefined, calls: readonly { readonly messageId: string; readonly content: string; readonly toolCallId: string; readonly completes: boolean }[]): SessionEvent[] => {
		const fusion = { ...route, phaseId, ...(commitId ? { commitId } : {}) };
		const envelope = { ephemeral: commitId === undefined };
		return calls.flatMap(({ messageId, content, toolCallId, completes }) => [
			...(commitId ? [at('assistant.turn_start', { turnId: '0' })] : []),
			at('assistant.message', { messageId, content, toolRequests: [{ toolCallId, name: 'record_progress', arguments: {} }], fusion }, envelope),
			at('tool.execution_start', { toolCallId, toolName: 'record_progress', arguments: {}, fusion }, envelope),
			...(completes ? [at('tool.execution_complete', { toolCallId, success: true, result: { content: 'Recorded' }, fusion }, envelope)] : []),
			...(commitId ? [at('assistant.turn_end', { turnId: '0' })] : []),
		]);
	};
	const primaryWork = [{ messageId: 'check', content: 'Checking the parser', toolCallId: 'tc-check', completes: true }];
	const primaryAnswer = (commitId?: string) => [
		...(commitId ? [at('assistant.turn_start', { turnId: '0' })] : []),
		at('assistant.message', { messageId: 'answer', content: 'The parser is fixed', fusion: { ...route, phaseId: 'primary', ...(commitId ? { commitId } : {}) } }, { ephemeral: commitId === undefined }),
		...(commitId ? [at('assistant.turn_end', { turnId: '0' })] : []),
	];
	const repairWork = [
		{ messageId: 'fix', content: 'Fixing empty input', toolCallId: 'tc-fix', completes: true },
		{ messageId: 'wait', content: 'Waiting for the tests', toolCallId: 'tc-wait', completes: false },
	];
	const commit = (n: number, sourcePhaseId: string) => {
		const event = { type: 'session.fusion_commit_started', id: `e${++sequence}`, timestamp: '2026-09-18T12:00:00Z', parentId: null, data: { fusionId: route.fusionId, commitId: `${route.fusionId}:commit:interrupted:${n}`, sourcePhaseId } };
		// The SDK's typed event union does not list commit boundaries yet.
		return event as unknown as SessionEvent;
	};
	const beforeAbort: SessionEvent[] = [
		at('session.fusion_route_started', fusionTestData.routeStarted),
		at('session.fusion_resolved', fusionTestData.resolved),
		at('user.message', { content: 'Fix the parser' }, { id: 'user-1' }),
		at('assistant.fusion_phase_started', primary),
		...solverWork('primary', undefined, primaryWork),
		...primaryAnswer(),
		at('assistant.fusion_phase_completed', { ...fusionMainPassTestData.phaseCompleted, phaseId: 'primary' }),
		at('assistant.fusion_phase_started', judge),
		...(cancelledPhase === 'repair' ? [
			at('assistant.fusion_phase_completed', { ...fusionTestData.phaseCompleted, ...judge, content: '{"score":2,"rationale":"Misses empty input"}' }),
			at('assistant.fusion_phase_started', repair),
			...solverWork('repair', undefined, repairWork),
		] : []),
	];
	const cancelled = cancelledPhase === 'judge' ? judge : repair;
	const afterAbort: SessionEvent[] = [
		at('abort', { reason: 'user_initiated' }),
		at('assistant.fusion_phase_failed', { ...fusionTestData.phaseFailed, ...cancelled, status: 'cancelled', reason: 'cancelled', errorMessage: undefined }),
		commit(0, 'primary'),
		...solverWork('primary', `${route.fusionId}:commit:interrupted:0`, primaryWork),
		...primaryAnswer(`${route.fusionId}:commit:interrupted:0`),
		...(cancelledPhase === 'repair' ? [commit(1, 'repair'), ...solverWork('repair', `${route.fusionId}:commit:interrupted:1`, repairWork)] : []),
		at('session.idle', { aborted: true }, { ephemeral: true }),
	];
	return { beforeAbort, afterAbort };
}
