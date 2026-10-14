/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestColorTheme } from '../../../../platform/theme/test/common/testThemeService.js';
import { IViewLines, RenderingContext } from '../../../browser/view/renderingContext.js';
import { LineNumbersOverlay } from '../../../browser/viewParts/lineNumbers/lineNumbers.js';
import { IEditorOptions } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { TextModel } from '../../../common/model/textModel.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { testViewModel } from '../viewModel/testViewModel.js';

function renderLineNumbers(text: string[], options: IEditorOptions, prepare: (model: TextModel) => void): string[] {
	let result: string[] = [];
	testViewModel(text, options, (viewModel, model, configuration) => {
		prepare(model);
		const viewContext = new ViewContext(configuration, new TestColorTheme(), viewModel);
		const overlay = new LineNumbersOverlay(viewContext);
		try {
			const lineCount = viewModel.getLineCount();
			const viewportData = createViewportData(viewModel, lineCount, options.lineHeight ?? 20);
			const viewLines: IViewLines = {
				linesVisibleRangesForRange: () => null,
				visibleRangeForPosition: () => null
			};
			overlay.prepareRender(new RenderingContext(viewModel.viewLayout, viewportData, viewLines));
			result = Array.from({ length: lineCount }, (_, index) => overlay.render(1, index + 1));
		} finally {
			overlay.dispose();
		}
	});
	return result;
}

function createViewportData(viewModel: ViewModel, lineCount: number, lineHeight: number): ViewportData {
	return new ViewportData(
		[new Selection(1, 1, 1, 1)],
		{
			bigNumbersDelta: 0,
			startLineNumber: 1,
			endLineNumber: lineCount,
			relativeVerticalOffset: Array.from({ length: lineCount }, (_, index) => viewModel.viewLayout.getVerticalOffsetForLineNumber(index + 1)),
			centeredLineNumber: 1,
			completelyVisibleStartLineNumber: 1,
			completelyVisibleEndLineNumber: lineCount,
			lineHeight
		},
		[],
		viewModel
	);
}

function getFontSize(lineNumberHtml: string): string | undefined {
	return /font-size:(?<fontSize>[^;]+);/.exec(lineNumberHtml)?.groups?.fontSize;
}

suite('LineNumbersOverlay', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('scales line numbers with custom line heights', () => {
		const result = renderLineNumbers(['one', 'two', 'three'], {
			allowVariableLineHeights: true,
			fontSize: 16,
			lineHeight: 20,
			lineNumbers: 'on'
		}, model => {
			model.deltaDecorations([], [
				{
					range: new Range(2, 1, 2, model.getLineMaxColumn(2)),
					options: { description: 'short-line', lineHeight: 0.5 }
				},
				{
					range: new Range(3, 1, 3, model.getLineMaxColumn(3)),
					options: { description: 'tall-line', lineHeight: 1.5 }
				}
			]);
		});

		assert.deepStrictEqual(result.map(getFontSize), [undefined, '8px', '24px']);
	});
});
