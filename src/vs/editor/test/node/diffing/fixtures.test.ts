/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { FileAccess } from 'vs/base/common/network';
import { DetailedLineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { LegacyLinesDiffComputer } from 'vs/editor/common/diff/legacyLinesDiffComputer';
import { DefaultLinesDiffComputer } from 'vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer';
import { Range } from 'vs/editor/common/core/range';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { AbstractText, ArrayText, SingleTextEdit, TextEdit } from 'vs/editor/common/core/textEdit';
import { LinesDiff } from 'vs/editor/common/diff/linesDiffComputer';

suite('diffing fixtures', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		setUnexpectedErrorHandler(e => {
			throw e;
		});
	});


	const fixturesOutDir = FileAccess.asFileUri('vs/editor/test/node/diffing/fixtures').fsPath;
	// We want the dir in src, so we can directly update the source files if they disagree and create invalid files to capture the previous state.
	// This makes it very easy to update the fixtures.
	const fixturesSrcDir = resolve(fixturesOutDir).replaceAll('\\', '/').replace('/out/vs/editor/', '/src/vs/editor/');
	const folders = readdirSync(fixturesSrcDir);

	function runTest(folder: string, diffingAlgoName: 'legacy' | 'advanced') {
		const folderPath = join(fixturesSrcDir, folder);
		const files = readdirSync(folderPath);

		const firstFileName = files.find(f => f.startsWith('1.'))!;
		const secondFileName = files.find(f => f.startsWith('2.'))!;

		const firstContent = readFileSync(join(folderPath, firstFileName), 'utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
		const firstContentLines = firstContent.split(/\n/);
		const secondContent = readFileSync(join(folderPath, secondFileName), 'utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
		const secondContentLines = secondContent.split(/\n/);

		const diffingAlgo = diffingAlgoName === 'legacy' ? new LegacyLinesDiffComputer() : new DefaultLinesDiffComputer();

		const ignoreTrimWhitespace = folder.indexOf('trimws') >= 0;
		const diff = diffingAlgo.computeDiff(firstContentLines, secondContentLines, { ignoreTrimWhitespace, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, computeMoves: true });

		if (diffingAlgoName === 'advanced' && !ignoreTrimWhitespace) {
			assertDiffCorrectness(diff, firstContentLines, secondContentLines);
		}

		function getDiffs(changes: readonly DetailedLineRangeMapping[]): IDetailedDiff[] {
			for (const c of changes) {
				RangeMapping.assertSorted(c.innerChanges ?? []);
			}

			return changes.map<IDetailedDiff>(c => ({
				originalRange: c.original.toString(),
				modifiedRange: c.modified.toString(),
				innerChanges: c.innerChanges?.map<IDiff>(c => ({
					originalRange: formatRange(c.originalRange, firstContentLines),
					modifiedRange: formatRange(c.modifiedRange, secondContentLines),
				})) || null
			}));
		}

		function formatRange(range: Range, lines: string[]): string {
			const toLastChar = range.endColumn === lines[range.endLineNumber - 1].length + 1;

			return '[' + range.startLineNumber + ',' + range.startColumn + ' -> ' + range.endLineNumber + ',' + range.endColumn + (toLastChar ? ' EOL' : '') + ']';
		}

		const actualDiffingResult: DiffingResult = {
			original: { content: firstContent, fileName: `./${firstFileName}` },
			modified: { content: secondContent, fileName: `./${secondFileName}` },
			diffs: getDiffs(diff.changes),
			moves: diff.moves.map(v => ({
				originalRange: v.lineRangeMapping.original.toString(),
				modifiedRange: v.lineRangeMapping.modified.toString(),
				changes: getDiffs(v.changes),
			}))
		};
		if (actualDiffingResult.moves?.length === 0) {
			delete actualDiffingResult.moves;
		}

		const expectedFilePath = join(folderPath, `${diffingAlgoName}.expected.diff.json`);
		const invalidFilePath = join(folderPath, `${diffingAlgoName}.invalid.diff.json`);

		const actualJsonStr = JSON.stringify(actualDiffingResult, null, '\t');

		if (!existsSync(expectedFilePath)) {
			// New test, create expected file
			writeFileSync(expectedFilePath, actualJsonStr);
			// Create invalid file so that this test fails on a re-run
			writeFileSync(invalidFilePath, '');
			throw new Error('No expected file! Expected and invalid files were written. Delete the invalid file to make the test pass.');
		} if (existsSync(invalidFilePath)) {
			const invalidJsonStr = readFileSync(invalidFilePath, 'utf8');
			if (invalidJsonStr === '') {
				// Update expected file
				writeFileSync(expectedFilePath, actualJsonStr);
				throw new Error(`Delete the invalid ${invalidFilePath} file to make the test pass.`);
			} else {
				const expectedFileDiffResult: DiffingResult = JSON.parse(invalidJsonStr);
				try {
					assert.deepStrictEqual(actualDiffingResult, expectedFileDiffResult);
				} catch (e) {
					writeFileSync(expectedFilePath, actualJsonStr);
					throw e;
				}
				// Test succeeded with the invalid file, restore expected file from invalid
				writeFileSync(expectedFilePath, invalidJsonStr);
				rmSync(invalidFilePath);
			}
		} else {
			const expectedJsonStr = readFileSync(expectedFilePath, 'utf8');
			const expectedFileDiffResult: DiffingResult = JSON.parse(expectedJsonStr);
			try {
				assert.deepStrictEqual(actualDiffingResult, expectedFileDiffResult);
			} catch (e) {
				// Backup expected file
				writeFileSync(invalidFilePath, expectedJsonStr);
				// Update expected file
				writeFileSync(expectedFilePath, actualJsonStr);
				throw e;
			}
		}
	}

	test(`test`, () => {
		runTest('invalid-diff-trimws', 'advanced');
	});

	for (const folder of folders) {
		for (const diffingAlgoName of ['legacy', 'advanced'] as const) {
			test(`${folder}-${diffingAlgoName}`, () => {
				runTest(folder, diffingAlgoName);
			});
		}
	}
});

interface DiffingResult {
	original: { content: string; fileName: string };
	modified: { content: string; fileName: string };

	diffs: IDetailedDiff[];
	moves?: IMoveInfo[];
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

interface IMoveInfo {
	originalRange: string; // [startLineNumber, endLineNumberExclusive)
	modifiedRange: string; // [startLineNumber, endLineNumberExclusive)

	changes: IDetailedDiff[];
}

function assertDiffCorrectness(diff: LinesDiff, original: string[], modified: string[]) {
	const allInnerChanges = diff.changes.flatMap(c => c.innerChanges!);
	const edit = rangeMappingsToTextEdit(allInnerChanges, new ArrayText(modified));
	const result = edit.normalize().apply(new ArrayText(original));

	assert.deepStrictEqual(result, modified.join('\n'));
}

function rangeMappingsToTextEdit(rangeMappings: readonly RangeMapping[], modified: AbstractText): TextEdit {
	return new TextEdit(rangeMappings.map(m => {
		return new SingleTextEdit(
			m.originalRange,
			modified.getValueOfRange(m.modifiedRange)
		);
	}));
}
