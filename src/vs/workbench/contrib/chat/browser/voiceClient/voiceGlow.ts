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
 * Compute the glow border color and box-shadow. Blue while listening (flashier
 * when the transcript is hidden), purple while speaking.
 */
export function computeVoiceGlowStyle(voiceState: VoiceGlowState, intensity: number, transcriptHidden: boolean): IVoiceGlowStyle {
	// Blue when listening, purple when speaking.
	const rgb = voiceState === 'speaking' ? '163,113,247' : '88,166,255';
	const flashy = voiceState === 'listening' && transcriptHidden;
	let borderAlpha: number;
	let shadowSpread: number;
	let shadowAlpha: number;
	if (flashy) {
		// Flashy audio-reactive glow while speaking with no transcript visible.
		borderAlpha = 0.6 + intensity * 0.4;
		shadowSpread = 6 + intensity * 20;
		shadowAlpha = 0.25 + intensity * 0.55;
	} else {
		// Standard glow (transcript visible or TTS playback).
		borderAlpha = 0.4 + intensity * 0.5;
		shadowSpread = 4 + intensity * 12;
		shadowAlpha = 0.15 + intensity * 0.35;
	}
	const borderColor = `rgba(${rgb},${borderAlpha})`;
	const boxShadow = flashy
		// Double-layer glow for extra presence when listening without transcript.
		? `0 0 ${shadowSpread}px rgba(${rgb},${shadowAlpha}), 0 0 ${shadowSpread * 2}px rgba(${rgb},${shadowAlpha * 0.3}), inset 0 0 ${shadowSpread * 0.5}px rgba(${rgb},${shadowAlpha * 0.4})`
		: `0 0 ${shadowSpread}px rgba(${rgb},${shadowAlpha}), inset 0 0 ${shadowSpread * 0.4}px rgba(${rgb},${shadowAlpha * 0.3})`;
	return { borderColor, boxShadow };
}
