/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { SuggestEnabledInput } from 'vs/workbench/contrib/codeEditor/browser/suggestEnabledInput/suggestEnabledInput';
import { EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, GENERAL_TAG_SETTING_TAG, ID_SETTING_TAG, LANGUAGE_SETTING_TAG, MODIFIED_SETTING_TAG } from 'vs/workbench/contrib/preferences/common/preferences';

export class SettingsSearchFilterDropdownMenuActionViewItem extends DropdownMenuActionViewItem {
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
	}

	override render(container: HTMLElement): void {
		super.render(container);
	}

	private appendToSearchWidgetValue(s: string) {
		this.searchWidget.setValue(this.searchWidget.getValue().trimEnd() + ' ' + s);
	}

	private createAction(id: string, label: string, tooltip: string, queryToAppend: string): IAction {
		return {
			id,
			label,
			tooltip,
			class: undefined,
			enabled: true,
			checked: false,
			run: () => { this.appendToSearchWidgetValue(queryToAppend); },
			dispose: () => { }
		};
	}

	getActions(): IAction[] {
		return [
			this.createAction(
				'modifiedSettingsSearch',
				localize('modifiedSettingsSearch', "Modified"),
				localize('modifiedSettingsSearchTooltip', "View modified settings only"),
				`@${MODIFIED_SETTING_TAG} `
			),
			this.createAction(
				'extSettingsSearch',
				localize('extSettingsSearch', "Extension ID"),
				localize('extSettingsSearchTooltip', "Add extension ID filter"),
				`@${EXTENSION_SETTING_TAG}`
			),
			this.createAction(
				'featuresSettingsSearch',
				localize('featureSettingsSearch', "Feature"),
				localize('featureSettingsSearchTooltip', "Add feature filter"),
				`@${FEATURE_SETTING_TAG}`
			),
			this.createAction(
				'idSettingsSearch',
				localize('idSettingsSearch', "Setting ID"),
				localize('idSettingsSearchTooltip', "Add setting ID filter"),
				`@${ID_SETTING_TAG}`
			),
			this.createAction(
				'langSettingsSearch',
				localize('langSettingsSearch', "Language"),
				localize('langSettingsSearchTooltip', "Add language ID filter"),
				`@${LANGUAGE_SETTING_TAG}`
			),
			this.createAction(
				'tagSettingsSearch',
				localize('tagSettingsSearch', "Tag"),
				localize('tagSettingsSearchTooltip', "Add tag filter"),
				`@${GENERAL_TAG_SETTING_TAG}`
			),
		];
	}
}
