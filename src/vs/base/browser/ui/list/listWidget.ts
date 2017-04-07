/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./list';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isNumber } from 'vs/base/common/types';
import { range } from 'vs/base/common/arrays';
import { once } from 'vs/base/common/functional';
import { memoize } from 'vs/base/common/decorators';
import * as DOM from 'vs/base/browser/dom';
import * as platform from 'vs/base/common/platform';
import { EventType as TouchEventType } from 'vs/base/browser/touch';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import Event, { Emitter, EventBufferer, chain, mapEvent, fromCallback, createEmptyEvent, any } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IDelegate, IRenderer, IListEvent, IListMouseEvent, IListContextMenuEvent } from './list';
import { ListView, IListViewOptions } from './listView';

export interface IIdentityProvider<T> {
	(element: T): string;
}

export interface ISpliceable<T> {
	splice(start: number, deleteCount: number, elements: T[]): void;
}

class CombinedSpliceable<T> implements ISpliceable<T> {

	constructor(private spliceables: ISpliceable<T>[]) { }

	splice(start: number, deleteCount: number, elements: T[]): void {
		this.spliceables.forEach(s => s.splice(start, deleteCount, elements));
	}
}

interface ITraitChangeEvent {
	indexes: number[];
}

interface ITraitTemplateData {
	container: HTMLElement;
	elementDisposable: IDisposable;
}

interface IRenderedElement {
	templateData: ITraitTemplateData;
	index: number;
}

class TraitRenderer<T, D> implements IRenderer<T, ITraitTemplateData>
{
	private rendered: IRenderedElement[] = [];

	constructor(private trait: Trait<T>) { }

	get templateId(): string {
		return `template:${this.trait.trait}`;
	}

	renderTemplate(container: HTMLElement): ITraitTemplateData {
		const elementDisposable = EmptyDisposable;
		return { container, elementDisposable };
	}

	renderElement(element: T, index: number, templateData: ITraitTemplateData): void {
		templateData.elementDisposable.dispose();

		const rendered = { index, templateData };
		this.rendered.push(rendered);
		templateData.elementDisposable = toDisposable(once(() => this.rendered.splice(this.rendered.indexOf(rendered), 1)));

		this.trait.renderIndex(index, templateData.container);
	}

	renderIndexes(indexes: number[]): void {
		this.rendered
			.filter(({ index }) => indexes.indexOf(index) > -1)
			.forEach(({ index, templateData }) => this.trait.renderIndex(index, templateData.container));
	}

	splice(start: number, deleteCount: number): void {
		for (let i = 0; i < deleteCount; i++) {
			const key = `key_${start + i}`;
			const data = this.rendered[key];

			if (data) {
				data.elementDisposable.dispose();
			}
		}
	}

	disposeTemplate(templateData: ITraitTemplateData): void {
		templateData.elementDisposable.dispose();
	}
}

class Trait<T> implements ISpliceable<boolean>, IDisposable {

	/**
	 * Sorted indexes which have this trait.
	 */
	private indexes: number[];

	private _onChange = new Emitter<ITraitChangeEvent>();
	get onChange(): Event<ITraitChangeEvent> { return this._onChange.event; }

	get trait(): string { return this._trait; }

	@memoize
	get renderer(): TraitRenderer<T, any> {
		return new TraitRenderer<T, any>(this);
	}

	constructor(private _trait: string) {
		this.indexes = [];
	}

	splice(start: number, deleteCount: number, elements: boolean[]): void {
		const diff = elements.length - deleteCount;
		const end = start + deleteCount;
		const indexes = [
			...this.indexes.filter(i => i < start),
			...elements.reduce((r, hasTrait, i) => hasTrait ? [...r, i + start] : r, []),
			...this.indexes.filter(i => i >= end).map(i => i + diff)
		];

		this.renderer.splice(start, deleteCount);
		this.set(indexes);
	}

	renderIndex(index: number, container: HTMLElement): void {
		DOM.toggleClass(container, this._trait, this.contains(index));
	}

	/**
	 * Sets the indexes which should have this trait.
	 *
	 * @param indexes Indexes which should have this trait.
	 * @return The old indexes which had this trait.
	 */
	set(indexes: number[]): number[] {
		const result = this.indexes;
		this.indexes = indexes;

		const toRender = disjunction(result, indexes);
		this.renderer.renderIndexes(toRender);

		this._onChange.fire({ indexes });
		return result;
	}

	get(): number[] {
		return this.indexes;
	}

	contains(index: number): boolean {
		return this.indexes.some(i => i === index);
	}

	dispose() {
		this.indexes = null;
		this._onChange = dispose(this._onChange);
	}
}

class FocusTrait<T> extends Trait<T> {

	constructor(
		private getDomId: IIdentityProvider<number>
	) {
		super('focused');
	}

	renderIndex(index: number, container: HTMLElement): void {
		super.renderIndex(index, container);
		container.setAttribute('role', 'treeitem');
		container.setAttribute('id', this.getDomId(index));
	}
}

/**
 * The TraitSpliceable is used as a util class to be able
 * to preserve traits across splice calls, given an identity
 * provider.
 */
class TraitSpliceable<T> implements ISpliceable<T> {

	constructor(
		private trait: Trait<T>,
		private view: ListView<T>,
		private getId?: IIdentityProvider<T>
	) { }

	splice(start: number, deleteCount: number, elements: T[]): void {
		if (!this.getId) {
			return this.trait.splice(start, deleteCount, elements.map(e => false));
		}

		const pastElementsWithTrait = this.trait.get().map(i => this.getId(this.view.element(i)));
		const elementsWithTrait = elements.map(e => pastElementsWithTrait.indexOf(this.getId(e)) > -1);

		this.trait.splice(start, deleteCount, elementsWithTrait);
	}
}

class KeyboardController<T> implements IDisposable {

	private disposables: IDisposable[];

	constructor(
		private list: List<T>,
		private view: ListView<T>
	) {
		this.disposables = [];

		const onKeyDown = chain(domEvent(view.domNode, 'keydown'))
			.map(e => new StandardKeyboardEvent(e));

		onKeyDown.filter(e => e.keyCode === KeyCode.Enter).on(this.onEnter, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.UpArrow).on(this.onUpArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.DownArrow).on(this.onDownArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.PageUp).on(this.onPageUpArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.PageDown).on(this.onPageDownArrow, this, this.disposables);
	}

	private onEnter(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.setSelection(this.list.getFocus());
		this.list.open(this.list.getFocus());
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

function isSelectionSingleChangeEvent(event: IListMouseEvent<any>): boolean {
	return platform.isMacintosh ? event.metaKey : event.ctrlKey;
}

function isSelectionRangeChangeEvent(event: IListMouseEvent<any>): boolean {
	return event.shiftKey;
}

function isSelectionChangeEvent(event: IListMouseEvent<any>): boolean {
	return isSelectionSingleChangeEvent(event) || isSelectionRangeChangeEvent(event);
}

export interface IMouseControllerOptions {
	selectOnMouseDown?: boolean;
}

class MouseController<T> implements IDisposable {

	private disposables: IDisposable[];

	@memoize get onContextMenu(): Event<IListContextMenuEvent<T>> {
		const fromKeyboard = chain(domEvent(this.view.domNode, 'keydown'))
			.map(e => new StandardKeyboardEvent(e))
			.filter(e => this.list.getFocus().length > 0)
			.filter(e => e.keyCode === KeyCode.ContextMenu || (e.shiftKey && e.keyCode === KeyCode.F10))
			.map(e => {
				const index = this.list.getFocus()[0];
				const element = this.view.element(index);
				const anchor = this.view.domElement(index);
				return { index, element, anchor };
			})
			.filter(({ anchor }) => !!anchor)
			.event;

		const fromMouse = chain(fromCallback(handler => this.view.addListener('contextmenu', handler)))
			.map(({ element, index, clientX, clientY }) => ({ element, index, anchor: { x: clientX + 1, y: clientY } }))
			.event;

		return any<IListContextMenuEvent<T>>(fromKeyboard, fromMouse);
	}

	constructor(
		private list: List<T>,
		private view: ListView<T>,
		private options: IMouseControllerOptions = {}
	) {
		this.disposables = [];
		this.disposables.push(view.addListener('mousedown', e => this.onMouseDown(e)));
		this.disposables.push(view.addListener('click', e => this.onPointer(e)));
		this.disposables.push(view.addListener(TouchEventType.Tap, e => this.onPointer(e)));
	}

	private onMouseDown(e: IListMouseEvent<T>): void {
		e.preventDefault();
		e.stopPropagation();
		this.view.domNode.focus();

		let reference = this.list.getFocus()[0];
		reference = reference === undefined ? this.list.getSelection()[0] : reference;

		if (isSelectionRangeChangeEvent(e)) {
			return this.changeSelection(e, reference);
		}

		const focus = e.index;
		this.list.setFocus([focus]);

		if (isSelectionChangeEvent(e)) {
			return this.changeSelection(e, reference);
		}

		if (this.options.selectOnMouseDown) {
			this.list.setSelection([focus]);
			this.list.open([focus]);
		}
	}

	private onPointer(e: IListMouseEvent<T>): void {
		e.preventDefault();
		e.stopPropagation();

		if (isSelectionChangeEvent(e)) {
			return;
		}

		const focus = this.list.getFocus();
		this.list.setSelection(focus);
		this.list.open(focus);
	}

	private changeSelection(e: IListMouseEvent<T>, reference: number | undefined): void {
		const focus = e.index;

		if (isSelectionRangeChangeEvent(e) && reference !== undefined) {
			const min = Math.min(reference, focus);
			const max = Math.max(reference, focus);
			const rangeSelection = range(max + 1, min);
			const selection = this.list.getSelection();
			const contiguousRange = getContiguousRangeContaining(disjunction(selection, [reference]), reference);

			if (contiguousRange.length === 0) {
				return;
			}

			const newSelection = disjunction(rangeSelection, relativeComplement(selection, contiguousRange));
			this.list.setSelection(newSelection);

		} else if (isSelectionSingleChangeEvent(e)) {
			const selection = this.list.getSelection();
			const newSelection = selection.filter(i => i !== focus);

			if (selection.length === newSelection.length) {
				this.list.setSelection([...newSelection, focus]);
			} else {
				this.list.setSelection(newSelection);
			}
		}
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}

export interface IListOptions<T> extends IListViewOptions, IMouseControllerOptions {
	identityProvider?: IIdentityProvider<T>;
	ariaLabel?: string;
	mouseSupport?: boolean;
	keyboardSupport?: boolean;
}

const DefaultOptions: IListOptions<any> = {
	keyboardSupport: true,
	mouseSupport: true
};

// TODO@Joao: move these utils into a SortedArray class

function getContiguousRangeContaining(range: number[], value: number): number[] {
	const index = range.indexOf(value);

	if (index === -1) {
		return [];
	}

	const result = [];
	let i = index - 1;
	while (i >= 0 && range[i] === value - (index - i)) {
		result.push(range[i--]);
	}

	result.reverse();
	i = index;
	while (i < range.length && range[i] === value + (i - index)) {
		result.push(range[i++]);
	}

	return result;
}

/**
 * Given two sorted collections of numbers, returns the intersection
 * betweem them (OR).
 */
function disjunction(one: number[], other: number[]): number[] {
	const result = [];
	let i = 0, j = 0;

	while (i < one.length || j < other.length) {
		if (i >= one.length) {
			result.push(other[j++]);
		} else if (j >= other.length) {
			result.push(one[i++]);
		} else if (one[i] === other[j]) {
			result.push(one[i]);
			i++;
			j++;
			continue;
		} else if (one[i] < other[j]) {
			result.push(one[i++]);
		} else {
			result.push(other[j++]);
		}
	}

	return result;
}

/**
 * Given two sorted collections of numbers, returns the relative
 * complement between them (XOR).
 */
function relativeComplement(one: number[], other: number[]): number[] {
	const result = [];
	let i = 0, j = 0;

	while (i < one.length || j < other.length) {
		if (i >= one.length) {
			result.push(other[j++]);
		} else if (j >= other.length) {
			result.push(one[i++]);
		} else if (one[i] === other[j]) {
			i++;
			j++;
			continue;
		} else if (one[i] < other[j]) {
			result.push(one[i++]);
		} else {
			j++;
		}
	}

	return result;
}

const numericSort = (a: number, b: number) => a - b;

class PipelineRenderer<T> implements IRenderer<T, any> {

	constructor(
		private _templateId: string,
		private renderers: IRenderer<T, any>[]
	) { }

	get templateId(): string {
		return this._templateId;
	}

	renderTemplate(container: HTMLElement): any[] {
		return this.renderers.map(r => r.renderTemplate(container));
	}

	renderElement(element: T, index: number, templateData: any[]): void {
		this.renderers.forEach((r, i) => r.renderElement(element, index, templateData[i]));
	}

	disposeTemplate(templateData: any[]): void {
		this.renderers.forEach((r, i) => r.disposeTemplate(templateData[i]));
	}
}

export class List<T> implements ISpliceable<T>, IDisposable {

	private static InstanceCount = 0;
	private idPrefix = `list_id_${++List.InstanceCount}`;

	private focus: Trait<T>;
	private selection: Trait<T>;
	private eventBufferer: EventBufferer;
	private view: ListView<T>;
	private spliceable: ISpliceable<T>;
	private disposables: IDisposable[];

	@memoize get onFocusChange(): Event<IListEvent<T>> {
		return mapEvent(this.eventBufferer.wrapEvent(this.focus.onChange), e => this.toListEvent(e));
	}

	@memoize get onSelectionChange(): Event<IListEvent<T>> {
		return mapEvent(this.eventBufferer.wrapEvent(this.selection.onChange), e => this.toListEvent(e));
	}

	private _onContextMenu: Event<IListContextMenuEvent<T>> = createEmptyEvent();
	get onContextMenu(): Event<IListContextMenuEvent<T>> {
		return this._onContextMenu;
	}

	private _onOpen = new Emitter<number[]>();
	@memoize get onOpen(): Event<IListEvent<T>> {
		return mapEvent(this._onOpen.event, indexes => this.toListEvent({ indexes }));
	}

	private _onDOMFocus = new Emitter<void>();
	get onDOMFocus(): Event<void> { return this._onDOMFocus.event; }

	private _onDOMBlur = new Emitter<void>();
	get onDOMBlur(): Event<void> { return this._onDOMBlur.event; }

	private _onDispose = new Emitter<void>();
	get onDispose(): Event<void> { return this._onDispose.event; }

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[],
		options: IListOptions<T> = DefaultOptions
	) {
		this.focus = new FocusTrait(i => this.getElementDomId(i));
		this.selection = new Trait('selected');
		this.eventBufferer = new EventBufferer();

		renderers = renderers.map(r => new PipelineRenderer(r.templateId, [this.focus.renderer, this.selection.renderer, r]));

		this.view = new ListView(container, delegate, renderers, options);
		this.view.domNode.setAttribute('role', 'tree');
		this.view.domNode.tabIndex = 0;

		this.spliceable = new CombinedSpliceable([
			new TraitSpliceable(this.focus, this.view, options.identityProvider),
			new TraitSpliceable(this.selection, this.view, options.identityProvider),
			this.view
		]);

		this.disposables = [this.focus, this.selection, this.view, this._onDispose];

		const tracker = DOM.trackFocus(this.view.domNode);
		this.disposables.push(tracker.addFocusListener(() => this._onDOMFocus.fire()));
		this.disposables.push(tracker.addBlurListener(() => this._onDOMBlur.fire()));

		if (typeof options.keyboardSupport !== 'boolean' || options.keyboardSupport) {
			const controller = new KeyboardController(this, this.view);
			this.disposables.push(controller);
		}

		if (typeof options.mouseSupport !== 'boolean' || options.mouseSupport) {
			const controller = new MouseController(this, this.view, options);
			this.disposables.push(controller);
			this._onContextMenu = controller.onContextMenu;
		}

		this.onFocusChange(this._onFocusChange, this, this.disposables);
		this.onSelectionChange(this._onSelectionChange, this, this.disposables);

		if (options.ariaLabel) {
			this.view.domNode.setAttribute('aria-label', options.ariaLabel);
		}
	}

	splice(start: number, deleteCount: number, elements: T[] = []): void {
		this.eventBufferer.bufferEvents(() => this.spliceable.splice(start, deleteCount, elements));
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
		indexes = indexes.sort(numericSort);
		this.selection.set(indexes);
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

	getSelectedElements(): T[] {
		return this.getSelection().map(i => this.view.element(i));
	}

	setFocus(indexes: number[]): void {
		indexes = indexes.sort(numericSort);
		this.focus.set(indexes);
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

	private getElementDomId(index: number): string {
		return `${this.idPrefix}_${index}`;
	}

	isDOMFocused(): boolean {
		return this.view.domNode === document.activeElement;
	}

	getHTMLElement(): HTMLElement {
		return this.view.domNode;
	}

	open(indexes: number[]): void {
		this._onOpen.fire(indexes);
	}

	private toListEvent({ indexes }: ITraitChangeEvent) {
		return { indexes, elements: indexes.map(i => this.view.element(i)) };
	}

	private _onFocusChange(): void {
		const focus = this.focus.get();

		if (focus.length > 0) {
			this.view.domNode.setAttribute('aria-activedescendant', this.getElementDomId(focus[0]));
		} else {
			this.view.domNode.removeAttribute('aria-activedescendant');
		}

		this.view.domNode.setAttribute('role', 'tree');
		DOM.toggleClass(this.view.domNode, 'element-focused', focus.length > 0);
	}

	private _onSelectionChange(): void {
		const selection = this.selection.get();

		DOM.toggleClass(this.view.domNode, 'selection-none', selection.length === 0);
		DOM.toggleClass(this.view.domNode, 'selection-single', selection.length === 1);
		DOM.toggleClass(this.view.domNode, 'selection-multiple', selection.length > 1);
	}

	dispose(): void {
		this._onDispose.fire();
		this.disposables = dispose(this.disposables);
	}
}
