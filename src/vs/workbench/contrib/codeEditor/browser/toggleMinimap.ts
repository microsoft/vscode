/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class ToggleMinimapAction extends Action2 {

	static readonly ID = 'editor.action.toggleMinimap';

	constructor() {
		super({
			id: ToggleMinimapAction.ID,
			title: {
				...localize2('toggleMinimap', "Toggle Minimap"),
				mnemonicTitle: localize({ key: 'miMinimap', comment: ['&& denotes a mnemonic'] }, "&&Minimap"),
			},
			category: Categories.View,
			f1: true,
			toggled: ContextKeyExpr.equals('config.editor.minimap.enabled', true),
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '4_editor',
				order: 1
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const newValue = !configurationService.getValue('editor.minimap.enabled');
		return configurationService.updateValue('editor.minimap.enabled', newValue);
	}
}

registerAction2(ToggleMinimapAction);
