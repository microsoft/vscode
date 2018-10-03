/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeOptions, ComposedTreeDelegate, createComposedTreeListOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { IVirtualDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { ITreeElement } from 'vs/base/browser/ui/tree/tree';

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
	Idle,
	Loading
}

interface IDataTreeNode<T extends NonNullable<any>> {
	readonly element: T;
	readonly parent: IDataTreeNode<T> | null;
	state: DataTreeNodeState;
	// promise: Thenable<any>;
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

	disposeElement(node: IDataTreeNode<T>): void {
		// noop
	}

	disposeTemplate(templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}
}

export class DataTree<T extends NonNullable<any>, TFilterData = void> {

	private tree: ObjectTree<IDataTreeNode<T>, TFilterData>;
	private root: IDataTreeNode<T>;
	private nodes = new Map<T, IDataTreeNode<T>>();

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
			element: undefined, // TODO@joao
			parent: null,
			state: DataTreeNodeState.Idle,
		};

		this.nodes.set(null, this.root);
	}

	refresh(element: T | null, recursive = true): Thenable<void> {
		const node: IDataTreeNode<T> = this.nodes.get(element);

		if (typeof node === 'undefined') {
			throw new Error(`Data tree node not found: ${element}`);
		}

		const hasChildren = this.dataSource.hasChildren(element);

		if (!hasChildren) {
			this.tree.setChildren(node === this.root ? null : node);
			return Promise.resolve(null);
		} else {
			node.state = DataTreeNodeState.Loading;

			return this.dataSource.getChildren(element)
				.then(children => {
					node.state = DataTreeNodeState.Idle;

					const createTreeElement = (el: IDataTreeElement<T>): ITreeElement<IDataTreeNode<T>> => {
						return {
							element: {
								element: el.element,
								state: DataTreeNodeState.Idle,
								parent: node
							},
							collapsible: el.collapsible,
							collapsed: typeof el.collapsed === 'boolean' ? el.collapsed : true
						};
					};

					const nodeChildren = children.map<ITreeElement<IDataTreeNode<T>>>(createTreeElement);

					this.tree.setChildren(node === this.root ? null : node, nodeChildren);
				}, err => {
					node.state = DataTreeNodeState.Idle;
					return Promise.reject(err);
				});
		}
	}
}