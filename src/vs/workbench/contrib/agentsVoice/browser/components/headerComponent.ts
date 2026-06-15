/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import type { VoiceState } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { FONT_SIZE, addKeyboardActivation } from './tokens.js';

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

function hoverButton(className: string, ariaLabel: string, title: string): HTMLElement {
	const el = dom.$(`span.codicon.${className}`);
	el.role = 'button';
	el.tabIndex = 0;
	el.ariaLabel = ariaLabel;
	el.title = title;
	el.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;`;
	el.addEventListener('mouseenter', () => { el.style.color = 'var(--vscode-foreground)'; });
	el.addEventListener('mouseleave', () => { el.style.color = 'var(--vscode-descriptionForeground)'; });
	addKeyboardActivation(el);
	return el;
}

export interface HeaderComponent {
	readonly element: HTMLElement;
	update(props: HeaderProps): void;
}

export function createHeader(): HeaderComponent {
	const container = dom.$('div');
	container.style.cssText = 'display:flex;align-items:center;gap:8px;height:30px;flex-shrink:0;';

	// Copilot icon
	const copilotIcon = document.createElement('img');
	copilotIcon.style.cssText = 'width:18px;height:18px;margin-right:4px;';

	// Mic button
	const micBtn = dom.$('span.codicon.codicon-mic');
	micBtn.role = 'button';
	micBtn.tabIndex = 0;
	micBtn.ariaLabel = localize('agentsVoice.pushToTalkSpace', "Push to talk (Space)");
	micBtn.title = localize('agentsVoice.pushToTalkSpace', "Push to talk (Space)");
	micBtn.style.cssText = `font-size:${FONT_SIZE.iconMd};cursor:pointer;-webkit-app-region:no-drag;border-radius:4px;padding:2px;`;

	// PTT key / gear button
	const gearBtn = hoverButton('codicon-gear',
		localize('agentsVoice.configureKeybinding', "Configure keybinding"),
		localize('agentsVoice.configureKeybinding', "Configure keybinding"));

	// Connection indicator
	const connIndicator = dom.$('span.voice-conn-indicator');
	connIndicator.role = 'button';
	connIndicator.tabIndex = 0;
	connIndicator.ariaLabel = localize('agentsVoice.disconnect', "Disconnect");
	connIndicator.title = localize('agentsVoice.disconnect', "Disconnect");
	connIndicator.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;-webkit-app-region:no-drag;flex-shrink:0;padding:2px;';

	const connDot = dom.$('span.voice-conn-dot.codicon.codicon-debug-connected');
	connDot.title = localize('agentsVoice.disconnect', "Disconnect");
	connDot.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-charts-green);`;

	const connDisc = dom.$('span.voice-conn-disconnect.codicon.codicon-debug-disconnect');
	connDisc.title = localize('agentsVoice.disconnect', "Disconnect");
	connDisc.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);display:none;`;

	connIndicator.append(connDot, connDisc);
	addKeyboardActivation(connIndicator);

	// Spacer
	const spacer = dom.$('span');
	spacer.style.flex = '1';

	// Feedback button
	const feedbackBtn = hoverButton('codicon-feedback',
		localize('agentsVoice.sendFeedback', "Send feedback"),
		localize('agentsVoice.sendFeedback', "Send feedback"));

	// Popout button
	const popoutBtn = hoverButton('codicon-link-external',
		localize('agentsVoice.openMiniView', "Open mini-view"),
		localize('agentsVoice.openMiniView', "Open mini-view"));

	// Close button
	const closeBtn = hoverButton('codicon-chrome-minimize',
		localize('agentsVoice.minimize', "Minimize"),
		localize('agentsVoice.minimize', "Minimize"));

	// Hover style for connection indicator
	const connStyle = dom.$('style');
	connStyle.textContent = `
		.voice-conn-indicator:hover .voice-conn-dot { display: none !important; }
		.voice-conn-indicator:hover .voice-conn-disconnect { display: inline-block !important; color: var(--vscode-errorForeground, #f44) !important; }
	`;

	container.append(copilotIcon, micBtn, gearBtn, connIndicator, spacer, feedbackBtn, popoutBtn, closeBtn, connStyle);

	return {
		element: container,
		update(props: HeaderProps) {
			container.style.cssText = `display:flex;align-items:center;gap:8px;height:30px;flex-shrink:0;${props.draggable ? '-webkit-app-region:drag;' : ''}`;

			// Copilot icon
			copilotIcon.style.display = props.showCopilotIcon ? '' : 'none';
			copilotIcon.src = props.copilotIconSrc;

			// Mic color
			const micColor = props.voiceState === 'listening' ? 'var(--vscode-editorInfo-foreground)'
				: props.voiceState === 'speaking' ? 'var(--vscode-agentsVoice-speakingForeground)'
					: 'var(--vscode-descriptionForeground)';
			micBtn.style.color = micColor;
			micBtn.onmouseenter = () => { micBtn.style.color = 'var(--vscode-foreground)'; };
			micBtn.onmouseleave = () => { micBtn.style.color = micColor; };
			micBtn.onmousedown = props.onMicDown;
			micBtn.onmouseup = () => props.onMicUp();

			// Gear
			const showConnected = props.isConnected || props.isReconnecting;
			gearBtn.style.display = props.isConnected ? '' : 'none';
			gearBtn.onclick = props.onPttKeyClick;

			// Connection indicator
			connIndicator.style.display = showConnected ? 'inline-flex' : 'none';
			connIndicator.onclick = props.onDisconnectClick;

			// Spacer / center connect button
			const showConnBtnCenter = !showConnected && props.centerConnectButton;
			spacer.style.cssText = 'flex:1;';
			if (showConnBtnCenter) {
				spacer.style.cssText = 'flex:1;display:flex;justify-content:center;gap:8px;';
				// In center mode, popout moves inside the spacer
				if (props.showPopout) {
					spacer.append(popoutBtn);
				}
			}

			// Feedback
			feedbackBtn.onclick = props.onFeedbackClick;

			// Popout — shown in its normal position unless it's in the centered spacer
			if (showConnBtnCenter) {
				popoutBtn.style.display = props.showPopout ? '' : 'none';
			} else {
				// Ensure popout is back in its normal position (after feedback, before close)
				if (popoutBtn.parentElement === spacer) {
					closeBtn.before(popoutBtn);
				}
				popoutBtn.style.display = props.showPopout ? '' : 'none';
			}
			popoutBtn.onclick = props.onPopoutClick;

			// Close
			closeBtn.style.display = props.showClose ? '' : 'none';
			closeBtn.onclick = props.onCloseClick;
		}
	};
}
