/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEventPayload, SessionEventType } from '@github/copilot-sdk';

const phase = { fusionId: 'fusion-1', phaseId: 'phase-1', phaseKind: 'primary', role: 'solver', conversationScope: 'root', model: 'model-a' } as const;
const usage = { requestCount: 1, inputTokens: 10, outputTokens: 4, cachedTokens: 0, totalNanoAiu: 100 };

export const fusionTestData = {
	routeStarted: { attemptId: 'attempt-1', turnKind: 'user', syntheticModel: 'hydrafusion' } satisfies SessionEventPayload<'session.fusion_route_started'>['data'],
	resolved: {
		fusionId: 'fusion-1', turnId: 'sdk-turn', syntheticModel: 'hydrafusion', policy: 'max', contractVersion: 1,
		pattern: 'cascade', primaryModel: 'model-a', secondaryModel: 'model-b', fallbackModel: 'model-a', followUpModel: 'model-a',
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

export function fusionTestEvent<K extends SessionEventType>(type: K, data: SessionEventPayload<K>['data'], overrides?: Partial<Omit<SessionEventPayload<K>, 'type' | 'data'>>): SessionEventPayload<K> {
	// K checks the payload at the call site; TypeScript cannot reconstruct the generic discriminated union.
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	return { type, data, id: `event:${type}`, timestamp: '2026-09-18T12:00:00Z', parentId: null, ephemeral: type === 'session.fusion_route_started' || type === 'assistant.fusion_phase_started' || type === 'assistant.fusion_phase_activity', ...overrides } as SessionEventPayload<K>;
}
