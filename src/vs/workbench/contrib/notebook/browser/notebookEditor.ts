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
import { NotebookEditorInput, NotebookEditorModel } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { EditorOptions, IEditorMemento } from 'vs/workbench/common/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { getExtraColor } from 'vs/workbench/contrib/welcome/walkThrough/common/walkThroughUtils';
import { textLinkForeground, textLinkActiveForeground, focusBorder, textPreformatForeground, contrastBorder, textBlockQuoteBackground, textBlockQuoteBorder, editorBackground, foreground } from 'vs/platform/theme/common/colorRegistry';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { NotebookHandler, ViewCell, MarkdownCellRenderer, CodeCellRenderer, NotebookCellListDelegate } from 'vs/workbench/contrib/notebook/browser/cellRenderer';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { BackLayerWebView } from 'vs/workbench/contrib/notebook/browser/contentWidget';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getZoomLevel } from 'vs/base/browser/browser';

const $ = DOM.$;
const NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'NotebookEditorViewState';


interface INotebookEditorViewState {
	editingCells: { [key: number]: boolean };
}

export class NotebookEditor extends BaseEditor implements NotebookHandler {
	static readonly ID: string = 'workbench.editor.notebook';
	private rootElement!: HTMLElement;
	private body!: HTMLElement;
	private contentWidgets!: HTMLElement;
	private webview: BackLayerWebView | null = null;

	private list: WorkbenchList<ViewCell> | undefined;
	private model: NotebookEditorModel | undefined;
	private viewCells: ViewCell[] = [];
	private localStore: DisposableStore = new DisposableStore();
	private editorMemento: IEditorMemento<INotebookEditorViewState>;
	private fontInfo: BareFontInfo | undefined;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IStorageService storageService: IStorageService,
		@IWebviewService private webviewService: IWebviewService,
		@INotebookService private notebookService: INotebookService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(NotebookEditor.ID, telemetryService, themeService, storageService);

		this.editorMemento = this.getEditorMemento<INotebookEditorViewState>(editorGroupService, NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY);
	}

	get minimumWidth(): number { return 375; }
	get maximumWidth(): number { return Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /*noop*/ }
	set maximumWidth(value: number) { /*noop*/ }


	protected createEditor(parent: HTMLElement): void {
		this.rootElement = DOM.append(parent, $('.notebook-editor'));
		this.createBody(this.rootElement);
		this.generateFontInfo();
	}

	private generateFontInfo(): void {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this.fontInfo = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel());
	}

	private createBody(parent: HTMLElement): void {
		this.body = document.createElement('div');
		DOM.addClass(this.body, 'cell-list-container');
		this.createCellList();
		DOM.append(parent, this.body);

		this.contentWidgets = document.createElement('div');
		DOM.addClass(this.contentWidgets, 'notebook-content-widgets');
		DOM.append(this.body, this.contentWidgets);
	}

	private createCellList(): void {
		DOM.addClass(this.body, 'cell-list-container');

		const renders = [
			this.instantiationService.createInstance(MarkdownCellRenderer, this),
			this.instantiationService.createInstance(CodeCellRenderer, this)
		];

		this.list = this.instantiationService.createInstance<typeof WorkbenchList, WorkbenchList<ViewCell>>(
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

		this.webview = new BackLayerWebView(this.webviewService, this.notebookService, this);
		this.list.view.rowsContainer.appendChild(this.webview.element);
		this._register(this.list);
	}

	getFontInfo(): BareFontInfo | undefined {
		return this.fontInfo;
	}

	triggerWheel(event: IMouseWheelEvent) {
		this.list?.triggerScrollFromMouseWheelEvent(event);
	}

	createContentWidget(cell: ViewCell, outputIndex: number, shadowContent: string, offset: number) {
		if (!this.webview) {
			return;
		}

		if (!this.webview!.mapping.has(cell.id)) {
			let index = this.model!.getNotebook().cells.indexOf(cell.cell);
			let top = this.list?.getElementTop(index) || 0;
			this.webview!.createContentWidget(cell, offset, shadowContent, top + offset);
			this.webview!.outputMapping.set(cell.id + `-${outputIndex}`, true);
		} else if (!this.webview!.outputMapping.has(cell.id + `-${outputIndex}`)) {
			let index = this.model!.getNotebook().cells.indexOf(cell.cell);
			let top = this.list?.getElementTop(index) || 0;
			this.webview!.outputMapping.set(cell.id + `-${outputIndex}`, true);
			this.webview!.createContentWidget(cell, offset, shadowContent, top + offset);
		} else {
			let index = this.model!.getNotebook().cells.indexOf(cell.cell);
			let top = this.list?.getElementTop(index) || 0;
			let scrollTop = this.list?.scrollTop || 0;

			this.webview!.updateViewScrollTop(-scrollTop, [{ id: cell.id, top: top + offset }]);
		}
	}

	disposeViewCell(cell: ViewCell) {
	}

	onHide() {
		this.viewCells.forEach(cell => {
			if (cell.getText() !== '') {
				cell.isEditing = false;
			}
		});

		if (this.webview) {
			this.localStore.clear();
			this.list?.view.rowsContainer.removeChild(this.webview?.element);
			this.webview?.dispose();
			this.webview = null;
		}

		this.list?.splice(0, this.list?.length);
		super.onHide();
	}

	setVisible(visible: boolean, group?: IEditorGroup): void {
		super.setVisible(visible, group);
		if (!visible) {
			this.viewCells.forEach(cell => {
				if (cell.getText() !== '') {
					cell.isEditing = false;
				}
			});
		}
	}

	setInput(input: NotebookEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		if (this.input instanceof NotebookEditorInput) {
			this.saveTextEditorViewState(this.input);
		}

		return super.setInput(input, options, token)
			.then(() => {
				return input.resolve();
			})
			.then(model => {
				if (this.model !== undefined && this.model.textModel === model.textModel && this.webview !== null) {
					return;
				}

				this.localStore.clear();
				this.viewCells.forEach(cell => {
					cell.save();
				});

				if (this.webview) {
					this.webview?.clearContentWidgets();
				} else {
					this.webview = new BackLayerWebView(this.webviewService, this.notebookService, this);
					this.list?.view.rowsContainer.insertAdjacentElement('afterbegin', this.webview!.element);
				}

				this.model = model;
				this.localStore.add(this.model.onDidChangeCells(() => {
					this.updateViewCells();
				}));

				let viewState = this.loadTextEditorViewState(input);
				this.viewCells = model.getNotebook().cells.map(cell => {
					const isEditing = viewState && viewState.editingCells[cell.handle];
					return new ViewCell(cell, !!isEditing, this.modelService, this.modeService);
				});

				const updateScrollPosition = () => {
					let scrollTop = this.list?.scrollTop || 0;
					this.webview!.element.style.top = `${scrollTop}px`;
					let updateItems: { top: number, id: string }[] = [];

					// const date = new Date();
					this.webview?.mapping.forEach((item) => {
						let index = this.model!.getNotebook().cells.indexOf(item.cell.cell);
						let top = this.list?.getElementTop(index) || 0;
						let newTop = this.webview!.shouldRenderContentWidget(item.cell.id, top);

						if (newTop !== undefined) {
							updateItems.push({
								top: newTop,
								id: item.cell.id
							});
						}
					});

					if (updateItems.length > 0) {
						// console.log('----- did scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
						this.webview?.updateViewScrollTop(-scrollTop, updateItems);
					}
				};
				this.localStore.add(this.list!.onWillScroll(e => {
					// const date = new Date();
					// console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
					this.webview?.updateViewScrollTop(-e.scrollTop, []);
				}));
				this.localStore.add(this.list!.onDidScroll(() => updateScrollPosition()));
				this.localStore.add(this.list!.onDidChangeContentHeight(() => updateScrollPosition()));

				this.list?.splice(0, this.list?.length);
				this.list?.splice(0, 0, this.viewCells);
				this.list?.layout();
			});
	}

	layoutElement(cell: ViewCell, height: number) {
		let relayout = (cell: ViewCell, height: number) => {
			let index = this.model!.getNotebook().cells.indexOf(cell.cell);
			if (index >= 0) {
				this.list?.updateDynamicHeight(index, cell, height);
			}
		};

		if (this.list?.view.isRendering) {
			DOM.scheduleAtNextAnimationFrame(() => {
				relayout(cell, height);
			});
		} else {
			relayout(cell, height);
		}
	}

	updateViewCells() {
		if (this.list?.view.isRendering) {
			DOM.scheduleAtNextAnimationFrame(() => {
				this.list?.rerender();
			});
		} else {
			this.list?.rerender();
		}
	}

	insertEmptyNotebookCell(listIndex: number | undefined, cell: ViewCell, type: 'code' | 'markdown', direction: 'above' | 'below') {
		let newCell = new ViewCell({
			handle: -1,
			cell_type: type,
			source: [],
			outputs: []
		}, false, this.modelService, this.modeService);

		let index = listIndex ? listIndex : this.model!.getNotebook().cells.indexOf(cell.cell);
		const insertIndex = direction === 'above' ? index : index + 1;

		this.viewCells!.splice(insertIndex, 0, newCell);
		this.model!.insertCell(newCell.cell, insertIndex);
		this.list?.splice(insertIndex, 0, [newCell]);

		if (type === 'markdown') {
			newCell.isEditing = true;
		}
	}

	editNotebookCell(listIndex: number | undefined, cell: ViewCell): void {
		cell.isEditing = true;
	}

	saveNotebookCell(listIndex: number | undefined, cell: ViewCell): void {
		cell.isEditing = false;
	}

	deleteNotebookCell(listIndex: number | undefined, cell: ViewCell) {
		let index = this.model!.getNotebook().cells.indexOf(cell.cell);

		this.viewCells!.splice(index, 1);
		this.model!.deleteCell(cell.cell);
		this.list?.splice(index, 1);
	}

	layout(dimension: DOM.Dimension): void {
		DOM.toggleClass(this.rootElement, 'mid-width', dimension.width < 1000 && dimension.width >= 600);
		DOM.toggleClass(this.rootElement, 'narrow-width', dimension.width < 600);
		DOM.size(this.body, dimension.width - 20, dimension.height);
		this.list?.layout(dimension.height, dimension.width - 20);
	}

	protected saveState(): void {
		if (this.input instanceof NotebookEditorInput) {
			this.saveTextEditorViewState(this.input);
		}

		super.saveState();
	}

	private saveTextEditorViewState(input: NotebookEditorInput): void {
		if (this.group) {
			let state: { [key: number]: boolean } = {};
			this.viewCells.filter(cell => cell.isEditing).forEach(cell => state[cell.cell.handle] = true);
			this.editorMemento.saveEditorState(this.group, input, {
				editingCells: state
			});
		}
	}

	private loadTextEditorViewState(input: NotebookEditorInput): INotebookEditorViewState | undefined {
		if (this.group) {
			return this.editorMemento.loadEditorState(this.group, input);
		}

		return;
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
