/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IListOptions, List, IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { IListVirtualDelegate, IListRenderer, IListMouseEvent, IListEvent, IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { Event, Relay } from 'vs/base/common/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ITreeModel, ITreeNode, ITreeRenderer, ITreeEvent, ITreeMouseEvent, ITreeContextMenuEvent, ITreeFilter, ITreeNavigator, ICollapseStateChangeEvent } from 'vs/base/browser/ui/tree/tree';
import { ISpliceable } from 'vs/base/common/sequence';

function asListOptions<T, TFilterData>(options?: IAbstractTreeOptions<T, TFilterData>): IListOptions<ITreeNode<T, TFilterData>> | undefined {
	return options && {
		...options,
		identityProvider: options.identityProvider && {
			getId(el) {
				return options.identityProvider!.getId(el.element);
			}
		},
		multipleSelectionController: options.multipleSelectionController && {
			isSelectionSingleChangeEvent(e) {
				return options.multipleSelectionController!.isSelectionSingleChangeEvent({ ...e, element: e.element } as any);
			},
			isSelectionRangeChangeEvent(e) {
				return options.multipleSelectionController!.isSelectionRangeChangeEvent({ ...e, element: e.element } as any);
			}
		},
		accessibilityProvider: options.accessibilityProvider && {
			getAriaLabel(e) {
				return options.accessibilityProvider!.getAriaLabel(e.element);
			}
		},
		keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
			getKeyboardNavigationLabel(e) {
				return options.keyboardNavigationLabelProvider!.getKeyboardNavigationLabel(e.element);
			}
		}
	};
}

export class ComposedTreeDelegate<T, N extends { element: T }> implements IListVirtualDelegate<N> {

	constructor(private delegate: IListVirtualDelegate<T>) { }

	getHeight(element: N): number {
		return this.delegate.getHeight(element.element);
	}

	getTemplateId(element: N): string {
		return this.delegate.getTemplateId(element.element);
	}

	hasDynamicHeight(element: N): boolean {
		return !!this.delegate.hasDynamicHeight && this.delegate.hasDynamicHeight(element.element);
	}
}

interface ITreeListTemplateData<T> {
	twistie: HTMLElement;
	templateData: T;
}

class TreeRenderer<T, TFilterData, TTemplateData> implements IListRenderer<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>> {

	readonly templateId: string;
	private renderedElements = new Map<T, ITreeNode<T, TFilterData>>();
	private renderedNodes = new Map<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>>();
	private disposables: IDisposable[] = [];

	constructor(
		private renderer: ITreeRenderer<T, TFilterData, TTemplateData>,
		onDidChangeCollapseState: Event<ICollapseStateChangeEvent<T, TFilterData>>
	) {
		this.templateId = renderer.templateId;

		Event.map(onDidChangeCollapseState, e => e.node)(this.onDidChangeNodeTwistieState, this, this.disposables);

		if (renderer.onDidChangeTwistieState) {
			renderer.onDidChangeTwistieState(this.onDidChangeTwistieState, this, this.disposables);
		}
	}

	renderTemplate(container: HTMLElement): ITreeListTemplateData<TTemplateData> {
		const el = append(container, $('.monaco-tl-row'));
		const twistie = append(el, $('.monaco-tl-twistie'));
		const contents = append(el, $('.monaco-tl-contents'));
		const templateData = this.renderer.renderTemplate(contents);

		return { twistie, templateData };
	}

	renderElement(node: ITreeNode<T, TFilterData>, index: number, templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderedNodes.set(node, templateData);
		this.renderedElements.set(node.element, node);

		templateData.twistie.style.width = `${10 + node.depth * 10}px`;
		this.renderTwistie(node, templateData.twistie);

		this.renderer.renderElement(node, index, templateData.templateData);
	}

	disposeElement(node: ITreeNode<T, TFilterData>, index: number, templateData: ITreeListTemplateData<TTemplateData>): void {
		if (this.renderer.disposeElement) {
			this.renderer.disposeElement(node, index, templateData.templateData);
		}
		this.renderedNodes.delete(node);
		this.renderedElements.set(node.element);
	}

	disposeTemplate(templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	private onDidChangeTwistieState(element: T): void {
		const node = this.renderedElements.get(element);

		if (!node) {
			return;
		}

		this.onDidChangeNodeTwistieState(node);
	}

	private onDidChangeNodeTwistieState(node: ITreeNode<T, TFilterData>): void {
		const templateData = this.renderedNodes.get(node);

		if (!templateData) {
			return;
		}

		this.renderTwistie(node, templateData.twistie);
	}

	private renderTwistie(node: ITreeNode<T, TFilterData>, twistieElement: HTMLElement) {
		if (this.renderer.renderTwistie) {
			this.renderer.renderTwistie(node.element, twistieElement);
		}

		toggleClass(twistieElement, 'collapsible', node.collapsible);
		toggleClass(twistieElement, 'collapsed', node.collapsible && node.collapsed);
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.renderedElements.clear();
		this.disposables = dispose(this.disposables);
	}
}

function isInputElement(e: HTMLElement): boolean {
	return e.tagName === 'INPUT' || e.tagName === 'TEXTAREA';
}

function asTreeEvent<T>(event: IListEvent<ITreeNode<T, any>>): ITreeEvent<T> {
	return {
		elements: event.elements.map(node => node.element),
		browserEvent: event.browserEvent
	};
}

function asTreeMouseEvent<T>(event: IListMouseEvent<ITreeNode<T, any>>): ITreeMouseEvent<T> {
	return {
		browserEvent: event.browserEvent,
		element: event.element ? event.element.element : null
	};
}

function asTreeContextMenuEvent<T>(event: IListContextMenuEvent<ITreeNode<T, any>>): ITreeContextMenuEvent<T> {
	return {
		element: event.element ? event.element.element : null,
		browserEvent: event.browserEvent,
		anchor: event.anchor
	};
}

export interface IAbstractTreeOptions<T, TFilterData = void> extends IListOptions<T> {
	collapseByDefault?: boolean; // defaults to false
	filter?: ITreeFilter<T, TFilterData>;
}

export abstract class AbstractTree<T, TFilterData, TRef> implements IDisposable {

	private view: List<ITreeNode<T, TFilterData>>;
	protected model: ITreeModel<T, TFilterData, TRef>;
	protected disposables: IDisposable[] = [];

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return Event.map(this.view.onFocusChange, asTreeEvent); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return Event.map(this.view.onSelectionChange, asTreeEvent); }
	get onDidOpen(): Event<ITreeEvent<T>> { return Event.map(this.view.onDidOpen, asTreeEvent); }

	get onMouseClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onMouseDblClick, asTreeMouseEvent); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return Event.map(this.view.onContextMenu, asTreeContextMenuEvent); }

	get onKeyDown(): Event<KeyboardEvent> { return this.view.onKeyDown; }
	get onKeyUp(): Event<KeyboardEvent> { return this.view.onKeyUp; }
	get onKeyPress(): Event<KeyboardEvent> { return this.view.onKeyPress; }

	get onDidFocus(): Event<void> { return this.view.onDidFocus; }
	get onDidBlur(): Event<void> { return this.view.onDidBlur; }

	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T, TFilterData>> { return this.model.onDidChangeCollapseState; }
	get onDidChangeRenderNodeCount(): Event<ITreeNode<T, TFilterData>> { return this.model.onDidChangeRenderNodeCount; }

	get onDidDispose(): Event<void> { return this.view.onDidDispose; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		options: IAbstractTreeOptions<T, TFilterData> = {}
	) {
		const treeDelegate = new ComposedTreeDelegate<T, ITreeNode<T, TFilterData>>(delegate);

		const onDidChangeCollapseStateRelay = new Relay<ICollapseStateChangeEvent<T, TFilterData>>();
		const treeRenderers = renderers.map(r => new TreeRenderer<T, TFilterData, any>(r, onDidChangeCollapseStateRelay.event));
		this.disposables.push(...treeRenderers);

		this.view = new List(container, treeDelegate, treeRenderers, asListOptions(options));

		this.model = this.createModel(this.view, options);
		onDidChangeCollapseStateRelay.input = this.model.onDidChangeCollapseState;

		this.view.onMouseClick(this.reactOnMouseClick, this, this.disposables);

		if (options.keyboardSupport !== false) {
			const onKeyDown = Event.chain(this.view.onKeyDown)
				.filter(e => !isInputElement(e.target as HTMLElement))
				.map(e => new StandardKeyboardEvent(e));

			onKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow).on(this.onLeftArrow, this, this.disposables);
			onKeyDown.filter(e => e.keyCode === KeyCode.RightArrow).on(this.onRightArrow, this, this.disposables);
			onKeyDown.filter(e => e.keyCode === KeyCode.Space).on(this.onSpace, this, this.disposables);
		}
	}

	// Widget

	getHTMLElement(): HTMLElement {
		return this.view.getHTMLElement();
	}

	get contentHeight(): number {
		return this.view.contentHeight;
	}

	get onDidChangeContentHeight(): Event<number> {
		return this.view.onDidChangeContentHeight;
	}

	get scrollTop(): number {
		return this.view.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this.view.scrollTop = scrollTop;
	}

	get scrollHeight(): number {
		return this.view.scrollHeight;
	}

	get renderHeight(): number {
		return this.view.renderHeight;
	}

	domFocus(): void {
		this.view.domFocus();
	}

	isDOMFocused(): boolean {
		return this.getHTMLElement() === document.activeElement;
	}

	layout(height?: number): void {
		this.view.layout(height);
	}

	layoutWidth(width: number): void {
		this.view.layoutWidth(width);
	}

	style(styles: IListStyles): void {
		this.view.style(styles);
	}

	// Tree navigation

	getParentElement(location: TRef): T {
		return this.model.getParentElement(location);
	}

	getFirstElementChild(location: TRef): T | undefined {
		return this.model.getFirstElementChild(location);
	}

	getLastElementAncestor(location?: TRef): T | undefined {
		return this.model.getLastElementAncestor(location);
	}

	// Tree

	getNode(location?: TRef): ITreeNode<T, TFilterData> {
		return this.model.getNode(location);
	}

	collapse(location: TRef, recursive: boolean = false): boolean {
		return this.model.setCollapsed(location, true, recursive);
	}

	expand(location: TRef, recursive: boolean = false): boolean {
		return this.model.setCollapsed(location, false, recursive);
	}

	toggleCollapsed(location: TRef, recursive: boolean = false): boolean {
		return this.model.setCollapsed(location, undefined, recursive);
	}

	expandAll(): void {
		this.model.setCollapsed(this.model.rootRef, false, true);
	}

	collapseAll(): void {
		this.model.setCollapsed(this.model.rootRef, true, true);
	}

	isCollapsible(location: TRef): boolean {
		return this.model.isCollapsible(location);
	}

	isCollapsed(location: TRef): boolean {
		return this.model.isCollapsed(location);
	}

	refilter(): void {
		this.model.refilter();
	}

	setSelection(elements: TRef[], browserEvent?: UIEvent): void {
		const indexes = elements.map(e => this.model.getListIndex(e));
		this.view.setSelection(indexes, browserEvent);
	}

	getSelection(): T[] {
		const nodes = this.view.getSelectedElements();
		return nodes.map(n => n.element);
	}

	setFocus(elements: TRef[], browserEvent?: UIEvent): void {
		const indexes = elements.map(e => this.model.getListIndex(e));
		this.view.setFocus(indexes, browserEvent);
	}

	focusNext(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.view.focusNext(n, loop, browserEvent);
	}

	focusPrevious(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.view.focusPrevious(n, loop, browserEvent);
	}

	focusNextPage(browserEvent?: UIEvent): void {
		this.view.focusNextPage(browserEvent);
	}

	focusPreviousPage(browserEvent?: UIEvent): void {
		this.view.focusPreviousPage(browserEvent);
	}

	focusLast(browserEvent?: UIEvent): void {
		this.view.focusLast(browserEvent);
	}

	focusFirst(browserEvent?: UIEvent): void {
		this.view.focusFirst(browserEvent);
	}

	getFocus(): T[] {
		const nodes = this.view.getFocusedElements();
		return nodes.map(n => n.element);
	}

	open(elements: TRef[]): void {
		const indexes = elements.map(e => this.model.getListIndex(e));
		this.view.open(indexes);
	}

	reveal(location: TRef, relativeTop?: number): void {
		const index = this.model.getListIndex(location);
		this.view.reveal(index, relativeTop);
	}

	/**
	 * Returns the relative position of an element rendered in the list.
	 * Returns `null` if the element isn't *entirely* in the visible viewport.
	 */
	getRelativeTop(location: TRef): number | null {
		const index = this.model.getListIndex(location);
		return this.view.getRelativeTop(index);
	}

	// List

	get visibleNodeCount(): number {
		return this.view.length;
	}

	private reactOnMouseClick(e: IListMouseEvent<ITreeNode<T, TFilterData>>): void {
		const node = e.element;

		if (!node) {
			return;
		}

		const location = this.model.getNodeLocation(node);
		const recursive = e.browserEvent.altKey;

		this.model.setCollapsed(location, undefined, recursive);
	}

	private onLeftArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const nodes = this.view.getFocusedElements();

		if (nodes.length === 0) {
			return;
		}

		const node = nodes[0];
		const location = this.model.getNodeLocation(node);
		const didChange = this.model.setCollapsed(location, true);

		if (!didChange) {
			const parentLocation = this.model.getParentNodeLocation(location);

			if (parentLocation === null) {
				return;
			}

			const parentListIndex = this.model.getListIndex(parentLocation);

			this.view.reveal(parentListIndex);
			this.view.setFocus([parentListIndex]);
		}
	}

	private onRightArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const nodes = this.view.getFocusedElements();

		if (nodes.length === 0) {
			return;
		}

		const node = nodes[0];
		const location = this.model.getNodeLocation(node);
		const didChange = this.model.setCollapsed(location, false);

		if (!didChange) {
			if (node.children.length === 0) {
				return;
			}

			const [focusedIndex] = this.view.getFocus();
			const firstChildIndex = focusedIndex + 1;

			this.view.reveal(firstChildIndex);
			this.view.setFocus([firstChildIndex]);
		}
	}

	private onSpace(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const nodes = this.view.getFocusedElements();

		if (nodes.length === 0) {
			return;
		}

		const node = nodes[0];
		const location = this.model.getNodeLocation(node);
		const recursive = e.browserEvent.altKey;

		this.model.setCollapsed(location, undefined, recursive);
	}

	protected abstract createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: IAbstractTreeOptions<T, TFilterData>): ITreeModel<T, TFilterData, TRef>;

	navigate(start?: TRef): ITreeNavigator<T> {
		return new TreeNavigator(this.view, this.model, start);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.view.dispose();
	}
}

interface ITreeNavigatorView<T extends NonNullable<any>, TFilterData> {
	readonly length: number;
	element(index: number): ITreeNode<T, TFilterData>;
}

class TreeNavigator<T extends NonNullable<any>, TFilterData, TRef> implements ITreeNavigator<T> {

	private index: number;

	constructor(private view: ITreeNavigatorView<T, TFilterData>, private model: ITreeModel<T, TFilterData, TRef>, start?: TRef) {
		if (start) {
			this.index = this.model.getListIndex(start);
		} else {
			this.index = -1;
		}
	}

	current(): T | null {
		if (this.index < 0 || this.index >= this.view.length) {
			return null;
		}

		return this.view.element(this.index).element;
	}

	previous(): T | null {
		this.index--;
		return this.current();
	}

	next(): T | null {
		this.index++;
		return this.current();
	}

	parent(): T | null {
		if (this.index < 0 || this.index >= this.view.length) {
			return null;
		}

		const node = this.view.element(this.index);

		if (!node.parent) {
			this.index = -1;
			return this.current();
		}

		this.index = this.model.getListIndex(this.model.getNodeLocation(node.parent));
		return this.current();
	}

	first(): T | null {
		this.index = 0;
		return this.current();
	}

	last(): T | null {
		this.index = this.view.length - 1;
		return this.current();
	}
}