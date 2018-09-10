/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IListOptions, List, IIdentityProvider, IMultipleSelectionController } from 'vs/base/browser/ui/list/listWidget';
import { TreeModel, ITreeNode, ITreeElement, getNodeLocation } from 'vs/base/browser/ui/tree/treeModel';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { IVirtualDelegate, IRenderer, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { append, $ } from 'vs/base/browser/dom';
import { Event, Relay, chain } from 'vs/base/common/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { tail2 } from 'vs/base/common/arrays';

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

class TreeDelegate<T> implements IVirtualDelegate<ITreeNode<T>> {

	constructor(private delegate: IVirtualDelegate<T>) { }

	getHeight(element: ITreeNode<T>): number {
		return this.delegate.getHeight(element.element);
	}

	getTemplateId(element: ITreeNode<T>): string {
		return this.delegate.getTemplateId(element.element);
	}
}

interface ITreeListTemplateData<T> {
	twistie: HTMLElement;
	count: HTMLElement;
	templateData: T;
}

function renderTwistie<T>(node: ITreeNode<T>, twistie: HTMLElement): void {
	if (node.children.length === 0 && !node.collapsible) {
		twistie.innerText = '';
	} else {
		twistie.innerText = node.collapsed ? '▹' : '◢';
	}
}

class TreeRenderer<T, TTemplateData> implements IRenderer<ITreeNode<T>, ITreeListTemplateData<TTemplateData>> {

	readonly templateId: string;
	private renderedNodes = new Map<ITreeNode<T>, ITreeListTemplateData<TTemplateData>>();
	private disposables: IDisposable[] = [];

	constructor(
		private renderer: IRenderer<T, TTemplateData>,
		onDidChangeCollapseState: Event<ITreeNode<T>>
	) {
		this.templateId = renderer.templateId;
		onDidChangeCollapseState(this.onDidChangeCollapseState, this, this.disposables);
	}

	renderTemplate(container: HTMLElement): ITreeListTemplateData<TTemplateData> {
		const el = append(container, $('.monaco-tl-row'));
		const twistie = append(el, $('.tl-twistie'));
		const contents = append(el, $('.tl-contents'));
		const count = append(el, $('.tl-count'));
		const templateData = this.renderer.renderTemplate(contents);

		return { twistie, count, templateData };
	}

	renderElement(node: ITreeNode<T>, index: number, templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderedNodes.set(node, templateData);

		templateData.twistie.style.width = `${10 + node.depth * 10}px`;
		renderTwistie(node, templateData.twistie);
		templateData.count.textContent = `${node.visibleCount}`;

		this.renderer.renderElement(node.element, index, templateData.templateData);
	}

	disposeElement(node: ITreeNode<T>): void {
		this.renderedNodes.delete(node);
	}

	disposeTemplate(templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	private onDidChangeCollapseState(node: ITreeNode<T>): void {
		const templateData = this.renderedNodes.get(node);

		if (!templateData) {
			return;
		}

		renderTwistie(node, templateData.twistie);
		templateData.count.textContent = `${node.visibleCount}`;
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.disposables = dispose(this.disposables);
	}
}

function isInputElement(e: HTMLElement): boolean {
	return e.tagName === 'INPUT' || e.tagName === 'TEXTAREA';
}

export interface ITreeOptions<T> extends IListOptions<T> { }

export class Tree<T> implements IDisposable {

	private view: List<ITreeNode<T>>;
	private model: TreeModel<T>;
	private disposables: IDisposable[] = [];

	constructor(
		container: HTMLElement,
		delegate: IVirtualDelegate<T>,
		renderers: IRenderer<T, any>[],
		options?: ITreeOptions<T>
	) {
		const treeDelegate = new TreeDelegate(delegate);

		const onDidChangeCollapseStateRelay = new Relay<ITreeNode<T>>();
		const treeRenderers = renderers.map(r => new TreeRenderer(r, onDidChangeCollapseStateRelay.event));
		this.disposables.push(...treeRenderers);

		const treeOptions = toTreeListOptions(options);

		this.view = new List(container, treeDelegate, treeRenderers, treeOptions);
		this.model = new TreeModel<T>(this.view);
		onDidChangeCollapseStateRelay.input = this.model.onDidChangeCollapseState;

		this.view.onMouseClick(this.onMouseClick, this, this.disposables);

		const onKeyDown = chain(this.view.onKeyDown)
			.filter(e => !isInputElement(e.target as HTMLElement))
			.map(e => new StandardKeyboardEvent(e));

		onKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow).on(this.onLeftArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.RightArrow).on(this.onRightArrow, this, this.disposables);
		onKeyDown.filter(e => e.keyCode === KeyCode.Space).on(this.onSpace, this, this.disposables);
	}

	splice(location: number[], deleteCount: number, toInsert: ISequence<ITreeElement<T>> = Iterator.empty()): Iterator<ITreeElement<T>> {
		return this.model.splice(location, deleteCount, toInsert);
	}

	private onMouseClick(e: IListMouseEvent<ITreeNode<T>>): void {
		const node = e.element;
		const location = getNodeLocation(node);

		this.model.toggleCollapsed(location);
	}

	private onLeftArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const nodes = this.view.getFocusedElements();

		if (nodes.length === 0) {
			return;
		}

		const node = nodes[0];
		const location = getNodeLocation(node);
		const didChange = this.model.setCollapsed(location, true);

		if (!didChange) {
			if (location.length === 1) {
				return;
			}

			const [parentLocation] = tail2(location);
			const parentListIndex = this.model.getListIndex(parentLocation);

			this.view.reveal(parentListIndex);
			this.view.setFocus([parentListIndex]);
		}
	}

	private onRightArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const nodes = this.view.getFocusedElements();

		if (nodes.length === 0) {
			return;
		}

		const node = nodes[0];
		const location = getNodeLocation(node);
		const didChange = this.model.setCollapsed(location, false);

		if (!didChange) {
			if (node.children.length === 0) {
				return;
			}

			const [focusedIndex] = this.view.getFocus();
			const firstChildIndex = focusedIndex + 1;

			this.view.reveal(firstChildIndex);
			this.view.setFocus([firstChildIndex]);
		}
	}

	private onSpace(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const nodes = this.view.getFocusedElements();

		if (nodes.length === 0) {
			return;
		}

		const node = nodes[0];
		const location = getNodeLocation(node);
		this.model.toggleCollapsed(location);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.view.dispose();
		this.view = null;
		this.model = null;
	}
}