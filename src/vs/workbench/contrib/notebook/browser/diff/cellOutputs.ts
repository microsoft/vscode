/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { CellDiffViewModelBase, SideBySideCellDiffViewModel, SingleSideCellDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/celllDiffViewModel';
import { INotebookTextDiffEditor } from 'vs/workbench/contrib/notebook/browser/diff/common';
import { ICellOutputViewModel, IRenderOutput, outputHasDynamicHeight, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellWidgets';
import { CellOutputViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/cellOutputViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { BUILTIN_RENDERER_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export class OutputElement extends Disposable {
	readonly resizeListener = new DisposableStore();
	domNode!: HTMLElement;
	renderResult?: IRenderOutput;

	constructor(
		private notebookEditor: INotebookTextDiffEditor,
		private notebookTextModel: NotebookTextModel,
		private notebookService: INotebookService,
		private cellViewModel: CellDiffViewModelBase,
		private modified: boolean,

		private cell: NotebookCellTextModel,
		private outputContainer: HTMLElement,
		readonly output: ICellOutputViewModel
	) {
		super();
	}

	render(index: number, beforeElement?: HTMLElement) {
		const outputItemDiv = document.createElement('div');
		let result: IRenderOutput | undefined = undefined;

		if (this.output.isDisplayOutput()) {
			const [mimeTypes, pick] = this.output.resolveMimeTypes(this.notebookTextModel);
			const pickedMimeTypeRenderer = mimeTypes[pick];
			const innerContainer = DOM.$('.output-inner-container');
			DOM.append(outputItemDiv, innerContainer);


			if (pickedMimeTypeRenderer.rendererId !== BUILTIN_RENDERER_ID) {
				const renderer = this.notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
				result = renderer
					? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: pickedMimeTypeRenderer.mimeType }
					: this.notebookEditor.getOutputRenderer().render(this.output, innerContainer, pickedMimeTypeRenderer.mimeType, this.notebookTextModel.uri,);
			} else {
				result = this.notebookEditor.getOutputRenderer().render(this.output, innerContainer, pickedMimeTypeRenderer.mimeType, this.notebookTextModel.uri);
			}

			this.output.pickedMimeType = pick;
		} else {
			// for text and error, there is no mimetype
			const innerContainer = DOM.$('.output-inner-container');
			DOM.append(outputItemDiv, innerContainer);

			result = this.notebookEditor.getOutputRenderer().render(this.output, innerContainer, undefined, this.notebookTextModel.uri);
		}

		this.domNode = outputItemDiv;
		this.renderResult = result;

		if (!result) {
			// this.viewCell.updateOutputHeight(index, 0);
			return;
		}

		if (beforeElement) {
			this.outputContainer.insertBefore(outputItemDiv, beforeElement);
		} else {
			this.outputContainer.appendChild(outputItemDiv);
		}

		if (result.type !== RenderOutputType.None) {
			// this.viewCell.selfSizeMonitoring = true;
			this.notebookEditor.createInset(
				this.cellViewModel,
				this.cell,
				result,
				this.getOutputOffsetInContainer(index),
				this.cellViewModel instanceof SideBySideCellDiffViewModel
					? this.modified
					: this.cellViewModel.type === 'insert'
			);
		} else {
			outputItemDiv.classList.add('foreground', 'output-element');
			outputItemDiv.style.position = 'absolute';
		}

		if (outputHasDynamicHeight(result)) {
			// this.viewCell.selfSizeMonitoring = true;
			const clientHeight = outputItemDiv.clientHeight;
			// TODO, set an inital dimension to avoid force reflow
			// const dimension = {
			// 	width: this.cellViewModel.,
			// 	height: clientHeight
			// };

			const elementSizeObserver = getResizesObserver(outputItemDiv, undefined, () => {
				if (this.outputContainer && document.body.contains(this.outputContainer)) {
					const height = Math.ceil(elementSizeObserver.getHeight());

					if (clientHeight === height) {
						return;
					}

					const currIndex = this.getCellOutputCurrentIndex();
					if (currIndex < 0) {
						return;
					}

					this.updateHeight(currIndex, height);
				}
			});
			elementSizeObserver.startObserving();
			this.resizeListener.add(elementSizeObserver);
			this.updateHeight(index, clientHeight);
		} else if (result.type === RenderOutputType.None) { // no-op if it's a webview
			const clientHeight = Math.ceil(outputItemDiv.clientHeight);
			this.updateHeight(index, clientHeight);

			const top = this.getOutputOffsetInContainer(index);
			outputItemDiv.style.top = `${top}px`;
		}
	}

	getCellOutputCurrentIndex() {
		if (this.cellViewModel instanceof SideBySideCellDiffViewModel) {
			if (this.modified) {
				return this.cellViewModel.modified.outputs.indexOf(this.output.model);
			} else {
				return this.cellViewModel.original.outputs.indexOf(this.output.model);
			}
		} else {
			return (this.cellViewModel as SingleSideCellDiffViewModel).cellTextModel!.outputs.indexOf(this.output.model);
		}
	}

	updateHeight(index: number, height: number) {
		if (this.cellViewModel instanceof SideBySideCellDiffViewModel) {
			this.cellViewModel.updateOutputHeight(!this.modified, index, height);
		} else {
			(this.cellViewModel as SingleSideCellDiffViewModel).updateOutputHeight(index, height);
		}
	}

	getOutputOffsetInContainer(index: number) {
		if (this.cellViewModel instanceof SideBySideCellDiffViewModel) {
			return this.cellViewModel.getOutputOffsetInContainer(!this.modified, index);
		} else {
			return (this.cellViewModel as SingleSideCellDiffViewModel).getOutputOffsetInContainer(index);
		}
	}

	getOutputOffsetInCell(index: number) {
		if (this.cellViewModel instanceof SideBySideCellDiffViewModel) {
			return this.cellViewModel.getOutputOffsetInCell(!this.modified, index);
		} else {
			return (this.cellViewModel as SingleSideCellDiffViewModel).getOutputOffsetInCell(index);
		}
	}
}

export class OutputContainer extends Disposable {
	private _outputViewModels: ICellOutputViewModel[];
	private outputEntries = new Map<ICellOutputViewModel, OutputElement>();
	constructor(
		private _editor: INotebookTextDiffEditor,
		private notebookTextModel: NotebookTextModel,
		private cellViewModel: CellDiffViewModelBase,
		private cell: NotebookCellTextModel,
		private modified: boolean,
		private outputContainer: HTMLElement,
		@INotebookService private notebookService: INotebookService,
		// @IQuickInputService private readonly quickInputService: IQuickInputService,
		@IOpenerService readonly openerService: IOpenerService,
		@ITextFileService readonly textFileService: ITextFileService,

	) {
		super();
		this._outputViewModels = cell.outputs.map(output => new CellOutputViewModel(output, notebookService));

		// TODO, onDidChangeOutputs

		// viewCell.onDidChangeLayout
		// say the height of the cell editor changes

		this._register(this.cellViewModel.onDidLayoutChange(() => {
			this.outputEntries.forEach((value, key) => {
				const index = cell.outputs.indexOf(key.model);
				if (index >= 0) {
					if (this.cellViewModel instanceof SideBySideCellDiffViewModel) {
						const top = this.cellViewModel.getOutputOffsetInContainer(!this.modified, index);
						value.domNode.style.top = `${top}px`;
					} else {
						const top = (this.cellViewModel as SingleSideCellDiffViewModel).getOutputOffsetInContainer(index);
						value.domNode.style.top = `${top}px`;
					}
				}
			});
		}));
	}

	render() {
		// TODO, outputs to render (should have a limit)
		for (let index = 0; index < this._outputViewModels.length; index++) {
			const currOutput = this._outputViewModels[index];

			// always add to the end
			this._renderOutput(currOutput, index, undefined);
		}
	}

	private _renderOutput(currOutput: ICellOutputViewModel, index: number, beforeElement?: HTMLElement) {
		if (!this.outputEntries.has(currOutput)) {
			this.outputEntries.set(currOutput, new OutputElement(this._editor, this.notebookTextModel, this.notebookService, this.cellViewModel, this.modified, this.cell, this.outputContainer, currOutput));
		}

		const renderElement = this.outputEntries.get(currOutput)!;
		renderElement.render(index, beforeElement);
	}
}
