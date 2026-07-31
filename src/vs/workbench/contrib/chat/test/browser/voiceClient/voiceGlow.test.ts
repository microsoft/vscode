/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { chatVoiceGlowBaseColor, chatVoiceSpeakingGlow } from '../../../common/widget/chatColors.js';
import { isGlowingVoiceState, resolveVoiceGlowColors, VOICE_GLOW_SPEAKING_HUE_SHIFT } from '../../../browser/voiceClient/voiceGlow.js';

suite('VoiceGlow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('only the talking states glow', () => {
		const states = ['idle', 'listening', 'speaking', 'processing', 'error'] as const;
		assert.deepStrictEqual(
			states.filter(isGlowingVoiceState),
			['listening', 'speaking']
		);
	});

	test('derives the speaking accent from the theme base color', () => {
		const base = Color.fromHex('#58A6FF');
		const colors = resolveVoiceGlowColors({ getColor: id => id === chatVoiceGlowBaseColor ? base : undefined });
		assert.deepStrictEqual(
			{
				listening: colors.listening.toString(),
				speakingHue: Math.round(colors.speaking.hsla.h),
			},
			{
				listening: base.toString(),
				speakingHue: Math.round((base.hsla.h + VOICE_GLOW_SPEAKING_HUE_SHIFT + 360) % 360),
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
