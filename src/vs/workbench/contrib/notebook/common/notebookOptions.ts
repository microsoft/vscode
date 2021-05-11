/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const CELL_STATUSBAR_HEIGHT = 22;
const EDITOR_TOOLBAR_HEIGHT = 0;
const CELL_OUTPUT_PADDING = 14;
const MARKDOWN_PREVIEW_PADDING = 8;
const CELL_RIGHT_MARGIN = 16;
const CELL_RUN_GUTTER = 28;
const CODE_CELL_LEFT_MARGIN = 32;
const BOTTOM_CELL_TOOLBAR_GAP = 18;
const BOTTOM_CELL_TOOLBAR_HEIGHT = 22;

// Margin above editor
const CELL_TOP_MARGIN = 6;
const CELL_BOTTOM_MARGIN = 6;

const MARKDOWN_CELL_TOP_MARGIN = 8;
const MARKDOWN_CELL_BOTTOM_MARGIN = 8;

const COLLAPSED_INDICATOR_HEIGHT = 24;
const EDITOR_BOTTOM_PADDING_WITHOUT_STATUSBAR = 12;
const EDITOR_BOTTOM_PADDING = 4;

export interface NotebookLayoutConfiguration {
	cellRightMargin: number,
	cellRunGutter: number,
	cellStatusBarHeight: number,
	cellTopMargin: number,
	cellBottomMargin: number,
	cellOutputPadding: number,
	codeCellLeftMargin: number,
	markdownCellTopMargin: number,
	markdownCellBottomMargin: number,
	markdownPreviewPadding: number,
	bottomCellToolbarGap: number,
	bottomCellToolbarHeight: number,
	editorToolbarHeight: number,
	editorBottomPadding: number,
	editorBottomPaddingWithoutStatusBar: number,
	collapsedIndicatorHeight: number,
}

export class NotebookOptions {
	private _layoutConfiguration: NotebookLayoutConfiguration;

	constructor() {
		this._layoutConfiguration = {
			cellRightMargin: CELL_RIGHT_MARGIN,
			cellRunGutter: CELL_RUN_GUTTER,
			cellStatusBarHeight: CELL_STATUSBAR_HEIGHT,
			cellTopMargin: CELL_TOP_MARGIN,
			cellBottomMargin: CELL_BOTTOM_MARGIN,
			codeCellLeftMargin: CODE_CELL_LEFT_MARGIN,
			markdownCellTopMargin: MARKDOWN_CELL_TOP_MARGIN,
			markdownCellBottomMargin: MARKDOWN_CELL_BOTTOM_MARGIN,
			bottomCellToolbarGap: BOTTOM_CELL_TOOLBAR_GAP,
			bottomCellToolbarHeight: BOTTOM_CELL_TOOLBAR_HEIGHT,
			editorBottomPadding: EDITOR_BOTTOM_PADDING,
			editorBottomPaddingWithoutStatusBar: EDITOR_BOTTOM_PADDING_WITHOUT_STATUSBAR,
			editorToolbarHeight: EDITOR_TOOLBAR_HEIGHT,
			cellOutputPadding: CELL_OUTPUT_PADDING,
			collapsedIndicatorHeight: COLLAPSED_INDICATOR_HEIGHT,
			markdownPreviewPadding: MARKDOWN_PREVIEW_PADDING
		};
	}

	getLayoutConfiguration(): NotebookLayoutConfiguration {
		return this._layoutConfiguration;
	}

	computeCollapsedMarkdownCellHeight(): number {
		return this._layoutConfiguration.markdownCellTopMargin // MARKDOWN_CELL_TOP_MARGIN
			+ this._layoutConfiguration.collapsedIndicatorHeight // COLLAPSED_INDICATOR_HEIGHT
			+ this._layoutConfiguration.bottomCellToolbarGap // BOTTOM_CELL_TOOLBAR_GAP
			+ this._layoutConfiguration.markdownCellBottomMargin; // MARKDOWN_CELL_BOTTOM_MARGIN;
	}

	computeBottomToolbarOffset(totalHeight: number) {
		return totalHeight
			- this._layoutConfiguration.bottomCellToolbarGap // BOTTOM_CELL_TOOLBAR_GAP
			- this._layoutConfiguration.bottomCellToolbarHeight / 2;
	}
}
