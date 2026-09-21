/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ISessionTerminalRenderObserver, SESSION_OPEN_TIMEOUT_MS, SessionOpenTelemetryService } from '../../browser/sessionOpenTelemetryService.js';

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

	function terminalView(service: SessionOpenTelemetryService, resource = sessionResource, chat = chatResource) {
		const observers: ISessionTerminalRenderObserver[] = [];
		let disposed = 0;
		const registration = disposables.add(service.registerTerminalView(resource, chat, observer => {
			observers.push(observer);
			return toDisposable(() => disposed++);
		}));
		return { observers, registration, get disposed() { return disposed; } };
	}

	test('emits ordered success milestones after model binding and session loading', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
			await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
				await timeout(10);
				service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, true);
				service.sessionActivationStarted(attempt);
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
					presentation: 'chat',
					alreadyActive: false,
					sessionWasLoading: true,
					modelAlreadyBound: false,
					resourceResolvedDurationMs: 10,
					sessionLoadedDurationMs: 30,
					modelBoundDurationMs: 30,
					terminalRenderReadyDurationMs: undefined,
					terminalActivationToRenderReadyDurationMs: undefined,
					terminalRenderReadyKind: undefined,
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

	test('separates terminal opens from chat opens', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
			const view = terminalView(service);
			await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
				service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, false, 'terminal');
				service.sessionActivationStarted(attempt);
				service.sessionActivated(attempt, chatResource);
				service.modelBound(sessionResource, chatResource);
				service.sessionLoaded(attempt);
			});
			const beforeRender = telemetryService.events.length;
			view.observers[0].onReady('render');

			assert.deepStrictEqual({
				beforeRender,
				events: telemetryService.events.map(event => ({
					outcome: event.data.outcome, presentation: event.data.presentation,
					modelAlreadyBound: event.data.modelAlreadyBound, modelBoundDurationMs: event.data.modelBoundDurationMs,
				})),
			}, { beforeRender: 0, events: [{ outcome: 'success', presentation: 'terminal', modelAlreadyBound: undefined, modelBoundDurationMs: undefined }] });
		});
	});

	test('records terminal activation and render readiness independently of later session loading', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
			const view = terminalView(service);
			let beforeLoaded = 0;
			await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
				await timeout(5);
				service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, true, 'terminal');
				await timeout(5);
				service.sessionActivationStarted(attempt);
				await timeout(10);
				view.observers[0].onReady('render');
				beforeLoaded = telemetryService.events.length;
				await timeout(20);
				service.sessionActivated(attempt, chatResource);
				service.sessionLoaded(attempt);
			});
			assert.deepStrictEqual({
				beforeLoaded, disposed: view.disposed, events: telemetryService.events,
			}, {
				beforeLoaded: 0, disposed: 1,
				events: [{
					name: 'agents/sessionOpen',
					data: {
						outcome: 'success',
						source: 'sessionsList',
						provider: 'local-agent-host',
						presentation: 'terminal',
						alreadyActive: false,
						sessionWasLoading: true,
						modelAlreadyBound: undefined,
						resourceResolvedDurationMs: 5,
						sessionLoadedDurationMs: 40,
						modelBoundDurationMs: undefined,
						terminalRenderReadyDurationMs: 20,
						terminalActivationToRenderReadyDurationMs: 10,
						terminalRenderReadyKind: 'render',
						totalDurationMs: 40,
					},
				}],
			});
		});
	});

	test('rearms a registered warm terminal for every open instead of caching readiness across attempts', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		const view = terminalView(service);
		const beforeRender: number[] = [];
		for (let index = 0; index < 3; index++) {
			await service.withOpenRequest('navigation', CancellationToken.None, async attempt => {
				service.sessionResolved(attempt, sessionResource, 'local-agent-host', true, false, 'terminal');
				service.sessionActivationStarted(attempt);
				service.sessionActivated(attempt, chatResource);
				service.sessionLoaded(attempt);
			});
			beforeRender.push(telemetryService.events.length);
			view.observers[index].onReady('existingRender');
		}
		assert.deepStrictEqual({
			beforeRender, observed: view.observers.length, disposed: view.disposed,
			outcomes: telemetryService.events.map(event => event.data.outcome),
		}, { beforeRender: [0, 1, 2], observed: 3, disposed: 3, outcomes: ['success', 'success', 'success'] });
	});

	test('a visible terminal registering after session loading still completes the current attempt', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, false, 'terminal');
			service.sessionActivationStarted(attempt);
			service.sessionActivated(attempt, chatResource);
			service.sessionLoaded(attempt);
		});
		const beforeRegistration = telemetryService.events.length;
		const view = terminalView(service);
		view.observers[0].onReady('render');
		assert.deepStrictEqual({
			beforeRegistration,
			outcomes: telemetryService.events.map(event => event.data.outcome), disposed: view.disposed,
		}, { beforeRegistration: 0, outcomes: ['success'], disposed: 1 });
	});

	test('ignores stale ready, failure and cancellation callbacks when the same session is opened again', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		const view = terminalView(service);
		for (let index = 0; index < 2; index++) {
			await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
				service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, false, 'terminal');
				service.sessionActivationStarted(attempt);
				service.sessionActivated(attempt, chatResource);
				service.sessionLoaded(attempt);
			});
		}
		view.observers[0].onReady('render');
		view.observers[0].onFailure();
		view.observers[0].onCancel();
		const beforeCurrent = telemetryService.events.map(event => event.data.outcome);
		view.observers[1].onReady('render');
		assert.deepStrictEqual({
			beforeCurrent, disposed: view.disposed,
			outcomes: telemetryService.events.map(event => event.data.outcome),
		}, { beforeCurrent: ['cancelled'], disposed: 2, outcomes: ['cancelled', 'success'] });
	});

	test('detaching a rendered view before loading invalidates its pending readiness', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		const previous = terminalView(service);
		let beforeCurrent = 0;
		await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, true, 'terminal');
			service.sessionActivationStarted(attempt);
			previous.observers[0].onReady('render');
			previous.registration.dispose();
			service.sessionActivated(attempt, chatResource);
			service.sessionLoaded(attempt);
			const current = terminalView(service);
			previous.observers[0].onReady('render');
			previous.observers[0].onFailure();
			beforeCurrent = telemetryService.events.length;
			current.observers[0].onReady('render');
		});
		assert.deepStrictEqual({
			beforeCurrent, previousDisposed: previous.disposed,
			outcomes: telemetryService.events.map(event => event.data.outcome),
		}, { beforeCurrent: 0, previousDisposed: 1, outcomes: ['success'] });
	});

	test('terminal readiness must belong to the activated chat and not an outgoing view', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		const previous = terminalView(service);
		const nextChat = URI.parse('test:///next-chat');
		await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, false, 'terminal');
			service.sessionActivationStarted(attempt);
			service.sessionActivated(attempt, nextChat);
			service.sessionLoaded(attempt);
		});
		previous.observers[0].onReady('render');
		previous.observers[0].onFailure();
		const beforeCurrent = telemetryService.events.length;
		const current = terminalView(service, sessionResource, nextChat);
		previous.registration.dispose();
		current.observers[0].onReady('render');
		assert.deepStrictEqual({
			beforeCurrent, previousDisposed: previous.disposed,
			outcomes: telemetryService.events.map(event => event.data.outcome),
		}, { beforeCurrent: 0, previousDisposed: 1, outcomes: ['success'] });
	});

	test('reobserving the same registered view cannot reuse an earlier callback from the same attempt', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		const view = terminalView(service);
		let beforeCurrent = 0;
		await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, false, 'terminal');
			service.sessionActivationStarted(attempt);
			service.sessionActivated(attempt, URI.parse('test:///different-chat'));
			service.sessionActivated(attempt, chatResource);
			service.sessionLoaded(attempt);
			view.observers[0].onReady('render');
			view.observers[0].onFailure();
			beforeCurrent = telemetryService.events.length;
			view.observers[1].onReady('render');
		});
		assert.deepStrictEqual({
			beforeCurrent, disposed: view.disposed,
			outcomes: telemetryService.events.map(event => event.data.outcome),
		}, { beforeCurrent: 0, disposed: 2, outcomes: ['success'] });
	});

	test('cancellation releases terminal observers and prevents later readiness from completing the request', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		const view = terminalView(service);
		const cancellation = disposables.add(new CancellationTokenSource());
		await service.withOpenRequest('sessionsList', cancellation.token, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, false, 'terminal');
			service.sessionActivationStarted(attempt);
			service.sessionActivated(attempt, chatResource);
			service.sessionLoaded(attempt);
		});
		cancellation.cancel();
		view.observers[0].onReady('render');
		assert.deepStrictEqual({
			disposed: view.disposed,
			outcomes: telemetryService.events.map(event => event.data.outcome),
		}, { disposed: 1, outcomes: ['cancelled'] });
	});

	test('an already cancelled request cannot complete synchronously', async () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
		await service.withOpenRequest('sessionsList', CancellationToken.Cancelled, async attempt => {
			service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, false);
			service.sessionActivated(attempt, chatResource);
			service.modelBound(sessionResource, chatResource);
			service.sessionLoaded(attempt);
		});
		assert.deepStrictEqual(telemetryService.events.map(event => event.data.outcome), ['cancelled']);
	});

	test('terminal timeout disposes its renderer observation without inventing a render milestone', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const telemetryService = new TestTelemetryService();
			const service = disposables.add(new SessionOpenTelemetryService(telemetryService));
			const view = terminalView(service);
			await service.withOpenRequest('sessionsList', CancellationToken.None, async attempt => {
				service.sessionResolved(attempt, sessionResource, 'local-agent-host', false, false, 'terminal');
				service.sessionActivationStarted(attempt);
				service.sessionActivated(attempt, chatResource);
				service.sessionLoaded(attempt);
			});
			await timeout(SESSION_OPEN_TIMEOUT_MS);
			view.observers[0].onReady('render');
			assert.deepStrictEqual({
				disposed: view.disposed,
				events: telemetryService.events.map(event => ({
					outcome: event.data.outcome, ready: event.data.terminalRenderReadyDurationMs,
					modelBound: event.data.modelBoundDurationMs, total: event.data.totalDurationMs,
				})),
			}, { disposed: 1, events: [{ outcome: 'timeout', ready: undefined, modelBound: undefined, total: SESSION_OPEN_TIMEOUT_MS }] });
		});
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
					presentation: 'chat',
					alreadyActive: undefined,
					sessionWasLoading: undefined,
					modelAlreadyBound: undefined,
					resourceResolvedDurationMs: undefined,
					sessionLoadedDurationMs: undefined,
					modelBoundDurationMs: undefined,
					terminalRenderReadyDurationMs: undefined,
					terminalActivationToRenderReadyDurationMs: undefined,
					terminalRenderReadyKind: undefined,
					totalDurationMs: SESSION_OPEN_TIMEOUT_MS,
				},
			}]);
			release.complete();
			await request;
		});
	});
});
