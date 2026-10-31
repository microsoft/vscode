/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Edits } from '../../src/platform/inlineEdits/common/dataTypes/edit';
import { deserializeStringEdit, serializeStringEdit } from '../../src/platform/inlineEdits/common/dataTypes/editUtils';
import type { ISerializedEdit } from '../../src/platform/workspaceRecorder/common/workspaceLog';
import { StringEdit } from '../../src/util/vs/editor/common/core/edits/stringEdit';

export const ORACLE_EDIT_IDLE_MS = 5 * 1000;
export const ORACLE_CURSOR_SUPPRESSION_MS = 200;
export const ORACLE_CURSOR_CONTINUATION_LINE_GAP = 3;

export function composeSerializedEdits(edits: readonly ISerializedEdit[]): ISerializedEdit {
	return serializeStringEdit(new Edits(StringEdit, edits.map(deserializeStringEdit)).compose());
}

export function composeAndLimitSerializedEdits(edits: readonly ISerializedEdit[], maxEdits: number): ISerializedEdit {
	return composeSerializedEdits(edits).slice(0, maxEdits);
}

export function doesSerializedEditContinueOracle(
	oracleEdits: readonly ISerializedEdit[],
	nextEdit: ISerializedEdit,
): boolean {
	const current = composeSerializedEdits(oracleEdits);
	const combined = composeSerializedEdits([...oracleEdits, nextEdit]);
	return current.some(edit => !combined.some(candidate =>
		candidate[0] === edit[0] && candidate[1] === edit[1] && candidate[2] === edit[2]
	));
}
