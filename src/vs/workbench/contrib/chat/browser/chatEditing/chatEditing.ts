/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { findDiffEditorContainingCodeEditor } from '../../../../../editor/browser/widget/diffEditor/commands.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
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
 * A chat file-edit represents a "pure creation" when it only adds content (no
 * deletions) and its original version did not exist or was empty. Such an edit
 * has nothing meaningful to diff against, so the corresponding file-edit pill
 * should open the file in a normal editor instead of a diff editor.
 */
export async function isChatEditPureCreation(textModelService: ITextModelService, originalURI: URI, removed: number): Promise<boolean> {
	if (removed !== 0) {
		return false;
	}
	try {
		const ref = await textModelService.createModelReference(originalURI);
		try {
			return ref.object.textEditorModel.getValueLength() === 0;
		} finally {
			ref.dispose();
		}
	} catch {
		return false;
	}
}
