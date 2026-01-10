/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSessionPickerActionItem.css';
import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../common/chatSessionsService.js';
import { renderLabelWithIcons, renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';

export interface ISearchableOptionPickerDelegate {
	readonly onDidChangeOption: Event<IChatSessionProviderOptionItem>;
	getCurrentOption(): IChatSessionProviderOptionItem | undefined;
	setOption(option: IChatSessionProviderOptionItem): void;
	getOptionGroup(): IChatSessionProviderOptionGroup | undefined;
}

interface ISearchableOptionQuickPickItem extends IQuickPickItem {
	readonly optionItem: IChatSessionProviderOptionItem;
}

function isSearchableOptionQuickPickItem(item: IQuickPickItem | undefined): item is ISearchableOptionQuickPickItem {
	return !!item && typeof (item as ISearchableOptionQuickPickItem).optionItem === 'object';
}

/**
 * Action view item for searchable option groups with QuickPick.
 * Used when an option group has `searchable: true` (e.g., repository selection).
 * Provides a search box for filtering large lists of options.
 */
export class SearchableOptionPickerActionItem extends ActionViewItem {
	private currentOption: IChatSessionProviderOptionItem | undefined;
	private labelElement: HTMLElement | undefined;

	constructor(
		action: IAction,
		initialState: { group: IChatSessionProviderOptionGroup; item: IChatSessionProviderOptionItem | undefined },
		private readonly delegate: ISearchableOptionPickerDelegate,
		options: IActionViewItemOptions,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		// Pass icon: false, label: false to prevent default action label rendering
		super(null, action, { ...options, icon: false, label: false });
		const { item } = initialState;
		this.currentOption = item;

		this._register(this.delegate.onDidChangeOption(newOption => {
			this.currentOption = newOption;
			this.renderLabel();
		}));
	}

	override render(container: HTMLElement): void {
		// Don't call super.render() - we handle all rendering ourselves
		// to avoid the default icon/label elements from ActionViewItem
		this.element = container;
		container.classList.add('chat-searchable-option-picker-item');

		// Use <a> with action-label class to match the styling of other pickers
		this.labelElement = dom.append(container, dom.$('a.action-label.chat-session-option-picker'));
		this.labelElement.tabIndex = 0;
		this.labelElement.role = 'button';
		this.labelElement.setAttribute('aria-haspopup', 'true');
		this.labelElement.setAttribute('aria-expanded', 'false');

		this._register(dom.addDisposableListener(this.labelElement, dom.EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showQuickPick();
		}));

		this._register(dom.addDisposableListener(this.labelElement, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.showQuickPick();
			}
		}));

		// Hover tooltip
		const hoverDelegate = getDefaultHoverDelegate('element');
		this._register(this.hoverService.setupManagedHover(hoverDelegate, this.labelElement, () => {
			const group = this.delegate.getOptionGroup();
			return group?.description ?? group?.name ?? '';
		}));

		this.renderLabel();
	}

	private renderLabel(): void {
		if (!this.labelElement) {
			return;
		}

		const domChildren: (Node | string)[] = [];
		const option = this.currentOption;
		const optionGroup = this.delegate.getOptionGroup();

		// Icon
		if (option?.icon) {
			domChildren.push(renderIcon(option.icon));
		} else {
			// Default icon based on option group id (e.g., 'repository' -> repo icon)
			const defaultIcon = this.getDefaultIconForGroup(optionGroup?.id);
			if (defaultIcon) {
				domChildren.push(renderIcon(defaultIcon));
			}
		}

		// Label - use same class as ChatSessionPickerActionItem for consistent styling
		const label = option?.name ?? optionGroup?.name ?? localize('selectOption', "Select...");
		domChildren.push(dom.$('span.chat-session-option-label', undefined, label));

		// Chevron
		domChildren.push(...renderLabelWithIcons('$(chevron-down)'));

		// Locked indicator
		if (option?.locked) {
			domChildren.push(renderIcon(Codicon.lock));
		}

		dom.reset(this.labelElement, ...domChildren);
		this.setAriaLabelAttributes();
	}

	private getDefaultIconForGroup(groupId: string | undefined): ThemeIcon | undefined {
		if (!groupId) {
			return undefined;
		}
		// Provide sensible defaults based on common option group IDs
		switch (groupId.toLowerCase()) {
			case 'repository':
			case 'repositories':
			case 'repo':
				return Codicon.sourceControl;
			case 'model':
			case 'models':
				return Codicon.sparkle;
			case 'agent':
			case 'agents':
			case 'subagent':
			case 'subagents':
				return Codicon.copilot;
			default:
				return Codicon.sourceControl;
		}
	}

	private setAriaLabelAttributes(): void {
		if (!this.labelElement) {
			return;
		}

		const option = this.currentOption;
		const optionGroup = this.delegate.getOptionGroup();
		const groupName = optionGroup?.name ?? '';
		const optionName = option?.name ?? localize('notSelected', "not selected");

		this.labelElement.ariaLabel = localize('searchableOptionPicker.ariaLabel', "{0}: {1}. Press Enter to change.", groupName, optionName);
	}

	private async showQuickPick(): Promise<void> {
		const optionGroup = this.delegate.getOptionGroup();
		if (!optionGroup) {
			return;
		}

		// Check if current option is locked
		const currentOption = this.currentOption;
		if (currentOption?.locked) {
			return;
		}

		// Build QuickPick items
		const quickPickItems = this.buildQuickPickItems(optionGroup.items, currentOption);

		// Show QuickPick
		const pick = await this.quickInputService.pick(quickPickItems, {
			placeHolder: optionGroup.description ?? localize('selectOption.placeholder', "Select {0}", optionGroup.name),
			matchOnDescription: true,
			matchOnDetail: true,
		});

		if (isSearchableOptionQuickPickItem(pick)) {
			const selectedItem = pick.optionItem;
			if (!selectedItem.locked) {
				this.delegate.setOption(selectedItem);
			}
		}
	}

	private buildQuickPickItems(
		items: IChatSessionProviderOptionItem[],
		currentOption: IChatSessionProviderOptionItem | undefined
	): ISearchableOptionQuickPickItem[] {
		return items.map(item => this.createQuickPickItem(item, currentOption));
	}

	private createQuickPickItem(
		item: IChatSessionProviderOptionItem,
		currentOption: IChatSessionProviderOptionItem | undefined
	): ISearchableOptionQuickPickItem {
		const isSelected = item.id === currentOption?.id;
		const iconClass = item.icon ? ThemeIcon.asClassName(item.icon) : undefined;

		return {
			label: item.name,
			description: item.description,
			iconClass,
			picked: isSelected,
			disabled: item.locked,
			optionItem: item,
		};
	}

	/**
	 * Opens the picker programmatically.
	 */
	show(): void {
		this.showQuickPick();
	}
}
