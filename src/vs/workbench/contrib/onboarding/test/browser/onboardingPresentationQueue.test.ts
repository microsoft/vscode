/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { Memento } from '../../../../common/memento.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { TestHostService, TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { GuidedTryoutPresentation } from '../../browser/guidedTryoutPresentation.js';
import { runWithOnboardingPresentation } from '../../browser/onboardingPresentationQueue.js';
import { OnboardingScenarioService } from '../../browser/onboardingService.js';
import { markOnboardingTarget } from '../../browser/spotlight/onboardingTarget.js';
import { SpotlightPresentation } from '../../browser/spotlight/spotlightPresentation.js';
import { ISpotlightStep } from '../../browser/spotlight/spotlightTypes.js';
import { onboardingPresentationRegistry } from '../../common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../../common/onboardingRegistry.js';
import { onboardingSequenceStepPresentationRegistry } from '../../common/onboardingSequence.js';
import { onboardingTryoutPresentationRegistry } from '../../common/onboardingTryout.js';

suite('Onboarding presentation isolation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => Memento.clear(StorageScope.APPLICATION));

	test('a cancelled queued presentation never starts and does not block later work', async () => {
		const finish = new DeferredPromise<void>();
		const active = runWithOnboardingPresentation(mainWindow, CancellationToken.None, () => finish.p);
		const cancellation = store.add(new CancellationTokenSource());
		let launches = 0;
		const queued = runWithOnboardingPresentation(mainWindow, cancellation.token, async () => { launches++; });
		cancellation.cancel();
		await assert.rejects(queued, isCancellationError);
		const later = runWithOnboardingPresentation(mainWindow, CancellationToken.None, async () => { launches++; });
		await finish.complete();
		await Promise.all([active, later]);
		assert.strictEqual(launches, 1);
	});

	test('a failed presentation releases its window for later work', async () => {
		await assert.rejects(runWithOnboardingPresentation(mainWindow, CancellationToken.None, async () => { throw new Error('Failed'); }), /Failed/);
		assert.strictEqual(await runWithOnboardingPresentation(mainWindow, CancellationToken.None, async () => 'ready'), 'ready');
	});

	test('guided tryouts wait for ordinary tours without overlapping or changing their dimming', async () => {
		const container = $('.onboarding-isolation-test');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const configuration = new TestConfigurationService();
		const contextKeys = store.add(new ContextKeyService(configuration));
		const dimming: boolean[] = [];
		const host = new class extends TestHostService {
			override async setWindowDimmed(_window: Window, dimmed: boolean): Promise<void> { dimming.push(dimmed); }
		};
		const layout = new class extends TestLayoutService {
			override getContainer(): HTMLElement { return container; }
		};
		const spotlight = store.add(new SpotlightPresentation(layout, host, contextKeys));
		store.add(onboardingPresentationRegistry.register(spotlight));
		store.add(onboardingSequenceStepPresentationRegistry.register(spotlight));
		function target(id: string) {
			const opened = new DeferredPromise<void>();
			const element = $('button');
			element.style.cssText = 'position: fixed; width: 100px; height: 30px;';
			container.appendChild(element);
			store.add(markOnboardingTarget(element, id, { open: () => opened.complete() }));
			return { element, opened };
		}
		function step(id: string): ISpotlightStep {
			return { id, targetId: id, title: id, description: 'Example', openTarget: true, advanceOnTargetClick: true };
		}
		const automatic = target('test.automaticTarget');
		const guided = target('test.guidedTarget');
		store.add(onboardingScenarioRegistry.register({
			id: 'test.automatic',
			trigger: { kind: 'auto' },
			presentation: { kind: spotlight.kind, payload: { steps: [step('test.automaticTarget')] } },
		}));
		const scenarioService = store.add(new OnboardingScenarioService(
			store.add(new InMemoryStorageService()), contextKeys, configuration,
			store.add(new TestLifecycleService()), new NullWorkbenchAssignmentService(), NullTelemetryService,
		));
		scenarioService.start();
		const automaticRun = scenarioService.runScenario('test.automatic');
		await automatic.opened.p;
		let launches = 0;
		store.add(onboardingTryoutPresentationRegistry.register({
			kind: 'test.isolatedLaunch',
			getAvailability: () => ({ kind: 'ready' }),
			prepare: async () => ({ kind: 'ready', run: async () => { launches++; return { kind: 'prepared' }; } }),
		}));
		const presentation = store.add(new GuidedTryoutPresentation());
		const cancellation = store.add(new CancellationTokenSource());
		const preparation = await presentation.prepare({
			id: 'test.guided',
			trigger: { kind: 'command', commandId: 'test.guided' },
			presentation: {
				kind: presentation.kind,
				payload: {
					launch: { kind: 'test.isolatedLaunch', payload: {} },
					steps: [{ id: 'guide', kind: spotlight.kind, payload: step('test.guidedTarget') }],
				},
			},
		}, { id: 'test.guided', token: cancellation.token, store: store.add(new DisposableStore()) });
		assert.strictEqual(preparation.kind, 'ready');
		if (preparation.kind !== 'ready') {
			return;
		}
		const guidedRun = preparation.run();
		try {
			await timeout(0);
			const whileWaiting = { launches, overlays: container.querySelectorAll('.spotlight-overlay').length, dimming: [...dimming] };
			automatic.element.click();
			await automaticRun;
			await guided.opened.p;
			const whileGuided = { launches, overlays: container.querySelectorAll('.spotlight-overlay').length, dimming: [...dimming] };
			cancellation.cancel();
			assert.deepStrictEqual(await guidedRun, { kind: 'cancelled' });
			await timeout(0);
			assert.deepStrictEqual({ whileWaiting, whileGuided, after: dimming }, {
				whileWaiting: { launches: 0, overlays: 1, dimming: [true] },
				whileGuided: { launches: 1, overlays: 1, dimming: [true, false, true] },
				after: [true, false, true, false],
			});
		} finally {
			cancellation.cancel();
			automatic.element.click();
			await automaticRun;
		}
	});
});
