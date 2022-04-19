/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { localize } from 'vs/nls';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { SuggestEnabledInput } from 'vs/workbench/contrib/codeEditor/browser/suggestEnabledInput/suggestEnabledInput';
import { EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, GENERAL_TAG_SETTING_TAG, ID_SETTING_TAG, LANGUAGE_SETTING_TAG, MODIFIED_SETTING_TAG } from 'vs/workbench/contrib/preferences/common/preferences';

export class SettingsSearchFilterDropdownMenuActionViewItem extends DropdownMenuActionViewItem {
	private readonly suggestController: SuggestController | null;

	constructor(
		action: IAction,
		actionRunner: IActionRunner | undefined,
		private readonly searchWidget: SuggestEnabledInput,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(action,
			{ getActions: () => this.getActions() },
			contextMenuService,
			{
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

	private createAction(id: string, label: string, tooltip: string, queryToAppend: string, triggerSuggest: boolean): IAction {
		return {
			id,
			label,
			tooltip,
			class: undefined,
			enabled: true,
			checked: false,
			run: () => { this.doSearchWidgetAction(queryToAppend, triggerSuggest); },
			dispose: () => { }
		};
	}

	private createModifiedAction(): IAction {
		// The modified action works slightly differently than the other actions.
		// It is more like a checkbox on/off toggle.
		const queryContainsModifiedTag = this.searchWidget.getValue().split(' ').some(word => word === `@${MODIFIED_SETTING_TAG}`);
		return {
			id: 'modifiedSettingsSearch',
			label: localize('modifiedSettingsSearch', "Modified"),
			tooltip: localize('modifiedSettingsSearchTooltip', "View modified settings only"),
			class: undefined,
			enabled: true,
			checked: queryContainsModifiedTag,
			run: () => {
				// Append the tag, otherwise remove it from the query.
				if (!queryContainsModifiedTag) {
					this.searchWidget.setValue(this.searchWidget.getValue().trimEnd() + ` @${MODIFIED_SETTING_TAG}`);
				} else {
					const queryWithoutModifiedTag = this.searchWidget.getValue().split(' ').filter(word => word !== `@${MODIFIED_SETTING_TAG}`).join(' ');
					this.searchWidget.setValue(queryWithoutModifiedTag);
				}
				this.searchWidget.focus();
			},
			dispose: () => { }
		};
	}

	getActions(): IAction[] {
		return [
			this.createModifiedAction(),
			this.createAction(
				'extSettingsSearch',
				localize('extSettingsSearch', "Extension ID..."),
				localize('extSettingsSearchTooltip', "Add extension ID filter"),
				`@${EXTENSION_SETTING_TAG}`,
				false
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
			this.createAction(
				'idSettingsSearch',
				localize('idSettingsSearch', "Setting ID..."),
				localize('idSettingsSearchTooltip', "Add setting ID filter"),
				`@${ID_SETTING_TAG}`,
				false
			)
		];
	}
}
