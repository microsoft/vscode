/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { derivedHandleChanges } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { observableCodeEditor } from '../../../browser/observableCodeEditor.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { withTestCodeEditor } from '../testCodeEditor.js';
suite('CodeEditorWidget', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function withTestFixture(cb) {
        withEditorSetupTestFixture(undefined, cb);
    }
    function withEditorSetupTestFixture(preSetupCallback, cb) {
        withTestCodeEditor('hello world', {}, (editor, viewModel) => {
            const disposables = new DisposableStore();
            preSetupCallback?.(editor, disposables);
            const obsEditor = observableCodeEditor(editor);
            const log = new Log();
            const derived = derivedHandleChanges({
                changeTracker: {
                    createChangeSummary: () => undefined,
                    handleChange: (context) => {
                        const obsName = observableName(context.changedObservable, obsEditor);
                        log.log(`handle change: ${obsName} ${formatChange(context.change)}`);
                        return true;
                    },
                },
            }, (reader) => {
                const versionId = obsEditor.versionId.read(reader);
                const selection = obsEditor.selections.read(reader)?.map((s) => s.toString()).join(', ');
                obsEditor.onDidType.read(reader);
                const str = `running derived: selection: ${selection}, value: ${versionId}`;
                log.log(str);
                return str;
            });
            derived.recomputeInitiallyAndOnChange(disposables);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'running derived: selection: [1,1 -> 1,1], value: 1',
            ]);
            cb({ editor, viewModel, log, derived });
            disposables.dispose();
        });
    }
    test('setPosition', () => withTestFixture(({ editor, log }) => {
        editor.setPosition(new Position(1, 2));
        assert.deepStrictEqual(log.getAndClearEntries(), ([
            'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":1,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"api","reason":0}',
            'running derived: selection: [1,2 -> 1,2], value: 1'
        ]));
    }));
    test('keyboard.type', () => withTestFixture(({ editor, log }) => {
        editor.trigger('keyboard', 'type', { text: 'abc' });
        assert.deepStrictEqual(log.getAndClearEntries(), ([
            'handle change: editor.onDidType "abc"',
            'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
            'handle change: editor.versionId {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
            'handle change: editor.versionId {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
            'handle change: editor.selections {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
            'running derived: selection: [1,4 -> 1,4], value: 4'
        ]));
    }));
    test('keyboard.type and set position', () => withTestFixture(({ editor, log }) => {
        editor.trigger('keyboard', 'type', { text: 'abc' });
        assert.deepStrictEqual(log.getAndClearEntries(), ([
            'handle change: editor.onDidType "abc"',
            'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
            'handle change: editor.versionId {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
            'handle change: editor.versionId {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
            'handle change: editor.selections {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
            'running derived: selection: [1,4 -> 1,4], value: 4'
        ]));
        editor.setPosition(new Position(1, 5), 'test');
        assert.deepStrictEqual(log.getAndClearEntries(), ([
            'handle change: editor.selections {"selection":"[1,5 -> 1,5]","modelVersionId":4,"oldSelections":["[1,4 -> 1,4]"],"oldModelVersionId":4,"source":"test","reason":0}',
            'running derived: selection: [1,5 -> 1,5], value: 4'
        ]));
    }));
    test('listener interaction (unforced)', () => {
        let derived;
        let log;
        withEditorSetupTestFixture((editor, disposables) => {
            disposables.add(editor.onDidChangeModelContent(() => {
                log.log('>>> before get');
                derived.get();
                log.log('<<< after get');
            }));
        }, (args) => {
            const editor = args.editor;
            derived = args.derived;
            log = args.log;
            editor.trigger('keyboard', 'type', { text: 'a' });
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                '>>> before get',
                '<<< after get',
                'handle change: editor.onDidType "a"',
                'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
                'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
                'running derived: selection: [1,2 -> 1,2], value: 2'
            ]));
        });
    });
    test('listener interaction ()', () => {
        let derived;
        let log;
        withEditorSetupTestFixture((editor, disposables) => {
            disposables.add(editor.onDidChangeModelContent(() => {
                log.log('>>> before forceUpdate');
                observableCodeEditor(editor).forceUpdate();
                log.log('>>> before get');
                derived.get();
                log.log('<<< after get');
            }));
        }, (args) => {
            const editor = args.editor;
            derived = args.derived;
            log = args.log;
            editor.trigger('keyboard', 'type', { text: 'a' });
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                '>>> before forceUpdate',
                '>>> before get',
                'handle change: editor.versionId undefined',
                'running derived: selection: [1,2 -> 1,2], value: 2',
                '<<< after get',
                'handle change: editor.onDidType "a"',
                'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
                'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
                'running derived: selection: [1,2 -> 1,2], value: 2'
            ]));
        });
    });
});
class Log {
    constructor() {
        this.entries = [];
    }
    log(message) {
        this.entries.push(message);
    }
    getAndClearEntries() {
        const entries = [...this.entries];
        this.entries.length = 0;
        return entries;
    }
}
function formatChange(change) {
    return JSON.stringify(change, (key, value) => {
        if (value instanceof Range) {
            return value.toString();
        }
        if (value === false ||
            (Array.isArray(value) && value.length === 0)) {
            return undefined;
        }
        return value;
    });
}
function observableName(obs, obsEditor) {
    switch (obs) {
        case obsEditor.selections:
            return 'editor.selections';
        case obsEditor.versionId:
            return 'editor.versionId';
        case obsEditor.onDidType:
            return 'editor.onDidType';
        default:
            return 'unknown';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JzZXJ2YWJsZUNvZGVFZGl0b3IudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvd2lkZ2V0L29ic2VydmFibGVDb2RlRWRpdG9yLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBZSxvQkFBb0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBd0Isb0JBQW9CLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRTFELEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7SUFDOUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLGVBQWUsQ0FDdkIsRUFBeUc7UUFFekcsMEJBQTBCLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRCxTQUFTLDBCQUEwQixDQUNsQyxnQkFFWSxFQUNaLEVBQXlHO1FBRXpHLGtCQUFrQixDQUFDLGFBQWEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLEVBQUU7WUFDM0QsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUMxQyxnQkFBZ0IsRUFBRSxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FB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