/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from '../list/list.js';
import { AbstractTree, IAbstractTreeOptions, IAbstractTreeOptionsUpdate, IStickyScrollDelegate, StickyScrollNode } from './abstractTree.js';
import { CompressibleObjectTreeModel, ElementMapper, ICompressedTreeElement, ICompressedTreeNode } from './compressedObjectTreeModel.js';
import { IObjectTreeModel, ObjectTreeModel } from './objectTreeModel.js';
import { ICollapseStateChangeEvent, IObjectTreeElement, ITreeElementRenderDetails, ITreeModel, ITreeNode, ITreeRenderer, ITreeSorter } from './tree.js';
import { memoize } from '../../../common/decorators.js';
import { Event } from '../../../common/event.js';
import { Iterable } from '../../../common/iterator.js';

export interface IObjectTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> {
	readonly sorter?: ITreeSorter<T>;
}

export interface IObjectTreeSetChildrenOptions<T> {

	/**
	 * If set, child updates will recurse the given number of levels even if
	 * items in the splice operation are unchanged. `Infinity` is a valid value.
	 */
	readonly diffDepth?: number;

	/**
	 * Identity provider used to optimize splice() calls in the IndexTree. If
	 * this is not present, optimized splicing is not enabled.
	 *
	 * Warning: if this is present, calls to `setChildren()` will not replace
	 * or update nodes if their identity is the same, even if the elements are
	 * different. For this, you should call `rerender()`.
	 */
	readonly diffIdentityProvider?: IIdentityProvider<T>;
}

export class ObjectTree<T extends NonNullable<any>, TFilterData = void> extends AbstractTree<T | null, TFilterData, T | null> {

	protected declare model: IObjectTreeModel<T, TFilterData>;

	override get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T | null, TFilterData>> { return this.model.onDidChangeCollapseState; }

	constructor(
		protected readonly user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		options: IObjectTreeOptions<T, TFilterData> = {}
	) {
		super(user, container, delegate, renderers, options as IObjectTreeOptions<T | null, TFilterData>);
	}

	setChildren(element: T | null, children: Iterable<IObjectTreeElement<T>> = Iterable.empty(), options?: IObjectTreeSetChildrenOptions<T>): void {
		this.model.setChildren(element, children, options);
	}

	rerender(element?: T): void {
		if (element === undefined) {
			this.view.rerender();
			return;
		}

		this.model.rerender(element);
	}

	updateElementHeight(element: T, height: number | undefined): void {
		const elementIndex = this.model.getListIndex(element);
		if (elementIndex === -1) {
			return;
		}

		this.view.updateElementHeight(elementIndex, height);
	}

	resort(element: T | null, recursive = true): void {
		this.model.resort(element, recursive);
	}

	hasElement(element: T): boolean {
		return this.model.has(element);
	}

	protected createModel(user: string, options: IObjectTreeOptions<T | null, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new ObjectTreeModel(user, options);
	}
}

interface ICompressedTreeNodeProvider<T, TFilterData> {
	getCompressedTreeNode(location: T | null): ITreeNode<ICompressedTreeNode<T> | null, TFilterData>;
}

export interface ICompressibleTreeRenderer<T, TFilterData = void, TTemplateData = void> extends ITreeRenderer<T, TFilterData, TTemplateData> {
	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<T>, TFilterData>, index: number, templateData: TTemplateData, details?: ITreeElementRenderDetails): void;
	disposeCompressedElements?(node: ITreeNode<ICompressedTreeNode<T>, TFilterData>, index: number, templateData: TTemplateData, details?: ITreeElementRenderDetails): void;
}

interface CompressibleTemplateData<T, TFilterData, TTemplateData> {
	compressedTreeNode: ITreeNode<ICompressedTreeNode<T>, TFilterData> | undefined;
	readonly data: TTemplateData;
}

class CompressibleRenderer<T extends NonNullable<any>, TFilterData, TTemplateData> implements ITreeRenderer<T, TFilterData, CompressibleTemplateData<T, TFilterData, TTemplateData>> {

	readonly templateId: string;
	readonly onDidChangeTwistieState: Event<T> | undefined;

	@memoize
	private get compressedTreeNodeProvider(): ICompressedTreeNodeProvider<T, TFilterData> {
		return this._compressedTreeNodeProvider();
	}

	constructor(private _compressedTreeNodeProvider: () => ICompressedTreeNodeProvider<T, TFilterData>, private stickyScrollDelegate: CompressibleStickyScrollDelegate<T, TFilterData>, private renderer: ICompressibleTreeRenderer<T, TFilterData, TTemplateData>) {
		this.templateId = renderer.templateId;

		if (renderer.onDidChangeTwistieState) {
			this.onDidChangeTwistieState = renderer.onDidChangeTwistieState;
		}
	}

	renderTemplate(container: HTMLElement): CompressibleTemplateData<T, TFilterData, TTemplateData> {
		const data = this.renderer.renderTemplate(container);
		return { compressedTreeNode: undefined, data };
	}

	renderElement(node: ITreeNode<T, TFilterData>, index: number, templateData: CompressibleTemplateData<T, TFilterData, TTemplateData>, details?: ITreeElementRenderDetails): void {
		let compressedTreeNode = this.stickyScrollDelegate.getCompressedNode(node);
		if (!compressedTreeNode) {
			compressedTreeNode = this.compressedTreeNodeProvider.getCompressedTreeNode(node.element) as ITreeNode<ICompressedTreeNode<T>, TFilterData>;
		}

		if (compressedTreeNode.element.elements.length === 1) {
			templateData.compressedTreeNode = undefined;
			this.renderer.renderElement(node, index, templateData.data, details);
		} else {
			templateData.compressedTreeNode = compressedTreeNode;
			this.renderer.renderCompressedElements(compressedTreeNode, index, templateData.data, details);
		}
	}

	disposeElement(node: ITreeNode<T, TFilterData>, index: number, templateData: CompressibleTemplateData<T, TFilterData, TTemplateData>, details?: ITreeElementRenderDetails): void {
		if (templateData.compressedTreeNode) {
			this.renderer.disposeCompressedElements?.(templateData.compressedTreeNode, index, templateData.data, details);
		} else {
			this.renderer.disposeElement?.(node, index, templateData.data, details);
		}
	}

	disposeTemplate(templateData: CompressibleTemplateData<T, TFilterData, TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.data);
	}

	renderTwistie(element: T, twistieElement: HTMLElement): boolean {
		return this.renderer.renderTwistie?.(element, twistieElement) ?? false;
	}
}

class CompressibleStickyScrollDelegate<T, TFilterData> implements IStickyScrollDelegate<T, TFilterData> {

	private readonly compressedStickyNodes = new Map<ITreeNode<T, TFilterData>, ITreeNode<ICompressedTreeNode<T>, TFilterData>>();

	constructor(private readonly modelProvider: () => CompressibleObjectTreeModel<T, TFilterData>) { }

	getCompressedNode(node: ITreeNode<T, TFilterData>): ITreeNode<ICompressedTreeNode<T>, TFilterData> | undefined {
		return this.compressedStickyNodes.get(node);
	}

	constrainStickyScrollNodes(stickyNodes: StickyScrollNode<T, TFilterData>[], stickyScrollMaxItemCount: number, maxWidgetHeight: number): StickyScrollNode<T, TFilterData>[] {
		this.compressedStickyNodes.clear();
		if (stickyNodes.length === 0) {
			return [];
		}

		for (let i = 0; i < stickyNodes.length; i++) {
			const stickyNode = stickyNodes[i];
			const stickyNodeBottom = stickyNode.position + stickyNode.height;
			const followingReachesMaxHeight = i + 1 < stickyNodes.length && stickyNodeBottom + stickyNodes[i + 1].height > maxWidgetHeight;

			if (followingReachesMaxHeight || i >= stickyScrollMaxItemCount - 1 && stickyScrollMaxItemCount < stickyNodes.length) {
				const uncompressedStickyNodes = stickyNodes.slice(0, i);
				const overflowingStickyNodes = stickyNodes.slice(i);
				const compressedStickyNode = this.compressStickyNodes(overflowingStickyNodes);
				return [...uncompressedStickyNodes, compressedStickyNode];
			}

		}

		return stickyNodes;
	}

	private compressStickyNodes(stickyNodes: StickyScrollNode<T, TFilterData>[]): StickyScrollNode<T, TFilterData> {

		if (stickyNodes.length === 0) {
			throw new Error('Can\'t compress empty sticky nodes');
		}
		const compressionModel = this.modelProvider();
		if (!compressionModel.isCompressionEnabled()) {
			return stickyNodes[0];
		}

		// Collect all elements to be compressed
		const elements: T[] = [];
		for (let i = 0; i < stickyNodes.length; i++) {
			const stickyNode = stickyNodes[i];
			const compressedNode = compressionModel.getCompressedTreeNode(stickyNode.node.element);

			if (compressedNode.element) {
				// if an element is incompressible, it can't be compressed with it's parent element
				if (i !== 0 && compressedNode.element.incompressible) {
					break;
				}
				elements.push(...compressedNode.element.elements);
			}
		}

		if (elements.length < 2) {
			return stickyNodes[0];
		}

		// Compress the elements
		const lastStickyNode = stickyNodes[stickyNodes.length - 1];
		const compressedElement: ICompressedTreeNode<T> = { elements, incompressible: false };
		const compressedNode: ITreeNode<ICompressedTreeNode<T>, TFilterData> = { ...lastStickyNode.node, children: [], element: compressedElement };

		const stickyTreeNode = new Proxy(stickyNodes[0].node, {});

		const compressedStickyNode: StickyScrollNode<T, TFilterData> = {
			node: stickyTreeNode,
			startIndex: stickyNodes[0].startIndex,
			endIndex: lastStickyNode.endIndex,
			position: stickyNodes[0].position,
			height: stickyNodes[0].height,
		};

		this.compressedStickyNodes.set(stickyTreeNode, compressedNode);

		return compressedStickyNode;
	}
}

export interface ICompressibleKeyboardNavigationLabelProvider<T> extends IKeyboardNavigationLabelProvider<T> {
	getCompressedNodeKeyboardNavigationLabel(elements: T[]): { toString(): string | undefined } | undefined;
}

export interface ICompressibleObjectTreeOptions<T, TFilterData = void> extends IObjectTreeOptions<T, TFilterData> {
	readonly compressionEnabled?: boolean;
	readonly elementMapper?: ElementMapper<T>;
	readonly keyboardNavigationLabelProvider?: ICompressibleKeyboardNavigationLabelProvider<T>;
}

function asObjectTreeOptions<T, TFilterData>(compressedTreeNodeProvider: () => ICompressedTreeNodeProvider<T, TFilterData>, options?: ICompressibleObjectTreeOptions<T, TFilterData>): IObjectTreeOptions<T, TFilterData> | undefined {
	return options && {
		...options,
		keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
			getKeyboardNavigationLabel(e: T) {
				let compressedTreeNode: ITreeNode<ICompressedTreeNode<T>, TFilterData>;

				try {
					compressedTreeNode = compressedTreeNodeProvider().getCompressedTreeNode(e) as ITreeNode<ICompressedTreeNode<T>, TFilterData>;
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

export interface ICompressibleObjectTreeOptionsUpdate extends IAbstractTreeOptionsUpdate {
	readonly compressionEnabled?: boolean;
}

export class CompressibleObjectTree<T extends NonNullable<any>, TFilterData = void> extends ObjectTree<T, TFilterData> implements ICompressedTreeNodeProvider<T, TFilterData> {

	protected declare model: CompressibleObjectTreeModel<T, TFilterData>;

	constructor(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ICompressibleTreeRenderer<T, TFilterData, any>[],
		options: ICompressibleObjectTreeOptions<T, TFilterData> = {}
	) {
		const compressedTreeNodeProvider = () => this;
		const stickyScrollDelegate = new CompressibleStickyScrollDelegate<T, TFilterData>(() => this.model);
		const compressibleRenderers = renderers.map(r => new CompressibleRenderer<T, TFilterData, any>(compressedTreeNodeProvider, stickyScrollDelegate, r));

		super(user, container, delegate, compressibleRenderers, { ...asObjectTreeOptions<T, TFilterData>(compressedTreeNodeProvider, options), stickyScrollDelegate });
	}

	override setChildren(element: T | null, children: Iterable<ICompressedTreeElement<T>> = Iterable.empty(), options?: IObjectTreeSetChildrenOptions<T>): void {
		this.model.setChildren(element, children, options);
	}

	protected override createModel(user: string, options: ICompressibleObjectTreeOptions<T | null, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new CompressibleObjectTreeModel(user, options);
	}

	override updateOptions(optionsUpdate: ICompressibleObjectTreeOptionsUpdate = {}): void {
		super.updateOptions(optionsUpdate);

		if (typeof optionsUpdate.compressionEnabled !== 'undefined') {
			this.model.setCompressionEnabled(optionsUpdate.compressionEnabled);
		}
	}

	getCompressedTreeNode(element: T | null = null): ITreeNode<ICompressedTreeNode<T> | null, TFilterData> {
		return this.model.getCompressedTreeNode(element);
	}
}
