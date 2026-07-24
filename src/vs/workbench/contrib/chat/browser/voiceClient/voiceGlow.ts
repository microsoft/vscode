/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared audio-reactive glow math for voice-mode input decorations. The main
 * window's `ChatViewPane` and the Agents window surfaces render an identical
 * glow; this is the single source of truth for the easy-to-drift intensity and
 * box-shadow math. Callers own their own animation loop, target, and gating.
 */

export type VoiceGlowState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

/**
 * Glow states that actually render a border/box-shadow. Connected-idle voice
 * mode deliberately renders NO glow, so callers gate their animation loop on
 * these states only.
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

export interface IVoiceGlowStyle {
	readonly borderColor: string;
	readonly boxShadow: string;
}

/**
 * Compute the glow border color and box-shadow. Blue while listening and purple
 * while speaking. Connected-idle voice mode renders no glow and never reaches
 * this function.
 */
export function computeVoiceGlowStyle(voiceState: VoiceGlowState, intensity: number, transcriptHidden: boolean): IVoiceGlowStyle {
	// Blue when listening, purple when speaking.
	const rgb = voiceState === 'speaking' ? '163,113,247' : '88,166,255';
	const emphasized = voiceState === 'listening' && transcriptHidden;
	const borderAlpha = (emphasized ? 0.35 : 0.3) + intensity * (emphasized ? 0.25 : 0.2);
	const shadowSpread = (emphasized ? 3 : 2) + intensity * (emphasized ? 6 : 4);
	const shadowAlpha = (emphasized ? 0.08 : 0.06) + intensity * (emphasized ? 0.14 : 0.12);
	const borderColor = `rgba(${rgb},${borderAlpha})`;
	const boxShadow = `0 0 ${shadowSpread}px rgba(${rgb},${shadowAlpha})`;
	return { borderColor, boxShadow };
}
