/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/stickyScroll';
import { AbstractTree, IAbstractTreeOptions, IAbstractTreeOptionsUpdate, TreeRenderer } from 'vs/base/browser/ui/tree/abstractTree';
import { ITreeModel, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { List, isActionItem, isMonacoCustomToggle } from 'vs/base/browser/ui/list/listWidget';
import { equals } from 'vs/base/common/arrays';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { $, addDisposableListener } from 'vs/base/browser/dom';

interface StickyScrollNode<T, TFilterData> {
	readonly node: ITreeNode<T, TFilterData>;
	readonly startIndex: number;
	readonly endIndex: number;
	readonly height: number;
	readonly position: number;
}

class StickyScrollState<T, TFilterData, TRef> extends Disposable {

	constructor(
		readonly stickyNodes: StickyScrollNode<T, TFilterData>[] = []
	) {
		super();
	}

	get count(): number { return this.stickyNodes.length; }

	equal(state: StickyScrollState<T, TFilterData, TRef>): boolean {
		return this.count === state.count &&
			equals(this.stickyNodes, state.stickyNodes, (r1, r2) => r1.position === r2.position) &&
			equals(this.stickyNodes, state.stickyNodes, (r1, r2) => r1.node.element === r2.node.element) &&
			equals(this.stickyNodes, state.stickyNodes, (r1, r2) => r1.startIndex === r2.startIndex) &&
			equals(this.stickyNodes, state.stickyNodes, (r1, r2) => r1.height === r2.height) &&
			equals(this.stickyNodes, state.stickyNodes, (r1, r2) => r1.endIndex === r2.endIndex);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
/* hot-reload:patch-prototype-methods */
export class StickyScrollController<T, TFilterData, TRef> extends Disposable {

	private maxNumberOfStickyElements: number;
	private readonly maxWidgetViewRatio = 0.4;

	private readonly _widget: StickyScrollWidget<T, TFilterData, TRef>;
	private readonly _treeHelper: TreeModelHelpers<T, TFilterData, TRef>;

	private get firstVisibleNode() {
		const index = this.view.firstVisibleIndex;

		if (index < 0 || index >= this.view.length) {
			return undefined;
		}

		return this.view.element(index);
	}

	constructor(
		private readonly tree: AbstractTree<T, TFilterData, TRef>,
		model: ITreeModel<T, TFilterData, TRef>,
		private readonly view: List<ITreeNode<T, TFilterData>>,
		renderers: TreeRenderer<T, TFilterData, TRef, any>[],
		private readonly treeDelegate: IListVirtualDelegate<ITreeNode<T, TFilterData>>,
		options: IAbstractTreeOptions<T, TFilterData> = {},
	) {
		super();

		const stickyScrollOptions = this.validateStickySettings(options);
		this.maxNumberOfStickyElements = stickyScrollOptions.stickyScrollMaxItemCount;

		this._treeHelper = new TreeModelHelpers(model);
		this._widget = this._register(new StickyScrollWidget(view.getScrollableElement(), view, model, renderers, treeDelegate));

		this._register(view.onDidScroll(() => this.setState()));
		this._register(view.onDidChangeContentHeight(() => this.setState()));
		this._register(tree.onDidChangeCollapseState(() => this.setState()));
		this._register(tree.onDidChangeSelection(() => this.setState()));
		this._register(tree.onDidChangeFocus(() => this.setState()));

		this.setState();
	}

	private setState() {
		const firstVisibleNode = this.firstVisibleNode;

		// Don't render anything if there are no elements
		if (!firstVisibleNode || this.tree.scrollTop === 0) {
			this._widget.setState(new StickyScrollState());
			return;
		}

		const stickyState = this.findStickyState(firstVisibleNode);
		this._widget.setState(stickyState);
	}

	private findStickyState(firstVisibleNode: ITreeNode<T, TFilterData>): StickyScrollState<T, TFilterData, TRef> {

		const stickyNodes: StickyScrollNode<T, TFilterData>[] = [];
		const maximumStickyWidgetHeight = this.view.renderHeight * this.maxWidgetViewRatio;
		let currentFirstVisibleNode: ITreeNode<T, TFilterData> | undefined = firstVisibleNode;

		const stickyNodesHeight = () => {
			if (stickyNodes.length === 0) {
				return 0;
			}
			const previousStickyNode = stickyNodes[stickyNodes.length - 1];
			return previousStickyNode.position + previousStickyNode.height;
		};

		const getNextNode = (node: ITreeNode<T, TFilterData>) => {
			const nodeIndex = this._treeHelper.getNodeIndex(node);
			return this.view.element(nodeIndex + 1);
		};

		const addStickyNode = (node: ITreeNode<T, TFilterData>, currentNode: ITreeNode<T, TFilterData>) => {
			const nextStickyNode = this.createStickyScrollNode(node, stickyNodesHeight());

			if (nextStickyNode.position + nextStickyNode.height > maximumStickyWidgetHeight) {
				return undefined; // Don't continue if sticky height limit reached
			}

			stickyNodes.push(nextStickyNode);
			return stickyNodes.length < this.maxNumberOfStickyElements ? getNextNode(currentNode) : undefined;
		};


		// --- Backwards Pass (consider parents of first visible node after sticky elements)
		let ancestorNodes = this.getAncestorsUpTo(currentFirstVisibleNode, undefined);
		const firstVisibleNodeHasParent = ancestorNodes.length > 0;

		if (firstVisibleNodeHasParent) {
			currentFirstVisibleNode = addStickyNode(ancestorNodes[ancestorNodes.length - 1], currentFirstVisibleNode);

			while (currentFirstVisibleNode) {

				const previousNode = stickyNodes[stickyNodes.length - 1].node;

				ancestorNodes = this.getAncestorsUpTo(currentFirstVisibleNode, previousNode);
				if (ancestorNodes.length === 0) {
					break;
				}

				const nextNode = ancestorNodes[ancestorNodes.length - 1];
				const isNextParentChildOfPrevious = this._treeHelper.nodeIsParentOf(nextNode, previousNode);
				if (!isNextParentChildOfPrevious) {
					break;
				}

				currentFirstVisibleNode = addStickyNode(nextNode, currentFirstVisibleNode);
			}
		}

		// --- Forwards Pass (consider first visible node after sticky elements as sticky element)
		while (currentFirstVisibleNode) {

			if (!this._treeHelper.nodeIsUncollapsedParent(currentFirstVisibleNode)) {
				break;
			}

			if (this.nodeTopAlignsWithStickyNodesBottom(currentFirstVisibleNode, stickyNodesHeight())) {
				break;
			}

			const hasPreviousStickyNode = stickyNodes.length > 0;
			if (hasPreviousStickyNode && !this._treeHelper.nodeIsParentOf(currentFirstVisibleNode, stickyNodes[stickyNodes.length - 1].node)) {
				break;
			}

			currentFirstVisibleNode = addStickyNode(currentFirstVisibleNode, currentFirstVisibleNode);
		}

		return new StickyScrollState(stickyNodes);
	}

	private nodeTopAlignsWithStickyNodesBottom(node: ITreeNode<T, TFilterData>, stickyNodesHeight: number): boolean {
		const nodeIndex = this._treeHelper.getNodeIndex(node);
		const elementTop = this.view.getElementTop(nodeIndex);
		const stickyPosition = stickyNodesHeight;
		return this.view.scrollTop === elementTop - stickyPosition;
	}

	private createStickyScrollNode(node: ITreeNode<T, TFilterData>, currentStickyNodesHeight: number): StickyScrollNode<T, TFilterData> {
		const height = this.treeDelegate.getHeight(node);
		const startIndex = this._treeHelper.getNodeIndex(node);
		let endIndex = this._treeHelper.getNodeIndex(this._treeHelper.lastVisibleDescendant(node));
		endIndex = endIndex < 0 ? startIndex : endIndex;

		const position = this.calculateStickyNodePosition(endIndex, currentStickyNodesHeight);

		return { node, position, height, startIndex, endIndex };
	}

	private getAncestorsUpTo(node: ITreeNode<T, TFilterData>, upperAncestorBound: ITreeNode<T, TFilterData> | undefined = undefined): ITreeNode<T, TFilterData>[] {
		const ancestorNodes: ITreeNode<T, TFilterData>[] = [];

		let currentAncestor = this._treeHelper.getParentNode(node);
		while (currentAncestor && currentAncestor.node !== upperAncestorBound) {
			ancestorNodes.push(currentAncestor.node);
			currentAncestor = this._treeHelper.getParentNode(currentAncestor.node);
		}

		return ancestorNodes;
	}

	private calculateStickyNodePosition(lastDescendantIndex: number, stickyRowPositionTop: number): number {
		let lastChildRelativeTop = this.view.getRelativeTop(lastDescendantIndex);

		// If the last descendant is only partially visible at the top of the view, getRelativeTop() returns null
		// In that case, utilize the next node's relative top to calculate the sticky node's position
		if (lastChildRelativeTop === null && this.view.firstVisibleIndex === lastDescendantIndex && lastDescendantIndex + 1 < this.view.length) {
			const nodeHeight = this.treeDelegate.getHeight(this.view.element(lastDescendantIndex));
			const nextNodeRelativeTop = this.view.getRelativeTop(lastDescendantIndex + 1);
			lastChildRelativeTop = nextNodeRelativeTop ? nextNodeRelativeTop - nodeHeight / this.view.renderHeight : null;
		}

		if (lastChildRelativeTop === null) {
			return stickyRowPositionTop;
		}

		const lastChildNode = this.view.element(lastDescendantIndex);
		const lastChildHeight = this.treeDelegate.getHeight(lastChildNode);
		const topOfLastChild = lastChildRelativeTop * this.view.renderHeight;
		const bottomOfLastChild = topOfLastChild + lastChildHeight;

		if (stickyRowPositionTop > topOfLastChild && stickyRowPositionTop <= bottomOfLastChild) {
			return topOfLastChild;
		}

		return stickyRowPositionTop;
	}

	updateOptions(optionsUpdate: IAbstractTreeOptionsUpdate = {}): void {
		const validatedOptions = this.validateStickySettings(optionsUpdate);
		if (this.maxNumberOfStickyElements !== validatedOptions.stickyScrollMaxItemCount) {
			this.maxNumberOfStickyElements = validatedOptions.stickyScrollMaxItemCount;
			this.setState();
		}
	}

	validateStickySettings(options: IAbstractTreeOptionsUpdate): { stickyScrollMaxItemCount: number } {
		let stickyScrollMaxItemCount = 5;
		if (typeof options.stickyScrollMaxItemCount === 'number') {
			stickyScrollMaxItemCount = Math.max(options.stickyScrollMaxItemCount, 1);
		}
		return { stickyScrollMaxItemCount };
	}
}

class StickyScrollWidget<T, TFilterData, TRef> implements IDisposable {

	private readonly _rootDomNode: HTMLElement;
	private _previousState: StickyScrollState<T, TFilterData, TRef> = new StickyScrollState();

	constructor(
		container: HTMLElement,
		private readonly view: List<ITreeNode<T, TFilterData>>,
		private readonly model: ITreeModel<T, TFilterData, TRef>,
		private readonly treeRenderers: TreeRenderer<T, TFilterData, TRef, any>[],
		private readonly treeDelegate: IListVirtualDelegate<ITreeNode<T, TFilterData>>
	) {

		this._rootDomNode = document.createElement('div');
		this._rootDomNode.classList.add('sticky-tree-widget');
		this._rootDomNode.classList.add('monaco-list');
		container.appendChild(this._rootDomNode);

		this.setState(new StickyScrollState());
	}

	setState(state: StickyScrollState<T, TFilterData, TRef>): void {

		// If state has not changed, do nothing
		if (this._previousState.equal(state)) {
			return;
		}

		// Update visibility of the widget if changed
		const wasVisible = this._previousState.count > 0;
		const isVisible = state.count > 0;
		if (wasVisible !== isVisible) {
			this.setVisible(isVisible);
		}

		// Remove previous state
		this._previousState.dispose();
		this._previousState = state;

		if (state.count === 0) {
			return;
		}

		for (let stickyIndex = 0; stickyIndex < state.count; stickyIndex++) {
			const stickyNode = state.stickyNodes[stickyIndex];
			const previousStickyNode = stickyIndex ? state.stickyNodes[stickyIndex - 1] : undefined;
			const currentWidgetHieght = previousStickyNode ? previousStickyNode.position + previousStickyNode.height : 0;

			const { element, disposable } = this.createElement(stickyNode, currentWidgetHieght);

			if (stickyIndex === state.count - 1) {
				element.classList.add('last-sticky');
			}

			this._rootDomNode.appendChild(element);
			state.addDisposable(disposable);
			state.addDisposable(this.view.onDidChangeFocus(() => { }));
		}

		// Add shadow element to the end of the widget
		const shadow = $('.sticky-tree-widget-shadow');
		this._rootDomNode.appendChild(shadow);
		state.addDisposable(toDisposable(() => shadow.remove()));

		// Set the height of the widget to the bottom of the last sticky node
		const lastStickyNode = state.stickyNodes[state.count - 1];
		this._rootDomNode.style.height = `${lastStickyNode.position + lastStickyNode.height}px`;
	}

	private createElement(stickyNode: StickyScrollNode<T, TFilterData>, currentWidgetHeight: number): { element: HTMLElement; disposable: IDisposable } {

		const nodeLocation = this.model.getNodeLocation(stickyNode.node);
		const nodeIndex = this.model.getListIndex(nodeLocation);

		// Sticky element container
		const stickyElement = document.createElement('div');
		stickyElement.style.top = `${stickyNode.position}px`;

		stickyElement.classList.add('sticky-element');
		stickyElement.classList.add('monaco-list-row');

		stickyElement.setAttribute('data-index', `${nodeIndex}`);
		stickyElement.setAttribute('data-parity', nodeIndex % 2 === 0 ? 'even' : 'odd');
		stickyElement.setAttribute('id', this.view.getElementID(nodeIndex));

		// Get the renderer for the node
		const nodeTemplateId = this.treeDelegate.getTemplateId(stickyNode.node);
		const renderer = this.treeRenderers.find((renderer) => renderer.templateId === nodeTemplateId);
		if (!renderer) {
			throw new Error(`No renderer found for template id ${nodeTemplateId}`);
		}

		const nodeCopy = copyNode(stickyNode.node);

		// Render the element
		const templateData = renderer.renderTemplate(stickyElement);
		renderer.renderElement(nodeCopy, stickyNode.startIndex, templateData, stickyNode.height);

		const mouseListenerDisposable = this.rigisterMouseListeners(stickyElement, stickyNode, currentWidgetHeight);

		// Remove the element from the DOM when state is disposed
		const disosable = toDisposable(() => {
			renderer.disposeElement(nodeCopy, stickyNode.startIndex, templateData, stickyNode.height);
			renderer.disposeTemplate(templateData);
			mouseListenerDisposable.dispose();
			stickyElement.remove();
		});

		return { element: stickyElement, disposable: disosable };
	}

	private rigisterMouseListeners(stickyElement: HTMLElement, stickyNode: StickyScrollNode<T, TFilterData>, currentWidgetHeight: number): IDisposable {

		const moveNodeUnderStickyElement = (nodeIndex: number) => {
			const elementTop = this.view.getElementTop(nodeIndex);
			// We can't rely on the current sticky node's position
			// because the node might be partially scrolled under the widget
			const previousStickyNodeBottom = currentWidgetHeight;
			this.view.scrollTop = elementTop - previousStickyNodeBottom;
			this.view.setFocus([nodeIndex]);
			this.view.setSelection([nodeIndex]);
		};

		return addDisposableListener(stickyElement, 'mouseup', (e: MouseEvent) => {
			const isRightClick = e.button === 2;
			if (isRightClick) {
				return;
			}

			if (isMonacoCustomToggle(e.target as HTMLElement) || isActionItem(e.target as HTMLElement)) {
				return;
			}

			// Timeout 0 ensures that the tree handles the click event first
			setTimeout(() => moveNodeUnderStickyElement(stickyNode.startIndex), 0);
		});
	}

	private setVisible(visible: boolean): void {
		this._rootDomNode.style.display = visible ? 'block' : 'none';
	}

	dispose(): void {
		this._previousState.dispose();
		this._rootDomNode.remove();
	}
}

class TreeModelHelpers<T, TFilterData, TRef> {
	constructor(
		private readonly model: ITreeModel<T, TFilterData, TRef>
	) { }

	public getParentNode(node: ITreeNode<T, TFilterData>): { location: TRef; node: ITreeNode<T, TFilterData> } | undefined {
		const nodeLocation = this.model.getNodeLocation(node);
		const parentLocation = this.model.getParentNodeLocation(nodeLocation);
		return parentLocation ? { location: parentLocation, node: this.model.getNode(parentLocation) } : undefined;
	}

	public nodeIsParentOf(node: ITreeNode<T, TFilterData>, potentialParent: ITreeNode<T, TFilterData>): boolean {
		const parent = this.getParentNode(node);
		if (!parent) {
			return false;
		}
		return parent.node.element === potentialParent.element;
	}

	public nodeIsUncollapsedParent(node: ITreeNode<T, TFilterData>): boolean {
		return node.visibleChildrenCount > 0;
	}

	public getNodeIndex(node: ITreeNode<T, TFilterData>, nodeLocation?: TRef): number {
		if (nodeLocation === undefined) {
			nodeLocation = this.model.getNodeLocation(node);
		}
		const nodeIndex = this.model.getListIndex(nodeLocation);
		return nodeIndex;
	}

	public lastVisibleDescendant(node: ITreeNode<T, TFilterData>): ITreeNode<T, TFilterData> {
		let currentLastChildNode = node;
		while (currentLastChildNode.visibleChildrenCount > 0) {
			currentLastChildNode = currentLastChildNode.children[currentLastChildNode.visibleChildrenCount - 1];
		}
		return currentLastChildNode;
	}
}

function copyNode(node: ITreeNode<any, any>): ITreeNode<any, any> {
	return {
		element: node.element,
		children: node.children,
		depth: node.depth,
		visibleChildrenCount: node.visibleChildrenCount,
		visibleChildIndex: node.visibleChildIndex,
		collapsible: node.collapsible,
		collapsed: node.collapsed,
		visible: node.visible,
		filterData: node.filterData
	};

}
