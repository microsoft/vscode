/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatPetService, getChatPetVariant } from '../../../browser/chatPetService.js';
import { CHAT_PET_CONFIRMATION_ATTENTION_DURATION, CHAT_PET_ICON_TRANSFORMATION_CHANCE, CHAT_PET_IDLE_SLEEP_DELAY, CHAT_PET_WALL_IMPACT_DURATION, CHAT_PET_YAPPING_CHANCE, ChatPetBlinkController, ChatPetDirectionChangeController, ChatPetFacingController, ChatPetHopController, advanceChatPetThrow, doesChatPetStateBlink, doesChatPetStateTrackCursor, getChatPetAnimationFrame, getChatPetBaseState, getChatPetBlinkDelay, getChatPetBuddyName, getChatPetClickInteraction, getChatPetDefaultHorizontalPosition, getChatPetDragPosition, getChatPetFallDuration, getChatPetFallTarget, getChatPetFrameDurations, getChatPetGazeDirection, getChatPetHorizontalPosition, getChatPetPlatformTop, getChatPetRelativeHorizontalPosition, getChatPetRenderedState, getChatPetRespawnFrameDurations, getChatPetRestoredHorizontalPosition, getChatPetScale, getChatPetSpeechFrameDurations, getChatPetSpriteName, getChatPetThrowLanding, getChatPetThrowRotation, getChatPetThrowVelocity, getChatPetVerticalOffset, getChatPetWallReboundVelocity, getChatPetWideSpriteHorizontalOffset, isChatPetImageSource, isChatPetKeyboardInteractionEnabled, isChatPetVisible, isChatPetWindowActive, shouldPlaceChatPetSpeechBubbleLeft, shouldReserveChatPetSpace, shouldSettleChatPetThrow } from '../../../browser/widget/chatPetWidget.js';

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

	test('only shows in the active window but reserves space in each window\'s latest focused chat', () => {
		assert.deepStrictEqual([
			{ visible: isChatPetVisible(false, false, false), spaceReserved: shouldReserveChatPetSpace(false, false) },
			{ visible: isChatPetVisible(false, true, true), spaceReserved: shouldReserveChatPetSpace(false, true) },
			{ visible: isChatPetVisible(true, false, true), spaceReserved: shouldReserveChatPetSpace(true, false) },
			{ visible: isChatPetVisible(true, true, false), spaceReserved: shouldReserveChatPetSpace(true, true) },
			{ visible: isChatPetVisible(true, true, true), spaceReserved: shouldReserveChatPetSpace(true, true) },
		], [
			{ visible: false, spaceReserved: false },
			{ visible: false, spaceReserved: false },
			{ visible: false, spaceReserved: false },
			{ visible: false, spaceReserved: true },
			{ visible: true, spaceReserved: true },
		]);
	});

	test('tracks the active renderer window independently from application focus', () => {
		assert.deepStrictEqual([
			isChatPetWindowActive(false, 1, 1),
			isChatPetWindowActive(true, 1, 1),
			isChatPetWindowActive(true, 2, 1),
			isChatPetWindowActive(true, 1, 2),
		], [
			false,
			true,
			false,
			false,
		]);
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
		const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), telemetryService));

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
		const firstWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService()));
		const secondWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService()));
		firstWindow.toggle();
		firstWindow.setScale(1.4);
		firstWindow.setHorizontalPosition(0.3);
		const dismissed = firstWindow.toggle();
		const restartedWindow = disposables.add(new ChatPetService(storageService, new TestTelemetryService()));

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
		], [
			{ top: 152, landsOnPlatform: true },
			{ top: 352, landsOnPlatform: false },
			{ top: 152, landsOnPlatform: true },
			{ top: 352, landsOnPlatform: false },
			{ top: 152, landsOnPlatform: true },
			{ top: 352, landsOnPlatform: false },
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

	test('ignores passive pills when choosing the active platform', () => {
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

});
