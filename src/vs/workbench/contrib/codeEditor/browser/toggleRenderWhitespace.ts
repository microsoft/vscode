/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

const renderWhitespaceSetting = 'editor.renderWhitespace';

class RenderWhitespaceNoneAction extends Action2 {
	static readonly ID = 'editor.action.renderWhitespace.none';
	constructor() {
		super({
			id: RenderWhitespaceNoneAction.ID,
			title: localize2('renderWhitespace.setNone', "Set Render Whitespace to None"),
			category: Categories.View,
			f1: false,
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'none');
	}
}

class RenderWhitespaceBoundaryAction extends Action2 {
	static readonly ID = 'editor.action.renderWhitespace.boundary';
	constructor() {
		super({
			id: RenderWhitespaceBoundaryAction.ID,
			title: localize2('renderWhitespace.setBoundary', "Set Render Whitespace to Boundary"),
			category: Categories.View,
			f1: false,
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'boundary');
	}
}

class RenderWhitespaceSelectionAction extends Action2 {
	static readonly ID = 'editor.action.renderWhitespace.selection';
	constructor() {
		super({
			id: RenderWhitespaceSelectionAction.ID,
			title: localize2('renderWhitespace.setSelection', "Set Render Whitespace to Selection"),
			category: Categories.View,
			f1: false,
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'selection');
	}
}

class RenderWhitespaceTrailingAction extends Action2 {
	static readonly ID = 'editor.action.renderWhitespace.trailing';
	constructor() {
		super({
			id: RenderWhitespaceTrailingAction.ID,
			title: localize2('renderWhitespace.setTrailing', "Set Render Whitespace to Trailing"),
			category: Categories.View,
			f1: false,
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'trailing');
	}
}

class RenderWhitespaceAllAction extends Action2 {
	static readonly ID = 'editor.action.renderWhitespace.all';
	constructor() {
		super({
			id: RenderWhitespaceAllAction.ID,
			title: localize2('renderWhitespace.setAll', "Set Render Whitespace to All"),
			category: Categories.View,
			f1: false,
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'all');
	}
}

class ToggleRenderWhitespaceAction extends Action2 {

	static readonly ID = 'editor.action.toggleRenderWhitespace';

	constructor() {
		super({
			id: ToggleRenderWhitespaceAction.ID,
			title: localize2('toggleRenderWhitespace', "Toggle Render Whitespace"),
			category: Categories.View,
			f1: true,
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const renderWhitespace = configurationService.getValue<string>(renderWhitespaceSetting);

		let newRenderWhitespace: string;
		if (renderWhitespace === 'none') {
			newRenderWhitespace = 'all';
		} else {
			newRenderWhitespace = 'none';
		}

		return configurationService.updateValue(renderWhitespaceSetting, newRenderWhitespace);
	}
}

registerAction2(RenderWhitespaceNoneAction);
registerAction2(RenderWhitespaceBoundaryAction);
registerAction2(RenderWhitespaceSelectionAction);
registerAction2(RenderWhitespaceTrailingAction);
registerAction2(RenderWhitespaceAllAction);
registerAction2(ToggleRenderWhitespaceAction);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: MenuId.EditorRenderWhitespaceSubmenu,
	title: localize('renderWhitespace', "Render Whitespace"),
	group: '4_editor',
	order: 4
});

const renderWhitespaceMenuItems = [
	{ id: RenderWhitespaceNoneAction.ID, title: localize('renderWhitespace.none', "None"), value: 'none' },
	{ id: RenderWhitespaceBoundaryAction.ID, title: localize('renderWhitespace.boundary', "Boundary"), value: 'boundary' },
	{ id: RenderWhitespaceSelectionAction.ID, title: localize('renderWhitespace.selection', "Selection"), value: 'selection' },
	{ id: RenderWhitespaceTrailingAction.ID, title: localize('renderWhitespace.trailing', "Trailing"), value: 'trailing' },
	{ id: RenderWhitespaceAllAction.ID, title: localize('renderWhitespace.all', "All"), value: 'all' },
];

renderWhitespaceMenuItems.forEach(({ id, title, value }, index) => {
	MenuRegistry.appendMenuItem(MenuId.EditorRenderWhitespaceSubmenu, {
		command: {
			id,
			title,
			toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, value),
		},
		group: '1_config',
		order: index + 1,
	});
});
