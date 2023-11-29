/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { LayoutSettings } from 'vs/workbench/services/layout/browser/layoutService';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { IAction } from 'vs/base/common/actions';
import { IsAuxiliaryWindowFocusedContext } from 'vs/workbench/common/contextkeys';

class ToggleConfigAction extends Action2 {

	constructor(private readonly section: string, title: string, order: number, mainWindowOnly: boolean) {
		super({
			id: `toggle.${section}`,
			title,
			toggled: ContextKeyExpr.equals(`config.${section}`, true),
			menu: [
				{
					id: MenuId.TitleBarContext,
					when: mainWindowOnly ? IsAuxiliaryWindowFocusedContext.toNegated() : undefined,
					order
				},
				{
					id: MenuId.TitleBarTitleContext,
					when: mainWindowOnly ? IsAuxiliaryWindowFocusedContext.toNegated() : undefined,
					order,
					group: '2_config'
				}
			]
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]): void {
		const configService = accessor.get(IConfigurationService);
		const value = configService.getValue(this.section);
		configService.updateValue(this.section, !value);
	}
}

registerAction2(class ToggleCommandCenter extends ToggleConfigAction {
	constructor() {
		super(LayoutSettings.COMMAND_CENTER, localize('toggle.commandCenter', 'Command Center'), 1, false);
	}
});

registerAction2(class ToggleLayoutControl extends ToggleConfigAction {
	constructor() {
		super('workbench.layoutControl.enabled', localize('toggle.layout', 'Layout Controls'), 2, true);
	}
});

registerAction2(class ToggleEditorActions extends Action2 {
	static readonly settingsID = `workbench.editor.editorActionsLocation`;
	constructor() {
		super({
			id: `toggle.${ToggleEditorActions.settingsID}`,
			title: localize('toggle.editorActions', 'Editor Actions'),
			toggled: ContextKeyExpr.equals(`config.${ToggleEditorActions.settingsID}`, 'hidden').negate(),
			menu: [
				{ id: MenuId.TitleBarContext, order: 3, when: ContextKeyExpr.equals(`config.workbench.editor.showTabs`, 'none') },
				{ id: MenuId.TitleBarTitleContext, order: 3, when: ContextKeyExpr.equals(`config.workbench.editor.showTabs`, 'none'), group: '2_config' }
			]
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]): void {
		const configService = accessor.get(IConfigurationService);
		const storageService = accessor.get(IStorageService);
		const value = configService.getValue<string>(ToggleEditorActions.settingsID);
		if (value === 'hidden') {
			const storedValue = storageService.get(ToggleEditorActions.settingsID, StorageScope.PROFILE);
			configService.updateValue(ToggleEditorActions.settingsID, storedValue ?? 'default');
		} else {
			configService.updateValue(ToggleEditorActions.settingsID, 'hidden');
			storageService.store(ToggleEditorActions.settingsID, value, StorageScope.PROFILE, StorageTarget.USER);
		}
	}
});

export const ACCOUNTS_ACTIVITY_TILE_ACTION: IAction = {
	id: ACCOUNTS_ACTIVITY_ID,
	label: localize('accounts', "Accounts"),
	tooltip: localize('accounts', "Accounts"),
	class: undefined,
	enabled: true,
	run: function (): void { }
};

export const GLOBAL_ACTIVITY_TITLE_ACTION: IAction = {
	id: GLOBAL_ACTIVITY_ID,
	label: localize('manage', "Manage"),
	tooltip: localize('manage', "Manage"),
	class: undefined,
	enabled: true,
	run: function (): void { }
};
