/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./list';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IDelegate, IRenderer } from './list';
import { List } from './listWidget';
import { PagedModel } from 'vs/base/common/paging';

export interface IPagedRenderer<TElement, TTemplateData> extends IRenderer<TElement, TTemplateData> {
	renderPlaceholder(index: number, templateData: TTemplateData): void;
}

export interface ITemplateData<T> {
	data: T;
	disposable: IDisposable;
}

export class PagedDelegate<T> implements IDelegate<number> {

	constructor(private delegate: IDelegate<T>) {
		// noop
	}

	getHeight(element: number): number {
		// TODO
		return this.delegate.getHeight(null);
	}

	getTemplateId(element: number): string {
		// TODO
		return this.delegate.getTemplateId(null);
	}
}

export class PagedRenderer<TElement, TTemplateData> implements IRenderer<number, ITemplateData<TTemplateData>> {

	private _model: PagedModel<TElement>;
	set model(model: PagedModel<TElement>) { this._model = model; }
	get templateId(): string { return this.renderer.templateId; }

	constructor(private renderer: IPagedRenderer<TElement, TTemplateData>) {
		// noop
	}

	renderTemplate(container: HTMLElement): ITemplateData<TTemplateData> {
		const data = this.renderer.renderTemplate(container);
		return { data, disposable: { dispose: () => {} } };
	}

	renderElement(index: number, _: number, data: ITemplateData<TTemplateData>): void {
		data.disposable.dispose();

		if (!this._model) {
			return;
		}

		if (this._model.isResolved(index)) {
			return this.renderer.renderElement(this._model.get(index), index, data.data);
		}

		const promise = this._model.resolve(index);
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

// TODO work on this
export class PagedList<T> extends List<number> {

	private _model: PagedModel<T>;

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IPagedRenderer<number, any>[]
	) {
		super(
			container,
			new PagedDelegate(delegate),
			renderers.map(r => new PagedRenderer(r))
		);
	}

	set model(model: PagedModel<T>) {
		this._model = model;
	}
}