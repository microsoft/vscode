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
			shortTitle: localize2('renderWhitespace.none', "None"),
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
			shortTitle: localize2('renderWhitespace.boundary', "Boundary"),
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
			shortTitle: localize2('renderWhitespace.selection', "Selection"),
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
			shortTitle: localize2('renderWhitespace.trailing', "Trailing"),
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
			shortTitle: localize2('renderWhitespace.all', "All"),
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

MenuRegistry.appendMenuItem(MenuId.EditorRenderWhitespaceSubmenu, { command: { id: RenderWhitespaceNoneAction.ID, title: localize('renderWhitespace.none', "None"), toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'none') }, group: '1_config', order: 1 });
MenuRegistry.appendMenuItem(MenuId.EditorRenderWhitespaceSubmenu, { command: { id: RenderWhitespaceBoundaryAction.ID, title: localize('renderWhitespace.boundary', "Boundary"), toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'boundary') }, group: '1_config', order: 2 });
MenuRegistry.appendMenuItem(MenuId.EditorRenderWhitespaceSubmenu, { command: { id: RenderWhitespaceSelectionAction.ID, title: localize('renderWhitespace.selection', "Selection"), toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'selection') }, group: '1_config', order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorRenderWhitespaceSubmenu, { command: { id: RenderWhitespaceTrailingAction.ID, title: localize('renderWhitespace.trailing', "Trailing"), toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'trailing') }, group: '1_config', order: 4 });
MenuRegistry.appendMenuItem(MenuId.EditorRenderWhitespaceSubmenu, { command: { id: RenderWhitespaceAllAction.ID, title: localize('renderWhitespace.all', "All"), toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'all') }, group: '1_config', order: 5 });
