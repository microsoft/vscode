/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from '../../../../util/vs/base/common/errors';
import { BaseStringEdit, BaseStringReplacement, StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { SingleEdits } from './edit';
import { Permutation } from './permutation';

export function serializeStringEdit(edit: BaseStringEdit): SerializedEdit {
	return edit.replacements.map(e => serializeSingleEdit(e));
}

export function serializeSingleEdit(edit: BaseStringReplacement): SerializedReplacement {
	return [edit.replaceRange.start, edit.replaceRange.endExclusive, edit.newText];
}

export function deserializeStringEdit(serialized: SerializedEdit): StringEdit {
	return new StringEdit(serialized.map(e => deserializeSingleEdit(e)));
}

function deserializeSingleEdit(serialized: SerializedReplacement): StringReplacement {
	return new StringReplacement(
		new OffsetRange(serialized[0], serialized[1]),
		serialized[2],
	);
}

export type SerializedEdit = SerializedReplacement[];

export type SerializedReplacement = [startOffset: number, endOffsetEx: number, newText: string];

/**
 * For every single text edit, it creates a new edit.
 * If permutation is not given, decomposed in-order.
 */
export function decomposeStringEdit<TEdit extends BaseStringEdit<BaseStringReplacement, TEdit>>(edit: TEdit, permutation?: Permutation): SingleEdits<TEdit> {
	if (permutation === undefined) {
		const result: BaseStringReplacement[] = [];
		let offset = 0;
		for (const e of edit.replacements) {
			result.push(e.delta(offset));

			offset += e.newText.length - e.replaceRange.length;
		}
		return new SingleEdits(result);
	}

	if (edit.replacements.length !== permutation.arrayLength) {
		throw illegalArgument(`Number of edits ${edit.replacements.length} does not match ${permutation.arrayLength}`);
	}

	const result: BaseStringReplacement[] = [];
	const sortedSingleEdits = edit.replacements.slice();

	for (let i = 0; i < edit.replacements.length; ++i) {

		const idxInEdits = permutation.mapIndexBack(i);
		const singleEdit = sortedSingleEdits[idxInEdits];

		result.push(singleEdit);

		// move all edits that occur after `singleEdit`
		for (let j = idxInEdits; j < sortedSingleEdits.length; ++j) {
			const offsetDelta = singleEdit.newText.length - singleEdit.replaceRange.length;
			const e = sortedSingleEdits[j];
			sortedSingleEdits[j] = e.delta(offsetDelta);
		}
	}

	return new SingleEdits(result);
}
