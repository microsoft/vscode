/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { findDiffEditorContainingCodeEditor } from '../../../../../editor/browser/widget/diffEditor/commands.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IModifiedFileEntry } from '../../common/editing/chatEditingService.js';

export function isTextDiffEditorForEntry(accessor: ServicesAccessor, entry: IModifiedFileEntry, editor: ICodeEditor) {
	const diffEditor = findDiffEditorContainingCodeEditor(accessor, editor);
	if (!diffEditor) {
		return false;
	}
	const originalModel = diffEditor.getOriginalEditor().getModel();
	const modifiedModel = diffEditor.getModifiedEditor().getModel();
	return isEqual(originalModel?.uri, entry.originalURI) && isEqual(modifiedModel?.uri, entry.modifiedURI);
}

/**
 * Asks whether to undo all edits to the files of `modifiedURIs`, as Undo All
 * Edits in a working set does, resolving to whether the user confirmed.
 */
export async function confirmUndoAllEdits(dialogService: IDialogService, modifiedURIs: readonly URI[]): Promise<boolean> {
	const { confirmed } = await dialogService.confirm({
		title: localize('chat.editing.discardAll.confirmation.title', "Undo all edits?"),
		message: modifiedURIs.length === 1
			? localize('chat.editing.discardAll.confirmation.oneFile', "This will undo changes made in {0}. Do you want to proceed?", basename(modifiedURIs[0]))
			: localize('chat.editing.discardAll.confirmation.manyFiles', "This will undo changes made in {0} files. Do you want to proceed?", modifiedURIs.length),
		primaryButton: localize('chat.editing.discardAll.confirmation.primaryButton', "Yes"),
		type: 'info'
	});
	return confirmed;
}
