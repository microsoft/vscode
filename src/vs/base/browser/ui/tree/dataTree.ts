/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeOptions, ComposedTreeDelegate, createComposedTreeListOptions, ITreeEvent, ITreeContextMenuEvent, ITreeMouseEvent } from 'vs/base/browser/ui/tree/abstractTree';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeElement, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Emitter, Event, mapEvent } from 'vs/base/common/event';
import { timeout } from 'vs/base/common/async';
import { ISequence } from 'vs/base/common/iterator';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';

export interface IDataSource<T extends NonNullable<any>> {
	hasChildren(element: T | null): boolean;
	getChildren(element: T | null): Thenable<T[]>;
}

enum DataTreeNodeState {
	Uninitialized,
	Loaded,
	Loading,
	Slow
}

interface IDataTreeNode<T extends NonNullable<any>> {
	readonly element: T | null;
	readonly parent: IDataTreeNode<T> | null;
	state: DataTreeNodeState;
}

interface IDataTreeListTemplateData<T> {
	templateData: T;
}

class DataTreeNodeWrapper<T, TFilterData> implements ITreeNode<T, TFilterData> {

	get element(): T { return this.node.element.element!; }
	get parent(): ITreeNode<T, TFilterData> | undefined { return this.node.parent && new DataTreeNodeWrapper(this.node.parent); }
	get children(): ITreeNode<T, TFilterData>[] { return this.node.children.map(node => new DataTreeNodeWrapper(node)); }
	get depth(): number { return this.node.depth; }
	get collapsible(): boolean { return this.node.collapsible; }
	get collapsed(): boolean { return this.node.collapsed; }
	get visible(): boolean { return this.node.visible; }
	get filterData(): TFilterData | undefined { return this.node.filterData; }

	constructor(private node: ITreeNode<IDataTreeNode<T>, TFilterData>) { }
}

class DataTreeRenderer<T, TFilterData, TTemplateData> implements ITreeRenderer<IDataTreeNode<T>, TFilterData, IDataTreeListTemplateData<TTemplateData>> {

	readonly templateId: string;
	private renderedNodes = new Map<IDataTreeNode<T>, IDataTreeListTemplateData<TTemplateData>>();
	private disposables: IDisposable[] = [];

	constructor(
		private renderer: ITreeRenderer<T, TFilterData, TTemplateData>,
		readonly onDidChangeTwistieState: Event<IDataTreeNode<T>>
	) {
		this.templateId = renderer.templateId;
	}

	renderTemplate(container: HTMLElement): IDataTreeListTemplateData<TTemplateData> {
		const templateData = this.renderer.renderTemplate(container);
		return { templateData };
	}

	renderElement(node: ITreeNode<IDataTreeNode<T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.renderElement(new DataTreeNodeWrapper(node), index, templateData.templateData);
	}

	renderTwistie(element: IDataTreeNode<T>, twistieElement: HTMLElement): boolean {
		if (element.state === DataTreeNodeState.Slow) {
			twistieElement.innerText = '🤨';
			return true;
		}

		return false;
	}

	disposeElement(node: ITreeNode<IDataTreeNode<T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeElement(new DataTreeNodeWrapper(node), index, templateData.templateData);
	}

	disposeTemplate(templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.disposables = dispose(this.disposables);
	}
}

function asTreeEvent<T>(e: ITreeEvent<IDataTreeNode<T>>): ITreeEvent<T> {
	return {
		browserEvent: e.browserEvent,
		elements: e.elements.map(e => e.element!)
	};
}

function asTreeMouseEvent<T>(e: ITreeMouseEvent<IDataTreeNode<T>>): ITreeMouseEvent<T> {
	return {
		browserEvent: e.browserEvent,
		element: e.element && e.element.element!
	};
}

function asTreeContextMenuEvent<T>(e: ITreeContextMenuEvent<IDataTreeNode<T>>): ITreeContextMenuEvent<T> {
	return {
		browserEvent: e.browserEvent,
		element: e.element && e.element.element!,
		anchor: e.anchor
	};
}

export enum ChildrenResolutionReason {
	Refresh,
	Expand
}

export interface IChildrenResolutionEvent<T> {
	readonly element: T | null;
	readonly reason: ChildrenResolutionReason;
}

export class DataTree<T extends NonNullable<any>, TFilterData = void> implements IDisposable {

	private tree: ObjectTree<IDataTreeNode<T>, TFilterData>;
	private root: IDataTreeNode<T>;
	private nodes = new Map<T | null, IDataTreeNode<T>>();

	private _onDidChangeNodeState = new Emitter<IDataTreeNode<T>>();

	protected disposables: IDisposable[] = [];

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return mapEvent(this.tree.onDidChangeFocus, asTreeEvent); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return mapEvent(this.tree.onDidChangeSelection, asTreeEvent); }
	get onDidChangeCollapseState(): Event<T> { return mapEvent(this.tree.onDidChangeCollapseState, e => e.element.element!); }

	private _onDidResolveChildren = new Emitter<IChildrenResolutionEvent<T>>();
	readonly onDidResolveChildren: Event<IChildrenResolutionEvent<T>> = this._onDidResolveChildren.event;

	get onMouseClick(): Event<ITreeMouseEvent<T>> { return mapEvent(this.tree.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return mapEvent(this.tree.onMouseDblClick, asTreeMouseEvent); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return mapEvent(this.tree.onContextMenu, asTreeContextMenuEvent); }
	get onDidFocus(): Event<void> { return this.tree.onDidFocus; }
	get onDidBlur(): Event<void> { return this.tree.onDidBlur; }

	get onDidDispose(): Event<void> { return this.tree.onDidDispose; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		private dataSource: IDataSource<T>,
		options?: ITreeOptions<T, TFilterData>
	) {
		const objectTreeDelegate = new ComposedTreeDelegate<T | null, IDataTreeNode<T>>(delegate);
		const objectTreeRenderers = renderers.map(r => new DataTreeRenderer(r, this._onDidChangeNodeState.event));
		const objectTreeOptions = createComposedTreeListOptions<T | null, IDataTreeNode<T>>(options);

		this.tree = new ObjectTree(container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
		this.root = {
			element: null,
			parent: null,
			state: DataTreeNodeState.Uninitialized,
		};

		this.nodes.set(null, this.root);

		this.tree.onDidChangeCollapseState(this._onDidChangeCollapseState, this, this.disposables);
	}

	// Widget

	getHTMLElement(): HTMLElement {
		return this.tree.getHTMLElement();
	}

	domFocus(): void {
		this.tree.domFocus();
	}

	layout(height?: number): void {
		this.tree.layout(height);
	}

	style(styles: IListStyles): void {
		this.tree.style(styles);
	}

	// Data Tree

	refresh(element: T | null): Thenable<void> {
		return this.refreshNode(this.getNode(element), ChildrenResolutionReason.Refresh);
	}

	// Tree

	get visibleNodeCount(): number {
		return this.tree.visibleNodeCount;
	}

	collapse(element: T): boolean {
		return this.tree.collapse(this.getNode(element));
	}

	expand(element: T): boolean {
		return this.tree.expand(this.getNode(element));
	}

	toggleCollapsed(element: T): void {
		this.tree.toggleCollapsed(this.getNode(element));
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	isCollapsed(element: T): boolean {
		return this.tree.isCollapsed(this.getNode(element));
	}

	isExpanded(element: T): boolean {
		return this.tree.isExpanded(this.getNode(element));
	}

	refilter(): void {
		this.tree.refilter();
	}

	setSelection(elements: T[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.getNode(e));
		this.tree.setSelection(nodes, browserEvent);
	}

	getSelection(): T[] {
		const nodes = this.tree.getSelection();
		return nodes.map(n => n.element!);
	}

	setFocus(elements: T[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.getNode(e));
		this.tree.setFocus(nodes, browserEvent);
	}

	focusNext(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.tree.focusNext(n, loop, browserEvent);
	}

	focusPrevious(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.tree.focusPrevious(n, loop, browserEvent);
	}

	focusNextPage(browserEvent?: UIEvent): void {
		this.tree.focusNextPage(browserEvent);
	}

	focusPreviousPage(browserEvent?: UIEvent): void {
		this.tree.focusPreviousPage(browserEvent);
	}

	focusLast(browserEvent?: UIEvent): void {
		this.tree.focusLast(browserEvent);
	}

	focusFirst(browserEvent?: UIEvent): void {
		this.tree.focusFirst(browserEvent);
	}

	getFocus(): T[] {
		const nodes = this.tree.getFocus();
		return nodes.map(n => n.element!);
	}

	open(elements: T[]): void {
		const nodes = elements.map(e => this.getNode(e));
		this.tree.open(nodes);
	}

	reveal(element: T, relativeTop?: number): void {
		this.tree.reveal(this.getNode(element), relativeTop);
	}

	getRelativeTop(element: T): number | null {
		return this.tree.getRelativeTop(this.getNode(element));
	}

	// Tree navigation

	getParentElement(element: T): T | null {
		const node = this.tree.getParentElement(this.getNode(element));
		return node && node.element;
	}

	getFirstElementChild(element: T | null = null): T | null {
		const node = this.tree.getFirstElementChild(this.getNode(element));
		return node && node.element;
	}

	getLastElementAncestor(element: T | null = null): T | null {
		const node = this.tree.getLastElementAncestor(this.getNode(element));
		return node && node.element;
	}

	// Implementation

	private getNode(element: T | null): IDataTreeNode<T> {
		const node: IDataTreeNode<T> = this.nodes.get(element);

		if (typeof node === 'undefined') {
			throw new Error(`Data tree node not found: ${element}`);
		}

		return node;
	}

	private refreshNode(node: IDataTreeNode<T>, reason: ChildrenResolutionReason): Thenable<void> {
		const hasChildren = this.dataSource.hasChildren(node.element);

		if (!hasChildren) {
			this.setChildren(node === this.root ? null : node);
			return Promise.resolve();
		} else {
			node.state = DataTreeNodeState.Loading;
			this._onDidChangeNodeState.fire(node);

			const slowTimeout = timeout(800);

			slowTimeout.then(() => {
				node.state = DataTreeNodeState.Slow;
				this._onDidChangeNodeState.fire(node);
			}, _ => null);

			return this.dataSource.getChildren(node.element)
				.then(children => {
					slowTimeout.cancel();
					node.state = DataTreeNodeState.Loaded;
					this._onDidChangeNodeState.fire(node);

					const createTreeElement = (element: T): ITreeElement<IDataTreeNode<T>> => {
						const collapsible = this.dataSource.hasChildren(element);

						return {
							element: {
								element: element,
								state: DataTreeNodeState.Uninitialized,
								parent: node
							},
							collapsible,
							collapsed: true
						};
					};

					const nodeChildren = children.map<ITreeElement<IDataTreeNode<T>>>(createTreeElement);
					this.setChildren(node === this.root ? null : node, nodeChildren);
					this._onDidResolveChildren.fire({ element: node.element, reason });
				}, err => {
					slowTimeout.cancel();
					node.state = DataTreeNodeState.Uninitialized;
					this._onDidChangeNodeState.fire(node);

					if (node !== this.root) {
						this.tree.collapse(node);
					}

					return Promise.reject(err);
				});
		}
	}

	private _onDidChangeCollapseState(treeNode: ITreeNode<IDataTreeNode<T>, any>): void {
		if (!treeNode.collapsed && treeNode.element.state === DataTreeNodeState.Uninitialized) {
			this.refreshNode(treeNode.element, ChildrenResolutionReason.Expand);
		}
	}

	private setChildren(element: IDataTreeNode<T> | null, children?: ISequence<ITreeElement<IDataTreeNode<T>>>): void {
		const insertedElements = new Set<T>();

		const onDidCreateNode = (node: ITreeNode<IDataTreeNode<T>, TFilterData>) => {
			if (node.element.element) {
				insertedElements.add(node.element.element);
				this.nodes.set(node.element.element, node.element);
			}
		};

		const onDidDeleteNode = (node: ITreeNode<IDataTreeNode<T>, TFilterData>) => {
			if (node.element.element) {
				if (!insertedElements.has(node.element.element)) {
					this.nodes.delete(node.element.element);
				}
			}
		};

		this.tree.setChildren(element, children, onDidCreateNode, onDidDeleteNode);
	}


	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
