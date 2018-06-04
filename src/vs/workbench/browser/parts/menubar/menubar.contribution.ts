/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as menubarCommands from 'vs/workbench/browser/parts/menubar/menubarCommands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { isMacintosh } from 'vs/base/common/platform';

menubarCommands.setup();
fileMenuRegistration();
editMenuRegistration();
recentMenuRegistration();
selectionMenuRegistration();
viewMenuRegistration();
goMenuRegistration();
debugMenuRegistration();
tasksMenuRegistration();

if (isMacintosh) {
	windowMenuRegistration();
}

preferencesMenuRegistration();
helpMenuRegistration();

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
			title: nls.localize({ key: 'miSave', comment: ['&& denotes a mnemonic'] }, "&&Save"),
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
			id: 'workbench.action.toggleAutoSave',
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

	if (!isMacintosh) {
		MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
			group: 'z_Exit',
			command: {
				id: 'workbench.action.quit',
				title: nls.localize({ key: 'miExit', comment: ['&& denotes a mnemonic'] }, "E&&xit")
			},
			order: 1
		});
	}
}

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

function selectionMenuRegistration() {
	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '1_basic',
		command: {
			id: 'editor.action.selectAll',
			title: nls.localize({ key: 'miSelectAll', comment: ['&& denotes a mnemonic'] }, "&&Select All")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '1_basic',
		command: {
			id: 'editor.action.smartSelect.grow',
			title: nls.localize({ key: 'miSmartSelectGrow', comment: ['&& denotes a mnemonic'] }, "&&Expand Selection")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '1_basic',
		command: {
			id: 'editor.action.smartSelect.shrink',
			title: nls.localize({ key: 'miSmartSelectShrink', comment: ['&& denotes a mnemonic'] }, "&&Shrink Selection")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '2_line',
		command: {
			id: 'editor.action.copyLinesUpAction',
			title: nls.localize({ key: 'miCopyLinesUp', comment: ['&& denotes a mnemonic'] }, "&&Copy Line Up")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '2_line',
		command: {
			id: 'editor.action.copyLinesDownAction',
			title: nls.localize({ key: 'miCopyLinesDown', comment: ['&& denotes a mnemonic'] }, "Co&&py Line Down")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '2_line',
		command: {
			id: 'editor.action.moveLinesUpAction',
			title: nls.localize({ key: 'miMoveLinesUp', comment: ['&& denotes a mnemonic'] }, "Mo&&ve Line Up")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '2_line',
		command: {
			id: 'editor.action.moveLinesDownAction',
			title: nls.localize({ key: 'miMoveLinesDown', comment: ['&& denotes a mnemonic'] }, "Move &&Line Down")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '3_multi',
		command: {
			id: 'workbench.action.toggleMultiCursorModifier',
			title: nls.localize('miMultiCursorAlt', "Switch to Alt+Click for Multi-Cursor")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '3_multi',
		command: {
			id: 'editor.action.insertCursorAbove',
			title: nls.localize({ key: 'miInsertCursorAbove', comment: ['&& denotes a mnemonic'] }, "&&Add Cursor Above")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '3_multi',
		command: {
			id: 'editor.action.insertCursorBelow',
			title: nls.localize({ key: 'miInsertCursorBelow', comment: ['&& denotes a mnemonic'] }, "A&&dd Cursor Below")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '3_multi',
		command: {
			id: 'editor.action.insertCursorAtEndOfEachLineSelected',
			title: nls.localize({ key: 'miInsertCursorAtEndOfEachLineSelected', comment: ['&& denotes a mnemonic'] }, "Add C&&ursors to Line Ends")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '3_multi',
		command: {
			id: 'editor.action.addSelectionToNextFindMatch',
			title: nls.localize({ key: 'miAddSelectionToNextFindMatch', comment: ['&& denotes a mnemonic'] }, "Add &&Next Occurrence")
		},
		order: 5
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '3_multi',
		command: {
			id: 'editor.action.addSelectionToPreviousFindMatch',
			title: nls.localize({ key: 'miAddSelectionToPreviousFindMatch', comment: ['&& denotes a mnemonic'] }, "Add P&&revious Occurrence")
		},
		order: 6
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '3_multi',
		command: {
			id: 'editor.action.selectHighlights',
			title: nls.localize({ key: 'miSelectHighlights', comment: ['&& denotes a mnemonic'] }, "Select All &&Occurrences")
		},
		order: 7
	});
}

function recentMenuRegistration() {

}

function viewMenuRegistration() {

}

function goMenuRegistration() {

}

function debugMenuRegistration() {

}

function tasksMenuRegistration() {

}

function windowMenuRegistration() {

}

function preferencesMenuRegistration() {
	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '1_settings',
		command: {
			id: 'workbench.action.openSettings',
			title: nls.localize({ key: 'miOpenSettings', comment: ['&& denotes a mnemonic'] }, "&&Settings")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_keybindings',
		command: {
			id: 'workbench.action.openGlobalKeybindings',
			title: nls.localize({ key: 'miOpenKeymap', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_keybindings',
		command: {
			id: 'workbench.extensions.action.showRecommendedKeymapExtensions',
			title: nls.localize({ key: 'miOpenKeymapExtensions', comment: ['&& denotes a mnemonic'] }, "&&Keymap Extensions")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '3_snippets',
		command: {
			id: 'workbench.action.openSnippets',
			title: nls.localize({ key: 'miOpenSnippets', comment: ['&& denotes a mnemonic'] }, "User &&Snippets")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '4_themes',
		command: {
			id: 'workbench.action.selectTheme',
			title: nls.localize({ key: 'miSelectColorTheme', comment: ['&& denotes a mnemonic'] }, "&&Color Theme")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '4_themes',
		command: {
			id: 'workbench.action.selectIconTheme',
			title: nls.localize({ key: 'miSelectIconTheme', comment: ['&& denotes a mnemonic'] }, "File &&Icon Theme")
		},
		order: 2
	});
}

function helpMenuRegistration() {

}

// MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, {
// 	group: '3_workspace',
// 	command: {
// 		id: '',
// 		title: ''
// 	},
// 	order: 1
// });
