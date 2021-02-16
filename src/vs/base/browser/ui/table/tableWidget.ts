/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./table';
import { IListOptions, IListStyles, List } from 'vs/base/browser/ui/list/listWidget';
import { ITableColumn, ITableRenderer, ITableVirtualDelegate, TableError } from 'vs/base/browser/ui/table/table';
import { ISpliceable } from 'vs/base/common/sequence';
import { IThemable } from 'vs/base/common/styler';
import { IDisposable } from 'vs/base/common/lifecycle';
import { $, append, clearNode, getContentHeight, getContentWidth } from 'vs/base/browser/dom';
import { Orientation, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';

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

	constructor(
		private columns: ITableColumn<TRow, TCell>[],
		renderers: ITableRenderer<TCell, unknown>[]
	) {
		const rendererMap = new Map(renderers.map(r => [r.templateId, r]));

		this.renderers = columns.map(column => {
			const result = rendererMap.get(column.templateId);

			if (!result) {
				throw new Error(`Table cell renderer for template id ${column.templateId} not found.`);
			}

			return result;
		});
	}

	renderTemplate(container: HTMLElement) {
		const cellContainers: HTMLElement[] = [];
		const cellTemplateData: unknown[] = [];

		for (let i = 0; i < this.columns.length; i++) {
			const renderer = this.renderers[i];
			const cellContainer = append(container, $('.monaco-table-cell'));

			cellContainers.push(cellContainer);
			cellTemplateData.push(renderer.renderTemplate(cellContainer));
		}

		return { container, cellContainers, cellTemplateData };
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
	}
}

function asListVirtualDelegate<TRow>(delegate: ITableVirtualDelegate<TRow>): IListVirtualDelegate<TRow> {
	return {
		getHeight(row) { return delegate.getHeight(row); },
		getTemplateId() { return TableListRenderer.TemplateId; },
	};
}

export class TableWidget<TRow> implements ISpliceable<TRow>, IThemable, IDisposable {

	private domNode: HTMLElement;
	private splitview: SplitView;
	private list: List<TRow>;

	constructor(
		private user: string,
		container: HTMLElement,
		private virtualDelegate: ITableVirtualDelegate<TRow>,
		columns: ITableColumn<TRow, TCell>[],
		renderers: ITableRenderer<TCell, unknown>[],
		private _options?: ITableOptions<TRow>
	) {
		this.domNode = append(container, $('.monaco-table'));

		this.splitview = new SplitView(this.domNode, { orientation: Orientation.HORIZONTAL });
		this.splitview.el.style.height = `${virtualDelegate.headerRowHeight}px`;

		this.list = new List(user, this.domNode, asListVirtualDelegate(virtualDelegate), [new TableListRenderer(columns, renderers)], _options);
	}

	splice(start: number, deleteCount: number, elements: TRow[] = []): void {
		if (start < 0 || start > this.list.length) {
			throw new TableError(this.user, `Invalid start index: ${start}`);
		}

		if (deleteCount < 0) {
			throw new TableError(this.user, `Invalid delete count: ${deleteCount}`);
		}

		if (deleteCount === 0 && elements.length === 0) {
			return;
		}

		throw new Error('Method not implemented');
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
	}
}
