/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { OnboardingTryoutService } from '../../browser/onboardingTryoutService.js';
import { IOnboardingPresentation, onboardingPresentationRegistry } from '../../common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../../common/onboardingRegistry.js';
import { OnboardingDismissReason, OnboardingOutcome } from '../../common/onboardingScenario.js';
import { createOnboardingTryoutUri, IOnboardingTryout, IOnboardingTryoutRunContext, OnboardingTryoutAvailability, OnboardingTryoutPreparation, parseOnboardingTryoutArguments, parseOnboardingTryoutUri, registerOnboardingTryout, registerOnboardingTryoutPresentation, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../../common/onboardingTryout.js';

suite('OnboardingTryoutService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(agents = true) {
		const config = new TestConfigurationService();
		const context = store.add(new ContextKeyService(upcastPartial<IConfigurationService>(config)));
		const sentiment: IChatSentiment = { completed: true, installed: true };
		const changed = store.add(new Emitter<void>());
		const chat = upcastPartial<IChatEntitlementService>({
			sentiment,
			entitlement: ChatEntitlement.Pro,
			anonymous: false,
			hasByokModels: false,
			onDidChangeSentiment: changed.event,
			onDidChangeEntitlement: Event.None,
			onDidChangeAnonymous: Event.None,
		});
		const service = store.add(new OnboardingTryoutService(context, chat, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: agents })));
		return { service, context, sentiment, changed };
	}

	function registerTryout(overrides: Partial<IOnboardingTryout<undefined>> = {}) {
		return store.add(registerOnboardingTryout({
			id: 'test.tryout',
			title: 'Test example',
			description: 'Prepare the test example.',
			presentation: { kind: 'test.tryoutPresentation', payload: undefined },
			...overrides,
		}));
	}

	function registerPresentation(
		prepare: (context: IOnboardingTryoutRunContext) => Promise<OnboardingTryoutPreparation>,
		getAvailability: () => OnboardingTryoutAvailability = () => ({ kind: 'ready' }),
	) {
		return store.add(registerOnboardingTryoutPresentation({
			kind: 'test.tryoutPresentation',
			isPayload: (value: unknown): value is undefined => value === undefined,
			getAvailability,
			prepare: (_payload, context) => prepare(context),
		}));
	}

	test('registering and reading an example do not prepare or run it', () => {
		const { service } = createService();
		let prepared = 0;
		registerPresentation(async () => {
			prepared++;
			return { kind: 'ready', run: async () => ({ kind: 'executed' }) };
		});
		registerTryout();

		assert.deepStrictEqual({
			availability: service.getAvailability('test.tryout'),
			ids: service.getTryouts().map(scenario => scenario.id),
			trigger: service.getTryout('test.tryout')?.trigger,
			prepared,
		}, {
			availability: { kind: 'ready' },
			ids: ['test.tryout'],
			trigger: { kind: 'command', commandId: RUN_ONBOARDING_TRYOUT_COMMAND_ID },
			prepared: 0,
		});
	});

	test('tryout and automatic presentations use independent kind namespaces', () => {
		const { service } = createService();
		const automatic: IOnboardingPresentation = {
			kind: 'test.tryoutPresentation',
			run: async () => ({
				outcome: OnboardingOutcome.Completed,
				shown: false,
				dismissReason: OnboardingDismissReason.Completed,
				lastStepIndex: 0,
				stepCount: 0,
			}),
		};
		store.add(onboardingPresentationRegistry.register(automatic));
		registerPresentation(async () => ({ kind: 'ready', run: async () => ({ kind: 'executed' }) }));
		registerTryout();

		assert.deepStrictEqual({
			automatic: onboardingPresentationRegistry.get(automatic.kind) === automatic,
			tryoutAvailability: service.getAvailability('test.tryout'),
		}, {
			automatic: true,
			tryoutAvailability: { kind: 'ready' },
		});
	});

	test('runs with prepared context and disposes its lifetime afterward', async () => {
		const { service } = createService();
		const events: string[] = [];
		registerTryout();
		registerPresentation(async context => {
			events.push(`prepare:${context.id}`);
			context.store.add(toDisposable(() => events.push('dispose')));
			const preparedTarget = { id: 'selected-target' };
			return {
				kind: 'ready',
				run: async () => {
					events.push(`run:${preparedTarget.id}`);
					return { kind: 'prepared' };
				},
			};
		});

		const result = await service.run('test.tryout');
		assert.deepStrictEqual({ result, events }, {
			result: { kind: 'prepared' },
			events: ['prepare:test.tryout', 'run:selected-target', 'dispose'],
		});
	});

	test('joins concurrent invocations while preparation is pending', async () => {
		const { service } = createService();
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<OnboardingTryoutPreparation>();
		let preparations = 0;
		let executions = 0;
		registerTryout();
		registerPresentation(async () => {
			preparations++;
			started.complete();
			return finish.p;
		});
		const first = service.run('test.tryout');
		await started.p;
		const second = service.run('test.tryout');
		finish.complete({
			kind: 'ready',
			run: async () => {
				executions++;
				return { kind: 'executed' };
			},
		});

		const results = await Promise.all([first, second]);
		assert.deepStrictEqual({ results, preparations, executions }, {
			results: [{ kind: 'executed' }, { kind: 'executed' }],
			preparations: 1,
			executions: 1,
		});
	});

	test('a different invocation cancels the active run before starting', async () => {
		const { service } = createService();
		const firstStarted = new DeferredPromise<void>();
		const firstPreparation = new DeferredPromise<OnboardingTryoutPreparation>();
		const events: string[] = [];
		registerTryout();
		registerTryout({ id: 'test.otherTryout' });
		registerPresentation(async context => {
			events.push(`prepare:${context.id}`);
			if (context.id === 'test.tryout') {
				firstStarted.complete();
				return firstPreparation.p;
			}
			return {
				kind: 'ready',
				run: async () => {
					events.push(`run:${context.id}`);
					return { kind: 'executed' };
				},
			};
		});

		const first = service.run('test.tryout');
		await firstStarted.p;
		const second = service.run('test.otherTryout');

		assert.deepStrictEqual(await Promise.all([first, second]), [
			{ kind: 'cancelled' },
			{ kind: 'executed' },
		]);
		assert.deepStrictEqual(events, [
			'prepare:test.tryout',
			'prepare:test.otherTryout',
			'run:test.otherTryout',
		]);
	});

	test('a cancelled invocation does not absorb a new request for the same ID', async () => {
		const { service } = createService();
		const cancellation = store.add(new CancellationTokenSource());
		const firstStarted = new DeferredPromise<void>();
		const firstPreparation = new DeferredPromise<OnboardingTryoutPreparation>();
		let preparations = 0;
		registerTryout();
		registerPresentation(async () => {
			preparations++;
			if (preparations === 1) {
				firstStarted.complete();
				return firstPreparation.p;
			}
			return { kind: 'ready', run: async () => ({ kind: 'executed' }) };
		});

		const first = service.run('test.tryout', cancellation.token);
		await firstStarted.p;
		cancellation.cancel();
		const second = service.run('test.tryout');

		assert.deepStrictEqual({
			results: await Promise.all([first, second]),
			preparations,
		}, {
			results: [{ kind: 'cancelled' }, { kind: 'executed' }],
			preparations: 2,
		});
	});

	test('rechecks conditions after asynchronous preparation', async () => {
		const { service, context } = createService();
		const enabled = context.createKey<boolean>('tryoutEnabled', true);
		let ran = false;
		registerTryout({ when: ContextKeyExpr.has('tryoutEnabled'), unavailableMessage: 'Enable the example.' });
		registerPresentation(async () => {
			enabled.set(false);
			return { kind: 'ready', run: async () => { ran = true; return { kind: 'executed' }; } };
		});

		const result = await service.run('test.tryout');
		assert.deepStrictEqual({ result, ran }, {
			result: { kind: 'unavailable', message: 'Enable the example.', action: undefined },
			ran: false,
		});
	});

	test('does not run an example removed during preparation', async () => {
		const { service } = createService();
		let ran = false;
		const registration = registerTryout();
		registerPresentation(async () => {
			registration.dispose();
			return { kind: 'ready', run: async () => { ran = true; return { kind: 'executed' }; } };
		});

		const result = await service.run('test.tryout');
		assert.deepStrictEqual({ kind: result.kind, ran }, { kind: 'unavailable', ran: false });
	});

	test('cancelling preparation prevents execution and disposes context', async () => {
		const { service } = createService();
		const cancellation = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<OnboardingTryoutPreparation>();
		let disposed = false;
		let ran = false;
		registerTryout();
		registerPresentation(async context => {
			context.store.add(toDisposable(() => disposed = true));
			started.complete();
			return finish.p;
		});

		const pending = service.run('test.tryout', cancellation.token);
		await started.p;
		cancellation.cancel();
		const result = await pending;
		finish.complete({ kind: 'ready', run: async () => { ran = true; return { kind: 'executed' }; } });
		await finish.p;
		assert.deepStrictEqual({ result, disposed, ran }, {
			result: { kind: 'cancelled' },
			disposed: true,
			ran: false,
		});
	});

	test('service disposal cancels a pending preparation', async () => {
		const { service } = createService();
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<OnboardingTryoutPreparation>();
		registerTryout();
		registerPresentation(async () => {
			started.complete();
			return finish.p;
		});
		const pending = service.run('test.tryout');
		await started.p;
		service.dispose();
		const result = await pending;
		finish.complete({ kind: 'cancelled' });
		assert.deepStrictEqual(result, { kind: 'cancelled' });
	});

	test('hidden AI cannot prepare or route and changes are announced', async () => {
		const { service, sentiment, changed } = createService(false);
		let notifications = 0;
		let routed = false;
		registerTryout({ isAI: true, targetWindow: 'agents' });
		store.add(service.registerWindowOpener(async () => { routed = true; }));
		store.add(service.onDidChange(() => notifications++));
		sentiment.hidden = true;
		changed.fire();

		const availability = service.getAvailability('test.tryout');
		const result = await service.run('test.tryout');
		assert.deepStrictEqual({ availability, kind: result.kind, routed, notifications }, {
			availability: { kind: 'hidden' },
			kind: 'unavailable',
			routed: false,
			notifications: 1,
		});
	});

	test('routes a known Agents example before evaluating destination-only requirements', async () => {
		const { service } = createService(false);
		const routed: string[] = [];
		registerTryout({ targetWindow: 'agents', when: ContextKeyExpr.has('onlyDefinedInAgents') });
		store.add(service.registerWindowOpener(async id => { routed.push(id); }));

		const result = await service.run('test.tryout');
		assert.deepStrictEqual({ result, routed }, { result: { kind: 'routed' }, routed: ['test.tryout'] });
	});

	test('offers setup without executing it during availability checks', async () => {
		const { service } = createService();
		const action = { label: 'Open setting', command: { id: 'test.openSetting', arguments: ['setting.id'] } };
		registerTryout({ when: ContextKeyExpr.false(), unavailableMessage: 'Enable the example.', setup: action });
		assert.deepStrictEqual(service.getAvailability('test.tryout'), { kind: 'unavailable', message: 'Enable the example.', action });
	});

	test('rejects unknown and non-opted-in scenarios', async () => {
		const { service } = createService();
		store.add(onboardingScenarioRegistry.register({
			id: 'test.privateTour',
			trigger: { kind: 'command', commandId: 'test.privateTour' },
			presentation: { kind: 'spotlight', payload: undefined },
		}));
		await assert.rejects(service.run('test.unknown'), /not available/);
		await assert.rejects(service.run('test.privateTour'), /not available/);
	});

	test('propagates preparation and execution failures instead of claiming success', async () => {
		const { service } = createService();
		registerTryout();
		const registration = registerPresentation(async () => { throw new Error('preparation failed'); });
		await assert.rejects(service.run('test.tryout'), /preparation failed/);
		registration.dispose();
		registerPresentation(async () => ({ kind: 'ready', run: async () => { throw new Error('execution failed'); } }));
		await assert.rejects(service.run('test.tryout'), /execution failed/);
	});

	test('round trips standard command links and accepts the existing encoded Markdown shape', () => {
		assert.deepStrictEqual([
			parseOnboardingTryoutUri(URI.parse(createOnboardingTryoutUri('test.tryout').toString())),
			parseOnboardingTryoutUri(URI.parse(`command:${RUN_ONBOARDING_TRYOUT_COMMAND_ID}?%5B%22test.tryout%22%5D`)),
			parseOnboardingTryoutUri(URI.parse('https://code.visualstudio.com/updates')),
		], ['test.tryout', 'test.tryout', undefined]);
	});

	test('only accepts one bounded ID, not payloads or extra arguments', () => {
		for (const args of [[], ['test.tryout', {}], [{}], [null], [1], [''], ['../file'], ['a'.repeat(129)]]) {
			assert.throws(() => parseOnboardingTryoutArguments(args), /exactly one/);
		}
		assert.throws(() => parseOnboardingTryoutUri(URI.parse(`command:${RUN_ONBOARDING_TRYOUT_COMMAND_ID}?%7B%22id%22%3A%22test.tryout%22%7D`)), /exactly one/);
	});
});
