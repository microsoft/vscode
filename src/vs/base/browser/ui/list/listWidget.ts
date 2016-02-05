/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./list';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { toggleClass } from 'vs/base/browser/dom';
import { IDelegate, IRenderer } from './list';
import { ListView } from './listView';

interface ITraitTemplateData<D> {
	container: HTMLElement;
	data: D;
}

class TraitRenderer<T, D> implements IRenderer<T, ITraitTemplateData<D>>
{
	private elements: { [id: string]: T };

	constructor(
		private controller: TraitController,
		private renderer: IRenderer<T,D>
	) {}

	public get templateId(): string {
		return this.renderer.templateId;
	}

	renderTemplate(container: HTMLElement): ITraitTemplateData<D> {
		const data = this.renderer.renderTemplate(container);
		return { container, data };
	}

	renderElement(element: T, index: number, templateData: ITraitTemplateData<D>): void {
		toggleClass(templateData.container, this.controller.trait, this.controller.contains(index));
		this.renderer.renderElement(element, index, templateData.data);
	}

	disposeTemplate(templateData: ITraitTemplateData<D>): void {
		return this.renderer.disposeTemplate(templateData.data);
	}
}

class TraitController {

	private indexes: number[];

	constructor(private _trait: string) {
		this.indexes = [];
	}

	splice(start: number, deleteCount: number, insertCount: number): void {
		const diff = insertCount - deleteCount;
		const end = start + deleteCount;
		const indexes = [];

		for (const index of indexes) {
			if (index >= start && index < end) {
				continue;
			}

			indexes.push(index > start ? index + diff : index);
		}

		this.indexes = indexes;
	}

	get trait(): string {
		return this._trait;
	}

	set(indexes: number[]): number[] {
		const result = this.indexes;
		this.indexes = indexes;
		return result;
	}

	add(index: number): void {
		if (this.contains(index)) {
			return;
		}

		this.indexes.push(index);
	}

	remove(index: number): void {
		this.indexes = this.indexes.filter(i => i === index);
	}

	contains(index: number): boolean {
		return this.indexes.some(i => i === index);
	}

	wrapRenderer<T, D>(renderer: IRenderer<T, D>): IRenderer<T, ITraitTemplateData<D>> {
		return new TraitRenderer<T, D>(this, renderer);
	}
}

export class List<T> implements IDisposable {

	private view: ListView<T>;
	private focus: TraitController;
	private selection: TraitController;

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[]
	) {
		this.focus = new TraitController('focused');
		this.selection = new TraitController('selected');

		renderers = renderers.map(r => {
			r = this.focus.wrapRenderer(r);
			r = this.selection.wrapRenderer(r);
			return r;
		});

		this.view = new ListView(container, delegate, renderers);
	}

	splice(start: number, deleteCount: number, ...elements: T[]): void {
		this.focus.splice(start, deleteCount, elements.length);
		this.selection.splice(start, deleteCount, elements.length);
		this.view.splice(start, deleteCount, ...elements);
	}

	get length(): number {
		return this.view.length;
	}

	layout(height?: number): void {
		this.view.layout(height);
	}

	setSelection(...indexes: number[]): void {
		indexes = indexes.concat(this.selection.set(indexes));
		indexes.forEach(i => this.view.splice(i, 1, this.view.element(i)));
	}

	setFocus(...indexes: number[]): void {
		indexes = indexes.concat(this.focus.set(indexes));
		indexes.forEach(i => this.view.splice(i, 1, this.view.element(i)));
	}

	dispose(): void {
		this.view = dispose(this.view);
	}
}
