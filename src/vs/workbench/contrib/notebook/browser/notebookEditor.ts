/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./notebook';
import * as DOM from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { NotebookEditorInput, ICell, NotebookEditorModel, IOutput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { EditorOptions } from 'vs/workbench/common/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import * as marked from 'vs/base/common/marked/marked';
import { IModelService } from 'vs/editor/common/services/modelService';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { deepClone } from 'vs/base/common/objects';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { getExtraColor } from 'vs/workbench/contrib/welcome/walkThrough/common/walkThroughUtils';
import { textLinkForeground, textLinkActiveForeground, focusBorder, textPreformatForeground, contrastBorder, textBlockQuoteBackground, textBlockQuoteBorder, editorBackground, foreground } from 'vs/platform/theme/common/colorRegistry';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { getZoomLevel } from 'vs/base/browser/browser';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action } from 'vs/base/common/actions';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { TabCompletionController } from 'vs/workbench/contrib/snippets/browser/tabCompletion';
import { handleANSIOutput } from 'vs/workbench/contrib/notebook/browser/output';

const $ = DOM.$;


interface NotebookHandler {
	insertEmptyNotebookCell(cell: ICell | IOutput, direction: 'above' | 'below'): void;
	deleteNotebookCell(cell: ICell): void;
}

interface CellRenderTemplate {
	cellContainer: HTMLElement;
	menuContainer?: HTMLElement;
	outputContainer?: HTMLElement;
	renderer?: marked.Renderer; // TODO this can be cached
	editor?: CodeEditorWidget;
}

export class NotebookCellListDelegate implements IListVirtualDelegate<ICell | IOutput> {
	private _lineHeight: number;
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');

		this._lineHeight = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel()).lineHeight;
	}

	getHeight(element: ICell | IOutput): number {
		if (element.cell_type === 'markdown') {
			return 100;
		} else {
			return Math.max(element.source.length + 1, 5) * this._lineHeight + 16;
		}
	}

	hasDynamicHeight(element: ICell | IOutput): boolean {
		return true;
	}

	getTemplateId(element: ICell | IOutput): string {

		if (element.cell_type === 'markdown') {
			return MarkdownCellRenderer.TEMPLATE_ID;
		} else {
			return CodeCellRenderer.TEMPLATE_ID;
		}
	}
}

class AbstractCellRenderer {
	constructor(
		private handler: NotebookHandler,
		private contextMenuService: IContextMenuService
	) { }

	showContextMenu(element: ICell, x: number, y: number) {
		const actions: Action[] = [];
		const insertAbove = new Action(
			'workbench.notebook.code.insertCellAbove',
			'Insert Code Cell Above',
			undefined,
			true,
			async () => {
				this.handler.insertEmptyNotebookCell(element, 'above');
			}
		);

		const insertBelow = new Action(
			'workbench.notebook.code.insertCellBelow',
			'Insert Code Cell Below',
			undefined,
			true,
			async () => {
				this.handler.insertEmptyNotebookCell(element, 'below');
			}
		);

		const deleteCell = new Action(
			'workbench.notebook.deleteCell',
			'Delete Cell',
			undefined,
			true,
			async () => {
				this.handler.deleteNotebookCell(element);
			}
		);

		actions.push(insertAbove);
		actions.push(insertBelow);
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

export class OutputCellRenderer extends AbstractCellRenderer implements IListRenderer<ICell | IOutput, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'output_cell';

	constructor(
		handler: NotebookHandler,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(handler, contextMenuService);
	}

	get templateId() {
		return OutputCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellRenderTemplate {
		const innerContent = document.createElement('div');
		DOM.addClasses(innerContent, 'cell', 'output');
		const renderer = new marked.Renderer();
		container.appendChild(innerContent);

		const action = document.createElement('div');
		DOM.addClasses(action, 'menu', 'codicon-settings-gear', 'codicon');
		container.appendChild(action);

		return {
			cellContainer: innerContent,
			menuContainer: action,
			renderer: renderer
		};
	}

	renderElement(element: IOutput, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		if (element.output_type === 'stream') {
			templateData.cellContainer.innerText = element.text;
		} else if (element.output_type === 'error') {
			const evalue = document.createElement('div');
			DOM.addClasses(evalue, 'error_message');
			evalue.innerText = element.evalue;
			templateData.cellContainer.appendChild(evalue);
		}
	}

	disposeTemplate(templateData: CellRenderTemplate): void {
		// throw nerendererw Error('Method not implemented.');
	}
}

export class MarkdownCellRenderer extends AbstractCellRenderer implements IListRenderer<ICell | IOutput, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';
	private disposables: Map<HTMLElement, IDisposable> = new Map();

	constructor(
		handler: NotebookHandler,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(handler, contextMenuService);
	}

	get templateId() {
		return MarkdownCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellRenderTemplate {
		const innerContent = document.createElement('div');
		DOM.addClasses(innerContent, 'cell', 'markdown');
		const renderer = new marked.Renderer();
		container.appendChild(innerContent);

		const action = document.createElement('div');
		DOM.addClasses(action, 'menu', 'codicon-settings-gear', 'codicon');
		container.appendChild(action);

		return {
			cellContainer: innerContent,
			menuContainer: action,
			renderer: renderer
		};
	}

	renderElement(element: ICell | IOutput, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		templateData.cellContainer.innerHTML = marked(element.source.join(''), { renderer: templateData.renderer });
		let disposable = this.disposables.get(templateData.menuContainer!);

		if (disposable) {
			disposable.dispose();
			this.disposables.delete(templateData.menuContainer!);
		}

		let listener = DOM.addStandardDisposableListener(templateData.menuContainer!, 'mousedown', e => {
			const { top, height } = DOM.getDomNodePagePosition(templateData.menuContainer!);
			e.preventDefault();

			this.showContextMenu(element, e.posx, top + height);
		});

		this.disposables.set(templateData.menuContainer!, listener);
	}

	disposeTemplate(templateData: CellRenderTemplate): void {
		// throw nerendererw Error('Method not implemented.');
	}
}

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<ICell | IOutput, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'code_cell';
	private editorOptions: IEditorOptions;
	private widgetOptions: ICodeEditorWidgetOptions;
	private disposables: Map<ICell, IDisposable> = new Map();

	constructor(
		handler: NotebookHandler,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super(handler, contextMenuService);

		const language = 'python';
		const editorOptions = deepClone(this.configurationService.getValue<IEditorOptions>('editor', { overrideIdentifier: language }));
		this.editorOptions = {
			...editorOptions,
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 3,
			fixedOverflowWidgets: false,
			lineNumbersMinChars: 1,
			minimap: { enabled: false },
		};

		this.widgetOptions = this.getSimpleCodeEditorWidgetOptions();
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

		return {
			cellContainer: innerContent,
			menuContainer: action,
			outputContainer: outputContainer,
			editor
		};
	}

	renderElement(element: ICell, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		const innerContent = templateData.cellContainer;
		const width = innerContent.clientWidth;
		const lineNum = element.source.length;
		const totalHeight = Math.max(lineNum + 1, 5) * 21;
		const resource = URI.parse(`notebookcell-${index}-${Date.now()}.py`);

		const model = this.modelService.createModel(element.source.join(''), this.modeService.createByFilepathOrFirstLine(resource), resource, false);
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

		this.disposables.set(element, listener);

		if (templateData.outputContainer) {
			templateData.outputContainer!.innerHTML = '';
		}

		if (element.outputs.length > 0) {
			for (let i = 0; i < element.outputs.length; i++) {
				const outputNode = document.createElement('div');
				if (element.outputs[i].output_type === 'stream') {
					outputNode.innerText = element.outputs[i].text;
				} else {
					const evalue = document.createElement('div');
					DOM.addClasses(evalue, 'error_message');
					evalue.innerText = element.outputs[i].evalue;
					outputNode.appendChild(evalue);
					const traceback = document.createElement('traceback');
					DOM.addClasses(traceback, 'traceback');
					if (element.outputs[i].traceback) {
						for (let j = 0; j < element.outputs[i].traceback.length; j++) {
							traceback.appendChild(handleANSIOutput(element.outputs[i].traceback[j], this.themeService));
							outputNode.appendChild(traceback);
						}
					}
				}

				templateData.outputContainer?.appendChild(outputNode);
			}
		}

	}

	disposeTemplate(templateData: CellRenderTemplate): void {
		// throw nerendererw Error('Method not implemented.');
	}


	disposeElement(element: ICell, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		let disposable = this.disposables.get(element);

		if (disposable) {
			disposable.dispose();
			this.disposables.delete(element);
		}
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


export class NotebookEditor extends BaseEditor implements NotebookHandler {
	static readonly ID: string = 'workbench.editor.notebook';
	private rootElement!: HTMLElement;
	private body!: HTMLElement;
	private list: WorkbenchList<ICell | IOutput> | undefined;
	private model: NotebookEditorModel | undefined;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService
	) {
		super(NotebookEditor.ID, telemetryService, themeService, storageService);
	}
	get minimumWidth(): number { return 375; }
	get maximumWidth(): number { return Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /*noop*/ }
	set maximumWidth(value: number) { /*noop*/ }


	protected createEditor(parent: HTMLElement): void {
		this.rootElement = DOM.append(parent, $('.notebook-editor'));
		this.createBody(this.rootElement);
	}

	private createBody(parent: HTMLElement): void {
		this.body = document.createElement('div'); //DOM.append(parent, $('.notebook-body'));
		DOM.addClass(this.body, 'cell-list-container');
		this.createCellList();
		DOM.append(parent, this.body);
	}

	private createCellList(): void {
		DOM.addClass(this.body, 'cell-list-container');

		const renders = [
			// this.instantiationService.createInstance(OutputCellRenderer, this),
			this.instantiationService.createInstance(MarkdownCellRenderer, this),
			this.instantiationService.createInstance(CodeCellRenderer, this)
		];

		this.list = this.instantiationService.createInstance<typeof WorkbenchList, WorkbenchList<ICell>>(
			WorkbenchList,
			'NotebookCellList',
			this.body,
			this.instantiationService.createInstance(NotebookCellListDelegate),
			renders,
			{
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				keyboardSupport: false,
				mouseSupport: false,
				multipleSelectionSupport: false,
				overrideStyles: {
					listBackground: editorBackground,
					listActiveSelectionBackground: editorBackground,
					listActiveSelectionForeground: foreground,
					listFocusAndSelectionBackground: editorBackground,
					listFocusAndSelectionForeground: foreground,
					listFocusBackground: editorBackground,
					listFocusForeground: foreground,
					listHoverForeground: foreground,
					listHoverBackground: editorBackground,
					listHoverOutline: focusBorder,
					listFocusOutline: focusBorder,
					listInactiveSelectionBackground: editorBackground,
					listInactiveSelectionForeground: foreground,
					listInactiveFocusBackground: editorBackground,
					listInactiveFocusOutline: editorBackground,
				}
			}
		);
	}

	setInput(input: NotebookEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		return super.setInput(input, options, token)
			.then(() => {
				return input.resolve();
			})
			.then(model => {
				if (this.model !== undefined && this.model.textModel === model.textModel) {
					return;
				}

				this.model = model;
				let cells = model.getNookbook().cells;
				this.list?.splice(0, this.list?.length, cells);
				this.list?.layout();
			});
	}

	insertEmptyNotebookCell(cell: ICell, direction: 'above' | 'below') {
		let newCell: ICell = {
			source: [],
			cell_type: 'code',
			outputs: []
		};

		let index = this.model!.getNookbook().cells.indexOf(cell);
		const insertIndex = direction === 'above' ? index : index + 1;

		this.model!.getNookbook().cells.splice(insertIndex, 0, newCell);
		this.list?.splice(insertIndex, 0, [newCell]);
	}

	deleteNotebookCell(cell: ICell) {
		let index = this.model!.getNookbook().cells.indexOf(cell);

		this.model!.getNookbook().cells.splice(index, 1);
		this.list?.splice(index, 1);
	}


	layout(dimension: DOM.Dimension): void {
		DOM.toggleClass(this.rootElement, 'mid-width', dimension.width < 1000 && dimension.width >= 600);
		DOM.toggleClass(this.rootElement, 'narrow-width', dimension.width < 600);
		DOM.size(this.body, dimension.width - 20, dimension.height);
		this.list?.layout(dimension.height, dimension.width - 20);
	}
}

const embeddedEditorBackground = 'walkThrough.embeddedEditorBackground';

registerThemingParticipant((theme, collector) => {
	const color = getExtraColor(theme, embeddedEditorBackground, { dark: 'rgba(0, 0, 0, .4)', extra_dark: 'rgba(200, 235, 255, .064)', light: '#f4f4f4', hc: null });
	if (color) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-editor-background,
			.monaco-workbench .part.editor > .content .notebook-editor .margin-view-overlays { background: ${color}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor a { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor a:hover,
			.monaco-workbench .part.editor > .content .notebook-editor a:active { color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor a:focus { outline-color: ${focusColor}; }`);
	}
	const shortcut = theme.getColor(textPreformatForeground);
	if (shortcut) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor code,
			.monaco-workbench .part.editor > .content .notebook-editor .shortcut { color: ${shortcut}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-editor { border-color: ${border}; }`);
	}
	const quoteBackground = theme.getColor(textBlockQuoteBackground);
	if (quoteBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor blockquote { background: ${quoteBackground}; }`);
	}
	const quoteBorder = theme.getColor(textBlockQuoteBorder);
	if (quoteBorder) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor blockquote { border-color: ${quoteBorder}; }`);
	}
});
