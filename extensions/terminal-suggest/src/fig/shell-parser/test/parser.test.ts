/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '../parser';
import { strictEqual } from 'node:assert';

function parseCommand(command: string): string {
	return JSON.stringify(parse(command), null, '  ');
}

/**
 *
 * @param filePath The path to the file to parse
 * @param nameComment The first character of each title line
 */
function getData(
	filePath: string,
	nameComment: string,
): [name: string, value: string][] {
	if (!fs.existsSync(filePath)) {
		fs.writeFileSync(filePath, '');
		return [];
	}
	return fs
		.readFileSync(filePath, { encoding: 'utf8' })
		.replaceAll('\r\n', '\n')
		.split('\n\n')
		.map((testCase) => {
			const firstNewline = testCase.indexOf('\n');
			const title = testCase.slice(0, firstNewline);
			const block = testCase.slice(firstNewline);
			return [title.slice(nameComment.length).trim(), block.trim()];
		});
}

// function outputNewFile(
// 	filePath: string,
// 	nameComment: string,
// 	data: [name: string, value: string][],
// ) {
// 	fs.writeFileSync(
// 		filePath,
// 		data.reduce(
// 			(previous, current, index) =>
// 				`${previous}${index > 0 ? '\n\n' : ''}${nameComment} ${current[0]}\n${current[1]
// 				}`,
// 			'',
// 		),
// 	);
// }

// function notIncludedIn<K>(setA: Set<K>, setB: Set<K>): K[] {
// 	const notIncluded: K[] = [];
// 	for (const v of setA) {
// 		if (!setB.has(v)) notIncluded.push(v);
// 	}
// 	return notIncluded;
// }

// function mapKeysDiff<K, V>(mapA: Map<K, V>, mapB: Map<K, V>) {
// 	const keysA = new Set(mapA.keys());
// 	const keysB = new Set(mapB.keys());
// 	return [
// 		notIncludedIn(keysA, keysB), // keys of A not included in B
// 		notIncludedIn(keysB, keysA), // keys of B not included in A
// 	];
// }

suite('fig/shell-parser/ fixtures', () => {
	const fixturesPath = path.join(__dirname, '../../../../fixtures/shell-parser');
	const fixtures = fs.readdirSync(fixturesPath);
	for (const fixture of fixtures) {
		// console.log('fixture', fixture);
		suite(fixture, () => {
			const inputFile = path.join(fixturesPath, fixture, 'input.sh');
			const outputFile = path.join(fixturesPath, fixture, 'output.txt');
			const inputData = new Map(getData(inputFile, '###'));
			const outputData = new Map(getData(outputFile, '//'));

			// clean diffs and regenerate files if required.
			// if (!process.env.NO_FIXTURES_EDIT) {
			// 	const [newInputs, extraOutputs] = mapKeysDiff(inputData, outputData);
			// 	extraOutputs.forEach((v) => outputData.delete(v));
			// 	newInputs.forEach((v) =>
			// 		outputData.set(v, parseCommand(inputData.get(v) ?? '')),
			// 	);
			// 	if (extraOutputs.length || newInputs.length) {
			// 		outputNewFile(outputFile, '//', [...outputData.entries()]);
			// 	}
			// }

			for (const [caseName, input] of inputData.entries()) {
				if (caseName) {
					test(caseName, () => {
						const output = outputData.get(caseName);
						strictEqual(parseCommand(input ?? ''), output);
					});
				}
			}
		});
	}
});
