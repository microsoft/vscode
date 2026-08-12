/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestHostService, TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { SpotlightPresentation } from '../../browser/spotlight/spotlightPresentation.js';
import { IOnboardingTargetOptions, markOnboardingTarget } from '../../browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../browser/spotlight/spotlightTypes.js';
import { IOnboardingScenario, OnboardingDismissReason, OnboardingOutcome } from '../../common/onboardingScenario.js';

class SpotlightTestLayoutService extends TestLayoutService {
	constructor(private readonly _container: HTMLElement) {
		super();
	}

	override getContainer(): HTMLElement {
		return this._container;
	}
}

suite('SpotlightPresentation', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContainer(): HTMLElement {
		const container = $('.spotlight-presentation-test');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		return container;
	}

	function createTarget(container: HTMLElement, id: string, options?: IOnboardingTargetOptions): HTMLElement {
		const target = $('button');
		target.style.position = 'fixed';
		target.style.left = '100px';
		target.style.top = '100px';
		target.style.width = '100px';
		target.style.height = '30px';
		container.appendChild(target);
		disposables.add(markOnboardingTarget(target, id, options));
		return target;
	}

	function createScenario(id: string, ...steps: ISpotlightStep[]): IOnboardingScenario<ISpotlightPayload> {
		return {
			id,
			trigger: { kind: 'auto' },
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: { steps },
			},
		};
	}

	test('waits for a late target and skips a missing target immediately', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));

		const lateTargetId = 'test.spotlight.lateTarget';
		const lateScenario = createScenario('test.spotlight.wait', {
			id: 'late',
			targetId: lateTargetId,
			title: 'Late target',
			description: 'Late target description',
			missingTarget: { kind: 'wait', timeoutMs: 500 },
			advanceOnTargetClick: true,
			openTarget: true,
			onBeforeShow: () => {
				disposables.add(disposableTimeout(() => {
					const target = createTarget(container, lateTargetId, { open: () => target.click() });
				}, 100));
			},
		});
		const lateResult = await presentation.run(lateScenario, { targetWindow: mainWindow, onAbort: Event.None });

		const missingScenario = createScenario('test.spotlight.skip', {
			id: 'missing',
			targetId: 'test.spotlight.missingTarget',
			title: 'Missing target',
			description: 'Missing target description',
			missingTarget: { kind: 'skip' },
		});
		const missingResult = await presentation.run(missingScenario, { targetWindow: mainWindow, onAbort: Event.None });

		assert.deepStrictEqual({ lateResult, missingResult }, {
			lateResult: {
				outcome: OnboardingOutcome.Completed,
				shown: true,
				dismissReason: OnboardingDismissReason.TargetClick,
				lastStepIndex: 0,
				stepCount: 1,
			},
			missingResult: {
				outcome: OnboardingOutcome.Completed,
				shown: false,
				dismissReason: OnboardingDismissReason.Completed,
				lastStepIndex: 0,
				stepCount: 1,
			},
		});
	});

	test('excludes skipped steps from displayed progress', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
		const progress: { readonly counter: string | null; readonly backHidden: boolean; readonly nextLabel: string | null }[] = [];

		const createAdvancingTarget = (id: string): HTMLElement => {
			const target = createTarget(container, id, {
				open: () => {
					const buttons = Array.from(container.getElementsByClassName('monaco-button')) as HTMLElement[];
					progress.push({
						counter: container.getElementsByClassName('spotlight-callout-counter')[0].textContent,
						backHidden: buttons[1].style.display === 'none',
						nextLabel: buttons[2].textContent,
					});
					target.click();
				},
			});
			return target;
		};

		createAdvancingTarget('test.spotlight.second');
		createAdvancingTarget('test.spotlight.third');
		const result = await presentation.run(createScenario('test.spotlight.skippedProgress',
			{
				id: 'first',
				targetId: 'test.spotlight.first',
				title: 'First',
				description: 'Skipped first step',
				when: ContextKeyExpr.equals('testSpotlightShowFirst', true),
			},
			{
				id: 'second',
				targetId: 'test.spotlight.second',
				title: 'Second',
				description: 'First visible step',
				openTarget: true,
				advanceOnTargetClick: true,
			},
			{
				id: 'third',
				targetId: 'test.spotlight.third',
				title: 'Third',
				description: 'Second visible step',
				openTarget: true,
				advanceOnTargetClick: true,
			},
		), { targetWindow: mainWindow, onAbort: Event.None });

		assert.deepStrictEqual({ progress, result }, {
			progress: [
				{ counter: '1 of 2', backHidden: true, nextLabel: 'Next' },
				{ counter: '2 of 2', backHidden: false, nextLabel: 'Done' },
			],
			result: {
				outcome: OnboardingOutcome.Completed,
				shown: true,
				dismissReason: OnboardingDismissReason.TargetClick,
				lastStepIndex: 2,
				stepCount: 3,
			},
		});
	});

	test('hides the previous step while waiting for the next target', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
		const firstTarget = createTarget(container, 'test.spotlight.firstVisible', { open: () => firstTarget.click() });
		let hiddenWhileWaiting = false;

		const result = await presentation.run(createScenario('test.spotlight.hiddenWhileWaiting',
			{
				id: 'first',
				targetId: 'test.spotlight.firstVisible',
				title: 'First',
				description: 'First step',
				openTarget: true,
				advanceOnTargetClick: true,
			},
			{
				id: 'second',
				targetId: 'test.spotlight.secondLate',
				title: 'Second',
				description: 'Late second step',
				missingTarget: { kind: 'wait', timeoutMs: 500 },
				openTarget: true,
				advanceOnTargetClick: true,
				onBeforeShow: () => {
					const overlay = container.getElementsByClassName('spotlight-overlay')[0] as HTMLElement;
					hiddenWhileWaiting = overlay.style.display === 'none';
					disposables.add(disposableTimeout(() => {
						const target = createTarget(container, 'test.spotlight.secondLate', { open: () => target.click() });
					}, 100));
				},
			},
		), { targetWindow: mainWindow, onAbort: Event.None });

		assert.deepStrictEqual({ hiddenWhileWaiting, result }, {
			hiddenWhileWaiting: true,
			result: {
				outcome: OnboardingOutcome.Completed,
				shown: true,
				dismissReason: OnboardingDismissReason.TargetClick,
				lastStepIndex: 1,
				stepCount: 2,
			},
		});
	});

	test('aborts immediately while waiting for a target', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
		const abort = disposables.add(new Emitter<void>());

		const result = await presentation.run(createScenario('test.spotlight.abortWait', {
			id: 'missing',
			targetId: 'test.spotlight.abortMissing',
			title: 'Missing',
			description: 'Missing target',
			missingTarget: { kind: 'wait', timeoutMs: 60_000 },
			onBeforeShow: () => {
				disposables.add(disposableTimeout(() => abort.fire(), 0));
			},
		}), { targetWindow: mainWindow, onAbort: abort.event });

		assert.deepStrictEqual(result, {
			outcome: OnboardingOutcome.Aborted,
			shown: false,
			dismissReason: OnboardingDismissReason.Aborted,
			lastStepIndex: 0,
			stepCount: 1,
		});
	});

	test('opens the target and advances when its context condition becomes true', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const workspaceSelected = contextKeyService.createKey<boolean>('testSpotlightWorkspaceSelected', false);
		const target = createTarget(container, 'test.spotlight.workspace');
		let stateAtOpen: { readonly nextHidden: boolean; readonly targetOverlayVisible: boolean } | undefined;
		disposables.add(markOnboardingTarget(target, 'test.spotlight.workspace', {
			open: () => {
				const overlay = container.getElementsByClassName('spotlight-overlay')[0] as HTMLElement;
				const buttons = Array.from(container.getElementsByClassName('monaco-button')) as HTMLElement[];
				stateAtOpen = {
					nextHidden: buttons.at(-1)?.style.display === 'none',
					targetOverlayVisible: overlay.classList.contains('target-overlay-visible'),
				};
				workspaceSelected.set(true);
			},
		}));

		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
		const result = await presentation.run(createScenario('test.spotlight.advanceWhen', {
			id: 'workspace',
			targetId: 'test.spotlight.workspace',
			title: 'Workspace',
			description: 'Choose a workspace',
			openTarget: true,
			allowTargetInteraction: true,
			advanceWhen: ContextKeyExpr.equals('testSpotlightWorkspaceSelected', true),
		}), { targetWindow: mainWindow, onAbort: Event.None });

		assert.deepStrictEqual({ stateAtOpen, result }, {
			stateAtOpen: { nextHidden: true, targetOverlayVisible: true },
			result: {
				outcome: OnboardingOutcome.Completed,
				shown: true,
				dismissReason: OnboardingDismissReason.Completed,
				lastStepIndex: 0,
				stepCount: 1,
			},
		});
	});
});
