/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/tree';
import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IListOptions, List, IListStyles, mightProducePrintableCharacter, isSelectionRangeChangeEvent, isSelectionSingleChangeEvent } from 'vs/base/browser/ui/list/listWidget';
import { IListVirtualDelegate, IListRenderer, IListMouseEvent, IListEvent, IListContextMenuEvent, IListDragAndDrop, IListDragOverReaction, IKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/list/list';
import { append, $, toggleClass, getDomNodePagePosition, removeClass, addClass } from 'vs/base/browser/dom';
import { Event, Relay, Emitter, EventBufferer } from 'vs/base/common/event';
import { StandardKeyboardEvent, IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ITreeModel, ITreeNode, ITreeRenderer, ITreeEvent, ITreeMouseEvent, ITreeContextMenuEvent, ITreeFilter, ITreeNavigator, ICollapseStateChangeEvent, ITreeDragAndDrop, TreeDragOverBubble, TreeVisibility, TreeFilterResult } from 'vs/base/browser/ui/tree/tree';
import { ISpliceable } from 'vs/base/common/sequence';
import { IDragAndDropData, StaticDND, DragAndDropData } from 'vs/base/browser/dnd';
import { range } from 'vs/base/common/arrays';
import { ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';
import { domEvent } from 'vs/base/browser/event';
import { fuzzyScore, FuzzyScore } from 'vs/base/common/filters';
import { getVisibleState, isFilterResult } from 'vs/base/browser/ui/tree/indexTreeModel';
import { localize } from 'vs/nls';
import { disposableTimeout } from 'vs/base/common/async';
import { isMacintosh } from 'vs/base/common/platform';
import { values } from 'vs/base/common/map';

function asTreeDragAndDropData<T, TFilterData>(data: IDragAndDropData): IDragAndDropData {
	if (data instanceof ElementsDragAndDropData) {
		const nodes = (data as ElementsDragAndDropData<ITreeNode<T, TFilterData>>).elements;
		return new ElementsDragAndDropData(nodes.map(node => node.element));
	}

	return data;
}

class TreeNodeListDragAndDrop<T, TFilterData, TRef> implements IListDragAndDrop<ITreeNode<T, TFilterData>> {

	private autoExpandNode: ITreeNode<T, TFilterData> | undefined;
	private autoExpandDisposable: IDisposable = Disposable.None;

	constructor(private modelProvider: () => ITreeModel<T, TFilterData, TRef>, private dnd: ITreeDragAndDrop<T>) { }

	getDragURI(node: ITreeNode<T, TFilterData>): string | null {
		return this.dnd.getDragURI(node.element);
	}

	getDragLabel(nodes: ITreeNode<T, TFilterData>[]): string | undefined {
		if (this.dnd.getDragLabel) {
			return this.dnd.getDragLabel(nodes.map(node => node.element));
		}

		return undefined;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		if (this.dnd.onDragStart) {
			this.dnd.onDragStart(asTreeDragAndDropData(data), originalEvent);
		}
	}

	onDragOver(data: IDragAndDropData, targetNode: ITreeNode<T, TFilterData> | undefined, targetIndex: number | undefined, originalEvent: DragEvent, raw = true): boolean | IListDragOverReaction {
		const result = this.dnd.onDragOver(asTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, originalEvent);
		const didChangeAutoExpandNode = this.autoExpandNode !== targetNode;

		if (didChangeAutoExpandNode) {
			this.autoExpandDisposable.dispose();
			this.autoExpandNode = targetNode;
		}

		if (typeof targetNode === 'undefined') {
			return result;
		}

		if (didChangeAutoExpandNode && typeof result !== 'boolean' && result.autoExpand) {
			this.autoExpandDisposable = disposableTimeout(() => {
				const model = this.modelProvider();
				const ref = model.getNodeLocation(targetNode);

				if (model.isCollapsed(ref)) {
					model.setCollapsed(ref, false);
				}

				this.autoExpandNode = undefined;
			}, 500);
		}

		if (typeof result === 'boolean' || !result.accept || typeof result.bubble === 'undefined') {
			if (!raw) {
				const accept = typeof result === 'boolean' ? result : result.accept;
				const effect = typeof result === 'boolean' ? undefined : result.effect;
				return { accept, effect, feedback: [targetIndex!] };
			}

			return result;
		}

		if (result.bubble === TreeDragOverBubble.Up) {
			const parentNode = targetNode.parent;
			const model = this.modelProvider();
			const parentIndex = parentNode && model.getListIndex(model.getNodeLocation(parentNode));

			return this.onDragOver(data, parentNode, parentIndex, originalEvent, false);
		}

		const model = this.modelProvider();
		const ref = model.getNodeLocation(targetNode);
		const start = model.getListIndex(ref);
		const length = model.getListRenderCount(ref);

		return { ...result, feedback: range(start, start + length) };
	}

	drop(data: IDragAndDropData, targetNode: ITreeNode<T, TFilterData> | undefined, targetIndex: number | undefined, originalEvent: DragEvent): void {
		this.autoExpandDisposable.dispose();
		this.autoExpandNode = undefined;

		this.dnd.drop(asTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, originalEvent);
	}
}

function asListOptions<T, TFilterData, TRef>(modelProvider: () => ITreeModel<T, TFilterData, TRef>, options?: IAbstractTreeOptions<T, TFilterData>): IListOptions<ITreeNode<T, TFilterData>> | undefined {
	return options && {
		...options,
		identityProvider: options.identityProvider && {
			getId(el) {
				return options.identityProvider!.getId(el.element);
			}
		},
		dnd: options.dnd && new TreeNodeListDragAndDrop(modelProvider, options.dnd),
		multipleSelectionController: options.multipleSelectionController && {
			isSelectionSingleChangeEvent(e) {
				return options.multipleSelectionController!.isSelectionSingleChangeEvent({ ...e, element: e.element } as any);
			},
			isSelectionRangeChangeEvent(e) {
				return options.multipleSelectionController!.isSelectionRangeChangeEvent({ ...e, element: e.element } as any);
			}
		},
		accessibilityProvider: options.accessibilityProvider && {
			getAriaLabel(e) {
				return options.accessibilityProvider!.getAriaLabel(e.element);
			},
			getAriaLevel(node) {
				return node.depth;
			}
		},
		keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
			...options.keyboardNavigationLabelProvider,
			getKeyboardNavigationLabel(node) {
				return options.keyboardNavigationLabelProvider!.getKeyboardNavigationLabel(node.element);
			}
		},
		enableKeyboardNavigation: options.simpleKeyboardNavigation
	};
}

export class ComposedTreeDelegate<T, N extends { element: T }> implements IListVirtualDelegate<N> {

	constructor(private delegate: IListVirtualDelegate<T>) { }

	getHeight(element: N): number {
		return this.delegate.getHeight(element.element);
	}

	getTemplateId(element: N): string {
		return this.delegate.getTemplateId(element.element);
	}

	hasDynamicHeight(element: N): boolean {
		return !!this.delegate.hasDynamicHeight && this.delegate.hasDynamicHeight(element.element);
	}
}

interface ITreeListTemplateData<T> {
	twistie: HTMLElement;
	templateData: T;
}

interface ITreeRendererOptions {
	readonly indent?: number;
}

class TreeRenderer<T, TFilterData, TTemplateData> implements IListRenderer<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>> {

	private static DefaultIndent = 8;

	readonly templateId: string;
	private renderedElements = new Map<T, ITreeNode<T, TFilterData>>();
	private renderedNodes = new Map<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>>();
	private indent: number;
	private disposables: IDisposable[] = [];

	constructor(
		private renderer: ITreeRenderer<T, TFilterData, TTemplateData>,
		onDidChangeCollapseState: Event<ICollapseStateChangeEvent<T, TFilterData>>,
		options: ITreeRendererOptions = {}
	) {
		this.templateId = renderer.templateId;
		this.updateOptions(options);

		Event.map(onDidChangeCollapseState, e => e.node)(this.onDidChangeNodeTwistieState, this, this.disposables);

		if (renderer.onDidChangeTwistieState) {
			renderer.onDidChangeTwistieState(this.onDidChangeTwistieState, this, this.disposables);
		}
	}

	updateOptions(options: ITreeRendererOptions = {}): void {
		this.indent = typeof options.indent === 'number' ? Math.max(options.indent, 0) : TreeRenderer.DefaultIndent;

		this.renderedNodes.forEach((templateData, node) => {
			templateData.twistie.style.marginLeft = `${node.depth * this.indent}px`;
		});
	}

	renderTemplate(container: HTMLElement): ITreeListTemplateData<TTemplateData> {
		const el = append(container, $('.monaco-tl-row'));
		const twistie = append(el, $('.monaco-tl-twistie'));
		const contents = append(el, $('.monaco-tl-contents'));
		const templateData = this.renderer.renderTemplate(contents);

		return { twistie, templateData };
	}

	renderElement(node: ITreeNode<T, TFilterData>, index: number, templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderedNodes.set(node, templateData);
		this.renderedElements.set(node.element, node);

		const indent = TreeRenderer.DefaultIndent + (node.depth - 1) * this.indent;
		templateData.twistie.style.marginLeft = `${indent}px`;
		this.renderTwistie(node, templateData.twistie);

		this.renderer.renderElement(node, index, templateData.templateData);
	}

	disposeElement(node: ITreeNode<T, TFilterData>, index: number, templateData: ITreeListTemplateData<TTemplateData>): void {
		if (this.renderer.disposeElement) {
			this.renderer.disposeElement(node, index, templateData.templateData);
		}
		this.renderedNodes.delete(node);
		this.renderedElements.set(node.element);
	}

	disposeTemplate(templateData: ITreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	private onDidChangeTwistieState(element: T): void {
		const node = this.renderedElements.get(element);

		if (!node) {
			return;
		}

		this.onDidChangeNodeTwistieState(node);
	}

	private onDidChangeNodeTwistieState(node: ITreeNode<T, TFilterData>): void {
		const templateData = this.renderedNodes.get(node);

		if (!templateData) {
			return;
		}

		this.renderTwistie(node, templateData.twistie);
	}

	private renderTwistie(node: ITreeNode<T, TFilterData>, twistieElement: HTMLElement) {
		if (this.renderer.renderTwistie) {
			this.renderer.renderTwistie(node.element, twistieElement);
		}

		toggleClass(twistieElement, 'collapsible', node.collapsible);
		toggleClass(twistieElement, 'collapsed', node.collapsible && node.collapsed);
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.renderedElements.clear();
		this.disposables = dispose(this.disposables);
	}
}

class TypeFilter<T> implements ITreeFilter<T, FuzzyScore>, IDisposable {

	private _totalCount = 0;
	get totalCount(): number { return this._totalCount; }
	private _matchCount = 0;
	get matchCount(): number { return this._matchCount; }

	private _pattern: string;
	private _lowercasePattern: string;
	private disposables: IDisposable[] = [];

	set pattern(pattern: string) {
		this._pattern = pattern;
		this._lowercasePattern = pattern.toLowerCase();
	}

	constructor(
		private tree: AbstractTree<T, any, any>,
		private keyboardNavigationLabelProvider: IKeyboardNavigationLabelProvider<T>,
		private _filter?: ITreeFilter<T, FuzzyScore>
	) {
		tree.onWillRefilter(this.reset, this, this.disposables);
	}

	filter(element: T, parentVisibility: TreeVisibility): TreeFilterResult<FuzzyScore> {
		if (this._filter) {
			const result = this._filter.filter(element, parentVisibility);

			if (this.tree.options.simpleKeyboardNavigation) {
				return result;
			}

			let visibility: TreeVisibility;

			if (typeof result === 'boolean') {
				visibility = result ? TreeVisibility.Visible : TreeVisibility.Hidden;
			} else if (isFilterResult(result)) {
				visibility = getVisibleState(result.visibility);
			} else {
				visibility = result;
			}

			if (visibility === TreeVisibility.Hidden) {
				return false;
			}
		}

		this._totalCount++;

		if (this.tree.options.simpleKeyboardNavigation || !this._pattern) {
			this._matchCount++;
			return { data: FuzzyScore.Default, visibility: true };
		}

		const label = this.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(element).toString();
		const score = fuzzyScore(this._pattern, this._lowercasePattern, 0, label, label.toLowerCase(), 0, true);

		if (!score) {
			if (this.tree.options.filterOnType) {
				return TreeVisibility.Recurse;
			} else {
				return { data: FuzzyScore.Default, visibility: true };
			}

			// DEMO: smarter filter ?
			// return parentVisibility === TreeVisibility.Visible ? true : TreeVisibility.Recurse;
		}

		this._matchCount++;
		return { data: score, visibility: true };
	}

	private reset(): void {
		this._totalCount = 0;
		this._matchCount = 0;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

class TypeFilterController<T, TFilterData> implements IDisposable {

	private _enabled = false;
	get enabled(): boolean { return this._enabled; }

	private _pattern = '';
	get pattern(): string { return this._pattern; }

	private positionClassName = 'ne';
	private domNode: HTMLElement;
	private messageDomNode: HTMLElement;
	private labelDomNode: HTMLElement;
	private filterOnTypeDomNode: HTMLInputElement;
	private clearDomNode: HTMLElement;

	private enabledDisposables: IDisposable[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private tree: AbstractTree<T, TFilterData, any>,
		model: ITreeModel<T, TFilterData, any>,
		private view: List<ITreeNode<T, TFilterData>>,
		private filter: TypeFilter<T>,
		private keyboardNavigationLabelProvider: IKeyboardNavigationLabelProvider<T>
	) {
		this.domNode = $(`.monaco-list-type-filter.${this.positionClassName}`);
		this.domNode.draggable = true;
		domEvent(this.domNode, 'dragstart')(this.onDragStart, this, this.disposables);

		this.messageDomNode = append(view.getHTMLElement(), $(`.monaco-list-type-filter-message`));

		this.labelDomNode = append(this.domNode, $('span.label'));
		const controls = append(this.domNode, $('.controls'));

		this.filterOnTypeDomNode = append(controls, $<HTMLInputElement>('input.filter'));
		this.filterOnTypeDomNode.type = 'checkbox';
		this.filterOnTypeDomNode.checked = !!tree.options.filterOnType;
		this.filterOnTypeDomNode.tabIndex = -1;
		this.updateFilterOnTypeTitle();
		domEvent(this.filterOnTypeDomNode, 'input')(this.onDidChangeFilterOnType, this, this.disposables);

		this.clearDomNode = append(controls, $<HTMLInputElement>('button.clear'));
		this.clearDomNode.tabIndex = -1;
		this.clearDomNode.title = localize('clear', "Clear");

		model.onDidSplice(this.onDidSpliceModel, this, this.disposables);

		tree.onDidUpdateOptions(this.onDidUpdateTreeOptions, this, this.disposables);
		this.onDidUpdateTreeOptions(tree.options);
	}

	private onDidUpdateTreeOptions(options: IAbstractTreeOptions<T, TFilterData>): void {
		if (options.simpleKeyboardNavigation) {
			this.disable();
		} else {
			this.enable();
		}

		this.filterOnTypeDomNode.checked = !!options.filterOnType;
		this.tree.refilter();
		this.render();
	}

	private enable(): void {
		if (this._enabled) {
			return;
		}

		const isPrintableCharEvent = this.keyboardNavigationLabelProvider.mightProducePrintableCharacter ? (e: IKeyboardEvent) => this.keyboardNavigationLabelProvider.mightProducePrintableCharacter!(e) : (e: IKeyboardEvent) => mightProducePrintableCharacter(e);
		const onKeyDown = Event.chain(domEvent(this.view.getHTMLElement(), 'keydown'))
			.filter(e => !isInputElement(e.target as HTMLElement) || e.target === this.filterOnTypeDomNode)
			.map(e => new StandardKeyboardEvent(e))
			.filter(e => isPrintableCharEvent(e) || (this._pattern.length > 0 && ((e.keyCode === KeyCode.Escape || e.keyCode === KeyCode.Backspace) && !e.altKey && !e.ctrlKey && !e.metaKey) || (e.keyCode === KeyCode.Backspace && (isMacintosh ? e.altKey : e.ctrlKey))))
			.forEach(e => { e.stopPropagation(); e.preventDefault(); })
			.event;

		const onClear = domEvent(this.clearDomNode, 'click');
		const onInput = Event.chain(Event.any<MouseEvent | StandardKeyboardEvent>(onKeyDown, onClear))
			.reduce((previous: string, e) => {
				if (e instanceof MouseEvent || e.keyCode === KeyCode.Escape || (e.keyCode === KeyCode.Backspace && (isMacintosh ? e.altKey : e.ctrlKey))) {
					return '';
				}

				if (e.keyCode === KeyCode.Backspace) {
					return previous.length === 0 ? '' : previous.substr(0, previous.length - 1);
				}

				return previous + e.browserEvent.key;
			}, '')
			.event;

		onInput(this.onInput, this, this.enabledDisposables);
		this.filter.pattern = '';
		this.tree.refilter();
		this.render();
		this._enabled = true;
	}

	private disable(): void {
		if (!this._enabled) {
			return;
		}

		this.domNode.remove();
		this.enabledDisposables = dispose(this.enabledDisposables);
		this.tree.refilter();
		this.render();
		this._enabled = false;
	}

	private onInput(pattern: string): void {
		const container = this.view.getHTMLElement();

		if (pattern && !this.domNode.parentElement) {
			container.append(this.domNode);
		} else if (!pattern && this.domNode.parentElement) {
			this.domNode.remove();
			this.tree.domFocus();
		}

		this._pattern = pattern;
		this.filter.pattern = pattern;
		this.tree.refilter();
		this.tree.focusNext(0, true);

		const focus = this.tree.getFocus();

		if (focus.length > 0) {
			const element = focus[0];

			if (this.tree.getRelativeTop(element) === null) {
				this.tree.reveal(focus[0], 0.5);
			}
		}

		this.render();
	}

	private onDragStart(): void {
		const container = this.view.getHTMLElement();
		const { left } = getDomNodePagePosition(container);
		const containerWidth = container.clientWidth;
		const midContainerWidth = containerWidth / 2;
		const width = this.domNode.clientWidth;
		const disposables: IDisposable[] = [];
		let positionClassName = this.positionClassName;

		const updatePosition = () => {
			switch (positionClassName) {
				case 'nw':
					this.domNode.style.top = `4px`;
					this.domNode.style.left = `4px`;
					break;
				case 'ne':
					this.domNode.style.top = `4px`;
					this.domNode.style.left = `${containerWidth - width - 6}px`;
					break;
			}
		};

		const onDragOver = (event: DragEvent) => {
			const x = event.screenX - left;
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'none';
			}

			if (x < midContainerWidth) {
				positionClassName = 'nw';
			} else {
				positionClassName = 'ne';
			}

			updatePosition();
		};

		const onDragEnd = () => {
			this.positionClassName = positionClassName;
			this.domNode.className = `monaco-list-type-filter ${this.positionClassName}`;
			this.domNode.style.top = null;
			this.domNode.style.left = null;

			dispose(disposables);
		};

		updatePosition();
		removeClass(this.domNode, positionClassName);

		addClass(this.domNode, 'dragging');
		disposables.push(toDisposable(() => removeClass(this.domNode, 'dragging')));

		domEvent(document, 'dragover')(onDragOver, null, disposables);
		domEvent(this.domNode, 'dragend')(onDragEnd, null, disposables);

		StaticDND.CurrentDragAndDropData = new DragAndDropData('vscode-ui');
		disposables.push(toDisposable(() => StaticDND.CurrentDragAndDropData = undefined));
	}

	private onDidSpliceModel(): void {
		if (!this._enabled || this.pattern.length === 0) {
			return;
		}

		this.tree.refilter();
		this.render();
	}

	private onDidChangeFilterOnType(): void {
		this.tree.updateOptions({ filterOnType: this.filterOnTypeDomNode.checked });
		this.tree.refilter();
		this.tree.domFocus();
		this.render();
		this.updateFilterOnTypeTitle();
	}

	private updateFilterOnTypeTitle(): void {
		if (this.filterOnTypeDomNode.checked) {
			this.filterOnTypeDomNode.title = localize('disable filter on type', "Disable Filter on Type");
		} else {
			this.filterOnTypeDomNode.title = localize('enable filter on type', "Enable Filter on Type");
		}
	}

	private render(): void {
		const noMatches = this.filter.totalCount > 0 && this.filter.matchCount === 0;

		if (this.pattern && this.tree.options.filterOnType && noMatches) {
			this.messageDomNode.textContent = localize('empty', "No elements found");
		} else {
			this.messageDomNode.innerHTML = '';
		}

		toggleClass(this.domNode, 'no-matches', noMatches);
		this.domNode.title = localize('found', "Matched {0} out of {1} elements", this.filter.matchCount, this.filter.totalCount);
		this.labelDomNode.textContent = this.pattern.length > 16 ? '…' + this.pattern.substr(this.pattern.length - 16) : this.pattern;
	}

	dispose() {
		this.disable();
		this.disposables = dispose(this.disposables);
	}
}

function isInputElement(e: HTMLElement): boolean {
	return e.tagName === 'INPUT' || e.tagName === 'TEXTAREA';
}

function asTreeEvent<T>(event: IListEvent<ITreeNode<T, any>>): ITreeEvent<T> {
	return {
		elements: event.elements.map(node => node.element),
		browserEvent: event.browserEvent
	};
}

function asTreeMouseEvent<T>(event: IListMouseEvent<ITreeNode<T, any>>): ITreeMouseEvent<T> {
	return {
		browserEvent: event.browserEvent,
		element: event.element ? event.element.element : null
	};
}

function asTreeContextMenuEvent<T>(event: IListContextMenuEvent<ITreeNode<T, any>>): ITreeContextMenuEvent<T> {
	return {
		element: event.element ? event.element.element : null,
		browserEvent: event.browserEvent,
		anchor: event.anchor
	};
}

export interface IAbstractTreeOptionsUpdate extends ITreeRendererOptions {
	readonly simpleKeyboardNavigation?: boolean;
	readonly filterOnType?: boolean;
}

export interface IAbstractTreeOptions<T, TFilterData = void> extends IAbstractTreeOptionsUpdate, IListOptions<T> {
	readonly collapseByDefault?: boolean; // defaults to false
	readonly filter?: ITreeFilter<T, TFilterData>;
	readonly dnd?: ITreeDragAndDrop<T>;
	readonly autoExpandSingleChildren?: boolean;
}

/**
 * The trait concept needs to exist at the tree level, because collapsed
 * tree nodes will not be known by the list.
 */
class Trait<T> {

	private nodes: ITreeNode<T, any>[] = [];
	private elements: T[] | undefined;

	private _onDidChange = new Emitter<ITreeEvent<T>>();
	readonly onDidChange = this._onDidChange.event;

	private _nodeSet: Set<ITreeNode<T, any>> | undefined;
	private get nodeSet(): Set<ITreeNode<T, any>> {
		if (!this._nodeSet) {
			this._nodeSet = new Set();

			for (const node of this.nodes) {
				this._nodeSet.add(node);
			}
		}

		return this._nodeSet;
	}

	set(nodes: ITreeNode<T, any>[], browserEvent?: UIEvent): void {
		this.nodes = [...nodes];
		this.elements = undefined;
		this._nodeSet = undefined;

		const that = this;
		this._onDidChange.fire({ get elements() { return that.get(); }, browserEvent });
	}

	get(): T[] {
		if (!this.elements) {
			this.elements = this.nodes.map(node => node.element);
		}

		return [...this.elements];
	}

	has(node: ITreeNode<T, any>): boolean {
		return this.nodeSet.has(node);
	}

	remove(nodes: ITreeNode<T, any>[]): void {
		if (nodes.length === 0) {
			return;
		}

		const set = this.nodeSet;
		const visit = (node: ITreeNode<T, any>) => {
			set.delete(node);
			node.children.forEach(visit);
		};

		nodes.forEach(visit);
		this.set(values(set));
	}
}

/**
 * We use this List subclass to restore selection and focus as nodes
 * get rendered in the list, possibly due to a node expand() call.
 */
class TreeNodeList<T, TFilterData> extends List<ITreeNode<T, TFilterData>> {

	constructor(
		container: HTMLElement,
		virtualDelegate: IListVirtualDelegate<ITreeNode<T, TFilterData>>,
		renderers: IListRenderer<any /* TODO@joao */, any>[],
		private focusTrait: Trait<T>,
		private selectionTrait: Trait<T>,
		options?: IListOptions<ITreeNode<T, TFilterData>>
	) {
		super(container, virtualDelegate, renderers, options);
	}

	splice(start: number, deleteCount: number, elements: ITreeNode<T, TFilterData>[] = []): void {
		super.splice(start, deleteCount, elements);

		if (elements.length === 0) {
			return;
		}

		const additionalFocus: number[] = [];
		const additionalSelection: number[] = [];

		elements.forEach((node, index) => {
			if (this.selectionTrait.has(node)) {
				additionalFocus.push(start + index);
			}

			if (this.selectionTrait.has(node)) {
				additionalSelection.push(start + index);
			}
		});

		if (additionalFocus.length > 0) {
			super.setFocus([...super.getFocus(), ...additionalFocus]);
		}

		if (additionalSelection.length > 0) {
			super.setSelection([...super.getSelection(), ...additionalSelection]);
		}
	}

	setFocus(indexes: number[], browserEvent?: UIEvent, fromAPI = false): void {
		super.setFocus(indexes, browserEvent);

		if (!fromAPI) {
			this.focusTrait.set(indexes.map(i => this.element(i)), browserEvent);
		}
	}

	setSelection(indexes: number[], browserEvent?: UIEvent, fromAPI = false): void {
		super.setSelection(indexes, browserEvent);

		if (!fromAPI) {
			this.selectionTrait.set(indexes.map(i => this.element(i)), browserEvent);
		}
	}
}

export abstract class AbstractTree<T, TFilterData, TRef> implements IDisposable {

	private view: TreeNodeList<T, TFilterData>;
	private renderers: TreeRenderer<T, TFilterData, any>[];
	private focusNavigationFilter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined;
	protected model: ITreeModel<T, TFilterData, TRef>;
	private focus = new Trait<T>();
	private selection = new Trait<T>();
	private eventBufferer = new EventBufferer();
	protected disposables: IDisposable[] = [];

	private _onDidUpdateOptions = new Emitter<IAbstractTreeOptions<T, TFilterData>>();
	readonly onDidUpdateOptions = this._onDidUpdateOptions.event;

	get onDidScroll(): Event<void> { return this.view.onDidScroll; }

	readonly onDidChangeFocus: Event<ITreeEvent<T>> = this.eventBufferer.wrapEvent(this.focus.onDidChange);
	readonly onDidChangeSelection: Event<ITreeEvent<T>> = this.eventBufferer.wrapEvent(this.selection.onDidChange);
	get onDidOpen(): Event<ITreeEvent<T>> { return Event.map(this.view.onDidOpen, asTreeEvent); }

	get onMouseClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onMouseDblClick, asTreeMouseEvent); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return Event.map(this.view.onContextMenu, asTreeContextMenuEvent); }

	get onKeyDown(): Event<KeyboardEvent> { return this.view.onKeyDown; }
	get onKeyUp(): Event<KeyboardEvent> { return this.view.onKeyUp; }
	get onKeyPress(): Event<KeyboardEvent> { return this.view.onKeyPress; }

	get onDidFocus(): Event<void> { return this.view.onDidFocus; }
	get onDidBlur(): Event<void> { return this.view.onDidBlur; }

	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T, TFilterData>> { return this.model.onDidChangeCollapseState; }
	get onDidChangeRenderNodeCount(): Event<ITreeNode<T, TFilterData>> { return this.model.onDidChangeRenderNodeCount; }

	private _onWillRefilter = new Emitter<void>();
	readonly onWillRefilter: Event<void> = this._onWillRefilter.event;

	get onDidDispose(): Event<void> { return this.view.onDidDispose; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		private _options: IAbstractTreeOptions<T, TFilterData> = {}
	) {
		const treeDelegate = new ComposedTreeDelegate<T, ITreeNode<T, TFilterData>>(delegate);

		const onDidChangeCollapseStateRelay = new Relay<ICollapseStateChangeEvent<T, TFilterData>>();
		this.renderers = renderers.map(r => new TreeRenderer<T, TFilterData, any>(r, onDidChangeCollapseStateRelay.event, _options));
		this.disposables.push(...this.renderers);

		let filter: TypeFilter<T> | undefined;

		if (_options.keyboardNavigationLabelProvider) {
			filter = new TypeFilter(this, _options.keyboardNavigationLabelProvider, _options.filter as ITreeFilter<T, FuzzyScore>);
			_options = { ..._options, filter: filter as ITreeFilter<T, TFilterData> }; // TODO need typescript help here
			this.disposables.push(filter);
		}

		this.view = new TreeNodeList(container, treeDelegate, this.renderers, this.focus, this.selection, asListOptions(() => this.model, _options));

		this.model = this.createModel(this.view, _options);
		onDidChangeCollapseStateRelay.input = this.model.onDidChangeCollapseState;

		this.model.onDidSplice(e => {
			this.eventBufferer.bufferEvents(() => {
				this.focus.remove(e.deletedNodes);
				this.selection.remove(e.deletedNodes);
			});
		}, null, this.disposables);

		this.view.onTap(this.reactOnMouseClick, this, this.disposables);
		this.view.onMouseClick(this.reactOnMouseClick, this, this.disposables);

		if (_options.keyboardSupport !== false) {
			const onKeyDown = Event.chain(this.view.onKeyDown)
				.filter(e => !isInputElement(e.target as HTMLElement))
				.map(e => new StandardKeyboardEvent(e));

			onKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow).on(this.onLeftArrow, this, this.disposables);
			onKeyDown.filter(e => e.keyCode === KeyCode.RightArrow).on(this.onRightArrow, this, this.disposables);
			onKeyDown.filter(e => e.keyCode === KeyCode.Space).on(this.onSpace, this, this.disposables);
		}

		if (_options.keyboardNavigationLabelProvider) {
			const typeFilterController = new TypeFilterController(this, this.model, this.view, filter!, _options.keyboardNavigationLabelProvider);
			this.focusNavigationFilter = node => {
				if (!typeFilterController.enabled || !typeFilterController.pattern) {
					return true;
				}

				if (filter!.totalCount > 0 && filter!.matchCount === 0) {
					return true;
				}

				return !FuzzyScore.isDefault(node.filterData as any as FuzzyScore);
			};
			this.disposables.push(typeFilterController);
		}
	}

	updateOptions(optionsUpdate: IAbstractTreeOptionsUpdate = {}): void {
		this._options = { ...this._options, ...optionsUpdate };

		for (const renderer of this.renderers) {
			renderer.updateOptions(optionsUpdate);
		}

		this.view.updateOptions({ enableKeyboardNavigation: this._options.simpleKeyboardNavigation });
		this._onDidUpdateOptions.fire(this._options);
	}

	get options(): IAbstractTreeOptions<T, TFilterData> {
		return this._options;
	}

	updateWidth(element: TRef): void {
		const index = this.model.getListIndex(element);

		if (index === -1) {
			return;
		}

		this.view.updateWidth(index);
	}

	// Widget

	getHTMLElement(): HTMLElement {
		return this.view.getHTMLElement();
	}

	get contentHeight(): number {
		return this.view.contentHeight;
	}

	get onDidChangeContentHeight(): Event<number> {
		return this.view.onDidChangeContentHeight;
	}

	get scrollTop(): number {
		return this.view.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this.view.scrollTop = scrollTop;
	}

	get scrollHeight(): number {
		return this.view.scrollHeight;
	}

	get renderHeight(): number {
		return this.view.renderHeight;
	}

	domFocus(): void {
		this.view.domFocus();
	}

	isDOMFocused(): boolean {
		return this.getHTMLElement() === document.activeElement;
	}

	layout(height?: number, width?: number): void {
		this.view.layout(height, width);
	}

	style(styles: IListStyles): void {
		this.view.style(styles);
	}

	// Tree navigation

	getParentElement(location: TRef): T {
		return this.model.getParentElement(location);
	}

	getFirstElementChild(location: TRef): T | undefined {
		return this.model.getFirstElementChild(location);
	}

	// Tree

	getNode(location?: TRef): ITreeNode<T, TFilterData> {
		return this.model.getNode(location);
	}

	collapse(location: TRef, recursive: boolean = false): boolean {
		return this.model.setCollapsed(location, true, recursive);
	}

	expand(location: TRef, recursive: boolean = false): boolean {
		return this.model.setCollapsed(location, false, recursive);
	}

	toggleCollapsed(location: TRef, recursive: boolean = false): boolean {
		return this.model.setCollapsed(location, undefined, recursive);
	}

	expandAll(): void {
		this.model.setCollapsed(this.model.rootRef, false, true);
	}

	collapseAll(): void {
		this.model.setCollapsed(this.model.rootRef, true, true);
	}

	isCollapsible(location: TRef): boolean {
		return this.model.isCollapsible(location);
	}

	isCollapsed(location: TRef): boolean {
		return this.model.isCollapsed(location);
	}

	refilter(): void {
		this._onWillRefilter.fire(undefined);
		this.model.refilter();
	}

	setSelection(elements: TRef[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.model.getNode(e));
		this.selection.set(nodes, browserEvent);

		const indexes = elements.map(e => this.model.getListIndex(e)).filter(i => i > -1);
		this.view.setSelection(indexes, browserEvent, true);
	}

	getSelection(): T[] {
		return this.selection.get();
	}

	setFocus(elements: TRef[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.model.getNode(e));
		this.focus.set(nodes, browserEvent);

		const indexes = elements.map(e => this.model.getListIndex(e)).filter(i => i > -1);
		this.view.setFocus(indexes, browserEvent, true);
	}

	focusNext(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.view.focusNext(n, loop, browserEvent, this.focusNavigationFilter);
	}

	focusPrevious(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.view.focusPrevious(n, loop, browserEvent, this.focusNavigationFilter);
	}

	focusNextPage(browserEvent?: UIEvent): void {
		this.view.focusNextPage(browserEvent, this.focusNavigationFilter);
	}

	focusPreviousPage(browserEvent?: UIEvent): void {
		this.view.focusPreviousPage(browserEvent, this.focusNavigationFilter);
	}

	focusLast(browserEvent?: UIEvent): void {
		this.view.focusLast(browserEvent, this.focusNavigationFilter);
	}

	focusFirst(browserEvent?: UIEvent): void {
		this.view.focusFirst(browserEvent, this.focusNavigationFilter);
	}

	getFocus(): T[] {
		return this.focus.get();
	}

	open(elements: TRef[]): void {
		const indexes = elements.map(e => this.model.getListIndex(e));
		this.view.open(indexes);
	}

	reveal(location: TRef, relativeTop?: number): void {
		const index = this.model.getListIndex(location);
		this.view.reveal(index, relativeTop);
	}

	/**
	 * Returns the relative position of an element rendered in the list.
	 * Returns `null` if the element isn't *entirely* in the visible viewport.
	 */
	getRelativeTop(location: TRef): number | null {
		const index = this.model.getListIndex(location);
		return this.view.getRelativeTop(index);
	}

	// List

	get visibleNodeCount(): number {
		return this.view.length;
	}

	private reactOnMouseClick(e: IListMouseEvent<ITreeNode<T, TFilterData>>): void {
		const node = e.element;

		if (!node) {
			return;
		}
		if (isSelectionRangeChangeEvent(e) || isSelectionSingleChangeEvent(e)) {
			return;
		}

		const location = this.model.getNodeLocation(node);
		const recursive = e.browserEvent.altKey;

		this.model.setCollapsed(location, undefined, recursive);
	}

	private onLeftArrow(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const nodes = this.view.getFocusedElements();

		if (nodes.length === 0) {
			return;
		}

		const node = nodes[0];
		const location = this.model.getNodeLocation(node);
		const didChange = this.model.setCollapsed(location, true);

		if (!didChange) {
			const parentLocation = this.model.getParentNodeLocation(location);

			if (parentLocation === null) {
				return;
			}

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
		const location = this.model.getNodeLocation(node);
		const didChange = this.model.setCollapsed(location, false);

		if (!didChange) {
			if (!node.children.some(child => child.visible)) {
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
		const location = this.model.getNodeLocation(node);
		const recursive = e.browserEvent.altKey;

		this.model.setCollapsed(location, undefined, recursive);
	}

	protected abstract createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: IAbstractTreeOptions<T, TFilterData>): ITreeModel<T, TFilterData, TRef>;

	navigate(start?: TRef): ITreeNavigator<T> {
		return new TreeNavigator(this.view, this.model, start);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.view.dispose();
	}
}

interface ITreeNavigatorView<T extends NonNullable<any>, TFilterData> {
	readonly length: number;
	element(index: number): ITreeNode<T, TFilterData>;
}

class TreeNavigator<T extends NonNullable<any>, TFilterData, TRef> implements ITreeNavigator<T> {

	private index: number;

	constructor(private view: ITreeNavigatorView<T, TFilterData>, private model: ITreeModel<T, TFilterData, TRef>, start?: TRef) {
		if (start) {
			this.index = this.model.getListIndex(start);
		} else {
			this.index = -1;
		}
	}

	current(): T | null {
		if (this.index < 0 || this.index >= this.view.length) {
			return null;
		}

		return this.view.element(this.index).element;
	}

	previous(): T | null {
		this.index--;
		return this.current();
	}

	next(): T | null {
		this.index++;
		return this.current();
	}

	parent(): T | null {
		if (this.index < 0 || this.index >= this.view.length) {
			return null;
		}

		const node = this.view.element(this.index);

		if (!node.parent) {
			this.index = -1;
			return this.current();
		}

		this.index = this.model.getListIndex(this.model.getNodeLocation(node.parent));
		return this.current();
	}

	first(): T | null {
		this.index = 0;
		return this.current();
	}

	last(): T | null {
		this.index = this.view.length - 1;
		return this.current();
	}
}
