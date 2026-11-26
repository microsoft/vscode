/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, EventType, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { hasKey } from '../../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { DialogService } from '../../../../services/dialogs/common/dialogService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestHostService, TestLayoutService, TestQuickInputService } from '../../../../test/browser/workbenchTestServices.js';
import { SpotlightPresentation } from '../../browser/spotlight/spotlightPresentation.js';
import { IOnboardingTargetOptions, markOnboardingTarget, ONBOARDING_TARGET_ATTR, registerOnboardingTargetProvider } from '../../browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_BACKDROP_CONFIG, SPOTLIGHT_CLOSE_BUTTON_CONFIG, SPOTLIGHT_PRESENTATION_KIND } from '../../browser/spotlight/spotlightTypes.js';
import { IOnboardingScenario, OnboardingDismissReason, OnboardingOutcome } from '../../common/onboardingScenario.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { FakeQuickInputService } from './fakeQuickInputService.js';

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

	for (const hideNext of [false, true]) {
		for (const finishWith of ['activation', 'escape', 'advanceOnly'] as const) {
			test(`uses a separate keyboard focus target for ${finishWith} (hideNext: ${hideNext})`, async () => {
				const container = createContainer();
				const previous = $('input');
				const keyboardOwner = $('div');
				keyboardOwner.tabIndex = 0;
				container.append(previous, keyboardOwner);
				previous.focus();
				const activated = disposables.add(new Emitter<void>());
				let focused = 0;
				let activations = 0;
				const target = createTarget(keyboardOwner, 'test.focusOwner', {
					focusTarget: { element: keyboardOwner, focus: () => { focused++; keyboardOwner.focus(); } },
					onDidActivate: activated.event,
				});
				target.tabIndex = -1;
				disposables.add(addDisposableListener(keyboardOwner, EventType.KEY_DOWN, event => {
					if (event.key === 'Enter') {
						activations++;
						activated.fire();
					}
				}));
				const contextKeys = disposables.add(new ContextKeyService(new TestConfigurationService()));
				const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeys, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
				const shown = new DeferredPromise<void>();
				const result = presentation.run(createScenario('test.focusOwner', {
					id: 'focusOwner', targetId: 'test.focusOwner', title: 'New Session', description: 'Start another task.',
					allowTargetInteraction: true, advanceOnTargetClick: finishWith === 'advanceOnly' ? 'advanceOnly' : true, hideNext,
				}), { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { void shown.complete(); } });
				await shown.p;
				if (!hideNext) {
					const next = [...container.querySelectorAll<HTMLElement>('.monaco-button')].at(-1)!;
					next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
				}
				assert.strictEqual(mainWindow.document.activeElement, keyboardOwner);
				const key = finishWith === 'escape' ? 'Escape' : 'Enter';
				const keyCode = finishWith === 'escape' ? 27 : 13;
				keyboardOwner.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
				keyboardOwner.dispatchEvent(new KeyboardEvent('keyup', { key, keyCode, bubbles: true, cancelable: true }));
				const outcome = (await result).outcome;
				assert.deepStrictEqual({
					focused,
					activations,
					outcome,
					restoredFocus: mainWindow.document.activeElement === previous,
					overlayRemaining: !!container.querySelector('.spotlight-callout'),
				}, {
					focused: 1,
					activations: finishWith === 'activation' ? 1 : 0,
					outcome: finishWith === 'escape' ? OnboardingOutcome.Skipped : OnboardingOutcome.Completed,
					restoredFocus: finishWith !== 'activation',
					overlayRemaining: false,
				});
			});
		}
	}

	test('a primary action runs only on click and waits for accepted selection', async () => {
		const container = createContainer();
		const contextKeys = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeys, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
		const selected = disposables.add(new Emitter<Promise<boolean>>());
		const shown = new DeferredPromise<void>();
		const accepted = new DeferredPromise<boolean>();
		createTarget(container, 'test.action', { onDidSelect: selected.event });
		let actions = 0;
		let completed = false;
		const result = presentation.run(createScenario('test.action', {
			id: 'action', targetId: 'test.action', title: 'Choose', description: 'Choose a model.',
			advanceOnTargetSelection: true, hideNext: true,
			primaryAction: { label: 'Use Copilot', run: () => { actions++; } },
		}), { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { void shown.complete(); } });
		void result.then(() => { completed = true; });
		await shown.p;
		const buttons = Array.from(container.querySelectorAll<HTMLElement>('.monaco-button'));
		assert.deepStrictEqual({ actions, visibleButtons: buttons.filter(button => button.style.display !== 'none').map(button => button.textContent) }, {
			actions: 0, visibleButtons: ['End Tour', 'Use Copilot'],
		});
		buttons[2].click();
		buttons[2].click();
		selected.fire(accepted.p);
		await Promise.resolve();
		assert.deepStrictEqual({ actions, completed }, { actions: 1, completed: false });
		await accepted.complete(true);
		assert.strictEqual((await result).outcome, OnboardingOutcome.Completed);
	});

	for (const choice of ['primary', 'endTour'] as const) {
		test(`an advancing primary action completes the last step, and a custom End Tour label skips it (${choice})`, async () => {
			const container = createContainer();
			const contextKeys = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeys, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
			createTarget(container, 'test.upgrade');
			let actions = 0;
			let visibleButtons: (string | null)[] = [];
			const result = await presentation.run(createScenario('test.upgrade', {
				id: 'upgrade', targetId: 'test.upgrade', title: 'Upgrade', description: 'Get more requests.',
				primaryAction: { label: 'See Plans', run: () => { actions++; }, advance: true },
				endTourLabel: 'Later',
			}), {
				targetWindow: mainWindow, onAbort: Event.None,
				onDidShow: () => {
					const buttons = Array.from(container.querySelectorAll<HTMLElement>('.monaco-button'));
					visibleButtons = buttons.filter(button => button.style.display !== 'none').map(button => button.textContent);
					buttons[choice === 'primary' ? 2 : 0].click();
				},
			});
			assert.deepStrictEqual({ actions, visibleButtons, outcome: result.outcome, dismissReason: result.dismissReason }, {
				actions: choice === 'primary' ? 1 : 0,
				visibleButtons: ['Later', 'See Plans'],
				outcome: choice === 'primary' ? OnboardingOutcome.Completed : OnboardingOutcome.Skipped,
				dismissReason: choice === 'primary' ? OnboardingDismissReason.Completed : OnboardingDismissReason.SkipButton,
			});
		});
	}

	for (const exit of ['back', 'endTour', 'abort', 'replace'] as const) {
		test(`cancels a pending primary action on ${exit} and ignores its late result`, async () => {
			const container = createContainer();
			const contextKeys = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeys, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
			const abort = disposables.add(new Emitter<void>());
			const shown = new DeferredPromise<void>();
			const action = new DeferredPromise<void>();
			const cancelled = new DeferredPromise<void>();
			const target = createTarget(container, 'test.cancelAction');
			let actionToken: CancellationToken | undefined;
			const result = presentation.runStep({
				id: 'action', kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					id: 'action', targetId: 'test.cancelAction', title: 'Choose', description: 'Choose a model.',
					missingTarget: { kind: 'abort' },
					primaryAction: {
						label: 'Use Copilot', run: token => {
							actionToken = token;
							disposables.add(token.onCancellationRequested(() => { void cancelled.complete(); }));
							return action.p;
						},
					},
				} satisfies ISpotlightStep,
			}, {
				targetWindow: mainWindow, onAbort: abort.event, onDidShow: () => { void shown.complete(); },
				cancellationToken: CancellationToken.None, stepIndex: 1, visualStepIndex: 1, visualStepCount: 2, canGoBack: true, isLastVisualStep: true,
			});
			await shown.p;
			const [endTour, back, primary] = Array.from(container.querySelectorAll<HTMLElement>('.monaco-button'));
			primary.click();
			if (exit === 'back') { back.click(); }
			else if (exit === 'endTour') { endTour.click(); }
			else if (exit === 'abort') { abort.fire(); }
			else { target.remove(); }
			await cancelled.p;
			await action.complete();
			assert.deepStrictEqual({ cancelled: actionToken?.isCancellationRequested, action: (await result).action }, {
				cancelled: true, action: exit === 'back' ? 'back' : exit === 'endTour' ? 'skipSequence' : 'abort',
			});
		});
	}

	test('a scoped adapter reports selection without replacing the owner target marker', async () => {
		const container = createContainer();
		const contextKeys = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeys, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
		const selected = disposables.add(new Emitter<Promise<boolean>>());
		const target = createTarget(container, 'test.owner');
		disposables.add(registerOnboardingTargetProvider('test.adapter', () => ({ element: target, onDidSelect: selected.event })));
		const result = await presentation.run(createScenario('test.adapter', {
			id: 'choose', targetId: 'test.adapter', title: 'Open Session', description: 'Use the real row.',
			allowTargetInteraction: true, advanceOnTargetSelection: true, hideNext: true,
		}), {
			targetWindow: mainWindow, onAbort: Event.None,
			onDidShow: () => selected.fire(Promise.resolve(true)),
		});
		assert.deepStrictEqual({ outcome: result.outcome, marker: target.getAttribute(ONBOARDING_TARGET_ATTR), retainedListener: selected.hasListeners() }, {
			outcome: OnboardingOutcome.Completed, marker: 'test.owner', retainedListener: false,
		});
	});

	for (const backdrop of [true, false]) {
		test(`paints the backdrop and dims the window controls only when enabled (backdrop: ${backdrop})`, async () => {
			const container = createContainer();
			// An undefined token would invalidate the whole box-shadow.
			container.style.setProperty('--vscode-focusBorder', '#0078d4');
			const dimming: boolean[] = [];
			const host = new class extends TestHostService {
				override async setWindowDimmed(_window: Window, dimmed: boolean): Promise<void> { dimming.push(dimmed); }
			};
			const contextKeys = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const configuration = new TestConfigurationService({ [SPOTLIGHT_BACKDROP_CONFIG]: backdrop });
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), host, contextKeys, configuration, NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
			createTarget(container, 'test.backdrop');
			let whileShown: { backdropPainted: boolean; ringPainted: boolean; dimming: boolean[] } | undefined;
			const result = await presentation.run(createScenario('test.backdrop', {
				id: 'backdrop', targetId: 'test.backdrop', title: 'Backdrop', description: 'Highlights the target.',
			}), {
				targetWindow: mainWindow, onAbort: Event.None,
				onDidShow: () => {
					const boxShadow = mainWindow.getComputedStyle(container.querySelector<HTMLElement>('.spotlight-hole')!).boxShadow;
					whileShown = { backdropPainted: boxShadow.includes('9999px'), ringPainted: boxShadow.includes('inset'), dimming: [...dimming] };
					[...container.querySelectorAll<HTMLElement>('.monaco-button')].at(-1)!.click();
				},
			});
			assert.deepStrictEqual({ outcome: result.outcome, whileShown, dimming }, {
				outcome: OnboardingOutcome.Completed,
				whileShown: { backdropPainted: backdrop, ringPainted: true, dimming: backdrop ? [true] : [] },
				dimming: backdrop ? [true, false] : [],
			});
		});
	}


	for (const source of ['assignedDefault', 'explicitValue'] as const) {
		for (const closeButton of [false, true]) {
			test(`logs the backdrop and close button experiment triggers only for assigned defaults and ends the tour from the shown button (${source}: ${closeButton})`, async () => {
				const container = createContainer();
				const telemetry = new TestExperimentTriggerTelemetryService();
				const contextKeys = disposables.add(new ContextKeyService(new TestConfigurationService()));
				// The test service reports every value as a user value; an experiment assigns the default instead.
				const configuration = new class extends TestConfigurationService {
					override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
						const inspected = super.inspect<T>(key, overrides);
						return source === 'assignedDefault' ? { value: inspected.value, defaultValue: inspected.value } : inspected;
					}
				}({ [SPOTLIGHT_BACKDROP_CONFIG]: true, [SPOTLIGHT_CLOSE_BUTTON_CONFIG]: closeButton });
				const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeys, configuration, telemetry, new TestDialogService(), new TestQuickInputService()));
				createTarget(container, 'test.closeButton');
				const step = (id: string): ISpotlightStep => ({ id, targetId: 'test.closeButton', title: id, description: 'Highlights the target.' });
				let whileShown: { triggers: string[]; closeButtons: number; endTour: boolean } | undefined;
				const result = await presentation.run(createScenario('test.closeButton', step('first'), step('second')), {
					targetWindow: mainWindow, onAbort: Event.None,
					onDidShow: () => {
						const close = container.querySelector<HTMLElement>('.spotlight-callout-close');
						const endTour = [...container.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === 'End Tour' && button.style.display !== 'none');
						whileShown = { triggers: [...telemetry.triggers], closeButtons: container.querySelectorAll('.spotlight-callout-close').length, endTour: !!endTour };
						(close ?? endTour)!.click();
					},
				});
				assert.deepStrictEqual({ whileShown, outcome: result.outcome, dismissReason: result.dismissReason }, {
					whileShown: { triggers: source === 'assignedDefault' ? [`config.${SPOTLIGHT_BACKDROP_CONFIG}`, `config.${SPOTLIGHT_CLOSE_BUTTON_CONFIG}`] : [], closeButtons: closeButton ? 1 : 0, endTour: !closeButton },
					outcome: OnboardingOutcome.Skipped,
					dismissReason: OnboardingDismissReason.SkipButton,
				});
			});
		}
	}

	test('resolves a target within the prepared instance scope', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
		const opened: string[] = [];
		const targetId = 'test.spotlight.scoped';
		createTarget(container, targetId, { scope: 'first', open: () => { opened.push('first'); } });
		const second = createTarget(container, targetId, {
			scope: 'second',
			open: () => {
				opened.push('second');
				second.click();
			},
		});

		const result = await presentation.run(createScenario('test.spotlight.scoped', {
			id: 'scoped',
			targetId,
			title: 'Scoped target',
			description: 'Use the prepared target.',
			openTarget: true,
			advanceOnTargetClick: true,
		}), {
			targetWindow: mainWindow,
			targetScope: 'second',
			onAbort: Event.None,
		});

		assert.deepStrictEqual({ opened, result }, {
			opened: ['second'],
			result: {
				outcome: OnboardingOutcome.Completed,
				shown: true,
				dismissReason: OnboardingDismissReason.TargetClick,
				lastStepIndex: 0,
				stepCount: 1,
			},
		});
	});

	for (const runAsSequenceStep of [false, true]) {
		for (const returns of [false, true]) {
			test(`waits for a picker lost after showing, then ${returns ? 'reattaches' : 'skips'} (runAsSequenceStep: ${runAsSequenceStep})`, async () => {
				const container = createContainer();
				const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
				const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
				const targetId = 'test.spotlight.disappearingPicker';
				let hiddenWhileWaiting = false;
				let shown = 0;
				let prepared = 0;
				const opened: string[] = [];
				const original = createTarget(container, targetId, {
					open: () => {
						original.remove();
						disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => {
							hiddenWhileWaiting = container.querySelector<HTMLElement>('.spotlight-overlay')!.style.display === 'none';
						}));
						if (returns) {
							disposables.add(disposableTimeout(() => {
								const replacement = createTarget(container, targetId, {
									open: () => {
										opened.push(container.querySelector<HTMLElement>('.spotlight-hole')!.style.top);
										replacement.click();
									},
								});
								replacement.style.top = '200px';
							}, 100));
						}
					},
				});
				const next = createTarget(container, 'test.spotlight.afterMissing', {
					open: () => {
						opened.push('next');
						next.click();
					},
				});
				const step: ISpotlightStep = {
					id: 'picker',
					targetId,
					title: 'Picker',
					description: 'Choose a value.',
					openTarget: true,
					advanceOnTargetClick: true,
					missingTarget: { kind: 'wait', timeoutMs: 300 },
					onBeforeShow: () => { prepared++; },
				};
				const context = { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { shown++; } };
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
					: await presentation.run(createScenario('test.spotlight.disappearingPicker', step, {
						id: 'next',
						targetId: 'test.spotlight.afterMissing',
						title: 'Next',
						description: 'The tour continues.',
						openTarget: true,
						advanceOnTargetClick: true,
					}), context);

				assert.deepStrictEqual({
					hiddenWhileWaiting,
					prepared,
					shown,
					opened,
					outcome: hasKey(result, { action: true }) ? result.action : result.outcome,
				}, {
					hiddenWhileWaiting: true,
					prepared: 1,
					shown: runAsSequenceStep ? 1 : 2,
					opened: [...(returns ? ['194px'] : []), ...(runAsSequenceStep ? [] : ['next'])],
					outcome: runAsSequenceStep ? returns ? 'next' : 'skipStep' : OnboardingOutcome.Completed,
				});
			});
		}

		test(`waits for a picker replaced while the target settles (runAsSequenceStep: ${runAsSequenceStep})`, async () => {
			const container = createContainer();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
			const targetId = 'test.spotlight.replacedPicker';
			const original = createTarget(container, targetId);
			let replacement: HTMLElement | undefined;
			const shown: { connected: boolean; top: string }[] = [];
			const step: ISpotlightStep = {
				id: 'picker',
				targetId,
				title: 'Picker',
				description: 'Choose a value.',
				missingTarget: { kind: 'wait', timeoutMs: 1000 },
				onBeforeShow: () => {
					disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => {
						original.remove();
						disposables.add(disposableTimeout(() => {
							replacement = createTarget(container, targetId);
							replacement.style.top = '200px';
						}, 100));
					}));
				},
			};
			const context = {
				targetWindow: mainWindow,
				onAbort: Event.None,
				onDidShow: () => {
					shown.push({
						connected: replacement?.isConnected ?? false,
						top: container.querySelector<HTMLElement>('.spotlight-hole')!.style.top,
					});
					(container.getElementsByClassName('monaco-button')[2] as HTMLElement).click();
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
				: await presentation.run(createScenario('test.spotlight.replacedPicker', step), context);

			assert.deepStrictEqual({
				completed: hasKey(result, { action: true }) ? result.action === 'next' : result.outcome === OnboardingOutcome.Completed,
				shown,
			}, { completed: true, shown: [{ connected: true, top: '194px' }] });
		});

		test(`waits for an owner-provided control and invokes its opener (runAsSequenceStep: ${runAsSequenceStep})`, () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
			const target = $('button');
			target.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 100px; height: 30px;';
			container.appendChild(target);
			let ready = false;
			let opened = 0;
			disposables.add(registerOnboardingTargetProvider('test.provided', scope => ready && scope === 'prepared' ? {
				element: target,
				open: () => {
					opened++;
					target.click();
				},
			} : undefined));
			const step: ISpotlightStep = {
				id: 'provided',
				targetId: 'test.provided',
				title: 'Provided control',
				description: 'Use the control exposed by its owner.',
				openTarget: true,
				advanceOnTargetClick: true,
				missingTarget: { kind: 'wait', timeoutMs: 500 },
				onBeforeShow: () => {
					disposables.add(disposableTimeout(() => ready = true, 100));
				},
			};
			const context = { targetWindow: mainWindow, targetScope: 'prepared', onAbort: Event.None };
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
				: await presentation.run(createScenario('test.provided', step), context);

			assert.deepStrictEqual({
				shown: result.shown,
				completed: hasKey(result, { action: true }) ? result.action === 'next' : result.outcome === OnboardingOutcome.Completed,
				opened,
				marked: target.hasAttribute(ONBOARDING_TARGET_ATTR),
			}, { shown: true, completed: true, opened: 1, marked: false });
		}));
	}

	test('can abort while waiting for a picker that disappeared after showing', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
		const abort = disposables.add(new Emitter<void>());
		const targetId = 'test.spotlight.disappearingAbort';
		const target = createTarget(container, targetId, {
			open: () => {
				target.remove();
				disposables.add(disposableTimeout(() => abort.fire(), 100));
			},
		});
		const result = await presentation.run(createScenario('test.spotlight.disappearingAbort', {
			id: 'picker',
			targetId,
			title: 'Picker',
			description: 'Choose a value.',
			openTarget: true,
			missingTarget: { kind: 'wait', timeoutMs: 10_000 },
		}), { targetWindow: mainWindow, onAbort: abort.event });

		assert.deepStrictEqual({ outcome: result.outcome, remainingOverlays: container.getElementsByClassName('spotlight-overlay').length }, {
			outcome: OnboardingOutcome.Aborted,
			remainingOverlays: 0,
		});
	});

	test('waits for a late target and skips a missing target immediately', () => runWithFakedTimers({}, async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));

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
	}));

	test('excludes skipped steps from displayed progress', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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
				const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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

	test('hides the previous step while waiting for the next target', () => runWithFakedTimers({}, async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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
	}));

	test('aborts immediately while waiting for a target', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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

		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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
				const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
				const buttons: { readonly hidden: boolean; readonly label: string | null }[] = [];
				const titles: (string | null)[] = [];
				const result = await presentation.run(createScenario('test.spotlight.optionalSelection', {
					id: 'workspace',
					targetId,
					title: 'Workspace',
					description: 'Choose a workspace or continue',
					selectedContent: { title: 'Selected workspace', description: 'Switch workspaces' },
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
						titles.push(container.getElementsByClassName('spotlight-callout-title')[0].textContent);
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
				assert.deepStrictEqual({ opened, modelOpened, buttons, titles, selectionListenerRetained: selected.hasListeners(), result }, {
					opened: preselected ? 0 : 1,
					modelOpened: 0,
					buttons: [{ hidden: false, label: 'Next' }, { hidden: false, label: 'Done' }],
					titles: [preselected ? 'Selected workspace' : 'Workspace', 'Model'],
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

	for (const runAsSequenceStep of [false, true]) {
		test(`skips a step whose target already has a selection (runAsSequenceStep: ${runAsSequenceStep})`, async () => {
			const container = createContainer();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
			createTarget(container, 'test.spotlight.preselected', { hasSelection: () => true });
			createTarget(container, 'test.spotlight.unselected', { hasSelection: () => false });
			const step = (id: string): ISpotlightStep => ({ id, targetId: `test.spotlight.${id}`, title: id, description: id, skipIfSelected: true });
			const shown: (string | null)[] = [];
			const onDidShow = () => {
				shown.push(container.getElementsByClassName('spotlight-callout-title')[0].textContent);
				(container.getElementsByClassName('monaco-button')[2] as HTMLElement).click();
			};
			const results: (string | number)[] = [];
			if (runAsSequenceStep) {
				for (const id of ['preselected', 'unselected']) {
					results.push((await presentation.runStep({ id, kind: SPOTLIGHT_PRESENTATION_KIND, payload: step(id) }, {
						targetWindow: mainWindow, onAbort: Event.None, onDidShow,
						cancellationToken: CancellationToken.None, stepIndex: 0, visualStepIndex: 0, visualStepCount: 1, canGoBack: false, isLastVisualStep: true,
					})).action);
				}
			} else {
				results.push((await presentation.run(createScenario('test.spotlight.skipIfSelected', step('preselected'), step('unselected')), { targetWindow: mainWindow, onAbort: Event.None, onDidShow })).lastStepIndex);
			}
			assert.deepStrictEqual({ shown, results }, {
				shown: ['unselected'],
				results: runAsSequenceStep ? ['skipStep', 'next'] : [1],
			});
		});
	}

	for (const accepted of [true, false]) {
		test(`waits for selection acceptance beyond the next target timeout (accepted: ${accepted})`, () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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

	test('closes an opened target before a step for another element and when the tour ends', () => runWithFakedTimers({}, async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
		const shared = createTarget(container, 'test.spotlight.closeShared');
		const other = createTarget(container, 'test.spotlight.closeOther');
		const log: string[] = [];
		const provide = (label: string, element: HTMLElement) => disposables.add(registerOnboardingTargetProvider(`test.spotlight.close.${label}`, () => ({
			element,
			open: () => {
				log.push(`open ${label}`);
				element.click();
			},
			close: () => log.push(`close ${label}${container.querySelector('.spotlight-overlay') ? '' : ' after the overlay'}`),
		})));
		provide('first', shared);
		provide('second', shared);
		provide('third', other);
		const step = (label: string): ISpotlightStep => ({ id: label, targetId: `test.spotlight.close.${label}`, title: label, description: label, openTarget: true, advanceOnTargetClick: true });

		await presentation.run(createScenario('test.spotlight.close', step('first'), step('second'), step('third')), { targetWindow: mainWindow, onAbort: Event.None });

		assert.deepStrictEqual(log, ['open first', 'open second', 'close second', 'open third', 'close third']);
	}));

	test('does not show a step after aborting during variation resolution', async () => {
		const container = createContainer();
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, new TestDialogService(), new TestQuickInputService()));
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

	suite('modal UI', () => {

		function createQuickInputService(): FakeQuickInputService {
			return disposables.add(new FakeQuickInputService());
		}

		function createDialogService(): DialogService {
			return disposables.add(new DialogService(new class extends mock<IWorkbenchEnvironmentService>() { }(), new NullLogService()));
		}

		function showDialog(dialogService: DialogService) {
			return dialogService.model.show({ promptArgs: { prompt: { message: 'Do you trust the authors of the files in this folder?' } } });
		}

		function nextFrame(): Promise<void> {
			return new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		}

		/** Runs virtual time well past the settle delay and then the next frames, so a step that would restore has restored. */
		async function settle(): Promise<void> {
			await timeout(1000);
			await nextFrame();
			await nextFrame();
		}

		function overlayState(container: HTMLElement) {
			const overlay = container.querySelector<HTMLElement>('.spotlight-overlay')!;
			return {
				visible: overlay.style.display !== 'none',
				title: container.querySelector('.spotlight-callout-title')!.textContent,
				counter: container.querySelector('.spotlight-callout-counter')!.textContent,
			};
		}

		function clickPrimary(container: HTMLElement): void {
			[...container.querySelectorAll<HTMLElement>('.monaco-button')].at(-1)!.click();
		}

		test('hides the step while a dialog is open, ignores Escape in the dialog and restores the step when it closes', () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const dialogService = createDialogService();
			const dimming: boolean[] = [];
			const host = new class extends TestHostService {
				override async setWindowDimmed(_window: Window, dimmed: boolean): Promise<void> { dimming.push(dimmed); }
			};
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), host, contextKeyService, new TestConfigurationService(), NullTelemetryService, dialogService, new TestQuickInputService()));
			const opened = [new DeferredPromise<void>(), new DeferredPromise<void>()];
			let opens = 0;
			createTarget(container, 'test.dialog.workspace', { open: () => { void opened[opens++]?.complete(); } });
			createTarget(container, 'test.dialog.model');
			const result = presentation.run(createScenario('test.dialog.restore', {
				id: 'workspace', targetId: 'test.dialog.workspace', title: 'Choose a workspace', description: 'Pick a folder.',
				openTarget: true, allowTargetInteraction: true,
			}, {
				id: 'model', targetId: 'test.dialog.model', title: 'Choose a model', description: 'Pick a model.',
				onDidShow: () => clickPrimary(container),
			}), { targetWindow: mainWindow, onAbort: Event.None });
			await opened[0].p;

			const dialog = showDialog(dialogService);
			const whileOpen = overlayState(container);
			mainWindow.document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			dialog.item.close();
			await dialog.result;
			await opened[1].p;
			const restored = { ...overlayState(container), focused: mainWindow.document.activeElement?.textContent };
			clickPrimary(container);

			assert.deepStrictEqual({ whileOpen, restored, result: await result, dimming }, {
				whileOpen: { visible: false, title: 'Choose a workspace', counter: '1 of 2' },
				restored: { visible: true, title: 'Choose a workspace', counter: '1 of 2', focused: 'Next' },
				result: { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 1, stepCount: 2 },
				dimming: [true, true, false],
			});
		}));

		test('advances without restoring the step when the dialog accepts its pending selection', () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const dialogService = createDialogService();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, dialogService, new TestQuickInputService()));
			const selected = disposables.add(new Emitter<Promise<boolean>>());
			const acceptance = new DeferredPromise<boolean>();
			const opened = new DeferredPromise<void>();
			let opens = 0;
			createTarget(container, 'test.dialog.pendingWorkspace', { onDidSelect: selected.event, open: () => { opens++; void opened.complete(); } });
			createTarget(container, 'test.dialog.acceptedModel');
			const result = presentation.run(createScenario('test.dialog.accept', {
				id: 'workspace', targetId: 'test.dialog.pendingWorkspace', title: 'Choose a workspace', description: 'Pick a folder.',
				openTarget: true, allowTargetInteraction: true, advanceOnTargetSelection: true,
			}, {
				id: 'model', targetId: 'test.dialog.acceptedModel', title: 'Choose a model', description: 'Pick a model.',
				onDidShow: () => clickPrimary(container),
			}), { targetWindow: mainWindow, onAbort: Event.None });
			await opened.p;

			selected.fire(acceptance.p);
			const dialog = showDialog(dialogService);
			dialog.item.close();
			await dialog.result;
			await settle();
			const beforeAcceptance = overlayState(container).visible;
			await acceptance.complete(true);

			assert.deepStrictEqual({ beforeAcceptance, opens, result: await result }, {
				beforeAcceptance: false,
				opens: 1,
				result: { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 1, stepCount: 2 },
			});
		}));

		test('hides the step while the Quick Input is open, leaves Escape to it, does not dim the window and restores the step when it closes', () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const quickInput = createQuickInputService();
			const dimming: boolean[] = [];
			const host = new class extends TestHostService {
				override async setWindowDimmed(_window: Window, dimmed: boolean): Promise<void> { dimming.push(dimmed); }
			};
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), host, contextKeyService, new TestConfigurationService(), NullTelemetryService, createDialogService(), quickInput));
			const opened = [new DeferredPromise<void>(), new DeferredPromise<void>()];
			let opens = 0;
			createTarget(container, 'test.quickInput.workspace', { open: () => { void opened[opens++]?.complete(); } });
			createTarget(container, 'test.quickInput.model');
			const result = presentation.run(createScenario('test.quickInput.restore', {
				id: 'workspace', targetId: 'test.quickInput.workspace', title: 'Choose a workspace', description: 'Pick a folder.',
				openTarget: true, allowTargetInteraction: true,
			}, {
				id: 'model', targetId: 'test.quickInput.model', title: 'Choose a model', description: 'Pick a model.',
				onDidShow: () => clickPrimary(container),
			}), { targetWindow: mainWindow, onAbort: Event.None });
			await opened[0].p;

			quickInput.show();
			const whileOpen = { visible: overlayState(container).visible, dimming: [...dimming] };
			mainWindow.document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			quickInput.hide();
			await opened[1].p;
			const restored = overlayState(container);
			clickPrimary(container);

			assert.deepStrictEqual({ whileOpen, restored, result: await result, dimming }, {
				whileOpen: { visible: false, dimming: [true, false] },
				restored: { visible: true, title: 'Choose a workspace', counter: '1 of 2' },
				result: { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 1, stepCount: 2 },
				dimming: [true, false, true, false],
			});
		}));

		test('keeps the step hidden when a folder picked in the Quick Input is decided by a later dialog', () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const dialogService = createDialogService();
			const quickInput = createQuickInputService();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, dialogService, quickInput));
			const selected = disposables.add(new Emitter<Promise<boolean>>());
			const acceptance = new DeferredPromise<boolean>();
			const opened = new DeferredPromise<void>();
			let opens = 0;
			createTarget(container, 'test.quickInput.pendingWorkspace', { onDidSelect: selected.event, open: () => { opens++; void opened.complete(); } });
			createTarget(container, 'test.quickInput.acceptedModel');
			const result = presentation.run(createScenario('test.quickInput.handOver', {
				id: 'workspace', targetId: 'test.quickInput.pendingWorkspace', title: 'Choose a workspace', description: 'Pick a folder.',
				openTarget: true, allowTargetInteraction: true, advanceOnTargetSelection: true,
			}, {
				id: 'model', targetId: 'test.quickInput.acceptedModel', title: 'Choose a model', description: 'Pick a model.',
				onDidShow: () => clickPrimary(container),
			}), { targetWindow: mainWindow, onAbort: Event.None });
			await opened.p;

			quickInput.show();
			const whileQuickInput = overlayState(container).visible;
			quickInput.hide();
			// The picker reports the folder a little after the Quick Input closes, and the trust dialog follows.
			await timeout(50);
			selected.fire(acceptance.p);
			const beforeDialog = overlayState(container).visible;
			const dialog = showDialog(dialogService);
			dialog.item.close();
			await dialog.result;
			await acceptance.complete(true);

			assert.deepStrictEqual({ whileQuickInput, beforeDialog, opens, result: await result }, {
				whileQuickInput: false,
				beforeDialog: false,
				opens: 1,
				result: { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 1, stepCount: 2 },
			});
		}));

		for (const change of ['targetRemoved', 'contextChanged'] as const) {
			test(`moves on instead of restoring a step whose target or context the dialog changed (${change})`, () => runWithFakedTimers({}, async () => {
				const container = createContainer();
				const dialogService = createDialogService();
				const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
				const pickerVisible = contextKeyService.createKey<boolean>('testSpotlightDialogPickerVisible', true);
				const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, dialogService, new TestQuickInputService()));
				const opened = new DeferredPromise<void>();
				let opens = 0;
				const workspace = createTarget(container, 'test.dialog.changedWorkspace', { open: () => { opens++; void opened.complete(); } });
				createTarget(container, 'test.dialog.changedModel');
				const shown: string[] = [];
				const result = presentation.run(createScenario('test.dialog.changed', {
					id: 'workspace', targetId: 'test.dialog.changedWorkspace', title: 'Choose a workspace', description: 'Pick a folder.',
					when: ContextKeyExpr.equals('testSpotlightDialogPickerVisible', true),
					missingTarget: { kind: 'skip' }, openTarget: true, allowTargetInteraction: true,
					onDidShow: () => shown.push('workspace'),
				}, {
					id: 'model', targetId: 'test.dialog.changedModel', title: 'Choose a model', description: 'Pick a model.',
					onDidShow: () => {
						shown.push('model');
						clickPrimary(container);
					},
				}), { targetWindow: mainWindow, onAbort: Event.None });
				await opened.p;

				const dialog = showDialog(dialogService);
				const hiddenWhileOpen = !overlayState(container).visible;
				if (change === 'targetRemoved') {
					workspace.remove();
				} else {
					pickerVisible.set(false);
				}
				dialog.item.close();

				assert.deepStrictEqual({ hiddenWhileOpen, result: await result, shown, opens }, {
					hiddenWhileOpen: true,
					result: { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 1, stepCount: 2 },
					shown: ['workspace', 'model'],
					opens: 1,
				});
			}));
		}

		test('advances a step whose target click opened a dialog, and shows the next step once the dialog closes', () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const dialogService = createDialogService();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, dialogService, new TestQuickInputService()));
			const workspace = createTarget(container, 'test.dialog.clickWorkspace');
			let dialog: ReturnType<typeof showDialog> | undefined;
			disposables.add(addDisposableListener(workspace, EventType.CLICK, () => dialog = showDialog(dialogService)));
			createTarget(container, 'test.dialog.clickModel');
			const shown: string[] = [];
			const result = presentation.run(createScenario('test.dialog.click', {
				id: 'workspace', targetId: 'test.dialog.clickWorkspace', title: 'Choose a workspace', description: 'Pick a folder.',
				advanceOnTargetClick: true,
				onDidShow: () => shown.push('workspace'),
			}, {
				id: 'model', targetId: 'test.dialog.clickModel', title: 'Choose a model', description: 'Pick a model.',
				onDidShow: () => {
					shown.push('model');
					clickPrimary(container);
				},
			}), { targetWindow: mainWindow, onAbort: Event.None });
			await settle();

			workspace.click();
			await settle();
			const whileOpen = { visible: overlayState(container).visible, shown: [...shown] };
			dialog!.item.close();
			await dialog!.result;
			await settle();

			assert.deepStrictEqual({ whileOpen, afterClose: [...shown] }, {
				whileOpen: { visible: false, shown: ['workspace'] },
				afterClose: ['workspace', 'model'],
			});
			assert.deepStrictEqual(await result, { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 1, stepCount: 2 });
		}));

		test('a step restored without the backdrop leaves focus where the user works and does not reopen its target', () => runWithFakedTimers({}, async () => {
			const container = createContainer();
			const dialogService = createDialogService();
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const configuration = new TestConfigurationService({ [SPOTLIGHT_BACKDROP_CONFIG]: false });
			const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, configuration, NullTelemetryService, dialogService, new TestQuickInputService()));
			// Like the workspace picker, the opener moves focus into a popup outside the target.
			const picker = container.appendChild($('input'));
			const outside = container.appendChild($('button'));
			let opens = 0;
			createTarget(container, 'test.dialog.focusWorkspace', { open: () => { opens++; picker.focus(); } });
			createTarget(container, 'test.dialog.focusModel');
			const result = presentation.run(createScenario('test.dialog.focus', {
				id: 'workspace', targetId: 'test.dialog.focusWorkspace', title: 'Choose a workspace', description: 'Pick a folder.',
				openTarget: true, allowTargetInteraction: true,
			}, {
				id: 'model', targetId: 'test.dialog.focusModel', title: 'Choose a model', description: 'Pick a model.',
				onDidShow: () => clickPrimary(container),
			}), { targetWindow: mainWindow, onAbort: Event.None });
			await settle();

			outside.focus();
			const dialog = showDialog(dialogService);
			dialog.item.close();
			await dialog.result;
			await settle();
			const restored = { ...overlayState(container), focusedOutside: mainWindow.document.activeElement === outside, opens };
			clickPrimary(container);

			assert.deepStrictEqual({ restored, result: await result }, {
				restored: { visible: true, title: 'Choose a workspace', counter: '1 of 2', focusedOutside: true, opens: 1 },
				result: { outcome: OnboardingOutcome.Completed, shown: true, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 1, stepCount: 2 },
			});
		}));

		for (const ui of ['dialog', 'quickInput'] as const) {
			for (const runAsSequenceStep of [false, true]) {
				test(`does not start a step until an open ${ui} closes (runAsSequenceStep: ${runAsSequenceStep})`, () => runWithFakedTimers({}, async () => {
					const container = createContainer();
					const dialogService = createDialogService();
					const quickInput = createQuickInputService();
					const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
					const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService, new TestConfigurationService(), NullTelemetryService, dialogService, quickInput));
					createTarget(container, 'test.modal.waiting');
					let prepared = 0;
					let shown = 0;
					const step: ISpotlightStep = {
						id: 'waiting', targetId: 'test.modal.waiting', title: 'Waiting', description: 'Shows after the modal UI.',
						onBeforeShow: () => { prepared++; },
					};
					const context = { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { shown++; clickPrimary(container); } };
					const dialog = ui === 'dialog' ? showDialog(dialogService) : undefined;
					if (ui === 'quickInput') {
						quickInput.show();
					}
					const result = runAsSequenceStep
						? presentation.runStep({ id: step.id, kind: SPOTLIGHT_PRESENTATION_KIND, payload: step }, {
							...context, cancellationToken: CancellationToken.None, stepIndex: 0, visualStepIndex: 0, visualStepCount: 1, canGoBack: false, isLastVisualStep: true,
						})
						: presentation.run(createScenario('test.modal.waiting', step), context);
					await settle();
					const whileOpen = { prepared, shown };
					if (dialog) {
						dialog.item.close();
					} else {
						quickInput.hide();
					}
					const end = await result;

					assert.deepStrictEqual({ whileOpen, shown, completed: hasKey(end, { action: true }) ? end.action === 'next' : end.outcome === OnboardingOutcome.Completed }, {
						whileOpen: { prepared: 0, shown: 0 },
						shown: 1,
						completed: true,
					});
				}));
			}
		}
	});
});
