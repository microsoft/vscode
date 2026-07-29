/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ColorIdentifier } from '../../../../../../platform/theme/common/colorRegistry.js';
import { chatVoiceGlowBaseColor, chatVoiceProcessingGlow } from '../../../common/widget/chatColors.js';
import { computeVoiceBeamStyle, computeVoiceGlowStyle, isGlowingVoiceState, resolveVoiceGlowColors } from '../../../browser/voiceClient/voiceGlow.js';

/** Minimal theme stub that resolves only the colors mapped in `overrides`. */
function fakeTheme(overrides: Map<ColorIdentifier, Color>): { getColor(id: ColorIdentifier): Color | undefined } {
	return { getColor: (id: ColorIdentifier) => overrides.get(id) };
}

suite('VoiceGlow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders a blue listening glow that intensifies with audio', () => {
		const listeningStyle = computeVoiceGlowStyle('listening', 0.5, false);
		assert.deepStrictEqual(
			{
				borderColor: listeningStyle.borderColor,
				boxShadow: listeningStyle.boxShadow,
			},
			{
				borderColor: 'rgba(88,166,255,0.44999999999999996)',
				boxShadow: '0 0 6px rgba(88,166,255,0.2), inset 0 0 2.4000000000000004px rgba(88,166,255,0.06)'
			}
		);
	});

	test('processing bridges listening and speaking; connected-idle renders no glow', () => {
		assert.deepStrictEqual(
			['idle', 'listening', 'processing', 'speaking', 'error'].map(isGlowingVoiceState as (s: string) => boolean),
			[false, true, true, true, false]
		);
	});

	test('glow uses the resolved per-state color', () => {
		const colors = { listening: '1,2,3', processing: '4,5,6', speaking: '7,8,9' };
		assert.deepStrictEqual(
			(['listening', 'processing', 'speaking'] as const).map(state => computeVoiceGlowStyle(state, 0, false, colors).borderColor),
			['rgba(1,2,3,0.3)', 'rgba(4,5,6,0.3)', 'rgba(7,8,9,0.3)']
		);
	});

	test('beam travels slower and dimmer while processing than while listening', () => {
		const colors = { listening: '1,2,3', processing: '4,5,6', speaking: '7,8,9' };
		assert.deepStrictEqual(
			{
				listening: computeVoiceBeamStyle('listening', 1, colors),
				processing: computeVoiceBeamStyle('processing', 1, colors),
			},
			{
				listening: { color: 'rgb(1,2,3)', opacity: 0.95, durationSeconds: 2 },
				processing: { color: 'rgb(4,5,6)', opacity: 0.65, durationSeconds: 3.2 },
			}
		);
	});

	test('colors derive a distinct triad from the theme accent and honor overrides', () => {
		const base = Color.fromHex('#3080ff'); // rgb(48,128,255)
		const derived = resolveVoiceGlowColors(fakeTheme(new Map([[chatVoiceGlowBaseColor, base]])));
		const overridden = resolveVoiceGlowColors(fakeTheme(new Map([
			[chatVoiceGlowBaseColor, base],
			[chatVoiceProcessingGlow, Color.fromHex('#112233')], // rgb(17,34,51)
		])));
		assert.deepStrictEqual(
			{
				listeningMatchesBase: derived.listening === '48,128,255',
				processingDiffersFromListening: derived.processing !== derived.listening,
				speakingDiffersFromListening: derived.speaking !== derived.listening,
				overrideApplied: overridden.processing === '17,34,51',
			},
			{
				listeningMatchesBase: true,
				processingDiffersFromListening: true,
				speakingDiffersFromListening: true,
				overrideApplied: true,
			}
		);
	});
});
