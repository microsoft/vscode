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
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../common/chatSessionsService.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { renderLabelWithIcons, renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../../nls.js';


export interface IChatSessionPickerDelegate {
	readonly onDidChangeOption: Event<IChatSessionProviderOptionItem>;
	getCurrentOption(): IChatSessionProviderOptionItem | undefined;
	setOption(option: IChatSessionProviderOptionItem): void;
	getOptionGroup(): IChatSessionProviderOptionGroup | undefined;
}

/**
 * Action view item for making an option selection for a contributed chat session
 * These options are provided by the relevant ChatSession Provider
 */
export class ChatSessionPickerActionItem extends ActionWidgetDropdownActionViewItem {
	protected currentOption: IChatSessionProviderOptionItem | undefined;
	protected container: HTMLElement | undefined;

	constructor(
		action: IAction,
		initialState: { group: IChatSessionProviderOptionGroup; item: IChatSessionProviderOptionItem | undefined },
		protected readonly delegate: IChatSessionPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
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
				getActions: () => this.getDropdownActions()
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
			this.updateEnabled();
		}));
	}

	/**
	 * Returns the actions to show in the dropdown. Can be overridden by subclasses.
	 */
	protected getDropdownActions(): IActionWidgetDropdownAction[] {
		// if locked, show the current option only
		const currentOption = this.delegate.getCurrentOption();
		if (currentOption?.locked) {
			return [this.createLockedOptionAction(currentOption)];
		}

		const group = this.delegate.getOptionGroup();
		if (!group) {
			return [];
		}

		return group.items.map(optionItem => {
			const isCurrent = optionItem.id === currentOption?.id;
			return {
				id: optionItem.id,
				enabled: !optionItem.locked,
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

	/**
	 * Creates a disabled action for a locked option.
	 */
	protected createLockedOptionAction(option: IChatSessionProviderOptionItem): IActionWidgetDropdownAction {
		return {
			id: option.id,
			enabled: false,
			icon: option.icon,
			checked: true,
			class: undefined,
			description: undefined,
			tooltip: option.description ?? option.name,
			label: option.name,
			run: () => { }
		};
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
		this.container = container;
		super.render(container);
		container.classList.add(this.getContainerClass());

		// Set initial locked state on container
		if (this.currentOption?.locked) {
			container.classList.add('locked');
		}
	}

	/**
	 * Returns the CSS class to add to the container. Can be overridden by subclasses.
	 */
	protected getContainerClass(): string {
		return 'chat-sessionPicker-item';
	}

	protected override updateEnabled(): void {
		const originalEnabled = this.action.enabled;
		if (this.currentOption?.locked) {
			this.action.enabled = false;
		}
		super.updateEnabled();
		this.action.enabled = originalEnabled;
		if (this.container) {
			this.container.classList.toggle('locked', !!this.currentOption?.locked);
		}
	}
}
