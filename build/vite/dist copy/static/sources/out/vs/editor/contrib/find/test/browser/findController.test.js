/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { Delayer } from '../../../../../base/common/async.js';
import * as platform from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditOperation } from '../../../../common/core/editOperation.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { CommonFindController, NextMatchFindAction, NextSelectionMatchFindAction, StartFindAction, StartFindReplaceAction, StartFindWithSelectionAction } from '../../browser/findController.js';
import { CONTEXT_FIND_INPUT_FOCUSED } from '../../browser/findModel.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
let TestFindController = class TestFindController extends CommonFindController {
    constructor(editor, contextKeyService, storageService, clipboardService, notificationService, hoverService) {
        super(editor, contextKeyService, storageService, clipboardService, notificationService, hoverService);
        this.delayUpdateHistory = false;
        this._findInputFocused = CONTEXT_FIND_INPUT_FOCUSED.bindTo(contextKeyService);
        this._updateHistoryDelayer = new Delayer(50);
        this.hasFocus = false;
    }
    async _start(opts) {
        await super._start(opts);
        if (opts.shouldFocus !== 0 /* FindStartFocusAction.NoFocusChange */) {
            this.hasFocus = true;
        }
        const inputFocused = opts.shouldFocus === 1 /* FindStartFocusAction.FocusFindInput */;
        this._findInputFocused.set(inputFocused);
    }
};
TestFindController = __decorate([
    __param(1, IContextKeyService),
    __param(2, IStorageService),
    __param(3, IClipboardService),
    __param(4, INotificationService),
    __param(5, IHoverService)
], TestFindController);
function fromSelection(slc) {
    return [slc.startLineNumber, slc.startColumn, slc.endLineNumber, slc.endColumn];
}
function executeAction(instantiationService, editor, action, args) {
    return instantiationService.invokeFunction((accessor) => {
        return Promise.resolve(action.runEditorCommand(accessor, editor, args));
    });
}
suite('FindController', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let clipboardState = '';
    const serviceCollection = new ServiceCollection();
    serviceCollection.set(IStorageService, new InMemoryStorageService());
    if (platform.isMacintosh) {
        // eslint-disable-next-line local/code-no-any-casts
        serviceCollection.set(IClipboardService, {
            readFindText: () => clipboardState,
            writeFindText: (value) => { clipboardState = value; }
        });
    }
    /* test('stores to the global clipboard buffer on start find action', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'ABC',
            'XYZ',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor) => {
            clipboardState = '';
            if (!platform.isMacintosh) {
                assert.ok(true);
                return;
            }
            let findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            let startFindAction = new StartFindAction();
            // I select ABC on the first line
            editor.setSelection(new Selection(1, 1, 1, 4));
            // I hit Ctrl+F to show the Find dialog
            startFindAction.run(null, editor);

            assert.deepStrictEqual(findController.getGlobalBufferTerm(), findController.getState().searchString);
            findController.dispose();
        });
    });

    test('reads from the global clipboard buffer on next find action if buffer exists', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'ABC',
            'XYZ',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor) => {
            clipboardState = 'ABC';

            if (!platform.isMacintosh) {
                assert.ok(true);
                return;
            }

            let findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            let findState = findController.getState();
            let nextMatchFindAction = new NextMatchFindAction();

            nextMatchFindAction.run(null, editor);
            assert.strictEqual(findState.searchString, 'ABC');

            assert.deepStrictEqual(fromSelection(editor.getSelection()!), [1, 1, 1, 4]);

            findController.dispose();
        });
    });

    test('writes to the global clipboard buffer when text changes', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'ABC',
            'XYZ',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor) => {
            clipboardState = '';
            if (!platform.isMacintosh) {
                assert.ok(true);
                return;
            }

            let findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            let findState = findController.getState();

            findState.change({ searchString: 'ABC' }, true);

            assert.deepStrictEqual(findController.getGlobalBufferTerm(), 'ABC');

            findController.dispose();
        });
    }); */
    test('issue #1857: F3, Find Next, acts like "Find Under Cursor"', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'ABC',
            'XYZ',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            clipboardState = '';
            // The cursor is at the very top, of the file, at the first ABC
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const findState = findController.getState();
            const nextMatchFindAction = NextMatchFindAction;
            // I hit Ctrl+F to show the Find dialog
            await executeAction(instantiationService, editor, StartFindAction);
            // I type ABC.
            findState.change({ searchString: 'A' }, true);
            findState.change({ searchString: 'AB' }, true);
            findState.change({ searchString: 'ABC' }, true);
            // The first ABC is highlighted.
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 1, 1, 4]);
            // I hit Esc to exit the Find dialog.
            findController.closeFindWidget();
            findController.hasFocus = false;
            // The cursor is now at end of the first line, with ABC on that line highlighted.
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 1, 1, 4]);
            // I hit delete to remove it and change the text to XYZ.
            editor.pushUndoStop();
            editor.executeEdits('test', [EditOperation.delete(new Range(1, 1, 1, 4))]);
            editor.executeEdits('test', [EditOperation.insert(new Position(1, 1), 'XYZ')]);
            editor.pushUndoStop();
            // At this point the text editor looks like this:
            //   XYZ
            //   ABC
            //   XYZ
            //   ABC
            assert.strictEqual(editor.getModel().getLineContent(1), 'XYZ');
            // The cursor is at end of the first line.
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 4, 1, 4]);
            // I hit F3 to "Find Next" to find the next occurrence of ABC, but instead it searches for XYZ.
            await editor.runAction(nextMatchFindAction);
            assert.strictEqual(findState.searchString, 'ABC');
            assert.strictEqual(findController.hasFocus, false);
            findController.dispose();
        });
    });
    test('issue #3090: F3 does not loop with two matches on a single line', async () => {
        await withAsyncTestCodeEditor([
            'import nls = require(\'vs/nls\');'
        ], { serviceCollection: serviceCollection }, async (editor) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const nextMatchFindAction = NextMatchFindAction;
            editor.setPosition({
                lineNumber: 1,
                column: 9
            });
            await editor.runAction(nextMatchFindAction);
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 26, 1, 29]);
            await editor.runAction(nextMatchFindAction);
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 8, 1, 11]);
            findController.dispose();
        });
    });
    test('issue #6149: Auto-escape highlighted text for search and replace regex mode', async () => {
        await withAsyncTestCodeEditor([
            'var x = (3 * 5)',
            'var y = (3 * 5)',
            'var z = (3  * 5)',
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const nextMatchFindAction = NextMatchFindAction;
            editor.setSelection(new Selection(1, 9, 1, 13));
            findController.toggleRegex();
            await executeAction(instantiationService, editor, StartFindAction);
            await editor.runAction(nextMatchFindAction);
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [2, 9, 2, 13]);
            await editor.runAction(nextMatchFindAction);
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 9, 1, 13]);
            findController.dispose();
        });
    });
    test('issue #41027: Don\'t replace find input value on replace action if find input is active', async () => {
        await withAsyncTestCodeEditor([
            'test',
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            const testRegexString = 'tes.';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const nextMatchFindAction = NextMatchFindAction;
            findController.toggleRegex();
            findController.setSearchString(testRegexString);
            await findController.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'none',
                seedSearchStringFromNonEmptySelection: false,
                seedSearchStringFromGlobalClipboard: false,
                shouldFocus: 1 /* FindStartFocusAction.FocusFindInput */,
                shouldAnimate: false,
                updateSearchScope: false,
                loop: true
            });
            await editor.runAction(nextMatchFindAction);
            await executeAction(instantiationService, editor, StartFindReplaceAction);
            assert.strictEqual(findController.getState().searchString, testRegexString);
            findController.dispose();
        });
    });
    test('editor.find.closeOnResult: closes find widget when a match is found from explicit navigation', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'ABC',
            'XYZ',
        ], { serviceCollection: serviceCollection, find: { closeOnResult: true } }, async (editor, _, instantiationService) => {
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const findState = findController.getState();
            await executeAction(instantiationService, editor, StartFindAction);
            assert.strictEqual(findState.isRevealed, true);
            findState.change({ searchString: 'ABC' }, true);
            await editor.runAction(NextMatchFindAction);
            assert.strictEqual(findState.isRevealed, false);
            findController.dispose();
        });
    });
    test('editor.find.closeOnResult: keeps find widget open when no match is found', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'DEF',
            'XYZ',
        ], { serviceCollection: serviceCollection, find: { closeOnResult: true } }, async (editor, _, instantiationService) => {
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const findState = findController.getState();
            await executeAction(instantiationService, editor, StartFindAction);
            assert.strictEqual(findState.isRevealed, true);
            findState.change({ searchString: 'NO_MATCH' }, true);
            await editor.runAction(NextMatchFindAction);
            assert.strictEqual(findState.matchesCount, 0);
            assert.strictEqual(findState.isRevealed, true);
            findController.dispose();
        });
    });
    test('editor.find.closeOnResult: disabled keeps find widget open after navigation', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'ABC',
            'XYZ',
        ], { serviceCollection: serviceCollection, find: { closeOnResult: false } }, async (editor, _, instantiationService) => {
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const findState = findController.getState();
            await executeAction(instantiationService, editor, StartFindAction);
            assert.strictEqual(findState.isRevealed, true);
            findState.change({ searchString: 'ABC' }, true);
            await editor.runAction(NextMatchFindAction);
            assert.strictEqual(findState.isRevealed, true);
            findController.dispose();
        });
    });
    test('issue #9043: Clear search scope when find widget is hidden', async () => {
        await withAsyncTestCodeEditor([
            'var x = (3 * 5)',
            'var y = (3 * 5)',
            'var z = (3 * 5)',
        ], { serviceCollection: serviceCollection }, async (editor) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            await findController.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'none',
                seedSearchStringFromNonEmptySelection: false,
                seedSearchStringFromGlobalClipboard: false,
                shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                shouldAnimate: false,
                updateSearchScope: false,
                loop: true
            });
            assert.strictEqual(findController.getState().searchScope, null);
            findController.getState().change({
                searchScope: [new Range(1, 1, 1, 5)]
            }, false);
            assert.deepStrictEqual(findController.getState().searchScope, [new Range(1, 1, 1, 5)]);
            findController.closeFindWidget();
            assert.strictEqual(findController.getState().searchScope, null);
        });
    });
    test('issue #18111: Regex replace with single space replaces with no space', async () => {
        await withAsyncTestCodeEditor([
            'HRESULT OnAmbientPropertyChange(DISPID   dispid);'
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            await executeAction(instantiationService, editor, StartFindAction);
            findController.getState().change({ searchString: '\\b\\s{3}\\b', replaceString: ' ', isRegex: true }, false);
            findController.moveToNextMatch();
            assert.deepStrictEqual(editor.getSelections().map(fromSelection), [
                [1, 39, 1, 42]
            ]);
            findController.replace();
            assert.deepStrictEqual(editor.getValue(), 'HRESULT OnAmbientPropertyChange(DISPID dispid);');
            findController.dispose();
        });
    });
    test('issue #24714: Regular expression with ^ in search & replace', async () => {
        await withAsyncTestCodeEditor([
            '',
            'line2',
            'line3'
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            await executeAction(instantiationService, editor, StartFindAction);
            findController.getState().change({ searchString: '^', replaceString: 'x', isRegex: true }, false);
            findController.moveToNextMatch();
            assert.deepStrictEqual(editor.getSelections().map(fromSelection), [
                [2, 1, 2, 1]
            ]);
            findController.replace();
            assert.deepStrictEqual(editor.getValue(), '\nxline2\nline3');
            findController.dispose();
        });
    });
    test('issue #38232: Find Next Selection, regex enabled', async () => {
        await withAsyncTestCodeEditor([
            '([funny]',
            '',
            '([funny]'
        ], { serviceCollection: serviceCollection }, async (editor) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const nextSelectionMatchFindAction = new NextSelectionMatchFindAction();
            // toggle regex
            findController.getState().change({ isRegex: true }, false);
            // change selection
            editor.setSelection(new Selection(1, 1, 1, 9));
            // cmd+f3
            await editor.runAction(nextSelectionMatchFindAction);
            assert.deepStrictEqual(editor.getSelections().map(fromSelection), [
                [3, 1, 3, 9]
            ]);
            findController.dispose();
        });
    });
    test('issue #38232: Find Next Selection, regex enabled, find widget open', async () => {
        await withAsyncTestCodeEditor([
            '([funny]',
            '',
            '([funny]'
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const nextSelectionMatchFindAction = new NextSelectionMatchFindAction();
            // cmd+f - open find widget
            await executeAction(instantiationService, editor, StartFindAction);
            // toggle regex
            findController.getState().change({ isRegex: true }, false);
            // change selection
            editor.setSelection(new Selection(1, 1, 1, 9));
            // cmd+f3
            await editor.runAction(nextSelectionMatchFindAction);
            assert.deepStrictEqual(editor.getSelections().map(fromSelection), [
                [3, 1, 3, 9]
            ]);
            findController.dispose();
        });
    });
    test('issue #47400, CMD+E supports feeding multiple line of text into the find widget', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'ABC',
            'XYZ',
            'ABC',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            // change selection
            editor.setSelection(new Selection(1, 1, 1, 1));
            // cmd+f - open find widget
            await executeAction(instantiationService, editor, StartFindAction);
            editor.setSelection(new Selection(1, 1, 2, 4));
            const startFindWithSelectionAction = new StartFindWithSelectionAction();
            await editor.runAction(startFindWithSelectionAction);
            const findState = findController.getState();
            assert.deepStrictEqual(findState.searchString.split(/\r\n|\r|\n/g), ['ABC', 'ABC']);
            editor.setSelection(new Selection(3, 1, 3, 1));
            await editor.runAction(startFindWithSelectionAction);
            findController.dispose();
        });
    });
    test('issue #109756, CMD+E with empty cursor should always work', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'ABC',
            'XYZ',
            'ABC',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor) => {
            clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            editor.setSelection(new Selection(1, 2, 1, 2));
            const startFindWithSelectionAction = new StartFindWithSelectionAction();
            editor.runAction(startFindWithSelectionAction);
            const findState = findController.getState();
            assert.deepStrictEqual(findState.searchString, 'ABC');
            findController.dispose();
        });
    });
});
suite('FindController query options persistence', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const serviceCollection = new ServiceCollection();
    const storageService = new InMemoryStorageService();
    storageService.store('editor.isRegex', false, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    storageService.store('editor.matchCase', false, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    storageService.store('editor.wholeWord', false, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    serviceCollection.set(IStorageService, storageService);
    test('matchCase', async () => {
        await withAsyncTestCodeEditor([
            'abc',
            'ABC',
            'XYZ',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            storageService.store('editor.matchCase', true, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
            // The cursor is at the very top, of the file, at the first ABC
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const findState = findController.getState();
            // I hit Ctrl+F to show the Find dialog
            await executeAction(instantiationService, editor, StartFindAction);
            // I type ABC.
            findState.change({ searchString: 'ABC' }, true);
            // The second ABC is highlighted as matchCase is true.
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [2, 1, 2, 4]);
            findController.dispose();
        });
    });
    storageService.store('editor.matchCase', false, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    storageService.store('editor.wholeWord', true, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    test('wholeWord', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'AB',
            'XYZ',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor, _, instantiationService) => {
            // The cursor is at the very top, of the file, at the first ABC
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const findState = findController.getState();
            // I hit Ctrl+F to show the Find dialog
            await executeAction(instantiationService, editor, StartFindAction);
            // I type AB.
            findState.change({ searchString: 'AB' }, true);
            // The second AB is highlighted as wholeWord is true.
            assert.deepStrictEqual(fromSelection(editor.getSelection()), [2, 1, 2, 3]);
            findController.dispose();
        });
    });
    test('toggling options is saved', async () => {
        await withAsyncTestCodeEditor([
            'ABC',
            'AB',
            'XYZ',
            'ABC'
        ], { serviceCollection: serviceCollection }, async (editor) => {
            // The cursor is at the very top, of the file, at the first ABC
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            findController.toggleRegex();
            assert.strictEqual(storageService.getBoolean('editor.isRegex', 1 /* StorageScope.WORKSPACE */), true);
            findController.dispose();
        });
    });
    test('issue #27083: Update search scope once find widget becomes visible', async () => {
        await withAsyncTestCodeEditor([
            'var x = (3 * 5)',
            'var y = (3 * 5)',
            'var z = (3 * 5)',
        ], { serviceCollection: serviceCollection, find: { autoFindInSelection: 'always', globalFindClipboard: false } }, async (editor) => {
            // clipboardState = '';
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            const findConfig = {
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'none',
                seedSearchStringFromNonEmptySelection: false,
                seedSearchStringFromGlobalClipboard: false,
                shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                shouldAnimate: false,
                updateSearchScope: true,
                loop: true
            };
            editor.setSelection(new Range(1, 1, 2, 1));
            findController.start(findConfig);
            assert.deepStrictEqual(findController.getState().searchScope, [new Selection(1, 1, 2, 1)]);
            findController.closeFindWidget();
            editor.setSelections([new Selection(1, 1, 2, 1), new Selection(2, 1, 2, 5)]);
            findController.start(findConfig);
            assert.deepStrictEqual(findController.getState().searchScope, [new Selection(1, 1, 2, 1), new Selection(2, 1, 2, 5)]);
        });
    });
    test('issue #58604: Do not update searchScope if it is empty', async () => {
        await withAsyncTestCodeEditor([
            'var x = (3 * 5)',
            'var y = (3 * 5)',
            'var z = (3 * 5)',
        ], { serviceCollection: serviceCollection, find: { autoFindInSelection: 'always', globalFindClipboard: false } }, async (editor) => {
            // clipboardState = '';
            editor.setSelection(new Range(1, 2, 1, 2));
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            await findController.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'none',
                seedSearchStringFromNonEmptySelection: false,
                seedSearchStringFromGlobalClipboard: false,
                shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                shouldAnimate: false,
                updateSearchScope: true,
                loop: true
            });
            assert.deepStrictEqual(findController.getState().searchScope, null);
        });
    });
    test('issue #58604: Update searchScope if it is not empty', async () => {
        await withAsyncTestCodeEditor([
            'var x = (3 * 5)',
            'var y = (3 * 5)',
            'var z = (3 * 5)',
        ], { serviceCollection: serviceCollection, find: { autoFindInSelection: 'always', globalFindClipboard: false } }, async (editor) => {
            // clipboardState = '';
            editor.setSelection(new Range(1, 2, 1, 3));
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            await findController.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'none',
                seedSearchStringFromNonEmptySelection: false,
                seedSearchStringFromGlobalClipboard: false,
                shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                shouldAnimate: false,
                updateSearchScope: true,
                loop: true
            });
            assert.deepStrictEqual(findController.getState().searchScope, [new Selection(1, 2, 1, 3)]);
        });
    });
    test('issue #27083: Find in selection when multiple lines are selected', async () => {
        await withAsyncTestCodeEditor([
            'var x = (3 * 5)',
            'var y = (3 * 5)',
            'var z = (3 * 5)',
        ], { serviceCollection: serviceCollection, find: { autoFindInSelection: 'multiline', globalFindClipboard: false } }, async (editor) => {
            // clipboardState = '';
            editor.setSelection(new Range(1, 6, 2, 1));
            const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
            await findController.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'none',
                seedSearchStringFromNonEmptySelection: false,
                seedSearchStringFromGlobalClipboard: false,
                shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                shouldAnimate: false,
                updateSearchScope: true,
                loop: true
            });
            assert.deepStrictEqual(findController.getState().searchScope, [new Selection(1, 6, 2, 1)]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZENvbnRyb2xsZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2ZpbmQvdGVzdC9icm93c2VyL2ZpbmRDb250cm9sbGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEtBQUssUUFBUSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR25HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsb0JBQW9CLEVBQTJDLG1CQUFtQixFQUFFLDRCQUE0QixFQUFFLGVBQWUsRUFBRSxzQkFBc0IsRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFPLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3hFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUUvRSxPQUFPLEVBQUUsaUJBQWlCLEVB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