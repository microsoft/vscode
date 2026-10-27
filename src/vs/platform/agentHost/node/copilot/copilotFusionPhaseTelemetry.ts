/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEventPayload } from '@github/copilot-sdk';
import type { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { COPILOT_HYDRA_FUSION_MAX_MODEL_ID, COPILOT_HYDRA_FUSION_MODEL_ID } from '../../common/copilotCliConfig.js';
import type { IAgentHostEventClassification, IAgentHostEventTelemetry } from '../agentHostTelemetryReporter.js';
import type { CopilotSessionFailureCorrelation } from './copilotFailureTelemetry.js';
import { getFusionPhasePresentation, type FusionPhasePresentation } from './copilotFusionProgress.js';

/** Matches `AgentHostModelSelectionKind` so phase rows join to their root `agentHost.turnCompleted`. */
type FusionTier = 'hydrafusion' | 'hydrafusionMax' | 'unknown';

export type CopilotFusionPhaseEvent = SessionEventPayload<'assistant.fusion_phase_completed'> | SessionEventPayload<'assistant.fusion_phase_failed'>;

export interface ICopilotFusionPhaseContext {
	/** The HydraFusion model the turn routed with, e.g. `hydrafusion-max`. */
	readonly syntheticModel: string | undefined;
	/** The workflow pattern resolved for this phase's Fusion run. */
	readonly pattern: string | undefined;
}

type FusionPhaseCompletedEvent = IAgentHostEventTelemetry & CopilotSessionFailureCorrelation & {
	fusionId: string;
	tier: FusionTier;
	pattern: string;
	phaseKind: string;
	role: string;
	conversationScope: string;
	presentation: FusionPhasePresentation;
	status: string;
	failureReason: string | undefined;
	degraded: boolean;
	model: string;
	reasoningEffort: string | undefined;
	durationMs: number;
	requestCount: number;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	cacheWriteTokens: number | undefined;
	nanoAiu: number;
};

type FusionPhaseCompletedClassification = IAgentHostEventClassification & {
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host chat identifier of the root chat that ran the HydraFusion turn.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The root Agent Host turn identifier; joins to the root agentHost.turnCompleted event.' };
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Copilot SDK session identifier.' };
	fusionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Opaque runtime identifier of the HydraFusion run that contains the phase.' };
	tier: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'HydraFusion tier: hydrafusion, hydrafusionMax, or unknown. Uses the same values as agentHost.turnCompleted modelSelectionKind.' };
	pattern: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded HydraFusion workflow pattern, such as single, critique, or cascade.' };
	phaseKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded phase kind, such as primary, judge, repair, draft, critic, revision, or follow_up.' };
	role: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded semantic role the runtime assigned to the phase, such as solver or judge.' };
	conversationScope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the phase ran in the root conversation or an isolated review conversation.' };
	presentation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the phase was shown inline in the root transcript or in its own child chat.' };
	status: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Phase outcome: succeeded, failed, or cancelled.' };
	failureReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded machine-readable failure reason for a failed phase. Raw error messages are not collected.' };
	degraded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the runtime continued the turn with a fallback phase after this phase failed.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The concrete Copilot model that ran the phase.' };
	reasoningEffort: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded reasoning effort selected for the phase, when supplied.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Runtime-reported phase execution time in milliseconds.' };
	requestCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of model requests the phase made.' };
	inputTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total input tokens the phase consumed.' };
	outputTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total output tokens the phase produced.' };
	cachedTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total cached input tokens the phase read.' };
	cacheWriteTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total tokens the phase wrote to the prompt cache, when reported.' };
	nanoAiu: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'AI credit usage of the phase in nano-AIU. Already included in the root turn billedNanoAiu; do not add the two.' };
	owner: 'bhavyaus';
	comment: 'One event per HydraFusion phase, so phase cost, duration, and model can be analyzed without treating presentation-only phase chats as turns.';
};

const BOUNDED_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function boundedIdentifier(value: string | null | undefined): string | undefined {
	return value && BOUNDED_IDENTIFIER.test(value) ? value : value ? 'other' : undefined;
}

function finiteCount(value: number | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function toFusionTier(syntheticModel: string | undefined): FusionTier {
	switch (syntheticModel) {
		case COPILOT_HYDRA_FUSION_MODEL_ID: return 'hydrafusion';
		case COPILOT_HYDRA_FUSION_MAX_MODEL_ID: return 'hydrafusionMax';
		default: return 'unknown';
	}
}

/**
 * Reports one completed or failed HydraFusion phase from the runtime's durable phase record.
 * Never reads the phase's private output or raw error message.
 */
export function reportCopilotFusionPhase(telemetryService: ITelemetryService, event: CopilotFusionPhaseEvent, context: ICopilotFusionPhaseContext, correlation: CopilotSessionFailureCorrelation): void {
	const data = event.data;
	const failed = event.type === 'assistant.fusion_phase_failed' ? event.data : undefined;
	telemetryService.publicLog2<FusionPhaseCompletedEvent, FusionPhaseCompletedClassification>('agentHost.fusionPhaseCompleted', {
		...correlation,
		fusionId: data.fusionId,
		tier: toFusionTier(context.syntheticModel),
		pattern: boundedIdentifier(context.pattern) ?? 'unknown',
		phaseKind: boundedIdentifier(data.phaseKind) ?? 'unknown',
		role: boundedIdentifier(data.role) ?? 'unknown',
		conversationScope: boundedIdentifier(data.conversationScope) ?? 'unknown',
		presentation: getFusionPhasePresentation(data.phaseKind),
		status: boundedIdentifier(data.status) ?? 'unknown',
		failureReason: boundedIdentifier(failed?.reason),
		degraded: failed?.degradedToPhaseId !== undefined,
		model: boundedIdentifier(data.model) ?? 'unknown',
		reasoningEffort: boundedIdentifier(data.reasoningEffort),
		durationMs: finiteCount(data.durationMs),
		requestCount: finiteCount(data.usage?.requestCount),
		inputTokens: finiteCount(data.usage?.inputTokens),
		outputTokens: finiteCount(data.usage?.outputTokens),
		cachedTokens: finiteCount(data.usage?.cachedTokens),
		cacheWriteTokens: data.usage?.cacheWriteTokens === undefined ? undefined : finiteCount(data.usage.cacheWriteTokens),
		nanoAiu: finiteCount(data.usage?.totalNanoAiu),
	});
}
