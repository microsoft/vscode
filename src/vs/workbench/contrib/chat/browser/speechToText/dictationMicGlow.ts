/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/dictationMicGlow.css';
import { getWindow } from '../../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { readVoiceGlowIntensity } from '../voiceClient/voiceGlow.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from './chatSpeechToTextService.js';

const SPEAKING_THRESHOLD = 0.08;
const GLOW_LEVEL_CLASSES = [
	'dictation-mic-glow-level-1',
	'dictation-mic-glow-level-2',
	'dictation-mic-glow-level-3',
	'dictation-mic-glow-level-4',
] as const;

/**
 * Adds audio-reactive feedback to a dictation microphone while recording.
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

	const setGlowLevel = (level: number) => {
		for (let index = 0; index < GLOW_LEVEL_CLASSES.length; index++) {
			target.classList.toggle(GLOW_LEVEL_CLASSES[index], index === level - 1);
		}
		target.classList.toggle('dictation-mic-speaking', level > 0);
	};

	const stopAnimation = () => {
		if (animationFrame !== undefined) {
			window.cancelAnimationFrame(animationFrame);
			animationFrame = undefined;
		}
		setGlowLevel(0);
	};

	const animate = () => {
		animationFrame = window.requestAnimationFrame(animate);
		const intensity = readVoiceGlowIntensity(service.analyserNode ?? null, dataArray);
		const speakingIntensity = Math.max(0, Math.min(1, (intensity - SPEAKING_THRESHOLD) / (1 - SPEAKING_THRESHOLD)));
		setGlowLevel(speakingIntensity === 0 ? 0 : Math.min(GLOW_LEVEL_CLASSES.length, Math.ceil(speakingIntensity * GLOW_LEVEL_CLASSES.length)));
	};

	const update = () => {
		const active = service.state === ChatSpeechToTextState.Recording;
		target.classList.toggle('dictation-mic-active', active);
		if (!active) {
			stopAnimation();
			return;
		}
		if (accessibilityService.isMotionReduced()) {
			stopAnimation();
			setGlowLevel(2);
			return;
		}
		if (animationFrame === undefined) {
			animationFrame = window.requestAnimationFrame(animate);
		}
	};

	store.add(service.onDidChangeState(update));
	store.add(accessibilityService.onDidChangeReducedMotion(update));
	store.add(toDisposable(() => {
		stopAnimation();
		target.classList.remove('dictation-mic-active');
	}));
	update();

	return store;
}
