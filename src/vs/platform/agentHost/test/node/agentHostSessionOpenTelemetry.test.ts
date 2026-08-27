/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession } from '../../common/agent.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { AgentHostCopilotSessionSubscribeTimeoutMs, AgentHostSessionOpenTelemetry } from '../../node/agentHostSessionOpenTelemetry.js';

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

suite('AgentHostSessionOpenTelemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = AgentSession.uri('copilotcli', 'session');
	const defaultChat = URI.parse(buildDefaultChatUri(session));

	test('emits ordered subscribe, restore, and SDK resume milestones', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new AgentHostSessionOpenTelemetry(telemetryService));
			await service.withSubscription(defaultChat, async telemetry => {
				telemetry.setServedFromMemory(false);
				await timeout(5);
				telemetry.restoreStarted(false);
				await timeout(5);
				await service.withSdkResume(session, () => timeout(20));
				await timeout(10);
				telemetry.restoreCompleted();
				await timeout(10);
			});

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.copilotSessionSubscribe',
				data: {
					channel: 'defaultChat',
					outcome: 'success',
					servedFromMemory: false,
					joinedRestore: false,
					sdkResumeOutcome: 'success',
					sdkResumeAttemptCount: 1,
					timeToRestoreStartMs: 5,
					timeToSdkResumeStartMs: 10,
					sdkResumeDurationMs: 20,
					timeToSdkResumeCompleteMs: 30,
					timeToRestoreCompleteMs: 40,
					totalDurationMs: 50,
				},
			}]);
		});
	});

	test('records warm subscriptions without restore or SDK resume milestones', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new AgentHostSessionOpenTelemetry(telemetryService));
			await service.withSubscription(session, async telemetry => telemetry.setServedFromMemory(true));

			assert.deepStrictEqual(telemetryService.events.map(event => event.data), [{
				channel: 'session',
				outcome: 'success',
				servedFromMemory: true,
				joinedRestore: undefined,
				sdkResumeOutcome: 'notStarted',
				sdkResumeAttemptCount: 0,
				timeToRestoreStartMs: undefined,
				timeToSdkResumeStartMs: undefined,
				sdkResumeDurationMs: undefined,
				timeToSdkResumeCompleteMs: undefined,
				timeToRestoreCompleteMs: undefined,
				totalDurationMs: 0,
			}]);
		});
	});

	test('accumulates retries and reports fallback creation without duplicate emission', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new AgentHostSessionOpenTelemetry(telemetryService));
			await service.withSubscription(session, async telemetry => {
				telemetry.setServedFromMemory(false);
				telemetry.restoreStarted(true);
				await assert.rejects(service.withSdkResume(session, async () => {
					await timeout(10);
					throw new Error('First resume failed');
				}));
				await assert.rejects(service.withSdkResume(session, async () => {
					await timeout(20);
					throw new Error('Second resume failed');
				}));
				service.sdkResumeFallbackCreated(session);
			});

			assert.deepStrictEqual(telemetryService.events.map(event => ({
				outcome: event.data.outcome,
				joinedRestore: event.data.joinedRestore,
				sdkResumeOutcome: event.data.sdkResumeOutcome,
				sdkResumeAttemptCount: event.data.sdkResumeAttemptCount,
				sdkResumeDurationMs: event.data.sdkResumeDurationMs,
			})), [{
				outcome: 'success',
				joinedRestore: true,
				sdkResumeOutcome: 'fallbackCreate',
				sdkResumeAttemptCount: 2,
				sdkResumeDurationMs: 30,
			}]);
		});
	});

	test('does not attribute an in-flight SDK resume to a late subscriber', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new AgentHostSessionOpenTelemetry(telemetryService));
			const first = service.withSubscription(session, async telemetry => {
				telemetry.setServedFromMemory(false);
				await service.withSdkResume(session, () => timeout(20));
			});
			await timeout(10);
			const late = service.withSubscription(defaultChat, async telemetry => {
				telemetry.setServedFromMemory(false);
				await first;
			});
			await Promise.all([first, late]);

			assert.deepStrictEqual(telemetryService.events.map(event => ({
				channel: event.data.channel,
				sdkResumeOutcome: event.data.sdkResumeOutcome,
				sdkResumeAttemptCount: event.data.sdkResumeAttemptCount,
				sdkResumeDurationMs: event.data.sdkResumeDurationMs,
			})), [
				{ channel: 'session', sdkResumeOutcome: 'success', sdkResumeAttemptCount: 1, sdkResumeDurationMs: 20 },
				{ channel: 'defaultChat', sdkResumeOutcome: 'notStarted', sdkResumeAttemptCount: 0, sdkResumeDurationMs: undefined },
			]);
		});
	});

	test('emits one failure outcome and rethrows the subscription error', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new AgentHostSessionOpenTelemetry(telemetryService));
		const expectedError = new Error('Restore failed');

		await assert.rejects(service.withSubscription(defaultChat, async telemetry => {
			telemetry.setServedFromMemory(false);
			telemetry.restoreStarted(false);
			throw expectedError;
		}), error => error === expectedError);

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			outcome: event.data.outcome,
			servedFromMemory: event.data.servedFromMemory,
			joinedRestore: event.data.joinedRestore,
		})), [{
			outcome: 'failure',
			servedFromMemory: false,
			joinedRestore: false,
		}]);
	});

	test('emits a bounded timeout and ignores non-Copilot subscriptions', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new AgentHostSessionOpenTelemetry(telemetryService));
			assert.strictEqual(await service.withSubscription(AgentSession.uri('claude', 'session'), async () => 'not measured'), 'not measured');
			const resume = new DeferredPromise<void>();
			const subscription = service.withSubscription(session, async telemetry => {
				telemetry.setServedFromMemory(false);
				telemetry.restoreStarted(false);
				await timeout(10_000);
				await service.withSdkResume(session, () => resume.p);
			});

			await timeout(10_000);
			await timeout(AgentHostCopilotSessionSubscribeTimeoutMs - 10_000);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.copilotSessionSubscribe',
				data: {
					channel: 'session',
					outcome: 'timeout',
					servedFromMemory: false,
					joinedRestore: false,
					sdkResumeOutcome: 'incomplete',
					sdkResumeAttemptCount: 1,
					timeToRestoreStartMs: 0,
					timeToSdkResumeStartMs: 10_000,
					sdkResumeDurationMs: 50_000,
					timeToSdkResumeCompleteMs: undefined,
					timeToRestoreCompleteMs: undefined,
					totalDurationMs: AgentHostCopilotSessionSubscribeTimeoutMs,
				},
			}]);
			resume.complete();
			await subscription;
		});
	});
});
