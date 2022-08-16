/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class ToggleStickyScroll extends Action2 {

	constructor() {
		super({
			id: 'editor.action.toggleStickyScroll',
			title: {
				value: localize('toggleStickyScroll', "Toggle Sticky Scroll"),
				mnemonicTitle: localize('miStickyScroll', "&&Sticky Scroll"),
				original: 'Toggle Sticky Scroll',
			},
			// Hardcoding due to import violation
			category: { value: localize('view', "View"), original: 'View' },
			toggled: ContextKeyExpr.equals('config.editor.stickyScroll.enabled', true),
			menu: [
				{ id: MenuId.CommandPalette },
				{ id: MenuId.MenubarViewMenu, group: '5_editor', order: 6 },
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue('editor.stickyScroll.enabled');
		return configurationService.updateValue('editor.stickyScroll.enabled', newValue);
	}
}
