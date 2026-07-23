/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../workbench/common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../workbench/common/editor.js';

/**
 * Base class for Agents window editors whose content is surfaced in the docked
 * detail panel (the managed Changes and Files tabs) rather than the main editor
 * area. In the single-pane (docked details) layout, re-activating such an editor
 * must not reveal the hidden editor area — {@link SinglePaneWorkbench} handles that.
 * These editors are exempt from the opened editors limit so an editor limit of 1
 * cannot evict the managed tabs.
 */
export abstract class DockedEditorInput extends EditorInput {
	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.ExcludeFromEditorLimit;
	}
}
