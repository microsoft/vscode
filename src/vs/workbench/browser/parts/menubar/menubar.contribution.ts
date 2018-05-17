/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as menubarCommands from 'vs/workbench/browser/parts/menubar/menubarCommands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

menubarCommands.setup();

// Menu registration - File Menu
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '1_new',
	command: {
		id: 'workbench.action.files.newUntitledFile',
		title: nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New File")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '1_new',
	command: {
		id: 'workbench.action.newWindow',
		title: nls.localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: 'workbench.action.files.openFile',
		title: nls.localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: 'workbench.action.files.openFolder',
		title: nls.localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: 'workbench.action.openWorkspace',
		title: nls.localize({ key: 'miOpenWorkspace', comment: ['&& denotes a mnemonic'] }, "Open Wor&&kspace...")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: 'workbench.action.addRootFolder',
		title: nls.localize({ key: 'miAddFolderToWorkspace', comment: ['&& denotes a mnemonic'] }, "A&&dd Folder to Workspace...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: 'workbench.action.saveWorkspaceAs',
		title: nls.localize('miSaveWorkspaceAs', "Save Workspace As...")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '4_save',
	command: {
		id: 'workbench.action.files.save',
		title: nls.localize({ key: 'miSave', comment: ['&& denotes a mnemonic'] }, "&&Save")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '4_save',
	command: {
		id: 'workbench.action.files.saveAs',
		title: nls.localize({ key: 'miSaveAs', comment: ['&& denotes a mnemonic'] }, "Save &&As...")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '4_save',
	command: {
		id: 'workbench.action.files.saveAll',
		title: nls.localize({ key: 'miSaveAll', comment: ['&& denotes a mnemonic'] }, "Save A&&ll")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '5_autosave',
	command: {
		id: 'vscode.toggleAutoSave',
		title: nls.localize('miAutoSave', "Auto Save")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: '',
		title: nls.localize({ key: 'miRevert', comment: ['&& denotes a mnemonic'] }, "Re&&vert File")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: 'workbench.action.closeActiveEditor',
		title: nls.localize({ key: 'miCloseEditor', comment: ['&& denotes a mnemonic'] }, "&&Close Editor")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: 'workbench.action.closeFolder',
		title: nls.localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: 'workbench.action.closeWindow',
		title: nls.localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Clos&&e Window")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: 'z_Exit',
	command: {
		id: 'workbench.action.quit',
		title: nls.localize({ key: 'miExit', comment: ['&& denotes a mnemonic'] }, "E&&xit")
	},
	order: 1
});

// MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
// 	group: '3_workspace',
// 	command: {
// 		id: '',
// 		title: ''
// 	},
// 	order: 1
// });

MenuRegistry.appendMenuItem(
	MenuId.MenubarEditMenu,
	{
		command: {
			id: menubarCommands.FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
			title: nls.localize('copy', "Copy")
		},
		group: '1_basic',
		order: 2
	});

MenuRegistry.appendMenuItem(
	MenuId.MenubarEditMenu,
	{
		command: {
			id: menubarCommands.FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
			title: nls.localize('paste', "Paste")
		},
		group: '1_basic',
		order: 3
	});