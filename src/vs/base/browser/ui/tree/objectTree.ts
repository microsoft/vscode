/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISequence } from 'vs/base/common/iterator';
import { AbstractTree, IAbstractTreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ISpliceable } from 'vs/base/common/sequence';
import { ITreeNode, ITreeModel, ITreeElement, ITreeRenderer, ITreeSorter, ICollapseStateChangeEvent } from 'vs/base/browser/ui/tree/tree';
import { ObjectTreeModel, IObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';
import { IListVirtualDelegate, IKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/list/list';
import { Event } from 'vs/base/common/event';
import { CompressibleObjectTreeModel, ElementMapper, ICompressedTreeNode, ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { memoize } from 'vs/base/common/decorators';

export interface IObjectTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> {
	sorter?: ITreeSorter<T>;
}

export class ObjectTree<T extends NonNullable<any>, TFilterData = void> extends AbstractTree<T | null, TFilterData, T | null> {

	protected model!: IObjectTreeModel<T, TFilterData>;

	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T | null, TFilterData>> { return this.model.onDidChangeCollapseState; }

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		options: IObjectTreeOptions<T, TFilterData> = {}
	) {
		super(user, container, delegate, renderers, options);
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

	protected createModel(user: string, view: ISpliceable<ITreeNode<T, TFilterData>>, options: IObjectTreeOptions<T, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new ObjectTreeModel(user, view, options);
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

	@memoize
	private get compressedTreeNodeProvider(): ICompressedTreeNodeProvider<T, TFilterData> {
		return this._compressedTreeNodeProvider();
	}

	constructor(private _compressedTreeNodeProvider: () => ICompressedTreeNodeProvider<T, TFilterData>, private renderer: ICompressibleTreeRenderer<T, TFilterData, TTemplateData>) {
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

export interface ICompressibleKeyboardNavigationLabelProvider<T> extends IKeyboardNavigationLabelProvider<T> {
	getCompressedNodeKeyboardNavigationLabel(elements: T[]): { toString(): string | undefined; } | undefined;
}

export interface ICompressibleObjectTreeOptions<T, TFilterData = void> extends IObjectTreeOptions<T, TFilterData> {
	readonly keyboardNavigationLabelProvider?: ICompressibleKeyboardNavigationLabelProvider<T>;
}

function asObjectTreeOptions<T, TFilterData>(compressedTreeNodeProvider: () => ICompressedTreeNodeProvider<T, TFilterData>, options?: ICompressibleObjectTreeOptions<T, TFilterData>): IObjectTreeOptions<T, TFilterData> | undefined {
	return options && {
		...options,
		keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
			getKeyboardNavigationLabel(e: T) {
				let compressedTreeNode: ITreeNode<ICompressedTreeNode<T>, TFilterData>;

				try {
					compressedTreeNode = compressedTreeNodeProvider().getCompressedTreeNode(e);
				} catch {
					return options.keyboardNavigationLabelProvider!.getKeyboardNavigationLabel(e);
				}

				if (compressedTreeNode.element.elements.length === 1) {
					return options.keyboardNavigationLabelProvider!.getKeyboardNavigationLabel(e);
				} else {
					return options.keyboardNavigationLabelProvider!.getCompressedNodeKeyboardNavigationLabel(compressedTreeNode.element.elements);
				}
			}
		}
	};
}

export class CompressibleObjectTree<T extends NonNullable<any>, TFilterData = void> extends ObjectTree<T, TFilterData> implements ICompressedTreeNodeProvider<T, TFilterData> {

	protected model: CompressibleObjectTreeModel<T, TFilterData>;

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ICompressibleTreeRenderer<T, TFilterData, any>[],
		options: ICompressibleObjectTreeOptions<T, TFilterData> = {}
	) {
		const compressedTreeNodeProvider = () => this;
		const compressibleRenderers = renderers.map(r => new CompressibleRenderer(compressedTreeNodeProvider, r));
		super(user, container, delegate, compressibleRenderers, asObjectTreeOptions(compressedTreeNodeProvider, options));
	}

	setChildren(element: T | null, children?: ISequence<ICompressedTreeElement<T>>): void {
		this.model.setChildren(element, children);
	}

	protected createModel(user: string, view: ISpliceable<ITreeNode<T, TFilterData>>, options: ICompressibleObjectTreeOptions<T, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new CompressibleObjectTreeModel(user, view, options);
	}

	isCompressionEnabled(): boolean {
		return this.model.isCompressionEnabled();
	}

	setCompressionEnabled(enabled: boolean): void {
		this.model.setCompressionEnabled(enabled);
	}

	getCompressedTreeNode(element: T): ITreeNode<ICompressedTreeNode<T>, TFilterData> {
		return this.model.getCompressedTreeNode(element)!;
	}
}
