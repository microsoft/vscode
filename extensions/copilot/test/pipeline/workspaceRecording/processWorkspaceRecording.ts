/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAlternativeAction } from '../../../src/extension/inlineEdits/node/nextEditProviderTelemetry';
import { ErrorUtils } from '../../../src/util/common/errors';
import { Result } from '../../../src/util/common/result';
import type { IInputRow } from '../parseInput';
import { processRecordingAtIndex, type IProcessedRow } from '../replayRecording';
import type { WithRowIndex } from '../withRowIndex';
import { materializeWorkspaceRecordingSample, type IWorkspaceRecording, type IWorkspaceRecordingSampleDescriptor } from './workspaceRecording';

export const WORKSPACE_RECORDING_SUGGESTION_STATUS = 'workspace-recording';

export function processWorkspaceRecordingSample(
	recording: IWorkspaceRecording,
	descriptor: IWorkspaceRecordingSampleDescriptor,
	originalRowIndex: number,
): Result<IProcessedRow, Error> {
	try {
		const sample = materializeWorkspaceRecordingSample(recording, descriptor);
		const pivotEntry = sample.entries[sample.pivotEntryIndex];
		const requestTime = 'time' in pivotEntry ? pivotEntry.time : 0;
		const alternativeAction: IAlternativeAction = {
			text: undefined,
			textLength: 0,
			selection: [],
			edits: [],
			tags: [WORKSPACE_RECORDING_SUGGESTION_STATUS],
			recording: {
				entries: sample.entries,
				entriesSize: JSON.stringify(sample.entries).length,
				requestTime,
			},
		};
		const row: IInputRow = {
			originalRowIndex,
			suggestionStatus: WORKSPACE_RECORDING_SUGGESTION_STATUS,
			alternativeAction,
			prompt: [],
			modelResponse: '',
			postProcessingOutcome: { suggestedEdit: '', isInlineCompletion: false },
			activeDocumentLanguageId: '',
		};

		const result = processRecordingAtIndex({
			row,
			entries: sample.entries,
			pivotEntryIndex: sample.pivotEntryIndex,
			proposedEdits: [],
			isAccepted: false,
			oracleEdits: descriptor.oracleEdits,
			workspaceRecording: sample.provenance,
		});
		if (result.isError()) {
			return result;
		}

		const languageId = result.val.activeDocument.languageId.get();
		return Result.ok({
			...result.val,
			row: { ...result.val.row, activeDocumentLanguageId: languageId },
		});
	} catch (error) {
		return Result.error(ErrorUtils.fromUnknown(error));
	}
}

export function processWorkspaceRecordingSamples(
	recording: IWorkspaceRecording,
	descriptors: readonly IWorkspaceRecordingSampleDescriptor[],
): {
	processed: IProcessedRow[];
	errors: WithRowIndex<Error>[];
} {
	const processed: IProcessedRow[] = [];
	const errors: WithRowIndex<Error>[] = [];

	for (let originalRowIndex = 0; originalRowIndex < descriptors.length; originalRowIndex++) {
		const result = processWorkspaceRecordingSample(recording, descriptors[originalRowIndex], originalRowIndex);
		if (result.isError()) {
			errors.push({ originalRowIndex, value: result.err });
		} else {
			processed.push(result.val);
		}
	}

	return { processed, errors };
}
