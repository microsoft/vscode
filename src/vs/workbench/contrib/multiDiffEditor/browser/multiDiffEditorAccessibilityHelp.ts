/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { MultiDiffEditorFileListFocusedContext } from '../common/multiDiffEditor.js';
import { MultiDiffEditor } from './multiDiffEditor.js';

class MultiDiffEditorFileListAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'multi-diff-editor-file-list';
	readonly type = AccessibleViewType.Help;
	readonly when = MultiDiffEditorFileListFocusedContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editorService = accessor.get(IEditorService);
		const editor = editorService.activeEditorPane;
		if (!(editor instanceof MultiDiffEditor)) {
			return undefined;
		}

		const content = [
			localize('multiDiffEditor.fileListHelp.overview', "You are in the changed files list of a multi diff editor."),
			localize('multiDiffEditor.fileListHelp.navigation', "Use the Up and Down Arrow keys to navigate files. In tree mode, use the Left and Right Arrow keys to collapse or expand folders."),
			localize('multiDiffEditor.fileListHelp.open', "Press Enter to reveal the selected file and move focus to its diff."),
			localize('multiDiffEditor.fileListHelp.actions', "Use Toggle Files in the editor toolbar or Command Palette to show or hide the changed files. The Files View & Position submenu in the editor toolbar's More Actions menu switches between a list and a folder tree, and moves the files to the left or right of the diffs."),
		].join('\n');

		return new AccessibleContentProvider(
			AccessibleViewProviderId.MultiDiffEditorFileList,
			{ type: AccessibleViewType.Help },
			() => content,
			() => editor.focusFileList(),
			AccessibilityVerbositySettingId.MultiDiffEditorFileList,
		);
	}
}

AccessibleViewRegistry.register(new MultiDiffEditorFileListAccessibilityHelp());
