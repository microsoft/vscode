/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../base/browser/window.js';
import { EditorInput } from '../../workbench/common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../workbench/common/editor.js';
import { MainEditorAreaVisibleContext } from '../../workbench/common/contextkeys.js';
import { IEditorGroupsService } from '../../workbench/services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';

/**
 * Base class for Agents window editors whose content is surfaced in the docked
 * detail panel (the managed Changes and Files tabs) rather than the main editor
 * area. In the desktop (docked details) layout, re-activating such an editor
 * must not reveal the hidden editor area — {@link DesktopWorkbench} handles that.
 * These editors are exempt from the opened editors limit so an editor limit of 1
 * cannot evict the managed tabs, and they close only while the editor part that
 * shows them is visible.
 */
export abstract class DockedEditorInput extends EditorInput {

	protected constructor(
		private readonly dockedEditorGroupsService: IEditorGroupsService,
		private readonly dockedLayoutService: IWorkbenchLayoutService,
	) {
		super();
		this._register(dockedLayoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.EDITOR_PART) {
				this._onDidChangeCapabilities.fire();
			}
		}));
	}

	override get capabilities(): EditorInputCapabilities {
		const capabilities = EditorInputCapabilities.ExcludeFromEditorLimit;
		return this.isEditorPartVisible() ? capabilities : capabilities | EditorInputCapabilities.CannotClose;
	}

	/**
	 * Whether the editor part that shows this editor is visible, in whichever window. Each part binds
	 * {@link MainEditorAreaVisibleContext} for its own groups, such as the main part of another window for that window; the
	 * layout answers for the main part of the main window, and for an editor that no other part shows.
	 */
	private isEditorPartVisible(): boolean {
		for (const part of this.dockedEditorGroupsService.parts) {
			if (part === this.dockedEditorGroupsService.mainPart) {
				continue;
			}
			const group = part.groups.find(candidate => candidate.contains(this, { strictEquals: true }));
			if (group) {
				return group.scopedContextKeyService.getContextKeyValue<boolean>(MainEditorAreaVisibleContext.key) !== false;
			}
		}
		return this.dockedLayoutService.isVisible(Parts.EDITOR_PART, mainWindow);
	}
}
