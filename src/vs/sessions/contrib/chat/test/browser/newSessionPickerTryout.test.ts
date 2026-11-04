/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatOnboardingTarget } from '../../../../../workbench/contrib/chat/common/onboarding/modelPickerTryout.js';
import { isNewSessionPickerTryoutPayload, NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND } from '../../../../../workbench/contrib/chat/common/onboarding/newSessionPickerTryout.js';
import { resolveOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingTryoutRunContext, IOnboardingTryoutService, onboardingTryoutPresentationRegistry, OnboardingTryoutAvailability } from '../../../../../workbench/contrib/onboarding/common/onboardingTryout.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposer, INewSessionComposerPicker, INewSessionComposerService, NewSessionComposerService } from '../../browser/newSessionComposerService.js';
import { NewSessionPickerTryoutContribution } from '../../browser/newSessionPickerTryout.js';
import { NewSessionOnboardingTargets } from '../../browser/newSessionOnboardingTargets.js';

suite('New session picker tryout adapter', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createContext(token = CancellationToken.None): IOnboardingTryoutRunContext {
		return { id: 'test.picker', token, store: disposables.add(new DisposableStore()) };
	}

	function scenario(): IOnboardingScenario {
		return {
			id: 'test.picker',
			trigger: { kind: 'command', commandId: 'test.picker' },
			presentation: { kind: NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND, payload: 'model' },
		};
	}

	function resolve(scope?: string) {
		return resolveOnboardingTarget(mainWindow, ChatOnboardingTarget.ModelPicker, scope);
	}

	function createHarness(
		openNewSession: ISessionsService['openNewSession'] = async () => ({ session: undefined, trustDeclined: false }),
		getAvailability: () => OnboardingTryoutAvailability = () => ({ kind: 'ready' }),
	) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const composerService = disposables.add(new NewSessionComposerService());
		instantiationService.stub(ISessionsService, { activeSession: constObservable(undefined), openNewSession });
		instantiationService.stub(INewSessionComposerService, composerService);
		instantiationService.stub(IOnboardingTryoutService, { getAvailability });
		const construction = sinon.spy(instantiationService, 'createInstance');
		const contribution = disposables.add(new NewSessionPickerTryoutContribution(instantiationService));
		const presentation = onboardingTryoutPresentationRegistry.get(NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND);
		assert.ok(presentation);
		return { composerService, presentation, contribution, construction };
	}

	function createPicker() {
		const element = $('button');
		element.style.cssText = 'position: fixed; width: 100px; height: 30px;';
		mainWindow.document.body.appendChild(element);
		disposables.add(toDisposable(() => element.remove()));
		let opened = 0;
		const picker: INewSessionComposerPicker = {
			getDomNode: () => element,
			open: () => { opened++; },
		};
		return { element, picker, get opened() { return opened; } };
	}

	function createComposer(modelPicker?: INewSessionComposerPicker): INewSessionComposer {
		return { modelPicker, animatePrompt: async () => true, showPromptOptions: () => true };
	}

	async function prepare(harness: ReturnType<typeof createHarness>, context = createContext()) {
		const preparation = await harness.presentation.prepare(scenario(), context);
		if (preparation.kind !== 'ready') {
			assert.fail(`Expected preparation, got ${preparation.kind}`);
		}
		return preparation;
	}

	async function captureScope(harness: ReturnType<typeof createHarness>, context = createContext()) {
		const preparation = await prepare(harness, context);
		const result = await preparation.run();
		if (result.kind !== 'prepared' || !result.targetScope) {
			assert.fail(`Expected a prepared scope, got ${result.kind}`);
		}
		return result.targetScope;
	}

	test('accepts only the model picker payload', () => {
		assert.deepStrictEqual(['model', 'workspace', 'other', {}, null].map(isNewSessionPickerTryoutPayload), [true, false, false, false, false]);
	});

	test('contribution registration, availability and disposal leave the adapter uninitialized', () => {
		const harness = createHarness();
		const availability = harness.presentation.getAvailability(scenario());
		harness.contribution.dispose();

		assert.deepStrictEqual({
			availability,
			constructions: harness.construction.callCount,
			registered: onboardingTryoutPresentationRegistry.get(NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND),
			target: resolve(),
		}, { availability: { kind: 'ready' }, constructions: 0, registered: undefined, target: undefined });
	});

	test('preparation initializes once without opening or resolving feature controls', async () => {
		let opened = 0;
		let resolved = 0;
		const harness = createHarness(async () => {
			opened++;
			return { session: undefined, trustDeclined: false };
		});
		disposables.add(harness.composerService.registerComposer(createComposer({
			getDomNode: () => { resolved++; return undefined; },
			open: () => assert.fail('Preparation must not open a control'),
		})));

		await prepare(harness);
		await prepare(harness);

		assert.deepStrictEqual({ opened, resolved, constructions: harness.construction.callCount }, { opened: 0, resolved: 0, constructions: 1 });
	});

	test('automatic tour targets work without any tryout registration or services', async () => {
		const composerService = disposables.add(new NewSessionComposerService());
		disposables.add(new NewSessionOnboardingTargets(composerService));
		const resolve = () => resolveOnboardingTarget(mainWindow, 'sessions.newSession.modelPicker');
		const first = createPicker();
		const second = createPicker();
		disposables.add(composerService.registerComposer(createComposer(first.picker)));
		const initial = resolve();
		await initial?.open?.();
		const replacement = disposables.add(composerService.registerComposer(createComposer(second.picker)));
		const current = resolve();
		await current?.open?.();
		replacement.dispose();

		assert.deepStrictEqual({
			initial: initial?.element === first.element,
			current: current?.element === second.element,
			restored: resolve()?.element === first.element,
			opened: [first.opened, second.opened],
		}, { initial: true, current: true, restored: true, opened: [1, 1] });
	});

	test('disposing tryouts leaves ordinary tour targets available without initializing the tryout adapter', () => {
		const harness = createHarness();
		disposables.add(new NewSessionOnboardingTargets(harness.composerService));
		const control = createPicker();
		disposables.add(harness.composerService.registerComposer(createComposer(control.picker)));
		harness.contribution.dispose();
		const ordinary = resolveOnboardingTarget(mainWindow, 'sessions.newSession.modelPicker');
		assert.deepStrictEqual({ target: ordinary?.element === control.element, constructions: harness.construction.callCount, tryout: resolve() }, {
			target: true, constructions: 0, tryout: undefined,
		});
	});

	test('captures the empty composer model control until the run is disposed', async () => {
		const before = createPicker();
		const captured = createPicker();
		const later = createPicker();
		const harness = createHarness(async () => {
			disposables.add(harness.composerService.registerComposer(createComposer(captured.picker)));
			return { session: undefined, trustDeclined: false };
		});
		disposables.add(harness.composerService.registerComposer(createComposer(before.picker)));
		const context = createContext();
		const scope = await captureScope(harness, context);
		disposables.add(harness.composerService.registerComposer(createComposer(later.picker)));
		const target = resolve(scope);
		await target?.open?.();
		context.store.dispose();
		await target?.open?.();

		assert.deepStrictEqual({
			captured: target?.element === captured.element,
			opened: [before.opened, captured.opened, later.opened],
			released: resolve(scope),
			unscoped: resolve(),
		}, { captured: true, opened: [0, 1, 0], released: undefined, unscoped: undefined });
	});

	test('resolves a late-rendered model control only from the captured composer', async () => {
		const harness = createHarness();
		const control = createPicker();
		const replacement = createPicker();
		let picker: INewSessionComposerPicker | undefined = undefined;
		let element: HTMLElement | undefined = undefined;
		disposables.add(harness.composerService.registerComposer({
			...createComposer(),
			get modelPicker() { return picker; },
		}));
		const scope = await captureScope(harness);
		disposables.add(harness.composerService.registerComposer(createComposer(replacement.picker)));
		const beforePicker = resolve(scope);
		picker = { getDomNode: () => element, open: () => control.picker.open() };
		const beforeElement = resolve(scope);
		element = control.element;
		const target = resolve(scope);
		await target?.open?.();

		assert.deepStrictEqual({
			beforePicker, beforeElement,
			correct: target?.element === control.element,
			opened: [control.opened, replacement.opened],
		}, { beforePicker: undefined, beforeElement: undefined, correct: true, opened: [1, 0] });
	});

	test('missing scopes never fall back to the active composer', () => {
		const harness = createHarness();
		const control = createPicker();
		disposables.add(harness.composerService.registerComposer(createComposer(control.picker)));

		assert.deepStrictEqual({
			missing: resolve('missing'),
			empty: resolve(''),
			unscoped: resolve(),
		}, { missing: undefined, empty: undefined, unscoped: undefined });
	});

	test('a stale captured control never falls back to another visible composer', async () => {
		const harness = createHarness();
		const captured = createPicker();
		const current = createPicker();
		disposables.add(harness.composerService.registerComposer(createComposer(captured.picker)));
		const scope = await captureScope(harness);
		captured.element.remove();
		disposables.add(harness.composerService.registerComposer(createComposer(current.picker)));

		assert.deepStrictEqual({ stale: resolve(scope), unscoped: resolve() }, { stale: undefined, unscoped: undefined });
	});

	test('fails closed when opening did not mount a composer', async () => {
		const preparation = await prepare(createHarness());
		assert.strictEqual((await preparation.run()).kind, 'unavailable');
	});

	test('forwards current unavailability without opening the composer', async () => {
		let opened = 0;
		const availability: OnboardingTryoutAvailability = { kind: 'unavailable', message: 'Enable the picker first.' };
		const harness = createHarness(async () => {
			opened++;
			return { session: undefined, trustDeclined: false };
		}, () => availability);
		const preparation = await prepare(harness);

		assert.deepStrictEqual({ result: await preparation.run(), opened }, { result: availability, opened: 0 });
	});

	test('rechecks availability after the composer opens', async () => {
		let availability: OnboardingTryoutAvailability = { kind: 'ready' };
		const control = createPicker();
		const harness = createHarness(async () => {
			availability = { kind: 'hidden' };
			return { session: undefined, trustDeclined: false };
		}, () => availability);
		disposables.add(harness.composerService.registerComposer(createComposer(control.picker)));
		const preparation = await prepare(harness);
		const result = await preparation.run();

		assert.deepStrictEqual({ kind: result.kind, opened: control.opened }, { kind: 'unavailable', opened: 0 });
	});

	for (const cancellationKind of ['token', 'run', 'contribution']) {
		test(`${cancellationKind} cancellation while opening suppresses late scope capture`, async () => {
			const started = new DeferredPromise<void>();
			const finish = new DeferredPromise<void>();
			const cancellation = disposables.add(new CancellationTokenSource());
			const context = createContext(cancellation.token);
			const control = createPicker();
			let forwardedToken: CancellationToken | undefined;
			const harness = createHarness(async (_options, token) => {
				forwardedToken = token;
				started.complete();
				await finish.p;
				return { session: undefined, trustDeclined: false };
			});
			disposables.add(harness.composerService.registerComposer(createComposer(control.picker)));
			const preparation = await prepare(harness, context);
			const pending = preparation.run();
			await started.p;
			if (cancellationKind === 'token') {
				cancellation.cancel();
			} else if (cancellationKind === 'run') {
				context.store.dispose();
			} else {
				harness.contribution.dispose();
			}
			finish.complete();

			assert.deepStrictEqual({
				result: await pending,
				tokenForwarded: forwardedToken === cancellation.token,
				opened: control.opened,
			}, { result: { kind: 'cancelled' }, tokenForwarded: true, opened: 0 });
		});
	}

	test('does not capture a scope when the user declines workspace trust', async () => {
		const harness = createHarness(async () => ({ session: undefined, trustDeclined: true }));
		const control = createPicker();
		disposables.add(harness.composerService.registerComposer(createComposer(control.picker)));
		const preparation = await prepare(harness);

		assert.deepStrictEqual({ result: await preparation.run(), opened: control.opened }, { result: { kind: 'cancelled' }, opened: 0 });
	});

	test('cancelled and disposed preparation does not initialize the adapter', async () => {
		const harness = createHarness();
		const cancellation = disposables.add(new CancellationTokenSource());
		cancellation.cancel();
		const cancelled = await harness.presentation.prepare(scenario(), createContext(cancellation.token));
		const context = createContext();
		context.store.dispose();
		const disposedRun = await harness.presentation.prepare(scenario(), context);
		harness.contribution.dispose();
		const disposedContribution = await harness.presentation.prepare(scenario(), createContext());

		assert.deepStrictEqual({
			cancelled, disposedRun, disposedContribution, constructions: harness.construction.callCount,
		}, {
			cancelled: { kind: 'cancelled' }, disposedRun: { kind: 'cancelled' }, disposedContribution: { kind: 'cancelled' }, constructions: 0,
		});
	});
});
