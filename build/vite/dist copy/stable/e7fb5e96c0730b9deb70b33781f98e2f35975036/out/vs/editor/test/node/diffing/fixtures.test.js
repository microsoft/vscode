/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from '../../../../base/common/path.js';
import { setUnexpectedErrorHandler } from '../../../../base/common/errors.js';
import { FileAccess } from '../../../../base/common/network.js';
import { RangeMapping } from '../../../common/diff/rangeMapping.js';
import { LegacyLinesDiffComputer } from '../../../common/diff/legacyLinesDiffComputer.js';
import { DefaultLinesDiffComputer } from '../../../common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TextReplacement, TextEdit } from '../../../common/core/edits/textEdit.js';
import { ArrayText } from '../../../common/core/text/abstractText.js';
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
    function runTest(folder, diffingAlgoName) {
        const folderPath = join(fixturesSrcDir, folder);
        const files = readdirSync(folderPath);
        const firstFileName = files.find(f => f.startsWith('1.'));
        const secondFileName = files.find(f => f.startsWith('2.'));
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
        function getDiffs(changes) {
            for (const c of changes) {
                RangeMapping.assertSorted(c.innerChanges ?? []);
            }
            return changes.map(c => ({
                originalRange: c.original.toString(),
                modifiedRange: c.modified.toString(),
                innerChanges: c.innerChanges?.map(c => ({
                    originalRange: formatRange(c.originalRange, firstContentLines),
                    modifiedRange: formatRange(c.modifiedRange, secondContentLines),
                })) || null
            }));
        }
        function formatRange(range, lines) {
            const toLastChar = range.endColumn === lines[range.endLineNumber - 1].length + 1;
            return '[' + range.startLineNumber + ',' + range.startColumn + ' -> ' + range.endLineNumber + ',' + range.endColumn + (toLastChar ? ' EOL' : '') + ']';
        }
        const actualDiffingResult = {
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
        }
        if (existsSync(invalidFilePath)) {
            const invalidJsonStr = readFileSync(invalidFilePath, 'utf8');
            if (invalidJsonStr === '') {
                // Update expected file
                writeFileSync(expectedFilePath, actualJsonStr);
                throw new Error(`Delete the invalid ${invalidFilePath} file to make the test pass.`);
            }
            else {
                const expectedFileDiffResult = JSON.parse(invalidJsonStr);
                try {
                    assert.deepStrictEqual(actualDiffingResult, expectedFileDiffResult);
                }
                catch (e) {
                    writeFileSync(expectedFilePath, actualJsonStr);
                    throw e;
                }
                // Test succeeded with the invalid file, restore expected file from invalid
                writeFileSync(expectedFilePath, invalidJsonStr);
                rmSync(invalidFilePath);
            }
        }
        else {
            const expectedJsonStr = readFileSync(expectedFilePath, 'utf8');
            const expectedFileDiffResult = JSON.parse(expectedJsonStr);
            try {
                assert.deepStrictEqual(actualDiffingResult, expectedFileDiffResult);
            }
            catch (e) {
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
        for (const diffingAlgoName of ['legacy', 'advanced']) {
            test(`${folder}-${diffingAlgoName}`, () => {
                runTest(folder, diffingAlgoName);
            });
        }
    }
});
function assertDiffCorrectness(diff, original, modified) {
    const allInnerChanges = diff.changes.flatMap(c => c.innerChanges);
    const edit = rangeMappingsToTextEdit(allInnerChanges, new ArrayText(modified));
    const result = edit.normalize().apply(new ArrayText(original));
    assert.deepStrictEqual(result, modified.join('\n'));
}
function rangeMappingsToTextEdit(rangeMappings, modified) {
    return new TextEdit(rangeMappings.map(m => {
        return new TextReplacement(m.originalRange, modified.getValueOfRange(m.modifiedRange));
    }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZml4dHVyZXMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L25vZGUvZGlmZmluZy9maXh0dXJlcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxNQUFNLElBQUksQ0FBQztBQUNsRixPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQTRCLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBRXJILE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbkYsT0FBTyxFQUFnQixTQUFTLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUdwRixLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO0lBQzlCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzdCLE1BQU0sQ0FBQyxDQUFDO1FBQ1QsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJ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