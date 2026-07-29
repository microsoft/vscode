/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared, theme-aware glow math for voice-mode input decorations. The main
 * window's `ChatViewPane` and the Agents window surfaces render an identical
 * glow; this is the single source of truth for the easy-to-drift intensity,
 * color and box-shadow math. Callers own their own animation loop, target, and
 * gating (see `voiceGlowRenderer.ts` for the DOM applier that consumes these).
 *
 * This module is intentionally pure (no DOM / CSS imports) so it stays unit
 * testable.
 */

import { Color, HSLA } from '../../../../../base/common/color.js';
import { focusBorder } from '../../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme } from '../../../../../platform/theme/common/themeService.js';
import { chatVoiceGlowBaseColor, chatVoiceListeningGlow, chatVoiceProcessingGlow, chatVoiceSpeakingGlow } from '../../common/widget/chatColors.js';

export type VoiceGlowState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

/**
 * The two ambient-glow designs. `aurora` is a soft breathing box-shadow wash;
 * `beam` is a traveling comet that re-tints the same border-beam language used by
 * the working/progress ring. Both are theme-aware and handle every glowing state.
 */
export type VoiceAnimationVariation = 'aurora' | 'beam';

/**
 * Glow states that actually render a border/box-shadow. Connected-idle voice
 * mode deliberately renders NO glow, so callers gate their animation loop on
 * these states only. `processing` bridges listening -> speaking so the glow
 * never snaps off while the agent is thinking (it often overlaps the working
 * comet then).
 */
export function isGlowingVoiceState(voiceState: VoiceGlowState): boolean {
	return voiceState === 'listening' || voiceState === 'processing' || voiceState === 'speaking';
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

/** Resolved base RGB triple ("r,g,b") for each glowing voice state. */
export interface IVoiceGlowColors {
	readonly listening: string;
	readonly processing: string;
	readonly speaking: string;
}

/**
 * Hue rotation (degrees) applied to the base accent for each state, so the three
 * states read as a related-but-distinct triad from whatever accent the theme
 * uses. Exported so they can be tuned in one place.
 */
export const VOICE_GLOW_PROCESSING_HUE_SHIFT = -46;
export const VOICE_GLOW_SPEAKING_HUE_SHIFT = 38;

/**
 * Fallback colors matching the historical hardcoded glow (blue listening /
 * purple speaking) plus a teal processing hue, used when no theme is available
 * (unit tests) or before colors are resolved.
 */
export const DEFAULT_VOICE_GLOW_COLORS: IVoiceGlowColors = {
	listening: '88,166,255',
	processing: '86,214,196',
	speaking: '163,113,247',
};

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function rgbTriple(color: Color): string {
	const { r, g, b } = color.rgba;
	return `${r},${g},${b}`;
}

function shiftHue(base: Color, degrees: number, saturationMul: number = 1, lightnessAdd: number = 0): Color {
	const hsla = base.hsla;
	return new Color(new HSLA((hsla.h + degrees + 360) % 360, clamp01(hsla.s * saturationMul), clamp01(hsla.l + lightnessAdd), 1));
}

/**
 * Resolve the per-state glow colors from the active theme. Each state derives
 * from `chat.voiceGlowBaseColor` (default `focusBorder`) by hue-shifting, unless
 * the theme explicitly sets that state's token, so the glow always harmonizes
 * with the theme while staying overridable.
 */
export function resolveVoiceGlowColors(theme: Pick<IColorTheme, 'getColor'>): IVoiceGlowColors {
	const base = theme.getColor(chatVoiceGlowBaseColor) ?? theme.getColor(focusBorder) ?? Color.fromHex('#58A6FF');
	const listening = theme.getColor(chatVoiceListeningGlow) ?? base;
	const processing = theme.getColor(chatVoiceProcessingGlow) ?? shiftHue(base, VOICE_GLOW_PROCESSING_HUE_SHIFT, 0.85, 0.04);
	const speaking = theme.getColor(chatVoiceSpeakingGlow) ?? shiftHue(base, VOICE_GLOW_SPEAKING_HUE_SHIFT);
	return {
		listening: rgbTriple(listening),
		processing: rgbTriple(processing),
		speaking: rgbTriple(speaking),
	};
}

/** The RGB triple for the current state (idle/error fall back to listening). */
export function voiceGlowStateRgb(voiceState: VoiceGlowState, colors: IVoiceGlowColors): string {
	switch (voiceState) {
		case 'speaking': return colors.speaking;
		case 'processing': return colors.processing;
		default: return colors.listening;
	}
}

// --- Aurora (ambient box-shadow wash) ------------------------------------

export interface IVoiceGlowStyle {
	readonly borderColor: string;
	readonly boxShadow: string;
}

/**
 * Compute the Aurora glow border color and box-shadow for the given state and
 * audio intensity. The glow is intentionally subtle; the listening glow is a
 * little stronger when the transcript is hidden. Connected-idle voice mode
 * renders no glow and never reaches this function.
 */
export function computeVoiceGlowStyle(voiceState: VoiceGlowState, intensity: number, transcriptHidden: boolean, colors: IVoiceGlowColors = DEFAULT_VOICE_GLOW_COLORS): IVoiceGlowStyle {
	const rgb = voiceGlowStateRgb(voiceState, colors);
	const flashy = voiceState === 'listening' && transcriptHidden;
	let borderAlpha: number;
	let shadowSpread: number;
	let shadowAlpha: number;
	if (flashy) {
		// Slightly stronger audio-reactive glow while listening with no transcript visible.
		borderAlpha = 0.4 + intensity * 0.3;
		shadowSpread = 4 + intensity * 10;
		shadowAlpha = 0.15 + intensity * 0.3;
	} else {
		// Standard subtle glow (transcript visible, processing breath, or TTS playback).
		borderAlpha = 0.3 + intensity * 0.3;
		shadowSpread = 3 + intensity * 6;
		shadowAlpha = 0.1 + intensity * 0.2;
	}
	const borderColor = `rgba(${rgb},${borderAlpha})`;
	const boxShadow = `0 0 ${shadowSpread}px rgba(${rgb},${shadowAlpha}), inset 0 0 ${shadowSpread * 0.4}px rgba(${rgb},${shadowAlpha * 0.3})`;
	return { borderColor, boxShadow };
}

// --- Beam (traveling comet) ----------------------------------------------

export interface IVoiceBeamStyle {
	/** CSS color for the comet head, e.g. `rgb(88,166,255)`. */
	readonly color: string;
	/** Overall ring opacity, [0, 1]. */
	readonly opacity: number;
	/** Seconds for one full lap of the perimeter. */
	readonly durationSeconds: number;
}

/**
 * Compute the Beam variation's comet color/opacity/speed for the given state.
 * Listening and speaking track the audio level through brightness (opacity);
 * processing travels slowly and a touch dimmer so it reads as a calm "thinking"
 * loop that composes with the working comet rather than racing it. Duration is
 * state-based (not audio-reactive) because CSS caches `animation-duration` at
 * start time, so it must not change every frame.
 */
export function computeVoiceBeamStyle(voiceState: VoiceGlowState, intensity: number, colors: IVoiceGlowColors = DEFAULT_VOICE_GLOW_COLORS): IVoiceBeamStyle {
	const rgb = voiceGlowStateRgb(voiceState, colors);
	if (voiceState === 'processing') {
		return { color: `rgb(${rgb})`, opacity: 0.45 + intensity * 0.2, durationSeconds: 3.2 };
	}
	return {
		color: `rgb(${rgb})`,
		opacity: Math.min(1, 0.6 + intensity * 0.35),
		durationSeconds: 2,
	};
}

/**
 * Box-shadow for a voice mic/icon button glow, shared by surfaces that light up
 * the microphone glyph in addition to the input border.
 */
export function computeVoiceMicGlowBoxShadow(voiceState: VoiceGlowState, intensity: number, colors: IVoiceGlowColors = DEFAULT_VOICE_GLOW_COLORS): string {
	const rgb = voiceGlowStateRgb(voiceState, colors);
	const shadowSpread = 3 + intensity * 8;
	const shadowAlpha = 0.2 + intensity * 0.45;
	return `0 0 ${shadowSpread}px rgba(${rgb},${shadowAlpha})`;
}
