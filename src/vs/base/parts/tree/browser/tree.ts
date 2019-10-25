/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Touch from 'vs/base/browser/touch';
import * as Mouse from 'vs/base/browser/mouseEvent';
import * as Keyboard from 'vs/base/browser/keyboardEvent';
import { INavigator } from 'vs/base/common/iterator';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { Event } from 'vs/base/common/event';
import { IAction } from 'vs/base/common/actions';
import { Color } from 'vs/base/common/color';
import { IItemCollapseEvent, IItemExpandEvent } from 'vs/base/parts/tree/browser/treeModel';
import { IDragAndDropData } from 'vs/base/browser/dnd';

export interface ITree {

	onDidFocus: Event<void>;
	onDidBlur: Event<void>;
	onDidChangeFocus: Event<IFocusEvent>;
	onDidChangeSelection: Event<ISelectionEvent>;
	onDidChangeHighlight: Event<IHighlightEvent>;
	onDidExpandItem: Event<IItemExpandEvent>;
	onDidCollapseItem: Event<IItemCollapseEvent>;
	onDidDispose: Event<void>;
	onDidScroll: Event<void>;

	/**
	 * Returns the tree's DOM element.
	 */
	getHTMLElement(): HTMLElement;

	/**
	 * Lays out the tree.
	 * Provide a specific height to save an (expensive) height computation.
	 */
	layout(height?: number): void;

	/**
	 * Notifies the tree that is has become visible.
	 */
	onVisible(): void;

	/**
	 * Notifies the tree that is has become hidden.
	 */
	onHidden(): void;

	/**
	 * Sets the input of the tree.
	 */
	setInput(element: any): Promise<any>;

	/**
	 * Returns the tree's input.
	 */
	getInput(): any;

	/**
	 * Sets DOM focus on the tree.
	 */
	domFocus(): void;

	/**
	 * Returns whether the tree has DOM focus.
	 */
	isDOMFocused(): boolean;

	/**
	 * Removes DOM focus from the tree.
	 */
	domBlur(): void;

	/**
	 * Refreshes an element.
	 * Provide no arguments and it will refresh the input element.
	 */
	refresh(element?: any, recursive?: boolean): Promise<any>;

	/**
	 * Expands an element.
	 * The returned promise returns a boolean for whether the element was expanded or not.
	 */
	expand(element: any): Promise<any>;

	/**
	 * Expands several elements.
	 * The returned promise returns a boolean array for whether the elements were expanded or not.
	 */
	expandAll(elements?: any[]): Promise<any>;

	/**
	 * Collapses an element.
	 * The returned promise returns a boolean for whether the element was collapsed or not.
	 */
	collapse(element: any, recursive?: boolean): Promise<any>;

	/**
	 * Collapses several elements.
	 * Provide no arguments and it will recursively collapse all elements in the tree
	 * The returned promise returns a boolean for whether the elements were collapsed or not.
	 */
	collapseAll(elements?: any[], recursive?: boolean): Promise<any>;

	/**
	 * Toggles an element's expansion state.
	 */
	toggleExpansion(element: any, recursive?: boolean): Promise<any>;

	/**
	 * Returns whether an element is expanded or not.
	 */
	isExpanded(element: any): boolean;

	/**
	 * Reveals an element in the tree. The relativeTop is a value between 0 and 1. The closer to 0 the more the
	 * element will scroll up to the top.
	 */
	reveal(element: any, relativeTop?: number): Promise<any>;

	/**
	 * Returns the currently highlighted element.
	 */
	getHighlight(includeHidden?: boolean): any;

	/**
	 * Clears the highlight.
	 */
	clearHighlight(eventPayload?: any): void;

	/**
	 * Replaces the current selection with the given elements.
	 */
	setSelection(elements: any[], eventPayload?: any): void;

	/**
	 * Returns the currently selected elements.
	 */
	getSelection(includeHidden?: boolean): any[];

	/**
	 * Clears the selection.
	 */
	clearSelection(eventPayload?: any): void;

	/**
	 * Sets the focused element.
	 */
	setFocus(element?: any, eventPayload?: any): void;

	/**
	 * Returns focused element.
	 */
	getFocus(includeHidden?: boolean): any;

	/**
	 * Focuses the next `count`-nth element, in visible order.
	 */
	focusNext(count?: number, eventPayload?: any): void;

	/**
	 * Focuses the previous `count`-nth element, in visible order.
	 */
	focusPrevious(count?: number, eventPayload?: any): void;

	/**
	 * Focuses the currently focused element's parent.
	 */
	focusParent(eventPayload?: any): void;

	/**
	 * Focuses the first child of the currently focused element.
	 */
	focusFirstChild(eventPayload?: any): void;

	/**
	 * Focuses the second element, in visible order. Will focus the first
	 * child from the provided element's parent if any.
	 */
	focusFirst(eventPayload?: any, from?: any): void;

	/**
	 * Focuses the nth element, in visible order.
	 */
	focusNth(index: number, eventPayload?: any): void;

	/**
	 * Focuses the last element, in visible order. Will focus the last
	 * child from the provided element's parent if any.
	 */
	focusLast(eventPayload?: any, from?: any): void;

	/**
	 * Focuses the element at the end of the next page, in visible order.
	 */
	focusNextPage(eventPayload?: any): void;

	/**
	 * Focuses the element at the beginning of the previous page, in visible order.
	 */
	focusPreviousPage(eventPayload?: any): void;

	/**
	 * Clears the focus.
	 */
	clearFocus(eventPayload?: any): void;

	/**
	 * Returns a navigator which allows to discover the visible and
	 * expanded elements in the tree.
	 */
	getNavigator(fromElement?: any, subTreeOnly?: boolean): INavigator<any>;

	/**
	 * Apply styles to the tree.
	 */
	style(styles: ITreeStyles): void;

	/**
	 * Disposes the tree
	 */
	dispose(): void;
}

export interface IDataSource {

	/**
	 * Returns the unique identifier of the given element.
	 * No more than one element may use a given identifier.
	 *
	 * You should not attempt to "move" an element to a different
	 * parent by keeping its ID. The idea here is to have tree location
	 * related IDs (e.g. full file path, in the Explorer example).
	 */
	getId(tree: ITree, element: any): string;

	/**
	 * Returns a boolean value indicating whether the element has children.
	 */
	hasChildren(tree: ITree, element: any): boolean;

	/**
	 * Returns the element's children as an array in a promise.
	 */
	getChildren(tree: ITree, element: any): Promise<any>;

	/**
	 * Returns the element's parent in a promise.
	 */
	getParent(tree: ITree, element: any): Promise<any>;

	/**
	 * Returns whether an element should be expanded when first added to the tree.
	 */
	shouldAutoexpand?(tree: ITree, element: any): boolean;
}

export interface IRenderer {

	/**
	 * Returns the element's height in the tree, in pixels.
	 */
	getHeight(tree: ITree, element: any): number;

	/**
	 * Returns a template ID for a given element. This will be used as an identifier
	 * for the next 3 methods.
	 */
	getTemplateId(tree: ITree, element: any): string;

	/**
	 * Renders the template in a DOM element. This method should render all the DOM
	 * structure for an hypothetical element leaving its contents blank. It should
	 * return an object bag which will be passed along to `renderElement` and used
	 * to fill in those blanks.
	 *
	 * You should do all DOM creating and object allocation in this method. It
	 * will be called only a few times.
	 */
	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any;

	/**
	 * Renders an element, given an object bag returned by `renderTemplate`.
	 * This method should do as little as possible and ideally it should only fill
	 * in the blanks left by `renderTemplate`.
	 *
	 * Try to make this method do as little possible, since it will be called very
	 * often.
	 */
	renderElement(tree: ITree, element: any, templateId: string, templateData: any): void;

	/**
	 * Disposes a template that was once rendered.
	 */
	disposeTemplate(tree: ITree, templateId: string, templateData: any): void;
}

export interface IAccessibilityProvider {

	/**
	 * Given an element in the tree, return the ARIA label that should be associated with the
	 * item. This helps screen readers to provide a meaningful label for the currently focused
	 * tree element.
	 *
	 * Returning null will not disable ARIA for the element. Instead it is up to the screen reader
	 * to compute a meaningful label based on the contents of the element in the DOM
	 *
	 * See also: https://www.w3.org/TR/wai-aria/states_and_properties#aria-label
	 */
	getAriaLabel(tree: ITree, element: any): string | null;

	/**
	 * Given an element in the tree return its aria-posinset. Should be between 1 and aria-setsize
	 * https://www.w3.org/TR/wai-aria/states_and_properties#aria-posinset
	 */
	getPosInSet?(tree: ITree, element: any): string;

	/**
	 * Return the aria-setsize of the tree.
	 * https://www.w3.org/TR/wai-aria/states_and_properties#aria-setsize
	 */
	getSetSize?(): string;
}

export /* abstract */ class ContextMenuEvent {

	private _posx: number;
	private _posy: number;
	private _target: HTMLElement;

	constructor(posx: number, posy: number, target: HTMLElement) {
		this._posx = posx;
		this._posy = posy;
		this._target = target;
	}

	public preventDefault(): void {
		// no-op
	}

	public stopPropagation(): void {
		// no-op
	}

	public get posx(): number {
		return this._posx;
	}

	public get posy(): number {
		return this._posy;
	}

	public get target(): HTMLElement {
		return this._target;
	}
}

export class MouseContextMenuEvent extends ContextMenuEvent {

	private originalEvent: Mouse.IMouseEvent;

	constructor(originalEvent: Mouse.IMouseEvent) {
		super(originalEvent.posx, originalEvent.posy, originalEvent.target);
		this.originalEvent = originalEvent;
	}

	public preventDefault(): void {
		this.originalEvent.preventDefault();
	}

	public stopPropagation(): void {
		this.originalEvent.stopPropagation();
	}
}

export class KeyboardContextMenuEvent extends ContextMenuEvent {

	private originalEvent: Keyboard.IKeyboardEvent;

	constructor(posx: number, posy: number, originalEvent: Keyboard.IKeyboardEvent) {
		super(posx, posy, originalEvent.target);
		this.originalEvent = originalEvent;
	}

	public preventDefault(): void {
		this.originalEvent.preventDefault();
	}

	public stopPropagation(): void {
		this.originalEvent.stopPropagation();
	}
}

export interface IController {

	/**
	 * Called when an element is clicked.
	 */
	onClick(tree: ITree, element: any, event: Mouse.IMouseEvent): boolean;

	/**
	 * Called when an element is requested for a context menu.
	 */
	onContextMenu(tree: ITree, element: any, event: ContextMenuEvent): boolean;

	/**
	 * Called when an element is tapped.
	 */
	onTap(tree: ITree, element: any, event: Touch.GestureEvent): boolean;

	/**
	 * Called when a key is pressed down while selecting elements.
	 */
	onKeyDown(tree: ITree, event: Keyboard.IKeyboardEvent): boolean;

	/**
	 * Called when a key is released while selecting elements.
	 */
	onKeyUp(tree: ITree, event: Keyboard.IKeyboardEvent): boolean;

	/**
	 * Called when a mouse middle button is pressed down on an element.
	 */
	onMouseMiddleClick?(tree: ITree, element: any, event: Mouse.IMouseEvent): boolean;

	/**
	 * Called when a mouse button is pressed down on an element.
	 */
	onMouseDown?(tree: ITree, element: any, event: Mouse.IMouseEvent): boolean;

	/**
	 * Called when a mouse button goes up on an element.
	 */
	onMouseUp?(tree: ITree, element: any, event: Mouse.IMouseEvent): boolean;
}

export const enum DragOverEffect {
	COPY,
	MOVE
}

export const enum DragOverBubble {
	BUBBLE_DOWN,
	BUBBLE_UP
}

export interface IDragOverReaction {
	accept: boolean;
	effect?: DragOverEffect;
	bubble?: DragOverBubble;
	autoExpand?: boolean;
}

export interface IDragAndDrop {

	/**
	 * Returns a uri if the given element should be allowed to drag.
	 * Returns null, otherwise.
	 */
	getDragURI(tree: ITree, element: any): string | null;

	/**
	 * Returns a label to display when dragging the element.
	 */
	getDragLabel?(tree: ITree, elements: any[]): string;

	/**
	 * Sent when the drag operation is starting.
	 */
	onDragStart(tree: ITree, data: IDragAndDropData, originalEvent: Mouse.DragMouseEvent): void;

	/**
	 * Returns a DragOverReaction indicating whether sources can be
	 * dropped into target or some parent of the target.
	 */
	onDragOver(tree: ITree, data: IDragAndDropData, targetElement: any, originalEvent: Mouse.DragMouseEvent): IDragOverReaction | null;

	/**
	 * Handles the action of dropping sources into target.
	 */
	drop(tree: ITree, data: IDragAndDropData, targetElement: any, originalEvent: Mouse.DragMouseEvent): void;
}

export interface IFilter {

	/**
	 * Returns whether the given element should be visible.
	 */
	isVisible(tree: ITree, element: any): boolean;
}

export interface ISorter {

	/**
	 * Compare two elements in the viewer to define the sorting order.
	 */
	compare(tree: ITree, element: any, otherElement: any): number;
}

// Events

export interface ISelectionEvent {
	selection: any[];
	payload?: any;
}

export interface IFocusEvent {
	focus: any;
	payload?: any;
}

export interface IHighlightEvent {
	highlight: any;
	payload?: any;
}

// Options

export interface ITreeConfiguration {
	dataSource: IDataSource;
	renderer?: IRenderer;
	controller?: IController;
	dnd?: IDragAndDrop;
	filter?: IFilter;
	sorter?: ISorter;
	accessibilityProvider?: IAccessibilityProvider;
	styler?: ITreeStyler;
}

export interface ITreeOptions extends ITreeStyles {
	twistiePixels?: number;
	showTwistie?: boolean;
	indentPixels?: number;
	verticalScrollMode?: ScrollbarVisibility;
	horizontalScrollMode?: ScrollbarVisibility;
	alwaysFocused?: boolean;
	autoExpandSingleChildren?: boolean;
	useShadows?: boolean;
	paddingOnRow?: boolean;
	ariaLabel?: string;
	keyboardSupport?: boolean;
	preventRootFocus?: boolean;
	showLoading?: boolean;
}

export interface ITreeStyler {
	style(styles: ITreeStyles): void;
}

export interface ITreeStyles {
	listFocusBackground?: Color;
	listFocusForeground?: Color;
	listActiveSelectionBackground?: Color;
	listActiveSelectionForeground?: Color;
	listFocusAndSelectionBackground?: Color;
	listFocusAndSelectionForeground?: Color;
	listInactiveSelectionBackground?: Color;
	listInactiveSelectionForeground?: Color;
	listHoverBackground?: Color;
	listHoverForeground?: Color;
	listDropBackground?: Color;
	listFocusOutline?: Color;
}

export interface ITreeContext extends ITreeConfiguration {
	tree: ITree;
	options: ITreeOptions;
}

export interface IActionProvider {

	/**
	 * Returns whether or not the element has actions. These show up in place right to the element in the tree.
	 */
	hasActions(tree: ITree | null, element: any): boolean;

	/**
	 * Returns an array with the actions of the element that should show up in place right to the element in the tree.
	 */
	getActions(tree: ITree | null, element: any): ReadonlyArray<IAction> | null;
}
