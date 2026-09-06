/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSpeechToTextState } from '../../browser/speechToText/chatSpeechToTextService.js';
import { easeDictationMicLevel, getDictationMicGlowPhase, shapeDictationMicLevel } from '../../browser/speechToText/dictationMicGlow.js';

suite('DictationMicGlow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recording glows, transcribing winds down, and preparing suppresses the glow', () => {
		const states = [ChatSpeechToTextState.Idle, ChatSpeechToTextState.Recording, ChatSpeechToTextState.Transcribing];
		assert.deepStrictEqual(
			{
				ready: states.map(state => getDictationMicGlowPhase(state, false)),
				preparing: states.map(state => getDictationMicGlowPhase(state, true)),
			},
			{
				ready: ['off', 'live', 'settling'],
				preparing: ['off', 'off', 'off'],
			}
		);
	});

	test('the level swells faster than it drifts back, so speech reads as ambient', () => {
		const rose = easeDictationMicLevel(0, 1);
		const fell = 1 - easeDictationMicLevel(1, 0);
		assert.deepStrictEqual(
			{ rose: Number(rose.toFixed(3)), fell: Number(fell.toFixed(3)), releaseIsSlower: fell < rose },
			{ rose: 0.1, fell: 0.035, releaseIsSlower: true }
		);
	});

	test('the level is lifted at the quiet end and clamped at both ends', () => {
		assert.deepStrictEqual(
			[0, 0.25, 1, 1.5, -1].map(l => Number(shapeDictationMicLevel(l).toFixed(3))),
			[0, 0.436, 1, 1, 0]
		);
	});
});
