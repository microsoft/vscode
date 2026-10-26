/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from '../../../../base/common/path.js';
import { setUnexpectedErrorHandler } from '../../../../base/common/errors.js';
import { FileAccess, nodeModulesPath } from '../../../../base/common/network.js';
import { isElectron } from '../../../../base/common/platform.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../common/diff/rangeMapping.js';
import { LegacyLinesDiffComputer } from '../../../common/diff/legacyLinesDiffComputer.js';
import { DefaultLinesDiffComputer } from '../../../common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { Range } from '../../../common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TextReplacement, TextEdit } from '../../../common/core/edits/textEdit.js';
import { AbstractText, ArrayText } from '../../../common/core/text/abstractText.js';
import { ILinesDiffComputer, LinesDiff } from '../../../common/diff/linesDiffComputer.js';
import { verifyLinesDiff } from '../../../common/diff/verifyLinesDiff.js';
import { createExternalLinesDiffComputer } from '../../../common/diff/externalLinesDiffComputer.js';

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

	function readFixture(folder: string) {
		const folderPath = join(fixturesSrcDir, folder);
		const files = readdirSync(folderPath);

		const firstFileName = files.find(f => f.startsWith('1.'))!;
		const secondFileName = files.find(f => f.startsWith('2.'))!;

		const firstContent = readFileSync(join(folderPath, firstFileName), 'utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
		const secondContent = readFileSync(join(folderPath, secondFileName), 'utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
		return {
			folderPath, firstFileName, secondFileName, firstContent, secondContent,
			firstContentLines: firstContent.split(/\n/),
			secondContentLines: secondContent.split(/\n/),
			ignoreTrimWhitespace: folder.indexOf('trimws') >= 0,
		};
	}

	function runTest(folder: string, diffingAlgoName: 'legacy' | 'advanced') {
		const { folderPath, firstFileName, secondFileName, firstContent, secondContent, firstContentLines, secondContentLines, ignoreTrimWhitespace } = readFixture(folder);

		const diffingAlgo = diffingAlgoName === 'legacy' ? new LegacyLinesDiffComputer() : new DefaultLinesDiffComputer();
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

	async function loadExternalComputer(useWasm: boolean) {
		// Import by file URL: the electron test runner cannot resolve this ESM-only package by name.
		const externalModuleUrl = FileAccess.asFileUri(`${nodeModulesPath}/@vscode/diff/dist/index.js`).toString(true);
		const externalModule: typeof import('@vscode/diff') = await import(externalModuleUrl);
		return createExternalLinesDiffComputer(externalModule, useWasm);
	}

	// The wasm loader of @vscode/diff takes its node code path in the electron renderer, which cannot import `node:fs`.
	test('all diff algorithms produce valid diffs on all fixtures', async () => {
		const algorithms: [string, ILinesDiffComputer][] = [
			['advanced', new DefaultLinesDiffComputer()],
			['advanced-external', await loadExternalComputer(false)],
			...(isElectron ? [] : [['advanced-wasm', await loadExternalComputer(true)] satisfies [string, ILinesDiffComputer]]),
		];
		const invalid: string[] = [];
		for (const folder of folders) {
			const { firstContentLines, secondContentLines } = readFixture(folder);
			for (const [name, algorithm] of algorithms) {
				for (const ignoreTrimWhitespace of [false, true]) {
					const diff = algorithm.computeDiff(firstContentLines, secondContentLines, { ignoreTrimWhitespace, maxComputationTimeMs: 0, computeMoves: false });
					const validity = verifyLinesDiff(diff, firstContentLines, secondContentLines, ignoreTrimWhitespace);
					if (validity !== 'valid') {
						invalid.push(`${folder} ${name} ignoreTrimWhitespace=${ignoreTrimWhitespace}: ${validity}`);
					}
				}
			}
		}
		// Known bug of the built-in algorithm: when ignoring trim whitespace, it also hides whitespace changes inside lines that were joined.
		assert.deepStrictEqual(invalid, [
			'invalid-diff-bug advanced ignoreTrimWhitespace=true: invalid',
			'invalid-diff-trimws advanced ignoreTrimWhitespace=true: invalid',
		]);
	});

	test('@vscode/diff: ignoreTrimWhitespace hides only leading/trailing whitespace changes', async () => {
		const external = await loadExternalComputer(false);
		const original = ['if (a) {', '\tfoo();  ', '}', 'bar(x, y);', '  ', 'let a = 1;'];
		const modified = ['if (a) {', '    foo();', '}', 'bar(x,  y);', '\t', 'let  a = 2;'];
		const diff = external.computeDiff(original, modified, { ignoreTrimWhitespace: true, maxComputationTimeMs: 0, computeMoves: false });
		assert.deepStrictEqual(formatChanges(diff), [
			'[4,5)->[4,5) {[4,7 -> 4,7]->[4,7 -> 4,8]}',
			'[6,7)->[6,7) {[6,4 -> 6,4]->[6,4 -> 6,5]} {[6,9 -> 6,10]->[6,10 -> 6,11]}',
		]);
	});
});

function formatChanges(diff: LinesDiff): string[] {
	return diff.changes.map(c => `${c.original}->${c.modified} ${c.innerChanges?.map(i => i.toString()).join(' ')}`);
}

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
		return new TextReplacement(
			m.originalRange,
			modified.getValueOfRange(m.modifiedRange)
		);
	}));
}
