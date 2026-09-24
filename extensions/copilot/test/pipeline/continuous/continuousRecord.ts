/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IContinuousRecording } from '../../../src/extension/inlineEdits/node/continuousEnhancedTelemetrySender';
import { ErrorUtils } from '../../../src/util/common/errors';
import type { WithRowIndex } from '../withRowIndex';
import { streamJsonRecords } from '../streamJsonRecords';

/**
 * A single parsed continuous-recording input record (one telemetry slice),
 * paired with its 0-based position within the input file / chunk.
 */
export type IContinuousRecord = WithRowIndex<IContinuousRecording>;

/**
 * Column carrying the (stringified) recording payload. Matches the telemetry
 * property name emitted by `ContinuousEnhancedTelemetrySender`; export queries
 * should alias the recording column to `recording`.
 */
const RECORDING_KEY = 'recording';

/**
 * Parse a single continuous input record.
 *
 * The `recording` field is, by export convention, a JSON string (the sender
 * calls `JSON.stringify(recording)`); a pre-parsed object is also tolerated for
 * fixtures and hand-authored inputs.
 *
 * Throws if the record is missing the recording column or has no usable
 * entries — callers collect these as per-record errors rather than aborting.
 */
export function parseContinuousRecord(record: Record<string, unknown>, rowIndex: number): IContinuousRecord {
	const raw = record[RECORDING_KEY];
	if (raw === undefined || raw === null) {
		throw new Error(`Missing key: ${RECORDING_KEY}`);
	}

	let recording: IContinuousRecording;
	if (typeof raw === 'string') {
		recording = JSON.parse(raw) as IContinuousRecording;
	} else if (typeof raw === 'object') {
		recording = raw as IContinuousRecording;
	} else {
		throw new Error(`'${RECORDING_KEY}' must be a JSON string or object, got ${typeof raw}`);
	}

	if (!recording.entries || recording.entries.length === 0) {
		// `entries` is dropped when the payload exceeded the sender cap; such a
		// slice carries no edit history and cannot produce a sample.
		throw new Error(`recording.entries is missing or empty (entriesSize: ${recording.entriesSize ?? '?'})`);
	}

	return {
		originalRowIndex: rowIndex,
		value: recording,
	};
}

/**
 * Stream-parse a continuous-recording input file (JSON array or JSON Lines),
 * validating each record into an {@link IContinuousRecord}. Records that fail
 * validation are reported in `errors` (with their row index) rather than
 * aborting the load. Mirrors `loadAndParseInput` for the alternative-action path.
 */
export async function loadAndParseContinuousInput(inputPath: string, verbose = false): Promise<{
	records: IContinuousRecord[];
	errors: WithRowIndex<Error>[];
}> {
	const records: IContinuousRecord[] = [];
	const errors: WithRowIndex<Error>[] = [];

	let i = 0;
	for await (const record of streamJsonRecords<Record<string, unknown>>(inputPath)) {
		const rowIndex = i++;
		try {
			records.push(parseContinuousRecord(record, rowIndex));
		} catch (e) {
			errors.push({ originalRowIndex: rowIndex, value: ErrorUtils.fromUnknown(e) });
		}
	}

	if (verbose) {
		console.log(`Read ${i} continuous records from ${inputPath}`);
	}

	return { records, errors };
}
