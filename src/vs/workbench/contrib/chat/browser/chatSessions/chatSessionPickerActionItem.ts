/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSessionPickerActionItem.css';
import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../common/chatSessionsService.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { renderLabelWithIcons, renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../../nls.js';


export interface IChatSessionPickerDelegate {
	readonly onDidChangeOption: Event<IChatSessionProviderOptionItem>;
	getCurrentOption(): IChatSessionProviderOptionItem | undefined;
	setOption(option: IChatSessionProviderOptionItem): void;
	getAllOptions(): IChatSessionProviderOptionItem[];
}

/**
 * Action view item for making an option selection for a contributed chat session
 * These options are provided by the relevant ChatSession Provider
 */
export class ChatSessionPickerActionItem extends ActionWidgetDropdownActionViewItem {
	currentOption: IChatSessionProviderOptionItem | undefined;
	constructor(
		action: IAction,
		initialState: { group: IChatSessionProviderOptionGroup; item: IChatSessionProviderOptionItem | undefined },
		private readonly delegate: IChatSessionPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		const { group, item } = initialState;
		const actionWithLabel: IAction = {
			...action,
			label: item?.name || group.name,
			tooltip: item?.description ?? group.description ?? group.name,
			run: () => { }
		};

		const sessionPickerActionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider: {
				getActions: () => {
					// if locked, show the current option only
					const currentOption = this.delegate.getCurrentOption();
					if (currentOption?.locked) {
						return [{
							id: currentOption.id,
							enabled: false,
							icon: currentOption.icon,
							checked: true,
							class: undefined,
							description: undefined,
							tooltip: currentOption.description ?? currentOption.name,
							label: currentOption.name,
							run: () => { }
						} satisfies IActionWidgetDropdownAction];
					} else {
						return this.delegate.getAllOptions().map(optionItem => {
							const isCurrent = optionItem.id === this.delegate.getCurrentOption()?.id;
							return {
								id: optionItem.id,
								enabled: true,
								icon: optionItem.icon,
								checked: isCurrent,
								class: undefined,
								description: undefined,
								tooltip: optionItem.description ?? optionItem.name,
								label: optionItem.name,
								run: () => {
									this.delegate.setOption(optionItem);
								}
							} satisfies IActionWidgetDropdownAction;
						});
					}
				}
			},
			actionBarActionProvider: undefined,
		};

		super(actionWithLabel, sessionPickerActionWidgetOptions, actionWidgetService, keybindingService, contextKeyService);
		this.currentOption = item;

		this._register(this.delegate.onDidChangeOption(newOption => {
			this.currentOption = newOption;
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}
	protected override renderLabel(element: HTMLElement): IDisposable | null {
		const domChildren = [];
		element.classList.add('chat-session-option-picker');
		if (this.currentOption?.icon) {
			domChildren.push(renderIcon(this.currentOption.icon));
		}
		domChildren.push(dom.$('span.chat-session-option-label', undefined, this.currentOption?.name ?? localize('chat.sessionPicker.label', "Pick Option")));
		domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));
		dom.reset(element, ...domChildren);
		this.setAriaLabelAttributes(element);
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-sessionPicker-item');
	}

}
