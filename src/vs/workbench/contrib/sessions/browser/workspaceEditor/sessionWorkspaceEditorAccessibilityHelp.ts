/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { SessionWorkspaceEditorFocusedContext } from '../../common/contextkeys.js';

/**
 * Accessibility help for the Workspace editor, while it has focus: what its fields do and how the keyboard reaches the
 * actions of a folder in the Folders table.
 */
export class SessionWorkspaceEditorAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 130;
	readonly name = 'sessionWorkspaceEditor';
	readonly type = AccessibleViewType.Help;
	readonly when = SessionWorkspaceEditorFocusedContext;

	getProvider(_accessor: ServicesAccessor) {
		const previouslyFocused = getActiveElement();
		const content = [
			localize('workspaceEditorHelp.overview', "You are in the Workspace editor. A workspace is a named set of folders that sessions work in, starting in its default folder. Use Tab and Shift+Tab to move between its fields: Name, Icon, Color, Folders and Add Folder."),
			localize('workspaceEditorHelp.apply', "Changes to an existing workspace are saved as you make them. A new workspace is created when you activate Create, after the fields."),
			localize('workspaceEditorHelp.icon', "Activate the Icon button with Enter or Space to open the icon picker and choose an icon. Its Reset button restores the default icon."),
			localize('workspaceEditorHelp.color', "Color is a group of options. Use the arrow keys, Home and End to choose a color. After the colors, Choose Custom Color opens the system color picker; Left Arrow moves back to the colors."),
			localize('workspaceEditorHelp.folders', "The Folders table lists each folder's name and path; the default folder is announced as such. Use {0} and {1} to move between folders, then Tab to reach the focused folder's actions: Set as Default, which makes the folder the default, and Remove Folder. Use Left and Right Arrow to move between the actions and Enter or Space to run one.", '<keybinding:list.focusUp>', '<keybinding:list.focusDown>'),
			localize('workspaceEditorHelp.close', "Use {0} to close the editor. Focus returns to where it was.", '<keybinding:workbench.action.closeModalEditor>'),
		];
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionWorkspaceEditor,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => {
				if (isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
					previouslyFocused.focus();
				}
			},
			AccessibilityVerbositySettingId.SessionWorkspaceEditor,
		);
	}
}
