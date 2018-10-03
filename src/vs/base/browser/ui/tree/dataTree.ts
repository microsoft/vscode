/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeOptions, ComposedTreeDelegate, createComposedTreeListOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { IVirtualDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { ITreeElement, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

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
	Loading
}

interface IDataTreeNode<T extends NonNullable<any>> {
	readonly element: T | null;
	readonly parent: IDataTreeNode<T> | null;
	state: DataTreeNodeState;
}

interface IDataTreeListTemplateData<T> {
	templateData: T;
}

class DataTreeRenderer<T, TTemplateData> implements IRenderer<IDataTreeNode<T>, IDataTreeListTemplateData<TTemplateData>> {

	readonly templateId: string;

	constructor(private renderer: IRenderer<T, TTemplateData>) {
		this.templateId = renderer.templateId;
	}

	renderTemplate(container: HTMLElement): IDataTreeListTemplateData<TTemplateData> {
		const templateData = this.renderer.renderTemplate(container);

		return { templateData };
	}

	renderElement(node: IDataTreeNode<T>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.renderElement(node.element, index, templateData.templateData);
	}

	disposeElement(node: IDataTreeNode<T>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeElement(node.element, index, templateData.templateData);
	}

	disposeTemplate(templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}
}

export class DataTree<T extends NonNullable<any>, TFilterData = void> implements IDisposable {

	private tree: ObjectTree<IDataTreeNode<T>, TFilterData>;
	private root: IDataTreeNode<T>;
	private nodes = new Map<T, IDataTreeNode<T>>();

	private disposables: IDisposable[] = [];

	constructor(
		container: HTMLElement,
		delegate: IVirtualDelegate<T>,
		renderers: IRenderer<T, any>[],
		private dataSource: IDataSource<T>,
		options?: ITreeOptions<T, TFilterData>
	) {
		const treeDelegate = new ComposedTreeDelegate<T, IDataTreeNode<T>>(delegate);
		const treeRenderers = renderers.map(r => new DataTreeRenderer(r));
		const treeOptions = createComposedTreeListOptions<T, IDataTreeNode<T>>(options);

		this.tree = new ObjectTree(container, treeDelegate, treeRenderers, treeOptions);
		this.root = {
			element: null,
			parent: null,
			state: DataTreeNodeState.Uninitialized,
		};

		this.nodes.set(null, this.root);

		this.tree.onDidChangeCollapseState(this.onDidChangeCollapseState, this, this.disposables);
	}

	refresh(element: T | null): Thenable<void> {
		const node: IDataTreeNode<T> = this.nodes.get(element);

		if (typeof node === 'undefined') {
			throw new Error(`Data tree node not found: ${element}`);
		}

		return this.refreshNode(node);
	}

	private refreshNode(node: IDataTreeNode<T>): Thenable<void> {
		const hasChildren = this.dataSource.hasChildren(node.element);

		if (!hasChildren) {
			this.tree.setChildren(node === this.root ? null : node);
			return Promise.resolve(null);
		} else {
			node.state = DataTreeNodeState.Loading;

			return this.dataSource.getChildren(node.element)
				.then(children => {
					node.state = DataTreeNodeState.Loaded;

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
					node.state = DataTreeNodeState.Uninitialized;

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

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}