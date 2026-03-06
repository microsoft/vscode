/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSessionPickerActionItem.css';
import { IAction } from '../../../../../base/common/actions.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../common/chatSessionsService.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { renderLabelWithIcons, renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ChatSessionPickerActionItem, IChatSessionPickerDelegate } from './chatSessionPickerActionItem.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

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
export class SearchableOptionPickerActionItem extends ChatSessionPickerActionItem {
	private static readonly SEE_MORE_ID = '__see_more__';

	constructor(
		action: IAction,
		initialState: { group: IChatSessionProviderOptionGroup; item: IChatSessionProviderOptionItem | undefined },
		delegate: IChatSessionPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(action, initialState, delegate, actionWidgetService, contextKeyService, keybindingService, commandService, telemetryService);
	}

	protected override getDropdownActions(): IActionWidgetDropdownAction[] {
		// If locked, show the current option only
		const currentOption = this.delegate.getCurrentOption();
		if (currentOption?.locked) {
			return [this.createLockedOptionAction(currentOption)];
		}

		const optionGroup = this.delegate.getOptionGroup();
		if (!optionGroup) {
			return [];
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
				description: optionItem.description,
				tooltip: optionItem.description ?? optionItem.name,
				label: optionItem.name,
				run: () => {
					this.delegate.setOption(optionItem);
				}
			};
		});

		// Add "See more..." action if onSearch is available
		if (optionGroup.onSearch) {
			actions.push({
				id: SearchableOptionPickerActionItem.SEE_MORE_ID,
				enabled: true,
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

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		const domChildren = [];
		const optionGroup = this.delegate.getOptionGroup();

		element.classList.add('chat-session-option-picker');

		if (optionGroup?.icon) {
			domChildren.push(renderIcon(optionGroup.icon));
		}

		// Label
		const label = this.currentOption?.name ?? optionGroup?.name ?? localize('selectOption', "Select...");
		domChildren.push(dom.$('span.chat-session-option-label', undefined, label));

		domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(element, ...domChildren);
		this.setAriaLabelAttributes(element);
		return null;
	}

	protected override getContainerClass(): string {
		return 'chat-searchable-option-picker-item';
	}

	/**
	 * Shows the full searchable QuickPick with all items (initial + search results)
	 * Called when user clicks "See more..." from the dropdown
	 */
	private async showSearchableQuickPick(optionGroup: IChatSessionProviderOptionGroup): Promise<void> {
		if (optionGroup.onSearch) {
			const disposables = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<ISearchableOptionQuickPickItem>();
			disposables.add(quickPick);
			quickPick.placeholder = optionGroup.description ?? localize('selectOption.placeholder', "Select {0}", optionGroup.name);
			quickPick.matchOnDescription = true;
			quickPick.matchOnDetail = true;
			quickPick.ignoreFocusOut = true;
			quickPick.busy = true;
			quickPick.show();

			// Debounced search state
			let currentSearchCts: CancellationTokenSource | undefined;
			const searchDelayer = disposables.add(new Delayer<void>(300));

			const performSearch = async (query: string) => {
				// Cancel previous search
				currentSearchCts?.cancel();
				currentSearchCts?.dispose();
				currentSearchCts = new CancellationTokenSource();
				const token = currentSearchCts.token;

				quickPick.busy = true;
				try {
					const items = await optionGroup.onSearch!(query, token);
					if (!token.isCancellationRequested) {
						quickPick.items = items.map(item => this.createQuickPickItem(item));
					}
				} catch (error) {
					if (!token.isCancellationRequested) {
						this.logService.error('Error fetching searchable option items:', error);
					}
				} finally {
					if (!token.isCancellationRequested) {
						quickPick.busy = false;
					}
				}
			};

			// Initial search with empty query
			await performSearch('');

			// Listen for value changes and perform debounced search
			disposables.add(quickPick.onDidChangeValue(value => {
				searchDelayer.trigger(() => performSearch(value));
			}));


			// Handle selection
			return new Promise<void>((resolve) => {
				disposables.add(quickPick.onDidAccept(() => {
					const pick = quickPick.selectedItems[0];
					if (isSearchableOptionQuickPickItem(pick)) {
						const selectedItem = pick.optionItem;
						if (!selectedItem.locked) {
							this.delegate.setOption(selectedItem);
						}
					}
					quickPick.hide();
				}));

				disposables.add(quickPick.onDidHide(() => {
					currentSearchCts?.cancel();
					currentSearchCts?.dispose();
					disposables.dispose();
					resolve();
				}));
			});
		}
	}

	private createQuickPickItem(
		item: IChatSessionProviderOptionItem,
	): ISearchableOptionQuickPickItem {
		const iconClass = item.icon ? ThemeIcon.asClassName(item.icon) : undefined;

		return {
			label: item.name,
			description: item.description,
			iconClass,
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
