/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionInputBanners.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import type { ThemeIcon } from '../../../../base/common/themables.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { chartsOrange } from '../../../../platform/theme/common/colors/chartsColors.js';

/**
 * Delay before the "working" border animation is shown after an async action
 * starts. Actions that settle faster than this don't animate, avoiding a
 * loading flicker for very fast work.
 */
const SHOW_WORKING_DELAY_MS = 50;

export interface ISessionInputBannerAction {
	readonly label: string;
	/** Renders the action with the prominent button colors. */
	readonly primary?: boolean;
	/**
	 * Runs the action. When a {@link Promise} is returned, the banner shows an
	 * animated "working" border and disables its buttons until it settles.
	 */
	run(): void | Promise<unknown>;
}

export interface ISessionInputBanner {
	readonly icon: ThemeIcon;
	/** Use the orange accent (border + icon) reserved for CI failures. */
	readonly accent: boolean;
	/** Single-line text; ellipsized when it does not fit next to the actions. */
	readonly text: string;
	readonly ariaLabel: string;
	readonly actions: readonly ISessionInputBannerAction[];
	readonly dismissTooltip: string;
	dismiss(): void;
}

/**
 * A single, self-contained banner card rendered directly above the chat input.
 * Shows a leading icon, an ellipsized line of text, a floating right-aligned
 * button bar, and a dismiss (x) button. Purely presentational — all behavior is
 * provided by the {@link ISessionInputBanner} passed in.
 */
export class SessionInputBannerWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _buttons: Button[] = [];

	/** Guards against overlapping runs while an action is already in flight. */
	private _running = false;

	constructor(
		banner: ISessionInputBanner,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this.domNode = dom.$('.session-input-banner');
		this.domNode.classList.toggle('accent-orange', banner.accent);
		this.domNode.setAttribute('role', 'status');
		this.domNode.setAttribute('aria-label', banner.ariaLabel);

		const icon = dom.append(this.domNode, dom.$('.session-input-banner-icon'));
		icon.appendChild(renderIcon(banner.icon));

		const textEl = dom.append(this.domNode, dom.$('span.session-input-banner-text'));
		textEl.textContent = banner.text;
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), textEl, banner.text));

		const actions = dom.append(this.domNode, dom.$('.session-input-banner-actions'));
		for (const action of banner.actions) {
			// Primary uses the prominent button colors; secondary renders as a
			// ghost button (colors overridden to undefined so the CSS ghost
			// styles apply), mirroring the chat input notification widget.
			const button = this._register(new Button(actions, {
				...defaultButtonStyles,
				...(action.primary && banner.accent ? {
					buttonBackground: asCssVariable(chartsOrange),
					buttonHoverBackground: `color-mix(in srgb, ${asCssVariable(chartsOrange)} 88%, black)`,
					buttonBorder: asCssVariable(chartsOrange),
				} : {}),
				...(action.primary ? {} : {
					buttonBackground: undefined,
					buttonHoverBackground: undefined,
					buttonForeground: undefined,
					buttonSecondaryBackground: undefined,
					buttonSecondaryHoverBackground: undefined,
					buttonSecondaryForeground: undefined,
					buttonSecondaryBorder: undefined,
				}),
				secondary: !action.primary,
			}));
			button.element.classList.add('session-input-banner-action');
			button.label = action.label;
			button.element.ariaLabel = `${banner.ariaLabel} ${action.label}`;
			this._buttons.push(button);
			this._register(button.onDidClick(() => { void this._runAction(action); }));
		}

		const dismiss = dom.append(this.domNode, dom.$('button.session-input-banner-dismiss')) as HTMLButtonElement;
		dismiss.type = 'button';
		dismiss.setAttribute('aria-label', banner.dismissTooltip);
		dismiss.appendChild(renderIcon(Codicon.close));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), dismiss, banner.dismissTooltip));
		this._register(dom.addDisposableListener(dismiss, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			banner.dismiss();
		}));
	}

	/**
	 * Runs an action. When it returns a promise (e.g. the CI "Fix Checks"
	 * action, which fetches check annotations before submitting a prompt), the
	 * banner disables its buttons for the duration and shows an animated
	 * "working" border so the delay is visible to the user. Buttons are disabled
	 * immediately, but the animation is only shown once the work has been running
	 * for {@link SHOW_WORKING_DELAY_MS} so very fast actions don't cause a
	 * loading flicker. Never rejects: action errors are swallowed here since this
	 * is invoked fire-and-forget from the click handler (the action is
	 * responsible for surfacing its own errors).
	 */
	private async _runAction(action: ISessionInputBannerAction): Promise<void> {
		if (this._running) {
			return;
		}
		let result: void | Promise<unknown>;
		try {
			result = action.run();
		} catch {
			return;
		}
		if (!result) {
			return;
		}
		this._running = true;
		// Disable the buttons immediately while the action is pending, but delay
		// showing the animated border so very fast actions don't flicker.
		this._setButtonsEnabled(false);
		const showAnimation = disposableTimeout(() => this.domNode.classList.add('working'), SHOW_WORKING_DELAY_MS);
		try {
			await result;
		} catch {
			// Swallow: the action logs/surfaces its own errors and this handler
			// is fire-and-forget, so it must not produce an unhandled rejection.
		} finally {
			showAnimation.dispose();
			this.domNode.classList.remove('working');
			this._setButtonsEnabled(true);
			this._running = false;
		}
	}

	/**
	 * Renders the in-flight "working" state: shows the animated border and
	 * disables the action buttons. Intended for fixtures/tests that need to
	 * display the loading appearance statically; production toggles this state
	 * via {@link _runAction} (which additionally delays the animation).
	 */
	setWorking(working: boolean): void {
		this.domNode.classList.toggle('working', working);
		this._setButtonsEnabled(!working);
	}

	private _setButtonsEnabled(enabled: boolean): void {
		for (const button of this._buttons) {
			button.enabled = enabled;
		}
	}
}
