/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterator, ISequence } from 'vs/base/common/iterator';
import { AbstractTree, IAbstractTreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ISpliceable } from 'vs/base/common/sequence';
import { ITreeNode, ITreeModel, ITreeElement, ITreeRenderer, ITreeSorter, ICollapseStateChangeEvent } from 'vs/base/browser/ui/tree/tree';
import { ObjectTreeModel, IObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Event } from 'vs/base/common/event';
import { CompressibleObjectTreeModel, ElementMapper } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';

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

	setChildren(
		element: T | null,
		children?: ISequence<ITreeElement<T>>
	): Iterator<ITreeElement<T | null>> {
		return this.model.setChildren(element, children);
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

interface ICompressedElementsCollectionProvider<T> {
	getCompressedElements(element: T): T[];
}

export interface ICompressibleObjectTreeOptions<T, TFilterData = void> extends IObjectTreeOptions<T, TFilterData> {
	readonly elementMapper?: ElementMapper<T>;
}

export interface ICompressibleTreeRenderer<T, TFilterData = void, TTemplateData = void> extends ITreeRenderer<T, TFilterData, TTemplateData> {
	renderCompressedElements(elements: T[], index: number, templateData: TTemplateData, height: number | undefined): void;
	disposeCompressedElements?(elements: T[], index: number, templateData: TTemplateData, height: number | undefined): void;
}

interface CompressibleTemplateData<T, TTemplateData> {
	compressedElements: T[] | undefined;
	readonly data: TTemplateData;
}

class CompressibleRenderer<T, TFilterData, TTemplateData> implements ITreeRenderer<T, TFilterData, CompressibleTemplateData<T, TTemplateData>> {

	readonly templateId: string;
	readonly onDidChangeTwistieState: Event<T> | undefined;

	constructor(private renderer: ICompressibleTreeRenderer<T, TFilterData, TTemplateData>, private compressedElementsCollectionProvider: ICompressedElementsCollectionProvider<T>) {
		this.templateId = renderer.templateId;

		if (renderer.onDidChangeTwistieState) {
			this.onDidChangeTwistieState = renderer.onDidChangeTwistieState;
		}
	}

	renderTemplate(container: HTMLElement): CompressibleTemplateData<T, TTemplateData> {
		const data = this.renderer.renderTemplate(container);
		return { compressedElements: undefined, data };
	}

	renderElement(element: ITreeNode<T, TFilterData>, index: number, templateData: CompressibleTemplateData<T, TTemplateData>, height: number | undefined): void {
		const elements = this.compressedElementsCollectionProvider.getCompressedElements(element.element);

		if (elements.length === 1) {
			templateData.compressedElements = undefined;
			this.renderer.renderElement(element, index, templateData.data, height);
		} else {
			templateData.compressedElements = elements;
			this.renderer.renderCompressedElements(elements, index, templateData.data, height);
		}
	}

	disposeElement(element: ITreeNode<T, TFilterData>, index: number, templateData: CompressibleTemplateData<T, TTemplateData>, height: number | undefined): void {
		if (templateData.compressedElements) {
			if (this.renderer.disposeCompressedElements) {
				this.renderer.disposeCompressedElements(templateData.compressedElements, index, templateData.data, height);
			}
		} else {
			if (this.renderer.disposeElement) {
				this.renderer.disposeElement(element, index, templateData.data, height);
			}
		}
	}

	disposeTemplate(templateData: CompressibleTemplateData<T, TTemplateData>): void {
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
		const compressibleRenderers = renderers.map(r => new CompressibleRenderer(r, this));
		super(container, delegate, compressibleRenderers, options);
	}

	protected createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: ICompressibleObjectTreeOptions<T, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new CompressibleObjectTreeModel(view, options);
	}

	getCompressedElements(element: T): T[] {
		return this.model.getCompressedNode(element)!.elements;
	}
}
