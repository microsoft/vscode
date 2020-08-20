/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notebook';
import 'vs/css!./media/notebookDiff';
import * as DOM from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions } from 'vs/workbench/common/editor';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { NotebookDiffEditorInput } from './notebookDiffEditorInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { INotebookDiffEditorModel, INotebookDiffResult } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookDeltaDecoration } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkdownCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markdownCellViewModel';
import { FileService } from 'vs/platform/files/common/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecoration, DECORATIONS, isChangeOrDelete, isChangeOrInsert } from 'vs/editor/browser/widget/diffEditorWidget';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Color } from 'vs/base/common/color';
import { IModelDeltaDecoration, IReadonlyTextBuffer } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { Constants } from 'vs/base/common/uint';
import { defaultInsertColor, defaultRemoveColor, diffInserted, diffRemoved } from 'vs/platform/theme/common/colorRegistry';
import { INotebookEditorWorkerService } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerService';

export class NotebookDiffEditor extends BaseEditor {
	static readonly ID: string = 'workbench.editor.notebookDiffEditor';

	private _rootElement!: HTMLElement;
	private _originalElement!: HTMLElement;
	private _modifiedElement!: HTMLElement;
	private _dimension?: DOM.Dimension;
	private _widget: NotebookEditorWidget | null = null;
	private _originalWidget: NotebookEditorWidget | null = null;
	private _cellDecorations: string[] = [];
	private _originalCellDecorations: string[] = [];
	private _strategy!: DiffEditorWidgetSideBySide;

	constructor(
		@IFileService private readonly fileService: FileService,
		@IThemeService readonly themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService
	) {
		super(NotebookDiffEditor.ID, telemetryService, themeService, storageService);

	}

	protected createEditor(parent: HTMLElement): void {
		this._rootElement = DOM.append(parent, DOM.$('.notebook-diff-editor'));
		this._originalElement = DOM.append(this._rootElement, DOM.$('.notebook-diff-editor-original'));
		this._modifiedElement = DOM.append(this._rootElement, DOM.$('.notebook-diff-editor-modified'));
	}

	async setInput(input: NotebookDiffEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		// const group = this.group!;

		await super.setInput(input, options, token);
		this._widget = this.instantiationService.createInstance(NotebookEditorWidget, { isEmbedded: true, contributions: [] });
		this._widget.createEditor();

		this._originalWidget = this.instantiationService.createInstance(NotebookEditorWidget, { isEmbedded: true, contributions: [] });
		this._originalWidget.createEditor();

		if (this._dimension) {
			this._widget.layout({
				width: this._dimension.width / 2,
				height: this._dimension.height
			}, this._modifiedElement);

			this._originalWidget.layout({
				width: this._dimension.width / 2,
				height: this._dimension.height
			}, this._originalElement);
		}

		const model = await input.resolve(this._widget.getId());

		if (model === null) {
			return;
		}

		model.modified.notebook.metadata.cellEditable = false;
		model.modified.notebook.metadata.cellRunnable = false;
		model.modified.notebook.metadata.editable = false;
		model.modified.notebook.metadata.runnable = false;
		model.original.notebook.metadata.cellEditable = false;
		model.original.notebook.metadata.cellRunnable = false;
		model.original.notebook.metadata.editable = false;
		model.original.notebook.metadata.runnable = false;
		await this._widget.setModel(model.modified.notebook, undefined);
		await this._originalWidget.setModel(model.original.notebook, undefined);

		let widgetScroll = false;
		let originalWidgetScroll = false;
		this._register(this._widget.onWillScroll(e => {
			if (originalWidgetScroll) {
				return;
			}
			widgetScroll = true;
			if (this._originalWidget && this._originalWidget.scrollTop !== e.scrollTop) {
				this._originalWidget.scrollTop = e.scrollTop;
			}
			widgetScroll = false;
		}));

		this._register(this._originalWidget.onWillScroll(e => {
			if (widgetScroll) {
				return;
			}

			originalWidgetScroll = true;
			if (this._widget && this._widget.scrollTop !== e.scrollTop) {
				this._widget.scrollTop = e.scrollTop;
			}
			originalWidgetScroll = false;
		}));

		this._register(this.fileService.watch(model.original.resource));
		this._register(this.fileService.onDidFilesChange(async e => {
			if (e.changes.find(change => change.resource.toString() === model.original.resource.toString())) {
				await model.resolveOriginalFromDisk();
				this._update(model);
			}
		}));

		this._register(model.modified.notebook.onDidChangeContent(() => {
			this._update(model);
		}));

		this._register(model.modified.notebook.onDidChangeCells(() => {
			this._update(model);
		}));

		this._setStrategy(new DiffEditorWidgetSideBySide());

		this._update(model);
	}

	private _update(model: INotebookDiffEditorModel) {
		this.notebookEditorWorkerService.computeDiff(model.original.notebook.uri, model.modified.notebook.uri).then(diffResult => {
			this._adjustHeight(diffResult);
		});
	}

	private _setStrategy(newStrategy: DiffEditorWidgetSideBySide): void {
		if (this._strategy) {
			this._strategy.dispose();
		}

		this._strategy = newStrategy;
		newStrategy.applyColors(this.themeService.getColorTheme());
	}

	private _adjustHeight(notebookDiffResult: INotebookDiffResult) {
		const diffResult = notebookDiffResult.cellsDiff;
		const linesDiffResult = notebookDiffResult.linesDiff;

		if (!this._widget || !this._originalWidget) {
			return;
		}

		const originalDecorations: INotebookDeltaDecoration[] = [];
		const modifiedDecorations: INotebookDeltaDecoration[] = [];

		let viewLayoutUpdateDisposables: IDisposable[] = [];

		diffResult.changes.forEach(change => {
			const originalCells = this._originalWidget?.viewModel?.viewCells.slice(change.originalStart, change.originalStart + change.originalLength) || [];
			const original = originalCells.map(cell => cell.handle).map(handle => ({
				handle: handle,
				options: { className: 'nb-cell-deleted' }
			}));

			const modifiedCells = this._widget?.viewModel?.viewCells.slice(change.modifiedStart, change.modifiedStart + change.modifiedLength) || [];
			const modified = modifiedCells.map(cell => cell.handle).map(handle => ({
				handle: handle,
				options: { className: 'nb-cell-added' }
			}));

			originalDecorations.push(...original);
			modifiedDecorations.push(...modified);

			this._originalWidget?.insertWhitespace(change.originalStart + change.originalLength - 1, 0);
			this._widget?.insertWhitespace(change.modifiedStart + change.modifiedLength - 1, 0);

			const update = () => {
				this._register(DOM.scheduleAtNextAnimationFrame(() => {
					const leftTotalHeight = originalCells.map(cell => (cell instanceof CodeCellViewModel) ? cell.layoutInfo.totalHeight : (cell as MarkdownCellViewModel).layoutInfo.totalHeight)
						.reduce((p, c) => { return p + c; }, 0);
					const rightTotalHeight = modifiedCells.map(cell => (cell instanceof CodeCellViewModel) ? cell.layoutInfo.totalHeight : (cell as MarkdownCellViewModel).layoutInfo.totalHeight)
						.reduce((p, c) => { return p + c; }, 0);
					const maxHeight = Math.max(leftTotalHeight, rightTotalHeight);

					this._originalWidget?.updateWhitespace(change.originalStart + change.originalLength - 1, maxHeight - leftTotalHeight);
					this._widget?.updateWhitespace(change.modifiedStart + change.modifiedLength - 1, maxHeight - rightTotalHeight);
				}, 200));
			};

			viewLayoutUpdateDisposables.push(...[
				...originalCells.map(cell => (cell instanceof CodeCellViewModel) ? cell.onDidChangeLayout(() => update()) : (cell as MarkdownCellViewModel).onDidChangeLayout(() => update())),
				...modifiedCells.map(cell => (cell instanceof CodeCellViewModel) ? cell.onDidChangeLayout(() => update()) : (cell as MarkdownCellViewModel).onDidChangeLayout(() => update())),
			]);

			update();
		});


		linesDiffResult.forEach(diff => {
			const originalCell = this._originalWidget!.viewModel!.viewCells.find(cell => cell.handle === diff.originalCellhandle);
			const modifiedCell = this._widget!.viewModel!.viewCells.find(cell => cell.handle === diff.modifiedCellhandle);

			if (!originalCell || !modifiedCell) {
				return;
			}

			const lineDecorations = this._strategy.getEditorsDiffDecorations(diff.lineChanges, false, false, originalCell.textBuffer, modifiedCell.textBuffer);

			this._originalWidget?.changeModelDecorations(accessor => {
				accessor.deltaDecorations([], [{
					ownerId: diff.originalCellhandle,
					decorations: lineDecorations.original.decorations
				}]);
			});

			this._widget?.changeModelDecorations(accessor => {
				accessor.deltaDecorations([], [{
					ownerId: diff.modifiedCellhandle,
					decorations: lineDecorations.modified.decorations
				}]);
			});
		});

		this._originalCellDecorations = this._originalWidget.deltaCellDecorations(this._originalCellDecorations, originalDecorations);
		this._cellDecorations = this._widget.deltaCellDecorations(this._cellDecorations, modifiedDecorations);
	}

	getDomNode() {
		return this._rootElement;
	}

	getControl(): NotebookEditorWidget | undefined {
		return this._widget || undefined;
	}

	setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);
		if (!visible) {
			if (this.input) {
				// the widget is not transfered to other editor inputs
				this._widget?.onWillHide();
				this._originalWidget?.onWillHide();
			}
		}

	}

	focus() {
		super.focus();
		this._widget?.focus();
	}


	clearInput(): void {
		this._widget?.onWillHide();
		this._originalWidget?.onWillHide();

		this._widget?.dispose();
		this._originalWidget?.dispose();

		this._widget = null;
		this._originalWidget = null;
		super.clearInput();
	}

	layout(dimension: DOM.Dimension): void {
		this._rootElement.classList.toggle('mid-width', dimension.width < 1000 && dimension.width >= 600);
		this._rootElement.classList.toggle('narrow-width', dimension.width < 600);
		this._dimension = dimension;

		this._widget?.layout({
			width: this._dimension.width / 2,
			height: this._dimension.height
		}, this._modifiedElement);

		this._originalWidget?.layout({
			width: this._dimension.width / 2,
			height: this._dimension.height
		}, this._originalElement);
	}

}

interface IEditorDiffDecorations {
	decorations: IModelDeltaDecoration[];
	// overviewZones: OverviewRulerZone[];
}

interface IEditorsDiffDecorationsWithZones {
	original: IEditorDiffDecorations;
	modified: IEditorDiffDecorations;
}

export class DiffEditorWidgetSideBySide extends Disposable {
	private _insertColor: Color | null = null;
	private _removeColor: Color | null = null;

	constructor() {
		super();
	}

	public applyColors(theme: IColorTheme): boolean {
		let newInsertColor = (theme.getColor(diffInserted) || defaultInsertColor).transparent(2);
		let newRemoveColor = (theme.getColor(diffRemoved) || defaultRemoveColor).transparent(2);
		let hasChanges = !newInsertColor.equals(this._insertColor) || !newRemoveColor.equals(this._removeColor);
		this._insertColor = newInsertColor;
		this._removeColor = newRemoveColor;
		return hasChanges;
	}

	public getEditorsDiffDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalModel: IReadonlyTextBuffer, modifiedModel: IReadonlyTextBuffer): IEditorsDiffDecorationsWithZones {
		// Get decorations & overview ruler zones
		let originalDecorations = this._getOriginalEditorDecorations(lineChanges, ignoreTrimWhitespace, renderIndicators, originalModel);
		let modifiedDecorations = this._getModifiedEditorDecorations(lineChanges, ignoreTrimWhitespace, renderIndicators, modifiedModel);

		return {
			original: {
				decorations: originalDecorations.decorations,
			},
			modified: {
				decorations: modifiedDecorations.decorations,
			}
		};
	}

	protected _getOriginalEditorDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, originalModel: IReadonlyTextBuffer): IEditorDiffDecorations {
		// const overviewZoneColor = String(this._removeColor);

		let result: IEditorDiffDecorations = {
			decorations: [],
			// overviewZones: []
		};

		for (let i = 0, length = lineChanges.length; i < length; i++) {
			let lineChange = lineChanges[i];

			if (isChangeOrDelete(lineChange)) {
				result.decorations.push({
					range: new Range(lineChange.originalStartLineNumber, 1, lineChange.originalEndLineNumber, Constants.MAX_SAFE_SMALL_INTEGER),
					options: (renderIndicators ? DECORATIONS.lineDeleteWithSign : DECORATIONS.lineDelete)
				});
				if (!isChangeOrInsert(lineChange) || !lineChange.charChanges) {
					result.decorations.push(createDecoration(lineChange.originalStartLineNumber, 1, lineChange.originalEndLineNumber, Constants.MAX_SAFE_SMALL_INTEGER, DECORATIONS.charDeleteWholeLine));
				}

				// result.overviewZones.push(new OverviewRulerZone(
				// 	lineChange.originalStartLineNumber,
				// 	lineChange.originalEndLineNumber,
				// 	overviewZoneColor
				// ));

				if (lineChange.charChanges) {
					for (let j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
						let charChange = lineChange.charChanges[j];
						if (isChangeOrDelete(charChange)) {
							if (ignoreTrimWhitespace) {
								for (let lineNumber = charChange.originalStartLineNumber; lineNumber <= charChange.originalEndLineNumber; lineNumber++) {
									let startColumn: number;
									let endColumn: number;
									if (lineNumber === charChange.originalStartLineNumber) {
										startColumn = charChange.originalStartColumn;
									} else {
										startColumn = originalModel.getLineFirstNonWhitespaceColumn(lineNumber);
									}
									if (lineNumber === charChange.originalEndLineNumber) {
										endColumn = charChange.originalEndColumn;
									} else {
										endColumn = originalModel.getLineLastNonWhitespaceColumn(lineNumber);
									}
									result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, DECORATIONS.charDelete));
								}
							} else {
								result.decorations.push(createDecoration(charChange.originalStartLineNumber, charChange.originalStartColumn, charChange.originalEndLineNumber, charChange.originalEndColumn, DECORATIONS.charDelete));
							}
						}
					}
				}
			}
		}

		return result;
	}

	protected _getModifiedEditorDecorations(lineChanges: editorCommon.ILineChange[], ignoreTrimWhitespace: boolean, renderIndicators: boolean, modifiedModel: IReadonlyTextBuffer): IEditorDiffDecorations {
		// const overviewZoneColor = String(this._insertColor);

		let result: IEditorDiffDecorations = {
			decorations: [],
			// overviewZones: []
		};


		for (let i = 0, length = lineChanges.length; i < length; i++) {
			let lineChange = lineChanges[i];

			if (isChangeOrInsert(lineChange)) {

				result.decorations.push({
					range: new Range(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Constants.MAX_SAFE_SMALL_INTEGER),
					options: (renderIndicators ? DECORATIONS.lineInsertWithSign : DECORATIONS.lineInsert)
				});
				if (!isChangeOrDelete(lineChange) || !lineChange.charChanges) {
					result.decorations.push(createDecoration(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Constants.MAX_SAFE_SMALL_INTEGER, DECORATIONS.charInsertWholeLine));
				}
				// result.overviewZones.push(new OverviewRulerZone(
				// 	lineChange.modifiedStartLineNumber,
				// 	lineChange.modifiedEndLineNumber,
				// 	overviewZoneColor
				// ));

				if (lineChange.charChanges) {
					for (let j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
						let charChange = lineChange.charChanges[j];
						if (isChangeOrInsert(charChange)) {
							if (ignoreTrimWhitespace) {
								for (let lineNumber = charChange.modifiedStartLineNumber; lineNumber <= charChange.modifiedEndLineNumber; lineNumber++) {
									let startColumn: number;
									let endColumn: number;
									if (lineNumber === charChange.modifiedStartLineNumber) {
										startColumn = charChange.modifiedStartColumn;
									} else {
										startColumn = modifiedModel.getLineFirstNonWhitespaceColumn(lineNumber);
									}
									if (lineNumber === charChange.modifiedEndLineNumber) {
										endColumn = charChange.modifiedEndColumn;
									} else {
										endColumn = modifiedModel.getLineLastNonWhitespaceColumn(lineNumber);
									}
									result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, DECORATIONS.charInsert));
								}
							} else {
								result.decorations.push(createDecoration(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn, DECORATIONS.charInsert));
							}
						}
					}
				}

			}
		}
		return result;
	}
}
