/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { EditorSimpleWorker } from 'vs/editor/common/services/editorSimpleWorker';
import { createModelServices, createTextModel } from 'vs/editor/test/common/testTextModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { transaction } from 'vs/workbench/contrib/audioCues/browser/observable';
import { EditorWorkerServiceDiffComputer } from 'vs/workbench/contrib/mergeEditor/browser/model/diffComputer';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';

suite('merge editor model', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('prepend line', async () => {
		await testMergeModel(
			{
				"languageId": "plaintext",
				"base": "line1\nline2",
				"input1": "0\nline1\nline2",
				"input2": "0\nline1\nline2",
				"result": ""
			},
			model => {
				assert.deepStrictEqual(model.getProjections(), {
					base: '⟦⟧₀line1\nline2',
					input1: '⟦0\n⟧₀line1\nline2',
					input2: '⟦0\n⟧₀line1\nline2',
				});

				model.toggleConflict(0, 1);
				assert.deepStrictEqual(
					{ result: model.getResult() },
					{ result: '0\nline1\nline2' }
				);

				model.toggleConflict(0, 2);
				assert.deepStrictEqual(
					{ result: model.getResult() },
					({ result: "0\n0\nline1\nline2" })
				);
			}
		);
	});

	test('empty base', async () => {
		await testMergeModel(
			{
				"languageId": "plaintext",
				"base": "",
				"input1": "input1",
				"input2": "input2",
				"result": ""
			},
			model => {
				assert.deepStrictEqual(model.getProjections(), ({ base: "⟦⟧₀", input1: "⟦input1⟧₀", input2: "⟦input2⟧₀" }));

				model.toggleConflict(0, 1);
				assert.deepStrictEqual(
					{ result: model.getResult() },
					({ result: "input1" })
				);

				model.toggleConflict(0, 2);
				assert.deepStrictEqual(
					{ result: model.getResult() },
					({ result: "input2" })
				);
			}
		);
	});

	test('can merge word changes', async () => {
		await testMergeModel(
			{
				"languageId": "plaintext",
				"base": "hello",
				"input1": "hallo",
				"input2": "helloworld",
				"result": ""
			},
			model => {
				assert.deepStrictEqual(model.getProjections(), {
					base: '⟦hello⟧₀',
					input1: '⟦hallo⟧₀',
					input2: '⟦helloworld⟧₀',
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
				"languageId": "plaintext",
				"base": "Zürich\nBern\nBasel\nChur\nGenf\nThun",
				"input1": "Zürich\nBern\nChur\nDavos\nGenf\nThun\nfunction f(b:boolean) {}",
				"input2": "Zürich\nBern\nBasel (FCB)\nChur\nGenf\nThun\nfunction f(a:number) {}",
				"result": "Zürich\nBern\nBasel\nChur\nDavos\nGenf\nThun"
			},
			model => {
				assert.deepStrictEqual(model.getProjections(), {
					base: 'Zürich\nBern\n⟦Basel\n⟧₀Chur\n⟦⟧₁Genf\nThun⟦⟧₂',
					input1:
						'Zürich\nBern\n⟦⟧₀Chur\n⟦Davos\n⟧₁Genf\nThun\n⟦function f(b:boolean) {}⟧₂',
					input2:
						'Zürich\nBern\n⟦Basel (FCB)\n⟧₀Chur\n⟦⟧₁Genf\nThun\n⟦function f(a:number) {}⟧₂',
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
});

async function testMergeModel(
	options: MergeModelOptions,
	fn: (model: MergeModelInterface) => void
): Promise<void> {
	const disposables = new DisposableStore();
	const modelInterface = disposables.add(
		new MergeModelInterface(options, createModelServices(disposables))
	);
	await modelInterface.mergeModel.onInitialized;
	await fn(modelInterface);
	disposables.dispose();
}

interface MergeModelOptions {
	languageId: string;
	input1: string;
	input2: string;
	base: string;
	result: string;
}

function toSmallNumbersDec(value: number): string {
	const smallNumbers = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
	return value.toString().split('').map(c => smallNumbers[parseInt(c)]).join('');
}

class MergeModelInterface extends Disposable {
	public readonly mergeModel: MergeEditorModel;

	constructor(options: MergeModelOptions, instantiationService: IInstantiationService) {
		super();
		const input1TextModel = this._register(createTextModel(options.input1, options.languageId));
		const input2TextModel = this._register(createTextModel(options.input2, options.languageId));
		const baseTextModel = this._register(createTextModel(options.base, options.languageId));
		const resultTextModel = this._register(createTextModel(options.result, options.languageId));
		this.mergeModel = this._register(instantiationService.createInstance(MergeEditorModel,
			baseTextModel,
			input1TextModel,
			'',
			'',
			'',
			input2TextModel,
			'',
			'',
			'',
			resultTextModel,
			{
				async computeDiff(textModel1, textModel2) {
					const result = EditorSimpleWorker.computeDiff(textModel1, textModel2, false, 10000);
					if (!result) {
						return { diffs: null };
					}
					return {
						diffs: EditorWorkerServiceDiffComputer.fromDiffComputationResult(
							result,
							textModel1,
							textModel2
						),
					};
				},
			}
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
				range: r.baseRange.toRange(),
				label: toSmallNumbersDec(idx),
			}))
		);

		const input1TextModel = createTextModel(this.mergeModel.input1.getValue());
		applyRanges(
			input1TextModel,
			baseRanges.map<LabeledRange>((r, idx) => ({
				range: r.input1Range.toRange(),
				label: toSmallNumbersDec(idx),
			}))
		);

		const input2TextModel = createTextModel(this.mergeModel.input2.getValue());
		applyRanges(
			input2TextModel,
			baseRanges.map<LabeledRange>((r, idx) => ({
				range: r.input2Range.toRange(),
				label: toSmallNumbersDec(idx),
			}))
		);

		const result = {
			base: baseTextModel.getValue(),
			input1: input1TextModel.getValue(),
			input2: input2TextModel.getValue(),
		};
		baseTextModel.dispose();
		input1TextModel.dispose();
		input2TextModel.dispose();
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
		return this.mergeModel.result.getValue();
	}
}
