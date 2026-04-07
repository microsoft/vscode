/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import csvParse from 'csv-parse';
import * as fs from 'fs/promises';
import minimist from 'minimist';
import { IAlternativeAction } from '../../src/extension/inlineEdits/node/nextEditProviderTelemetry';
import { coalesce } from '../../src/util/vs/base/common/arrays';
import { Processor } from '../../test/pipeline/alternativeAction/processor';
import { IData, Scoring } from '../../test/pipeline/alternativeAction/types';
import { Either, log } from '../../test/pipeline/alternativeAction/util';

async function extractFromCsv(csvContents: string): Promise<(Scoring.t | undefined)[]> {
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
				if (result.every((item: any) => typeof item === 'object' && 'Data' in item && typeof item['Data'] === 'string')) {
					resolve(result);
				} else {
					reject(new Error('Invalid CSV format'));
				}
			}
		})
	)).map(record => JSON.parse(record.Data) as IData);

	const scoredEdits = objects.map((obj: IData) => {
		const altAction: IAlternativeAction = obj.altAction;
		if (!altAction || !altAction.recording) {
			return undefined;
		}
		return Processor.createScoringForAlternativeAction(altAction, coalesce([parseSuggestedEdit(obj.postProcessingOutcome.suggestedEdit)]), false);
	});

	return scoredEdits;
}

function writeFiles(basename: string, scoring: Scoring.t) {
	return [
		fs.writeFile(`${basename}.scoredEdits.w.json`, JSON.stringify(scoring, null, 2)),
		fs.writeFile(`${basename}.recording.w.json`, JSON.stringify(scoring.scoringContext.recording, null, 2)),
	];
}

async function handleCsv(inputFilePath: string) {
	log('Handling CSV file:', inputFilePath);
	const csvContents = await fs.readFile(inputFilePath, 'utf8');
	log('CSV contents read, length:', csvContents.length);
	const extracted = await extractFromCsv(csvContents);
	log('Extraction complete, number of scored edits:', extracted.filter(e => e).length);
	try {
		await Promise.all(extracted.flatMap((obj: Scoring.t | undefined, idx: number) => {
			if (!obj) {
				return [];
			}
			return writeFiles(idx.toString(), obj);
		}));
		log('All files written successfully');
	} catch (e) {
		log('Error writing files:', e);
	}
}

function parseFile(fileContents: string): Either<IData, IAlternativeAction> | undefined {
	let parsedObj: unknown;
	try {
		parsedObj = JSON.parse(fileContents);
	} catch (e) {
		console.error('Failed to parse JSON:', e);
		return undefined;
	}
	if (parsedObj && typeof parsedObj === 'object' && 'prompt' in parsedObj) {
		return Either.left(parsedObj as IData);
	}

	return Either.right(parsedObj as IAlternativeAction);
}

async function handleAlternativeActionJson(inputFilePath: string) {
	log('Handling alternative action JSON file:', inputFilePath);
	const fileContents = await fs.readFile(inputFilePath, 'utf8');
	log('File contents read, length:', fileContents.length);
	const obj = parseFile(fileContents);
	if (!obj) {
		console.error('Failed to parse alternative action JSON file');
		return;
	}
	const altAction = obj.isLeft() ? obj.value.altAction : obj.value;
	const edits: [start: number, endEx: number, text: string][] = [];
	let isAccepted = false;
	if (obj.isLeft()) {
		const data = obj.value;
		const parsedEdit = parseSuggestedEdit(data.postProcessingOutcome.suggestedEdit);
		if (parsedEdit) {
			edits.push(parsedEdit);
		}
		isAccepted = data.suggestionStatus === 'accepted';
	}
	const scoring = Processor.createScoringForAlternativeAction(altAction, edits, isAccepted);
	if (!scoring) {
		console.error('Failed to create scoring from alternative action');
		return;
	}
	const outputFilePath = inputFilePath.replace(/\.json$/, '.scoredEdits.json');
	await Promise.all(writeFiles(outputFilePath.replace(/\.scoredEdits\.json$/, ''), scoring));
	log('Scoring written to:', outputFilePath);
}

function parseSuggestedEdit(suggestedEditStr: string): [number, number, string] | null {
	const [stringifiedRange, quotedText] = suggestedEditStr.split(' -> ');
	const match = stringifiedRange.match(/^\[(\d+), (\d+)\)$/);
	if (match) {
		const start = parseInt(match[1], 10);
		const endEx = parseInt(match[2], 10);
		const text = quotedText.slice(1, -1); // Remove surrounding quotes
		return [start, endEx, text];
	}
	return null;
}

async function main() {
	const argv = minimist(process.argv.slice(2), {
		alias: {
			p: 'path',
			s: 'single',
			c: 'csv'
		},
		boolean: ['single', 'csv'],
		string: ['path']
	});

	if (!argv.path) {
		console.error('Please provide a path to an alternative action JSON file using --path or -p');
		process.exit(1);
	}

	const inputFilePath = argv.path;

	if (argv.csv) {
		await handleCsv(inputFilePath);
		return;
	}

	await handleAlternativeActionJson(inputFilePath);
	return;
}

main();
