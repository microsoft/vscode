/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IListOptions, List, IIdentityProvider, IMultipleSelectionController } from 'vs/base/browser/ui/list/listWidget';
import { TreeModel, ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/treeModel';
import { IIterator, empty } from 'vs/base/common/iterator';
import { IDelegate, IRenderer, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { append, $ } from 'vs/base/browser/dom';

function toTreeListOptions<T>(options?: IListOptions<T>): IListOptions<ITreeNode<T>> {
	if (!options) {
		return undefined;
	}

	let identityProvider: IIdentityProvider<ITreeNode<T>> | undefined = undefined;
	let multipleSelectionController: IMultipleSelectionController<ITreeNode<T>> | undefined = undefined;

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

class TreeDelegate<T> implements IDelegate<ITreeNode<T>> {

	constructor(private delegate: IDelegate<T>) { }

	getHeight(element: ITreeNode<T>): number {
		return this.delegate.getHeight(element.element);
	}

	getTemplateId(element: ITreeNode<T>): string {
		return this.delegate.getTemplateId(element.element);
	}
}

interface ITreeListTemplateData<T> {
	twistie: HTMLElement;
	templateData: T;
}

class TreeRenderer<T, TTemplateData> implements IRenderer<ITreeNode<T>, ITreeListTemplateData<TTemplateData>> {

	readonly templateId: string;

	constructor(private renderer: IRenderer<T, TTemplateData>) {
		this.templateId = renderer.templateId;
	}

	renderTemplate(container: HTMLElement): ITreeListTemplateData<TTemplateData> {
		const el = append(container, $('.monaco-tl-row'));
		const twistie = append(el, $('.tl-twistie'));
		const contents = append(el, $('.tl-contents'));
		const templateData = this.renderer.renderTemplate(contents);

		return { twistie, templateData };
	}

	renderElement(element: ITreeNode<T>, index: number, templateData: ITreeListTemplateData<TTemplateData>): void {
		const { twistie } = templateData;
		twistie.innerText = element.children.length === 0 ? '' : (element.collapsed ? '▹' : '◢');
		twistie.style.width = `${10 + element.depth * 10}px`;

		this.renderer.renderElement(element.element, index, templateData.templateData);
	}

	disposeTemplate(templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}
}

function getLocation<T>(node: ITreeNode<T>): number[] {
	const location = [];

	while (node.parent) {
		location.push(node.parent.children.indexOf(node));
		node = node.parent;
	}

	return location.reverse();
}

export class Tree<T> implements IDisposable {

	private view: List<ITreeNode<T>>;
	private model: TreeModel<T>;
	private disposables: IDisposable[] = [];

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[],
		options?: IListOptions<T>
	) {
		const treeDelegate = new TreeDelegate(delegate);
		const treeRenderers = renderers.map(r => new TreeRenderer(r));
		const treeOptions = toTreeListOptions(options);

		this.view = new List(container, treeDelegate, treeRenderers, treeOptions);
		this.model = new TreeModel<T>(this.view);

		this.view.onMouseClick(this.onMouseClick, this, this.disposables);
	}

	splice(location: number[], deleteCount: number, toInsert: IIterator<ITreeElement<T>> = empty()): IIterator<ITreeElement<T>> {
		return this.model.splice(location, deleteCount, toInsert);
	}

	private onMouseClick(e: IListMouseEvent<ITreeNode<T>>): void {
		const node = e.element;
		const location = getLocation(node);
		this.model.toggleCollapsed(location);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.view.dispose();
		this.view = null;
		this.model = null;
	}
}