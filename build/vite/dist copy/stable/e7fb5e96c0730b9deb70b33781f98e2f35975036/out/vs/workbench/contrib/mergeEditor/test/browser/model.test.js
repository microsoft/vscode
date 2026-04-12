/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { transaction } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { createModelServices, createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { toLineRange, toRangeMapping } from '../../browser/model/diffComputer.js';
import { DetailedLineRangeMapping } from '../../browser/model/mapping.js';
import { MergeEditorModel } from '../../browser/model/mergeEditorModel.js';
import { MergeEditorTelemetry } from '../../browser/telemetry.js';
suite('merge editor model', () => {
    // todo: renable when failing case is found https://github.com/microsoft/vscode/pull/190444#issuecomment-1678151428
    // ensureNoDisposablesAreLeakedInTestSuite();
    test('prepend line', async () => {
        await testMergeModel({
            'languageId': 'plaintext',
            'base': 'line1\nline2',
            'input1': '0\nline1\nline2',
            'input2': '0\nline1\nline2',
            'result': ''
        }, model => {
            assert.deepStrictEqual(model.getProjections(), {
                base: ['⟦⟧₀line1', 'line2'],
                input1: ['⟦0', '⟧₀line1', 'line2'],
                input2: ['⟦0', '⟧₀line1', 'line2'],
                result: ['⟦⟧{unrecognized}₀'],
            });
            model.toggleConflict(0, 1);
            assert.deepStrictEqual({ result: model.getResult() }, { result: '0\nline1\nline2' });
            model.toggleConflict(0, 2);
            assert.deepStrictEqual({ result: model.getResult() }, ({ result: '0\n0\nline1\nline2' }));
        });
    });
    test('empty base', async () => {
        await testMergeModel({
            'languageId': 'plaintext',
            'base': '',
            'input1': 'input1',
            'input2': 'input2',
            'result': ''
        }, model => {
            assert.deepStrictEqual(model.getProjections(), {
                base: ['⟦⟧₀'],
                input1: ['⟦input1⟧₀'],
                input2: ['⟦input2⟧₀'],
                result: ['⟦⟧{base}₀'],
            });
            model.toggleConflict(0, 1);
            assert.deepStrictEqual({ result: model.getResult() }, ({ result: 'input1' }));
            model.toggleConflict(0, 2);
            assert.deepStrictEqual({ result: model.getResult() }, ({ result: 'input2' }));
        });
    });
    test('can merge word changes', async () => {
        await testMergeModel({
            'languageId': 'plaintext',
            'base': 'hello',
            'input1': 'hallo',
            'input2': 'helloworld',
            'result': ''
        }, model => {
            assert.deepStrictEqual(model.getProjections(), {
                base: ['⟦hello⟧₀'],
                input1: ['⟦hallo⟧₀'],
                input2: ['⟦helloworld⟧₀'],
                result: ['⟦⟧{unrecognized}₀'],
            });
            model.toggleConflict(0, 1);
            model.toggleConflict(0, 2);
            assert.deepStrictEqual({ result: model.getResult() }, { result: 'halloworld' });
        });
    });
    test('can combine insertions at end of document', async () => {
        await testMergeModel({
            'languageId': 'plaintext',
            'base': 'Zürich\nBern\nBasel\nChur\nGenf\nThun',
            'input1': 'Zürich\nBern\nChur\nDavos\nGenf\nThun\nfunction f(b:boolean) {}',
            'input2': 'Zürich\nBern\nBasel (FCB)\nChur\nGenf\nThun\nfunction f(a:number) {}',
            'result': 'Zürich\nBern\nBasel\nChur\nDavos\nGenf\nThun'
        }, model => {
            assert.deepStrictEqual(model.getProjections(), {
                base: ['Zürich', 'Bern', '⟦Basel', '⟧₀Chur', '⟦⟧₁Genf', 'Thun⟦⟧₂'],
                input1: [
                    'Zürich',
                    'Bern',
                    '⟦⟧₀Chur',
                    '⟦Davos',
                    '⟧₁Genf',
                    'Thun',
                    '⟦function f(b:boolean) {}⟧₂',
                ],
                input2: [
                    'Zürich',
                    'Bern',
                    '⟦Basel (FCB)',
                    '⟧₀Chur',
                    '⟦⟧₁Genf',
                    'Thun',
                    '⟦function f(a:number) {}⟧₂',
                ],
                result: [
                    'Zürich',
                    'Bern',
                    '⟦Basel',
                    '⟧{base}₀Chur',
                    '⟦Davos',
                    '⟧{1✓}₁Genf',
                    'Thun⟦⟧{base}₂',
                ],
            });
            model.toggleConflict(2, 1);
            model.toggleConflict(2, 2);
            assert.deepStrictEqual({ result: model.getResult() }, {
                result: 'Zürich\nBern\nBasel\nChur\nDavos\nGenf\nThun\nfunction f(b:boolean) {}\nfunction f(a:number) {}',
            });
        });
    });
    test('conflicts are reset', async () => {
        await testMergeModel({
            'languageId': 'typescript',
            'base': `import { h } from 'vs/base/browser/dom';\nimport { Disposable, IDisposable } from 'vs/base/common/lifecycle';\nimport { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\nimport { EditorOption } from 'vs/editor/common/config/editorOptions';\nimport { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';\nimport { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\n`,
            'input1': `import { h } from 'vs/base/browser/dom';\nimport { Disposable, IDisposable } from 'vs/base/common/lifecycle';\nimport { observableSignalFromEvent } from 'vs/base/common/observable';\nimport { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\nimport { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';\nimport { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\n`,
            'input2': `import { h } from 'vs/base/browser/dom';\nimport { Disposable, IDisposable } from 'vs/base/common/lifecycle';\nimport { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\nimport { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';\nimport { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\n`,
            'result': `import { h } from 'vs/base/browser/dom';\r\nimport { Disposable, IDisposable } from 'vs/base/common/lifecycle';\r\nimport { observableSignalFromEvent } from 'vs/base/common/observable';\r\nimport { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\r\n<<<<<<< Updated upstream\r\nimport { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';\r\n=======\r\nimport { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';\r\n>>>>>>> Stashed changes\r\nimport { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\r\n`
        }, model => {
            assert.deepStrictEqual(model.getProjections(), {
                base: [
                    `import { h } from 'vs/base/browser/dom';`,
                    `import { Disposable, IDisposable } from 'vs/base/common/lifecycle';`,
                    `⟦⟧₀import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';`,
                    `⟦import { EditorOption } from 'vs/editor/common/config/editorOptions';`,
                    `import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';`,
                    `⟧₁import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';`,
                    '',
                ],
                input1: [
                    `import { h } from 'vs/base/browser/dom';`,
                    `import { Disposable, IDisposable } from 'vs/base/common/lifecycle';`,
                    `⟦import { observableSignalFromEvent } from 'vs/base/common/observable';`,
                    `⟧₀import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';`,
                    `⟦import { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';`,
                    `⟧₁import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';`,
                    '',
                ],
                input2: [
                    `import { h } from 'vs/base/browser/dom';`,
                    `import { Disposable, IDisposable } from 'vs/base/common/lifecycle';`,
                    `⟦⟧₀import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';`,
                    `⟦import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';`,
                    `⟧₁import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';`,
                    '',
                ],
                result: [
                    `import { h } from 'vs/base/browser/dom';`,
                    `import { Disposable, IDisposable } from 'vs/base/common/lifecycle';`,
                    `⟦import { observableSignalFromEvent } from 'vs/base/common/observable';`,
                    `⟧{1✓}₀import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';`,
                    '⟦<<<<<<< Updated upstream',
                    `import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';`,
                    '=======',
                    `import { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';`,
                    '>>>>>>> Stashed changes',
                    `⟧{unrecognized}₁import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';`,
                    '',
                ],
            });
        });
    });
    test('auto-solve equal edits', async () => {
        await testMergeModel({
            'languageId': 'javascript',
            'base': `const { readFileSync } = require('fs');\n\nlet paths = process.argv.slice(2);\nmain(paths);\n\nfunction main(paths) {\n    // print the welcome message\n    printMessage();\n\n    let data = getLineCountInfo(paths);\n    console.log("Lines: " + data.totalLineCount);\n}\n\n/**\n * Prints the welcome message\n*/\nfunction printMessage() {\n    console.log("Welcome To Line Counter");\n}\n\n/**\n * @param {string[]} paths\n*/\nfunction getLineCountInfo(paths) {\n    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));\n    return {\n        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),\n        lineCounts,\n    };\n}\n\n/**\n * @param {string} str\n */\nfunction getLinesLength(str) {\n    return str.split('\\n').length;\n}\n`,
            'input1': `const { readFileSync } = require('fs');\n\nlet paths = process.argv.slice(2);\nmain(paths);\n\nfunction main(paths) {\n    // print the welcome message\n    printMessage();\n\n    const data = getLineCountInfo(paths);\n    console.log("Lines: " + data.totalLineCount);\n}\n\nfunction printMessage() {\n    console.log("Welcome To Line Counter");\n}\n\n/**\n * @param {string[]} paths\n*/\nfunction getLineCountInfo(paths) {\n    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));\n    return {\n        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),\n        lineCounts,\n    };\n}\n\n/**\n * @param {string} str\n */\nfunction getLinesLength(str) {\n    return str.split('\\n').length;\n}\n`,
            'input2': `const { readFileSync } = require('fs');\n\nlet paths = process.argv.slice(2);\nrun(paths);\n\nfunction run(paths) {\n    // print the welcome message\n    printMessage();\n\n    const data = getLineCountInfo(paths);\n    console.log("Lines: " + data.totalLineCount);\n}\n\nfunction printMessage() {\n    console.log("Welcome To Line Counter");\n}\n\n/**\n * @param {string[]} paths\n*/\nfunction getLineCountInfo(paths) {\n    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));\n    return {\n        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),\n        lineCounts,\n    };\n}\n\n/**\n * @param {string} str\n */\nfunction getLinesLength(str) {\n    return str.split('\\n').length;\n}\n`,
            'result': '<<<<<<< uiae\n>>>>>>> Stashed changes',
            resetResult: true,
        }, async (model) => {
            await model.mergeModel.reset();
            assert.deepStrictEqual(model.getResult(), `const { readFileSync } = require('fs');\n\nlet paths = process.argv.slice(2);\nrun(paths);\n\nfunction run(paths) {\n    // print the welcome message\n    printMessage();\n\n    const data = getLineCountInfo(paths);\n    console.log("Lines: " + data.totalLineCount);\n}\n\nfunction printMessage() {\n    console.log("Welcome To Line Counter");\n}\n\n/**\n * @param {string[]} paths\n*/\nfunction getLineCountInfo(paths) {\n    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));\n    return {\n        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),\n        lineCounts,\n    };\n}\n\n/**\n * @param {string} str\n */\nfunction getLinesLength(str) {\n    return str.split('\\n').length;\n}\n`);
        });
    });
});
async function testMergeModel(options, fn) {
    const disposables = new DisposableStore();
    const modelInterface = disposables.add(new MergeModelInterface(options, createModelServices(disposables)));
    await modelInterface.mergeModel.onInitialized;
    await fn(modelInterface);
    disposables.dispose();
}
function toSmallNumbersDec(value) {
    const smallNumbers = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    return value.toString().split('').map(c => smallNumbers[parseInt(c)]).join('');
}
class MergeModelInterface extends Disposable {
    constructor(options, instantiationService) {
        super();
        const input1TextModel = this._register(createTextModel(options.input1, options.languageId));
        const input2TextModel = this._register(createTextModel(options.input2, options.languageId));
        const baseTextModel = this._register(createTextModel(options.base, options.languageId));
        const resultTextModel = this._register(createTextModel(options.result, options.languageId));
        const diffComputer = {
            async computeDiff(textModel1, textModel2, reader) {
                const result = await linesDiffComputers.getLegacy().computeDiff(textModel1.getLinesContent(), textModel2.getLinesContent(), { ignoreTrimWhitespace: false, maxComputationTimeMs: 10000, computeMoves: false });
                const changes = result.changes.map(c => new DetailedLineRangeMapping(toLineRange(c.original), textModel1, toLineRange(c.modified), textModel2, c.innerChanges?.map(ic => toRangeMapping(ic)).filter(isDefined)));
                return {
                    diffs: changes
                };
            }
        };
        this.mergeModel = this._register(instantiationService.createInstance(MergeEditorModel, baseTextModel, {
            textModel: input1TextModel,
            description: '',
            detail: '',
            title: '',
        }, {
            textModel: input2TextModel,
            description: '',
            detail: '',
            title: '',
        }, resultTextModel, diffComputer, {
            resetResult: options.resetResult || false
        }, new MergeEditorTelemetry(NullTelemetryService)));
    }
    getProjections() {
        function applyRanges(textModel, ranges) {
            textModel.applyEdits(ranges.map(({ range, label }) => ({
                range: range,
                text: `⟦${textModel.getValueInRange(range)}⟧${label}`,
            })));
        }
        const baseRanges = this.mergeModel.modifiedBaseRanges.get();
        const baseTextModel = createTextModel(this.mergeModel.base.getValue());
        applyRanges(baseTextModel, baseRanges.map((r, idx) => ({
            range: r.baseRange.toExclusiveRange(),
            label: toSmallNumbersDec(idx),
        })));
        const input1TextModel = createTextModel(this.mergeModel.input1.textModel.getValue());
        applyRanges(input1TextModel, baseRanges.map((r, idx) => ({
            range: r.input1Range.toExclusiveRange(),
            label: toSmallNumbersDec(idx),
        })));
        const input2TextModel = createTextModel(this.mergeModel.input2.textModel.getValue());
        applyRanges(input2TextModel, baseRanges.map((r, idx) => ({
            range: r.input2Range.toExclusiveRange(),
            label: toSmallNumbersDec(idx),
        })));
        const resultTextModel = createTextModel(this.mergeModel.resultTextModel.getValue());
        applyRanges(resultTextModel, baseRanges.map((r, idx) => ({
            range: this.mergeModel.getLineRangeInResult(r.baseRange).toExclusiveRange(),
            label: `{${this.mergeModel.getState(r).get()}}${toSmallNumbersDec(idx)}`,
        })));
        const result = {
            base: baseTextModel.getValue(1 /* EndOfLinePreference.LF */).split('\n'),
            input1: input1TextModel.getValue(1 /* EndOfLinePreference.LF */).split('\n'),
            input2: input2TextModel.getValue(1 /* EndOfLinePreference.LF */).split('\n'),
            result: resultTextModel.getValue(1 /* EndOfLinePreference.LF */).split('\n'),
        };
        baseTextModel.dispose();
        input1TextModel.dispose();
        input2TextModel.dispose();
        resultTextModel.dispose();
        return result;
    }
    toggleConflict(conflictIdx, inputNumber) {
        const baseRange = this.mergeModel.modifiedBaseRanges.get()[conflictIdx];
        if (!baseRange) {
            throw new Error();
        }
        const state = this.mergeModel.getState(baseRange).get();
        transaction(tx => {
            this.mergeModel.setState(baseRange, state.toggle(inputNumber), true, tx);
        });
    }
    getResult() {
        return this.mergeModel.resultTextModel.getValue();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL3Rlc3QvYnJvd3Nlci9tb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBVyxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFaEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFN0YsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRTFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2xHLE9BQU8sRUFBZ0QsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hJLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRWxFLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFDaEMsbUhBQW1IO0lBQ25ILDZDQUE2QztJQUU3QyxJQUFJLENBQUMsY0FBYyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQy9CLE1BQU0sY0FBYyxDQUNuQjtZQUNDLFlBQVksRUFBRSxXQUFXO1lBQ3pCLE1BQU0sRUFBRSxjQUFjO1lBQ3RCLFFBQVEsRUFBRSxpQkFBaUI7WUFD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