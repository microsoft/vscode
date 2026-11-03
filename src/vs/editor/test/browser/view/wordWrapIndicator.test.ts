/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ScrollEvent } from '../../../../base/common/scrollable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestColorTheme } from '../../../../platform/theme/test/common/testThemeService.js';
import { IViewLines, RenderingContext } from '../../../browser/view/renderingContext.js';
import { WordWrapIndicatorOverlay } from '../../../browser/viewParts/wordWrapIndicator/wordWrapIndicator.js';
import { IEditorOptions } from '../../../common/config/editorOptions.js';
import { ScrollType } from '../../../common/editorCommon.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { TextModel } from '../../../common/model/textModel.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { TestConfiguration } from '../config/testConfiguration.js';
import { testViewModel } from '../viewModel/testViewModel.js';

const LINE_HEIGHT = 19;

interface IRenderOptions {
	/**
	 * The view lines the viewport covers. Defaults to the entire document.
	 */
	readonly viewport?: { readonly startLineNumber: number; readonly endLineNumber: number };
	/**
	 * Skips the `prepareRender` call, to exercise `render` on its own.
	 */
	readonly skipPrepareRender?: boolean;
}

interface IOverlayContext {
	readonly overlay: WordWrapIndicatorOverlay;
	readonly configuration: TestConfiguration;
	readonly viewModel: ViewModel;
	readonly model: TextModel;
	/**
	 * Runs a render pass and returns the HTML produced for every view line of the document,
	 * including the lines outside the viewport.
	 */
	render(renderOptions?: IRenderOptions): string[];
}

/**
 * Creates an overlay over `text` and hands it to `callback` together with the view model and the
 * configuration it reads from, so that the callback can both render it and drive its view event
 * handlers.
 */
function withOverlay(text: string[], options: IEditorOptions, callback: (context: IOverlayContext) => void): void {
	testViewModel(text, options, (viewModel, model, configuration) => {
		const viewContext = new ViewContext(configuration, new TestColorTheme(), viewModel);
		const overlay = new WordWrapIndicatorOverlay(viewContext);
		try {
			callback({
				overlay,
				configuration,
				viewModel,
				model,
				render: (renderOptions = {}) => renderOverlay(overlay, viewModel, renderOptions)
			});
		} finally {
			overlay.dispose();
		}
	});
}

function renderOverlay(overlay: WordWrapIndicatorOverlay, viewModel: ViewModel, renderOptions: IRenderOptions): string[] {
	const lineCount = viewModel.getLineCount();
	const viewport = renderOptions.viewport ?? { startLineNumber: 1, endLineNumber: lineCount };
	const viewportLineCount = viewport.endLineNumber - viewport.startLineNumber + 1;
	const viewLines: IViewLines = {
		linesVisibleRangesForRange: () => null,
		visibleRangeForPosition: () => null
	};
	const viewportData = new ViewportData(
		[new Selection(1, 1, 1, 1)],
		{
			bigNumbersDelta: 0,
			startLineNumber: viewport.startLineNumber,
			endLineNumber: viewport.endLineNumber,
			relativeVerticalOffset: new Array(viewportLineCount).fill(0).map((_, i) => i * LINE_HEIGHT),
			centeredLineNumber: viewport.startLineNumber,
			completelyVisibleStartLineNumber: viewport.startLineNumber,
			completelyVisibleEndLineNumber: viewport.endLineNumber,
			lineHeight: LINE_HEIGHT
		},
		[],
		viewModel
	);
	const ctx = new RenderingContext(viewModel.viewLayout, viewportData, viewLines);

	if (!renderOptions.skipPrepareRender) {
		overlay.prepareRender(ctx);
	}
	const result: string[] = [];
	for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
		result.push(overlay.render(viewport.startLineNumber, lineNumber));
	}
	return result;
}

/**
 * Renders the overlay over `text` and returns the HTML it produced for every view line.
 */
function renderIndicators(text: string[], options: IEditorOptions, renderOptions: IRenderOptions & { readonly prepare?: (viewModel: ViewModel, model: TextModel) => void } = {}): string[] {
	let result: string[] = [];
	withOverlay(text, options, context => {
		renderOptions.prepare?.(context.viewModel, context.model);
		result = context.render(renderOptions);
	});
	return result;
}

function indicator(left: number, lineHeight: number = LINE_HEIGHT): string {
	return `<div class="wwi" style="left:${left}px;height:${lineHeight}px;">↩</div>`;
}

function scrollEvent(changed: { scrollTopChanged?: boolean; scrollLeftChanged?: boolean }): viewEvents.ViewScrollChangedEvent {
	const source: ScrollEvent = {
		inSmoothScrolling: false,
		oldWidth: 0, oldScrollWidth: 0, oldScrollLeft: 0,
		width: 0, scrollWidth: 0, scrollLeft: 0,
		oldHeight: 0, oldScrollHeight: 0, oldScrollTop: 0,
		height: 0, scrollHeight: 0, scrollTop: 0,
		widthChanged: false, scrollWidthChanged: false, scrollLeftChanged: changed.scrollLeftChanged ?? false,
		heightChanged: false, scrollHeightChanged: false, scrollTopChanged: changed.scrollTopChanged ?? false
	};
	return new viewEvents.ViewScrollChangedEvent(source);
}

/**
 * Fires every view event that can affect an indicator at an overlay that has already painted
 * `text`, and reports which of them asked for a rerender.
 */
function invalidationsAfterRender(text: string[], options: IEditorOptions): Record<string, boolean> {
	const invalidations: Record<string, boolean> = {};
	withOverlay(text, options, ({ overlay, render }) => {
		render();
		invalidations.onDecorationsChanged = overlay.onDecorationsChanged(new viewEvents.ViewDecorationsChangedEvent(null));
		invalidations.onFlushed = overlay.onFlushed(new viewEvents.ViewFlushedEvent());
		invalidations.onLineMappingChanged = overlay.onLineMappingChanged(new viewEvents.ViewLineMappingChangedEvent());
		invalidations.onLinesChanged = overlay.onLinesChanged(new viewEvents.ViewLinesChangedEvent(1, 1));
		invalidations.onLinesDeleted = overlay.onLinesDeleted(new viewEvents.ViewLinesDeletedEvent(1, 1));
		invalidations.onLinesInserted = overlay.onLinesInserted(new viewEvents.ViewLinesInsertedEvent(1, 1));
		invalidations.onTokensChanged = overlay.onTokensChanged(new viewEvents.ViewTokensChangedEvent([{ fromLineNumber: 1, toLineNumber: 1 }]));
		invalidations.onZonesChanged = overlay.onZonesChanged(new viewEvents.ViewZonesChangedEvent());
		// Vertical scrolling changes the rendered lines. The glyph stays at the wrapping column
		// during horizontal scrolling, so that does not require a rerender.
		invalidations.onScrolledVertically = overlay.onScrollChanged(scrollEvent({ scrollTopChanged: true }));
		invalidations.onScrolledHorizontally = overlay.onScrollChanged(scrollEvent({ scrollLeftChanged: true }));
	});
	return invalidations;
}

/**
 * Applies `newOptions` to an overlay and reports whether the resulting configuration change asked
 * for a rerender. The overlay is a registered view event handler, so the update reaches it through
 * the real event dispatcher and leaves its answer in `shouldRender`.
 */
function configurationChangeInvalidates(options: IEditorOptions, newOptions: IEditorOptions): boolean {
	return configurationChangesInvalidate(options, [newOptions])[0];
}

function configurationChangesInvalidate(options: IEditorOptions, newOptions: readonly IEditorOptions[]): boolean[] {
	const result: boolean[] = [];
	withOverlay(['aaaaa bbbbb'], options, ({ overlay, configuration }) => {
		for (const update of newOptions) {
			overlay.onDidRender();
			configuration.updateOptions(update);
			result.push(overlay.shouldRender());
		}
	});
	return result;
}

suite('WordWrapIndicatorOverlay', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const WRAPPED_TEXT = [
		'aaaaa bbbbb ccccc',
		'short',
		'ddddd eeeee'
	];
	const VIEWPORT_OPTIONS: IEditorOptions = {
		folding: false,
		glyphMargin: false,
		lineDecorationsWidth: 0,
		lineNumbers: 'off',
		minimap: { enabled: false },
		scrollbar: { verticalScrollbarSize: 10 }
	};
	// With `wordWrapColumn: 6` this maps to the view lines:
	//   1: 'aaaaa ' (wrapped)  2: 'bbbbb ' (wrapped)  3: 'ccccc'
	//   4: 'short'
	//   5: 'ddddd ' (wrapped)  6: 'eeeee'
	const WRAPPING_OPTIONS: IEditorOptions = { ...VIEWPORT_OPTIONS, wordWrap: 'wordWrapColumn', wordWrapColumn: 6 };
	const INDICATOR_LEFT = 60;

	test('renders an indicator for every soft wrapped view line', () => {
		assert.deepStrictEqual(
			renderIndicators(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: true }),
			[indicator(INDICATOR_LEFT), indicator(INDICATOR_LEFT), '', '', indicator(INDICATOR_LEFT), '']
		);
	});

	test('does not construct line rendering data to find wrapped lines', () => {
		withOverlay(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: true }, ({ viewModel, render }) => {
			const renderingDataSpy = sinon.spy(viewModel, 'getViewportViewLineRenderingData');
			try {
				render();
				assert.strictEqual(renderingDataSpy.callCount, 0);
			} finally {
				renderingDataSpy.restore();
			}
		});
	});

	test('renders nothing when the indicator is disabled', () => {
		assert.deepStrictEqual(
			renderIndicators(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: false }),
			['', '', '', '', '', '']
		);
	});

	test('renders nothing when the setting is left at its default', () => {
		assert.deepStrictEqual(
			renderIndicators(WRAPPED_TEXT, WRAPPING_OPTIONS),
			['', '', '', '', '', '']
		);
	});

	test('renders nothing when word wrap is off', () => {
		assert.deepStrictEqual(
			renderIndicators(WRAPPED_TEXT, { wordWrap: 'off', wordWrapIndicator: true }),
			['', '', '']
		);
	});

	test('renders nothing for the last view line of the model', () => {
		assert.deepStrictEqual(
			renderIndicators(['aaa'], { ...WRAPPING_OPTIONS, wordWrapIndicator: true }),
			['']
		);
	});

	test('positions the indicator at the wrapping column', () => {
		assert.deepStrictEqual(
			renderIndicators(['aaa bb cccc'], { ...VIEWPORT_OPTIONS, wordWrap: 'wordWrapColumn', wordWrapColumn: 5, wordWrapIndicator: true }),
			[indicator(50), indicator(50), '']
		);
	});

	test('renders an indicator when a word is broken mid token', () => {
		assert.deepStrictEqual(
			renderIndicators(['aaaaaaaaaa'], { ...VIEWPORT_OPTIONS, wordWrap: 'wordWrapColumn', wordWrapColumn: 5, wordWrapIndicator: true }),
			[indicator(50), '']
		);
	});

	test('keeps the indicator at the wrapping column while horizontally scrolled', () => {
		withOverlay(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: true }, ({ viewModel, render }) => {
			viewModel.viewLayout.setMaxLineWidth(200);
			viewModel.viewLayout.setScrollPosition({ scrollLeft: 20 }, ScrollType.Immediate);
			assert.deepStrictEqual(
				render(),
				[indicator(INDICATOR_LEFT), indicator(INDICATOR_LEFT), '', '', indicator(INDICATOR_LEFT), '']
			);
		});
	});

	test('keeps the indicator past a fixed wrapping column wider than the viewport', () => {
		const options: IEditorOptions = {
			...VIEWPORT_OPTIONS,
			wordWrap: 'wordWrapColumn',
			wordWrapColumn: 12,
			wordWrapIndicator: true
		};
		withOverlay(['aaaaaaaaaaaaaaaaaaaaaaaa'], options, ({ viewModel, render }) => {
			assert.deepStrictEqual(render(), [indicator(120), '']);

			viewModel.viewLayout.setMaxLineWidth(200);
			viewModel.viewLayout.setScrollPosition({ scrollLeft: 50 }, ScrollType.Immediate);
			assert.deepStrictEqual(render(), [indicator(120), '']);
		});
	});

	test('renders only the view lines inside the viewport', () => {
		// `prepareRender` only walks the viewport, and `render` indexes into its result relative to
		// the first line the view is painting, so everything outside stays empty.
		assert.deepStrictEqual(
			renderIndicators(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: true }, {
				viewport: { startLineNumber: 2, endLineNumber: 4 }
			}),
			['', indicator(INDICATOR_LEFT), '', '', '', '']
		);
	});

	test('renders nothing before prepareRender has run', () => {
		assert.deepStrictEqual(
			renderIndicators(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: true }, { skipPrepareRender: true }),
			['', '', '', '', '', '']
		);
	});

	test('sizes the indicator to the height of its view line', () => {
		assert.deepStrictEqual(
			renderIndicators(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: true }, {
				prepare: (viewModel, model) => {
					// `lineHeight` is a multiple of the default height, applied here to the whole
					// first model line, i.e. to view lines 1 through 3.
					model.deltaDecorations([], [{
						range: new Range(1, 1, 1, model.getLineMaxColumn(1)),
						options: { description: 'line-height', lineHeight: 2 }
					}]);
				}
			}),
			[indicator(INDICATOR_LEFT, 2 * LINE_HEIGHT), indicator(INDICATOR_LEFT, 2 * LINE_HEIGHT), '', '', indicator(INDICATOR_LEFT), '']
		);
	});

	test('asks for a rerender on every event that can affect an indicator', () => {
		assert.deepStrictEqual(
			invalidationsAfterRender(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: true }),
			{
				onDecorationsChanged: true,
				onFlushed: true,
				onLineMappingChanged: true,
				onLinesChanged: true,
				onLinesDeleted: true,
				onLinesInserted: true,
				onTokensChanged: false,
				onZonesChanged: true,
				onScrolledVertically: true,
				onScrolledHorizontally: false
			}
		);
	});

	test('asks for no rerender at all while it renders nothing', () => {
		const allFalse = {
			onDecorationsChanged: false,
			onFlushed: false,
			onLineMappingChanged: false,
			onLinesChanged: false,
			onLinesDeleted: false,
			onLinesInserted: false,
			onTokensChanged: false,
			onZonesChanged: false,
			onScrolledVertically: false,
			onScrolledHorizontally: false
		};
		assert.deepStrictEqual(
			{
				indicatorDisabled: invalidationsAfterRender(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: false }),
				wrappingOff: invalidationsAfterRender(WRAPPED_TEXT, { wordWrap: 'off', wordWrapIndicator: true })
			},
			{ indicatorDisabled: allFalse, wrappingOff: allFalse }
		);
	});

	test('ignores token changes', () => {
		let invalidated: boolean | undefined;
		withOverlay(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: true }, ({ overlay, render }) => {
			render();
			invalidated = overlay.onTokensChanged(new viewEvents.ViewTokensChangedEvent([{ fromLineNumber: 1, toLineNumber: 6 }]));
		});

		assert.strictEqual(invalidated, false);
	});

	test('renders after being re-enabled on the same overlay', () => {
		withOverlay(WRAPPED_TEXT, { ...WRAPPING_OPTIONS, wordWrapIndicator: false }, ({ overlay, configuration, render }) => {
			const updateAndRender = (options: IEditorOptions) => {
				overlay.onDidRender();
				configuration.updateOptions(options);
				return {
					invalidated: overlay.shouldRender(),
					output: render()
				};
			};

			assert.deepStrictEqual(
				{
					initiallyDisabled: render(),
					enabled: updateAndRender({ wordWrapIndicator: true }),
					disabled: updateAndRender({ wordWrapIndicator: false }),
					reEnabled: updateAndRender({ wordWrapIndicator: true })
				},
				{
					initiallyDisabled: ['', '', '', '', '', ''],
					enabled: {
						invalidated: true,
						output: [indicator(INDICATOR_LEFT), indicator(INDICATOR_LEFT), '', '', indicator(INDICATOR_LEFT), '']
					},
					disabled: {
						invalidated: true,
						output: ['', '', '', '', '', '']
					},
					reEnabled: {
						invalidated: true,
						output: [indicator(INDICATOR_LEFT), indicator(INDICATOR_LEFT), '', '', indicator(INDICATOR_LEFT), '']
					}
				}
			);
		});
	});

	test('asks for a rerender only on configuration changes that matter', () => {
		const options: IEditorOptions = { ...WRAPPING_OPTIONS, wordWrapIndicator: true, lineNumbers: 'on' };
		assert.deepStrictEqual(
			{
				indicatorTurnedOn: configurationChangeInvalidates({ ...WRAPPING_OPTIONS, wordWrapIndicator: false }, { wordWrapIndicator: true }),
				indicatorTurnedOff: configurationChangeInvalidates(options, { wordWrapIndicator: false }),
				wrappingTurnedOn: configurationChangeInvalidates({ wordWrap: 'off', wordWrapIndicator: true }, WRAPPING_OPTIONS),
				wrappingTurnedOff: configurationChangeInvalidates(options, { wordWrap: 'off' }),
				indicatorTurnedOffAndOn: configurationChangesInvalidate(options, [{ wordWrapIndicator: false }, { wordWrapIndicator: true }]),
				wrappingTurnedOffAndOn: configurationChangesInvalidate(options, [{ wordWrap: 'off' }, WRAPPING_OPTIONS]),
				wrappingColumnChanged: configurationChangeInvalidates(options, { wordWrapColumn: 7 }),
				layoutChanged: configurationChangeInvalidates(options, { lineNumbers: 'off' }),
				unrelatedChange: configurationChangeInvalidates(options, { cursorBlinking: 'solid' })
			},
			{
				indicatorTurnedOn: true,
				indicatorTurnedOff: true,
				wrappingTurnedOn: true,
				wrappingTurnedOff: true,
				indicatorTurnedOffAndOn: [true, true],
				wrappingTurnedOffAndOn: [true, true],
				wrappingColumnChanged: true,
				layoutChanged: false,
				unrelatedChange: false
			}
		);
	});
});
