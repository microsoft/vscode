/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
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
		let shown = 0;
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
		const lateResult = await presentation.run(lateScenario, { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => shown++ });

		const missingScenario = createScenario('test.spotlight.skip', {
			id: 'missing',
			targetId: 'test.spotlight.missingTarget',
			title: 'Missing target',
			description: 'Missing target description',
			missingTarget: { kind: 'skip' },
		});
		const missingResult = await presentation.run(missingScenario, { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => shown++ });

		assert.deepStrictEqual({ lateResult, missingResult, shown }, {
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
			shown: 1,
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

	for (const runAsSequenceStep of [false, true]) {
		test(`forwards acknowledgment options after awaiting target preparation (runAsSequenceStep: ${runAsSequenceStep})`, async () => {
			const container = createContainer();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
			let visibleButtons: (string | null)[] = [];
			const step: ISpotlightStep = {
				id: 'acknowledge',
				targetId: 'test.spotlight.acknowledge',
				title: 'Archive',
				description: 'Archive the session',
				nextButtonLabel: 'Understood',
				missingTarget: { kind: 'abort' },
				onBeforeShow: async () => {
					await Promise.resolve();
					createTarget(container, 'test.spotlight.acknowledge');
				},
			};
			const context = {
				targetWindow: mainWindow,
				onAbort: Event.None,
				onDidShow: () => {
					const buttons = Array.from(container.getElementsByClassName('monaco-button')) as HTMLElement[];
					visibleButtons = buttons.filter(button => button.style.display !== 'none').map(button => button.textContent);
					buttons[2].click();
				},
			};

			const result = runAsSequenceStep
				? await presentation.runStep({ id: step.id, kind: SPOTLIGHT_PRESENTATION_KIND, payload: step }, {
					...context,
					cancellationToken: CancellationToken.None,
					stepIndex: 0,
					visualStepIndex: 0,
					visualStepCount: 1,
					canGoBack: false,
					isLastVisualStep: true,
				})
				: await presentation.run(createScenario('test.spotlight.acknowledgment', step), context);

			assert.deepStrictEqual({ visibleButtons, result }, {
				visibleButtons: ['Understood'],
				result: runAsSequenceStep ? {
					action: 'next',
					shown: true,
					dismissReason: OnboardingDismissReason.Completed,
				} : {
					outcome: OnboardingOutcome.Completed,
					shown: true,
					dismissReason: OnboardingDismissReason.Completed,
					lastStepIndex: 0,
					stepCount: 1,
				},
			});
		});

		test(`consumed target activation completes the last step (runAsSequenceStep: ${runAsSequenceStep})`, async () => {
			const container = createContainer();
			const target = createTarget(container, 'test.spotlight.advanceOnly');
			let nativeActions = 0;
			disposables.add(addDisposableListener(target, EventType.CLICK, () => nativeActions++));
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
			const step: ISpotlightStep = {
				id: 'archive',
				targetId: 'test.spotlight.advanceOnly',
				title: 'Archive',
				description: 'Archive the session',
				nextButtonLabel: 'Understood',
				advanceOnTargetClick: 'advanceOnly',
				hideNext: false,
			};
			let visibleButtons: (string | null)[] = [];
			const context = {
				targetWindow: mainWindow,
				onAbort: Event.None,
				onDidShow: () => {
					visibleButtons = Array.from(container.getElementsByClassName('monaco-button'))
						.filter(button => (button as HTMLElement).style.display !== 'none').map(button => button.textContent);
					target.click();
				},
			};
			const result = runAsSequenceStep
				? await presentation.runStep({ id: step.id, kind: SPOTLIGHT_PRESENTATION_KIND, payload: step }, {
					...context,
					cancellationToken: CancellationToken.None,
					stepIndex: 0,
					visualStepIndex: 0,
					visualStepCount: 1,
					canGoBack: false,
					isLastVisualStep: true,
				})
				: await presentation.run(createScenario('test.spotlight.advanceOnly', step), context);

			assert.deepStrictEqual({ nativeActions, visibleButtons, result }, {
				nativeActions: 0,
				visibleButtons: ['Understood'],
				result: runAsSequenceStep ? {
					action: 'next', shown: true, dismissReason: OnboardingDismissReason.TargetClick,
				} : {
					outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.TargetClick, lastStepIndex: 0, stepCount: 1,
				},
			});
		});

		test(`missing abort target aborts without showing (runAsSequenceStep: ${runAsSequenceStep})`, async () => {
			const container = createContainer();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
			let prepared = false;
			let shown = 0;
			const step: ISpotlightStep = {
				id: 'missing',
				targetId: 'test.spotlight.abortMissing',
				title: 'Missing',
				description: 'Missing target',
				missingTarget: { kind: 'abort' },
				onBeforeShow: async () => {
					await Promise.resolve();
					prepared = true;
				},
			};
			const context = { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => shown++ };

			const result = runAsSequenceStep
				? await presentation.runStep({ id: step.id, kind: SPOTLIGHT_PRESENTATION_KIND, payload: step }, {
					...context,
					cancellationToken: CancellationToken.None,
					stepIndex: 0,
					visualStepIndex: 0,
					visualStepCount: 1,
					canGoBack: false,
					isLastVisualStep: true,
				})
				: await presentation.run(createScenario('test.spotlight.abortMissing', step), context);

			assert.deepStrictEqual({ result, prepared, shown }, {
				result: runAsSequenceStep ? {
					action: 'abort',
					shown: false,
				} : {
					outcome: OnboardingOutcome.Aborted,
					shown: false,
					dismissReason: OnboardingDismissReason.Aborted,
					lastStepIndex: 0,
					stepCount: 1,
				},
				prepared: true,
				shown: 0,
			});
		});

		for (const onTimeout of [undefined, 'skip', 'abort'] as const) {
			test(`missing target waits before ${onTimeout ?? 'default skip'} (runAsSequenceStep: ${runAsSequenceStep})`, () => runWithFakedTimers({}, async () => {
				const container = createContainer();
				const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
				const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
				let shown = 0;
				const step: ISpotlightStep = {
					id: 'missing',
					targetId: 'test.spotlight.timeoutMissing',
					title: 'Missing',
					description: 'Missing target',
					missingTarget: { kind: 'wait', timeoutMs: 100, onTimeout },
				};
				const context = { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => shown++ };
				const startTime = Date.now();
				const result = runAsSequenceStep
					? await presentation.runStep({ id: step.id, kind: SPOTLIGHT_PRESENTATION_KIND, payload: step }, {
						...context,
						cancellationToken: CancellationToken.None,
						stepIndex: 0,
						visualStepIndex: 0,
						visualStepCount: 1,
						canGoBack: false,
						isLastVisualStep: true,
					})
					: await presentation.run(createScenario('test.spotlight.timeoutMissing', step), context);

				assert.deepStrictEqual({ elapsed: Date.now() - startTime, result, shown }, {
					elapsed: 100,
					result: runAsSequenceStep ? {
						action: onTimeout === 'abort' ? 'abort' : 'skipStep',
						shown: false,
					} : {
						outcome: onTimeout === 'abort' ? OnboardingOutcome.Aborted : OnboardingOutcome.Completed,
						shown: false,
						dismissReason: onTimeout === 'abort' ? OnboardingDismissReason.Aborted : OnboardingDismissReason.Completed,
						lastStepIndex: 0,
						stepCount: 1,
					},
					shown: 0,
				});
			}));
		}
	}

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

	for (const preselected of [false, true]) {
		for (const action of ['next', 'select'] as const) {
			test(`conditionally opens the target and advances via ${action} with preselected=${preselected}`, async () => {
				const container = createContainer();
				const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
				contextKeyService.createKey('testSpotlightWorkspaceSelected', false);
				const selected = disposables.add(new Emitter<Promise<boolean>>());
				let opened = 0;
				const targetId = 'test.spotlight.optionalWorkspace';
				createTarget(container, targetId, { open: () => { opened++; }, hasSelection: () => preselected, onDidSelect: selected.event });
				let modelOpened = 0;
				createTarget(container, 'test.spotlight.collapsedModel', { open: () => { modelOpened++; } });
				const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
				const buttons: { readonly hidden: boolean; readonly label: string | null }[] = [];
				const result = await presentation.run(createScenario('test.spotlight.optionalSelection', {
					id: 'workspace',
					targetId,
					title: 'Workspace',
					description: 'Choose a workspace or continue',
					openTarget: 'ifUnselected',
					allowTargetInteraction: true,
					advanceOnTargetSelection: true,
				}, {
					id: 'model',
					targetId: 'test.spotlight.collapsedModel',
					title: 'Model',
					description: 'Choose a model',
					openTarget: false,
					allowTargetInteraction: true,
				}), {
					targetWindow: mainWindow,
					onAbort: Event.None,
					onDidShow: () => {
						const next = container.getElementsByClassName('monaco-button')[2] as HTMLElement;
						buttons.push({ hidden: next.style.display === 'none', label: next.textContent });
						const isWorkspaceStep = buttons.length === 1;
						disposables.add(disposableTimeout(() => {
							if (isWorkspaceStep && action === 'select') {
								selected.fire(Promise.resolve(true));
							} else {
								next.click();
							}
						}, 0));
					},
				});
				assert.deepStrictEqual({ opened, modelOpened, buttons, selectionListenerRetained: selected.hasListeners(), result }, {
					opened: preselected ? 0 : 1,
					modelOpened: 0,
					buttons: [{ hidden: false, label: 'Next' }, { hidden: false, label: 'Done' }],
					selectionListenerRetained: false,
					result: {
						outcome: OnboardingOutcome.Completed,
						shown: true,
						dismissReason: OnboardingDismissReason.Completed,
						lastStepIndex: 1,
						stepCount: 2,
					},
				});
			});
		}
	}

	for (const accepted of [true, false]) {
		test(`waits for selection acceptance beyond the next target timeout (accepted: ${accepted})`, () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
			const selection = disposables.add(new Emitter<Promise<boolean>>());
			const acceptance = new DeferredPromise<boolean>();
			createTarget(container, 'test.spotlight.pendingWorkspace', { onDidSelect: selection.event });
			const shown: string[] = [];
			let shownBeforeAcceptance: string[] = [];
			const result = await presentation.run(createScenario('test.spotlight.pendingAcceptance', {
				id: 'workspace',
				targetId: 'test.spotlight.pendingWorkspace',
				title: 'Workspace',
				description: 'Choose a workspace',
				advanceOnTargetSelection: true,
			}, {
				id: 'model',
				targetId: 'test.spotlight.acceptedModel',
				title: 'Model',
				description: 'Choose a model',
				missingTarget: { kind: 'wait', timeoutMs: 5_000 },
			}), {
				targetWindow: mainWindow,
				onAbort: Event.None,
				onDidShow: () => {
					const title = container.getElementsByClassName('spotlight-callout-title')[0].textContent!;
					shown.push(title);
					if (title === 'Model') {
						(container.getElementsByClassName('monaco-button')[2] as HTMLElement).click();
						return;
					}
					selection.fire(acceptance.p);
					disposables.add(disposableTimeout(async () => {
						shownBeforeAcceptance = [...shown];
						createTarget(container, 'test.spotlight.acceptedModel');
						await acceptance.complete(accepted);
						if (!accepted) {
							await Promise.resolve();
							(container.getElementsByClassName('monaco-button')[0] as HTMLElement).click();
						}
					}, 6_000));
				},
			});
			assert.deepStrictEqual({ shownBeforeAcceptance, shown, outcome: result.outcome }, {
				shownBeforeAcceptance: ['Workspace'],
				shown: accepted ? ['Workspace', 'Model'] : ['Workspace'],
				outcome: accepted ? OnboardingOutcome.Completed : OnboardingOutcome.Skipped,
			});
		}));
	}

	test('resolves the step variation at run time', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
		createTarget(container, 'test.spotlight.resolvedTarget');
		const scenario = createScenario('test.spotlight.resolvedSteps');
		const result = await presentation.run({
			...scenario,
			presentation: {
				...scenario.presentation,
				payload: {
					steps: [],
					resolveSteps: async () => [{
						id: 'resolved',
						targetId: 'test.spotlight.resolvedTarget',
						title: 'Resolved step',
						description: 'Selected variation',
					}],
				},
			},
		}, {
			targetWindow: mainWindow,
			onAbort: Event.None,
			onDidShow: () => (container.getElementsByClassName('monaco-button')[2] as HTMLElement).click(),
		});
		assert.deepStrictEqual(result, {
			outcome: OnboardingOutcome.Completed,
			shown: true,
			dismissReason: OnboardingDismissReason.Completed,
			lastStepIndex: 0,
			stepCount: 1,
		});
	});

	test('does not show a step after aborting during variation resolution', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
		const abort = disposables.add(new Emitter<void>());
		const steps = new DeferredPromise<readonly ISpotlightStep[]>();
		const scenario = createScenario('test.spotlight.abortedResolution');
		let shown = 0;
		const result = presentation.run({
			...scenario,
			presentation: {
				...scenario.presentation,
				payload: { steps: [], resolveSteps: () => steps.p },
			},
		}, { targetWindow: mainWindow, onAbort: abort.event, onDidShow: () => shown++ });
		abort.fire();
		await steps.complete([]);
		assert.deepStrictEqual({ result: await result, shown }, {
			result: {
				outcome: OnboardingOutcome.Aborted,
				shown: false,
				dismissReason: OnboardingDismissReason.Aborted,
				lastStepIndex: 0,
				stepCount: 0,
			},
			shown: 0,
		});
	});
});
