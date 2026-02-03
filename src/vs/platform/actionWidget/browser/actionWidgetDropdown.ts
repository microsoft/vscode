/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionWidgetService } from './actionWidget.js';
import { IAction } from '../../../base/common/actions.js';
import { BaseDropdown, IActionProvider, IBaseDropdownOptions } from '../../../base/browser/ui/dropdown/dropdown.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListItemHover } from './actionList.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Codicon } from '../../../base/common/codicons.js';
import { getActiveElement, isHTMLElement } from '../../../base/browser/dom.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { IListAccessibilityProvider } from '../../../base/browser/ui/list/listWidget.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

export interface IActionWidgetDropdownAction extends IAction {
	category?: { label: string; order: number; showHeader?: boolean };
	icon?: ThemeIcon;
	description?: string;
	/**
	 * Optional flyout hover configuration shown when focusing/hovering over the action.
	 */
	hover?: IActionListItemHover;
	/**
	 * Optional toolbar actions shown when the item is focused or hovered.
	 */
	toolbarActions?: IAction[];
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

	// Function that returns the anchor element for the dropdown
	getAnchor?: () => HTMLElement;

	/**
	 * Telemetry reporter configuration used when the dropdown closes. The `id` field is required
	 * and is used as the telemetry identifier; `name` is optional additional context. If not
	 * provided, no telemetry will be sent.
	 */
	readonly reporter?: { id: string; name?: string; includeOptions?: boolean };
}

/**
 * Action widget dropdown is a dropdown that uses the action widget under the hood to simulate a native dropdown menu
 * The benefits of this include non native features such as headers, descriptions, icons, and button bar
 */
export class ActionWidgetDropdown extends BaseDropdown {

	private _enabled: boolean = true;

	constructor(
		container: HTMLElement,
		private readonly _options: IActionWidgetDropdownOptions,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(container, _options);
	}

	override show(): void {
		if (!this._enabled) {
			return;
		}

		let actionBarActions = this._options.actionBarActions ?? this._options.actionBarActionProvider?.getActions() ?? [];
		const actions = this._options.actions ?? this._options.actionProvider?.getActions() ?? [];

		// Track the currently selected option before opening
		const optionBeforeOpen: IActionWidgetDropdownAction | undefined = actions.find(a => a.checked);
		let selectedOption: IActionWidgetDropdownAction | undefined = optionBeforeOpen;

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
			const [categoryLabel, categoryActions] = sortedCategories[i];
			const showHeader = categoryActions[0]?.category?.showHeader ?? false;
			if (showHeader && categoryLabel) {
				actionWidgetItems.push({
					kind: ActionListItemKind.Header,
					label: categoryLabel,
					canPreview: false,
					disabled: false,
					hideIcon: false,
				});
			}

			// Push actions for each category
			for (const action of categoryActions) {
				actionWidgetItems.push({
					item: action,
					tooltip: action.tooltip,
					description: action.description,
					hover: action.hover,
					toolbarActions: action.toolbarActions,
					kind: ActionListItemKind.Action,
					canPreview: false,
					group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
					disabled: !action.enabled,
					hideIcon: false,
					label: action.label,
					keybinding: this._options.showItemKeybindings ?
						this.keybindingService.lookupKeybinding(action.id) :
						undefined,
				});
			}

			// Add separator after each category except the last one
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
				selectedOption = action;
				this.actionWidgetService.hide();
				action.run();
			},
			onHide: () => {
				if (isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
				this._emitCloseEvent(optionBeforeOpen, selectedOption);
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
			this._options.getAnchor?.() ?? this.element,
			undefined,
			actionBarActions,
			accessibilityProvider
		);
	}

	setEnabled(enabled: boolean): void {
		this._enabled = enabled;
	}

	private _emitCloseEvent(optionBeforeOpen: IActionWidgetDropdownAction | undefined, selectedOption: IActionWidgetDropdownAction | undefined): void {
		const optionBefore = optionBeforeOpen;
		const optionAfter = selectedOption;

		if (this._options.reporter) {
			this.telemetryService.publicLog2<ActionWidgetDropdownClosedEvent, ActionWidgetDropdownClosedClassification>(
				'actionWidgetDropdownClosed',
				{
					id: this._options.reporter.id,
					name: this._options.reporter.name,
					selectionChanged: optionBefore?.id !== optionAfter?.id,
					optionIdBefore: this._options.reporter.includeOptions ? optionBefore?.id : undefined,
					optionIdAfter: this._options.reporter.includeOptions ? optionAfter?.id : undefined,
					optionLabelBefore: this._options.reporter.includeOptions ? optionBefore?.label : undefined,
					optionLabelAfter: this._options.reporter.includeOptions ? optionAfter?.label : undefined,
				}
			);
		}
	}
}

type ActionWidgetDropdownClosedEvent = {
	id: string;
	name: string | undefined;
	selectionChanged: boolean;
	optionIdBefore: string | undefined;
	optionIdAfter: string | undefined;
	optionLabelBefore: string | undefined;
	optionLabelAfter: string | undefined;
};

type ActionWidgetDropdownClosedClassification = {
	id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The telemetry id of the dropdown picker.' };
	name: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The telemetry name of the dropdown picker.' };
	selectionChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user changed the selected option.' };
	optionIdBefore: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The option configured before opening the dropdown.' };
	optionIdAfter: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The option configured after closing the dropdown.' };
	optionLabelBefore: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The label of the option configured before opening the dropdown.' };
	optionLabelAfter: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The label of the option configured after closing the dropdown.' };
	owner: 'benibenj';
	comment: 'Tracks action widget dropdown usage and selection changes.';
};
