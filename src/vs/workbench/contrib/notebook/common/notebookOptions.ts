/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CellToolbarLocKey, CellToolbarVisibility, ExperimentalCompactView, ExperimentalConsolidatedOutputButton, ExperimentalDragAndDropEnabled, ExperimentalFocusIndicator, ExperimentalGlobalToolbar, ExperimentalInsertToolbarPosition, ExperimentalShowFoldingControls, ShowCellStatusBarKey } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const SCROLLABLE_ELEMENT_PADDING_TOP = 18;

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
	bottomToolbarGap: number;
	bottomToolbarHeight: number;
	editorToolbarHeight: number;
	editorTopPadding: number;
	editorBottomPadding: number;
	editorBottomPaddingWithoutStatusBar: number;
	collapsedIndicatorHeight: number;
	showCellStatusBar: boolean;
	cellStatusBarHeight: number;
	cellToolbarLocation: string | { [key: string]: string };
	cellToolbarInteraction: string;
	compactView: boolean;
	focusIndicator: 'border' | 'gutter';
	insertToolbarPosition: 'betweenCells' | 'notebookToolbar' | 'both' | 'hidden';
	globalToolbar: boolean;
	consolidatedOutputButton: boolean;
	showFoldingControls: 'always' | 'mouseover';
	dragAndDropEnabled: boolean;
	fontSize: number;
}

interface NotebookOptionsChangeEvent {
	cellStatusBarVisibility?: boolean;
	cellToolbarLocation?: boolean;
	cellToolbarInteraction?: boolean;
	editorTopPadding?: boolean;
	compactView?: boolean;
	focusIndicator?: boolean;
	insertToolbarPosition?: boolean;
	globalToolbar?: boolean;
	showFoldingControls?: boolean;
	consolidatedOutputButton?: boolean;
	dragAndDropEnabled?: boolean;
	fontSize?: boolean;
}

const defaultConfigConstants = {
	codeCellLeftMargin: 28,
	cellRunGutter: 32,
	markdownCellTopMargin: 8,
	markdownCellBottomMargin: 8,
	markdownCellLeftMargin: 32,
};

const compactConfigConstants = {
	codeCellLeftMargin: 0,
	cellRunGutter: 32,
	markdownCellTopMargin: 6,
	markdownCellBottomMargin: 6,
	markdownCellLeftMargin: 32,
};

export class NotebookOptions {
	private _layoutConfiguration: NotebookLayoutConfiguration;
	protected readonly _onDidChangeOptions = new Emitter<NotebookOptionsChangeEvent>();
	readonly onDidChangeOptions = this._onDidChangeOptions.event;
	private _disposables: IDisposable[];

	constructor(private readonly configurationService: IConfigurationService) {
		const showCellStatusBar = this.configurationService.getValue<boolean>(ShowCellStatusBarKey);
		const globalToolbar = this.configurationService.getValue<boolean | undefined>(ExperimentalGlobalToolbar) ?? false;
		const consolidatedOutputButton = this.configurationService.getValue<boolean | undefined>(ExperimentalConsolidatedOutputButton) ?? true;
		const dragAndDropEnabled = this.configurationService.getValue<boolean | undefined>(ExperimentalDragAndDropEnabled) ?? true;
		const cellToolbarLocation = this.configurationService.getValue<string | { [key: string]: string }>(CellToolbarLocKey);
		const cellToolbarInteraction = this.configurationService.getValue<string>(CellToolbarVisibility);
		const compactView = this.configurationService.getValue<boolean>(ExperimentalCompactView);
		const focusIndicator = this._computeFocusIndicatorOption();
		const insertToolbarPosition = this._computeInsertToolbarPositionOption();
		const showFoldingControls = this._computeShowFoldingControlsOption();
		const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(compactView, insertToolbarPosition);
		const fontSize = this.configurationService.getValue<number>('editor.fontSize');

		this._disposables = [];
		this._layoutConfiguration = {
			...(compactView ? compactConfigConstants : defaultConfigConstants),
			cellTopMargin: 6,
			cellBottomMargin: 6,
			cellRightMargin: 16,
			cellStatusBarHeight: 22,
			cellOutputPadding: 14,
			markdownPreviewPadding: 8,
			bottomToolbarHeight: bottomToolbarHeight,
			bottomToolbarGap: bottomToolbarGap,
			editorToolbarHeight: 0,
			editorTopPadding: EDITOR_TOP_PADDING,
			editorBottomPadding: 4,
			editorBottomPaddingWithoutStatusBar: 12,
			collapsedIndicatorHeight: 24,
			showCellStatusBar,
			globalToolbar,
			consolidatedOutputButton,
			dragAndDropEnabled,
			cellToolbarLocation,
			cellToolbarInteraction,
			compactView,
			focusIndicator,
			insertToolbarPosition,
			showFoldingControls,
			fontSize
		};

		this._disposables.push(this.configurationService.onDidChangeConfiguration(e => {
			this._updateConfiguration(e);
		}));

		this._disposables.push(EditorTopPaddingChangeEvent(() => {
			const configuration = Object.assign({}, this._layoutConfiguration);
			configuration.editorTopPadding = getEditorTopPadding();
			this._layoutConfiguration = configuration;
			this._onDidChangeOptions.fire({ editorTopPadding: true });
		}));
	}

	private _updateConfiguration(e: IConfigurationChangeEvent) {
		const cellStatusBarVisibility = e.affectsConfiguration(ShowCellStatusBarKey);
		const cellToolbarLocation = e.affectsConfiguration(CellToolbarLocKey);
		const cellToolbarInteraction = e.affectsConfiguration(CellToolbarVisibility);
		const compactView = e.affectsConfiguration(ExperimentalCompactView);
		const focusIndicator = e.affectsConfiguration(ExperimentalFocusIndicator);
		const insertToolbarPosition = e.affectsConfiguration(ExperimentalInsertToolbarPosition);
		const globalToolbar = e.affectsConfiguration(ExperimentalGlobalToolbar);
		const consolidatedOutputButton = e.affectsConfiguration(ExperimentalConsolidatedOutputButton);
		const showFoldingControls = e.affectsConfiguration(ExperimentalShowFoldingControls);
		const dragAndDropEnabled = e.affectsConfiguration(ExperimentalDragAndDropEnabled);
		const fontSize = e.affectsConfiguration('editor.fontSize');

		if (
			!cellStatusBarVisibility
			&& !cellToolbarLocation
			&& !cellToolbarInteraction
			&& !compactView
			&& !focusIndicator
			&& !insertToolbarPosition
			&& !globalToolbar
			&& !consolidatedOutputButton
			&& !showFoldingControls
			&& !dragAndDropEnabled
			&& !fontSize) {
			return;
		}

		let configuration = Object.assign({}, this._layoutConfiguration);

		if (cellStatusBarVisibility) {
			configuration.showCellStatusBar = this.configurationService.getValue<boolean>(ShowCellStatusBarKey);
		}

		if (cellToolbarLocation) {
			configuration.cellToolbarLocation = this.configurationService.getValue<string | { [key: string]: string }>(CellToolbarLocKey);
		}

		if (cellToolbarInteraction) {
			configuration.cellToolbarInteraction = this.configurationService.getValue<string>(CellToolbarVisibility);
		}

		if (focusIndicator) {
			configuration.focusIndicator = this._computeFocusIndicatorOption();
		}

		if (compactView) {
			const compactViewValue = this.configurationService.getValue<boolean>('notebook.experimental.compactView');
			configuration = Object.assign(configuration, {
				...(compactViewValue ? compactConfigConstants : defaultConfigConstants),
			});
			configuration.compactView = compactViewValue;
		}

		if (insertToolbarPosition) {
			configuration.insertToolbarPosition = this._computeInsertToolbarPositionOption();
			const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(configuration.compactView, configuration.insertToolbarPosition);
			configuration.bottomToolbarHeight = bottomToolbarHeight;
			configuration.bottomToolbarGap = bottomToolbarGap;
		}

		if (globalToolbar) {
			configuration.globalToolbar = this.configurationService.getValue<boolean | undefined>(ExperimentalGlobalToolbar) ?? false;
		}

		if (consolidatedOutputButton) {
			configuration.consolidatedOutputButton = this.configurationService.getValue<boolean | undefined>(ExperimentalConsolidatedOutputButton) ?? true;
		}

		if (showFoldingControls) {
			configuration.showFoldingControls = this._computeShowFoldingControlsOption();
		}

		if (dragAndDropEnabled) {
			configuration.dragAndDropEnabled = this.configurationService.getValue<boolean | undefined>(ExperimentalDragAndDropEnabled) ?? true;
		}

		if (fontSize) {
			configuration.fontSize = this.configurationService.getValue<number>('editor.fontSize');
		}

		this._layoutConfiguration = Object.freeze(configuration);

		// trigger event
		this._onDidChangeOptions.fire({
			cellStatusBarVisibility,
			cellToolbarLocation,
			cellToolbarInteraction,
			compactView,
			focusIndicator,
			insertToolbarPosition,
			globalToolbar,
			showFoldingControls,
			consolidatedOutputButton,
			dragAndDropEnabled,
			fontSize: fontSize
		});
	}

	private _computeInsertToolbarPositionOption() {
		return this.configurationService.getValue<'betweenCells' | 'notebookToolbar' | 'both' | 'hidden'>(ExperimentalInsertToolbarPosition) ?? 'both';
	}

	private _computeShowFoldingControlsOption() {
		return this.configurationService.getValue<'always' | 'mouseover'>(ExperimentalShowFoldingControls) ?? 'always';
	}

	private _computeFocusIndicatorOption() {
		return this.configurationService.getValue<'border' | 'gutter'>(ExperimentalFocusIndicator) ?? 'border';
	}

	private _computeBottomToolbarDimensions(compactView: boolean, insertToolbarPosition: 'betweenCells' | 'notebookToolbar' | 'both' | 'hidden'): { bottomToolbarGap: number, bottomToolbarHeight: number } {
		if (insertToolbarPosition === 'betweenCells' || insertToolbarPosition === 'both') {
			return compactView ? {
				bottomToolbarGap: 12,
				bottomToolbarHeight: 22
			} : {
				bottomToolbarGap: 18,
				bottomToolbarHeight: 22
			};
		} else {
			return {
				bottomToolbarGap: 0,
				bottomToolbarHeight: 0
			};
		}
	}

	getLayoutConfiguration(): NotebookLayoutConfiguration {
		return this._layoutConfiguration;
	}

	computeCollapsedMarkdownCellHeight(): number {
		return this._layoutConfiguration.markdownCellTopMargin
			+ this._layoutConfiguration.collapsedIndicatorHeight
			+ this._layoutConfiguration.bottomToolbarGap
			+ this._layoutConfiguration.markdownCellBottomMargin;
	}

	computeBottomToolbarOffset(totalHeight: number) {
		return totalHeight
			- this._layoutConfiguration.bottomToolbarGap
			- this._layoutConfiguration.bottomToolbarHeight / 2;
	}

	computeCodeCellEditorWidth(outerWidth: number): number {
		return outerWidth - (
			this._layoutConfiguration.codeCellLeftMargin
			+ this._layoutConfiguration.cellRunGutter
			+ this._layoutConfiguration.cellRightMargin
		);
	}

	computeMarkdownCellEditorWidth(outerWidth: number): number {
		return outerWidth
			- this._layoutConfiguration.codeCellLeftMargin
			- this._layoutConfiguration.cellRightMargin;
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
				? this._layoutConfiguration.editorBottomPadding
				: this._layoutConfiguration.editorBottomPaddingWithoutStatusBar
		};
	}

	computeWebviewOptions() {
		return {
			outputNodePadding: this._layoutConfiguration.cellOutputPadding,
			outputNodeLeftPadding: this._layoutConfiguration.cellOutputPadding,
			previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
			markdownLeftMargin: this._layoutConfiguration.markdownCellLeftMargin,
			leftMargin: this._layoutConfiguration.codeCellLeftMargin,
			rightMargin: this._layoutConfiguration.cellRightMargin,
			runGutter: this._layoutConfiguration.cellRunGutter,
			dragAndDropEnabled: this._layoutConfiguration.dragAndDropEnabled,
			fontSize: this._layoutConfiguration.fontSize
		};
	}

	computeDiffWebviewOptions() {
		return {
			outputNodePadding: this._layoutConfiguration.cellOutputPadding,
			outputNodeLeftPadding: 32,
			previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
			markdownLeftMargin: 0,
			leftMargin: 0,
			rightMargin: 0,
			runGutter: 0,
			dragAndDropEnabled: false,
			fontSize: this._layoutConfiguration.fontSize
		};
	}

	computeIndicatorPosition(totalHeight: number) {
		return {
			bottomIndicatorTop: totalHeight - this._layoutConfiguration.bottomToolbarGap - this._layoutConfiguration.cellBottomMargin,
			verticalIndicatorHeight: totalHeight - this._layoutConfiguration.bottomToolbarGap
		};
	}

	computeTopInserToolbarHeight(viewType?: string): number {
		if (this._layoutConfiguration.insertToolbarPosition === 'betweenCells' || this._layoutConfiguration.insertToolbarPosition === 'both') {
			return SCROLLABLE_ELEMENT_PADDING_TOP;
		}

		const cellToolbarLocation = this.computeCellToolbarLocation(viewType);

		if (cellToolbarLocation === 'left' || cellToolbarLocation === 'right') {
			return SCROLLABLE_ELEMENT_PADDING_TOP;
		}

		return 0;
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
		this._disposables = [];
	}
}
