/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as menubarCommands from 'vs/workbench/browser/parts/menubar/menubarCommands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

menubarCommands.setup();
fileMenuRegistration();
editMenuRegistration();

// Menu registration - File Menu
function fileMenuRegistration() {
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
}

// MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
// 	group: '3_workspace',
// 	command: {
// 		id: '',
// 		title: ''
// 	},
// 	order: 1
// });

function editMenuRegistration() {
	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '1_do',
		command: {
			id: 'undo',
			title: nls.localize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '1_do',
		command: {
			id: 'redo',
			title: nls.localize({ key: 'miRedo', comment: ['&& denotes a mnemonic'] }, "&&Redo")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '2_ccp',
		command: {
			id: 'editor.action.clipboardCutAction',
			title: nls.localize({ key: 'miCut', comment: ['&& denotes a mnemonic'] }, "Cu&&t")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '2_ccp',
		command: {
			id: 'editor.action.clipboardCopyAction',
			title: nls.localize({ key: 'miCopy', comment: ['&& denotes a mnemonic'] }, "&&Copy")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '2_ccp',
		command: {
			id: 'editor.action.clipboardPasteAction',
			title: nls.localize({ key: 'miPaste', comment: ['&& denotes a mnemonic'] }, "&&Paste")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '3_find',
		command: {
			id: 'actions.find',
			title: nls.localize({ key: 'miFind', comment: ['&& denotes a mnemonic'] }, "&&Find")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '3_find',
		command: {
			id: 'editor.action.startFindReplaceAction',
			title: nls.localize({ key: 'miReplace', comment: ['&& denotes a mnemonic'] }, "&&Replace")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '4_find_global',
		command: {
			id: 'workbench.action.findInFiles',
			title: nls.localize({ key: 'miFindInFiles', comment: ['&& denotes a mnemonic'] }, "Find &&in Files")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '4_find_global',
		command: {

			id: 'workbench.action.replaceInFiles',
			title: nls.localize({ key: 'miReplaceInFiles', comment: ['&& denotes a mnemonic'] }, "Replace &&in Files")
		},
		order: 2
	});


	///


	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '5_insert',
		command: {
			id: 'editor.action.commentLine',
			title: nls.localize({ key: 'miToggleLineComment', comment: ['&& denotes a mnemonic'] }, "&&Toggle Line Comment")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '5_insert',
		command: {
			id: 'editor.action.blockComment',
			title: nls.localize({ key: 'miToggleBlockComment', comment: ['&& denotes a mnemonic'] }, "Toggle &&Block Comment")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '5_insert',
		command: {
			id: 'editor.emmet.action.expandAbbreviation',
			title: nls.localize({ key: 'miEmmetExpandAbbreviation', comment: ['&& denotes a mnemonic'] }, "Emmet: E&&xpand Abbreviation")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
		group: '5_insert',
		command: {
			id: 'workbench.action.showEmmetCommands',
			title: nls.localize({ key: 'miShowEmmetCommands', comment: ['&& denotes a mnemonic'] }, "E&&mmet...")
		},
		order: 2
	});
}
