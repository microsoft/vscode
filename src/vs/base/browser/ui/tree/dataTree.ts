/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeOptions, ComposedTreeDelegate, createComposedTreeListOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeElement, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { timeout } from 'vs/base/common/async';

export interface IDataTreeElement<T> {
	readonly element: T;
	readonly collapsible?: boolean;
	readonly collapsed?: boolean;
}

export interface IDataSource<T extends NonNullable<any>> {
	hasChildren(element: T | null): boolean;
	getChildren(element: T | null): Thenable<IDataTreeElement<T>[]>;
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

function unpack<T, TFilterData>(node: ITreeNode<IDataTreeNode<T>, TFilterData>): ITreeNode<T, TFilterData> {
	return new Proxy(Object.create(null), {
		get: (_: any, name: string) => {
			switch (name) {
				case 'element': return node.element.element;
				default: return node[name];
			}
		}
	});
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

	renderElement(element: ITreeNode<IDataTreeNode<T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.renderElement(unpack(element), index, templateData.templateData);
	}

	renderTwistie(element: IDataTreeNode<T>, twistieElement: HTMLElement): boolean {
		if (element.state === DataTreeNodeState.Slow) {
			twistieElement.innerText = '🤨';
			return true;
		}

		return false;
	}

	disposeElement(element: ITreeNode<IDataTreeNode<T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeElement(unpack(element), index, templateData.templateData);
	}

	disposeTemplate(templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.disposables = dispose(this.disposables);
	}
}

export class DataTree<T extends NonNullable<any>, TFilterData = void> implements IDisposable {

	private tree: ObjectTree<IDataTreeNode<T>, TFilterData>;
	private root: IDataTreeNode<T>;
	private nodes = new Map<T | null, IDataTreeNode<T>>();

	private _onDidChangeNodeState = new Emitter<IDataTreeNode<T>>();

	private disposables: IDisposable[] = [];

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

		this.tree.onDidChangeCollapseState(this.onDidChangeCollapseState, this, this.disposables);
	}

	layout(height?: number): void {
		this.tree.layout(height);
	}

	refresh(element: T | null): Thenable<void> {
		return this.refreshNode(this.getNode(element));
	}

	private getNode(element: T | null): IDataTreeNode<T> {
		const node: IDataTreeNode<T> = this.nodes.get(element);

		if (typeof node === 'undefined') {
			throw new Error(`Data tree node not found: ${element}`);
		}

		return node;
	}

	private refreshNode(node: IDataTreeNode<T>): Thenable<void> {
		const hasChildren = this.dataSource.hasChildren(node.element);

		if (!hasChildren) {
			this.tree.setChildren(node === this.root ? null : node);
			return Promise.resolve();
		} else {
			node.state = DataTreeNodeState.Loading;
			this._onDidChangeNodeState.fire(node);

			const slowTimeout = timeout(800);

			slowTimeout.then(() => {
				node.state = DataTreeNodeState.Slow;
				this._onDidChangeNodeState.fire(node);
			});

			return this.dataSource.getChildren(node.element)
				.then(children => {
					slowTimeout.cancel();
					node.state = DataTreeNodeState.Loaded;
					this._onDidChangeNodeState.fire(node);

					const createTreeElement = (el: IDataTreeElement<T>): ITreeElement<IDataTreeNode<T>> => {
						return {
							element: {
								element: el.element,
								state: DataTreeNodeState.Uninitialized,
								parent: node
							},
							collapsible: el.collapsible,
							collapsed: typeof el.collapsed === 'boolean' ? el.collapsed : true
						};
					};

					const nodeChildren = children.map<ITreeElement<IDataTreeNode<T>>>(createTreeElement);

					this.tree.setChildren(node === this.root ? null : node, nodeChildren);
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

	private onDidChangeCollapseState(treeNode: ITreeNode<IDataTreeNode<T>, any>): void {
		if (!treeNode.collapsed && treeNode.element.state === DataTreeNodeState.Uninitialized) {
			this.refreshNode(treeNode.element);
		}
	}

	// Tree

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
		return nodes.map(n => n.element);
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
		return nodes.map(n => n.element);
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

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}