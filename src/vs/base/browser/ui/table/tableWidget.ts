/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./table';
import { IListOptions, IListStyles, List } from 'vs/base/browser/ui/list/listWidget';
import { ITableColumn, ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { ISpliceable } from 'vs/base/common/sequence';
import { IThemable } from 'vs/base/common/styler';
import { IDisposable } from 'vs/base/common/lifecycle';
import { $, append, clearNode, getContentHeight, getContentWidth } from 'vs/base/browser/dom';
import { ISplitViewDescriptor, IView, Orientation, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Emitter, Event } from 'vs/base/common/event';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

// TODO@joao
type TCell = any;

export interface ITableOptions<TRow> extends IListOptions<TRow> { }
export interface ITableStyles extends IListStyles { }

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

	constructor(
		private columns: ITableColumn<TRow, TCell>[],
		renderers: ITableRenderer<TCell, unknown>[]
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
		for (const { cellContainers } of this.renderedTemplates) {
			cellContainers[index].style.width = `${size}px`;
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
	readonly minimumSize = 120;
	readonly maximumSize = Number.POSITIVE_INFINITY;
	readonly onDidChange = Event.None;

	private _onDidLayout = new Emitter<[number, number]>();
	readonly onDidLayout = this._onDidLayout.event;

	constructor(column: ITableColumn<TRow, TCell>, private index: number) {
		this.element = $('.monaco-table-th', { 'data-col-index': index }, column.label);
	}

	layout(size: number): void {
		this._onDidLayout.fire([this.index, size]);
	}
}

export class TableWidget<TRow> implements ISpliceable<TRow>, IThemable, IDisposable {

	private domNode: HTMLElement;
	private splitview: SplitView;
	private list: List<TRow>;
	private columnLayoutDisposable: IDisposable;

	constructor(
		user: string,
		container: HTMLElement,
		private virtualDelegate: ITableVirtualDelegate<TRow>,
		columns: ITableColumn<TRow, TCell>[],
		renderers: ITableRenderer<TCell, unknown>[],
		_options?: ITableOptions<TRow>
	) {
		this.domNode = append(container, $('.monaco-table'));

		const headers = columns.map((c, i) => new ColumnHeader(c, i));
		const descriptor: ISplitViewDescriptor = {
			size: columns.length,
			views: headers.map(view => ({ size: 1, view }))
		};

		this.splitview = new SplitView(this.domNode, { orientation: Orientation.HORIZONTAL, scrollbarVisibility: ScrollbarVisibility.Hidden, descriptor });
		this.splitview.el.style.height = `${virtualDelegate.headerRowHeight}px`;
		this.splitview.el.style.lineHeight = `${virtualDelegate.headerRowHeight}px`;

		const renderer = new TableListRenderer(columns, renderers);
		this.list = new List(user, this.domNode, asListVirtualDelegate(virtualDelegate), [renderer], _options);

		this.columnLayoutDisposable = Event.any(...headers.map(h => h.onDidLayout))
			(([index, size]) => renderer.layoutColumn(index, size));
	}

	splice(start: number, deleteCount: number, elements: TRow[] = []): void {
		this.list.splice(start, deleteCount, elements);
	}

	layout(height?: number, width?: number): void {
		height = height ?? getContentHeight(this.domNode);
		width = width ?? getContentWidth(this.domNode);

		this.splitview.layout(width);
		this.list.layout(height - this.virtualDelegate.headerRowHeight, width);
	}

	style(styles: ITableStyles): void {
		this.list.style(styles);
	}

	dispose(): void {
		this.splitview.dispose();
		this.list.dispose();
		this.columnLayoutDisposable.dispose();
	}
}
