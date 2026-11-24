/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestColorTheme } from '../../../../platform/theme/test/common/testThemeService.js';
import { DynamicViewOverlay } from '../../../browser/view/dynamicViewOverlay.js';
import { IViewLines, RenderingContext } from '../../../browser/view/renderingContext.js';
import { ContentViewOverlays } from '../../../browser/view/viewOverlays.js';
import { Selection } from '../../../common/core/selection.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { testViewModel } from '../viewModel/testViewModel.js';

const LINE_HEIGHT = 19;

/** Renders the HTML in {@link content} on its line and nothing elsewhere. */
class FakeOverlay extends DynamicViewOverlay {
	public readonly content = new Map<number, string>();

	public prepareRender(): void { }

	public render(_startLineNumber: number, lineNumber: number): string {
		return this.content.get(lineNumber) ?? '';
	}
}

/**
 * Renders content overlays holding one {@link FakeOverlay} over three lines,
 * all visible; `render` returns the layer's line nodes.
 */
function withOverlays(omitEmptyLines: boolean, callback: (render: () => HTMLElement[], overlay: FakeOverlay) => void): void {
	testViewModel(['a', 'b', 'c'], {}, (viewModel, _model, configuration) => {
		const overlays = new ContentViewOverlays(new ViewContext(configuration, new TestColorTheme(), viewModel));
		const overlay = new FakeOverlay();
		overlays.addDynamicOverlay(overlay);
		if (omitEmptyLines) {
			overlays.omitLinesWhileEmpty();
		}
		const viewLines: IViewLines = { linesVisibleRangesForRange: () => null, visibleRangeForPosition: () => null };
		try {
			callback(() => {
				const viewportData = new ViewportData([new Selection(1, 1, 1, 1)], {
					bigNumbersDelta: 0,
					startLineNumber: 1,
					endLineNumber: 3,
					relativeVerticalOffset: [0, LINE_HEIGHT, 2 * LINE_HEIGHT],
					centeredLineNumber: 2,
					completelyVisibleStartLineNumber: 1,
					completelyVisibleEndLineNumber: 3,
					lineHeight: LINE_HEIGHT,
				}, [], viewModel);
				const ctx = new RenderingContext(viewModel.viewLayout, viewportData, viewLines);
				overlays.prepareRender(ctx);
				overlays.render(ctx);
				return [...overlays.getDomNode().domNode.children] as HTMLElement[];
			}, overlay);
		} finally {
			overlays.dispose();
		}
	});
}

suite('ViewOverlays', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a layer that omits empty lines keeps no line nodes while its overlays render nothing', () => {
		withOverlays(true, (render, overlay) => {
			assert.strictEqual(render().length, 0);

			overlay.content.set(2, '<i>x</i>');
			assert.deepStrictEqual(render().map(line => [line.style.top, line.innerHTML]), [
				['0px', ''],
				[`${LINE_HEIGHT}px`, '<i>x</i>'],
				[`${2 * LINE_HEIGHT}px`, ''],
			]);

			overlay.content.clear();
			assert.strictEqual(render().length, 0);
			overlay.content.set(3, '<b>y</b>');
			assert.deepStrictEqual(render().map(line => line.innerHTML), ['', '', '<b>y</b>']);
		});
	});

	test('other layers keep a node for every visible line', () => {
		withOverlays(false, render => {
			assert.deepStrictEqual(render().map(line => line.innerHTML), ['', '', '']);
		});
	});
});
