/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./notebook';
import * as DOM from 'vs/base/browser/dom';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import * as marked from 'vs/base/common/marked/marked';
import { IModelService } from 'vs/editor/common/services/modelService';
import { URI } from 'vs/base/common/uri';
import { deepClone } from 'vs/base/common/objects';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { getZoomLevel } from 'vs/base/browser/browser';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action } from 'vs/base/common/actions';
import { IDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { TabCompletionController } from 'vs/workbench/contrib/snippets/browser/tabCompletion';
import { MimeTypeRenderer } from 'vs/workbench/contrib/notebook/browser/outputRenderer';
import { ElementSizeObserver } from 'vs/editor/browser/config/elementSizeObserver';
import { ITextModel } from 'vs/editor/common/model';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Emitter } from 'vs/base/common/event';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import * as UUID from 'vs/base/common/uuid';
import { ICell } from 'vs/editor/common/modes';

export class ViewCell {
	private _textModel: ITextModel | null = null;
	private _mdRenderer: marked.Renderer | null = null;
	private _html: string | null = null;
	private _dynamicHeight: number | null = null;

	protected readonly _onDidDispose = new Emitter<void>();
	readonly onDidDispose = this._onDidDispose.event;

	protected readonly _onDidChangeEditingState = new Emitter<void>();
	readonly onDidChangeEditingState = this._onDidChangeEditingState.event;

	protected readonly _onDidChangeOutputs = new Emitter<void>();
	readonly onDidChangeOutputs = this._onDidChangeOutputs.event;

	get cellType() {
		return this.cell.cell_type;
	}

	get lineCount() {
		return this.cell.source.length;
	}

	get outputs() {
		return this.cell.outputs;
	}

	get isEditing(): boolean {
		return this._isEditing;
	}

	set isEditing(newState: boolean) {
		this._isEditing = newState;
		this._onDidChangeEditingState.fire();
	}

	public id: string;

	constructor(
		public cell: ICell,
		private _isEditing: boolean,
		private readonly modelService: IModelService,
		private readonly modeService: IModeService
	) {
		this.id = UUID.generateUuid();
		if (this.cell.onDidChangeOutputs) {
			this.cell.onDidChangeOutputs(() => {
				this._onDidChangeOutputs.fire();
			});
		}
	}

	hasDynamicHeight() {
		if (this._dynamicHeight !== null) {
			return false;
		}

		if (this.cellType === 'code') {
			if (this.outputs) {
				// for (let i = 0; i < this.outputs.length; i++) {
				// 	if (this.outputs[i].output_type === 'display_data' || this.outputs[i].output_type === 'execute_result') {
				// 		return false;
				// 	}
				// }

				return true;
			} else {
				return false;
			}
		}

		return true;
	}

	setDynamicHeight(height: number) {
		this._dynamicHeight = height;
	}

	getDynamicHeight() {
		return this._dynamicHeight;
	}

	getHeight(lineHeight: number) {
		if (this._dynamicHeight) {
			return this._dynamicHeight;
		}

		if (this.cellType === 'markdown') {
			return 100;
		} else {
			return Math.max(this.lineCount + 1, 5) * lineHeight + 16;
		}
	}

	setText(strs: string[]) {
		this.cell.source = strs.map(str => str + '\n');
		this._html = null;
	}

	save() {
		if (this._textModel && this.isEditing) {
			this.cell.source = this._textModel.getLinesContent().map(str => str + '\n');
		}
	}

	getText(): string {
		return this.cell.source.join('');
	}

	getHTML(): string | null {
		if (this.cellType === 'markdown') {
			if (this._html) {
				return this._html;
			}

			let renderer = this.getMDRenderer();
			this._html = marked(this.getText(), { renderer: renderer });
			return this._html;
		}

		return null;
	}

	getTextModel(): ITextModel {
		if (!this._textModel) {
			let ext = this.cellType === 'markdown' ? 'md' : 'py';
			const resource = URI.parse(`notebookcell-${Date.now()}.${ext}`);
			let content = this.cell.source.join('');
			this._textModel = this.modelService.createModel(content, this.modeService.createByFilepathOrFirstLine(resource), resource, false);
		}

		return this._textModel;
	}

	private getMDRenderer() {

		if (!this._mdRenderer) {
			this._mdRenderer = new marked.Renderer();
		}

		return this._mdRenderer;
	}
}

export interface NotebookHandler {
	insertEmptyNotebookCell(cell: ViewCell, type: 'markdown' | 'code', direction: 'above' | 'below'): void;
	deleteNotebookCell(cell: ViewCell): void;
	editNotebookCell(cell: ViewCell): void;
	saveNotebookCell(cell: ViewCell): void;
	layoutElement(cell: ViewCell, height: number): void;
	createContentWidget(cell: ViewCell, index: number, shadowContent: string, offset: number): void;
	disposeViewCell(cell: ViewCell): void;
	triggerWheel(event: IMouseWheelEvent): void;
}

export interface CellRenderTemplate {
	container: HTMLElement;
	cellContainer: HTMLElement;
	menuContainer?: HTMLElement;
	editingContainer?: HTMLElement;
	outputContainer?: HTMLElement;
	editor?: CodeEditorWidget;
	model?: ITextModel;
	index: number;
}

export class NotebookCellListDelegate implements IListVirtualDelegate<ViewCell> {
	private _lineHeight: number;
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this._lineHeight = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel()).lineHeight;
	}

	getHeight(element: ViewCell): number {
		return element.getHeight(this._lineHeight);
	}

	hasDynamicHeight(element: ViewCell): boolean {
		return element.hasDynamicHeight();
	}

	getDynamicHeight(element: ViewCell) {
		return element.getDynamicHeight() || 0;
	}

	getTemplateId(element: ViewCell): string {
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

	showContextMenu(element: ViewCell, x: number, y: number) {
		const actions: Action[] = [];
		const insertAbove = new Action(
			'workbench.notebook.code.insertCellAbove',
			'Insert Code Cell Above',
			undefined,
			true,
			async () => {
				this.handler.insertEmptyNotebookCell(element, 'code', 'above');
			}
		);
		actions.push(insertAbove);

		const insertBelow = new Action(
			'workbench.notebook.code.insertCellBelow',
			'Insert Code Cell Below',
			undefined,
			true,
			async () => {
				this.handler.insertEmptyNotebookCell(element, 'code', 'below');
			}
		);
		actions.push(insertBelow);

		const insertMarkdownAbove = new Action(
			'workbench.notebook.markdown.insertCellAbove',
			'Insert Markdown Cell Above',
			undefined,
			true,
			async () => {
				this.handler.insertEmptyNotebookCell(element, 'markdown', 'above');
			}
		);
		actions.push(insertMarkdownAbove);

		const insertMarkdownBelow = new Action(
			'workbench.notebook.markdown.insertCellBelow',
			'Insert Markdown Cell Below',
			undefined,
			true,
			async () => {
				this.handler.insertEmptyNotebookCell(element, 'markdown', 'below');
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
					this.handler.editNotebookCell(element);
				}
			);

			actions.push(editAction);

			const saveAction = new Action(
				'workbench.notebook.saveCell',
				'Save Cell',
				undefined,
				true,
				async () => {
					this.handler.saveNotebookCell(element);
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
				this.handler.deleteNotebookCell(element);
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

class StatefullMarkdownCell extends Disposable {
	private editor: CodeEditorWidget | null = null;

	constructor(
		handler: NotebookHandler,
		viewCell: ViewCell,
		templateData: CellRenderTemplate,
		editorOptions: IEditorOptions,
		instantiationService: IInstantiationService
	) {
		super();

		this._register(viewCell.onDidChangeEditingState(() => {
			if (viewCell.isEditing) {
				// switch to editing mode
				const width = templateData.container.clientWidth - 24 /** for scrollbar and margin right */;
				const lineNum = viewCell.lineCount;
				const totalHeight = Math.max(lineNum + 1, 5) * 21;

				if (this.editor) {
					// not first time, we don't need to create editor or bind listeners
					templateData.editingContainer!.style.display = 'block';
				} else {
					templateData.editingContainer!.style.display = 'block';
					templateData.editingContainer!.innerHTML = '';
					this.editor = instantiationService.createInstance(CodeEditorWidget, templateData.editingContainer!, {
						...editorOptions,
						dimension: {
							width: width,
							height: totalHeight
						}
					}, {});
					const model = viewCell.getTextModel();
					this.editor.setModel(model);
					templateData.cellContainer.innerHTML = viewCell.getHTML() || '';

					model.onDidChangeContent(e => {
						viewCell.setText(model.getLinesContent());
						templateData.cellContainer.innerHTML = viewCell.getHTML() || '';

						const clientHeight = templateData.cellContainer.clientHeight;
						handler.layoutElement(viewCell, totalHeight + 32 + clientHeight);
					});
				}

				const clientHeight = templateData.cellContainer.clientHeight;
				handler.layoutElement(viewCell, totalHeight + 32 + clientHeight);
				this.editor.focus();
			} else {
				if (this.editor) {
					// switch from editing mode
					templateData.editingContainer!.style.display = 'none';
					const clientHeight = templateData.cellContainer.clientHeight;
					handler.layoutElement(viewCell, clientHeight);
				} else {
					// first time, readonly mode
					templateData.editingContainer!.style.display = 'none';
					templateData.cellContainer.innerHTML = viewCell.getHTML() || '';
				}
			}
		}));
	}
}

export class MarkdownCellRenderer extends AbstractCellRenderer implements IListRenderer<ViewCell, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';
	private disposables: Map<ViewCell, DisposableStore> = new Map();
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

	renderElement(element: ViewCell, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
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

				this.showContextMenu(element, e.posx, top + height);
			}));

			elementDisposable!.add(new StatefullMarkdownCell(this.handler, element, templateData, this.editorOptions, this.instantiationService));
		}
	}

	disposeTemplate(templateData: CellRenderTemplate): void {
		// throw nerendererw Error('Method not implemented.');

	}

	disposeElement(element: ViewCell, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		if (height) {
			this.disposables.get(element)?.clear();
		}
	}
}

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<ViewCell, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'code_cell';
	private disposables: Map<HTMLElement, IDisposable> = new Map();
	private count = 0;

	constructor(
		handler: NotebookHandler,
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

	renderElement(element: ViewCell, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		const innerContent = templateData.cellContainer;
		const width = innerContent.clientWidth - 24 /** for scrollbar and margin right */;
		const lineNum = element.lineCount;
		const totalHeight = Math.max(lineNum + 1, 5) * 21;
		const model = element.getTextModel();
		templateData.editor?.setModel(model);
		templateData.editor?.layout(
			{
				width: width,
				height: totalHeight
			}
		);

		let listener = DOM.addStandardDisposableListener(templateData.menuContainer!, 'mousedown', e => {
			const { top, height } = DOM.getDomNodePagePosition(templateData.menuContainer!);
			e.preventDefault();

			this.showContextMenu(element, e.posx, top + height);
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
					let dimensions = DOM.getClientArea(templateData.outputContainer!);
					const elementSizeObserver = new ElementSizeObserver(templateData.outputContainer!, dimensions, () => {
						if (templateData.outputContainer && document.body.contains(templateData.outputContainer!)) {
							let height = elementSizeObserver.getHeight();
							if (dimensions.height !== height) {
								element.setDynamicHeight(totalHeight + 32 + height);
								this.handler.layoutElement(element, totalHeight + 32 + height);
							}

							elementSizeObserver.dispose();
						}
					});
					elementSizeObserver.startObserving();
					if (!hasDynamicHeight && dimensions.height !== 0) {
						element.setDynamicHeight(totalHeight + 32 + dimensions.height);
						this.handler.layoutElement(element, totalHeight + 32 + dimensions.height);
					}

					this.disposables.set(templateData.cellContainer, {
						dispose: () => {
							elementSizeObserver.dispose();
						}
					});
				}
			}
		});

		this.disposables.set(templateData.cellContainer, {
			dispose: () => {
				listener.dispose();
				rerenderOutput.dispose();
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
				let dimensions = DOM.getClientArea(templateData.outputContainer!);
				const elementSizeObserver = new ElementSizeObserver(templateData.outputContainer!, dimensions, () => {
					if (templateData.outputContainer && document.body.contains(templateData.outputContainer!)) {
						let height = elementSizeObserver.getHeight();
						if (dimensions.height !== height) {
							element.setDynamicHeight(totalHeight + 32 + height);
							this.handler.layoutElement(element, totalHeight + 32 + height);
						}

						elementSizeObserver.dispose();
					}
				});
				elementSizeObserver.startObserving();
				if (!hasDynamicHeight && dimensions.height !== 0) {
					element.setDynamicHeight(totalHeight + 32 + dimensions.height);
					this.handler.layoutElement(element, totalHeight + 32 + dimensions.height);
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


	disposeElement(element: ViewCell, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
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

	getSimpleCodeEditorWidgetOptions(): ICodeEditorWidgetOptions {
		return {
			isSimpleWidget: false,
			contributions: <IEditorContributionDescription[]>[
				{ id: MenuPreventer.ID, ctor: MenuPreventer },
				{ id: SuggestController.ID, ctor: SuggestController },
				// { id: ModesHoverController.ID, ctor: ModesHoverController },
				{ id: SnippetController2.ID, ctor: SnippetController2 },
				{ id: TabCompletionController.ID, ctor: TabCompletionController },
			]
		};
	}
}
