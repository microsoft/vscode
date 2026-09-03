/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../../base/browser/dom.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownOptions, withActionWidgetDropdownMotion } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatExecuteActionContext } from '../../actions/chatExecuteActions.js';

export interface IChatInputPickerOptions {
	/**
	 * Provides a fallback anchor element when the picker's own element
	 * is not available in the DOM (e.g., when inside an overflow menu).
	 */
	readonly getOverflowAnchor?: () => HTMLElement | undefined;

	readonly actionContext?: IChatExecuteActionContext;

	readonly compact: IObservable<boolean>;

	readonly minimal?: IObservable<boolean>;

	readonly listOptions?: IActionListOptions;
}

export function withChatInputPickerMotion(listOptions: IActionListOptions | undefined): IActionListOptions {
	return {
		...withActionWidgetDropdownMotion(listOptions),
		anchorPosition: AnchorPosition.ABOVE,
	};
}

/**
 * Base class for chat input picker action items (model picker, mode picker, session target picker).
 * Provides common anchor resolution logic for dropdown positioning.
 */
export abstract class ChatInputPickerActionViewItem extends ActionWidgetDropdownActionViewItem {
	private _externalAnchor: HTMLElement | undefined;

	constructor(
		action: IAction,
		actionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'>,
		protected readonly pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		const listOptionsProvider = actionWidgetOptions.listOptions === undefined ? actionWidgetOptions.listOptionsProvider : undefined;
		const optionsWithAnchor: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			...actionWidgetOptions,
			getAnchor: () => this.getAnchorElement(),
			listOptions: listOptionsProvider
				? undefined
				: withChatInputPickerMotion(actionWidgetOptions.listOptions),
			listOptionsProvider: listOptionsProvider
				? { getListOptions: () => withChatInputPickerMotion(listOptionsProvider.getListOptions()) }
				: undefined,
		};

		super(action, optionsWithAnchor, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		this._register(autorun(reader => {
			const compact = this.pickerOptions.compact.read(reader);
			if (this.element) {
				this.element.classList.toggle('compact', compact);
				this.renderLabel(this.element);
			}
		}));
	}

	/**
	 * Returns the anchor element for the dropdown.
	 * Falls back to the overflow anchor if this element is not in the DOM.
	 */
	protected getAnchorElement(): HTMLElement {
		if (this._externalAnchor?.isConnected) {
			return this._externalAnchor;
		}
		if (this.element && getActiveWindow().document.contains(this.element)) {
			return this.element;
		}
		return this.pickerOptions.getOverflowAnchor?.() ?? this.element!;
	}

	override show(anchor?: HTMLElement): void {
		this._externalAnchor = anchor;
		super.show();
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-input-picker-item');

		// Apply initial collapsed state now that this.element exists
		const compact = this.pickerOptions.compact.get();
		if (this.element) {
			this.element.classList.toggle('compact', compact);
			this.renderLabel(this.element);
		}
	}
}
