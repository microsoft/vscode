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
import { EditorOptions } from 'vs/workbench/common/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { getExtraColor } from 'vs/workbench/contrib/welcome/walkThrough/common/walkThroughUtils';
import { textLinkForeground, textLinkActiveForeground, focusBorder, textPreformatForeground, contrastBorder, textBlockQuoteBackground, textBlockQuoteBorder, editorBackground, foreground } from 'vs/platform/theme/common/colorRegistry';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { NotebookHandler, ViewCell, MarkdownCellRenderer, CodeCellRenderer, NotebookCellListDelegate } from 'vs/workbench/contrib/notebook/browser/cellRenderer';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWebviewService, WebviewElement } from 'vs/workbench/contrib/webview/browser/webview';
import * as UUID from 'vs/base/common/uuid';

const $ = DOM.$;

export interface IContentWidget {
	offset: number;
	cell: ViewCell;
	element: HTMLElement;
	webview: WebviewElement;
}

export class WebviewContentWidget implements IContentWidget {
	public element: HTMLElement;
	public webview: WebviewElement;

	private _dimension: DOM.Dimension | null = null;

	constructor(
		public shadowElement: HTMLElement,
		public cell: ViewCell,
		public offset: number,
		webviewService: IWebviewService,
		shadowContent: string,
		public notebookHandler: NotebookHandler
	) {
		this.element = document.createElement('div');
		this.element.style.width = 'calc(100% - 36px)';
		this.element.style.height = '700px';
		this.element.style.position = 'absolute';
		this.element.style.margin = '0px 24px 0px 24px';

		this.webview = this._createInset(webviewService, shadowContent);
		this.webview.mountTo(this.element);

		this.webview.onDidSetInitialDimension(dimension => {
			this._dimension = dimension;
			// this.shadowElement.style.minWidth = `${dimension.width}px`;
			this.shadowElement.style.height = `${dimension.height}px`;
			this.shadowElement.style.maxWidth = '100%';
			this.shadowElement.style.maxHeight = '700px';
			// this.element.style.minWidth= `${dimension.width}px`;
			this.element.style.height = `${dimension.height}px`;
			this.element.style.maxWidth = '100%';
			this.element.style.maxHeight = '700px';
			const lineNum = cell.lineCount;
			const totalHeight = Math.max(lineNum + 1, 5) * 21;
			cell.setDynamicHeight(totalHeight + 32 + dimension.height);
			notebookHandler.layoutElement(cell, totalHeight + 32 + dimension.height);
		});
	}

	public updateShadowElement(element: HTMLElement) {
		this.shadowElement = element;
		if (this._dimension) {
			this.shadowElement.style.minWidth = `${this._dimension.width}px`;
			this.shadowElement.style.height = `${this._dimension.height}px`;
			this.shadowElement.style.maxWidth = '100%';
			this.shadowElement.style.maxHeight = '700px';
			const lineNum = this.cell.lineCount;
			const totalHeight = Math.max(lineNum + 1, 5) * 21;
			this.cell.setDynamicHeight(totalHeight + 32 + this._dimension.height);
			this.notebookHandler.layoutElement(this.cell, totalHeight + 32 + this._dimension.height);
		}
	}

	private _createInset(webviewService: IWebviewService, content: string) {
		const webview = webviewService.createWebview('' + UUID.generateUuid(), {
			enableFindWidget: false,
		}, {
			allowScripts: true
		});

		webview.html = content;
		return webview;
	}

	dispose() {

	}
}
export class NotebookEditor extends BaseEditor implements NotebookHandler {
	static readonly ID: string = 'workbench.editor.notebook';
	private rootElement!: HTMLElement;
	private body!: HTMLElement;
	private contentWidgets!: HTMLElement;
	private contentWidgetsMap: Map<ViewCell, WebviewContentWidget> = new Map();

	private list: WorkbenchList<ViewCell> | undefined;
	private model: NotebookEditorModel | undefined;
	private viewCells: ViewCell[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IStorageService storageService: IStorageService,
		@IWebviewService private webviewService: IWebviewService
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

		this.list.onDidScroll((e) => {
			this.contentWidgetsMap.forEach((value, cell) => {
				let index = this.model!.getNotebook().cells.indexOf(cell.cell);
				let top = this.list?.getElementTop(index);
				if (top !== null && top !== undefined) {
					let domElement = value.element;
					let scrollTop = this.list?.scrollTop || 0;
					domElement.style.top = `${-scrollTop + top + value.offset}px`;
				}
			});
		});
	}

	createContentWidget(cell: ViewCell, shadowContent: string, shadowElement: HTMLElement, offset: number) {
		let zone = this.contentWidgetsMap.get(cell);

		if (!zone) {
			let contentWidget = new WebviewContentWidget(
				shadowElement,
				cell,
				offset,
				this.webviewService,
				shadowContent,
				this
			);

			this.contentWidgets.appendChild(contentWidget.element);
			this.contentWidgetsMap.set(cell, contentWidget);
		} else {
			zone.updateShadowElement(shadowElement);
		}
	}

	onHide() {
		super.onHide();

		this.viewCells.forEach(cell => cell.isEditing = false);
	}

	setVisible(visible: boolean, group?: IEditorGroup): void {
		super.onHide();
		if (!visible) {
			this.viewCells.forEach(cell => cell.isEditing = false);
		}
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

				this.viewCells.forEach(cell => {
					cell.save();
				});

				this.contentWidgetsMap.forEach((value, cell) => {
					this.contentWidgets.removeChild(value.element);
				});
				this.contentWidgetsMap.clear();

				this.model = model;
				this.viewCells = model.getNotebook().cells.map(cell => {
					return new ViewCell(cell, false, this.modelService, this.modeService);
				});
				this.list?.splice(0, this.list?.length, this.viewCells);
				this.list?.layout();
			});
	}

	layoutElement(cell: ViewCell, height: number) {
		setTimeout(() => {
			// list.splice -> renderElement -> resize -> layoutElement
			// above flow will actually break how list view renders it self as it messes up with the internal state
			// instead we run the layout update in next tick
			let index = this.model!.getNotebook().cells.indexOf(cell.cell);
			this.list?.updateDynamicHeight(index, cell, height);
		}, 0);
	}

	insertEmptyNotebookCell(cell: ViewCell, type: 'code' | 'markdown', direction: 'above' | 'below') {
		let newCell = new ViewCell({
			cell_type: type,
			source: [],
			outputs: []
		}, false, this.modelService, this.modeService);

		let index = this.model!.getNotebook().cells.indexOf(cell.cell);
		const insertIndex = direction === 'above' ? index : index + 1;

		this.viewCells!.splice(insertIndex, 0, newCell);
		this.model!.insertCell(newCell.cell, insertIndex);
		this.list?.splice(insertIndex, 0, [newCell]);

		if (type === 'markdown') {
			newCell.isEditing = true;
		}
	}

	editNotebookCell(cell: ViewCell): void {
		cell.isEditing = true;
	}

	saveNotebookCell(cell: ViewCell): void {
		cell.isEditing = false;
	}

	deleteNotebookCell(cell: ViewCell) {
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
