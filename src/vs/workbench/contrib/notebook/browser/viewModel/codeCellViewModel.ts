/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { dispose } from 'vs/base/common/lifecycle';
import * as UUID from 'vs/base/common/uuid';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { CellEditState, CellFindMatch, CodeCellLayoutChangeEvent, CodeCellLayoutInfo, CellLayoutState, ICellOutputViewModel, ICellViewModel, NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellOutputViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/cellOutputViewModel';
import { ViewContext } from 'vs/workbench/contrib/notebook/browser/viewModel/viewContext';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellKind, INotebookSearchOptions, NotebookCellOutputsSplice } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { BaseCellViewModel } from './baseCellViewModel';

export class CodeCellViewModel extends BaseCellViewModel implements ICellViewModel {
	readonly cellKind = CellKind.Code;
	protected readonly _onDidChangeOutputs = this._register(new Emitter<NotebookCellOutputsSplice>());
	readonly onDidChangeOutputs = this._onDidChangeOutputs.event;

	private readonly _onDidRemoveOutputs = this._register(new Emitter<readonly ICellOutputViewModel[]>());
	readonly onDidRemoveOutputs = this._onDidRemoveOutputs.event;

	private readonly _onDidHideInput = this._register(new Emitter<void>());
	readonly onDidHideInput = this._onDidHideInput.event;

	private readonly _onDidHideOutputs = this._register(new Emitter<readonly ICellOutputViewModel[]>());
	readonly onDidHideOutputs = this._onDidHideOutputs.event;

	private _outputCollection: number[] = [];

	private _outputsTop: PrefixSumComputer | null = null;

	protected readonly _onDidChangeLayout = this._register(new Emitter<CodeCellLayoutChangeEvent>());
	readonly onDidChangeLayout = this._onDidChangeLayout.event;

	private _editorHeight = 0;
	set editorHeight(height: number) {
		this._editorHeight = height;

		this.layoutChange({ editorHeight: true }, 'CodeCellViewModel#editorHeight');
	}

	get editorHeight() {
		throw new Error('editorHeight is write-only');
	}

	private _hoveringOutput: boolean = false;
	public get outputIsHovered(): boolean {
		return this._hoveringOutput;
	}

	public set outputIsHovered(v: boolean) {
		this._hoveringOutput = v;
		this._onDidChangeState.fire({ outputIsHoveredChanged: true });
	}

	private _focusOnOutput: boolean = false;
	public get outputIsFocused(): boolean {
		return this._focusOnOutput;
	}

	public set outputIsFocused(v: boolean) {
		this._focusOnOutput = v;
		this._onDidChangeState.fire({ outputIsFocusedChanged: true });
	}

	private _outputMinHeight: number = 0;

	private get outputMinHeight() {
		return this._outputMinHeight;
	}

	/**
	 * The minimum height of the output region. It's only set to non-zero temporarily when replacing an output with a new one.
	 * It's reset to 0 when the new output is rendered, or in one second.
	 */
	private set outputMinHeight(newMin: number) {
		this._outputMinHeight = newMin;
	}

	private _layoutInfo: CodeCellLayoutInfo;

	get layoutInfo() {
		return this._layoutInfo;
	}

	private _outputViewModels: ICellOutputViewModel[];

	get outputsViewModels() {
		return this._outputViewModels;
	}

	constructor(
		viewType: string,
		model: NotebookCellTextModel,
		initialNotebookLayoutInfo: NotebookLayoutInfo | null,
		readonly viewContext: ViewContext,
		@IConfigurationService configurationService: IConfigurationService,
		@INotebookService private readonly _notebookService: INotebookService,
		@ITextModelService modelService: ITextModelService,
		@IUndoRedoService undoRedoService: IUndoRedoService
	) {
		super(viewType, model, UUID.generateUuid(), viewContext, configurationService, modelService, undoRedoService);
		this._outputViewModels = this.model.outputs.map(output => new CellOutputViewModel(this, output, this._notebookService));

		this._register(this.model.onDidChangeOutputs((splice) => {
			const removedOutputs: ICellOutputViewModel[] = [];
			this._outputCollection.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(() => 0));
			removedOutputs.push(...this._outputViewModels.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(output => new CellOutputViewModel(this, output, this._notebookService))));

			this._outputsTop = null;
			this._onDidChangeOutputs.fire(splice);
			this._onDidRemoveOutputs.fire(removedOutputs);
			this.layoutChange({ outputHeight: true }, 'CodeCellViewModel#model.onDidChangeOutputs');
			dispose(removedOutputs);
		}));

		this._register(this.model.onDidChangeMetadata(e => {
			if (this.metadata.outputCollapsed) {
				this._onDidHideOutputs.fire(this.outputsViewModels.slice(0));
			}

			if (this.metadata.inputCollapsed) {
				this._onDidHideInput.fire();
			}
		}));

		this._register(this.viewContext.notebookOptions.onDidChangeOptions(e => {
			if (e.cellStatusBarVisibility || e.insertToolbarPosition || e.cellToolbarLocation) {
				this.layoutChange({});
			}
		}));

		this._outputCollection = new Array(this.model.outputs.length);

		this._layoutInfo = {
			fontInfo: initialNotebookLayoutInfo?.fontInfo || null,
			editorHeight: 0,
			editorWidth: initialNotebookLayoutInfo
				? this.viewContext.notebookOptions.computeCodeCellEditorWidth(initialNotebookLayoutInfo.width)
				: 0,
			outputContainerOffset: 0,
			outputTotalHeight: 0,
			outputShowMoreContainerHeight: 0,
			outputShowMoreContainerOffset: 0,
			totalHeight: this.computeTotalHeight(17, 0, 0),
			indicatorHeight: 0,
			bottomToolbarOffset: 0,
			layoutState: CellLayoutState.Uninitialized
		};
	}

	layoutChange(state: CodeCellLayoutChangeEvent, source?: string) {
		// recompute
		this._ensureOutputsTop();
		const notebookLayoutConfiguration = this.viewContext.notebookOptions.getLayoutConfiguration();
		const bottomToolbarDimensions = this.viewContext.notebookOptions.computeBottomToolbarDimensions();
		const outputShowMoreContainerHeight = state.outputShowMoreContainerHeight ? state.outputShowMoreContainerHeight : this._layoutInfo.outputShowMoreContainerHeight;
		let outputTotalHeight = Math.max(this._outputMinHeight, this.metadata.outputCollapsed ? notebookLayoutConfiguration.collapsedIndicatorHeight : this._outputsTop!.getTotalSum());

		const originalLayout = this.layoutInfo;
		if (!this.metadata.inputCollapsed) {
			let newState: CellLayoutState;
			let editorHeight: number;
			let totalHeight: number;
			if (!state.editorHeight && this._layoutInfo.layoutState === CellLayoutState.FromCache && !state.outputHeight) {
				// No new editorHeight info - keep cached totalHeight and estimate editorHeight
				editorHeight = this.estimateEditorHeight(state.font?.lineHeight ?? this._layoutInfo.fontInfo?.lineHeight);
				totalHeight = this._layoutInfo.totalHeight;
				newState = CellLayoutState.FromCache;
			} else if (state.editorHeight || this._layoutInfo.layoutState === CellLayoutState.Measured) {
				// Editor has been measured
				editorHeight = this._editorHeight;
				totalHeight = this.computeTotalHeight(this._editorHeight, outputTotalHeight, outputShowMoreContainerHeight);
				newState = CellLayoutState.Measured;
			} else {
				editorHeight = this.estimateEditorHeight(state.font?.lineHeight ?? this._layoutInfo.fontInfo?.lineHeight);
				totalHeight = this.computeTotalHeight(editorHeight, outputTotalHeight, outputShowMoreContainerHeight);
				newState = CellLayoutState.Estimated;
			}

			const statusbarHeight = this.viewContext.notebookOptions.computeEditorStatusbarHeight(this.internalMetadata);
			const indicatorHeight = editorHeight + statusbarHeight + outputTotalHeight + outputShowMoreContainerHeight;
			const outputContainerOffset = notebookLayoutConfiguration.editorToolbarHeight
				+ notebookLayoutConfiguration.cellTopMargin // CELL_TOP_MARGIN
				+ editorHeight
				+ statusbarHeight;
			const outputShowMoreContainerOffset = totalHeight
				- bottomToolbarDimensions.bottomToolbarGap
				- bottomToolbarDimensions.bottomToolbarHeight / 2
				- outputShowMoreContainerHeight;
			const bottomToolbarOffset = this.viewContext.notebookOptions.computeBottomToolbarOffset(totalHeight, this.viewType);
			const editorWidth = state.outerWidth !== undefined
				? this.viewContext.notebookOptions.computeCodeCellEditorWidth(state.outerWidth)
				: this._layoutInfo?.editorWidth;

			this._layoutInfo = {
				fontInfo: state.font ?? this._layoutInfo.fontInfo ?? null,
				editorHeight,
				editorWidth,
				outputContainerOffset,
				outputTotalHeight,
				outputShowMoreContainerHeight,
				outputShowMoreContainerOffset,
				totalHeight,
				indicatorHeight,
				bottomToolbarOffset,
				layoutState: newState
			};
		} else {
			const indicatorHeight = notebookLayoutConfiguration.collapsedIndicatorHeight + outputTotalHeight + outputShowMoreContainerHeight;

			const outputContainerOffset = notebookLayoutConfiguration.cellTopMargin + notebookLayoutConfiguration.collapsedIndicatorHeight;
			const totalHeight =
				notebookLayoutConfiguration.cellTopMargin
				+ notebookLayoutConfiguration.collapsedIndicatorHeight
				+ notebookLayoutConfiguration.cellBottomMargin //CELL_BOTTOM_MARGIN
				+ bottomToolbarDimensions.bottomToolbarGap //BOTTOM_CELL_TOOLBAR_GAP
				+ outputTotalHeight + outputShowMoreContainerHeight;
			const outputShowMoreContainerOffset = totalHeight
				- bottomToolbarDimensions.bottomToolbarGap
				- bottomToolbarDimensions.bottomToolbarHeight / 2
				- outputShowMoreContainerHeight;
			const bottomToolbarOffset = this.viewContext.notebookOptions.computeBottomToolbarOffset(totalHeight, this.viewType);
			const editorWidth = state.outerWidth !== undefined
				? this.viewContext.notebookOptions.computeCodeCellEditorWidth(state.outerWidth)
				: this._layoutInfo?.editorWidth;

			this._layoutInfo = {
				fontInfo: state.font ?? this._layoutInfo.fontInfo ?? null,
				editorHeight: this._layoutInfo.editorHeight,
				editorWidth,
				outputContainerOffset,
				outputTotalHeight,
				outputShowMoreContainerHeight,
				outputShowMoreContainerOffset,
				totalHeight,
				indicatorHeight,
				bottomToolbarOffset,
				layoutState: this._layoutInfo.layoutState
			};
		}

		state.totalHeight = this.layoutInfo.totalHeight !== originalLayout.totalHeight;
		state.source = source;

		this._fireOnDidChangeLayout(state);
	}

	private _fireOnDidChangeLayout(state: CodeCellLayoutChangeEvent) {
		this._onDidChangeLayout.fire(state);
	}

	override restoreEditorViewState(editorViewStates: editorCommon.ICodeEditorViewState | null, totalHeight?: number) {
		super.restoreEditorViewState(editorViewStates);
		if (totalHeight !== undefined && this._layoutInfo.layoutState !== CellLayoutState.Measured) {
			this._layoutInfo = {
				fontInfo: this._layoutInfo.fontInfo,
				editorHeight: this._layoutInfo.editorHeight,
				editorWidth: this._layoutInfo.editorWidth,
				outputContainerOffset: this._layoutInfo.outputContainerOffset,
				outputTotalHeight: this._layoutInfo.outputTotalHeight,
				outputShowMoreContainerHeight: this._layoutInfo.outputShowMoreContainerHeight,
				outputShowMoreContainerOffset: this._layoutInfo.outputShowMoreContainerOffset,
				totalHeight: totalHeight,
				indicatorHeight: this._layoutInfo.indicatorHeight,
				bottomToolbarOffset: this._layoutInfo.bottomToolbarOffset,
				layoutState: CellLayoutState.FromCache
			};
		}
	}

	hasDynamicHeight() {
		// CodeCellVM always measures itself and controls its cell's height
		return false;
	}

	firstLine(): string {
		return this.getText().split('\n')[0];
	}

	getHeight(lineHeight: number) {
		if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
			const editorHeight = this.estimateEditorHeight(lineHeight);
			return this.computeTotalHeight(editorHeight, 0, 0);
		} else {
			return this._layoutInfo.totalHeight;
		}
	}

	private estimateEditorHeight(lineHeight: number | undefined = 20): number {
		let hasScrolling = false;
		if (this.layoutInfo.fontInfo) {
			for (let i = 0; i < this.lineCount; i++) {
				const max = this.textBuffer.getLineLastNonWhitespaceColumn(i + 1);
				const estimatedWidth = max * (this.layoutInfo.fontInfo.typicalHalfwidthCharacterWidth + this.layoutInfo.fontInfo.letterSpacing);
				if (estimatedWidth > this.layoutInfo.editorWidth) {
					hasScrolling = true;
					break;
				}
			}
		}

		const verticalScrollbarHeight = hasScrolling ? 12 : 0; // take zoom level into account
		const editorPadding = this.viewContext.notebookOptions.computeEditorPadding(this.internalMetadata);
		return this.lineCount * lineHeight
			+ editorPadding.top
			+ editorPadding.bottom // EDITOR_BOTTOM_PADDING
			+ verticalScrollbarHeight;
	}

	private computeTotalHeight(editorHeight: number, outputsTotalHeight: number, outputShowMoreContainerHeight: number): number {
		const layoutConfiguration = this.viewContext.notebookOptions.getLayoutConfiguration();
		const { bottomToolbarGap } = this.viewContext.notebookOptions.computeBottomToolbarDimensions(this.viewType);
		return layoutConfiguration.editorToolbarHeight
			+ layoutConfiguration.cellTopMargin
			+ editorHeight
			+ this.viewContext.notebookOptions.computeEditorStatusbarHeight(this.internalMetadata)
			+ outputsTotalHeight
			+ outputShowMoreContainerHeight
			+ bottomToolbarGap
			+ layoutConfiguration.cellBottomMargin;
	}

	protected onDidChangeTextModelContent(): void {
		if (this.getEditState() !== CellEditState.Editing) {
			this.updateEditState(CellEditState.Editing, 'onDidChangeTextModelContent');
			this._onDidChangeState.fire({ contentChanged: true });
		}
	}

	onDeselect() {
		this.updateEditState(CellEditState.Preview, 'onDeselect');
	}

	updateOutputShowMoreContainerHeight(height: number) {
		this.layoutChange({ outputShowMoreContainerHeight: height }, 'CodeCellViewModel#updateOutputShowMoreContainerHeight');
	}

	updateOutputMinHeight(height: number) {
		this.outputMinHeight = height;
	}

	updateOutputHeight(index: number, height: number, source?: string) {
		if (index >= this._outputCollection.length) {
			throw new Error('Output index out of range!');
		}

		this._ensureOutputsTop();
		if (height < 28 && this._outputViewModels[index].hasMultiMimeType()) {
			height = 28;
		}

		this._outputCollection[index] = height;
		if (this._outputsTop!.changeValue(index, height)) {
			this.layoutChange({ outputHeight: true }, source);
		}
	}

	getOutputOffsetInContainer(index: number) {
		this._ensureOutputsTop();

		if (index >= this._outputCollection.length) {
			throw new Error('Output index out of range!');
		}

		return this._outputsTop!.getPrefixSum(index - 1);
	}

	getOutputOffset(index: number): number {
		return this.layoutInfo.outputContainerOffset + this.getOutputOffsetInContainer(index);
	}

	spliceOutputHeights(start: number, deleteCnt: number, heights: number[]) {
		this._ensureOutputsTop();

		this._outputsTop!.removeValues(start, deleteCnt);
		if (heights.length) {
			const values = new Uint32Array(heights.length);
			for (let i = 0; i < heights.length; i++) {
				values[i] = heights[i];
			}

			this._outputsTop!.insertValues(start, values);
		}

		this.layoutChange({ outputHeight: true }, 'CodeCellViewModel#spliceOutputs');
	}

	private _ensureOutputsTop(): void {
		if (!this._outputsTop) {
			const values = new Uint32Array(this._outputCollection.length);
			for (let i = 0; i < this._outputCollection.length; i++) {
				values[i] = this._outputCollection[i];
			}

			this._outputsTop = new PrefixSumComputer(values);
		}
	}

	private readonly _hasFindResult = this._register(new Emitter<boolean>());
	public readonly hasFindResult: Event<boolean> = this._hasFindResult.event;

	startFind(value: string, options: INotebookSearchOptions): CellFindMatch | null {
		const matches = super.cellStartFind(value, options);

		if (matches === null) {
			return null;
		}

		return {
			cell: this,
			matches
		};
	}

	override dispose() {
		super.dispose();

		this._outputCollection = [];
		this._outputsTop = null;
		dispose(this._outputViewModels);
	}
}
