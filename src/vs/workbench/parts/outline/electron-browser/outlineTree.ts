/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { onUnexpectedError } from 'vs/base/common/errors';
import { values } from 'vs/base/common/collections';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IFilter, IRenderer, ISorter, ITree } from 'vs/base/parts/tree/browser/tree';
import { DefaultController, ICancelableEvent } from 'vs/base/parts/tree/browser/treeDefaults';
import 'vs/css!./media/symbol-icons';
import { Range } from 'vs/editor/common/core/range';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel';
import { createMatches } from '../../../../base/common/filters';
import { OutlineElement, OutlineGroup, OutlineModel, TreeElement } from './outlineModel';

export enum OutlineItemCompareType {
	ByPosition,
	ByName,
	ByKind
}

export class OutlineItemComparator implements ISorter {

	constructor(
		public type: OutlineItemCompareType = OutlineItemCompareType.ByPosition
	) { }

	compare(tree: ITree, a: OutlineElement, b: OutlineElement): number {
		switch (this.type) {
			case OutlineItemCompareType.ByKind:
				return a.symbol.kind - b.symbol.kind;
			case OutlineItemCompareType.ByName:
				return a.symbol.name.localeCompare(b.symbol.name);
			case OutlineItemCompareType.ByPosition:
			default:
				return Range.compareRangesUsingStarts(a.symbol.location.range, b.symbol.location.range);
		}
	}
}

export class OutlineItemFilter implements IFilter {

	isVisible(tree: ITree, element: OutlineElement): boolean {
		return !(element instanceof OutlineElement) || Boolean(element.score);
	}
}

export class OutlineDataSource implements IDataSource {

	getId(tree: ITree, element: TreeElement): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: TreeElement): boolean {
		if (element instanceof OutlineModel) {
			return true;
		}
		if (element instanceof OutlineElement && !element.score) {
			return false;
		}
		for (const _ in element.children) {
			return true;
		}
		return false;
	}

	async getChildren(tree: ITree, element: TreeElement): TPromise<TreeElement[]> {
		if (element instanceof OutlineGroup) {

		}
		if (element instanceof OutlineModel) {
			await element.request;
		}
		return values(element.children);
	}

	async getParent(tree: ITree, element: TreeElement | any): TPromise<TreeElement> {
		return element.parent;
	}

	shouldAutoexpand(tree: ITree, element: TreeElement): boolean {
		return element instanceof OutlineModel || element instanceof OutlineGroup || element.parent instanceof OutlineGroup;
	}
}

export interface OutlineGroupTemplate {
	label: HTMLDivElement;
}

export interface OutlineElementTemplate {
	icon: HTMLSpanElement;
	label: HighlightedLabel;
}

export class OutlineRenderer implements IRenderer {

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: OutlineGroup | OutlineElement): string {
		return element instanceof OutlineGroup ? 'outline-group' : 'outline-element';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (templateId === 'outline-element') {
			const icon = dom.$('.outline-element-icon symbol-icon');
			const labelContainer = dom.$('.outline-element-label');
			dom.addClass(container, 'outline-element');
			dom.append(container, icon, labelContainer);
			return { icon, label: new HighlightedLabel(labelContainer) };
		}
		if (templateId === 'outline-group') {
			const label = dom.$('.outline-group');
			dom.append(container, label);
			return { label };
		}
	}

	renderElement(tree: ITree, element: OutlineGroup | OutlineElement, templateId: string, template: any): void {
		if (element instanceof OutlineElement) {
			template.icon.className = `outline-element-icon symbol-icon ${symbolKindToCssClass(element.symbol.kind)}`;
			template.label.set(element.symbol.name, element.score ? createMatches(element.score[1]) : []);
		}
		if (element instanceof OutlineGroup) {
			template.label.innerHTML = element.id;
		}
	}

	disposeTemplate(tree: ITree, templateId: string, template: OutlineElementTemplate | OutlineGroupTemplate): void {
		if (template.label instanceof HighlightedLabel) {
			template.label.dispose();
		}
	}
}

export class OutlineTreeState {

	readonly selected: string;
	readonly focused: string;
	readonly expanded: string[];

	static capture(tree: ITree): OutlineTreeState {
		// selection
		let selected: string;
		let element = tree.getSelection()[0];
		if (element instanceof TreeElement) {
			selected = element.id;
		}

		// focus
		let focused: string;
		element = tree.getFocus(true);
		if (element instanceof TreeElement) {
			focused = element.id;
		}

		// expansion
		let expanded = new Array<string>();
		let nav = tree.getNavigator();
		while (nav.next()) {
			let element = nav.current();
			if (element instanceof TreeElement) {
				if (tree.isExpanded(element)) {
					expanded.push(element.id);
				}
			}
		}
		return { selected, focused, expanded };
	}

	static async restore(tree: ITree, state: OutlineTreeState): TPromise<void> {
		let model = <OutlineModel>tree.getInput();
		if (!state || !(model instanceof OutlineModel)) {
			return TPromise.as(undefined);
		}

		await model.request;

		// expansion
		let items: TreeElement[] = [];
		for (const id of state.expanded) {
			let item = model.getItemById(id);
			if (item) {
				items.push(item);
			}
		}
		await tree.collapseAll(undefined);
		await tree.expandAll(items);

		// selection & focus
		let selected = model.getItemById(state.selected);
		let focused = model.getItemById(state.focused);
		tree.setSelection([selected]);
		tree.setFocus(focused);
	}
}

export class OutlineController extends DefaultController {

	protected onLeftClick(tree: ITree, element: any, eventish: ICancelableEvent, origin: string = 'mouse'): boolean {
		let undoExpansion = element instanceof OutlineElement && !this.isClickOnTwistie(<IMouseEvent>eventish);
		let result = super.onLeftClick(tree, element, eventish, origin);
		if (undoExpansion) {
			tree.toggleExpansion(element, false).then(undefined, onUnexpectedError);
		}
		return result;
	}
}
