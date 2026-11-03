/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color, HSLA } from '../../../../../../base/common/color.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../../../platform/theme/common/themeService.js';
import { chatDictationActiveMicGlow, chatVoiceGlowBaseColor, chatVoiceListeningGlow, chatVoiceSpeakingGlow } from '../../../common/widget/chatColors.js';
import { resolveDictationMicAccent } from '../../../browser/speechToText/dictationMicGlow.js';
import { computeVoiceMicGlowBoxShadow, DEFAULT_VOICE_GLOW_COLORS, GlowThemeKind, resolveVoiceGlowColors, resolveVoiceRimAccent, shouldRenderVoiceInputGlow } from '../../../browser/voiceClient/voiceGlow.js';
import { createVoiceGlowController, createVoiceRimLight } from '../../../browser/voiceClient/voiceGlowController.js';

suite('VoiceGlow', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('only renders on the active owner while Voice Mode is connected', () => {
		assert.deepStrictEqual([
			shouldRenderVoiceInputGlow(false, true, true),
			shouldRenderVoiceInputGlow(true, true, true),
			shouldRenderVoiceInputGlow(true, false, true),
			shouldRenderVoiceInputGlow(true, true, false),
		], [false, true, false, false]);
	});

	test('keeps the listening rim mounted until cleared', () => {
		const target = document.createElement('div');
		const colors = resolveVoiceGlowColors({ getColor: () => undefined });
		const controller = disposables.add(createVoiceGlowController(target, () => 'dark', () => colors));
		controller.render(0.3, true);
		const rim = target.querySelector('.voice-glow-rim-cool');
		controller.render(0.8, true);
		const beforeClear = {
			sameRim: rim === target.querySelector('.voice-glow-rim-cool'),
			active: target.classList.contains('voice-active'),
			listening: target.classList.contains('voice-listening'),
			warmRims: target.querySelectorAll('.voice-glow-rim-warm').length,
			micShadow: computeVoiceMicGlowBoxShadow(0, colors),
		};
		controller.clear();
		assert.deepStrictEqual({
			...beforeClear,
			activeAfterClear: target.classList.contains('voice-active'),
		}, {
			sameRim: true,
			active: true,
			listening: true,
			warmRims: 0,
			micShadow: '0 0 3px rgba(88,166,255,0.2)',
			activeAfterClear: false,
		});
	});

	test('clears legacy voice classes with or without an active rim', () => {
		const snapshots = [false, true].map(active => {
			const target = document.createElement('div');
			target.classList.add('unrelated', 'voice-active', 'voice-listening', 'voice-processing', 'voice-speaking');
			const controller = disposables.add(createVoiceGlowController(target));
			if (active) {
				controller.render(0.5, true);
			}
			controller.clear();
			return { classes: target.className, accent: target.style.getPropertyValue('--voice-accent') };
		});
		assert.deepStrictEqual(snapshots, [
			{ classes: 'unrelated', accent: '' },
			{ classes: 'unrelated', accent: '' },
		]);
	});

	test('renders in an auxiliary owner document', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));

		const auxiliaryDocument = iframe.contentDocument!;
		const target = auxiliaryDocument.createElement('div');
		auxiliaryDocument.body.appendChild(target);
		const createElement = auxiliaryDocument.createElement;
		auxiliaryDocument.createElement = () => {
			throw new Error('Not allowed to create elements in child window JavaScript context.');
		};
		disposables.add(toDisposable(() => auxiliaryDocument.createElement = createElement));

		const controller = disposables.add(createVoiceGlowController(target));
		controller.render(0.5, false);
		disposables.add(createVoiceRimLight(target, Color.fromHex('#58A6FF'), 'dark'));

		assert.deepStrictEqual({
			active: target.classList.contains('voice-active'),
			listening: target.classList.contains('voice-listening'),
			slots: target.querySelectorAll('.voice-glow-slot').length,
			inlineSlots: target.querySelectorAll('.voice-glow-slot-inline').length,
			layers: target.querySelectorAll('.voice-glow-rim-corners, .voice-glow-rim-bloom').length,
		}, {
			active: true,
			listening: true,
			slots: 3,
			inlineSlots: 1,
			layers: 4,
		});
	});

	test('listening and speaking share the blue accent', () => {
		const base = Color.fromHex('#58A6FF');
		const colors = resolveVoiceGlowColors({ getColor: id => id === chatVoiceGlowBaseColor ? base : undefined });
		assert.deepStrictEqual(
			{
				listening: colors.listening.toString(),
				speaking: colors.speaking.toString(),
				fallback: DEFAULT_VOICE_GLOW_COLORS.speaking.toString(),
			},
			{
				listening: base.toString(),
				speaking: base.toString(),
				fallback: base.toString(),
			}
		);
	});

	test('the listening theme override applies to speaking instead of the obsolete speaking override', () => {
		const pinned = Color.fromHex('#007ACC');
		const colors = resolveVoiceGlowColors({
			getColor: id => id === chatVoiceGlowBaseColor ? Color.fromHex('#58A6FF')
				: id === chatVoiceListeningGlow ? pinned
					: id === chatVoiceSpeakingGlow ? Color.fromHex('#A371F7') : undefined,
		});
		assert.deepStrictEqual(
			[colors.listening.toString(), colors.speaking.toString()],
			[pinned.toString(), pinned.toString()],
		);
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
				light: { mic: '202.0 41% 52%', voiceMode: '202.0 41% 52%' },
				washedOut: { mic: '197.0 70% 56%', voiceMode: '197.0 70% 56%' },
			}
		);
	});

	test('the active rim keeps non-text contrast against custom input backgrounds', () => {
		const accent = Color.fromHex('#7A8B99');
		for (const [kind, background] of [
			['light', Color.fromHex('#FAFAFA')],
			['dark', Color.fromHex('#242424')],
		] as const) {
			const rim = resolveVoiceRimAccent(accent, 'cool', kind, background);
			const rimColor = new Color(new HSLA(rim.hue, rim.saturation / 100, rim.lightness / 100, 1));
			assert.ok(background.getContrastRatio(rimColor) >= 3, `${kind} rim contrast was ${background.getContrastRatio(rimColor)}`);
		}
	});
});
