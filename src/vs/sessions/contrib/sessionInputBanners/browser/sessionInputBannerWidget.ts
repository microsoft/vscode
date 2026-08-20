/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionInputBanners.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import type { ThemeIcon } from '../../../../base/common/themables.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { chartsOrange } from '../../../../platform/theme/common/colors/chartsColors.js';

/**
 * Delay before the working border is shown while the chat model loads.
 */
const SHOW_WORKING_DELAY_MS = 1_000;

export interface ISessionInputBannerAction {
	readonly label: string;
	/** Renders the action with the prominent button colors. */
	readonly primary?: boolean;
	/**
	 * Waits until the action can run. The primary button is disabled immediately
	 * and the banner shows progress when this takes longer than one second.
	 */
	readonly waitUntilReady?: () => Promise<boolean>;
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
	readonly dismissTooltip?: string;
	dismiss?(): void;
}

/**
 * A single, self-contained banner card rendered directly above the chat input.
 * Shows a leading icon, an ellipsized line of text, a floating right-aligned
 * button bar, and a dismiss (x) button. Purely presentational — all behavior is
 * provided by the {@link ISessionInputBanner} passed in.
 */
export class SessionInputBannerWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _buttons: Array<{ readonly button: Button; readonly primary: boolean }> = [];
	private readonly _showWorkingAnimation = this._register(new MutableDisposable());

	private _runningPrimaryAction = false;
	private _disposed = false;

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
			this._buttons.push({ button, primary: !!action.primary });
			this._register(button.onDidClick(() => { void this._runAction(action).catch(onUnexpectedError); }));
		}

		if (banner.dismiss && banner.dismissTooltip) {
			const dismiss = dom.append(this.domNode, dom.$('button.session-input-banner-dismiss')) as HTMLButtonElement;
			dismiss.type = 'button';
			dismiss.setAttribute('aria-label', banner.dismissTooltip);
			dismiss.appendChild(renderIcon(Codicon.close));
			this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), dismiss, banner.dismissTooltip));
			this._register(dom.addDisposableListener(dismiss, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				banner.dismiss?.();
			}));
		}
	}

	private async _runAction(action: ISessionInputBannerAction): Promise<void> {
		if (!action.primary) {
			await action.run();
			return;
		}
		if (this._runningPrimaryAction) {
			return;
		}

		this._runningPrimaryAction = true;
		this._setPrimaryButtonsEnabled(false);
		try {
			if (action.waitUntilReady && !await this._waitUntilReady(action.waitUntilReady)) {
				return;
			}
			// Readiness can resolve after the banner was replaced or torn down
			// (e.g. the comments it acted on disappeared), and running then would
			// act on state this banner no longer represents.
			if (this._disposed) {
				return;
			}
			await action.run();
		} finally {
			this._setPrimaryButtonsEnabled(true);
			this._runningPrimaryAction = false;
		}
	}

	private async _waitUntilReady(waitUntilReady: () => Promise<boolean>): Promise<boolean> {
		this.domNode.setAttribute('aria-busy', 'true');
		this._showWorkingAnimation.value = disposableTimeout(() => this.domNode.classList.add('working'), SHOW_WORKING_DELAY_MS);
		try {
			return await waitUntilReady();
		} finally {
			this._showWorkingAnimation.clear();
			this.domNode.classList.remove('working');
			this.domNode.setAttribute('aria-busy', 'false');
		}
	}

	setWorking(working: boolean): void {
		this.domNode.classList.toggle('working', working);
		this.domNode.setAttribute('aria-busy', String(working));
		this._setPrimaryButtonsEnabled(!working);
	}

	private _setPrimaryButtonsEnabled(enabled: boolean): void {
		if (this._disposed) {
			return;
		}
		for (const { button, primary } of this._buttons) {
			if (primary) {
				button.enabled = enabled;
			}
		}
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}
}
