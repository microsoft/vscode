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

	export interface ISplitRecording {
		readonly currentFile: { readonly id: number; readonly relativePath: string };
		readonly recordingPriorToRequest: LogEntry[];
		readonly recordingAfterRequest: LogEntry[];
		readonly idToFileMap: ReadonlyMap<number, string>;
	}

	/**
	 * Split a recording at its NES request bookmark and resolve the active
	 * document at that moment. Exposed so callers (in particular nes-datagen
	 * cursor-jump detectors) can reason about what the user did *after* the request
	 * without re-implementing the same splitting logic that
	 * {@link createScoringForAlternativeAction} performs internally.
	 *
	 * Returns `undefined` if the recording cannot be split (missing
	 * `requestTime`, empty entries, no resolvable active document, etc.).
	 */
	export function splitRecording(altAction: IAlternativeAction): ISplitRecording | undefined {
		const processedRecording = splitRecordingAtRequestTime(altAction);
		if (!processedRecording) {
			return undefined;
		}

		const { wholeRecording, recordingPriorToRequest, recordingAfterRequest } = processedRecording;
		const currentFileId = determineCurrentFileId(recordingPriorToRequest);
		if (currentFileId === undefined) {
			return undefined;
		}

		// Pass the whole recording so cross-file targets in the post-request
		// portion can be resolved by id even if the user only encountered the
		// target document after the bookmark.
		const idToFileMap = documentIndexMapping(wholeRecording);

		const currentFilePath = idToFileMap.get(currentFileId);
		if (!currentFilePath) {
			return undefined;
		}

		return {
			currentFile: { id: currentFileId, relativePath: currentFilePath },
			recordingPriorToRequest,
			recordingAfterRequest,
			idToFileMap,
		};
	}

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

		const { wholeRecording, recordingPriorToRequest, recordingAfterRequest } = processedRecording;

		const currentFileId = determineCurrentFileId(recordingPriorToRequest);
		if (currentFileId === undefined) {
			log('Could not determine current file ID from recording prior to request');
			return undefined;
		}

		// `wholeRecording` covers documents encountered both before and after the
		// request bookmark, so cross-file next edits (and cursor jumps) to files
		// first opened after the request are still mapped to a path.
		const idToFileMap = documentIndexMapping(wholeRecording);

		const currentFilePath = idToFileMap.get(currentFileId);

		if (!currentFilePath) {
			log('Could not find current file path from ID mapping');
			return undefined;
		}

		const currentFile = { id: currentFileId, relativePath: currentFilePath };

		const nextUserEdit = getNextUserEdit(currentFile, recordingPriorToRequest, recordingAfterRequest, idToFileMap);

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
		wholeRecording: LogEntry[];
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
			wholeRecording: recording,
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

	function composeReplacements(serializedEdits: readonly ISerializedEdit[]): ISerializedEdit {
		const composed = new Edits(
			StringEdit,
			serializedEdits.map(se => new StringEdit(se.map(r => new StringReplacement(new OffsetRange(r[0], r[1]), r[2]))))
		).compose();
		return composed.replacements.map((r): [start: number, endEx: number, text: string] => [r.replaceRange.start, r.replaceRange.endExclusive, r.newText]);
	}

	function getNextUserEdit(currentFile: { id: number; relativePath: string }, recordingBeforeRequest: LogEntry[], recordingAfterRequest: LogEntry[], idToFileMap: Map<number, string>): NextUserEdit.t {

		const N_EDITS_LIMIT = 10;

		// Collect post-request edits across ALL files (not just the current file),
		// bucketed by document id in first-touch order, up to the N-edit cap. Edits
		// to documents we have no path for are skipped because they cannot be
		// reconstructed or labelled.
		const editsByFileId = new Map<number, ISerializedEdit[]>();
		const fileOrder: number[] = [];
		let collected = 0;
		for (const entry of recordingAfterRequest) {
			if (entry.kind !== 'changed' || !('id' in entry) || !idToFileMap.has(entry.id)) {
				continue;
			}
			let bucket = editsByFileId.get(entry.id);
			if (!bucket) {
				bucket = [];
				editsByFileId.set(entry.id, bucket);
				fileOrder.push(entry.id);
			}
			bucket.push(entry.edit);
			collected++;
			if (collected > N_EDITS_LIMIT) {
				break;
			}
		}

		const fileEdits: NextUserEdit.FileEdit[] = fileOrder.map(id => ({
			id,
			relativePath: idToFileMap.get(id)!,
			edit: composeReplacements(editsByFileId.get(id)!),
		}));

		const currentFileEdits = editsByFileId.get(currentFile.id) ?? [];

		return {
			edit: composeReplacements(currentFileEdits),
			relativePath: currentFile.relativePath,
			originalOpIdx: recordingBeforeRequest.length - 1,
			fileEdits,
		};
	}
}
