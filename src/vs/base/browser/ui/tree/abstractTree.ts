/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from 'vs/base/browser/dnd';
import { $, append, clearNode, createStyleSheet, h, hasParentWithClass } from 'vs/base/browser/dom';
import { DomEmitter } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { IInputBoxStyles, IMessage, MessageType, unthemedInboxStyles } from 'vs/base/browser/ui/inputbox/inputBox';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListContextMenuEvent, IListDragAndDrop, IListDragOverReaction, IListMouseEvent, IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';
import { IListOptions, IListStyles, isButton, isInputElement, isMonacoEditor, List, MouseController, TypeNavigationMode } from 'vs/base/browser/ui/list/listWidget';
import { IToggleStyles, Toggle, unthemedToggleStyles } from 'vs/base/browser/ui/toggle/toggle';
import { getVisibleState, isFilterResult } from 'vs/base/browser/ui/tree/indexTreeModel';
import { ICollapseStateChangeEvent, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeEvent, ITreeFilter, ITreeModel, ITreeModelSpliceEvent, ITreeMouseEvent, ITreeNavigator, ITreeNode, ITreeRenderer, TreeDragOverBubble, TreeError, TreeFilterResult, TreeMouseEventTarget, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { Action } from 'vs/base/common/actions';
import { distinct, equals, firstOrDefault, range } from 'vs/base/common/arrays';
import { disposableTimeout, timeout } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { SetMap } from 'vs/base/common/collections';
import { Emitter, Event, EventBufferer, Relay } from 'vs/base/common/event';
import { fuzzyScore, FuzzyScore } from 'vs/base/common/filters';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { ScrollEvent } from 'vs/base/common/scrollable';
import { ISpliceable } from 'vs/base/common/sequence';
import { isNumber } from 'vs/base/common/types';
import 'vs/css!./media/tree';
import { localize } from 'vs/nls';

class TreeElementsDragAndDropData<T, TFilterData, TContext> extends ElementsDragAndDropData<T, TContext> {

	override set context(context: TContext | undefined) {
		this.data.context = context;
	}

	override get context(): TContext | undefined {
		return this.data.context;
	}

	constructor(private data: ElementsDragAndDropData<ITreeNode<T, TFilterData>, TContext>) {
		super(data.elements.map(node => node.element));
	}
}

function asTreeDragAndDropData<T, TFilterData>(data: IDragAndDropData): IDragAndDropData {
	if (data instanceof ElementsDragAndDropData) {
		return new TreeElementsDragAndDropData(data);
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

	getDragLabel(nodes: ITreeNode<T, TFilterData>[], originalEvent: DragEvent): string | undefined {
		if (this.dnd.getDragLabel) {
			return this.dnd.getDragLabel(nodes.map(node => node.element), originalEvent);
		}

		return undefined;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		this.dnd.onDragStart?.(asTreeDragAndDropData(data), originalEvent);
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

		if (typeof result === 'boolean' || !result.accept || typeof result.bubble === 'undefined' || result.feedback) {
			if (!raw) {
				const accept = typeof result === 'boolean' ? result : result.accept;
				const effect = typeof result === 'boolean' ? undefined : result.effect;
				return { accept, effect, feedback: [targetIndex!] };
			}

			return result;
		}

		if (result.bubble === TreeDragOverBubble.Up) {
			const model = this.modelProvider();
			const ref = model.getNodeLocation(targetNode);
			const parentRef = model.getParentNodeLocation(ref);
			const parentNode = model.getNode(parentRef);
			const parentIndex = parentRef && model.getListIndex(parentRef);

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

	onDragEnd(originalEvent: DragEvent): void {
		this.dnd.onDragEnd?.(originalEvent);
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
			...options.accessibilityProvider,
			getSetSize(node) {
				const model = modelProvider();
				const ref = model.getNodeLocation(node);
				const parentRef = model.getParentNodeLocation(ref);
				const parentNode = model.getNode(parentRef);

				return parentNode.visibleChildrenCount;
			},
			getPosInSet(node) {
				return node.visibleChildIndex + 1;
			},
			isChecked: options.accessibilityProvider && options.accessibilityProvider.isChecked ? (node) => {
				return options.accessibilityProvider!.isChecked!(node.element);
			} : undefined,
			getRole: options.accessibilityProvider && options.accessibilityProvider.getRole ? (node) => {
				return options.accessibilityProvider!.getRole!(node.element);
			} : () => 'treeitem',
			getAriaLabel(e) {
				return options.accessibilityProvider!.getAriaLabel(e.element);
			},
			getWidgetAriaLabel() {
				return options.accessibilityProvider!.getWidgetAriaLabel();
			},
			getWidgetRole: options.accessibilityProvider && options.accessibilityProvider.getWidgetRole ? () => options.accessibilityProvider!.getWidgetRole!() : () => 'tree',
			getAriaLevel: options.accessibilityProvider && options.accessibilityProvider.getAriaLevel ? (node) => options.accessibilityProvider!.getAriaLevel!(node.element) : (node) => {
				return node.depth;
			},
			getActiveDescendantId: options.accessibilityProvider.getActiveDescendantId && (node => {
				return options.accessibilityProvider!.getActiveDescendantId!(node.element);
			})
		},
		keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
			...options.keyboardNavigationLabelProvider,
			getKeyboardNavigationLabel(node) {
				return options.keyboardNavigationLabelProvider!.getKeyboardNavigationLabel(node.element);
			}
		}
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

	setDynamicHeight(element: N, height: number): void {
		this.delegate.setDynamicHeight?.(element.element, height);
	}
}

interface ITreeListTemplateData<T> {
	readonly container: HTMLElement;
	readonly indent: HTMLElement;
	readonly twistie: HTMLElement;
	indentGuidesDisposable: IDisposable;
	readonly templateData: T;
}

export interface IAbstractTreeViewState {
	readonly focus: Iterable<string>;
	readonly selection: Iterable<string>;
	readonly expanded: { [id: string]: 1 | 0 };
	readonly scrollTop: number;
}

export class AbstractTreeViewState implements IAbstractTreeViewState {
	public readonly focus: Set<string>;
	public readonly selection: Set<string>;
	public readonly expanded: { [id: string]: 1 | 0 };
	public scrollTop: number;

	public static lift(state: IAbstractTreeViewState) {
		return state instanceof AbstractTreeViewState ? state : new AbstractTreeViewState(state);
	}

	public static empty(scrollTop = 0) {
		return new AbstractTreeViewState({
			focus: [],
			selection: [],
			expanded: Object.create(null),
			scrollTop,
		});
	}

	protected constructor(state: IAbstractTreeViewState) {
		this.focus = new Set(state.focus);
		this.selection = new Set(state.selection);
		if (state.expanded instanceof Array) { // old format
			this.expanded = Object.create(null);
			for (const id of state.expanded as string[]) {
				this.expanded[id] = 1;
			}
		} else {
			this.expanded = state.expanded;
		}
		this.expanded = state.expanded;
		this.scrollTop = state.scrollTop;
	}

	public toJSON(): IAbstractTreeViewState {
		return {
			focus: Array.from(this.focus),
			selection: Array.from(this.selection),
			expanded: this.expanded,
			scrollTop: this.scrollTop,
		};
	}
}

export enum RenderIndentGuides {
	None = 'none',
	OnHover = 'onHover',
	Always = 'always'
}

interface ITreeRendererOptions {
	readonly indent?: number;
	readonly renderIndentGuides?: RenderIndentGuides;
	// TODO@joao replace this with collapsible: boolean | 'ondemand'
	readonly hideTwistiesOfChildlessElements?: boolean;
}

interface Collection<T> {
	readonly elements: T[];
	readonly onDidChange: Event<T[]>;
}

class EventCollection<T> implements Collection<T>, IDisposable {

	private readonly disposables = new DisposableStore();
	readonly onDidChange: Event<T[]>;

	get elements(): T[] {
		return this._elements;
	}

	constructor(onDidChange: Event<T[]>, private _elements: T[] = []) {
		this.onDidChange = Event.forEach(onDidChange, elements => this._elements = elements, this.disposables);
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

class TreeRenderer<T, TFilterData, TRef, TTemplateData> implements IListRenderer<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>> {

	private static readonly DefaultIndent = 8;

	readonly templateId: string;
	private renderedElements = new Map<T, ITreeNode<T, TFilterData>>();
	private renderedNodes = new Map<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>>();
	private indent: number = TreeRenderer.DefaultIndent;
	private hideTwistiesOfChildlessElements: boolean = false;

	private shouldRenderIndentGuides: boolean = false;
	private activeIndentNodes = new Set<ITreeNode<T, TFilterData>>();
	private indentGuidesDisposable: IDisposable = Disposable.None;

	private readonly disposables = new DisposableStore();

	constructor(
		private renderer: ITreeRenderer<T, TFilterData, TTemplateData>,
		private modelProvider: () => ITreeModel<T, TFilterData, TRef>,
		onDidChangeCollapseState: Event<ICollapseStateChangeEvent<T, TFilterData>>,
		private activeNodes: Collection<ITreeNode<T, TFilterData>>,
		private renderedIndentGuides: SetMap<ITreeNode<T, TFilterData>, HTMLDivElement>,
		options: ITreeRendererOptions = {}
	) {
		this.templateId = renderer.templateId;
		this.updateOptions(options);

		Event.map(onDidChangeCollapseState, e => e.node)(this.onDidChangeNodeTwistieState, this, this.disposables);
		renderer.onDidChangeTwistieState?.(this.onDidChangeTwistieState, this, this.disposables);
	}

	updateOptions(options: ITreeRendererOptions = {}): void {
		if (typeof options.indent !== 'undefined') {
			const indent = clamp(options.indent, 0, 40);

			if (indent !== this.indent) {
				this.indent = indent;

				for (const [node, templateData] of this.renderedNodes) {
					this.renderTreeElement(node, templateData);
				}
			}
		}

		if (typeof options.renderIndentGuides !== 'undefined') {
			const shouldRenderIndentGuides = options.renderIndentGuides !== RenderIndentGuides.None;

			if (shouldRenderIndentGuides !== this.shouldRenderIndentGuides) {
				this.shouldRenderIndentGuides = shouldRenderIndentGuides;

				for (const [node, templateData] of this.renderedNodes) {
					this._renderIndentGuides(node, templateData);
				}

				this.indentGuidesDisposable.dispose();

				if (shouldRenderIndentGuides) {
					const disposables = new DisposableStore();
					this.activeNodes.onDidChange(this._onDidChangeActiveNodes, this, disposables);
					this.indentGuidesDisposable = disposables;

					this._onDidChangeActiveNodes(this.activeNodes.elements);
				}
			}
		}

		if (typeof options.hideTwistiesOfChildlessElements !== 'undefined') {
			this.hideTwistiesOfChildlessElements = options.hideTwistiesOfChildlessElements;
		}
	}

	renderTemplate(container: HTMLElement): ITreeListTemplateData<TTemplateData> {
		const el = append(container, $('.monaco-tl-row'));
		const indent = append(el, $('.monaco-tl-indent'));
		const twistie = append(el, $('.monaco-tl-twistie'));
		const contents = append(el, $('.monaco-tl-contents'));
		const templateData = this.renderer.renderTemplate(contents);

		return { container, indent, twistie, indentGuidesDisposable: Disposable.None, templateData };
	}

	renderElement(node: ITreeNode<T, TFilterData>, index: number, templateData: ITreeListTemplateData<TTemplateData>, height: number | undefined): void {
		this.renderedNodes.set(node, templateData);
		this.renderedElements.set(node.element, node);
		this.renderTreeElement(node, templateData);
		this.renderer.renderElement(node, index, templateData.templateData, height);
	}

	disposeElement(node: ITreeNode<T, TFilterData>, index: number, templateData: ITreeListTemplateData<TTemplateData>, height: number | undefined): void {
		templateData.indentGuidesDisposable.dispose();

		this.renderer.disposeElement?.(node, index, templateData.templateData, height);

		if (typeof height === 'number') {
			this.renderedNodes.delete(node);
			this.renderedElements.delete(node.element);
		}
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

		this._onDidChangeActiveNodes(this.activeNodes.elements);
		this.renderTreeElement(node, templateData);
	}

	private renderTreeElement(node: ITreeNode<T, TFilterData>, templateData: ITreeListTemplateData<TTemplateData>) {
		const indent = TreeRenderer.DefaultIndent + (node.depth - 1) * this.indent;
		templateData.twistie.style.paddingLeft = `${indent}px`;
		templateData.indent.style.width = `${indent + this.indent - 16}px`;

		if (node.collapsible) {
			templateData.container.setAttribute('aria-expanded', String(!node.collapsed));
		} else {
			templateData.container.removeAttribute('aria-expanded');
		}

		templateData.twistie.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemExpanded));

		let twistieRendered = false;

		if (this.renderer.renderTwistie) {
			twistieRendered = this.renderer.renderTwistie(node.element, templateData.twistie);
		}

		if (node.collapsible && (!this.hideTwistiesOfChildlessElements || node.visibleChildrenCount > 0)) {
			if (!twistieRendered) {
				templateData.twistie.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemExpanded));
			}

			templateData.twistie.classList.add('collapsible');
			templateData.twistie.classList.toggle('collapsed', node.collapsed);
		} else {
			templateData.twistie.classList.remove('collapsible', 'collapsed');
		}

		this._renderIndentGuides(node, templateData);
	}

	private _renderIndentGuides(node: ITreeNode<T, TFilterData>, templateData: ITreeListTemplateData<TTemplateData>): void {
		clearNode(templateData.indent);
		templateData.indentGuidesDisposable.dispose();

		if (!this.shouldRenderIndentGuides) {
			return;
		}

		const disposableStore = new DisposableStore();
		const model = this.modelProvider();

		while (true) {
			const ref = model.getNodeLocation(node);
			const parentRef = model.getParentNodeLocation(ref);

			if (!parentRef) {
				break;
			}

			const parent = model.getNode(parentRef);
			const guide = $<HTMLDivElement>('.indent-guide', { style: `width: ${this.indent}px` });

			if (this.activeIndentNodes.has(parent)) {
				guide.classList.add('active');
			}

			if (templateData.indent.childElementCount === 0) {
				templateData.indent.appendChild(guide);
			} else {
				templateData.indent.insertBefore(guide, templateData.indent.firstElementChild);
			}

			this.renderedIndentGuides.add(parent, guide);
			disposableStore.add(toDisposable(() => this.renderedIndentGuides.delete(parent, guide)));

			node = parent;
		}

		templateData.indentGuidesDisposable = disposableStore;
	}

	private _onDidChangeActiveNodes(nodes: ITreeNode<T, TFilterData>[]): void {
		if (!this.shouldRenderIndentGuides) {
			return;
		}

		const set = new Set<ITreeNode<T, TFilterData>>();
		const model = this.modelProvider();

		nodes.forEach(node => {
			const ref = model.getNodeLocation(node);
			try {
				const parentRef = model.getParentNodeLocation(ref);

				if (node.collapsible && node.children.length > 0 && !node.collapsed) {
					set.add(node);
				} else if (parentRef) {
					set.add(model.getNode(parentRef));
				}
			} catch {
				// noop
			}
		});

		this.activeIndentNodes.forEach(node => {
			if (!set.has(node)) {
				this.renderedIndentGuides.forEach(node, line => line.classList.remove('active'));
			}
		});

		set.forEach(node => {
			if (!this.activeIndentNodes.has(node)) {
				this.renderedIndentGuides.forEach(node, line => line.classList.add('active'));
			}
		});

		this.activeIndentNodes = set;
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.renderedElements.clear();
		this.indentGuidesDisposable.dispose();
		dispose(this.disposables);
	}
}

export type LabelFuzzyScore = { label: string; score: FuzzyScore };

class FindFilter<T> implements ITreeFilter<T, FuzzyScore | LabelFuzzyScore>, IDisposable {
	private _totalCount = 0;
	get totalCount(): number { return this._totalCount; }
	private _matchCount = 0;
	get matchCount(): number { return this._matchCount; }

	private _pattern: string = '';
	private _lowercasePattern: string = '';
	private readonly disposables = new DisposableStore();

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

	filter(element: T, parentVisibility: TreeVisibility): TreeFilterResult<FuzzyScore | LabelFuzzyScore> {
		let visibility = TreeVisibility.Visible;

		if (this._filter) {
			const result = this._filter.filter(element, parentVisibility);

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

		if (!this._pattern) {
			this._matchCount++;
			return { data: FuzzyScore.Default, visibility };
		}

		const label = this.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(element);
		const labels = Array.isArray(label) ? label : [label];

		for (const l of labels) {
			const labelStr: string = l && l.toString();
			if (typeof labelStr === 'undefined') {
				return { data: FuzzyScore.Default, visibility };
			}

			let score: FuzzyScore | undefined;
			if (this.tree.findMatchType === TreeFindMatchType.Contiguous) {
				const index = labelStr.toLowerCase().indexOf(this._lowercasePattern);
				if (index > -1) {
					score = [Number.MAX_SAFE_INTEGER, 0];
					for (let i = this._lowercasePattern.length; i > 0; i--) {
						score.push(index + i - 1);
					}
				}
			} else {
				score = fuzzyScore(this._pattern, this._lowercasePattern, 0, labelStr, labelStr.toLowerCase(), 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
			}
			if (score) {
				this._matchCount++;
				return labels.length === 1 ?
					{ data: score, visibility } :
					{ data: { label: labelStr, score: score }, visibility };
			}
		}

		if (this.tree.findMode === TreeFindMode.Filter) {
			if (typeof this.tree.options.defaultFindVisibility === 'number') {
				return this.tree.options.defaultFindVisibility;
			} else if (this.tree.options.defaultFindVisibility) {
				return this.tree.options.defaultFindVisibility(element);
			} else {
				return TreeVisibility.Recurse;
			}
		} else {
			return { data: FuzzyScore.Default, visibility };
		}
	}

	private reset(): void {
		this._totalCount = 0;
		this._matchCount = 0;
	}

	dispose(): void {
		dispose(this.disposables);
	}
}

export interface ITreeFindToggleOpts {
	readonly isChecked: boolean;
	readonly inputActiveOptionBorder: string | undefined;
	readonly inputActiveOptionForeground: string | undefined;
	readonly inputActiveOptionBackground: string | undefined;
}

export class ModeToggle extends Toggle {
	constructor(opts: ITreeFindToggleOpts) {
		super({
			icon: Codicon.listFilter,
			title: localize('filter', "Filter"),
			isChecked: opts.isChecked ?? false,
			inputActiveOptionBorder: opts.inputActiveOptionBorder,
			inputActiveOptionForeground: opts.inputActiveOptionForeground,
			inputActiveOptionBackground: opts.inputActiveOptionBackground
		});
	}
}

export class FuzzyToggle extends Toggle {
	constructor(opts: ITreeFindToggleOpts) {
		super({
			icon: Codicon.searchFuzzy,
			title: localize('fuzzySearch', "Fuzzy Match"),
			isChecked: opts.isChecked ?? false,
			inputActiveOptionBorder: opts.inputActiveOptionBorder,
			inputActiveOptionForeground: opts.inputActiveOptionForeground,
			inputActiveOptionBackground: opts.inputActiveOptionBackground
		});
	}
}

export interface IFindWidgetStyles {
	listFilterWidgetBackground: string | undefined;
	listFilterWidgetOutline: string | undefined;
	listFilterWidgetNoMatchesOutline: string | undefined;
	listFilterWidgetShadow: string | undefined;
	readonly toggleStyles: IToggleStyles;
	readonly inputBoxStyles: IInputBoxStyles;
}

export interface IFindWidgetOptions {
	readonly history?: string[];
	readonly styles?: IFindWidgetStyles;
}

const unthemedFindWidgetStyles: IFindWidgetStyles = {
	inputBoxStyles: unthemedInboxStyles,
	toggleStyles: unthemedToggleStyles,
	listFilterWidgetBackground: undefined,
	listFilterWidgetNoMatchesOutline: undefined,
	listFilterWidgetOutline: undefined,
	listFilterWidgetShadow: undefined
};

export enum TreeFindMode {
	Highlight,
	Filter
}

export enum TreeFindMatchType {
	Fuzzy,
	Contiguous
}

class FindWidget<T, TFilterData> extends Disposable {

	private readonly elements = h('.monaco-tree-type-filter', [
		h('.monaco-tree-type-filter-grab.codicon.codicon-debug-gripper@grab', { tabIndex: 0 }),
		h('.monaco-tree-type-filter-input@findInput'),
		h('.monaco-tree-type-filter-actionbar@actionbar'),
	]);

	set mode(mode: TreeFindMode) {
		this.modeToggle.checked = mode === TreeFindMode.Filter;
		this.findInput.inputBox.setPlaceHolder(mode === TreeFindMode.Filter ? localize('type to filter', "Type to filter") : localize('type to search', "Type to search"));
	}

	set matchType(matchType: TreeFindMatchType) {
		this.matchTypeToggle.checked = matchType === TreeFindMatchType.Fuzzy;
	}

	get value(): string {
		return this.findInput.inputBox.value;
	}

	set value(value: string) {
		this.findInput.inputBox.value = value;
	}

	private readonly modeToggle: ModeToggle;
	private readonly matchTypeToggle: FuzzyToggle;
	private readonly findInput: FindInput;
	private readonly actionbar: ActionBar;
	private width = 0;
	private right = 0;
	private top = 0;

	readonly _onDidDisable = new Emitter<void>();
	readonly onDidDisable = this._onDidDisable.event;
	readonly onDidChangeValue: Event<string>;
	readonly onDidChangeMode: Event<TreeFindMode>;
	readonly onDidChangeMatchType: Event<TreeFindMatchType>;

	constructor(
		container: HTMLElement,
		private tree: AbstractTree<T, TFilterData, any>,
		contextViewProvider: IContextViewProvider,
		mode: TreeFindMode,
		matchType: TreeFindMatchType,
		options?: IFindWidgetOptions
	) {
		super();

		container.appendChild(this.elements.root);
		this._register(toDisposable(() => container.removeChild(this.elements.root)));

		const styles = options?.styles ?? unthemedFindWidgetStyles;

		if (styles.listFilterWidgetBackground) {
			this.elements.root.style.backgroundColor = styles.listFilterWidgetBackground;
		}

		if (styles.listFilterWidgetShadow) {
			this.elements.root.style.boxShadow = `0 0 8px 2px ${styles.listFilterWidgetShadow}`;
		}

		this.modeToggle = this._register(new ModeToggle({ ...styles.toggleStyles, isChecked: mode === TreeFindMode.Filter }));
		this.matchTypeToggle = this._register(new FuzzyToggle({ ...styles.toggleStyles, isChecked: matchType === TreeFindMatchType.Fuzzy }));
		this.onDidChangeMode = Event.map(this.modeToggle.onChange, () => this.modeToggle.checked ? TreeFindMode.Filter : TreeFindMode.Highlight, this._store);
		this.onDidChangeMatchType = Event.map(this.matchTypeToggle.onChange, () => this.matchTypeToggle.checked ? TreeFindMatchType.Fuzzy : TreeFindMatchType.Contiguous, this._store);

		this.findInput = this._register(new FindInput(this.elements.findInput, contextViewProvider, {
			label: localize('type to search', "Type to search"),
			additionalToggles: [this.modeToggle, this.matchTypeToggle],
			showCommonFindToggles: false,
			inputBoxStyles: styles.inputBoxStyles,
			toggleStyles: styles.toggleStyles,
			history: options?.history
		}));

		this.actionbar = this._register(new ActionBar(this.elements.actionbar));
		this.mode = mode;

		const emitter = this._register(new DomEmitter(this.findInput.inputBox.inputElement, 'keydown'));
		const onKeyDown = this._register(Event.chain(emitter.event))
			.map(e => new StandardKeyboardEvent(e))
			.event;

		this._register(onKeyDown((e): any => {
			// Using equals() so we reserve modified keys for future use
			if (e.equals(KeyCode.Enter)) {
				// This is the only keyboard way to return to the tree from a history item that isn't the last one
				e.preventDefault();
				e.stopPropagation();
				this.findInput.inputBox.addToHistory();
				this.tree.domFocus();
				return;
			}
			if (e.equals(KeyCode.DownArrow)) {
				e.preventDefault();
				e.stopPropagation();
				if (this.findInput.inputBox.isAtLastInHistory() || this.findInput.inputBox.isNowhereInHistory()) {
					// Retain original pre-history DownArrow behavior
					this.findInput.inputBox.addToHistory();
					this.tree.domFocus();
				} else {
					// Downward through history
					this.findInput.inputBox.showNextValue();
				}
				return;
			}
			if (e.equals(KeyCode.UpArrow)) {
				e.preventDefault();
				e.stopPropagation();
				// Upward through history
				this.findInput.inputBox.showPreviousValue();
				return;
			}
		}));

		const closeAction = this._register(new Action('close', localize('close', "Close"), 'codicon codicon-close', true, () => this.dispose()));
		this.actionbar.push(closeAction, { icon: true, label: false });

		const onGrabMouseDown = this._register(new DomEmitter(this.elements.grab, 'mousedown'));

		this._register(onGrabMouseDown.event(e => {
			const disposables = new DisposableStore();
			const onWindowMouseMove = disposables.add(new DomEmitter(window, 'mousemove'));
			const onWindowMouseUp = disposables.add(new DomEmitter(window, 'mouseup'));

			const startRight = this.right;
			const startX = e.pageX;
			const startTop = this.top;
			const startY = e.pageY;
			this.elements.grab.classList.add('grabbing');

			const transition = this.elements.root.style.transition;
			this.elements.root.style.transition = 'unset';

			const update = (e: MouseEvent) => {
				const deltaX = e.pageX - startX;
				this.right = startRight - deltaX;
				const deltaY = e.pageY - startY;
				this.top = startTop + deltaY;
				this.layout();
			};

			disposables.add(onWindowMouseMove.event(update));
			disposables.add(onWindowMouseUp.event(e => {
				update(e);
				this.elements.grab.classList.remove('grabbing');
				this.elements.root.style.transition = transition;
				disposables.dispose();
			}));
		}));

		const onGrabKeyDown = this._register(Event.chain(this._register(new DomEmitter(this.elements.grab, 'keydown')).event))
			.map(e => new StandardKeyboardEvent(e))
			.event;

		this._register(onGrabKeyDown((e): any => {
			let right: number | undefined;
			let top: number | undefined;

			if (e.keyCode === KeyCode.LeftArrow) {
				right = Number.POSITIVE_INFINITY;
			} else if (e.keyCode === KeyCode.RightArrow) {
				right = 0;
			} else if (e.keyCode === KeyCode.Space) {
				right = this.right === 0 ? Number.POSITIVE_INFINITY : 0;
			}

			if (e.keyCode === KeyCode.UpArrow) {
				top = 0;
			} else if (e.keyCode === KeyCode.DownArrow) {
				top = Number.POSITIVE_INFINITY;
			}

			if (right !== undefined) {
				e.preventDefault();
				e.stopPropagation();
				this.right = right;
				this.layout();
			}

			if (top !== undefined) {
				e.preventDefault();
				e.stopPropagation();
				this.top = top;
				const transition = this.elements.root.style.transition;
				this.elements.root.style.transition = 'unset';
				this.layout();
				setTimeout(() => {
					this.elements.root.style.transition = transition;
				}, 0);
			}
		}));

		this.onDidChangeValue = this.findInput.onDidChange;
	}

	getHistory(): string[] {
		return this.findInput.inputBox.getHistory();
	}

	focus() {
		this.findInput.focus();
	}

	select() {
		this.findInput.select();

		// Reposition to last in history
		this.findInput.inputBox.addToHistory(true);
	}

	layout(width: number = this.width): void {
		this.width = width;
		this.right = clamp(this.right, 0, Math.max(0, width - 212));
		this.elements.root.style.right = `${this.right}px`;
		this.top = clamp(this.top, 0, 24);
		this.elements.root.style.top = `${this.top}px`;
	}

	showMessage(message: IMessage): void {
		this.findInput.showMessage(message);
	}

	clearMessage(): void {
		this.findInput.clearMessage();
	}

	override async dispose(): Promise<void> {
		this._onDidDisable.fire();
		this.elements.root.classList.add('disabled');
		await timeout(300);
		super.dispose();
	}
}

interface IFindControllerOptions extends IFindWidgetOptions { }

class FindController<T, TFilterData> implements IDisposable {

	private _history: string[] | undefined;

	private _pattern = '';
	get pattern(): string { return this._pattern; }
	private previousPattern = '';

	private _mode: TreeFindMode;
	get mode(): TreeFindMode { return this._mode; }
	set mode(mode: TreeFindMode) {
		if (mode === this._mode) {
			return;
		}

		this._mode = mode;

		if (this.widget) {
			this.widget.mode = this._mode;
		}

		this.tree.refilter();
		this.render();
		this._onDidChangeMode.fire(mode);
	}

	private _matchType: TreeFindMatchType;
	get matchType(): TreeFindMatchType { return this._matchType; }
	set matchType(matchType: TreeFindMatchType) {
		if (matchType === this._matchType) {
			return;
		}

		this._matchType = matchType;

		if (this.widget) {
			this.widget.matchType = this._matchType;
		}

		this.tree.refilter();
		this.render();
		this._onDidChangeMatchType.fire(matchType);
	}

	private widget: FindWidget<T, TFilterData> | undefined;
	private width = 0;

	private readonly _onDidChangeMode = new Emitter<TreeFindMode>();
	readonly onDidChangeMode = this._onDidChangeMode.event;

	private readonly _onDidChangeMatchType = new Emitter<TreeFindMatchType>();
	readonly onDidChangeMatchType = this._onDidChangeMatchType.event;

	private readonly _onDidChangePattern = new Emitter<string>();
	readonly onDidChangePattern = this._onDidChangePattern.event;

	private readonly _onDidChangeOpenState = new Emitter<boolean>();
	readonly onDidChangeOpenState = this._onDidChangeOpenState.event;

	private enabledDisposables = new DisposableStore();
	private readonly disposables = new DisposableStore();

	constructor(
		private tree: AbstractTree<T, TFilterData, any>,
		model: ITreeModel<T, TFilterData, any>,
		private view: List<ITreeNode<T, TFilterData>>,
		private filter: FindFilter<T>,
		private readonly contextViewProvider: IContextViewProvider,
		private readonly options: IFindControllerOptions = {}
	) {
		this._mode = tree.options.defaultFindMode ?? TreeFindMode.Highlight;
		this._matchType = tree.options.defaultFindMatchType ?? TreeFindMatchType.Fuzzy;
		model.onDidSplice(this.onDidSpliceModel, this, this.disposables);
	}

	updateOptions(optionsUpdate: IAbstractTreeOptionsUpdate = {}): void {
		if (optionsUpdate.defaultFindMode !== undefined) {
			this.mode = optionsUpdate.defaultFindMode;
		}

		if (optionsUpdate.defaultFindMatchType !== undefined) {
			this.matchType = optionsUpdate.defaultFindMatchType;
		}
	}

	open(): void {
		if (this.widget) {
			this.widget.focus();
			this.widget.select();
			return;
		}

		this.widget = new FindWidget(this.view.getHTMLElement(), this.tree, this.contextViewProvider, this.mode, this.matchType, { ...this.options, history: this._history });
		this.enabledDisposables.add(this.widget);

		this.widget.onDidChangeValue(this.onDidChangeValue, this, this.enabledDisposables);
		this.widget.onDidChangeMode(mode => this.mode = mode, undefined, this.enabledDisposables);
		this.widget.onDidChangeMatchType(matchType => this.matchType = matchType, undefined, this.enabledDisposables);
		this.widget.onDidDisable(this.close, this, this.enabledDisposables);

		this.widget.layout(this.width);
		this.widget.focus();

		this.widget.value = this.previousPattern;
		this.widget.select();

		this._onDidChangeOpenState.fire(true);
	}

	close(): void {
		if (!this.widget) {
			return;
		}

		this._history = this.widget.getHistory();
		this.widget = undefined;

		this.enabledDisposables.dispose();
		this.enabledDisposables = new DisposableStore();

		this.previousPattern = this.pattern;
		this.onDidChangeValue('');
		this.tree.domFocus();

		this._onDidChangeOpenState.fire(false);
	}

	private onDidChangeValue(pattern: string): void {
		this._pattern = pattern;
		this._onDidChangePattern.fire(pattern);

		this.filter.pattern = pattern;
		this.tree.refilter();

		if (pattern) {
			this.tree.focusNext(0, true, undefined, node => !FuzzyScore.isDefault(node.filterData as any as FuzzyScore));
		}

		const focus = this.tree.getFocus();

		if (focus.length > 0) {
			const element = focus[0];

			if (this.tree.getRelativeTop(element) === null) {
				this.tree.reveal(element, 0.5);
			}
		}

		this.render();
	}

	private onDidSpliceModel(): void {
		if (!this.widget || this.pattern.length === 0) {
			return;
		}

		this.tree.refilter();
		this.render();
	}

	private render(): void {
		const noMatches = this.filter.totalCount > 0 && this.filter.matchCount === 0;

		if (this.pattern && noMatches) {
			if (this.tree.options.showNotFoundMessage ?? true) {
				this.widget?.showMessage({ type: MessageType.WARNING, content: localize('not found', "No elements found.") });
			} else {
				this.widget?.showMessage({ type: MessageType.WARNING });
			}
		} else {
			this.widget?.clearMessage();
		}
	}

	shouldAllowFocus(node: ITreeNode<T, TFilterData>): boolean {
		if (!this.widget || !this.pattern || this._mode === TreeFindMode.Filter) {
			return true;
		}

		if (this.filter.totalCount > 0 && this.filter.matchCount <= 1) {
			return true;
		}

		return !FuzzyScore.isDefault(node.filterData as any as FuzzyScore);
	}

	layout(width: number): void {
		this.width = width;
		this.widget?.layout(width);
	}

	dispose() {
		this._history = undefined;
		this._onDidChangePattern.dispose();
		this.enabledDisposables.dispose();
		this.disposables.dispose();
	}
}

function asTreeMouseEvent<T>(event: IListMouseEvent<ITreeNode<T, any>>): ITreeMouseEvent<T> {
	let target: TreeMouseEventTarget = TreeMouseEventTarget.Unknown;

	if (hasParentWithClass(event.browserEvent.target as HTMLElement, 'monaco-tl-twistie', 'monaco-tl-row')) {
		target = TreeMouseEventTarget.Twistie;
	} else if (hasParentWithClass(event.browserEvent.target as HTMLElement, 'monaco-tl-contents', 'monaco-tl-row')) {
		target = TreeMouseEventTarget.Element;
	} else if (hasParentWithClass(event.browserEvent.target as HTMLElement, 'monaco-tree-type-filter', 'monaco-list')) {
		target = TreeMouseEventTarget.Filter;
	}

	return {
		browserEvent: event.browserEvent,
		element: event.element ? event.element.element : null,
		target
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
	readonly multipleSelectionSupport?: boolean;
	readonly typeNavigationEnabled?: boolean;
	readonly typeNavigationMode?: TypeNavigationMode;
	readonly defaultFindMode?: TreeFindMode;
	readonly defaultFindMatchType?: TreeFindMatchType;
	readonly showNotFoundMessage?: boolean;
	readonly smoothScrolling?: boolean;
	readonly horizontalScrolling?: boolean;
	readonly scrollByPage?: boolean;
	readonly mouseWheelScrollSensitivity?: number;
	readonly fastScrollSensitivity?: number;
	readonly expandOnDoubleClick?: boolean;
	readonly expandOnlyOnTwistieClick?: boolean | ((e: any) => boolean); // e is T
}

export interface IAbstractTreeOptions<T, TFilterData = void> extends IAbstractTreeOptionsUpdate, IListOptions<T> {
	readonly contextViewProvider?: IContextViewProvider;
	readonly collapseByDefault?: boolean; // defaults to false
	readonly filter?: ITreeFilter<T, TFilterData>;
	readonly dnd?: ITreeDragAndDrop<T>;
	readonly paddingBottom?: number;
	readonly findWidgetEnabled?: boolean;
	readonly findWidgetStyles?: IFindWidgetStyles;
	readonly defaultFindVisibility?: TreeVisibility | ((e: T) => TreeVisibility);
}

function dfs<T, TFilterData>(node: ITreeNode<T, TFilterData>, fn: (node: ITreeNode<T, TFilterData>) => void): void {
	fn(node);
	node.children.forEach(child => dfs(child, fn));
}

/**
 * The trait concept needs to exist at the tree level, because collapsed
 * tree nodes will not be known by the list.
 */
class Trait<T> {

	private nodes: ITreeNode<T, any>[] = [];
	private elements: T[] | undefined;

	private readonly _onDidChange = new Emitter<ITreeEvent<T>>();
	readonly onDidChange = this._onDidChange.event;

	private _nodeSet: Set<ITreeNode<T, any>> | undefined;
	private get nodeSet(): Set<ITreeNode<T, any>> {
		if (!this._nodeSet) {
			this._nodeSet = this.createNodeSet();
		}

		return this._nodeSet;
	}

	constructor(
		private getFirstViewElementWithTrait: () => ITreeNode<T, any> | undefined,
		private identityProvider?: IIdentityProvider<T>
	) { }

	set(nodes: ITreeNode<T, any>[], browserEvent?: UIEvent): void {
		if (!(browserEvent as any)?.__forceEvent && equals(this.nodes, nodes)) {
			return;
		}

		this._set(nodes, false, browserEvent);
	}

	private _set(nodes: ITreeNode<T, any>[], silent: boolean, browserEvent?: UIEvent): void {
		this.nodes = [...nodes];
		this.elements = undefined;
		this._nodeSet = undefined;

		if (!silent) {
			const that = this;
			this._onDidChange.fire({ get elements() { return that.get(); }, browserEvent });
		}
	}

	get(): T[] {
		if (!this.elements) {
			this.elements = this.nodes.map(node => node.element);
		}

		return [...this.elements];
	}

	getNodes(): readonly ITreeNode<T, any>[] {
		return this.nodes;
	}

	has(node: ITreeNode<T, any>): boolean {
		return this.nodeSet.has(node);
	}

	onDidModelSplice({ insertedNodes, deletedNodes }: ITreeModelSpliceEvent<T, any>): void {
		if (!this.identityProvider) {
			const set = this.createNodeSet();
			const visit = (node: ITreeNode<T, any>) => set.delete(node);
			deletedNodes.forEach(node => dfs(node, visit));
			this.set([...set.values()]);
			return;
		}

		const deletedNodesIdSet = new Set<string>();
		const deletedNodesVisitor = (node: ITreeNode<T, any>) => deletedNodesIdSet.add(this.identityProvider!.getId(node.element).toString());
		deletedNodes.forEach(node => dfs(node, deletedNodesVisitor));

		const insertedNodesMap = new Map<string, ITreeNode<T, any>>();
		const insertedNodesVisitor = (node: ITreeNode<T, any>) => insertedNodesMap.set(this.identityProvider!.getId(node.element).toString(), node);
		insertedNodes.forEach(node => dfs(node, insertedNodesVisitor));

		const nodes: ITreeNode<T, any>[] = [];

		for (const node of this.nodes) {
			const id = this.identityProvider.getId(node.element).toString();
			const wasDeleted = deletedNodesIdSet.has(id);

			if (!wasDeleted) {
				nodes.push(node);
			} else {
				const insertedNode = insertedNodesMap.get(id);

				if (insertedNode && insertedNode.visible) {
					nodes.push(insertedNode);
				}
			}
		}

		if (this.nodes.length > 0 && nodes.length === 0) {
			const node = this.getFirstViewElementWithTrait();

			if (node) {
				nodes.push(node);
			}
		}

		this._set(nodes, true);
	}

	private createNodeSet(): Set<ITreeNode<T, any>> {
		const set = new Set<ITreeNode<T, any>>();

		for (const node of this.nodes) {
			set.add(node);
		}

		return set;
	}
}

class TreeNodeListMouseController<T, TFilterData, TRef> extends MouseController<ITreeNode<T, TFilterData>> {

	constructor(list: TreeNodeList<T, TFilterData, TRef>, private tree: AbstractTree<T, TFilterData, TRef>) {
		super(list);
	}

	protected override onViewPointer(e: IListMouseEvent<ITreeNode<T, TFilterData>>): void {
		if (isButton(e.browserEvent.target as HTMLElement) ||
			isInputElement(e.browserEvent.target as HTMLElement) ||
			isMonacoEditor(e.browserEvent.target as HTMLElement)) {
			return;
		}

		if (e.browserEvent.isHandledByList) {
			return;
		}

		const node = e.element;

		if (!node) {
			return super.onViewPointer(e);
		}

		if (this.isSelectionRangeChangeEvent(e) || this.isSelectionSingleChangeEvent(e)) {
			return super.onViewPointer(e);
		}

		const target = e.browserEvent.target as HTMLElement;
		const onTwistie = target.classList.contains('monaco-tl-twistie')
			|| (target.classList.contains('monaco-icon-label') && target.classList.contains('folder-icon') && e.browserEvent.offsetX < 16);

		let expandOnlyOnTwistieClick = false;

		if (typeof this.tree.expandOnlyOnTwistieClick === 'function') {
			expandOnlyOnTwistieClick = this.tree.expandOnlyOnTwistieClick(node.element);
		} else {
			expandOnlyOnTwistieClick = !!this.tree.expandOnlyOnTwistieClick;
		}

		if (expandOnlyOnTwistieClick && !onTwistie && e.browserEvent.detail !== 2) {
			return super.onViewPointer(e);
		}

		if (!this.tree.expandOnDoubleClick && e.browserEvent.detail === 2) {
			return super.onViewPointer(e);
		}

		if (node.collapsible) {
			const location = this.tree.getNodeLocation(node);
			const recursive = e.browserEvent.altKey;
			this.tree.setFocus([location]);
			this.tree.toggleCollapsed(location, recursive);

			if (expandOnlyOnTwistieClick && onTwistie) {
				// Do not set this before calling a handler on the super class, because it will reject it as handled
				e.browserEvent.isHandledByList = true;
				return;
			}
		}

		super.onViewPointer(e);
	}

	protected override onDoubleClick(e: IListMouseEvent<ITreeNode<T, TFilterData>>): void {
		const onTwistie = (e.browserEvent.target as HTMLElement).classList.contains('monaco-tl-twistie');

		if (onTwistie || !this.tree.expandOnDoubleClick) {
			return;
		}

		if (e.browserEvent.isHandledByList) {
			return;
		}

		super.onDoubleClick(e);
	}
}

interface ITreeNodeListOptions<T, TFilterData, TRef> extends IListOptions<ITreeNode<T, TFilterData>> {
	readonly tree: AbstractTree<T, TFilterData, TRef>;
}

/**
 * We use this List subclass to restore selection and focus as nodes
 * get rendered in the list, possibly due to a node expand() call.
 */
class TreeNodeList<T, TFilterData, TRef> extends List<ITreeNode<T, TFilterData>> {

	constructor(
		user: string,
		container: HTMLElement,
		virtualDelegate: IListVirtualDelegate<ITreeNode<T, TFilterData>>,
		renderers: IListRenderer<any /* TODO@joao */, any>[],
		private focusTrait: Trait<T>,
		private selectionTrait: Trait<T>,
		private anchorTrait: Trait<T>,
		options: ITreeNodeListOptions<T, TFilterData, TRef>
	) {
		super(user, container, virtualDelegate, renderers, options);
	}

	protected override createMouseController(options: ITreeNodeListOptions<T, TFilterData, TRef>): MouseController<ITreeNode<T, TFilterData>> {
		return new TreeNodeListMouseController(this, options.tree);
	}

	override splice(start: number, deleteCount: number, elements: readonly ITreeNode<T, TFilterData>[] = []): void {
		super.splice(start, deleteCount, elements);

		if (elements.length === 0) {
			return;
		}

		const additionalFocus: number[] = [];
		const additionalSelection: number[] = [];
		let anchor: number | undefined;

		elements.forEach((node, index) => {
			if (this.focusTrait.has(node)) {
				additionalFocus.push(start + index);
			}

			if (this.selectionTrait.has(node)) {
				additionalSelection.push(start + index);
			}

			if (this.anchorTrait.has(node)) {
				anchor = start + index;
			}
		});

		if (additionalFocus.length > 0) {
			super.setFocus(distinct([...super.getFocus(), ...additionalFocus]));
		}

		if (additionalSelection.length > 0) {
			super.setSelection(distinct([...super.getSelection(), ...additionalSelection]));
		}

		if (typeof anchor === 'number') {
			super.setAnchor(anchor);
		}
	}

	override setFocus(indexes: number[], browserEvent?: UIEvent, fromAPI = false): void {
		super.setFocus(indexes, browserEvent);

		if (!fromAPI) {
			this.focusTrait.set(indexes.map(i => this.element(i)), browserEvent);
		}
	}

	override setSelection(indexes: number[], browserEvent?: UIEvent, fromAPI = false): void {
		super.setSelection(indexes, browserEvent);

		if (!fromAPI) {
			this.selectionTrait.set(indexes.map(i => this.element(i)), browserEvent);
		}
	}

	override setAnchor(index: number | undefined, fromAPI = false): void {
		super.setAnchor(index);

		if (!fromAPI) {
			if (typeof index === 'undefined') {
				this.anchorTrait.set([]);
			} else {
				this.anchorTrait.set([this.element(index)]);
			}
		}
	}
}

export abstract class AbstractTree<T, TFilterData, TRef> implements IDisposable {

	protected view: TreeNodeList<T, TFilterData, TRef>;
	private renderers: TreeRenderer<T, TFilterData, TRef, any>[];
	protected model: ITreeModel<T, TFilterData, TRef>;
	private focus: Trait<T>;
	private selection: Trait<T>;
	private anchor: Trait<T>;
	private eventBufferer = new EventBufferer();
	private findController?: FindController<T, TFilterData>;
	readonly onDidChangeFindOpenState: Event<boolean> = Event.None;
	private focusNavigationFilter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined;
	private styleElement: HTMLStyleElement;
	protected readonly disposables = new DisposableStore();

	get onDidScroll(): Event<ScrollEvent> { return this.view.onDidScroll; }

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return this.eventBufferer.wrapEvent(this.focus.onDidChange); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return this.eventBufferer.wrapEvent(this.selection.onDidChange); }

	get onMouseClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return Event.filter(Event.map(this.view.onMouseDblClick, asTreeMouseEvent), e => e.target !== TreeMouseEventTarget.Filter); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return Event.map(this.view.onContextMenu, asTreeContextMenuEvent); }
	get onTap(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onTap, asTreeMouseEvent); }
	get onPointer(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onPointer, asTreeMouseEvent); }

	get onKeyDown(): Event<KeyboardEvent> { return this.view.onKeyDown; }
	get onKeyUp(): Event<KeyboardEvent> { return this.view.onKeyUp; }
	get onKeyPress(): Event<KeyboardEvent> { return this.view.onKeyPress; }

	get onDidFocus(): Event<void> { return this.view.onDidFocus; }
	get onDidBlur(): Event<void> { return this.view.onDidBlur; }

	get onDidChangeModel(): Event<void> { return Event.signal(this.model.onDidSplice); }
	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T, TFilterData>> { return this.model.onDidChangeCollapseState; }
	get onDidChangeRenderNodeCount(): Event<ITreeNode<T, TFilterData>> { return this.model.onDidChangeRenderNodeCount; }

	private readonly _onWillRefilter = new Emitter<void>();
	readonly onWillRefilter: Event<void> = this._onWillRefilter.event;

	get findMode(): TreeFindMode { return this.findController?.mode ?? TreeFindMode.Highlight; }
	set findMode(findMode: TreeFindMode) { if (this.findController) { this.findController.mode = findMode; } }
	readonly onDidChangeFindMode: Event<TreeFindMode>;

	get findMatchType(): TreeFindMatchType { return this.findController?.matchType ?? TreeFindMatchType.Fuzzy; }
	set findMatchType(findFuzzy: TreeFindMatchType) { if (this.findController) { this.findController.matchType = findFuzzy; } }
	readonly onDidChangeFindMatchType: Event<TreeFindMatchType>;

	get onDidChangeFindPattern(): Event<string> { return this.findController ? this.findController.onDidChangePattern : Event.None; }

	get expandOnDoubleClick(): boolean { return typeof this._options.expandOnDoubleClick === 'undefined' ? true : this._options.expandOnDoubleClick; }
	get expandOnlyOnTwistieClick(): boolean | ((e: T) => boolean) { return typeof this._options.expandOnlyOnTwistieClick === 'undefined' ? true : this._options.expandOnlyOnTwistieClick; }

	private readonly _onDidUpdateOptions = new Emitter<IAbstractTreeOptions<T, TFilterData>>();
	readonly onDidUpdateOptions: Event<IAbstractTreeOptions<T, TFilterData>> = this._onDidUpdateOptions.event;

	get onDidDispose(): Event<void> { return this.view.onDidDispose; }

	constructor(
		private readonly _user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		private _options: IAbstractTreeOptions<T, TFilterData> = {}
	) {
		const treeDelegate = new ComposedTreeDelegate<T, ITreeNode<T, TFilterData>>(delegate);

		const onDidChangeCollapseStateRelay = new Relay<ICollapseStateChangeEvent<T, TFilterData>>();
		const onDidChangeActiveNodes = new Relay<ITreeNode<T, TFilterData>[]>();
		const activeNodes = this.disposables.add(new EventCollection(onDidChangeActiveNodes.event));
		const renderedIndentGuides = new SetMap<ITreeNode<T, TFilterData>, HTMLDivElement>();
		this.renderers = renderers.map(r => new TreeRenderer<T, TFilterData, TRef, any>(r, () => this.model, onDidChangeCollapseStateRelay.event, activeNodes, renderedIndentGuides, _options));
		for (const r of this.renderers) {
			this.disposables.add(r);
		}

		let filter: FindFilter<T> | undefined;

		if (_options.keyboardNavigationLabelProvider) {
			filter = new FindFilter(this, _options.keyboardNavigationLabelProvider, _options.filter as any as ITreeFilter<T, FuzzyScore>);
			_options = { ..._options, filter: filter as ITreeFilter<T, TFilterData> }; // TODO need typescript help here
			this.disposables.add(filter);
		}

		this.focus = new Trait(() => this.view.getFocusedElements()[0], _options.identityProvider);
		this.selection = new Trait(() => this.view.getSelectedElements()[0], _options.identityProvider);
		this.anchor = new Trait(() => this.view.getAnchorElement(), _options.identityProvider);
		this.view = new TreeNodeList(_user, container, treeDelegate, this.renderers, this.focus, this.selection, this.anchor, { ...asListOptions(() => this.model, _options), tree: this });

		this.model = this.createModel(_user, this.view, _options);
		onDidChangeCollapseStateRelay.input = this.model.onDidChangeCollapseState;

		const onDidModelSplice = Event.forEach(this.model.onDidSplice, e => {
			this.eventBufferer.bufferEvents(() => {
				this.focus.onDidModelSplice(e);
				this.selection.onDidModelSplice(e);
			});
		}, this.disposables);

		// Make sure the `forEach` always runs
		onDidModelSplice(() => null, null, this.disposables);

		// Active nodes can change when the model changes or when focus or selection change.
		// We debounce it with 0 delay since these events may fire in the same stack and we only
		// want to run this once. It also doesn't matter if it runs on the next tick since it's only
		// a nice to have UI feature.
		onDidChangeActiveNodes.input = Event.chain(Event.any<any>(onDidModelSplice, this.focus.onDidChange, this.selection.onDidChange))
			.debounce(() => null, 0)
			.map(() => {
				const set = new Set<ITreeNode<T, TFilterData>>();

				for (const node of this.focus.getNodes()) {
					set.add(node);
				}

				for (const node of this.selection.getNodes()) {
					set.add(node);
				}

				return [...set.values()];
			}).event;

		if (_options.keyboardSupport !== false) {
			const onKeyDown = Event.chain(this.view.onKeyDown)
				.filter(e => !isInputElement(e.target as HTMLElement))
				.map(e => new StandardKeyboardEvent(e));

			onKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow).on(this.onLeftArrow, this, this.disposables);
			onKeyDown.filter(e => e.keyCode === KeyCode.RightArrow).on(this.onRightArrow, this, this.disposables);
			onKeyDown.filter(e => e.keyCode === KeyCode.Space).on(this.onSpace, this, this.disposables);
		}

		if ((_options.findWidgetEnabled ?? true) && _options.keyboardNavigationLabelProvider && _options.contextViewProvider) {
			const opts = this.options.findWidgetStyles ? { styles: this.options.findWidgetStyles } : undefined;
			this.findController = new FindController(this, this.model, this.view, filter!, _options.contextViewProvider, opts);
			this.focusNavigationFilter = node => this.findController!.shouldAllowFocus(node);
			this.onDidChangeFindOpenState = this.findController.onDidChangeOpenState;
			this.disposables.add(this.findController!);
			this.onDidChangeFindMode = this.findController.onDidChangeMode;
			this.onDidChangeFindMatchType = this.findController.onDidChangeMatchType;
		} else {
			this.onDidChangeFindMode = Event.None;
			this.onDidChangeFindMatchType = Event.None;
		}

		this.styleElement = createStyleSheet(this.view.getHTMLElement());
		this.getHTMLElement().classList.toggle('always', this._options.renderIndentGuides === RenderIndentGuides.Always);
	}

	updateOptions(optionsUpdate: IAbstractTreeOptionsUpdate = {}): void {
		this._options = { ...this._options, ...optionsUpdate };

		for (const renderer of this.renderers) {
			renderer.updateOptions(optionsUpdate);
		}

		this.view.updateOptions(this._options);
		this.findController?.updateOptions(optionsUpdate);

		this._onDidUpdateOptions.fire(this._options);

		this.getHTMLElement().classList.toggle('always', this._options.renderIndentGuides === RenderIndentGuides.Always);
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

	get contentWidth(): number {
		return this.view.contentWidth;
	}

	get onDidChangeContentHeight(): Event<number> {
		return this.view.onDidChangeContentHeight;
	}

	get onDidChangeContentWidth(): Event<number> {
		return this.view.onDidChangeContentWidth;
	}

	get scrollTop(): number {
		return this.view.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this.view.scrollTop = scrollTop;
	}

	get scrollLeft(): number {
		return this.view.scrollLeft;
	}

	set scrollLeft(scrollLeft: number) {
		this.view.scrollLeft = scrollLeft;
	}

	get scrollHeight(): number {
		return this.view.scrollHeight;
	}

	get renderHeight(): number {
		return this.view.renderHeight;
	}

	get firstVisibleElement(): T | undefined {
		const index = this.view.firstVisibleIndex;

		if (index < 0 || index >= this.view.length) {
			return undefined;
		}

		const node = this.view.element(index);
		return node.element;
	}

	get lastVisibleElement(): T {
		const index = this.view.lastVisibleIndex;
		const node = this.view.element(index);
		return node.element;
	}

	get ariaLabel(): string {
		return this.view.ariaLabel;
	}

	set ariaLabel(value: string) {
		this.view.ariaLabel = value;
	}

	get selectionSize() {
		return this.selection.getNodes().length;
	}

	domFocus(): void {
		this.view.domFocus();
	}

	isDOMFocused(): boolean {
		return this.getHTMLElement() === document.activeElement;
	}

	layout(height?: number, width?: number): void {
		this.view.layout(height, width);

		if (isNumber(width)) {
			this.findController?.layout(width);
		}
	}

	style(styles: IListStyles): void {
		const suffix = `.${this.view.domId}`;
		const content: string[] = [];

		if (styles.treeIndentGuidesStroke) {
			content.push(`.monaco-list${suffix}:hover .monaco-tl-indent > .indent-guide, .monaco-list${suffix}.always .monaco-tl-indent > .indent-guide  { border-color: ${styles.treeInactiveIndentGuidesStroke}; }`);
			content.push(`.monaco-list${suffix} .monaco-tl-indent > .indent-guide.active { border-color: ${styles.treeIndentGuidesStroke}; }`);
		}

		this.styleElement.textContent = content.join('\n');

		this.view.style(styles);
	}

	// Tree navigation

	getParentElement(location: TRef): T {
		const parentRef = this.model.getParentNodeLocation(location);
		const parentNode = this.model.getNode(parentRef);
		return parentNode.element;
	}

	getFirstElementChild(location: TRef): T | undefined {
		return this.model.getFirstElementChild(location);
	}

	// Tree

	getNode(location?: TRef): ITreeNode<T, TFilterData> {
		return this.model.getNode(location);
	}

	getNodeLocation(node: ITreeNode<T, TFilterData>): TRef {
		return this.model.getNodeLocation(node);
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

	setCollapsible(location: TRef, collapsible?: boolean): boolean {
		return this.model.setCollapsible(location, collapsible);
	}

	isCollapsed(location: TRef): boolean {
		return this.model.isCollapsed(location);
	}

	triggerTypeNavigation(): void {
		this.view.triggerTypeNavigation();
	}

	openFind(): void {
		this.findController?.open();
	}

	closeFind(): void {
		this.findController?.close();
	}

	refilter(): void {
		this._onWillRefilter.fire(undefined);
		this.model.refilter();
	}

	setAnchor(element: TRef | undefined): void {
		if (typeof element === 'undefined') {
			return this.view.setAnchor(undefined);
		}

		const node = this.model.getNode(element);
		this.anchor.set([node]);

		const index = this.model.getListIndex(element);

		if (index > -1) {
			this.view.setAnchor(index, true);
		}
	}

	getAnchor(): T | undefined {
		return firstOrDefault(this.anchor.get(), undefined);
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

	focusNext(n = 1, loop = false, browserEvent?: UIEvent, filter = this.focusNavigationFilter): void {
		this.view.focusNext(n, loop, browserEvent, filter);
	}

	focusPrevious(n = 1, loop = false, browserEvent?: UIEvent, filter = this.focusNavigationFilter): void {
		this.view.focusPrevious(n, loop, browserEvent, filter);
	}

	focusNextPage(browserEvent?: UIEvent, filter = this.focusNavigationFilter): Promise<void> {
		return this.view.focusNextPage(browserEvent, filter);
	}

	focusPreviousPage(browserEvent?: UIEvent, filter = this.focusNavigationFilter): Promise<void> {
		return this.view.focusPreviousPage(browserEvent, filter);
	}

	focusLast(browserEvent?: UIEvent, filter = this.focusNavigationFilter): void {
		this.view.focusLast(browserEvent, filter);
	}

	focusFirst(browserEvent?: UIEvent, filter = this.focusNavigationFilter): void {
		this.view.focusFirst(browserEvent, filter);
	}

	getFocus(): T[] {
		return this.focus.get();
	}

	reveal(location: TRef, relativeTop?: number): void {
		this.model.expandTo(location);

		const index = this.model.getListIndex(location);

		if (index === -1) {
			return;
		}

		this.view.reveal(index, relativeTop);
	}

	/**
	 * Returns the relative position of an element rendered in the list.
	 * Returns `null` if the element isn't *entirely* in the visible viewport.
	 */
	getRelativeTop(location: TRef): number | null {
		const index = this.model.getListIndex(location);

		if (index === -1) {
			return null;
		}

		return this.view.getRelativeTop(index);
	}

	getViewState(identityProvider = this.options.identityProvider): AbstractTreeViewState {
		if (!identityProvider) {
			throw new TreeError(this._user, 'Can\'t get tree view state without an identity provider');
		}

		const getId = (element: T | null) => identityProvider.getId(element!).toString();
		const state = AbstractTreeViewState.empty(this.scrollTop);
		for (const focus of this.getFocus()) {
			state.focus.add(getId(focus));
		}
		for (const selection of this.getSelection()) {
			state.selection.add(getId(selection));
		}

		const root = this.model.getNode();
		const queue = [root];

		while (queue.length > 0) {
			const node = queue.shift()!;

			if (node !== root && node.collapsible) {
				state.expanded[getId(node.element!)] = node.collapsed ? 0 : 1;
			}

			queue.push(...node.children);
		}

		return state;
	}

	// List

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

			if (!parentLocation) {
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

	protected abstract createModel(user: string, view: ISpliceable<ITreeNode<T, TFilterData>>, options: IAbstractTreeOptions<T, TFilterData>): ITreeModel<T, TFilterData, TRef>;

	navigate(start?: TRef): ITreeNavigator<T> {
		return new TreeNavigator(this.view, this.model, start);
	}

	dispose(): void {
		dispose(this.disposables);
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

	first(): T | null {
		this.index = 0;
		return this.current();
	}

	last(): T | null {
		this.index = this.view.length - 1;
		return this.current();
	}
}
