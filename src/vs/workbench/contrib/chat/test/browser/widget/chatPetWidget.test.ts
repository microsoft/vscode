/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getChatPetBaseState, getChatPetBuddyName, getChatPetGazeDirection, getChatPetHorizontalPosition } from '../../../browser/widget/chatPetWidget.js';

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
