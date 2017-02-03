/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./list';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isNumber } from 'vs/base/common/types';
import { memoize } from 'vs/base/common/decorators';
import * as DOM from 'vs/base/browser/dom';
import { EventType as TouchEventType } from 'vs/base/browser/touch';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import Event, { Emitter, EventBufferer, chain, mapEvent, fromCallback } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IDelegate, IRenderer, IListMouseEvent, IFocusChangeEvent, ISelectionChangeEvent } from './list';
import { ListView, IListViewOptions } from './listView';

interface ITraitTemplateData<D> {
	container: HTMLElement;
	data: D;
}

interface ITraitChangeEvent {
	indexes: number[];
}

class TraitRenderer<T, D> implements IRenderer<T, ITraitTemplateData<D>>
{
	constructor(
		private controller: Trait<T>,
		private renderer: IRenderer<T, D>
	) { }

	public get templateId(): string {
		return this.renderer.templateId;
	}

	renderTemplate(container: HTMLElement): ITraitTemplateData<D> {
		const data = this.renderer.renderTemplate(container);
		return { container, data };
	}

	renderElement(element: T, index: number, templateData: ITraitTemplateData<D>): void {
		this.controller.renderElement(element, index, templateData.container);

		this.renderer.renderElement(element, index, templateData.data);
	}

	disposeTemplate(templateData: ITraitTemplateData<D>): void {
		return this.renderer.disposeTemplate(templateData.data);
	}
}

class Trait<T> implements IDisposable {

	private indexes: number[];

	private _onChange = new Emitter<ITraitChangeEvent>();
	get onChange() { return this._onChange.event; }

	constructor(private _trait: string) {
		this.indexes = [];
	}

	splice(start: number, deleteCount: number, insertCount: number): void {
		const diff = insertCount - deleteCount;
		const end = start + deleteCount;
		const indexes: number[] = [];

		for (let index of indexes) {
			if (index >= start && index < end) {
				continue;
			}

			indexes.push(index > start ? index + diff : index);
		}

		this.indexes = indexes;
		this._onChange.fire({ indexes });
	}

	renderElement(element: T, index: number, container: HTMLElement): void {
		DOM.toggleClass(container, this._trait, this.contains(index));
	}

	set(indexes: number[]): number[] {
		const result = this.indexes;
		this.indexes = indexes;
		this._onChange.fire({ indexes });
		return result;
	}

	get(): number[] {
		return this.indexes;
	}

	contains(index: number): boolean {
		return this.indexes.some(i => i === index);
	}

	wrapRenderer<D>(renderer: IRenderer<T, D>): IRenderer<T, ITraitTemplateData<D>> {
		return new TraitRenderer<T, D>(this, renderer);
	}

	dispose() {
		this.indexes = null;
		this._onChange = dispose(this._onChange);
	}
}

class FocusTrait<T> extends Trait<T> {

	constructor(private getElementId: (number: number) => string) {
		super('focused');
	}

	renderElement(element: T, index: number, container: HTMLElement): void {
		super.renderElement(element, index, container);
		container.setAttribute('role', 'treeitem');
		container.setAttribute('id', this.getElementId(index));
	}
}

class Controller<T> implements IDisposable {

	private disposables: IDisposable[];

	constructor(
		private list: List<T>,
		private view: ListView<T>
	) {
		this.disposables = [];
		this.disposables.push(view.addListener('mousedown', e => this.onMouseDown(e)));
		this.disposables.push(view.addListener('click', e => this.onPointer(e)));
		this.disposables.push(view.addListener(TouchEventType.Tap, e => this.onPointer(e)));

		const onKeyDown = chain(domEvent(view.domNode, 'keydown'))
			.map(e => new StandardKeyboardEvent(e));

		onKeyDown.filter(e => e.keyCode === KeyCode.Enter).on(this.onEnter, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.UpArrow).on(this.onUpArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.DownArrow).on(this.onDownArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.PageUp).on(this.onPageUpArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.PageDown).on(this.onPageDownArrow, this, this.disposables);
	}

	private onMouseDown(e: IListMouseEvent<T>) {
		e.preventDefault();
		e.stopPropagation();
	}

	private onPointer(e: IListMouseEvent<T>) {
		e.preventDefault();
		e.stopPropagation();
		this.view.domNode.focus();
		this.list.setFocus([e.index]);
		this.list.setSelection([e.index]);
	}

	private onEnter(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.setSelection(this.list.getFocus());
	}

	private onUpArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.focusPrevious();
		this.list.reveal(this.list.getFocus()[0]);
		this.view.domNode.focus();
	}

	private onDownArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.focusNext();
		this.list.reveal(this.list.getFocus()[0]);
		this.view.domNode.focus();
	}

	private onPageUpArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.focusPreviousPage();
		this.list.reveal(this.list.getFocus()[0]);
		this.view.domNode.focus();
	}

	private onPageDownArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.focusNextPage();
		this.list.reveal(this.list.getFocus()[0]);
		this.view.domNode.focus();
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}

export interface IListOptions extends IListViewOptions {
	ariaLabel?: string;
}

const DefaultOptions: IListOptions = {};

export class List<T> implements IDisposable {

	private static InstanceCount = 0;
	private idPrefix = `list_id_${++List.InstanceCount}`;

	private focus: Trait<T>;
	private selection: Trait<T>;
	private eventBufferer: EventBufferer;
	private view: ListView<T>;
	private controller: Controller<T>;
	private disposables: IDisposable[];

	@memoize
	get onFocusChange(): Event<IFocusChangeEvent<T>> {
		return this.eventBufferer.wrapEvent(mapEvent(this.focus.onChange, e => this.toListEvent(e)));
	}

	@memoize
	get onSelectionChange(): Event<ISelectionChangeEvent<T>> {
		return this.eventBufferer.wrapEvent(mapEvent(this.selection.onChange, e => this.toListEvent(e)));
	}

	@memoize
	get onContextMenu(): Event<IListMouseEvent<T>> {
		return fromCallback(handler => this.view.addListener('contextmenu', handler));
	}

	private _onDOMFocus: Event<FocusEvent>;
	get onDOMFocus(): Event<FocusEvent> { return this._onDOMFocus; }

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[],
		options: IListOptions = DefaultOptions
	) {
		this.focus = new FocusTrait(i => this.getElementId(i));
		this.selection = new Trait('selected');
		this.eventBufferer = new EventBufferer();

		renderers = renderers.map(r => {
			r = this.focus.wrapRenderer(r);
			r = this.selection.wrapRenderer(r);
			return r;
		});

		this.view = new ListView(container, delegate, renderers, options);
		this.view.domNode.setAttribute('role', 'tree');
		this.view.domNode.tabIndex = 0;
		this.controller = new Controller(this, this.view);
		this.disposables = [this.focus, this.selection, this.view, this.controller];

		this._onDOMFocus = domEvent(this.view.domNode, 'focus');
		this.onFocusChange(this._onFocusChange, this, this.disposables);

		if (options.ariaLabel) {
			this.view.domNode.setAttribute('aria-label', options.ariaLabel);
		}
	}

	splice(start: number, deleteCount: number, elements: T[] = []): void {
		this.eventBufferer.bufferEvents(() => {
			this.focus.splice(start, deleteCount, elements.length);
			this.selection.splice(start, deleteCount, elements.length);
			this.view.splice(start, deleteCount, elements);
		});
	}

	get length(): number {
		return this.view.length;
	}

	get contentHeight(): number {
		return this.view.getContentHeight();
	}

	get scrollTop(): number {
		return this.view.getScrollTop();
	}

	set scrollTop(scrollTop: number) {
		this.view.setScrollTop(scrollTop);
	}

	layout(height?: number): void {
		this.view.layout(height);
	}

	setSelection(indexes: number[]): void {
		this.eventBufferer.bufferEvents(() => {
			indexes = indexes.concat(this.selection.set(indexes));
			indexes.forEach(i => this.view.splice(i, 1, [this.view.element(i)]));
		});
	}

	selectNext(n = 1, loop = false): void {
		if (this.length === 0) { return; }
		const selection = this.selection.get();
		let index = selection.length > 0 ? selection[0] + n : 0;
		this.setSelection(loop ? [index % this.length] : [Math.min(index, this.length - 1)]);
	}

	selectPrevious(n = 1, loop = false): void {
		if (this.length === 0) { return; }
		const selection = this.selection.get();
		let index = selection.length > 0 ? selection[0] - n : 0;
		if (loop && index < 0) {
			index = this.length + (index % this.length);
		}
		this.setSelection([Math.max(index, 0)]);
	}

	getSelection(): number[] {
		return this.selection.get();
	}

	setFocus(indexes: number[]): void {
		this.eventBufferer.bufferEvents(() => {
			indexes = indexes.concat(this.focus.set(indexes));
			indexes.forEach(i => this.view.splice(i, 1, [this.view.element(i)]));
		});
	}

	focusNext(n = 1, loop = false): void {
		if (this.length === 0) { return; }
		const focus = this.focus.get();
		let index = focus.length > 0 ? focus[0] + n : 0;
		this.setFocus(loop ? [index % this.length] : [Math.min(index, this.length - 1)]);
	}

	focusPrevious(n = 1, loop = false): void {
		if (this.length === 0) { return; }
		const focus = this.focus.get();
		let index = focus.length > 0 ? focus[0] - n : 0;
		if (loop && index < 0) { index = (this.length + (index % this.length)) % this.length; }
		this.setFocus([Math.max(index, 0)]);
	}

	focusNextPage(): void {
		let lastPageIndex = this.view.indexAt(this.view.getScrollTop() + this.view.renderHeight);
		lastPageIndex = lastPageIndex === 0 ? 0 : lastPageIndex - 1;
		const lastPageElement = this.view.element(lastPageIndex);
		const currentlyFocusedElement = this.getFocusedElements()[0];

		if (currentlyFocusedElement !== lastPageElement) {
			this.setFocus([lastPageIndex]);
		} else {
			const previousScrollTop = this.view.getScrollTop();
			this.view.setScrollTop(previousScrollTop + this.view.renderHeight - this.view.elementHeight(lastPageIndex));

			if (this.view.getScrollTop() !== previousScrollTop) {
				// Let the scroll event listener run
				setTimeout(() => this.focusNextPage(), 0);
			}
		}
	}

	focusPreviousPage(): void {
		let firstPageIndex: number;
		const scrollTop = this.view.getScrollTop();

		if (scrollTop === 0) {
			firstPageIndex = this.view.indexAt(scrollTop);
		} else {
			firstPageIndex = this.view.indexAfter(scrollTop - 1);
		}

		const firstPageElement = this.view.element(firstPageIndex);
		const currentlyFocusedElement = this.getFocusedElements()[0];

		if (currentlyFocusedElement !== firstPageElement) {
			this.setFocus([firstPageIndex]);
		} else {
			const previousScrollTop = scrollTop;
			this.view.setScrollTop(scrollTop - this.view.renderHeight);

			if (this.view.getScrollTop() !== previousScrollTop) {
				// Let the scroll event listener run
				setTimeout(() => this.focusPreviousPage(), 0);
			}
		}
	}

	getFocus(): number[] {
		return this.focus.get();
	}

	getFocusedElements(): T[] {
		return this.getFocus().map(i => this.view.element(i));
	}

	reveal(index: number, relativeTop?: number): void {
		const scrollTop = this.view.getScrollTop();
		const elementTop = this.view.elementTop(index);
		const elementHeight = this.view.elementHeight(index);

		if (isNumber(relativeTop)) {
			relativeTop = relativeTop < 0 ? 0 : relativeTop;
			relativeTop = relativeTop > 1 ? 1 : relativeTop;

			// y = mx + b
			const m = elementHeight - this.view.renderHeight;
			this.view.setScrollTop(m * relativeTop + elementTop);
		} else {
			const viewItemBottom = elementTop + elementHeight;
			const wrapperBottom = scrollTop + this.view.renderHeight;

			if (elementTop < scrollTop) {
				this.view.setScrollTop(elementTop);
			} else if (viewItemBottom >= wrapperBottom) {
				this.view.setScrollTop(viewItemBottom - this.view.renderHeight);
			}
		}
	}

	getElementId(index: number): string {
		return `${this.idPrefix}_${index}`;
	}

	private toListEvent({ indexes }: ITraitChangeEvent) {
		return { indexes, elements: indexes.map(i => this.view.element(i)) };
	}

	private _onFocusChange(): void {
		const focus = this.focus.get();

		if (focus.length > 0) {
			this.view.domNode.setAttribute('aria-activedescendant', this.getElementId(focus[0]));
		} else {
			this.view.domNode.removeAttribute('aria-activedescendant');
		}

		this.view.domNode.setAttribute('role', 'tree');
		DOM.toggleClass(this.view.domNode, 'element-focused', focus.length > 0);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
