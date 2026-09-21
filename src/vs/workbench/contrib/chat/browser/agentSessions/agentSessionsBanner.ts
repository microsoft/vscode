/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, setVisibility } from '../../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICommandService, CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

import { ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/constants.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';


type AgentsBannerClickedEvent = {
	source: string;
	action: string;
};

type AgentsBannerClickedClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the banner was clicked from.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action taken on the banner.' };
	owner: 'benibenj';
	comment: 'Tracks clicks on the agents app banner across welcome pages.';
};

export interface IAgentsBannerResult {
	readonly element: HTMLElement;
	readonly disposables: DisposableStore;
}

/** Returns whether the desktop Agents window is available and agent mode and AI features are enabled. */
export function canShowAgentsBanner(chatEntitlementService: IChatEntitlementService, configurationService: IConfigurationService): boolean {
	const sentiment = chatEntitlementService.sentiment;
	if (sentiment.hidden || sentiment.disabled || configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled) === false) {
		return false;
	}
	return !!CommandsRegistry.getCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID);
}

export interface IAgentsBannerOptions {
	/** Dot-separated CSS classes for the banner container (e.g. 'my-banner' or 'foo.bar'). */
	readonly cssClass: string;
	/** Identifies where the banner is displayed (e.g. 'welcomePage', 'agentSessionsWelcome'). */
	readonly source: 'welcomePage' | 'agentSessionsWelcome';
	/** Override the default button label. */
	readonly label?: string;
	/** Optional callback invoked when the banner opens the Agents window. */
	readonly onButtonClick?: () => void;
}

/**
 * Creates a button that opens the Agents window, or offers GitHub sign-in when enabled and an account service is provided.
 */
export function createAgentsBanner(
	options: IAgentsBannerOptions,
	commandService: ICommandService,
	telemetryService: ITelemetryService,
	configurationService: IConfigurationService,
	chatEntitlementService: IChatEntitlementService,
	defaultAccountService?: IDefaultAccountService,
): IAgentsBannerResult {
	const disposables = new DisposableStore();
	const label = options.label ?? localize('agentsBanner.tryAgentsAppLabel', "Try out the new Agents window");

	const icon = $('.codicon.icon-widget', { 'aria-hidden': 'true' });
	const buttonLabel = $('span.category-title');
	const button = $<HTMLButtonElement>('button.agents-banner-button', {}, icon, buttonLabel);
	const element = $(`.${options.cssClass}`, {}, button);
	const updateVisibility = () => {
		const visible = canShowAgentsBanner(chatEntitlementService, configurationService);
		setVisibility(visible, element);
		button.disabled = !visible;
	};
	updateVisibility();
	disposables.add(chatEntitlementService.onDidChangeSentiment(updateVisibility));
	disposables.add(configurationService.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
			updateVisibility();
		}
	}));
	let accountResolved = false;
	const shouldOfferSignIn = () => accountResolved && defaultAccountService?.currentDefaultAccount === null && configurationService.getValue<boolean>(ChatConfiguration.WelcomePageSignInEnabled) === true;
	const updateButton = () => {
		const offerSignIn = shouldOfferSignIn();
		const buttonText = offerSignIn ? localize('agentsBanner.signIn', "Sign in to GitHub") : label;
		button.title = buttonText;
		buttonLabel.textContent = buttonText;
		icon.classList.toggle('codicon-github', offerSignIn);
		icon.classList.toggle('codicon-agent', !offerSignIn);
	};
	updateButton();
	if (defaultAccountService) {
		disposables.add(defaultAccountService.onDidChangeDefaultAccount(() => {
			accountResolved = true;
			updateButton();
		}));
		disposables.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.WelcomePageSignInEnabled)) {
				updateButton();
			}
		}));
		defaultAccountService.getDefaultAccount().then(() => {
			if (!disposables.isDisposed) {
				accountResolved = true;
				updateButton();
			}
		}).catch(onUnexpectedError);
	}

	disposables.add(addDisposableListener(button, 'click', () => {
		if (defaultAccountService && shouldOfferSignIn()) {
			telemetryService.publicLog2<AgentsBannerClickedEvent, AgentsBannerClickedClassification>('agentsBanner.clicked', { source: options.source, action: 'signIn' });
			defaultAccountService.signIn().catch(onUnexpectedError);
			return;
		}

		options.onButtonClick?.();
		telemetryService.publicLog2<AgentsBannerClickedEvent, AgentsBannerClickedClassification>('agentsBanner.clicked', { source: options.source, action: 'openAgentsWindow' });
		const source = options.source === 'welcomePage' ? AgentsWindowOpenSource.WelcomeTryOut : AgentsWindowOpenSource.WelcomeViewAll;
		commandService.executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { source }).catch(onUnexpectedError);
	}));

	return { element, disposables };
}
