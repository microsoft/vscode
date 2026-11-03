/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, setVisibility } from '../../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ICommandService, CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
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
	/** Whether the banner is shown, see {@link canShowAgentsBanner}. */
	readonly visible: IObservable<boolean>;
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
	/**
	 * Shows the experimental graphic selected by {@link ChatConfiguration.WelcomePageAgentsWindowGraphic}
	 * above the button, so that it hides together with the button. The setting's experiment trigger is
	 * logged in every experiment arm once the banner is visible while `isExposed` is true, that is, when
	 * the user could see the graphic.
	 *
	 * The trigger of {@link ChatConfiguration.WelcomePageAgentsWindowSectionStyle} is logged in the same
	 * moment once `shownDesign` has a value, since that style only applies while a graphic is shown. It
	 * doesn't wait for the page to decide whether the graphic fits, because the style changes that decision.
	 */
	readonly graphic?: { readonly element: HTMLElement; readonly shownDesign: IObservable<unknown>; readonly isExposed: IObservable<boolean> };
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
	const element = $(`.${options.cssClass}`, {}, ...(options.graphic ? [options.graphic.element] : []), button);
	const visible = observableValue<boolean>('agentsBannerVisible', false);
	const updateVisibility = () => {
		const isVisible = canShowAgentsBanner(chatEntitlementService, configurationService);
		setVisibility(isVisible, element);
		button.disabled = !isVisible;
		visible.set(isVisible, undefined);
	};
	updateVisibility();
	if (options.graphic) {
		const { shownDesign, isExposed } = options.graphic;
		disposables.add(autorun(reader => {
			if (!visible.read(reader) || !isExposed.read(reader)) {
				return;
			}
			logSettingExperimentTrigger(telemetryService, ChatConfiguration.WelcomePageAgentsWindowGraphic);
			if (shownDesign.read(reader) !== undefined) {
				logSettingExperimentTrigger(telemetryService, ChatConfiguration.WelcomePageAgentsWindowSectionStyle);
			}
		}));
	}
	disposables.add(chatEntitlementService.onDidChangeSentiment(updateVisibility));
	disposables.add(configurationService.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
			updateVisibility();
		}
	}));
	let accountResolved = false;
	const shouldOfferSignIn = () => accountResolved && defaultAccountService?.currentDefaultAccount === null && configurationService.getValue<boolean>(ChatConfiguration.WelcomePageSignInEnabled) !== false;
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

	return { element, disposables, visible };
}
