/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CellToolbarLocation, CellToolbarVisibility, CompactView, ConsolidatedOutputButton, ConsolidatedRunButton, DragAndDropEnabled, ExperimentalInsertToolbarAlignment, FocusIndicator, GlobalToolbar, InsertToolbarLocation, NotebookCellEditorOptionsCustomizations, NotebookCellInternalMetadata, ShowCellStatusBar, ShowCellStatusBarType, ShowFoldingControls } from 'vs/workbench/contrib/notebook/common/notebookCommon';

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

export const OutputInnerContainerTopPadding = 4;

export interface NotebookLayoutConfiguration {
	cellRightMargin: number;
	cellRunGutter: number;
	cellTopMargin: number;
	cellBottomMargin: number;
	cellOutputPadding: number;
	codeCellLeftMargin: number;
	markdownCellLeftMargin: number;
	markdownCellGutter: number;
	markdownCellTopMargin: number;
	markdownCellBottomMargin: number;
	markdownPreviewPadding: number;
	// bottomToolbarGap: number;
	// bottomToolbarHeight: number;
	editorToolbarHeight: number;
	editorTopPadding: number;
	editorBottomPadding: number;
	editorBottomPaddingWithoutStatusBar: number;
	collapsedIndicatorHeight: number;
	showCellStatusBar: ShowCellStatusBarType;
	cellStatusBarHeight: number;
	cellToolbarLocation: string | { [key: string]: string; };
	cellToolbarInteraction: string;
	compactView: boolean;
	focusIndicator: 'border' | 'gutter';
	insertToolbarPosition: 'betweenCells' | 'notebookToolbar' | 'both' | 'hidden';
	insertToolbarAlignment: 'left' | 'center';
	globalToolbar: boolean;
	consolidatedOutputButton: boolean;
	consolidatedRunButton: boolean;
	showFoldingControls: 'always' | 'mouseover';
	dragAndDropEnabled: boolean;
	fontSize: number;
	focusIndicatorLeftMargin: number;
	editorOptionsCustomizations: any | undefined;
}

export interface NotebookOptionsChangeEvent {
	cellStatusBarVisibility?: boolean;
	cellToolbarLocation?: boolean;
	cellToolbarInteraction?: boolean;
	editorTopPadding?: boolean;
	compactView?: boolean;
	focusIndicator?: boolean;
	insertToolbarPosition?: boolean;
	insertToolbarAlignment?: boolean;
	globalToolbar?: boolean;
	showFoldingControls?: boolean;
	consolidatedOutputButton?: boolean;
	consolidatedRunButton?: boolean;
	dragAndDropEnabled?: boolean;
	fontSize?: boolean;
	editorOptionsCustomizations?: boolean;
	cellBreakpointMargin?: boolean;
}

const defaultConfigConstants = {
	codeCellLeftMargin: 28,
	cellRunGutter: 32,
	markdownCellTopMargin: 8,
	markdownCellBottomMargin: 8,
	markdownCellLeftMargin: 0,
	markdownCellGutter: 32,
	focusIndicatorLeftMargin: 4
};

const compactConfigConstants = {
	codeCellLeftMargin: 8,
	cellRunGutter: 36,
	markdownCellTopMargin: 6,
	markdownCellBottomMargin: 6,
	markdownCellLeftMargin: 8,
	markdownCellGutter: 36,
	focusIndicatorLeftMargin: 4
};

export class NotebookOptions extends Disposable {
	private _layoutConfiguration: NotebookLayoutConfiguration;
	protected readonly _onDidChangeOptions = this._register(new Emitter<NotebookOptionsChangeEvent>());
	readonly onDidChangeOptions = this._onDidChangeOptions.event;

	constructor(private readonly configurationService: IConfigurationService, private readonly overrides?: { cellToolbarInteraction: string, globalToolbar: boolean }) {
		super();
		const showCellStatusBar = this.configurationService.getValue<ShowCellStatusBarType>(ShowCellStatusBar);
		const globalToolbar = overrides?.globalToolbar ?? this.configurationService.getValue<boolean | undefined>(GlobalToolbar) ?? true;
		const consolidatedOutputButton = this.configurationService.getValue<boolean | undefined>(ConsolidatedOutputButton) ?? true;
		const consolidatedRunButton = this.configurationService.getValue<boolean | undefined>(ConsolidatedRunButton) ?? false;
		const dragAndDropEnabled = this.configurationService.getValue<boolean | undefined>(DragAndDropEnabled) ?? true;
		const cellToolbarLocation = this.configurationService.getValue<string | { [key: string]: string; }>(CellToolbarLocation) ?? { 'default': 'right' };
		const cellToolbarInteraction = overrides?.cellToolbarInteraction ?? this.configurationService.getValue<string>(CellToolbarVisibility);
		const compactView = this.configurationService.getValue<boolean | undefined>(CompactView) ?? true;
		const focusIndicator = this._computeFocusIndicatorOption();
		const insertToolbarPosition = this._computeInsertToolbarPositionOption();
		const insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
		const showFoldingControls = this._computeShowFoldingControlsOption();
		// const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(compactView, insertToolbarPosition, insertToolbarAlignment);
		const fontSize = this.configurationService.getValue<number>('editor.fontSize');
		const editorOptionsCustomizations = this.configurationService.getValue(NotebookCellEditorOptionsCustomizations);

		this._layoutConfiguration = {
			...(compactView ? compactConfigConstants : defaultConfigConstants),
			cellTopMargin: 6,
			cellBottomMargin: 6,
			cellRightMargin: 16,
			cellStatusBarHeight: 22,
			cellOutputPadding: 12,
			markdownPreviewPadding: 8,
			// bottomToolbarHeight: bottomToolbarHeight,
			// bottomToolbarGap: bottomToolbarGap,
			editorToolbarHeight: 0,
			editorTopPadding: EDITOR_TOP_PADDING,
			editorBottomPadding: 4,
			editorBottomPaddingWithoutStatusBar: 12,
			collapsedIndicatorHeight: 28,
			showCellStatusBar,
			globalToolbar,
			consolidatedOutputButton,
			consolidatedRunButton,
			dragAndDropEnabled,
			cellToolbarLocation,
			cellToolbarInteraction,
			compactView,
			focusIndicator,
			insertToolbarPosition,
			insertToolbarAlignment,
			showFoldingControls,
			fontSize,
			editorOptionsCustomizations,
		};

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			this._updateConfiguration(e);
		}));

		this._register(EditorTopPaddingChangeEvent(() => {
			const configuration = Object.assign({}, this._layoutConfiguration);
			configuration.editorTopPadding = getEditorTopPadding();
			this._layoutConfiguration = configuration;
			this._onDidChangeOptions.fire({ editorTopPadding: true });
		}));
	}

	private _updateConfiguration(e: IConfigurationChangeEvent) {
		const cellStatusBarVisibility = e.affectsConfiguration(ShowCellStatusBar);
		const cellToolbarLocation = e.affectsConfiguration(CellToolbarLocation);
		const cellToolbarInteraction = e.affectsConfiguration(CellToolbarVisibility);
		const compactView = e.affectsConfiguration(CompactView);
		const focusIndicator = e.affectsConfiguration(FocusIndicator);
		const insertToolbarPosition = e.affectsConfiguration(InsertToolbarLocation);
		const insertToolbarAlignment = e.affectsConfiguration(ExperimentalInsertToolbarAlignment);
		const globalToolbar = e.affectsConfiguration(GlobalToolbar);
		const consolidatedOutputButton = e.affectsConfiguration(ConsolidatedOutputButton);
		const consolidatedRunButton = e.affectsConfiguration(ConsolidatedRunButton);
		const showFoldingControls = e.affectsConfiguration(ShowFoldingControls);
		const dragAndDropEnabled = e.affectsConfiguration(DragAndDropEnabled);
		const fontSize = e.affectsConfiguration('editor.fontSize');
		const editorOptionsCustomizations = e.affectsConfiguration(NotebookCellEditorOptionsCustomizations);

		if (
			!cellStatusBarVisibility
			&& !cellToolbarLocation
			&& !cellToolbarInteraction
			&& !compactView
			&& !focusIndicator
			&& !insertToolbarPosition
			&& !insertToolbarAlignment
			&& !globalToolbar
			&& !consolidatedOutputButton
			&& !consolidatedRunButton
			&& !showFoldingControls
			&& !dragAndDropEnabled
			&& !fontSize
			&& !editorOptionsCustomizations) {
			return;
		}

		let configuration = Object.assign({}, this._layoutConfiguration);

		if (cellStatusBarVisibility) {
			configuration.showCellStatusBar = this.configurationService.getValue<ShowCellStatusBarType>(ShowCellStatusBar);
		}

		if (cellToolbarLocation) {
			configuration.cellToolbarLocation = this.configurationService.getValue<string | { [key: string]: string; }>(CellToolbarLocation) ?? { 'default': 'right' };
		}

		if (cellToolbarInteraction && !this.overrides?.cellToolbarInteraction) {
			configuration.cellToolbarInteraction = this.configurationService.getValue<string>(CellToolbarVisibility);
		}

		if (focusIndicator) {
			configuration.focusIndicator = this._computeFocusIndicatorOption();
		}

		if (compactView) {
			const compactViewValue = this.configurationService.getValue<boolean | undefined>(CompactView) ?? true;
			configuration = Object.assign(configuration, {
				...(compactViewValue ? compactConfigConstants : defaultConfigConstants),
			});
			configuration.compactView = compactViewValue;
		}

		if (insertToolbarAlignment) {
			configuration.insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
		}

		if (insertToolbarPosition) {
			configuration.insertToolbarPosition = this._computeInsertToolbarPositionOption();
		}

		if (globalToolbar && this.overrides?.globalToolbar === undefined) {
			configuration.globalToolbar = this.configurationService.getValue<boolean>(GlobalToolbar) ?? true;
		}

		if (consolidatedOutputButton) {
			configuration.consolidatedOutputButton = this.configurationService.getValue<boolean>(ConsolidatedOutputButton) ?? true;
		}

		if (consolidatedRunButton) {
			configuration.consolidatedRunButton = this.configurationService.getValue<boolean>(ConsolidatedRunButton) ?? true;
		}

		if (showFoldingControls) {
			configuration.showFoldingControls = this._computeShowFoldingControlsOption();
		}

		if (dragAndDropEnabled) {
			configuration.dragAndDropEnabled = this.configurationService.getValue<boolean>(DragAndDropEnabled) ?? true;
		}

		if (fontSize) {
			configuration.fontSize = this.configurationService.getValue<number>('editor.fontSize');
		}

		if (editorOptionsCustomizations) {
			configuration.editorOptionsCustomizations = this.configurationService.getValue(NotebookCellEditorOptionsCustomizations);
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
			insertToolbarAlignment,
			globalToolbar,
			showFoldingControls,
			consolidatedOutputButton,
			consolidatedRunButton,
			dragAndDropEnabled,
			fontSize,
			editorOptionsCustomizations
		});
	}

	private _computeInsertToolbarPositionOption() {
		return this.configurationService.getValue<'betweenCells' | 'notebookToolbar' | 'both' | 'hidden'>(InsertToolbarLocation) ?? 'both';
	}

	private _computeInsertToolbarAlignmentOption() {
		return this.configurationService.getValue<'left' | 'center'>(ExperimentalInsertToolbarAlignment) ?? 'center';
	}

	private _computeShowFoldingControlsOption() {
		return this.configurationService.getValue<'always' | 'mouseover'>(ShowFoldingControls) ?? 'mouseover';
	}

	private _computeFocusIndicatorOption() {
		return this.configurationService.getValue<'border' | 'gutter'>(FocusIndicator) ?? 'gutter';
	}

	getLayoutConfiguration(): NotebookLayoutConfiguration {
		return this._layoutConfiguration;
	}

	computeCollapsedMarkdownCellHeight(viewType: string): number {
		const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);
		return this._layoutConfiguration.markdownCellTopMargin
			+ this._layoutConfiguration.collapsedIndicatorHeight
			+ bottomToolbarGap
			+ this._layoutConfiguration.markdownCellBottomMargin;
	}

	computeBottomToolbarOffset(totalHeight: number, viewType: string) {
		const { bottomToolbarGap, bottomToolbarHeight } = this.computeBottomToolbarDimensions(viewType);

		return totalHeight
			- bottomToolbarGap
			- bottomToolbarHeight / 2;
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
			- this._layoutConfiguration.markdownCellGutter
			- this._layoutConfiguration.markdownCellLeftMargin
			- this._layoutConfiguration.cellRightMargin;
	}

	computeStatusBarHeight(): number {
		return this._layoutConfiguration.cellStatusBarHeight;
	}

	private _computeBottomToolbarDimensions(compactView: boolean, insertToolbarPosition: 'betweenCells' | 'notebookToolbar' | 'both' | 'hidden', insertToolbarAlignment: 'left' | 'center', cellToolbar: 'right' | 'left' | 'hidden'): { bottomToolbarGap: number, bottomToolbarHeight: number; } {
		if (insertToolbarAlignment === 'left' || cellToolbar !== 'hidden') {
			return {
				bottomToolbarGap: 18,
				bottomToolbarHeight: 18
			};
		}

		if (insertToolbarPosition === 'betweenCells' || insertToolbarPosition === 'both') {
			return compactView ? {
				bottomToolbarGap: 12,
				bottomToolbarHeight: 20
			} : {
				bottomToolbarGap: 20,
				bottomToolbarHeight: 20
			};
		} else {
			return {
				bottomToolbarGap: 0,
				bottomToolbarHeight: 0
			};
		}
	}

	computeBottomToolbarDimensions(viewType?: string): { bottomToolbarGap: number, bottomToolbarHeight: number; } {
		const configuration = this._layoutConfiguration;
		const cellToolbarPosition = this.computeCellToolbarLocation(viewType);
		const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(configuration.compactView, configuration.insertToolbarPosition, configuration.insertToolbarAlignment, cellToolbarPosition);
		return {
			bottomToolbarGap,
			bottomToolbarHeight
		};
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

	computeEditorPadding(internalMetadata: NotebookCellInternalMetadata) {
		return {
			top: getEditorTopPadding(),
			bottom: this.statusBarIsVisible(internalMetadata)
				? this._layoutConfiguration.editorBottomPadding
				: this._layoutConfiguration.editorBottomPaddingWithoutStatusBar
		};
	}


	computeEditorStatusbarHeight(internalMetadata: NotebookCellInternalMetadata) {
		return this.statusBarIsVisible(internalMetadata) ? this.computeStatusBarHeight() : 0;
	}

	private statusBarIsVisible(internalMetadata: NotebookCellInternalMetadata): boolean {
		if (this._layoutConfiguration.showCellStatusBar === 'visible') {
			return true;
		} else if (this._layoutConfiguration.showCellStatusBar === 'visibleAfterExecute') {
			return typeof internalMetadata.lastRunSuccess === 'boolean' || internalMetadata.runState !== undefined;
		} else {
			return false;
		}
	}

	computeWebviewOptions() {
		return {
			outputNodePadding: this._layoutConfiguration.cellOutputPadding,
			outputNodeLeftPadding: this._layoutConfiguration.cellOutputPadding,
			previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
			markdownLeftMargin: this._layoutConfiguration.markdownCellGutter + this._layoutConfiguration.markdownCellLeftMargin,
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
			outputNodeLeftPadding: 0,
			previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
			markdownLeftMargin: 0,
			leftMargin: 32,
			rightMargin: 0,
			runGutter: 0,
			dragAndDropEnabled: false,
			fontSize: this._layoutConfiguration.fontSize
		};
	}

	computeIndicatorPosition(totalHeight: number, viewType?: string) {
		const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);

		return {
			bottomIndicatorTop: totalHeight - bottomToolbarGap - this._layoutConfiguration.cellBottomMargin,
			verticalIndicatorHeight: totalHeight - bottomToolbarGap
		};
	}

	setCellBreakpointMarginActive(active: boolean) {
		this._layoutConfiguration = { ...this._layoutConfiguration, ...{ cellBreakpointMarginActive: active } };
		this._onDidChangeOptions.fire({ cellBreakpointMargin: true });
	}
}
