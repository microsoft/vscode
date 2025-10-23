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

export class ToggleRenderControlCharacterAction extends Action2 {

	static readonly ID = 'editor.action.toggleRenderControlCharacter';

	constructor() {
		super({
			id: ToggleRenderControlCharacterAction.ID,
			title: {
				...localize2('toggleRenderControlCharacters', "Toggle Control Characters"),
				mnemonicTitle: localize({ key: 'miToggleRenderControlCharacters', comment: ['&& denotes a mnemonic'] }, "Render &&Control Characters"),
			},
			category: Categories.View,
			f1: true,
			toggled: ContextKeyExpr.equals('config.editor.renderControlCharacters', true),
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '4_editor',
				order: 5
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const newRenderControlCharacters = !configurationService.getValue<boolean>('editor.renderControlCharacters');
		return configurationService.updateValue('editor.renderControlCharacters', newRenderControlCharacters);
	}
}

registerAction2(ToggleRenderControlCharacterAction);
