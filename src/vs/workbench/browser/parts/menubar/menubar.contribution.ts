/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as menubarCommands from 'vs/workbench/browser/parts/menubar/menubarCommands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { isMacintosh } from 'vs/base/common/platform';

// TODO: Add submenu support to remove layout, preferences, and recent top level
menubarCommands.setup();
recentMenuRegistration();
fileMenuRegistration();
editMenuRegistration();
selectionMenuRegistration();
viewMenuRegistration();
layoutMenuRegistration();
goMenuRegistration();
debugMenuRegistration();
tasksMenuRegistration();
terminalMenuRegistration();

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
		title: nls.localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent"),
		submenu: MenuId.MenubarRecentMenu,
		group: '2_open',
		order: 4
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
		title: nls.localize({ key: 'miPreferences', comment: ['&& denotes a mnemonic'] }, "&&Preferences"),
		submenu: MenuId.MenubarPreferencesMenu,
		group: '5_autosave',
		order: 2
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
	// Editor
	MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
		group: '1_editor',
		command: {
			id: 'workbench.action.reopenClosedEditor',
			title: nls.localize({ key: 'miReopenClosedEditor', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed Editor")
		},
		order: 1
	});

	// More
	MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
		group: 'y_more',
		command: {
			id: 'workbench.action.openRecent',
			title: nls.localize({ key: 'miMore', comment: ['&& denotes a mnemonic'] }, "&&More...")
		},
		order: 1
	});

	// Clear
	MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
		group: 'z_clear',
		command: {
			id: 'workbench.action.clearRecentFiles',
			title: nls.localize({ key: 'miClearRecentOpen', comment: ['&& denotes a mnemonic'] }, "&&Clear Recently Opened")
		},
		order: 1
	});

}

function viewMenuRegistration() {

	// Command Palette
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: 'workbench.action.showCommands',
			title: nls.localize({ key: 'miCommandPalette', comment: ['&& denotes a mnemonic'] }, "&&Command Palette...")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: 'workbench.action.openView',
			title: nls.localize({ key: 'miOpenView', comment: ['&& denotes a mnemonic'] }, "&&Open View...")
		},
		order: 2
	});

	// Viewlets
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '2_views',
		command: {
			id: 'workbench.view.explorer',
			title: nls.localize({ key: 'miViewExplorer', comment: ['&& denotes a mnemonic'] }, "&&Explorer")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '2_views',
		command: {
			id: 'workbench.view.search',
			title: nls.localize({ key: 'miViewSearch', comment: ['&& denotes a mnemonic'] }, "&&Search")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '2_views',
		command: {
			id: 'workbench.view.scm',
			title: nls.localize({ key: 'miViewSCM', comment: ['&& denotes a mnemonic'] }, "S&&CM")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '2_views',
		command: {
			id: 'workbench.view.debug',
			title: nls.localize({ key: 'miViewDebug', comment: ['&& denotes a mnemonic'] }, "&&Debug")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '2_views',
		command: {
			id: 'workbench.view.extensions',
			title: nls.localize({ key: 'miViewExtensions', comment: ['&& denotes a mnemonic'] }, "E&&xtensions")
		},
		order: 5
	});

	// Panels
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '3_panels',
		command: {
			id: 'workbench.action.output.toggleOutput',
			title: nls.localize({ key: 'miToggleOutput', comment: ['&& denotes a mnemonic'] }, "&&Output")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '3_panels',
		command: {
			id: 'workbench.debug.action.toggleRepl',
			title: nls.localize({ key: 'miToggleDebugConsole', comment: ['&& denotes a mnemonic'] }, "De&&bug Console")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '3_panels',
		command: {
			id: 'workbench.action.terminal.toggleTerminal',
			title: nls.localize({ key: 'miToggleIntegratedTerminal', comment: ['&& denotes a mnemonic'] }, "&&Integrated Terminal")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '3_panels',
		command: {
			id: 'workbench.actions.view.problems',
			title: nls.localize({ key: 'miMarker', comment: ['&& denotes a mnemonic'] }, "&&Problems")
		},
		order: 4
	});

	// Toggle View
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '4_toggle_view',
		command: {
			id: 'workbench.action.toggleFullScreen',
			title: nls.localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "Toggle &&Full Screen")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '4_toggle_view',
		command: {
			id: 'workbench.action.toggleZenMode',
			title: nls.localize('miToggleZenMode', "Toggle Zen Mode")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '4_toggle_view',
		command: {
			id: 'workbench.action.toggleCenteredLayout',
			title: nls.localize('miToggleCenteredLayout', "Toggle Centered Layout")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '4_toggle_view',
		command: {
			id: 'workbench.action.toggleMenuBar',
			title: nls.localize({ key: 'miToggleMenuBar', comment: ['&& denotes a mnemonic'] }, "Toggle Menu &&Bar")
		},
		order: 4
	});

	// TODO: Editor Layout Submenu
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		title: nls.localize({ key: 'miEditorLayout', comment: ['&& denotes a mnemonic'] }, "Editor &&Layout"),
		submenu: MenuId.MenubarLayoutMenu,
		group: '5_layout',
		order: 1
	});


	// Workbench Layout
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '6_workbench_layout',
		command: {
			id: 'workbench.action.toggleSidebarVisibility',
			title: nls.localize({ key: 'miToggleSidebar', comment: ['&& denotes a mnemonic'] }, "&&Toggle Side Bar")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '6_workbench_layout',
		command: {
			id: 'workbench.action.toggleSidebarPosition',
			title: nls.localize({ key: 'miMoveSidebarLeftRight', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar Left/Right")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '6_workbench_layout',
		command: {
			id: 'workbench.action.toggleStatusbarVisibility',
			title: nls.localize({ key: 'miToggleStatusbar', comment: ['&& denotes a mnemonic'] }, "&&Toggle Status Bar")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '6_workbench_layout',
		command: {
			id: 'workbench.action.toggleActivityBarVisibility',
			title: nls.localize({ key: 'miToggleActivityBar', comment: ['&& denotes a mnemonic'] }, "Toggle &&Activity Bar")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '6_workbench_layout',
		command: {
			id: 'workbench.action.togglePanel',
			title: nls.localize({ key: 'miTogglePanel', comment: ['&& denotes a mnemonic'] }, "Toggle &&Panel")
		},
		order: 5
	});

	// Toggle Editor Settings
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '8_editor',
		command: {
			id: 'workbench.action.toggleWordWrap',
			title: nls.localize({ key: 'miToggleWordWrap', comment: ['&& denotes a mnemonic'] }, "Toggle &&Word Wrap")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '8_editor',
		command: {
			id: 'workbench.action.toggleMinimap',
			title: nls.localize({ key: 'miToggleMinimap', comment: ['&& denotes a mnemonic'] }, "Toggle &&Minimap")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '8_editor',
		command: {
			id: 'workbench.action.toggleRenderWhitespace',
			title: nls.localize({ key: 'miToggleRenderWhitespace', comment: ['&& denotes a mnemonic'] }, "Toggle &&Render Whitespace")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '8_editor',
		command: {
			id: 'workbench.action.toggleRenderControlCharacters',
			title: nls.localize({ key: 'miToggleRenderControlCharacters', comment: ['&& denotes a mnemonic'] }, "Toggle &&Control Characters")
		},
		order: 4
	});

	// Zoom
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '9_zoom',
		command: {
			id: 'workbench.action.zoomIn',
			title: nls.localize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom In")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '9_zoom',
		command: {
			id: 'workbench.action.zoomOut',
			title: nls.localize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "&&Zoom Out")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '9_zoom',
		command: {
			id: 'workbench.action.zoomReset',
			title: nls.localize({ key: 'miZoomReset', comment: ['&& denotes a mnemonic'] }, "&&Reset Zoom")
		},
		order: 3
	});
}

function layoutMenuRegistration() {
	// Split
	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '1_split',
		command: {
			id: 'workbench.action.splitEditorUp',
			title: nls.localize({ key: 'miSplitEditorUp', comment: ['&& denotes a mnemonic'] }, "Split &&Up")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '1_split',
		command: {
			id: 'workbench.action.splitEditorDown',
			title: nls.localize({ key: 'miSplitEditorDown', comment: ['&& denotes a mnemonic'] }, "Split &&Down")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '1_split',
		command: {
			id: 'workbench.action.splitEditorLeft',
			title: nls.localize({ key: 'miSplitEditorLeft', comment: ['&& denotes a mnemonic'] }, "Split &&Left")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '1_split',
		command: {
			id: 'workbench.action.splitEditorRight',
			title: nls.localize({ key: 'miSplitEditorRight', comment: ['&& denotes a mnemonic'] }, "Split &&Right")
		},
		order: 4
	});

	// Layouts
	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutSingle',
			title: nls.localize({ key: 'miSingleColumnEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Single")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutCentered',
			title: nls.localize({ key: 'miCenteredEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Centered")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutTwoColumns',
			title: nls.localize({ key: 'miTwoColumnsEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Two Columns")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutThreeColumns',
			title: nls.localize({ key: 'miThreeColumnsEditorLayout', comment: ['&& denotes a mnemonic'] }, "T&&hree Columns")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutTwoRows',
			title: nls.localize({ key: 'miTwoRowsEditorLayout', comment: ['&& denotes a mnemonic'] }, "T&&wo Rows")
		},
		order: 5
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutThreeRows',
			title: nls.localize({ key: 'miThreeRowsEditorLayout', comment: ['&& denotes a mnemonic'] }, "Three &&Rows")
		},
		order: 6
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutTwoByTwoGrid',
			title: nls.localize({ key: 'miTwoByTwoGridEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Grid (2x2)")
		},
		order: 7
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutTwoColumnsRight',
			title: nls.localize({ key: 'miTwoColumnsRightEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two C&&olumns Right")
		},
		order: 8
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: '2_layouts',
		command: {
			id: 'workbench.action.editorLayoutTwoColumnsBottom',
			title: nls.localize({ key: 'miTwoColumnsBottomEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two &&Columns Bottom")
		},
		order: 9
	});

	// Flip
	MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
		group: 'z_flip',
		command: {
			id: 'workbench.action.toggleEditorGroupLayout',
			title: nls.localize({ key: 'miToggleEditorLayout', comment: ['&& denotes a mnemonic'] }, "Flip &&Layout")
		},
		order: 1
	});

}

function goMenuRegistration() {
	// Forward/Back
	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '1_fwd_back',
		command: {
			id: 'workbench.action.navigateBack',
			title: nls.localize({ key: 'miBack', comment: ['&& denotes a mnemonic'] }, "&&Back")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '1_fwd_back',
		command: {
			id: 'workbench.action.navigateForward',
			title: nls.localize({ key: 'miForward', comment: ['&& denotes a mnemonic'] }, "&&Forward")
		},
		order: 2
	});

	// Switch Editor
	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '2_switch_editor',
		command: {
			id: 'workbench.action.nextEditor',
			title: nls.localize({ key: 'miNextEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Editor")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '2_switch_editor',
		command: {
			id: 'workbench.action.previousEditor',
			title: nls.localize({ key: 'miPreviousEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '2_switch_editor',
		command: {
			id: 'workbench.action.openNextRecentlyUsedEditorInGroup',
			title: nls.localize({ key: 'miNextEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor in Group")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '2_switch_editor',
		command: {
			id: 'workbench.action.openPreviousRecentlyUsedEditorInGroup',
			title: nls.localize({ key: 'miPreviousEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor in Group")
		},
		order: 4
	});

	// Switch Group
	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '3_switch_group',
		command: {
			id: 'workbench.action.focusNextGroup',
			title: nls.localize({ key: 'miNextGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Group")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '3_switch_group',
		command: {
			id: 'workbench.action.focusPreviousGroup',
			title: nls.localize({ key: 'miPreviousGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Group")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '3_switch_group',
		command: {
			id: 'workbench.action.focusLeftGroup',
			title: nls.localize({ key: 'miFocusLeftGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Left")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '3_switch_group',
		command: {
			id: 'workbench.action.focusRightGroup',
			title: nls.localize({ key: 'miFocusRightGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Right")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '3_switch_group',
		command: {
			id: 'workbench.action.focusAboveGroup',
			title: nls.localize({ key: 'miFocusAboveGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Above")
		},
		order: 5
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '3_switch_group',
		command: {
			id: 'workbench.action.focusBelowGroup',
			title: nls.localize({ key: 'miFocusBelowGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Below")
		},
		order: 6
	});

	// Go to
	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: 'z_go_to',
		command: {
			id: 'workbench.action.quickOpen',
			title: nls.localize({ key: 'miGotoFile', comment: ['&& denotes a mnemonic'] }, "Go to &&File...")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: 'z_go_to',
		command: {
			id: 'workbench.action.gotoSymbol',
			title: nls.localize({ key: 'miGotoSymbolInFile', comment: ['&& denotes a mnemonic'] }, "Go to &&Symbol in File...")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: 'z_go_to',
		command: {
			id: 'workbench.action.showAllSymbols',
			title: nls.localize({ key: 'miGotoSymbolInWorkspace', comment: ['&& denotes a mnemonic'] }, "Go to Symbol in &&Workspace...")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: 'z_go_to',
		command: {
			id: 'editor.action.goToDeclaration',
			title: nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: 'z_go_to',
		command: {
			id: 'editor.action.goToTypeDefinition',
			title: nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition")
		},
		order: 5
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: 'z_go_to',
		command: {
			id: 'editor.action.goToImplementation',
			title: nls.localize({ key: 'miGotoImplementation', comment: ['&& denotes a mnemonic'] }, "Go to &&Implementation")
		},
		order: 6
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: 'z_go_to',
		command: {
			id: 'workbench.action.gotoLine',
			title: nls.localize({ key: 'miGotoLine', comment: ['&& denotes a mnemonic'] }, "Go to &&Line...")
		},
		order: 7
	});
}

function debugMenuRegistration() {
	// Start/Stop Debug
	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '1_debug',
		command: {
			id: 'workbench.action.debug.start',
			title: nls.localize({ key: 'miStartDebugging', comment: ['&& denotes a mnemonic'] }, "&&Start Debugging")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '1_debug',
		command: {
			id: 'workbench.action.debug.run',
			title: nls.localize({ key: 'miStartWithoutDebugging', comment: ['&& denotes a mnemonic'] }, "Start &&Without Debugging")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '1_debug',
		command: {
			id: 'workbench.action.debug.stop',
			title: nls.localize({ key: 'miStopDebugging', comment: ['&& denotes a mnemonic'] }, "&&Stop Debugging")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '1_debug',
		command: {
			id: 'workbench.action.debug.restart',
			title: nls.localize({ key: 'miRestart Debugging', comment: ['&& denotes a mnemonic'] }, "&&Restart Debugging")
		},
		order: 4
	});

	// Configuration
	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '2_configuration',
		command: {
			id: 'workbench.action.debug.configure',
			title: nls.localize({ key: 'miOpenConfigurations', comment: ['&& denotes a mnemonic'] }, "Open &&Configurations")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '2_configuration',
		command: {
			id: 'debug.addConfiguration',
			title: nls.localize({ key: 'miAddConfiguration', comment: ['&& denotes a mnemonic'] }, "Add Configuration...")
		},
		order: 2
	});

	// Step Commands
	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '3_step',
		command: {
			id: 'workbench.action.debug.stepOver',
			title: nls.localize({ key: 'miStepOver', comment: ['&& denotes a mnemonic'] }, "Step &&Over")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '3_step',
		command: {
			id: 'workbench.action.debug.stepInto',
			title: nls.localize({ key: 'miStepInto', comment: ['&& denotes a mnemonic'] }, "Step &&Into")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '3_step',
		command: {
			id: 'workbench.action.debug.stepOut',
			title: nls.localize({ key: 'miStepOut', comment: ['&& denotes a mnemonic'] }, "Step O&&ut")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '3_step',
		command: {
			id: 'workbench.action.debug.continue',
			title: nls.localize({ key: 'miContinue', comment: ['&& denotes a mnemonic'] }, "&&Continue")
		},
		order: 4
	});

	// New Breakpoints
	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '4_new_breakpoint',
		command: {
			id: 'editor.debug.action.toggleBreakpoint',
			title: nls.localize({ key: 'miToggleBreakpoint', comment: ['&& denotes a mnemonic'] }, "Toggle &&Breakpoint")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '4_new_breakpoint',
		command: {
			id: 'editor.debug.action.conditionalBreakpoint',
			title: nls.localize({ key: 'miConditionalBreakpoint', comment: ['&& denotes a mnemonic'] }, "Toggle &&Conditional Breakpoint...")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '4_new_breakpoint',
		command: {
			id: 'editor.debug.action.toggleInlineBreakpoint',
			title: nls.localize({ key: 'miInlineBreakpoint', comment: ['&& denotes a mnemonic'] }, "Toggle Inline Breakp&&oint")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '4_new_breakpoint',
		command: {
			id: 'workbench.debug.viewlet.action.addFunctionBreakpointAction',
			title: nls.localize({ key: 'miFunctionBreakpoint', comment: ['&& denotes a mnemonic'] }, "Toggle &&Function Breakpoint...")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '4_new_breakpoint',
		command: {
			id: 'editor.debug.action.toggleLogPoint',
			title: nls.localize({ key: 'miLogPoint', comment: ['&& denotes a mnemonic'] }, "Toggle &&Logpoint...")
		},
		order: 5
	});

	// Modify Breakpoints
	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '5_breakpoints',
		command: {
			id: 'workbench.debug.viewlet.action.enableAllBreakpoints',
			title: nls.localize({ key: 'miEnableAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Enable All Breakpoints")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '5_breakpoints',
		command: {
			id: 'workbench.debug.viewlet.action.disableAllBreakpoints',
			title: nls.localize({ key: 'miDisableAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Disable A&&ll Breakpoints")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
		group: '5_breakpoints',
		command: {
			id: 'workbench.debug.viewlet.action.removeAllBreakpoints',
			title: nls.localize({ key: 'miRemoveAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Remove &&All Breakpoints")
		},
		order: 3
	});

}

function tasksMenuRegistration() {
	// Run Tasks
	MenuRegistry.appendMenuItem(MenuId.MenubarTasksMenu, {
		group: '1_run',
		command: {
			id: 'workbench.action.tasks.runTask',
			title: nls.localize({ key: 'miRunTask', comment: ['&& denotes a mnemonic'] }, "&&Run Task...")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTasksMenu, {
		group: '1_run',
		command: {
			id: 'workbench.action.tasks.build',
			title: nls.localize({ key: 'miBuildTask', comment: ['&& denotes a mnemonic'] }, "Run &&Build Task...")
		},
		order: 2
	});

	// Manage Tasks
	MenuRegistry.appendMenuItem(MenuId.MenubarTasksMenu, {
		group: '2_manage',
		command: {
			id: 'workbench.action.tasks.showTasks',
			title: nls.localize({ key: 'miRunningTask', comment: ['&& denotes a mnemonic'] }, "Show Runnin&&g Tasks...")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTasksMenu, {
		group: '2_manage',
		command: {
			id: 'workbench.action.tasks.restartTask',
			title: nls.localize({ key: 'miRestartTask', comment: ['&& denotes a mnemonic'] }, "R&&estart Running Task...")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTasksMenu, {
		group: '2_manage',
		command: {
			id: 'workbench.action.tasks.terminate',
			title: nls.localize({ key: 'miTerminateTask', comment: ['&& denotes a mnemonic'] }, "&&Terminate Task...")
		},
		order: 3
	});

	// Configure Tasks
	MenuRegistry.appendMenuItem(MenuId.MenubarTasksMenu, {
		group: '3_configure',
		command: {
			id: 'workbench.action.tasks.configureTaskRunner',
			title: nls.localize({ key: 'miConfigureTask', comment: ['&& denotes a mnemonic'] }, "&&Configure Tasks...")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTasksMenu, {
		group: '3_configure',
		command: {
			id: 'workbench.action.tasks.configureDefaultBuildTask',
			title: nls.localize({ key: 'miConfigureBuildTask', comment: ['&& denotes a mnemonic'] }, "Configure De&&fault Build Task...")
		},
		order: 2
	});

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
	// Welcome
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '1_welcome',
		command: {
			id: 'workbench.action.showWelcomePage',
			title: nls.localize({ key: 'miWelcome', comment: ['&& denotes a mnemonic'] }, "&&Welcome")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '1_welcome',
		command: {
			id: 'workbench.action.showInteractivePlayground',
			title: nls.localize({ key: 'miInteractivePlayground', comment: ['&& denotes a mnemonic'] }, "&&Interactive Playground")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '1_welcome',
		command: {
			id: 'workbench.action.openDocumentationUrl',
			title: nls.localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '1_welcome',
		command: {
			id: 'update.showCurrentReleaseNotes',
			title: nls.localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes")
		},
		order: 4
	});

	// Reference
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '2_reference',
		command: {
			id: 'workbench.action.keybindingsReference',
			title: nls.localize({ key: 'miKeyboardShortcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts Reference")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '2_reference',
		command: {
			id: 'workbench.action.openIntroductoryVideosUrl',
			title: nls.localize({ key: 'miIntroductoryVideos', comment: ['&& denotes a mnemonic'] }, "Introductory &&Videos")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '2_reference',
		command: {
			id: 'workbench.action.openTipsAndTricksUrl',
			title: nls.localize({ key: 'miTipsAndTricks', comment: ['&& denotes a mnemonic'] }, "&&Tips and Tricks")
		},
		order: 3
	});

	// Feedback
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '3_feedback',
		command: {
			id: 'workbench.action.openTwitterUrl',
			title: nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join us on Twitter")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '3_feedback',
		command: {
			id: 'workbench.action.openRequestFeatureUrl',
			title: nls.localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Search Feature Requests")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '3_feedback',
		command: {
			id: 'workbench.action.openIssueReporter',
			title: nls.localize({ key: 'miReportIssue', comment: ['&& denotes a mnemonic', 'Translate this to "Report Issue in English" in all languages please!'] }, "Report &&Issue")
		},
		order: 3
	});

	// Legal
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '4_legal',
		command: {
			id: 'workbench.action.openLicenseUrl',
			title: nls.localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '4_legal',
		command: {
			id: 'workbench.action.openPrivacyStatementUrl',
			title: nls.localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "&&Privacy Statement")
		},
		order: 2
	});

	// Tools
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '5_tools',
		command: {
			id: 'workbench.action.toggleDevTools',
			title: nls.localize({ key: 'miToggleDevTools', comment: ['&& denotes a mnemonic'] }, "&&Toggle Developer Tools")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '5_tools',
		command: {
			id: 'workbench.action.openProcessExplorer',
			title: nls.localize({ key: 'miOpenProcessExplorerer', comment: ['&& denotes a mnemonic'] }, "Open &&Process Explorer")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '5_tools',
		command: {
			id: 'workbench.action.showAccessibilityOptions',
			title: nls.localize({ key: 'miAccessibilityOptions', comment: ['&& denotes a mnemonic'] }, "Accessibility &&Options")
		},
		order: 3
	});

	// About
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: 'z_about',
		command: {
			id: 'workbench.action.showAboutDialog',
			title: nls.localize({ key: 'miAbout', comment: ['&& denotes a mnemonic'] }, "&&About")
		},
		order: 1
	});
}

function terminalMenuRegistration() {

	// Manage

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '1_manage',
		command: {
			id: 'workbench.action.terminal.new',
			title: nls.localize({ key: 'miNewTerminal', comment: ['&& denotes a mnemonic'] }, "&&New Terminal")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '1_manage',
		command: {
			id: 'workbench.action.terminal.split',
			title: nls.localize({ key: 'miSplitTerminal', comment: ['&& denotes a mnemonic'] }, "&&Split Terminal")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '1_manage',
		command: {
			id: 'workbench.action.terminal.kill',
			title: nls.localize({ key: 'miKillTerminal', comment: ['&& denotes a mnemonic'] }, "&&Kill Terminal")
		},
		order: 3
	});

	// Run

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '2_run',
		command: {
			id: 'workbench.action.terminal.clear',
			title: nls.localize({ key: 'miClear', comment: ['&& denotes a mnemonic'] }, "&&Clear")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '2_run',
		command: {
			id: 'workbench.action.terminal.runActiveFile',
			title: nls.localize({ key: 'miRunActiveFile', comment: ['&& denotes a mnemonic'] }, "Run &&Active File")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '2_run',
		command: {
			id: 'workbench.action.terminal.runSelectedFile',
			title: nls.localize({ key: 'miRunSelectedText', comment: ['&& denotes a mnemonic'] }, "Run &&Selected Text")
		},
		order: 3
	});

	// Selection

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '3_selection',
		command: {
			id: 'workbench.action.terminal.scrollToPreviousCommand',
			title: nls.localize({ key: 'miScrollToPreviousCommand', comment: ['&& denotes a mnemonic'] }, "Scroll To Previous Command")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '3_selection',
		command: {
			id: 'workbench.action.terminal.scrollToNextCommand',
			title: nls.localize({ key: 'miScrollToNextCommand', comment: ['&& denotes a mnemonic'] }, "Scroll To Next Command")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '3_selection',
		command: {
			id: 'workbench.action.terminal.selectToPreviousCommand',
			title: nls.localize({ key: 'miSelectToPreviousCommand', comment: ['&& denotes a mnemonic'] }, "Select To Previous Command")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '3_selection',
		command: {
			id: 'workbench.action.terminal.selectToNextCommand',
			title: nls.localize({ key: 'miSelectToNextCommand', comment: ['&& denotes a mnemonic'] }, "Select To Next Command")
		},
		order: 4
	});
}