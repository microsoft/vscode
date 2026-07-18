/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, reset } from '../../../base/browser/dom.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { IAction } from '../../../base/common/actions.js';
import { defaultButtonStyles } from '../../../platform/theme/browser/defaultStyles.js';

/**
 * Renders an action contributed into the session header meta row ({@link Menus.SessionHeaderMeta})
 * as a secondary {@link Button} with an inline `icon title` label so every contributed action reads
 * consistently. Used as the default rendering for meta actions that don't register their own
 * action view item.
 *
 * Subclasses can override {@link getLabelText} (e.g. the pull request `#<number>`) or append dynamic
 * content via {@link getAdditionalLabelContent} (e.g. the changes diff stats), calling
 * {@link updateLabel} when it changes.
 */
export class SessionHeaderMetaActionViewItem extends BaseActionViewItem {

	protected button: Button | undefined;

	constructor(context: unknown, action: IAction, options: IActionViewItemOptions) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-composite-bar-meta-item');

		const button = this.button = this._register(new Button(container, { secondary: true, small: true, ...defaultButtonStyles }));
		button.element.classList.add('monaco-text-button', 'chat-composite-bar-meta-item-button');
		this._register(button.onDidClick(() => {
			if (this._action.enabled) {
				this.actionRunner.run(this._action, this._context);
			}
		}));

		this.updateLabel();
		this.updateEnabled();
		this.updateTooltip();
	}

	override focus(): void {
		this.button?.focus();
	}

	override blur(): void {
		if (this.button) {
			this.button.element.tabIndex = -1;
			this.button.element.blur();
		}
	}

	override setFocusable(focusable: boolean): void {
		if (this.button) {
			this.button.element.tabIndex = focusable ? 0 : -1;
		}
	}

	override isFocused(): boolean {
		return !!this.button?.hasFocus();
	}

	protected override updateClass(): void {
		this.updateLabel();
	}

	protected override updateEnabled(): void {
		if (this.button) {
			this.button.enabled = this._action.enabled;
		}
	}

	protected override updateLabel(): void {
		if (!this.button) {
			return;
		}
		reset(this.button.element, ...this.getLabelContent());
	}

	protected override updateAriaLabel(): void {
		const ariaLabel = this.getAriaLabel();
		if (ariaLabel) {
			this.button?.element.setAttribute('aria-label', ariaLabel);
		} else {
			this.button?.element.removeAttribute('aria-label');
		}
	}

	/**
	 * The button's accessible name. Defaults to {@link getTooltip}. Subclasses that render
	 * meaningful state in the visible label (e.g. the workspace name, or diff counts) should
	 * override this so screen readers announce the same information that is shown visually.
	 */
	protected getAriaLabel(): string | undefined {
		return this.getTooltip();
	}

	protected override getTooltip(): string | undefined {
		// `MenuItemAction.tooltip` defaults to '' when not provided, which would
		// leave the pill without a managed hover and an empty aria-label. Fall
		// back to the action label so the pill is always labelled.
		return this._action.tooltip || this._action.label || undefined;
	}

	private getLabelContent(): Array<HTMLElement | string> {
		const content: Array<HTMLElement | string> = [];

		const iconElement = this.getIconElement();
		if (iconElement) {
			content.push(iconElement);
		}

		const labelText = this.getLabelText();
		if (labelText) {
			content.push($('span.chat-composite-bar-meta-item-label', undefined, labelText));
		}

		content.push(...this.getAdditionalLabelContent());
		return content;
	}

	/**
	 * The leading icon element. Defaults to the action's icon (without color).
	 */
	protected getIconElement(): HTMLElement | undefined {
		const iconClasses = this._action.class?.split(' ').filter(cssClass => !!cssClass);
		if (!iconClasses?.length) {
			return undefined;
		}
		return $(`span.chat-composite-bar-meta-item-icon${iconClasses.map(cssClass => `.${cssClass}`).join('')}`);
	}

	/**
	 * The button's title text. Defaults to the action label.
	 */
	protected getLabelText(): string {
		return this._action.label;
	}

	/**
	 * Additional label content rendered after the title. Defaults to none.
	 */
	protected getAdditionalLabelContent(): Array<HTMLElement | string> {
		return [];
	}
}
