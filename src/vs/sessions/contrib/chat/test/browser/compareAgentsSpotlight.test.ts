/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { append, $, getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { SpotlightPresentation } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightPresentation.js';
import { ISpotlightPayload } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { TestHostService, TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { CompareAgentsSpotlight, COMPARE_AGENTS_SPOTLIGHT_ID } from '../../browser/compareAgentsSpotlight.js';
import { SessionComparisonModelSelection } from '../../browser/sessionComparisonModelSelection.js';
import { COMPARE_AGENTS_SHOW_SPOTLIGHT_SETTING } from '../../common/constants.js';

suite('CompareAgentsSpotlight', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options: { enabled?: boolean; hidden?: boolean; eligible?: boolean; presenting?: boolean } = {}) {
		const button = append(mainWindow.document.body, $('button'));
		button.style.cssText = 'width: 28px; height: 28px;';
		store.add(toDisposable(() => button.remove()));
		const configuration = new TestConfigurationService({ [COMPARE_AGENTS_SHOW_SPOTLIGHT_SETTING]: options.enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const runs: { id: string; token: CancellationToken; payload: ISpotlightPayload }[] = [];
		let shown = false;
		const onboarding = upcastPartial<IOnboardingScenarioService>({
			isPresenting: constObservable(!!options.presenting),
			shouldShowNudge: () => options.eligible !== false && !shown,
			runScenario: async (id, token = CancellationToken.None) => {
				shown = true;
				runs.push({ id, token, payload: onboardingScenarioRegistry.getScenario(id)!.presentation.payload as ISpotlightPayload });
				return OnboardingOutcome.Completed;
			},
		});
		const entitlement = upcastPartial<IChatEntitlementService>({ sentiment: { hidden: !!options.hidden } });
		const render = (reviewAvailable = true) => store.add(new CompareAgentsSpotlight(button, reviewAvailable, configuration, onboarding, entitlement));
		const frame = () => new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(getWindow(button), resolve)));
		return { button, runs, configuration, onboarding, entitlement, render, frame };
	}

	for (const previouslyOpened of [false, true]) {
		test(`comparison discovery suppresses the spotlight across selection instances: ${previouslyOpened}`, async () => {
			const { button, frame, runs, configuration, onboarding, entitlement } = createHarness({ enabled: true });
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.set(IConfigurationService, configuration);
			instantiationService.set(IOnboardingScenarioService, onboarding);
			instantiationService.set(IChatEntitlementService, entitlement);
			instantiationService.set(IStorageService, store.add(new InMemoryStorageService()));
			const createSelection = () => store.add(instantiationService.createInstance(SessionComparisonModelSelection, constObservable(true), undefined, undefined, undefined, undefined));
			const selection = createSelection();
			if (previouslyOpened) {
				selection.start();
				selection.cancel();
				selection.reset();
			}
			selection.dispose();
			const recreated = createSelection();
			store.add(recreated.renderToggle(button));
			await frame();
			assert.deepStrictEqual(runs.map(run => run.id), previouslyOpened ? [] : [COMPARE_AGENTS_SPOTLIGHT_ID]);
		});
	}

	for (const options of [{}, { enabled: false }, { enabled: true, hidden: true }, { enabled: true, eligible: false }, { enabled: true, presenting: true }]) {
		test(`does not show without eligibility: ${JSON.stringify(options)}`, async () => {
			const { render, frame, runs } = createHarness(options);
			render();
			await frame();
			assert.deepStrictEqual(runs, []);
		});
	}

	test('shows once after layout and cancels its lifetime when the picker closes', async () => {
		const { render, frame, runs, button } = createHarness({ enabled: true });
		const spotlight = render();
		const beforeLayout = runs.length;
		await frame();
		const step = runs[0].payload.steps[0];
		spotlight.dispose();
		const targetAfterClose = button.getAttribute('data-onboarding-id');
		const registrationAfterClose = onboardingScenarioRegistry.getScenario(COMPARE_AGENTS_SPOTLIGHT_ID);
		render();
		await frame();
		assert.deepStrictEqual({
			beforeLayout, runs: runs.length, cancelled: runs[0].token.isCancellationRequested,
			targetAfterClose, registrationAfterClose,
			target: step.targetId, interactive: step.allowTargetInteraction, advance: step.advanceOnTargetClick, hideNext: step.hideNext,
			describesReview: typeof step.description === 'string' && step.description.includes('judge') && step.description.includes('synthesizer'),
		}, {
			beforeLayout: 0, runs: 1, cancelled: true,
			targetAfterClose: null, registrationAfterClose: undefined,
			target: COMPARE_AGENTS_SPOTLIGHT_ID, interactive: true, advance: true, hideNext: false,
			describesReview: true,
		});
	});

	test('does not advertise judging and synthesis for workspace-less chats', async () => {
		const { render, frame, runs } = createHarness({ enabled: true });
		render(false);
		await frame();
		assert.strictEqual(runs[0].payload.steps[0].description, 'Run your prompt across multiple models and agent harnesses in parallel and compare their responses side by side.');
	});

	test('closing the picker before layout does not consume the introduction', async () => {
		const { render, frame, runs } = createHarness({ enabled: true });
		render().dispose();
		await frame();
		const afterClose = runs.length;
		render();
		await frame();
		assert.deepStrictEqual({ afterClose, afterReopen: runs.length }, { afterClose: 0, afterReopen: 1 });
	});

	for (const dismiss of ['understood', 'escape'] as const) {
		test(`renders accessible guidance and restores picker focus after ${dismiss}`, async () => {
			const { render, frame, button } = createHarness({ enabled: true });
			render();
			await frame();
			button.focus();
			const contextKeys = store.add(new ContextKeyService(new TestConfigurationService()));
			const layout = new class extends TestLayoutService {
				override getContainer() { return mainWindow.document.body; }
			}();
			const presentation = store.add(new SpotlightPresentation(layout, new TestHostService(), contextKeys));
			const shown = new DeferredPromise<void>();
			const result = presentation.run(onboardingScenarioRegistry.getScenario(COMPARE_AGENTS_SPOTLIGHT_ID)!, {
				targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { void shown.complete(); },
			});
			await shown.p;
			const callout = mainWindow.document.querySelector<HTMLElement>('.spotlight-callout')!;
			const description = mainWindow.document.getElementById(callout.getAttribute('aria-describedby')!);
			const next = Array.from(callout.querySelectorAll<HTMLElement>('.monaco-button')).find(button => button.textContent === 'Understood')!;
			const beforeDismiss = {
				role: callout.getAttribute('role'),
				description: description?.textContent?.includes('judge'),
				focused: mainWindow.document.activeElement === next,
			};
			if (dismiss === 'understood') {
				next.click();
			} else {
				next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
			}
			const outcome = (await result).outcome;
			assert.deepStrictEqual({
				beforeDismiss, outcome, restored: mainWindow.document.activeElement === button,
				remaining: !!mainWindow.document.querySelector('.spotlight-callout'),
			}, {
				beforeDismiss: { role: 'dialog', description: true, focused: true },
				outcome: dismiss === 'understood' ? OnboardingOutcome.Completed : OnboardingOutcome.Skipped,
				restored: true, remaining: false,
			});
		});
	}
});
