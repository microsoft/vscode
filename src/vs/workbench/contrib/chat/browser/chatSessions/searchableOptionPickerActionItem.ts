/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSessionPickerActionItem.css';
import { IAction } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
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
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';

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
 * Shows an inline dropdown with items + "See more..." option that opens a searchable QuickPick.
 */
export class SearchableOptionPickerActionItem extends ActionWidgetDropdownActionViewItem {
	private currentOption: IChatSessionProviderOptionItem | undefined;
	private static readonly SEE_MORE_ID = '__see_more__';

	constructor(
		action: IAction,
		initialState: { group: IChatSessionProviderOptionGroup; item: IChatSessionProviderOptionItem | undefined },
		private readonly delegate: ISearchableOptionPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		const { group, item } = initialState;
		const actionWithLabel: IAction = {
			...action,
			label: item?.name || group.name,
			tooltip: item?.description ?? group.description ?? group.name,
			run: () => { }
		};

		const searchablePickerOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider: {
				getActions: () => {
					const optionGroup = this.delegate.getOptionGroup();
					if (!optionGroup) {
						return [];
					}

					// If locked, show the current option only
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
					}

					// Build actions from items
					const actions: IActionWidgetDropdownAction[] = optionGroup.items.map(optionItem => {
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

					// Add "See more..." action if onSearch is available
					if (optionGroup.onSearch) {
						actions.push({
							id: SearchableOptionPickerActionItem.SEE_MORE_ID,
							enabled: true,
							icon: Codicon.search,
							checked: false,
							class: 'searchable-picker-see-more',
							description: undefined,
							tooltip: localize('seeMore.tooltip', "Search for more options"),
							label: localize('seeMore', "See more..."),
							run: () => {
								this.showSearchableQuickPick(optionGroup);
							}
						} satisfies IActionWidgetDropdownAction);
					}

					return actions;
				}
			},
			actionBarActionProvider: undefined,
		};

		super(actionWithLabel, searchablePickerOptions, actionWidgetService, keybindingService, contextKeyService);
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
		const optionGroup = this.delegate.getOptionGroup();

		element.classList.add('chat-session-option-picker');

		// Icon
		if (this.currentOption?.icon) {
			domChildren.push(renderIcon(this.currentOption.icon));
		} else {
			// Default icon based on option group id
			const defaultIcon = this.getDefaultIconForGroup(optionGroup?.id);
			domChildren.push(renderIcon(defaultIcon));
		}

		// Label
		const label = this.currentOption?.name ?? optionGroup?.name ?? localize('selectOption', "Select...");
		domChildren.push(dom.$('span.chat-session-option-label', undefined, label));

		// Chevron
		domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));

		// Locked indicator
		if (this.currentOption?.locked) {
			domChildren.push(renderIcon(Codicon.lock));
		}

		dom.reset(element, ...domChildren);
		this.setAriaLabelAttributes(element);
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-searchable-option-picker-item');
	}

	private getDefaultIconForGroup(groupId: string | undefined): ThemeIcon {
		if (!groupId) {
			return Codicon.gear;
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

	/**
	 * Shows the full searchable QuickPick with all items (initial + search results)
	 * Called when user clicks "See more..." from the dropdown
	 */
	private async showSearchableQuickPick(optionGroup: IChatSessionProviderOptionGroup): Promise<void> {
		const currentOption = this.delegate.getCurrentOption();

		// Start with initial items
		let allItems = [...optionGroup.items];

		// Fetch additional items via onSearch if available
		if (optionGroup.onSearch) {
			try {
				const additionalItems = await optionGroup.onSearch(CancellationToken.None);
				if (additionalItems && additionalItems.length > 0) {
					// Merge and deduplicate items by id
					const itemMap = new Map<string, IChatSessionProviderOptionItem>();
					for (const item of allItems) {
						itemMap.set(item.id, item);
					}
					for (const item of additionalItems) {
						if (!itemMap.has(item.id)) {
							itemMap.set(item.id, item);
						}
					}
					allItems = Array.from(itemMap.values());
				}
			} catch (error) {
				// Log error but continue with initial items
				console.error('Error calling onSearch:', error);
			}
		}

		// Build QuickPick items
		const quickPickItems = this.buildQuickPickItems(allItems, currentOption);

		// Show searchable QuickPick with all items
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
	override show(): void {
		const optionGroup = this.delegate.getOptionGroup();
		if (optionGroup) {
			this.showSearchableQuickPick(optionGroup);
		}
	}
}
