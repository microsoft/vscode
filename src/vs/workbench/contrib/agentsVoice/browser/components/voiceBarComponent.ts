/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, nothing, type TemplateResult } from '../../../../../base/common/lit-html/lit-html.js';
import { localize } from '../../../../../nls.js';
import type { VoiceState } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import type { URI } from '../../../../../base/common/uri.js';
import { FONT_SIZE } from './tokens.js';

export interface VoiceBarProps {
	readonly voiceState: VoiceState;
	readonly speakingSessionLabel: string | undefined;
	readonly speakingSession: URI | undefined;
	readonly onStopSpeech: () => void;
}

export function renderVoiceBar(props: VoiceBarProps): TemplateResult | typeof nothing {
	const isSpeaking = props.voiceState === 'speaking';
	const isListening = props.voiceState === 'listening';

	// If speaking about a specific session, the session row handles the highlight
	if (isSpeaking && props.speakingSession) {
		return nothing;
	}

	if (!isSpeaking && !isListening) {
		return nothing;
	}

	const dotColor = isSpeaking ? 'var(--vscode-charts-green)' : 'var(--vscode-editorInfo-foreground)';
	const labelText = isSpeaking
		? (props.speakingSessionLabel || localize('agentsVoice.speaking', "Speaking..."))
		: localize('agentsVoice.listening', "Listening");

	return html`
		<div style="display:flex;align-items:center;gap:6px;height:24px;padding:4px 2px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;">
			<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>
			<span style="font-size:${FONT_SIZE.body};color:var(--vscode-foreground);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${labelText}</span>
			<div style="display:flex;align-items:center;gap:2px;height:16px;flex:0 0 auto;">
				${[0, 1, 2, 3, 4, 5].map(() =>
		html`<div style="width:2px;height:3px;border-radius:1px;background:var(--vscode-editorWidget-background);transition:height 0.05s ease;"></div>`
	)}
			</div>
			${isSpeaking ? html`
				<span
					class="codicon codicon-debug-stop"
					role="button"
					tabindex="0"
					aria-label="${localize('agentsVoice.stopSpeech', "Stop speech")}"
					style="font-size:${FONT_SIZE.body};color:var(--vscode-editorError-foreground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;"
					@click=${(e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); props.onStopSpeech(); }}></span>
			` : nothing}
		</div>
	`;
}
