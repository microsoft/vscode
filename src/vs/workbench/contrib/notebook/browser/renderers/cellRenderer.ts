/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../notebook';
import * as DOM from 'vs/base/browser/dom';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { deepClone } from 'vs/base/common/objects';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { getZoomLevel } from 'vs/base/browser/browser';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action } from 'vs/base/common/actions';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { MimeTypeRenderer } from 'vs/workbench/contrib/notebook/browser/outputRenderer';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/sizeObserver';
import { NotebookHandler, CellRenderTemplate, CELL_MARGIN } from 'vs/workbench/contrib/notebook/browser/renderers/interfaces';
import { StatefullMarkdownCell } from 'vs/workbench/contrib/notebook/browser/renderers/markdownCell';
import { CellViewModel } from './cellViewModel';

export class NotebookCellListDelegate implements IListVirtualDelegate<CellViewModel> {
	private _lineHeight: number;
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this._lineHeight = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel()).lineHeight;
	}

	getHeight(element: CellViewModel): number {
		return element.getHeight(this._lineHeight);
	}

	hasDynamicHeight(element: CellViewModel): boolean {
		return element.hasDynamicHeight();
	}

	getDynamicHeight(element: CellViewModel) {
		return element.getDynamicHeight() || 0;
	}

	getTemplateId(element: CellViewModel): string {
		if (element.cellType === 'markdown') {
			return MarkdownCellRenderer.TEMPLATE_ID;
		} else {
			return CodeCellRenderer.TEMPLATE_ID;
		}
	}
}

class AbstractCellRenderer {
	protected editorOptions: IEditorOptions;

	constructor(
		protected handler: NotebookHandler,
		private contextMenuService: IContextMenuService,
		private configurationService: IConfigurationService,
		language: string
	) {
		const editorOptions = deepClone(this.configurationService.getValue<IEditorOptions>('editor', { overrideIdentifier: language }));
		this.editorOptions = {
			...editorOptions,
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: false
			},
			overviewRulerLanes: 3,
			fixedOverflowWidgets: false,
			lineNumbersMinChars: 1,
			minimap: { enabled: false },
		};
	}

	showContextMenu(listIndex: number | undefined, element: CellViewModel, x: number, y: number) {
		const actions: Action[] = [];
		const insertAbove = new Action(
			'workbench.notebook.code.insertCellAbove',
			'Insert Code Cell Above',
			undefined,
			true,
			async () => {
				await this.handler.insertEmptyNotebookCell(listIndex, element, 'code', 'above');
			}
		);
		actions.push(insertAbove);

		const insertBelow = new Action(
			'workbench.notebook.code.insertCellBelow',
			'Insert Code Cell Below',
			undefined,
			true,
			async () => {
				await this.handler.insertEmptyNotebookCell(listIndex, element, 'code', 'below');
			}
		);
		actions.push(insertBelow);

		const insertMarkdownAbove = new Action(
			'workbench.notebook.markdown.insertCellAbove',
			'Insert Markdown Cell Above',
			undefined,
			true,
			async () => {
				await this.handler.insertEmptyNotebookCell(listIndex, element, 'markdown', 'above');
			}
		);
		actions.push(insertMarkdownAbove);

		const insertMarkdownBelow = new Action(
			'workbench.notebook.markdown.insertCellBelow',
			'Insert Markdown Cell Below',
			undefined,
			true,
			async () => {
				await this.handler.insertEmptyNotebookCell(listIndex, element, 'markdown', 'below');
			}
		);
		actions.push(insertMarkdownBelow);

		if (element.cellType === 'markdown') {
			const editAction = new Action(
				'workbench.notebook.editCell',
				'Edit Cell',
				undefined,
				true,
				async () => {
					this.handler.editNotebookCell(listIndex, element);
				}
			);

			actions.push(editAction);

			const saveAction = new Action(
				'workbench.notebook.saveCell',
				'Save Cell',
				undefined,
				true,
				async () => {
					this.handler.saveNotebookCell(listIndex, element);
				}
			);

			actions.push(saveAction);
		}

		const deleteCell = new Action(
			'workbench.notebook.deleteCell',
			'Delete Cell',
			undefined,
			true,
			async () => {
				this.handler.deleteNotebookCell(listIndex, element);
			}
		);

		actions.push(deleteCell);

		this.contextMenuService.showContextMenu({
			getAnchor: () => {
				return {
					x,
					y
				};
			},
			getActions: () => {
				return actions;
			},
			autoSelectFirstItem: true
		});
	}
}

export class MarkdownCellRenderer extends AbstractCellRenderer implements IListRenderer<CellViewModel, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';
	private disposables: Map<CellViewModel, DisposableStore> = new Map();
	private count = 0;

	constructor(
		handler: NotebookHandler,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(handler, contextMenuService, configurationService, 'markdown');
	}

	get templateId() {
		return MarkdownCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellRenderTemplate {
		const codeInnerContent = document.createElement('div');
		DOM.addClasses(codeInnerContent, 'cell', 'code');
		codeInnerContent.style.display = 'none';

		container.appendChild(codeInnerContent);

		const innerContent = document.createElement('div');
		DOM.addClasses(innerContent, 'cell', 'markdown');
		container.appendChild(innerContent);

		const action = document.createElement('div');
		DOM.addClasses(action, 'menu', 'codicon-settings-gear', 'codicon');
		container.appendChild(action);

		const template = {
			container: container,
			cellContainer: innerContent,
			menuContainer: action,
			editingContainer: codeInnerContent,
			index: ++this.count
		};

		return template;
	}

	renderElement(element: CellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		templateData.editingContainer!.style.display = 'none';
		templateData.cellContainer.innerHTML = element.getHTML() || '';

		if (height) {
			this.disposables.get(element)?.clear();
			if (!this.disposables.has(element)) {
				this.disposables.set(element, new DisposableStore());
			}
			let elementDisposable = this.disposables.get(element);

			elementDisposable!.add(DOM.addStandardDisposableListener(templateData.menuContainer!, 'mousedown', e => {
				const { top, height } = DOM.getDomNodePagePosition(templateData.menuContainer!);
				e.preventDefault();

				const listIndexAttr = templateData.menuContainer?.parentElement?.getAttribute('data-index');
				const listIndex = listIndexAttr ? Number(listIndexAttr) : undefined;
				this.showContextMenu(listIndex, element, e.posx, top + height);
			}));

			elementDisposable!.add(new StatefullMarkdownCell(this.handler, element, templateData, this.editorOptions, this.instantiationService));
		}
	}

	disposeTemplate(templateData: CellRenderTemplate): void {
		// throw nerendererw Error('Method not implemented.');

	}

	disposeElement(element: CellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		if (height) {
			this.disposables.get(element)?.clear();
		}
	}
}

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<CellViewModel, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'code_cell';
	private disposables: Map<HTMLElement, IDisposable> = new Map();
	private count = 0;

	constructor(
		protected handler: NotebookHandler,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService,
		@IWebviewService private readonly webviewService: IWebviewService
	) {
		super(handler, contextMenuService, configurationService, 'python');
	}

	get templateId() {
		return CodeCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellRenderTemplate {
		const innerContent = document.createElement('div');
		DOM.addClasses(innerContent, 'cell', 'code');
		container.appendChild(innerContent);
		const editor = this.instantiationService.createInstance(CodeEditorWidget, innerContent, {
			...this.editorOptions,
			dimension: {
				width: 0,
				height: 0
			}
		}, {});
		const action = document.createElement('div');
		DOM.addClasses(action, 'menu', 'codicon-settings-gear', 'codicon');
		container.appendChild(action);

		const outputContainer = document.createElement('div');
		DOM.addClasses(outputContainer, 'output');
		container.appendChild(outputContainer);

		let tempalte = {
			container: container,
			cellContainer: innerContent,
			menuContainer: action,
			outputContainer: outputContainer,
			editor,
			index: ++this.count
		};

		return tempalte;
	}

	renderElement(element: CellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		let width;
		const listDimension = this.handler.getListDimension();
		if (listDimension) {
			width = listDimension.width - CELL_MARGIN * 2;
		} else {
			width = templateData.container.clientWidth - 24 /** for scrollbar and margin right */;
		}

		const lineNum = element.lineCount;
		const lineHeight = this.handler.getFontInfo()?.lineHeight ?? 18;
		const totalHeight = lineNum * lineHeight;
		const model = element.getTextModel();
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

		let contentSizeChangeListener = templateData.editor?.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				let width = templateData.editor!.getLayoutInfo().width;
				templateData.editor?.layout(
					{
						width: width,
						height: e.contentHeight

					}
				);
			}
		});

		let listener = DOM.addStandardDisposableListener(templateData.menuContainer!, 'mousedown', e => {
			let { top, height } = DOM.getDomNodePagePosition(templateData.menuContainer!);
			e.preventDefault();

			const listIndexAttr = templateData.menuContainer?.parentElement?.getAttribute('data-index');
			const listIndex = listIndexAttr ? Number(listIndexAttr) : undefined;

			this.showContextMenu(listIndex, element, e.posx, top + height);
		});

		let rerenderOutput = element.onDidChangeOutputs(() => {
			if (element.outputs.length > 0) {
				let hasDynamicHeight = true;
				for (let i = 0; i < element.outputs.length; i++) {
					let result = MimeTypeRenderer.render(element.outputs[i], this.themeService, this.webviewService);
					if (result) {
						hasDynamicHeight = hasDynamicHeight || result?.hasDynamicHeight;
						templateData.outputContainer?.appendChild(result.element);
						if (result.shadowContent) {
							hasDynamicHeight = false;
							this.handler.createContentWidget(element, i, result.shadowContent, totalHeight + 8);
						}
					}
				}

				if (height !== undefined && hasDynamicHeight) {
					let clientHeight = templateData.outputContainer!.clientHeight;
					let listDimension = this.handler.getListDimension();
					let dimension = listDimension ? {
						width: listDimension.width - CELL_MARGIN * 2,
						height: clientHeight
					} : undefined;
					const elementSizeObserver = getResizesObserver(templateData.outputContainer!, dimension, () => {
						if (templateData.outputContainer && document.body.contains(templateData.outputContainer!)) {
							let height = elementSizeObserver.getHeight();
							if (clientHeight !== height) {
								element.setDynamicHeight(totalHeight + 32 + height);
								this.handler.layoutElement(element, totalHeight + 32 + height);
							}

							elementSizeObserver.dispose();
						}
					});
					// const elementSizeObserver = new ElementSizeObserver();
					elementSizeObserver.startObserving();
					if (!hasDynamicHeight && clientHeight !== 0) {
						element.setDynamicHeight(totalHeight + 32 + clientHeight);
						this.handler.layoutElement(element, totalHeight + 32 + clientHeight);
					}

					this.disposables.set(templateData.cellContainer, {
						dispose: () => {
							elementSizeObserver.dispose();
						}
					});
				}
			}
		});

		this.disposables.set(templateData.menuContainer!, listener!);

		this.disposables.set(templateData.cellContainer, {
			dispose: () => {
				listener.dispose();
				contentSizeChangeListener?.dispose();
				rerenderOutput.dispose();
				cellWidthResizeObserver.stopObserving();
				cellWidthResizeObserver.dispose();
			}
		});

		if (templateData.outputContainer) {
			templateData.outputContainer!.innerHTML = '';
		}

		if (element.outputs.length > 0) {
			let hasDynamicHeight = true;
			for (let i = 0; i < element.outputs.length; i++) {
				let result = MimeTypeRenderer.render(element.outputs[i], this.themeService, this.webviewService);
				if (result) {
					hasDynamicHeight = hasDynamicHeight || result?.hasDynamicHeight;
					templateData.outputContainer?.appendChild(result.element);
					if (result.shadowContent) {
						hasDynamicHeight = false;
						this.handler.createContentWidget(element, i, result.shadowContent, totalHeight + 8);
					}
				}
			}

			if (height !== undefined && hasDynamicHeight) {
				let clientHeight = templateData.outputContainer!.clientHeight;
				let listDimension = this.handler.getListDimension();
				let dimension = listDimension ? {
					width: listDimension.width - CELL_MARGIN * 2,
					height: clientHeight
				} : undefined;
				const elementSizeObserver = getResizesObserver(templateData.outputContainer!, dimension, () => {
					if (templateData.outputContainer && document.body.contains(templateData.outputContainer!)) {
						let height = elementSizeObserver.getHeight();
						if (clientHeight !== height) {
							element.setDynamicHeight(totalHeight + 32 + height);
							this.handler.layoutElement(element, totalHeight + 32 + height);
						}

						elementSizeObserver.dispose();
					}
				});
				elementSizeObserver.startObserving();
				if (!hasDynamicHeight && clientHeight !== 0) {
					element.setDynamicHeight(totalHeight + 32 + clientHeight);
					this.handler.layoutElement(element, totalHeight + 32 + clientHeight);
				}

				this.disposables.set(templateData.cellContainer, {
					dispose: () => {
						elementSizeObserver.dispose();
					}
				});
			}
		}

	}

	disposeTemplate(templateData: CellRenderTemplate): void {
		// throw nerendererw Error('Method not implemented.');
	}


	disposeElement(element: CellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		let menuContainer = this.disposables.get(templateData.menuContainer!);

		if (menuContainer) {
			menuContainer.dispose();
			this.disposables.delete(templateData.menuContainer!);
		}

		let cellDisposable = this.disposables.get(templateData.cellContainer);

		if (cellDisposable) {
			cellDisposable.dispose();
			this.disposables.delete(templateData.cellContainer);
		}

		if (templateData.outputContainer) {
			let outputDisposable = this.disposables.get(templateData.outputContainer!);

			if (outputDisposable) {
				outputDisposable.dispose();
				this.disposables.delete(templateData.outputContainer!);
			}
		}

		this.handler.disposeViewCell(element);
	}
}
