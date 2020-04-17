/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hide, IDimension, show } from 'vs/base/browser/dom';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { renderCodicons } from 'vs/base/common/codicons';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextModel } from 'vs/editor/common/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EDITOR_BOTTOM_PADDING, EDITOR_TOP_PADDING } from 'vs/workbench/contrib/notebook/browser/constants';
import { CellEditState, CellFocusMode, INotebookEditor, MarkdownCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/view/renderers/sizeObserver';
import { CellFoldingState } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { MarkdownCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markdownCellViewModel';

export class StatefullMarkdownCell extends Disposable {
	private editor: CodeEditorWidget | null = null;
	private markdownContainer: HTMLElement;
	private editingContainer: HTMLElement;

	private localDisposables: DisposableStore;
	private foldingState: CellFoldingState;

	constructor(
		private notebookEditor: INotebookEditor,
		private viewCell: MarkdownCellViewModel,
		private templateData: MarkdownCellRenderTemplate,
		editorOptions: IEditorOptions,
		instantiationService: IInstantiationService
	) {
		super();

		this.markdownContainer = templateData.cellContainer;
		this.editingContainer = templateData.editingContainer;
		this.localDisposables = new DisposableStore();
		this._register(this.localDisposables);

		const viewUpdate = () => {
			if (viewCell.editState === CellEditState.Editing) {
				// switch to editing mode
				const width = viewCell.layoutInfo.editorWidth;
				const lineNum = viewCell.lineCount;
				const lineHeight = viewCell.layoutInfo.fontInfo?.lineHeight || 17;
				const totalHeight = Math.max(lineNum, 1) * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;

				show(this.editingContainer);
				hide(this.markdownContainer);
				if (this.editor) {
					// not first time, we don't need to create editor or bind listeners
					viewCell.attachTextEditor(this.editor);
					if (notebookEditor.getActiveCell() === viewCell) {
						this.editor.focus();
					}

					this.bindEditorListeners(this.editor.getModel()!);
				} else {
					this.editingContainer.innerHTML = '';
					this.editor = instantiationService.createInstance(CodeEditorWidget, this.editingContainer, {
						...editorOptions,
						dimension: {
							width: width,
							height: totalHeight
						}
					}, {});

					const cts = new CancellationTokenSource();
					this._register({ dispose() { cts.dispose(true); } });
					raceCancellation(viewCell.resolveTextModel(), cts.token).then(model => {
						if (!model) {
							return;
						}

						this.editor!.setModel(model);
						if (notebookEditor.getActiveCell() === viewCell) {
							this.editor!.focus();
						}

						const realContentHeight = this.editor!.getContentHeight();
						if (realContentHeight !== totalHeight) {
							this.editor!.layout(
								{
									width: width,
									height: realContentHeight
								}
							);
						}

						viewCell.attachTextEditor(this.editor!);

						if (viewCell.editState === CellEditState.Editing) {
							this.editor!.focus();
						}

						this.bindEditorListeners(model, {
							width: width,
							height: totalHeight
						});
					});
				}

				const clientHeight = this.markdownContainer.clientHeight;
				this.viewCell.totalHeight = totalHeight + 32 + clientHeight;
				notebookEditor.layoutNotebookCell(viewCell, totalHeight + 32 + clientHeight);
				this.editor.focus();
			} else {
				this.viewCell.detachTextEditor();
				hide(this.editingContainer);
				show(this.markdownContainer);
				if (this.editor) {
					// switch from editing mode
					const clientHeight = templateData.container.clientHeight;
					this.viewCell.totalHeight = clientHeight;
					notebookEditor.layoutNotebookCell(viewCell, clientHeight);
				} else {
					// first time, readonly mode
					this.markdownContainer.innerHTML = '';
					let markdownRenderer = viewCell.getMarkdownRenderer();
					let renderedHTML = viewCell.getHTML();
					if (renderedHTML) {
						this.markdownContainer.appendChild(renderedHTML);
					}

					this.localDisposables.add(markdownRenderer.onDidUpdateRender(() => {
						const clientHeight = templateData.container.clientHeight;
						this.viewCell.totalHeight = clientHeight;
						notebookEditor.layoutNotebookCell(viewCell, clientHeight);
					}));

					this.localDisposables.add(viewCell.onDidChangeState((e) => {
						if (!e.contentChanged) {
							return;
						}

						this.markdownContainer.innerHTML = '';
						let renderedHTML = viewCell.getHTML();
						if (renderedHTML) {
							this.markdownContainer.appendChild(renderedHTML);
						}
					}));
				}
			}
		};

		this._register(viewCell.onDidChangeState((e) => {
			if (e.editStateChanged) {
				this.localDisposables.clear();
				viewUpdate();
			}
		}));

		this._register(viewCell.onDidChangeState((e) => {
			if (!e.focusModeChanged) {
				return;
			}

			if (viewCell.focusMode === CellFocusMode.Editor) {
				this.editor?.focus();
			}
		}));

		this.foldingState = viewCell.foldingState;
		this.setFoldingIndicator();

		this._register(viewCell.onDidChangeState((e) => {
			if (!e.foldingStateChanged) {
				return;
			}

			const foldingState = viewCell.foldingState;

			if (foldingState !== this.foldingState) {
				this.foldingState = foldingState;
				this.setFoldingIndicator();
			}
		}));

		viewUpdate();
	}

	setFoldingIndicator() {
		switch (this.foldingState) {
			case CellFoldingState.None:
				this.templateData.foldingIndicator.innerHTML = '';
				break;
			case CellFoldingState.Collapsed:
				this.templateData.foldingIndicator.innerHTML = renderCodicons('$(chevron-right)');
				break;
			case CellFoldingState.Expanded:
				this.templateData.foldingIndicator.innerHTML = renderCodicons('$(chevron-down)');
				break;

			default:
				break;
		}
	}

	bindEditorListeners(model: ITextModel, dimension?: IDimension) {
		this.localDisposables.add(model.onDidChangeContent(() => {
			this.viewCell.setText(model.getLinesContent());
			let clientHeight = this.markdownContainer.clientHeight;
			this.markdownContainer.innerHTML = '';
			let renderedHTML = this.viewCell.getHTML();
			if (renderedHTML) {
				this.markdownContainer.appendChild(renderedHTML);
				clientHeight = this.markdownContainer.clientHeight;
			}

			this.viewCell.totalHeight = this.editor!.getContentHeight() + 32 + clientHeight;
			this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
		}));

		this.localDisposables.add(this.editor!.onDidContentSizeChange(e => {
			let viewLayout = this.editor!.getLayoutInfo();

			if (e.contentHeightChanged) {
				this.editor!.layout(
					{
						width: viewLayout.width,
						height: e.contentHeight
					}
				);
				const clientHeight = this.markdownContainer.clientHeight;
				this.viewCell.totalHeight = e.contentHeight + 32 + clientHeight;
				this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
			}
		}));

		this.localDisposables.add(this.editor!.onDidChangeCursorSelection((e) => {
			if (e.source === 'restoreState') {
				// do not reveal the cell into view if this selection change was caused by restoring editors...
				return;
			}

			const primarySelection = this.editor!.getSelection();

			if (primarySelection) {
				this.notebookEditor.revealLineInView(this.viewCell, primarySelection!.positionLineNumber);
			}
		}));

		let cellWidthResizeObserver = getResizesObserver(this.templateData.editingContainer, dimension, () => {
			let newWidth = cellWidthResizeObserver.getWidth();
			let realContentHeight = this.editor!.getContentHeight();
			let layoutInfo = this.editor!.getLayoutInfo();

			// the dimension generated by the resize observer are float numbers, let's round it a bit to avoid relayout.
			if (newWidth < layoutInfo.width - 0.3 || layoutInfo.width + 0.3 < newWidth) {
				this.editor!.layout(
					{
						width: newWidth,
						height: realContentHeight
					}
				);
			}
		});

		cellWidthResizeObserver.startObserving();
		this.localDisposables.add(cellWidthResizeObserver);

		let markdownRenderer = this.viewCell.getMarkdownRenderer();
		this.markdownContainer.innerHTML = '';
		let renderedHTML = this.viewCell.getHTML();
		if (renderedHTML) {
			this.markdownContainer.appendChild(renderedHTML);
			this.localDisposables.add(markdownRenderer.onDidUpdateRender(() => {
				const clientHeight = this.markdownContainer.clientHeight;
				this.viewCell.totalHeight = clientHeight;
				this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
			}));
		}
	}

	dispose() {
		this.viewCell.detachTextEditor();
		super.dispose();
	}
}
