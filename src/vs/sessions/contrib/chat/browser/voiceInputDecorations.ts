/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import './media/voiceChatView.css';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IMicCaptureService } from '../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { computeVoiceGlowStyle, readVoiceGlowIntensity } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceGlow.js';

export interface IVoiceInputDecorationsServices {
	readonly voiceSessionController: IVoiceSessionController;
	readonly ttsPlaybackService: ITtsPlaybackService;
	readonly micCaptureService: IMicCaptureService;
	readonly configurationService: IConfigurationService;
	readonly keybindingService: IKeybindingService;
}

export interface IVoiceInputDecorationsOptions {
	/** Input container for glow and transcript overlay. */
	readonly inputContainer: HTMLElement;
	/** Whether this surface is active/visible. */
	readonly isActive: IObservable<boolean>;
	/** Surface resource, compared with the voice target to avoid misrouting. */
	readonly getCurrentResource: () => URI | undefined;
}

/**
 * Adds the voice transcript overlay and audio-reactive glow to a chat input.
 * Shared by the active-session `ChatView` and new-session composer.
 *
 * Decorations show only while this surface is active and voice targets it.
 */
export function setupVoiceInputDecorations(services: IVoiceInputDecorationsServices, options: IVoiceInputDecorationsOptions): IDisposable {
	const { voiceSessionController, ttsPlaybackService, micCaptureService, configurationService, keybindingService } = services;
	const { inputContainer: inputContainerEl, isActive, getCurrentResource } = options;

	const store = new DisposableStore();

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
	const win = dom.getWindow(inputContainerEl);
	let animFrameId: number | undefined;
	const glowDataArrayRef: { value: Uint8Array | undefined } = { value: undefined };
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

			const transcriptHidden = configurationService.getValue<boolean>('agents.voice.showTranscript') === false;
			const { borderColor, boxShadow } = computeVoiceGlowStyle(voiceState, intensity, transcriptHidden);
			inputContainerEl.style.borderColor = borderColor;
			inputContainerEl.style.boxShadow = boxShadow;
			inputContainerEl.classList.add('voice-active');
			inputContainerEl.classList.toggle('voice-listening', voiceState === 'listening');
		};
		animFrameId = win.requestAnimationFrame(animate);
	};
	const stopGlowAnimation = () => {
		if (animFrameId !== undefined) {
			win.cancelAnimationFrame(animFrameId);
			animFrameId = undefined;
		}
		inputContainerEl.style.borderColor = '';
		inputContainerEl.style.boxShadow = '';
		inputContainerEl.classList.remove('voice-active', 'voice-listening');
	};

	store.add(autorun(reader => {
		const connected = voiceSessionController.isConnected.read(reader);
		const voiceState = voiceSessionController.voiceState.read(reader);
		const active = isActive.read(reader);
		const targetSession = voiceSessionController.targetSession.read(reader);
		const current = getCurrentResource();
		// Glow only the active slot targeted by the backend.
		const targetedElsewhere = !!targetSession && !!current && !isEqual(targetSession, current);
		if (connected && active && !targetedElsewhere && (voiceState === 'listening' || voiceState === 'speaking')) {
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
		const targetSession = voiceSessionController.targetSession.read(reader);
		const active = isActive.read(reader);
		const showTranscript = configurationService.getValue<boolean>('agents.voice.showTranscript') !== false;
		const current = getCurrentResource();
		const visible = turns.filter(t => t.text.length > 0 || (t.speaker === 'user' && t.isPartial));

		// Render transcripts only on the active backend target.
		const targetedElsewhere = !!targetSession && !!current && !isEqual(targetSession, current);
		if (!connected || !active || targetedElsewhere) {
			transcriptOverlayNode.style.display = 'none';
			transcriptOverlayNode.classList.remove('has-transcript');
			return;
		}

		if (visible.length === 0 || !showTranscript) {
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
			} else if (voiceState === 'idle' && visible.length === 0 && showTranscript && !handsFree) {
				transcriptOverlayNode.style.display = '';
				transcriptOverlayNode.classList.remove('has-transcript');
				transcriptOverlay.replaceChildren();
				const hint = dom.$('span.partial');
				const kb = keybindingService.lookupKeybinding('agentsVoice.pushToTalk');
				const kbLabel = kb?.getLabel();
				hint.textContent = kbLabel
					? localize('voiceMode.pttHint', "Press {0} to talk", kbLabel)
					: localize('voiceMode.clickMicHint', "Click voice mode to talk");
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
