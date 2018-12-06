/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IListOptions, List, IMultipleSelectionController, IListStyles, IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IListVirtualDelegate, IListRenderer, IListMouseEvent, IListEvent, IListContextMenuEvent, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { Event, Relay, chain, mapEvent } from 'vs/base/common/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ITreeModel, ITreeNode, ITreeRenderer, ITreeEvent, ITreeMouseEvent, ITreeContextMenuEvent, ITreeFilter } from 'vs/base/browser/ui/tree/tree';
import { ISpliceable } from 'vs/base/common/sequence';

function asListOptions<T, TFilterData>(options?: IAbstractTreeOptions<T, TFilterData>): IListOptions<ITreeNode<T, TFilterData>> | undefined {
	if (!options) {
		return undefined;
	}

	let identityProvider: IIdentityProvider<ITreeNode<T, TFilterData>> | undefined = undefined;

	if (options.identityProvider) {
		const ip = options.identityProvider;
		identityProvider = {
			getId(el) {
				return ip.getId(el.element);
			}
		};
	}

	let multipleSelectionController: IMultipleSelectionController<ITreeNode<T, TFilterData>> | undefined = undefined;

	if (options.multipleSelectionController) {
		const msc = options.multipleSelectionController;
		multipleSelectionController = {
			isSelectionSingleChangeEvent(e) {
				return msc.isSelectionSingleChangeEvent({ ...e, element: e.element } as any);
			},
			isSelectionRangeChangeEvent(e) {
				return msc.isSelectionRangeChangeEvent({ ...e, element: e.element } as any);
			}
		};
	}

	let accessibilityProvider: IAccessibilityProvider<ITreeNode<T, TFilterData>> | undefined = undefined;

	if (options.accessibilityProvider) {
		const ap = options.accessibilityProvider;
		accessibilityProvider = {
			getAriaLabel(e) {
				return ap.getAriaLabel(e.element);
			}
		};
	}

	return {
		...options,
		identityProvider,
		multipleSelectionController,
		accessibilityProvider
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
		onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>>
	) {
		this.templateId = renderer.templateId;

		onDidChangeCollapseState(this.onDidChangeNodeTwistieState, this, this.disposables);

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
		this.renderer.disposeElement(node, index, templateData.templateData);
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
	filter?: ITreeFilter<T, TFilterData>;
}

export abstract class AbstractTree<T, TFilterData, TRef> implements IDisposable {

	private view: List<ITreeNode<T, TFilterData>>;
	protected model: ITreeModel<T, TFilterData, TRef>;
	protected disposables: IDisposable[] = [];

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return mapEvent(this.view.onFocusChange, asTreeEvent); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return mapEvent(this.view.onSelectionChange, asTreeEvent); }

	get onMouseClick(): Event<ITreeMouseEvent<T>> { return mapEvent(this.view.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return mapEvent(this.view.onMouseDblClick, asTreeMouseEvent); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return mapEvent(this.view.onContextMenu, asTreeContextMenuEvent); }
	get onDidFocus(): Event<void> { return this.view.onDidFocus; }
	get onDidBlur(): Event<void> { return this.view.onDidBlur; }

	get onDidChangeCollapseState(): Event<ITreeNode<T, TFilterData>> { return this.model.onDidChangeCollapseState; }
	get onDidChangeRenderNodeCount(): Event<ITreeNode<T, TFilterData>> { return this.model.onDidChangeRenderNodeCount; }

	get onDidDispose(): Event<void> { return this.view.onDidDispose; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		options: IAbstractTreeOptions<T, TFilterData> = {}
	) {
		const treeDelegate = new ComposedTreeDelegate<T, ITreeNode<T, TFilterData>>(delegate);

		const onDidChangeCollapseStateRelay = new Relay<ITreeNode<T, TFilterData>>();
		const treeRenderers = renderers.map(r => new TreeRenderer<T, TFilterData, any>(r, onDidChangeCollapseStateRelay.event));
		this.disposables.push(...treeRenderers);

		this.view = new List(container, treeDelegate, treeRenderers, asListOptions(options));

		this.model = this.createModel(this.view, options);
		onDidChangeCollapseStateRelay.input = this.model.onDidChangeCollapseState;

		this.view.onMouseClick(this.reactOnMouseClick, this, this.disposables);

		if (options.keyboardSupport !== false) {
			const onKeyDown = chain(this.view.onKeyDown)
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

	collapse(location: TRef): boolean {
		return this.model.setCollapsed(location, true);
	}

	expand(location: TRef): boolean {
		return this.model.setCollapsed(location, false);
	}

	toggleCollapsed(location: TRef): void {
		this.model.toggleCollapsed(location);
	}

	collapseAll(): void {
		this.model.collapseAll();
	}

	isCollapsible(location: TRef): boolean {
		return this.model.isCollapsible(location);
	}

	isCollapsed(location: TRef): boolean {
		return this.model.isCollapsed(location);
	}

	isExpanded(location: TRef): boolean {
		return !this.isCollapsed(location);
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
		this.model.toggleCollapsed(location);
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
		this.model.toggleCollapsed(location);
	}

	protected abstract createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: IAbstractTreeOptions<T, TFilterData>): ITreeModel<T, TFilterData, TRef>;

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.view.dispose();
	}
}
