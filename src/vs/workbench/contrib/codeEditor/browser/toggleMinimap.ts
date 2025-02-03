/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

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
