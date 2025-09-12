/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from '../../dnd.js';
import { Dimension, EventHelper, getActiveElement, getWindow, isActiveElement, isEditableElement, isHTMLElement, isMouseEvent } from '../../dom.js';
import { createStyleSheet } from '../../domStylesheets.js';
import { asCssValueWithDefault } from '../../cssValue.js';
import { DomEmitter } from '../../event.js';
import { IKeyboardEvent, StandardKeyboardEvent } from '../../keyboardEvent.js';
import { Gesture } from '../../touch.js';
import { alert, AriaRole } from '../aria/aria.js';
import { CombinedSpliceable } from './splice.js';
import { ScrollableElementChangeOptions } from '../scrollbar/scrollableElementOptions.js';
import { binarySearch, range } from '../../../common/arrays.js';
import { timeout } from '../../../common/async.js';
import { Color } from '../../../common/color.js';
import { memoize } from '../../../common/decorators.js';
import { Emitter, Event, EventBufferer } from '../../../common/event.js';
import { matchesFuzzy2, matchesPrefix } from '../../../common/filters.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { DisposableStore, dispose, IDisposable } from '../../../common/lifecycle.js';
import { clamp } from '../../../common/numbers.js';
import * as platform from '../../../common/platform.js';
import { ScrollbarVisibility, ScrollEvent } from '../../../common/scrollable.js';
import { ISpliceable } from '../../../common/sequence.js';
import { isNumber } from '../../../common/types.js';
import './list.css';
import { IIdentityProvider, IKeyboardNavigationDelegate, IKeyboardNavigationLabelProvider, IListContextMenuEvent, IListDragAndDrop, IListDragOverReaction, IListEvent, IListGestureEvent, IListMouseEvent, IListElementRenderDetails, IListRenderer, IListTouchEvent, IListVirtualDelegate, ListError } from './list.js';
import { IListView, IListViewAccessibilityProvider, IListViewDragAndDrop, IListViewOptions, IListViewOptionsUpdate, ListViewTargetSector, ListView } from './listView.js';
import { IMouseWheelEvent, StandardMouseEvent } from '../../mouseEvent.js';
import { autorun, constObservable, IObservable } from '../../../common/observable.js';

interface ITraitChangeEvent {
	indexes: number[];
	browserEvent?: UIEvent;
}

type ITraitTemplateData = HTMLElement;

type IAccessibilityTemplateData = {
	container: HTMLElement;
	disposables: DisposableStore;
};

interface IRenderedContainer {
	templateData: ITraitTemplateData;
	index: number;
}

class TraitRenderer<T> implements IListRenderer<T, ITraitTemplateData> {
	private renderedElements: IRenderedContainer[] = [];

	constructor(private trait: Trait<T>) { }

	get templateId(): string {
		return `template:${this.trait.name}`;
	}

	renderTemplate(container: HTMLElement): ITraitTemplateData {
		return container;
	}

	renderElement(element: T, index: number, templateData: ITraitTemplateData): void {
		const renderedElementIndex = this.renderedElements.findIndex(el => el.templateData === templateData);

		if (renderedElementIndex >= 0) {
			const rendered = this.renderedElements[renderedElementIndex];
			this.trait.unrender(templateData);
			rendered.index = index;
		} else {
			const rendered = { index, templateData };
			this.renderedElements.push(rendered);
		}

		this.trait.renderIndex(index, templateData);
	}

	splice(start: number, deleteCount: number, insertCount: number): void {
		const rendered: IRenderedContainer[] = [];

		for (const renderedElement of this.renderedElements) {

			if (renderedElement.index < start) {
				rendered.push(renderedElement);
			} else if (renderedElement.index >= start + deleteCount) {
				rendered.push({
					index: renderedElement.index + insertCount - deleteCount,
					templateData: renderedElement.templateData
				});
			}
		}

		this.renderedElements = rendered;
	}

	renderIndexes(indexes: number[]): void {
		for (const { index, templateData } of this.renderedElements) {
			if (indexes.indexOf(index) > -1) {
				this.trait.renderIndex(index, templateData);
			}
		}
	}

	disposeTemplate(templateData: ITraitTemplateData): void {
		const index = this.renderedElements.findIndex(el => el.templateData === templateData);

		if (index < 0) {
			return;
		}

		this.renderedElements.splice(index, 1);
	}
}

class Trait<T> implements ISpliceable<boolean>, IDisposable {

	protected indexes: number[] = [];
	protected sortedIndexes: number[] = [];

	private readonly _onChange = new Emitter<ITraitChangeEvent>();
	get onChange(): Event<ITraitChangeEvent> { return this._onChange.event; }

	get name(): string { return this._trait; }

	@memoize
	get renderer(): TraitRenderer<T> {
		return new TraitRenderer<T>(this);
	}

	constructor(private _trait: string) { }

	splice(start: number, deleteCount: number, elements: boolean[]): void {
		const diff = elements.length - deleteCount;
		const end = start + deleteCount;
		const sortedIndexes: number[] = [];
		let i = 0;

		while (i < this.sortedIndexes.length && this.sortedIndexes[i] < start) {
			sortedIndexes.push(this.sortedIndexes[i++]);
		}

		for (let j = 0; j < elements.length; j++) {
			if (elements[j]) {
				sortedIndexes.push(j + start);
			}
		}

		while (i < this.sortedIndexes.length && this.sortedIndexes[i] >= end) {
			sortedIndexes.push(this.sortedIndexes[i++] + diff);
		}

		this.renderer.splice(start, deleteCount, elements.length);
		this._set(sortedIndexes, sortedIndexes);
	}

	renderIndex(index: number, container: HTMLElement): void {
		container.classList.toggle(this._trait, this.contains(index));
	}

	unrender(container: HTMLElement): void {
		container.classList.remove(this._trait);
	}

	/**
	 * Sets the indexes which should have this trait.
	 *
	 * @param indexes Indexes which should have this trait.
	 * @return The old indexes which had this trait.
	 */
	set(indexes: number[], browserEvent?: UIEvent): number[] {
		return this._set(indexes, [...indexes].sort(numericSort), browserEvent);
	}

	private _set(indexes: number[], sortedIndexes: number[], browserEvent?: UIEvent): number[] {
		const result = this.indexes;
		const sortedResult = this.sortedIndexes;

		this.indexes = indexes;
		this.sortedIndexes = sortedIndexes;

		const toRender = disjunction(sortedResult, indexes);
		this.renderer.renderIndexes(toRender);

		this._onChange.fire({ indexes, browserEvent });
		return result;
	}

	get(): number[] {
		return this.indexes;
	}

	contains(index: number): boolean {
		return binarySearch(this.sortedIndexes, index, numericSort) >= 0;
	}

	dispose() {
		dispose(this._onChange);
	}
}

class SelectionTrait<T> extends Trait<T> {

	constructor(private setAriaSelected: boolean) {
		super('selected');
	}

	override renderIndex(index: number, container: HTMLElement): void {
		super.renderIndex(index, container);

		if (this.setAriaSelected) {
			if (this.contains(index)) {
				container.setAttribute('aria-selected', 'true');
			} else {
				container.setAttribute('aria-selected', 'false');
			}
		}
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
		private view: IListView<T>,
		private identityProvider?: IIdentityProvider<T>
	) { }

	splice(start: number, deleteCount: number, elements: T[]): void {
		if (!this.identityProvider) {
			return this.trait.splice(start, deleteCount, new Array(elements.length).fill(false));
		}

		const pastElementsWithTrait = this.trait.get().map(i => this.identityProvider!.getId(this.view.element(i)).toString());
		if (pastElementsWithTrait.length === 0) {
			return this.trait.splice(start, deleteCount, new Array(elements.length).fill(false));
		}

		const pastElementsWithTraitSet = new Set(pastElementsWithTrait);
		const elementsWithTrait = elements.map(e => pastElementsWithTraitSet.has(this.identityProvider!.getId(e).toString()));
		this.trait.splice(start, deleteCount, elementsWithTrait);
	}
}

function isListElementDescendantOfClass(e: HTMLElement, className: string): boolean {
	if (e.classList.contains(className)) {
		return true;
	}

	if (e.classList.contains('monaco-list')) {
		return false;
	}

	if (!e.parentElement) {
		return false;
	}

	return isListElementDescendantOfClass(e.parentElement, className);
}

export function isMonacoEditor(e: HTMLElement): boolean {
	return isListElementDescendantOfClass(e, 'monaco-editor');
}

export function isMonacoCustomToggle(e: HTMLElement): boolean {
	return isListElementDescendantOfClass(e, 'monaco-custom-toggle');
}

export function isActionItem(e: HTMLElement): boolean {
	return isListElementDescendantOfClass(e, 'action-item');
}

export function isMonacoTwistie(e: HTMLElement): boolean {
	return isListElementDescendantOfClass(e, 'monaco-tl-twistie');
}

export function isStickyScrollElement(e: HTMLElement): boolean {
	return isListElementDescendantOfClass(e, 'monaco-tree-sticky-row');
}

export function isStickyScrollContainer(e: HTMLElement): boolean {
	return e.classList.contains('monaco-tree-sticky-container');
}

export function isButton(e: HTMLElement): boolean {
	if ((e.tagName === 'A' && e.classList.contains('monaco-button')) ||
		(e.tagName === 'DIV' && e.classList.contains('monaco-button-dropdown'))) {
		return true;
	}

	if (e.classList.contains('monaco-list')) {
		return false;
	}

	if (!e.parentElement) {
		return false;
	}

	return isButton(e.parentElement);
}

class KeyboardController<T> implements IDisposable {

	private readonly disposables = new DisposableStore();
	private readonly multipleSelectionDisposables = new DisposableStore();
	private multipleSelectionSupport: boolean | undefined;

	@memoize
	private get onKeyDown(): Event<StandardKeyboardEvent> {
		return Event.chain(
			this.disposables.add(new DomEmitter(this.view.domNode, 'keydown')).event, $ =>
			$.filter(e => !isEditableElement(e.target as HTMLElement))
				.map(e => new StandardKeyboardEvent(e))
		);
	}

	constructor(
		private list: List<T>,
		private view: IListView<T>,
		options: IListOptions<T>
	) {
		this.multipleSelectionSupport = options.multipleSelectionSupport;
		this.disposables.add(this.onKeyDown(e => {
			switch (e.keyCode) {
				case KeyCode.Enter:
					return this.onEnter(e);
				case KeyCode.UpArrow:
					return this.onUpArrow(e);
				case KeyCode.DownArrow:
					return this.onDownArrow(e);
				case KeyCode.PageUp:
					return this.onPageUpArrow(e);
				case KeyCode.PageDown:
					return this.onPageDownArrow(e);
				case KeyCode.Escape:
					return this.onEscape(e);
				case KeyCode.KeyA:
					if (this.multipleSelectionSupport && (platform.isMacintosh ? e.metaKey : e.ctrlKey)) {
						this.onCtrlA(e);
					}
			}
		}));
	}

	updateOptions(optionsUpdate: IListOptionsUpdate): void {
		if (optionsUpdate.multipleSelectionSupport !== undefined) {
			this.multipleSelectionSupport = optionsUpdate.multipleSelectionSupport;
		}
	}

	private onEnter(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.setSelection(this.list.getFocus(), e.browserEvent);
	}

	private onUpArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.focusPrevious(1, false, e.browserEvent);
		const el = this.list.getFocus()[0];
		this.list.setAnchor(el);
		this.list.reveal(el);
		this.view.domNode.focus();
	}

	private onDownArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.focusNext(1, false, e.browserEvent);
		const el = this.list.getFocus()[0];
		this.list.setAnchor(el);
		this.list.reveal(el);
		this.view.domNode.focus();
	}

	private onPageUpArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.focusPreviousPage(e.browserEvent);
		const el = this.list.getFocus()[0];
		this.list.setAnchor(el);
		this.list.reveal(el);
		this.view.domNode.focus();
	}

	private onPageDownArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.focusNextPage(e.browserEvent);
		const el = this.list.getFocus()[0];
		this.list.setAnchor(el);
		this.list.reveal(el);
		this.view.domNode.focus();
	}

	private onCtrlA(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.list.setSelection(range(this.list.length), e.browserEvent);
		this.list.setAnchor(undefined);
		this.view.domNode.focus();
	}

	private onEscape(e: StandardKeyboardEvent): void {
		if (this.list.getSelection().length) {
			e.preventDefault();
			e.stopPropagation();
			this.list.setSelection([], e.browserEvent);
			this.list.setAnchor(undefined);
			this.view.domNode.focus();
		}
	}

	dispose() {
		this.disposables.dispose();
		this.multipleSelectionDisposables.dispose();
	}
}

export enum TypeNavigationMode {
	Automatic,
	Trigger
}

enum TypeNavigationControllerState {
	Idle,
	Typing
}

export const DefaultKeyboardNavigationDelegate = new class implements IKeyboardNavigationDelegate {
	mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
		if (event.ctrlKey || event.metaKey || event.altKey) {
			return false;
		}

		return (event.keyCode >= KeyCode.KeyA && event.keyCode <= KeyCode.KeyZ)
			|| (event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9)
			|| (event.keyCode >= KeyCode.Numpad0 && event.keyCode <= KeyCode.Numpad9)
			|| (event.keyCode >= KeyCode.Semicolon && event.keyCode <= KeyCode.Quote);
	}
};

class TypeNavigationController<T> implements IDisposable {

	private enabled = false;
	private state: TypeNavigationControllerState = TypeNavigationControllerState.Idle;

	private mode = TypeNavigationMode.Automatic;
	private triggered = false;
	private previouslyFocused = -1;

	private readonly enabledDisposables = new DisposableStore();
	private readonly disposables = new DisposableStore();

	constructor(
		private list: List<T>,
		private view: IListView<T>,
		private keyboardNavigationLabelProvider: IKeyboardNavigationLabelProvider<T>,
		private keyboardNavigationEventFilter: IKeyboardNavigationEventFilter,
		private delegate: IKeyboardNavigationDelegate
	) {
		this.updateOptions(list.options);
	}

	updateOptions(options: IListOptions<T>): void {
		if (options.typeNavigationEnabled ?? true) {
			this.enable();
		} else {
			this.disable();
		}

		this.mode = options.typeNavigationMode ?? TypeNavigationMode.Automatic;
	}

	trigger(): void {
		this.triggered = !this.triggered;
	}

	private enable(): void {
		if (this.enabled) {
			return;
		}

		let typing = false;

		const onChar = Event.chain(this.enabledDisposables.add(new DomEmitter(this.view.domNode, 'keydown')).event, $ =>
			$.filter(e => !isEditableElement(e.target as HTMLElement))
				.filter(() => this.mode === TypeNavigationMode.Automatic || this.triggered)
				.map(event => new StandardKeyboardEvent(event))
				.filter(e => typing || this.keyboardNavigationEventFilter(e))
				.filter(e => this.delegate.mightProducePrintableCharacter(e))
				.forEach(e => EventHelper.stop(e, true))
				.map(event => event.browserEvent.key)
		);

		const onClear = Event.debounce<string, null>(onChar, () => null, 800, undefined, undefined, undefined, this.enabledDisposables);
		const onInput = Event.reduce<string | null, string | null>(Event.any(onChar, onClear), (r, i) => i === null ? null : ((r || '') + i), undefined, this.enabledDisposables);

		onInput(this.onInput, this, this.enabledDisposables);
		onClear(this.onClear, this, this.enabledDisposables);

		onChar(() => typing = true, undefined, this.enabledDisposables);
		onClear(() => typing = false, undefined, this.enabledDisposables);

		this.enabled = true;
		this.triggered = false;
	}

	private disable(): void {
		if (!this.enabled) {
			return;
		}

		this.enabledDisposables.clear();
		this.enabled = false;
		this.triggered = false;
	}

	private onClear(): void {
		const focus = this.list.getFocus();
		if (focus.length > 0 && focus[0] === this.previouslyFocused) {
			// List: re-announce element on typing end since typed keys will interrupt aria label of focused element
			// Do not announce if there was a focus change at the end to prevent duplication https://github.com/microsoft/vscode/issues/95961
			const ariaLabel = this.list.options.accessibilityProvider?.getAriaLabel(this.list.element(focus[0]));

			if (typeof ariaLabel === 'string') {
				alert(ariaLabel);
			} else if (ariaLabel) {
				alert(ariaLabel.get());
			}
		}
		this.previouslyFocused = -1;
	}

	private onInput(word: string | null): void {
		if (!word) {
			this.state = TypeNavigationControllerState.Idle;
			this.triggered = false;
			return;
		}

		const focus = this.list.getFocus();
		const start = focus.length > 0 ? focus[0] : 0;
		const delta = this.state === TypeNavigationControllerState.Idle ? 1 : 0;
		this.state = TypeNavigationControllerState.Typing;

		for (let i = 0; i < this.list.length; i++) {
			const index = (start + i + delta) % this.list.length;
			const label = this.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(this.view.element(index));
			const labelStr = label && label.toString();

			if (this.list.options.typeNavigationEnabled) {
				if (typeof labelStr !== 'undefined') {

					// If prefix is found, focus and return early
					if (matchesPrefix(word, labelStr)) {
						this.previouslyFocused = start;
						this.list.setFocus([index]);
						this.list.reveal(index);
						return;
					}

					const fuzzy = matchesFuzzy2(word, labelStr);

					if (fuzzy) {
						const fuzzyScore = fuzzy[0].end - fuzzy[0].start;
						// ensures that when fuzzy matching, doesn't clash with prefix matching (1 input vs 1+ should be prefix and fuzzy respecitvely). Also makes sure that exact matches are prioritized.
						if (fuzzyScore > 1 && fuzzy.length === 1) {
							this.previouslyFocused = start;
							this.list.setFocus([index]);
							this.list.reveal(index);
							return;
						}
					}
				}
			} else if (typeof labelStr === 'undefined' || matchesPrefix(word, labelStr)) {
				this.previouslyFocused = start;
				this.list.setFocus([index]);
				this.list.reveal(index);
				return;
			}
		}
	}

	dispose() {
		this.disable();
		this.enabledDisposables.dispose();
		this.disposables.dispose();
	}
}

class DOMFocusController<T> implements IDisposable {

	private readonly disposables = new DisposableStore();

	constructor(
		private list: List<T>,
		private view: IListView<T>
	) {
		const onKeyDown = Event.chain(this.disposables.add(new DomEmitter(view.domNode, 'keydown')).event, $ => $
			.filter(e => !isEditableElement(e.target as HTMLElement))
			.map(e => new StandardKeyboardEvent(e))
		);

		const onTab = Event.chain(onKeyDown, $ => $.filter(e => e.keyCode === KeyCode.Tab && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey));

		onTab(this.onTab, this, this.disposables);
	}

	private onTab(e: StandardKeyboardEvent): void {
		if (e.target !== this.view.domNode) {
			return;
		}

		const focus = this.list.getFocus();

		if (focus.length === 0) {
			return;
		}

		const focusedDomElement = this.view.domElement(focus[0]);

		if (!focusedDomElement) {
			return;
		}

		const tabIndexElement = focusedDomElement.querySelector('[tabIndex]');

		if (!tabIndexElement || !(isHTMLElement(tabIndexElement)) || tabIndexElement.tabIndex === -1) {
			return;
		}

		const style = getWindow(tabIndexElement).getComputedStyle(tabIndexElement);
		if (style.visibility === 'hidden' || style.display === 'none') {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		tabIndexElement.focus();
	}

	dispose() {
		this.disposables.dispose();
	}
}

export function isSelectionSingleChangeEvent(event: IListMouseEvent<any> | IListTouchEvent<any>): boolean {
	return platform.isMacintosh ? event.browserEvent.metaKey : event.browserEvent.ctrlKey;
}

export function isSelectionRangeChangeEvent(event: IListMouseEvent<any> | IListTouchEvent<any>): boolean {
	return event.browserEvent.shiftKey;
}

function isMouseRightClick(event: UIEvent): boolean {
	return isMouseEvent(event) && event.button === 2;
}

const DefaultMultipleSelectionController = {
	isSelectionSingleChangeEvent,
	isSelectionRangeChangeEvent
};

export class MouseController<T> implements IDisposable {

	private multipleSelectionController: IMultipleSelectionController<T> | undefined;
	private readonly mouseSupport: boolean;
	private readonly disposables = new DisposableStore();

	private readonly _onPointer = this.disposables.add(new Emitter<IListMouseEvent<T>>());
	get onPointer() { return this._onPointer.event; }

	constructor(protected list: List<T>) {
		if (list.options.multipleSelectionSupport !== false) {
			this.multipleSelectionController = this.list.options.multipleSelectionController || DefaultMultipleSelectionController;
		}

		this.mouseSupport = typeof list.options.mouseSupport === 'undefined' || !!list.options.mouseSupport;

		if (this.mouseSupport) {
			list.onMouseDown(this.onMouseDown, this, this.disposables);
			list.onContextMenu(this.onContextMenu, this, this.disposables);
			list.onMouseDblClick(this.onDoubleClick, this, this.disposables);
			list.onTouchStart(this.onMouseDown, this, this.disposables);
			this.disposables.add(Gesture.addTarget(list.getHTMLElement()));
		}

		Event.any<IListMouseEvent<any> | IListGestureEvent<any>>(list.onMouseClick, list.onMouseMiddleClick, list.onTap)(this.onViewPointer, this, this.disposables);
	}

	updateOptions(optionsUpdate: IListOptionsUpdate): void {
		if (optionsUpdate.multipleSelectionSupport !== undefined) {
			this.multipleSelectionController = undefined;

			if (optionsUpdate.multipleSelectionSupport) {
				this.multipleSelectionController = this.list.options.multipleSelectionController || DefaultMultipleSelectionController;
			}
		}
	}

	protected isSelectionSingleChangeEvent(event: IListMouseEvent<any> | IListTouchEvent<any>): boolean {
		if (!this.multipleSelectionController) {
			return false;
		}

		return this.multipleSelectionController.isSelectionSingleChangeEvent(event);
	}

	protected isSelectionRangeChangeEvent(event: IListMouseEvent<any> | IListTouchEvent<any>): boolean {
		if (!this.multipleSelectionController) {
			return false;
		}

		return this.multipleSelectionController.isSelectionRangeChangeEvent(event);
	}

	private isSelectionChangeEvent(event: IListMouseEvent<any> | IListTouchEvent<any>): boolean {
		return this.isSelectionSingleChangeEvent(event) || this.isSelectionRangeChangeEvent(event);
	}

	protected onMouseDown(e: IListMouseEvent<T> | IListTouchEvent<T>): void {
		if (isMonacoEditor(e.browserEvent.target as HTMLElement)) {
			return;
		}

		if (getActiveElement() !== e.browserEvent.target) {
			this.list.domFocus();
		}
	}

	protected onContextMenu(e: IListContextMenuEvent<T>): void {
		if (isEditableElement(e.browserEvent.target as HTMLElement) || isMonacoEditor(e.browserEvent.target as HTMLElement)) {
			return;
		}

		const focus = typeof e.index === 'undefined' ? [] : [e.index];
		this.list.setFocus(focus, e.browserEvent);
	}

	protected onViewPointer(e: IListMouseEvent<T>): void {
		if (!this.mouseSupport) {
			return;
		}

		if (isEditableElement(e.browserEvent.target as HTMLElement) || isMonacoEditor(e.browserEvent.target as HTMLElement)) {
			return;
		}

		if (e.browserEvent.isHandledByList) {
			return;
		}

		e.browserEvent.isHandledByList = true;
		const focus = e.index;

		if (typeof focus === 'undefined') {
			this.list.setFocus([], e.browserEvent);
			this.list.setSelection([], e.browserEvent);
			this.list.setAnchor(undefined);
			return;
		}

		if (this.isSelectionChangeEvent(e)) {
			return this.changeSelection(e);
		}

		this.list.setFocus([focus], e.browserEvent);
		this.list.setAnchor(focus);

		if (!isMouseRightClick(e.browserEvent)) {
			this.list.setSelection([focus], e.browserEvent);
		}

		this._onPointer.fire(e);
	}

	protected onDoubleClick(e: IListMouseEvent<T>): void {
		if (isEditableElement(e.browserEvent.target as HTMLElement) || isMonacoEditor(e.browserEvent.target as HTMLElement)) {
			return;
		}

		if (this.isSelectionChangeEvent(e)) {
			return;
		}

		if (e.browserEvent.isHandledByList) {
			return;
		}

		e.browserEvent.isHandledByList = true;
		const focus = this.list.getFocus();
		this.list.setSelection(focus, e.browserEvent);
	}

	private changeSelection(e: IListMouseEvent<T> | IListTouchEvent<T>): void {
		const focus = e.index!;
		let anchor = this.list.getAnchor();

		if (this.isSelectionRangeChangeEvent(e)) {
			if (typeof anchor === 'undefined') {
				const currentFocus = this.list.getFocus()[0];
				anchor = currentFocus ?? focus;
				this.list.setAnchor(anchor);
			}

			const min = Math.min(anchor, focus);
			const max = Math.max(anchor, focus);
			const rangeSelection = range(min, max + 1);
			const selection = this.list.getSelection();
			const contiguousRange = getContiguousRangeContaining(disjunction(selection, [anchor]), anchor);

			if (contiguousRange.length === 0) {
				return;
			}

			const newSelection = disjunction(rangeSelection, relativeComplement(selection, contiguousRange));
			this.list.setSelection(newSelection, e.browserEvent);
			this.list.setFocus([focus], e.browserEvent);

		} else if (this.isSelectionSingleChangeEvent(e)) {
			const selection = this.list.getSelection();
			const newSelection = selection.filter(i => i !== focus);

			this.list.setFocus([focus]);
			this.list.setAnchor(focus);

			if (selection.length === newSelection.length) {
				this.list.setSelection([...newSelection, focus], e.browserEvent);
			} else {
				this.list.setSelection(newSelection, e.browserEvent);
			}
		}
	}

	dispose() {
		this.disposables.dispose();
	}
}

export interface IMultipleSelectionController<T> {
	isSelectionSingleChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean;
	isSelectionRangeChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean;
}

export interface IStyleController {
	style(styles: IListStyles): void;
}

export interface IListAccessibilityProvider<T> extends IListViewAccessibilityProvider<T> {
	getAriaLabel(element: T): string | IObservable<string> | null;
	getWidgetAriaLabel(): string | IObservable<string>;
	getWidgetRole?(): AriaRole;
	getAriaLevel?(element: T): number | undefined;
	onDidChangeActiveDescendant?: Event<void>;
	getActiveDescendantId?(element: T): string | undefined;
}

export class DefaultStyleController implements IStyleController {

	constructor(private styleElement: HTMLStyleElement, private selectorSuffix: string) { }

	style(styles: IListStyles): void {
		const suffix = this.selectorSuffix && `.${this.selectorSuffix}`;
		const content: string[] = [];

		if (styles.listBackground) {
			content.push(`.monaco-list${suffix} .monaco-list-rows { background: ${styles.listBackground}; }`);
		}

		if (styles.listFocusBackground) {
			content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
			content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listFocusForeground) {
			content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
		}

		if (styles.listActiveSelectionBackground) {
			content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
			content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listActiveSelectionForeground) {
			content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
		}

		if (styles.listActiveSelectionIconForeground) {
			content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected .codicon { color: ${styles.listActiveSelectionIconForeground}; }`);
		}

		if (styles.listFocusAndSelectionBackground) {
			content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.selected.focused { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
		}

		if (styles.listFocusAndSelectionForeground) {
			content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.selected.focused { color: ${styles.listFocusAndSelectionForeground}; }
			`);
		}

		if (styles.listInactiveFocusForeground) {
			content.push(`.monaco-list${suffix} .monaco-list-row.focused { color:  ${styles.listInactiveFocusForeground}; }`);
			content.push(`.monaco-list${suffix} .monaco-list-row.focused:hover { color:  ${styles.listInactiveFocusForeground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listInactiveSelectionIconForeground) {
			content.push(`.monaco-list${suffix} .monaco-list-row.focused .codicon { color:  ${styles.listInactiveSelectionIconForeground}; }`);
		}

		if (styles.listInactiveFocusBackground) {
			content.push(`.monaco-list${suffix} .monaco-list-row.focused { background-color:  ${styles.listInactiveFocusBackground}; }`);
			content.push(`.monaco-list${suffix} .monaco-list-row.focused:hover { background-color:  ${styles.listInactiveFocusBackground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listInactiveSelectionBackground) {
			content.push(`.monaco-list${suffix} .monaco-list-row.selected { background-color:  ${styles.listInactiveSelectionBackground}; }`);
			content.push(`.monaco-list${suffix} .monaco-list-row.selected:hover { background-color:  ${styles.listInactiveSelectionBackground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listInactiveSelectionForeground) {
			content.push(`.monaco-list${suffix} .monaco-list-row.selected { color: ${styles.listInactiveSelectionForeground}; }`);
		}

		if (styles.listHoverBackground) {
			content.push(`.monaco-list${suffix}:not(.drop-target):not(.dragging) .monaco-list-row:hover:not(.selected):not(.focused) { background-color: ${styles.listHoverBackground}; }`);
		}

		if (styles.listHoverForeground) {
			content.push(`.monaco-list${suffix}:not(.drop-target):not(.dragging) .monaco-list-row:hover:not(.selected):not(.focused) { color:  ${styles.listHoverForeground}; }`);
		}

		/**
		 * Outlines
		 */
		const focusAndSelectionOutline = asCssValueWithDefault(styles.listFocusAndSelectionOutline, asCssValueWithDefault(styles.listSelectionOutline, styles.listFocusOutline ?? ''));
		if (focusAndSelectionOutline) { // default: listFocusOutline
			content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused.selected { outline: 1px solid ${focusAndSelectionOutline}; outline-offset: -1px;}`);
		}

		if (styles.listFocusOutline) { // default: set
			content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.focused,
				.monaco-workbench.context-menu-visible .monaco-list${suffix}.last-focused .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }
			`);
		}

		const inactiveFocusAndSelectionOutline = asCssValueWithDefault(styles.listSelectionOutline, styles.listInactiveFocusOutline ?? '');
		if (inactiveFocusAndSelectionOutline) {
			content.push(`.monaco-list${suffix} .monaco-list-row.focused.selected { outline: 1px dotted ${inactiveFocusAndSelectionOutline}; outline-offset: -1px; }`);
		}

		if (styles.listSelectionOutline) { // default: activeContrastBorder
			content.push(`.monaco-list${suffix} .monaco-list-row.selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
		}

		if (styles.listInactiveFocusOutline) { // default: null
			content.push(`.monaco-list${suffix} .monaco-list-row.focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
		}

		if (styles.listHoverOutline) {  // default: activeContrastBorder
			content.push(`.monaco-list${suffix} .monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
		}

		if (styles.listDropOverBackground) {
			content.push(`
				.monaco-list${suffix}.drop-target,
				.monaco-list${suffix} .monaco-list-rows.drop-target,
				.monaco-list${suffix} .monaco-list-row.drop-target { background-color: ${styles.listDropOverBackground} !important; color: inherit !important; }
			`);
		}

		if (styles.listDropBetweenBackground) {
			content.push(`
			.monaco-list${suffix} .monaco-list-rows.drop-target-before .monaco-list-row:first-child::before,
			.monaco-list${suffix} .monaco-list-row.drop-target-before::before {
				content: ""; position: absolute; top: 0px; left: 0px; width: 100%; height: 1px;
				background-color: ${styles.listDropBetweenBackground};
			}`);
			content.push(`
			.monaco-list${suffix} .monaco-list-rows.drop-target-after .monaco-list-row:last-child::after,
			.monaco-list${suffix} .monaco-list-row.drop-target-after::after {
				content: ""; position: absolute; bottom: 0px; left: 0px; width: 100%; height: 1px;
				background-color: ${styles.listDropBetweenBackground};
			}`);
		}

		if (styles.tableColumnsBorder) {
			content.push(`
				.monaco-table > .monaco-split-view2,
				.monaco-table > .monaco-split-view2 .monaco-sash.vertical::before,
				.monaco-workbench:not(.reduce-motion) .monaco-table:hover > .monaco-split-view2,
				.monaco-workbench:not(.reduce-motion) .monaco-table:hover > .monaco-split-view2 .monaco-sash.vertical::before {
					border-color: ${styles.tableColumnsBorder};
				}

				.monaco-workbench:not(.reduce-motion) .monaco-table > .monaco-split-view2,
				.monaco-workbench:not(.reduce-motion) .monaco-table > .monaco-split-view2 .monaco-sash.vertical::before {
					border-color: transparent;
				}
			`);
		}

		if (styles.tableOddRowsBackgroundColor) {
			content.push(`
				.monaco-table .monaco-list-row[data-parity=odd]:not(.focused):not(.selected):not(:hover) .monaco-table-tr,
				.monaco-table .monaco-list:not(:focus) .monaco-list-row[data-parity=odd].focused:not(.selected):not(:hover) .monaco-table-tr,
				.monaco-table .monaco-list:not(.focused) .monaco-list-row[data-parity=odd].focused:not(.selected):not(:hover) .monaco-table-tr {
					background-color: ${styles.tableOddRowsBackgroundColor};
				}
			`);
		}

		this.styleElement.textContent = content.join('\n');
	}
}

export interface IKeyboardNavigationEventFilter {
	(e: StandardKeyboardEvent): boolean;
}

export interface IListOptionsUpdate extends IListViewOptionsUpdate {
	readonly typeNavigationEnabled?: boolean;
	readonly typeNavigationMode?: TypeNavigationMode;
	readonly multipleSelectionSupport?: boolean;
}

export interface IListOptions<T> extends IListOptionsUpdate {
	readonly identityProvider?: IIdentityProvider<T>;
	readonly dnd?: IListDragAndDrop<T>;
	readonly keyboardNavigationLabelProvider?: IKeyboardNavigationLabelProvider<T>;
	readonly keyboardNavigationDelegate?: IKeyboardNavigationDelegate;
	readonly keyboardSupport?: boolean;
	readonly multipleSelectionController?: IMultipleSelectionController<T>;
	readonly styleController?: (suffix: string) => IStyleController;
	readonly accessibilityProvider?: IListAccessibilityProvider<T>;
	readonly keyboardNavigationEventFilter?: IKeyboardNavigationEventFilter;

	// list view options
	readonly useShadows?: boolean;
	readonly verticalScrollMode?: ScrollbarVisibility;
	readonly setRowLineHeight?: boolean;
	readonly setRowHeight?: boolean;
	readonly supportDynamicHeights?: boolean;
	readonly mouseSupport?: boolean;
	readonly userSelection?: boolean;
	readonly horizontalScrolling?: boolean;
	readonly scrollByPage?: boolean;
	readonly transformOptimization?: boolean;
	readonly smoothScrolling?: boolean;
	readonly scrollableElementChangeOptions?: ScrollableElementChangeOptions;
	readonly alwaysConsumeMouseWheel?: boolean;
	readonly initialSize?: Dimension;
	readonly paddingTop?: number;
	readonly paddingBottom?: number;
}

export interface IListStyles {
	listBackground: string | undefined;
	listFocusBackground: string | undefined;
	listFocusForeground: string | undefined;
	listActiveSelectionBackground: string | undefined;
	listActiveSelectionForeground: string | undefined;
	listActiveSelectionIconForeground: string | undefined;
	listFocusAndSelectionOutline: string | undefined;
	listFocusAndSelectionBackground: string | undefined;
	listFocusAndSelectionForeground: string | undefined;
	listInactiveSelectionBackground: string | undefined;
	listInactiveSelectionIconForeground: string | undefined;
	listInactiveSelectionForeground: string | undefined;
	listInactiveFocusForeground: string | undefined;
	listInactiveFocusBackground: string | undefined;
	listHoverBackground: string | undefined;
	listHoverForeground: string | undefined;
	listDropOverBackground: string | undefined;
	listDropBetweenBackground: string | undefined;
	listFocusOutline: string | undefined;
	listInactiveFocusOutline: string | undefined;
	listSelectionOutline: string | undefined;
	listHoverOutline: string | undefined;
	treeIndentGuidesStroke: string | undefined;
	treeInactiveIndentGuidesStroke: string | undefined;
	treeStickyScrollBackground: string | undefined;
	treeStickyScrollBorder: string | undefined;
	treeStickyScrollShadow: string | undefined;
	tableColumnsBorder: string | undefined;
	tableOddRowsBackgroundColor: string | undefined;
}

export const unthemedListStyles: IListStyles = {
	listFocusBackground: '#7FB0D0',
	listActiveSelectionBackground: '#0E639C',
	listActiveSelectionForeground: '#FFFFFF',
	listActiveSelectionIconForeground: '#FFFFFF',
	listFocusAndSelectionOutline: '#90C2F9',
	listFocusAndSelectionBackground: '#094771',
	listFocusAndSelectionForeground: '#FFFFFF',
	listInactiveSelectionBackground: '#3F3F46',
	listInactiveSelectionIconForeground: '#FFFFFF',
	listHoverBackground: '#2A2D2E',
	listDropOverBackground: '#383B3D',
	listDropBetweenBackground: '#EEEEEE',
	treeIndentGuidesStroke: '#a9a9a9',
	treeInactiveIndentGuidesStroke: Color.fromHex('#a9a9a9').transparent(0.4).toString(),
	tableColumnsBorder: Color.fromHex('#cccccc').transparent(0.2).toString(),
	tableOddRowsBackgroundColor: Color.fromHex('#cccccc').transparent(0.04).toString(),
	listBackground: undefined,
	listFocusForeground: undefined,
	listInactiveSelectionForeground: undefined,
	listInactiveFocusForeground: undefined,
	listInactiveFocusBackground: undefined,
	listHoverForeground: undefined,
	listFocusOutline: undefined,
	listInactiveFocusOutline: undefined,
	listSelectionOutline: undefined,
	listHoverOutline: undefined,
	treeStickyScrollBackground: undefined,
	treeStickyScrollBorder: undefined,
	treeStickyScrollShadow: undefined
};

const DefaultOptions: IListOptions<any> = {
	keyboardSupport: true,
	mouseSupport: true,
	multipleSelectionSupport: true,
	dnd: {
		getDragURI() { return null; },
		onDragStart(): void { },
		onDragOver() { return false; },
		drop() { },
		dispose() { }
	}
};

// TODO@Joao: move these utils into a SortedArray class

function getContiguousRangeContaining(range: number[], value: number): number[] {
	const index = range.indexOf(value);

	if (index === -1) {
		return [];
	}

	const result: number[] = [];
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
 * between them (OR).
 */
function disjunction(one: number[], other: number[]): number[] {
	const result: number[] = [];
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
	const result: number[] = [];
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

class PipelineRenderer<T> implements IListRenderer<T, any> {

	constructor(
		private _templateId: string,
		private renderers: IListRenderer<any /* TODO@joao */, any>[]
	) { }

	get templateId(): string {
		return this._templateId;
	}

	renderTemplate(container: HTMLElement): any[] {
		return this.renderers.map(r => r.renderTemplate(container));
	}

	renderElement(element: T, index: number, templateData: any[], renderDetails?: IListElementRenderDetails): void {
		let i = 0;

		for (const renderer of this.renderers) {
			renderer.renderElement(element, index, templateData[i++], renderDetails);
		}
	}

	disposeElement(element: T, index: number, templateData: any[], renderDetails?: IListElementRenderDetails): void {
		let i = 0;

		for (const renderer of this.renderers) {
			renderer.disposeElement?.(element, index, templateData[i], renderDetails);

			i += 1;
		}
	}

	disposeTemplate(templateData: unknown[]): void {
		let i = 0;

		for (const renderer of this.renderers) {
			renderer.disposeTemplate(templateData[i++]);
		}
	}
}

class AccessibiltyRenderer<T> implements IListRenderer<T, IAccessibilityTemplateData> {

	templateId: string = 'a18n';

	constructor(private accessibilityProvider: IListAccessibilityProvider<T>) { }

	renderTemplate(container: HTMLElement): IAccessibilityTemplateData {
		return { container, disposables: new DisposableStore() };
	}

	renderElement(element: T, index: number, data: IAccessibilityTemplateData): void {
		const ariaLabel = this.accessibilityProvider.getAriaLabel(element);
		const observable = (ariaLabel && typeof ariaLabel !== 'string') ? ariaLabel : constObservable(ariaLabel);

		data.disposables.add(autorun(reader => {
			this.setAriaLabel(reader.readObservable(observable), data.container);
		}));

		const ariaLevel = this.accessibilityProvider.getAriaLevel && this.accessibilityProvider.getAriaLevel(element);

		if (typeof ariaLevel === 'number') {
			data.container.setAttribute('aria-level', `${ariaLevel}`);
		} else {
			data.container.removeAttribute('aria-level');
		}
	}

	private setAriaLabel(ariaLabel: string | null, element: HTMLElement): void {
		if (ariaLabel) {
			element.setAttribute('aria-label', ariaLabel);
		} else {
			element.removeAttribute('aria-label');
		}
	}

	disposeElement(element: T, index: number, templateData: IAccessibilityTemplateData): void {
		templateData.disposables.clear();
	}

	disposeTemplate(templateData: IAccessibilityTemplateData): void {
		templateData.disposables.dispose();
	}
}

class ListViewDragAndDrop<T> implements IListViewDragAndDrop<T> {

	constructor(private list: List<T>, private dnd: IListDragAndDrop<T>) { }

	getDragElements(element: T): T[] {
		const selection = this.list.getSelectedElements();
		const elements = selection.indexOf(element) > -1 ? selection : [element];
		return elements;
	}

	getDragURI(element: T): string | null {
		return this.dnd.getDragURI(element);
	}

	getDragLabel?(elements: T[], originalEvent: DragEvent): string | undefined {
		if (this.dnd.getDragLabel) {
			return this.dnd.getDragLabel(elements, originalEvent);
		}

		return undefined;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		this.dnd.onDragStart?.(data, originalEvent);
	}

	onDragOver(data: IDragAndDropData, targetElement: T, targetIndex: number, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | IListDragOverReaction {
		return this.dnd.onDragOver(data, targetElement, targetIndex, targetSector, originalEvent);
	}

	onDragLeave(data: IDragAndDropData, targetElement: T, targetIndex: number, originalEvent: DragEvent): void {
		this.dnd.onDragLeave?.(data, targetElement, targetIndex, originalEvent);
	}

	onDragEnd(originalEvent: DragEvent): void {
		this.dnd.onDragEnd?.(originalEvent);
	}

	drop(data: IDragAndDropData, targetElement: T, targetIndex: number, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void {
		this.dnd.drop(data, targetElement, targetIndex, targetSector, originalEvent);
	}

	dispose(): void {
		this.dnd.dispose();
	}
}

/**
 * The {@link List} is a virtual scrolling widget, built on top of the {@link ListView}
 * widget.
 *
 * Features:
 * - Customizable keyboard and mouse support
 * - Element traits: focus, selection, achor
 * - Accessibility support
 * - Touch support
 * - Performant template-based rendering
 * - Horizontal scrolling
 * - Variable element height support
 * - Dynamic element height support
 * - Drag-and-drop support
 */
export class List<T> implements ISpliceable<T>, IDisposable {

	private focus = new Trait<T>('focused');
	private selection: Trait<T>;
	private anchor = new Trait<T>('anchor');
	private eventBufferer = new EventBufferer();
	protected view: IListView<T>;
	private spliceable: ISpliceable<T>;
	private styleController: IStyleController;
	private typeNavigationController?: TypeNavigationController<T>;
	private accessibilityProvider?: IListAccessibilityProvider<T>;
	private keyboardController: KeyboardController<T> | undefined;
	private mouseController: MouseController<T>;
	private _ariaLabel: string = '';

	protected readonly disposables = new DisposableStore();

	@memoize get onDidChangeFocus(): Event<IListEvent<T>> {
		return Event.map(this.eventBufferer.wrapEvent(this.focus.onChange), e => this.toListEvent(e), this.disposables);
	}

	@memoize get onDidChangeSelection(): Event<IListEvent<T>> {
		return Event.map(this.eventBufferer.wrapEvent(this.selection.onChange), e => this.toListEvent(e), this.disposables);
	}

	get domId(): string { return this.view.domId; }
	get onDidScroll(): Event<ScrollEvent> { return this.view.onDidScroll; }
	get onMouseClick(): Event<IListMouseEvent<T>> { return this.view.onMouseClick; }
	get onMouseDblClick(): Event<IListMouseEvent<T>> { return this.view.onMouseDblClick; }
	get onMouseMiddleClick(): Event<IListMouseEvent<T>> { return this.view.onMouseMiddleClick; }
	get onPointer(): Event<IListMouseEvent<T>> { return this.mouseController.onPointer; }
	get onMouseUp(): Event<IListMouseEvent<T>> { return this.view.onMouseUp; }
	get onMouseDown(): Event<IListMouseEvent<T>> { return this.view.onMouseDown; }
	get onMouseOver(): Event<IListMouseEvent<T>> { return this.view.onMouseOver; }
	get onMouseMove(): Event<IListMouseEvent<T>> { return this.view.onMouseMove; }
	get onMouseOut(): Event<IListMouseEvent<T>> { return this.view.onMouseOut; }
	get onTouchStart(): Event<IListTouchEvent<T>> { return this.view.onTouchStart; }
	get onTap(): Event<IListGestureEvent<T>> { return this.view.onTap; }

	/**
	 * Possible context menu trigger events:
	 * - ContextMenu key
	 * - Shift F10
	 * - Ctrl Option Shift M (macOS with VoiceOver)
	 * - Mouse right click
	 */
	@memoize get onContextMenu(): Event<IListContextMenuEvent<T>> {
		let didJustPressContextMenuKey = false;

		const fromKeyDown: Event<any> = Event.chain(this.disposables.add(new DomEmitter(this.view.domNode, 'keydown')).event, $ =>
			$.map(e => new StandardKeyboardEvent(e))
				.filter(e => didJustPressContextMenuKey = e.keyCode === KeyCode.ContextMenu || (e.shiftKey && e.keyCode === KeyCode.F10))
				.map(e => EventHelper.stop(e, true))
				.filter(() => false));

		const fromKeyUp = Event.chain(this.disposables.add(new DomEmitter(this.view.domNode, 'keyup')).event, $ =>
			$.forEach(() => didJustPressContextMenuKey = false)
				.map(e => new StandardKeyboardEvent(e))
				.filter(e => e.keyCode === KeyCode.ContextMenu || (e.shiftKey && e.keyCode === KeyCode.F10))
				.map(e => EventHelper.stop(e, true))
				.map(({ browserEvent }) => {
					const focus = this.getFocus();
					const index = focus.length ? focus[0] : undefined;
					const element = typeof index !== 'undefined' ? this.view.element(index) : undefined;
					const anchor = typeof index !== 'undefined' ? this.view.domElement(index) as HTMLElement : this.view.domNode;
					return { index, element, anchor, browserEvent };
				}));

		const fromMouse = Event.chain(this.view.onContextMenu, $ =>
			$.filter(_ => !didJustPressContextMenuKey)
				.map(({ element, index, browserEvent }) => ({ element, index, anchor: new StandardMouseEvent(getWindow(this.view.domNode), browserEvent), browserEvent }))
		);

		return Event.any<IListContextMenuEvent<T>>(fromKeyDown, fromKeyUp, fromMouse);
	}

	@memoize get onKeyDown(): Event<KeyboardEvent> { return this.disposables.add(new DomEmitter(this.view.domNode, 'keydown')).event; }
	@memoize get onKeyUp(): Event<KeyboardEvent> { return this.disposables.add(new DomEmitter(this.view.domNode, 'keyup')).event; }
	@memoize get onKeyPress(): Event<KeyboardEvent> { return this.disposables.add(new DomEmitter(this.view.domNode, 'keypress')).event; }

	@memoize get onDidFocus(): Event<void> { return Event.signal(this.disposables.add(new DomEmitter(this.view.domNode, 'focus', true)).event); }
	@memoize get onDidBlur(): Event<void> { return Event.signal(this.disposables.add(new DomEmitter(this.view.domNode, 'blur', true)).event); }

	private readonly _onDidDispose = new Emitter<void>();
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	constructor(
		private user: string,
		container: HTMLElement,
		virtualDelegate: IListVirtualDelegate<T>,
		renderers: IListRenderer<any /* TODO@joao */, any>[],
		private _options: IListOptions<T> = DefaultOptions
	) {
		const role = this._options.accessibilityProvider && this._options.accessibilityProvider.getWidgetRole ? this._options.accessibilityProvider?.getWidgetRole() : 'list';
		this.selection = new SelectionTrait(role !== 'listbox');

		const baseRenderers: IListRenderer<T, unknown>[] = [this.focus.renderer, this.selection.renderer];

		this.accessibilityProvider = _options.accessibilityProvider;

		if (this.accessibilityProvider) {
			baseRenderers.push(new AccessibiltyRenderer<T>(this.accessibilityProvider));

			this.accessibilityProvider.onDidChangeActiveDescendant?.(this.onDidChangeActiveDescendant, this, this.disposables);
		}

		renderers = renderers.map(r => new PipelineRenderer(r.templateId, [...baseRenderers, r]));

		const viewOptions: IListViewOptions<T> = {
			..._options,
			dnd: _options.dnd && new ListViewDragAndDrop(this, _options.dnd)
		};

		this.view = this.createListView(container, virtualDelegate, renderers, viewOptions);
		this.view.domNode.setAttribute('role', role);

		if (_options.styleController) {
			this.styleController = _options.styleController(this.view.domId);
		} else {
			const styleElement = createStyleSheet(this.view.domNode);
			this.styleController = new DefaultStyleController(styleElement, this.view.domId);
		}

		this.spliceable = new CombinedSpliceable([
			new TraitSpliceable(this.focus, this.view, _options.identityProvider),
			new TraitSpliceable(this.selection, this.view, _options.identityProvider),
			new TraitSpliceable(this.anchor, this.view, _options.identityProvider),
			this.view
		]);

		this.disposables.add(this.focus);
		this.disposables.add(this.selection);
		this.disposables.add(this.anchor);
		this.disposables.add(this.view);
		this.disposables.add(this._onDidDispose);

		this.disposables.add(new DOMFocusController(this, this.view));

		if (typeof _options.keyboardSupport !== 'boolean' || _options.keyboardSupport) {
			this.keyboardController = new KeyboardController(this, this.view, _options);
			this.disposables.add(this.keyboardController);
		}

		if (_options.keyboardNavigationLabelProvider) {
			const delegate = _options.keyboardNavigationDelegate || DefaultKeyboardNavigationDelegate;
			this.typeNavigationController = new TypeNavigationController(this, this.view, _options.keyboardNavigationLabelProvider, _options.keyboardNavigationEventFilter ?? (() => true), delegate);
			this.disposables.add(this.typeNavigationController);
		}

		this.mouseController = this.createMouseController(_options);
		this.disposables.add(this.mouseController);

		this.onDidChangeFocus(this._onFocusChange, this, this.disposables);
		this.onDidChangeSelection(this._onSelectionChange, this, this.disposables);

		if (this.accessibilityProvider) {
			const ariaLabel = this.accessibilityProvider.getWidgetAriaLabel();
			const observable = (ariaLabel && typeof ariaLabel !== 'string') ? ariaLabel : constObservable(ariaLabel);

			this.disposables.add(autorun(reader => {
				this.ariaLabel = reader.readObservable(observable);
			}));
		}

		if (this._options.multipleSelectionSupport !== false) {
			this.view.domNode.setAttribute('aria-multiselectable', 'true');
		}
	}

	protected createListView(container: HTMLElement, virtualDelegate: IListVirtualDelegate<T>, renderers: IListRenderer<any, any>[], viewOptions: IListViewOptions<T>): IListView<T> {
		return new ListView(container, virtualDelegate, renderers, viewOptions);
	}

	protected createMouseController(options: IListOptions<T>): MouseController<T> {
		return new MouseController(this);
	}

	updateOptions(optionsUpdate: IListOptionsUpdate = {}): void {
		this._options = { ...this._options, ...optionsUpdate };

		this.typeNavigationController?.updateOptions(this._options);

		if (this._options.multipleSelectionController !== undefined) {
			if (this._options.multipleSelectionSupport) {
				this.view.domNode.setAttribute('aria-multiselectable', 'true');
			} else {
				this.view.domNode.removeAttribute('aria-multiselectable');
			}
		}

		this.mouseController.updateOptions(optionsUpdate);
		this.keyboardController?.updateOptions(optionsUpdate);
		this.view.updateOptions(optionsUpdate);
	}

	get options(): IListOptions<T> {
		return this._options;
	}

	splice(start: number, deleteCount: number, elements: readonly T[] = []): void {
		if (start < 0 || start > this.view.length) {
			throw new ListError(this.user, `Invalid start index: ${start}`);
		}

		if (deleteCount < 0) {
			throw new ListError(this.user, `Invalid delete count: ${deleteCount}`);
		}

		if (deleteCount === 0 && elements.length === 0) {
			return;
		}

		this.eventBufferer.bufferEvents(() => this.spliceable.splice(start, deleteCount, elements));
	}

	updateWidth(index: number): void {
		this.view.updateWidth(index);
	}

	updateElementHeight(index: number, size: number | undefined): void {
		this.view.updateElementHeight(index, size, null);
	}

	rerender(): void {
		this.view.rerender();
	}

	element(index: number): T {
		return this.view.element(index);
	}

	indexOf(element: T): number {
		return this.view.indexOf(element);
	}

	indexAt(position: number): number {
		return this.view.indexAt(position);
	}

	get length(): number {
		return this.view.length;
	}

	get contentHeight(): number {
		return this.view.contentHeight;
	}

	get contentWidth(): number {
		return this.view.contentWidth;
	}

	get onDidChangeContentHeight(): Event<number> {
		return this.view.onDidChangeContentHeight;
	}

	get onDidChangeContentWidth(): Event<number> {
		return this.view.onDidChangeContentWidth;
	}

	get scrollTop(): number {
		return this.view.getScrollTop();
	}

	set scrollTop(scrollTop: number) {
		this.view.setScrollTop(scrollTop);
	}

	get scrollLeft(): number {
		return this.view.getScrollLeft();
	}

	set scrollLeft(scrollLeft: number) {
		this.view.setScrollLeft(scrollLeft);
	}

	get scrollHeight(): number {
		return this.view.scrollHeight;
	}

	get renderHeight(): number {
		return this.view.renderHeight;
	}

	get firstVisibleIndex(): number {
		return this.view.firstVisibleIndex;
	}

	get firstMostlyVisibleIndex(): number {
		return this.view.firstMostlyVisibleIndex;
	}

	get lastVisibleIndex(): number {
		return this.view.lastVisibleIndex;
	}

	get ariaLabel(): string {
		return this._ariaLabel;
	}

	set ariaLabel(value: string) {
		this._ariaLabel = value;
		this.view.domNode.setAttribute('aria-label', value);
	}

	domFocus(): void {
		this.view.domNode.focus({ preventScroll: true });
	}

	layout(height?: number, width?: number): void {
		this.view.layout(height, width);
	}

	triggerTypeNavigation(): void {
		this.typeNavigationController?.trigger();
	}

	setSelection(indexes: number[], browserEvent?: UIEvent): void {
		for (const index of indexes) {
			if (index < 0 || index >= this.length) {
				throw new ListError(this.user, `Invalid index ${index}`);
			}
		}

		this.selection.set(indexes, browserEvent);
	}

	getSelection(): number[] {
		return this.selection.get();
	}

	getSelectedElements(): T[] {
		return this.getSelection().map(i => this.view.element(i));
	}

	setAnchor(index: number | undefined): void {
		if (typeof index === 'undefined') {
			this.anchor.set([]);
			return;
		}

		if (index < 0 || index >= this.length) {
			throw new ListError(this.user, `Invalid index ${index}`);
		}

		this.anchor.set([index]);
	}

	getAnchor(): number | undefined {
		return this.anchor.get().at(0);
	}

	getAnchorElement(): T | undefined {
		const anchor = this.getAnchor();
		return typeof anchor === 'undefined' ? undefined : this.element(anchor);
	}

	setFocus(indexes: number[], browserEvent?: UIEvent): void {
		for (const index of indexes) {
			if (index < 0 || index >= this.length) {
				throw new ListError(this.user, `Invalid index ${index}`);
			}
		}

		this.focus.set(indexes, browserEvent);
	}

	focusNext(n = 1, loop = false, browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
		if (this.length === 0) { return; }

		const focus = this.focus.get();
		const index = this.findNextIndex(focus.length > 0 ? focus[0] + n : 0, loop, filter);

		if (index > -1) {
			this.setFocus([index], browserEvent);
		}
	}

	focusPrevious(n = 1, loop = false, browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
		if (this.length === 0) { return; }

		const focus = this.focus.get();
		const index = this.findPreviousIndex(focus.length > 0 ? focus[0] - n : 0, loop, filter);

		if (index > -1) {
			this.setFocus([index], browserEvent);
		}
	}

	async focusNextPage(browserEvent?: UIEvent, filter?: (element: T) => boolean): Promise<void> {
		let lastPageIndex = this.view.indexAt(this.view.getScrollTop() + this.view.renderHeight);
		lastPageIndex = lastPageIndex === 0 ? 0 : lastPageIndex - 1;
		const currentlyFocusedElementIndex = this.getFocus()[0];

		if (currentlyFocusedElementIndex !== lastPageIndex && (currentlyFocusedElementIndex === undefined || lastPageIndex > currentlyFocusedElementIndex)) {
			const lastGoodPageIndex = this.findPreviousIndex(lastPageIndex, false, filter);

			if (lastGoodPageIndex > -1 && currentlyFocusedElementIndex !== lastGoodPageIndex) {
				this.setFocus([lastGoodPageIndex], browserEvent);
			} else {
				this.setFocus([lastPageIndex], browserEvent);
			}
		} else {
			const previousScrollTop = this.view.getScrollTop();
			let nextpageScrollTop = previousScrollTop + this.view.renderHeight;
			if (lastPageIndex > currentlyFocusedElementIndex) {
				// scroll last page element to the top only if the last page element is below the focused element
				nextpageScrollTop -= this.view.elementHeight(lastPageIndex);
			}

			this.view.setScrollTop(nextpageScrollTop);

			if (this.view.getScrollTop() !== previousScrollTop) {
				this.setFocus([]);

				// Let the scroll event listener run
				await timeout(0);
				await this.focusNextPage(browserEvent, filter);
			}
		}
	}

	async focusPreviousPage(browserEvent?: UIEvent, filter?: (element: T) => boolean, getPaddingTop: () => number = () => 0): Promise<void> {
		let firstPageIndex: number;
		const paddingTop = getPaddingTop();
		const scrollTop = this.view.getScrollTop() + paddingTop;

		if (scrollTop === 0) {
			firstPageIndex = this.view.indexAt(scrollTop);
		} else {
			firstPageIndex = this.view.indexAfter(scrollTop - 1);
		}

		const currentlyFocusedElementIndex = this.getFocus()[0];

		if (currentlyFocusedElementIndex !== firstPageIndex && (currentlyFocusedElementIndex === undefined || currentlyFocusedElementIndex >= firstPageIndex)) {
			const firstGoodPageIndex = this.findNextIndex(firstPageIndex, false, filter);

			if (firstGoodPageIndex > -1 && currentlyFocusedElementIndex !== firstGoodPageIndex) {
				this.setFocus([firstGoodPageIndex], browserEvent);
			} else {
				this.setFocus([firstPageIndex], browserEvent);
			}
		} else {
			const previousScrollTop = scrollTop;
			this.view.setScrollTop(scrollTop - this.view.renderHeight - paddingTop);

			if (this.view.getScrollTop() + getPaddingTop() !== previousScrollTop) {
				this.setFocus([]);

				// Let the scroll event listener run
				await timeout(0);
				await this.focusPreviousPage(browserEvent, filter, getPaddingTop);
			}
		}
	}

	focusLast(browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
		if (this.length === 0) { return; }

		const index = this.findPreviousIndex(this.length - 1, false, filter);

		if (index > -1) {
			this.setFocus([index], browserEvent);
		}
	}

	focusFirst(browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
		this.focusNth(0, browserEvent, filter);
	}

	focusNth(n: number, browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
		if (this.length === 0) { return; }

		const index = this.findNextIndex(n, false, filter);

		if (index > -1) {
			this.setFocus([index], browserEvent);
		}
	}

	private findNextIndex(index: number, loop = false, filter?: (element: T) => boolean): number {
		for (let i = 0; i < this.length; i++) {
			if (index >= this.length && !loop) {
				return -1;
			}

			index = index % this.length;

			if (!filter || filter(this.element(index))) {
				return index;
			}

			index++;
		}

		return -1;
	}

	private findPreviousIndex(index: number, loop = false, filter?: (element: T) => boolean): number {
		for (let i = 0; i < this.length; i++) {
			if (index < 0 && !loop) {
				return -1;
			}

			index = (this.length + (index % this.length)) % this.length;

			if (!filter || filter(this.element(index))) {
				return index;
			}

			index--;
		}

		return -1;
	}

	getFocus(): number[] {
		return this.focus.get();
	}

	getFocusedElements(): T[] {
		return this.getFocus().map(i => this.view.element(i));
	}

	reveal(index: number, relativeTop?: number, paddingTop: number = 0): void {
		if (index < 0 || index >= this.length) {
			throw new ListError(this.user, `Invalid index ${index}`);
		}

		const scrollTop = this.view.getScrollTop();
		const elementTop = this.view.elementTop(index);
		const elementHeight = this.view.elementHeight(index);

		if (isNumber(relativeTop)) {
			// y = mx + b
			const m = elementHeight - this.view.renderHeight + paddingTop;
			this.view.setScrollTop(m * clamp(relativeTop, 0, 1) + elementTop - paddingTop);
		} else {
			const viewItemBottom = elementTop + elementHeight;
			const scrollBottom = scrollTop + this.view.renderHeight;

			if (elementTop < scrollTop + paddingTop && viewItemBottom >= scrollBottom) {
				// The element is already overflowing the viewport, no-op
			} else if (elementTop < scrollTop + paddingTop || (viewItemBottom >= scrollBottom && elementHeight >= this.view.renderHeight)) {
				this.view.setScrollTop(elementTop - paddingTop);
			} else if (viewItemBottom >= scrollBottom) {
				this.view.setScrollTop(viewItemBottom - this.view.renderHeight);
			}
		}
	}

	/**
	 * Returns the relative position of an element rendered in the list.
	 * Returns `null` if the element isn't *entirely* in the visible viewport.
	 */
	getRelativeTop(index: number, paddingTop: number = 0): number | null {
		if (index < 0 || index >= this.length) {
			throw new ListError(this.user, `Invalid index ${index}`);
		}

		const scrollTop = this.view.getScrollTop();
		const elementTop = this.view.elementTop(index);
		const elementHeight = this.view.elementHeight(index);

		if (elementTop < scrollTop + paddingTop || elementTop + elementHeight > scrollTop + this.view.renderHeight) {
			return null;
		}

		// y = mx + b
		const m = elementHeight - this.view.renderHeight + paddingTop;
		return Math.abs((scrollTop + paddingTop - elementTop) / m);
	}

	isDOMFocused(): boolean {
		return isActiveElement(this.view.domNode);
	}

	getHTMLElement(): HTMLElement {
		return this.view.domNode;
	}

	getScrollableElement(): HTMLElement {
		return this.view.scrollableElementDomNode;
	}

	getElementID(index: number): string {
		return this.view.getElementDomId(index);
	}

	getElementTop(index: number): number {
		return this.view.elementTop(index);
	}

	style(styles: IListStyles): void {
		this.styleController.style(styles);
	}

	delegateScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent) {
		this.view.delegateScrollFromMouseWheelEvent(browserEvent);
	}

	private toListEvent({ indexes, browserEvent }: ITraitChangeEvent) {
		return { indexes, elements: indexes.map(i => this.view.element(i)), browserEvent };
	}

	private _onFocusChange(): void {
		const focus = this.focus.get();
		this.view.domNode.classList.toggle('element-focused', focus.length > 0);
		this.onDidChangeActiveDescendant();
	}

	private onDidChangeActiveDescendant(): void {
		const focus = this.focus.get();

		if (focus.length > 0) {
			let id: string | undefined;

			if (this.accessibilityProvider?.getActiveDescendantId) {
				id = this.accessibilityProvider.getActiveDescendantId(this.view.element(focus[0]));
			}

			this.view.domNode.setAttribute('aria-activedescendant', id || this.view.getElementDomId(focus[0]));
		} else {
			this.view.domNode.removeAttribute('aria-activedescendant');
		}
	}

	private _onSelectionChange(): void {
		const selection = this.selection.get();

		this.view.domNode.classList.toggle('selection-none', selection.length === 0);
		this.view.domNode.classList.toggle('selection-single', selection.length === 1);
		this.view.domNode.classList.toggle('selection-multiple', selection.length > 1);
	}

	dispose(): void {
		this._onDidDispose.fire();
		this.disposables.dispose();

		this._onDidDispose.dispose();
	}
}
