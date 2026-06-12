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

	const connBtnTemplate = nothing;

	const popoutTemplate = props.showPopout
		? html`<span
				class="codicon codicon-link-external"
				role="button"
				tabindex="0"
				aria-label="${localize('agentsVoice.openMiniView', "Open mini-view")}"
				title="${localize('agentsVoice.openMiniView', "Open mini-view")}"
				style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;"
				@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
				@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
				@click=${props.onPopoutClick}></span>`
		: nothing;

	const feedbackTemplate = html`<span
			class="codicon codicon-feedback"
			role="button"
			tabindex="0"
			aria-label="${localize('agentsVoice.sendFeedback', "Send feedback")}"
			title="${localize('agentsVoice.sendFeedback', "Send feedback")}"
			style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;"
			@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
			@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
			@click=${props.onFeedbackClick}></span>`;

	const closeTemplate = props.showClose
		? html`<span
				class="codicon codicon-chrome-minimize"
				role="button"
				tabindex="0"
				aria-label="${localize('agentsVoice.minimize', "Minimize")}"
				title="${localize('agentsVoice.minimize', "Minimize")}"
				style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;"
				@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
				@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
				@click=${props.onCloseClick}></span>`
		: nothing;

	const dragStyle = props.draggable ? '-webkit-app-region:drag;' : '';

	// Left section: [icon] [mic] [pttKey] [connectBtn]
	// Center (only when centerConnectButton): [connectBtn]
	// Right section: [popout] [close]
	const showConnected = props.isConnected || props.isReconnecting;
	const showConnBtnLeft = !showConnected && !props.centerConnectButton;
	const showConnBtnCenter = !showConnected && props.centerConnectButton;

	return html`
		<div style="display:flex;align-items:center;gap:8px;height:30px;flex-shrink:0;${dragStyle}">
			${props.showCopilotIcon
			? html`<img src=${props.copilotIconSrc} style="width:18px;height:18px;margin-right:4px;" />`
			: nothing}
			${html`<span
					class="codicon codicon-mic"
					role="button"
					tabindex="0"
					aria-label="${localize('agentsVoice.pushToTalkSpace', "Push to talk (Space)")}"
					title="${localize('agentsVoice.pushToTalkSpace', "Push to talk (Space)")}"
					style="font-size:${FONT_SIZE.iconMd};color:${micColor};cursor:pointer;-webkit-app-region:no-drag;border-radius:4px;padding:2px;"
					@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
					@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = micColor; }}
					@mousedown=${props.onMicDown}
					@mouseup=${props.onMicUp}></span>`}
			${props.isConnected
			? html`<span
					class="codicon codicon-gear"
					role="button"
					tabindex="0"
					aria-label="${localize('agentsVoice.configureKeybinding', "Configure keybinding")}"
					title="${localize('agentsVoice.configureKeybinding', "Configure keybinding")}"
					style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;"
					@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
					@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
					@click=${props.onPttKeyClick}></span>`
			: nothing}
			${showConnected ? html`<span class="voice-conn-indicator"
				role="button"
				tabindex="0"
				aria-label="${localize('agentsVoice.disconnect', "Disconnect")}"
				title="${localize('agentsVoice.disconnect', "Disconnect")}"
				@click=${props.onDisconnectClick}
				style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;-webkit-app-region:no-drag;flex-shrink:0;padding:2px;">
				<span class="voice-conn-dot codicon codicon-debug-connected" title="${localize('agentsVoice.disconnect', "Disconnect")}" style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-charts-green);"></span>
				<span class="voice-conn-disconnect codicon codicon-debug-disconnect" title="${localize('agentsVoice.disconnect', "Disconnect")}" style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);display:none;"></span>
			</span>` : nothing}
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
