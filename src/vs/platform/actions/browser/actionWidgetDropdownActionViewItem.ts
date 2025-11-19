/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { ILabelRenderer } from '../../../base/browser/ui/dropdown/dropdown.js';
import { getBaseLayerHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../base/common/actions.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IActionWidgetService } from '../../actionWidget/browser/actionWidget.js';
import { ActionWidgetDropdown, IActionWidgetDropdownOptions } from '../../actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';

/**
 * Action view item for the custom action widget dropdown widget.
 * Very closely based off of `DropdownMenuActionViewItem`, would be good to have some code re-use in the future
 */
export class ActionWidgetDropdownActionViewItem extends BaseActionViewItem {
	private actionWidgetDropdown: ActionWidgetDropdown | undefined;
	private actionItem: HTMLElement | null = null;
	constructor(
		action: IAction,
		private readonly actionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'>,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		this.actionItem = container;

		const labelRenderer: ILabelRenderer = (el: HTMLElement): IDisposable | null => {
			this.element = append(el, $('a.action-label'));
			return this.renderLabel(this.element);
		};

		this.actionWidgetDropdown = this._register(new ActionWidgetDropdown(container, { ...this.actionWidgetOptions, labelRenderer }, this._actionWidgetService, this._keybindingService));
		this._register(this.actionWidgetDropdown.onDidChangeVisibility(visible => {
			this.element?.setAttribute('aria-expanded', `${visible}`);
		}));

		this.updateTooltip();
		this.updateEnabled();
	}

	protected renderLabel(element: HTMLElement): IDisposable | null {
		// todo@aeschli: remove codicon, should come through `this.options.classNames`
		element.classList.add('codicon');

		if (this._action.label) {
			this._register(getBaseLayerHoverDelegate().setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate('mouse'), element, this._action.label));
		}

		return null;
	}

	protected override updateAriaLabel(): void {
		if (this.element) {
			this.setAriaLabelAttributes(this.element);
		}
	}

	protected setAriaLabelAttributes(element: HTMLElement): void {
		element.setAttribute('role', 'button');
		element.setAttribute('aria-haspopup', 'true');
		element.setAttribute('aria-expanded', 'false');
		element.ariaLabel = (this.getTooltip() + ' - ' + (element.textContent || this._action.label)) || '';
	}

	protected override getTooltip() {
		const keybinding = this._keybindingService.lookupKeybinding(this.action.id, this._contextKeyService);
		const keybindingLabel = keybinding && keybinding.getLabel();

		const tooltip = this.action.tooltip ?? this.action.label;
		return keybindingLabel
			? `${tooltip} (${keybindingLabel})`
			: tooltip;
	}

	show(): void {
		this.actionWidgetDropdown?.show();
	}

	protected override updateEnabled(): void {
		const disabled = !this.action.enabled;
		this.actionItem?.classList.toggle('disabled', disabled);
		this.element?.classList.toggle('disabled', disabled);
		this.actionWidgetDropdown?.setEnabled(!disabled);
	}

}
