/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/renderers/sizeObserver';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { CELL_MARGIN } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellRenderTemplate, NotebookHandler } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export class CodeCell extends Disposable {
	constructor(
		handler: NotebookHandler,
		viewCell: CellViewModel,
		templateData: CellRenderTemplate,
		themeService: IThemeService,
		instantiationService: IInstantiationService,
		modelService: IModelService,
		modeService: IModeService,
		height: number | undefined
	) {
		super();

		let width;
		const listDimension = handler.getListDimension();
		if (listDimension) {
			width = listDimension.width - CELL_MARGIN * 2;
		} else {
			width = templateData.container.clientWidth - 24 /** for scrollbar and margin right */;
		}

		const lineNum = viewCell.lineCount;
		const lineHeight = handler.getFontInfo()?.lineHeight ?? 18;
		const totalHeight = lineNum * lineHeight;
		const model = viewCell.getTextModel();
		templateData.editor?.setModel(model);
		templateData.editor?.layout(
			{
				width: width,
				height: totalHeight
			}
		);

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
						handler.layoutElement(viewCell, e.contentHeight + 32 + outputHeight);
					} else {
						handler.layoutElement(viewCell, e.contentHeight + 16);
					}
				}
			}
		}));

		this._register(viewCell.onDidChangeOutputs(() => {
			if (viewCell.outputs.length > 0) {
				let hasDynamicHeight = true;
				for (let i = 0; i < viewCell.outputs.length; i++) {
					let outputItemDiv = document.createElement('div');
					let result = handler.getOutputRenderer().render(viewCell.outputs[i], outputItemDiv);
					templateData.outputContainer?.appendChild(outputItemDiv);
					if (result) {
						hasDynamicHeight = hasDynamicHeight || result?.hasDynamicHeight;
						if (result.shadowContent) {
							hasDynamicHeight = false;
							handler.createContentWidget(viewCell, i, result.shadowContent, totalHeight + 8);
						}
					}
				}

				if (height !== undefined && hasDynamicHeight) {
					let clientHeight = templateData.outputContainer!.clientHeight;
					let listDimension = handler.getListDimension();
					let dimension = listDimension ? {
						width: listDimension.width - CELL_MARGIN * 2,
						height: clientHeight
					} : undefined;
					const elementSizeObserver = getResizesObserver(templateData.outputContainer!, dimension, () => {
						if (templateData.outputContainer && document.body.contains(templateData.outputContainer!)) {
							let height = elementSizeObserver.getHeight();
							if (clientHeight !== height) {
								viewCell.dynamicHeight = totalHeight + 32 + height;
								handler.layoutElement(viewCell, totalHeight + 32 + height);
							}

							elementSizeObserver.dispose();
						}
					});
					elementSizeObserver.startObserving();
					viewCell.dynamicHeight = totalHeight + 32 + clientHeight;
					handler.layoutElement(viewCell, totalHeight + 32 + clientHeight);

					this._register(elementSizeObserver);
				}
			}
		}));

		if (viewCell.outputs.length > 0) {
			let hasDynamicHeight = true;
			for (let i = 0; i < viewCell.outputs.length; i++) {
				let outputItemDiv = document.createElement('div');
				let result = handler.getOutputRenderer().render(viewCell.outputs[i], outputItemDiv);
				templateData.outputContainer?.appendChild(outputItemDiv);
				if (result) {
					hasDynamicHeight = hasDynamicHeight || result?.hasDynamicHeight;
					if (result.shadowContent) {
						hasDynamicHeight = false;
						handler.createContentWidget(viewCell, i, result.shadowContent, totalHeight + 8);
					}
				}
			}

			if (height !== undefined && hasDynamicHeight) {
				let clientHeight = templateData.outputContainer!.clientHeight;
				let listDimension = handler.getListDimension();
				let dimension = listDimension ? {
					width: listDimension.width - CELL_MARGIN * 2,
					height: clientHeight
				} : undefined;
				const elementSizeObserver = getResizesObserver(templateData.outputContainer!, dimension, () => {
					if (templateData.outputContainer && document.body.contains(templateData.outputContainer!)) {
						let height = elementSizeObserver.getHeight();
						if (clientHeight !== height) {
							viewCell.dynamicHeight = totalHeight + 32 + height;
							handler.layoutElement(viewCell, totalHeight + 32 + height);
						}

						elementSizeObserver.dispose();
					}
				});
				elementSizeObserver.startObserving();
				this._register(elementSizeObserver);
			}
		}
	}
}

