/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatPetService, getChatPetVariant } from '../../../browser/chatPetService.js';
import { CHAT_PET_IDLE_SLEEP_DELAY, doesChatPetStateTrackCursor, getChatPetAnimationFrame, getChatPetBaseState, getChatPetBuddyName, getChatPetClickInteraction, getChatPetDefaultHorizontalPosition, getChatPetDragPosition, getChatPetFallDuration, getChatPetFallTarget, getChatPetFrameDurations, getChatPetGazeDirection, getChatPetHorizontalPosition, getChatPetRenderedState, getChatPetScale, getChatPetSpeechFrameDurations, getChatPetSpriteName, getChatPetVerticalOffset, isChatPetImageSource, isChatPetVisible, shouldFlipChatPetWideSprite, shouldPlaceChatPetSpeechBubbleLeft } from '../../../browser/widget/chatPetWidget.js';

suite('ChatPetWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestTelemetryService extends NullTelemetryServiceShape {
		readonly events: { readonly name: string; readonly data: unknown }[] = [];

		override publicLog2(eventName?: string, data?: unknown): void {
			if (eventName) {
				this.events.push({ name: eventName, data });
			}
		}
	}

	test('maps chat activity to pet states by priority', () => {
		assert.deepStrictEqual([
			getChatPetBaseState(false, false, false, false),
			getChatPetBaseState(false, false, false, true),
			getChatPetBaseState(false, false, true, false),
			getChatPetBaseState(false, false, true, true),
			getChatPetBaseState(true, false, true, true),
			getChatPetBaseState(true, true, true, true),
		], [
			'idle',
			'sleep',
			'typing',
			'sleep',
			'rendering',
			'clapping',
		]);
	});

	test('only shows in the latest focused chat widget when enabled', () => {
		assert.deepStrictEqual([
			isChatPetVisible(false, false),
			isChatPetVisible(false, true),
			isChatPetVisible(true, false),
			isChatPetVisible(true, true),
		], [
			false,
			false,
			false,
			true,
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

	test('includes button press among click interactions with a rare spin easter egg', () => {
		assert.deepStrictEqual([
			getChatPetClickInteraction(0),
			getChatPetClickInteraction(0.000_999),
			getChatPetClickInteraction(0.001),
			getChatPetClickInteraction(0.201),
			getChatPetClickInteraction(0.401),
			getChatPetClickInteraction(0.601),
			getChatPetClickInteraction(0.801),
			getChatPetClickInteraction(0.5),
			getChatPetClickInteraction(0.99),
			getChatPetClickInteraction(0.001, 'buttonPress'),
			getChatPetClickInteraction(0.99, 'yapping'),
		], [
			'complete',
			'complete',
			'buttonPress',
			'love',
			'jump',
			'cool',
			'yapping',
			'jump',
			'yapping',
			'love',
			'cool',
		]);
	});

	test('disables cursor tracking for fixed-eye sprite states', () => {
		assert.deepStrictEqual([
			doesChatPetStateTrackCursor('idle'),
			doesChatPetStateTrackCursor('sleep'),
			doesChatPetStateTrackCursor('waking'),
			doesChatPetStateTrackCursor('typing'),
			doesChatPetStateTrackCursor('rendering'),
			doesChatPetStateTrackCursor('buttonPress'),
			doesChatPetStateTrackCursor('complete'),
			doesChatPetStateTrackCursor('love'),
			doesChatPetStateTrackCursor('cool'),
			doesChatPetStateTrackCursor('yapping'),
			doesChatPetStateTrackCursor('yappingMouthOpen'),
			doesChatPetStateTrackCursor('falling'),
			doesChatPetStateTrackCursor('splat'),
			doesChatPetStateTrackCursor('onTheRun'),
			doesChatPetStateTrackCursor('searching'),
		], [
			true,
			false,
			false,
			false,
			true,
			false,
			false,
			false,
			false,
			true,
			false,
			false,
			false,
			false,
			false,
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
			getChatPetSpriteName('falling', 'stable'),
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
			'buddy-falling-stable',
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
			getChatPetFrameDurations('searching'),
			getChatPetFrameDurations('yapping'),
			getChatPetFrameDurations('yappingMouthOpen'),
			getChatPetFrameDurations('falling'),
			getChatPetFrameDurations('splat'),
			getChatPetSpeechFrameDurations(),
		], [
			Array.from({ length: 50 }, () => 40),
			Array.from({ length: 8 }, () => 300),
			[160, 100, 80, 90, 90, 90, 100, 170],
			[400, 600],
			Array.from({ length: 50 }, () => 40),
			[500, 300, 350, 250, 450, 1_000],
			[80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80],
			[200, 200, 380, 100, 80, 1_980],
			[600, 120, 120, 120, 160, 80, 80, 80, 1_640],
			[500, 500, 500, 500],
			[],
			[],
			Array.from({ length: 4 }, () => 120),
			[120, 100, 100, 200],
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

	test('lands on the input only when dropped above its horizontal span', () => {
		assert.deepStrictEqual([
			getChatPetFallTarget(50, 20, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(0, 20, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 152, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 190, 48, 48, 40, 200, 200, 400),
			getChatPetFallTarget(50, 220, 48, 48, 40, 200, 200, 400),
		], [
			{ top: 152, landsOnPlatform: true },
			{ top: 400, landsOnPlatform: false },
			{ top: 152, landsOnPlatform: true },
			{ top: 400, landsOnPlatform: false },
			{ top: 400, landsOnPlatform: false },
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

	test('flips wide action sprites before they cross the input edge', () => {
		assert.deepStrictEqual([
			shouldFlipChatPetWideSprite('typing', 963, 1000),
			shouldFlipChatPetWideSprite('typing', 965, 1000),
			shouldFlipChatPetWideSprite('buttonPress', 967, 1000),
			shouldFlipChatPetWideSprite('buttonPress', 969, 1000),
			shouldFlipChatPetWideSprite('idle', 1000, 1000),
		], [
			false,
			true,
			false,
			true,
			false,
		]);
	});
});
