/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { DocumentChangedOperation, OperationKind } from '../../common/resolvedRecording/operation';
import { RecordingData, ResolvedRecording } from '../../common/resolvedRecording/resolvedRecording';

describe('ResolvedRecording.findFirstOperationAfter', () => {
	const recording = ResolvedRecording.resolve(RecordingData.create([
		{ kind: 'documentEncountered', id: 1, time: 0, relativePath: 'file.ts' },
		{ kind: 'changed', id: 1, time: 1, v: 1, edit: [[0, 0, 'match']] },
		{ kind: 'focused', id: 1, time: 2 },
		{ kind: 'changed', id: 1, time: 3, v: 2, edit: [[0, 0, 'skip']] },
		{ kind: 'changed', id: 1, time: 4, v: 3, edit: [[0, 0, 'match']] },
		{ kind: 'changed', id: 1, time: 5, v: 4, edit: [[0, 0, 'match']] },
	]));

	test('finds the first later operation accepted by both predicates', () => {
		const result = recording.findFirstOperationAfter(
			recording.operations[0],
			(op): op is DocumentChangedOperation => op.kind === OperationKind.Changed,
			op => op.edit.replacements[0].newText === 'match',
		);

		expect(result).toBe(recording.operations[3]);
	});

	test.each([0, 4])('returns undefined when there is no later match after operation %i', startIndex => {
		const result = recording.findFirstOperationAfter(
			recording.operations[startIndex],
			(op): op is DocumentChangedOperation => op.kind === OperationKind.Changed,
			op => op.edit.replacements[0].newText === 'missing',
		);

		expect(result).toBeUndefined();
	});
});
