/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/output.contribution';
import nls = require('vs/nls');
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import platform = require('vs/platform/platform');
import {MenuId, SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IKeybindings} from 'vs/platform/keybinding/common/keybinding';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {OutputService} from 'vs/workbench/parts/output/browser/outputServices';
import {ToggleOutputAction} from 'vs/workbench/parts/output/browser/outputActions';
import {OUTPUT_MIME, OUTPUT_MODE_ID, OUTPUT_PANEL_ID, IOutputService} from 'vs/workbench/parts/output/common/output';
import panel = require('vs/workbench/browser/panel');
import {KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID} from 'vs/editor/common/editorCommon';
import {CommandsRegistry, ICommandHandler} from 'vs/platform/commands/common/commands';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {MenuRegistry} from 'vs/platform/actions/browser/menuService';

// Register Service
registerSingleton(IOutputService, OutputService);

// Register Output Mode
ModesRegistry.registerCompatMode({
	id: OUTPUT_MODE_ID,
	extensions: [],
	aliases: [null],
	mimetypes: [OUTPUT_MIME],
	moduleId: 'vs/workbench/parts/output/common/outputMode',
	ctorName: 'OutputMode'
});

// Register Output Panel
(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/output/browser/outputPanel',
	'OutputPanel',
	OUTPUT_PANEL_ID,
	nls.localize('output', "Output"),
	'output'
));

// register toggle output action globally
let actionRegistry = <IWorkbenchActionRegistry>platform.Registry.as(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleOutputAction, ToggleOutputAction.ID, ToggleOutputAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_U,
	linux: {
		primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_H)  // On Ubuntu Ctrl+Shift+U is taken by some global OS command
	}
}), 'View: Toggle Output', nls.localize('viewCategory', "View"));


interface IActionDescriptor {
	id: string;
	handler: ICommandHandler;

	// ICommandUI
	title: string;
	category?: string;
	iconClass?: string;
	f1?: boolean;

	//
	menu?: {
		menuId: MenuId,
		when?: KbExpr;
		group?: string;
	};

	//
	keybinding?: {
		when?: KbExpr;
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
		KeybindingsRegistry.registerCommandRule({
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
		when: KbExpr.equals(KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID, OUTPUT_MODE_ID)
	},
	handler(accessor) {
		accessor.get(IOutputService).getActiveChannel().clear();
	}
});
