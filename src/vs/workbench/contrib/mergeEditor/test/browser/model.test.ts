/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IReader, transaction, waitForState } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { EndOfLinePreference, ITextModel } from '../../../../../editor/common/model.js';
import { createModelServices, createTextModel, instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IMergeDiffComputer, IMergeDiffComputerResult, toLineRange, toRangeMapping } from '../../browser/model/diffComputer.js';
import { DetailedLineRangeMapping } from '../../browser/model/mapping.js';
import { MergeEditorModel } from '../../browser/model/mergeEditorModel.js';
import { MergeEditorTelemetry } from '../../browser/telemetry.js';
import { ActionsSource } from '../../browser/view/conflictActions.js';
import { MergeEditorViewModel } from '../../browser/view/viewModel.js';

suite('merge editor model', () => {
	// todo: renable when failing case is found https://github.com/microsoft/vscode/pull/190444#issuecomment-1678151428
	// ensureNoDisposablesAreLeakedInTestSuite();

	suite('conflict action undo', () => {
		ensureNoDisposablesAreLeakedInTestSuite();

		for (const diffAlgorithm of ['legacy', 'advanced'] as const) {
			for (const pushUndoStop of [false, true]) {
				test(`reset to base preserves the preceding manual resolution (${diffAlgorithm}, undo stop: ${pushUndoStop})`, async () => {
					await testMergeModel({
						languageId: 'plaintext',
						base: 'start\nbase\nend',
						input1: 'start\nleft\nend',
						input2: 'start\nright\nend',
						result: 'start\nbase\nend',
						diffAlgorithm,
					}, async model => {
						model.toggleConflict(0, 1);
						const mergeModel = model.mergeModel;
						const result = mergeModel.resultTextModel;
						const states = [result.getValue()];
						result.pushEditOperations(null, [{ range: new Range(2, 1, 2, 5), text: 'manual' }], () => null);
						await waitForState(mergeModel.isUpToDate, isUpToDate => isUpToDate);
						states.push(result.getValue());
						if (pushUndoStop) {
							result.pushStackElement();
						}

						const actions = new ActionsSource(new class extends mock<MergeEditorViewModel>() {
							override readonly model = mergeModel;
						}, mergeModel.modifiedBaseRanges.get()[0]);
						const reset = actions.resultItems.get().find(action => action.text === 'Reset to base');
						assert.ok(reset?.action);
						await reset.action();
						states.push(result.getValue());

						for (const operation of ['undo', 'undo', 'redo', 'redo'] as const) {
							await result[operation]();
							await waitForState(mergeModel.isUpToDate, isUpToDate => isUpToDate);
							states.push(result.getValue());
						}

						assert.deepStrictEqual(states, [
							'start\nleft\nend',
							'start\nmanual\nend',
							'start\nbase\nend',
							'start\nmanual\nend',
							'start\nleft\nend',
							'start\nmanual\nend',
							'start\nbase\nend',
						]);
					});
				});
			}

			test(`removing inputs from two conflicts is independently undoable (${diffAlgorithm})`, async () => {
				await testMergeModel({
					languageId: 'plaintext',
					base: 'start\nbase1\nmiddle1\nmiddle2\nmiddle3\nbase2\nend',
					input1: 'start\nleft1\nmiddle1\nmiddle2\nmiddle3\nleft2\nend',
					input2: 'start\nright1\nmiddle1\nmiddle2\nmiddle3\nright2\nend',
					result: 'start\nbase1\nmiddle1\nmiddle2\nmiddle3\nbase2\nend',
					diffAlgorithm,
				}, async model => {
					model.toggleConflict(0, 1);
					model.toggleConflict(1, 2);
					const mergeModel = model.mergeModel;
					const result = mergeModel.resultTextModel;
					const states = [result.getValue()];
					for (const range of mergeModel.modifiedBaseRanges.get()) {
						const actions = new ActionsSource(new class extends mock<MergeEditorViewModel>() {
							override readonly model = mergeModel;
						}, range);
						const remove = actions.resultItems.get().find(action => action.action);
						assert.ok(remove?.action);
						await remove.action();
						states.push(result.getValue());
					}
					for (const operation of ['undo', 'undo', 'redo', 'redo'] as const) {
						await result[operation]();
						await waitForState(mergeModel.isUpToDate, isUpToDate => isUpToDate);
						states.push(result.getValue());
					}

					assert.deepStrictEqual(states, [
						'start\nleft1\nmiddle1\nmiddle2\nmiddle3\nright2\nend',
						'start\nbase1\nmiddle1\nmiddle2\nmiddle3\nright2\nend',
						'start\nbase1\nmiddle1\nmiddle2\nmiddle3\nbase2\nend',
						'start\nbase1\nmiddle1\nmiddle2\nmiddle3\nright2\nend',
						'start\nleft1\nmiddle1\nmiddle2\nmiddle3\nright2\nend',
						'start\nbase1\nmiddle1\nmiddle2\nmiddle3\nright2\nend',
						'start\nbase1\nmiddle1\nmiddle2\nmiddle3\nbase2\nend',
					]);
				});
			});

			test(`accepting either input restores the handled state on undo and redo (${diffAlgorithm})`, async () => {
				await testMergeModel({
					languageId: 'plaintext',
					base: 'start\nbase\nend',
					input1: 'start\nleft\nend',
					input2: 'start\nright\nend',
					result: 'start\nbase\nend',
					diffAlgorithm,
				}, async model => {
					const mergeModel = model.mergeModel;
					const result = mergeModel.resultTextModel;
					const range = mergeModel.modifiedBaseRanges.get()[0];
					const states: { value: string; handled: boolean }[] = [];
					for (const inputNumber of [1, 2] as const) {
						model.toggleConflict(0, inputNumber);
						states.push({ value: result.getValue(), handled: mergeModel.isHandled(range).get() });
						for (const operation of ['undo', 'redo', 'undo'] as const) {
							await result[operation]();
							await waitForState(mergeModel.isUpToDate, isUpToDate => isUpToDate);
							states.push({ value: result.getValue(), handled: mergeModel.isHandled(range).get() });
						}
					}

					assert.deepStrictEqual(states, [
						{ value: 'start\nleft\nend', handled: true },
						{ value: 'start\nbase\nend', handled: false },
						{ value: 'start\nleft\nend', handled: true },
						{ value: 'start\nbase\nend', handled: false },
						{ value: 'start\nright\nend', handled: true },
						{ value: 'start\nbase\nend', handled: false },
						{ value: 'start\nright\nend', handled: true },
						{ value: 'start\nbase\nend', handled: false },
					]);
				});
			});
		}
	});

	test('prepend line', async () => {
		await testMergeModel(
			{
				'languageId': 'plaintext',
				'base': 'line1\nline2',
				'input1': '0\nline1\nline2',
				'input2': '0\nline1\nline2',
				'result': ''
			},
			model => {
				assert.deepStrictEqual(model.getProjections(), {
					base: ['⟦⟧₀line1', 'line2'],
					input1: ['⟦0', '⟧₀line1', 'line2'],
					input2: ['⟦0', '⟧₀line1', 'line2'],
					result: ['⟦⟧{unrecognized}₀'],
				});

				model.toggleConflict(0, 1);
				assert.deepStrictEqual(
					{ result: model.getResult() },
					{ result: '0\nline1\nline2' }
				);

				model.toggleConflict(0, 2);
				assert.deepStrictEqual(
					{ result: model.getResult() },
					({ result: '0\n0\nline1\nline2' })
				);
			}
		);
	});

	test('empty base', async () => {
		await testMergeModel(
			{
				'languageId': 'plaintext',
				'base': '',
				'input1': 'input1',
				'input2': 'input2',
				'result': ''
			},
			model => {
				assert.deepStrictEqual(model.getProjections(), {
					base: ['⟦⟧₀'],
					input1: ['⟦input1⟧₀'],
					input2: ['⟦input2⟧₀'],
					result: ['⟦⟧{base}₀'],
				});

				model.toggleConflict(0, 1);
				assert.deepStrictEqual(
					{ result: model.getResult() },
					({ result: 'input1' })
				);

				model.toggleConflict(0, 2);
				assert.deepStrictEqual(
					{ result: model.getResult() },
					({ result: 'input2' })
				);
			}
		);
	});

	test('can merge word changes', async () => {
		await testMergeModel(
			{
				'languageId': 'plaintext',
				'base': 'hello',
				'input1': 'hallo',
				'input2': 'helloworld',
				'result': ''
			},
			model => {
				assert.deepStrictEqual(model.getProjections(), {
					base: ['⟦hello⟧₀'],
					input1: ['⟦hallo⟧₀'],
					input2: ['⟦helloworld⟧₀'],
					result: ['⟦⟧{unrecognized}₀'],
				});

				model.toggleConflict(0, 1);
				model.toggleConflict(0, 2);

				assert.deepStrictEqual(
					{ result: model.getResult() },
					{ result: 'halloworld' }
				);
			}
		);

	});

	test('can combine insertions at end of document', async () => {
		await testMergeModel(
			{
				'languageId': 'plaintext',
				'base': 'Zürich\nBern\nBasel\nChur\nGenf\nThun',
				'input1': 'Zürich\nBern\nChur\nDavos\nGenf\nThun\nfunction f(b:boolean) {}',
				'input2': 'Zürich\nBern\nBasel (FCB)\nChur\nGenf\nThun\nfunction f(a:number) {}',
				'result': 'Zürich\nBern\nBasel\nChur\nDavos\nGenf\nThun'
			},
			model => {
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

				assert.deepStrictEqual(
					{ result: model.getResult() },
					{
						result:
							'Zürich\nBern\nBasel\nChur\nDavos\nGenf\nThun\nfunction f(b:boolean) {}\nfunction f(a:number) {}',
					}
				);
			}
		);
	});

	test('conflicts are reset', async () => {
		await testMergeModel(
			{
				'languageId': 'typescript',
				'base': `import { h } from 'vs/base/browser/dom';\nimport { Disposable, IDisposable } from 'vs/base/common/lifecycle';\nimport { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\nimport { EditorOption } from 'vs/editor/common/config/editorOptions';\nimport { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';\nimport { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\n`,
				'input1': `import { h } from 'vs/base/browser/dom';\nimport { Disposable, IDisposable } from 'vs/base/common/lifecycle';\nimport { observableSignalFromEvent } from 'vs/base/common/observable';\nimport { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\nimport { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';\nimport { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\n`,
				'input2': `import { h } from 'vs/base/browser/dom';\nimport { Disposable, IDisposable } from 'vs/base/common/lifecycle';\nimport { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\nimport { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';\nimport { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\n`,
				'result': `import { h } from 'vs/base/browser/dom';\r\nimport { Disposable, IDisposable } from 'vs/base/common/lifecycle';\r\nimport { observableSignalFromEvent } from 'vs/base/common/observable';\r\nimport { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\r\n<<<<<<< Updated upstream\r\nimport { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';\r\n=======\r\nimport { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';\r\n>>>>>>> Stashed changes\r\nimport { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\r\n`
			},
			model => {
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
			}
		);
	});

	test('auto-solve equal edits', async () => {
		await testMergeModel(
			{
				'languageId': 'javascript',
				'base': `const { readFileSync } = require('fs');\n\nlet paths = process.argv.slice(2);\nmain(paths);\n\nfunction main(paths) {\n    // print the welcome message\n    printMessage();\n\n    let data = getLineCountInfo(paths);\n    console.log("Lines: " + data.totalLineCount);\n}\n\n/**\n * Prints the welcome message\n*/\nfunction printMessage() {\n    console.log("Welcome To Line Counter");\n}\n\n/**\n * @param {string[]} paths\n*/\nfunction getLineCountInfo(paths) {\n    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));\n    return {\n        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),\n        lineCounts,\n    };\n}\n\n/**\n * @param {string} str\n */\nfunction getLinesLength(str) {\n    return str.split('\\n').length;\n}\n`,
				'input1': `const { readFileSync } = require('fs');\n\nlet paths = process.argv.slice(2);\nmain(paths);\n\nfunction main(paths) {\n    // print the welcome message\n    printMessage();\n\n    const data = getLineCountInfo(paths);\n    console.log("Lines: " + data.totalLineCount);\n}\n\nfunction printMessage() {\n    console.log("Welcome To Line Counter");\n}\n\n/**\n * @param {string[]} paths\n*/\nfunction getLineCountInfo(paths) {\n    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));\n    return {\n        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),\n        lineCounts,\n    };\n}\n\n/**\n * @param {string} str\n */\nfunction getLinesLength(str) {\n    return str.split('\\n').length;\n}\n`,
				'input2': `const { readFileSync } = require('fs');\n\nlet paths = process.argv.slice(2);\nrun(paths);\n\nfunction run(paths) {\n    // print the welcome message\n    printMessage();\n\n    const data = getLineCountInfo(paths);\n    console.log("Lines: " + data.totalLineCount);\n}\n\nfunction printMessage() {\n    console.log("Welcome To Line Counter");\n}\n\n/**\n * @param {string[]} paths\n*/\nfunction getLineCountInfo(paths) {\n    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));\n    return {\n        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),\n        lineCounts,\n    };\n}\n\n/**\n * @param {string} str\n */\nfunction getLinesLength(str) {\n    return str.split('\\n').length;\n}\n`,
				'result': '<<<<<<< uiae\n>>>>>>> Stashed changes',
				resetResult: true,
			},
			async model => {
				await model.mergeModel.reset();

				assert.deepStrictEqual(model.getResult(), `const { readFileSync } = require('fs');\n\nlet paths = process.argv.slice(2);\nrun(paths);\n\nfunction run(paths) {\n    // print the welcome message\n    printMessage();\n\n    const data = getLineCountInfo(paths);\n    console.log("Lines: " + data.totalLineCount);\n}\n\nfunction printMessage() {\n    console.log("Welcome To Line Counter");\n}\n\n/**\n * @param {string[]} paths\n*/\nfunction getLineCountInfo(paths) {\n    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));\n    return {\n        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),\n        lineCounts,\n    };\n}\n\n/**\n * @param {string} str\n */\nfunction getLinesLength(str) {\n    return str.split('\\n').length;\n}\n`);
			}
		);
	});
});

async function testMergeModel(
	options: MergeModelOptions,
	fn: (model: MergeModelInterface) => void
): Promise<void> {
	const disposables = new DisposableStore();
	const modelInterface = disposables.add(
		new MergeModelInterface(options, createModelServices(disposables))
	);
	try {
		await modelInterface.mergeModel.onInitialized;
		await fn(modelInterface);
	} finally {
		disposables.dispose();
	}
}

interface MergeModelOptions {
	languageId: string;
	input1: string;
	input2: string;
	base: string;
	result: string;
	resetResult?: boolean;
	diffAlgorithm?: 'legacy' | 'advanced';
}

function toSmallNumbersDec(value: number): string {
	const smallNumbers = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
	return value.toString().split('').map(c => smallNumbers[parseInt(c)]).join('');
}

class MergeModelInterface extends Disposable {
	public readonly mergeModel: MergeEditorModel;

	constructor(options: MergeModelOptions, instantiationService: IInstantiationService) {
		super();
		const input1TextModel = this._register(instantiateTextModel(instantiationService, options.input1, options.languageId));
		const input2TextModel = this._register(instantiateTextModel(instantiationService, options.input2, options.languageId));
		const baseTextModel = this._register(instantiateTextModel(instantiationService, options.base, options.languageId));
		const resultTextModel = this._register(instantiateTextModel(instantiationService, options.result, options.languageId));

		const diffComputer: IMergeDiffComputer = {
			async computeDiff(textModel1: ITextModel, textModel2: ITextModel, reader: IReader): Promise<IMergeDiffComputerResult> {
				const result = await (options.diffAlgorithm === 'advanced' ? linesDiffComputers.getDefault() : linesDiffComputers.getLegacy()).computeDiff(
					textModel1.getLinesContent(),
					textModel2.getLinesContent(),
					{ ignoreTrimWhitespace: false, maxComputationTimeMs: 10000, computeMoves: false }
				);
				const changes = result.changes.map(c =>
					new DetailedLineRangeMapping(
						toLineRange(c.original),
						textModel1,
						toLineRange(c.modified),
						textModel2,
						c.innerChanges?.map(ic => toRangeMapping(ic)).filter(isDefined)
					)
				);
				return {
					diffs: changes
				};
			}
		};

		this.mergeModel = this._register(instantiationService.createInstance(MergeEditorModel,
			baseTextModel,
			{
				textModel: input1TextModel,
				description: '',
				detail: '',
				title: '',
			},
			{
				textModel: input2TextModel,
				description: '',
				detail: '',
				title: '',
			},
			resultTextModel,
			diffComputer,
			{
				resetResult: options.resetResult || false
			},
			new MergeEditorTelemetry(NullTelemetryService),
		));
	}

	getProjections(): unknown {
		interface LabeledRange {
			range: Range;
			label: string;
		}
		function applyRanges(textModel: ITextModel, ranges: LabeledRange[]): void {
			textModel.applyEdits(ranges.map(({ range, label }) => ({
				range: range,
				text: `⟦${textModel.getValueInRange(range)}⟧${label}`,
			})));
		}
		const baseRanges = this.mergeModel.modifiedBaseRanges.get();

		const baseTextModel = createTextModel(this.mergeModel.base.getValue());
		applyRanges(
			baseTextModel,
			baseRanges.map<LabeledRange>((r, idx) => ({
				range: r.baseRange.toExclusiveRange(),
				label: toSmallNumbersDec(idx),
			}))
		);

		const input1TextModel = createTextModel(this.mergeModel.input1.textModel.getValue());
		applyRanges(
			input1TextModel,
			baseRanges.map<LabeledRange>((r, idx) => ({
				range: r.input1Range.toExclusiveRange(),
				label: toSmallNumbersDec(idx),
			}))
		);

		const input2TextModel = createTextModel(this.mergeModel.input2.textModel.getValue());
		applyRanges(
			input2TextModel,
			baseRanges.map<LabeledRange>((r, idx) => ({
				range: r.input2Range.toExclusiveRange(),
				label: toSmallNumbersDec(idx),
			}))
		);

		const resultTextModel = createTextModel(this.mergeModel.resultTextModel.getValue());
		applyRanges(
			resultTextModel,
			baseRanges.map<LabeledRange>((r, idx) => ({
				range: this.mergeModel.getLineRangeInResult(r.baseRange).toExclusiveRange(),
				label: `{${this.mergeModel.getState(r).get()}}${toSmallNumbersDec(idx)}`,
			}))
		);

		const result = {
			base: baseTextModel.getValue(EndOfLinePreference.LF).split('\n'),
			input1: input1TextModel.getValue(EndOfLinePreference.LF).split('\n'),
			input2: input2TextModel.getValue(EndOfLinePreference.LF).split('\n'),
			result: resultTextModel.getValue(EndOfLinePreference.LF).split('\n'),
		};
		baseTextModel.dispose();
		input1TextModel.dispose();
		input2TextModel.dispose();
		resultTextModel.dispose();
		return result;
	}

	toggleConflict(conflictIdx: number, inputNumber: 1 | 2): void {
		const baseRange = this.mergeModel.modifiedBaseRanges.get()[conflictIdx];
		if (!baseRange) {
			throw new Error();
		}
		const state = this.mergeModel.getState(baseRange).get();
		transaction(tx => {
			this.mergeModel.setState(baseRange, state.toggle(inputNumber), true, tx);
		});
	}

	getResult(): string {
		return this.mergeModel.resultTextModel.getValue();
	}
}
