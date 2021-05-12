/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CellToolbarLocKey, CellToolbarVisibility, ShowCellStatusBarKey } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const CELL_STATUSBAR_HEIGHT = 22;
const EDITOR_TOOLBAR_HEIGHT = 0;
const CELL_OUTPUT_PADDING = 14;
const MARKDOWN_PREVIEW_PADDING = 8;
const CELL_RIGHT_MARGIN = 16;
const CELL_RUN_GUTTER = 28;
const CODE_CELL_LEFT_MARGIN = 32;
const MARKDOWN_CELL_LEFT_MARGIN = 32;
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

let EDITOR_TOP_PADDING = 12;
const editorTopPaddingChangeEmitter = new Emitter<void>();

export const EditorTopPaddingChangeEvent = editorTopPaddingChangeEmitter.event;

export function updateEditorTopPadding(top: number) {
	EDITOR_TOP_PADDING = top;
	editorTopPaddingChangeEmitter.fire();
}

export function getEditorTopPadding() {
	return EDITOR_TOP_PADDING;
}

export interface NotebookLayoutConfiguration {
	cellRightMargin: number;
	cellRunGutter: number;
	cellTopMargin: number;
	cellBottomMargin: number;
	cellOutputPadding: number;
	codeCellLeftMargin: number;
	markdownCellLeftMargin: number;
	markdownCellTopMargin: number;
	markdownCellBottomMargin: number;
	markdownPreviewPadding: number;
	bottomCellToolbarGap: number;
	bottomCellToolbarHeight: number;
	editorToolbarHeight: number;
	editorTopPadding: number;
	editorBottomPadding: number;
	editorBottomPaddingWithoutStatusBar: number;
	collapsedIndicatorHeight: number;
	showCellStatusBar: boolean;
	cellStatusBarHeight: number;
	cellToolbarLocation: string | { [key: string]: string };
	cellToolbarInteraction: string;
}

interface NotebookOptionsChangeEvent {
	cellStatusBarVisibility?: boolean;
	cellToolbarLocation?: boolean;
	cellToolbarInteraction?: boolean;
	editorTopPadding?: boolean;
}
export class NotebookOptions {
	private _layoutConfiguration: NotebookLayoutConfiguration;
	protected readonly _onDidChangeOptions = new Emitter<NotebookOptionsChangeEvent>();
	readonly onDidChangeOptions = this._onDidChangeOptions.event;
	private _disposables: IDisposable[];

	constructor(readonly configurationService: IConfigurationService) {
		const showCellStatusBar = this.configurationService.getValue<boolean>(ShowCellStatusBarKey);
		const cellToolbarLocation = this.configurationService.getValue<string | { [key: string]: string }>(CellToolbarLocKey);
		const cellToolbarInteraction = this.configurationService.getValue<string>(CellToolbarVisibility);

		this._disposables = [];
		this._layoutConfiguration = {
			cellRightMargin: CELL_RIGHT_MARGIN,
			cellRunGutter: CELL_RUN_GUTTER,
			cellTopMargin: CELL_TOP_MARGIN,
			cellBottomMargin: CELL_BOTTOM_MARGIN,
			codeCellLeftMargin: CODE_CELL_LEFT_MARGIN,
			markdownCellLeftMargin: MARKDOWN_CELL_LEFT_MARGIN,
			markdownCellTopMargin: MARKDOWN_CELL_TOP_MARGIN,
			markdownCellBottomMargin: MARKDOWN_CELL_BOTTOM_MARGIN,
			bottomCellToolbarGap: BOTTOM_CELL_TOOLBAR_GAP,
			bottomCellToolbarHeight: BOTTOM_CELL_TOOLBAR_HEIGHT,
			editorTopPadding: EDITOR_TOP_PADDING,
			editorBottomPadding: EDITOR_BOTTOM_PADDING,
			editorBottomPaddingWithoutStatusBar: EDITOR_BOTTOM_PADDING_WITHOUT_STATUSBAR,
			editorToolbarHeight: EDITOR_TOOLBAR_HEIGHT,
			cellOutputPadding: CELL_OUTPUT_PADDING,
			collapsedIndicatorHeight: COLLAPSED_INDICATOR_HEIGHT,
			markdownPreviewPadding: MARKDOWN_PREVIEW_PADDING,
			cellStatusBarHeight: CELL_STATUSBAR_HEIGHT,
			showCellStatusBar,
			cellToolbarLocation,
			cellToolbarInteraction
		};

		this._disposables.push(this.configurationService.onDidChangeConfiguration(e => {
			let cellStatusBarVisibility = e.affectsConfiguration(ShowCellStatusBarKey);
			let cellToolbarLocation = e.affectsConfiguration(CellToolbarLocKey);
			let cellToolbarInteraction = e.affectsConfiguration(CellToolbarVisibility);

			if (!cellStatusBarVisibility && !cellToolbarLocation && !cellToolbarInteraction) {
				return;
			}

			const configuration = Object.assign({}, this._layoutConfiguration);

			if (cellStatusBarVisibility) {
				configuration.showCellStatusBar = this.configurationService.getValue<boolean>(ShowCellStatusBarKey);
			}

			if (cellToolbarLocation) {
				configuration.cellToolbarLocation = this.configurationService.getValue<string | { [key: string]: string }>(CellToolbarLocKey);
			}

			if (cellToolbarInteraction) {
				configuration.cellToolbarInteraction = this.configurationService.getValue<string>(CellToolbarVisibility);
			}

			this._layoutConfiguration = configuration;

			// trigger event
			this._onDidChangeOptions.fire({
				cellStatusBarVisibility: cellStatusBarVisibility,
				cellToolbarLocation: cellToolbarLocation,
				cellToolbarInteraction: cellToolbarInteraction
			});
		}));

		this._disposables.push(EditorTopPaddingChangeEvent(() => {
			const configuration = Object.assign({}, this._layoutConfiguration);
			configuration.editorTopPadding = getEditorTopPadding();
			this._layoutConfiguration = configuration;
			this._onDidChangeOptions.fire({ editorTopPadding: true });
		}));
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

	computeCodeCellEditorWidth(outerWidth: number): number {
		return outerWidth - (
			this._layoutConfiguration.codeCellLeftMargin // CODE_CELL_LEFT_MARGIN
			+ this._layoutConfiguration.cellRunGutter // CELL_RUN_GUTTER
			+ this._layoutConfiguration.cellRightMargin // CELL_RIGHT_MARGIN
		);
	}

	computeMarkdownCellEditorWidth(outerWidth: number): number {
		return outerWidth
			- this._layoutConfiguration.codeCellLeftMargin // CODE_CELL_LEFT_MARGIN
			- this._layoutConfiguration.cellRightMargin; // CELL_RIGHT_MARGIN;
	}

	computeStatusBarHeight(): number {
		if (this._layoutConfiguration.showCellStatusBar) {
			return this._layoutConfiguration.cellStatusBarHeight;
		} else {
			return 0;
		}
	}

	computeCellToolbarLocation(viewType?: string): 'right' | 'left' | 'hidden' {
		const cellToolbarLocation = this._layoutConfiguration.cellToolbarLocation;

		if (typeof cellToolbarLocation === 'string') {
			if (cellToolbarLocation === 'left' || cellToolbarLocation === 'right' || cellToolbarLocation === 'hidden') {
				return cellToolbarLocation;
			}
		} else {
			if (viewType) {
				const notebookSpecificSetting = cellToolbarLocation[viewType] ?? cellToolbarLocation['default'];
				let cellToolbarLocationForCurrentView: 'right' | 'left' | 'hidden' = 'right';

				switch (notebookSpecificSetting) {
					case 'left':
						cellToolbarLocationForCurrentView = 'left';
						break;
					case 'right':
						cellToolbarLocationForCurrentView = 'right';
						break;
					case 'hidden':
						cellToolbarLocationForCurrentView = 'hidden';
						break;
					default:
						cellToolbarLocationForCurrentView = 'right';
						break;
				}

				return cellToolbarLocationForCurrentView;
			}
		}

		return 'right';
	}

	computeEditorPadding() {
		return {
			top: getEditorTopPadding(),
			bottom: this._layoutConfiguration.showCellStatusBar
				? this._layoutConfiguration.editorBottomPadding// EDITOR_BOTTOM_PADDING
				: this._layoutConfiguration.editorBottomPaddingWithoutStatusBar // EDITOR_BOTTOM_PADDING_WITHOUT_STATUSBAR
		};
	}

	computeWebviewOptions() {
		return {
			outputNodePadding: this._layoutConfiguration.cellOutputPadding, // CELL_OUTPUT_PADDING,
			outputNodeLeftPadding: this._layoutConfiguration.cellOutputPadding, // CELL_OUTPUT_PADDING,
			previewNodePadding: this._layoutConfiguration.markdownPreviewPadding, // MARKDOWN_PREVIEW_PADDING,
			markdownLeftMargin: this._layoutConfiguration.markdownCellLeftMargin,
			leftMargin: this._layoutConfiguration.codeCellLeftMargin, // CODE_CELL_LEFT_MARGIN,
			rightMargin: this._layoutConfiguration.cellRightMargin, // CELL_RIGHT_MARGIN,
			runGutter: this._layoutConfiguration.cellRunGutter, // CELL_RUN_GUTTER,
		};
	}

	computeDiffWebviewOptions() {
		return {
			outputNodePadding: this._layoutConfiguration.cellOutputPadding, // CELL_OUTPUT_PADDING,
			outputNodeLeftPadding: 32,
			previewNodePadding: this._layoutConfiguration.markdownPreviewPadding, // MARKDOWN_PREVIEW_PADDING,
			leftMargin: 0,
			rightMargin: 0,
			runGutter: 0
		};
	}

	computeIndicatorPosition(totalHeight: number) {
		return {
			bottomIndicatorTop: totalHeight - this._layoutConfiguration.bottomCellToolbarGap - this._layoutConfiguration.cellBottomMargin,
			verticalIndicatorHeight: totalHeight - this._layoutConfiguration.bottomCellToolbarGap
		};
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
		this._disposables = [];
	}
}
