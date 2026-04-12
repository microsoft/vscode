/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { withTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { ChatWidget } from '../../../../../browser/widget/chatWidget.js';
import '../../../../../browser/widget/input/editor/chatInputEditorContrib.js';
suite('ChatTokenDeleter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function getChatTokenDeleterCtor() {
        const ctor = ChatWidget.CONTRIBS.find(contrib => contrib.name === 'ChatTokenDeleter');
        assert.ok(ctor, 'ChatTokenDeleter should be registered as a chat widget contribution');
        return ctor;
    }
    function createWidget(editor, onRefreshParsedInput) {
        return {
            inputEditor: editor,
            refreshParsedInput: onRefreshParsedInput,
        };
    }
    test('deletes inserted slash, agent, and variable tokens on immediate backspace', () => {
        const testCases = [
            { initialValue: '/', insertedText: '/fix ', deleteRange: new Range(1, 5, 1, 6) },
            { initialValue: '@', insertedText: '@workspace ', deleteRange: new Range(1, 11, 1, 12) },
            { initialValue: '#', insertedText: '#selection', deleteRange: new Range(1, 10, 1, 11) },
        ];
        for (const testCase of testCases) {
            withTestCodeEditor(testCase.initialValue, {}, editor => {
                let refreshCount = 0;
                const store = new DisposableStore();
                try {
                    const widget = createWidget(editor, () => {
                        refreshCount++;
                    });
                    const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
                    store.add(new ChatTokenDeleterCtor(widget));
                    editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: testCase.insertedText }]);
                    assert.strictEqual(editor.getValue(), testCase.insertedText);
                    editor.executeEdits('test', [{ range: testCase.deleteRange, text: '' }]);
                    assert.strictEqual(editor.getValue(), '');
                    assert.strictEqual(refreshCount, 1);
                }
                finally {
                    store.dispose();
                }
            });
        }
    });
    test('does not delete the whole token when backspacing inside the inserted token', () => {
        withTestCodeEditor('@', {}, editor => {
            let refreshCount = 0;
            const store = new DisposableStore();
            try {
                const widget = createWidget(editor, () => {
                    refreshCount++;
                });
                const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
                store.add(new ChatTokenDeleterCtor(widget));
                editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: '@workspace ' }]);
                editor.executeEdits('test', [{ range: new Range(1, 5, 1, 6), text: '' }]);
                assert.strictEqual(editor.getValue(), '@worspace ');
                assert.strictEqual(refreshCount, 0);
            }
            finally {
                store.dispose();
            }
        });
    });
    test('only deletes on the immediate next backspace after token insertion', () => {
        withTestCodeEditor('@', {}, editor => {
            let refreshCount = 0;
            const store = new DisposableStore();
            try {
                const widget = createWidget(editor, () => {
                    refreshCount++;
                });
                const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
                store.add(new ChatTokenDeleterCtor(widget));
                editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: '@workspace ' }]);
                editor.executeEdits('test', [{ range: new Range(1, 11, 1, 11), text: 'x' }]);
                editor.executeEdits('test', [{ range: new Range(1, 11, 1, 12), text: '' }]);
                assert.strictEqual(editor.getValue(), '@workspace ');
                assert.strictEqual(refreshCount, 0);
            }
            finally {
                store.dispose();
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0RWRpdG9yQ29udHJpYi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0SW5wdXRFZGl0b3JDb250cmliLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM1RyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDNUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFbkcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pFLE9BQU8sc0VBQXNFLENBQUM7QUFFOUUsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtJQUU5Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsdUJBQXVCO1FBQy9CLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLHFFQUFxRSxDQUFDLENBQUM7UUFDdkYsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsU0FBUyxZQUFZLENBQUMsTUFBa0MsRUFBRSxvQkFBZ0M7UUFDekYsT0FBTztZQUNOLFdBQVcsRUFBRSxNQUFNO1lBQ25CLGtCQUFrQixFQUFFLG9CQUFvQjtTQUNkLENBQUM7SUFD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