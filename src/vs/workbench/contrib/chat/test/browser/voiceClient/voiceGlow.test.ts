/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { chatVoiceGlowBaseColor, chatVoiceSpeakingGlow } from '../../../common/widget/chatColors.js';
import { isGlowingVoiceState, isIdleGlowVoiceState, resolveVoiceGlowColors, VOICE_GLOW_SPEAKING_HUE_SHIFT } from '../../../browser/voiceClient/voiceGlow.js';

suite('VoiceGlow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('every state maps to exactly one glow treatment', () => {
		const states = ['idle', 'listening', 'speaking', 'processing', 'error'] as const;
		assert.deepStrictEqual(
			states.map(state => ({ state, active: isGlowingVoiceState(state), idle: isIdleGlowVoiceState(state) })),
			[
				{ state: 'idle', active: false, idle: true },
				{ state: 'listening', active: true, idle: false },
				{ state: 'speaking', active: true, idle: false },
				{ state: 'processing', active: true, idle: false },
				{ state: 'error', active: false, idle: false },
			]
		);
	});

	test('derives the per-state accents from the theme base color', () => {
		const base = Color.fromHex('#58A6FF');
		const colors = resolveVoiceGlowColors({ getColor: id => id === chatVoiceGlowBaseColor ? base : undefined });
		assert.deepStrictEqual(
			{
				listening: colors.listening.toString(),
				speakingHue: Math.round(colors.speaking.hsla.h),
				processingHue: Math.round(colors.processing.hsla.h),
			},
			{
				listening: base.toString(),
				speakingHue: Math.round((base.hsla.h + VOICE_GLOW_SPEAKING_HUE_SHIFT + 360) % 360),
				// Thinking sits midway between the two, so it reads as a transition.
				processingHue: Math.round((base.hsla.h + VOICE_GLOW_SPEAKING_HUE_SHIFT / 2 + 360) % 360),
			}
		);
	});

	test('an explicitly themed state wins over the derived hue', () => {
		const pinned = Color.fromHex('#FF00AA');
		const colors = resolveVoiceGlowColors({
			getColor: id => id === chatVoiceGlowBaseColor ? Color.fromHex('#58A6FF') : id === chatVoiceSpeakingGlow ? pinned : undefined,
		});
		assert.strictEqual(colors.speaking.toString(), pinned.toString());
	});
});
