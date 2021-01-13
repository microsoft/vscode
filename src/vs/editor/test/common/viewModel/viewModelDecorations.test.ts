/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { InlineDecoration, InlineDecorationType } from 'vs/editor/common/viewModel/viewModel';
import { testViewModel } from 'vs/editor/test/common/viewModel/testViewModel';

suite('ViewModelDecorations', () => {
	test('getDecorationsViewportData', () => {
		const text = [
			'hello world, this is a buffer that will be wrapped'
		];
		const opts: IEditorOptions = {
			wordWrap: 'wordWrapColumn',
			wordWrapColumn: 13
		};
		testViewModel(text, opts, (viewModel, model) => {
			assert.strictEqual(viewModel.getLineContent(1), 'hello world, ');
			assert.strictEqual(viewModel.getLineContent(2), 'this is a ');
			assert.strictEqual(viewModel.getLineContent(3), 'buffer that ');
			assert.strictEqual(viewModel.getLineContent(4), 'will be ');
			assert.strictEqual(viewModel.getLineContent(5), 'wrapped');

			model.changeDecorations((accessor) => {
				let createOpts = (id: string) => {
					return {
						className: id,
						inlineClassName: 'i-' + id,
						beforeContentClassName: 'b-' + id,
						afterContentClassName: 'a-' + id
					};
				};

				// VIEWPORT will be (1,14) -> (1,36)

				// completely before viewport
				accessor.addDecoration(new Range(1, 2, 1, 3), createOpts('dec1'));
				// starts before viewport, ends at viewport start
				accessor.addDecoration(new Range(1, 2, 1, 14), createOpts('dec2'));
				// starts before viewport, ends inside viewport
				accessor.addDecoration(new Range(1, 2, 1, 15), createOpts('dec3'));
				// starts before viewport, ends at viewport end
				accessor.addDecoration(new Range(1, 2, 1, 36), createOpts('dec4'));
				// starts before viewport, ends after viewport
				accessor.addDecoration(new Range(1, 2, 1, 51), createOpts('dec5'));

				// starts at viewport start, ends at viewport start
				accessor.addDecoration(new Range(1, 14, 1, 14), createOpts('dec6'));
				// starts at viewport start, ends inside viewport
				accessor.addDecoration(new Range(1, 14, 1, 16), createOpts('dec7'));
				// starts at viewport start, ends at viewport end
				accessor.addDecoration(new Range(1, 14, 1, 36), createOpts('dec8'));
				// starts at viewport start, ends after viewport
				accessor.addDecoration(new Range(1, 14, 1, 51), createOpts('dec9'));

				// starts inside viewport, ends inside viewport
				accessor.addDecoration(new Range(1, 16, 1, 18), createOpts('dec10'));
				// starts inside viewport, ends at viewport end
				accessor.addDecoration(new Range(1, 16, 1, 36), createOpts('dec11'));
				// starts inside viewport, ends after viewport
				accessor.addDecoration(new Range(1, 16, 1, 51), createOpts('dec12'));

				// starts at viewport end, ends at viewport end
				accessor.addDecoration(new Range(1, 36, 1, 36), createOpts('dec13'));
				// starts at viewport end, ends after viewport
				accessor.addDecoration(new Range(1, 36, 1, 51), createOpts('dec14'));

				// starts after viewport, ends after viewport
				accessor.addDecoration(new Range(1, 40, 1, 51), createOpts('dec15'));
			});

			let actualDecorations = viewModel.getDecorationsInViewport(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3))
			).map((dec) => {
				return dec.options.className;
			}).filter(Boolean);

			assert.deepStrictEqual(actualDecorations, [
				'dec1',
				'dec2',
				'dec3',
				'dec4',
				'dec5',
				'dec6',
				'dec7',
				'dec8',
				'dec9',
				'dec10',
				'dec11',
				'dec12',
				'dec13',
				'dec14',
			]);

			let inlineDecorations1 = viewModel.getViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				2
			).inlineDecorations;

			// view line 2: (1,14 -> 1,24)
			assert.deepStrictEqual(inlineDecorations1, [
				new InlineDecoration(new Range(1, 2, 2, 2), 'i-dec3', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 2, 2, 2), 'a-dec3', InlineDecorationType.After),
				new InlineDecoration(new Range(1, 2, 3, 13), 'i-dec4', InlineDecorationType.Regular),
				new InlineDecoration(new Range(1, 2, 5, 8), 'i-dec5', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'i-dec6', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec6', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 1, 2, 1), 'a-dec6', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 1, 2, 3), 'i-dec7', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec7', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 3, 2, 3), 'a-dec7', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 1, 3, 13), 'i-dec8', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec8', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 1, 5, 8), 'i-dec9', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec9', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 3, 2, 5), 'i-dec10', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec10', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 5, 2, 5), 'a-dec10', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 3, 3, 13), 'i-dec11', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec11', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 3, 5, 8), 'i-dec12', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec12', InlineDecorationType.Before),
			]);

			let inlineDecorations2 = viewModel.getViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				3
			).inlineDecorations;

			// view line 3 (24 -> 36)
			assert.deepStrictEqual(inlineDecorations2, [
				new InlineDecoration(new Range(1, 2, 3, 13), 'i-dec4', InlineDecorationType.Regular),
				new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec4', InlineDecorationType.After),
				new InlineDecoration(new Range(1, 2, 5, 8), 'i-dec5', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 3, 13), 'i-dec8', InlineDecorationType.Regular),
				new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec8', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 1, 5, 8), 'i-dec9', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 3, 3, 13), 'i-dec11', InlineDecorationType.Regular),
				new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec11', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 3, 5, 8), 'i-dec12', InlineDecorationType.Regular),
			]);
		});
	});

	test('issue #17208: Problem scrolling in 1.8.0', () => {
		const text = [
			'hello world, this is a buffer that will be wrapped'
		];
		const opts: IEditorOptions = {
			wordWrap: 'wordWrapColumn',
			wordWrapColumn: 13
		};
		testViewModel(text, opts, (viewModel, model) => {
			assert.strictEqual(viewModel.getLineContent(1), 'hello world, ');
			assert.strictEqual(viewModel.getLineContent(2), 'this is a ');
			assert.strictEqual(viewModel.getLineContent(3), 'buffer that ');
			assert.strictEqual(viewModel.getLineContent(4), 'will be ');
			assert.strictEqual(viewModel.getLineContent(5), 'wrapped');

			model.changeDecorations((accessor) => {
				accessor.addDecoration(
					new Range(1, 50, 1, 51),
					{
						beforeContentClassName: 'dec1'
					}
				);
			});

			let decorations = viewModel.getDecorationsInViewport(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3))
			).filter(x => Boolean(x.options.beforeContentClassName));
			assert.deepStrictEqual(decorations, []);

			let inlineDecorations1 = viewModel.getViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				2
			).inlineDecorations;
			assert.deepStrictEqual(inlineDecorations1, []);

			let inlineDecorations2 = viewModel.getViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				3
			).inlineDecorations;
			assert.deepStrictEqual(inlineDecorations2, []);
		});
	});

	test('issue #37401: Allow both before and after decorations on empty line', () => {
		const text = [
			''
		];
		testViewModel(text, {}, (viewModel, model) => {

			model.changeDecorations((accessor) => {
				accessor.addDecoration(
					new Range(1, 1, 1, 1),
					{
						beforeContentClassName: 'before1',
						afterContentClassName: 'after1'
					}
				);
			});

			let inlineDecorations = viewModel.getViewLineRenderingData(
				new Range(1, 1, 1, 1),
				1
			).inlineDecorations;
			assert.deepStrictEqual(inlineDecorations, [
				new InlineDecoration(new Range(1, 1, 1, 1), 'before1', InlineDecorationType.Before),
				new InlineDecoration(new Range(1, 1, 1, 1), 'after1', InlineDecorationType.After)
			]);
		});
	});
});
