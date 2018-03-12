/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./tree';
import WinJS = require('vs/base/common/winjs.base');
import TreeDefaults = require('vs/base/parts/tree/browser/treeDefaults');
import Model = require('vs/base/parts/tree/browser/treeModel');
import View = require('./treeView');
import _ = require('vs/base/parts/tree/browser/tree');
import { INavigator, MappedNavigator } from 'vs/base/common/iterator';
import Event, { Emitter, Relay } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';
import { mixin } from 'vs/base/common/objects';
import { ISelectionEvent, IFocusEvent, IHighlightEvent } from 'vs/base/parts/tree/browser/tree';
import { IItemCollapseEvent, IItemExpandEvent } from 'vs/base/parts/tree/browser/treeModel';

export class TreeContext implements _.ITreeContext {

	public tree: _.ITree;
	public configuration: _.ITreeConfiguration;
	public options: _.ITreeOptions;

	public dataSource: _.IDataSource;
	public renderer: _.IRenderer;
	public controller: _.IController;
	public dnd: _.IDragAndDrop;
	public filter: _.IFilter;
	public sorter: _.ISorter;
	public accessibilityProvider: _.IAccessibilityProvider;
	public styler: _.ITreeStyler;

	constructor(tree: _.ITree, configuration: _.ITreeConfiguration, options: _.ITreeOptions = {}) {
		this.tree = tree;
		this.configuration = configuration;
		this.options = options;

		if (!configuration.dataSource) {
			throw new Error('You must provide a Data Source to the tree.');
		}

		this.dataSource = configuration.dataSource;
		this.renderer = configuration.renderer;
		this.controller = configuration.controller || new TreeDefaults.DefaultController({ clickBehavior: TreeDefaults.ClickBehavior.ON_MOUSE_UP, keyboardSupport: typeof options.keyboardSupport !== 'boolean' || options.keyboardSupport });
		this.dnd = configuration.dnd || new TreeDefaults.DefaultDragAndDrop();
		this.filter = configuration.filter || new TreeDefaults.DefaultFilter();
		this.sorter = configuration.sorter || null;
		this.accessibilityProvider = configuration.accessibilityProvider || new TreeDefaults.DefaultAccessibilityProvider();
		this.styler = configuration.styler || null;
	}
}

const defaultStyles: _.ITreeStyles = {
	listFocusBackground: Color.fromHex('#073655'),
	listActiveSelectionBackground: Color.fromHex('#0E639C'),
	listActiveSelectionForeground: Color.fromHex('#FFFFFF'),
	listFocusAndSelectionBackground: Color.fromHex('#094771'),
	listFocusAndSelectionForeground: Color.fromHex('#FFFFFF'),
	listInactiveSelectionBackground: Color.fromHex('#3F3F46'),
	listHoverBackground: Color.fromHex('#2A2D2E'),
	listDropBackground: Color.fromHex('#383B3D')
};

export class Tree implements _.ITree {

	private container: HTMLElement;

	private context: _.ITreeContext;
	private model: Model.TreeModel;
	private view: View.TreeView;

	private _onDidChangeFocus = new Relay<IFocusEvent>();
	readonly onDidChangeFocus: Event<IFocusEvent> = this._onDidChangeFocus.event;
	private _onDidChangeSelection = new Relay<ISelectionEvent>();
	readonly onDidChangeSelection: Event<ISelectionEvent> = this._onDidChangeSelection.event;
	private _onHighlightChange = new Relay<IHighlightEvent>();
	readonly onDidChangeHighlight: Event<IHighlightEvent> = this._onHighlightChange.event;
	private _onDidExpandItem = new Relay<IItemExpandEvent>();
	readonly onDidExpandItem: Event<IItemExpandEvent> = this._onDidExpandItem.event;
	private _onDidCollapseItem = new Relay<IItemCollapseEvent>();
	readonly onDidCollapseItem: Event<IItemCollapseEvent> = this._onDidCollapseItem.event;
	private _onDispose = new Emitter<void>();
	readonly onDidDispose: Event<void> = this._onDispose.event;

	constructor(container: HTMLElement, configuration: _.ITreeConfiguration, options: _.ITreeOptions = {}) {
		this.container = container;
		mixin(options, defaultStyles, false);

		options.twistiePixels = typeof options.twistiePixels === 'number' ? options.twistiePixels : 32;
		options.showTwistie = options.showTwistie === false ? false : true;
		options.indentPixels = typeof options.indentPixels === 'number' ? options.indentPixels : 12;
		options.alwaysFocused = options.alwaysFocused === true ? true : false;
		options.useShadows = options.useShadows === false ? false : true;
		options.paddingOnRow = options.paddingOnRow === false ? false : true;

		this.context = new TreeContext(this, configuration, options);
		this.model = new Model.TreeModel(this.context);
		this.view = new View.TreeView(this.context, this.container);

		this.view.setModel(this.model);

		this._onDidChangeFocus.input = this.model.onDidFocus;
		this._onDidChangeSelection.input = this.model.onDidSelect;
		this._onHighlightChange.input = this.model.onDidHighlight;
		this._onDidExpandItem.input = this.model.onDidExpandItem;
		this._onDidCollapseItem.input = this.model.onDidCollapseItem;
	}

	public style(styles: _.ITreeStyles): void {
		this.view.applyStyles(styles);
	}

	get onDidFocus(): Event<void> {
		return this.view && this.view.onDOMFocus;
	}

	get onDidBlur(): Event<void> {
		return this.view && this.view.onDOMBlur;
	}

	public getHTMLElement(): HTMLElement {
		return this.view.getHTMLElement();
	}

	public layout(height?: number): void {
		this.view.layout(height);
	}

	public domFocus(): void {
		this.view.focus();
	}

	public isDOMFocused(): boolean {
		return this.view.isFocused();
	}

	public domBlur(): void {
		this.view.blur();
	}

	public onVisible(): void {
		this.view.onVisible();
	}

	public onHidden(): void {
		this.view.onHidden();
	}

	public setInput(element: any): WinJS.Promise {
		return this.model.setInput(element);
	}

	public getInput(): any {
		return this.model.getInput();
	}

	public refresh(element: any = null, recursive = true): WinJS.Promise {
		return this.model.refresh(element, recursive);
	}

	public updateWidth(element: any): void {
		let item = this.model.getItem(element);
		return this.view.updateWidth(item);
	}

	public expand(element: any): WinJS.Promise {
		return this.model.expand(element);
	}

	public expandAll(elements: any[]): WinJS.Promise {
		return this.model.expandAll(elements);
	}

	public collapse(element: any, recursive: boolean = false): WinJS.Promise {
		return this.model.collapse(element, recursive);
	}

	public collapseAll(elements: any[] = null, recursive: boolean = false): WinJS.Promise {
		return this.model.collapseAll(elements, recursive);
	}

	public collapseDeepestExpandedLevel(): WinJS.Promise {
		return this.model.collapseDeepestExpandedLevel();
	}

	public toggleExpansion(element: any, recursive: boolean = false): WinJS.Promise {
		return this.model.toggleExpansion(element, recursive);
	}

	public toggleExpansionAll(elements: any[]): WinJS.Promise {
		return this.model.toggleExpansionAll(elements);
	}

	public isExpanded(element: any): boolean {
		return this.model.isExpanded(element);
	}

	public getExpandedElements(): any[] {
		return this.model.getExpandedElements();
	}

	public reveal(element: any, relativeTop: number = null): WinJS.Promise {
		return this.model.reveal(element, relativeTop);
	}

	public getRelativeTop(element: any): number {
		let item = this.model.getItem(element);
		return this.view.getRelativeTop(item);
	}

	public getScrollPosition(): number {
		return this.view.getScrollPosition();
	}

	public setScrollPosition(pos: number): void {
		this.view.setScrollPosition(pos);
	}

	getContentHeight(): number {
		return this.view.getContentHeight();
	}

	public setHighlight(element?: any, eventPayload?: any): void {
		this.model.setHighlight(element, eventPayload);
	}

	public getHighlight(): any {
		return this.model.getHighlight();
	}

	public isHighlighted(element: any): boolean {
		return this.model.isFocused(element);
	}

	public clearHighlight(eventPayload?: any): void {
		this.model.setHighlight(null, eventPayload);
	}

	public select(element: any, eventPayload?: any): void {
		this.model.select(element, eventPayload);
	}

	public selectRange(fromElement: any, toElement: any, eventPayload?: any): void {
		this.model.selectRange(fromElement, toElement, eventPayload);
	}

	public deselectRange(fromElement: any, toElement: any, eventPayload?: any): void {
		this.model.deselectRange(fromElement, toElement, eventPayload);
	}

	public selectAll(elements: any[], eventPayload?: any): void {
		this.model.selectAll(elements, eventPayload);
	}

	public deselect(element: any, eventPayload?: any): void {
		this.model.deselect(element, eventPayload);
	}

	public deselectAll(elements: any[], eventPayload?: any): void {
		this.model.deselectAll(elements, eventPayload);
	}

	public setSelection(elements: any[], eventPayload?: any): void {
		this.model.setSelection(elements, eventPayload);
	}

	public toggleSelection(element: any, eventPayload?: any): void {
		this.model.toggleSelection(element, eventPayload);
	}

	public isSelected(element: any): boolean {
		return this.model.isSelected(element);
	}

	public getSelection(): any[] {
		return this.model.getSelection();
	}

	public clearSelection(eventPayload?: any): void {
		this.model.setSelection([], eventPayload);
	}

	public selectNext(count?: number, clearSelection?: boolean, eventPayload?: any): void {
		this.model.selectNext(count, clearSelection, eventPayload);
	}

	public selectPrevious(count?: number, clearSelection?: boolean, eventPayload?: any): void {
		this.model.selectPrevious(count, clearSelection, eventPayload);
	}

	public selectParent(clearSelection?: boolean, eventPayload?: any): void {
		this.model.selectParent(clearSelection, eventPayload);
	}

	public setFocus(element?: any, eventPayload?: any): void {
		this.model.setFocus(element, eventPayload);
	}

	public isFocused(element: any): boolean {
		return this.model.isFocused(element);
	}

	public getFocus(): any {
		return this.model.getFocus();
	}

	public focusNext(count?: number, eventPayload?: any): void {
		this.model.focusNext(count, eventPayload);
	}

	public focusPrevious(count?: number, eventPayload?: any): void {
		this.model.focusPrevious(count, eventPayload);
	}

	public focusParent(eventPayload?: any): void {
		this.model.focusParent(eventPayload);
	}

	public focusFirstChild(eventPayload?: any): void {
		this.model.focusFirstChild(eventPayload);
	}

	public focusFirst(eventPayload?: any, from?: any): void {
		this.model.focusFirst(eventPayload, from);
	}

	public focusNth(index: number, eventPayload?: any): void {
		this.model.focusNth(index, eventPayload);
	}

	public focusLast(eventPayload?: any, from?: any): void {
		this.model.focusLast(eventPayload, from);
	}

	public focusNextPage(eventPayload?: any): void {
		this.view.focusNextPage(eventPayload);
	}

	public focusPreviousPage(eventPayload?: any): void {
		this.view.focusPreviousPage(eventPayload);
	}

	public clearFocus(eventPayload?: any): void {
		this.model.setFocus(null, eventPayload);
	}

	public addTraits(trait: string, elements: any[]): void {
		this.model.addTraits(trait, elements);
	}

	public removeTraits(trait: string, elements: any[]): void {
		this.model.removeTraits(trait, elements);
	}

	public toggleTrait(trait: string, element: any): void {
		this.model.hasTrait(trait, element) ? this.model.removeTraits(trait, [element])
			: this.model.addTraits(trait, [element]);
	}

	public hasTrait(trait: string, element: any): boolean {
		return this.model.hasTrait(trait, element);
	}

	getNavigator(fromElement?: any, subTreeOnly?: boolean): INavigator<any> {
		return new MappedNavigator(this.model.getNavigator(fromElement, subTreeOnly), i => i && i.getElement());
	}

	public dispose(): void {
		this._onDispose.fire();

		if (this.model !== null) {
			this.model.dispose();
			this.model = null;
		}
		if (this.view !== null) {
			this.view.dispose();
			this.view = null;
		}

		this._onDidChangeFocus.dispose();
		this._onDidChangeSelection.dispose();
		this._onHighlightChange.dispose();
		this._onDidExpandItem.dispose();
		this._onDidCollapseItem.dispose();
		this._onDispose.dispose();
	}
}
