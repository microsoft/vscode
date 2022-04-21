/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, createStyleSheet, getContentHeight, getContentWidth } from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListOptions, IListOptionsUpdate, IListStyles, List } from 'vs/base/browser/ui/list/listWidget';
import { ISplitViewDescriptor, IView, Orientation, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { ITableColumn, ITableContextMenuEvent, ITableEvent, ITableGestureEvent, ITableMouseEvent, ITableRenderer, ITableTouchEvent, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { Delayer } from 'vs/base/common/async';
import { illegalArgument } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility, ScrollEvent } from 'vs/base/common/scrollable';
import { ISpliceable } from 'vs/base/common/sequence';
import { IThemable } from 'vs/base/common/styler';
import 'vs/css!./table';

// TODO@joao
type TCell = any;

interface RowTemplateData {
	readonly container: HTMLElement;
	readonly cellContainers: HTMLElement[];
	readonly cellTemplateData: unknown[];
}

class TableListRenderer<TRow> implements IListRenderer<TRow, RowTemplateData> {

	static TemplateId = 'row';
	readonly templateId = TableListRenderer.TemplateId;
	private renderers: ITableRenderer<TCell, unknown>[];
	private renderedTemplates = new Set<RowTemplateData>();
	private widthDelayer = new Delayer<void>(50);

	constructor(
		private table: Table<TRow>,
		private columns: ITableColumn<TRow, TCell>[],
		private headers: ColumnHeader<TRow, TCell>[],
		renderers: ITableRenderer<TCell, unknown>[],
		private getColumnSize: (index: number) => number
	) {
		const rendererMap = new Map(renderers.map(r => [r.templateId, r]));
		this.renderers = [];

		for (const column of columns) {
			const renderer = rendererMap.get(column.templateId);

			if (!renderer) {
				throw new Error(`Table cell renderer for template id ${column.templateId} not found.`);
			}

			this.renderers.push(renderer);
		}
	}

	renderTemplate(container: HTMLElement) {
		const rowContainer = append(container, $('.monaco-table-tr'));
		const cellContainers: HTMLElement[] = [];
		const cellTemplateData: unknown[] = [];

		for (let i = 0; i < this.columns.length; i++) {
			const renderer = this.renderers[i];
			const cellContainer = append(rowContainer, $('.monaco-table-td', { 'data-col-index': i }));

			cellContainer.style.width = `${this.getColumnSize(i)}px`;
			cellContainers.push(cellContainer);
			cellTemplateData.push(renderer.renderTemplate(cellContainer));
		}

		const result = { container, cellContainers, cellTemplateData };
		this.renderedTemplates.add(result);

		return result;
	}

	renderElement(element: TRow, index: number, templateData: RowTemplateData, height: number | undefined): void {
		for (let i = 0; i < this.columns.length; i++) {
			const column = this.columns[i];
			const cell = column.project(element);
			const renderer = this.renderers[i];
			renderer.renderElement(cell, index, templateData.cellTemplateData[i], height);
		}
		this.widthDelayer.trigger(() => {
			for (let i = 0; i < this.columns.length; i++) {
				if (this.columns[i].minimumWidth === Number.POSITIVE_INFINITY) {
					// Calculate new width
					let width = this.getContentWidth(i);
					if (width !== undefined && width !== this.headers[i].contentSize) {
						this.headers[i].contentSize = width;
						this.table.setColumnWidth(i, width);
					}
				}
			}
		});
	}

	disposeElement(element: TRow, index: number, templateData: RowTemplateData, height: number | undefined): void {
		for (let i = 0; i < this.columns.length; i++) {
			const renderer = this.renderers[i];

			if (renderer.disposeElement) {
				const column = this.columns[i];
				const cell = column.project(element);

				renderer.disposeElement(cell, index, templateData.cellTemplateData[i], height);
			}
		}
	}

	disposeTemplate(templateData: RowTemplateData): void {
		for (let i = 0; i < this.columns.length; i++) {
			const renderer = this.renderers[i];
			renderer.disposeTemplate(templateData.cellTemplateData[i]);
		}

		clearNode(templateData.container);
		this.renderedTemplates.delete(templateData);
	}

	layoutColumn(index: number, size: number): void {
		if (size < 0) {
			for (const { cellContainers } of this.renderedTemplates) {
				cellContainers[index].style.width = '';
			}
		} else {
			for (const { cellContainers } of this.renderedTemplates) {
				cellContainers[index].style.width = `${size}px`;
			}
		}
	}

	getContentWidth(index: number): number | undefined {
		let getContentWidth = this.renderers[index].getContentWidth;
		if (getContentWidth) {
			return getContentWidth.apply(this.renderers[index], [
				[...this.renderedTemplates]
					.filter(template => template.container.parentElement !== undefined)
					.map(template => template.cellTemplateData[index])]);
		} else {
			return undefined;
		}
	}
}

function asListVirtualDelegate<TRow>(delegate: ITableVirtualDelegate<TRow>): IListVirtualDelegate<TRow> {
	return {
		getHeight(row) { return delegate.getHeight(row); },
		getTemplateId() { return TableListRenderer.TemplateId; },
	};
}

class ColumnHeader<TRow, TCell> implements IView {

	readonly element: HTMLElement;
	contentSize?: number;

	get minimumSize() {
		if (!this.column.minimumWidth) {
			return 120;
		} else if (this.column.minimumWidth === Number.POSITIVE_INFINITY) {
			return this.contentSize ?? 0;
		} else {
			return this.column.minimumWidth;
		}
	}
	get maximumSize() { return this.column.maximumWidth ?? Number.POSITIVE_INFINITY; }
	get onDidChange() { return this.column.onDidChangeWidthConstraints ?? Event.None; }

	private _onDidLayout = new Emitter<[number, number]>();
	readonly onDidLayout = this._onDidLayout.event;

	constructor(readonly column: ITableColumn<TRow, TCell>, private index: number) {
		this.element = $('.monaco-table-th', { 'data-col-index': index, title: column.tooltip }, column.label);
	}

	layout(size: number): void {
		this._onDidLayout.fire([this.index, size]);
	}
}

export interface ITableOptions<TRow> extends IListOptions<TRow> { }
export interface ITableOptionsUpdate extends IListOptionsUpdate { }
export interface ITableStyles extends IListStyles { }

export class Table<TRow> implements ISpliceable<TRow>, IThemable, IDisposable {

	private static InstanceCount = 0;
	readonly domId = `table_id_${++Table.InstanceCount}`;

	readonly domNode: HTMLElement;
	private fixedColumnSplitview: SplitView | undefined;
	private splitview: SplitView;
	private fixedColumnList: List<TRow> | undefined;
	private list: List<TRow>;
	private readonly firstNonFixedColumn: number;
	private readonly fixedColumnWidth: number;
	private readonly nonFixedHeaders: ColumnHeader<TRow, TCell>[];
	private styleElement: HTMLStyleElement;
	protected readonly disposables = new DisposableStore();

	private cachedWidth: number = 0;
	private cachedHeight: number = 0;

	get onDidChangeFocus(): Event<ITableEvent<TRow>> { return this.list.onDidChangeFocus; }
	get onDidChangeSelection(): Event<ITableEvent<TRow>> { return this.list.onDidChangeSelection; }

	get onDidScroll(): Event<ScrollEvent> { return this.list.onDidScroll; }
	get onMouseClick(): Event<ITableMouseEvent<TRow>> { return this.list.onMouseClick; }
	get onMouseDblClick(): Event<ITableMouseEvent<TRow>> { return this.list.onMouseDblClick; }
	get onMouseMiddleClick(): Event<ITableMouseEvent<TRow>> { return this.list.onMouseMiddleClick; }
	get onPointer(): Event<ITableMouseEvent<TRow>> { return this.list.onPointer; }
	get onMouseUp(): Event<ITableMouseEvent<TRow>> { return this.list.onMouseUp; }
	get onMouseDown(): Event<ITableMouseEvent<TRow>> { return this.list.onMouseDown; }
	get onMouseOver(): Event<ITableMouseEvent<TRow>> { return this.list.onMouseOver; }
	get onMouseMove(): Event<ITableMouseEvent<TRow>> { return this.list.onMouseMove; }
	get onMouseOut(): Event<ITableMouseEvent<TRow>> { return this.list.onMouseOut; }
	get onTouchStart(): Event<ITableTouchEvent<TRow>> { return this.list.onTouchStart; }
	get onTap(): Event<ITableGestureEvent<TRow>> { return this.list.onTap; }
	get onContextMenu(): Event<ITableContextMenuEvent<TRow>> { return this.list.onContextMenu; }

	get onDidFocus(): Event<void> { return this.list.onDidFocus; }
	get onDidBlur(): Event<void> { return this.list.onDidBlur; }

	get scrollTop(): number { return this.list.scrollTop; }
	set scrollTop(scrollTop: number) { this.list.scrollTop = scrollTop; }
	get scrollLeft(): number { return this.list.scrollLeft; }
	set scrollLeft(scrollLeft: number) { this.list.scrollLeft = scrollLeft; }
	get scrollHeight(): number { return this.list.scrollHeight; }
	get renderHeight(): number { return this.list.renderHeight; }
	get onDidDispose(): Event<void> { return this.list.onDidDispose; }

	constructor(
		user: string,
		container: HTMLElement,
		private virtualDelegate: ITableVirtualDelegate<TRow>,
		columns: ITableColumn<TRow, TCell>[],
		renderers: ITableRenderer<TCell, unknown>[],
		_options?: ITableOptions<TRow>
	) {
		this.domNode = append(container, $(`.monaco-table.${this.domId}`));
		this.firstNonFixedColumn = columns.findIndex(column => !column.fixed);
		const fixedColumns = columns.slice(0, this.firstNonFixedColumn);
		const nonFixedColumns = columns.slice(this.firstNonFixedColumn);
		if (!fixedColumns.every(column => column.minimumWidth !== undefined && column.maximumWidth === column.minimumWidth)) {
			throw illegalArgument('columns');
		}
		if (!nonFixedColumns.every(column => column.fixed !== true)) {
			throw illegalArgument('columns');
		}
		this.fixedColumnWidth = fixedColumns.map(column => column.minimumWidth!).reduce((a, b) => a + b);

		if (fixedColumns.length !== 0) {
			const fixedHeaders = fixedColumns.map((c, i) => new ColumnHeader(c, i));
			const descriptor: ISplitViewDescriptor = {
				size: fixedHeaders.reduce((a, b) => a + b.column.weight, 0),
				views: fixedHeaders.map(view => ({ size: view.column.minimumWidth!, view }))
			};

			this.fixedColumnSplitview = this.disposables.add(new SplitView(this.domNode, {
				orientation: Orientation.HORIZONTAL,
				scrollbarVisibility: ScrollbarVisibility.Hidden,
				getSashOrthogonalSize: () => this.cachedHeight,
				descriptor
			}));

			this.fixedColumnSplitview.el.style.height = `${virtualDelegate.headerRowHeight}px`;
			this.fixedColumnSplitview.el.style.lineHeight = `${virtualDelegate.headerRowHeight}px`;

			const renderer = new TableListRenderer(this, fixedColumns, fixedHeaders, renderers, i => this.fixedColumnSplitview!.getViewSize(i));
			this.fixedColumnList = this.disposables.add(new List(user, this.domNode, asListVirtualDelegate(virtualDelegate), [renderer], {
				..._options,
				horizontalScrolling: false,
				verticalScrollMode: ScrollbarVisibility.Hidden,
			}));
			this.fixedColumnList.getHTMLElement().style.width = `${this.fixedColumnWidth}px`;

			Event.any(...fixedHeaders.map(h => h.onDidLayout))
				(([index, size]) => renderer.layoutColumn(index, size), null, this.disposables);

			this.fixedColumnSplitview.onDidSashReset(index => {
				const totalWeight = fixedColumns.reduce((r, c) => r + c.weight, 0);
				const size = fixedColumns[index].weight / totalWeight * this.cachedWidth;
				this.splitview.resizeView(index, size);
			}, null, this.disposables);
		}

		const headers = nonFixedColumns.map((c, i) => new ColumnHeader(c, i));
		this.nonFixedHeaders = headers;
		const descriptor: ISplitViewDescriptor = {
			size: headers.reduce((a, b) => a + b.column.weight, 0),
			views: headers.map(view => ({ size: view.column.weight, view }))
		};

		this.splitview = this.disposables.add(new SplitView(this.domNode, {
			orientation: Orientation.HORIZONTAL,
			scrollbarVisibility: ScrollbarVisibility.Hidden,
			getSashOrthogonalSize: () => this.cachedHeight,
			descriptor
		}));

		this.splitview.el.style.height = `${virtualDelegate.headerRowHeight}px`;
		this.splitview.el.style.lineHeight = `${virtualDelegate.headerRowHeight}px`;
		this.splitview.el.style.left = `${this.fixedColumnWidth}px`;
		this.splitview.el.style.position = 'absolute';

		const renderer = new TableListRenderer(this, nonFixedColumns, headers, renderers.slice(this.firstNonFixedColumn), i => this.splitview.getViewSize(i));
		this.list = this.disposables.add(new List(user, this.domNode, asListVirtualDelegate(virtualDelegate), [renderer], _options));
		this.list.getHTMLElement().style.position = 'absolute';
		this.list.getHTMLElement().style.left = `${this.fixedColumnWidth}px`;

		Event.any(...headers.map(h => h.onDidLayout))
			(([index, size]) => {
				renderer.layoutColumn(index, size);
				for (let row = this.list.firstVisibleIndex; row <= this.list.lastVisibleIndex; row++) {
					this.list.updateWidth(row);
				}
				this.list.eventuallyUpdateScrollWidth();
			}, null, this.disposables);

		this.splitview.onDidSashReset(index => {
			const totalWeight = nonFixedColumns.reduce((r, c) => r + c.weight, 0);
			const size = nonFixedColumns[index].weight / totalWeight * this.cachedWidth;
			this.splitview.resizeView(index, size);
		}, null, this.disposables);

		this.styleElement = createStyleSheet(this.domNode);
		this.style({});

		if (this.fixedColumnList !== undefined) {
			this.disposables.add(this.list.onDidScroll(e => {
				this.fixedColumnList!.scrollTop = e.scrollTop;
			}));
		}
		if (this.list.options.horizontalScrolling) {
			this.disposables.add(this.list.onDidScroll(e => {
				this.splitview.setScrollPosition(e.scrollLeft);
			}));
		}
	}

	updateOptions(options: ITableOptionsUpdate): void {
		this.fixedColumnList?.updateOptions(options);
		this.list.updateOptions(options);
	}

	splice(start: number, deleteCount: number, elements: TRow[] = []): void {
		this.fixedColumnList?.splice(start, deleteCount, elements);
		this.list.splice(start, deleteCount, elements);
	}

	rerender(): void {
		this.fixedColumnList?.rerender();
		this.list.rerender();
	}

	row(index: number): TRow {
		return this.list.element(index);
	}

	indexOf(element: TRow): number {
		return this.list.indexOf(element);
	}

	get length(): number {
		return this.list.length;
	}

	getHTMLElement(): HTMLElement {
		return this.domNode;
	}

	layout(height?: number, width?: number): void {
		height = height ?? getContentHeight(this.domNode);
		width = width ?? getContentWidth(this.domNode);

		this.cachedWidth = width;
		this.cachedHeight = height;
		if (!this.list.options.horizontalScrolling) {
			this.splitview.layout(width - this.fixedColumnWidth);
		}

		const listHeight = height - this.virtualDelegate.headerRowHeight;
		if (this.fixedColumnList !== undefined) {
			this.fixedColumnList.getHTMLElement().style.height = `${listHeight}px`;
			this.fixedColumnList.layout(listHeight, this.fixedColumnWidth);
		}
		this.list.getHTMLElement().style.height = `${listHeight}px`;
		this.list.layout(listHeight, width - this.fixedColumnWidth);
	}

	toggleKeyboardNavigation(): void {
		this.list.toggleKeyboardNavigation();
	}

	style(styles: ITableStyles): void {
		const content: string[] = [];

		content.push(`.monaco-table.${this.domId} > .monaco-split-view2 .monaco-sash.vertical::before {
			top: ${this.virtualDelegate.headerRowHeight + 1}px;
			height: calc(100% - ${this.virtualDelegate.headerRowHeight}px);
		}`);

		this.styleElement.textContent = content.join('\n');
		this.list.style(styles);
	}

	domFocus(): void {
		this.list.domFocus();
	}

	setAnchor(index: number | undefined): void {
		this.list.setAnchor(index);
	}

	getAnchor(): number | undefined {
		return this.list.getAnchor();
	}

	getSelectedElements(): TRow[] {
		return this.list.getSelectedElements();
	}

	setSelection(indexes: number[], browserEvent?: UIEvent): void {
		this.list.setSelection(indexes, browserEvent);
	}

	getSelection(): number[] {
		return this.list.getSelection();
	}

	setFocus(indexes: number[], browserEvent?: UIEvent): void {
		this.list.setFocus(indexes, browserEvent);
	}

	focusNext(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.list.focusNext(n, loop, browserEvent);
	}

	focusPrevious(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.list.focusPrevious(n, loop, browserEvent);
	}

	focusNextPage(browserEvent?: UIEvent): Promise<void> {
		return this.list.focusNextPage(browserEvent);
	}

	focusPreviousPage(browserEvent?: UIEvent): Promise<void> {
		return this.list.focusPreviousPage(browserEvent);
	}

	focusFirst(browserEvent?: UIEvent): void {
		this.list.focusFirst(browserEvent);
	}

	focusLast(browserEvent?: UIEvent): void {
		this.list.focusLast(browserEvent);
	}

	getFocus(): number[] {
		return this.list.getFocus();
	}

	getFocusedElements(): TRow[] {
		return this.list.getFocusedElements();
	}

	reveal(index: number, relativeTop?: number): void {
		this.list.reveal(index, relativeTop);
	}

	dispose(): void {
		this.disposables.dispose();
	}

	setColumnWidth(index: number, width: number) {
		this.splitview.resizeView(index, width);
		this.nonFixedHeaders[index].layout(width);
	}
}
