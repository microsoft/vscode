/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { MultiDiffEditorFileListFocusedContext } from '../common/multiDiffEditor.js';

class MultiDiffEditorFileListAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'multi-diff-editor-file-list';
	readonly type = AccessibleViewType.Help;
	readonly when = MultiDiffEditorFileListFocusedContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editorService = accessor.get(IEditorService);
		const editor = editorService.activeEditorPane;
		// Other multi diff editors, such as the Changes editor of Agents window chat windows, also host the list.
		const host = editor as { focusFileList?: () => void } | undefined;
		const focusFileList = typeof host?.focusFileList === 'function' ? () => host.focusFileList?.() : undefined;
		if (!focusFileList) {
			return undefined;
		}
		// Chat windows of the Agents window offer Toggle Files, unlike its main window.
		const chatWindow = !!accessor.get(IContextKeyService).getContextKeyValue<string>('sessions.chatWindow');

		// The Agents window's main window offers Toggle Details instead of Toggle Files, and the submenu in the tab bar's More Actions menu.
		const actionsHelp = chatWindow
			? localize('multiDiffEditor.fileListHelp.chatWindowActions', "Use Toggle Files in the editor toolbar to show or hide the changed files. The Files View & Position submenu in the editor toolbar's More Actions menu switches between a list and a folder tree, and moves the files to the left or right of the diffs.")
			: accessor.get(IWorkbenchEnvironmentService).isSessionsWindow
				? localize('multiDiffEditor.fileListHelp.agentsWindowActions', "Use Toggle Details in the editor toolbar{0} to show or hide the changed files. The Files View & Position submenu in the tab bar's More Actions menu switches between a list and a folder tree, and moves the files to the left or right of the diffs.", '<keybinding:workbench.action.agentSessions.toggleDetails>')
				: localize('multiDiffEditor.fileListHelp.actions', "Use Toggle Files in the editor toolbar or Command Palette to show or hide the changed files. The Files View & Position submenu in the editor toolbar's More Actions menu switches between a list and a folder tree, and moves the files to the left or right of the diffs.");

		const content = [
			localize('multiDiffEditor.fileListHelp.overview', "You are in the changed files list of a multi diff editor."),
			localize('multiDiffEditor.fileListHelp.navigation', "Use the Up and Down Arrow keys to navigate files. In tree mode, use the Left and Right Arrow keys to collapse or expand folders."),
			localize('multiDiffEditor.fileListHelp.open', "Press Enter to reveal the selected file and move focus to its diff."),
			actionsHelp,
		].join('\n');

		return new AccessibleContentProvider(
			AccessibleViewProviderId.MultiDiffEditorFileList,
			{ type: AccessibleViewType.Help },
			() => content,
			focusFileList,
			AccessibilityVerbositySettingId.MultiDiffEditorFileList,
		);
	}
}

AccessibleViewRegistry.register(new MultiDiffEditorFileListAccessibilityHelp());
