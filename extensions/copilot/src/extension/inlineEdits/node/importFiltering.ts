/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ImportChanges } from '../../../platform/inlineEdits/common/dataTypes/importFilteringOptions';
import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { isImportStatement } from '../../prompt/common/importStatement';

export class IgnoreImportChangesAspect {
	public static isImportChange(edit: LineReplacement, languageId: string, lines: string[]): boolean {
		return edit.newLines.some(l => isImportStatement(l, languageId)) || getOldLines(edit, lines).some(l => isImportStatement(l, languageId));
	}

	public static filterEdit(resultDocument: StatelessNextEditDocument, singleEdits: readonly LineReplacement[], allowImportChanges: ImportChanges = ImportChanges.None): readonly LineReplacement[] {
		if (allowImportChanges === ImportChanges.All) {
			return singleEdits;
		}

		const languageId = resultDocument.languageId;
		const lines = resultDocument.documentLinesBeforeEdit;
		const filteredEdits = singleEdits.filter(e => !IgnoreImportChangesAspect.isImportChange(e, languageId, lines));
		return filteredEdits;
	}
}

function getOldLines(edit: LineReplacement, lines: string[]): string[] {
	return coalesce(edit.lineRange.mapToLineArray<string | undefined>(l => lines[l - 1]));
}
