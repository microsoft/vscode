/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { FONT_SIZE, addKeyboardActivation } from './tokens.js';

export interface OnboardingProps {
	readonly pttKeyLabel: string | undefined;
	readonly isConnecting: boolean;
	readonly onGetStarted: (e: MouseEvent) => void;
	readonly onOpenPttKeySettings: (e: MouseEvent) => void;
	readonly onOpenPopout: ((e: MouseEvent) => void) | undefined;
}

const ONBOARDING_FONT = '13px';
const ONBOARDING_ICON_LG = '18px';

export interface OnboardingComponent {
	readonly element: HTMLElement;
	update(props: OnboardingProps): void;
}

export function createOnboarding(): OnboardingComponent {
	const container = dom.$('div');
	container.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:8px 0;';

	const title = dom.$('span');
	title.style.cssText = 'font-size:14px;font-weight:600;color:var(--vscode-foreground);';
	title.textContent = localize('agentsVoice.welcomeTitle', "Welcome to Voice Chat");

	const descSection = dom.$('div');
	descSection.style.cssText = `display:flex;flex-direction:column;gap:10px;font-size:${ONBOARDING_FONT};color:var(--vscode-foreground);line-height:1.5;`;

	// Welcome description row
	const welcomeRow = dom.$('div');
	welcomeRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
	const welcomeIconWrap = dom.$('span');
	welcomeIconWrap.style.cssText = 'display:flex;justify-content:center;align-items:center;width:24px;flex-shrink:0;';
	const welcomeIcon = dom.$('span.codicon.codicon-sparkle');
	welcomeIcon.style.fontSize = '20px';
	welcomeIconWrap.append(welcomeIcon);
	const welcomeText = dom.$('span');
	welcomeText.textContent = localize('agentsVoice.welcomeDesc', "Speak to an assistant that controls multiple coding agents at once. Get notified when work is done or input is needed.");
	welcomeRow.append(welcomeIconWrap, welcomeText);

	// PTT row
	const pttRow = dom.$('div');
	pttRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
	const pttIconWrap = dom.$('span');
	pttIconWrap.style.cssText = 'display:flex;justify-content:center;align-items:center;width:24px;flex-shrink:0;';
	const pttKeyChip = dom.$('span');
	pttKeyChip.role = 'button';
	pttKeyChip.tabIndex = 0;
	pttKeyChip.ariaLabel = localize('agentsVoice.changePttKey', "Change push-to-talk key");
	pttKeyChip.style.cssText = `font-size:${FONT_SIZE.micro};padding:1px 4px;border:1px solid var(--vscode-descriptionForeground);border-radius:3px;line-height:1;color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;`;
	addKeyboardActivation(pttKeyChip);
	pttIconWrap.append(pttKeyChip);

	const pttTextSpan = dom.$('span');
	const pttStrong = dom.$('strong');
	pttStrong.textContent = localize('agentsVoice.pttDesc', "Push-to-talk");
	const pttHold = document.createTextNode(' ' + localize('agentsVoice.pttHoldDesc', "— hold the key while speaking, release when done.") + ' ');
	const pttLink = document.createElement('a');
	pttLink.href = '#';
	pttLink.style.cssText = 'color:var(--vscode-textLink-foreground);cursor:pointer;text-decoration:none;';
	pttLink.textContent = localize('agentsVoice.configureHotkey', "Configure a keybinding");
	const pttSuffix = document.createTextNode(' ' + localize('agentsVoice.changeHotkeySuffix', "to use it from any app."));
	pttTextSpan.append(pttStrong, pttHold, pttLink, pttSuffix);
	pttRow.append(pttIconWrap, pttTextSpan);

	// Feedback row
	const feedbackRow = dom.$('div');
	feedbackRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
	const feedbackIconWrap = dom.$('span');
	feedbackIconWrap.style.cssText = 'display:flex;justify-content:center;align-items:center;width:24px;flex-shrink:0;';
	const feedbackIcon = dom.$('span.codicon.codicon-feedback');
	feedbackIcon.style.fontSize = ONBOARDING_ICON_LG;
	feedbackIconWrap.append(feedbackIcon);
	const feedbackText = dom.$('span');
	feedbackText.textContent = localize('agentsVoice.feedbackDesc', "Use the feedback icon to help us improve your experience.");
	feedbackRow.append(feedbackIconWrap, feedbackText);

	// Mini-view row (conditionally shown)
	const miniViewRow = dom.$('div');
	miniViewRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
	const miniViewIconWrap = dom.$('span');
	miniViewIconWrap.style.cssText = 'display:flex;justify-content:center;align-items:center;width:24px;flex-shrink:0;';
	const miniViewIcon = dom.$('span.codicon.codicon-link-external');
	miniViewIcon.style.fontSize = FONT_SIZE.iconSm;
	miniViewIconWrap.append(miniViewIcon);
	const miniViewTextSpan = dom.$('span');
	const miniViewLink = document.createElement('a');
	miniViewLink.href = '#';
	miniViewLink.style.cssText = 'color:var(--vscode-textLink-foreground);cursor:pointer;text-decoration:none;';
	miniViewLink.textContent = localize('agentsVoice.openMiniView', "Open the mini-view");
	const miniViewSuffix = document.createTextNode(' ' + localize('agentsVoice.miniViewSuffix', "to multitask while VS Code is not in the foreground."));
	miniViewTextSpan.append(miniViewLink, miniViewSuffix);
	miniViewRow.append(miniViewIconWrap, miniViewTextSpan);

	descSection.append(welcomeRow, pttRow, feedbackRow, miniViewRow);

	// Get Started button
	const button = document.createElement('button');
	button.style.cssText = `-webkit-app-region:no-drag;background:var(--vscode-button-background);border:none;color:var(--vscode-button-foreground);font-size:${ONBOARDING_FONT};padding:6px 14px;border-radius:3px;font-weight:500;align-self:stretch;margin-top:2px;`;
	button.addEventListener('mouseenter', () => { if (!button.disabled) { button.style.background = 'var(--vscode-button-hoverBackground)'; } });
	button.addEventListener('mouseleave', () => { button.style.background = 'var(--vscode-button-background)'; });

	container.append(title, descSection, button);

	return {
		element: container,
		update(props: OnboardingProps) {
			pttKeyChip.textContent = props.pttKeyLabel ?? 'Space';
			pttKeyChip.onclick = (e) => { e.preventDefault(); props.onOpenPttKeySettings(e); };
			pttLink.onclick = (e) => { e.preventDefault(); props.onOpenPttKeySettings(e); };

			miniViewRow.style.display = props.onOpenPopout ? 'flex' : 'none';
			if (props.onOpenPopout) {
				miniViewLink.onclick = (e) => { e.preventDefault(); props.onOpenPopout!(e); };
			}

			button.disabled = props.isConnecting;
			button.style.cursor = props.isConnecting ? 'default' : 'pointer';
			button.style.opacity = props.isConnecting ? '0.7' : '1';
			button.textContent = props.isConnecting
				? localize('agentsVoice.connecting', "Connecting…")
				: localize('agentsVoice.getStarted', "Get Started");
			button.onclick = props.onGetStarted;
		}
	};
}
