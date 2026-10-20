/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ProjectBoardChatOpenTelemetry } from '../../browser/projectBoardChatOpenTelemetry.js';

function isTelemetryData(data: unknown): data is Record<string, unknown> {
	return typeof data === 'object' && data !== null;
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName && isTelemetryData(data)) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('ProjectBoardChatOpenTelemetry', () => {
	test('emits bounded stage and cumulative durations once', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
			const telemetryService = new TestTelemetryService();
			const telemetry = new ProjectBoardChatOpenTelemetry('standaloneSidePanel', 'agenthost-private-connection', false, telemetryService);
			telemetry.loadingPresented();
			await telemetry.measure('trustDurationMs', () => timeout(10));
			await telemetry.measure('modelAcquireDurationMs', () => timeout(20));
			telemetry.measureSync('modelBindDurationMs', () => { });
			telemetry.setRequestCount(812);
			telemetry.contentReady();
			await timeout(30);
			telemetry.transcriptPaintOpportunity();
			telemetry.finish('success');
			telemetry.finish('cancelled');

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentsHub/chatOpen',
				data: {
					surface: 'standaloneSidePanel',
					outcome: 'success',
					provider: 'remote-agent-host',
					reused: false,
					requestCount: 812,
					loadingPresentedDurationMs: 0,
					trustDurationMs: 10,
					hostReadyDurationMs: undefined,
					loadingPaintDurationMs: undefined,
					providerResolveDurationMs: undefined,
					modelAcquireDurationMs: 20,
					modelBindDurationMs: 0,
					viewRestoreDurationMs: undefined,
					contentReadyDurationMs: 30,
					transcriptPaintOpportunityDurationMs: 60,
					totalDurationMs: 60,
				},
			}]);
		});
	});

	test('records denied reuse without model timings', () => {
		const telemetryService = new TestTelemetryService();
		const telemetry = new ProjectBoardChatOpenTelemetry('embeddedSidePanel', 'default-copilot', true, telemetryService);
		telemetry.finish('denied');

		assert.deepStrictEqual({
			name: telemetryService.events[0].name,
			surface: telemetryService.events[0].data.surface,
			outcome: telemetryService.events[0].data.outcome,
			provider: telemetryService.events[0].data.provider,
			reused: telemetryService.events[0].data.reused,
			modelAcquireDurationMs: telemetryService.events[0].data.modelAcquireDurationMs,
		}, {
			name: 'agentsHub/chatOpen',
			surface: 'embeddedSidePanel',
			outcome: 'denied',
			provider: 'default-copilot',
			reused: true,
			modelAcquireDurationMs: undefined,
		});
	});
});
