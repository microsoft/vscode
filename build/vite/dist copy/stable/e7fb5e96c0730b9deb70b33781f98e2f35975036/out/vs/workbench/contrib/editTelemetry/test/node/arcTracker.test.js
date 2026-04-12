/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { ArcTracker } from '../../common/arcTracker.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { readFileSync } from 'fs';
import { join, resolve } from '../../../../../base/common/path.js';
import { StringEdit, StringReplacement } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { ensureDependenciesAreSet } from '../../../../../editor/common/core/text/positionToOffset.js';
suite('ArcTracker', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    ensureDependenciesAreSet();
    const fixturesOutDir = FileAccess.asFileUri('vs/workbench/contrib/editTelemetry/test/node/data').fsPath;
    const fixturesSrcDir = resolve(fixturesOutDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
    function getData(name) {
        const path = join(fixturesSrcDir, name + '.edits.w.json');
        const src = readFileSync(path, 'utf8');
        return JSON.parse(src);
    }
    test('issue-264048', () => {
        const stats = runTestWithData(getData('issue-264048'));
        assert.deepStrictEqual(stats, ([
            {
                arc: 8,
                deletedLineCounts: 1,
                insertedLineCounts: 1
            },
            {
                arc: 8,
                deletedLineCounts: 0,
                insertedLineCounts: 1
            },
            {
                arc: 8,
                deletedLineCounts: 0,
                insertedLineCounts: 1
            }
        ]));
    });
    test('line-insert', () => {
        const stats = runTestWithData(getData('line-insert'));
        assert.deepStrictEqual(stats, ([
            {
                arc: 7,
                deletedLineCounts: 0,
                insertedLineCounts: 1
            },
            {
                arc: 5,
                deletedLineCounts: 0,
                insertedLineCounts: 1
            }
        ]));
    });
    test('line-modification', () => {
        const stats = runTestWithData(getData('line-modification'));
        assert.deepStrictEqual(stats, ([
            {
                arc: 6,
                deletedLineCounts: 1,
                insertedLineCounts: 1
            },
            {
                arc: 6,
                deletedLineCounts: 1,
                insertedLineCounts: 1
            },
            {
                arc: 0,
                deletedLineCounts: 0,
                insertedLineCounts: 0
            }
        ]));
    });
    test('multiline-insert', () => {
        const stats = runTestWithData(getData('multiline-insert'));
        assert.deepStrictEqual(stats, ([
            {
                arc: 24,
                deletedLineCounts: 0,
                insertedLineCounts: 3
            },
            {
                arc: 23,
                deletedLineCounts: 0,
                insertedLineCounts: 2
            }
        ]));
    });
});
function createStringEditFromJson(editData) {
    const replacements = editData.replacements.map(replacement => new StringReplacement(OffsetRange.ofStartAndLength(replacement.start, replacement.endEx - replacement.start), replacement.text));
    return new StringEdit(replacements);
}
function runTestWithData(data) {
    const edits = data.edits.map(editData => createStringEditFromJson(editData));
    const t = new ArcTracker(new StringText(data.initialText), edits[0]);
    const stats = [];
    stats.push(t.getValues());
    let lastLineNumbers = t.getLineCountInfo().insertedLineCounts;
    let lastArc = t.getAcceptedRestrainedCharactersCount();
    for (let i = 1; i < edits.length; i++) {
        t.handleEdits(edits[i]);
        stats.push(t.getValues());
        const newLineNumbers = t.getLineCountInfo().insertedLineCounts;
        assert.ok(newLineNumbers <= lastLineNumbers, `Line numbers must not increase. Last: ${lastLineNumbers}, new: ${newLineNumbers}`);
        lastLineNumbers = newLineNumbers;
        const newArc = t.getAcceptedRestrainedCharactersCount();
        assert.ok(newArc <= lastArc, `ARC must not increase. Last: ${lastArc}, new: ${newArc}`);
        lastArc = newArc;
    }
    return stats;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJjVHJhY2tlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZWRpdFRlbGVtZXRyeS90ZXN0L25vZGUvYXJjVHJhY2tlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDcEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ2xDLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUV0RyxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtJQUN4Qix1Q0FBdUMsRUFBRSxDQUFDO0lBQzFDLHdCQUF3QixFQUFFLENBQUM7SUFFM0IsTUFBTSxjQUFjLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxtREFBbUQsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN4RyxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsb0JBQW9C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