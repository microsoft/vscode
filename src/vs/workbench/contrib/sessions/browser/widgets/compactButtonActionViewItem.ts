/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventLike, EventType, isMouseEvent, reset } from '../../../../../base/browser/dom.js';
import { IContextMenuProvider } from '../../../../../base/browser/contextmenu.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IAction, IActionRunner } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorRegistry.js';
import { markOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from '../../common/theme.js';
import './media/compactButtonActionViewItem.css';

/** The dropdown part joined to the pill, which shows `actions` in a context menu. */
export interface ICompactButtonDropdown {
	readonly contextMenuProvider: IContextMenuProvider;
	readonly actions: readonly IAction[];
	/** Runs the actions of the menu. */
	readonly actionRunner?: IActionRunner;
}

/**
 * Base class for the compact pill button rendered in the sessions UI (e.g. the "New" session/chat
 * buttons and the empty file editor actions). Subclasses provide the command id,
 * label, optional icon and hover/aria text, and optionally a dropdown part joined to the pill.
 */
export abstract class CompactButtonActionViewItem extends BaseActionViewItem {

	private dropdownButton: ButtonWithDropdown | undefined;

	constructor(
		action: IAction,
		@IKeybindingService protected readonly keybindingService: IKeybindingService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
	) {
		super(undefined, action);
	}

	/** Command id used to look up the trailing keybinding hint. */
	protected abstract get commandId(): string;

	/** Visible pill label (e.g. "New", "New Chat"). */
	protected abstract get label(): string;

	/** Optional leading icon for the pill. */
	protected get icon(): ThemeIcon | undefined {
		return undefined;
	}

	/** Hover text; receives the resolved keybinding label, if any. */
	protected abstract getHoverContent(keybindingLabel: string | undefined): string;

	/** Accessible name; receives the resolved keybinding aria label, if any. */
	protected abstract getAriaLabel(keybindingAriaLabel: string | undefined): string;

	/** Optional onboarding spotlight target id for the pill. */
	protected get onboardingTargetId(): string | undefined {
		return undefined;
	}

	/** Whether to render the trailing keybinding hint chip in the label. */
	protected get showKeybindingHint(): boolean {
		return true;
	}

	/** Optional dropdown part joined to the pill, split off by a thin divider. */
	protected get dropdown(): ICompactButtonDropdown | undefined {
		return undefined;
	}

	/** Whether the pill runs its action; the dropdown part stays available either way. */
	protected get primaryEnabled(): boolean {
		return this.action.enabled;
	}

	/** Hook invoked right before the action runs (e.g. for telemetry). */
	protected onRun(): void { }

	protected runAction(_event: MouseEvent | undefined): void {
		void this.actionRunner.run(this.action, this._context);
	}

	protected configureButton(_button: Button): void { }

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		const buttonOptions = {
			...defaultButtonStyles,
			buttonSecondaryBackground: asCssVariable(agentsNewSessionButtonBackground),
			buttonSecondaryForeground: asCssVariable(agentsNewSessionButtonForeground),
			buttonSecondaryHoverBackground: asCssVariable(agentsNewSessionButtonHoverBackground),
			buttonSecondaryBorder: asCssVariable(agentsNewSessionButtonBorder),
			secondary: true,
			supportIcons: true,
		};
		const dropdown = this.dropdown;
		let button: Button;
		if (dropdown) {
			const dropdownButton = this.dropdownButton = this._register(new ButtonWithDropdown(this.element, {
				...buttonOptions,
				contextMenuProvider: dropdown.contextMenuProvider,
				actions: dropdown.actions,
				actionRunner: dropdown.actionRunner,
				addPrimaryActionToDropdown: false,
			}));
			dropdownButton.element.classList.add('agent-sessions-compact-new-button-dropdown');
			button = dropdownButton.primaryButton;
			this.registerDropdownKeyboardNavigation(dropdownButton);
		} else {
			button = this._register(new Button(this.element, buttonOptions));
		}
		button.element.classList.add('agent-sessions-compact-new-button');
		this.configureButton(button);
		const onboardingTargetId = this.onboardingTargetId;
		if (onboardingTargetId) {
			this._register(markOnboardingTarget(button.element, onboardingTargetId, {
				onDidActivate: Event.map(Event.filter(button.onDidClick, () => this.primaryEnabled), () => undefined),
			}));
		}
		this._register(button.onDidClick(e => {
			// Stop propagation so the parent <li> click handler doesn't run the action twice.
			EventHelper.stop(e, true);
			if (!this.primaryEnabled) {
				return;
			}
			this.onRun();
			this.runAction(isMouseEvent(e) ? e : undefined);
		}));

		const buttonLabel = $('span.new-session-button-label', undefined, this.label);
		const icon = this.icon;
		if (icon) {
			const iconElement = $('span.new-session-button-icon');
			iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
			iconElement.setAttribute('aria-hidden', 'true');
			buttonLabel.prepend(iconElement);
		}
		const keybindingHint = $('span.new-session-keybinding-hint');
		const keybindingHintLabel = this.showKeybindingHint
			? this._register(new KeybindingLabel(keybindingHint, OS, {
				disableTitle: true,
				keybindingLabelBackground: 'transparent',
				keybindingLabelForeground: 'inherit',
				keybindingLabelBorder: 'transparent',
				keybindingLabelBottomBorder: undefined,
				keybindingLabelShadow: undefined,
			}))
			: undefined;
		reset(button.element, buttonLabel);

		const getKeybinding = () => {
			const primaryKeybinding = this.keybindingService.lookupKeybinding(this.commandId, this.contextKeyService, true);
			const resolvedKeybindings = this.keybindingService.lookupKeybindings(this.commandId);
			return primaryKeybinding ?? resolvedKeybindings[0];
		};

		this._register(this.hoverService.setupDelayedHover(button.element, () => ({
			content: this.getHoverContent(getKeybinding()?.getLabel() ?? undefined),
			appearance: { compact: true, showPointer: true },
			position: { hoverPosition: HoverPosition.BELOW },
		})));

		let lastRenderedKeybindingLabel: string | undefined | null = null;
		let lastRenderedKeybindingAriaLabel: string | undefined | null = null;
		const updateButton = () => {
			const keybinding = getKeybinding();
			const keybindingLabel = keybinding?.getLabel() ?? undefined;
			const keybindingAriaLabel = keybinding?.getAriaLabel() ?? undefined;
			if (lastRenderedKeybindingLabel === keybindingLabel && lastRenderedKeybindingAriaLabel === keybindingAriaLabel) {
				return;
			}

			lastRenderedKeybindingLabel = keybindingLabel;
			lastRenderedKeybindingAriaLabel = keybindingAriaLabel;

			keybindingHintLabel?.set(keybinding);
			if (keybindingHintLabel && keybinding) {
				if (keybindingHint.parentElement !== button.element) {
					append(button.element, keybindingHint);
				}
			} else {
				keybindingHint.remove();
			}

			button.element.setAttribute('aria-label', this.getAriaLabel(keybindingAriaLabel));
		};
		this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateButton));
		if (this.dropdownButton) {
			this.updateEnabled();
		}
	}

	/**
	 * The width of the pill with its dropdown part, which does not shrink: for the responsive budget of its toolbar, so that
	 * it moves into the overflow whole instead of covering its neighbors. `undefined` without the dropdown part or while it
	 * is not laid out.
	 */
	getMinimumWidth(): number | undefined {
		const width = this.dropdownButton?.element.getBoundingClientRect().width;
		return width ? Math.ceil(width) : undefined;
	}

	/** The pill and its dropdown part are one tab stop of the toolbar; the arrow keys move between them. */
	private registerDropdownKeyboardNavigation(dropdownButton: ButtonWithDropdown): void {
		this._register(addDisposableListener(dropdownButton.primaryButton.element, EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).equals(KeyCode.RightArrow)) {
				this.focus(true);
				EventHelper.stop(e, true);
			}
		}));
		this._register(addDisposableListener(dropdownButton.dropdownButton.element, EventType.KEY_DOWN, e => {
			if (this.primaryEnabled && new StandardKeyboardEvent(e).equals(KeyCode.LeftArrow)) {
				this.focus();
				EventHelper.stop(e, true);
			}
		}));
	}

	/** With the dropdown part, its two buttons handle their clicks and taps, which reach the item only to be stopped. */
	override onClick(event: EventLike, preserveFocus?: boolean): void {
		if (!this.dropdownButton) {
			super.onClick(event, preserveFocus);
			return;
		}
		EventHelper.stop(event, true);
	}

	override focus(fromRight = false): void {
		if (!this.dropdownButton) {
			super.focus();
			return;
		}
		const dropdown = fromRight || !this.primaryEnabled;
		this.dropdownButton.primaryButton.element.tabIndex = dropdown ? -1 : 0;
		this.dropdownButton.dropdownButton.element.tabIndex = dropdown ? 0 : -1;
		(dropdown ? this.dropdownButton.dropdownButton : this.dropdownButton.primaryButton).focus();
	}

	override blur(): void {
		if (!this.dropdownButton) {
			super.blur();
			return;
		}
		this.dropdownButton.primaryButton.element.blur();
		this.dropdownButton.dropdownButton.element.blur();
		this.setFocusable(false);
	}

	override setFocusable(focusable: boolean): void {
		if (!this.dropdownButton) {
			super.setFocusable(focusable);
			return;
		}
		this.dropdownButton.primaryButton.element.tabIndex = focusable && this.primaryEnabled ? 0 : -1;
		this.dropdownButton.dropdownButton.element.tabIndex = focusable && !this.primaryEnabled ? 0 : -1;
	}

	protected override updateEnabled(): void {
		if (!this.dropdownButton) {
			super.updateEnabled();
			return;
		}
		const focusable = this.dropdownButton.primaryButton.element.tabIndex === 0 || this.dropdownButton.dropdownButton.element.tabIndex === 0;
		this.dropdownButton.primaryButton.enabled = this.primaryEnabled;
		this.setFocusable(focusable);
	}
}
