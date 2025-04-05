/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAction, IActionRunner } from '../../../../base/common/actions.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { SuggestEnabledInput } from '../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, GENERAL_TAG_SETTING_TAG, LANGUAGE_SETTING_TAG, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG } from '../common/preferences.js';

export class SettingsSearchFilterDropdownMenuActionViewItem extends DropdownMenuActionViewItem {
	private readonly suggestController: SuggestController | null;

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		actionRunner: IActionRunner | undefined,
		private readonly searchWidget: SuggestEnabledInput,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(action,
			{ getActions: () => this.getActions() },
			contextMenuService,
			{
				...options,
				actionRunner,
				classNames: action.class,
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
				menuAsChild: true
			}
		);

		this.suggestController = SuggestController.get(this.searchWidget.inputWidget);
	}

	override render(container: HTMLElement): void {
		super.render(container);
	}

	private doSearchWidgetAction(queryToAppend: string, triggerSuggest: boolean) {
		this.searchWidget.setValue(this.searchWidget.getValue().trimEnd() + ' ' + queryToAppend);
		this.searchWidget.focus();
		if (triggerSuggest && this.suggestController) {
			this.suggestController.triggerSuggest();
		}
	}

	/**
	 * The created action appends a query to the search widget search string. It optionally triggers suggestions.
	 */
	private createAction(id: string, label: string, tooltip: string, queryToAppend: string, triggerSuggest: boolean): IAction {
		return {
			id,
			label,
			tooltip,
			class: undefined,
			enabled: true,
			run: () => { this.doSearchWidgetAction(queryToAppend, triggerSuggest); }
		};
	}

	/**
	 * The created action appends a query to the search widget search string, if the query does not exist.
	 * Otherwise, it removes the query from the search widget search string.
	 * The action does not trigger suggestions after adding or removing the query.
	 */
	private createToggleAction(id: string, label: string, tooltip: string, queryToAppend: string): IAction {
		const splitCurrentQuery = this.searchWidget.getValue().split(' ');
		const queryContainsQueryToAppend = splitCurrentQuery.includes(queryToAppend);
		return {
			id,
			label,
			tooltip,
			class: undefined,
			enabled: true,
			checked: queryContainsQueryToAppend,
			run: () => {
				if (!queryContainsQueryToAppend) {
					const trimmedCurrentQuery = this.searchWidget.getValue().trimEnd();
					const newQuery = trimmedCurrentQuery ? trimmedCurrentQuery + ' ' + queryToAppend : queryToAppend;
					this.searchWidget.setValue(newQuery);
				} else {
					const queryWithRemovedTags = this.searchWidget.getValue().split(' ')
						.filter(word => word !== queryToAppend).join(' ');
					this.searchWidget.setValue(queryWithRemovedTags);
				}
				this.searchWidget.focus();
			}
		};
	}

	getActions(): IAction[] {
		return [
			this.createToggleAction(
				'modifiedSettingsSearch',
				localize('modifiedSettingsSearch', "Modified"),
				localize('modifiedSettingsSearchTooltip', "Add or remove modified settings filter"),
				`@${MODIFIED_SETTING_TAG}`
			),
			this.createAction(
				'extSettingsSearch',
				localize('extSettingsSearch', "Extension ID..."),
				localize('extSettingsSearchTooltip', "Add extension ID filter"),
				`@${EXTENSION_SETTING_TAG}`,
				true
			),
			this.createAction(
				'featuresSettingsSearch',
				localize('featureSettingsSearch', "Feature..."),
				localize('featureSettingsSearchTooltip', "Add feature filter"),
				`@${FEATURE_SETTING_TAG}`,
				true
			),
			this.createAction(
				'tagSettingsSearch',
				localize('tagSettingsSearch', "Tag..."),
				localize('tagSettingsSearchTooltip', "Add tag filter"),
				`@${GENERAL_TAG_SETTING_TAG}`,
				true
			),
			this.createAction(
				'langSettingsSearch',
				localize('langSettingsSearch', "Language..."),
				localize('langSettingsSearchTooltip', "Add language ID filter"),
				`@${LANGUAGE_SETTING_TAG}`,
				true
			),
			this.createToggleAction(
				'onlineSettingsSearch',
				localize('onlineSettingsSearch', "Online services"),
				localize('onlineSettingsSearchTooltip', "Show settings for online services"),
				'@tag:usesOnlineServices'
			),
			this.createToggleAction(
				'policySettingsSearch',
				localize('policySettingsSearch', "Policy services"),
				localize('policySettingsSearchTooltip', "Show settings for policy services"),
				`@${POLICY_SETTING_TAG}`
			)
		];
	}
}
