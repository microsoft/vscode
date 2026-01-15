/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../../base/browser/dom.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';

export interface IChatInputPickerOptions {
	/**
	 * Provides a fallback anchor element when the picker's own element
	 * is not available in the DOM (e.g., when inside an overflow menu).
	 */
	readonly getOverflowAnchor?: () => HTMLElement | undefined;
}

/**
 * Base class for chat input picker action items (model picker, mode picker, session target picker).
 * Provides common anchor resolution logic for dropdown positioning.
 */
export abstract class ChatInputPickerActionViewItem extends ActionWidgetDropdownActionViewItem {

	constructor(
		action: IAction,
		actionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'>,
		private readonly pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		// Inject the anchor getter into the options
		const optionsWithAnchor: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			...actionWidgetOptions,
			getAnchor: () => this.getAnchorElement(),
		};

		super(action, optionsWithAnchor, actionWidgetService, keybindingService, contextKeyService);
	}

	/**
	 * Returns the anchor element for the dropdown.
	 * Falls back to the overflow anchor if this element is not in the DOM.
	 */
	protected getAnchorElement(): HTMLElement {
		if (this.element && getActiveWindow().document.contains(this.element)) {
			return this.element;
		}
		return this.pickerOptions.getOverflowAnchor?.() ?? this.element!;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-input-picker-item');
	}
}
