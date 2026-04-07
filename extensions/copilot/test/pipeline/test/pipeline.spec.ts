/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as csvParse from 'csv-parse';
import * as fs from 'fs/promises';
import path from 'path';
import { expect, suite, test } from 'vitest';
import { Result } from '../../../src/util/common/result';
import { IInputRow } from '../parseInput';
import { runInputPipeline, RunPipelineOptions } from '../pipeline';

async function extractFromCsv(csvContents: string): Promise<unknown[]> {
	const options = {
		columns: true as const, // Use first row as column headers
		delimiter: ',',         // Comma delimiter
		quote: '"',             // Double quotes
		escape: '"',            // Standard CSV escape character
		skip_empty_lines: true, // Skip any empty rows
		trim: true,             // Remove whitespace around fields
		relax_quotes: true,     // Handle quotes within fields more flexibly
		bom: true,              // Handle UTF-8 BOM
		cast: false             // Keep all values as strings initially
	} as const;

	type CsvRecord = { Data: string };

	const objects = (await new Promise<CsvRecord[]>((resolve, reject) =>
		csvParse.parse<CsvRecord>(csvContents, options, (err, result) => {
			if (err) {
				reject(err);
			} else {
				if (result.every((item: any) => typeof item === 'object' && item)) {
					resolve(result);
				} else {
					reject(new Error('Invalid CSV format'));
				}
			}
		})
	));

	return objects;
}

function convertToInputRows(csvEntries: unknown[]): Result<IInputRow, Error>[] {
	function entryToInputRow(index: number, entry: unknown) {
		const fieldReqs: [entryName: string, fieldName: string][] = [
			['suggestion_status', 'status'] as const,
			['alternative_action', 'action'], //json
			['prompt', 'input'], //json
			['model_response', 'response'],
			['post_processing_outcome', 'outcome'],
			['active_document_language_id', 'language'],
		];
		if (typeof entry !== 'object' || !entry) {
			return Result.error(new Error(`Entry not object or falsy - ${JSON.stringify(entry)}`));
		}
		const record = entry as Record<string, any>;
		const obj: Record<string, any> = {};
		for (const [entryName, fieldName] of fieldReqs) {
			if (!(entryName in record)) {
				return Result.error(new Error(`Missing field ${entryName} in ${JSON.stringify(entry)}`));
			}
			try {
				obj[fieldName] = record[entryName];
			} catch (e) {
				return Result.error(e);
			}
		}
		obj['originalRowIndex'] = index;
		return Result.ok(obj as IInputRow);
	}
	return csvEntries.map((entry: unknown, index: number) => {
		return entryToInputRow(index, entry);
	});
}

suite.skip('from csv to input rows to pipeline', () => {

	test.skip('', async () => {
		const filePath = '';

		const r = await extractFromCsv(await fs.readFile(filePath, 'utf8'));
		const inputRowResults = convertToInputRows(r);
		const fixtures = path.join(__dirname, 'fixtures');
		const inputRowsFilePath = path.join(fixtures, 'inputRows.json');
		await fs.writeFile(
			inputRowsFilePath,
			JSON.stringify(
				inputRowResults.filter(r => r.isOk())
					.filter(r => (r.val as any).outcome)
					.map(r => r.val),
				null, 2));

		const configFilePath = path.join(fixtures, 'config.json');

		// await fs.writeFile(configFilePath, JSON.stringify({
		// 	'github.copilot.chat.advanced.inlineEdits.xtabProvider.modelConfiguration': {
		// 	}
		// }, null, 2));

		const logs: string[] = [];
		const log = (m: any, ...rest: any[]) => logs.push([m, ...rest].map(s => typeof s === 'object' ? JSON.stringify(s, null, '\t') : s).join(', '));

		await runInputPipeline({
			nesDatagen: {
				input: inputRowsFilePath,
				output: path.join(fixtures, 'output.json'),
				rowOffset: 0,
				workerMode: false
			},
			configFile: configFilePath,
			verbose: true,
			parallelism: 10,
		} satisfies RunPipelineOptions, log);

		expect(logs).toMatchInlineSnapshot();
	});
});
