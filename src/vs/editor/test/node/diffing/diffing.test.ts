/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FileAccess } from 'vs/base/common/network';
import { SmartLinesDiffComputer } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { StandardLinesDiffComputer } from 'vs/editor/common/diff/standardLinesDiffComputer';

suite('diff fixtures', () => {
	const fixturesDir = FileAccess.asFileUri('vs/editor/test/node/diffing/fixtures', require).fsPath;
	const folders = readdirSync(fixturesDir);

	for (const folder of folders) {
		for (const diffingAlgoName of ['smart', 'experimental']) {

			test(`${folder}-${diffingAlgoName}`, () => {
				const folderPath = join(fixturesDir, folder);
				const files = readdirSync(folderPath);

				const firstFileName = files.find(f => f.startsWith('1.'))!;
				const secondFileName = files.find(f => f.startsWith('2.'))!;

				const firstContentLines = readFileSync(join(folderPath, firstFileName), 'utf8').split(/\r\n|\r|\n/);
				const secondContentLines = readFileSync(join(folderPath, secondFileName), 'utf8').split(/\r\n|\r|\n/);

				const diffingAlgo = diffingAlgoName === 'smart' ? new SmartLinesDiffComputer() : new StandardLinesDiffComputer();

				const diff = diffingAlgo.computeDiff(firstContentLines, secondContentLines, { ignoreTrimWhitespace: false, maxComputationTime: Number.MAX_SAFE_INTEGER });

				const diffingResult: DiffingResult = {
					originalFileName: `./${firstFileName}`,
					modifiedFileName: `./${secondFileName}`,
					diffs: diff.changes.map<IDetailedDiff>(c => ({
						originalRange: c.originalRange.toString(),
						modifiedRange: c.modifiedRange.toString(),
						innerChanges: c.innerChanges?.map<IDiff>(c => ({
							originalRange: c.originalRange.toString(),
							modifiedRange: c.modifiedRange.toString(),
						})) || null
					}))
				};

				const actualFilePath = join(folderPath, `${diffingAlgoName}.actual.diff.json`);
				const expectedFilePath = join(folderPath, `${diffingAlgoName}.expected.diff.json`);

				const expectedFileContent = JSON.stringify(diffingResult, null, '\t');

				if (!existsSync(actualFilePath)) {
					writeFileSync(actualFilePath, expectedFileContent);
					writeFileSync(expectedFilePath, expectedFileContent);
					throw new Error('No actual file! Actual and expected files were written.');
				} else {
					const actualFileContent = readFileSync(actualFilePath, 'utf8');
					const actualFileDiffResult: DiffingResult = JSON.parse(actualFileContent);

					try {
						assert.deepStrictEqual(actualFileDiffResult, diffingResult);
					} catch (e) {
						writeFileSync(expectedFilePath, expectedFileContent);
						throw e;
					}
				}

				if (existsSync(expectedFilePath)) {
					throw new Error('Expected file exists! Please delete it.');
				}
			});
		}
	}
});

interface DiffingResult {
	originalFileName: string;
	modifiedFileName: string;

	diffs: IDetailedDiff[];
}

interface IDetailedDiff {
	originalRange: string; // [startLineNumber, endLineNumberExclusive)
	modifiedRange: string; // [startLineNumber, endLineNumberExclusive)
	innerChanges: IDiff[] | null;
}

interface IDiff {
	originalRange: string; // [1,18 -> 1,19]
	modifiedRange: string; // [1,18 -> 1,19]
}
