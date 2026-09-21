/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionInputBanners.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button, ButtonWithDropdown, IButton, IButtonOptions } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import type { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { chartsOrange } from '../../../../platform/theme/common/colors/chartsColors.js';

/**
 * Delay before the working border is shown while the chat model loads.
 */
const SHOW_WORKING_DELAY_MS = 1_000;

export interface ISessionInputBannerAction {
	readonly id?: string;
	readonly label: string;
	/** Renders the action with the prominent button colors. */
	readonly primary?: boolean;
	/** Alternative actions offered from a split-button dropdown. */
	readonly dropdownActions?: readonly ISessionInputBannerAction[];
	/**
	 * Waits until the action can run. The primary button is disabled immediately
	 * and the banner shows progress when this takes longer than one second.
	 */
	readonly waitUntilReady?: () => Promise<boolean>;
	run(): void | Promise<unknown>;
}

export interface ISessionInputBanner {
	/** Stable identity used to preserve the selected carousel item across updates. */
	readonly id?: string;
	readonly icon: ThemeIcon;
	/** Use the orange accent (border + icon) reserved for CI failures. */
	readonly accent: boolean;
	/** Single-line text; ellipsized when it does not fit next to the actions. */
	readonly text: string;
	readonly ariaLabel: string;
	readonly actions: readonly ISessionInputBannerAction[];
	readonly reference?: {
		readonly label: string;
		readonly hover: string;
	};
	readonly dismissTooltip?: string;
	readonly focusAfterDismiss?: () => void;
	dismiss?(): void;
}

type BannerFocus =
	| { readonly kind: 'previous' | 'next'; readonly focusFallback: (() => void) | undefined }
	| { readonly kind: 'dismiss'; readonly focusAfterDismiss: (() => void) | undefined }
	| { readonly kind: 'action'; readonly index: number; readonly dropdown: boolean; readonly focusFallback: (() => void) | undefined };

/**
 * A single, self-contained banner card rendered directly above the chat input.
 * Shows a leading icon, an ellipsized line of text, a floating right-aligned
 * button bar, and a dismiss (x) button. Purely presentational — all behavior is
 * provided by the {@link ISessionInputBanner} passed in.
 */
export class SessionInputBannerWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _buttons: Array<{ readonly button: IButton; readonly primary: boolean }> = [];
	private readonly _showWorkingAnimation = this._register(new MutableDisposable());
	private readonly _content = this._register(new MutableDisposable<DisposableStore>());

	private _runningPrimaryAction = false;
	private _disposed = false;
	private _working = false;
	private _banners: readonly ISessionInputBanner[] = [];
	private _activeIndex = 0;
	private _previousButton: IButton | undefined;
	private _nextButton: IButton | undefined;
	private _dismissButton: HTMLButtonElement | undefined;

	constructor(
		banner: ISessionInputBanner | readonly ISessionInputBanner[],
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();

		this.domNode = dom.$('.session-input-banner');
		this.domNode.setAttribute('role', 'status');
		this.setBanners(Array.isArray(banner) ? banner : [banner]);
	}

	setBanners(banners: readonly ISessionInputBanner[]): void {
		const focus = this._captureFocus();
		const activeId = this._banners[this._activeIndex]?.id;
		this._banners = banners;
		const nextActiveIndex = activeId ? banners.findIndex(banner => banner.id === activeId) : -1;
		this._activeIndex = nextActiveIndex >= 0 ? nextActiveIndex : Math.min(this._activeIndex, Math.max(0, banners.length - 1));
		this._render(focus);
	}

	private _render(focus: BannerFocus | undefined = this._captureFocus()): void {
		const store = this._content.value = new DisposableStore();
		this._buttons.length = 0;
		this._previousButton = undefined;
		this._nextButton = undefined;
		this._dismissButton = undefined;
		dom.clearNode(this.domNode);

		const banner = this._banners[this._activeIndex];
		this.domNode.classList.toggle('empty', !banner);
		if (!banner) {
			this.domNode.removeAttribute('aria-label');
			this._restoreFocus(focus);
			return;
		}

		this.domNode.classList.toggle('accent-orange', banner.accent);
		this.domNode.setAttribute('aria-label', banner.ariaLabel);

		if (this._banners.length > 1) {
			this._renderNavigation(store);
		}

		if (banner.reference) {
			const reference = dom.append(this.domNode, dom.$('span.session-input-banner-reference'));
			reference.textContent = banner.reference.label;
			store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), reference, banner.reference.hover));
		}

		const icon = dom.append(this.domNode, dom.$('.session-input-banner-icon'));
		icon.setAttribute('aria-hidden', 'true');
		icon.appendChild(renderIcon(banner.icon));

		const textEl = dom.append(this.domNode, dom.$('span.session-input-banner-text'));
		textEl.textContent = banner.text;
		store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), textEl, banner.text));

		const actions = dom.append(this.domNode, dom.$('.session-input-banner-actions'));
		const bannerIdentity = banner.id ?? banner;
		for (const [actionIndex, action] of banner.actions.entries()) {
			const actionIdentity = action.id ?? action.label;
			const options = this._buttonOptions(action, banner);
			const button = action.dropdownActions?.length
				? store.add(new ButtonWithDropdown(actions, {
					...options,
					actions: action.dropdownActions.map((dropdownAction, dropdownIndex) => toAction({
						id: dropdownAction.id ?? `session.inputBanner.${actionIndex}.${dropdownIndex}`,
						label: dropdownAction.label,
						run: () => this._runAction(bannerIdentity, dropdownAction.id ?? dropdownAction.label),
					})),
					addPrimaryActionToDropdown: false,
					contextMenuProvider: this.contextMenuService,
				}))
				: store.add(new Button(actions, options));
			button.element.classList.add('session-input-banner-action');
			button.label = action.label;
			button.setTitle(action.label);
			button.setAriaLabel(`${banner.ariaLabel} ${action.label}`);
			if (button instanceof ButtonWithDropdown) {
				button.dropdownButton.setAriaLabel(localize('sessionInputBanner.moreActionsFor', "More Actions for {0}", action.label));
			}
			this._buttons.push({ button, primary: !!action.primary });
			store.add(button.onDidClick(() => { void this._runAction(bannerIdentity, actionIdentity).catch(onUnexpectedError); }));
		}

		if (banner.dismiss && banner.dismissTooltip) {
			const dismiss = dom.append(this.domNode, dom.$('button.session-input-banner-dismiss')) as HTMLButtonElement;
			this._dismissButton = dismiss;
			dismiss.type = 'button';
			dismiss.setAttribute('aria-label', banner.dismissTooltip);
			dismiss.appendChild(renderIcon(Codicon.close));
			store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), dismiss, banner.dismissTooltip));
			store.add(dom.addDisposableListener(dismiss, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				banner.dismiss?.();
			}));
		}

		this._setPrimaryButtonsEnabled(!this._working && !this._runningPrimaryAction);
		this._restoreFocus(focus);
	}

	private _captureFocus(): BannerFocus | undefined {
		const activeElement = dom.getActiveElement();
		const focusFallback = this._banners[this._activeIndex]?.focusAfterDismiss;
		if (this._previousButton?.element === activeElement) {
			return { kind: 'previous', focusFallback };
		}
		if (this._nextButton?.element === activeElement) {
			return { kind: 'next', focusFallback };
		}
		if (this._dismissButton === activeElement) {
			return { kind: 'dismiss', focusAfterDismiss: this._banners[this._activeIndex]?.focusAfterDismiss };
		}
		for (let index = 0; index < this._buttons.length; index++) {
			const button = this._buttons[index].button;
			if (button instanceof ButtonWithDropdown) {
				if (button.primaryButton.element === activeElement) {
					return { kind: 'action', index, dropdown: false, focusFallback };
				}
				if (button.dropdownButton.element === activeElement) {
					return { kind: 'action', index, dropdown: true, focusFallback };
				}
			} else if (button.element === activeElement) {
				return { kind: 'action', index, dropdown: false, focusFallback };
			}
		}
		return undefined;
	}

	private _restoreFocus(focus: BannerFocus | undefined): void {
		if (!focus) {
			return;
		}
		switch (focus.kind) {
			case 'previous':
				if (this._previousButton ?? this._buttons[0]?.button) {
					(this._previousButton ?? this._buttons[0].button).focus();
				} else {
					focus.focusFallback?.();
				}
				break;
			case 'next':
				if (this._nextButton ?? this._buttons[0]?.button) {
					(this._nextButton ?? this._buttons[0].button).focus();
				} else {
					focus.focusFallback?.();
				}
				break;
			case 'dismiss':
				if (this._dismissButton) {
					this._dismissButton.focus();
				} else {
					focus.focusAfterDismiss?.();
				}
				break;
			case 'action': {
				const button = this._buttons[focus.index]?.button;
				if (button instanceof ButtonWithDropdown && focus.dropdown) {
					button.dropdownButton.focus();
				} else if (button) {
					button?.focus();
				} else {
					focus.focusFallback?.();
				}
				break;
			}
		}
	}

	private _renderNavigation(store: DisposableStore): void {
		const navigation = dom.append(this.domNode, dom.$('.session-input-banner-navigation'));
		const previous = store.add(new Button(navigation, {
			...this._navigationButtonOptions(localize('sessionInputBanner.previous', "Previous Banner")),
		}));
		previous.element.classList.add('session-input-banner-navigation-button', 'previous');
		previous.icon = Codicon.chevronLeft;
		this._previousButton = previous;
		store.add(previous.onDidClick(() => this._move(-1, 'previous')));

		const position = dom.append(navigation, dom.$('span.session-input-banner-position'));
		position.textContent = localize('sessionInputBanner.position', "{0}/{1}", this._activeIndex + 1, this._banners.length);

		const next = store.add(new Button(navigation, {
			...this._navigationButtonOptions(localize('sessionInputBanner.next', "Next Banner")),
		}));
		next.element.classList.add('session-input-banner-navigation-button', 'next');
		next.icon = Codicon.chevronRight;
		this._nextButton = next;
		store.add(next.onDidClick(() => this._move(1, 'next')));
	}

	private _navigationButtonOptions(ariaLabel: string): IButtonOptions {
		return {
			...defaultButtonStyles,
			ariaLabel,
			supportIcons: true,
			buttonBackground: undefined,
			buttonHoverBackground: undefined,
			buttonForeground: undefined,
			buttonBorder: undefined,
		};
	}

	private _move(delta: number, focusClass: 'previous' | 'next'): void {
		this._activeIndex = (this._activeIndex + delta + this._banners.length) % this._banners.length;
		this._render();
		(focusClass === 'previous' ? this._previousButton : this._nextButton)?.focus();
	}

	private _buttonOptions(action: ISessionInputBannerAction, banner: ISessionInputBanner): IButtonOptions {
		return {
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
		};
	}

	private async _runAction(bannerIdentity: string | ISessionInputBanner, actionIdentity: string): Promise<void> {
		let action = this._findAction(bannerIdentity, actionIdentity);
		if (!action) {
			return;
		}
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
			action = this._findAction(bannerIdentity, actionIdentity);
			if (this._disposed || !action) {
				return;
			}
			await action.run();
		} finally {
			this._setPrimaryButtonsEnabled(true);
			this._runningPrimaryAction = false;
		}
	}

	private _findAction(bannerIdentity: string | ISessionInputBanner, actionIdentity: string): ISessionInputBannerAction | undefined {
		const banner = this._banners[this._activeIndex];
		if ((banner?.id ?? banner) !== bannerIdentity) {
			return undefined;
		}
		for (const action of banner.actions) {
			if ((action.id ?? action.label) === actionIdentity) {
				return action;
			}
			const dropdownAction = action.dropdownActions?.find(candidate => (candidate.id ?? candidate.label) === actionIdentity);
			if (dropdownAction) {
				return dropdownAction;
			}
		}
		return undefined;
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
		this._working = working;
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
