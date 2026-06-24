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
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { NEW_SESSION_ACTION_ID } from '../../chat/common/constants.js';
import './media/newSessionActionViewItem.css';

/**
 * Renders the new-session action ({@link NEW_SESSION_ACTION_ID}) as the compact "New" pill
 * with an inline keybinding hint. Used wherever the action is contributed — the sessions
 * sidebar header and the titlebar — so both surfaces render the exact same affordance.
 */
class NewSessionActionViewItem extends BaseActionViewItem {

	constructor(
		action: IAction,
		private readonly inTitleBar: boolean,
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
			// The inner button lives inside this view item's <li>, whose click
			// listener (installed by BaseActionViewItem) would also run the action.
			// Stop propagation so the command runs exactly once, and run through the
			// action runner so the action's enabled state is respected.
			EventHelper.stop(e, true);
			if (!this.action.enabled) {
				return;
			}
			logSessionsInteraction(this.telemetryService, 'newSession', this.inTitleBar ? 'titleBar' : 'sidebar');
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
 * Registers {@link NewSessionActionViewItem} for the new-session action in every menu that
 * surfaces it (the sessions sidebar header and the titlebar's left toolbar). The factory is
 * announced once right after registration so a toolbar that was built before this contribution
 * ran re-renders and picks the widget up.
 *
 * The titlebar entry is additionally gated behind an A/B experiment: this contribution resolves
 * the {@link NEW_SESSION_TITLEBAR_TREATMENT} treatment and reflects it into
 * {@link SessionsTitleBarNewSessionEnabledContext}, which the titlebar menu's `when` clause
 * checks. The control group keeps the prior behaviour (no titlebar button) so we can measure how
 * the affordance moves new-session metrics before rolling it out.
 */
export class NewSessionActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.newSessionActionViewItem';

	/** ExP treatment that, when enabled, shows the new-session button in the titlebar. */
	private static readonly NEW_SESSION_TITLEBAR_TREATMENT = 'agentSessionsTitleBarNewSession';

	private readonly titleBarEnabledContext: IContextKey<boolean>;

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
	) {
		super();

		this.titleBarEnabledContext = SessionsTitleBarNewSessionEnabledContext.bindTo(contextKeyService);

		const onDidRegister = this._register(new Emitter<void>());
		const menus: MenuId[] = [Menus.SidebarSessionsHeader, Menus.TitleBarLeftLayout];
		for (const menu of menus) {
			const inTitleBar = menu === Menus.TitleBarLeftLayout;
			this._register(actionViewItemService.register(menu, NEW_SESSION_ACTION_ID, (action, _options, instantiationService) => {
				if (!(action instanceof MenuItemAction)) {
					return undefined;
				}
				return instantiationService.createInstance(NewSessionActionViewItem, action, inTitleBar);
			}, onDidRegister.event));
		}
		onDidRegister.fire();

		// Resolve the titlebar experiment now and whenever the assignment service refetches.
		this._register(this.assignmentService.onDidRefetchAssignments(() => this.updateTitleBarTreatment()));
		this.updateTitleBarTreatment();
	}

	private async updateTitleBarTreatment(): Promise<void> {
		const enabled = await this.assignmentService.getTreatment<boolean>(NewSessionActionViewItemContribution.NEW_SESSION_TITLEBAR_TREATMENT);
		this.titleBarEnabledContext.set(enabled === true);
	}
}
