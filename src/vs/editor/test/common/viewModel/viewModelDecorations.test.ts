/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Model } from 'vs/editor/common/model/model';
import { Range } from 'vs/editor/common/core/range';
import { CharacterHardWrappingLineMapperFactory } from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import { MockConfiguration } from 'vs/editor/test/common/mocks/mockConfiguration';
import { SplitLinesCollection } from 'vs/editor/common/viewModel/splitLinesCollection';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';

suite('ViewModelDecorations', () => {

	interface ITestViewModelOpts {
		wrappingColumn: number;
		text: string;
	}

	function withTestViewModel(opts: ITestViewModelOpts, callback: (viewModel: ViewModel, model: Model) => void): void {
		const EDITOR_ID = 1;

		let configuration = new MockConfiguration({
			wrappingColumn: opts.wrappingColumn
		});

		let model = Model.createFromString(opts.text);

		let factory = new CharacterHardWrappingLineMapperFactory(
			configuration.editor.wrappingInfo.wordWrapBreakBeforeCharacters,
			configuration.editor.wrappingInfo.wordWrapBreakAfterCharacters,
			configuration.editor.wrappingInfo.wordWrapBreakObtrusiveCharacters
		);

		let linesCollection = new SplitLinesCollection(
			model,
			factory,
			model.getOptions().tabSize,
			configuration.editor.wrappingInfo.wrappingColumn,
			configuration.editor.fontInfo.typicalFullwidthCharacterWidth / configuration.editor.fontInfo.typicalHalfwidthCharacterWidth,
			configuration.editor.wrappingInfo.wrappingIndent
		);

		let viewModel = new ViewModel(
			linesCollection,
			EDITOR_ID,
			configuration,
			model
		);

		callback(viewModel, model);

		viewModel.dispose();
		model.dispose();
		configuration.dispose();
	}

	test('getDecorationsViewportData', () => {
		withTestViewModel({
			text: 'hello world, this is a buffer that will be wrapped',
			wrappingColumn: 13
		}, (viewModel, model) => {
			assert.equal(viewModel.getLineContent(1), 'hello world, ');
			assert.equal(viewModel.getLineContent(2), 'this is a ');
			assert.equal(viewModel.getLineContent(3), 'buffer that ');
			assert.equal(viewModel.getLineContent(4), 'will be ');
			assert.equal(viewModel.getLineContent(5), 'wrapped');

			let dec1: string;
			let dec2: string;
			let dec3: string;
			let dec4: string;
			let dec5: string;
			let dec6: string;
			let dec7: string;
			let dec8: string;
			let dec9: string;
			let dec10: string;
			let dec11: string;
			let dec12: string;
			let dec13: string;
			let dec14: string;
			let dec15: string;
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
				dec1 = accessor.addDecoration(new Range(1, 2, 1, 3), createOpts('dec1'));
				// starts before viewport, ends at viewport start
				dec2 = accessor.addDecoration(new Range(1, 2, 1, 14), createOpts('dec2'));
				// starts before viewport, ends inside viewport
				dec3 = accessor.addDecoration(new Range(1, 2, 1, 15), createOpts('dec3'));
				// starts before viewport, ends at viewport end
				dec4 = accessor.addDecoration(new Range(1, 2, 1, 36), createOpts('dec4'));
				// starts before viewport, ends after viewport
				dec5 = accessor.addDecoration(new Range(1, 2, 1, 51), createOpts('dec5'));

				// starts at viewport start, ends at viewport start
				dec6 = accessor.addDecoration(new Range(1, 14, 1, 14), createOpts('dec6'));
				// starts at viewport start, ends inside viewport
				dec7 = accessor.addDecoration(new Range(1, 14, 1, 16), createOpts('dec7'));
				// starts at viewport start, ends at viewport end
				dec8 = accessor.addDecoration(new Range(1, 14, 1, 36), createOpts('dec8'));
				// starts at viewport start, ends after viewport
				dec9 = accessor.addDecoration(new Range(1, 14, 1, 51), createOpts('dec9'));

				// starts inside viewport, ends inside viewport
				dec10 = accessor.addDecoration(new Range(1, 16, 1, 18), createOpts('dec10'));
				// starts inside viewport, ends at viewport end
				dec11 = accessor.addDecoration(new Range(1, 16, 1, 36), createOpts('dec11'));
				// starts inside viewport, ends after viewport
				dec12 = accessor.addDecoration(new Range(1, 16, 1, 51), createOpts('dec12'));

				// starts at viewport end, ends at viewport end
				dec13 = accessor.addDecoration(new Range(1, 36, 1, 36), createOpts('dec13'));
				// starts at viewport end, ends after viewport
				dec14 = accessor.addDecoration(new Range(1, 36, 1, 51), createOpts('dec14'));

				// starts after viewport, ends after viewport
				dec15 = accessor.addDecoration(new Range(1, 40, 1, 51), createOpts('dec15'));
			});

			let actualDecorations = viewModel.getDecorationsInViewport(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3))
			).map((dec) => {
				return dec.source.id;
			});

			assert.deepEqual(actualDecorations, [
				dec2,
				dec3,
				dec4,
				dec5,
				dec6,
				dec7,
				dec8,
				dec9,
				dec10,
				dec11,
				dec12,
				dec13,
				dec14,
			]);

			let inlineDecorations1 = viewModel.getViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				2
			).inlineDecorations;

			// view line 2: (1,14 -> 1,24)
			assert.deepEqual(inlineDecorations1, [
				{
					range: new Range(1, 2, 2, 1),
					inlineClassName: 'i-dec2',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(1, 2, 2, 2),
					inlineClassName: 'i-dec3',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 1, 2, 2),
					inlineClassName: 'a-dec3',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(1, 2, 4, 1),
					inlineClassName: 'i-dec4',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(1, 2, 5, 8),
					inlineClassName: 'i-dec5',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 1, 2, 1),
					inlineClassName: 'i-dec6',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 1, 2, 2),
					inlineClassName: 'b-dec6',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(2, 1, 2, 3),
					inlineClassName: 'i-dec7',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 1, 2, 2),
					inlineClassName: 'b-dec7',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(2, 2, 2, 3),
					inlineClassName: 'a-dec7',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(2, 1, 4, 1),
					inlineClassName: 'i-dec8',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 1, 2, 2),
					inlineClassName: 'b-dec8',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(2, 1, 5, 8),
					inlineClassName: 'i-dec9',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 1, 2, 2),
					inlineClassName: 'b-dec9',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(2, 3, 2, 5),
					inlineClassName: 'i-dec10',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 3, 2, 4),
					inlineClassName: 'b-dec10',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(2, 4, 2, 5),
					inlineClassName: 'a-dec10',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(2, 3, 4, 1),
					inlineClassName: 'i-dec11',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 3, 2, 4),
					inlineClassName: 'b-dec11',
					insertsBeforeOrAfter: true
				},
				{
					range: new Range(2, 3, 5, 8),
					inlineClassName: 'i-dec12',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 3, 2, 4),
					inlineClassName: 'b-dec12',
					insertsBeforeOrAfter: true
				},
			]);

			let inlineDecorations2 = viewModel.getViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				3
			).inlineDecorations;

			// view line 3 (24 -> 36)
			assert.deepEqual(inlineDecorations2, [
				{
					range: new Range(1, 2, 4, 1),
					inlineClassName: 'i-dec4',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(1, 2, 5, 8),
					inlineClassName: 'i-dec5',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 1, 4, 1),
					inlineClassName: 'i-dec8',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 1, 5, 8),
					inlineClassName: 'i-dec9',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 3, 4, 1),
					inlineClassName: 'i-dec11',
					insertsBeforeOrAfter: false
				},
				{
					range: new Range(2, 3, 5, 8),
					inlineClassName: 'i-dec12',
					insertsBeforeOrAfter: false
				},
			]);
		});
	});

	test('issue #17208: Problem scrolling in 1.8.0', () => {
		withTestViewModel({
			text: 'hello world, this is a buffer that will be wrapped',
			wrappingColumn: 13
		}, (viewModel, model) => {
			assert.equal(viewModel.getLineContent(1), 'hello world, ');
			assert.equal(viewModel.getLineContent(2), 'this is a ');
			assert.equal(viewModel.getLineContent(3), 'buffer that ');
			assert.equal(viewModel.getLineContent(4), 'will be ');
			assert.equal(viewModel.getLineContent(5), 'wrapped');

			let dec1: string;
			model.changeDecorations((accessor) => {
				dec1 = accessor.addDecoration(
					new Range(1, 50, 1, 51),
					{
						beforeContentClassName: 'dec1'
					}
				);
			});

			let decorations = viewModel.getDecorationsInViewport(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3))
			);
			assert.deepEqual(decorations, []);

			let inlineDecorations1 = viewModel.getViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				2
			).inlineDecorations;
			assert.deepEqual(inlineDecorations1, []);

			let inlineDecorations2 = viewModel.getViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				3
			).inlineDecorations;
			assert.deepEqual(inlineDecorations2, []);
		});
	});
});
