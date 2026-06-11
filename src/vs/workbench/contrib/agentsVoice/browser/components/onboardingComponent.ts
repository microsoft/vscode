/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, type TemplateResult } from '../../../../../base/common/lit-html/lit-html.js';
import { localize } from '../../../../../nls.js';
import { FONT_SIZE } from './tokens.js';

export interface OnboardingProps {
	readonly pttKeyLabel: string | undefined;
	readonly isConnecting: boolean;
	readonly onGetStarted: (e: MouseEvent) => void;
	readonly onOpenPttKeySettings: (e: MouseEvent) => void;
	readonly onOpenPopout: ((e: MouseEvent) => void) | undefined;
}

const ONBOARDING_FONT = '13px';
const ONBOARDING_ICON_LG = '18px';

export function renderOnboarding(props: OnboardingProps): TemplateResult {
	const pttKey = props.pttKeyLabel ?? 'Space';
	const buttonLabel = props.isConnecting ? localize('agentsVoice.connecting', "Connecting…") : localize('agentsVoice.getStarted', "Get Started");
	const buttonDisabled = props.isConnecting;

	const welcomeTitle = localize('agentsVoice.welcomeTitle', "Welcome to Voice Chat");
	const welcomeDesc = localize('agentsVoice.welcomeDesc', "Speak to an assistant that controls multiple coding agents at once. Get notified when work is done or input is needed.");
	const pttDesc = localize('agentsVoice.pttDesc', "Push-to-talk");
	const pttHoldDesc = localize('agentsVoice.pttHoldDesc', "— hold the key while speaking, release when done.");
	const changeHotkey = localize('agentsVoice.configureHotkey', "Configure a keybinding");
	const changeHotkeySuffix = localize('agentsVoice.changeHotkeySuffix', "to use it from any app.");
	const feedbackDesc = localize('agentsVoice.feedbackDesc', "Use the feedback icon to help us improve your experience.");
	const miniViewLink = localize('agentsVoice.openMiniView', "Open the mini-view");
	const miniViewSuffix = localize('agentsVoice.miniViewSuffix', "to multitask while VS Code is not in the foreground.");

	return html`
		<div style="display:flex;flex-direction:column;gap:12px;padding:8px 0;">
			<span style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${welcomeTitle}</span>

			<div style="display:flex;flex-direction:column;gap:10px;font-size:${ONBOARDING_FONT};color:var(--vscode-foreground);line-height:1.5;">
				<div style="display:flex;gap:10px;align-items:center;">
					<span style="display:flex;justify-content:center;align-items:center;width:24px;flex-shrink:0;">
						<span class="codicon codicon-sparkle" style="font-size:20px;"></span>
					</span>
					<span>${welcomeDesc}</span>
				</div>
				<div style="display:flex;gap:10px;align-items:center;">
					<span style="display:flex;justify-content:center;align-items:center;width:24px;flex-shrink:0;">
						<span role="button" tabindex="0" aria-label="${localize('agentsVoice.changePttKey', "Change push-to-talk key")}" style="font-size:${FONT_SIZE.micro};padding:1px 4px;border:1px solid var(--vscode-descriptionForeground);border-radius:3px;line-height:1;color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;"
							@click=${(e: MouseEvent) => { e.preventDefault(); props.onOpenPttKeySettings(e); }}>${pttKey}</span>
					</span>
					<span><strong>${pttDesc}</strong> ${pttHoldDesc} <a href="#" @click=${(e: MouseEvent) => { e.preventDefault(); props.onOpenPttKeySettings(e); }} style="color:var(--vscode-textLink-foreground);cursor:pointer;text-decoration:none;">${changeHotkey}</a> ${changeHotkeySuffix}</span>
				</div>
				<div style="display:flex;gap:10px;align-items:center;">
					<span style="display:flex;justify-content:center;align-items:center;width:24px;flex-shrink:0;">
						<span class="codicon codicon-feedback" style="font-size:${ONBOARDING_ICON_LG};"></span>
					</span>
					<span>${feedbackDesc}</span>
				</div>
				${props.onOpenPopout ? html`
				<div style="display:flex;gap:10px;align-items:center;">
					<span style="display:flex;justify-content:center;align-items:center;width:24px;flex-shrink:0;">
						<span class="codicon codicon-link-external" style="font-size:${FONT_SIZE.iconSm};"></span>
					</span>
					<span><a href="#" @click=${(e: MouseEvent) => { e.preventDefault(); props.onOpenPopout!(e); }} style="color:var(--vscode-textLink-foreground);cursor:pointer;text-decoration:none;">${miniViewLink}</a> ${miniViewSuffix}</span>
				</div>` : html``}
			</div>

			<button
				?disabled=${buttonDisabled}
				style="
					-webkit-app-region:no-drag;
					background:var(--vscode-button-background);
					border:none;
					color:var(--vscode-button-foreground);
					font-size:${ONBOARDING_FONT};
					padding:6px 14px;
					border-radius:3px;
					cursor:${buttonDisabled ? 'default' : 'pointer'};
					font-weight:500;
					align-self:stretch;
					margin-top:2px;
					opacity:${buttonDisabled ? '0.7' : '1'};
				"
				@mouseenter=${(e: MouseEvent) => { if (!buttonDisabled) { (e.target as HTMLElement).style.background = 'var(--vscode-button-hoverBackground)'; } }}
				@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.background = 'var(--vscode-button-background)'; }}
				@click=${props.onGetStarted}
			>${buttonLabel}</button>
		</div>
	`;
}
