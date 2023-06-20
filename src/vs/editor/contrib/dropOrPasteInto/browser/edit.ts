/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { Range } from 'vs/editor/common/core/range';

export interface DropOrPasteEdit {
	readonly label: string;
	readonly insertText: string | { readonly snippet: string };
	readonly additionalEdit?: WorkspaceEdit;
}

export function createCombinedWorkspaceEdit(uri: URI, ranges: readonly Range[], edit: DropOrPasteEdit): WorkspaceEdit {
	return {
		edits: [
			...ranges.map(range =>
				new ResourceTextEdit(uri,
					typeof edit.insertText === 'string'
						? { range, text: edit.insertText, insertAsSnippet: false }
						: { range, text: edit.insertText.snippet, insertAsSnippet: true }
				)),
			...(edit.additionalEdit?.edits ?? [])
		]
	};
}
