/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/dictationMicGlow.css';
import { getWindow } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { readVoiceGlowIntensity } from '../voiceClient/voiceGlow.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from './chatSpeechToTextService.js';

export type DictationMicGlowPhase = 'off' | 'live' | 'settling';

/** `off` while preparing too, so the glow doesn't compete with the download ring. */
export function getDictationMicGlowPhase(state: ChatSpeechToTextState, isPreparingModel: boolean): DictationMicGlowPhase {
	if (isPreparingModel || state === ChatSpeechToTextState.Idle) {
		return 'off';
	}
	return state === ChatSpeechToTextState.Recording ? 'live' : 'settling';
}

/**
 * Asymmetric, so the glow swells into speech but drifts back out of it. Tracking
 * the level symmetrically reads as a level meter rather than as ambient light.
 */
export function easeDictationMicLevel(current: number, target: number): number {
	return current + (target - current) * (target > current ? 0.1 : 0.035);
}

/** Lifts quiet speech and clamps loud speech, so the glow breathes rather than flashes. */
export function shapeDictationMicLevel(level: number): number {
	return Math.min(1, Math.pow(Math.min(1, Math.max(0, level)), 0.7) * 1.15);
}

/** Held while settling, and whenever no analyser is available. */
const RESTING_LEVEL = 0.12;

/** Held with reduced motion, so the glow is present but static. */
const REDUCED_MOTION_LEVEL = 0.45;

/**
 * Adds audio-reactive feedback to a dictation microphone while recording, so an
 * open mic is obvious at a glance rather than being conveyed only by the filled
 * mic glyph. The glow is drawn as a pseudo-element on `target`, so hosts that
 * rebuild their button contents keep it.
 */
export function setupDictationMicGlow(
	target: HTMLElement,
	service: IChatSpeechToTextService,
	accessibilityService: IAccessibilityService,
): IDisposable {
	const store = new DisposableStore();
	const window = getWindow(target);
	const dataArray = { value: undefined as Uint8Array | undefined };
	let animationFrame: number | undefined;
	let level = 0;

	const setLevel = (value: number) => {
		level = value;
		target.style.setProperty('--dictation-mic-level', value.toFixed(3));
	};

	const stopAnimation = () => {
		if (animationFrame !== undefined) {
			window.cancelAnimationFrame(animationFrame);
			animationFrame = undefined;
		}
	};

	const animate = () => {
		animationFrame = window.requestAnimationFrame(animate);
		// Reuses Voice Mode's reduction, so both features agree on what "level" means.
		const measured = service.state === ChatSpeechToTextState.Recording && service.analyserNode
			? readVoiceGlowIntensity(service.analyserNode, dataArray)
			: RESTING_LEVEL;
		setLevel(easeDictationMicLevel(level, shapeDictationMicLevel(measured)));
	};

	const update = () => {
		const phase = getDictationMicGlowPhase(service.state, service.isPreparingModel);
		target.classList.toggle('dictation-mic-active', phase !== 'off');
		target.classList.toggle('dictation-mic-settling', phase === 'settling');

		// With reduced motion the glow still shows, just held at a steady level.
		if (phase === 'off' || accessibilityService.isMotionReduced()) {
			stopAnimation();
			setLevel(phase === 'off' ? 0 : REDUCED_MOTION_LEVEL);
			return;
		}
		if (animationFrame === undefined) {
			animationFrame = window.requestAnimationFrame(animate);
		}
	};

	store.add(Event.any<unknown>(service.onDidChangeState, service.onDidChangePreparingModel)(update));
	store.add(accessibilityService.onDidChangeReducedMotion(update));
	store.add(toDisposable(() => {
		stopAnimation();
		target.classList.remove('dictation-mic-active', 'dictation-mic-settling');
		target.style.removeProperty('--dictation-mic-level');
	}));
	update();

	return store;
}
