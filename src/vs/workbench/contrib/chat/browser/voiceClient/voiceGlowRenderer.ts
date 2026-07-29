/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/voiceGlow.css';
import { $ } from '../../../../../base/browser/dom.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { computeVoiceBeamStyle, computeVoiceGlowStyle, IVoiceGlowColors, VoiceAnimationVariation, VoiceGlowState, voiceGlowStateRgb } from './voiceGlow.js';

/** Steady intensity used when motion is reduced, so the glow is present but static. */
const REDUCED_MOTION_INTENSITY = 0.4;

export interface IVoiceGlowRenderParams {
	readonly voiceState: VoiceGlowState;
	/** Normalized audio (or synthesized breathing) intensity, [0, 1]. */
	readonly intensity: number;
	readonly transcriptHidden: boolean;
	readonly variation: VoiceAnimationVariation;
	readonly colors: IVoiceGlowColors;
	readonly reducedMotion: boolean;
}

/**
 * Applies the shared Voice Mode glow to a single input container: toggles the
 * state/variation classes, publishes the theme-derived `--voice-glow-rgb` so
 * descendants (the mic glyph) can match, and renders either the Aurora wash
 * (inline box-shadow) or the Beam comet (a dedicated overlay child, so it never
 * collides with the container's own working-comet pseudo-elements).
 */
export interface IVoiceGlowRenderer extends IDisposable {
	render(params: IVoiceGlowRenderParams): void;
	clear(): void;
}

export function createVoiceGlowRenderer(target: HTMLElement): IVoiceGlowRenderer {
	let beamOverlay: HTMLElement | undefined;
	let currentBeamDuration = '';

	const ensureBeamOverlay = (): HTMLElement => {
		if (!beamOverlay) {
			beamOverlay = $('.voice-beam-overlay');
			target.appendChild(beamOverlay);
		}
		return beamOverlay;
	};

	const hideBeamOverlay = (): void => {
		if (beamOverlay) {
			beamOverlay.style.setProperty('--voice-beam-opacity', '0');
		}
	};

	const render = (params: IVoiceGlowRenderParams): void => {
		const { voiceState, transcriptHidden, variation, colors, reducedMotion } = params;
		target.classList.add('voice-active');
		target.classList.toggle('voice-listening', voiceState === 'listening');
		target.classList.toggle('voice-processing', voiceState === 'processing');
		target.classList.toggle('voice-speaking', voiceState === 'speaking');
		target.classList.toggle('voice-variation-beam', variation === 'beam');
		target.classList.toggle('voice-variation-aurora', variation !== 'beam');
		target.style.setProperty('--voice-glow-rgb', voiceGlowStateRgb(voiceState, colors));

		// Reduced motion: a steady wash with no travel or pulse, regardless of variation.
		if (reducedMotion) {
			hideBeamOverlay();
			const { borderColor, boxShadow } = computeVoiceGlowStyle(voiceState, REDUCED_MOTION_INTENSITY, transcriptHidden, colors);
			target.style.borderColor = borderColor;
			target.style.boxShadow = boxShadow;
			return;
		}

		if (variation === 'beam') {
			const overlay = ensureBeamOverlay();
			const beam = computeVoiceBeamStyle(voiceState, params.intensity, colors);
			overlay.style.setProperty('--voice-beam-color', beam.color);
			overlay.style.setProperty('--voice-beam-opacity', beam.opacity.toFixed(3));
			// Duration is only set on change: browsers cache animation-duration at
			// start time, and re-setting it every frame would restart the spin.
			const duration = `${beam.durationSeconds}s`;
			if (duration !== currentBeamDuration) {
				overlay.style.setProperty('--voice-beam-duration', duration);
				currentBeamDuration = duration;
			}
			// A faint persistent border keeps the input boundary visible behind the comet.
			target.style.borderColor = `rgba(${voiceGlowStateRgb(voiceState, colors)},0.35)`;
			target.style.boxShadow = '';
		} else {
			hideBeamOverlay();
			const { borderColor, boxShadow } = computeVoiceGlowStyle(voiceState, params.intensity, transcriptHidden, colors);
			target.style.borderColor = borderColor;
			target.style.boxShadow = boxShadow;
		}
	};

	const clear = (): void => {
		target.classList.remove('voice-active', 'voice-listening', 'voice-processing', 'voice-speaking', 'voice-variation-aurora', 'voice-variation-beam');
		target.style.borderColor = '';
		target.style.boxShadow = '';
		target.style.removeProperty('--voice-glow-rgb');
		hideBeamOverlay();
		currentBeamDuration = '';
	};

	return {
		render,
		clear,
		dispose: (): void => {
			clear();
			beamOverlay?.remove();
			beamOverlay = undefined;
		},
	};
}
