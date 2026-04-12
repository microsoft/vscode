/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EditOperation } from '../../../common/core/editOperation.js';
import { Range } from '../../../common/core/range.js';
import { InternalModelContentChangeEvent } from '../../../common/textModelEvents.js';
import { createTextModel } from '../testTextModel.js';
suite('Editor Model - Injected Text Events', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('Basic', () => {
        const thisModel = store.add(createTextModel('First Line\nSecond Line'));
        const recordedChanges = new Array();
        const spyViewModel = new class extends mock() {
            onDidChangeContentOrInjectedText(e) {
                const changes = (e instanceof InternalModelContentChangeEvent ? e.rawContentChangedEvent.changes : e.changes);
                for (const change of changes) {
                    recordedChanges.push(mapChange(change));
                }
            }
            emitContentChangeEvent(_e) { }
        };
        thisModel.registerViewModel(spyViewModel);
        // Initial decoration
        let decorations = thisModel.deltaDecorations([], [{
                options: {
                    after: { content: 'injected1' },
                    description: 'test1',
                    showIfCollapsed: true
                },
                range: new Range(1, 1, 1, 1),
            }]);
        assert.deepStrictEqual(recordedChanges.splice(0), [
            {
                kind: 'lineChanged',
                lineNumber: 1,
                lineNumberPostEdit: 1,
            }
        ]);
        // Decoration change
        decorations = thisModel.deltaDecorations(decorations, [{
                options: {
                    after: { content: 'injected1' },
                    description: 'test1',
                    showIfCollapsed: true
                },
                range: new Range(2, 1, 2, 1),
            }, {
                options: {
                    after: { content: 'injected2' },
                    description: 'test2',
                    showIfCollapsed: true
                },
                range: new Range(2, 2, 2, 2),
            }]);
        assert.deepStrictEqual(recordedChanges.splice(0), [
            {
                kind: 'lineChanged',
                lineNumber: 1,
                lineNumberPostEdit: 1,
            },
            {
                kind: 'lineChanged',
                lineNumber: 2,
                lineNumberPostEdit: 2,
            }
        ]);
        // Simple Insert
        thisModel.applyEdits([EditOperation.replace(new Range(2, 2, 2, 2), 'Hello')]);
        assert.deepStrictEqual(recordedChanges.splice(0), [
            {
                kind: 'lineChanged',
                lineNumber: 2,
                lineNumberPostEdit: 2,
            }
        ]);
        // Multi-Line Insert
        thisModel.pushEditOperations(null, [EditOperation.replace(new Range(2, 2, 2, 2), '\n\n\n')], null);
        assert.deepStrictEqual(thisModel.getAllDecorations(undefined).map(d => ({ description: d.options.description, range: d.range.toString() })), [{
                'description': 'test1',
                'range': '[2,1 -> 2,1]'
            },
            {
                'description': 'test2',
                'range': '[2,2 -> 5,6]'
            }]);
        assert.deepStrictEqual(recordedChanges.splice(0), [
            {
                kind: 'lineChanged',
                lineNumber: 2,
                lineNumberPostEdit: 2,
            },
            {
                kind: 'linesInserted',
                fromLineNumber: 3,
                count: 3,
            }
        ]);
        // Multi-Line Replace
        thisModel.pushEditOperations(null, [EditOperation.replace(new Range(3, 1, 5, 1), '\n\n\n\n\n\n\n\n\n\n\n\n\n')], null);
        assert.deepStrictEqual(recordedChanges.splice(0), [
            {
                kind: 'lineChanged',
                lineNumber: 5,
                lineNumberPostEdit: 5,
            },
            {
                kind: 'lineChanged',
                lineNumber: 4,
                lineNumberPostEdit: 4,
            },
            {
                kind: 'lineChanged',
                lineNumber: 3,
                lineNumberPostEdit: 3,
            },
            {
                kind: 'linesInserted',
                fromLineNumber: 6,
                count: 11,
            }
        ]);
        // Multi-Line Replace undo
        assert.strictEqual(thisModel.undo(), undefined);
        assert.deepStrictEqual(recordedChanges.splice(0), [
            {
                kind: 'lineChanged',
                lineNumber: 2,
                lineNumberPostEdit: 2,
            },
            {
                kind: 'linesDeleted',
            }
        ]);
        thisModel.unregisterViewModel(spyViewModel);
    });
});
function mapChange(change) {
    if (change.changeType === 2 /* RawContentChangedType.LineChanged */) {
        return {
            kind: 'lineChanged',
            lineNumber: change.lineNumber,
            lineNumberPostEdit: change.lineNumberPostEdit,
        };
    }
    else if (change.changeType === 4 /* RawContentChangedType.LinesInserted */) {
        return {
            kind: 'linesInserted',
            fromLineNumber: change.fromLineNumber,
            count: change.count,
        };
    }
    else if (change.changeType === 3 /* RawContentChangedType.LinesDeleted */) {
        return {
            kind: 'linesDeleted',
        };
    }
    else if (change.changeType === 5 /* RawContentChangedType.EOLChanged */) {
        return {
            kind: 'eolChanged'
        };
    }
    else if (change.changeType === 1 /* RawContentChangedType.Flush */) {
        return {
            kind: 'flush'
        };
    }
    return { kind: 'unknown' };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxJbmplY3RlZFRleHQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9tb2RlbEluamVjdGVkVGV4dC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsK0JBQStCLEVBQXdFLE1BQU0sb0NBQW9DLENBQUM7QUFFM0osT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXRELEtBQUssQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7SUFDakQsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtRQUNsQixNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUM7UUFFeEUsTUFBTSxlQUFlLEdBQUcsSUFBSSxLQUFLLEVBQVcsQ0FBQztRQUU3QyxNQUFNLFlBQVksR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQWM7WUFDL0MsZ0NBQWdDLENBQUMsQ0FBa0U7Z0JBQzNHLE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQyxZQUFZLCtCQUErQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxD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