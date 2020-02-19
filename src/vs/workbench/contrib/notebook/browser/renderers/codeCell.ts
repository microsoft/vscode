/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/renderers/sizeObserver';
import { CELL_MARGIN } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellRenderTemplate, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

export class CodeCell extends Disposable {
	constructor(
		notebookEditor: INotebookEditor,
		viewCell: CellViewModel,
		templateData: CellRenderTemplate,
	) {
		super();

		let width;
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
		const cts = new CancellationTokenSource();
		this._register({ dispose() { cts.dispose(true); } });
		raceCancellation(viewCell.resolveTextModel(), cts.token).then(model => model && templateData.editor?.setModel(model));

		let realContentHeight = templateData.editor?.getContentHeight();

		if (realContentHeight !== undefined && realContentHeight !== totalHeight) {
			templateData.editor?.layout(
				{
					width: width,
					height: realContentHeight
				}
			);
		}

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

					if (viewCell.outputs.length) {
						let outputHeight = templateData.outputContainer!.clientHeight;
						notebookEditor.layoutNotebookCell(viewCell, e.contentHeight + 32 + outputHeight);
					} else {
						notebookEditor.layoutNotebookCell(viewCell, e.contentHeight + 16);
					}
				}
			}
		}));

		this._register(viewCell.onDidChangeOutputs(() => {
			if (viewCell.outputs.length > 0) {
				let hasDynamicHeight = true;
				for (let i = 0; i < viewCell.outputs.length; i++) {
					let outputItemDiv = document.createElement('div');
					let result = notebookEditor.getOutputRenderer().render(viewCell.outputs[i], outputItemDiv);
					templateData.outputContainer?.appendChild(outputItemDiv);
					if (result) {
						hasDynamicHeight = hasDynamicHeight || result?.hasDynamicHeight;
						if (result.shadowContent) {
							hasDynamicHeight = false;
							notebookEditor.createInset(viewCell, i, result.shadowContent, totalHeight + 8);
						}
					}
				}

				if (hasDynamicHeight) {
					let clientHeight = templateData.outputContainer!.clientHeight;
					let listDimension = notebookEditor.getListDimension();
					let dimension = listDimension ? {
						width: listDimension.width - CELL_MARGIN * 2,
						height: clientHeight
					} : undefined;
					const elementSizeObserver = getResizesObserver(templateData.outputContainer!, dimension, () => {
						if (templateData.outputContainer && document.body.contains(templateData.outputContainer!)) {
							let height = elementSizeObserver.getHeight();
							if (clientHeight !== height) {
								viewCell.dynamicHeight = totalHeight + 32 + height;
								notebookEditor.layoutNotebookCell(viewCell, totalHeight + 32 + height);
							}

							elementSizeObserver.dispose();
						}
					});
					elementSizeObserver.startObserving();
					viewCell.dynamicHeight = totalHeight + 32 + clientHeight;
					notebookEditor.layoutNotebookCell(viewCell, totalHeight + 32 + clientHeight);

					this._register(elementSizeObserver);
				}
			}
		}));

		if (viewCell.outputs.length > 0) {
			// there are outputs, we need to calcualte their sizes and trigger relayout

			let hasDynamicHeight = true;
			for (let i = 0; i < viewCell.outputs.length; i++) {
				let outputItemDiv = document.createElement('div');
				let result = notebookEditor.getOutputRenderer().render(viewCell.outputs[i], outputItemDiv);
				templateData.outputContainer?.appendChild(outputItemDiv);
				if (result) {
					hasDynamicHeight = hasDynamicHeight || result?.hasDynamicHeight;
					if (result.shadowContent) {
						hasDynamicHeight = false;
						notebookEditor.createInset(viewCell, i, result.shadowContent, totalHeight + 8);
					}
				}
			}

			if (hasDynamicHeight) {
				let clientHeight = templateData.outputContainer!.clientHeight;
				let listDimension = notebookEditor.getListDimension();
				let dimension = listDimension ? {
					width: listDimension.width - CELL_MARGIN * 2,
					height: clientHeight
				} : undefined;
				const elementSizeObserver = getResizesObserver(templateData.outputContainer!, dimension, () => {
					if (templateData.outputContainer && document.body.contains(templateData.outputContainer!)) {
						let height = elementSizeObserver.getHeight();
						if (clientHeight !== height) {
							viewCell.dynamicHeight = totalHeight + 32 + height;
							notebookEditor.layoutNotebookCell(viewCell, totalHeight + 32 + height);
						}

						elementSizeObserver.dispose();
					}
				});
				elementSizeObserver.startObserving();
				this._register(elementSizeObserver);
			}

			const outputHeight = templateData.outputContainer?.clientHeight || 0;
			notebookEditor.layoutNotebookCell(viewCell, totalHeight + 32 + outputHeight);
		} else {
			// noop
		}
	}
}

