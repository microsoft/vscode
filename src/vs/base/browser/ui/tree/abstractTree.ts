/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IListOptions, List, IIdentityProvider, IMultipleSelectionController } from 'vs/base/browser/ui/list/listWidget';
import { IVirtualDelegate, IRenderer, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { append, $ } from 'vs/base/browser/dom';
import { Event, Relay, chain, mapEvent } from 'vs/base/common/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ITreeModel, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { ISpliceable } from 'vs/base/common/sequence';
import { IIndexTreeModelOptions } from 'vs/base/browser/ui/tree/indexTreeModel';
import { memoize } from 'vs/base/common/decorators';

export function createComposedTreeListOptions<T, N extends { element: T }>(options?: IListOptions<T>): IListOptions<N> {
	if (!options) {
		return undefined;
	}

	let identityProvider: IIdentityProvider<N> | undefined = undefined;
	let multipleSelectionController: IMultipleSelectionController<N> | undefined = undefined;

	if (options.identityProvider) {
		identityProvider = el => options.identityProvider(el.element);
	}

	if (options.multipleSelectionController) {
		multipleSelectionController = {
			isSelectionSingleChangeEvent(e) {
				return options.multipleSelectionController.isSelectionSingleChangeEvent({ ...e, element: e.element } as any);
			},
			isSelectionRangeChangeEvent(e) {
				return options.multipleSelectionController.isSelectionRangeChangeEvent({ ...e, element: e.element } as any);
			}
		};
	}

	return {
		...options,
		identityProvider,
		multipleSelectionController
	};
}

export class ComposedTreeDelegate<T, N extends { element: T }> implements IVirtualDelegate<N> {

	constructor(private delegate: IVirtualDelegate<T>) { }

	getHeight(element: N): number {
		return this.delegate.getHeight(element.element);
	}

	getTemplateId(element: N): string {
		return this.delegate.getTemplateId(element.element);
	}
}

interface ITreeListTemplateData<T> {
	twistie: HTMLElement;
	templateData: T;
}

function renderDefaultTwistie<T>(node: ITreeNode<T, any>, twistie: HTMLElement): void {
	if (node.children.length === 0 && !node.collapsible) {
		twistie.innerText = '';
	} else {
		twistie.innerText = node.collapsed ? '▹' : '◢';
	}
}

export interface ITreeRenderer<TElement, TTemplateData> extends IRenderer<TElement, TTemplateData> {
	renderTwistie?(element: TElement, twistieElement: HTMLElement): boolean;
	onDidChangeTwistieState?: Event<TElement>;
}

class TreeRenderer<T, TFilterData, TTemplateData> implements IRenderer<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>> {

	readonly templateId: string;
	private renderedElements = new Map<T, ITreeNode<T, TFilterData>>();
	private renderedNodes = new Map<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>>();
	private disposables: IDisposable[] = [];

	constructor(
		private renderer: ITreeRenderer<T, TTemplateData>,
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
		const twistie = append(el, $('.tl-twistie'));
		const contents = append(el, $('.tl-contents'));
		const templateData = this.renderer.renderTemplate(contents);

		return { twistie, templateData };
	}

	renderElement(node: ITreeNode<T, TFilterData>, index: number, templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderedNodes.set(node, templateData);
		this.renderedElements.set(node.element, node);

		templateData.twistie.style.width = `${10 + node.depth * 10}px`;
		this.renderTwistie(node, templateData.twistie);

		this.renderer.renderElement(node.element, index, templateData.templateData);
	}

	disposeElement(node: ITreeNode<T, TFilterData>, index: number, templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeElement(node.element, index, templateData.templateData);
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
		if (this.renderer.renderTwistie && this.renderer.renderTwistie(node.element, twistieElement)) {
			return;
		}

		renderDefaultTwistie(node, twistieElement);
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

export interface ITreeOptions<T, TFilterData = void> extends IListOptions<T>, IIndexTreeModelOptions<T, TFilterData> { }

export abstract class AbstractTree<T, TFilterData, TRef> implements IDisposable {

	private view: List<ITreeNode<T, TFilterData>>;
	protected model: ITreeModel<T, TFilterData, TRef>;
	protected disposables: IDisposable[] = [];

	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>>;

	@memoize get onDidChangeFocus(): Event<T[]> {
		return mapEvent(this.view.onFocusChange, e => e.elements.map(e => e.element));
	}

	@memoize get onDidChangeSelection(): Event<T[]> {
		return mapEvent(this.view.onSelectionChange, e => e.elements.map(e => e.element));
	}

	constructor(
		container: HTMLElement,
		delegate: IVirtualDelegate<T>,
		renderers: ITreeRenderer<T, any>[],
		options?: ITreeOptions<T, TFilterData>
	) {
		const treeDelegate = new ComposedTreeDelegate<T, ITreeNode<T, TFilterData>>(delegate);

		const onDidChangeCollapseStateRelay = new Relay<ITreeNode<T, TFilterData>>();
		const treeRenderers = renderers.map(r => new TreeRenderer<T, TFilterData, any>(r, onDidChangeCollapseStateRelay.event));
		this.disposables.push(...treeRenderers);

		this.view = new List(container, treeDelegate, treeRenderers, createComposedTreeListOptions<T, ITreeNode<T, TFilterData>>(options));
		this.model = this.createModel(this.view, options);
		onDidChangeCollapseStateRelay.input = this.model.onDidChangeCollapseState;
		this.onDidChangeCollapseState = this.model.onDidChangeCollapseState;

		this.view.onMouseClick(this.onMouseClick, this, this.disposables);

		const onKeyDown = chain(this.view.onKeyDown)
			.filter(e => !isInputElement(e.target as HTMLElement))
			.map(e => new StandardKeyboardEvent(e));

		onKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow).on(this.onLeftArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.RightArrow).on(this.onRightArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.Space).on(this.onSpace, this, this.disposables);
	}

	// TODO@joao rename to `get domElement`
	getHTMLElement(): HTMLElement {
		return this.view.getHTMLElement();
	}

	layout(height?: number): void {
		this.view.layout(height);
	}

	collapse(location: TRef): boolean {
		return this.model.setCollapsed(location, true);
	}

	expand(location: TRef): boolean {
		return this.model.setCollapsed(location, false);
	}

	toggleCollapsed(ref: TRef): void {
		this.model.toggleCollapsed(ref);
	}

	isCollapsed(ref: TRef): boolean {
		return this.model.isCollapsed(ref);
	}

	isExpanded(ref: TRef): boolean {
		return !this.isCollapsed(ref);
	}

	refilter(): void {
		this.model.refilter();
	}

	setSelection(elements: TRef[]): void {
		const indexes = elements.map(e => this.model.getListIndex(e));
		this.view.setSelection(indexes);
	}

	selectNext(n = 1, loop = false): void {
		this.view.selectNext(n, loop);
	}

	selectPrevious(n = 1, loop = false): void {
		this.view.selectPrevious(n, loop);
	}

	getSelection(): T[] {
		const nodes = this.view.getSelectedElements();
		return nodes.map(n => n.element);
	}

	setFocus(elements: TRef[]): void {
		const indexes = elements.map(e => this.model.getListIndex(e));
		this.view.setFocus(indexes);
	}

	focusNext(n = 1, loop = false): void {
		this.view.focusNext();
	}

	focusPrevious(n = 1, loop = false): void {
		this.view.focusPrevious();
	}

	focusNextPage(): void {
		this.view.focusNextPage();
	}

	focusPreviousPage(): void {
		this.view.focusPreviousPage();
	}

	focusLast(): void {
		this.view.focusLast();
	}

	focusFirst(): void {
		this.view.focusFirst();
	}

	getFocus(): T[] {
		const nodes = this.view.getFocusedElements();
		return nodes.map(n => n.element);
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

	private onMouseClick(e: IListMouseEvent<ITreeNode<T, TFilterData>>): void {
		const node = e.element;
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

	protected abstract createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: ITreeOptions<T, TFilterData>): ITreeModel<T, TFilterData, TRef>;

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.view.dispose();
		this.view = null;
		this.model = null;
	}
}