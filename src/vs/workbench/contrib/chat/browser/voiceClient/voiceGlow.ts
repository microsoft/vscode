/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared voice-mode glow helpers: the state model, the audio-intensity reducer,
 * the synthetic breathing curve, and the theme-derived accent colors. The DOM
 * applier that consumes these lives in `voiceGlowController.ts`; callers own
 * their own animation loop, target and gating.
 *
 * This module is intentionally pure (no DOM / CSS imports) so it stays unit
 * testable.
 */

import { Color, HSLA } from '../../../../../base/common/color.js';
import { IColorTheme } from '../../../../../platform/theme/common/themeService.js';
import { chatVoiceGlowBaseColor, chatVoiceListeningGlow, chatVoiceSpeakingGlow } from '../../common/widget/chatColors.js';

export type VoiceGlowState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

/**
 * Glow states that render the audio-reactive rim. Only the two talking states do:
 * connected-idle and thinking deliberately render nothing, so the glow means
 * "someone is talking" rather than "voice is on".
 */
export function isGlowingVoiceState(voiceState: VoiceGlowState): boolean {
	return voiceState === 'listening' || voiceState === 'speaking';
}

/**
 * Reduce an analyser's frequency data to a normalized [0, 1] intensity. Returns
 * a small resting value when no analyser is available (before capture/playback).
 * `dataArray` is a ref-cell reused across frames, lazily sized to the bin count.
 */
export function readVoiceGlowIntensity(analyser: AnalyserNode | null, dataArray: { value: Uint8Array | undefined }): number {
	if (!analyser) {
		return 0.3;
	}
	if (!dataArray.value || dataArray.value.length !== analyser.frequencyBinCount) {
		dataArray.value = new Uint8Array(analyser.frequencyBinCount);
	}
	analyser.getByteFrequencyData(dataArray.value as Uint8Array<ArrayBuffer>);
	let sum = 0;
	for (let i = 0; i < dataArray.value.length; i++) {
		sum += dataArray.value[i];
	}
	return Math.min(1, (sum / dataArray.value.length) / 80);
}

// --- Theme-derived colors ------------------------------------------------

/** Resolved base color for each voice state that carries an accent. */
export interface IVoiceGlowColors {
	readonly listening: Color;
	readonly speaking: Color;
}

/**
 * Hue rotation (degrees) applied to the base accent for speaking, so the two
 * talking states read as a related-but-distinct pair from whatever accent the
 * theme uses. Exported so it can be tuned in one place.
 */
export const VOICE_GLOW_SPEAKING_HUE_SHIFT = 80;

/** The historical hardcoded accent, used when no theme color resolves. */
const VOICE_GLOW_FALLBACK = Color.fromHex('#58A6FF');

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function shiftHue(base: Color, degrees: number, saturationMul: number = 1, lightnessAdd: number = 0): Color {
	const hsla = base.hsla;
	return new Color(new HSLA((hsla.h + degrees + 360) % 360, clamp01(hsla.s * saturationMul), clamp01(hsla.l + lightnessAdd), 1));
}

/**
 * Fallback colors matching the historical hardcoded glow (blue listening /
 * purple speaking), used when no theme is available (unit tests) or before
 * colors are resolved.
 */
export const DEFAULT_VOICE_GLOW_COLORS: IVoiceGlowColors = {
	listening: VOICE_GLOW_FALLBACK,
	speaking: shiftHue(VOICE_GLOW_FALLBACK, VOICE_GLOW_SPEAKING_HUE_SHIFT),
};

/**
 * Resolve the per-state glow colors from the active theme. Listening derives from
 * `chat.voiceGlowBaseColor` (default `focusBorder`) and speaking is hue-shifted
 * from it, unless the theme explicitly sets that state's token — so the glow
 * always harmonizes with the theme while staying overridable.
 */
export function resolveVoiceGlowColors(theme: Pick<IColorTheme, 'getColor'>): IVoiceGlowColors {
	const base = theme.getColor(chatVoiceGlowBaseColor) ?? VOICE_GLOW_FALLBACK;
	return {
		listening: theme.getColor(chatVoiceListeningGlow) ?? base,
		speaking: theme.getColor(chatVoiceSpeakingGlow) ?? shiftHue(base, VOICE_GLOW_SPEAKING_HUE_SHIFT),
	};
}

/**
 * The accent for the current state. Thinking and connected-idle render the same
 * calm, near-white light, which carries a whisper of the listening hue — so they
 * take the listening accent rather than one of their own.
 */
export function voiceGlowStateColor(voiceState: VoiceGlowState, colors: IVoiceGlowColors): Color {
	return voiceState === 'speaking' ? colors.speaking : colors.listening;
}

/**
 * Box-shadow for a voice mic/icon button glow, shared by surfaces that light up
 * the microphone glyph in addition to the input border.
 */
export function computeVoiceMicGlowBoxShadow(voiceState: VoiceGlowState, intensity: number, colors: IVoiceGlowColors = DEFAULT_VOICE_GLOW_COLORS): string {
	const { r, g, b } = voiceGlowStateColor(voiceState, colors).rgba;
	const shadowSpread = 3 + intensity * 8;
	const shadowAlpha = 0.2 + intensity * 0.45;
	return `0 0 ${shadowSpread}px rgba(${r},${g},${b},${shadowAlpha})`;
}

