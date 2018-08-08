/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { isMacintosh } from 'vs/base/common/platform';

goMenuRegistration();

if (isMacintosh) {
	windowMenuRegistration();
}

helpMenuRegistration();

// Menu registration
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
	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
		group: '1_any',
		command: {
			id: 'workbench.action.nextEditor',
			title: nls.localize({ key: 'miNextEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Editor")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
		group: '1_any',
		command: {
			id: 'workbench.action.previousEditor',
			title: nls.localize({ key: 'miPreviousEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
		group: '2_used',
		command: {
			id: 'workbench.action.openNextRecentlyUsedEditorInGroup',
			title: nls.localize({ key: 'miNextEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor in Group")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
		group: '2_used',
		command: {
			id: 'workbench.action.openPreviousRecentlyUsedEditorInGroup',
			title: nls.localize({ key: 'miPreviousEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor in Group")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '2_switch',
		title: nls.localize({ key: 'miSwitchEditor', comment: ['&& denotes a mnemonic'] }, "Switch &&Editor"),
		submenu: MenuId.MenubarSwitchEditorMenu,
		order: 1
	});

	// Switch Group
	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '1_focus_index',
		command: {
			id: 'workbench.action.focusFirstEditorGroup',
			title: nls.localize({ key: 'miFocusFirstGroup', comment: ['&& denotes a mnemonic'] }, "Group &&1")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '1_focus_index',
		command: {
			id: 'workbench.action.focusSecondEditorGroup',
			title: nls.localize({ key: 'miFocusSecondGroup', comment: ['&& denotes a mnemonic'] }, "Group &&2")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '1_focus_index',
		command: {
			id: 'workbench.action.focusThirdEditorGroup',
			title: nls.localize({ key: 'miFocusThirdGroup', comment: ['&& denotes a mnemonic'] }, "Group &&3")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '1_focus_index',
		command: {
			id: 'workbench.action.focusFourthEditorGroup',
			title: nls.localize({ key: 'miFocusFourthGroup', comment: ['&& denotes a mnemonic'] }, "Group &&4")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '1_focus_index',
		command: {
			id: 'workbench.action.focusFifthEditorGroup',
			title: nls.localize({ key: 'miFocusFifthGroup', comment: ['&& denotes a mnemonic'] }, "Group &&5")
		},
		order: 5
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '2_next_prev',
		command: {
			id: 'workbench.action.focusNextGroup',
			title: nls.localize({ key: 'miNextGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Group")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '2_next_prev',
		command: {
			id: 'workbench.action.focusPreviousGroup',
			title: nls.localize({ key: 'miPreviousGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Group")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '3_directional',
		command: {
			id: 'workbench.action.focusLeftGroup',
			title: nls.localize({ key: 'miFocusLeftGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Left")
		},
		order: 1
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '3_directional',
		command: {
			id: 'workbench.action.focusRightGroup',
			title: nls.localize({ key: 'miFocusRightGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Right")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '3_directional',
		command: {
			id: 'workbench.action.focusAboveGroup',
			title: nls.localize({ key: 'miFocusAboveGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Above")
		},
		order: 3
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
		group: '3_directional',
		command: {
			id: 'workbench.action.focusBelowGroup',
			title: nls.localize({ key: 'miFocusBelowGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Below")
		},
		order: 4
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
		group: '2_switch',
		title: nls.localize({ key: 'miSwitchGroup', comment: ['&& denotes a mnemonic'] }, "Switch &&Group"),
		submenu: MenuId.MenubarSwitchGroupMenu,
		order: 2
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
			title: nls.localize({ key: 'miGotoTypeDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Type Definition")
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

	if (!isMacintosh) {
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
}
