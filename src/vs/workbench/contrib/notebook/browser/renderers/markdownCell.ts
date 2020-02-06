/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { CellRenderTemplate, NotebookHandler, CELL_MARGIN } from 'vs/workbench/contrib/notebook/browser/renderers/interfaces';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/sizeObserver';

export class StatefullMarkdownCell extends Disposable {
	private editor: CodeEditorWidget | null = null;
	private cellContainer: HTMLElement;
	private menuContainer?: HTMLElement;
	private editingContainer?: HTMLElement;

	private localDisposables: DisposableStore;

	constructor(
		handler: NotebookHandler,
		viewCell: CellViewModel,
		templateData: CellRenderTemplate,
		editorOptions: IEditorOptions,
		instantiationService: IInstantiationService
	) {
		super();

		this.cellContainer = templateData.cellContainer;
		this.menuContainer = templateData.menuContainer;
		this.editingContainer = templateData.editingContainer;
		this.localDisposables = new DisposableStore();
		this._register(this.localDisposables);

		const viewUpdate = () => {
			if (viewCell.isEditing) {
				// switch to editing mode
				let width;
				const listDimension = handler.getListDimension();
				if (listDimension) {
					width = listDimension.width - CELL_MARGIN * 2;
				} else {
					width = this.cellContainer.clientWidth - 24 /** for scrollbar and margin right */;
				}

				const lineNum = viewCell.lineCount;
				const lineHeight = handler.getFontInfo()?.lineHeight ?? 18;
				const totalHeight = Math.max(lineNum, 1) * lineHeight;

				if (this.editor) {
					// not first time, we don't need to create editor or bind listeners
					this.editingContainer!.style.display = 'block';
				} else {
					this.editingContainer!.style.display = 'block';
					this.editingContainer!.innerHTML = '';
					this.editor = instantiationService.createInstance(CodeEditorWidget, this.editingContainer!, {
						...editorOptions,
						dimension: {
							width: width,
							height: totalHeight
						}
					}, {});

					const model = viewCell.getTextModel();
					this.editor.setModel(model);
					let realContentHeight = this.editor!.getContentHeight();

					if (realContentHeight !== totalHeight) {
						this.editor!.layout(
							{
								width: width,
								height: realContentHeight
							}
						);
					}

					this.localDisposables.add(model.onDidChangeContent(() => {
						viewCell.setText(model.getLinesContent());
						const clientHeight = this.cellContainer.clientHeight;
						this.cellContainer.innerHTML = viewCell.getHTML() || '';
						handler.layoutElement(viewCell, realContentHeight + 32 + clientHeight);
					}));

					this.localDisposables.add(this.editor.onDidContentSizeChange(e => {
						let viewLayout = this.editor!.getLayoutInfo();

						if (e.contentHeightChanged) {
							this.editor!.layout(
								{
									width: viewLayout.width,
									height: e.contentHeight
								}
							);
							const clientHeight = this.cellContainer.clientHeight;
							handler.layoutElement(viewCell, e.contentHeight + 32 + clientHeight);
						}
					}));

					let cellWidthResizeObserver = getResizesObserver(templateData.editingContainer!, {
						width: width,
						height: totalHeight
					}, () => {
						let newWidth = cellWidthResizeObserver.getWidth();
						let realContentHeight = this.editor!.getContentHeight();
						this.editor!.layout(
							{
								width: newWidth,
								height: realContentHeight
							}
						);
					});

					cellWidthResizeObserver.startObserving();
					this.localDisposables.add(cellWidthResizeObserver);

					templateData.cellContainer.innerHTML = viewCell.getHTML() || '';
				}

				const clientHeight = this.cellContainer.clientHeight;
				handler.layoutElement(viewCell, totalHeight + 32 + clientHeight);
				this.editor.focus();
			} else {
				if (this.editor) {
					// switch from editing mode
					this.editingContainer!.style.display = 'none';
					const clientHeight = this.cellContainer.clientHeight;
					handler.layoutElement(viewCell, clientHeight);
				} else {
					// first time, readonly mode
					this.editingContainer!.style.display = 'none';
					this.cellContainer.innerHTML = viewCell.getHTML() || '';
				}
			}
		};

		this._register(viewCell.onDidChangeEditingState(() => {
			this.localDisposables.clear();
			viewUpdate();
		}));

		viewUpdate();
	}
}
