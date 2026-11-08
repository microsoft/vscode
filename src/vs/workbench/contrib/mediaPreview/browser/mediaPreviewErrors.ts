/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DEFAULT_EDITOR_ASSOCIATION, EditorsOrder } from '../../../common/editor.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

/**
 * Replaces a media preview with the default text editor in all groups it is opened in. When the
 * preview is shown as part of a diff, the resource is opened in a separate text editor instead,
 * since a text diff of binary content falls back to the media diff again.
 */
export async function reopenInTextEditor(input: EditorInput, editorService: IEditorService): Promise<void> {
	const resource = input.resource;
	if (!resource) {
		return;
	}

	const options = { override: DEFAULT_EDITOR_ASSOCIATION.id, pinned: true };
	for (const { editor, groupId } of editorService.getEditors(EditorsOrder.SEQUENTIAL)) {
		if (editor === input) {
			await editorService.replaceEditors([{ editor, replacement: { resource, options } }], groupId);
		} else if (editor instanceof DiffEditorInput && (editor.original === input || editor.modified === input)) {
			await editorService.openEditor({ resource, options }, groupId);
		}
	}
}
