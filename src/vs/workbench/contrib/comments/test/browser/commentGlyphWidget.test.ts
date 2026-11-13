/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RenderingContext, IViewLines } from '../../../../../editor/browser/view/renderingContext.js';
import { LinesDecorationsOverlay } from '../../../../../editor/browser/viewParts/linesDecorations/linesDecorations.js';
import { CommentThreadState } from '../../../../../editor/common/languages.js';
import { ViewportData } from '../../../../../editor/common/viewLayout/viewLinesViewportData.js';
import { ViewContext } from '../../../../../editor/common/viewModel/viewContext.js';
import { TestConfiguration } from '../../../../../editor/test/browser/config/testConfiguration.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { CommentGlyphWidget } from '../../browser/commentGlyphWidget.js';

suite('CommentGlyphWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('separates the comment bar from the glyph on wrapped lines', () => {
		withTestCodeEditor('012345678901234567890123456789', {
			wordWrap: 'wordWrapColumn',
			wordWrapColumn: 10
		}, (editor, viewModel) => {
			const widget = store.add(new CommentGlyphWidget(editor, 1));
			widget.setThreadState(CommentThreadState.Unresolved);

			const configuration = store.add(new TestConfiguration({
				wordWrap: 'wordWrapColumn',
				wordWrapColumn: 10
			}));
			const overlay = store.add(new LinesDecorationsOverlay(new ViewContext(configuration, new TestColorTheme(), viewModel)));
			const partialViewportData = viewModel.viewLayout.getLinesViewportData();
			viewModel.setViewport(partialViewportData.startLineNumber, partialViewportData.endLineNumber, partialViewportData.centeredLineNumber);
			const viewportData = new ViewportData([], partialViewportData, viewModel.viewLayout.getWhitespaceViewportData(), viewModel);
			const viewLines: IViewLines = {
				linesVisibleRangesForRange: () => null,
				visibleRangeForPosition: () => null
			};
			overlay.prepareRender(new RenderingContext(viewModel.viewLayout, viewportData, viewLines));

			const renderedLines = [];
			for (let lineNumber = viewportData.startLineNumber; lineNumber <= viewportData.endLineNumber; lineNumber++) {
				renderedLines.push(overlay.render(viewportData.startLineNumber, lineNumber));
			}

			assert.deepStrictEqual({
				isWrapped: renderedLines.length > 1,
				linesMissingBar: renderedLines.flatMap((line, index) => line.includes('comment-thread-bar') ? [] : [index + 1]),
				linesWithGlyph: renderedLines.flatMap((line, index) => line.includes('comment-thread-unresolved') ? [index + 1] : [])
			}, {
				isWrapped: true,
				linesMissingBar: [],
				linesWithGlyph: [1]
			});
		});
	});
});
