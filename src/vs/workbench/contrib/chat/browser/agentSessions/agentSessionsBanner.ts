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
import { logExperimentTrigger, logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
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
	/** Whether the banner is shown, that is, whether {@link isAgentsWindowAvailable} holds. */
	readonly visible: IObservable<boolean>;
}

/**
 * Returns whether the desktop Agents window is available and agent mode and AI features are enabled.
 * The banner is shown while this holds, and its button either offers GitHub sign-in or opens the
 * Agents window (see {@link createAgentsBanner}).
 *
 * Matches `OPEN_AGENTS_WINDOW_PRECONDITION`: chat that is merely disabled does not count as
 * unavailable, because new profiles keep the chat extension disabled until chat setup completes.
 */
export function isAgentsWindowAvailable(chatEntitlementService: IChatEntitlementService, configurationService: IConfigurationService): boolean {
	const sentiment = chatEntitlementService.sentiment;
	if (sentiment.hidden || sentiment.disabledInWorkspace || configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled) === false) {
		return false;
	}
	return !!CommandsRegistry.getCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID);
}

/**
 * The experiment trigger that the banner logs in every arm of the {@link ChatConfiguration.WelcomePageAgentsWindowGraphic}
 * experiment when the graphic could be seen while more than one editor window is open. Only then does the `auto` graphic
 * differ from `windowComparison` (it shows `manyWindowsToOne`), so this limits an analysis to where these arms differ.
 */
export const AGENTS_WINDOW_GRAPHIC_MULTIPLE_EDITOR_WINDOWS_TREATMENT = `config.${ChatConfiguration.WelcomePageAgentsWindowGraphic}.multipleEditorWindows`;

export interface IAgentsBannerOptions {
	/** Dot-separated CSS classes for the banner container (e.g. 'my-banner' or 'foo.bar'). */
	readonly cssClass: string;
	/**
	 * Shows the experimental graphic selected by {@link ChatConfiguration.WelcomePageAgentsWindowGraphic}
	 * above the button, so that it hides together with the button. The setting's experiment trigger is
	 * logged in every experiment arm once the banner is visible while `isExposed` is true, that is, when
	 * the user could see the graphic.
	 *
	 * The trigger of {@link ChatConfiguration.WelcomePageAgentsWindowSectionStyle} is logged in the same
	 * moment once `shownDesign` has a value, since that style only applies while a graphic is shown. It
	 * doesn't wait for the page to decide whether the graphic fits, because the style changes that decision.
	 *
	 * {@link AGENTS_WINDOW_GRAPHIC_MULTIPLE_EDITOR_WINDOWS_TREATMENT} is logged in the same moment once
	 * `hasMultipleEditorWindows` is true.
	 */
	readonly graphic?: {
		readonly element: HTMLElement;
		readonly shownDesign: IObservable<unknown>;
		readonly isExposed: IObservable<boolean>;
		readonly hasMultipleEditorWindows: IObservable<boolean | undefined>;
	};
}

/**
 * Creates a button that opens the Agents window, or offers GitHub sign-in when enabled.
 */
export function createAgentsBanner(
	options: IAgentsBannerOptions,
	commandService: ICommandService,
	telemetryService: ITelemetryService,
	configurationService: IConfigurationService,
	chatEntitlementService: IChatEntitlementService,
	defaultAccountService: IDefaultAccountService,
): IAgentsBannerResult {
	const disposables = new DisposableStore();
	const label = localize('agentsBanner.tryAgentsAppLabel', "Try out the new Agents window");

	const icon = $('.codicon.icon-widget', { 'aria-hidden': 'true' });
	const buttonLabel = $('span.category-title');
	const button = $<HTMLButtonElement>('button.agents-banner-button', {}, icon, buttonLabel);
	const element = $(`.${options.cssClass}`, {}, ...(options.graphic ? [options.graphic.element] : []), button);
	const visible = observableValue<boolean>('agentsBannerVisible', false);
	const updateVisibility = () => {
		const isVisible = isAgentsWindowAvailable(chatEntitlementService, configurationService);
		setVisibility(isVisible, element);
		button.disabled = !isVisible;
		visible.set(isVisible, undefined);
	};
	updateVisibility();
	if (options.graphic) {
		const { shownDesign, isExposed, hasMultipleEditorWindows } = options.graphic;
		disposables.add(autorun(reader => {
			if (!visible.read(reader) || !isExposed.read(reader)) {
				return;
			}
			logSettingExperimentTrigger(telemetryService, ChatConfiguration.WelcomePageAgentsWindowGraphic);
			if (shownDesign.read(reader) !== undefined) {
				logSettingExperimentTrigger(telemetryService, ChatConfiguration.WelcomePageAgentsWindowSectionStyle);
			}
			if (hasMultipleEditorWindows.read(reader)) {
				logExperimentTrigger(telemetryService, AGENTS_WINDOW_GRAPHIC_MULTIPLE_EDITOR_WINDOWS_TREATMENT);
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
	const shouldOfferSignIn = () => accountResolved && defaultAccountService.currentDefaultAccount === null && configurationService.getValue<boolean>(ChatConfiguration.WelcomePageSignInEnabled) !== false;
	const updateButton = () => {
		const offerSignIn = shouldOfferSignIn();
		const buttonText = offerSignIn ? localize('agentsBanner.signIn', "Sign in to GitHub") : label;
		button.title = buttonText;
		buttonLabel.textContent = buttonText;
		icon.classList.toggle('codicon-github', offerSignIn);
		icon.classList.toggle('codicon-agent', !offerSignIn);
	};
	updateButton();
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

	disposables.add(addDisposableListener(button, 'click', () => {
		if (shouldOfferSignIn()) {
			telemetryService.publicLog2<AgentsBannerClickedEvent, AgentsBannerClickedClassification>('agentsBanner.clicked', { source: 'welcomePage', action: 'signIn' });
			defaultAccountService.signIn().catch(onUnexpectedError);
			return;
		}

		telemetryService.publicLog2<AgentsBannerClickedEvent, AgentsBannerClickedClassification>('agentsBanner.clicked', { source: 'welcomePage', action: 'openAgentsWindow' });
		commandService.executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { source: AgentsWindowOpenSource.WelcomeTryOut }).catch(onUnexpectedError);
	}));

	return { element, disposables, visible };
}
