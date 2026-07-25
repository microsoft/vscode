/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { doesChatPetStateTrackCursor, getChatPetBaseState, getChatPetBuddyName, getChatPetClickInteraction, getChatPetGazeDirection, getChatPetHorizontalPosition, getChatPetSpriteName } from '../../../browser/widget/chatPetWidget.js';

suite('ChatPetWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps chat activity to pet states by priority', () => {
		assert.deepStrictEqual([
			getChatPetBaseState(false, false, false),
			getChatPetBaseState(false, false, true),
			getChatPetBaseState(true, false, true),
			getChatPetBaseState(true, true, true),
		], [
			'idle',
			'sleep',
			'processing',
			'clapping',
		]);
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

	test('maps random values to click interactions', () => {
		assert.deepStrictEqual([
			getChatPetClickInteraction(0),
			getChatPetClickInteraction(0.32),
			getChatPetClickInteraction(0.34),
			getChatPetClickInteraction(0.66),
			getChatPetClickInteraction(0.67),
			getChatPetClickInteraction(0.99),
		], [
			'love',
			'love',
			'jump',
			'jump',
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
			getChatPetClickInteraction(0, 'yapping'),
			getChatPetClickInteraction(0.99, 'yapping'),
		], [
			'jump',
			'yapping',
			'love',
			'yapping',
			'love',
			'jump',
		]);
	});

	test('disables cursor tracking for fixed-eye sprite states', () => {
		assert.deepStrictEqual([
			doesChatPetStateTrackCursor('idle'),
			doesChatPetStateTrackCursor('complete'),
			doesChatPetStateTrackCursor('love'),
			doesChatPetStateTrackCursor('yapping'),
			doesChatPetStateTrackCursor('yappingMouthOpen'),
		], [
			true,
			false,
			false,
			true,
			false,
		]);
	});

	test('keeps automatic completion separate from the yapping sprite', () => {
		assert.deepStrictEqual([
			getChatPetSpriteName('complete', 'insider'),
			getChatPetSpriteName('yappingMouthOpen', 'insider'),
		], [
			'buddy-idle-insiders',
			'buddy-yapping-insiders',
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
