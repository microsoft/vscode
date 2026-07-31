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
import { chatVoiceGlowBaseColor, chatVoiceListeningGlow, chatVoiceProcessingGlow, chatVoiceSpeakingGlow } from '../../common/widget/chatColors.js';

export type VoiceGlowState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

/**
 * Glow states that render the audio-reactive rim. `processing` bridges
 * listening -> speaking with the travelling border so the glow never snaps off
 * while the agent is thinking. Connected-idle renders the calm idle rim breath
 * instead, which callers opt into separately via {@link isIdleGlowVoiceState}.
 */
export function isGlowingVoiceState(voiceState: VoiceGlowState): boolean {
	return voiceState === 'listening' || voiceState === 'processing' || voiceState === 'speaking';
}

/**
 * Whether `voiceState` renders the subtle connected-idle rim breath. Voice mode
 * being connected is what the breath communicates, so `error` renders nothing.
 */
export function isIdleGlowVoiceState(voiceState: VoiceGlowState): boolean {
	return voiceState === 'idle';
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

/**
 * A synthetic "breathing" intensity for states with no live audio to react to
 * (notably `processing`, where the mic is closed and TTS hasn't started). The
 * slow swell is what tells the user the turn is still alive. `timeMs` is any
 * monotonic clock (e.g. `Date.now()`).
 */
export function breathingIntensity(timeMs: number): number {
	const t = timeMs / 1000;
	// A slow primary breath with a gentle secondary wobble so it never reads as a
	// mechanical sine. Stays in a calm mid band (~0.25 - 0.7).
	return 0.28 + 0.24 * (0.5 - 0.5 * Math.cos(t * 1.9)) + 0.18 * Math.abs(Math.sin(t * 0.7 + 1));
}

// --- Theme-derived colors ------------------------------------------------

/** Resolved base color for each glowing voice state. */
export interface IVoiceGlowColors {
	readonly listening: Color;
	readonly processing: Color;
	readonly speaking: Color;
}

/**
 * Hue rotation (degrees) applied to the base accent for each state, so the three
 * states read as a related-but-distinct triad from whatever accent the theme
 * uses. Exported so they can be tuned in one place.
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
 * The hue midway between two colors, taking the shorter way around the wheel, so
 * blending (say) a blue and a violet never detours through green.
 */
function blendHues(a: Color, b: Color): number {
	const { h: ha } = a.hsla;
	const { h: hb } = b.hsla;
	const delta = ((hb - ha + 540) % 360) - 180;
	return (ha + delta / 2 + 360) % 360;
}

/**
 * The "thinking" accent: the midpoint of the listening and speaking hues, so the
 * state between the two reads as a mix of both rather than as its own color.
 */
function blendProcessing(listening: Color, speaking: Color): Color {
	const l = listening.hsla;
	const s = speaking.hsla;
	return new Color(new HSLA(blendHues(listening, speaking), clamp01((l.s + s.s) / 2), clamp01((l.l + s.l) / 2), 1));
}

/**
 * Fallback colors matching the historical hardcoded glow (blue listening /
 * purple speaking), used when no theme is available (unit tests) or before
 * colors are resolved.
 */
export const DEFAULT_VOICE_GLOW_COLORS: IVoiceGlowColors = (() => {
	const listening = VOICE_GLOW_FALLBACK;
	const speaking = shiftHue(VOICE_GLOW_FALLBACK, VOICE_GLOW_SPEAKING_HUE_SHIFT);
	return { listening, processing: blendProcessing(listening, speaking), speaking };
})();

/**
 * Resolve the per-state glow colors from the active theme. Listening derives from
 * `chat.voiceGlowBaseColor` (default `focusBorder`), speaking is hue-shifted from
 * it, and processing sits midway between the two — unless the theme explicitly
 * sets that state's token, so the glow always harmonizes with the theme while
 * staying overridable.
 */
export function resolveVoiceGlowColors(theme: Pick<IColorTheme, 'getColor'>): IVoiceGlowColors {
	const base = theme.getColor(chatVoiceGlowBaseColor) ?? VOICE_GLOW_FALLBACK;
	const listening = theme.getColor(chatVoiceListeningGlow) ?? base;
	const speaking = theme.getColor(chatVoiceSpeakingGlow) ?? shiftHue(base, VOICE_GLOW_SPEAKING_HUE_SHIFT);
	return {
		listening,
		processing: theme.getColor(chatVoiceProcessingGlow) ?? blendProcessing(listening, speaking),
		speaking,
	};
}

/** The accent for the current state (idle/error fall back to listening). */
export function voiceGlowStateColor(voiceState: VoiceGlowState, colors: IVoiceGlowColors): Color {
	switch (voiceState) {
		case 'speaking': return colors.speaking;
		case 'processing': return colors.processing;
		default: return colors.listening;
	}
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

