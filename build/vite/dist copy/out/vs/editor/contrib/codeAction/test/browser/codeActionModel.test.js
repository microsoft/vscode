/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { promiseWithResolvers } from '../../../../../base/common/async.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { createTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { CodeActionModel } from '../../browser/codeActionModel.js';
const testProvider = {
    provideCodeActions() {
        return {
            actions: [
                { title: 'test', command: { id: 'test-command', title: 'test', arguments: [] } }
            ],
            dispose() { }
        };
    }
};
suite('CodeActionModel', () => {
    const languageId = 'foo-lang';
    const uri = URI.parse('untitled:path');
    let model;
    let markerService;
    let editor;
    let registry;
    setup(() => {
        markerService = new MarkerService();
        model = createTextModel('foobar  foo bar\nfarboo far boo', languageId, undefined, uri);
        editor = createTestCodeEditor(model);
        editor.setPosition({ lineNumber: 1, column: 1 });
        registry = new LanguageFeatureRegistry();
    });
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    teardown(() => {
        editor.dispose();
        model.dispose();
        markerService.dispose();
    });
    test('Oracle -> marker added', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        await runWithFakedTimers({ useFakeTimers: true }, () => {
            const reg = registry.register(languageId, testProvider);
            store.add(reg);
            const contextKeys = new MockContextKeyService();
            const model = store.add(new CodeActionModel(editor, registry, markerService, contextKeys, undefined));
            store.add(model.onDidChangeState((e) => {
                assertType(e.type === 1 /* CodeActionsState.Type.Triggered */);
                assert.strictEqual(e.trigger.type, 2 /* languages.CodeActionTriggerType.Auto */);
                assert.ok(e.actions);
                e.actions.then(fixes => {
                    model.dispose();
                    assert.strictEqual(fixes.validActions.length, 1);
                    done();
                }, done);
            }));
            // start here
            markerService.changeOne('fake', uri, [{
                    startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
                    message: 'error',
                    severity: 1,
                    code: '',
                    source: ''
                }]);
            return donePromise;
        });
    });
    test('Oracle -> position changed', async () => {
        await runWithFakedTimers({ useFakeTimers: true }, () => {
            const reg = registry.register(languageId, testProvider);
            store.add(reg);
            markerService.changeOne('fake', uri, [{
                    startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
                    message: 'error',
                    severity: 1,
                    code: '',
                    source: ''
                }]);
            editor.setPosition({ lineNumber: 2, column: 1 });
            return new Promise((resolve, reject) => {
                const contextKeys = new MockContextKeyService();
                const model = store.add(new CodeActionModel(editor, registry, markerService, contextKeys, undefined));
                store.add(model.onDidChangeState((e) => {
                    assertType(e.type === 1 /* CodeActionsState.Type.Triggered */);
                    assert.strictEqual(e.trigger.type, 2 /* languages.CodeActionTriggerType.Auto */);
                    assert.ok(e.actions);
                    e.actions.then(fixes => {
                        model.dispose();
                        assert.strictEqual(fixes.validActions.length, 1);
                        resolve(undefined);
                    }, reject);
                }));
                // start here
                editor.setPosition({ lineNumber: 1, column: 1 });
            });
        });
    });
    test('Oracle -> should only auto trigger once for cursor and marker update right after each other', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        await runWithFakedTimers({ useFakeTimers: true }, () => {
            const reg = registry.register(languageId, testProvider);
            store.add(reg);
            let triggerCount = 0;
            const contextKeys = new MockContextKeyService();
            const model = store.add(new CodeActionModel(editor, registry, markerService, contextKeys, undefined));
            store.add(model.onDidChangeState((e) => {
                assertType(e.type === 1 /* CodeActionsState.Type.Triggered */);
                assert.strictEqual(e.trigger.type, 2 /* languages.CodeActionTriggerType.Auto */);
                ++triggerCount;
                // give time for second trigger before completing test
                setTimeout(() => {
                    model.dispose();
                    assert.strictEqual(triggerCount, 1);
                    done();
                }, 0);
            }, 5 /*delay*/));
            markerService.changeOne('fake', uri, [{
                    startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
                    message: 'error',
                    severity: 1,
                    code: '',
                    source: ''
                }]);
            editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 });
            return donePromise;
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbk1vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL3Rlc3QvYnJvd3Nlci9jb2RlQWN0aW9uTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNoSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFeEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFHeEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQW9CLE1BQU0sa0NBQWtDLENBQUM7QUFFckYsTUFBTSxZQUFZLEdBQUc7SUFDcEIsa0JBQWtCO1FBQ2pCLE9BQU87WUFDTixPQUFPLEVBQUU7Z0JBQ1IsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFF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