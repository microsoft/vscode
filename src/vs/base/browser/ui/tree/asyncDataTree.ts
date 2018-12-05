/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ComposedTreeDelegate, IAbstractTreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ObjectTree, IObjectTreeOptions } from 'vs/base/browser/ui/tree/objectTree';
import { IListVirtualDelegate, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ITreeElement, ITreeNode, ITreeRenderer, ITreeEvent, ITreeMouseEvent, ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Emitter, Event, mapEvent } from 'vs/base/common/event';
import { timeout, always } from 'vs/base/common/async';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { toggleClass } from 'vs/base/browser/dom';
import { Iterator } from 'vs/base/common/iterator';

export interface IDataSource<T extends NonNullable<any>> {
	hasChildren(element: T | null): boolean;
	getChildren(element: T | null): Thenable<T[]>;
}

enum AsyncDataTreeNodeState {
	Uninitialized,
	Loaded,
	Loading,
	Slow
}

interface IAsyncDataTreeNode<T extends NonNullable<any>> {
	element: T | null;
	readonly parent: IAsyncDataTreeNode<T> | null;
	readonly id?: string | null;
	readonly children?: IAsyncDataTreeNode<T>[];
	state: AsyncDataTreeNodeState;
}

interface IDataTreeListTemplateData<T> {
	templateData: T;
}

class AsyncDataTreeNodeWrapper<T, TFilterData> implements ITreeNode<T, TFilterData> {

	get element(): T { return this.node.element!.element!; }
	get parent(): ITreeNode<T, TFilterData> | undefined { return this.node.parent && new AsyncDataTreeNodeWrapper(this.node.parent); }
	get children(): ITreeNode<T, TFilterData>[] { return this.node.children.map(node => new AsyncDataTreeNodeWrapper(node)); }
	get depth(): number { return this.node.depth; }
	get collapsible(): boolean { return this.node.collapsible; }
	get collapsed(): boolean { return this.node.collapsed; }
	get visible(): boolean { return this.node.visible; }
	get filterData(): TFilterData | undefined { return this.node.filterData; }

	constructor(private node: ITreeNode<IAsyncDataTreeNode<T> | null, TFilterData>) { }
}

class DataTreeRenderer<T, TFilterData, TTemplateData> implements ITreeRenderer<IAsyncDataTreeNode<T>, TFilterData, IDataTreeListTemplateData<TTemplateData>> {

	readonly templateId: string;
	private renderedNodes = new Map<IAsyncDataTreeNode<T>, IDataTreeListTemplateData<TTemplateData>>();
	private disposables: IDisposable[] = [];

	constructor(
		private renderer: ITreeRenderer<T, TFilterData, TTemplateData>,
		readonly onDidChangeTwistieState: Event<IAsyncDataTreeNode<T>>
	) {
		this.templateId = renderer.templateId;
	}

	renderTemplate(container: HTMLElement): IDataTreeListTemplateData<TTemplateData> {
		const templateData = this.renderer.renderTemplate(container);
		return { templateData };
	}

	renderElement(node: ITreeNode<IAsyncDataTreeNode<T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.renderElement(new AsyncDataTreeNodeWrapper(node), index, templateData.templateData);
	}

	renderTwistie(element: IAsyncDataTreeNode<T>, twistieElement: HTMLElement): boolean {
		toggleClass(twistieElement, 'loading', element.state === AsyncDataTreeNodeState.Slow);
		return false;
	}

	disposeElement(node: ITreeNode<IAsyncDataTreeNode<T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeElement(new AsyncDataTreeNodeWrapper(node), index, templateData.templateData);
	}

	disposeTemplate(templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.disposables = dispose(this.disposables);
	}
}

function asTreeEvent<T>(e: ITreeEvent<IAsyncDataTreeNode<T>>): ITreeEvent<T> {
	return {
		browserEvent: e.browserEvent,
		elements: e.elements.map(e => e.element!)
	};
}

function asTreeMouseEvent<T>(e: ITreeMouseEvent<IAsyncDataTreeNode<T>>): ITreeMouseEvent<T> {
	return {
		browserEvent: e.browserEvent,
		element: e.element && e.element.element!
	};
}

function asTreeContextMenuEvent<T>(e: ITreeContextMenuEvent<IAsyncDataTreeNode<T>>): ITreeContextMenuEvent<T> {
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

function asObjectTreeOptions<T, TFilterData>(options?: IAsyncDataTreeOptions<T, TFilterData>): IObjectTreeOptions<IAsyncDataTreeNode<T>, TFilterData> | undefined {
	return options && {
		...options,
		identityProvider: options.identityProvider && {
			getId(el) {
				return options.identityProvider!.getId(el.element!);
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
				return options.accessibilityProvider!.getAriaLabel(e.element!);
			}
		},
		filter: options.filter && {
			filter(element, parentVisibility) {
				return options.filter!.filter(element.element!, parentVisibility);
			}
		}
	};
}

function asTreeElement<T>(node: IAsyncDataTreeNode<T>): ITreeElement<IAsyncDataTreeNode<T>> {
	return {
		element: node,
		children: Iterator.map(Iterator.fromArray(node.children!), asTreeElement)
	};
}

export interface IAsyncDataTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> {
	identityProvider?: IIdentityProvider<T>;
}

export class AsyncDataTree<T extends NonNullable<any>, TFilterData = void> implements IDisposable {

	private readonly tree: ObjectTree<IAsyncDataTreeNode<T>, TFilterData>;
	private readonly root: IAsyncDataTreeNode<T>;
	private readonly nodes = new Map<T | null, IAsyncDataTreeNode<T>>();
	private readonly refreshPromises = new Map<IAsyncDataTreeNode<T>, Thenable<void>>();
	private readonly identityProvider?: IIdentityProvider<T>;

	private readonly _onDidChangeNodeState = new Emitter<IAsyncDataTreeNode<T>>();

	protected readonly disposables: IDisposable[] = [];

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return mapEvent(this.tree.onDidChangeFocus, asTreeEvent); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return mapEvent(this.tree.onDidChangeSelection, asTreeEvent); }
	get onDidChangeCollapseState(): Event<T> { return mapEvent(this.tree.onDidChangeCollapseState, e => e.element!.element!); }

	private readonly _onDidResolveChildren = new Emitter<IChildrenResolutionEvent<T>>();
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
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		private dataSource: IDataSource<T>,
		options?: IAsyncDataTreeOptions<T, TFilterData>
	) {
		this.identityProvider = options && options.identityProvider;

		const objectTreeDelegate = new ComposedTreeDelegate<T | null, IAsyncDataTreeNode<T>>(delegate);
		const objectTreeRenderers = renderers.map(r => new DataTreeRenderer(r, this._onDidChangeNodeState.event));
		const objectTreeOptions = asObjectTreeOptions(options) || {};
		objectTreeOptions.collapseByDefault = true;

		this.tree = new ObjectTree(container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);

		this.root = {
			element: null,
			parent: null,
			state: AsyncDataTreeNodeState.Uninitialized,
		};

		if (this.identityProvider) {
			this.root = {
				...this.root,
				id: null,
				children: [],
			};
		}

		this.nodes.set(null, this.root);

		this.tree.onDidChangeCollapseState(this._onDidChangeCollapseState, this, this.disposables);
	}

	// Widget

	getHTMLElement(): HTMLElement {
		return this.tree.getHTMLElement();
	}

	get contentHeight(): number {
		return this.tree.contentHeight;
	}

	get onDidChangeContentHeight(): Event<number> {
		return this.tree.onDidChangeContentHeight;
	}

	get scrollTop(): number {
		return this.tree.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this.tree.scrollTop = scrollTop;
	}

	get scrollHeight(): number {
		return this.tree.scrollHeight;
	}

	get renderHeight(): number {
		return this.tree.renderHeight;
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

	refresh(element: T | null, recursive = true): Thenable<void> {
		return this.refreshNode(this.getDataNode(element), recursive, ChildrenResolutionReason.Refresh);
	}

	// Tree

	getNode(element: T | null): ITreeNode<T | null, TFilterData> {
		const dataNode = this.getDataNode(element);
		const node = this.tree.getNode(dataNode === this.root ? null : dataNode);
		return new AsyncDataTreeNodeWrapper<T | null, TFilterData>(node);
	}

	collapse(element: T): boolean {
		return this.tree.collapse(this.getDataNode(element));
	}

	async expand(element: T): Promise<boolean> {
		const node = this.getDataNode(element);

		if (!this.tree.isCollapsed(node)) {
			return false;
		}

		this.tree.expand(node);

		if (node.state !== AsyncDataTreeNodeState.Loaded) {
			await this.refreshNode(node, false, ChildrenResolutionReason.Expand);
		}

		return true;
	}

	toggleCollapsed(element: T): void {
		this.tree.toggleCollapsed(this.getDataNode(element));
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	isCollapsible(element: T): boolean {
		return this.tree.isCollapsible(this.getDataNode(element));
	}

	isCollapsed(element: T): boolean {
		return this.tree.isCollapsed(this.getDataNode(element));
	}

	isExpanded(element: T): boolean {
		return this.tree.isExpanded(this.getDataNode(element));
	}

	refilter(): void {
		this.tree.refilter();
	}

	setSelection(elements: T[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.getDataNode(e));
		this.tree.setSelection(nodes, browserEvent);
	}

	getSelection(): T[] {
		const nodes = this.tree.getSelection();
		return nodes.map(n => n!.element!);
	}

	setFocus(elements: T[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.getDataNode(e));
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
		return nodes.map(n => n!.element!);
	}

	open(elements: T[]): void {
		const nodes = elements.map(e => this.getDataNode(e));
		this.tree.open(nodes);
	}

	reveal(element: T, relativeTop?: number): void {
		this.tree.reveal(this.getDataNode(element), relativeTop);
	}

	getRelativeTop(element: T): number | null {
		return this.tree.getRelativeTop(this.getDataNode(element));
	}

	// Tree navigation

	getParentElement(element: T): T | null {
		const node = this.tree.getParentElement(this.getDataNode(element));
		return node && node.element;
	}

	getFirstElementChild(element: T | null = null): T | null | undefined {
		const dataNode = this.getDataNode(element);
		const node = this.tree.getFirstElementChild(dataNode === this.root ? null : dataNode);
		return node && node.element;
	}

	getLastElementAncestor(element: T | null = null): T | null | undefined {
		const dataNode = this.getDataNode(element);
		const node = this.tree.getLastElementAncestor(dataNode === this.root ? null : dataNode);
		return node && node.element;
	}

	// List

	get visibleNodeCount(): number {
		return this.tree.visibleNodeCount;
	}

	// Implementation

	private getDataNode(element: T | null): IAsyncDataTreeNode<T> {
		const node: IAsyncDataTreeNode<T> = this.nodes.get(element);

		if (typeof node === 'undefined') {
			throw new Error(`Data tree node not found: ${element}`);
		}

		return node;
	}

	private async refreshNode(node: IAsyncDataTreeNode<T>, recursive: boolean, reason: ChildrenResolutionReason): Promise<void> {
		await this._refreshNode(node, recursive, reason);

		if (recursive && node.children) {
			await Promise.all(node.children.map(child => this.refreshNode(child, recursive, reason)));
		}
	}

	private _refreshNode(node: IAsyncDataTreeNode<T>, recursive: boolean, reason: ChildrenResolutionReason): Thenable<void> {
		let result = this.refreshPromises.get(node);

		if (result) {
			return result;
		}

		result = this.doRefresh(node, recursive, reason);
		this.refreshPromises.set(node, result);
		return always(result, () => this.refreshPromises.delete(node));
	}

	private doRefresh(node: IAsyncDataTreeNode<T>, recursive: boolean, reason: ChildrenResolutionReason): Thenable<void> {
		const hasChildren = !!this.dataSource.hasChildren(node.element);

		if (!hasChildren) {
			this.setChildren(node, [], recursive);
			return Promise.resolve();
		} else if (node !== this.root && (!this.tree.isCollapsible(node) || this.tree.isCollapsed(node))) {
			return Promise.resolve();
		} else {
			node.state = AsyncDataTreeNodeState.Loading;
			this._onDidChangeNodeState.fire(node);

			const slowTimeout = timeout(800);

			slowTimeout.then(() => {
				node.state = AsyncDataTreeNodeState.Slow;
				this._onDidChangeNodeState.fire(node);
			}, _ => null);

			return this.dataSource.getChildren(node.element)
				.then(children => {
					slowTimeout.cancel();
					node.state = AsyncDataTreeNodeState.Loaded;
					this._onDidChangeNodeState.fire(node);

					this.setChildren(node, children, recursive);
					this._onDidResolveChildren.fire({ element: node.element, reason });
				}, err => {
					slowTimeout.cancel();
					node.state = AsyncDataTreeNodeState.Uninitialized;
					this._onDidChangeNodeState.fire(node);

					if (node !== this.root) {
						this.tree.collapse(node);
					}

					return Promise.reject(err);
				});
		}
	}

	private _onDidChangeCollapseState(treeNode: ITreeNode<IAsyncDataTreeNode<T>, any>): void {
		if (!treeNode.collapsed && treeNode.element.state === AsyncDataTreeNodeState.Uninitialized) {
			this.refreshNode(treeNode.element, false, ChildrenResolutionReason.Expand);
		}
	}

	private setChildren(node: IAsyncDataTreeNode<T>, childrenElements: T[], recursive: boolean): void {
		const children = childrenElements.map<ITreeElement<IAsyncDataTreeNode<T>>>(element => {
			if (!this.identityProvider) {
				return {
					element: {
						element,
						parent: node,
						state: AsyncDataTreeNodeState.Uninitialized
					},
					collapsible: !!this.dataSource.hasChildren(element),
					collapsed: true
				};
			}

			const nodeChildren = new Map<string, IAsyncDataTreeNode<T>>();

			for (const child of node.children!) {
				nodeChildren.set(child.id!, child);
			}

			const id = this.identityProvider.getId(element).toString();
			const asyncDataTreeNode = nodeChildren.get(id);

			if (!asyncDataTreeNode) {
				return {
					element: {
						element,
						parent: node,
						id,
						children: [],
						state: AsyncDataTreeNodeState.Uninitialized
					},
					collapsible: !!this.dataSource.hasChildren(element),
					collapsed: true
				};
			}

			asyncDataTreeNode.element = element;

			const collapsible = !!this.dataSource.hasChildren(element);
			const collapsed = !collapsible || this.tree.isCollapsed(asyncDataTreeNode);

			if (recursive) {
				asyncDataTreeNode.state = AsyncDataTreeNodeState.Uninitialized;

				if (this.tree.isCollapsed(asyncDataTreeNode)) {
					asyncDataTreeNode.children!.length = 0;

					return {
						element: asyncDataTreeNode,
						collapsible,
						collapsed
					};
				}
			}

			let children: Iterator<ITreeElement<IAsyncDataTreeNode<T>>> | undefined = undefined;

			if (collapsible) {
				children = Iterator.map(Iterator.fromArray(asyncDataTreeNode.children!), asTreeElement);
			}

			return {
				element: asyncDataTreeNode,
				children,
				collapsible,
				collapsed
			};
		});

		const insertedElements = new Set<T>();

		const onDidCreateNode = (treeNode: ITreeNode<IAsyncDataTreeNode<T>, TFilterData>) => {
			if (treeNode.element.element) {
				insertedElements.add(treeNode.element.element);
				this.nodes.set(treeNode.element.element, treeNode.element);
			}
		};

		const onDidDeleteNode = (treeNode: ITreeNode<IAsyncDataTreeNode<T>, TFilterData>) => {
			if (treeNode.element.element) {
				if (!insertedElements.has(treeNode.element.element)) {
					this.nodes.delete(treeNode.element.element);
				}
			}
		};

		this.tree.setChildren(node === this.root ? null : node, children, onDidCreateNode, onDidDeleteNode);

		if (this.identityProvider) {
			node.children!.splice(0, node.children!.length, ...children.map(c => c.element));
		}
	}

	dispose(): void {
		dispose(this.disposables);
	}
}
