/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CoreEditingCommands } from '../../../../browser/coreCommands.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { USUAL_WORD_SEPARATORS } from '../../../../common/core/wordHelper.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { DeleteAllLeftAction } from '../../../linesOperations/browser/linesOperations.js';
import { LinkedEditingContribution } from '../../browser/linkedEditing.js';
import { DeleteWordLeft } from '../../../wordOperations/browser/wordOperations.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../test/common/testTextModel.js';
const mockFile = URI.parse('test:somefile.ttt');
const mockFileSelector = { scheme: 'test' };
const timeout = 30;
const languageId = 'linkedEditingTestLangage';
suite('linked editing', () => {
    let disposables;
    let instantiationService;
    let languageFeaturesService;
    let languageConfigurationService;
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = createCodeEditorServices(disposables);
        languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
        languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        disposables.add(languageConfigurationService.register(languageId, {
            wordPattern: /[a-zA-Z]+/
        }));
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createMockEditor(text) {
        const model = disposables.add(instantiateTextModel(instantiationService, typeof text === 'string' ? text : text.join('\n'), languageId, undefined, mockFile));
        const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
        return editor;
    }
    function testCase(name, initialState, operations, expectedEndText) {
        test(name, async () => {
            await runWithFakedTimers({}, async () => {
                disposables.add(languageFeaturesService.linkedEditingRangeProvider.register(mockFileSelector, {
                    provideLinkedEditingRanges(model, pos) {
                        const wordAtPos = model.getWordAtPosition(pos);
                        if (wordAtPos) {
                            const matches = model.findMatches(wordAtPos.word, false, false, true, USUAL_WORD_SEPARATORS, false);
                            return { ranges: matches.map(m => m.range), wordPattern: initialState.responseWordPattern };
                        }
                        return { ranges: [], wordPattern: initialState.responseWordPattern };
                    }
                }));
                const editor = createMockEditor(initialState.text);
                editor.updateOptions({ linkedEditing: true });
                const linkedEditingContribution = disposables.add(editor.registerAndInstantiateContribution(LinkedEditingContribution.ID, LinkedEditingContribution));
                linkedEditingContribution.setDebounceDuration(0);
                const testEditor = {
                    setPosition(pos) {
                        editor.setPosition(pos);
                        return linkedEditingContribution.currentUpdateTriggerPromise;
                    },
                    setSelection(sel) {
                        editor.setSelection(sel);
                        return linkedEditingContribution.currentUpdateTriggerPromise;
                    },
                    trigger(source, handlerId, payload) {
                        if (handlerId === "type" /* Handler.Type */ || handlerId === "paste" /* Handler.Paste */) {
                            editor.trigger(source, handlerId, payload);
                        }
                        else if (handlerId === 'deleteLeft') {
                            editor.runCommand(CoreEditingCommands.DeleteLeft, payload);
                        }
                        else if (handlerId === 'deleteWordLeft') {
                            instantiationService.invokeFunction((accessor) => (new DeleteWordLeft()).runEditorCommand(accessor, editor, payload));
                        }
                        else if (handlerId === 'deleteAllLeft') {
                            instantiationService.invokeFunction((accessor) => (new DeleteAllLeftAction()).runEditorCommand(accessor, editor, payload));
                        }
                        else {
                            throw new Error(`Unknown handler ${handlerId}!`);
                        }
                        return linkedEditingContribution.currentSyncTriggerPromise;
                    },
                    undo() {
                        editor.runCommand(CoreEditingCommands.Undo, null);
                    },
                    redo() {
                        editor.runCommand(CoreEditingCommands.Redo, null);
                    }
                };
                await operations(testEditor);
                return new Promise((resolve) => {
                    setTimeout(() => {
                        if (typeof expectedEndText === 'string') {
                            assert.strictEqual(editor.getModel().getValue(), expectedEndText);
                        }
                        else {
                            assert.strictEqual(editor.getModel().getValue(), expectedEndText.join('\n'));
                        }
                        resolve();
                    }, timeout);
                });
            });
        });
    }
    const state = {
        text: '<ooo></ooo>'
    };
    /**
     * Simple insertion
     */
    testCase('Simple insert - initial', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<iooo></iooo>');
    testCase('Simple insert - middle', state, async (editor) => {
        const pos = new Position(1, 3);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<oioo></oioo>');
    testCase('Simple insert - end', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<oooi></oooi>');
    /**
     * Simple insertion - end
     */
    testCase('Simple insert end - initial', state, async (editor) => {
        const pos = new Position(1, 8);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<iooo></iooo>');
    testCase('Simple insert end - middle', state, async (editor) => {
        const pos = new Position(1, 9);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<oioo></oioo>');
    testCase('Simple insert end - end', state, async (editor) => {
        const pos = new Position(1, 11);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<oooi></oooi>');
    /**
     * Boundary insertion
     */
    testCase('Simple insert - out of boundary', state, async (editor) => {
        const pos = new Position(1, 1);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, 'i<ooo></ooo>');
    testCase('Simple insert - out of boundary 2', state, async (editor) => {
        const pos = new Position(1, 6);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<ooo>i</ooo>');
    testCase('Simple insert - out of boundary 3', state, async (editor) => {
        const pos = new Position(1, 7);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<ooo><i/ooo>');
    testCase('Simple insert - out of boundary 4', state, async (editor) => {
        const pos = new Position(1, 12);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<ooo></ooo>i');
    /**
     * Insert + Move
     */
    testCase('Continuous insert', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<iiooo></iiooo>');
    testCase('Insert - move - insert', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
        await editor.setPosition(new Position(1, 4));
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<ioioo></ioioo>');
    testCase('Insert - move - insert outside region', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
        await editor.setPosition(new Position(1, 7));
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<iooo>i</iooo>');
    /**
     * Selection insert
     */
    testCase('Selection insert - simple', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.setSelection(new Range(1, 2, 1, 3));
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<ioo></ioo>');
    testCase('Selection insert - whole', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.setSelection(new Range(1, 2, 1, 5));
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<i></i>');
    testCase('Selection insert - across boundary', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.setSelection(new Range(1, 1, 1, 3));
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, 'ioo></oo>');
    /**
     * @todo
     * Undefined behavior
     */
    // testCase('Selection insert - across two boundary', state, async (editor) => {
    // 	const pos = new Position(1, 2);
    // 	await editor.setPosition(pos);
    // 	await linkedEditingContribution.updateLinkedUI(pos);
    // 	await editor.setSelection(new Range(1, 4, 1, 9));
    // 	await editor.trigger('keyboard', Handler.Type, { text: 'i' });
    // }, '<ooioo>');
    /**
     * Break out behavior
     */
    testCase('Breakout - type space', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: ' ' });
    }, '<ooo ></ooo>');
    testCase('Breakout - type space then undo', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: ' ' });
        editor.undo();
    }, '<ooo></ooo>');
    testCase('Breakout - type space in middle', state, async (editor) => {
        const pos = new Position(1, 4);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: ' ' });
    }, '<oo o></ooo>');
    testCase('Breakout - paste content starting with space', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "paste" /* Handler.Paste */, { text: ' i="i"' });
    }, '<ooo i="i"></ooo>');
    testCase('Breakout - paste content starting with space then undo', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "paste" /* Handler.Paste */, { text: ' i="i"' });
        editor.undo();
    }, '<ooo></ooo>');
    testCase('Breakout - paste content starting with space in middle', state, async (editor) => {
        const pos = new Position(1, 4);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "paste" /* Handler.Paste */, { text: ' i' });
    }, '<oo io></ooo>');
    /**
     * Break out with custom provider wordPattern
     */
    const state3 = {
        ...state,
        responseWordPattern: /[a-yA-Y]+/
    };
    testCase('Breakout with stop pattern - insert', state3, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<iooo></iooo>');
    testCase('Breakout with stop pattern - insert stop char', state3, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'z' });
    }, '<zooo></ooo>');
    testCase('Breakout with stop pattern - paste char', state3, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "paste" /* Handler.Paste */, { text: 'z' });
    }, '<zooo></ooo>');
    testCase('Breakout with stop pattern - paste string', state3, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "paste" /* Handler.Paste */, { text: 'zo' });
    }, '<zoooo></ooo>');
    testCase('Breakout with stop pattern - insert at end', state3, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'z' });
    }, '<oooz></ooo>');
    const state4 = {
        ...state,
        responseWordPattern: /[a-eA-E]+/
    };
    testCase('Breakout with stop pattern - insert stop char, respos', state4, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, '<iooo></ooo>');
    /**
     * Delete
     */
    testCase('Delete - left char', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', 'deleteLeft', {});
    }, '<oo></oo>');
    testCase('Delete - left char then undo', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', 'deleteLeft', {});
        editor.undo();
    }, '<ooo></ooo>');
    testCase('Delete - left word', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', 'deleteWordLeft', {});
    }, '<></>');
    testCase('Delete - left word then undo', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', 'deleteWordLeft', {});
        editor.undo();
        editor.undo();
    }, '<ooo></ooo>');
    /**
     * Todo: Fix test
     */
    // testCase('Delete - left all', state, async (editor) => {
    // 	const pos = new Position(1, 3);
    // 	await editor.setPosition(pos);
    // 	await linkedEditingContribution.updateLinkedUI(pos);
    // 	await editor.trigger('keyboard', 'deleteAllLeft', {});
    // }, '></>');
    /**
     * Todo: Fix test
     */
    // testCase('Delete - left all then undo', state, async (editor) => {
    // 	const pos = new Position(1, 5);
    // 	await editor.setPosition(pos);
    // 	await linkedEditingContribution.updateLinkedUI(pos);
    // 	await editor.trigger('keyboard', 'deleteAllLeft', {});
    // 	editor.undo();
    // }, '></ooo>');
    testCase('Delete - left all then undo twice', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', 'deleteAllLeft', {});
        editor.undo();
        editor.undo();
    }, '<ooo></ooo>');
    testCase('Delete - selection', state, async (editor) => {
        const pos = new Position(1, 5);
        await editor.setPosition(pos);
        await editor.setSelection(new Range(1, 2, 1, 3));
        await editor.trigger('keyboard', 'deleteLeft', {});
    }, '<oo></oo>');
    testCase('Delete - selection across boundary', state, async (editor) => {
        const pos = new Position(1, 3);
        await editor.setPosition(pos);
        await editor.setSelection(new Range(1, 1, 1, 3));
        await editor.trigger('keyboard', 'deleteLeft', {});
    }, 'oo></oo>');
    /**
     * Undo / redo
     */
    testCase('Undo/redo - simple undo', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
        editor.undo();
        editor.undo();
    }, '<ooo></ooo>');
    testCase('Undo/redo - simple undo/redo', state, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
        editor.undo();
        editor.redo();
    }, '<iooo></iooo>');
    /**
     * Multi line
     */
    const state2 = {
        text: [
            '<ooo>',
            '</ooo>'
        ]
    };
    testCase('Multiline insert', state2, async (editor) => {
        const pos = new Position(1, 2);
        await editor.setPosition(pos);
        await editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'i' });
    }, [
        '<iooo>',
        '</iooo>'
    ]);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua2VkRWRpdGluZy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvbGlua2VkRWRpdGluZy90ZXN0L2Jyb3dzZXIvbGlua2VkRWRpdGluZy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzFFLE9BQU8sRUFBYSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMxRSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFOUUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFOUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDM0YsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDMUYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25GLE9BQU8sRUFBbUIsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNsSSxPQUFPLEVBQUUsb0JB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