/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAlternativeAction } from '../../../src/extension/inlineEdits/node/nextEditProviderTelemetry';
import { Edits } from '../../../src/platform/inlineEdits/common/dataTypes/edit';
import { LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { StringEdit, StringReplacement } from '../../../src/util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../src/util/vs/editor/common/core/ranges/offsetRange';
import { ISerializedEdit } from '../logRecordingTypes';
import { IStringReplacement, NextUserEdit, Recording, Scoring, SuggestedEdit } from './types';
import { binarySearch, log } from './util';

export namespace Processor {

	export function createScoringForAlternativeAction(
		altAction: IAlternativeAction,
		proposedEdits: IStringReplacement[],
		isAccepted: boolean,
	): Scoring.t | undefined {

		const processedRecording = splitRecordingAtRequestTime(altAction);
		if (!processedRecording) {
			log('Could not split recording at request time');
			return undefined;
		}

		const { recordingPriorToRequest, recordingAfterRequest } = processedRecording;

		const currentFileId = determineCurrentFileId(recordingPriorToRequest);
		if (currentFileId === undefined) {
			log('Could not determine current file ID from recording prior to request');
			return undefined;
		}

		const idToFileMap = documentIndexMapping(recordingPriorToRequest);

		const currentFilePath = idToFileMap.get(currentFileId);

		if (!currentFilePath) {
			log('Could not find current file path from ID mapping');
			return undefined;
		}

		const currentFile = { id: currentFileId, relativePath: currentFilePath };

		const nextUserEdit = getNextUserEdit(currentFile, recordingPriorToRequest, recordingAfterRequest);

		const reconstructedRecording: Recording.t = {
			log: recordingPriorToRequest,
			nextUserEdit,
		};

		const nesEdits = proposedEdits.map((se): SuggestedEdit.t => ({
			documentUri: currentFile.relativePath,
			edit: [se],
			score: isAccepted ? 1 : 0,
			scoreCategory: 'nextEdit',
		}));

		const scoring = Scoring.create(reconstructedRecording, nesEdits);

		return scoring;
	}

	function splitRecordingAtRequestTime(altAction: IAlternativeAction): {
		recordingPriorToRequest: LogEntry[];
		recordingAfterRequest: LogEntry[];
	} | undefined {

		if (!altAction.recording) {
			return undefined;
		}

		const recording = altAction.recording.entries;
		if (!recording || recording.length === 0) {
			return undefined;
		}

		const requestTime = altAction.recording.requestTime;

		const recordingIdxOfRequestTime = binarySearch(recording, (entry: LogEntry) => {
			if (entry.kind === 'meta') {
				return -1;
			} else {
				return entry.time - requestTime;
			}
		});

		if (recordingIdxOfRequestTime === -1) {
			log('Request time is before any recording entries');
			return undefined;
		}

		const recordingPriorToRequest = recording.slice(0, recordingIdxOfRequestTime + 1);
		const recordingAfterRequest = recording.slice(recordingIdxOfRequestTime + 1);

		return {
			recordingPriorToRequest,
			recordingAfterRequest
		};
	}

	function documentIndexMapping(recording: LogEntry[]): Map<number, string> {
		const map = new Map<number, string>();
		for (const entry of recording) {
			if (entry.kind === 'documentEncountered') {
				map.set(entry.id, entry.relativePath);
			}
		}
		return map;
	}

	function determineCurrentFileId(recording: LogEntry[]): number | undefined {
		let fileId: number | undefined;
		for (let i = recording.length - 1; i >= 0; i--) {
			const entry = recording[i];
			if ('id' in entry) {
				fileId = entry.id;
				break;
			}
		}
		return fileId;
	}

	function getNextUserEdit(currentFile: { id: number; relativePath: string }, recordingBeforeRequest: LogEntry[], recordingAfterRequest: LogEntry[]): NextUserEdit.t {

		const N_EDITS_LIMIT = 10;

		const serializedEdits: ISerializedEdit[] = [];
		for (const entry of recordingAfterRequest) {
			if (entry.kind === 'changed' && 'id' in entry && entry.id === currentFile.id) {
				serializedEdits.push(entry.edit);
			}
			if (serializedEdits.length > N_EDITS_LIMIT) {
				break;
			}
		}

		const edits = new Edits(
			StringEdit,
			serializedEdits.map(se => new StringEdit(se.map(r => new StringReplacement(new OffsetRange(r[0], r[1]), r[2]))))
		);

		return {
			edit: edits.compose().replacements.map(r => [r.replaceRange.start, r.replaceRange.endExclusive, r.newText] as const),
			relativePath: currentFile.relativePath,
			originalOpIdx: recordingBeforeRequest.length - 1
		};
	}
}
