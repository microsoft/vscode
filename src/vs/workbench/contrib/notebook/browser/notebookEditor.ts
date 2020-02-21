/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import 'vs/css!./notebook';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { contrastBorder, editorBackground, focusBorder, foreground, textBlockQuoteBackground, textBlockQuoteBorder, textLinkActiveForeground, textLinkForeground, textPreformatForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions, IEditorMemento, ICompositeCodeEditor } from 'vs/workbench/common/editor';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorInput, NotebookEditorModel } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/output/outputRenderer';
import { BackLayerWebView } from 'vs/workbench/contrib/notebook/browser/renderers/backLayerWebView';
import { CodeCellRenderer, MarkdownCellRenderer, NotebookCellListDelegate } from 'vs/workbench/contrib/notebook/browser/renderers/cellRenderer';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { CELL_MARGIN, INotebook, NotebookCellsSplice, IOutput, parseCellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { getExtraColor } from 'vs/workbench/contrib/welcome/walkThrough/common/walkThroughUtils';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { Emitter, Event } from 'vs/base/common/event';
import { NotebookCellList } from 'vs/workbench/contrib/notebook/browser/notebookCellList';

const $ = DOM.$;
const NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'NotebookEditorViewState';

export const NOTEBOOK_EDITOR_FOCUSED = new RawContextKey<boolean>('notebookEditorFocused', false);

interface INotebookEditorViewState {
	editingCells: { [key: number]: boolean };
}

class NotebookCodeEditors implements ICompositeCodeEditor {

	private readonly _disposables = new DisposableStore();
	private readonly _onDidChangeActiveEditor = new Emitter<this>();
	readonly onDidChangeActiveEditor: Event<this> = this._onDidChangeActiveEditor.event;

	constructor(
		private _list: NotebookCellList<CellViewModel>,
		private _renderedEditors: Map<CellViewModel, ICodeEditor | undefined>
	) {
		_list.onFocusChange(e => this._onDidChangeActiveEditor.fire(this), undefined, this._disposables);
	}

	dispose(): void {
		this._onDidChangeActiveEditor.dispose();
		this._disposables.dispose();
	}

	get activeCodeEditor(): IEditor | undefined {
		const [focused] = this._list.getFocusedElements();
		return focused instanceof CellViewModel
			? this._renderedEditors.get(focused)
			: undefined;
	}

	activate(input: IResourceInput): ICodeEditor | undefined {
		const data = parseCellUri(input.resource);
		if (!data) {
			return undefined;
		}
		// find the CellViewModel which represents the cell with the
		// given uri, scroll it into view so that the editor is alive,
		// and then set selection et al..
		for (let i = 0; i < this._list.length; i++) {
			const item = this._list.element(i);
			if (item.cell.uri.toString() === input.resource.toString()) {
				this._list.reveal(i, 0.2);
				this._list.setFocus([i]);
				const editor = this._renderedEditors.get(item);
				if (!editor) {
					break;
				}
				if (input.options?.selection) {
					const { selection } = input.options;
					editor.setSelection({
						...selection,
						endLineNumber: selection.endLineNumber || selection.startLineNumber,
						endColumn: selection.endColumn || selection.startColumn
					});
				}
				if (!input.options?.preserveFocus) {
					editor.focus();
				}
				return editor;
			}
		}
		return undefined;
	}
}

export class NotebookEditor extends BaseEditor implements INotebookEditor {
	static readonly ID: string = 'workbench.editor.notebook';
	private rootElement!: HTMLElement;
	private body!: HTMLElement;
	private contentWidgets!: HTMLElement;
	private webview: BackLayerWebView | null = null;

	private list: NotebookCellList<CellViewModel> | undefined;
	private control: ICompositeCodeEditor | undefined;
	private renderedEditors: Map<CellViewModel, ICodeEditor | undefined> = new Map();
	private model: NotebookEditorModel | undefined;
	private notebook: INotebook | undefined;
	viewType: string | undefined;
	private viewCells: CellViewModel[] = [];
	private localStore: DisposableStore = this._register(new DisposableStore());
	private editorMemento: IEditorMemento<INotebookEditorViewState>;
	private fontInfo: BareFontInfo | undefined;
	// private relayoutDisposable: IDisposable | null = null;
	private dimension: DOM.Dimension | null = null;
	private editorFocus: IContextKey<boolean> | null = null;
	private outputRenderer: OutputRenderer;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IWebviewService private webviewService: IWebviewService,
		@INotebookService private notebookService: INotebookService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService private readonly environmentSerice: IEnvironmentService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(NotebookEditor.ID, telemetryService, themeService, storageService);

		this.editorMemento = this.getEditorMemento<INotebookEditorViewState>(editorGroupService, NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY);
		this.outputRenderer = new OutputRenderer(this, this.instantiationService);
	}


	get minimumWidth(): number { return 375; }
	get maximumWidth(): number { return Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /*noop*/ }
	set maximumWidth(value: number) { /*noop*/ }


	//#region Editor

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = DOM.append(parent, $('.notebook-editor'));
		this.createBody(this.rootElement);
		this.generateFontInfo();
		this.editorFocus = NOTEBOOK_EDITOR_FOCUSED.bindTo(this.contextKeyService);
		this._register(this.onDidFocus(() => {
			this.editorFocus?.set(true);
		}));

		this._register(this.onDidBlur(() => {
			this.editorFocus?.set(false);
		}));
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
			this.instantiationService.createInstance(CodeCellRenderer, this, this.renderedEditors),
			this.instantiationService.createInstance(MarkdownCellRenderer, this),
		];

		this.list = <NotebookCellList<CellViewModel>>this.instantiationService.createInstance(
			NotebookCellList,
			'NotebookCellList',
			this.body,
			this.instantiationService.createInstance(NotebookCellListDelegate),
			renders,
			{
				setRowLineHeight: false,
				setRowHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				keyboardSupport: false,
				mouseSupport: true,
				multipleSelectionSupport: false,
				enableKeyboardNavigation: true,
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

		this.control = new NotebookCodeEditors(this.list, this.renderedEditors);
		this.webview = new BackLayerWebView(this.webviewService, this.notebookService, this, this.environmentSerice);
		this.list.rowsContainer.appendChild(this.webview.element);
		this._register(this.list);
	}

	getControl() {
		return this.control;
	}

	onHide() {

		if (this.webview) {
			this.localStore.clear();
			this.list?.rowsContainer.removeChild(this.webview?.element);
			this.webview?.dispose();
			this.webview = null;
		}

		this.list?.splice(0, this.list?.length);

		if (this.model && !this.model.isDirty()) {
			this.notebookService.destoryNotebookDocument(this.viewType!, this.notebook!);
			this.model = undefined;
			this.notebook = undefined;
			this.viewType = undefined;
		}

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
			.then(async model => {
				if (this.model !== undefined && this.model === model && this.webview !== null) {
					return;
				}

				this.localStore.clear();
				this.viewCells.forEach(cell => {
					cell.save();
				});

				if (this.webview) {
					this.webview?.clearInsets();
					this.webview?.clearPreloadsCache();
				} else {
					this.webview = new BackLayerWebView(this.webviewService, this.notebookService, this, this.environmentSerice);
					this.list?.rowsContainer.insertAdjacentElement('afterbegin', this.webview!.element);
				}

				this.model = model;
				this.localStore.add(this.model.onDidChangeCells((e) => {
					this.updateViewCells(e);
				}));

				let viewState = this.loadTextEditorViewState(input);
				this.notebook = model.getNotebook();
				this.webview.updateRendererPreloads(this.notebook.renderers);
				this.viewType = input.viewType;
				this.viewCells = await Promise.all(this.notebook!.cells.map(async cell => {
					const isEditing = viewState && viewState.editingCells[cell.handle];
					const viewCell = this.instantiationService.createInstance(CellViewModel, input.viewType!, this.notebook!.handle, cell, !!isEditing);
					this.localStore.add(viewCell);
					return viewCell;
				}));

				const updateScrollPosition = () => {
					let scrollTop = this.list?.scrollTop || 0;
					this.webview!.element.style.top = `${scrollTop}px`;
					let updateItems: { cell: CellViewModel, output: IOutput, cellTop: number }[] = [];

					if (this.webview?.insetMapping) {
						this.webview?.insetMapping.forEach((value, key) => {
							let cell = value.cell;
							let index = this.model!.getNotebook().cells.indexOf(cell.cell);
							let cellTop = this.list?.getAbsoluteTop(index) || 0;
							if (this.webview!.shouldUpdateInset(cell, key, cellTop)) {
								updateItems.push({
									cell: cell,
									output: key,
									cellTop: cellTop
								});
							}
						});

						this.webview?.updateViewScrollTop(-scrollTop, updateItems);
					}
				};
				this.localStore.add(this.list!.onWillScroll(e => {
					// const date = new Date();
					// console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
					this.webview?.updateViewScrollTop(-e.scrollTop, []);
				}));
				this.localStore.add(this.list!.onDidScroll(() => {
					updateScrollPosition();
				}));
				this.localStore.add(this.list!.onDidChangeContentHeight(() => updateScrollPosition()));
				this.localStore.add(this.list!.onFocusChange((e) => {
					if (e.elements.length > 0) {
						this.notebookService.updateNotebookActiveCell(input.viewType!, input.resource!, e.elements[0].cell.handle);
					}
				}));

				this.list?.splice(0, this.list?.length);
				this.list?.splice(0, 0, this.viewCells);
				this.list?.layout();
			});
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

	layout(dimension: DOM.Dimension): void {
		this.dimension = new DOM.Dimension(dimension.width, dimension.height);
		DOM.toggleClass(this.rootElement, 'mid-width', dimension.width < 1000 && dimension.width >= 600);
		DOM.toggleClass(this.rootElement, 'narrow-width', dimension.width < 600);
		DOM.size(this.body, dimension.width, dimension.height);
		this.list?.layout(dimension.height, dimension.width);
	}

	protected saveState(): void {
		if (this.input instanceof NotebookEditorInput) {
			this.saveTextEditorViewState(this.input);
		}

		super.saveState();
	}

	//#endregion

	//#region Cell operations
	layoutNotebookCell(cell: CellViewModel, height: number) {
		let relayout = (cell: CellViewModel, height: number) => {
			let index = this.model!.getNotebook().cells.indexOf(cell.cell);
			if (index >= 0) {
				this.list?.updateDynamicHeight(index, cell, height);
			}
		};

		DOM.scheduleAtNextAnimationFrame(() => {
			relayout(cell, height);
			// this.relayoutDisposable = null;
		});
	}

	updateViewCells(splices: NotebookCellsSplice[]) {
		let update = () => splices.reverse().forEach((diff) => {
			this.list?.splice(diff[0], diff[1], diff[2].map(cell => {
				return this.instantiationService.createInstance(CellViewModel, this.viewType!, this.notebook!.handle, cell, false);
			}));
		});

		if (this.list?.isRendering) {
			// if (this.relayoutDisposable) {
			// 	this.relayoutDisposable.dispose();
			// 	this.relayoutDisposable = null;
			// }

			DOM.scheduleAtNextAnimationFrame(() => {
				update();
				// this.relayoutDisposable = null;
			});
		} else {
			update();
		}
	}

	async insertEmptyNotebookCell(listIndex: number | undefined, cell: CellViewModel, type: 'code' | 'markdown', direction: 'above' | 'below'): Promise<void> {
		let newLanguages = this.notebook!.languages;
		let language = 'markdown';
		if (newLanguages && newLanguages.length) {
			language = newLanguages[0];
		}

		let index = listIndex ? listIndex : this.model!.getNotebook().cells.indexOf(cell.cell);
		const insertIndex = direction === 'above' ? index : index + 1;

		let newModeCell = await this.notebookService.createNotebookCell(this.viewType!, this.notebook!.uri, insertIndex, language, type);
		let newCell = this.instantiationService.createInstance(CellViewModel, this.viewType!, this.notebook!.handle, newModeCell!, false);

		this.viewCells!.splice(insertIndex, 0, newCell);
		this.model!.insertCell(newCell.cell, insertIndex);
		this.list?.splice(insertIndex, 0, [newCell]);
		this.list?.setFocus([insertIndex]);

		if (type === 'markdown') {
			newCell.isEditing = true;
		}

		DOM.scheduleAtNextAnimationFrame(() => {
			this.list?.reveal(insertIndex, 0.33);
		});
	}

	editNotebookCell(listIndex: number | undefined, cell: CellViewModel): void {
		cell.isEditing = true;
	}

	saveNotebookCell(listIndex: number | undefined, cell: CellViewModel): void {
		cell.isEditing = false;
	}

	getActiveCell() {
		let elements = this.list?.getFocusedElements();

		if (elements && elements.length) {
			return elements[0];
		}

		return undefined;
	}

	focusNotebookCell(cell: CellViewModel, focusEditor: boolean) {
		let index = this.model!.getNotebook().cells.indexOf(cell.cell);

		if (focusEditor) {

		} else {
			let itemDOM = this.list?.domElementAtIndex(index);
			if (document.activeElement && itemDOM && itemDOM.contains(document.activeElement)) {
				(document.activeElement as HTMLElement).blur();
			}

			cell.isEditing = false;
		}

		this.list?.setFocus([index]);
		this.list?.focusView();
	}

	async deleteNotebookCell(listIndex: number | undefined, cell: CellViewModel): Promise<void> {
		let index = this.model!.getNotebook().cells.indexOf(cell.cell);

		// await this.notebookService.createNotebookCell(this.viewType!, this.notebook!.uri, insertIndex, language, type);
		await this.notebookService.deleteNotebookCell(this.viewType!, this.notebook!.uri, index);
		this.viewCells!.splice(index, 1);
		this.model!.deleteCell(cell.cell);
		this.list?.splice(index, 1);
	}

	//#endregion

	//#region MISC

	getFontInfo(): BareFontInfo | undefined {
		return this.fontInfo;
	}

	getListDimension(): DOM.Dimension | null {
		return this.dimension;
	}

	triggerScroll(event: IMouseWheelEvent) {
		this.list?.triggerScrollFromMouseWheelEvent(event);
	}

	createInset(cell: CellViewModel, output: IOutput, shadowContent: string, offset: number) {
		if (!this.webview) {
			return;
		}

		let preloads = this.notebook!.renderers;

		if (!this.webview!.insetMapping.has(output)) {
			let index = this.model!.getNotebook().cells.indexOf(cell.cell);
			let cellTop = this.list?.getAbsoluteTop(index) || 0;

			this.webview!.createInset(cell, output, cellTop, offset, shadowContent, preloads);
		} else {
			let index = this.model!.getNotebook().cells.indexOf(cell.cell);
			let cellTop = this.list?.getAbsoluteTop(index) || 0;
			let scrollTop = this.list?.scrollTop || 0;

			this.webview!.updateViewScrollTop(-scrollTop, [{ cell: cell, output: output, cellTop: cellTop }]);
		}
	}

	removeInset(output: IOutput) {
		if (!this.webview) {
			return;
		}

		this.webview!.removeInset(output);
	}

	getOutputRenderer(): OutputRenderer {
		return this.outputRenderer;
	}

	//#endregion
}

const embeddedEditorBackground = 'walkThrough.embeddedEditorBackground';

registerThemingParticipant((theme, collector) => {
	const color = getExtraColor(theme, embeddedEditorBackground, { dark: 'rgba(0, 0, 0, .4)', extra_dark: 'rgba(200, 235, 255, .064)', light: '#f4f4f4', hc: null });
	if (color) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell .monaco-editor-background,
			.monaco-workbench .part.editor > .content .notebook-editor .cell .margin-view-overlays { background: ${color}; }`);
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

	const inactiveListItem = theme.getColor('list.inactiveSelectionBackground');

	if (inactiveListItem) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .output { background-color: ${inactiveListItem}; }`);
	}

	// Cell Margin
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-list-row > div.cell { padding: 8px ${CELL_MARGIN}px 8px ${CELL_MARGIN}px; }`);
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .output { margin: 8px ${CELL_MARGIN}px; }`);
});
