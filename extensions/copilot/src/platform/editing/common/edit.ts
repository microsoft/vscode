/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { IDiffService } from '../../diff/common/diffService';
import { OffsetLineColumnConverter } from './offsetLineColumnConverter';

export async function stringEditFromDiff(original: string, modified: string, diffService: IDiffService, timeoutMs = 5000): Promise<StringEdit> {
	const diff = await diffService.computeDiff(original, modified, { maxComputationTimeMs: timeoutMs, computeMoves: false, ignoreTrimWhitespace: false });
	const origConverter = new OffsetLineColumnConverter(original);
	const modConverter = new OffsetLineColumnConverter(modified);
	const edits: StringReplacement[] = [];
	for (const c of diff.changes) {
		for (const i of c.innerChanges ?? []) {
			const startMod = modConverter.positionToOffset(i.modifiedRange.getStartPosition());
			const endExMod = modConverter.positionToOffset(i.modifiedRange.getEndPosition());
			const newText = modified.substring(startMod, endExMod);

			const startOrig = origConverter.positionToOffset(i.originalRange.getStartPosition());
			const endExOrig = origConverter.positionToOffset(i.originalRange.getEndPosition());
			const origRange = new OffsetRange(startOrig, endExOrig);

			edits.push(new StringReplacement(origRange, newText));
		}
	}

	return new StringEdit(edits);
}

export function stringEditFromTextContentChange(
	contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
) {
	const editsArr = contentChanges.map(c => new StringReplacement(OffsetRange.ofStartAndLength(c.rangeOffset, c.rangeLength), c.text));
	editsArr.reverse();
	const edits = new StringEdit(editsArr);
	return edits;
}
