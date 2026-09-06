/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import type { VoiceState } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import type { URI } from '../../../../../base/common/uri.js';
import { FONT_SIZE, addKeyboardActivation } from './tokens.js';

export interface VoiceBarProps {
	readonly voiceState: VoiceState;
	readonly speakingSessionLabel: string | undefined;
	readonly speakingSession: URI | undefined;
	readonly onStopSpeech: () => void;
}

export interface VoiceBarComponent {
	readonly element: HTMLElement;
	update(props: VoiceBarProps): void;
}

export function createVoiceBar(): VoiceBarComponent {
	const container = dom.$('div');
	container.style.cssText = 'display:flex;align-items:center;gap:6px;height:24px;padding:4px 2px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;';

	const dot = dom.$('span');
	dot.style.cssText = 'width:7px;height:7px;border-radius:50%;flex-shrink:0;';

	const label = dom.$('span');
	label.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-foreground);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;

	const waveform = dom.$('div');
	waveform.style.cssText = 'display:flex;align-items:center;gap:2px;height:16px;flex:0 0 auto;';
	for (let i = 0; i < 6; i++) {
		const bar = dom.$('div');
		bar.style.cssText = 'width:2px;height:3px;border-radius:1px;background:var(--vscode-editorWidget-background);transition:height 0.05s ease;';
		waveform.append(bar);
	}

	const stopBtn = dom.$('span.codicon.codicon-debug-stop');
	stopBtn.role = 'button';
	stopBtn.tabIndex = 0;
	stopBtn.ariaLabel = localize('agentsVoice.stopSpeech', "Stop speech");
	stopBtn.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-editorError-foreground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;`;
	addKeyboardActivation(stopBtn);

	container.append(dot, label, waveform, stopBtn);

	let currentStopHandler: ((e: Event) => void) | undefined;

	return {
		element: container,
		update(props: VoiceBarProps) {
			const isSpeaking = props.voiceState === 'speaking';
			const isListening = props.voiceState === 'listening';

			if ((isSpeaking && props.speakingSession) || (!isSpeaking && !isListening)) {
				container.style.display = 'none';
				// Detach handler when hidden to avoid stale listeners
				if (currentStopHandler) {
					stopBtn.removeEventListener('click', currentStopHandler);
					currentStopHandler = undefined;
				}
				return;
			}
			container.style.display = 'flex';

			dot.style.background = isSpeaking ? 'var(--vscode-charts-green)' : 'var(--vscode-editorInfo-foreground)';
			label.textContent = isSpeaking
				? (props.speakingSessionLabel || localize('agentsVoice.speaking', "Speaking..."))
				: localize('agentsVoice.listening', "Listening");

			stopBtn.style.display = isSpeaking ? '' : 'none';
			if (isSpeaking) {
				if (currentStopHandler) {
					stopBtn.removeEventListener('click', currentStopHandler);
				}
				currentStopHandler = (e: Event) => { e.preventDefault(); e.stopPropagation(); props.onStopSpeech(); };
				stopBtn.addEventListener('click', currentStopHandler);
			} else if (currentStopHandler) {
				stopBtn.removeEventListener('click', currentStopHandler);
				currentStopHandler = undefined;
			}
		}
	};
}
