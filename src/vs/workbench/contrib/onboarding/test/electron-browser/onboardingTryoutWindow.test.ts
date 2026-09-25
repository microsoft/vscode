/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { isUUID } from '../../../../../base/common/uuid.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IOnboardingTryoutHandoffService, IOnboardingTryoutRunOptions, IOnboardingTryoutWindowRequest, OnboardingTryoutWindowRequestResult } from '../../../../../platform/onboarding/common/onboardingTryoutHandoff.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ITelemetryData } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { OnboardingTryoutService } from '../../browser/onboardingTryoutService.js';
import { AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND, IOnboardingTryoutScenario, IOnboardingTryoutService, onboardingTryoutPresentationRegistry, OnboardingTryoutAvailability, OnboardingTryoutResult, registerOnboardingTryout, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../../common/onboardingTryout.js';
import { NativeOnboardingTryoutWindow } from '../../electron-browser/onboardingTryoutWindow.js';
import { NativeOnboardingTryoutContribution } from '../../electron-browser/onboardingTryout.contribution.js';

class TestTryoutService extends mock<IOnboardingTryoutService>() {
	readonly tryouts = new Map<string, IOnboardingTryoutScenario>();
	readonly runs: { readonly id: string; readonly token: CancellationToken; readonly options?: IOnboardingTryoutRunOptions }[] = [];
	runHandler: (id: string, token: CancellationToken) => Promise<OnboardingTryoutResult> = async () => ({ kind: 'executed' });

	override getTryout(id: string): IOnboardingTryoutScenario | undefined {
		return this.tryouts.get(id);
	}

	override getAvailability(): OnboardingTryoutAvailability {
		return { kind: 'ready' };
	}

	override run(id: string, token = CancellationToken.None, options?: IOnboardingTryoutRunOptions): Promise<OnboardingTryoutResult> {
		this.runs.push({ id, token, options });
		return this.runHandler(id, token);
	}

}

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { readonly id: string; readonly args: readonly unknown[] }[] = [];
	error: Error | undefined;

	override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
		this.calls.push({ id, args });
		if (this.error) {
			throw this.error;
		}
		return undefined;
	}
}

suite('NativeOnboardingTryoutWindow', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());
	const tryout: IOnboardingTryoutScenario = {
		id: 'test.agentsExample',
		trigger: { kind: 'command', commandId: RUN_ONBOARDING_TRYOUT_COMMAND_ID },
		tryout: { title: 'Example', description: 'An Agents window example.', targetWindow: 'agents' },
		presentation: { kind: 'test', payload: undefined },
	};
	const createRequest = (tryoutId = tryout.id, requestId = '01234567-89ab-4cde-8fab-0123456789ab'): IOnboardingTryoutWindowRequest => ({ requestId, tryoutId, source: 'direct' });

	test('early routing registration and availability do not initialize a coordinator or execution services', () => {
		const instantiation = store.add(new TestInstantiationService());
		const construction = sinon.spy(instantiation, 'createInstance');
		const contribution = store.add(new NativeOnboardingTryoutContribution(instantiation, upcastPartial<INativeWorkbenchEnvironmentService>({ isSessionsWindow: true })));
		const availability = onboardingTryoutPresentationRegistry.get(AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND)?.getAvailability(tryout);
		contribution.dispose();
		assert.deepStrictEqual({ availability, constructions: construction.callCount, registered: onboardingTryoutPresentationRegistry.get(AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND) }, {
			availability: { kind: 'ready' }, constructions: 0, registered: undefined,
		});
	});

	function createWindow(isSessionsWindow = true, whenRestored = Promise.resolve(), service?: IOnboardingTryoutService) {
		const instantiationService = store.add(new TestInstantiationService());
		const tryoutService = new TestTryoutService();
		tryoutService.tryouts.set(tryout.id, tryout);
		const commands = new TestCommandService();
		const nativeCalls: IOnboardingTryoutWindowRequest[] = [];
		const nativeCancellations: string[] = [];
		const nativeCompletions: { readonly requestId: string; readonly result: OnboardingTryoutWindowRequestResult }[] = [];
		const notificationErrors: (string | Error)[] = [];
		const loggedErrors: unknown[][] = [];
		instantiationService.stub(IOnboardingTryoutService, service ?? tryoutService);
		instantiationService.stub(ICommandService, commands);
		instantiationService.stub(IOnboardingTryoutHandoffService, {
			open: async request => { nativeCalls.push(request); return 'accepted'; },
			cancel: async requestId => { nativeCancellations.push(requestId); },
			complete: async (requestId, result) => { nativeCompletions.push({ requestId, result }); },
		});
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow });
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override error(error: string | Error) {
				notificationErrors.push(error);
				return super.error(error);
			}
		});
		instantiationService.stub(ILogService, store.add(new class extends NullLogService {
			override error(message: string | Error, ...args: unknown[]): void {
				loggedErrors.push([message, ...args]);
			}
		}));
		let receiver: NativeOnboardingTryoutWindow;
		const createBridge = () => receiver = store.add(instantiationService.createInstance(NativeOnboardingTryoutWindow, whenRestored));
		const bridge = createBridge();
		const requests = { fire: (args: readonly unknown[]) => receiver.startRequest(args) };
		const cancellations = { fire: (args: readonly unknown[]) => receiver.cancelRequest(args) };
		return { bridge, createBridge, requests, cancellations, tryoutService, commands, nativeCalls, nativeCancellations, nativeCompletions, notificationErrors, loggedErrors, instantiationService };
	}

	test('forwards the registered identifier and bounded source through the dedicated handoff', async () => {
		const context = createWindow(false);

		await context.bridge.open(tryout.id, CancellationToken.None);
		const forwarded = context.nativeCalls[0];
		context.bridge.dispose();

		assert.deepStrictEqual({
			requestCount: context.nativeCalls.length,
			tryoutId: forwarded?.tryoutId,
			source: forwarded?.source,
			validRequestId: forwarded ? isUUID(forwarded.requestId) : false,
			runs: context.tryoutService.runs,
		}, {
			requestCount: 1,
			tryoutId: tryout.id,
			source: 'direct',
			validRequestId: true,
			runs: [],
		});
	});

	test('preserves attribution from the source to the destination run', async () => {
		const source = createWindow(false);
		const destination = createWindow();
		const options: IOnboardingTryoutRunOptions = { source: 'releaseNotes', runId: '01234567-89ab-4cde-8fab-0123456789ab' };
		await source.bridge.open(tryout.id, CancellationToken.None, options);
		destination.requests.fire(source.nativeCalls);
		await timeout(0);

		assert.deepStrictEqual({
			requests: source.nativeCalls,
			runs: destination.tryoutService.runs.map(({ id, options }) => ({ id, options })),
		}, {
			requests: [{ requestId: options.runId, tryoutId: tryout.id, source: 'releaseNotes' }],
			runs: [{ id: tryout.id, options }],
		});
	});

	for (const source of ['releaseNotes', 'externalLink'] as const) {
		test(`reports one correlated lifecycle in the destination after a ${source} handoff`, async () => {
			const events: { readonly isSessionsWindow: boolean; readonly name: string; readonly data?: ITelemetryData }[] = [];
			const started = new DeferredPromise<void>();
			const prepared = new DeferredPromise<void>();
			const launch = new DeferredPromise<void>();
			const finish = new DeferredPromise<void>();
			const accepted = new DeferredPromise<OnboardingTryoutWindowRequestResult>();
			const createService = (isSessionsWindow: boolean) => store.add(new OnboardingTryoutService(
				store.add(new ContextKeyService(new TestConfigurationService())),
				upcastPartial<IChatEntitlementService>({
					onDidChangeSentiment: Event.None,
					onDidChangeEntitlement: Event.None,
					onDidChangeAnonymous: Event.None,
				}),
				upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow }),
				new class extends NullTelemetryServiceShape {
					override publicLog2(name?: string, data?: ITelemetryData): void {
						if (name) {
							events.push({ isSessionsWindow, name, data });
						}
						if (name === 'onboarding.tryoutStarted') {
							started.complete();
						}
					}
				},
			));
			const sourceService = createService(false);
			const destinationService = createService(true);
			const destinationRun = sinon.spy(destinationService, 'run');
			const origin = createWindow(false, Promise.resolve(), sourceService);
			const destination = createWindow(true, Promise.resolve(), destinationService);
			origin.instantiationService.stub(IOnboardingTryoutHandoffService, 'open', async (request: IOnboardingTryoutWindowRequest) => {
				origin.nativeCalls.push(request);
				destination.requests.fire([request]);
				return accepted.p;
			});
			destination.instantiationService.stub(IOnboardingTryoutHandoffService, 'complete', async (requestId: string, result: OnboardingTryoutWindowRequestResult) => {
				destination.nativeCompletions.push({ requestId, result });
				await accepted.complete(result);
			});
			store.add(new NativeOnboardingTryoutContribution(origin.instantiationService, upcastPartial<INativeWorkbenchEnvironmentService>({ isSessionsWindow: false })));
			store.add(registerOnboardingTryout({ id: tryout.id, ...tryout.tryout, presentation: tryout.presentation }));
			store.add(onboardingTryoutPresentationRegistry.register({
				kind: tryout.presentation.kind,
				getAvailability: () => ({ kind: 'ready' }),
				prepare: async (_scenario, context) => {
					prepared.complete();
					await launch.p;
					return {
						kind: 'ready',
						run: async () => {
							context.onDidLaunch?.('prepared');
							await finish.p;
							return { kind: 'prepared' };
						},
					};
				},
			}));

			const routed = await sourceService.run(tryout.id, CancellationToken.None, { source });
			await prepared.p;
			const beforeLaunch = [...events];
			launch.complete();
			await started.p;
			const beforeFinish = events.map(event => event.name);
			finish.complete();
			await destinationRun.firstCall.returnValue;
			const request = origin.nativeCalls[0];

			assert.deepStrictEqual({
				routed,
				beforeLaunch,
				beforeFinish,
				requests: origin.nativeCalls.length,
				validRunId: isUUID(request.requestId),
				completions: destination.nativeCompletions,
				events: events.map(event => ({
					...event,
					data: {
						...event.data,
						...(event.data?.durationMs !== undefined ? { durationMs: typeof event.data.durationMs === 'number' && event.data.durationMs >= 0 } : {}),
					},
				})),
				errors: [...origin.notificationErrors, ...destination.notificationErrors, ...origin.loggedErrors, ...destination.loggedErrors],
			}, {
				routed: { kind: 'routed' },
				beforeLaunch: [],
				beforeFinish: ['onboarding.tryoutStarted'],
				requests: 1,
				validRunId: true,
				completions: [{ requestId: request.requestId, result: 'accepted' }],
				events: [
					{ isSessionsWindow: true, name: 'onboarding.tryoutStarted', data: { tryoutId: tryout.id, source, runId: request.requestId } },
					{ isSessionsWindow: true, name: 'onboarding.tryoutOutcome', data: { tryoutId: tryout.id, source, runId: request.requestId, result: 'prepared', launchResult: 'prepared', guidanceOutcome: undefined, dismissReason: undefined, durationMs: true } },
				],
				errors: [],
			});
		});
	}

	test('does not dispatch a cancelled native open', async () => {
		const context = createWindow(false);

		await assert.rejects(context.bridge.open(tryout.id, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(context.nativeCalls, []);
	});

	test('cancels a native request while the Agents window is opening', async () => {
		const context = createWindow(false);
		const nativeResult = new DeferredPromise<OnboardingTryoutWindowRequestResult>();
		context.instantiationService.stub(IOnboardingTryoutHandoffService, 'open', async (request: IOnboardingTryoutWindowRequest) => {
			context.nativeCalls.push(request);
			return nativeResult.p;
		});
		const cancellation = store.add(new CancellationTokenSource());

		const pending = context.bridge.open(tryout.id, cancellation.token);
		await timeout(0);
		cancellation.cancel();
		await timeout(0);
		nativeResult.complete('cancelled');

		await assert.rejects(pending, isCancellationError);
		assert.deepStrictEqual(context.nativeCancellations, [context.nativeCalls[0].requestId]);
	});

	test('propagates native open failures to the shared command', async () => {
		const context = createWindow(false);
		const error = new Error('Window could not be opened');
		context.instantiationService.stub(IOnboardingTryoutHandoffService, 'open', async () => { throw error; });

		await assert.rejects(context.bridge.open(tryout.id, CancellationToken.None), candidate => candidate === error);
	});

	test('queues an initial request until contributions have registered the destination example', async () => {
		const restored = new DeferredPromise<void>();
		const context = createWindow(true, restored.p);
		context.tryoutService.tryouts.clear();

		context.requests.fire([createRequest()]);
		await timeout(0);
		const beforeRestore = context.tryoutService.runs.length;
		context.tryoutService.tryouts.set(tryout.id, tryout);
		await restored.complete();
		await timeout(0);

		assert.deepStrictEqual({
			beforeRestore,
			runs: context.tryoutService.runs.map(run => run.id),
			completions: context.nativeCompletions,
			errors: context.notificationErrors,
		}, {
			beforeRestore: 0,
			runs: [tryout.id],
			completions: [{ requestId: createRequest().requestId, result: 'accepted' }],
			errors: [],
		});
	});

	test('dispatches a reused-window request through the guarded service', async () => {
		const context = createWindow();
		context.requests.fire([createRequest()]);
		await timeout(0);

		assert.deepStrictEqual({
			runs: context.tryoutService.runs.map(run => run.id),
			completions: context.nativeCompletions,
		}, {
			runs: [tryout.id],
			completions: [{ requestId: createRequest().requestId, result: 'accepted' }],
		});
	});

	test('does not replay a consumed initial request when the receiver is recreated', async () => {
		const context = createWindow();
		context.requests.fire([createRequest()]);
		await timeout(0);
		context.bridge.dispose();
		context.createBridge();
		await timeout(0);
		const runsAfterReload = context.tryoutService.runs.length;
		context.requests.fire([createRequest(tryout.id, '11234567-89ab-4cde-8fab-0123456789ab')]);
		await timeout(0);

		assert.deepStrictEqual({ runsAfterReload, runs: context.tryoutService.runs.map(run => run.id) }, {
			runsAfterReload: 1,
			runs: [tryout.id, tryout.id],
		});
	});

	test('does not dispatch a pending initial request after the receiver is disposed', async () => {
		const restored = new DeferredPromise<void>();
		const context = createWindow(true, restored.p);
		context.requests.fire([createRequest()]);
		context.bridge.dispose();
		await restored.complete();
		await timeout(0);

		assert.deepStrictEqual({
			runs: context.tryoutService.runs,
			completions: context.nativeCompletions,
			errors: context.notificationErrors,
		}, {
			runs: [],
			completions: [{ requestId: createRequest().requestId, result: 'cancelled' }],
			errors: [],
		});
	});

	test('does not consume destination requests in a normal workbench window', async () => {
		const context = createWindow(false);
		context.requests.fire([createRequest()]);
		await timeout(0);

		assert.deepStrictEqual(context.tryoutService.runs, []);
	});

	for (const { name, args } of [
		{ name: 'missing request', args: [] },
		{ name: 'empty request', args: [{}] },
		{ name: 'non-object request', args: [42] },
		{ name: 'invalid request ID', args: [{ requestId: '', tryoutId: tryout.id }] },
		{ name: 'invalid source', args: [{ ...createRequest(), source: 'https://example.com/private' }] },
		{ name: 'missing source', args: [{ requestId: createRequest().requestId, tryoutId: tryout.id }] },
		{ name: 'command object', args: [{ id: tryout.id, command: 'arbitrary.command', arguments: [] }] },
		{ name: 'extra object keys', args: [{ ...createRequest(), command: 'arbitrary.command' }] },
		{ name: 'command URI', args: [createRequest('command:arbitrary.command')] },
		{ name: 'oversized ID', args: [createRequest('a'.repeat(129))] },
		{ name: 'extra arguments', args: [createRequest(), 'extra'] },
		{ name: 'unregistered ID', args: [createRequest('test.unknownExample')] },
	]) {
		test(`rejects and reports ${name} without running a tryout`, async () => {
			const context = createWindow();
			context.requests.fire(args);
			await timeout(0);

			assert.deepStrictEqual({
				runs: context.tryoutService.runs,
				notifications: context.notificationErrors.length,
				logs: context.loggedErrors.length,
			}, { runs: [], notifications: 1, logs: 1 });
		});
	}

	test('rejects an example registered for a different window', async () => {
		const context = createWindow();
		context.tryoutService.tryouts.set(tryout.id, { ...tryout, tryout: { ...tryout.tryout, targetWindow: undefined } });
		context.requests.fire([createRequest()]);
		await timeout(0);

		assert.deepStrictEqual({
			runs: context.tryoutService.runs,
			completions: context.nativeCompletions,
			notifications: context.notificationErrors.length,
			logs: context.loggedErrors.length,
		}, {
			runs: [],
			completions: [{ requestId: createRequest().requestId, result: 'rejected' }],
			notifications: 1,
			logs: 1,
		});
	});

	test('rechecks registration after waiting for restore', async () => {
		const restored = new DeferredPromise<void>();
		const context = createWindow(true, restored.p);
		context.requests.fire([createRequest()]);
		context.tryoutService.tryouts.delete(tryout.id);
		await restored.complete();
		await timeout(0);

		assert.deepStrictEqual({
			runs: context.tryoutService.runs,
			completions: context.nativeCompletions,
			notifications: context.notificationErrors.length,
			logs: context.loggedErrors.length,
		}, {
			runs: [],
			completions: [{ requestId: createRequest().requestId, result: 'rejected' }],
			notifications: 1,
			logs: 1,
		});
	});

	test('logs and reports destination run failures', async () => {
		const context = createWindow();
		const error = new Error('Destination run failed');
		context.tryoutService.runHandler = async () => { throw error; };
		context.requests.fire([createRequest()]);
		await timeout(0);

		assert.deepStrictEqual({
			errors: context.notificationErrors,
			logs: context.loggedErrors,
		}, {
			errors: [error.message],
			logs: [
				['[OnboardingTryout] Launch failed', error],
				['[OnboardingTryout] Native handoff failed', error],
			],
		});
	});

	test('the latest request supersedes one waiting for restoration', async () => {
		const restored = new DeferredPromise<void>();
		const context = createWindow(true, restored.p);
		const otherTryout = { ...tryout, id: 'test.otherAgentsExample' };
		context.tryoutService.tryouts.set(otherTryout.id, otherTryout);
		const first = createRequest(tryout.id, '01234567-89ab-4cde-8fab-0123456789ab');
		const second = createRequest(otherTryout.id, '11234567-89ab-4cde-8fab-0123456789ab');

		context.requests.fire([first]);
		context.requests.fire([second]);
		await restored.complete();
		await timeout(0);

		assert.deepStrictEqual({
			runs: context.tryoutService.runs.map(run => run.id),
			completions: context.nativeCompletions,
		}, {
			runs: [otherTryout.id],
			completions: [
				{ requestId: first.requestId, result: 'superseded' },
				{ requestId: second.requestId, result: 'accepted' },
			],
		});
	});

	test('the latest request cancels an active destination run', async () => {
		const context = createWindow();
		const otherTryout = { ...tryout, id: 'test.otherAgentsExample' };
		context.tryoutService.tryouts.set(otherTryout.id, otherTryout);
		const firstStarted = new DeferredPromise<void>();
		context.tryoutService.runHandler = async (_id, token) => {
			if (!firstStarted.isSettled) {
				firstStarted.complete();
				const cancelled = new DeferredPromise<void>();
				store.add(token.onCancellationRequested(() => cancelled.complete()));
				await cancelled.p;
				return { kind: 'cancelled' };
			}
			return { kind: 'executed' };
		};
		const first = createRequest(tryout.id, '01234567-89ab-4cde-8fab-0123456789ab');
		const second = createRequest(otherTryout.id, '11234567-89ab-4cde-8fab-0123456789ab');

		context.requests.fire([first]);
		await firstStarted.p;
		context.requests.fire([second]);
		await timeout(0);

		assert.deepStrictEqual({
			cancelled: context.tryoutService.runs[0].token.isCancellationRequested,
			runs: context.tryoutService.runs.map(run => run.id),
			completions: context.nativeCompletions,
		}, {
			cancelled: true,
			runs: [tryout.id, otherTryout.id],
			completions: [
				{ requestId: first.requestId, result: 'accepted' },
				{ requestId: first.requestId, result: 'superseded' },
				{ requestId: second.requestId, result: 'accepted' },
			],
		});
	});

	test('a source cancellation stops the matching destination run', async () => {
		const context = createWindow();
		const started = new DeferredPromise<void>();
		context.tryoutService.runHandler = async (_id, token) => {
			started.complete();
			const cancelled = new DeferredPromise<void>();
			store.add(token.onCancellationRequested(() => cancelled.complete()));
			await cancelled.p;
			return { kind: 'cancelled' };
		};
		const active = createRequest();

		context.requests.fire([active]);
		await started.p;
		context.cancellations.fire([active.requestId]);
		await timeout(0);

		assert.deepStrictEqual({
			cancelled: context.tryoutService.runs[0].token.isCancellationRequested,
			completions: context.nativeCompletions,
		}, {
			cancelled: true,
			completions: [{ requestId: active.requestId, result: 'accepted' }],
		});
	});
});
