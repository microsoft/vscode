/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../workbench/common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../workbench/common/editor.js';
import { MainEditorAreaVisibleContext } from '../../workbench/common/contextkeys.js';
import { IEditorGroupsService } from '../../workbench/services/editor/common/editorGroupsService.js';

/**
 * Base class for Agents window editors whose content is surfaced in the docked
 * detail panel (the managed Changes and Files tabs) rather than the main editor
 * area. In the desktop (docked details) layout, re-activating such an editor
 * must not reveal the hidden editor area — {@link DesktopWorkbench} handles that.
 * These editors are exempt from the opened editors limit so an editor limit of 1
 * cannot evict the managed tabs.
 */
export abstract class DockedEditorInput extends EditorInput {
	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.ExcludeFromEditorLimit;
	}
}

/**
 * Whether the editor part that shows `editor` is visible. Each part binds {@link MainEditorAreaVisibleContext} for its
 * own groups, such as the main part of another window for that window; `isMainPartVisible` answers for the main part of
 * the main window, and for an editor that no other part shows.
 */
export function isEditorPartOfEditorVisible(editorGroupsService: IEditorGroupsService, editor: EditorInput, isMainPartVisible: () => boolean): boolean {
	for (const part of editorGroupsService.parts) {
		if (part === editorGroupsService.mainPart) {
			continue;
		}
		const group = part.groups.find(candidate => candidate.contains(editor, { strictEquals: true }));
		if (group) {
			return group.scopedContextKeyService.getContextKeyValue<boolean>(MainEditorAreaVisibleContext.key) !== false;
		}
	}
	return isMainPartVisible();
}
