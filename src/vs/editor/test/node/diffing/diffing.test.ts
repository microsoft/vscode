/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { readdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { FileAccess } from 'vs/base/common/network';
import { SmartLinesDiffComputer } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { StandardLinesDiffComputer } from 'vs/editor/common/diff/standardLinesDiffComputer';

suite('diff fixtures', () => {
	const fixturesOutDir = FileAccess.asFileUri('vs/editor/test/node/diffing/fixtures').fsPath;
	// We want the dir in src, so we can directly update the source files if they disagree and create invalid files to capture the previous state.
	// This makes it very easy to update the fixtures.
	const fixturesSrcDir = resolve(fixturesOutDir).replaceAll('\\', '/').replace('/out/vs/editor/', '/src/vs/editor/');
	const folders = readdirSync(fixturesSrcDir);

	function runTest(folder: string, diffingAlgoName: 'smart' | 'experimental') {
		const folderPath = join(fixturesSrcDir, folder);
		const files = readdirSync(folderPath);

		const firstFileName = files.find(f => f.startsWith('1.'))!;
		const secondFileName = files.find(f => f.startsWith('2.'))!;

		const firstContentLines = readFileSync(join(folderPath, firstFileName), 'utf8').split(/\r\n|\r|\n/);
		const secondContentLines = readFileSync(join(folderPath, secondFileName), 'utf8').split(/\r\n|\r|\n/);

		const diffingAlgo = diffingAlgoName === 'smart' ? new SmartLinesDiffComputer() : new StandardLinesDiffComputer();

		const diff = diffingAlgo.computeDiff(firstContentLines, secondContentLines, { ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER });

		const actualDiffingResult: DiffingResult = {
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

		const expectedFilePath = join(folderPath, `${diffingAlgoName}.expected.diff.json`);
		const invalidFilePath = join(folderPath, `${diffingAlgoName}.invalid.diff.json`);

		const expectedFileContentFromActual = JSON.stringify(actualDiffingResult, null, '\t');

		const invalidExists = existsSync(invalidFilePath);

		if (!existsSync(expectedFilePath)) {
			writeFileSync(expectedFilePath, expectedFileContentFromActual);
			writeFileSync(invalidFilePath, '');
			throw new Error('No expected file! Expected and invalid files were written. Delete the invalid file to make the test pass.');
		} else {
			const expectedFileContent = readFileSync(invalidExists ? invalidFilePath : expectedFilePath, 'utf8');
			if (invalidExists && expectedFileContent === '') {
				throw new Error('Delete the invalid file to make the test pass.');
			}
			const expectedFileDiffResult: DiffingResult = JSON.parse(expectedFileContent);

			try {
				assert.deepStrictEqual(actualDiffingResult, expectedFileDiffResult);
			} catch (e) {
				if (!invalidExists) {
					writeFileSync(invalidFilePath, expectedFileContent);
				}
				writeFileSync(expectedFilePath, expectedFileContentFromActual);
				throw e;
			}
		}

		if (invalidExists) {
			rmSync(invalidFilePath);
		}
	}

	for (const folder of folders) {
		for (const diffingAlgoName of ['smart', 'experimental'] as const) {
			test(`${folder}-${diffingAlgoName}`, () => {
				runTest(folder, diffingAlgoName);
			});
		}
	}

	test(`debug`, () => {
		runTest('penalize-fragmentation', 'experimental');
	});
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
