/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionWidgetService } from './actionWidget.js';
import { IAction } from '../../../base/common/actions.js';
import { BaseDropdown, IActionProvider, IBaseDropdownOptions } from '../../../base/browser/ui/dropdown/dropdown.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from './actionList.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Codicon } from '../../../base/common/codicons.js';
import { getActiveElement, isHTMLElement } from '../../../base/browser/dom.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { IListAccessibilityProvider } from '../../../base/browser/ui/list/listWidget.js';

export interface IActionWidgetDropdownAction extends IAction {
	category?: { label: string; order: number };
	icon?: ThemeIcon;
	description?: string;
}

// TODO @lramos15 - Should we just make IActionProvider templated?
export interface IActionWidgetDropdownActionProvider {
	getActions(): IActionWidgetDropdownAction[];
}

export interface IActionWidgetDropdownOptions extends IBaseDropdownOptions {
	// These are the actions that are shown in the action widget split up by category
	readonly actions?: IActionWidgetDropdownAction[];
	readonly actionProvider?: IActionWidgetDropdownActionProvider;

	// These actions are those shown at the bottom of the action widget
	readonly actionBarActions?: IAction[];
	readonly actionBarActionProvider?: IActionProvider;
	readonly showItemKeybindings?: boolean;
}

/**
 * Action widget dropdown is a dropdown that uses the action widget under the hood to simulate a native dropdown menu
 * The benefits of this include non native features such as headers, descriptions, icons, and button bar
 */
export class ActionWidgetDropdown extends BaseDropdown {
	constructor(
		container: HTMLElement,
		private readonly _options: IActionWidgetDropdownOptions,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(container, _options);
	}

	override show(): void {
		let actionBarActions = this._options.actionBarActions ?? this._options.actionBarActionProvider?.getActions() ?? [];
		const actions = this._options.actions ?? this._options.actionProvider?.getActions() ?? [];
		const actionWidgetItems: IActionListItem<IActionWidgetDropdownAction>[] = [];

		const actionsByCategory = new Map<string, IActionWidgetDropdownAction[]>();
		for (const action of actions) {
			let category = action.category;
			if (!category) {
				category = { label: '', order: Number.MIN_SAFE_INTEGER };
			}
			if (!actionsByCategory.has(category.label)) {
				actionsByCategory.set(category.label, []);
			}
			actionsByCategory.get(category.label)!.push(action);
		}

		// Sort categories by order
		const sortedCategories = Array.from(actionsByCategory.entries())
			.sort((a, b) => {
				const aOrder = a[1][0]?.category?.order ?? Number.MAX_SAFE_INTEGER;
				const bOrder = b[1][0]?.category?.order ?? Number.MAX_SAFE_INTEGER;
				return aOrder - bOrder;
			});

		for (let i = 0; i < sortedCategories.length; i++) {
			const [, categoryActions] = sortedCategories[i];

			// Push actions for each category
			for (const action of categoryActions) {
				actionWidgetItems.push({
					item: action,
					tooltip: action.tooltip,
					description: action.description,
					kind: ActionListItemKind.Action,
					canPreview: false,
					group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
					disabled: false,
					hideIcon: false,
					label: action.label,
					keybinding: this._options.showItemKeybindings ?
						this.keybindingService.lookupKeybinding(action.id) :
						undefined,
				});
			}

			// Add separator at the end of each category except the last one
			if (i < sortedCategories.length - 1) {
				actionWidgetItems.push({
					label: '',
					kind: ActionListItemKind.Separator,
					canPreview: false,
					disabled: false,
					hideIcon: false,
				});
			}
		}

		const previouslyFocusedElement = getActiveElement();


		const actionWidgetDelegate: IActionListDelegate<IActionWidgetDropdownAction> = {
			onSelect: (action, preview) => {
				this.actionWidgetService.hide();
				action.run();
			},
			onHide: () => {
				if (isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
			}
		};

		actionBarActions = actionBarActions.map(action => ({
			...action,
			run: async (...args: unknown[]) => {
				this.actionWidgetService.hide();
				return action.run(...args);
			}
		}));

		const accessibilityProvider: Partial<IListAccessibilityProvider<IActionListItem<IActionWidgetDropdownAction>>> = {
			isChecked(element) {
				return element.kind === ActionListItemKind.Action && !!element?.item?.checked;
			},
			getRole: (e) => {
				switch (e.kind) {
					case ActionListItemKind.Action:
						return 'menuitemcheckbox';
					case ActionListItemKind.Separator:
						return 'separator';
					default:
						return 'separator';
				}
			},
			getWidgetRole: () => 'menu',
		};

		this.actionWidgetService.show<IActionWidgetDropdownAction>(
			this._options.label ?? '',
			false,
			actionWidgetItems,
			actionWidgetDelegate,
			this.element,
			undefined,
			actionBarActions,
			accessibilityProvider
		);
	}
}
