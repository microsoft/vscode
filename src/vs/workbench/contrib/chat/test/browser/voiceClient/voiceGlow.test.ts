/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../../../platform/theme/common/themeService.js';
import { chatDictationActiveMicGlow, chatVoiceGlowBaseColor, chatVoiceSpeakingGlow } from '../../../common/widget/chatColors.js';
import { resolveDictationMicAccent } from '../../../browser/speechToText/dictationMicGlow.js';
import { isGlowingVoiceState, GlowThemeKind, resolveVoiceGlowColors, resolveVoiceRimAccent, VOICE_GLOW_SPEAKING_HUE_SHIFT } from '../../../browser/voiceClient/voiceGlow.js';

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

	test('the dictation microphone paints the listening rim color', () => {
		// Two things must hold: the tuning itself (hue nudge, saturation floor,
		// per-theme lightness) and the fact that dictation and Voice Mode arrive
		// at it from their own tokens. Snapshotting the resolved values pins the
		// former — comparing the two paths alone would cancel it out.
		const base = Color.fromHex('#58A6FF');
		// Deliberately under the saturation floor, so the clamp is exercised.
		const washedOut = Color.fromHex('#7A8B99');
		const theme = (type: ColorScheme, accent: Color) => ({
			type,
			getColor: (id: string) => id === chatVoiceGlowBaseColor || id === chatDictationActiveMicGlow ? accent : undefined,
		});
		const resolve = (type: ColorScheme, kind: GlowThemeKind, accent: Color) => {
			const scheme = theme(type, accent);
			const format = (color: Color) => {
				const rim = resolveVoiceRimAccent(color, 'cool', kind);
				return `${rim.hue.toFixed(1)} ${rim.saturation}% ${rim.lightness}%`;
			};
			return {
				mic: format(resolveDictationMicAccent(scheme as IColorTheme)!),
				voiceMode: format(resolveVoiceGlowColors(scheme).listening),
			};
		};

		assert.deepStrictEqual(
			{
				dark: resolve(ColorScheme.DARK, 'dark', base),
				light: resolve(ColorScheme.LIGHT, 'light', base),
				washedOut: resolve(ColorScheme.DARK, 'dark', washedOut),
			},
			{
				dark: { mic: '202.0 96% 56%', voiceMode: '202.0 96% 56%' },
				light: { mic: '202.0 96% 72%', voiceMode: '202.0 96% 72%' },
				washedOut: { mic: '197.0 70% 56%', voiceMode: '197.0 70% 56%' },
			}
		);
	});
});
