/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { DropYieldTo, WorkspaceEdit } from 'vs/editor/common/languages';
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

export function sortEditsByYieldTo<T extends {
	readonly id: string;
	readonly handledMimeType?: string;
	readonly yieldTo?: readonly DropYieldTo[];
}>(edits: T[]): void {
	function yieldsTo(yTo: DropYieldTo, other: T): boolean {
		return ('editId' in yTo && yTo.editId === other.id)
			|| ('mimeType' in yTo && yTo.mimeType === other.handledMimeType);
	}

	edits.sort((a, b) => {
		if (a.yieldTo?.some(yTo => yieldsTo(yTo, b))) {
			return 1;
		}

		if (b.yieldTo?.some(yTo => yieldsTo(yTo, a))) {
			return -1;
		}

		return 0;
	});
}
