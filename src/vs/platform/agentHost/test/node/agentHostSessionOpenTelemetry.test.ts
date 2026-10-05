/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession, CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, type IAgent } from '../../common/agent.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostSessionOpenTelemetry, AgentHostSessionSubscribeTimeoutMs } from '../../node/agentHostSessionOpenTelemetry.js';

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
	const createService = (telemetryService: TestTelemetryService, providers: readonly string[] = ['copilotcli']) => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(IAgentHostProviderService, {
			getProviderForSession: session => {
				const provider = AgentSession.provider(session);
				if (!provider || !providers.includes(provider)) {
					return undefined;
				}
				const providerId = provider;
				return new class extends mock<IAgent>() {
					override readonly id = providerId;
				};
			},
		});
		return disposables.add(instantiationService.createInstance(AgentHostSessionOpenTelemetry));
	};

	test('emits ordered subscribe, restore, and SDK resume milestones', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = createService(telemetryService);
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
				name: 'agentHost.sessionSubscribe',
				data: {
					provider: 'copilotcli',
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
			const service = createService(telemetryService);
			await service.withSubscription(session, async telemetry => telemetry.setServedFromMemory(true));

			assert.deepStrictEqual(telemetryService.events.map(event => event.data), [{
				provider: 'copilotcli',
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
			const service = createService(telemetryService);
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
			const service = createService(telemetryService);
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
		const service = createService(telemetryService);
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

	test('emits subscription telemetry for current and future providers', async () => {
		const telemetryService = new TestTelemetryService();
		const providers = [CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, 'future'];
		const service = createService(telemetryService, providers);
		for (const provider of [CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, 'future']) {
			await service.withSubscription(AgentSession.uri(provider, 'session'), async telemetry => {
				telemetry.setServedFromMemory(false);
				telemetry.restoreStarted(false);
				telemetry.restoreCompleted();
			});
		}
		const terminalResult = await service.withSubscription(URI.parse('agenthost-terminal:/terminal'), async () => 'terminal');
		const unknownResult = await service.withSubscription(AgentSession.uri('unknown', 'session'), async () => 'unknown');

		assert.deepStrictEqual({
			terminalResult,
			unknownResult,
			events: telemetryService.events.map(event => ({
				name: event.name,
				provider: event.data.provider,
				channel: event.data.channel,
				outcome: event.data.outcome,
				sdkResumeOutcome: event.data.sdkResumeOutcome,
				sdkResumeAttemptCount: event.data.sdkResumeAttemptCount,
			})),
		}, {
			terminalResult: 'terminal',
			unknownResult: 'unknown',
			events: [
				{ name: 'agentHost.sessionSubscribe', provider: 'claude', channel: 'session', outcome: 'success', sdkResumeOutcome: undefined, sdkResumeAttemptCount: undefined },
				{ name: 'agentHost.sessionSubscribe', provider: 'codex', channel: 'session', outcome: 'success', sdkResumeOutcome: undefined, sdkResumeAttemptCount: undefined },
				{ name: 'agentHost.sessionSubscribe', provider: 'future', channel: 'session', outcome: 'success', sdkResumeOutcome: undefined, sdkResumeAttemptCount: undefined },
			],
		});
	});

	test('emits a bounded timeout', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = createService(telemetryService);
			const resume = new DeferredPromise<void>();
			const subscription = service.withSubscription(session, async telemetry => {
				telemetry.setServedFromMemory(false);
				telemetry.restoreStarted(false);
				await timeout(10_000);
				await service.withSdkResume(session, () => resume.p);
			});

			await timeout(10_000);
			await timeout(AgentHostSessionSubscribeTimeoutMs - 10_000);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.sessionSubscribe',
				data: {
					provider: 'copilotcli',
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
					totalDurationMs: AgentHostSessionSubscribeTimeoutMs,
				},
			}]);
			resume.complete();
			await subscription;
		});
	});
});
