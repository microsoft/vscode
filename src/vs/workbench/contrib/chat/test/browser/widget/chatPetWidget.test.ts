/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID, chatPetAchievements, ChatPetAccessoryIds, ChatPetAchievementIds, didExplicitlyEnableChatPetAutopilot, disabledChatPetAchievements, getChatPetAchievement, getChatPetAchievementPresentation, getChatPetCustomizationAchievementIds, getUnlockedChatPetAccessories, isUserAuthoredChatPetCustomization, shouldUnlockChatPetIntegratedBrowserShare } from '../../../browser/chatPetAchievements.js';
import { ChatPetService, getChatPetVariant } from '../../../browser/chatPetService.js';
import { getChatPetAccessoryImageSource, hasChatPetAccessoryImageDimensions, hasChatPetBodyImageDimensions } from '../../../browser/widget/chatPetAccessoryRenderer.js';
import { getChatPetAccessoryRigFrame, getChatPetAccessoryRigPose, getChatPetAccessoryTrack, getChatPetAntennaeOcclusionBounds, getChatPetEyeAccessoryAnchor, getChatPetReducedMotionRigFrame } from '../../../browser/widget/chatPetAccessoryRig.js';
import { CHAT_PET_ACHIEVEMENT_UNLOCKED_DURATION, CHAT_PET_CONFIRMATION_ATTENTION_DURATION, CHAT_PET_ICON_TRANSFORMATION_CHANCE, CHAT_PET_IDLE_SLEEP_DELAY, CHAT_PET_OVERLAY_CLASS, CHAT_PET_WALL_IMPACT_DURATION, CHAT_PET_WINDOW_OWNERSHIP_CHANNEL, CHAT_PET_YAPPING_CHANCE, ChatPetBlinkController, ChatPetDirectionChangeController, ChatPetFacingController, ChatPetHopController, ChatPetWidget, IChatPetWidgetHost, advanceChatPetThrow, doesChatPetStateBlink, doesChatPetStateTrackCursor, drawChatPetAchievementStar, getChatPetAnchoredHorizontalPosition, getChatPetAnimationFrame, getChatPetBaseState, getChatPetBlinkDelay, getChatPetBuddyName, getChatPetClickInteraction, getChatPetDefaultHorizontalPosition, getChatPetDragPosition, getChatPetEyeAccessoryGazeOffset, getChatPetFallDuration, getChatPetFallTarget, getChatPetFrameDurations, getChatPetGazeDirection, getChatPetHorizontalAnchor, getChatPetHorizontalPosition, getChatPetPillPlatformTop, getChatPetPlatformTop, getChatPetStackPlatformTop, getChatPetRelativeHorizontalPosition, getChatPetRenderedState, getChatPetRespawnFrameDurations, getChatPetRestoredHorizontalPosition, getChatPetScale, getChatPetSpeechFrameDurations, getChatPetSpriteName, getChatPetThrowLanding, getChatPetThrowRotation, getChatPetThrowVelocity, getChatPetVerticalOffset, getChatPetWallReboundVelocity, getChatPetWideSpriteHorizontalOffset, isChatPetImageSource, isChatPetKeyboardInteractionEnabled, isChatPetVisible, isChatPetWindowActive, setChatPetWideLayerOffset, shouldClaimChatPetWindowOnConstruction, shouldPlaceChatPetSpeechBubbleLeft, shouldReserveChatPetSpace, shouldSettleChatPetThrow } from '../../../browser/widget/chatPetWidget.js';

suite('ChatPetWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	class TestTelemetryService extends NullTelemetryServiceShape {
		readonly events: { readonly name: string; readonly data: unknown }[] = [];

		override publicLog2(eventName?: string, data?: unknown): void {
			if (eventName) {
				this.events.push({ name: eventName, data });
			}
		}
	}

	function createHopHarness(initialLeft = 48, minimumLeft = 0, maximumLeft = 96) {
		const events: string[] = [];
		let left = initialLeft;
		const controller = new ChatPetHopController({
			onDirectionChange: direction => events.push(`direction:${direction}`),
			onMove: delta => {
				left = getChatPetHorizontalPosition(left + delta, minimumLeft, maximumLeft);
				events.push(`move:${delta}:${left}`);
			},
			onStart: () => events.push('start'),
			onReducedMotionStart: () => events.push('reduced'),
			onRequest: () => events.push('request'),
		});
		return { controller, events, getLeft: () => left };
	}

	function createPetHost(parent: HTMLElement, dragBounds: HTMLElement, movementBounds: HTMLElement, hasInput = false): IChatPetWidgetHost {
		return {
			parent,
			dragBounds,
			movementBounds,
			model: constObservable(undefined),
			hasInput: constObservable(hasInput),
			inputChanged: Event.None,
			getPlatformTop: () => undefined,
			onDidChangePlatform: Event.None,
		};
	}

	test('runs one timed hop for a single key press', () => {
		const clock = sinon.useFakeTimers();
		const { controller, events } = createHopHarness();
		try {
			controller.request(1, false);
			clock.tick(299);
			clock.tick(1);
			clock.tick(300);
			controller.onAnimationComplete();
			clock.tick(1_000);

			assert.deepStrictEqual(events, [
				'direction:1',
				'request',
				'start',
				'move:24:72',
			]);
		} finally {
			controller.dispose();
		}
	});

	test('constructs body, pupils, and eye accessory layers in rendering order', () => {
		const parent = mainWindow.document.createElement('div');
		const dragBounds = mainWindow.document.createElement('div');
		const movementBounds = mainWindow.document.createElement('div');
		mainWindow.document.body.append(parent, dragBounds, movementBounds);
		disposables.add(toDisposable(() => {
			parent.remove();
			dragBounds.remove();
			movementBounds.remove();
		}));
		const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), new TestTelemetryService(), new NullLogService()));
		disposables.add(new ChatPetWidget(
			createPetHost(parent, dragBounds, movementBounds),
			undefined,
			service,
			new TestAccessibilityService(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends mock<ICommandService>() { }(),
			new NullLogService(),
			new class extends mock<IHostService>() {
				override readonly hasFocus = true;
				override readonly onDidChangeFocus = Event.None;
				override readonly onDidChangeActiveWindow = Event.None;
			}(),
		));
		const visual = parent.getElementsByClassName('chat-pet-visual')[0];
		const button = parent.getElementsByClassName('chat-pet-button')[0] as HTMLElement;
		button.dataset.state = 'achievementUnlocked';
		const achievementPupil = visual.getElementsByClassName('chat-pet-pupil')[0] as HTMLElement;

		assert.deepStrictEqual({
			layers: Array.from(visual.children).map(child => child.className).slice(0, 4),
			achievementPupilHeight: mainWindow.getComputedStyle(achievementPupil).height,
		}, {
			layers: ['chat-pet-sprite hidden', 'chat-pet-sprite hidden', 'chat-pet-eyes', 'chat-pet-eye-accessory hidden'],
			achievementPupilHeight: '8px',
		});
	});

	test('observes layout bounds only while visible and enabled', () => {
		const observedTargets = new Set<Element>();
		class TestResizeObserver implements ResizeObserver {
			observe(target: Element): void { observedTargets.add(target); }
			unobserve(target: Element): void { observedTargets.delete(target); }
			disconnect(): void { observedTargets.clear(); }
			takeRecords(): ResizeObserverEntry[] { return []; }
		}
		const parent = mainWindow.document.createElement('div');
		const dragBounds = mainWindow.document.createElement('div');
		const movementBounds = mainWindow.document.createElement('div');
		mainWindow.document.body.append(parent, dragBounds, movementBounds);
		disposables.add(toDisposable(() => {
			parent.remove();
			dragBounds.remove();
			movementBounds.remove();
		}));
		const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), new TestTelemetryService(), new NullLogService()));
		disposables.add(new ChatPetWidget(
			createPetHost(parent, dragBounds, movementBounds),
			TestResizeObserver as unknown as typeof ResizeObserver,
			service,
			new TestAccessibilityService(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends mock<ICommandService>() { }(),
			new NullLogService(),
			new class extends mock<IHostService>() {
				override readonly hasFocus = true;
				override readonly onDidChangeFocus = Event.None;
				override readonly onDidChangeActiveWindow = Event.None;
			}(),
		));

		assert.strictEqual(observedTargets.size, 0);
		service.toggle();
		assert.deepStrictEqual(observedTargets, new Set([dragBounds, movementBounds, parent]));
		service.toggle();
		assert.strictEqual(observedTargets.size, 0);
	});

	test('stacks the run cycle behind the input', () => {
		const parent = mainWindow.document.createElement('div');
		const input = mainWindow.document.createElement('div');
		const movementBounds = mainWindow.document.createElement('div');
		parent.append(input);
		mainWindow.document.body.append(parent, movementBounds);
		disposables.add(toDisposable(() => {
			parent.remove();
			movementBounds.remove();
		}));
		const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), new TestTelemetryService(), new NullLogService()));
		service.toggle();
		disposables.add(new ChatPetWidget(
			createPetHost(parent, input, movementBounds),
			undefined,
			service,
			new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return false; }
			}(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends mock<ICommandService>() { }(),
			new NullLogService(),
			new class extends mock<IHostService>() {
				override readonly hasFocus = true;
				override readonly onDidChangeFocus = Event.None;
				override readonly onDidChangeActiveWindow = Event.None;
			}(),
		));
		const overlay = parent.getElementsByClassName('chat-pet-overlay')[0];
		const button = parent.getElementsByClassName('chat-pet-button')[0] as HTMLElement;
		const restingZIndex = mainWindow.getComputedStyle(button).zIndex;

		service.setOnTheRun(true);
		const onTheRun = {
			onTheRunClass: button.classList.contains('on-the-run'),
			returningClass: button.classList.contains('returning-from-run'),
			zIndex: mainWindow.getComputedStyle(button).zIndex,
		};
		service.setOnTheRun(false);
		const returning = {
			onTheRunClass: button.classList.contains('on-the-run'),
			returningClass: button.classList.contains('returning-from-run'),
			zIndex: mainWindow.getComputedStyle(button).zIndex,
		};
		const transitionEnd = new mainWindow.Event('transitionend');
		Object.defineProperty(transitionEnd, 'propertyName', { value: 'transform' });
		button.dispatchEvent(transitionEnd);

		assert.deepStrictEqual({
			overlayPrecedesInput: overlay.nextElementSibling === input,
			restingZIndex,
			onTheRun,
			returning,
			returned: {
				returningClass: button.classList.contains('returning-from-run'),
				zIndex: mainWindow.getComputedStyle(button).zIndex,
			},
		}, {
			overlayPrecedesInput: true,
			restingZIndex: '1',
			onTheRun: {
				onTheRunClass: true,
				returningClass: false,
				zIndex: 'auto',
			},
			returning: {
				onTheRunClass: false,
				returningClass: true,
				zIndex: 'auto',
			},
			returned: {
				returningClass: false,
				zIndex: '1',
			},
		});
	});

	test('keeps the on-the-run pet still', () => {
		const clock = sinon.useFakeTimers();
		const parent = mainWindow.document.createElement('div');
		const input = mainWindow.document.createElement('div');
		const movementBounds = mainWindow.document.createElement('div');
		parent.append(input);
		mainWindow.document.body.append(parent, movementBounds);
		const storageService = new TestStorageService();
		const service = new ChatPetService(storageService, new TestTelemetryService(), new NullLogService());
		service.toggle();
		const widget = new ChatPetWidget(
			createPetHost(parent, input, movementBounds),
			undefined,
			service,
			new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return false; }
			}(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends mock<ICommandService>() { }(),
			new NullLogService(),
			new class extends mock<IHostService>() {
				override readonly hasFocus = true;
				override readonly onDidChangeFocus = Event.None;
				override readonly onDidChangeActiveWindow = Event.None;
			}(),
		);
		try {
			service.setOnTheRun(true);
			clock.tick(10_000);

			assert.strictEqual(Reflect.get(widget, '_transientState').get(), undefined);
		} finally {
			widget.dispose();
			service.dispose();
			storageService.dispose();
			parent.remove();
			movementBounds.remove();
			clock.restore();
		}
	});

	test('moves one pet instance between chat hosts without respawning it', () => {
		const firstParent = mainWindow.document.createElement('div');
		const firstBounds = mainWindow.document.createElement('div');
		const secondParent = mainWindow.document.createElement('div');
		const secondBounds = mainWindow.document.createElement('div');
		const movementBounds = mainWindow.document.createElement('div');
		mainWindow.document.body.append(firstParent, firstBounds, secondParent, secondBounds, movementBounds);
		disposables.add(toDisposable(() => {
			firstParent.remove();
			firstBounds.remove();
			secondParent.remove();
			secondBounds.remove();
			movementBounds.remove();
		}));
		const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), new TestTelemetryService(), new NullLogService()));
		const widget = disposables.add(new ChatPetWidget(
			createPetHost(firstParent, firstBounds, movementBounds),
			undefined,
			service,
			new TestAccessibilityService(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends mock<ICommandService>() { }(),
			new NullLogService(),
			new class extends mock<IHostService>() {
				override readonly hasFocus = true;
				override readonly onDidChangeFocus = Event.None;
				override readonly onDidChangeActiveWindow = Event.None;
			}(),
		));
		const button = firstParent.getElementsByClassName('chat-pet-button')[0];

		widget.setHost(createPetHost(secondParent, secondBounds, movementBounds, true));

		assert.deepStrictEqual({
			firstPetCount: firstParent.getElementsByClassName('chat-pet-button').length,
			secondPetCount: secondParent.getElementsByClassName('chat-pet-button').length,
			sameButton: secondParent.getElementsByClassName('chat-pet-button')[0] === button,
			firstHostClass: firstParent.classList.contains('chat-pet-host'),
			secondHostClass: secondParent.classList.contains('chat-pet-host'),
		}, {
			firstPetCount: 0,
			secondPetCount: 1,
			sameButton: true,
			firstHostClass: false,
			secondHostClass: true,
		});
	});

	test('repeats hops while key requests remain within the hold grace period', () => {
		const clock = sinon.useFakeTimers();
		const { controller, events } = createHopHarness();
		try {
			controller.request(1, false);
			clock.tick(300);
			controller.request(1, false);
			clock.tick(300);
			controller.onAnimationComplete();
			clock.tick(90);
			clock.tick(300);

			assert.deepStrictEqual(events, [
				'direction:1',
				'request',
				'start',
				'move:24:72',
				'direction:1',
				'request',
				'start',
				'move:24:96',
			]);
		} finally {
			controller.dispose();
		}
	});

	test('uses the latest direction when a hop changes direction before its step', () => {
		const clock = sinon.useFakeTimers();
		const { controller, events, getLeft } = createHopHarness();
		try {
			controller.request(-1, false);
			clock.tick(100);
			controller.request(1, false);
			clock.tick(200);

			assert.deepStrictEqual({
				events,
				left: getLeft(),
			}, {
				events: [
					'direction:-1',
					'request',
					'start',
					'direction:1',
					'request',
					'move:24:72',
				],
				left: 72,
			});
		} finally {
			controller.dispose();
		}
	});

	test('moves immediately without repetition when motion is reduced', () => {
		const clock = sinon.useFakeTimers();
		const { controller, events } = createHopHarness();
		try {
			controller.request(-1, true);
			clock.tick(1_000);
			controller.onAnimationComplete();

			assert.deepStrictEqual(events, [
				'direction:-1',
				'request',
				'move:-24:24',
				'reduced',
			]);
		} finally {
			controller.dispose();
		}
	});

	test('clamps repeated hop steps to the movement bounds', () => {
		const clock = sinon.useFakeTimers();
		const { controller, events, getLeft } = createHopHarness(0, 0, 24);
		try {
			controller.request(-1, false);
			clock.tick(600);
			controller.onAnimationComplete();
			controller.request(1, false);
			clock.tick(600);
			controller.onAnimationComplete();
			controller.request(1, false);
			clock.tick(300);

			assert.deepStrictEqual({
				moves: events.filter(event => event.startsWith('move:')),
				left: getLeft(),
			}, {
				moves: [
					'move:-24:0',
					'move:24:24',
					'move:24:24',
				],
				left: 24,
			});
		} finally {
			controller.dispose();
		}
	});

	test('cancels pending steps and rests when disabled or sent on the run', () => {
		const clock = sinon.useFakeTimers();
		const { controller, events } = createHopHarness();
		try {
			controller.request(1, false);
			clock.tick(100);
			controller.cancel();
			clock.tick(1_000);

			controller.request(1, false);
			clock.tick(300);
			controller.request(1, false);
			clock.tick(300);
			controller.onAnimationComplete();
			controller.cancel();
			clock.tick(1_000);

			assert.deepStrictEqual(events, [
				'direction:1',
				'request',
				'start',
				'direction:1',
				'request',
				'start',
				'move:24:72',
				'direction:1',
				'request',
			]);
		} finally {
			controller.dispose();
		}
	});

	test('maps chat activity to pet states by priority', () => {
		assert.deepStrictEqual([
			getChatPetBaseState(false, false, false, false, false),
			getChatPetBaseState(false, false, false, false, true),
			getChatPetBaseState(false, false, false, true, false),
			getChatPetBaseState(false, false, false, true, true),
			getChatPetBaseState(true, false, false, true, true),
			getChatPetBaseState(true, true, false, true, true),
			getChatPetBaseState(true, true, true, true, true),
		], [
			'idle',
			'sleep',
			'typing',
			'sleep',
			'rendering',
			'clapping',
			'idle',
		]);
	});

	test('limits confirmation attention to two seconds', () => {
		assert.strictEqual(CHAT_PET_CONFIRMATION_ATTENTION_DURATION, 2_000);
	});

	test('shows the window pet only in the active VS Code window and reserves only its active host', () => {
		assert.deepStrictEqual({
			visible: [
				isChatPetVisible(false, false),
				isChatPetVisible(true, false),
				isChatPetVisible(true, true),
			],
			spaceReserved: [
				shouldReserveChatPetSpace(false, false),
				shouldReserveChatPetSpace(true, false),
				shouldReserveChatPetSpace(true, true),
			],
		}, {
			visible: [false, false, true],
			spaceReserved: [false, false, true],
		});
	});

	test('keeps the pet on external-app blur but transfers it to another VS Code window', async () => {
		const parent = mainWindow.document.createElement('div');
		const dragBounds = mainWindow.document.createElement('div');
		const movementBounds = mainWindow.document.createElement('div');
		mainWindow.document.body.append(parent, dragBounds, movementBounds);
		disposables.add(toDisposable(() => {
			parent.remove();
			dragBounds.remove();
			movementBounds.remove();
		}));
		const hostService = new class extends mock<IHostService>() {
			override readonly hasFocus = true;
			override readonly onDidChangeFocus = Event.None;
			override readonly onDidChangeActiveWindow = Event.None;
		}();
		const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), new TestTelemetryService(), new NullLogService()));
		disposables.add(new ChatPetWidget(
			createPetHost(parent, dragBounds, movementBounds),
			undefined,
			service,
			new TestAccessibilityService(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends mock<ICommandService>() { }(),
			new NullLogService(),
			hostService,
		));
		const button = parent.getElementsByClassName('chat-pet-button')[0];
		service.toggle();
		const initiallyHidden = button.classList.contains('hidden');
		const ownershipChannel = new BroadcastChannel(CHAT_PET_WINDOW_OWNERSHIP_CHANNEL);
		disposables.add(toDisposable(() => ownershipChannel.close()));

		mainWindow.dispatchEvent(new FocusEvent('blur'));
		const hiddenAfterExternalBlur = button.classList.contains('hidden');
		ownershipChannel.postMessage({ windowId: mainWindow.vscodeWindowId + 1 });
		await new Promise(resolve => mainWindow.setTimeout(resolve, 10));
		const hiddenAfterWindowTransfer = button.classList.contains('hidden');
		mainWindow.dispatchEvent(new FocusEvent('focus'));
		const hiddenAfterReturn = button.classList.contains('hidden');

		assert.deepStrictEqual({
			initiallyHidden,
			hiddenAfterExternalBlur,
			hiddenAfterWindowTransfer,
			hiddenAfterReturn,
		}, {
			initiallyHidden: false,
			hiddenAfterExternalBlur: false,
			hiddenAfterWindowTransfer: true,
			hiddenAfterReturn: false,
		});
	});

	test('tracks only the active VS Code renderer window', () => {
		assert.deepStrictEqual({
			windowActive: [
				isChatPetWindowActive(1, 1),
				isChatPetWindowActive(2, 1),
				isChatPetWindowActive(1, 2),
			],
			claimOnConstruction: [
				shouldClaimChatPetWindowOnConstruction(true, true),
				shouldClaimChatPetWindowOnConstruction(true, false),
				shouldClaimChatPetWindowOnConstruction(false, true),
			],
		}, {
			windowActive: [true, false, false],
			claimOnConstruction: [true, false, false],
		});
	});

	test('blocks keyboard interaction while unavailable or already interacting', () => {
		assert.deepStrictEqual([
			isChatPetKeyboardInteractionEnabled(false, false, false, false, false),
			isChatPetKeyboardInteractionEnabled(true, true, false, false, false),
			isChatPetKeyboardInteractionEnabled(true, false, true, false, false),
			isChatPetKeyboardInteractionEnabled(true, false, false, true, false),
			isChatPetKeyboardInteractionEnabled(true, false, false, false, true),
			isChatPetKeyboardInteractionEnabled(true, false, false, false, false),
		], [
			false,
			false,
			false,
			false,
			false,
			true,
		]);
	});

	test('restores a custom position or uses the default position when reopening', () => {
		assert.deepStrictEqual([
			getChatPetRestoredHorizontalPosition(undefined, 20, 220),
			getChatPetRestoredHorizontalPosition(0.3, 20, 220),
			getChatPetRestoredHorizontalPosition(0, 20, 220),
			getChatPetRestoredHorizontalPosition(1.1, 20, 220),
			getChatPetRelativeHorizontalPosition(80, 20, 220),
			getChatPetRelativeHorizontalPosition(0, 20, 220),
			getChatPetRelativeHorizontalPosition(240, 20, 220),
			getChatPetRelativeHorizontalPosition(20, 20, 20),
		], [
			188,
			80,
			20,
			220,
			0.3,
			0,
			1,
			undefined,
		]);
	});

	test('preserves the inset from the nearest edge while resizing', () => {
		const leftAnchor = getChatPetHorizontalAnchor(70, 20, 220);
		const rightAnchor = getChatPetHorizontalAnchor(170, 20, 220);
		assert.deepStrictEqual({
			leftAnchor,
			rightAnchor,
			centerAnchor: getChatPetHorizontalAnchor(120, 20, 220),
			leftNarrow: getChatPetAnchoredHorizontalPosition(leftAnchor, 20, 120),
			leftClamped: getChatPetAnchoredHorizontalPosition(leftAnchor, 20, 60),
			leftWide: getChatPetAnchoredHorizontalPosition(leftAnchor, 20, 220),
			rightNarrow: getChatPetAnchoredHorizontalPosition(rightAnchor, 20, 120),
			rightClamped: getChatPetAnchoredHorizontalPosition(rightAnchor, 20, 60),
			rightWide: getChatPetAnchoredHorizontalPosition(rightAnchor, 20, 220),
		}, {
			leftAnchor: { edge: 'left', inset: 50 },
			rightAnchor: { edge: 'right', inset: 50 },
			centerAnchor: { edge: 'left', inset: 100 },
			leftNarrow: 70,
			leftClamped: 60,
			leftWide: 70,
			rightNarrow: 70,
			rightClamped: 20,
			rightWide: 170,
		});
	});

	test('gives dragging precedence over base and transient states', () => {
		assert.deepStrictEqual([
			getChatPetRenderedState('rendering', undefined, false),
			getChatPetRenderedState('rendering', 'complete', false),
			getChatPetRenderedState('rendering', undefined, true),
			getChatPetRenderedState('rendering', 'complete', true),
			getChatPetRenderedState('idle', 'yappingMouthOpen', false),
			getChatPetRenderedState('typing', 'yappingMouthOpen', false),
			getChatPetRenderedState('rendering', 'yapping', false),
			getChatPetRenderedState('sleep', 'yappingMouthOpen', false),
		], [
			'rendering',
			'complete',
			'idle',
			'idle',
			'yappingMouthOpen',
			'typing',
			'rendering',
			'sleep',
		]);
	});

	test('sleeps after twenty seconds of inactivity', () => {
		assert.strictEqual(CHAT_PET_IDLE_SLEEP_DELAY, 20_000);
	});

	test('shows achievement attention for ten seconds', () => {
		assert.strictEqual(CHAT_PET_ACHIEVEMENT_UNLOCKED_DURATION, 10_000);
	});

	test('draws a centered gold star on the speech bubble effect grid', () => {
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 96;
		const context = canvas.getContext('2d');
		assert.ok(context);

		drawChatPetAchievementStar(context, 'stable');

		const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
		const goldPixels: Array<readonly [number, number]> = [];
		for (let y = 0; y < canvas.height; y++) {
			for (let x = 0; x < canvas.width; x++) {
				const index = (y * canvas.width + x) * 4;
				if (imageData.data[index] === 255 && imageData.data[index + 1] === 205 && imageData.data[index + 2] === 15 && imageData.data[index + 3] === 255) {
					goldPixels.push([x, y]);
				}
			}
		}
		const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => {
			const index = ((36 + y * 4) * canvas.width + 58 + x * 4) * 4;
			return imageData.data[index] === 255 && imageData.data[index + 1] === 205 && imageData.data[index + 2] === 15 ? '#' : '.';
		}).join(''));
		assert.deepStrictEqual({
			count: goldPixels.length,
			rows,
			bounds: [
				Math.min(...goldPixels.map(([x]) => x)),
				Math.min(...goldPixels.map(([, y]) => y)),
				Math.max(...goldPixels.map(([x]) => x)),
				Math.max(...goldPixels.map(([, y]) => y)),
			],
		}, {
			count: 208,
			rows: ['..#..', '.###.', '#####', '.#.#.', '#...#'],
			bounds: [58, 36, 77, 55],
		});
	});

	test('opens achievements when activated during the unlock state', () => {
		const parent = mainWindow.document.createElement('div');
		const dragBounds = mainWindow.document.createElement('div');
		const movementBounds = mainWindow.document.createElement('div');
		mainWindow.document.body.append(parent, dragBounds, movementBounds);
		const commands: string[] = [];
		const storageService = disposables.add(new TestStorageService());
		const service = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));
		const widget = disposables.add(new ChatPetWidget(
			createPetHost(parent, dragBounds, movementBounds),
			undefined,
			service,
			new TestAccessibilityService(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends mock<ICommandService>() {
				override async executeCommand<R = unknown>(commandId: string): Promise<R | undefined> {
					commands.push(commandId);
					return undefined;
				}
			}(),
			new NullLogService(),
			new class extends mock<IHostService>() {
				override readonly hasFocus = true;
				override readonly onDidChangeFocus = Event.None;
				override readonly onDidChangeActiveWindow = Event.None;
			}(),
		));
		disposables.add(toDisposable(() => {
			parent.remove();
			dragBounds.remove();
			movementBounds.remove();
		}));

		service.toggle();
		service.unlockAchievement(ChatPetAchievementIds.FirstChatMessage);
		const transientState = Reflect.get(widget, '_transientState');
		const stateBeforeActivation = transientState.get();
		(parent.querySelector('.chat-pet-button') as HTMLElement).click();

		assert.deepStrictEqual({
			stateBeforeActivation,
			stateAfterActivation: transientState.get(),
			commands,
		}, {
			stateBeforeActivation: 'achievementUnlocked',
			stateAfterActivation: undefined,
			commands: [CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID],
		});
	});

	test('selects the buddy for the product quality', () => {
		assert.deepStrictEqual([
			getChatPetBuddyName('stable'),
			getChatPetBuddyName('insider'),
			getChatPetBuddyName(undefined),
		], [
			'buddy-idle-stable',
			'buddy-idle-insiders',
			'buddy-idle-insiders',
		]);
	});

	test('resolves configured and product pet variants', () => {
		assert.deepStrictEqual([
			getChatPetVariant('stable', 'insider'),
			getChatPetVariant('insiders', 'stable'),
			getChatPetVariant(undefined, 'stable'),
			getChatPetVariant(undefined, 'insider'),
		], [
			'stable',
			'insiders',
			'stable',
			'insiders',
		]);
	});

	test('logs pet enablement at startup and when toggled', () => {
		const telemetryService = new TestTelemetryService();
		const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), telemetryService, new NullLogService()));

		service.toggle();
		service.toggle();

		assert.deepStrictEqual(telemetryService.events, [
			{ name: 'chatPetEnablement', data: { enabled: false, source: 'startup' } },
			{ name: 'chatPetEnablement', data: { enabled: true, source: 'change' } },
			{ name: 'chatPetEnablement', data: { enabled: false, source: 'change' } },
		]);
	});

	test('persists pet scale and position across windows, dismissal, and restart', () => {
		const storageService = disposables.add(new TestStorageService());
		const firstWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));
		const secondWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));
		firstWindow.toggle();
		firstWindow.setScale(1.4);
		firstWindow.setHorizontalPosition(0.3);
		const dismissed = firstWindow.toggle();
		const restartedWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));

		assert.deepStrictEqual({
			firstWindow: firstWindow.scale.get(),
			secondWindow: secondWindow.scale.get(),
			secondWindowPosition: secondWindow.horizontalPosition.get(),
			dismissed,
			restartedWindow: restartedWindow.scale.get(),
			restartedWindowPosition: restartedWindow.horizontalPosition.get(),
		}, {
			firstWindow: 1.4,
			secondWindow: 1.4,
			secondWindowPosition: 0.3,
			dismissed: false,
			restartedWindow: 1.4,
			restartedWindowPosition: 0.3,
		});
	});

	test('resets pet size to the default without changing the position', () => {
		const storageService = disposables.add(new TestStorageService());
		const firstWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));
		const secondWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));
		firstWindow.setScale(1.4);
		firstWindow.setHorizontalPosition(0.3);
		firstWindow.resetScale();
		const restartedWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));

		assert.deepStrictEqual({
			firstWindow: firstWindow.scale.get(),
			secondWindow: secondWindow.scale.get(),
			restartedWindow: restartedWindow.scale.get(),
			storedScale: storageService.get('chat.vscodePet.scale', StorageScope.APPLICATION),
			restartedWindowPosition: restartedWindow.horizontalPosition.get(),
		}, {
			firstWindow: 1,
			secondWindow: 1,
			restartedWindow: 1,
			storedScale: undefined,
			restartedWindowPosition: 0.3,
		});
	});

	test('persists idempotent achievements and synchronizes the selected accessory', () => {
		const storageService = disposables.add(new TestStorageService());
		const firstService = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));
		const secondService = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));
		const unlocks: string[] = [];
		const synchronizedUnlocks: string[] = [];
		disposables.add(firstService.onDidUnlockAchievement(id => unlocks.push(id)));
		disposables.add(secondService.onDidUnlockAchievement(id => synchronizedUnlocks.push(id)));

		assert.strictEqual(firstService.unlockAchievement(ChatPetAchievementIds.FirstChatMessage), false);
		firstService.toggle();
		assert.strictEqual(firstService.unlockAchievement(ChatPetAchievementIds.FirstChatMessage), true);
		assert.strictEqual(firstService.unlockAchievement(ChatPetAchievementIds.FirstChatMessage), false);
		firstService.setAccessory(ChatPetAccessoryIds.CowboyHat);
		const unseenBeforeAcknowledgement = {
			first: firstService.unseenAchievements.get(),
			second: secondService.unseenAchievements.get(),
		};
		const markedSeen = firstService.markAchievementSeen(ChatPetAchievementIds.FirstChatMessage);

		assert.deepStrictEqual({
			unlocks,
			synchronizedUnlocks,
			firstUnlocked: firstService.unlockedAchievements.get(),
			secondUnlocked: secondService.unlockedAchievements.get(),
			firstAccessory: firstService.selectedAccessory.get(),
			secondAccessory: secondService.selectedAccessory.get(),
			storedAchievement: storageService.getBoolean('chat.vscodePet.achievement.firstChatMessage', StorageScope.APPLICATION_SHARED),
			storedAccessory: storageService.get('chat.vscodePet.accessory', StorageScope.APPLICATION_SHARED),
			unseenBeforeAcknowledgement,
			markedSeen,
			firstUnseen: firstService.unseenAchievements.get(),
			secondUnseen: secondService.unseenAchievements.get(),
		}, {
			unlocks: [ChatPetAchievementIds.FirstChatMessage],
			synchronizedUnlocks: [ChatPetAchievementIds.FirstChatMessage],
			firstUnlocked: [ChatPetAchievementIds.FirstChatMessage],
			secondUnlocked: [ChatPetAchievementIds.FirstChatMessage],
			firstAccessory: ChatPetAccessoryIds.CowboyHat,
			secondAccessory: ChatPetAccessoryIds.CowboyHat,
			storedAchievement: true,
			storedAccessory: ChatPetAccessoryIds.CowboyHat,
			unseenBeforeAcknowledgement: {
				first: [ChatPetAchievementIds.FirstChatMessage],
				second: [ChatPetAchievementIds.FirstChatMessage],
			},
			markedSeen: true,
			firstUnseen: [],
			secondUnseen: [],
		});
	});

	test('starts fresh with no achievements and resets persisted developer state', () => {
		const storageService = disposables.add(new TestStorageService());
		const service = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));
		const freshUnlocked = service.unlockedAchievements.get();
		service.toggle();
		service.unlockAchievement(ChatPetAchievementIds.FirstChatMessage);
		service.setAccessory(ChatPetAccessoryIds.CowboyHat);
		service.setScale(1.4);
		service.setHorizontalPosition(0.3);
		storageService.store('chat.vscodePet.achievement.chatFork', true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		storageService.store('chat.vscodePet.achievement.chatFork', true, StorageScope.APPLICATION, StorageTarget.USER);
		const disabledUnlock = service.unlockAchievement(ChatPetAchievementIds.QueueOrSteeringMessage);
		service.resetAchievements();
		storageService.store('chat.vscodePet.achievementCatalogVersion', 3, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		const migratedService = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));

		assert.deepStrictEqual({
			freshUnlocked,
			disabledUnlock,
			unlocked: service.unlockedAchievements.get(),
			unseen: service.unseenAchievements.get(),
			accessory: service.selectedAccessory.get(),
			scale: service.scale.get(),
			horizontalPosition: service.horizontalPosition.get(),
			storedFirstMessage: storageService.getBoolean('chat.vscodePet.achievement.firstChatMessage', StorageScope.APPLICATION_SHARED, false),
			storedDisabled: storageService.getBoolean('chat.vscodePet.achievement.modelSwitch', StorageScope.APPLICATION_SHARED, false),
			storedChatForkShared: storageService.getBoolean('chat.vscodePet.achievement.chatFork', StorageScope.APPLICATION_SHARED, false),
			storedChatForkLocal: storageService.getBoolean('chat.vscodePet.achievement.chatFork', StorageScope.APPLICATION, false),
			migratedUnlocks: migratedService.unlockedAchievements.get(),
		}, {
			freshUnlocked: [],
			disabledUnlock: false,
			unlocked: [],
			unseen: [],
			accessory: undefined,
			scale: 1.4,
			horizontalPosition: 0.3,
			storedFirstMessage: false,
			storedDisabled: false,
			storedChatForkShared: false,
			storedChatForkLocal: false,
			migratedUnlocks: [],
		});
	});

	test('preserves achievements while disabled and rejects locked or malformed accessories', () => {
		const storageService = disposables.add(new TestStorageService());
		storageService.store('chat.vscodePet.accessory', 'unknown', StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		const service = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));

		assert.throws(() => service.setAccessory(ChatPetAccessoryIds.PartyHat), /disabled/);
		service.toggle();
		service.unlockAchievement(ChatPetAchievementIds.RequestRevision);
		service.setAccessory(ChatPetAccessoryIds.TopHatMonocle);
		service.toggle();

		assert.deepStrictEqual({
			enabled: service.enabled.get(),
			unlocked: service.unlockedAchievements.get(),
			accessory: service.selectedAccessory.get(),
		}, {
			enabled: false,
			unlocked: [ChatPetAchievementIds.RequestRevision],
			accessory: ChatPetAccessoryIds.TopHatMonocle,
		});
	});

	test('migrates legacy achievement rewards and selected accessories', () => {
		const storageService = disposables.add(new TestStorageService());
		storageService.store('chat.vscodePet.achievement.checkpointRestore', true, StorageScope.APPLICATION, StorageTarget.USER);
		storageService.store('chat.vscodePet.achievement.requestRevision', true, StorageScope.APPLICATION, StorageTarget.USER);
		storageService.store('chat.vscodePet.achievement.modelSwitch', true, StorageScope.APPLICATION, StorageTarget.USER);
		storageService.store('chat.vscodePet.accessory', ChatPetAccessoryIds.BaseballCap, StorageScope.APPLICATION, StorageTarget.USER);

		const service = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));

		assert.deepStrictEqual({
			unlocked: service.unlockedAchievements.get(),
			accessory: service.selectedAccessory.get(),
			sharedRequestRevision: storageService.getBoolean('chat.vscodePet.achievement.requestRevision', StorageScope.APPLICATION_SHARED),
			sharedModelSwitch: storageService.getBoolean('chat.vscodePet.achievement.modelSwitch', StorageScope.APPLICATION_SHARED),
			sharedAccessory: storageService.get('chat.vscodePet.accessory', StorageScope.APPLICATION_SHARED),
		}, {
			unlocked: [
				ChatPetAchievementIds.RequestRevision,
				ChatPetAchievementIds.FirstChatMessage,
				ChatPetAchievementIds.ModelSwitch,
			],
			accessory: undefined,
			sharedRequestRevision: true,
			sharedModelSwitch: true,
			sharedAccessory: ChatPetAccessoryIds.BaseballCap,
		});
	});

	test('migrates app-local achievements after another app advanced the shared catalog', () => {
		const storageService = disposables.add(new TestStorageService());
		storageService.store('chat.vscodePet.achievementCatalogVersion', 4, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		storageService.store('chat.vscodePet.achievement.requestRevision', true, StorageScope.APPLICATION, StorageTarget.USER);
		storageService.store('chat.vscodePet.achievement.modelSwitch', true, StorageScope.APPLICATION, StorageTarget.USER);
		storageService.store('chat.vscodePet.accessory', ChatPetAccessoryIds.PartyHat, StorageScope.APPLICATION, StorageTarget.USER);

		const service = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));

		assert.deepStrictEqual({
			unlocked: service.unlockedAchievements.get(),
			accessory: service.selectedAccessory.get(),
			sharedRequestRevision: storageService.getBoolean('chat.vscodePet.achievement.requestRevision', StorageScope.APPLICATION_SHARED),
			sharedModelSwitch: storageService.getBoolean('chat.vscodePet.achievement.modelSwitch', StorageScope.APPLICATION_SHARED),
			sharedChatOutputCopied: storageService.getBoolean('chat.vscodePet.achievement.chatOutputCopied', StorageScope.APPLICATION_SHARED),
			sharedQueueOrSteeringMessage: storageService.getBoolean('chat.vscodePet.achievement.queueOrSteeringMessage', StorageScope.APPLICATION_SHARED),
			sharedAccessory: storageService.get('chat.vscodePet.accessory', StorageScope.APPLICATION_SHARED),
		}, {
			unlocked: [
				ChatPetAchievementIds.RequestRevision,
				ChatPetAchievementIds.ModelSwitch,
			],
			accessory: undefined,
			sharedRequestRevision: true,
			sharedModelSwitch: true,
			sharedChatOutputCopied: true,
			sharedQueueOrSteeringMessage: true,
			sharedAccessory: ChatPetAccessoryIds.PartyHat,
		});
	});

	test('replays version 2 reward mappings from shared achievement state', () => {
		const storageService = disposables.add(new TestStorageService());
		storageService.store('chat.vscodePet.achievementCatalogVersion', 2, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		storageService.store('chat.vscodePet.achievement.requestRevision', true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		storageService.store('chat.vscodePet.achievement.modelSwitch', true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);

		const service = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));

		assert.deepStrictEqual({
			unlocked: service.unlockedAchievements.get(),
			catalogVersion: storageService.getNumber('chat.vscodePet.achievementCatalogVersion', StorageScope.APPLICATION_SHARED),
		}, {
			unlocked: [
				ChatPetAchievementIds.RequestRevision,
				ChatPetAchievementIds.ModelSwitch,
			],
			catalogVersion: 4,
		});
	});

	test('preserves the Cowboy Hat from the former fork achievement', () => {
		const storageService = disposables.add(new TestStorageService());
		storageService.store('chat.vscodePet.achievementCatalogVersion', 3, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		storageService.store('chat.vscodePet.achievement.chatFork', true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		storageService.store('chat.vscodePet.accessory', ChatPetAccessoryIds.CowboyHat, StorageScope.APPLICATION_SHARED, StorageTarget.USER);

		const service = disposables.add(new ChatPetService(storageService, new TestTelemetryService(), new NullLogService()));

		assert.deepStrictEqual({
			unlocked: service.unlockedAchievements.get(),
			accessory: service.selectedAccessory.get(),
			catalogVersion: storageService.getNumber('chat.vscodePet.achievementCatalogVersion', StorageScope.APPLICATION_SHARED),
		}, {
			unlocked: [ChatPetAchievementIds.FirstChatMessage],
			accessory: ChatPetAccessoryIds.CowboyHat,
			catalogVersion: 4,
		});
	});

	test('detects user-authored customizations', () => {
		assert.deepStrictEqual([
			isUserAuthoredChatPetCustomization('local', false),
			isUserAuthoredChatPetCustomization('user', undefined),
			isUserAuthoredChatPetCustomization('extension', false),
			isUserAuthoredChatPetCustomization('plugin', false),
			isUserAuthoredChatPetCustomization('builtin', true),
			isUserAuthoredChatPetCustomization('local', true),
		], [true, true, false, false, false, false]);
	});

	test('unlocks browser sharing only after sharing succeeds', () => {
		assert.deepStrictEqual([
			shouldUnlockChatPetIntegratedBrowserShare(false, false),
			shouldUnlockChatPetIntegratedBrowserShare(false, true),
			shouldUnlockChatPetIntegratedBrowserShare(true, false),
			shouldUnlockChatPetIntegratedBrowserShare(true, true),
		], [false, false, false, true]);
	});

	test('recognizes only an explicit Interactive to Autopilot switch', () => {
		assert.deepStrictEqual([
			didExplicitlyEnableChatPetAutopilot('interactive', 'plan'),
			didExplicitlyEnableChatPetAutopilot('plan', 'autopilot'),
			didExplicitlyEnableChatPetAutopilot('interactive', 'autopilot'),
			didExplicitlyEnableChatPetAutopilot('autopilot', 'autopilot'),
		], [false, false, true, false]);
	});

	test('finds customization achievements from user-authored items and MCP servers', () => {
		assert.deepStrictEqual([
			getChatPetCustomizationAchievementIds([], [], 0),
			getChatPetCustomizationAchievementIds([{ source: 'extension' }, { source: 'builtin', isBuiltin: true }], [{ source: 'plugin' }], 0),
			getChatPetCustomizationAchievementIds([{ source: 'local' }], [{ source: 'user' }], 1),
		], [
			[],
			[],
			[
				ChatPetAchievementIds.CustomSkillPresent,
				ChatPetAchievementIds.InstructionPresent,
				ChatPetAchievementIds.McpServerPresent,
			],
		]);
	});

	test('defines unique covered-antennae rewards for each achievement', () => {
		const accessoryIds = chatPetAchievements.flatMap(achievement => achievement.accessories.map(accessory => accessory.id));
		assert.deepStrictEqual({
			count: chatPetAchievements.length,
			achievementIds: chatPetAchievements.map(achievement => achievement.id),
			accessoryIds,
			uniqueAccessoryCount: new Set(accessoryIds).size,
			atlasNames: chatPetAchievements.flatMap(achievement => achievement.accessories.map(accessory => accessory.atlasName)),
			atlasCellSizes: chatPetAchievements.flatMap(achievement => achievement.accessories.map(accessory => accessory.atlasCellSize ?? 64)),
			rewardCounts: chatPetAchievements.map(achievement => achievement.accessories.length),
			coversAntennae: chatPetAchievements.every(achievement => achievement.accessories.every(accessory => accessory.coversAntennae)),
			crownAccessoryId: ChatPetAccessoryIds.Crown,
			disabledAchievementIds: disabledChatPetAchievements.map(achievement => achievement.id),
			disabledAccessoryIds: disabledChatPetAchievements.flatMap(achievement => achievement.accessories.map(accessory => accessory.id)),
		}, {
			count: 13,
			achievementIds: [
				ChatPetAchievementIds.RequestRevision,
				ChatPetAchievementIds.FirstChatMessage,
				ChatPetAchievementIds.IntegratedBrowserShared,
				ChatPetAchievementIds.ModelSwitch,
				ChatPetAchievementIds.McpServerPresent,
				ChatPetAchievementIds.CustomSkillPresent,
				ChatPetAchievementIds.AgentsWindowOpened,
				ChatPetAchievementIds.CreatePullRequest,
				ChatPetAchievementIds.AgentEditKept,
				ChatPetAchievementIds.AgentChangesReviewed,
				ChatPetAchievementIds.ChatReferenceOpened,
				ChatPetAchievementIds.UsefulOutputCopied,
				ChatPetAchievementIds.AutopilotEnabled,
			],
			accessoryIds: [
				ChatPetAccessoryIds.TopHatMonocle,
				ChatPetAccessoryIds.CowboyHat,
				ChatPetAccessoryIds.BaseballCap,
				ChatPetAccessoryIds.ConstructionHardHat,
				ChatPetAccessoryIds.FirefighterHelmet,
				ChatPetAccessoryIds.Crown,
				ChatPetAccessoryIds.PropellerHat,
				ChatPetAccessoryIds.DarkSailorHat,
				ChatPetAccessoryIds.WhiteChefHat,
				ChatPetAccessoryIds.BambooHat,
				ChatPetAccessoryIds.StrawHat,
				ChatPetAccessoryIds.PinkPartyHat,
				ChatPetAccessoryIds.WizardHat,
			],
			uniqueAccessoryCount: 13,
			atlasNames: [
				'grand-top-hat-monocle',
				'cowboy-hat',
				'baseball-cap',
				'construction-hard-hat',
				'firefighter-helmet',
				'crown',
				'propeller-hat',
				'dark-sailor-hat',
				'white-chef-hat',
				'bamboo-hat',
				'straw-hat',
				'pink-party-hat',
				'wizard-hat',
			],
			atlasCellSizes: Array(13).fill(96),
			rewardCounts: Array(13).fill(1),
			coversAntennae: true,
			crownAccessoryId: 'crown',
			disabledAchievementIds: [
				ChatPetAchievementIds.InstructionPresent,
				ChatPetAchievementIds.QueueOrSteeringMessage,
				ChatPetAchievementIds.ChatOutputCopied,
				ChatPetAchievementIds.ImageRequest,
			],
			disabledAccessoryIds: [
				ChatPetAccessoryIds.SailorHat,
				ChatPetAccessoryIds.SpinnerHat,
				ChatPetAccessoryIds.PartyHat,
				ChatPetAccessoryIds.ArtistBeret,
			],
		});
	});

	test('keeps legacy disabled hats out of the enabled catalog', () => {
		const enabledAccessoryIds = new Set(chatPetAchievements.flatMap(achievement => achievement.accessories.map(accessory => accessory.id)));
		const disabledAccessoryIds = new Set(disabledChatPetAchievements.flatMap(achievement => achievement.accessories.map(accessory => accessory.id)));
		const legacyDisabledAccessoryIds = [
			ChatPetAccessoryIds.SailorHat,
			ChatPetAccessoryIds.SpinnerHat,
			ChatPetAccessoryIds.PartyHat,
			ChatPetAccessoryIds.ArtistBeret,
		];

		assert.deepStrictEqual(legacyDisabledAccessoryIds.map(id => ({
			id,
			enabled: enabledAccessoryIds.has(id),
			disabled: disabledAccessoryIds.has(id),
		})), legacyDisabledAccessoryIds.map(id => ({ id, enabled: false, disabled: true })));
	});

	test('maps every newly added hat to a distinct achievement', () => {
		const achievementIds = [
			ChatPetAchievementIds.AgentChangesReviewed,
			ChatPetAchievementIds.ChatReferenceOpened,
			ChatPetAchievementIds.UsefulOutputCopied,
			ChatPetAchievementIds.AutopilotEnabled,
			ChatPetAchievementIds.AgentsWindowOpened,
			ChatPetAchievementIds.CreatePullRequest,
			ChatPetAchievementIds.AgentEditKept,
		];

		assert.deepStrictEqual({
			firstMessageRewards: getChatPetAchievement(ChatPetAchievementIds.FirstChatMessage).accessories.map(accessory => accessory.id),
			newAchievements: achievementIds.map(id => {
				const achievement = getChatPetAchievement(id);
				return { title: achievement.title, reward: achievement.accessories[0].id };
			}),
		}, {
			firstMessageRewards: [ChatPetAccessoryIds.CowboyHat],
			newAchievements: [
				{ title: 'Trust but Verify', reward: ChatPetAccessoryIds.BambooHat },
				{ title: 'Follow the Trail', reward: ChatPetAccessoryIds.StrawHat },
				{ title: 'Copy That', reward: ChatPetAccessoryIds.PinkPartyHat },
				{ title: 'Party Mode', reward: ChatPetAccessoryIds.WizardHat },
				{ title: 'Mission Control', reward: ChatPetAccessoryIds.PropellerHat },
				{ title: 'Ship it', reward: ChatPetAccessoryIds.DarkSailorHat },
				{ title: 'Let it cook', reward: ChatPetAccessoryIds.WhiteChefHat },
			],
		});
	});

	test('rewards keeping agent edits with the white chef hat', () => {
		const letItCook = getChatPetAchievement(ChatPetAchievementIds.AgentEditKept);

		assert.deepStrictEqual({
			title: letItCook.title,
			description: letItCook.description,
			hint: letItCook.hint,
			accessoryIds: letItCook.accessories.map(accessory => accessory.id),
		}, {
			title: 'Let it cook',
			description: 'You kept a change prepared by Chat.',
			hint: 'Give a good idea time to come together.',
			accessoryIds: [ChatPetAccessoryIds.WhiteChefHat],
		});
	});

	test('rewards Create PR with the dark sailor hat and the Agents window with the propeller hat', () => {
		const shipIt = getChatPetAchievement(ChatPetAchievementIds.CreatePullRequest);
		const missionControl = getChatPetAchievement(ChatPetAchievementIds.AgentsWindowOpened);

		assert.deepStrictEqual({
			shipIt: {
				title: shipIt.title,
				description: shipIt.description,
				hint: shipIt.hint,
				accessoryIds: shipIt.accessories.map(accessory => accessory.id),
			},
			missionControl: {
				title: missionControl.title,
				accessoryIds: missionControl.accessories.map(accessory => accessory.id),
			},
		}, {
			shipIt: {
				title: 'Ship it',
				description: 'You used Create PR in the Agents window.',
				hint: 'When the changes are ready, send them on their way.',
				accessoryIds: [ChatPetAccessoryIds.DarkSailorHat],
			},
			missionControl: {
				title: 'Mission Control',
				accessoryIds: [ChatPetAccessoryIds.PropellerHat],
			},
		});
	});

	test('rewards model changes with the hard hat and custom skills with the crown', () => {
		const modelSwitch = getChatPetAchievement(ChatPetAchievementIds.ModelSwitch);
		const customSkill = getChatPetAchievement(ChatPetAchievementIds.CustomSkillPresent);

		assert.deepStrictEqual({
			modelSwitch: {
				title: modelSwitch.title,
				description: modelSwitch.description,
				accessoryId: modelSwitch.accessories[0].id,
			},
			customSkill: {
				title: customSkill.title,
				description: customSkill.description,
				accessoryId: customSkill.accessories[0].id,
			},
		}, {
			modelSwitch: {
				title: 'Model Citizen',
				description: 'You selected a different model from the model picker.',
				accessoryId: ChatPetAccessoryIds.ConstructionHardHat,
			},
			customSkill: {
				title: 'Skilled Builder',
				description: 'You added a custom skill.',
				accessoryId: ChatPetAccessoryIds.Crown,
			},
		});
	});

	test('reveals locked hints and rewards without exposing achievement identity or exact requirements', () => {
		const lockedPresentation = getChatPetAchievementPresentation(chatPetAchievements[0], false);
		const unlockedAccessories = getUnlockedChatPetAccessories([ChatPetAchievementIds.RequestRevision]);
		const allUnlockedAccessories = getUnlockedChatPetAccessories(chatPetAchievements.map(achievement => achievement.id));

		assert.deepStrictEqual({
			lockedPresentation,
			lockedSerializationContainsTitle: JSON.stringify(lockedPresentation).includes(chatPetAchievements[0].title),
			lockedSerializationContainsDescription: JSON.stringify(lockedPresentation).includes(chatPetAchievements[0].description),
			lockedSerializationContainsExactRequirement: JSON.stringify(lockedPresentation).includes('Edit and resend an earlier chat request.'),
			lockedSerializationContainsReward: chatPetAchievements[0].accessories.some(accessory => JSON.stringify(lockedPresentation).includes(accessory.label)),
			unlockedAccessoryIds: unlockedAccessories.map(accessory => accessory.id),
			allUnlockedAccessoryIds: allUnlockedAccessories.map(accessory => accessory.id),
		}, {
			lockedPresentation: {
				locked: true,
				id: ChatPetAchievementIds.RequestRevision,
				hint: 'An earlier request may deserve a second pass.',
				rewardLabels: ['Grand Top Hat & Monocle'],
			},
			lockedSerializationContainsTitle: false,
			lockedSerializationContainsDescription: false,
			lockedSerializationContainsExactRequirement: false,
			lockedSerializationContainsReward: true,
			unlockedAccessoryIds: [
				ChatPetAccessoryIds.TopHatMonocle,
			],
			allUnlockedAccessoryIds: [
				ChatPetAccessoryIds.TopHatMonocle,
				ChatPetAccessoryIds.CowboyHat,
				ChatPetAccessoryIds.BaseballCap,
				ChatPetAccessoryIds.ConstructionHardHat,
				ChatPetAccessoryIds.FirefighterHelmet,
				ChatPetAccessoryIds.Crown,
				ChatPetAccessoryIds.PropellerHat,
				ChatPetAccessoryIds.DarkSailorHat,
				ChatPetAccessoryIds.WhiteChefHat,
				ChatPetAccessoryIds.BambooHat,
				ChatPetAccessoryIds.StrawHat,
				ChatPetAccessoryIds.PinkPartyHat,
				ChatPetAccessoryIds.WizardHat,
			],
		});
	});

	test('cycles through click interactions without repeating and reserves one percent each for icon and yapping', () => {
		const interactionInterval = 0.98 / 6;
		assert.strictEqual(CHAT_PET_ICON_TRANSFORMATION_CHANCE, 1 / 100);
		assert.strictEqual(CHAT_PET_YAPPING_CHANCE, 1 / 100);
		assert.deepStrictEqual([
			getChatPetClickInteraction(0),
			getChatPetClickInteraction(0.009_999),
			getChatPetClickInteraction(0.01),
			getChatPetClickInteraction(0.019_999),
			getChatPetClickInteraction(0.02),
			getChatPetClickInteraction(0.02 + interactionInterval * 1.5),
			getChatPetClickInteraction(0.02 + interactionInterval * 2.5),
			getChatPetClickInteraction(0.02 + interactionInterval * 3.5),
			getChatPetClickInteraction(0.02 + interactionInterval * 4.5),
			getChatPetClickInteraction(0.02 + interactionInterval * 5.5),
			getChatPetClickInteraction(0.99),
			getChatPetClickInteraction(0.02, 'buttonPress'),
			getChatPetClickInteraction(0.99, 'worry'),
		], [
			'complete',
			'complete',
			'yapping',
			'yapping',
			'buttonPress',
			'love',
			'cool',
			'sing',
			'speechless',
			'worry',
			'worry',
			'love',
			'speechless',
		]);
	});

	test('blinks fixed eyes during typing, love, and button press', () => {
		assert.deepStrictEqual([
			doesChatPetStateBlink('typing'),
			doesChatPetStateBlink('love'),
			doesChatPetStateBlink('buttonPress'),
			doesChatPetStateBlink('buttonPress', 4),
			doesChatPetStateBlink('buttonPress', 5),
			doesChatPetStateBlink('idle'),
			doesChatPetStateBlink('rendering'),
			doesChatPetStateBlink(undefined),
		], [
			true,
			true,
			true,
			true,
			false,
			false,
			false,
			false,
		]);
	});

	test('varies blink timing independently between breaths', () => {
		const clock = sinon.useFakeTimers();
		const changes: { readonly time: number; readonly blinking: boolean }[] = [];
		const randomValues = [0, 0.5, 1];
		const controller = new ChatPetBlinkController(blinking => changes.push({ time: Date.now(), blinking }), () => randomValues.shift() ?? 1);
		try {
			controller.setEnabled(true);
			clock.tick(1_400);
			clock.tick(260);
			controller.onAnimationComplete();
			clock.tick(2_400);
			clock.tick(260);
			controller.onAnimationComplete();
			clock.tick(3_400);
			clock.tick(260);
			controller.onAnimationComplete();
			controller.setEnabled(false);

			assert.deepStrictEqual({
				delays: [getChatPetBlinkDelay(0), getChatPetBlinkDelay(0.5), getChatPetBlinkDelay(1)],
				changes,
			}, {
				delays: [1_400, 2_400, 3_400],
				changes: [
					{ time: 1_400, blinking: true },
					{ time: 1_660, blinking: false },
					{ time: 4_060, blinking: true },
					{ time: 4_320, blinking: false },
					{ time: 7_720, blinking: true },
					{ time: 7_980, blinking: false },
				],
			});
		} finally {
			controller.dispose();
		}
	});

	test('disables cursor tracking for fixed-eye sprite states', () => {
		assert.deepStrictEqual({
			idle: doesChatPetStateTrackCursor('idle'),
			sleep: doesChatPetStateTrackCursor('sleep'),
			waking: doesChatPetStateTrackCursor('waking'),
			typing: doesChatPetStateTrackCursor('typing'),
			rendering: doesChatPetStateTrackCursor('rendering'),
			buttonPress: doesChatPetStateTrackCursor('buttonPress'),
			complete: doesChatPetStateTrackCursor('complete'),
			jump: doesChatPetStateTrackCursor('jump'),
			love: doesChatPetStateTrackCursor('love'),
			cool: doesChatPetStateTrackCursor('cool'),
			yapping: doesChatPetStateTrackCursor('yapping'),
			yappingMouthOpen: doesChatPetStateTrackCursor('yappingMouthOpen'),
			sing: doesChatPetStateTrackCursor('sing'),
			speechless: doesChatPetStateTrackCursor('speechless'),
			worry: doesChatPetStateTrackCursor('worry'),
			dizzy: doesChatPetStateTrackCursor('dizzy'),
			falling: doesChatPetStateTrackCursor('falling'),
			wallImpact: doesChatPetStateTrackCursor('wallImpact'),
			splat: doesChatPetStateTrackCursor('splat'),
			onTheRun: doesChatPetStateTrackCursor('onTheRun'),
			searching: doesChatPetStateTrackCursor('searching'),
		}, {
			idle: true,
			sleep: false,
			waking: false,
			typing: false,
			rendering: true,
			buttonPress: false,
			complete: false,
			jump: false,
			love: false,
			cool: false,
			yapping: true,
			yappingMouthOpen: false,
			sing: false,
			speechless: false,
			worry: false,
			dizzy: false,
			falling: false,
			wallImpact: false,
			splat: false,
			onTheRun: false,
			searching: false,
		});
	});

	test('tracks body facing while idle and locks it during animations', () => {
		const controller = new ChatPetFacingController();
		const directions = [controller.direction];

		controller.setState('idle', false);
		directions.push(controller.update(-10, 0));
		controller.setState('typing', false);
		directions.push(controller.update(10, 0));
		controller.setState('buttonPress', false);
		directions.push(controller.update(10, 0));
		controller.setState('sing', false);
		directions.push(controller.update(10, 0));
		controller.setState('idle', false);
		directions.push(controller.update(10, 0));
		controller.setState('idle', true);
		directions.push(controller.update(-10, 0));

		assert.deepStrictEqual(directions, [
			'right',
			'left',
			'left',
			'left',
			'left',
			'right',
			'right',
		]);
	});

	test('snapshots the splat direction after falling and locks it during the animation', () => {
		const controller = new ChatPetFacingController();

		controller.setState('falling', false);
		const fallingDirection = controller.update(-10, 0);
		const splatDirection = controller.snapToCursor(-10, 0);
		controller.setState('splat', false);
		const splatDirectionAfterPointerMove = controller.update(10, 0);

		assert.deepStrictEqual({
			fallingDirection,
			splatDirection,
			splatDirectionAfterPointerMove,
		}, {
			fallingDirection: 'right',
			splatDirection: 'left',
			splatDirectionAfterPointerMove: 'left',
		});
	});

	test('gets dizzy after rapid direction changes and resets slow sequences', () => {
		const controller = new ChatPetDirectionChangeController(3, 500);

		assert.deepStrictEqual([
			controller.record('left', 0),
			controller.record('left', 50),
			controller.record('right', 100),
			controller.record('left', 200),
			controller.record('right', 300),
			controller.record('left', 400),
			controller.record('right', 1_000),
			controller.record('left', 1_100),
			controller.record('right', 1_200),
		], [
			false,
			false,
			false,
			false,
			true,
			false,
			false,
			false,
			true,
		]);
	});

	test('maps activity and interaction states to their sprites', () => {
		assert.deepStrictEqual([
			getChatPetSpriteName('complete', 'insider'),
			getChatPetSpriteName('buttonPress', 'insider'),
			getChatPetSpriteName('sleep', 'insider'),
			getChatPetSpriteName('waking', 'stable'),
			getChatPetSpriteName('typing', 'insider'),
			getChatPetSpriteName('rendering', 'stable'),
			getChatPetSpriteName('achievementUnlocked', 'stable'),
			getChatPetSpriteName('cool', 'stable'),
			getChatPetSpriteName('searching', 'stable'),
			getChatPetSpriteName('yappingMouthOpen', 'insider'),
			getChatPetSpriteName('sing', 'stable'),
			getChatPetSpriteName('sing', 'insider'),
			getChatPetSpriteName('speechless', 'stable'),
			getChatPetSpriteName('speechless', 'insider'),
			getChatPetSpriteName('worry', 'stable'),
			getChatPetSpriteName('worry', 'insider'),
			getChatPetSpriteName('dizzy', 'stable'),
			getChatPetSpriteName('dizzy', 'insider'),
			getChatPetSpriteName('falling', 'stable'),
			getChatPetSpriteName('wallImpact', 'stable'),
			getChatPetSpriteName('wallImpact', 'insider'),
			getChatPetSpriteName('jump', 'stable'),
			getChatPetSpriteName('jump', 'insider'),
			getChatPetSpriteName('splat', 'insider'),
		], [
			'buddy-idle-insiders',
			'buddy-press-button-insiders',
			'buddy-sleep-insiders',
			'buddy-waking-stable',
			'buddy-typing-insiders',
			'buddy-rendering-stable',
			'buddy-rendering-stable',
			'buddy-cool-stable',
			'buddy-search-stable',
			'buddy-yapping-insiders',
			'buddy-sing-stable',
			'buddy-sing-insiders',
			'buddy-speechless-stable',
			'buddy-speechless-insiders',
			'buddy-worry-stable',
			'buddy-worry-insiders',
			'buddy-dizzy-stable',
			'buddy-dizzy-insiders',
			'buddy-falling-stable',
			'buddy-wall-impact-stable',
			'buddy-wall-impact-insiders',
			'buddy-jump-stable',
			'buddy-jump-insiders',
			'buddy-splat-insiders',
		]);
	});

	test('maps every runtime state to a body-owned accessory track', () => {
		assert.deepStrictEqual([
			'idle', 'sleep', 'waking', 'typing', 'rendering', 'achievementUnlocked', 'buttonPress', 'complete', 'love', 'clapping', 'jump', 'cool', 'yapping', 'yappingMouthOpen', 'sing', 'speechless', 'worry', 'dizzy', 'falling', 'wallImpact', 'splat', 'onTheRun', 'searching', 'searchingDown',
		].map(state => getChatPetAccessoryTrack(state as Parameters<typeof getChatPetAccessoryTrack>[0])), [
			'idle', 'sleep', 'waking', 'typing', 'rendering', 'rendering', 'buttonPress', 'idle', 'love', 'clapping', 'jump', 'cool', 'idle', 'yapping', 'sing', 'speechless', 'worry', 'dizzy', 'falling', 'wallImpact', 'splat', 'search', 'search', 'search',
		]);
	});

	test('maps exceptional body geometry to canonical accessory rig poses and anchors', () => {
		assert.deepStrictEqual({
			poses: [
				getChatPetAccessoryRigPose('idle'),
				getChatPetAccessoryRigPose('sleep'),
				getChatPetAccessoryRigPose('waking', 3),
				getChatPetAccessoryRigPose('jump'),
				getChatPetAccessoryRigPose('wallImpact'),
				getChatPetAccessoryRigPose('splat', 0),
				getChatPetAccessoryRigPose('splat', 3),
			],
			idleBob: [getChatPetAccessoryRigFrame('idle', 19), getChatPetAccessoryRigFrame('idle', 20)],
			bodyTranslations: [
				getChatPetAccessoryRigFrame('rendering', 19),
				getChatPetAccessoryRigFrame('rendering', 20),
				getChatPetAccessoryRigFrame('sleep', 2),
				getChatPetAccessoryRigFrame('sleep', 3),
				getChatPetAccessoryRigFrame('waking', 0),
				getChatPetAccessoryRigFrame('waking', 3),
			],
			jump: [getChatPetAccessoryRigFrame('jump', 1), getChatPetAccessoryRigFrame('jump', 4)],
			sing: getChatPetAccessoryRigFrame('sing', 0),
			worry: [getChatPetAccessoryRigFrame('worry', 0), getChatPetAccessoryRigFrame('worry', 1)],
			splat: [getChatPetAccessoryRigFrame('splat', 0), getChatPetAccessoryRigFrame('splat', 3)],
			eyeSlotAvailability: [
				getChatPetAccessoryRigFrame('sing', 0).rightEye !== undefined,
				getChatPetAccessoryRigFrame('love', 0).rightEye !== undefined,
				getChatPetAccessoryRigFrame('complete', 0).rightEye !== undefined,
				getChatPetAccessoryRigFrame('cool', 0).rightEye !== undefined,
				getChatPetAccessoryRigFrame('dizzy', 0).rightEye !== undefined,
				getChatPetAccessoryRigFrame('wallImpact', 0).rightEye !== undefined,
				getChatPetAccessoryRigFrame('splat', 0).rightEye !== undefined,
				getChatPetAccessoryRigFrame('splat', 3).rightEye !== undefined,
			],
			headSlotAvailability: [
				getChatPetAccessoryRigFrame('idle', 0).head !== undefined,
				getChatPetAccessoryRigFrame('love', 0).head !== undefined,
				getChatPetAccessoryRigFrame('complete', 0).head !== undefined,
				getChatPetAccessoryRigFrame('dizzy', 0).head !== undefined,
				getChatPetAccessoryRigFrame('wallImpact', 0).head !== undefined,
			],
			antennaeOcclusionBounds: [
				getChatPetAntennaeOcclusionBounds('idle', 0),
				getChatPetAntennaeOcclusionBounds('idle', 20),
				getChatPetAntennaeOcclusionBounds('sleep', 4),
				getChatPetAntennaeOcclusionBounds('jump', 1),
				getChatPetAntennaeOcclusionBounds('splat', 0),
				getChatPetAntennaeOcclusionBounds('wallImpact', 0),
				getChatPetAntennaeOcclusionBounds('love', 0),
			],
			eyeFacingAnchors: [
				getChatPetEyeAccessoryAnchor('idle', 0, 'right', false),
				getChatPetEyeAccessoryAnchor('idle', 0, 'left', false),
				getChatPetEyeAccessoryAnchor('idle', 0, 'left', true),
				getChatPetEyeAccessoryAnchor('sleep', 0, 'left', false, 120),
				getChatPetEyeAccessoryAnchor('typing', 0, 'left', false, 168),
				getChatPetEyeAccessoryAnchor('buttonPress', 0, 'left', false, 160),
				getChatPetEyeAccessoryAnchor('sing', 0, 'left', false, 164),
			],
			monocleMotion: {
				breathing: [
					getChatPetEyeAccessoryAnchor('idle', 0, 'right', false),
					getChatPetEyeAccessoryAnchor('idle', 20, 'right', false),
				],
				gaze: [
					getChatPetEyeAccessoryGazeOffset([-1, -1]),
					getChatPetEyeAccessoryGazeOffset([0, 0]),
					getChatPetEyeAccessoryGazeOffset([1, 1]),
				],
			},
			reducedMotionFrames: [
				getChatPetReducedMotionRigFrame('idle'),
				getChatPetReducedMotionRigFrame('sleep'),
				getChatPetReducedMotionRigFrame('waking'),
				getChatPetReducedMotionRigFrame('buttonPress'),
				getChatPetReducedMotionRigFrame('love'),
				getChatPetReducedMotionRigFrame('splat'),
			],
		}, {
			poses: ['upright', 'sleeping', 'upright', 'airborne', 'impact', 'splat', 'upright'],
			idleBob: [
				{ pose: 'upright', head: { x: 48, y: 40 }, rightEye: { x: 56, y: 56 } },
				{ pose: 'upright', head: { x: 48, y: 44 }, rightEye: { x: 56, y: 60 } },
			],
			bodyTranslations: [
				{ pose: 'upright', head: { x: 48, y: 40 }, rightEye: { x: 56, y: 56 } },
				{ pose: 'upright', head: { x: 48, y: 44 }, rightEye: { x: 56, y: 60 } },
				{ pose: 'sleeping', head: { x: 48, y: 40 }, rightEye: { x: 56, y: 64 } },
				{ pose: 'sleeping', head: { x: 48, y: 44 }, rightEye: { x: 56, y: 64 } },
				{ pose: 'sleeping', head: { x: 48, y: 44 }, rightEye: { x: 56, y: 64 } },
				{ pose: 'upright', head: { x: 48, y: 40 }, rightEye: { x: 56, y: 56 } },
			],
			jump: [
				{ pose: 'airborne', head: { x: 48, y: 56 }, rightEye: { x: 56, y: 64 } },
				{ pose: 'airborne', head: { x: 48, y: 64 }, rightEye: { x: 56, y: 64 } },
			],
			sing: { pose: 'upright', head: { x: 48, y: 60 }, rightEye: { x: 56, y: 72 } },
			worry: [
				{ pose: 'upright', head: { x: 48, y: 40 }, rightEye: undefined },
				{ pose: 'upright', head: { x: 48, y: 40 }, rightEye: undefined, mirrorsHeadAccessory: true },
			],
			splat: [
				{ pose: 'splat', head: { x: 48, y: 80 }, rightEye: undefined },
				{ pose: 'upright', head: { x: 48, y: 40 }, rightEye: { x: 56, y: 56 } },
			],
			eyeSlotAvailability: [true, false, false, false, false, false, false, true],
			headSlotAvailability: [true, false, false, false, true],
			antennaeOcclusionBounds: [
				{ x: 16, y: -8, width: 64, height: 40 },
				{ x: 16, y: -4, width: 64, height: 40 },
				{ x: 16, y: -4, width: 64, height: 40 },
				{ x: 16, y: 8, width: 64, height: 40 },
				{ x: 16, y: 32, width: 64, height: 40 },
				{ x: 16, y: 24, width: 64, height: 8 },
				undefined,
			],
			eyeFacingAnchors: [
				{ x: 56, y: 56 },
				{ x: 40, y: 56 },
				{ x: 56, y: 56 },
				{ x: 64, y: 64 },
				{ x: 112, y: 56 },
				{ x: 104, y: 56 },
				{ x: 108, y: 72 },
			],
			monocleMotion: {
				breathing: [
					{ x: 56, y: 56 },
					{ x: 56, y: 60 },
				],
				gaze: [
					[-4, -4],
					[0, 0],
					[4, 4],
				],
			},
			reducedMotionFrames: [0, 4, 7, 4, 5, 3],
		});
	});

	test('validates exact body and accessory atlas dimensions', () => {
		const source = getChatPetAccessoryImageSource({
			id: ChatPetAccessoryIds.CowboyHat,
			label: 'Cowboy Hat',
			atlasName: 'cowboy-hat',
			atlasCellSize: 96,
		});
		const compactSource = getChatPetAccessoryImageSource({
			id: ChatPetAccessoryIds.TopHatMonocle,
			label: 'Grand Top Hat & Monocle',
			atlasName: 'grand-top-hat-monocle',
		});

		assert.deepStrictEqual({
			isAtlas: source.url.endsWith('/cowboy-hat.png'),
			cellSize: source.cellSize,
			compactCellSize: compactSource.cellSize,
			bodyValid: hasChatPetBodyImageDimensions({ naturalWidth: 336, naturalHeight: 96 }, 168, 96, 2),
			bodyWrongWidth: hasChatPetBodyImageDimensions({ naturalWidth: 168, naturalHeight: 96 }, 168, 96, 2),
			wideAccessoryValid: hasChatPetAccessoryImageDimensions({ naturalWidth: 384, naturalHeight: 288 }, source),
			compactAccessoryValid: hasChatPetAccessoryImageDimensions({ naturalWidth: 256, naturalHeight: 192 }, compactSource),
			accessoryWrongSize: hasChatPetAccessoryImageDimensions({ naturalWidth: 256, naturalHeight: 192 }, source),
		}, {
			isAtlas: true,
			cellSize: 96,
			compactCellSize: 64,
			bodyValid: true,
			bodyWrongWidth: false,
			wideAccessoryValid: true,
			compactAccessoryValid: true,
			accessoryWrongSize: false,
		});
	});

	test('preserves the source animation timing', () => {
		assert.deepStrictEqual([
			getChatPetFrameDurations('idle'),
			getChatPetFrameDurations('sleep'),
			getChatPetFrameDurations('waking'),
			getChatPetFrameDurations('typing'),
			getChatPetFrameDurations('rendering'),
			getChatPetFrameDurations('buttonPress'),
			getChatPetFrameDurations('clapping'),
			getChatPetFrameDurations('love'),
			getChatPetFrameDurations('cool'),
			getChatPetFrameDurations('sing'),
			getChatPetFrameDurations('speechless'),
			getChatPetFrameDurations('worry'),
			getChatPetFrameDurations('dizzy'),
			getChatPetFrameDurations('searching'),
			getChatPetFrameDurations('yapping'),
			getChatPetFrameDurations('yappingMouthOpen'),
			getChatPetFrameDurations('falling'),
			getChatPetFrameDurations('wallImpact'),
			getChatPetFrameDurations('jump'),
			getChatPetFrameDurations('splat'),
			getChatPetRespawnFrameDurations(),
			getChatPetSpeechFrameDurations(),
		], [
			Array.from({ length: 50 }, () => 40),
			Array.from({ length: 8 }, () => 300),
			[160, 100, 80, 90, 90, 90, 100, 170],
			[320, 480],
			Array.from({ length: 50 }, () => 40),
			[500, 300, 350, 250, 450, 1_000],
			[80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80],
			[200, 200, 380, 100, 80, 1_980],
			[600, 120, 120, 120, 160, 80, 80, 80, 1_640],
			[180, 180, 180, 180],
			[400, 120, 1_000, 120, 1_080],
			[600, 600],
			Array.from({ length: 8 }, () => 120),
			[500, 500, 500, 500],
			[],
			[],
			[120, 80, 80, 120, 80, 80],
			[],
			[70, 80, 90, 160, 100, 100],
			[120, 100, 100, 200],
			[120, 100, 120, 240, 100, 120],
			[220, 220, 220, 100, 160, 180],
		]);
	});

	test('selects animation frames and completes on the final frame', () => {
		const frameDurations = [100, 50, 150];
		assert.deepStrictEqual([
			getChatPetAnimationFrame([], 0, 1),
			getChatPetAnimationFrame(frameDurations, -1, 1),
			getChatPetAnimationFrame(frameDurations, 99, 1),
			getChatPetAnimationFrame(frameDurations, 100, 1),
			getChatPetAnimationFrame(frameDurations, 149, 1),
			getChatPetAnimationFrame(frameDurations, 150, 1),
			getChatPetAnimationFrame(frameDurations, 299, 1),
			getChatPetAnimationFrame(frameDurations, 300, 1),
			getChatPetAnimationFrame(frameDurations, 300, Infinity),
			getChatPetAnimationFrame(frameDurations, 600, 2),
			getChatPetAnimationFrame(frameDurations, -1, 1, true),
			getChatPetAnimationFrame(frameDurations, 149, 1, true),
			getChatPetAnimationFrame(frameDurations, 150, 1, true),
			getChatPetAnimationFrame(frameDurations, 199, 1, true),
			getChatPetAnimationFrame(frameDurations, 200, 1, true),
			getChatPetAnimationFrame(frameDurations, 299, 1, true),
			getChatPetAnimationFrame(frameDurations, 300, 1, true),
		], [
			{ frameIndex: 0, complete: true },
			{ frameIndex: 0, complete: false, nextFrameDelay: 100 },
			{ frameIndex: 0, complete: false, nextFrameDelay: 1 },
			{ frameIndex: 1, complete: false, nextFrameDelay: 50 },
			{ frameIndex: 1, complete: false, nextFrameDelay: 1 },
			{ frameIndex: 2, complete: false, nextFrameDelay: 150 },
			{ frameIndex: 2, complete: false, nextFrameDelay: 1 },
			{ frameIndex: 2, complete: true },
			{ frameIndex: 0, complete: false, nextFrameDelay: 100 },
			{ frameIndex: 2, complete: true },
			{ frameIndex: 2, complete: false, nextFrameDelay: 150 },
			{ frameIndex: 2, complete: false, nextFrameDelay: 1 },
			{ frameIndex: 1, complete: false, nextFrameDelay: 50 },
			{ frameIndex: 1, complete: false, nextFrameDelay: 1 },
			{ frameIndex: 0, complete: false, nextFrameDelay: 100 },
			{ frameIndex: 0, complete: false, nextFrameDelay: 1 },
			{ frameIndex: 0, complete: true },
		]);
	});

	test('matches sprite sources without browser URL normalization', () => {
		const source = 'vscode-file://vscode-app/Applications/Visual Studio Code - Insiders.app/pet.gif';
		const image = document.createElement('img');
		image.src = source;

		assert.deepStrictEqual([
			image.src === source,
			isChatPetImageSource(image, source),
		], [
			false,
			true,
		]);
	});

	test('maps the cursor to pixel-snapped gaze directions', () => {
		assert.deepStrictEqual([
			getChatPetGazeDirection(10, 0, 0, 0),
			getChatPetGazeDirection(10, 10, 0, 0),
			getChatPetGazeDirection(0, 10, 0, 0),
			getChatPetGazeDirection(-10, 10, 0, 0),
			getChatPetGazeDirection(-10, 0, 0, 0),
			getChatPetGazeDirection(-10, -10, 0, 0),
			getChatPetGazeDirection(0, -10, 0, 0),
			getChatPetGazeDirection(10, -10, 0, 0),
			getChatPetGazeDirection(0, 0, 0, 0),
		], [
			[1, 0],
			[1, 1],
			[0, 1],
			[-1, 1],
			[-1, 0],
			[-1, -1],
			[0, -1],
			[1, -1],
			[0, 0],
		]);
	});

	test('clamps horizontal movement to the input bounds', () => {
		assert.deepStrictEqual([
			getChatPetHorizontalPosition(-20, 10, 100),
			getChatPetHorizontalPosition(50, 10, 100),
			getChatPetHorizontalPosition(120, 10, 100),
			getChatPetHorizontalPosition(20, 40, 20),
		], [
			10,
			50,
			100,
			40,
		]);
	});

	test('places the default position thirty-two pixels from the right edge', () => {
		assert.deepStrictEqual([
			getChatPetDefaultHorizontalPosition(0, 100),
			getChatPetDefaultHorizontalPosition(20, 120),
			getChatPetDefaultHorizontalPosition(40, 20),
		], [
			68,
			88,
			40,
		]);
	});

	test('changes size in twenty-percent steps with only a minimum', () => {
		assert.deepStrictEqual([
			getChatPetScale(1, 0.2),
			getChatPetScale(1, -0.2),
			getChatPetScale(0.4, -0.2),
			getChatPetScale(10, 0.2),
		], [
			1.2,
			0.8,
			0.4,
			10.2,
		]);
	});

	test('clamps two-dimensional dragging to the chat bounds', () => {
		assert.deepStrictEqual([
			getChatPetDragPosition(-20, -40, 10, 100, -300, 200),
			getChatPetDragPosition(50, -100, 10, 100, -300, 200),
			getChatPetDragPosition(120, 240, 10, 100, -300, 200),
		], [
			[10, -40],
			[50, -100],
			[100, 200],
		]);
	});

	test('turns recent directional flicks into bounded throws', () => {
		assert.deepStrictEqual([
			getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 60, y: 10, time: 40 }, { x: 120, y: 20, time: 80 }], 100),
			getChatPetThrowVelocity([{ x: 200, y: 100, time: 0 }, { x: 150, y: 60, time: 50 }, { x: 120, y: 40, time: 80 }], 90),
			getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 40, y: 0, time: 100 }], 100),
			getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 50, y: 100, time: 50 }], 50),
			getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 70, y: 90, time: 100 }], 100),
			getChatPetThrowVelocity([{ x: 0, y: 100, time: 0 }, { x: 0, y: -20, time: 80 }], 80),
			getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 240, y: 320, time: 40 }], 40),
			getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 120, y: 0, time: 80 }], 161),
		], [
			{ x: 1_500, y: 250 },
			{ x: -1_000, y: -750 },
			undefined,
			{ x: 1_000, y: 2_000 },
			{ x: 700, y: 900 },
			{ x: 0, y: -1_500 },
			{ x: 1_440, y: 1_920 },
			undefined,
		]);
	});

	test('preserves gravity direction through a shorter wall rebound', () => {
		assert.deepStrictEqual({
			impactDuration: CHAT_PET_WALL_IMPACT_DURATION,
			downward: getChatPetWallReboundVelocity({ x: 1_500, y: 900 }),
			upward: getChatPetWallReboundVelocity({ x: -1_000, y: -750 }),
		}, {
			impactDuration: 48,
			downward: { x: -300, y: 900 },
			upward: { x: 200, y: -750 },
		});
	});

	test('smoothly rights throws through the apex', () => {
		assert.deepStrictEqual([
			getChatPetThrowRotation(45, 20, -500, 16),
			getChatPetThrowRotation(45, 20, -225, 16),
			getChatPetThrowRotation(330, 20, 100, 16),
			getChatPetThrowRotation(-330, -20, 100, 16),
			getChatPetThrowRotation(358, 20, 100, 16),
			getChatPetThrowRotation(90, -20, 100, 16),
		].map(rotation => Math.round(rotation * 100) / 100), [
			58,
			57.26,
			341.52,
			-341.52,
			360,
			78.48,
		]);
	});

	test('advances wall throws through gravity and bounded collisions', () => {
		const bounds = { minimumLeft: 0, maximumLeft: 80, minimumTop: 0 };
		const frames = [
			advanceChatPetThrow({ left: 10, top: 100, x: 500, y: -100 }, 20, bounds),
			advanceChatPetThrow({ left: 70, top: 100, x: 1_000, y: 0 }, 20, bounds),
			advanceChatPetThrow({ left: 10, top: 1, x: 0, y: -200 }, 10, bounds),
			advanceChatPetThrow({ left: 0, top: 100, x: 1_000, y: 0 }, 20, { minimumLeft: 0, maximumLeft: 0, minimumTop: 0 }),
		].map(frame => ({
			...frame,
			left: Math.round(frame.left * 100) / 100,
			top: Math.round(frame.top * 100) / 100,
			y: Math.round(frame.y * 100) / 100,
		}));

		assert.deepStrictEqual(frames, [
			{ left: 20, top: 98.36, x: 500, y: -64, wall: undefined },
			{ left: 80, top: 100.09, x: 1_000, y: 18, wall: 'right' },
			{ left: 10, top: 0, x: 0, y: 36.4, wall: undefined },
			{ left: 0, top: 100.36, x: 0, y: 36, wall: undefined },
		]);
	});

	test('settles throws that exceed their bounds or maximum duration', () => {
		assert.deepStrictEqual([
			shouldSettleChatPetThrow(0, 3_999, 100, 200, 400),
			shouldSettleChatPetThrow(0, 4_000, 100, -200, 400),
			shouldSettleChatPetThrow(0, 100, 401, -1, 400),
			shouldSettleChatPetThrow(0, 100, 401, 0, 400),
		], [
			false,
			true,
			false,
			true,
		]);
	});

	test('lands a throw at the first platform or floor crossing', () => {
		assert.deepStrictEqual([
			getChatPetThrowLanding(10, 80, 30, 120, 48, 48, 0, 100, 148, 400),
			getChatPetThrowLanding(80, 80, 120, 120, 48, 48, 0, 100, 148, 400),
			getChatPetThrowLanding(120, 360, 140, 420, 48, 48, 0, 100, 148, 400),
			getChatPetThrowLanding(10, 120, 30, 80, 48, 48, 0, 100, 148, 400),
		], [
			{ left: 20, top: 100, landsOnPlatform: true },
			undefined,
			{ left: 133.33333333333334, top: 400, landsOnPlatform: false },
			undefined,
		]);
	});

	test('lands on the input only when dropped above its horizontal span', () => {
		assert.deepStrictEqual([
			getChatPetFallTarget(50, 20, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(0, 20, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 152, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 190, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 151.5, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 152.5, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 220, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 100, 48, 48, 40, 200, 120, 400, 200),
			getChatPetFallTarget(50, 160, 48, 48, 40, 200, 120, 400, 200),
		], [
			{ top: 152, landsOnPlatform: true },
			{ top: 352, landsOnPlatform: false },
			{ top: 152, landsOnPlatform: true },
			{ top: 352, landsOnPlatform: false },
			{ top: 152, landsOnPlatform: true },
			{ top: 352, landsOnPlatform: false },
			{ top: 352, landsOnPlatform: false },
			{ top: 152, landsOnPlatform: true },
			{ top: 352, landsOnPlatform: false },
		]);
	});

	test('scales fall duration with distance within motion bounds', () => {
		assert.deepStrictEqual([
			getChatPetFallDuration(0),
			getChatPetFallDuration(100),
			getChatPetFallDuration(400),
			getChatPetFallDuration(1_225),
		], [
			180,
			200,
			400,
			700,
		]);
	});

	test('adapts vertical alignment to the input stack', () => {
		assert.deepStrictEqual([
			getChatPetVerticalOffset(100, 98),
			getChatPetVerticalOffset(100, 108),
			getChatPetVerticalOffset(100, 112),
			getChatPetVerticalOffset(100, 160),
		], [
			0,
			8,
			10,
			10,
		]);
	});

	test('uses substantive input surfaces as the platform', () => {
		assert.deepStrictEqual([
			getChatPetPlatformTop(100, 160),
			getChatPetPlatformTop(100, 160, 120),
			getChatPetPlatformTop(100, 160, 158),
			getChatPetPlatformTop(100, 160, 170),
		], [
			110,
			120,
			158,
			110,
		]);
	});

	test('stands on the topmost surface showing above the input', () => {
		const container = mainWindow.document.createElement('div');
		container.style.cssText = 'position:absolute;top:100px;left:0;width:200px';
		// Offset above the host, so it would win if the walk did not skip it.
		const overlay = mainWindow.document.createElement('div');
		overlay.className = CHAT_PET_OVERLAY_CLASS;
		overlay.style.cssText = 'position:absolute;top:-10px;left:0;width:200px;height:20px';
		const emptySlot = mainWindow.document.createElement('div');
		emptySlot.style.display = 'none';
		const notice = mainWindow.document.createElement('div');
		notice.style.height = '30px';
		const inputWrapper = mainWindow.document.createElement('div');
		inputWrapper.style.paddingTop = '6px';
		const input = mainWindow.document.createElement('div');
		input.style.height = '40px';
		inputWrapper.append(input);
		container.append(overlay, emptySlot, notice, inputWrapper);
		mainWindow.document.body.append(container);
		disposables.add(toDisposable(() => container.remove()));

		const containerTop = container.getBoundingClientRect().top;
		const dockedNotice = getChatPetStackPlatformTop(container, input) - containerTop;
		const skippingLeadingContent = getChatPetStackPlatformTop(container, input, notice) - containerTop;
		notice.style.display = 'none';
		const noticeStoodDown = getChatPetStackPlatformTop(container, input) - containerTop;

		assert.deepStrictEqual({ dockedNotice, skippingLeadingContent, noticeStoodDown }, {
			dockedNotice: 0,
			skippingLeadingContent: 36,
			noticeStoodDown: 6,
		});
	});

	test('uses only the pill under the pet as a raised platform', () => {
		const pillBounds = [
			{ left: 10, right: 50, top: 120, width: 40, height: 22 },
			{ left: 56, right: 96, top: 118, width: 40, height: 24 },
			{ left: 104, right: 144, top: 116, width: 0, height: 24 },
		];
		assert.deepStrictEqual([
			getChatPetPillPlatformTop(9, pillBounds),
			getChatPetPillPlatformTop(10, pillBounds),
			getChatPetPillPlatformTop(50, pillBounds),
			getChatPetPillPlatformTop(53, pillBounds),
			getChatPetPillPlatformTop(75, pillBounds),
			getChatPetPillPlatformTop(120, pillBounds),
		], [
			undefined,
			120,
			120,
			undefined,
			118,
			undefined,
		]);
	});

	test('moves only the rendering speech bubble before it crosses the input edge', () => {
		assert.deepStrictEqual([
			shouldPlaceChatPetSpeechBubbleLeft('rendering', 980, 1000),
			shouldPlaceChatPetSpeechBubbleLeft('rendering', 981, 1000),
			shouldPlaceChatPetSpeechBubbleLeft('yapping', 981, 1000),
			shouldPlaceChatPetSpeechBubbleLeft('yappingMouthOpen', 981, 1000),
		], [
			false,
			true,
			false,
			false,
		]);
	});

	test('keeps wide sprites within the input without changing direction', () => {
		assert.deepStrictEqual([
			getChatPetWideSpriteHorizontalOffset('sleep', 'right', 932, 980, 0, 1000),
			getChatPetWideSpriteHorizontalOffset('waking', 'left', 20, 68, 0, 1000),
			getChatPetWideSpriteHorizontalOffset('typing', 'right', 915, 963, 0, 1000),
			getChatPetWideSpriteHorizontalOffset('typing', 'right', 917, 965, 0, 1000),
			getChatPetWideSpriteHorizontalOffset('buttonPress', 'right', 921, 969, 0, 1000),
			getChatPetWideSpriteHorizontalOffset('sing', 'right', 919, 967, 0, 1000),
			getChatPetWideSpriteHorizontalOffset('typing', 'left', 37, 85, 0, 1000),
			getChatPetWideSpriteHorizontalOffset('typing', 'left', 35, 83, 0, 1000),
			getChatPetWideSpriteHorizontalOffset('typing', 'right', 882, 978, 0, 1048, 2),
			getChatPetWideSpriteHorizontalOffset('idle', 'right', 952, 1000, 0, 1000),
		], [
			0,
			0,
			0,
			-1,
			-1,
			-1,
			0,
			1,
			-1,
			0,
		]);
	});

	test('applies wide sprite correction to body, eyes, and eye accessory together', () => {
		const layers = [
			mainWindow.document.createElement('div'),
			mainWindow.document.createElement('div'),
			mainWindow.document.createElement('div'),
		];
		setChatPetWideLayerOffset(-36, layers);
		const shifted = layers.map(layer => layer.style.translate);
		setChatPetWideLayerOffset(0, layers);

		assert.deepStrictEqual({
			shifted,
			reset: layers.map(layer => layer.style.translate),
		}, {
			shifted: ['-36px', '-36px', '-36px'],
			reset: ['', '', ''],
		});
	});

});
