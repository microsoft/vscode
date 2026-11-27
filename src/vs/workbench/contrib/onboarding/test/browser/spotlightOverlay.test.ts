/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, EventType, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ISpotlightContent, SpotlightOverlay } from '../../browser/spotlight/spotlightOverlay.js';
import { OnboardingDismissReason } from '../../common/onboardingScenario.js';

/** Minimal fake ResizeObserver so the widget can be tested without real layout churn. */
class FakeResizeObserver implements ResizeObserver {
	readonly observed: Element[] = [];
	constructor(private readonly _callback: ResizeObserverCallback) { }
	observe(target: Element): void { this.observed.push(target); }
	unobserve(): void { }
	disconnect(): void { }
	trigger(): void { this._callback([], this); }
}

suite('SpotlightOverlay', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContainer(): HTMLElement {
		const container = $('div.test-spotlight-container');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		return container;
	}

	function createTarget(container: HTMLElement, left: number, top: number, width: number, height: number): HTMLElement {
		const target = $('div.test-spotlight-target');
		target.style.position = 'fixed';
		target.style.left = `${left}px`;
		target.style.top = `${top}px`;
		target.style.width = `${width}px`;
		target.style.height = `${height}px`;
		container.appendChild(target);
		return target;
	}

	function content(overrides: Partial<ISpotlightContent> = {}): ISpotlightContent {
		return {
			title: 'My Title',
			description: 'My description',
			stepIndex: 1,
			stepCount: 3,
			canGoBack: true,
			isLastStep: false,
			...overrides
		};
	}

	function getButtons(container: HTMLElement): HTMLElement[] {
		return Array.from(container.getElementsByClassName('monaco-button')) as HTMLElement[];
	}

	test('show renders content and positions the hole around the target (+padding)', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 100, 50, 200, 40);

		overlay.show(target, content());

		const root = container.getElementsByClassName('spotlight-overlay')[0] as HTMLElement;
		const hole = container.getElementsByClassName('spotlight-hole')[0] as HTMLElement;

		assert.deepStrictEqual({
			visible: root.style.display !== 'none',
			title: container.getElementsByClassName('spotlight-callout-title')[0].textContent,
			description: container.getElementsByClassName('spotlight-callout-description')[0].textContent,
			counter: container.getElementsByClassName('spotlight-callout-counter')[0].textContent,
			holeLeft: hole.style.left,
			holeTop: hole.style.top,
			holeWidth: hole.style.width,
			holeHeight: hole.style.height,
		}, {
			visible: true,
			title: 'My Title',
			description: 'My description',
			counter: '2 of 3',
			holeLeft: '94px',
			holeTop: '44px',
			holeWidth: '212px',
			holeHeight: '52px',
		});
	});

	test('vertical placement centers the callout over the target', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 300, 200, 120, 30);

		overlay.show(target, content(), { placement: 'above' });

		const callout = container.getElementsByClassName('spotlight-callout')[0] as HTMLElement;
		const pointer = container.getElementsByClassName('spotlight-callout-pointer')[0] as HTMLElement;
		assert.deepStrictEqual({
			calloutLeft: callout.style.left,
			calloutBottom: callout.offsetTop + callout.offsetHeight,
			pointerSide: pointer.classList.contains('bottom'),
			pointerLeft: pointer.style.left,
			pointerTop: pointer.style.top,
		}, {
			calloutLeft: `${300 + 60 - (callout.offsetWidth / 2)}px`,
			calloutBottom: 184,
			pointerSide: true,
			pointerLeft: `${300 + 60 - 5}px`,
			pointerTop: `${callout.offsetTop + callout.offsetHeight - 5}px`,
		});
	});

	test('keeps the callout border gap aligned with the pointer as placement changes', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, mainWindow.innerWidth / 2, mainWindow.innerHeight / 2, 20, 20);
		const positions = (['above', 'below', 'left', 'right'] as const).map(placement => {
			overlay.show(target, content(), { placement });
			const callout = container.querySelector<HTMLElement>('.spotlight-callout')!;
			const pointer = container.querySelector<HTMLElement>('.spotlight-callout-pointer')!;
			const vertical = pointer.classList.contains('top') || pointer.classList.contains('bottom');
			return {
				offset: parseFloat(callout.style.getPropertyValue('--spotlight-pointer-offset')),
				pointerCenter: vertical
					? parseFloat(pointer.style.left) + 5 - parseFloat(callout.style.left)
					: parseFloat(pointer.style.top) + 5 - parseFloat(callout.style.top),
			};
		});
		assert.deepStrictEqual(positions.map(({ offset, pointerCenter }) => offset === pointerCenter), [true, true, true, true]);
	});

	test('shows progress only for multi-step tours and clears it when reused for one step', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 100, 50, 200, 40);
		const progress = [
			{ stepIndex: 0, stepCount: 1 },
			{ stepIndex: 0, stepCount: 2 },
			{ stepIndex: 1, stepCount: 2 },
			{ stepIndex: 0, stepCount: 1 },
		].map(step => {
			overlay.show(target, content({
				...step,
				canGoBack: step.stepIndex > 0,
				isLastStep: step.stepIndex === step.stepCount - 1,
			}));
			return container.querySelector('.spotlight-callout-counter')!.textContent;
		});

		assert.deepStrictEqual(progress, ['', '1 of 2', '2 of 2', '']);
	});

	test('Next / Back / Skip buttons fire the corresponding events', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);

		const fired: string[] = [];
		disposables.add(overlay.onDidSkip(() => fired.push('skip')));
		disposables.add(overlay.onDidClickPrevious(() => fired.push('back')));
		disposables.add(overlay.onDidClickNext(() => fired.push('next')));

		overlay.show(target, content());

		// Buttons are appended in order: Skip, Back, Next.
		const [skip, back, next] = getButtons(container);
		skip.click();
		back.click();
		next.click();

		assert.deepStrictEqual(fired, ['skip', 'back', 'next']);
	});

	test('primary actions and cancellation remain clickable above an expanded picker', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);
		const pickerBlocker = $('div');
		pickerBlocker.style.cssText = 'position: fixed; inset: 0; z-index: 2576;';
		container.appendChild(pickerBlocker);
		overlay.show(target, content({ isLastStep: true, nextButtonLabel: 'Use Copilot', showEndTour: true }), { targetOverlayVisible: true, allowTargetInteraction: true });

		const buttons = getButtons(container);
		const hitTest = (button: HTMLElement) => {
			const rect = button.getBoundingClientRect();
			return button.contains(mainWindow.document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
		};
		assert.deepStrictEqual({
			labels: buttons.map(button => button.textContent),
			clickable: buttons.map(hitTest),
			pickerClickable: mainWindow.document.elementFromPoint(10, 10) === pickerBlocker,
		}, {
			labels: ['End Tour', 'Back', 'Use Copilot'],
			clickable: [true, true, true],
			pickerClickable: true,
		});
	});

	test('disables a pending primary action and resets it for the next step', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);
		let actions = 0;
		disposables.add(overlay.onDidClickNext(() => actions++));
		overlay.show(target, content());
		const [, , primary] = getButtons(container);
		overlay.setPrimaryActionEnabled(false);
		primary.click();
		assert.deepStrictEqual({ actions, disabled: primary.getAttribute('aria-disabled') }, { actions: 0, disabled: 'true' });

		overlay.show(target, content());
		primary.click();
		assert.deepStrictEqual({ actions, disabled: primary.getAttribute('aria-disabled') }, { actions: 1, disabled: 'false' });
	});

	test('advanceOnTargetClick hides Next and advances when the target is clicked', async () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);

		let advanced = 0;
		disposables.add(overlay.onDidClickNext(() => advanced++));

		overlay.show(target, content(), { advanceOnTargetClick: true });

		const [, , next] = getButtons(container);
		const blockers = Array.from(container.getElementsByClassName('spotlight-blocker')) as HTMLElement[];
		const viewportWidth = mainWindow.document.documentElement.clientWidth;
		const viewportHeight = mainWindow.document.documentElement.clientHeight;
		target.click();
		await timeout(0);

		assert.deepStrictEqual({
			nextHidden: next.style.display === 'none',
			blockers: blockers.map(blocker => ({ left: blocker.style.left, top: blocker.style.top, width: blocker.style.width, height: blocker.style.height })),
			advanced
		}, {
			nextHidden: true,
			blockers: [
				{ left: '0px', top: '0px', width: `${viewportWidth}px`, height: '94px' },
				{ left: '186px', top: '94px', width: `${viewportWidth - 186}px`, height: '42px' },
				{ left: '0px', top: '136px', width: `${viewportWidth}px`, height: `${viewportHeight - 136}px` },
				{ left: '0px', top: '94px', width: '94px', height: '42px' },
			],
			advanced: 1
		});
	});

	test('advanceOnTargetClick observes a nested control that stops propagation', async () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const previous = $('button');
		container.appendChild(previous);
		previous.focus();
		const target = createTarget(container, 100, 100, 80, 30);
		const nestedButton = $('button');
		target.appendChild(nestedButton);
		const events: string[] = [];
		nestedButton.addEventListener('click', event => {
			event.stopPropagation();
			nestedButton.focus();
			events.push('control');
		});
		disposables.add(overlay.onDidClickNext(source => {
			events.push(source);
			overlay.dispose();
		}));

		overlay.show(target, content(), { advanceOnTargetClick: true });
		nestedButton.click();
		await timeout(0);

		assert.deepStrictEqual({
			events,
			nestedControlRetainsFocus: mainWindow.document.activeElement === nestedButton,
		}, {
			events: ['control', 'target'],
			nestedControlRetainsFocus: true,
		});
	});

	test('only Done is shown on a last step without Back', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);

		overlay.show(target, content({ canGoBack: false, isLastStep: true }));

		const [skip, back, next] = getButtons(container);
		assert.deepStrictEqual({
			skipHidden: skip.style.display === 'none',
			backHidden: back.style.display === 'none',
			nextLabel: next.textContent,
		}, {
			skipHidden: true,
			backHidden: true,
			nextLabel: 'Done',
		});
	});

	for (const activation of ['click', 'tap', 'Enter', 'Space'] as const) {
		test(`uses the control activation event for ${activation} without advancing twice or restoring stale focus`, async () => {
			const container = createContainer();
			const previous = $('input');
			const destination = $('input');
			container.append(previous, destination);
			previous.focus();
			const button = disposables.add(new Button(container, defaultButtonStyles));
			button.label = 'New Session';
			const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
			const events: string[] = [];
			disposables.add(button.onDidClick(() => {
				events.push('action');
				destination.focus();
			}));
			disposables.add(overlay.onDidClickNext(source => {
				events.push(source);
				overlay.dispose();
			}));
			overlay.show(button.element, content({ isLastStep: true, nextButtonLabel: 'Understood' }), {
				advanceOnTargetClick: true,
				hideNext: false,
				onDidActivateTarget: Event.map(button.onDidClick, () => undefined),
			});
			if (activation === 'click') {
				button.element.click();
			} else if (activation === 'tap') {
				button.element.dispatchEvent(new CustomEvent(TouchEventType.Tap, { bubbles: true, cancelable: true }));
			} else {
				button.element.dispatchEvent(new KeyboardEvent('keydown', {
					key: activation === 'Enter' ? 'Enter' : ' ',
					keyCode: activation === 'Enter' ? 13 : 32,
					bubbles: true, cancelable: true,
				}));
			}
			await timeout(0);
			const destinationFocused = mainWindow.document.activeElement === destination;
			button.element.click();
			await timeout(0);
			assert.deepStrictEqual({ events, destinationFocused }, {
				events: ['action', 'target', 'action'], destinationFocused: true,
			});
		});
	}

	test('advanceOnly consumes mouse, touch and keyboard activation while keeping the acknowledgment available', () => {
		const container = createContainer();
		const target = disposables.add(new Button(container, defaultButtonStyles));
		target.label = 'Archive';
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const events: string[] = [];
		disposables.add(target.onDidClick(() => events.push('native')));
		disposables.add(overlay.onDidClickNext(source => events.push(source)));
		disposables.add(overlay.onDidSkip(() => events.push('skip')));
		overlay.show(target.element, content({ canGoBack: false, isLastStep: true, nextButtonLabel: 'Understood' }), {
			advanceOnTargetClick: 'advanceOnly',
			hideNext: false,
			onDidActivateTarget: Event.map(target.onDidClick, () => undefined),
		});
		const next = getButtons(container).at(-1)!;
		const visibleButtons = getButtons(container).filter(button => button.style.display !== 'none').map(button => button.textContent);
		next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
		const targetFocused = mainWindow.document.activeElement === target.element;
		target.element.click();
		target.element.dispatchEvent(new CustomEvent(TouchEventType.Tap, { bubbles: true, cancelable: true }));
		for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
			for (const type of ['keydown', 'keyup']) {
				target.element.dispatchEvent(new KeyboardEvent(type, { key, keyCode, bubbles: true, cancelable: true }));
			}
		}
		next.click();
		target.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		overlay.hide();
		target.element.click();
		target.element.dispatchEvent(new CustomEvent(TouchEventType.Tap, { bubbles: true, cancelable: true }));

		assert.deepStrictEqual({ visibleButtons, targetFocused, events }, {
			visibleButtons: ['Archive', 'Understood'],
			targetFocused: true,
			events: ['target', 'target', 'target', 'target', 'button', 'skip', 'native', 'native'],
		});
	});

	test('custom acknowledgment is the only visible button and Escape still skips', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);
		const skipReasons: OnboardingDismissReason[] = [];
		const advances: string[] = [];
		disposables.add(overlay.onDidSkip(reason => skipReasons.push(reason)));
		disposables.add(overlay.onDidClickNext(source => advances.push(source)));

		overlay.show(target, content({ canGoBack: false, isLastStep: true, nextButtonLabel: 'Understood' }));

		const buttons = getButtons(container);
		const next = buttons[2];
		const callout = container.getElementsByClassName('spotlight-callout')[0];
		for (const element of [next, callout]) {
			const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'keyCode', { get: () => 27 /* Escape */ });
			element.dispatchEvent(event);
		}
		const tab = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, shiftKey: true });
		Object.defineProperty(tab, 'keyCode', { get: () => 9 /* Tab */ });
		next.dispatchEvent(tab);
		next.click();

		assert.deepStrictEqual({
			visibleButtons: buttons.filter(button => button.style.display !== 'none').map(button => button.textContent),
			primaryFocused: mainWindow.document.activeElement === next,
			skipReasons,
			advances,
		}, {
			visibleButtons: ['Understood'],
			primaryFocused: true,
			skipReasons: [OnboardingDismissReason.EscapeKey, OnboardingDismissReason.EscapeKey],
			advances: ['button'],
		});
	});

	for (const half of ['primary', 'dropdown'] as const) {
		test(`Escape from a split button's ${half} half dismisses its wrapper spotlight`, () => {
			const container = createContainer();
			const target = disposables.add(new ButtonWithDropdown(container, {
				...defaultButtonStyles,
				contextMenuProvider: { showContextMenu: () => { } },
				actions: [],
			}));
			target.label = 'Create with Agent';
			const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
			const reasons: OnboardingDismissReason[] = [];
			disposables.add(overlay.onDidSkip(reason => reasons.push(reason)));
			overlay.show(target.element, content(), { allowTargetInteraction: true });

			const button = half === 'primary' ? target.primaryButton : target.dropdownButton;
			button.focus();
			button.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));

			assert.deepStrictEqual(reasons, [OnboardingDismissReason.EscapeKey]);
		});
	}

	test('Escape in external target UI skips without consuming the native dismissal', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);
		const popup = $('div.test-spotlight-external-ui');
		mainWindow.document.body.appendChild(popup);
		disposables.add({ dispose: () => popup.remove() });
		const skipReasons: OnboardingDismissReason[] = [];
		let nativeDismissals = 0;
		disposables.add(overlay.onDidSkip(reason => skipReasons.push(reason)));
		disposables.add(addDisposableListener(popup, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				nativeDismissals++;
				popup.remove();
			}
		}));

		overlay.show(target, content(), { targetOverlayVisible: true });
		const event = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
		popup.dispatchEvent(event);

		assert.deepStrictEqual({
			skipReasons,
			nativeDismissals,
			popupConnected: popup.isConnected,
			defaultPrevented: event.defaultPrevented,
		}, {
			skipReasons: [OnboardingDismissReason.EscapeKey],
			nativeDismissals: 1,
			popupConnected: false,
			defaultPrevented: false,
		});
	});

	test('custom label and hidden End Tour reset between shows', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);
		const visibleButtons = () => getButtons(container).filter(button => button.style.display !== 'none').map(button => button.textContent);
		const snapshots: (string | null)[][] = [];

		overlay.show(target, content({ canGoBack: false, isLastStep: true, nextButtonLabel: 'Understood' }));
		snapshots.push(visibleButtons());
		overlay.show(target, content());
		snapshots.push(visibleButtons());
		overlay.show(target, content({ canGoBack: false, isLastStep: true, nextButtonLabel: 'Understood' }));
		overlay.hide();
		overlay.show(target, content());
		snapshots.push(visibleButtons());
		overlay.show(target, content({ canGoBack: false, isLastStep: true }));
		snapshots.push(visibleButtons());

		assert.deepStrictEqual(snapshots, [
			['Understood'],
			['End Tour', 'Back', 'Next'],
			['End Tour', 'Back', 'Next'],
			['Done'],
		]);
	});

	suite('title close button', () => {

		/** The workbench defines these size tokens; without them the close button has no box to align. */
		function createTokenContainer(): HTMLElement {
			const container = createContainer();
			for (const [token, value] of [['spacing-size40', '4px'], ['spacing-size80', '8px'], ['spacing-size160', '16px'], ['spacing-size200', '20px'], ['codiconFontSize-compact', '12px']]) {
				container.style.setProperty(`--vscode-${token}`, value);
			}
			return container;
		}

		function getCloseButton(container: HTMLElement): HTMLElement {
			return container.getElementsByClassName('spotlight-callout-close')[0] as HTMLElement;
		}

		function visibleFooterLabels(container: HTMLElement): (string | null)[] {
			const footer = container.getElementsByClassName('spotlight-callout-actions')[0];
			return (Array.from(footer.getElementsByClassName('monaco-button')) as HTMLElement[]).filter(button => button.style.display !== 'none').map(button => button.textContent);
		}

		test('replaces End Tour, which then only shows for a custom label, where the close button hides, and ends the tour', () => {
			const container = createTokenContainer();
			const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
			const target = createTarget(container, 0, 0, 50, 50);
			const reasons: OnboardingDismissReason[] = [];
			disposables.add(overlay.onDidSkip(reason => reasons.push(reason)));
			const before = container.getElementsByClassName('spotlight-callout-close').length;
			const shown = () => ({ footer: visibleFooterLabels(container), close: mainWindow.getComputedStyle(getCloseButton(container)).display !== 'none' });

			overlay.setTitleCloseButton(true);
			overlay.show(target, content());
			const withoutLabel = shown();
			overlay.show(target, content({ endTourLabel: 'Continue in Folder' }));
			const withLabel = shown();
			overlay.show(target, content());
			const afterLabel = shown();
			const close = getCloseButton(container);
			close.click();
			close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({ before, withoutLabel, withLabel, afterLabel, ariaLabel: close.getAttribute('aria-label'), reasons }, {
				before: 0,
				withoutLabel: { footer: ['Back', 'Next'], close: true },
				withLabel: { footer: ['Continue in Folder', 'Back', 'Next'], close: false },
				afterLabel: { footer: ['Back', 'Next'], close: true },
				ariaLabel: 'End Tour',
				reasons: [OnboardingDismissReason.SkipButton, OnboardingDismissReason.EscapeKey],
			});
		});

		test('is centered on the first line of a wrapping title', () => {
			const container = createTokenContainer();
			const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
			overlay.setTitleCloseButton(true);
			overlay.show(createTarget(container, 100, 50, 200, 40), content({ title: 'A title long enough to wrap onto a second line in the callout' }));

			const title = container.getElementsByClassName('spotlight-callout-title')[0].getBoundingClientRect();
			const close = getCloseButton(container).getBoundingClientRect();
			assert.deepStrictEqual({
				wraps: title.height >= 40,
				closeCenter: close.top + close.height / 2,
				closeRightOfTitle: close.left >= title.right,
			}, {
				wraps: true,
				closeCenter: title.top + 10,
				closeRightOfTitle: true,
			});
		});

		test('takes focus for focusEndTour without a custom label and joins the focus trap', () => {
			const container = createTokenContainer();
			const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
			const target = createTarget(container, 100, 100, 80, 30);
			const close = () => getCloseButton(container);
			const focused = () => mainWindow.document.activeElement === close() ? 'close' : mainWindow.document.activeElement?.textContent;
			overlay.setTitleCloseButton(true);

			overlay.show(target, content({ focusEndTour: true, stepIndex: 0, stepCount: 1, canGoBack: false, isLastStep: true }), { hideNext: true });
			const withoutLabel = focused();
			const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
			Object.defineProperty(tab, 'keyCode', { get: () => 9 });
			close().dispatchEvent(tab);
			const afterTab = focused();
			overlay.show(target, content({ endTourLabel: 'Got It', showEndTour: true, focusEndTour: true, stepIndex: 0, stepCount: 1, canGoBack: false, isLastStep: true }), { hideNext: true });
			const withLabel = focused();

			assert.deepStrictEqual({ withoutLabel, afterTab, withLabel }, { withoutLabel: 'close', afterTab: 'close', withLabel: 'Got It' });
		});
	});

	test('allowTargetInteraction arranges click blockers around the target', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);
		const targetButton = $('button');
		target.appendChild(targetButton);
		const blockers = () => Array.from(container.getElementsByClassName('spotlight-blocker')) as HTMLElement[];
		const callout = container.getElementsByClassName('spotlight-callout')[0] as HTMLElement;

		overlay.show(target, content(), { allowTargetInteraction: false });
		assert.deepStrictEqual({ blockers: blockers().map(blocker => blocker.style.display), ariaModal: callout.getAttribute('aria-modal') }, {
			blockers: ['', 'none', 'none', 'none'],
			ariaModal: 'true',
		});

		overlay.show(target, content(), { allowTargetInteraction: true });
		const [, , next] = getButtons(container);
		const root = container.getElementsByClassName('spotlight-overlay')[0] as HTMLElement;
		next.focus();
		const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'keyCode', { get: () => 9 /* Tab */ });
		next.dispatchEvent(event);

		assert.deepStrictEqual({
			blockers: blockers().map(blocker => blocker.style.display),
			targetOverlayVisible: root.classList.contains('target-overlay-visible'),
			ariaModal: callout.getAttribute('aria-modal'),
			activeElement: mainWindow.document.activeElement,
		}, {
			blockers: ['', '', '', ''],
			targetOverlayVisible: true,
			ariaModal: 'false',
			activeElement: targetButton,
		});
	});

	test('without the backdrop leaves the rest of the window interactive', () => {
		const container = createContainer();
		const previous = $('input');
		container.appendChild(previous);
		previous.focus();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);
		const elsewhere = $('button.test-spotlight-elsewhere');
		Object.assign(elsewhere.style, { position: 'fixed', left: '400px', top: '10px', width: '40px', height: '20px' });
		container.appendChild(elsewhere);
		const callout = container.getElementsByClassName('spotlight-callout')[0] as HTMLElement;
		const skipReasons: OnboardingDismissReason[] = [];
		disposables.add(overlay.onDidSkip(reason => skipReasons.push(reason)));
		overlay.setBackdropVisible(false);

		overlay.show(target, content(), { targetOverlayVisible: true });
		const calloutRect = callout.getBoundingClientRect();
		const calloutHit = mainWindow.document.elementFromPoint(calloutRect.left + calloutRect.width / 2, calloutRect.top + calloutRect.height / 2);
		const elsewhereHit = mainWindow.document.elementFromPoint(420, 20);
		elsewhere.focus();
		elsewhere.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		overlay.show(createTarget(container, 100, 100, 80, 30), content(), { targetOverlayVisible: true, preserveFocus: true });
		const focusedAfterReplacement = mainWindow.document.activeElement;
		overlay.dispose();

		assert.deepStrictEqual({
			calloutHit: !!calloutHit && callout.contains(calloutHit),
			elsewhereHit: elsewhereHit === elsewhere,
			ariaModal: callout.getAttribute('aria-modal'),
			skipReasons,
			focusedAfterReplacement: focusedAfterReplacement === elsewhere,
			focusedAfterDispose: mainWindow.document.activeElement === elsewhere,
		}, {
			calloutHit: true,
			elsewhereHit: true,
			ariaModal: 'false',
			skipReasons: [],
			focusedAfterReplacement: true,
			focusedAfterDispose: true,
		});
	});

	test('without the backdrop Tab moves between the target and the callout but can leave the spotlight', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);
		const targetButton = $('button');
		target.appendChild(targetButton);
		const [, , next] = getButtons(container);
		const tab = (element: HTMLElement, shiftKey: boolean) => {
			element.focus();
			const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
			Object.defineProperty(event, 'keyCode', { get: () => 9 });
			element.dispatchEvent(event);
			const active = mainWindow.document.activeElement;
			return { prevented: event.defaultPrevented, focused: active === targetButton ? 'target' : active?.textContent };
		};
		overlay.setBackdropVisible(false);
		overlay.show(target, content(), { allowTargetInteraction: true });

		assert.deepStrictEqual({
			tabFromTarget: tab(targetButton, false),
			shiftTabFromTarget: tab(targetButton, true),
			tabFromLastButton: tab(next, false),
		}, {
			tabFromTarget: { prevented: true, focused: 'End Tour' },
			shiftTabFromTarget: { prevented: false, focused: 'target' },
			tabFromLastButton: { prevented: false, focused: 'Next' },
		});
	});

	for (const owner of ['target', 'focusTarget'] as const) {
		test(`without the backdrop restores the previous focus when the tour ends from its ${owner}`, () => {
			const container = createContainer();
			const previous = $('input');
			container.appendChild(previous);
			previous.focus();
			const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
			const target = createTarget(container, 100, 100, 80, 30);
			const targetButton = $('button');
			target.appendChild(targetButton);
			const focusInput = $('input.test-spotlight-focus-target');
			container.appendChild(focusInput);
			const skipReasons: OnboardingDismissReason[] = [];
			disposables.add(overlay.onDidSkip(reason => skipReasons.push(reason)));
			overlay.setBackdropVisible(false);

			overlay.show(target, content(), owner === 'target'
				? { allowTargetInteraction: true }
				: { hideNext: true, focusTarget: { element: focusInput, focus: () => focusInput.focus() } });
			const focused = owner === 'target' ? targetButton : focusInput;
			focused.focus();
			focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			overlay.hide();
			overlay.dispose();

			assert.deepStrictEqual({ skipReasons, previousFocused: mainWindow.document.activeElement === previous }, {
				skipReasons: [OnboardingDismissReason.EscapeKey],
				previousFocused: true,
			});
		});
	}

	test('highlights additional elements together with the target and keeps focus in them when the callout is clicked', async () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 300, 300, 20, 20);
		target.tabIndex = 0;
		let additionalElements: HTMLElement[] = [];
		overlay.show(target, content(), { placement: 'left', targetOverlayVisible: true, allowTargetInteraction: true, additionalElements: () => additionalElements });
		const hole = container.querySelector<HTMLElement>('.spotlight-hole')!;
		const holeRect = () => [hole.style.left, hole.style.top, hole.style.width, hole.style.height];
		const nextFrame = () => new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, resolve)));
		const keepsFocus = (focused: HTMLElement) => {
			focused.focus();
			const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
			getButtons(container)[2].dispatchEvent(event);
			return event.defaultPrevented;
		};
		const holes = [holeRect()];
		const keptFocus = [keepsFocus(target)];
		const menu = createTarget(container, 150, 150, 170, 140);
		menu.tabIndex = 0;
		additionalElements = [menu, createTarget(container, 400, 200, 50, 50)];
		await nextFrame();
		holes.push(holeRect());
		keptFocus.push(keepsFocus(target), keepsFocus(menu));
		additionalElements.forEach(element => element.remove());
		await nextFrame();
		holes.push(holeRect());

		assert.deepStrictEqual({ holes, keptFocus }, {
			holes: [['294px', '294px', '32px', '32px'], ['144px', '144px', '312px', '182px'], ['294px', '294px', '32px', '32px']],
			keptFocus: [false, false, true],
		});
	});
	test('leaves Escape and Tab inside additional elements to them', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const menu = createTarget(container, 150, 150, 170, 140);
		const skips: string[] = [];
		disposables.add(overlay.onDidSkip(reason => skips.push(reason)));
		overlay.show(createTarget(container, 300, 300, 20, 20), content(), { targetOverlayVisible: true, allowTargetInteraction: true, additionalElements: () => [menu] });
		const press = (element: HTMLElement, key: string, keyCode: number) => {
			const event = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true });
			element.dispatchEvent(event);
			return event.defaultPrevented;
		};
		const prevented = [press(menu, 'Escape', 27), press(menu, 'Tab', 9)];
		press(createTarget(container, 0, 0, 10, 10), 'Escape', 27);

		assert.deepStrictEqual({ prevented, skips }, { prevented: [false, false], skips: [OnboardingDismissReason.EscapeKey] });
	});
	test('hideNext routes target keyboard events through the focus trap', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);
		target.tabIndex = 0;

		overlay.show(target, content(), { hideNext: true });
		const [skip, , next] = getButtons(container);
		const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'keyCode', { get: () => 9 /* Tab */ });
		target.dispatchEvent(event);

		assert.deepStrictEqual({
			nextHidden: next.style.display === 'none',
			ariaModal: container.getElementsByClassName('spotlight-callout')[0].getAttribute('aria-modal'),
			activeElement: mainWindow.document.activeElement,
		}, {
			nextHidden: true,
			ariaModal: 'false',
			activeElement: skip,
		});
	});

	test('focusEndTour wins over hideNext, so End Tour is focused when the target is not focusable', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const skips: OnboardingDismissReason[] = [];
		disposables.add(overlay.onDidSkip(reason => skips.push(reason)));
		const target = createTarget(container, 100, 100, 80, 30);
		const press = (element: HTMLElement, key: string, keyCode: number, shiftKey = false) => {
			const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
			Object.defineProperty(event, 'keyCode', { get: () => keyCode });
			element.dispatchEvent(event);
		};

		overlay.show(target, content({ endTourLabel: 'Got It', showEndTour: true, focusEndTour: true, stepIndex: 0, stepCount: 1, canGoBack: false, isLastStep: true }), { hideNext: true });
		const [skip, , next] = getButtons(container);
		const initial = mainWindow.document.activeElement;
		press(skip, 'Tab', 9);
		const afterTab = mainWindow.document.activeElement;
		press(skip, 'Tab', 9, true);
		const afterShiftTab = mainWindow.document.activeElement;
		press(skip, 'Escape', 27);

		assert.deepStrictEqual({ initial: initial === skip, afterTab: afterTab === skip, afterShiftTab: afterShiftTab === skip, nextHidden: next.style.display === 'none', skips }, {
			initial: true, afterTab: true, afterShiftTab: true, nextHidden: true, skips: [OnboardingDismissReason.EscapeKey],
		});
	});

	test('observes the target and container for re-layout', () => {
		const container = createContainer();
		const observers: FakeResizeObserver[] = [];
		const ctor = class extends FakeResizeObserver {
			constructor(cb: ResizeObserverCallback) { super(cb); observers.push(this); }
		};
		const overlay = disposables.add(new SpotlightOverlay(container, ctor as unknown as typeof ResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);

		overlay.show(target, content());

		assert.deepStrictEqual(observers.length === 1 ? observers[0].observed.includes(target) && observers[0].observed.includes(container) : false, true);
	});

	test('follows position-only shifts without a resize or workbench layout event', async () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
		const target = createTarget(container, 300, 300, 120, 30);
		overlay.show(target, content(), { placement: 'above' });
		const hole = container.querySelector<HTMLElement>('.spotlight-hole')!;
		const callout = container.querySelector<HTMLElement>('.spotlight-callout')!;
		const pointer = container.querySelector<HTMLElement>('.spotlight-callout-pointer')!;
		const before = [hole, callout, pointer].map(element => element.offsetTop);

		target.style.top = '280px';
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, resolve)));
		await Promise.all(hole.getAnimations().map(animation => animation.finished));
		const shifts = [hole, callout, pointer].map((element, index) => element.offsetTop - before[index]);
		overlay.hide();
		target.style.top = '260px';
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, resolve)));

		assert.deepStrictEqual({ shifts, hiddenHoleTop: hole.style.top }, {
			shifts: [-20, -20, -20],
			hiddenHoleTop: '274px',
		});
	});

	for (const removal of ['detach', 'hide']) {
		test(`hides rather than highlighting the origin when the target disappears (${removal})`, async () => {
			const container = createContainer();
			const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
			const target = createTarget(container, 100, 100, 120, 30);
			let lost = 0;
			disposables.add(overlay.onDidLoseTarget(() => lost++));
			overlay.show(target, content());
			if (removal === 'detach') {
				target.remove();
			} else {
				target.style.display = 'none';
			}
			await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, resolve)));
			overlay.layout();

			assert.deepStrictEqual({
				display: container.querySelector<HTMLElement>('.spotlight-overlay')!.style.display,
				holeTop: container.querySelector<HTMLElement>('.spotlight-hole')!.style.top,
				lost,
			}, { display: 'none', holeTop: '94px', lost: 1 });
		});
	}

	test('focus trap includes links rendered in a markdown description', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);

		overlay.show(target, content({ description: new MarkdownString('See [the docs](https://example.com) for more.') }));

		const callout = container.getElementsByClassName('spotlight-callout')[0] as HTMLElement;
		const link = callout.getElementsByTagName('a')[0] as HTMLAnchorElement | undefined;
		assert.ok(link, 'expected a link to be rendered from the markdown description');

		// With the link focused, Shift+Tab should cycle to the last button (Next),
		// proving the link participates in the trap rather than being skipped.
		link!.focus();
		const event = new KeyboardEvent('keydown', { shiftKey: true, bubbles: true, cancelable: true });
		// The KeyboardEvent constructor does not honor `keyCode` from the init dict
		// in all engines, so set it explicitly (StandardKeyboardEvent reads keyCode).
		Object.defineProperty(event, 'keyCode', { get: () => 9 /* Tab */ });
		callout.dispatchEvent(event);

		assert.strictEqual(mainWindow.document.activeElement, getButtons(container).at(-1));
	});

	for (const activation of ['click', 'keyboard']) {
		test(`preserves description link focus after replacing a target and handles ${activation}`, () => {
			const container = createContainer();
			const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver));
			const target = createTarget(container, 0, 0, 50, 50);
			const handled: string[] = [];
			const stepContent = content({
				description: new MarkdownString('See [the docs](https://example.com) for more.'),
				onDidClickLink: link => handled.push(link),
			});
			overlay.show(target, stepContent);
			container.querySelector<HTMLElement>('.spotlight-callout-description a')!.focus();
			target.remove();
			overlay.layout();
			overlay.hide();
			overlay.show(createTarget(container, 0, 100, 50, 50), stepContent, { preserveFocus: true });
			const link = container.querySelector<HTMLElement>('.spotlight-callout-description a')!;
			const focusPreserved = mainWindow.document.activeElement === link;
			if (activation === 'click') {
				link.click();
			} else {
				link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			}
			assert.deepStrictEqual({ focusPreserved, handled }, { focusPreserved: true, handled: ['https://example.com'] });
		});
	}

	test('dispose removes the overlay from the DOM', () => {
		const container = createContainer();
		const overlay = new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver);
		const target = createTarget(container, 0, 0, 50, 50);
		overlay.show(target, content());

		overlay.dispose();

		assert.strictEqual(container.getElementsByClassName('spotlight-overlay').length, 0);
	});
});
