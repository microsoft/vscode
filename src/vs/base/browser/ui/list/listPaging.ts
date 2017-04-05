/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./list';
import { IDisposable } from 'vs/base/common/lifecycle';
import { range } from 'vs/base/common/arrays';
import { IDelegate, IRenderer, IListEvent } from './list';
import { List, IListOptions } from './listWidget';
import { IPagedModel } from 'vs/base/common/paging';
import Event, { mapEvent } from 'vs/base/common/event';

export interface IPagedRenderer<TElement, TTemplateData> extends IRenderer<TElement, TTemplateData> {
	renderPlaceholder(index: number, templateData: TTemplateData): void;
}

export interface ITemplateData<T> {
	data: T;
	disposable: IDisposable;
}

class PagedRenderer<TElement, TTemplateData> implements IRenderer<number, ITemplateData<TTemplateData>> {

	get templateId(): string { return this.renderer.templateId; }

	constructor(
		private renderer: IPagedRenderer<TElement, TTemplateData>,
		private modelProvider: () => IPagedModel<TElement>
	) { }

	renderTemplate(container: HTMLElement): ITemplateData<TTemplateData> {
		const data = this.renderer.renderTemplate(container);
		return { data, disposable: { dispose: () => { } } };
	}

	renderElement(index: number, _: number, data: ITemplateData<TTemplateData>): void {
		data.disposable.dispose();

		const model = this.modelProvider();

		if (model.isResolved(index)) {
			return this.renderer.renderElement(model.get(index), index, data.data);
		}

		const promise = model.resolve(index);
		data.disposable = { dispose: () => promise.cancel() };

		this.renderer.renderPlaceholder(index, data.data);
		promise.done(entry => this.renderer.renderElement(entry, index, data.data));
	}

	disposeTemplate(data: ITemplateData<TTemplateData>): void {
		data.disposable.dispose();
		data.disposable = null;
		this.renderer.disposeTemplate(data.data);
		data.data = null;
	}
}

export class PagedList<T> {

	private list: List<number>;
	private _model: IPagedModel<T>;

	constructor(
		container: HTMLElement,
		delegate: IDelegate<number>,
		renderers: IPagedRenderer<T, any>[],
		options: IListOptions<any> = {} // TODO@Joao: should be IListOptions<T>
	) {
		const pagedRenderers = renderers.map(r => new PagedRenderer<T, ITemplateData<T>>(r, () => this.model));
		this.list = new List(container, delegate, pagedRenderers, options);
	}

	get widget(): List<number> {
		return this.list;
	}

	get onFocusChange(): Event<IListEvent<T>> {
		return mapEvent(this.list.onFocusChange, ({ elements, indexes }) => ({ elements: elements.map(e => this._model.get(e)), indexes }));
	}

	get onSelectionChange(): Event<IListEvent<T>> {
		return mapEvent(this.list.onSelectionChange, ({ elements, indexes }) => ({ elements: elements.map(e => this._model.get(e)), indexes }));
	}

	get model(): IPagedModel<T> {
		return this._model;
	}

	set model(model: IPagedModel<T>) {
		this._model = model;
		this.list.splice(0, this.list.length, range(model.length));
	}

	get length(): number {
		return this.list.length;
	}

	get scrollTop(): number {
		return this.list.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this.list.scrollTop = scrollTop;
	}

	focusNext(n?: number, loop?: boolean): void {
		this.list.focusNext(n, loop);
	}

	focusPrevious(n?: number, loop?: boolean): void {
		this.list.focusPrevious(n, loop);
	}

	selectNext(n?: number, loop?: boolean): void {
		this.list.selectNext(n, loop);
	}

	selectPrevious(n?: number, loop?: boolean): void {
		this.list.selectPrevious(n, loop);
	}

	focusNextPage(): void {
		this.list.focusNextPage();
	}

	focusPreviousPage(): void {
		this.list.focusPreviousPage();
	}

	getFocus(): number[] {
		return this.list.getFocus();
	}

	setSelection(indexes: number[]): void {
		this.list.setSelection(indexes);
	}

	layout(height?: number): void {
		this.list.layout(height);
	}

	reveal(index: number, relativeTop?: number): void {
		this.list.reveal(index, relativeTop);
	}
}