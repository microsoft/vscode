/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/renderers/sizeObserver';
import { CELL_MARGIN, IOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellRenderTemplate, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

export class CodeCell extends Disposable {
	private outputResizeListeners = new Map<IOutput, IDisposable>();
	private outputElements = new Map<IOutput, HTMLElement>();
	constructor(
		private notebookEditor: INotebookEditor,
		private viewCell: CellViewModel,
		private templateData: CellRenderTemplate,
	) {
		super();

		let width: number;
		const listDimension = notebookEditor.getListDimension();
		if (listDimension) {
			width = listDimension.width - CELL_MARGIN * 2;
		} else {
			width = templateData.container.clientWidth - 24 /** for scrollbar and margin right */;
		}

		const lineNum = viewCell.lineCount;
		const lineHeight = notebookEditor.getFontInfo()?.lineHeight ?? 18;
		const totalHeight = lineNum * lineHeight;
		templateData.editor?.layout(
			{
				width: width,
				height: totalHeight
			}
		);
		viewCell.editorHeight = totalHeight;

		const cts = new CancellationTokenSource();
		this._register({ dispose() { cts.dispose(true); } });
		raceCancellation(viewCell.resolveTextModel(), cts.token).then(model => {
			if (model) {
				templateData.editor?.setModel(model);

				let realContentHeight = templateData.editor?.getContentHeight();
				let width: number;
				const listDimension = notebookEditor.getListDimension();
				if (listDimension) {
					width = listDimension.width - CELL_MARGIN * 2;
				} else {
					width = templateData.container.clientWidth - 24 /** for scrollbar and margin right */;
				}

				if (realContentHeight !== undefined && realContentHeight !== totalHeight) {
					templateData.editor?.layout(
						{
							width: width,
							height: realContentHeight
						}
					);

					viewCell.editorHeight = realContentHeight;
				}
			}
		});

		let cellWidthResizeObserver = getResizesObserver(templateData.cellContainer, {
			width: width,
			height: totalHeight
		}, () => {
			let newWidth = cellWidthResizeObserver.getWidth();
			let realContentHeight = templateData.editor!.getContentHeight();
			templateData.editor?.layout(
				{
					width: newWidth,
					height: realContentHeight
				}
			);

			viewCell.editorHeight = realContentHeight;
		});

		cellWidthResizeObserver.startObserving();
		this._register(cellWidthResizeObserver);

		this._register(templateData.editor!.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				let layout = templateData.editor!.getLayoutInfo();
				if (layout.height !== e.contentHeight) {
					templateData.editor?.layout(
						{
							width: layout.width,
							height: e.contentHeight

						}
					);

					viewCell.editorHeight = e.contentHeight;

					if (viewCell.outputs.length) {
						let outputHeight = viewCell.getOutputTotalHeight();
						notebookEditor.layoutNotebookCell(viewCell, e.contentHeight + 32 + outputHeight);
					} else {
						notebookEditor.layoutNotebookCell(viewCell, e.contentHeight + 16);
					}
				}
			}
		}));

		this._register(viewCell.onDidChangeOutputs((splices) => {
			if (this.viewCell.outputs.length) {
				this.templateData.outputContainer!.style.display = 'block';
			} else {
				this.templateData.outputContainer!.style.display = 'none';
			}

			let reversedSplices = splices.reverse();

			reversedSplices.forEach(splice => {
				viewCell.spliceOutputHeights(splice[0], splice[1], splice[2].map(_ => 0));
			});

			let removedKeys: IOutput[] = [];

			this.outputElements.forEach((value, key) => {
				if (viewCell.outputs.indexOf(key) < 0) {
					// already removed
					removedKeys.push(key);
					// remove element from DOM
					this.templateData?.outputContainer?.removeChild(value);
				}
			});

			removedKeys.forEach(key => {
				// remove element cache
				this.outputElements.delete(key);
				// remove elment resize listener if there is one
				this.outputResizeListeners.delete(key);
			});

			let prevElement: HTMLElement | undefined = undefined;

			this.viewCell.outputs.reverse().forEach(output => {
				if (this.outputElements.has(output)) {
					// already exist
					prevElement = this.outputElements.get(output);
					return;
				}

				// newly added element
				let currIndex = this.viewCell.outputs.indexOf(output);
				this.renderOutput(output, currIndex, prevElement);
				prevElement = this.outputElements.get(output);
			});

			let editorHeight = templateData.editor!.getContentHeight();
			let totalOutputHeight = viewCell.getOutputTotalHeight();
			notebookEditor.layoutNotebookCell(viewCell, editorHeight + 32 + totalOutputHeight);
		}));

		if (viewCell.outputs.length > 0) {
			this.templateData.outputContainer!.style.display = 'block';
			// there are outputs, we need to calcualte their sizes and trigger relayout
			// @todo, if there is no resizable output, we should not check their height individually, which hurts the performance
			for (let index = 0; index < this.viewCell.outputs.length; index++) {
				const currOutput = this.viewCell.outputs[index];

				// always add to the end
				this.renderOutput(currOutput, index, undefined);
			}

			let totalOutputHeight = viewCell.getOutputTotalHeight();
			this.notebookEditor.layoutNotebookCell(viewCell, totalHeight + 32 + totalOutputHeight);
		} else {
			// noop
			this.templateData.outputContainer!.style.display = 'none';
		}
	}

	renderOutput(currOutput: IOutput, index: number, beforeElement?: HTMLElement) {
		let outputItemDiv = document.createElement('div');
		let result = this.notebookEditor.getOutputRenderer().render(currOutput, outputItemDiv);

		if (!result) {
			this.viewCell.updateOutputHeight(index, 0);
			return;
		}

		this.outputElements.set(currOutput, outputItemDiv);

		if (beforeElement) {
			this.templateData.outputContainer?.insertBefore(outputItemDiv, beforeElement);
		} else {
			this.templateData.outputContainer?.appendChild(outputItemDiv);
		}

		if (result.shadowContent) {
			let editorHeight = this.viewCell.editorHeight;
			this.notebookEditor.createInset(this.viewCell, currOutput, result.shadowContent, editorHeight + 8 + this.viewCell.getOutputOffset(index));
		}

		let hasDynamicHeight = result.hasDynamicHeight;

		if (hasDynamicHeight) {
			let clientHeight = outputItemDiv.clientHeight;
			let listDimension = this.notebookEditor.getListDimension();
			let dimension = listDimension ? {
				width: listDimension.width - CELL_MARGIN * 2,
				height: clientHeight
			} : undefined;
			const elementSizeObserver = getResizesObserver(outputItemDiv, dimension, () => {
				if (this.templateData.outputContainer && document.body.contains(this.templateData.outputContainer!)) {
					let height = elementSizeObserver.getHeight();

					if (clientHeight === height) {
						console.log(this.viewCell.outputs);
						return;
					}

					const currIndex = this.viewCell.outputs.indexOf(currOutput);
					if (currIndex < 0) {
						return;
					}

					this.viewCell.updateOutputHeight(currIndex, height);
					const editorHeight = this.viewCell.editorHeight;
					const totalOutputHeight = this.viewCell.getOutputTotalHeight();
					this.viewCell.dynamicHeight = editorHeight + 32 + totalOutputHeight;
					this.notebookEditor.layoutNotebookCell(this.viewCell, editorHeight + 32 + totalOutputHeight);
				}
			});
			elementSizeObserver.startObserving();
			this.outputResizeListeners.set(currOutput, elementSizeObserver);
			this.viewCell.updateOutputHeight(index, clientHeight);
		} else {
			if (result.shadowContent) {
				// webview
				// noop
				// let cachedHeight = this.viewCell.getOutputHeight(currOutput);
			} else {
				// static output
				let clientHeight = outputItemDiv.clientHeight;
				this.viewCell.updateOutputHeight(index, clientHeight);
			}
		}
	}

	dispose() {
		this.outputResizeListeners.forEach((value) => {
			value.dispose();
		});

		super.dispose();
	}
}

