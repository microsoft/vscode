/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/welcomeSignInCard.css';
import { $, reset } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatConfiguration, getWelcomeSignInStyle, WelcomeSignInStyle } from '../../common/constants.js';

/** A style that shows a card, that is, any but {@link WelcomeSignInStyle.Button}. */
export type WelcomeSignInCardStyle = Exclude<WelcomeSignInStyle, WelcomeSignInStyle.Button>;

/** Whether the user hid the sign-in card, on every machine that syncs the profile. */
const HIDDEN_STORAGE_KEY = 'chat.welcomePage.signIn.cardHidden';

/** Shows the sign-in card again after the user hid it, see {@link WelcomeSignInCard.hide}. */
export function resetWelcomeSignInCardHidden(storageService: IStorageService): void {
	storageService.remove(HIDDEN_STORAGE_KEY, StorageScope.PROFILE);
}

/**
 * The content of the card selected by {@link ChatConfiguration.WelcomePageSignInStyle}, which explains to signed-out users what
 * signing in with GitHub brings. The banner that hosts it decides when it is shown and adds its sign-in button.
 */
export class WelcomeSignInCard extends Disposable {

	readonly element: HTMLElement;

	/** The selected style. {@link WelcomeSignInStyle.Button} shows no card. */
	readonly style: IObservable<WelcomeSignInStyle>;

	/** Whether the user hid the card, which brings back the sign-in button on its own. */
	readonly hidden: IObservable<boolean>;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.element = $('.welcome-sign-in-card-content');
		this.style = observableFromEvent(this,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.WelcomePageSignInStyle)),
			() => getWelcomeSignInStyle(configurationService),
		);
		this.hidden = observableFromEvent(this,
			storageService.onDidChangeValue(StorageScope.PROFILE, HIDDEN_STORAGE_KEY, this._store),
			() => storageService.getBoolean(HIDDEN_STORAGE_KEY, StorageScope.PROFILE, false),
		);
		this._register(autorun(reader => {
			const style = this.style.read(reader);
			reset(this.element, ...(style === WelcomeSignInStyle.Button ? [] : renderWelcomeSignInCardContent(style)));
		}));
	}

	/** Hides the card in this profile, also on other machines that sync it, until {@link resetWelcomeSignInCardHidden}. */
	hide(): void {
		this.storageService.store(HIDDEN_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
	}
}

/** Renders the GitHub mark, and the title and benefits of a card style, or for the compact card, its one sentence. */
export function renderWelcomeSignInCardContent(style: WelcomeSignInCardStyle): HTMLElement[] {
	const mark = $('.welcome-sign-in-card-mark', { 'aria-hidden': 'true' }, $(ThemeIcon.asCSSSelector(Codicon.githubInverted)));
	if (style === WelcomeSignInStyle.CompactCard) {
		return [mark, $('.welcome-sign-in-card-summary', {}, localize('welcomeSignIn.compact', "Sign in with GitHub to use GitHub Copilot and work with your pull requests, issues and repositories."))];
	}
	const { title, benefits } = style === WelcomeSignInStyle.CopilotCard
		? {
			title: localize('welcomeSignIn.copilot.buildTitle', "Build software with GitHub Copilot agents"),
			benefits: [
				[Codicon.copilotCompact, localize('welcomeSignIn.copilot.free', "Try the free GitHub Copilot features")],
				[Codicon.agentCompact, localize('welcomeSignIn.copilot.handOffTasks', "Hand off tasks to powerful agents that plan, code and test")],
				[Codicon.windowCompact, localize('welcomeSignIn.copilot.agentsWindow', "Run several agents at once in the new Agents window")],
			] as const,
		}
		: {
			title: localize('welcomeSignIn.github.title', "Connect VS Code to GitHub"),
			benefits: [
				[Codicon.gitPullRequest, localize('welcomeSignIn.github.pullRequests', "Work with your pull requests and issues")],
				[Codicon.repoCompact, localize('welcomeSignIn.github.repositories', "Clone and publish your repositories")],
				[Codicon.copilotCompact, localize('welcomeSignIn.github.copilot', "Use GitHub Copilot to chat, edit and run agents")],
			] as const,
		};
	return [
		mark,
		$('.welcome-sign-in-card-text', {},
			$('.welcome-sign-in-card-title', { role: 'heading', 'aria-level': '2' }, title),
			$('ul.welcome-sign-in-card-benefits', {}, ...benefits.map(([icon, text]) => $('li', {}, $(ThemeIcon.asCSSSelector(icon), { 'aria-hidden': 'true' }), $('span', {}, text)))),
		),
	];
}
