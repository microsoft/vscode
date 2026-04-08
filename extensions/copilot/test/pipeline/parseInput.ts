/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { IAlternativeAction } from '../../src/extension/inlineEdits/node/nextEditProviderTelemetry';

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
 * Parse a JSON array of input entries into structured rows.
 */
function parseInputJson(jsonContents: string): {
	rows: IInputRow[];
	errors: { rowIndex: number; error: string }[];
} {
	const records = JSON.parse(jsonContents) as Record<string, string>[];

	const rows: IInputRow[] = [];
	const errors: { rowIndex: number; error: string }[] = [];

	for (let i = 0; i < records.length; i++) {
		const record = records[i];
		try {
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

			rows.push({
				originalRowIndex: i,
				suggestionStatus: record['status'],
				alternativeAction,
				prompt,
				modelResponse: record['response'],
				postProcessingOutcome,
				activeDocumentLanguageId: record['language'],
			});
		} catch (e) {
			errors.push({
				rowIndex: i,
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}

	return { rows, errors };
}

export async function loadAndParseInput(inputPath: string, verbose = false): Promise<{
	rows: IInputRow[];
	errors: { rowIndex: number; error: string }[];
}> {
	const contents = await fs.readFile(inputPath, 'utf8');
	if (verbose) {
		console.log(`Read ${contents.length} chars from ${inputPath}`);
	}
	return parseInputJson(contents);
}
