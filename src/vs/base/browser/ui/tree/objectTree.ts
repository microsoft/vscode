/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISequence } from 'vs/base/common/iterator';
import { AbstractTree, IAbstractTreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ISpliceable } from 'vs/base/common/sequence';
import { ITreeNode, ITreeModel, ITreeElement, ITreeRenderer, ITreeSorter, ICollapseStateChangeEvent } from 'vs/base/browser/ui/tree/tree';
import { ObjectTreeModel, IObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Event } from 'vs/base/common/event';
import { CompressibleObjectTreeModel, ElementMapper, ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';

export interface IObjectTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> {
	sorter?: ITreeSorter<T>;
}

export class ObjectTree<T extends NonNullable<any>, TFilterData = void> extends AbstractTree<T | null, TFilterData, T | null> {

	protected model: IObjectTreeModel<T, TFilterData>;

	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T | null, TFilterData>> { return this.model.onDidChangeCollapseState; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		options: IObjectTreeOptions<T, TFilterData> = {}
	) {
		super(container, delegate, renderers, options);
	}

	setChildren(element: T | null, children?: ISequence<ITreeElement<T>>): void {
		this.model.setChildren(element, children);
	}

	rerender(element?: T): void {
		if (element === undefined) {
			this.view.rerender();
			return;
		}

		this.model.rerender(element);
	}

	resort(element: T, recursive = true): void {
		this.model.resort(element, recursive);
	}

	protected createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: IObjectTreeOptions<T, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new ObjectTreeModel(view, options);
	}
}

interface ICompressedTreeNodeProvider<T, TFilterData> {
	getCompressedTreeNode(element: T): ITreeNode<ICompressedTreeNode<T>, TFilterData>;
}

export interface ICompressibleObjectTreeOptions<T, TFilterData = void> extends IObjectTreeOptions<T, TFilterData> {
	readonly elementMapper?: ElementMapper<T>;
}

export interface ICompressibleTreeRenderer<T, TFilterData = void, TTemplateData = void> extends ITreeRenderer<T, TFilterData, TTemplateData> {
	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<T>, TFilterData>, index: number, templateData: TTemplateData, height: number | undefined): void;
	disposeCompressedElements?(node: ITreeNode<ICompressedTreeNode<T>, TFilterData>, index: number, templateData: TTemplateData, height: number | undefined): void;
}

interface CompressibleTemplateData<T, TFilterData, TTemplateData> {
	compressedTreeNode: ITreeNode<ICompressedTreeNode<T>, TFilterData> | undefined;
	readonly data: TTemplateData;
}

class CompressibleRenderer<T, TFilterData, TTemplateData> implements ITreeRenderer<T, TFilterData, CompressibleTemplateData<T, TFilterData, TTemplateData>> {

	readonly templateId: string;
	readonly onDidChangeTwistieState: Event<T> | undefined;

	compressedTreeNodeProvider: ICompressedTreeNodeProvider<T, TFilterData>;

	constructor(private renderer: ICompressibleTreeRenderer<T, TFilterData, TTemplateData>) {
		this.templateId = renderer.templateId;

		if (renderer.onDidChangeTwistieState) {
			this.onDidChangeTwistieState = renderer.onDidChangeTwistieState;
		}
	}

	renderTemplate(container: HTMLElement): CompressibleTemplateData<T, TFilterData, TTemplateData> {
		const data = this.renderer.renderTemplate(container);
		return { compressedTreeNode: undefined, data };
	}

	renderElement(node: ITreeNode<T, TFilterData>, index: number, templateData: CompressibleTemplateData<T, TFilterData, TTemplateData>, height: number | undefined): void {
		const compressedTreeNode = this.compressedTreeNodeProvider.getCompressedTreeNode(node.element);

		if (compressedTreeNode.element.elements.length === 1) {
			templateData.compressedTreeNode = undefined;
			this.renderer.renderElement(node, index, templateData.data, height);
		} else {
			templateData.compressedTreeNode = compressedTreeNode;
			this.renderer.renderCompressedElements(compressedTreeNode, index, templateData.data, height);
		}
	}

	disposeElement(node: ITreeNode<T, TFilterData>, index: number, templateData: CompressibleTemplateData<T, TFilterData, TTemplateData>, height: number | undefined): void {
		if (templateData.compressedTreeNode) {
			if (this.renderer.disposeCompressedElements) {
				this.renderer.disposeCompressedElements(templateData.compressedTreeNode, index, templateData.data, height);
			}
		} else {
			if (this.renderer.disposeElement) {
				this.renderer.disposeElement(node, index, templateData.data, height);
			}
		}
	}

	disposeTemplate(templateData: CompressibleTemplateData<T, TFilterData, TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.data);
	}

	renderTwistie?(element: T, twistieElement: HTMLElement): void {
		if (this.renderer.renderTwistie) {
			this.renderer.renderTwistie(element, twistieElement);
		}
	}
}

export class CompressibleObjectTree<T extends NonNullable<any>, TFilterData = void> extends ObjectTree<T, TFilterData> {

	protected model: CompressibleObjectTreeModel<T, TFilterData>;

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ICompressibleTreeRenderer<T, TFilterData, any>[],
		options: IObjectTreeOptions<T, TFilterData> = {}
	) {
		const compressibleRenderers = renderers.map(r => new CompressibleRenderer(r));
		super(container, delegate, compressibleRenderers, options);
		compressibleRenderers.forEach(r => r.compressedTreeNodeProvider = this);
	}

	protected createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: ICompressibleObjectTreeOptions<T, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new CompressibleObjectTreeModel(view, options);
	}

	getCompressedTreeNode(element: T): ITreeNode<ICompressedTreeNode<T>, TFilterData> {
		return this.model.getCompressedTreeNode(element)!;
	}
}
