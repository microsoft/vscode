/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { hash } from '../../../../../base/common/hash.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { FontInfo } from '../../../../../editor/common/config/fontInfo.js';
import * as editorCommon from '../../../../../editor/common/editorCommon.js';
import { getEditorPadding } from './diffCellEditorOptions.js';
import { DiffNestedCellViewModel } from './diffNestedCellViewModel.js';
import { NotebookDiffEditorEventDispatcher, NotebookDiffViewEventType } from './eventDispatcher.js';
import { CellDiffViewModelLayoutChangeEvent, DIFF_CELL_MARGIN, DiffSide, IDiffElementLayoutInfo } from './notebookDiffEditorBrowser.js';
import { CellLayoutState, IGenericCellViewModel } from '../notebookBrowser.js';
import { NotebookLayoutInfo } from '../notebookViewEvents.js';
import { getFormattedMetadataJSON, NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { CellUri, ICellOutput, INotebookTextModel, IOutputDto, IOutputItemDto } from '../../common/notebookCommon.js';
import { INotebookService } from '../../common/notebookService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IDiffEditorHeightCalculatorService } from './editorHeightCalculator.js';
import { NotebookDocumentMetadataTextModel } from '../../common/model/notebookMetadataTextModel.js';

const PropertyHeaderHeight = 25;

// From `.monaco-editor .diff-hidden-lines .center` in src/vs/editor/browser/widget/diffEditor/style.css
export const HeightOfHiddenLinesRegionInDiffEditor = 24;

export const DefaultLineHeight = 17;

export enum PropertyFoldingState {
	Expanded,
	Collapsed
}

export const OUTPUT_EDITOR_HEIGHT_MAGIC = 1440;

type ILayoutInfoDelta0 = { [K in keyof IDiffElementLayoutInfo]?: number; };
interface ILayoutInfoDelta extends ILayoutInfoDelta0 {
	rawOutputHeight?: number;
	recomputeOutput?: boolean;
}

export type IDiffElementViewModelBase = DiffElementCellViewModelBase | DiffElementPlaceholderViewModel | NotebookDocumentMetadataViewModel;

export abstract class DiffElementViewModelBase extends Disposable {
	protected _layoutInfoEmitter = this._register(new Emitter<CellDiffViewModelLayoutChangeEvent>());
	onDidLayoutChange = this._layoutInfoEmitter.event;
	abstract renderOutput: boolean;
	constructor(
		public readonly mainDocumentTextModel: INotebookTextModel,
		public readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		public readonly initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		}
	) {
		super();

		this._register(this.editorEventDispatcher.onDidChangeLayout(e => this._layoutInfoEmitter.fire({ outerWidth: true })));
	}

	abstract layoutChange(): void;
	abstract getHeight(lineHeight: number): number;
	abstract get totalHeight(): number;
}

export class DiffElementPlaceholderViewModel extends DiffElementViewModelBase {
	readonly type: 'placeholder' = 'placeholder';
	public hiddenCells: DiffElementCellViewModelBase[] = [];
	protected _unfoldHiddenCells = this._register(new Emitter<void>());
	onUnfoldHiddenCells = this._unfoldHiddenCells.event;

	public renderOutput: boolean = false;
	constructor(
		mainDocumentTextModel: INotebookTextModel,
		editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		}
	) {
		super(mainDocumentTextModel, editorEventDispatcher, initData);

	}
	get totalHeight() {
		return 24 + (2 * DIFF_CELL_MARGIN);
	}
	getHeight(_: number): number {
		return this.totalHeight;
	}
	override layoutChange(): void {
		//
	}
	showHiddenCells() {
		this._unfoldHiddenCells.fire();
	}
}


export class NotebookDocumentMetadataViewModel extends DiffElementViewModelBase {
	public readonly originalMetadata: NotebookDocumentMetadataTextModel;
	public readonly modifiedMetadata: NotebookDocumentMetadataTextModel;
	public cellFoldingState: PropertyFoldingState;
	protected _layoutInfo!: IDiffElementLayoutInfo;
	public renderOutput: boolean = false;
	set editorHeight(height: number) {
		this._layout({ editorHeight: height });
	}

	get editorHeight() {
		throw new Error('Use Cell.layoutInfo.editorHeight');
	}

	set editorMargin(margin: number) {
		this._layout({ editorMargin: margin });
	}

	get editorMargin() {
		throw new Error('Use Cell.layoutInfo.editorMargin');
	}
	get layoutInfo(): IDiffElementLayoutInfo {
		return this._layoutInfo;
	}

	get totalHeight() {
		return this.layoutInfo.totalHeight;
	}

	private _sourceEditorViewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null = null;
	constructor(
		public readonly originalDocumentTextModel: INotebookTextModel,
		public readonly modifiedDocumentTextModel: INotebookTextModel,
		public readonly type: 'unchangedMetadata' | 'modifiedMetadata',
		editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		},
		notebookService: INotebookService,
		private readonly editorHeightCalculator: IDiffEditorHeightCalculatorService
	) {
		super(originalDocumentTextModel, editorEventDispatcher, initData);

		const cellStatusHeight = PropertyHeaderHeight;
		this._layoutInfo = {
			width: 0,
			editorHeight: 0,
			editorMargin: 0,
			metadataHeight: 0,
			cellStatusHeight,
			metadataStatusHeight: 0,
			rawOutputHeight: 0,
			outputTotalHeight: 0,
			outputStatusHeight: 0,
			outputMetadataHeight: 0,
			bodyMargin: 32,
			totalHeight: 82 + cellStatusHeight + 0,
			layoutState: CellLayoutState.Uninitialized
		};

		this.cellFoldingState = type === 'modifiedMetadata' ? PropertyFoldingState.Expanded : PropertyFoldingState.Collapsed;
		this.originalMetadata = this._register(new NotebookDocumentMetadataTextModel(originalDocumentTextModel));
		this.modifiedMetadata = this._register(new NotebookDocumentMetadataTextModel(modifiedDocumentTextModel));
	}

	public async computeHeights() {
		if (this.type === 'unchangedMetadata') {
			this.editorHeight = this.editorHeightCalculator.computeHeightFromLines(this.originalMetadata.textBuffer.getLineCount());
		} else {
			const original = this.originalMetadata.uri;
			const modified = this.modifiedMetadata.uri;
			this.editorHeight = await this.editorHeightCalculator.diffAndComputeHeight(original, modified);
		}
	}

	layoutChange() {
		this._layout({ recomputeOutput: true });
	}

	protected _layout(delta: ILayoutInfoDelta) {
		const width = delta.width !== undefined ? delta.width : this._layoutInfo.width;
		const editorHeight = delta.editorHeight !== undefined ? delta.editorHeight : this._layoutInfo.editorHeight;
		const editorMargin = delta.editorMargin !== undefined ? delta.editorMargin : this._layoutInfo.editorMargin;
		const cellStatusHeight = delta.cellStatusHeight !== undefined ? delta.cellStatusHeight : this._layoutInfo.cellStatusHeight;
		const bodyMargin = delta.bodyMargin !== undefined ? delta.bodyMargin : this._layoutInfo.bodyMargin;

		const totalHeight = editorHeight
			+ editorMargin
			+ cellStatusHeight
			+ bodyMargin;

		const newLayout: IDiffElementLayoutInfo = {
			width: width,
			editorHeight: editorHeight,
			editorMargin: editorMargin,
			metadataHeight: 0,
			cellStatusHeight,
			metadataStatusHeight: 0,
			outputTotalHeight: 0,
			outputStatusHeight: 0,
			bodyMargin: bodyMargin,
			rawOutputHeight: 0,
			outputMetadataHeight: 0,
			totalHeight: totalHeight,
			layoutState: CellLayoutState.Measured
		};

		let somethingChanged = false;

		const changeEvent: CellDiffViewModelLayoutChangeEvent = {};

		if (newLayout.width !== this._layoutInfo.width) {
			changeEvent.width = true;
			somethingChanged = true;
		}

		if (newLayout.editorHeight !== this._layoutInfo.editorHeight) {
			changeEvent.editorHeight = true;
			somethingChanged = true;
		}

		if (newLayout.editorMargin !== this._layoutInfo.editorMargin) {
			changeEvent.editorMargin = true;
			somethingChanged = true;
		}

		if (newLayout.cellStatusHeight !== this._layoutInfo.cellStatusHeight) {
			changeEvent.cellStatusHeight = true;
			somethingChanged = true;
		}

		if (newLayout.bodyMargin !== this._layoutInfo.bodyMargin) {
			changeEvent.bodyMargin = true;
			somethingChanged = true;
		}

		if (newLayout.totalHeight !== this._layoutInfo.totalHeight) {
			changeEvent.totalHeight = true;
			somethingChanged = true;
		}

		if (somethingChanged) {
			this._layoutInfo = newLayout;
			this._fireLayoutChangeEvent(changeEvent);
		}
	}

	getHeight(lineHeight: number) {
		if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
			const editorHeight = this.cellFoldingState === PropertyFoldingState.Collapsed ? 0 : this.computeInputEditorHeight(lineHeight);
			return this._computeTotalHeight(editorHeight);
		} else {
			return this._layoutInfo.totalHeight;
		}
	}

	private _computeTotalHeight(editorHeight: number) {
		const totalHeight = editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.cellStatusHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputTotalHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.outputMetadataHeight
			+ this._layoutInfo.bodyMargin;

		return totalHeight;
	}

	public computeInputEditorHeight(_lineHeight: number): number {
		return this.editorHeightCalculator.computeHeightFromLines(Math.max(this.originalMetadata.textBuffer.getLineCount(), this.modifiedMetadata.textBuffer.getLineCount()));
	}

	private _fireLayoutChangeEvent(state: CellDiffViewModelLayoutChangeEvent) {
		this._layoutInfoEmitter.fire(state);
		this.editorEventDispatcher.emit([{ type: NotebookDiffViewEventType.CellLayoutChanged, source: this._layoutInfo }]);
	}

	getComputedCellContainerWidth(layoutInfo: NotebookLayoutInfo, diffEditor: boolean, fullWidth: boolean) {
		if (fullWidth) {
			return layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0) - 2;
		}

		return (layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)) / 2 - 18 - 2;
	}

	getSourceEditorViewState(): editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null {
		return this._sourceEditorViewState;
	}

	saveSpirceEditorViewState(viewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null) {
		this._sourceEditorViewState = viewState;
	}
}


export abstract class DiffElementCellViewModelBase extends DiffElementViewModelBase {
	public cellFoldingState: PropertyFoldingState;
	public metadataFoldingState: PropertyFoldingState;
	public outputFoldingState: PropertyFoldingState;
	protected _stateChangeEmitter = this._register(new Emitter<{ renderOutput: boolean }>());
	onDidStateChange = this._stateChangeEmitter.event;
	protected _layoutInfo!: IDiffElementLayoutInfo;

	public displayIconToHideUnmodifiedCells?: boolean;
	private _hideUnchangedCells = this._register(new Emitter<void>());
	public onHideUnchangedCells = this._hideUnchangedCells.event;

	hideUnchangedCells() {
		this._hideUnchangedCells.fire();
	}
	set rawOutputHeight(height: number) {
		this._layout({ rawOutputHeight: Math.min(OUTPUT_EDITOR_HEIGHT_MAGIC, height) });
	}

	get rawOutputHeight() {
		throw new Error('Use Cell.layoutInfo.rawOutputHeight');
	}

	set outputStatusHeight(height: number) {
		this._layout({ outputStatusHeight: height });
	}

	get outputStatusHeight() {
		throw new Error('Use Cell.layoutInfo.outputStatusHeight');
	}

	set outputMetadataHeight(height: number) {
		this._layout({ outputMetadataHeight: height });
	}

	get outputMetadataHeight() {
		throw new Error('Use Cell.layoutInfo.outputStatusHeight');
	}

	set editorHeight(height: number) {
		this._layout({ editorHeight: height });
	}

	get editorHeight() {
		throw new Error('Use Cell.layoutInfo.editorHeight');
	}

	set editorMargin(margin: number) {
		this._layout({ editorMargin: margin });
	}

	get editorMargin() {
		throw new Error('Use Cell.layoutInfo.editorMargin');
	}

	set metadataStatusHeight(height: number) {
		this._layout({ metadataStatusHeight: height });
	}

	get metadataStatusHeight() {
		throw new Error('Use Cell.layoutInfo.outputStatusHeight');
	}

	set metadataHeight(height: number) {
		this._layout({ metadataHeight: height });
	}

	get metadataHeight() {
		throw new Error('Use Cell.layoutInfo.metadataHeight');
	}

	private _renderOutput = true;

	set renderOutput(value: boolean) {
		this._renderOutput = value;
		this._layout({ recomputeOutput: true });
		this._stateChangeEmitter.fire({ renderOutput: this._renderOutput });
	}

	get renderOutput() {
		return this._renderOutput;
	}

	get layoutInfo(): IDiffElementLayoutInfo {
		return this._layoutInfo;
	}

	get totalHeight() {
		return this.layoutInfo.totalHeight;
	}

	protected get ignoreOutputs() {
		return this.configurationService.getValue<boolean>('notebook.diff.ignoreOutputs') || !!(this.mainDocumentTextModel?.transientOptions.transientOutputs);
	}

	protected get ignoreMetadata() {
		return this.configurationService.getValue<boolean>('notebook.diff.ignoreMetadata');
	}

	private _sourceEditorViewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null = null;
	private _outputEditorViewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null = null;
	private _metadataEditorViewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null = null;
	public readonly original: DiffNestedCellViewModel | undefined;

	public readonly modified: DiffNestedCellViewModel | undefined;
	constructor(
		mainDocumentTextModel: INotebookTextModel,
		original: NotebookCellTextModel | undefined,
		modified: NotebookCellTextModel | undefined,
		readonly type: 'unchanged' | 'insert' | 'delete' | 'modified',
		editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		},
		notebookService: INotebookService,
		public readonly index: number,
		private readonly configurationService: IConfigurationService,
		public readonly diffEditorHeightCalculator: IDiffEditorHeightCalculatorService
	) {
		super(mainDocumentTextModel, editorEventDispatcher, initData);
		this.original = original ? this._register(new DiffNestedCellViewModel(original, notebookService)) : undefined;
		this.modified = modified ? this._register(new DiffNestedCellViewModel(modified, notebookService)) : undefined;
		const editorHeight = this._estimateEditorHeight(initData.fontInfo);
		const cellStatusHeight = PropertyHeaderHeight;
		this._layoutInfo = {
			width: 0,
			editorHeight: editorHeight,
			editorMargin: 0,
			metadataHeight: 0,
			cellStatusHeight,
			metadataStatusHeight: this.ignoreMetadata ? 0 : PropertyHeaderHeight,
			rawOutputHeight: 0,
			outputTotalHeight: 0,
			outputStatusHeight: this.ignoreOutputs ? 0 : PropertyHeaderHeight,
			outputMetadataHeight: 0,
			bodyMargin: 32,
			totalHeight: 82 + cellStatusHeight + editorHeight,
			layoutState: CellLayoutState.Uninitialized
		};

		this.cellFoldingState = modified?.getTextBufferHash() !== original?.getTextBufferHash() ? PropertyFoldingState.Expanded : PropertyFoldingState.Collapsed;
		this.metadataFoldingState = PropertyFoldingState.Collapsed;
		this.outputFoldingState = PropertyFoldingState.Collapsed;
	}

	layoutChange() {
		this._layout({ recomputeOutput: true });
	}

	private _estimateEditorHeight(fontInfo: FontInfo | undefined) {
		const lineHeight = fontInfo?.lineHeight ?? 17;

		switch (this.type) {
			case 'unchanged':
			case 'insert':
				{
					const lineCount = this.modified!.textModel.textBuffer.getLineCount();
					const editorHeight = lineCount * lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
					return editorHeight;
				}
			case 'delete':
			case 'modified':
				{
					const lineCount = this.original!.textModel.textBuffer.getLineCount();
					const editorHeight = lineCount * lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
					return editorHeight;
				}
		}
	}

	protected _layout(delta: ILayoutInfoDelta) {
		const width = delta.width !== undefined ? delta.width : this._layoutInfo.width;
		const editorHeight = delta.editorHeight !== undefined ? delta.editorHeight : this._layoutInfo.editorHeight;
		const editorMargin = delta.editorMargin !== undefined ? delta.editorMargin : this._layoutInfo.editorMargin;
		const metadataHeight = delta.metadataHeight !== undefined ? delta.metadataHeight : this._layoutInfo.metadataHeight;
		const cellStatusHeight = delta.cellStatusHeight !== undefined ? delta.cellStatusHeight : this._layoutInfo.cellStatusHeight;
		const metadataStatusHeight = delta.metadataStatusHeight !== undefined ? delta.metadataStatusHeight : this._layoutInfo.metadataStatusHeight;
		const rawOutputHeight = delta.rawOutputHeight !== undefined ? delta.rawOutputHeight : this._layoutInfo.rawOutputHeight;
		const outputStatusHeight = delta.outputStatusHeight !== undefined ? delta.outputStatusHeight : this._layoutInfo.outputStatusHeight;
		const bodyMargin = delta.bodyMargin !== undefined ? delta.bodyMargin : this._layoutInfo.bodyMargin;
		const outputMetadataHeight = delta.outputMetadataHeight !== undefined ? delta.outputMetadataHeight : this._layoutInfo.outputMetadataHeight;
		const outputHeight = this.ignoreOutputs ? 0 : (delta.recomputeOutput || delta.rawOutputHeight !== undefined || delta.outputMetadataHeight !== undefined) ? this._getOutputTotalHeight(rawOutputHeight, outputMetadataHeight) : this._layoutInfo.outputTotalHeight;

		const totalHeight = editorHeight
			+ editorMargin
			+ cellStatusHeight
			+ metadataHeight
			+ metadataStatusHeight
			+ outputHeight
			+ outputStatusHeight
			+ bodyMargin;

		const newLayout: IDiffElementLayoutInfo = {
			width: width,
			editorHeight: editorHeight,
			editorMargin: editorMargin,
			metadataHeight: metadataHeight,
			cellStatusHeight,
			metadataStatusHeight: metadataStatusHeight,
			outputTotalHeight: outputHeight,
			outputStatusHeight: outputStatusHeight,
			bodyMargin: bodyMargin,
			rawOutputHeight: rawOutputHeight,
			outputMetadataHeight: outputMetadataHeight,
			totalHeight: totalHeight,
			layoutState: CellLayoutState.Measured
		};

		let somethingChanged = false;

		const changeEvent: CellDiffViewModelLayoutChangeEvent = {};

		if (newLayout.width !== this._layoutInfo.width) {
			changeEvent.width = true;
			somethingChanged = true;
		}

		if (newLayout.editorHeight !== this._layoutInfo.editorHeight) {
			changeEvent.editorHeight = true;
			somethingChanged = true;
		}

		if (newLayout.editorMargin !== this._layoutInfo.editorMargin) {
			changeEvent.editorMargin = true;
			somethingChanged = true;
		}

		if (newLayout.metadataHeight !== this._layoutInfo.metadataHeight) {
			changeEvent.metadataHeight = true;
			somethingChanged = true;
		}

		if (newLayout.cellStatusHeight !== this._layoutInfo.cellStatusHeight) {
			changeEvent.cellStatusHeight = true;
			somethingChanged = true;
		}

		if (newLayout.metadataStatusHeight !== this._layoutInfo.metadataStatusHeight) {
			changeEvent.metadataStatusHeight = true;
			somethingChanged = true;
		}

		if (newLayout.outputTotalHeight !== this._layoutInfo.outputTotalHeight) {
			changeEvent.outputTotalHeight = true;
			somethingChanged = true;
		}

		if (newLayout.outputStatusHeight !== this._layoutInfo.outputStatusHeight) {
			changeEvent.outputStatusHeight = true;
			somethingChanged = true;
		}

		if (newLayout.bodyMargin !== this._layoutInfo.bodyMargin) {
			changeEvent.bodyMargin = true;
			somethingChanged = true;
		}

		if (newLayout.outputMetadataHeight !== this._layoutInfo.outputMetadataHeight) {
			changeEvent.outputMetadataHeight = true;
			somethingChanged = true;
		}

		if (newLayout.totalHeight !== this._layoutInfo.totalHeight) {
			changeEvent.totalHeight = true;
			somethingChanged = true;
		}

		if (somethingChanged) {
			this._layoutInfo = newLayout;
			this._fireLayoutChangeEvent(changeEvent);
		}
	}

	getHeight(lineHeight: number) {
		if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
			const editorHeight = this.cellFoldingState === PropertyFoldingState.Collapsed ? 0 : this.computeInputEditorHeight(lineHeight);
			return this._computeTotalHeight(editorHeight);
		} else {
			return this._layoutInfo.totalHeight;
		}
	}

	private _computeTotalHeight(editorHeight: number) {
		const totalHeight = editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.cellStatusHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputTotalHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.outputMetadataHeight
			+ this._layoutInfo.bodyMargin;

		return totalHeight;
	}

	public computeInputEditorHeight(lineHeight: number): number {
		const lineCount = Math.max(this.original?.textModel.textBuffer.getLineCount() ?? 1, this.modified?.textModel.textBuffer.getLineCount() ?? 1);
		return this.diffEditorHeightCalculator.computeHeightFromLines(lineCount);
	}

	private _getOutputTotalHeight(rawOutputHeight: number, metadataHeight: number) {
		if (this.outputFoldingState === PropertyFoldingState.Collapsed) {
			return 0;
		}

		if (this.renderOutput) {
			if (this.isOutputEmpty()) {
				// single line;
				return 24;
			}
			return this.getRichOutputTotalHeight() + metadataHeight;
		} else {
			return rawOutputHeight;
		}
	}

	private _fireLayoutChangeEvent(state: CellDiffViewModelLayoutChangeEvent) {
		this._layoutInfoEmitter.fire(state);
		this.editorEventDispatcher.emit([{ type: NotebookDiffViewEventType.CellLayoutChanged, source: this._layoutInfo }]);
	}

	abstract checkIfInputModified(): false | { reason: string | undefined };
	abstract checkIfOutputsModified(): false | { reason: string | undefined };
	abstract checkMetadataIfModified(): false | { reason: string | undefined };
	abstract isOutputEmpty(): boolean;
	abstract getRichOutputTotalHeight(): number;
	abstract getCellByUri(cellUri: URI): IGenericCellViewModel;
	abstract getOutputOffsetInCell(diffSide: DiffSide, index: number): number;
	abstract getOutputOffsetInContainer(diffSide: DiffSide, index: number): number;
	abstract updateOutputHeight(diffSide: DiffSide, index: number, height: number): void;
	abstract getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel;

	getComputedCellContainerWidth(layoutInfo: NotebookLayoutInfo, diffEditor: boolean, fullWidth: boolean) {
		if (fullWidth) {
			return layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0) - 2;
		}

		return (layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)) / 2 - 18 - 2;
	}

	getOutputEditorViewState(): editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null {
		return this._outputEditorViewState;
	}

	saveOutputEditorViewState(viewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null) {
		this._outputEditorViewState = viewState;
	}

	getMetadataEditorViewState(): editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null {
		return this._metadataEditorViewState;
	}

	saveMetadataEditorViewState(viewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null) {
		this._metadataEditorViewState = viewState;
	}

	getSourceEditorViewState(): editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null {
		return this._sourceEditorViewState;
	}

	saveSpirceEditorViewState(viewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null) {
		this._sourceEditorViewState = viewState;
	}
}

export class SideBySideDiffElementViewModel extends DiffElementCellViewModelBase {
	get originalDocument() {
		return this.otherDocumentTextModel;
	}

	get modifiedDocument() {
		return this.mainDocumentTextModel;
	}

	declare readonly original: DiffNestedCellViewModel;
	declare readonly modified: DiffNestedCellViewModel;
	override readonly type: 'unchanged' | 'modified';

	/**
	 * The height of the editor when the unchanged lines are collapsed.
	 */
	private editorHeightWithUnchangedLinesCollapsed?: number;
	constructor(
		mainDocumentTextModel: NotebookTextModel,
		readonly otherDocumentTextModel: NotebookTextModel,
		original: NotebookCellTextModel,
		modified: NotebookCellTextModel,
		type: 'unchanged' | 'modified',
		editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		},
		notebookService: INotebookService,
		configurationService: IConfigurationService,
		index: number,
		diffEditorHeightCalculator: IDiffEditorHeightCalculatorService
	) {
		super(
			mainDocumentTextModel,
			original,
			modified,
			type,
			editorEventDispatcher,
			initData,
			notebookService,
			index,
			configurationService,
			diffEditorHeightCalculator);

		this.type = type;

		this.cellFoldingState = this.modified.textModel.getValue() !== this.original.textModel.getValue() ? PropertyFoldingState.Expanded : PropertyFoldingState.Collapsed;
		this.metadataFoldingState = PropertyFoldingState.Collapsed;
		this.outputFoldingState = PropertyFoldingState.Collapsed;

		if (this.checkMetadataIfModified()) {
			this.metadataFoldingState = PropertyFoldingState.Expanded;
		}

		if (this.checkIfOutputsModified()) {
			this.outputFoldingState = PropertyFoldingState.Expanded;
		}

		this._register(this.original.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));

		this._register(this.modified.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));

		this._register(this.modified.textModel.onDidChangeContent(() => {
			if (mainDocumentTextModel.transientOptions.cellContentMetadata) {
				const cellMetadataKeys = [...Object.keys(mainDocumentTextModel.transientOptions.cellContentMetadata)];
				const modifiedMedataRaw = Object.assign({}, this.modified.metadata);
				const originalCellMetadata = this.original.metadata;
				for (const key of cellMetadataKeys) {
					if (Object.hasOwn(originalCellMetadata, key)) {
						modifiedMedataRaw[key] = originalCellMetadata[key];
					}
				}

				this.modified.textModel.metadata = modifiedMedataRaw;
			}
		}));
	}

	override checkIfInputModified(): false | { reason: string | undefined } {
		if (this.original.textModel.getTextBufferHash() === this.modified.textModel.getTextBufferHash()) {
			return false;
		}
		return {
			reason: 'Cell content has changed',
		};
	}
	checkIfOutputsModified() {
		if (this.mainDocumentTextModel.transientOptions.transientOutputs || this.ignoreOutputs) {
			return false;
		}

		const ret = outputsEqual(this.original?.outputs ?? [], this.modified?.outputs ?? []);

		if (ret === OutputComparison.Unchanged) {
			return false;
		}

		return {
			reason: ret === OutputComparison.Metadata ? 'Output metadata has changed' : undefined,
			kind: ret
		};
	}

	checkMetadataIfModified() {
		if (this.ignoreMetadata) {
			return false;
		}
		const modified = hash(getFormattedMetadataJSON(this.mainDocumentTextModel.transientOptions.transientCellMetadata, this.original?.metadata || {}, this.original?.language)) !== hash(getFormattedMetadataJSON(this.mainDocumentTextModel.transientOptions.transientCellMetadata, this.modified?.metadata ?? {}, this.modified?.language));
		if (modified) {
			return { reason: undefined };
		} else {
			return false;
		}
	}

	updateOutputHeight(diffSide: DiffSide, index: number, height: number) {
		if (diffSide === DiffSide.Original) {
			this.original.updateOutputHeight(index, height);
		} else {
			this.modified.updateOutputHeight(index, height);
		}
	}

	getOutputOffsetInContainer(diffSide: DiffSide, index: number) {
		if (diffSide === DiffSide.Original) {
			return this.original.getOutputOffset(index);
		} else {
			return this.modified.getOutputOffset(index);
		}
	}

	getOutputOffsetInCell(diffSide: DiffSide, index: number) {
		const offsetInOutputsContainer = this.getOutputOffsetInContainer(diffSide, index);

		return this._layoutInfo.editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.cellStatusHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.bodyMargin / 2
			+ offsetInOutputsContainer;
	}

	isOutputEmpty() {
		if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
			return true;
		}

		if (this.checkIfOutputsModified()) {
			return false;
		}

		// outputs are not changed

		return (this.original?.outputs || []).length === 0;
	}

	getRichOutputTotalHeight() {
		return Math.max(this.original.getOutputTotalHeight(), this.modified.getOutputTotalHeight());
	}

	getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel {
		return diffSide === DiffSide.Original ? this.original : this.modified;
	}

	getCellByUri(cellUri: URI): IGenericCellViewModel {
		if (cellUri.toString() === this.original.uri.toString()) {
			return this.original;
		} else {
			return this.modified;
		}
	}

	public override computeInputEditorHeight(lineHeight: number): number {
		if (this.type === 'modified' &&
			typeof this.editorHeightWithUnchangedLinesCollapsed === 'number' &&
			this.checkIfInputModified()) {
			return this.editorHeightWithUnchangedLinesCollapsed;
		}

		return super.computeInputEditorHeight(lineHeight);
	}

	private async computeModifiedInputEditorHeight() {
		if (this.checkIfInputModified()) {
			this.editorHeightWithUnchangedLinesCollapsed = this._layoutInfo.editorHeight = await this.diffEditorHeightCalculator.diffAndComputeHeight(this.original.uri, this.modified.uri);
		}
	}

	private async computeModifiedMetadataEditorHeight() {
		if (this.checkMetadataIfModified()) {
			const originalMetadataUri = CellUri.generateCellPropertyUri(this.originalDocument.uri, this.original.handle, Schemas.vscodeNotebookCellMetadata);
			const modifiedMetadataUri = CellUri.generateCellPropertyUri(this.modifiedDocument.uri, this.modified.handle, Schemas.vscodeNotebookCellMetadata);
			this._layoutInfo.metadataHeight = await this.diffEditorHeightCalculator.diffAndComputeHeight(originalMetadataUri, modifiedMetadataUri);
		}
	}

	public async computeEditorHeights() {
		if (this.type === 'unchanged') {
			return;
		}

		await Promise.all([this.computeModifiedInputEditorHeight(), this.computeModifiedMetadataEditorHeight()]);
	}

}

export class SingleSideDiffElementViewModel extends DiffElementCellViewModelBase {
	get cellViewModel() {
		return this.type === 'insert' ? this.modified! : this.original!;
	}

	get originalDocument() {
		if (this.type === 'insert') {
			return this.otherDocumentTextModel;
		} else {
			return this.mainDocumentTextModel;
		}
	}

	get modifiedDocument() {
		if (this.type === 'insert') {
			return this.mainDocumentTextModel;
		} else {
			return this.otherDocumentTextModel;
		}
	}

	override readonly type: 'insert' | 'delete';

	constructor(
		mainDocumentTextModel: NotebookTextModel,
		readonly otherDocumentTextModel: NotebookTextModel,
		original: NotebookCellTextModel | undefined,
		modified: NotebookCellTextModel | undefined,
		type: 'insert' | 'delete',
		editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		},
		notebookService: INotebookService,
		configurationService: IConfigurationService,
		diffEditorHeightCalculator: IDiffEditorHeightCalculatorService,
		index: number
	) {
		super(mainDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, index, configurationService, diffEditorHeightCalculator);
		this.type = type;

		this._register(this.cellViewModel.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));
	}

	override checkIfInputModified(): false | { reason: string | undefined } {
		return {
			reason: 'Cell content has changed',
		};
	}

	getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel {
		return this.type === 'insert' ? this.modified! : this.original!;
	}


	checkIfOutputsModified(): false | { reason: string | undefined } {
		return false;
	}

	checkMetadataIfModified(): false | { reason: string | undefined } {
		return false;
	}

	updateOutputHeight(diffSide: DiffSide, index: number, height: number) {
		this.cellViewModel?.updateOutputHeight(index, height);
	}

	getOutputOffsetInContainer(diffSide: DiffSide, index: number) {
		return this.cellViewModel.getOutputOffset(index);
	}

	getOutputOffsetInCell(diffSide: DiffSide, index: number) {
		const offsetInOutputsContainer = this.cellViewModel.getOutputOffset(index);

		return this._layoutInfo.editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.cellStatusHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.bodyMargin / 2
			+ offsetInOutputsContainer;
	}

	isOutputEmpty() {
		if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
			return true;
		}

		// outputs are not changed

		return (this.original?.outputs || this.modified?.outputs || []).length === 0;
	}

	getRichOutputTotalHeight() {
		return this.cellViewModel?.getOutputTotalHeight() ?? 0;
	}

	getCellByUri(cellUri: URI): IGenericCellViewModel {
		return this.cellViewModel;
	}
}

export const enum OutputComparison {
	Unchanged = 0,
	Metadata = 1,
	Other = 2
}

export function outputEqual(a: ICellOutput, b: ICellOutput): OutputComparison {
	if (hash(a.metadata) === hash(b.metadata)) {
		return OutputComparison.Other;
	}

	// metadata not equal
	for (let j = 0; j < a.outputs.length; j++) {
		const aOutputItem = a.outputs[j];
		const bOutputItem = b.outputs[j];

		if (aOutputItem.mime !== bOutputItem.mime) {
			return OutputComparison.Other;
		}

		if (aOutputItem.data.buffer.length !== bOutputItem.data.buffer.length) {
			return OutputComparison.Other;
		}

		for (let k = 0; k < aOutputItem.data.buffer.length; k++) {
			if (aOutputItem.data.buffer[k] !== bOutputItem.data.buffer[k]) {
				return OutputComparison.Other;
			}
		}
	}

	return OutputComparison.Metadata;
}

function outputsEqual(original: ICellOutput[], modified: ICellOutput[]) {
	if (original.length !== modified.length) {
		return OutputComparison.Other;
	}

	const len = original.length;
	for (let i = 0; i < len; i++) {
		const a = original[i];
		const b = modified[i];

		if (hash(a.metadata) !== hash(b.metadata)) {
			return OutputComparison.Metadata;
		}

		if (a.outputs.length !== b.outputs.length) {
			return OutputComparison.Other;
		}

		for (let j = 0; j < a.outputs.length; j++) {
			const aOutputItem = a.outputs[j];
			const bOutputItem = b.outputs[j];

			if (aOutputItem.mime !== bOutputItem.mime) {
				return OutputComparison.Other;
			}

			if (aOutputItem.data.buffer.length !== bOutputItem.data.buffer.length) {
				return OutputComparison.Other;
			}

			for (let k = 0; k < aOutputItem.data.buffer.length; k++) {
				if (aOutputItem.data.buffer[k] !== bOutputItem.data.buffer[k]) {
					return OutputComparison.Other;
				}
			}
		}
	}

	return OutputComparison.Unchanged;
}

export function getStreamOutputData(outputs: IOutputItemDto[]) {
	if (!outputs.length) {
		return null;
	}

	const first = outputs[0];
	const mime = first.mime;
	const sameStream = !outputs.find(op => op.mime !== mime);

	if (sameStream) {
		return outputs.map(opit => opit.data.toString()).join('');
	} else {
		return null;
	}
}

export function getFormattedOutputJSON(outputs: IOutputDto[]) {
	if (outputs.length === 1) {
		const streamOutputData = getStreamOutputData(outputs[0].outputs);
		if (streamOutputData) {
			return streamOutputData;
		}
	}

	return JSON.stringify(outputs.map(output => {
		return ({
			metadata: output.metadata,
			outputItems: output.outputs.map(opit => ({
				mimeType: opit.mime,
				data: opit.data.toString()
			}))
		});
	}), undefined, '\t');
}
