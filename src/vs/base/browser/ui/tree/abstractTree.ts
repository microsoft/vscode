/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from '../../dnd.js';
import { $, append, clearNode, h, hasParentWithClass, isActiveElement, isKeyboardEvent, addDisposableListener, isEditableElement } from '../../dom.js';
import { createStyleSheet } from '../../domStylesheets.js';
import { asCssValueWithDefault } from '../../cssValue.js';
import { DomEmitter } from '../../event.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { ActionBar } from '../actionbar/actionbar.js';
import { IContextViewProvider } from '../contextview/contextview.js';
import { FindInput } from '../findinput/findInput.js';
import { IInputBoxStyles, IMessage, MessageType, unthemedInboxStyles } from '../inputbox/inputBox.js';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListContextMenuEvent, IListDragAndDrop, IListDragOverReaction, IListMouseEvent, IListRenderer, IListTouchEvent, IListVirtualDelegate } from '../list/list.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../list/listView.js';
import { IListAccessibilityProvider, IListOptions, IListStyles, isActionItem, isButton, isMonacoCustomToggle, isMonacoEditor, isStickyScrollContainer, isStickyScrollElement, List, MouseController, TypeNavigationMode } from '../list/listWidget.js';
import { IToggleStyles, Toggle, unthemedToggleStyles } from '../toggle/toggle.js';
import { getVisibleState, isFilterResult } from './indexTreeModel.js';
import { ICollapseStateChangeEvent, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeEvent, ITreeFilter, ITreeModel, ITreeModelSpliceEvent, ITreeMouseEvent, ITreeNavigator, ITreeNode, ITreeRenderer, TreeDragOverBubble, TreeError, TreeFilterResult, TreeMouseEventTarget, TreeVisibility } from './tree.js';
import { Action } from '../../../common/actions.js';
import { distinct, equals, range } from '../../../common/arrays.js';
import { Delayer, disposableTimeout, timeout } from '../../../common/async.js';
import { Codicon } from '../../../common/codicons.js';
import { ThemeIcon } from '../../../common/themables.js';
import { SetMap } from '../../../common/map.js';
import { Emitter, Event, EventBufferer, Relay } from '../../../common/event.js';
import { fuzzyScore, FuzzyScore } from '../../../common/filters.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../common/lifecycle.js';
import { clamp } from '../../../common/numbers.js';
import { ScrollEvent } from '../../../common/scrollable.js';
import './media/tree.css';
import { localize } from '../../../../nls.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { createInstantHoverDelegate } from '../hover/hoverDelegateFactory.js';
import { autorun, constObservable } from '../../../common/observable.js';
import { alert } from '../aria/aria.js';

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
	private readonly disposables = new DisposableStore();

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

	onDragOver(data: IDragAndDropData, targetNode: ITreeNode<T, TFilterData> | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent, raw = true): boolean | IListDragOverReaction {
		const result = this.dnd.onDragOver(asTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
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
			}, 500, this.disposables);
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

			return this.onDragOver(data, parentNode, parentIndex, targetSector, originalEvent, false);
		}

		const model = this.modelProvider();
		const ref = model.getNodeLocation(targetNode);
		const start = model.getListIndex(ref);
		const length = model.getListRenderCount(ref);

		return { ...result, feedback: range(start, start + length) };
	}

	drop(data: IDragAndDropData, targetNode: ITreeNode<T, TFilterData> | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void {
		this.autoExpandDisposable.dispose();
		this.autoExpandNode = undefined;

		this.dnd.drop(asTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
	}

	onDragEnd(originalEvent: DragEvent): void {
		this.dnd.onDragEnd?.(originalEvent);
	}

	dispose(): void {
		this.disposables.dispose();
		this.dnd.dispose();
	}
}

function asListOptions<T, TFilterData, TRef>(modelProvider: () => ITreeModel<T, TFilterData, TRef>, disposableStore: DisposableStore, options?: IAbstractTreeOptions<T, TFilterData>): IListOptions<ITreeNode<T, TFilterData>> | undefined {
	return options && {
		...options,
		identityProvider: options.identityProvider && {
			getId(el) {
				return options.identityProvider!.getId(el.element);
			}
		},
		dnd: options.dnd && disposableStore.add(new TreeNodeListDragAndDrop(modelProvider, options.dnd)),
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

export class TreeRenderer<T, TFilterData, TRef, TTemplateData> implements IListRenderer<ITreeNode<T, TFilterData>, ITreeListTemplateData<TTemplateData>> {

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
		private readonly renderer: ITreeRenderer<T, TFilterData, TTemplateData>,
		private readonly model: ITreeModel<T, TFilterData, TRef>,
		onDidChangeCollapseState: Event<ICollapseStateChangeEvent<T, TFilterData>>,
		private readonly activeNodes: Collection<ITreeNode<T, TFilterData>>,
		private readonly renderedIndentGuides: SetMap<ITreeNode<T, TFilterData>, HTMLDivElement>,
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

		while (true) {
			const ref = this.model.getNodeLocation(node);
			const parentRef = this.model.getParentNodeLocation(ref);

			if (!parentRef) {
				break;
			}

			const parent = this.model.getNode(parentRef);
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

		nodes.forEach(node => {
			const ref = this.model.getNodeLocation(node);
			try {
				const parentRef = this.model.getParentNodeLocation(ref);

				if (node.collapsible && node.children.length > 0 && !node.collapsed) {
					set.add(node);
				} else if (parentRef) {
					set.add(this.model.getNode(parentRef));
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

export function contiguousFuzzyScore(patternLower: string, wordLower: string): FuzzyScore | undefined {
	const index = wordLower.toLowerCase().indexOf(patternLower);
	let score: FuzzyScore | undefined;
	if (index > -1) {
		score = [Number.MAX_SAFE_INTEGER, 0];
		for (let i = patternLower.length; i > 0; i--) {
			score.push(index + i - 1);
		}
	}
	return score;
}

export type LabelFuzzyScore = { label: string; score: FuzzyScore };

export interface IFindFilter<T> extends ITreeFilter<T, FuzzyScore | LabelFuzzyScore> {
	filter(element: T, parentVisibility: TreeVisibility): TreeFilterResult<FuzzyScore | LabelFuzzyScore>;
	pattern: string;
}

export class FindFilter<T> implements IFindFilter<T>, IDisposable {
	private _totalCount = 0;
	get totalCount(): number { return this._totalCount; }
	private _matchCount = 0;
	get matchCount(): number { return this._matchCount; }

	private _findMatchType: TreeFindMatchType = TreeFindMatchType.Fuzzy;
	set findMatchType(type: TreeFindMatchType) { this._findMatchType = type; }
	get findMatchType(): TreeFindMatchType { return this._findMatchType; }

	private _findMode: TreeFindMode = TreeFindMode.Highlight;
	set findMode(mode: TreeFindMode) { this._findMode = mode; }
	get findMode(): TreeFindMode { return this._findMode; }

	private _pattern: string = '';
	private _lowercasePattern: string = '';
	private readonly disposables = new DisposableStore();

	set pattern(pattern: string) {
		this._pattern = pattern;
		this._lowercasePattern = pattern.toLowerCase();
	}

	constructor(
		private readonly _keyboardNavigationLabelProvider: IKeyboardNavigationLabelProvider<T>,
		private readonly _filter?: ITreeFilter<T, FuzzyScore>,
		private readonly _defaultFindVisibility?: TreeVisibility | ((node: T) => TreeVisibility),
	) { }

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

		const label = this._keyboardNavigationLabelProvider.getKeyboardNavigationLabel(element);
		const labels = Array.isArray(label) ? label : [label];

		for (const l of labels) {
			const labelStr: string = l && l.toString();
			if (typeof labelStr === 'undefined') {
				return { data: FuzzyScore.Default, visibility };
			}

			let score: FuzzyScore | undefined;
			if (this._findMatchType === TreeFindMatchType.Contiguous) {
				score = contiguousFuzzyScore(this._lowercasePattern, labelStr.toLowerCase());
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

		if (this._findMode === TreeFindMode.Filter) {
			if (typeof this._defaultFindVisibility === 'number') {
				return this._defaultFindVisibility;
			} else if (this._defaultFindVisibility) {
				return this._defaultFindVisibility(element);
			} else {
				return TreeVisibility.Recurse;
			}
		} else {
			return { data: FuzzyScore.Default, visibility };
		}
	}

	reset(): void {
		this._totalCount = 0;
		this._matchCount = 0;
	}

	dispose(): void {
		dispose(this.disposables);
	}
}

export interface ITreeFindToggleContribution {
	id: string;
	title: string;
	icon: ThemeIcon;
	isChecked: boolean;
}

class TreeFindToggle extends Toggle {

	readonly id: string;

	constructor(contribution: ITreeFindToggleContribution, opts: IToggleStyles, hoverDelegate?: IHoverDelegate) {
		super({
			icon: contribution.icon,
			title: contribution.title,
			isChecked: contribution.isChecked,
			inputActiveOptionBorder: opts.inputActiveOptionBorder,
			inputActiveOptionForeground: opts.inputActiveOptionForeground,
			inputActiveOptionBackground: opts.inputActiveOptionBackground,
			hoverDelegate,
		});

		this.id = contribution.id;
	}
}

export class FindToggles {
	private stateMap: Map<string, ITreeFindToggleContribution>;

	constructor(startStates: ITreeFindToggleContribution[]) {
		this.stateMap = new Map(startStates.map(state => [state.id, { ...state }]));
	}

	states(): ITreeFindToggleContribution[] {
		return Array.from(this.stateMap.values());
	}

	get(id: string): boolean {
		const state = this.stateMap.get(id);
		if (state === undefined) {
			throw new Error(`No state found for toggle id ${id}`);
		}
		return state.isChecked;
	}

	set(id: string, value: boolean): boolean {
		const state = this.stateMap.get(id);
		if (state === undefined) {
			throw new Error(`No state found for toggle id ${id}`);
		}
		if (state.isChecked === value) {
			return false;
		}
		state.isChecked = value;
		return true;
	}
}

export interface ITreeFindToggleChangeEvent {
	readonly id: string;
	readonly isChecked: boolean;
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
		h('.monaco-tree-type-filter-input@findInput'),
		h('.monaco-tree-type-filter-actionbar@actionbar'),
	]);

	get value(): string {
		return this.findInput.inputBox.value;
	}

	set value(value: string) {
		this.findInput.inputBox.value = value;
	}

	private readonly findInput: FindInput;
	private readonly actionbar: ActionBar;
	private readonly toggles: TreeFindToggle[] = [];

	readonly _onDidDisable = new Emitter<void>();
	readonly onDidDisable = this._onDidDisable.event;
	readonly onDidChangeValue: Event<string>;
	readonly onDidToggleChange: Event<ITreeFindToggleChangeEvent>;

	constructor(
		container: HTMLElement,
		private tree: AbstractTree<T, TFilterData, any>,
		contextViewProvider: IContextViewProvider,
		placeholder: string,
		toggleContributions: ITreeFindToggleContribution[] = [],
		options?: IFindWidgetOptions
	) {
		super();

		container.appendChild(this.elements.root);
		this._register(toDisposable(() => this.elements.root.remove()));

		const styles = options?.styles ?? unthemedFindWidgetStyles;

		if (styles.listFilterWidgetBackground) {
			this.elements.root.style.backgroundColor = styles.listFilterWidgetBackground;
		}

		if (styles.listFilterWidgetShadow) {
			this.elements.root.style.boxShadow = `0 0 8px 2px ${styles.listFilterWidgetShadow}`;
		}

		const toggleHoverDelegate = this._register(createInstantHoverDelegate());
		this.toggles = toggleContributions.map(contribution => this._register(new TreeFindToggle(contribution, styles.toggleStyles, toggleHoverDelegate)));
		this.onDidToggleChange = Event.any(...this.toggles.map(toggle => Event.map(toggle.onChange, () => ({ id: toggle.id, isChecked: toggle.checked }))));

		const history = options?.history || [];
		this.findInput = this._register(new FindInput(this.elements.findInput, contextViewProvider, {
			label: localize('type to search', "Type to search"),
			placeholder,
			additionalToggles: this.toggles,
			showCommonFindToggles: false,
			inputBoxStyles: styles.inputBoxStyles,
			toggleStyles: styles.toggleStyles,
			history: new Set(history)
		}));

		this.actionbar = this._register(new ActionBar(this.elements.actionbar));

		const emitter = this._register(new DomEmitter(this.findInput.inputBox.inputElement, 'keydown'));
		const onKeyDown = Event.chain(emitter.event, $ => $.map(e => new StandardKeyboardEvent(e)));

		this._register(onKeyDown((e) => {
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

		this.onDidChangeValue = this.findInput.onDidChange;
	}

	setToggleState(id: string, checked: boolean): void {
		const toggle = this.toggles.find(toggle => toggle.id === id);
		if (toggle) {
			toggle.checked = checked;
		}
	}

	setPlaceHolder(placeHolder: string): void {
		this.findInput.inputBox.setPlaceHolder(placeHolder);
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

enum DefaultTreeToggles {
	Mode = 'mode',
	MatchType = 'matchType',
}

interface IAbstractFindControllerOptions extends IFindWidgetOptions {
	placeholder?: string;
	toggles?: ITreeFindToggleContribution[];
	showNotFoundMessage?: boolean;
}

interface IFindControllerOptions extends IAbstractFindControllerOptions {
	defaultFindMode?: TreeFindMode;
	defaultFindMatchType?: TreeFindMatchType;
}

export abstract class AbstractFindController<T, TFilterData> implements IDisposable {

	private _history: string[] | undefined;

	private _pattern = '';
	get pattern(): string { return this._pattern; }
	private previousPattern = '';

	protected readonly toggles: FindToggles;

	private _placeholder: string;
	protected get placeholder(): string { return this._placeholder; }
	protected set placeholder(value: string) {
		this._placeholder = value;
		this.widget?.setPlaceHolder(value);
	}

	private widget: FindWidget<T, TFilterData> | undefined;

	private readonly _onDidChangePattern = new Emitter<string>();
	readonly onDidChangePattern = this._onDidChangePattern.event;

	private readonly _onDidChangeOpenState = new Emitter<boolean>();
	readonly onDidChangeOpenState = this._onDidChangeOpenState.event;

	private readonly enabledDisposables = new DisposableStore();
	protected readonly disposables = new DisposableStore();

	constructor(
		protected tree: AbstractTree<T, TFilterData, any>,
		protected filter: IFindFilter<T>,
		protected readonly contextViewProvider: IContextViewProvider,
		protected readonly options: IAbstractFindControllerOptions = {}
	) {
		this.toggles = new FindToggles(options.toggles ?? []);
		this._placeholder = options.placeholder ?? localize('type to search', "Type to search");
	}

	isOpened(): boolean {
		return !!this.widget;
	}

	open(): void {
		if (this.widget) {
			this.widget.focus();
			this.widget.select();
			return;
		}

		this.tree.updateOptions({ paddingTop: 30 });

		this.widget = new FindWidget(this.tree.getHTMLElement(), this.tree, this.contextViewProvider, this.placeholder, this.toggles.states(), { ...this.options, history: this._history });
		this.enabledDisposables.add(this.widget);

		this.widget.onDidChangeValue(this.onDidChangeValue, this, this.enabledDisposables);
		this.widget.onDidDisable(this.close, this, this.enabledDisposables);
		this.widget.onDidToggleChange(this.onDidToggleChange, this, this.enabledDisposables);

		this.widget.focus();

		this.widget.value = this.previousPattern;
		this.widget.select();

		this._onDidChangeOpenState.fire(true);
	}

	close(): void {
		if (!this.widget) {
			return;
		}

		this.tree.updateOptions({ paddingTop: 0 });

		this._history = this.widget.getHistory();
		this.widget = undefined;

		this.enabledDisposables.clear();

		this.previousPattern = this.pattern;
		this.onDidChangeValue('');
		this.tree.domFocus();

		this._onDidChangeOpenState.fire(false);
	}

	protected onDidChangeValue(pattern: string): void {
		this._pattern = pattern;
		this._onDidChangePattern.fire(pattern);

		this.filter.pattern = pattern;
		this.applyPattern(pattern);
	}

	protected abstract applyPattern(pattern: string): void;

	protected onDidToggleChange(e: ITreeFindToggleChangeEvent): void {
		this.toggles.set(e.id, e.isChecked);
	}

	protected updateToggleState(id: string, checked: boolean): void {
		this.toggles.set(id, checked);
		this.widget?.setToggleState(id, checked);
	}

	protected renderMessage(showNotFound: boolean, warningMessage?: string): void {
		if (showNotFound) {
			if (this.tree.options.showNotFoundMessage ?? true) {
				this.widget?.showMessage({ type: MessageType.WARNING, content: warningMessage ?? localize('not found', "No results found.") });
			} else {
				this.widget?.showMessage({ type: MessageType.WARNING });
			}
		} else {
			this.widget?.clearMessage();
		}
	}

	protected alertResults(results: number): void {
		if (!results) {
			alert(localize('replFindNoResults', "No results"));
		} else {
			alert(localize('foundResults', "{0} results", results));
		}
	}

	dispose() {
		this._history = undefined;
		this._onDidChangePattern.dispose();
		this.enabledDisposables.dispose();
		this.disposables.dispose();
	}
}

export class FindController<T, TFilterData> extends AbstractFindController<T, TFilterData> {

	get mode(): TreeFindMode { return this.toggles.get(DefaultTreeToggles.Mode) ? TreeFindMode.Filter : TreeFindMode.Highlight; }
	set mode(mode: TreeFindMode) {
		if (mode === this.mode) {
			return;
		}

		const isFilterMode = mode === TreeFindMode.Filter;
		this.updateToggleState(DefaultTreeToggles.Mode, isFilterMode);
		this.placeholder = isFilterMode ? localize('type to filter', "Type to filter") : localize('type to search', "Type to search");

		this.filter.findMode = mode;
		this.tree.refilter();
		this.render();
		this._onDidChangeMode.fire(mode);
	}

	get matchType(): TreeFindMatchType { return this.toggles.get(DefaultTreeToggles.MatchType) ? TreeFindMatchType.Fuzzy : TreeFindMatchType.Contiguous; }
	set matchType(matchType: TreeFindMatchType) {
		if (matchType === this.matchType) {
			return;
		}

		this.updateToggleState(DefaultTreeToggles.MatchType, matchType === TreeFindMatchType.Fuzzy);

		this.filter.findMatchType = matchType;
		this.tree.refilter();
		this.render();
		this._onDidChangeMatchType.fire(matchType);
	}

	private readonly _onDidChangeMode = new Emitter<TreeFindMode>();
	readonly onDidChangeMode = this._onDidChangeMode.event;

	private readonly _onDidChangeMatchType = new Emitter<TreeFindMatchType>();
	readonly onDidChangeMatchType = this._onDidChangeMatchType.event;

	constructor(
		tree: AbstractTree<T, TFilterData, any>,
		protected override filter: FindFilter<T>,
		contextViewProvider: IContextViewProvider,
		options: IFindControllerOptions = {}
	) {
		const defaultFindMode = options.defaultFindMode ?? TreeFindMode.Highlight;
		const defaultFindMatchType = options.defaultFindMatchType ?? TreeFindMatchType.Fuzzy;

		const toggleContributions: ITreeFindToggleContribution[] = [{
			id: DefaultTreeToggles.Mode,
			icon: Codicon.listFilter,
			title: localize('filter', "Filter"),
			isChecked: defaultFindMode === TreeFindMode.Filter,
		}, {
			id: DefaultTreeToggles.MatchType,
			icon: Codicon.searchFuzzy,
			title: localize('fuzzySearch', "Fuzzy Match"),
			isChecked: defaultFindMatchType === TreeFindMatchType.Fuzzy,
		}];

		filter.findMatchType = defaultFindMatchType;
		filter.findMode = defaultFindMode;

		super(tree, filter, contextViewProvider, { ...options, toggles: toggleContributions });

		this.disposables.add(this.tree.onDidChangeModel(() => {
			if (!this.isOpened()) {
				return;
			}

			if (this.pattern.length !== 0) {
				this.tree.refilter();
			}

			this.render();
		}));

		this.disposables.add(this.tree.onWillRefilter(() => this.filter.reset()));
	}

	updateOptions(optionsUpdate: IAbstractTreeOptionsUpdate = {}): void {
		if (optionsUpdate.defaultFindMode !== undefined) {
			this.mode = optionsUpdate.defaultFindMode;
		}

		if (optionsUpdate.defaultFindMatchType !== undefined) {
			this.matchType = optionsUpdate.defaultFindMatchType;
		}
	}

	protected applyPattern(pattern: string): void {
		this.tree.refilter();

		if (pattern) {
			this.tree.focusNext(0, true, undefined, (node) => this.shouldAllowFocus(node));
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

	shouldAllowFocus(node: ITreeNode<T, TFilterData>): boolean {
		if (!this.isOpened() || !this.pattern) {
			return true;
		}

		if (this.filter.totalCount > 0 && this.filter.matchCount <= 1) {
			return true;
		}

		return !FuzzyScore.isDefault(node.filterData as any as FuzzyScore);
	}

	protected override onDidToggleChange(e: ITreeFindToggleChangeEvent): void {
		if (e.id === DefaultTreeToggles.Mode) {
			this.mode = e.isChecked ? TreeFindMode.Filter : TreeFindMode.Highlight;
		} else if (e.id === DefaultTreeToggles.MatchType) {
			this.matchType = e.isChecked ? TreeFindMatchType.Fuzzy : TreeFindMatchType.Contiguous;
		}
	}

	protected render(): void {
		const noMatches = this.filter.matchCount === 0 && this.filter.totalCount > 0;
		const showNotFound = noMatches && this.pattern.length > 0;

		this.renderMessage(showNotFound);

		if (this.pattern.length) {
			this.alertResults(this.filter.matchCount);
		}
	}
}

export interface StickyScrollNode<T, TFilterData> {
	readonly node: ITreeNode<T, TFilterData>;
	readonly startIndex: number;
	readonly endIndex: number;
	readonly height: number;
	readonly position: number;
}

function stickyScrollNodeStateEquals<T, TFilterData>(node1: StickyScrollNode<T, TFilterData>, node2: StickyScrollNode<T, TFilterData>) {
	return node1.position === node2.position && stickyScrollNodeEquals(node1, node2);
}

function stickyScrollNodeEquals<T, TFilterData>(node1: StickyScrollNode<T, TFilterData>, node2: StickyScrollNode<T, TFilterData>) {
	return node1.node.element === node2.node.element &&
		node1.startIndex === node2.startIndex &&
		node1.height === node2.height &&
		node1.endIndex === node2.endIndex;
}

class StickyScrollState<T, TFilterData, TRef> {

	constructor(
		readonly stickyNodes: StickyScrollNode<T, TFilterData>[] = []
	) { }

	get count(): number { return this.stickyNodes.length; }

	equal(state: StickyScrollState<T, TFilterData, TRef>): boolean {
		return equals(this.stickyNodes, state.stickyNodes, stickyScrollNodeStateEquals);
	}

	contains(element: ITreeNode<T, TFilterData>): boolean {
		return this.stickyNodes.some(node => node.node.element === element.element);
	}

	lastNodePartiallyVisible(): boolean {
		if (this.count === 0) {
			return false;
		}

		const lastStickyNode = this.stickyNodes[this.count - 1];
		if (this.count === 1) {
			return lastStickyNode.position !== 0;
		}

		const secondLastStickyNode = this.stickyNodes[this.count - 2];
		return secondLastStickyNode.position + secondLastStickyNode.height !== lastStickyNode.position;
	}

	animationStateChanged(previousState: StickyScrollState<T, TFilterData, TRef>): boolean {
		if (!equals(this.stickyNodes, previousState.stickyNodes, stickyScrollNodeEquals)) {
			return false;
		}

		if (this.count === 0) {
			return false;
		}

		const lastStickyNode = this.stickyNodes[this.count - 1];
		const previousLastStickyNode = previousState.stickyNodes[previousState.count - 1];

		return lastStickyNode.position !== previousLastStickyNode.position;
	}
}

export interface IStickyScrollDelegate<T, TFilterData> {
	constrainStickyScrollNodes(stickyNodes: StickyScrollNode<T, TFilterData>[], stickyScrollMaxItemCount: number, maxWidgetHeight: number): StickyScrollNode<T, TFilterData>[];
}

class DefaultStickyScrollDelegate<T, TFilterData> implements IStickyScrollDelegate<T, TFilterData> {

	constrainStickyScrollNodes(stickyNodes: StickyScrollNode<T, TFilterData>[], stickyScrollMaxItemCount: number, maxWidgetHeight: number): StickyScrollNode<T, TFilterData>[] {

		for (let i = 0; i < stickyNodes.length; i++) {
			const stickyNode = stickyNodes[i];
			const stickyNodeBottom = stickyNode.position + stickyNode.height;
			if (stickyNodeBottom > maxWidgetHeight || i >= stickyScrollMaxItemCount) {
				return stickyNodes.slice(0, i);
			}
		}

		return stickyNodes;
	}
}

class StickyScrollController<T, TFilterData, TRef> extends Disposable {

	readonly onDidChangeHasFocus: Event<boolean>;
	readonly onContextMenu: Event<ITreeContextMenuEvent<T>>;

	private readonly stickyScrollDelegate: IStickyScrollDelegate<T, TFilterData>;

	private stickyScrollMaxItemCount: number;
	private readonly maxWidgetViewRatio = 0.4;

	private readonly _widget: StickyScrollWidget<T, TFilterData, TRef>;

	private paddingTop: number;

	constructor(
		private readonly tree: AbstractTree<T, TFilterData, TRef>,
		private readonly model: ITreeModel<T, TFilterData, TRef>,
		private readonly view: List<ITreeNode<T, TFilterData>>,
		renderers: TreeRenderer<T, TFilterData, TRef, any>[],
		private readonly treeDelegate: IListVirtualDelegate<ITreeNode<T, TFilterData>>,
		options: IAbstractTreeOptions<T, TFilterData> = {},
	) {
		super();

		const stickyScrollOptions = this.validateStickySettings(options);
		this.stickyScrollMaxItemCount = stickyScrollOptions.stickyScrollMaxItemCount;

		this.stickyScrollDelegate = options.stickyScrollDelegate ?? new DefaultStickyScrollDelegate();
		this.paddingTop = options.paddingTop ?? 0;

		this._widget = this._register(new StickyScrollWidget(view.getScrollableElement(), view, tree, renderers, treeDelegate, options.accessibilityProvider));
		this.onDidChangeHasFocus = this._widget.onDidChangeHasFocus;
		this.onContextMenu = this._widget.onContextMenu;

		this._register(view.onDidScroll(() => this.update()));
		this._register(view.onDidChangeContentHeight(() => this.update()));
		this._register(tree.onDidChangeCollapseState(() => this.update()));
		this._register(model.onDidSpliceRenderedNodes((e) => {
			const state = this._widget.state;
			if (!state) {
				return;
			}

			// If a sticky node is removed, recompute the state
			const hasRemovedStickyNode = e.deleteCount > 0 && state.stickyNodes.some(stickyNode => !this.model.has(this.model.getNodeLocation(stickyNode.node)));
			if (hasRemovedStickyNode) {
				this.update();
				return;
			}

			// If a sticky node is updated, rerender the widget
			const shouldRerenderStickyNodes = state.stickyNodes.some(stickyNode => {
				const listIndex = this.model.getListIndex(this.model.getNodeLocation(stickyNode.node));
				return listIndex >= e.start && listIndex < e.start + e.deleteCount && state.contains(stickyNode.node);
			});

			if (shouldRerenderStickyNodes) {
				this._widget.rerender();
			}
		}));

		this.update();
	}

	get height(): number {
		return this._widget.height;
	}

	get count(): number {
		return this._widget.count;
	}

	getNode(node: ITreeNode<T, TFilterData>): StickyScrollNode<T, TFilterData> | undefined {
		return this._widget.getNode(node);
	}

	private getNodeAtHeight(height: number): ITreeNode<T, TFilterData> | undefined {
		let index;
		if (height === 0) {
			index = this.view.firstVisibleIndex;
		} else {
			index = this.view.indexAt(height + this.view.scrollTop);
		}

		if (index < 0 || index >= this.view.length) {
			return undefined;
		}

		return this.view.element(index);
	}

	private update() {
		const firstVisibleNode = this.getNodeAtHeight(this.paddingTop);

		// Don't render anything if there are no elements
		if (!firstVisibleNode || this.tree.scrollTop <= this.paddingTop) {
			this._widget.setState(undefined);
			return;
		}

		const stickyState = this.findStickyState(firstVisibleNode);
		this._widget.setState(stickyState);
	}

	private findStickyState(firstVisibleNode: ITreeNode<T, TFilterData>): StickyScrollState<T, TFilterData, TRef> | undefined {
		const stickyNodes: StickyScrollNode<T, TFilterData>[] = [];
		let firstVisibleNodeUnderWidget: ITreeNode<T, TFilterData> | undefined = firstVisibleNode;
		let stickyNodesHeight = 0;

		let nextStickyNode = this.getNextStickyNode(firstVisibleNodeUnderWidget, undefined, stickyNodesHeight);
		while (nextStickyNode) {

			stickyNodes.push(nextStickyNode);
			stickyNodesHeight += nextStickyNode.height;

			if (stickyNodes.length <= this.stickyScrollMaxItemCount) {
				firstVisibleNodeUnderWidget = this.getNextVisibleNode(nextStickyNode);
				if (!firstVisibleNodeUnderWidget) {
					break;
				}
			}

			nextStickyNode = this.getNextStickyNode(firstVisibleNodeUnderWidget, nextStickyNode.node, stickyNodesHeight);
		}

		const contrainedStickyNodes = this.constrainStickyNodes(stickyNodes);
		return contrainedStickyNodes.length ? new StickyScrollState(contrainedStickyNodes) : undefined;
	}

	private getNextVisibleNode(previousStickyNode: StickyScrollNode<T, TFilterData>): ITreeNode<T, TFilterData> | undefined {
		return this.getNodeAtHeight(previousStickyNode.position + previousStickyNode.height);
	}

	private getNextStickyNode(firstVisibleNodeUnderWidget: ITreeNode<T, TFilterData>, previousStickyNode: ITreeNode<T, TFilterData> | undefined, stickyNodesHeight: number): StickyScrollNode<T, TFilterData> | undefined {
		const nextStickyNode = this.getAncestorUnderPrevious(firstVisibleNodeUnderWidget, previousStickyNode);
		if (!nextStickyNode) {
			return undefined;
		}

		if (nextStickyNode === firstVisibleNodeUnderWidget) {
			if (!this.nodeIsUncollapsedParent(firstVisibleNodeUnderWidget)) {
				return undefined;
			}

			if (this.nodeTopAlignsWithStickyNodesBottom(firstVisibleNodeUnderWidget, stickyNodesHeight)) {
				return undefined;
			}
		}

		return this.createStickyScrollNode(nextStickyNode, stickyNodesHeight);
	}

	private nodeTopAlignsWithStickyNodesBottom(node: ITreeNode<T, TFilterData>, stickyNodesHeight: number): boolean {
		const nodeIndex = this.getNodeIndex(node);
		const elementTop = this.view.getElementTop(nodeIndex);
		const stickyPosition = stickyNodesHeight;
		return this.view.scrollTop === elementTop - stickyPosition;
	}

	private createStickyScrollNode(node: ITreeNode<T, TFilterData>, currentStickyNodesHeight: number): StickyScrollNode<T, TFilterData> {
		const height = this.treeDelegate.getHeight(node);
		const { startIndex, endIndex } = this.getNodeRange(node);

		const position = this.calculateStickyNodePosition(endIndex, currentStickyNodesHeight, height);

		return { node, position, height, startIndex, endIndex };
	}

	private getAncestorUnderPrevious(node: ITreeNode<T, TFilterData>, previousAncestor: ITreeNode<T, TFilterData> | undefined = undefined): ITreeNode<T, TFilterData> | undefined {
		let currentAncestor: ITreeNode<T, TFilterData> = node;
		let parentOfcurrentAncestor: ITreeNode<T, TFilterData> | undefined = this.getParentNode(currentAncestor);

		while (parentOfcurrentAncestor) {
			if (parentOfcurrentAncestor === previousAncestor) {
				return currentAncestor;
			}
			currentAncestor = parentOfcurrentAncestor;
			parentOfcurrentAncestor = this.getParentNode(currentAncestor);
		}

		if (previousAncestor === undefined) {
			return currentAncestor;
		}

		return undefined;
	}

	private calculateStickyNodePosition(lastDescendantIndex: number, stickyRowPositionTop: number, stickyNodeHeight: number): number {
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

		if (stickyRowPositionTop + stickyNodeHeight > bottomOfLastChild && stickyRowPositionTop <= bottomOfLastChild) {
			return bottomOfLastChild - stickyNodeHeight;
		}

		return stickyRowPositionTop;
	}

	private constrainStickyNodes(stickyNodes: StickyScrollNode<T, TFilterData>[]): StickyScrollNode<T, TFilterData>[] {
		if (stickyNodes.length === 0) {
			return [];
		}

		// Check if sticky nodes need to be constrained
		const maximumStickyWidgetHeight = this.view.renderHeight * this.maxWidgetViewRatio;
		const lastStickyNode = stickyNodes[stickyNodes.length - 1];
		if (stickyNodes.length <= this.stickyScrollMaxItemCount && lastStickyNode.position + lastStickyNode.height <= maximumStickyWidgetHeight) {
			return stickyNodes;
		}

		// constrain sticky nodes
		const constrainedStickyNodes = this.stickyScrollDelegate.constrainStickyScrollNodes(stickyNodes, this.stickyScrollMaxItemCount, maximumStickyWidgetHeight);

		if (!constrainedStickyNodes.length) {
			return [];
		}

		// Validate constraints
		const lastConstrainedStickyNode = constrainedStickyNodes[constrainedStickyNodes.length - 1];
		if (constrainedStickyNodes.length > this.stickyScrollMaxItemCount || lastConstrainedStickyNode.position + lastConstrainedStickyNode.height > maximumStickyWidgetHeight) {
			throw new Error('stickyScrollDelegate violates constraints');
		}

		return constrainedStickyNodes;
	}

	private getParentNode(node: ITreeNode<T, TFilterData>): ITreeNode<T, TFilterData> | undefined {
		const nodeLocation = this.model.getNodeLocation(node);
		const parentLocation = this.model.getParentNodeLocation(nodeLocation);
		return parentLocation ? this.model.getNode(parentLocation) : undefined;
	}

	private nodeIsUncollapsedParent(node: ITreeNode<T, TFilterData>): boolean {
		const nodeLocation = this.model.getNodeLocation(node);
		return this.model.getListRenderCount(nodeLocation) > 1;
	}

	private getNodeIndex(node: ITreeNode<T, TFilterData>): number {
		const nodeLocation = this.model.getNodeLocation(node);
		const nodeIndex = this.model.getListIndex(nodeLocation);
		return nodeIndex;
	}

	private getNodeRange(node: ITreeNode<T, TFilterData>): { startIndex: number; endIndex: number } {
		const nodeLocation = this.model.getNodeLocation(node);
		const startIndex = this.model.getListIndex(nodeLocation);

		if (startIndex < 0) {
			throw new Error('Node not found in tree');
		}

		const renderCount = this.model.getListRenderCount(nodeLocation);
		const endIndex = startIndex + renderCount - 1;

		return { startIndex, endIndex };
	}

	nodePositionTopBelowWidget(node: ITreeNode<T, TFilterData>): number {
		const ancestors = [];
		let currentAncestor = this.getParentNode(node);
		while (currentAncestor) {
			ancestors.push(currentAncestor);
			currentAncestor = this.getParentNode(currentAncestor);
		}

		let widgetHeight = 0;
		for (let i = 0; i < ancestors.length && i < this.stickyScrollMaxItemCount; i++) {
			widgetHeight += this.treeDelegate.getHeight(ancestors[i]);
		}
		return widgetHeight;
	}

	getFocus(): T | undefined {
		return this._widget.getFocus();
	}

	domFocus(): void {
		this._widget.domFocus();
	}

	// Whether sticky scroll was the last focused part in the tree or not
	focusedLast(): boolean {
		return this._widget.focusedLast();
	}

	updateOptions(optionsUpdate: IAbstractTreeOptionsUpdate = {}): void {
		if (optionsUpdate.paddingTop !== undefined) {
			this.paddingTop = optionsUpdate.paddingTop;
		}

		if (optionsUpdate.stickyScrollMaxItemCount !== undefined) {
			const validatedOptions = this.validateStickySettings(optionsUpdate);
			if (this.stickyScrollMaxItemCount !== validatedOptions.stickyScrollMaxItemCount) {
				this.stickyScrollMaxItemCount = validatedOptions.stickyScrollMaxItemCount;
				this.update();
			}
		}
	}

	validateStickySettings(options: IAbstractTreeOptionsUpdate): { stickyScrollMaxItemCount: number } {
		let stickyScrollMaxItemCount = 7;
		if (typeof options.stickyScrollMaxItemCount === 'number') {
			stickyScrollMaxItemCount = Math.max(options.stickyScrollMaxItemCount, 1);
		}
		return { stickyScrollMaxItemCount };
	}
}

class StickyScrollWidget<T, TFilterData, TRef> implements IDisposable {

	private readonly _rootDomNode: HTMLElement;
	private _previousState: StickyScrollState<T, TFilterData, TRef> | undefined;
	private _previousElements: HTMLElement[] = [];
	private readonly _previousStateDisposables: DisposableStore = new DisposableStore();
	get state(): StickyScrollState<T, TFilterData, TRef> | undefined { return this._previousState; }

	private stickyScrollFocus: StickyScrollFocus<T, TFilterData, TRef>;
	readonly onDidChangeHasFocus: Event<boolean>;
	readonly onContextMenu: Event<ITreeContextMenuEvent<T>>;

	constructor(
		container: HTMLElement,
		private readonly view: List<ITreeNode<T, TFilterData>>,
		private readonly tree: AbstractTree<T, TFilterData, TRef>,
		private readonly treeRenderers: TreeRenderer<T, TFilterData, TRef, any>[],
		private readonly treeDelegate: IListVirtualDelegate<ITreeNode<T, TFilterData>>,
		private readonly accessibilityProvider: IListAccessibilityProvider<T> | undefined,
	) {

		this._rootDomNode = $('.monaco-tree-sticky-container.empty');
		container.appendChild(this._rootDomNode);

		const shadow = $('.monaco-tree-sticky-container-shadow');
		this._rootDomNode.appendChild(shadow);

		this.stickyScrollFocus = new StickyScrollFocus(this._rootDomNode, view);
		this.onDidChangeHasFocus = this.stickyScrollFocus.onDidChangeHasFocus;
		this.onContextMenu = this.stickyScrollFocus.onContextMenu;
	}

	get height(): number {
		if (!this._previousState) {
			return 0;
		}
		const lastElement = this._previousState.stickyNodes[this._previousState.count - 1];
		return lastElement.position + lastElement.height;
	}

	get count(): number {
		return this._previousState?.count ?? 0;
	}

	getNode(node: ITreeNode<T, TFilterData>): StickyScrollNode<T, TFilterData> | undefined {
		return this._previousState?.stickyNodes.find(stickyNode => stickyNode.node === node);
	}

	setState(state: StickyScrollState<T, TFilterData, TRef> | undefined): void {

		const wasVisible = !!this._previousState && this._previousState.count > 0;
		const isVisible = !!state && state.count > 0;

		// If state has not changed, do nothing
		if ((!wasVisible && !isVisible) || (wasVisible && isVisible && this._previousState!.equal(state))) {
			return;
		}

		// Update visibility of the widget if changed
		if (wasVisible !== isVisible) {
			this.setVisible(isVisible);
		}

		if (!isVisible) {
			this._previousState = undefined;
			this._previousElements = [];
			this._previousStateDisposables.clear();
			return;
		}

		const lastStickyNode = state.stickyNodes[state.count - 1];

		// If the new state is only a change in the last node's position, update the position of the last element
		if (this._previousState && state.animationStateChanged(this._previousState)) {
			this._previousElements[this._previousState.count - 1].style.top = `${lastStickyNode.position}px`;
		}
		// create new dom elements
		else {
			this.renderState(state);
		}

		this._previousState = state;

		// Set the height of the widget to the bottom of the last sticky node
		this._rootDomNode.style.height = `${lastStickyNode.position + lastStickyNode.height}px`;
	}

	private renderState(state: StickyScrollState<T, TFilterData, TRef>): void {
		this._previousStateDisposables.clear();

		const elements = Array(state.count);
		for (let stickyIndex = state.count - 1; stickyIndex >= 0; stickyIndex--) {
			const stickyNode = state.stickyNodes[stickyIndex];

			const { element, disposable } = this.createElement(stickyNode, stickyIndex, state.count);
			elements[stickyIndex] = element;

			this._rootDomNode.appendChild(element);
			this._previousStateDisposables.add(disposable);
		}

		this.stickyScrollFocus.updateElements(elements, state);

		this._previousElements = elements;
	}

	rerender(): void {
		if (this._previousState) {
			this.renderState(this._previousState);
		}
	}

	private createElement(stickyNode: StickyScrollNode<T, TFilterData>, stickyIndex: number, stickyNodesTotal: number): { element: HTMLElement; disposable: IDisposable } {

		const nodeIndex = stickyNode.startIndex;

		// Sticky element container
		const stickyElement = document.createElement('div');
		stickyElement.style.top = `${stickyNode.position}px`;

		if (this.tree.options.setRowHeight !== false) {
			stickyElement.style.height = `${stickyNode.height}px`;
		}

		if (this.tree.options.setRowLineHeight !== false) {
			stickyElement.style.lineHeight = `${stickyNode.height}px`;
		}

		stickyElement.classList.add('monaco-tree-sticky-row');
		stickyElement.classList.add('monaco-list-row');

		stickyElement.setAttribute('data-index', `${nodeIndex}`);
		stickyElement.setAttribute('data-parity', nodeIndex % 2 === 0 ? 'even' : 'odd');
		stickyElement.setAttribute('id', this.view.getElementID(nodeIndex));
		const accessibilityDisposable = this.setAccessibilityAttributes(stickyElement, stickyNode.node.element, stickyIndex, stickyNodesTotal);

		// Get the renderer for the node
		const nodeTemplateId = this.treeDelegate.getTemplateId(stickyNode.node);
		const renderer = this.treeRenderers.find((renderer) => renderer.templateId === nodeTemplateId);
		if (!renderer) {
			throw new Error(`No renderer found for template id ${nodeTemplateId}`);
		}

		// To make sure we do not influence the original node, we create a copy of the node
		// We need to check if it is already a unique instance of the node by the delegate
		let nodeCopy = stickyNode.node;
		if (nodeCopy === this.tree.getNode(this.tree.getNodeLocation(stickyNode.node))) {
			nodeCopy = new Proxy(stickyNode.node, {});
		}

		// Render the element
		const templateData = renderer.renderTemplate(stickyElement);
		renderer.renderElement(nodeCopy, stickyNode.startIndex, templateData, stickyNode.height);

		// Remove the element from the DOM when state is disposed
		const disposable = toDisposable(() => {
			accessibilityDisposable.dispose();
			renderer.disposeElement(nodeCopy, stickyNode.startIndex, templateData, stickyNode.height);
			renderer.disposeTemplate(templateData);
			stickyElement.remove();
		});

		return { element: stickyElement, disposable };
	}

	private setAccessibilityAttributes(container: HTMLElement, element: T, stickyIndex: number, stickyNodesTotal: number): IDisposable {
		if (!this.accessibilityProvider) {
			return Disposable.None;
		}

		if (this.accessibilityProvider.getSetSize) {
			container.setAttribute('aria-setsize', String(this.accessibilityProvider.getSetSize(element, stickyIndex, stickyNodesTotal)));
		}
		if (this.accessibilityProvider.getPosInSet) {
			container.setAttribute('aria-posinset', String(this.accessibilityProvider.getPosInSet(element, stickyIndex)));
		}
		if (this.accessibilityProvider.getRole) {
			container.setAttribute('role', this.accessibilityProvider.getRole(element) ?? 'treeitem');
		}

		const ariaLabel = this.accessibilityProvider.getAriaLabel(element);
		const observable = (ariaLabel && typeof ariaLabel !== 'string') ? ariaLabel : constObservable(ariaLabel);
		const result = autorun(reader => {
			const value = reader.readObservable(observable);

			if (value) {
				container.setAttribute('aria-label', value);
			} else {
				container.removeAttribute('aria-label');
			}
		});

		if (typeof ariaLabel === 'string') {
		} else if (ariaLabel) {
			container.setAttribute('aria-label', ariaLabel.get());
		}

		const ariaLevel = this.accessibilityProvider.getAriaLevel && this.accessibilityProvider.getAriaLevel(element);
		if (typeof ariaLevel === 'number') {
			container.setAttribute('aria-level', `${ariaLevel}`);
		}

		// Sticky Scroll elements can not be selected
		container.setAttribute('aria-selected', String(false));

		return result;
	}

	private setVisible(visible: boolean): void {
		this._rootDomNode.classList.toggle('empty', !visible);

		if (!visible) {
			this.stickyScrollFocus.updateElements([], undefined);
		}
	}

	getFocus(): T | undefined {
		return this.stickyScrollFocus.getFocus();
	}

	domFocus(): void {
		this.stickyScrollFocus.domFocus();
	}

	focusedLast(): boolean {
		return this.stickyScrollFocus.focusedLast();
	}

	dispose(): void {
		this.stickyScrollFocus.dispose();
		this._previousStateDisposables.dispose();
		this._rootDomNode.remove();
	}
}

class StickyScrollFocus<T, TFilterData, TRef> extends Disposable {

	private focusedIndex: number = -1;
	private elements: HTMLElement[] = [];
	private state: StickyScrollState<T, TFilterData, TRef> | undefined;

	private _onDidChangeHasFocus = new Emitter<boolean>();
	readonly onDidChangeHasFocus = this._onDidChangeHasFocus.event;

	private _onContextMenu = new Emitter<ITreeContextMenuEvent<T>>();
	readonly onContextMenu: Event<ITreeContextMenuEvent<T>> = this._onContextMenu.event;

	private _domHasFocus: boolean = false;
	private get domHasFocus(): boolean { return this._domHasFocus; }
	private set domHasFocus(hasFocus: boolean) {
		if (hasFocus !== this._domHasFocus) {
			this._onDidChangeHasFocus.fire(hasFocus);
			this._domHasFocus = hasFocus;
		}
	}

	constructor(
		private readonly container: HTMLElement,
		private readonly view: List<ITreeNode<T, TFilterData>>
	) {
		super();

		this._register(addDisposableListener(this.container, 'focus', () => this.onFocus()));
		this._register(addDisposableListener(this.container, 'blur', () => this.onBlur()));
		this._register(this.view.onDidFocus(() => this.toggleStickyScrollFocused(false)));
		this._register(this.view.onKeyDown((e) => this.onKeyDown(e)));
		this._register(this.view.onMouseDown((e) => this.onMouseDown(e)));
		this._register(this.view.onContextMenu((e) => this.handleContextMenu(e)));
	}

	private handleContextMenu(e: IListContextMenuEvent<ITreeNode<T, TFilterData>>): void {
		const target = e.browserEvent.target as HTMLElement;
		if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
			if (this.focusedLast()) {
				this.view.domFocus();
			}
			return;
		}

		// The list handles the context menu triggered by a mouse event
		// In that case only set the focus of the element clicked and leave the rest to the list to handle
		if (!isKeyboardEvent(e.browserEvent)) {
			if (!this.state) {
				throw new Error('Context menu should not be triggered when state is undefined');
			}

			const stickyIndex = this.state.stickyNodes.findIndex(stickyNode => stickyNode.node.element === e.element?.element);

			if (stickyIndex === -1) {
				throw new Error('Context menu should not be triggered when element is not in sticky scroll widget');
			}
			this.container.focus();
			this.setFocus(stickyIndex);
			return;
		}

		if (!this.state || this.focusedIndex < 0) {
			throw new Error('Context menu key should not be triggered when focus is not in sticky scroll widget');
		}

		const stickyNode = this.state.stickyNodes[this.focusedIndex];
		const element = stickyNode.node.element;
		const anchor = this.elements[this.focusedIndex];
		this._onContextMenu.fire({ element, anchor, browserEvent: e.browserEvent, isStickyScroll: true });
	}

	private onKeyDown(e: KeyboardEvent): void {
		// Sticky Scroll Navigation
		if (this.domHasFocus && this.state) {
			// Move up
			if (e.key === 'ArrowUp') {
				this.setFocusedElement(Math.max(0, this.focusedIndex - 1));
				e.preventDefault();
				e.stopPropagation();
			}
			// Move down, if last sticky node is focused, move focus into first child of last sticky node
			else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
				if (this.focusedIndex >= this.state.count - 1) {
					const nodeIndexToFocus = this.state.stickyNodes[this.state.count - 1].startIndex + 1;
					this.view.domFocus();
					this.view.setFocus([nodeIndexToFocus]);
					this.scrollNodeUnderWidget(nodeIndexToFocus, this.state);
				} else {
					this.setFocusedElement(this.focusedIndex + 1);
				}
				e.preventDefault();
				e.stopPropagation();
			}
		}
	}

	private onMouseDown(e: IListMouseEvent<ITreeNode<T, TFilterData>>): void {
		const target = e.browserEvent.target as HTMLElement;
		if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
			return;
		}

		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();
	}

	updateElements(elements: HTMLElement[], state: StickyScrollState<T, TFilterData, TRef> | undefined): void {
		if (state && state.count === 0) {
			throw new Error('Sticky scroll state must be undefined when there are no sticky nodes');
		}
		if (state && state.count !== elements.length) {
			throw new Error('Sticky scroll focus received illigel state');
		}

		const previousIndex = this.focusedIndex;
		this.removeFocus();

		this.elements = elements;
		this.state = state;

		if (state) {
			const newFocusedIndex = clamp(previousIndex, 0, state.count - 1);
			this.setFocus(newFocusedIndex);
		} else {
			if (this.domHasFocus) {
				this.view.domFocus();
			}
		}

		// must come last as it calls blur()
		this.container.tabIndex = state ? 0 : -1;
	}

	private setFocusedElement(stickyIndex: number): void {
		// doesn't imply that the widget has (or will have) focus

		const state = this.state;
		if (!state) {
			throw new Error('Cannot set focus when state is undefined');
		}

		this.setFocus(stickyIndex);

		if (stickyIndex < state.count - 1) {
			return;
		}

		// If the last sticky node is not fully visible, scroll it into view
		if (state.lastNodePartiallyVisible()) {
			const lastStickyNode = state.stickyNodes[stickyIndex];
			this.scrollNodeUnderWidget(lastStickyNode.endIndex + 1, state);
		}
	}

	private scrollNodeUnderWidget(nodeIndex: number, state: StickyScrollState<T, TFilterData, TRef>) {
		const lastStickyNode = state.stickyNodes[state.count - 1];
		const secondLastStickyNode = state.count > 1 ? state.stickyNodes[state.count - 2] : undefined;

		const elementScrollTop = this.view.getElementTop(nodeIndex);
		const elementTargetViewTop = secondLastStickyNode ? secondLastStickyNode.position + secondLastStickyNode.height + lastStickyNode.height : lastStickyNode.height;
		this.view.scrollTop = elementScrollTop - elementTargetViewTop;
	}

	getFocus(): T | undefined {
		if (!this.state || this.focusedIndex === -1) {
			return undefined;
		}
		return this.state.stickyNodes[this.focusedIndex].node.element;
	}

	domFocus(): void {
		if (!this.state) {
			throw new Error('Cannot focus when state is undefined');
		}

		this.container.focus();
	}

	focusedLast(): boolean {
		if (!this.state) {
			return false;
		}
		return this.view.getHTMLElement().classList.contains('sticky-scroll-focused');
	}

	private removeFocus(): void {
		if (this.focusedIndex === -1) {
			return;
		}
		this.toggleElementFocus(this.elements[this.focusedIndex], false);
		this.focusedIndex = -1;
	}

	private setFocus(newFocusIndex: number): void {
		if (0 > newFocusIndex) {
			throw new Error('addFocus() can not remove focus');
		}
		if (!this.state && newFocusIndex >= 0) {
			throw new Error('Cannot set focus index when state is undefined');
		}
		if (this.state && newFocusIndex >= this.state.count) {
			throw new Error('Cannot set focus index to an index that does not exist');
		}

		const oldIndex = this.focusedIndex;
		if (oldIndex >= 0) {
			this.toggleElementFocus(this.elements[oldIndex], false);
		}
		if (newFocusIndex >= 0) {
			this.toggleElementFocus(this.elements[newFocusIndex], true);
		}
		this.focusedIndex = newFocusIndex;
	}

	private toggleElementFocus(element: HTMLElement, focused: boolean): void {
		this.toggleElementActiveFocus(element, focused && this.domHasFocus);
		this.toggleElementPassiveFocus(element, focused);
	}

	private toggleCurrentElementActiveFocus(focused: boolean): void {
		if (this.focusedIndex === -1) {
			return;
		}
		this.toggleElementActiveFocus(this.elements[this.focusedIndex], focused);
	}

	private toggleElementActiveFocus(element: HTMLElement, focused: boolean) {
		// active focus is set when sticky scroll has focus
		element.classList.toggle('focused', focused);
	}

	private toggleElementPassiveFocus(element: HTMLElement, focused: boolean) {
		// passive focus allows to show focus when sticky scroll does not have focus
		// for example when the context menu has focus
		element.classList.toggle('passive-focused', focused);
	}

	private toggleStickyScrollFocused(focused: boolean) {
		// Weather the last focus in the view was sticky scroll and not the list
		// Is only removed when the focus is back in the tree an no longer in sticky scroll
		this.view.getHTMLElement().classList.toggle('sticky-scroll-focused', focused);
	}

	private onFocus(): void {
		if (!this.state || this.elements.length === 0) {
			throw new Error('Cannot focus when state is undefined or elements are empty');
		}
		this.domHasFocus = true;
		this.toggleStickyScrollFocused(true);
		this.toggleCurrentElementActiveFocus(true);
		if (this.focusedIndex === -1) {
			this.setFocus(0);
		}
	}

	private onBlur(): void {
		this.domHasFocus = false;
		this.toggleCurrentElementActiveFocus(false);
	}

	override dispose(): void {
		this.toggleStickyScrollFocused(false);
		this._onDidChangeHasFocus.fire(false);
		super.dispose();
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
	const isStickyScroll = isStickyScrollContainer(event.browserEvent.target as HTMLElement);

	return {
		element: event.element ? event.element.element : null,
		browserEvent: event.browserEvent,
		anchor: event.anchor,
		isStickyScroll
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
	readonly enableStickyScroll?: boolean;
	readonly stickyScrollMaxItemCount?: number;
	readonly paddingTop?: number;
}

export interface IAbstractTreeOptions<T, TFilterData = void> extends IAbstractTreeOptionsUpdate, IListOptions<T> {
	readonly contextViewProvider?: IContextViewProvider;
	readonly collapseByDefault?: boolean; // defaults to false
	readonly allowNonCollapsibleParents?: boolean; // defaults to false
	readonly filter?: ITreeFilter<T, TFilterData>;
	readonly dnd?: ITreeDragAndDrop<T>;
	readonly paddingBottom?: number;
	readonly findWidgetEnabled?: boolean;
	readonly findWidgetStyles?: IFindWidgetStyles;
	readonly defaultFindVisibility?: TreeVisibility | ((e: T) => TreeVisibility);
	readonly stickyScrollDelegate?: IStickyScrollDelegate<any, TFilterData>;
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

	constructor(
		list: TreeNodeList<T, TFilterData, TRef>,
		private tree: AbstractTree<T, TFilterData, TRef>,
		private stickyScrollProvider: () => StickyScrollController<T, TFilterData, TRef> | undefined
	) {
		super(list);
	}

	protected override onViewPointer(e: IListMouseEvent<ITreeNode<T, TFilterData>>): void {
		if (isButton(e.browserEvent.target as HTMLElement) ||
			isEditableElement(e.browserEvent.target as HTMLElement) ||
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
		const isStickyElement = isStickyScrollElement(e.browserEvent.target as HTMLElement);

		let expandOnlyOnTwistieClick = false;

		if (isStickyElement) {
			expandOnlyOnTwistieClick = true;
		}
		else if (typeof this.tree.expandOnlyOnTwistieClick === 'function') {
			expandOnlyOnTwistieClick = this.tree.expandOnlyOnTwistieClick(node.element);
		} else {
			expandOnlyOnTwistieClick = !!this.tree.expandOnlyOnTwistieClick;
		}

		if (!isStickyElement) {
			if (expandOnlyOnTwistieClick && !onTwistie && e.browserEvent.detail !== 2) {
				return super.onViewPointer(e);
			}

			if (!this.tree.expandOnDoubleClick && e.browserEvent.detail === 2) {
				return super.onViewPointer(e);
			}
		} else {
			this.handleStickyScrollMouseEvent(e, node);
		}

		if (node.collapsible && (!isStickyElement || onTwistie)) {
			const location = this.tree.getNodeLocation(node);
			const recursive = e.browserEvent.altKey;
			this.tree.setFocus([location]);
			this.tree.toggleCollapsed(location, recursive);

			if (onTwistie) {
				// Do not set this before calling a handler on the super class, because it will reject it as handled
				e.browserEvent.isHandledByList = true;
				return;
			}
		}

		if (!isStickyElement) {
			super.onViewPointer(e);
		}
	}

	private handleStickyScrollMouseEvent(e: IListMouseEvent<ITreeNode<T, TFilterData>>, node: ITreeNode<T, TFilterData>): void {
		if (isMonacoCustomToggle(e.browserEvent.target as HTMLElement) || isActionItem(e.browserEvent.target as HTMLElement)) {
			return;
		}

		const stickyScrollController = this.stickyScrollProvider();
		if (!stickyScrollController) {
			throw new Error('Sticky scroll controller not found');
		}

		const nodeIndex = this.list.indexOf(node);
		const elementScrollTop = this.list.getElementTop(nodeIndex);
		const elementTargetViewTop = stickyScrollController.nodePositionTopBelowWidget(node);
		this.tree.scrollTop = elementScrollTop - elementTargetViewTop;
		this.list.domFocus();
		this.list.setFocus([nodeIndex]);
		this.list.setSelection([nodeIndex]);
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

	// to make sure dom focus is not stolen (for example with context menu)
	protected override onMouseDown(e: IListMouseEvent<ITreeNode<T, TFilterData>> | IListTouchEvent<ITreeNode<T, TFilterData>>): void {
		const target = e.browserEvent.target as HTMLElement;
		if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
			super.onMouseDown(e);
			return;
		}
	}

	protected override onContextMenu(e: IListContextMenuEvent<ITreeNode<T, TFilterData>>): void {
		const target = e.browserEvent.target as HTMLElement;
		if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
			super.onContextMenu(e);
			return;
		}
	}
}

interface ITreeNodeListOptions<T, TFilterData, TRef> extends IListOptions<ITreeNode<T, TFilterData>> {
	readonly tree: AbstractTree<T, TFilterData, TRef>;
	readonly stickyScrollProvider: () => StickyScrollController<T, TFilterData, TRef> | undefined;
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
		return new TreeNodeListMouseController(this, options.tree, options.stickyScrollProvider);
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

export const enum AbstractTreePart {
	Tree,
	StickyScroll,
}

export abstract class AbstractTree<T, TFilterData, TRef> implements IDisposable {

	protected view: TreeNodeList<T, TFilterData, TRef>;
	private renderers: TreeRenderer<T, TFilterData, TRef, any>[];
	protected model: ITreeModel<T, TFilterData, TRef>;
	private treeDelegate: ComposedTreeDelegate<T, ITreeNode<T, TFilterData>>;
	private focus: Trait<T>;
	private selection: Trait<T>;
	private anchor: Trait<T>;
	private eventBufferer = new EventBufferer();
	private findController?: FindController<T, TFilterData>;
	private findFilter?: FindFilter<T>;
	readonly onDidChangeFindOpenState: Event<boolean> = Event.None;
	onDidChangeStickyScrollFocused: Event<boolean> = Event.None;
	private focusNavigationFilter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined;
	private stickyScrollController?: StickyScrollController<T, TFilterData, TRef>;
	private styleElement: HTMLStyleElement;
	protected readonly disposables = new DisposableStore();

	get onDidScroll(): Event<ScrollEvent> { return this.view.onDidScroll; }

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return this.eventBufferer.wrapEvent(this.focus.onDidChange); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return this.eventBufferer.wrapEvent(this.selection.onDidChange); }

	get onMouseClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return Event.filter(Event.map(this.view.onMouseDblClick, asTreeMouseEvent), e => e.target !== TreeMouseEventTarget.Filter); }
	get onMouseOver(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onMouseOver, asTreeMouseEvent); }
	get onMouseOut(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onMouseOut, asTreeMouseEvent); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return Event.any(Event.filter(Event.map(this.view.onContextMenu, asTreeContextMenuEvent), e => !e.isStickyScroll), this.stickyScrollController?.onContextMenu ?? Event.None); }
	get onTap(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onTap, asTreeMouseEvent); }
	get onPointer(): Event<ITreeMouseEvent<T>> { return Event.map(this.view.onPointer, asTreeMouseEvent); }

	get onKeyDown(): Event<KeyboardEvent> { return this.view.onKeyDown; }
	get onKeyUp(): Event<KeyboardEvent> { return this.view.onKeyUp; }
	get onKeyPress(): Event<KeyboardEvent> { return this.view.onKeyPress; }

	get onDidFocus(): Event<void> { return this.view.onDidFocus; }
	get onDidBlur(): Event<void> { return this.view.onDidBlur; }

	private readonly onDidSwapModel = this.disposables.add(new Emitter<void>());
	private readonly onDidChangeModelRelay = this.disposables.add(new Relay<void>());
	private readonly onDidSpliceModelRelay = this.disposables.add(new Relay<ITreeModelSpliceEvent<T, TFilterData>>());
	private readonly onDidChangeCollapseStateRelay = this.disposables.add(new Relay<ICollapseStateChangeEvent<T, TFilterData>>());
	private readonly onDidChangeRenderNodeCountRelay = this.disposables.add(new Relay<ITreeNode<T, TFilterData>>());
	private readonly onDidChangeActiveNodesRelay = this.disposables.add(new Relay<ITreeNode<T, TFilterData>[]>());

	get onDidChangeModel(): Event<void> { return Event.any(this.onDidChangeModelRelay.event, this.onDidSwapModel.event); }
	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T, TFilterData>> { return this.onDidChangeCollapseStateRelay.event; }
	get onDidChangeRenderNodeCount(): Event<ITreeNode<T, TFilterData>> { return this.onDidChangeRenderNodeCountRelay.event; }

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
		if (_options.keyboardNavigationLabelProvider && (_options.findWidgetEnabled ?? true)) {
			this.findFilter = new FindFilter(_options.keyboardNavigationLabelProvider, _options.filter as ITreeFilter<T, FuzzyScore>, _options.defaultFindVisibility);
			_options = { ..._options, filter: this.findFilter as ITreeFilter<T, TFilterData> }; // TODO need typescript help here
			this.disposables.add(this.findFilter);
		}

		this.model = this.createModel(_user, _options);
		this.treeDelegate = new ComposedTreeDelegate<T, ITreeNode<T, TFilterData>>(delegate);

		const activeNodes = this.disposables.add(new EventCollection(this.onDidChangeActiveNodesRelay.event));
		const renderedIndentGuides = new SetMap<ITreeNode<T, TFilterData>, HTMLDivElement>();
		this.renderers = renderers.map(r => new TreeRenderer<T, TFilterData, TRef, any>(r, this.model, this.onDidChangeCollapseStateRelay.event, activeNodes, renderedIndentGuides, _options));
		for (const r of this.renderers) {
			this.disposables.add(r);
		}

		this.focus = new Trait(() => this.view.getFocusedElements()[0], _options.identityProvider);
		this.selection = new Trait(() => this.view.getSelectedElements()[0], _options.identityProvider);
		this.anchor = new Trait(() => this.view.getAnchorElement(), _options.identityProvider);
		this.view = new TreeNodeList(_user, container, this.treeDelegate, this.renderers, this.focus, this.selection, this.anchor, { ...asListOptions(() => this.model, this.disposables, _options), tree: this, stickyScrollProvider: () => this.stickyScrollController });

		this.setupModel(this.model); // model needs to be setup after the traits have been created

		if (_options.keyboardSupport !== false) {
			const onKeyDown = Event.chain(this.view.onKeyDown, $ =>
				$.filter(e => !isEditableElement(e.target as HTMLElement))
					.map(e => new StandardKeyboardEvent(e))
			);

			Event.chain(onKeyDown, $ => $.filter(e => e.keyCode === KeyCode.LeftArrow))(this.onLeftArrow, this, this.disposables);
			Event.chain(onKeyDown, $ => $.filter(e => e.keyCode === KeyCode.RightArrow))(this.onRightArrow, this, this.disposables);
			Event.chain(onKeyDown, $ => $.filter(e => e.keyCode === KeyCode.Space))(this.onSpace, this, this.disposables);
		}

		if ((_options.findWidgetEnabled ?? true) && _options.keyboardNavigationLabelProvider && _options.contextViewProvider) {
			const findOptions: IFindControllerOptions = {
				styles: _options.findWidgetStyles,
				defaultFindMode: _options.defaultFindMode,
				defaultFindMatchType: _options.defaultFindMatchType,
				showNotFoundMessage: _options.showNotFoundMessage,
			};
			this.findController = this.disposables.add(new FindController(this, this.findFilter!, _options.contextViewProvider, findOptions));
			this.focusNavigationFilter = node => this.findController!.shouldAllowFocus(node);
			this.onDidChangeFindOpenState = this.findController.onDidChangeOpenState;
			this.onDidChangeFindMode = this.findController.onDidChangeMode;
			this.onDidChangeFindMatchType = this.findController.onDidChangeMatchType;
		} else {
			this.onDidChangeFindMode = Event.None;
			this.onDidChangeFindMatchType = Event.None;
		}

		if (_options.enableStickyScroll) {
			this.stickyScrollController = new StickyScrollController(this, this.model, this.view, this.renderers, this.treeDelegate, _options);
			this.onDidChangeStickyScrollFocused = this.stickyScrollController.onDidChangeHasFocus;
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
		this.updateStickyScroll(optionsUpdate);

		this._onDidUpdateOptions.fire(this._options);

		this.getHTMLElement().classList.toggle('always', this._options.renderIndentGuides === RenderIndentGuides.Always);
	}

	get options(): IAbstractTreeOptions<T, TFilterData> {
		return this._options;
	}

	private updateStickyScroll(optionsUpdate: IAbstractTreeOptionsUpdate) {
		if (!this.stickyScrollController && this._options.enableStickyScroll) {
			this.stickyScrollController = new StickyScrollController(this, this.model, this.view, this.renderers, this.treeDelegate, this._options);
			this.onDidChangeStickyScrollFocused = this.stickyScrollController.onDidChangeHasFocus;
		} else if (this.stickyScrollController && !this._options.enableStickyScroll) {
			this.onDidChangeStickyScrollFocused = Event.None;
			this.stickyScrollController.dispose();
			this.stickyScrollController = undefined;
		}
		this.stickyScrollController?.updateOptions(optionsUpdate);
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
		let index = this.view.firstVisibleIndex;

		if (this.stickyScrollController) {
			index += this.stickyScrollController.count;
		}

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
		if (this.stickyScrollController?.focusedLast()) {
			this.stickyScrollController.domFocus();
		} else {
			this.view.domFocus();
		}
	}

	isDOMFocused(): boolean {
		return isActiveElement(this.getHTMLElement());
	}

	layout(height?: number, width?: number): void {
		this.view.layout(height, width);
	}

	style(styles: IListStyles): void {
		const suffix = `.${this.view.domId}`;
		const content: string[] = [];

		if (styles.treeIndentGuidesStroke) {
			content.push(`.monaco-list${suffix}:hover .monaco-tl-indent > .indent-guide, .monaco-list${suffix}.always .monaco-tl-indent > .indent-guide  { border-color: ${styles.treeInactiveIndentGuidesStroke}; }`);
			content.push(`.monaco-list${suffix} .monaco-tl-indent > .indent-guide.active { border-color: ${styles.treeIndentGuidesStroke}; }`);
		}

		// Sticky Scroll Background
		const stickyScrollBackground = styles.treeStickyScrollBackground ?? styles.listBackground;
		if (stickyScrollBackground) {
			content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container { background-color: ${stickyScrollBackground}; }`);
			content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container .monaco-tree-sticky-row { background-color: ${stickyScrollBackground}; }`);
		}

		// Sticky Scroll Border
		if (styles.treeStickyScrollBorder) {
			content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container { border-bottom: 1px solid ${styles.treeStickyScrollBorder}; }`);
		}

		// Sticky Scroll Shadow
		if (styles.treeStickyScrollShadow) {
			content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container .monaco-tree-sticky-container-shadow { box-shadow: ${styles.treeStickyScrollShadow} 0 6px 6px -6px inset; height: 3px; }`);
		}

		// Sticky Scroll Focus
		if (styles.listFocusForeground) {
			content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
			content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused { color: inherit; }`);
		}

		// Sticky Scroll Focus Outlines
		const focusAndSelectionOutline = asCssValueWithDefault(styles.listFocusAndSelectionOutline, asCssValueWithDefault(styles.listSelectionOutline, styles.listFocusOutline ?? ''));
		if (focusAndSelectionOutline) { // default: listFocusOutline
			content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused.selected { outline: 1px solid ${focusAndSelectionOutline}; outline-offset: -1px;}`);
			content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused.selected { outline: inherit;}`);
		}

		if (styles.listFocusOutline) { // default: set
			content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }`);
			content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused { outline: inherit; }`);

			content.push(`.monaco-workbench.context-menu-visible .monaco-list${suffix}.last-focused.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.passive-focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }`);

			content.push(`.monaco-workbench.context-menu-visible .monaco-list${suffix}.last-focused.sticky-scroll-focused .monaco-list-rows .monaco-list-row.focused { outline: inherit; }`);
			content.push(`.monaco-workbench.context-menu-visible .monaco-list${suffix}.last-focused:not(.sticky-scroll-focused) .monaco-tree-sticky-container .monaco-list-rows .monaco-list-row.focused { outline: inherit; }`);
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

	expandTo(location: TRef): void {
		this.model.expandTo(location);
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

		this.eventBufferer.bufferEvents(() => {
			const node = this.model.getNode(element);
			this.anchor.set([node]);

			const index = this.model.getListIndex(element);

			if (index > -1) {
				this.view.setAnchor(index, true);
			}
		});
	}

	getAnchor(): T | undefined {
		return this.anchor.get().at(0);
	}

	setSelection(elements: TRef[], browserEvent?: UIEvent): void {
		this.eventBufferer.bufferEvents(() => {
			const nodes = elements.map(e => this.model.getNode(e));
			this.selection.set(nodes, browserEvent);

			const indexes = elements.map(e => this.model.getListIndex(e)).filter(i => i > -1);
			this.view.setSelection(indexes, browserEvent, true);
		});
	}

	getSelection(): T[] {
		return this.selection.get();
	}

	setFocus(elements: TRef[], browserEvent?: UIEvent): void {
		this.eventBufferer.bufferEvents(() => {
			const nodes = elements.map(e => this.model.getNode(e));
			this.focus.set(nodes, browserEvent);

			const indexes = elements.map(e => this.model.getListIndex(e)).filter(i => i > -1);
			this.view.setFocus(indexes, browserEvent, true);
		});
	}

	focusNext(n = 1, loop = false, browserEvent?: UIEvent, filter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined = (isKeyboardEvent(browserEvent) && browserEvent.altKey) ? undefined : this.focusNavigationFilter): void {
		this.view.focusNext(n, loop, browserEvent, filter);
	}

	focusPrevious(n = 1, loop = false, browserEvent?: UIEvent, filter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined = (isKeyboardEvent(browserEvent) && browserEvent.altKey) ? undefined : this.focusNavigationFilter): void {
		this.view.focusPrevious(n, loop, browserEvent, filter);
	}

	focusNextPage(browserEvent?: UIEvent, filter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined = (isKeyboardEvent(browserEvent) && browserEvent.altKey) ? undefined : this.focusNavigationFilter): Promise<void> {
		return this.view.focusNextPage(browserEvent, filter);
	}

	focusPreviousPage(browserEvent?: UIEvent, filter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined = (isKeyboardEvent(browserEvent) && browserEvent.altKey) ? undefined : this.focusNavigationFilter): Promise<void> {
		return this.view.focusPreviousPage(browserEvent, filter, () => this.stickyScrollController?.height ?? 0);
	}

	focusLast(browserEvent?: UIEvent, filter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined = (isKeyboardEvent(browserEvent) && browserEvent.altKey) ? undefined : this.focusNavigationFilter): void {
		this.view.focusLast(browserEvent, filter);
	}

	focusFirst(browserEvent?: UIEvent, filter: ((node: ITreeNode<T, TFilterData>) => boolean) | undefined = (isKeyboardEvent(browserEvent) && browserEvent.altKey) ? undefined : this.focusNavigationFilter): void {
		this.view.focusFirst(browserEvent, filter);
	}

	getFocus(): T[] {
		return this.focus.get();
	}

	getStickyScrollFocus(): T[] {
		const focus = this.stickyScrollController?.getFocus();
		return focus !== undefined ? [focus] : [];
	}

	getFocusedPart(): AbstractTreePart {
		return this.stickyScrollController?.focusedLast() ? AbstractTreePart.StickyScroll : AbstractTreePart.Tree;
	}

	reveal(location: TRef, relativeTop?: number): void {
		this.model.expandTo(location);

		const index = this.model.getListIndex(location);

		if (index === -1) {
			return;
		}

		if (!this.stickyScrollController) {
			this.view.reveal(index, relativeTop);
		} else {
			const paddingTop = this.stickyScrollController.nodePositionTopBelowWidget(this.getNode(location));
			this.view.reveal(index, relativeTop, paddingTop);
		}
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

		const stickyScrollNode = this.stickyScrollController?.getNode(this.getNode(location));
		return this.view.getRelativeTop(index, stickyScrollNode?.position ?? this.stickyScrollController?.height);
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
				state.expanded[getId(node.element)] = node.collapsed ? 0 : 1;
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

	protected abstract createModel(user: string, options: IAbstractTreeOptions<T, TFilterData>): ITreeModel<T, TFilterData, TRef>;

	private readonly modelDisposables = new DisposableStore();
	private setupModel(model: ITreeModel<T, TFilterData, TRef>) {
		this.modelDisposables.clear();

		this.modelDisposables.add(model.onDidSpliceRenderedNodes(({ start, deleteCount, elements }) => this.view.splice(start, deleteCount, elements)));

		const onDidModelSplice = Event.forEach(model.onDidSpliceModel, e => {
			this.eventBufferer.bufferEvents(() => {
				this.focus.onDidModelSplice(e);
				this.selection.onDidModelSplice(e);
			});
		}, this.modelDisposables);

		// Make sure the `forEach` always runs
		onDidModelSplice(() => null, null, this.modelDisposables);

		// Active nodes can change when the model changes or when focus or selection change.
		// We debounce it with 0 delay since these events may fire in the same stack and we only
		// want to run this once. It also doesn't matter if it runs on the next tick since it's only
		// a nice to have UI feature.
		const activeNodesEmitter = this.modelDisposables.add(new Emitter<ITreeNode<T, TFilterData>[]>());
		const activeNodesDebounce = this.modelDisposables.add(new Delayer(0));
		this.modelDisposables.add(Event.any<any>(onDidModelSplice, this.focus.onDidChange, this.selection.onDidChange)(() => {
			activeNodesDebounce.trigger(() => {
				const set = new Set<ITreeNode<T, TFilterData>>();

				for (const node of this.focus.getNodes()) {
					set.add(node);
				}

				for (const node of this.selection.getNodes()) {
					set.add(node);
				}

				activeNodesEmitter.fire([...set.values()]);
			});
		}));

		this.onDidChangeActiveNodesRelay.input = activeNodesEmitter.event;
		this.onDidChangeModelRelay.input = Event.signal(model.onDidSpliceModel);
		this.onDidChangeCollapseStateRelay.input = model.onDidChangeCollapseState;
		this.onDidChangeRenderNodeCountRelay.input = model.onDidChangeRenderNodeCount;
		this.onDidSpliceModelRelay.input = model.onDidSpliceModel;
	}

	navigate(start?: TRef): ITreeNavigator<T> {
		return new TreeNavigator(this.view, this.model, start);
	}

	dispose(): void {
		dispose(this.disposables);
		this.stickyScrollController?.dispose();
		this.view.dispose();
		this.modelDisposables.dispose();
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
