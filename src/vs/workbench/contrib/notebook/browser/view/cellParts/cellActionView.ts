/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import * as DOM from 'vs/base/browser/dom';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem, SubmenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IActionProvider } from 'vs/base/browser/ui/dropdown/dropdown';
import { MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICustomHover, setupCustomHover } from 'vs/base/browser/ui/hover/updatableHoverWidget';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';

export class CodiconActionViewItem extends MenuEntryActionViewItem {

	protected override updateLabel(): void {
		if (this.options.label && this.label) {
			DOM.reset(this.label, ...renderLabelWithIcons(this._commandAction.label ?? ''));
		}
	}
}

export class ActionViewWithLabel extends MenuEntryActionViewItem {
	private _actionLabel?: HTMLAnchorElement;

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('notebook-action-view-item');
		this._actionLabel = document.createElement('a');
		container.appendChild(this._actionLabel);
		this.updateLabel();
	}

	protected override updateLabel() {
		if (this._actionLabel) {
			this._actionLabel.classList.add('notebook-label');
			this._actionLabel.innerText = this._action.label;
		}
	}
}
export class UnifiedSubmenuActionView extends SubmenuEntryActionViewItem {
	private _actionLabel?: HTMLAnchorElement;
	private _hover?: ICustomHover;

	constructor(
		action: SubmenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		readonly renderLabel: boolean,
		readonly subActionProvider: IActionProvider,
		readonly subActionViewItemProvider: IActionViewItemProvider | undefined,
		@IKeybindingService _keybindingService: IKeybindingService,
		@IContextMenuService _contextMenuService: IContextMenuService,
		@IThemeService _themeService: IThemeService
	) {
		super(action, { ...options, hoverDelegate: options?.hoverDelegate ?? getDefaultHoverDelegate('element') }, _keybindingService, _contextMenuService, _themeService);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('notebook-action-view-item');
		this._actionLabel = document.createElement('a');
		container.appendChild(this._actionLabel);

		this._hover = this._register(setupCustomHover(this.options.hoverDelegate ?? getDefaultHoverDelegate('element'), this._actionLabel, ''));

		this.updateLabel();
	}

	protected override updateLabel() {
		const actions = this.subActionProvider.getActions();
		if (this._actionLabel) {
			const primaryAction = actions[0];

			if (primaryAction && primaryAction instanceof MenuItemAction) {
				const element = this.element;

				if (element && primaryAction.item.icon && ThemeIcon.isThemeIcon(primaryAction.item.icon)) {
					const iconClasses = ThemeIcon.asClassNameArray(primaryAction.item.icon);
					// remove all classes started with 'codicon-'
					element.classList.forEach((cl) => {
						if (cl.startsWith('codicon-')) {
							element.classList.remove(cl);
						}
					});
					element.classList.add(...iconClasses);
				}

				if (this.renderLabel) {
					this._actionLabel.classList.add('notebook-label');
					this._actionLabel.innerText = this._action.label;
					this._hover?.update(primaryAction.tooltip.length ? primaryAction.tooltip : primaryAction.label);
				}
			} else {
				if (this.renderLabel) {
					this._actionLabel.classList.add('notebook-label');
					this._actionLabel.innerText = this._action.label;
					this._hover?.update(this._action.tooltip.length ? this._action.tooltip : this._action.label);
				}
			}
		}
	}
}
