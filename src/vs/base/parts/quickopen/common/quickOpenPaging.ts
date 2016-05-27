/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { PagedModel } from 'vs/base/common/paging';
import { Mode, IModel, IDataSource, IRenderer, IRunner, IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';

interface IStubTemplateData<T> {
	data: T;
	disposable: IDisposable;
}

export interface IStub {
	index: number;
}

class PagedRenderer<T> implements IRenderer<IStub> {

	constructor(
		private model: PagedModel<T>,
		private renderer: IPagedRenderer<T>
	) {}

	getHeight(stub: IStub): number {
		return this.renderer.getHeight(null);
	}

	getTemplateId(stub: IStub): string {
		return this.renderer.getTemplateId(null);
	}

	renderTemplate(templateId: string, container: HTMLElement): IStubTemplateData<T> {
		const data = this.renderer.renderTemplate(templateId, container);
		return { data, disposable: { dispose: () => {} } };
	}

	renderElement({ index }: IStub, templateId: string, data: IStubTemplateData<T>): void {
		data.disposable.dispose();

		if (this.model.isResolved(index)) {
			return this.renderer.renderElement(this.model.get(index), templateId, data.data);
		}

		const promise = this.model.resolve(index);
		data.disposable = { dispose: () => promise.cancel() };

		this.renderer.renderPlaceholder(index, templateId, data.data);
		promise.done(entry => this.renderer.renderElement(entry, templateId, data.data));
	}

	disposeTemplate(templateId: string, data: IStubTemplateData<T>): void {
		data.disposable.dispose();
		data.disposable = null;
		this.renderer.disposeTemplate(templateId, data.data);
	}
}

class PagedDataSource<T> implements IDataSource<IStub> {

	constructor(
		private model: PagedModel<T>,
		private dataSource: IDataSource<T>
	) {}

	getId({ index }: IStub): string {
		return `paged-${ index }`;
	}

	getLabel({ index }: IStub): string {
		return this.model.isResolved(index) ? this.dataSource.getLabel(this.model.get(index)) : '';
	}
}

class PagedRunner<T> implements IRunner<IStub> {

	constructor(
		private model: PagedModel<T>,
		private runner: IRunner<T>
	) {}

	run({ index }: IStub, mode: Mode, context: IEntryRunContext): boolean {
		if (this.model.isResolved(index)) {
			return this.runner.run(this.model.get(index), mode, context);
		}

		return false;
	}
}

export interface IPagedRenderer<T> extends IRenderer<T> {
	renderPlaceholder(index: number, templateId: string, data: any): void;
}

export class QuickOpenPagedModel<T> implements IModel<any> {

	public dataSource: IDataSource<IStub>;
	public renderer: IRenderer<IStub>;
	public runner: IRunner<IStub>;
	// public filter: IFilter<IStub>;
	// public accessibilityProvider: IAccessiblityProvider<IStub>;
	public entries: IStub[];

	constructor(
		model: PagedModel<T>,
		dataSource: IDataSource<T>,
		renderer: IPagedRenderer<T>,
		runner: IRunner<T>
		// filter?: IFilter<T>,
		// accessibilityProvider?: IAccessiblityProvider<T>
	) {
		this.dataSource = new PagedDataSource(model, dataSource);
		this.renderer = new PagedRenderer(model, renderer);
		this.runner = new PagedRunner(model, runner);
		// this.filter = new PagedFilter(model, filter);
		// this.accessibilityProvider = new PagedAccessibilityProvider(model, accessibilityProvider);

		this.entries = [];
		for (let index = 0, len = model.length; index < len; index++) {
			this.entries.push({ index });
		}
	}
}