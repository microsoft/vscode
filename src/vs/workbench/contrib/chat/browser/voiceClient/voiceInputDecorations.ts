/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader, autorun } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { isDark } from '../../../../../platform/theme/common/theme.js';
import { IMicCaptureService } from './micCaptureService.js';
import { ITtsPlaybackService } from './ttsPlaybackService.js';
import { readVoiceGlowIntensity, resolveVoiceGlowColors, shouldRenderVoiceInputGlow } from './voiceGlow.js';
import { createVoiceGlowController, IVoiceGlowController } from './voiceGlowController.js';
import { IVoiceSessionController } from './voiceSessionController.js';

import './media/voiceInputDecorations.css';

export interface IVoiceInputDecorationsServices {
	readonly voiceSessionController: IVoiceSessionController;
	readonly ttsPlaybackService: ITtsPlaybackService;
	readonly micCaptureService: IMicCaptureService;
	readonly configurationService: IConfigurationService;
	readonly keybindingService: IKeybindingService;
	readonly themeService: IThemeService;
	readonly accessibilityService: IAccessibilityService;
}

export interface IVoiceInputDecorationsOptions {
	/** Input container for the transcript overlay. */
	readonly inputContainer: HTMLElement;
	/** Container that receives the ambient glow. Defaults to {@link inputContainer}. */
	readonly glowContainer?: HTMLElement;
	/** Whether this surface is active/visible. */
	readonly isActive: IObservable<boolean>;
	/** Current text in the input. Voice placeholders are hidden while it is non-empty. */
	readonly inputValue?: IObservable<string>;
	/** Explicit ownership for surfaces such as omni that do not yet have a resource. */
	readonly isOwner?: IObservable<boolean>;
	/** Surface resource, compared with the voice target to avoid misrouting. */
	readonly getCurrentResource?: () => URI | undefined;
	/**
	 * The single chat input voice mode is bound to. Only the surface whose
	 * {@link getCurrentResource} matches this renders the glow/transcript, so
	 * voice is active in exactly one input at a time even when several sessions
	 * are visible.
	 */
	readonly currentVoiceInputResource?: IObservable<URI | undefined>;
}

/**
 * Adds the voice transcript overlay and audio-reactive glow to a chat input.
 * Shared by the active-session `ChatView` and new-session composer.
 *
 * Decorations show only while this surface is active and voice targets it.
 */
export function setupVoiceInputDecorations(services: IVoiceInputDecorationsServices, options: IVoiceInputDecorationsOptions): IDisposable {
	const { voiceSessionController, ttsPlaybackService, micCaptureService, configurationService, keybindingService, themeService, accessibilityService } = services;
	const { inputContainer: inputContainerEl, isActive } = options;
	const glowContainerEl = options.glowContainer ?? inputContainerEl;
	const isSurfaceOwner = (reader: IReader): boolean => {
		if (options.isOwner) {
			return options.isOwner.read(reader);
		}
		const owner = options.currentVoiceInputResource?.read(reader);
		const current = options.getCurrentResource?.();
		return !!current && !!owner && isEqual(current, owner);
	};

	const store = new DisposableStore();
	const getPushToTalkKeybindingLabel = () => (
		keybindingService.lookupKeybinding('workbench.action.chat.voiceInputMode.holdToTalk')
		?? keybindingService.lookupKeybinding('agentsVoice.pushToTalk')
	)?.getLabel();

	inputContainerEl.style.position = 'relative';

	const transcriptOverlay = dom.$('.voice-transcript-overlay');
	const transcriptScrollable = store.add(new DomScrollableElement(transcriptOverlay, {
		horizontal: ScrollbarVisibility.Hidden,
		vertical: ScrollbarVisibility.Auto,
	}));
	const transcriptOverlayNode = transcriptScrollable.getDomNode();
	transcriptOverlayNode.classList.add('voice-transcript-overlay-scrollable');
	transcriptOverlayNode.style.display = 'none';
	inputContainerEl.append(transcriptOverlayNode);

	// --- Audio-reactive glow ---
	const win = dom.getWindow(glowContainerEl);
	let animFrameId: number | undefined;
	const glowDataArrayRef: { value: Uint8Array | undefined } = { value: undefined };
	let glowController: IVoiceGlowController;
	try {
		glowController = store.add(createVoiceGlowController(
			glowContainerEl,
			() => isDark(themeService.getColorTheme().type) ? 'dark' : 'light',
			() => resolveVoiceGlowColors(themeService.getColorTheme()),
		));
	} catch (error) {
		store.dispose();
		throw error;
	}
	store.add(themeService.onDidColorThemeChange(() => glowController.refreshTheme()));
	const startGlowAnimation = () => {
		if (animFrameId !== undefined) {
			return;
		}
		const animate = () => {
			animFrameId = win.requestAnimationFrame(animate);
			const voiceState = voiceSessionController.voiceState.get();

			const analyser = ttsPlaybackService.analyserNode
				?? (voiceState === 'listening' ? micCaptureService.analyserNode : null)
				?? null;
			const intensity = readVoiceGlowIntensity(analyser, glowDataArrayRef);

			glowController.render(voiceState, intensity, accessibilityService.isMotionReduced());
		};
		animFrameId = win.requestAnimationFrame(animate);
	};
	const stopGlowAnimation = () => {
		if (animFrameId !== undefined) {
			win.cancelAnimationFrame(animFrameId);
			animFrameId = undefined;
		}
		glowController.clear();
	};

	store.add(autorun(reader => {
		const connected = voiceSessionController.isConnected.read(reader);
		const voiceState = voiceSessionController.voiceState.read(reader);
		const active = isActive.read(reader);
		const ownsVoice = isSurfaceOwner(reader);
		if (shouldRenderVoiceInputGlow(connected, active, ownsVoice, voiceState)) {
			startGlowAnimation();
		} else {
			stopGlowAnimation();
		}
	}));
	store.add({ dispose: () => stopGlowAnimation() });

	// --- Transcript rendering ---
	store.add(autorun(reader => {
		const turns = voiceSessionController.transcriptTurns.read(reader);
		const connected = voiceSessionController.isConnected.read(reader);
		const voiceState = voiceSessionController.voiceState.read(reader);
		const active = isActive.read(reader);
		const hasInput = (options.inputValue?.read(reader).length ?? 0) > 0;
		const showTranscript = configurationService.getValue<boolean>('agents.voice.showTranscript') !== false;
		const visible = turns.filter(t => t.text.length > 0 || (t.speaker === 'user' && t.isPartial));

		if (!connected || !active || !isSurfaceOwner(reader)) {
			transcriptOverlayNode.style.display = 'none';
			transcriptOverlayNode.classList.remove('has-transcript');
			return;
		}

		if (visible.length === 0 || !showTranscript) {
			if (hasInput) {
				transcriptOverlayNode.style.display = 'none';
				transcriptOverlayNode.classList.remove('has-transcript');
				return;
			}
			const handsFree = configurationService.getValue<boolean>('agents.voice.handsFree') === true;
			if (!showTranscript && voiceState === 'listening') {
				// Transcript is disabled: surface a minimal "Listening..." overlay
				// while listening so the user has feedback. Cleared in any other state.
				transcriptOverlayNode.style.display = '';
				transcriptOverlayNode.classList.remove('has-transcript');
				transcriptOverlay.replaceChildren();
				const listening = dom.$('span.listening');
				listening.textContent = localize('voiceMode.listening', "Listening...");
				transcriptOverlay.append(listening);
				transcriptScrollable.scanDomNode();
			} else if (!showTranscript && voiceState === 'speaking') {
				// Transcript is disabled: hint that the user can interrupt playback.
				transcriptOverlayNode.style.display = '';
				transcriptOverlayNode.classList.remove('has-transcript');
				transcriptOverlay.replaceChildren();
				const hint = dom.$('span.partial');
				const kbLabel = getPushToTalkKeybindingLabel();
				hint.textContent = kbLabel
					? localize('voiceMode.bargeInHint', "Speak or use {0}", kbLabel)
					: localize('voiceMode.bargeInHintNoKb', "Speak to barge in");
				transcriptOverlay.append(hint);
				transcriptScrollable.scanDomNode();
			} else if (voiceState === 'idle' && visible.length === 0 && showTranscript && !handsFree) {
				transcriptOverlayNode.style.display = '';
				transcriptOverlayNode.classList.remove('has-transcript');
				transcriptOverlay.replaceChildren();
				const hint = dom.$('span.partial');
				const kbLabel = getPushToTalkKeybindingLabel();
				hint.textContent = kbLabel
					? localize('voiceMode.pttOrBargeInHint', "Press {0} to talk or barge in", kbLabel)
					: localize('voiceMode.clickMicOrBargeInHint', "Click voice mode to talk or barge in");
				transcriptOverlay.append(hint);
				transcriptScrollable.scanDomNode();
			} else {
				transcriptOverlayNode.style.display = 'none';
				transcriptOverlayNode.classList.remove('has-transcript');
			}
			return;
		}

		transcriptOverlayNode.style.display = '';
		transcriptOverlayNode.classList.add('has-transcript');
		// Show only the latest visible turn.
		const lastTurn = visible[visible.length - 1];
		const contentElements: HTMLElement[] = [];
		if (lastTurn.speaker === 'user') {
			const span = dom.$('span');
			if (lastTurn.isPartial) {
				const committedPart = lastTurn.committed || '';
				const unsurePart = lastTurn.text.slice(committedPart.length);
				if (committedPart) {
					const c = dom.$('span.committed');
					c.textContent = committedPart;
					span.append(c);
				}
				const u = dom.$('span.partial');
				u.textContent = unsurePart + '\u2589';
				span.append(u);
			} else {
				span.className = 'committed';
				span.textContent = lastTurn.text;
			}
			contentElements.push(span);
		} else {
			const div = dom.$('div.assistant-text');
			div.textContent = lastTurn.text;
			contentElements.push(div);
		}
		transcriptOverlay.replaceChildren(...contentElements);
		transcriptScrollable.scanDomNode();
		transcriptScrollable.setScrollPosition({ scrollTop: 0 });
	}));

	return store;
}
