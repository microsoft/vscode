/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button, ButtonWithDropdown } from '../../../../base/browser/ui/button/button.js';
import { IAction } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';

export class AutomationHeaderButtonActionViewItem extends BaseActionViewItem {

	private button: Button | undefined;

	constructor(context: unknown, action: IAction, options: IActionViewItemOptions, private readonly secondary: boolean, private readonly onboardingTargetId?: string) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-pill-item');
		const button = this.button = this._register(new Button(container, { secondary: this.secondary, ariaLabel: this._action.label, title: this._action.label, ...defaultButtonStyles }));
		button.element.classList.add('monaco-text-button', 'chat-pill-button');
		for (const type of [DOM.EventType.KEY_DOWN, DOM.EventType.KEY_UP]) {
			this._register(DOM.addDisposableListener(button.element, type, event => {
				const keyEvent = new StandardKeyboardEvent(event);
				if (!button.enabled && (keyEvent.equals(KeyCode.Enter) || keyEvent.equals(KeyCode.Space))) {
					DOM.EventHelper.stop(event, true);
				}
			}));
		}
		this._register(button.onDidClick(async () => {
			if (!button.enabled) {
				return;
			}
			await this.actionRunner.run(this._action, this._context);
		}));
		if (this.onboardingTargetId) {
			this._register(markOnboardingTarget(button.element, this.onboardingTargetId, {
				onDidActivate: Event.map(Event.filter(button.onDidClick, () => this._action.enabled), () => undefined),
			}));
		}
		this.updateLabel();
		this.updateEnabled();
	}

	// Focus must restore the tab stop that `blur` removed, otherwise arrow
	// navigation can leave the containing toolbar with no tabbable item.
	override focus(): void { if (this.button) { this.button.element.tabIndex = 0; this.button.focus(); } }
	override blur(): void { if (this.button) { this.button.element.tabIndex = -1; this.button.element.blur(); } }
	override setFocusable(focusable: boolean): void { if (this.button) { this.button.element.tabIndex = focusable ? 0 : -1; } }

	protected override updateEnabled(): void {
		if (this.button) {
			const tabIndex = this.button.element.tabIndex;
			this.button.enabled = this._action.enabled;
			this.button.element.tabIndex = tabIndex;
		}
	}

	protected override updateLabel(): void {
		if (!this.button) { return; }
		DOM.reset(this.button.element, this._action.label);
	}
}

export class AutomationHeaderSplitButtonActionViewItem extends BaseActionViewItem {

	private button: ButtonWithDropdown | undefined;

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly dropdownActions: readonly IAction[],
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		const button = this.button = this._register(new ButtonWithDropdown(container, {
			...defaultButtonStyles,
			secondary: true,
			title: this._action.label,
			contextMenuProvider: this.contextMenuService,
			actions: this.dropdownActions,
			addPrimaryActionToDropdown: false,
		}));
		button.label = this._action.label;
		this._register(button.onDidClick(() => this.actionRunner.run(this._action, this._context)));
		this._register(DOM.addDisposableListener(button.primaryButton.element, DOM.EventType.KEY_DOWN, event => {
			if (new StandardKeyboardEvent(event).equals(KeyCode.RightArrow)) {
				this.focus(true);
				DOM.EventHelper.stop(event, true);
			}
		}));
		this._register(DOM.addDisposableListener(button.dropdownButton.element, DOM.EventType.KEY_DOWN, event => {
			if (this._action.enabled && new StandardKeyboardEvent(event).equals(KeyCode.LeftArrow)) {
				this.focus();
				DOM.EventHelper.stop(event, true);
			}
		}));
		this.updateEnabled();
	}

	override isEnabled(): boolean {
		return this._action.enabled || this.dropdownActions.some(action => action.enabled);
	}

	override focus(fromRight = false): void {
		if (!this.button) {
			return;
		}
		const dropdown = fromRight || !this._action.enabled;
		this.button.primaryButton.element.tabIndex = dropdown ? -1 : 0;
		this.button.dropdownButton.element.tabIndex = dropdown ? 0 : -1;
		(dropdown ? this.button.dropdownButton : this.button.primaryButton).focus();
	}

	override blur(): void {
		this.button?.primaryButton.element.blur();
		this.button?.dropdownButton.element.blur();
		this.setFocusable(false);
	}

	override setFocusable(focusable: boolean): void {
		if (this.button) {
			this.button.primaryButton.element.tabIndex = focusable && this._action.enabled ? 0 : -1;
			this.button.dropdownButton.element.tabIndex = focusable && !this._action.enabled ? 0 : -1;
		}
	}

	protected override updateEnabled(): void {
		if (this.button) {
			const focusable = this.button.primaryButton.element.tabIndex === 0 || this.button.dropdownButton.element.tabIndex === 0;
			this.button.primaryButton.enabled = this._action.enabled;
			this.setFocusable(focusable);
		}
	}
}
