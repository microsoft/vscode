/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/output.contribution';
import nls = require('vs/nls');
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { Registry } from 'vs/platform/platform';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IKeybindings } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { OutputService } from 'vs/workbench/parts/output/browser/outputServices';
import { ToggleOutputAction, ClearOutputAction } from 'vs/workbench/parts/output/browser/outputActions';
import { OUTPUT_MODE_ID, OUTPUT_MIME, OUTPUT_PANEL_ID, IOutputService, CONTEXT_IN_OUTPUT } from 'vs/workbench/parts/output/common/output';
import { PanelRegistry, Extensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

// Register Service
registerSingleton(IOutputService, OutputService);

// Register Output Mode
ModesRegistry.registerLanguage({
	id: OUTPUT_MODE_ID,
	extensions: [],
	aliases: [null],
	mimetypes: [OUTPUT_MIME]
});

// Register Output Panel
Registry.as<PanelRegistry>(Extensions.Panels).registerPanel(new PanelDescriptor(
	'vs/workbench/parts/output/browser/outputPanel',
	'OutputPanel',
	OUTPUT_PANEL_ID,
	nls.localize('output', "Output"),
	'output',
	20,
	ToggleOutputAction.ID
));

// register toggle output action globally
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleOutputAction, ToggleOutputAction.ID, ToggleOutputAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_U,
	linux: {
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_H)  // On Ubuntu Ctrl+Shift+U is taken by some global OS command
	}
}), 'View: Toggle Output', nls.localize('viewCategory', "View"));

actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ClearOutputAction, ClearOutputAction.ID, ClearOutputAction.LABEL),
	'View: Clear Output', nls.localize('viewCategory', "View"));


interface IActionDescriptor {
	id: string;
	handler: ICommandHandler;

	// ICommandUI
	title: string;
	category?: string;
	iconClass?: string;
	f1?: boolean;

	// menus
	menu?: {
		menuId: MenuId,
		when?: ContextKeyExpr;
		group?: string;
	};

	// keybindings
	keybinding?: {
		when?: ContextKeyExpr;
		weight: number;
		keys: IKeybindings;
	};
}

function registerAction(desc: IActionDescriptor) {

	const {id, handler, title, category, iconClass, f1, menu, keybinding} = desc;

	// 1) register as command
	CommandsRegistry.registerCommand(id, handler);

	// 2) command palette
	let command = { id, title, iconClass, category };
	if (f1) {
		MenuRegistry.addCommand(command);
	}

	// 3) menus
	if (menu) {
		let {menuId, when, group} = menu;
		MenuRegistry.appendMenuItem(menuId, {
			command,
			when,
			group
		});
	}

	// 4) keybindings
	if (keybinding) {
		let {when, weight, keys} = keybinding;
		KeybindingsRegistry.registerKeybindingRule({
			id,
			when,
			weight,
			primary: keys.primary,
			secondary: keys.secondary,
			linux: keys.linux,
			mac: keys.mac,
			win: keys.win
		});
	}
}

// Define clear command, contribute to editor context menu
registerAction({
	id: 'editor.action.clearoutput',
	title: nls.localize('clearOutput.label', "Clear Output"),
	menu: {
		menuId: MenuId.EditorContext,
		when: CONTEXT_IN_OUTPUT
	},
	handler(accessor) {
		accessor.get(IOutputService).getActiveChannel().clear();
	}
});
