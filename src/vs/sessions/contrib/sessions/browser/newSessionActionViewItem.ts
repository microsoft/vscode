/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, EventHelper, reset } from '../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IAction } from '../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { OS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { asCssVariable } from '../../../../platform/theme/common/colorRegistry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsTitleBarNewSessionEnabledContext } from '../../../common/contextkeys.js';
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from '../../../common/theme.js';
import { logSessionsInteraction, SessionsInteractionSource } from '../../../common/sessionsTelemetry.js';
import { NEW_SESSION_ACTION_ID } from '../../chat/common/constants.js';
import './media/newSessionActionViewItem.css';

/**
 * Renders the new-session action as the compact "New" pill, shared by the sessions sidebar
 * header and the titlebar.
 */
class NewSessionActionViewItem extends BaseActionViewItem {

	constructor(
		action: IAction,
		private readonly telemetrySource: SessionsInteractionSource,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IHoverService private readonly hoverService: IHoverService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		const newSessionButton = this._register(new Button(this.element, {
			...defaultButtonStyles,
			buttonSecondaryBackground: asCssVariable(agentsNewSessionButtonBackground),
			buttonSecondaryForeground: asCssVariable(agentsNewSessionButtonForeground),
			buttonSecondaryHoverBackground: asCssVariable(agentsNewSessionButtonHoverBackground),
			buttonSecondaryBorder: asCssVariable(agentsNewSessionButtonBorder),
			secondary: true,
			supportIcons: true,
		}));
		newSessionButton.element.classList.add('agent-sessions-compact-new-button');
		this._register(markOnboardingTarget(newSessionButton.element, 'sessions.newSession.button'));
		this._register(newSessionButton.onDidClick(e => {
			// Stop propagation so the parent <li> click handler doesn't run the action twice.
			EventHelper.stop(e, true);
			if (!this.action.enabled) {
				return;
			}
			logSessionsInteraction(this.telemetryService, 'newSession', this.telemetrySource);
			this.actionRunner.run(this.action);
		}));

		const newSessionLabel = localize('newCompact', "New");
		const buttonLabel = $('span.new-session-button-label', undefined, newSessionLabel);
		const keybindingHint = $('span.new-session-keybinding-hint');
		const keybindingHintLabel = this._register(new KeybindingLabel(keybindingHint, OS, {
			disableTitle: true,
			keybindingLabelBackground: 'transparent',
			keybindingLabelForeground: 'inherit',
			keybindingLabelBorder: 'transparent',
			keybindingLabelBottomBorder: undefined,
			keybindingLabelShadow: undefined,
		}));
		reset(newSessionButton.element, buttonLabel);

		const getNewSessionKeybinding = () => {
			const primaryKeybinding = this.keybindingService.lookupKeybinding(NEW_SESSION_ACTION_ID, this.contextKeyService, true);
			const resolvedKeybindings = this.keybindingService.lookupKeybindings(NEW_SESSION_ACTION_ID);
			return primaryKeybinding ?? resolvedKeybindings[0];
		};

		this._register(this.hoverService.setupDelayedHover(newSessionButton.element, () => {
			const keybindingLabel = getNewSessionKeybinding()?.getLabel() ?? undefined;
			return {
				content: keybindingLabel
					? localize('newSessionButtonTitle', "New Session ({0})", keybindingLabel)
					: localize('newSessionButtonTitleWithoutKeybinding', "New Session"),
				appearance: { compact: true },
				position: { hoverPosition: HoverPosition.BELOW },
			};
		}));

		let lastRenderedKeybindingLabel: string | undefined | null = null;
		let lastRenderedKeybindingAriaLabel: string | undefined | null = null;
		const updateNewSessionButton = () => {
			const keybinding = getNewSessionKeybinding();
			const keybindingLabel = keybinding?.getLabel() ?? undefined;
			const keybindingAriaLabel = keybinding?.getAriaLabel() ?? undefined;
			if (lastRenderedKeybindingLabel === keybindingLabel && lastRenderedKeybindingAriaLabel === keybindingAriaLabel) {
				return;
			}

			lastRenderedKeybindingLabel = keybindingLabel;
			lastRenderedKeybindingAriaLabel = keybindingAriaLabel;

			keybindingHintLabel.set(keybinding);
			if (keybinding) {
				if (keybindingHint.parentElement !== newSessionButton.element) {
					append(newSessionButton.element, keybindingHint);
				}
			} else {
				keybindingHint.remove();
			}

			newSessionButton.element.setAttribute('aria-label', keybindingAriaLabel
				? localize('newSessionButtonAriaLabel', "New Session ({0})", keybindingAriaLabel)
				: localize('newSessionButtonAriaLabelWithoutKeybinding', "New Session"));
		};
		this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateNewSessionButton));
	}
}

/**
 * Registers {@link NewSessionActionViewItem} in the sessions sidebar header and the titlebar.
 * The titlebar entry is gated behind an A/B experiment via {@link SessionsTitleBarNewSessionEnabledContext}.
 */
export class NewSessionActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.newSessionActionViewItem';

	/** ExP treatment that shows the new-session button in the titlebar. */
	private static readonly NEW_SESSION_TITLEBAR_TREATMENT = 'agentSessionsTitleBarNewSession';

	private readonly titleBarEnabledContext: IContextKey<boolean>;

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) {
		super();

		this.titleBarEnabledContext = SessionsTitleBarNewSessionEnabledContext.bindTo(contextKeyService);

		const onDidRegister = this._register(new Emitter<void>());
		const menus: MenuId[] = [Menus.SidebarSessionsHeader, Menus.TitleBarLeftLayout];
		for (const menu of menus) {
			const source: SessionsInteractionSource = menu === Menus.TitleBarLeftLayout ? 'titleBar' : 'sidebar';
			this._register(actionViewItemService.register(menu, NEW_SESSION_ACTION_ID, (action, _options, instantiationService) => {
				if (!(action instanceof MenuItemAction)) {
					return undefined;
				}
				return instantiationService.createInstance(NewSessionActionViewItem, action, source);
			}, onDidRegister.event));
		}
		onDidRegister.fire();

		// Resolve the titlebar experiment now and on refetch.
		this._register(this.assignmentService.onDidRefetchAssignments(() => this.updateTitleBarTreatment()));
		this.updateTitleBarTreatment();
	}

	private async updateTitleBarTreatment(): Promise<void> {
		// Always show in dev builds (running from sources) to ease development, regardless of the experiment.
		if (!this.environmentService.isBuilt) {
			this.titleBarEnabledContext.set(true);
			return;
		}
		const enabled = await this.assignmentService.getTreatment<boolean>(NewSessionActionViewItemContribution.NEW_SESSION_TITLEBAR_TREATMENT);
		this.titleBarEnabledContext.set(enabled === true);
	}
}
