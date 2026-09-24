/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestColorTheme } from '../../../../platform/theme/test/common/testThemeService.js';
import { HorizontalRange, IViewLines, LineVisibleRanges, RenderingContext } from '../../../browser/view/renderingContext.js';
import { CursorPlurality, ViewCursor } from '../../../browser/viewParts/viewCursors/viewCursor.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { testViewModel } from '../viewModel/testViewModel.js';

suite('ViewCursor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const { name, column, affectsLetterSpacing, affectsFont, disableMonospaceOptimizations, expectedWidth } of [
		{ name: 'plain ASCII uses a character cell', column: 1, expectedWidth: 10 },
		{ name: 'injected ASCII without spacing overrides uses a character cell', column: 3, expectedWidth: 10 },
		{ name: 'injected ASCII with font or spacing overrides uses rendered width', column: 3, affectsLetterSpacing: true, expectedWidth: 23 },
		{ name: 'last injected character uses rendered width', column: 6, affectsLetterSpacing: true, expectedWidth: 23 },
		{ name: 'character before an injected override uses a character cell', column: 2, affectsLetterSpacing: true, expectedWidth: 10 },
		{ name: 'character after an injected override uses a character cell', column: 7, affectsLetterSpacing: true, expectedWidth: 10 },
		{ name: 'model font overrides use rendered width', column: 1, affectsFont: true, expectedWidth: 23 },
		{ name: 'disabled monospace optimizations use rendered width', column: 1, disableMonospaceOptimizations: true, expectedWidth: 23 },
	]) {
		test(name, () => {
			testViewModel(['ab=cd'], { cursorStyle: 'block', disableMonospaceOptimizations }, (viewModel, model, configuration) => {
				model.deltaDecorations([], [{
					range: new Range(1, 3, 1, 3),
					options: {
						description: 'injected font override',
						showIfCollapsed: true,
						before: { content: 'hint', inlineClassName: 'hint-font', inlineClassNameAffectsLetterSpacing: affectsLetterSpacing }
					}
				}, {
					range: new Range(1, 1, 1, 2),
					options: { description: 'model font override', inlineClassName: 'model-font', fontSize: affectsFont ? '20px' : undefined }
				}]);
				const cursor = new ViewCursor(new ViewContext(configuration, new TestColorTheme(), viewModel), CursorPlurality.Single);
				cursor.onCursorPositionChanged(new Position(1, column), true);
				const viewLines: IViewLines = {
					linesVisibleRangesForRange: range => [new LineVisibleRanges(false, range.startLineNumber, [new HorizontalRange(20, 23)], false)],
					visibleRangeForPosition: () => null
				};
				const viewportData = new ViewportData(
					[new Selection(1, column, 1, column)],
					viewModel.viewLayout.getLinesViewportData(),
					[],
					viewModel
				);
				const ctx = new RenderingContext(viewModel.viewLayout, viewportData, viewLines);
				cursor.prepareRender(ctx);
				const rendered = cursor.render(ctx);
				assert.deepStrictEqual({
					hasVariableFonts: viewportData.getViewLineRenderingData(1).hasVariableFonts,
					width: rendered?.domNode.style.width,
				}, {
					hasVariableFonts: affectsFont ?? false,
					width: `${expectedWidth}px`,
				});
			});
		});
	}
});
