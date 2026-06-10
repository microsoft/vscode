/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, nothing, type TemplateResult } from '../../../../../base/common/lit-html/lit-html.js';
import { localize } from '../../../../../nls.js';
import type { VoiceState } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { FONT_SIZE } from './tokens.js';

export interface HeaderProps {
	readonly copilotIconSrc: string;
	readonly showCopilotIcon: boolean;
	readonly isConnected: boolean;
	readonly isConnecting: boolean;
	readonly isReconnecting: boolean;
	readonly voiceState: VoiceState;
	readonly pttKeyLabel: string | undefined;
	readonly draggable: boolean;
	readonly showClose: boolean;
	readonly showPopout: boolean;
	readonly centerConnectButton: boolean;
	readonly onMicDown: (e: MouseEvent) => void;
	readonly onMicUp: () => void;
	readonly onConnectClick: (e: MouseEvent) => void;
	readonly onDisconnectClick: (e: MouseEvent) => void;
	readonly onCloseClick: (e: MouseEvent) => void;
	readonly onToggleClick: (e: MouseEvent) => void;
	readonly onPttKeyClick: (e: MouseEvent) => void;
	readonly onPopoutClick: (e: MouseEvent) => void;
	readonly onFeedbackClick: (e: MouseEvent) => void;
	readonly expanded: boolean;
}

export function renderHeader(props: HeaderProps): TemplateResult {
	const micColor = props.voiceState === 'listening' ? 'var(--vscode-editorInfo-foreground)'
		: props.voiceState === 'speaking' ? 'var(--vscode-agentsVoice-speakingForeground)'
			: 'var(--vscode-descriptionForeground)';

	const connBtnTemplate = props.isConnected
		? nothing
		: props.isConnecting
			? html`<button
				style="-webkit-app-region:no-drag;background:var(--vscode-scrollbarSlider-background);border:none;outline:none;color:var(--vscode-foreground);font-weight:500;cursor:default;font-size:${FONT_SIZE.body};padding:2px 10px;border-radius:3px;flex-shrink:0;line-height:1;"
				>${localize('agentsVoice.connecting', "Connecting...")}</button>`
			: html`<button
				style="-webkit-app-region:no-drag;background:var(--vscode-button-background);border:none;outline:none;color:var(--vscode-button-foreground);font-weight:500;cursor:pointer;font-size:${FONT_SIZE.body};padding:2px 10px;border-radius:3px;flex-shrink:0;line-height:1;"
				title="${localize('agentsVoice.connectTitle', "Connect to voice server")}"
				@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.background = 'var(--vscode-button-hoverBackground)'; }}
				@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.background = 'var(--vscode-button-background)'; }}
				@click=${props.onConnectClick}>${localize('agentsVoice.connect', "Connect")}</button>`;

	const popoutTemplate = props.showPopout
		? html`<span
				class="codicon codicon-link-external"
				title="${localize('agentsVoice.openMiniView', "Open mini-view")}"
				style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;"
				@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
				@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
				@click=${props.onPopoutClick}></span>`
		: nothing;

	const feedbackTemplate = html`<span
			class="codicon codicon-feedback"
			title="${localize('agentsVoice.sendFeedback', "Send feedback")}"
			style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;"
			@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
			@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
			@click=${props.onFeedbackClick}></span>`;

	const closeTemplate = props.showClose
		? html`<span
				class="codicon codicon-chrome-minimize"
				title="${localize('agentsVoice.minimize', "Minimize")}"
				style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;"
				@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
				@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
				@click=${props.onCloseClick}></span>`
		: nothing;

	const connColor = props.isConnected ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-orange)';

	const connIndicator = html`<span class="voice-conn-indicator" title="${localize('agentsVoice.disconnect', "Disconnect")}"
		@click=${props.onDisconnectClick}
		style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;-webkit-app-region:no-drag;flex-shrink:0;padding:2px;">
		<span class="voice-conn-dot codicon codicon-debug-connected" style="font-size:${FONT_SIZE.iconSm};color:${connColor};"></span>
		<span class="voice-conn-disconnect codicon codicon-debug-disconnect" style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);display:none;"></span>
	</span>`;

	const dragStyle = props.draggable ? '-webkit-app-region:drag;' : '';

	// Left section: [icon] [mic] [pttKey] [connIndicator OR connectBtn]
	// Center (only when centerConnectButton): [connectBtn]
	// Right section: [popout] [close]
	const showIndicatorLeft = props.isConnected || props.isReconnecting;
	const showConnBtnLeft = !showIndicatorLeft && !props.centerConnectButton;
	const showConnBtnCenter = !showIndicatorLeft && props.centerConnectButton;

	return html`
		<div style="display:flex;align-items:center;gap:8px;height:30px;flex-shrink:0;${dragStyle}">
			${props.showCopilotIcon
			? html`<img src=${props.copilotIconSrc} style="width:18px;height:18px;margin-right:4px;" />`
			: nothing}
			${props.isConnected
			? html`<span
					class="codicon codicon-mic"
					title="${localize('agentsVoice.pushToTalk', "Push to talk")}"
					style="font-size:${FONT_SIZE.iconMd};color:${micColor};cursor:pointer;-webkit-app-region:no-drag;border-radius:4px;padding:2px;"
					@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
					@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = micColor; }}
					@mousedown=${props.onMicDown}
					@mouseup=${props.onMicUp}></span>`
			: nothing}
			${props.isConnected && props.pttKeyLabel
			? html`<span
					title="${localize('agentsVoice.changePttKey', "Change push-to-talk key")}"
					style="font-size:${FONT_SIZE.micro};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:1px 4px;border:1px solid var(--vscode-descriptionForeground);border-radius:3px;line-height:1;"
					@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; (e.target as HTMLElement).style.borderColor = 'var(--vscode-foreground)'; }}
					@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; (e.target as HTMLElement).style.borderColor = 'var(--vscode-descriptionForeground)'; }}
					@click=${props.onPttKeyClick}>${props.pttKeyLabel}</span>`
			: nothing}
			${showIndicatorLeft ? connIndicator : nothing}
			${showConnBtnLeft ? connBtnTemplate : nothing}
			${showConnBtnCenter
			? html`<span style="flex:1;display:flex;justify-content:center;gap:8px;">${connBtnTemplate}${popoutTemplate}</span>`
			: html`<span style="flex:1;"></span>`}
			${feedbackTemplate}
			${!showConnBtnCenter ? popoutTemplate : nothing}
			${closeTemplate}
		</div>
		<style>
			.voice-conn-indicator:hover .voice-conn-dot { display: none !important; }
			.voice-conn-indicator:hover .voice-conn-disconnect { display: inline-block !important; color: var(--vscode-errorForeground, #f44) !important; }
		</style>
	`;
}
