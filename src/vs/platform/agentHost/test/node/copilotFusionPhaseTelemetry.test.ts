/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agent.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { createCopilotFailureCorrelation } from '../../node/copilot/copilotFailureTelemetry.js';
import { reportCopilotFusionPhase } from '../../node/copilot/copilotFusionPhaseTelemetry.js';
import { fusionTestData, fusionTestEvent } from './copilotFusionTestEvents.js';

class CapturingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'test-session';
	readonly machineId = 'test-machine';
	readonly sqmId = 'test-sqm';
	readonly devDeviceId = 'test-dev-device';
	readonly firstSessionDate = 'test-first-session-date';
	readonly sendErrorTelemetry = true;
	readonly events: { eventName: string; data: Record<string, unknown> | undefined }[] = [];

	publicLog(): void { }
	publicLog2(eventName: string, data?: Record<string, unknown>): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

suite('CopilotFusionPhaseTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionUri = AgentSession.uri('copilotcli', 'session-1');
	const correlation = createCopilotFailureCorrelation(sessionUri, URI.parse(buildDefaultChatUri(sessionUri)), 'turn-1', 'sdk-session-1');

	test('bounds runtime-supplied strings and counts without reading private phase output', () => {
		const telemetryService = new CapturingTelemetryService();
		reportCopilotFusionPhase(telemetryService, fusionTestEvent('assistant.fusion_phase_completed', {
			...fusionTestData.phaseCompleted,
			phaseKind: 'primary',
			role: 'solver with spaces',
			model: 'claude-opus-5.5',
			reasoningEffort: 'high',
			durationMs: Number.NaN,
			usage: { ...fusionTestData.phaseCompleted.usage, requestCount: -1, totalNanoAiu: 203_701_400_000 },
		}), { syntheticModel: 'some-future-tier', pattern: undefined }, correlation);

		const data = telemetryService.events[0].data ?? {};
		assert.deepStrictEqual({
			eventNames: telemetryService.events.map(event => event.eventName),
			turnId: data.turnId,
			tier: data.tier,
			pattern: data.pattern,
			presentation: data.presentation,
			role: data.role,
			model: data.model,
			reasoningEffort: data.reasoningEffort,
			durationMs: data.durationMs,
			requestCount: data.requestCount,
			nanoAiu: data.nanoAiu,
			leaksPrivateOutput: JSON.stringify(data).includes('PRIVATE'),
		}, {
			eventNames: ['agentHost.fusionPhaseCompleted'],
			turnId: 'turn-1',
			tier: 'unknown',
			pattern: 'unknown',
			presentation: 'inline',
			role: 'other',
			model: 'claude-opus-5.5',
			reasoningEffort: 'high',
			durationMs: 0,
			requestCount: 0,
			nanoAiu: 203_701_400_000,
			leaksPrivateOutput: false,
		});
	});

	test('reports failure reason without the raw error message', () => {
		const telemetryService = new CapturingTelemetryService();
		reportCopilotFusionPhase(telemetryService, fusionTestEvent('assistant.fusion_phase_failed', fusionTestData.phaseFailed), { syntheticModel: 'hydrafusion', pattern: 'cascade' }, correlation);

		const data = telemetryService.events[0].data ?? {};
		assert.deepStrictEqual({
			tier: data.tier,
			status: data.status,
			failureReason: data.failureReason,
			degraded: data.degraded,
			leaksErrorMessage: JSON.stringify(data).includes('PRIVATE'),
		}, {
			tier: 'hydrafusion',
			status: 'failed',
			failureReason: 'provider_error',
			degraded: false,
			leaksErrorMessage: false,
		});
	});
});
