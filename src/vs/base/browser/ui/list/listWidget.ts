/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./list';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { toggleClass } from 'vs/base/browser/dom';
import { IDelegate, IIdentityProvider, IRenderer } from './list';
import { ListView } from './listView';

interface ITraitTemplateData<D> {
	container: HTMLElement;
	data: D;
}

class TraitRenderer<T, D> implements IRenderer<T, ITraitTemplateData<D>>
{
	private elements: { [id: string]: T };

	constructor(
		private controller: TraitController<T>,
		private renderer: IRenderer<T,D>
	) {}

	public get templateId(): string {
		return this.renderer.templateId;
	}

	renderTemplate(container: HTMLElement): ITraitTemplateData<D> {
		const data = this.renderer.renderTemplate(container);
		return { container, data };
	}

	renderElement(element: T, templateData: ITraitTemplateData<D>): void {
		toggleClass(templateData.container, this.controller.trait, this.controller.contains(element));
		this.renderer.renderElement(element, templateData.data);
	}

	disposeTemplate(templateData: ITraitTemplateData<D>): void {
		return this.renderer.disposeTemplate(templateData.data);
	}
}

class TraitController<T> {

	private elements: { [id: string]: T };

	constructor(private _trait: string, private identityProvider: IIdentityProvider<T>) {
		this.set();
	}

	get trait(): string {
		return this._trait;
	}

	set(...elements: T[]): void {
		this.elements = Object.create(null);
		this.add(...elements);
	}

	add(...elements: T[]): void {
		for (const element of elements) {
			const id = this.identityProvider.getId(element);
			this.elements[id] = element;
		}
	}

	remove(...elements: T[]): void {
		for (const element of elements) {
			const id = this.identityProvider.getId(element);
			delete this.elements[id];
		}
	}

	contains(element: T): boolean {
		return !!this.elements[this.identityProvider.getId(element)];
	}

	wrapRenderer<D>(renderer: IRenderer<T, D>): IRenderer<T, ITraitTemplateData<D>> {
		return new TraitRenderer<T, D>(this, renderer);
	}
}

export class List<T> implements IDisposable {

	private view: ListView<T>;
	private focus: TraitController<T>;
	private selection: TraitController<T>;

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[],
		private identityProvider: IIdentityProvider<T>
	) {
		this.focus = new TraitController('focused', identityProvider);
		this.selection = new TraitController('selected', identityProvider);

		renderers = renderers.map(r => {
			r = this.focus.wrapRenderer(r);
			r = this.selection.wrapRenderer(r);
			return r;
		});

		this.view = new ListView(container, delegate, renderers);
	}

	splice(start: number, deleteCount: number, ...elements: T[]): void {
		const deleted = this.view.splice(start, deleteCount, ...elements);
		this.focus.remove(...deleted);
		this.selection.remove(...deleted);
	}

	get length(): number {
		return this.view.length;
	}

	layout(height?: number): void {
		this.view.layout(height);
	}

	setSelection(...elements: T[]): void {
		this.selection.set(...elements);
	}

	setFocus(...elements: T[]): void {
		this.focus.set(...elements);
	}

	dispose(): void {
		this.view = dispose(this.view);
	}
}
