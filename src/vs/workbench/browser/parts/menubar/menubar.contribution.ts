/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { isMacintosh } from 'vs/base/common/platform';

editMenuRegistration();
selectionMenuRegistration();
layoutMenuRegistration();
goMenuRegistration();
tasksMenuRegistration();

if (isMacintosh) {
	windowMenuRegistration();
}

helpMenuRegistration();

// Menu registration

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

// TODO: Editor Layout Submenu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '2_appearance',
	title: nls.localize({ key: 'miEditorLayout', comment: ['&& denotes a mnemonic'] }, "Editor &&Layout"),
	submenu: MenuId.MenubarLayoutMenu,
	order: 2
});


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
			id: 'workbench.action.editorLayoutTwoRowsRight',
			title: nls.localize({ key: 'miTwoRowsRightEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two R&&ows Right")
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
