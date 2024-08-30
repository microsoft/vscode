/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import * as types from '../../../../../../base/common/types.js';
import { EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { IActionViewItemProvider } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionProvider } from '../../../../../../base/browser/ui/dropdown/dropdown.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem, SubmenuEntryActionViewItem } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import type { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';

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
	private _hover?: IManagedHover;
	private _primaryAction: IAction | undefined;

	constructor(
		action: SubmenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		readonly renderLabel: boolean,
		readonly subActionProvider: IActionProvider,
		readonly subActionViewItemProvider: IActionViewItemProvider | undefined,
		@IKeybindingService _keybindingService: IKeybindingService,
		@IContextMenuService _contextMenuService: IContextMenuService,
		@IThemeService _themeService: IThemeService,
		@IHoverService private readonly _hoverService: IHoverService
	) {
		super(action, { ...options, hoverDelegate: options?.hoverDelegate ?? getDefaultHoverDelegate('element') }, _keybindingService, _contextMenuService, _themeService);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('notebook-action-view-item');
		container.classList.add('notebook-action-view-item-unified');
		this._actionLabel = document.createElement('a');
		container.appendChild(this._actionLabel);

		this._hover = this._register(this._hoverService.setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate('element'), this._actionLabel, ''));

		this.updateLabel();

		for (const event of [DOM.EventType.CLICK, DOM.EventType.MOUSE_DOWN, TouchEventType.Tap]) {
			this._register(DOM.addDisposableListener(container, event, e => this.onClick(e, true)));
		}
	}

	override onClick(event: DOM.EventLike, preserveFocus = false): void {
		DOM.EventHelper.stop(event, true);
		const context = types.isUndefinedOrNull(this._context) ? this.options?.useEventAsContext ? event : { preserveFocus } : this._context;
		this.actionRunner.run(this._primaryAction ?? this._action, context);
	}

	protected override updateLabel() {
		const actions = this.subActionProvider.getActions();
		if (this._actionLabel) {
			const primaryAction = actions[0];
			this._primaryAction = primaryAction;

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
