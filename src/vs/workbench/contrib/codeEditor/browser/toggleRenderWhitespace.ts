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

class ToggleRenderWhitespaceAction extends Action2 {

	static readonly ID = 'editor.action.toggleRenderWhitespace';

	constructor() {
		super({
			id: ToggleRenderWhitespaceAction.ID,
			title: {
				...localize2('toggleRenderWhitespace', "Toggle Render Whitespace"),
				mnemonicTitle: localize({ key: 'miToggleRenderWhitespace', comment: ['&& denotes a mnemonic'] }, "&&Render Whitespace"),
			},
			category: Categories.View,
			f1: true,
			toggled: ContextKeyExpr.notEquals('config.editor.renderWhitespace', 'none'),
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '4_editor',
				order: 4
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const renderWhitespace = configurationService.getValue<string>('editor.renderWhitespace');

		let newRenderWhitespace: string;
		if (renderWhitespace === 'none') {
			newRenderWhitespace = 'all';
		} else {
			newRenderWhitespace = 'none';
		}

		return configurationService.updateValue('editor.renderWhitespace', newRenderWhitespace);
	}
}

registerAction2(ToggleRenderWhitespaceAction);
