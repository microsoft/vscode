/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { SESSION_OPEN_TIMEOUT_MS, SessionOpenTelemetryService } from '../../browser/sessionOpenTelemetryService.js';

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

suite('SessionOpenTelemetryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('test:///session');
	const chatResource = URI.parse('test:///chat');

	test('emits ordered success milestones after model binding and session loading', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
			await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
				await timeout(10);
				service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, true);
				service.sessionActivated(attempt, chatResource);
				await timeout(10);
				service.modelBound(sessionResource, chatResource);
				await timeout(10);
				service.sessionLoaded(attempt);
			});

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agents/sessionOpen',
				data: {
					outcome: 'success',
					source: 'sessionsList',
					provider: 'local-agent-host',
					alreadyActive: false,
					sessionWasLoading: true,
					modelAlreadyBound: false,
					resourceResolvedDurationMs: 10,
					sessionLoadedDurationMs: 30,
					modelBoundDurationMs: 30,
					totalDurationMs: 30,
				},
			}]);
		});
	});

	test('completes repeated opens when the model is already bound', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		service.modelBound(sessionResource, chatResource);
		await service.withOpenRequest('navigation', CancellationToken.None, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'default-copilot', true, false);
			service.sessionActivated(attempt, chatResource);
			service.sessionLoaded(attempt);
		});

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			name: event.name,
			outcome: event.data.outcome,
			source: event.data.source,
			provider: event.data.provider,
			alreadyActive: event.data.alreadyActive,
			sessionWasLoading: event.data.sessionWasLoading,
			modelAlreadyBound: event.data.modelAlreadyBound,
		})), [{
			name: 'agents/sessionOpen',
			outcome: 'success',
			source: 'navigation',
			provider: 'default-copilot',
			alreadyActive: true,
			sessionWasLoading: false,
			modelAlreadyBound: true,
		}]);
	});

	test('emits cancellation for superseded attempts exactly once', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		const firstToken = disposables.add(new CancellationTokenSource());
		const releaseFirst = new DeferredPromise<void>();
		const first = service.withOpenRequest('link', firstToken.token, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'extension-provider', false, false);
			service.sessionActivated(attempt, chatResource);
			await releaseFirst.p;
			throw new Error('Superseded request failed late');
		});
		const second = service.withOpenRequest('chat', CancellationToken.None, async attempt => {
			service.sessionResolved(attempt, URI.parse('test:///second'), 'agenthost-example.internal:1234', false, false);
			service.sessionActivated(attempt, URI.parse('test:///second-chat'));
			throw new Error('Second request failed');
		});
		const failures = Promise.all([assert.rejects(first), assert.rejects(second)]);
		firstToken.cancel();
		releaseFirst.complete();
		await failures;

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			outcome: event.data.outcome,
			source: event.data.source,
			provider: event.data.provider,
		})), [
			{ outcome: 'cancelled', source: 'link', provider: 'other' },
			{ outcome: 'failure', source: 'chat', provider: 'remote-agent-host' },
		]);
	});

	test('preserves a model bind failure reported before chat activation', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));

		await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, true);
			service.modelBindFailed(sessionResource, chatResource);
			service.sessionActivated(attempt, chatResource);
			service.sessionLoaded(attempt);
		});

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			outcome: event.data.outcome,
			provider: event.data.provider,
			sessionWasLoading: event.data.sessionWasLoading,
		})), [{
			outcome: 'failure',
			provider: 'local-agent-host',
			sessionWasLoading: true,
		}]);
	});

	test('emits bounded timeout without content-bearing fields', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
			const release = new DeferredPromise<void>();
			const request = service.withOpenRequest('unknown', CancellationToken.None, async () => release.p);

			await timeout(SESSION_OPEN_TIMEOUT_MS);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agents/sessionOpen',
				data: {
					outcome: 'timeout',
					source: 'unknown',
					provider: 'unknown',
					alreadyActive: undefined,
					sessionWasLoading: undefined,
					modelAlreadyBound: undefined,
					resourceResolvedDurationMs: undefined,
					sessionLoadedDurationMs: undefined,
					modelBoundDurationMs: undefined,
					totalDurationMs: SESSION_OPEN_TIMEOUT_MS,
				},
			}]);
			release.complete();
			await request;
		});
	});
});
