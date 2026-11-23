/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventHelper, EventType, getWindow, isAncestorOfActiveElement, setVisibility } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { toAction } from '../../../../../base/common/actions.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ICommandService, CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { logExperimentTrigger, logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

import { AgentsWindowGraphicVariant, ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/constants.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT, AGENTS_WINDOW_BANNER_TITLE_TREATMENT, AgentsWindowGraphicDesign } from './agentsWindowGraphic.js';


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

export interface IAgentsBannerOptions {
	/** Dot-separated CSS classes for the banner container (e.g. 'my-banner' or 'foo.bar'). */
	readonly cssClass: string;
	/**
	 * Shows the experimental graphic selected by {@link ChatConfiguration.WelcomePageAgentsWindowGraphic}
	 * before the button, so that it hides together with the button. The setting's experiment trigger is
	 * logged in every experiment arm once the banner is visible to a signed-in user while `isExposed` is true,
	 * that is, when the user could see the graphic. Graphics are only shown to signed-in users, so signed-out
	 * users, who see the sign-in action instead, don't count in any arm.
	 *
	 * The trigger of {@link ChatConfiguration.WelcomePageAgentsWindowSectionStyle} is logged in the same
	 * moment once `design` is {@link AgentsWindowGraphicVariant.WindowComparison}, since that style only
	 * applies to that graphic. It doesn't wait for the page to decide whether the graphic fits, because the
	 * style changes that decision.
	 *
	 * The trigger of {@link ChatConfiguration.WelcomePageCardSurface} is logged in the same moment once `design` is
	 * {@link AgentsWindowGraphicVariant.Banner}, since the surface applies to the banner. The triggers of
	 * {@link AGENTS_WINDOW_BANNER_TITLE_TREATMENT} and {@link AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT} are logged once,
	 * in addition, `bannerCopyResolved` is true, that is, once the banner shows the text of the user's experiment arm.
	 * None of the triggers depends on whether the user hid the graphic.
	 *
	 * While `shownDesign` is {@link AgentsWindowGraphicVariant.Banner}, the button is the banner's primary action.
	 * While a graphic is shown, the banner's context menu offers to hide it with `hide`.
	 */
	readonly graphic?: {
		readonly element: HTMLElement;
		readonly design: IObservable<AgentsWindowGraphicDesign | undefined>;
		readonly shownDesign: IObservable<AgentsWindowGraphicDesign | undefined>;
		readonly signedIn: IObservable<boolean>;
		readonly isExposed: IObservable<boolean>;
		readonly bannerCopyResolved: IObservable<boolean>;
		hide(): void;
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
	contextMenuService: IContextMenuService,
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
		const { design, signedIn, isExposed, bannerCopyResolved } = options.graphic;
		disposables.add(autorun(reader => {
			if (!visible.read(reader) || !signedIn.read(reader) || !isExposed.read(reader)) {
				return;
			}
			logSettingExperimentTrigger(telemetryService, ChatConfiguration.WelcomePageAgentsWindowGraphic);
			const selected = design.read(reader);
			if (selected === AgentsWindowGraphicVariant.WindowComparison) {
				logSettingExperimentTrigger(telemetryService, ChatConfiguration.WelcomePageAgentsWindowSectionStyle);
			}
			if (selected === AgentsWindowGraphicVariant.Banner) {
				logSettingExperimentTrigger(telemetryService, ChatConfiguration.WelcomePageCardSurface);
				if (bannerCopyResolved.read(reader)) {
					logExperimentTrigger(telemetryService, AGENTS_WINDOW_BANNER_TITLE_TREATMENT);
					logExperimentTrigger(telemetryService, AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT);
				}
			}
		}));
		registerHideGraphicContextMenu(element, button, options.graphic, contextMenuService, telemetryService, disposables);
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
		// The banner's text already introduces the Agents window, so its button is a plain primary action.
		const isBanner = options.graphic?.shownDesign.get() === AgentsWindowGraphicVariant.Banner;
		const buttonText = offerSignIn ? localize('agentsBanner.signIn', "Sign in to GitHub") : isBanner ? localize('agentsBanner.openAgentsWindow', "Open Agents Window") : label;
		button.title = buttonText;
		buttonLabel.textContent = buttonText;
		button.classList.toggle('emphasis', isBanner);
		icon.style.display = isBanner ? 'none' : '';
		icon.classList.toggle('codicon-github', offerSignIn);
		icon.classList.toggle('codicon-agent', !offerSignIn);
	};
	updateButton();
	if (options.graphic) {
		const { shownDesign } = options.graphic;
		disposables.add(autorun(reader => {
			shownDesign.read(reader);
			updateButton();
		}));
	}
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

/**
 * While the graphic is shown, right-clicking the banner, or pressing Shift+F10 or the context menu key in it, offers to hide the graphic.
 * The button stays. When the menu was opened from the keyboard, the button keeps focus, even if the page moves it.
 */
function registerHideGraphicContextMenu(element: HTMLElement, button: HTMLButtonElement, graphic: NonNullable<IAgentsBannerOptions['graphic']>, contextMenuService: IContextMenuService, telemetryService: ITelemetryService, disposables: DisposableStore): void {
	// The page can also drop the graphic when it doesn't fit.
	const isGraphicShown = () => graphic.shownDesign.get() !== undefined && getWindow(element).getComputedStyle(graphic.element).display !== 'none';
	const showContextMenu = (mouseEvent: StandardMouseEvent | undefined) => {
		const hadFocus = isAncestorOfActiveElement(element);
		contextMenuService.showContextMenu({
			getAnchor: () => mouseEvent ?? button,
			// From the keyboard, select the action so that Enter runs it.
			autoSelectItem: !mouseEvent,
			getActions: () => [toAction({
				id: 'agentsBanner.hideGraphic',
				label: localize('agentsBanner.hide', "Hide"),
				run: () => {
					telemetryService.publicLog2<AgentsBannerClickedEvent, AgentsBannerClickedClassification>('agentsBanner.clicked', { source: 'welcomePage', action: 'hideGraphic' });
					graphic.hide();
					if (hadFocus) {
						button.focus();
					}
				},
			})],
		});
	};
	disposables.add(addDisposableListener(element, EventType.CONTEXT_MENU, e => {
		if (isGraphicShown()) {
			EventHelper.stop(e, true);
			showContextMenu(new StandardMouseEvent(getWindow(element), e));
		}
	}));
	disposables.add(addDisposableListener(element, EventType.KEY_DOWN, e => {
		const event = new StandardKeyboardEvent(e);
		if ((event.equals(KeyMod.Shift | KeyCode.F10) || event.equals(KeyCode.ContextMenu)) && isGraphicShown()) {
			event.preventDefault();
			event.stopPropagation();
			showContextMenu(undefined);
		}
	}));
}
