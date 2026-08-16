/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAlternativeAction } from '../../src/extension/inlineEdits/node/nextEditProviderTelemetry';
import { ErrorUtils } from '../../src/util/common/errors';
import { streamJsonRecords } from './streamJsonRecords';
import type { WithRowIndex } from './withRowIndex';

/**
 * A single row from the JSON input.
 */
export interface IInputRow {
	readonly originalRowIndex: number;
	readonly suggestionStatus: string;
	readonly alternativeAction: IAlternativeAction;
	readonly prompt: unknown[];
	readonly modelResponse: string;
	readonly postProcessingOutcome: {
		suggestedEdit: string;
		isInlineCompletion: boolean;
	};
	readonly activeDocumentLanguageId: string;
}

const requiredKeys = [
	'status',
	'action',
	'input',
	'response',
	'outcome',
	'language',
] as const;

/**
 * Parse a single JSON input record into a structured row.
 */
function parseInputRecord(record: Record<string, string>, rowIndex: number): IInputRow {
	for (const key of requiredKeys) {
		if (!(key in record)) {
			throw new Error(`Missing key: ${key}`);
		}
	}

	const alternativeAction = JSON.parse(record['action']) as IAlternativeAction;
	const prompt = JSON.parse(record['input']) as unknown[];
	const postProcessingOutcome = JSON.parse(record['outcome']) as {
		suggestedEdit: string;
		isInlineCompletion: boolean;
	};

	if (!alternativeAction.recording) {
		throw new Error('action.recording is missing');
	}
	if (!alternativeAction.recording.entries || alternativeAction.recording.entries.length === 0) {
		throw new Error('action.recording.entries is empty');
	}
	if (!postProcessingOutcome.suggestedEdit) {
		throw new Error('outcome.suggestedEdit is missing');
	}

	return {
		originalRowIndex: rowIndex,
		suggestionStatus: record['status'],
		alternativeAction,
		prompt,
		modelResponse: record['response'],
		postProcessingOutcome,
		activeDocumentLanguageId: record['language'],
	};
}

/**
 * Stream-parse the input file (JSON array or JSON Lines) and validate each
 * record into an `IInputRow`. Records that fail validation are reported in
 * `errors` (with their row index) rather than aborting the load.
 *
 * Note: this still accumulates the fully parsed rows into memory. For very
 * large inputs (multi-GB), use `runInputPipelineParallel` so each worker only
 * loads its assigned slice — the parent process never holds the whole dataset.
 */
export async function loadAndParseInput(inputPath: string, verbose = false): Promise<{
	rows: IInputRow[];
	errors: WithRowIndex<Error>[];
}> {
	const rows: IInputRow[] = [];
	const errors: WithRowIndex<Error>[] = [];

	let i = 0;
	for await (const record of streamJsonRecords<Record<string, string>>(inputPath)) {
		const rowIndex = i++;
		try {
			rows.push(parseInputRecord(record, rowIndex));
		} catch (e) {
			errors.push({
				originalRowIndex: rowIndex,
				value: ErrorUtils.fromUnknown(e),
			});
		}
	}

	if (verbose) {
		console.log(`Read ${i} records from ${inputPath}`);
	}

	return { rows, errors };
}
