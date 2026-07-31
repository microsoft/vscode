/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatPetService, getChatPetVariant } from '../../../browser/chatPetService.js';
import { CHAT_PET_IDLE_SLEEP_DELAY, doesChatPetStateTrackCursor, getChatPetAnimationFrame, getChatPetBaseState, getChatPetBuddyName, getChatPetClickInteraction, getChatPetFrameDurations, getChatPetGazeDirection, getChatPetHorizontalPosition, getChatPetRenderedState, getChatPetSpeechFrameDurations, getChatPetSpriteName, isChatPetImageSource, isChatPetVisible } from '../../../browser/widget/chatPetWidget.js';

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
		], [
			'rendering',
			'complete',
			'idle',
			'idle',
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

	test('maps random values to click interactions', () => {
		assert.deepStrictEqual([
			getChatPetClickInteraction(0),
			getChatPetClickInteraction(0.24),
			getChatPetClickInteraction(0.26),
			getChatPetClickInteraction(0.49),
			getChatPetClickInteraction(0.51),
			getChatPetClickInteraction(0.74),
			getChatPetClickInteraction(0.76),
			getChatPetClickInteraction(0.99),
		], [
			'love',
			'love',
			'jump',
			'jump',
			'cool',
			'cool',
			'yapping',
			'yapping',
		]);
	});

	test('does not repeat the previous click interaction', () => {
		assert.deepStrictEqual([
			getChatPetClickInteraction(0, 'love'),
			getChatPetClickInteraction(0.99, 'love'),
			getChatPetClickInteraction(0, 'jump'),
			getChatPetClickInteraction(0.99, 'jump'),
			getChatPetClickInteraction(0, 'cool'),
			getChatPetClickInteraction(0.99, 'cool'),
			getChatPetClickInteraction(0, 'yapping'),
			getChatPetClickInteraction(0.99, 'yapping'),
		], [
			'jump',
			'yapping',
			'love',
			'yapping',
			'love',
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
			doesChatPetStateTrackCursor('complete'),
			doesChatPetStateTrackCursor('love'),
			doesChatPetStateTrackCursor('cool'),
			doesChatPetStateTrackCursor('yapping'),
			doesChatPetStateTrackCursor('yappingMouthOpen'),
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
			true,
			false,
			false,
			false,
		]);
	});

	test('keeps automatic completion separate from the yapping sprite', () => {
		assert.deepStrictEqual([
			getChatPetSpriteName('complete', 'insider'),
			getChatPetSpriteName('sleep', 'insider'),
			getChatPetSpriteName('waking', 'stable'),
			getChatPetSpriteName('typing', 'insider'),
			getChatPetSpriteName('rendering', 'stable'),
			getChatPetSpriteName('cool', 'stable'),
			getChatPetSpriteName('searching', 'stable'),
			getChatPetSpriteName('yappingMouthOpen', 'insider'),
		], [
			'buddy-idle-insiders',
			'buddy-sleep-insiders',
			'buddy-waking-stable',
			'buddy-typing-insiders',
			'buddy-rendering-stable',
			'buddy-cool-stable',
			'buddy-search-stable',
			'buddy-yapping-insiders',
		]);
	});

	test('preserves the source animation timing', () => {
		assert.deepStrictEqual([
			getChatPetFrameDurations('idle'),
			getChatPetFrameDurations('sleep'),
			getChatPetFrameDurations('waking'),
			getChatPetFrameDurations('typing'),
			getChatPetFrameDurations('rendering'),
			getChatPetFrameDurations('clapping'),
			getChatPetFrameDurations('love'),
			getChatPetFrameDurations('cool'),
			getChatPetFrameDurations('searching'),
			getChatPetFrameDurations('yapping'),
			getChatPetFrameDurations('yappingMouthOpen'),
			getChatPetSpeechFrameDurations(),
		], [
			Array.from({ length: 50 }, () => 40),
			Array.from({ length: 8 }, () => 300),
			[160, 100, 80, 90, 90, 90, 100, 170],
			Array.from({ length: 8 }, () => 120),
			Array.from({ length: 50 }, () => 40),
			[80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80],
			[200, 200, 380, 100, 80, 1_980],
			[600, 120, 120, 120, 160, 80, 80, 80, 1_640],
			[500, 500, 500, 500],
			[],
			[300, 240, 1_500, 240, 360],
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
			{ frameIndex: 0, complete: false },
			{ frameIndex: 0, complete: false },
			{ frameIndex: 1, complete: false },
			{ frameIndex: 1, complete: false },
			{ frameIndex: 2, complete: false },
			{ frameIndex: 2, complete: false },
			{ frameIndex: 2, complete: true },
			{ frameIndex: 0, complete: false },
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
});
