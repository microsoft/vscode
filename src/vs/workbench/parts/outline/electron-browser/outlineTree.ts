/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { onUnexpectedError } from 'vs/base/common/errors';
import { values } from 'vs/base/common/map';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IFilter, IRenderer, ISorter, ITree } from 'vs/base/parts/tree/browser/tree';
import { DefaultController, ICancelableEvent } from 'vs/base/parts/tree/browser/treeDefaults';
import 'vs/css!./media/symbol-icons';
import { Range } from 'vs/editor/common/core/range';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel';
import { createMatches } from '../../../../base/common/filters';
import { OutlineItem, OutlineModel } from './outlineModel';

export enum OutlineItemCompareType {
	ByPosition,
	ByName,
	ByKind
}

export class OutlineItemComparator implements ISorter {

	type: OutlineItemCompareType = OutlineItemCompareType.ByPosition;

	compare(tree: ITree, a: OutlineItem, b: OutlineItem): number {
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

	isVisible(tree: ITree, element: OutlineItem): boolean {
		return Boolean(element.matches);
	}
}

export class OutlineDataSource implements IDataSource {

	getId(tree: ITree, element: OutlineItem | any): string {
		if (element instanceof OutlineItem) {
			return element.id;
		} else {
			return 'root';
		}
	}

	hasChildren(tree: ITree, element: OutlineModel | OutlineItem): boolean {
		if (element instanceof OutlineModel) {
			return element.all().length > 0;
		} else {
			if (element.children.size === 0) {
				return false;
			} else {
				let res: boolean;
				element.children.forEach(child => res = res || Boolean(child.matches));
				return res;
			}
		}
	}

	async getChildren(tree: ITree, element: OutlineModel | OutlineItem): TPromise<OutlineItem[]> {
		if (element instanceof OutlineModel) {
			return (await element.selected()).children;
		} else {
			return values(element.children);
		}
	}

	async getParent(tree: ITree, element: OutlineItem | any): TPromise<OutlineItem> {
		return element instanceof OutlineItem ? element.parent : undefined;
	}

	shouldAutoexpand(tree: ITree, element: OutlineItem): boolean {
		return !Boolean(element.parent);
	}
}

export interface OutlineItemTemplate {
	icon: HTMLSpanElement;
	label: HighlightedLabel;
}

export class OutlineRenderer implements IRenderer {

	getHeight(tree: ITree, element: OutlineItem): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: OutlineItem): string {
		return 'outline.element';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): OutlineItemTemplate {
		const icon = dom.$('.outline-element-icon symbol-icon');
		const labelContainer = dom.$('.outline-element-label');
		dom.addClass(container, 'outline-element');
		dom.append(container, icon, labelContainer);
		return { icon, label: new HighlightedLabel(labelContainer) };
	}

	renderElement(tree: ITree, element: OutlineItem, templateId: string, template: OutlineItemTemplate): void {
		template.icon.className = `outline-element-icon symbol-icon ${symbolKindToCssClass(element.symbol.kind)}`;
		template.label.set(element.symbol.name, element.matches ? createMatches(element.matches[1]) : []);
	}

	disposeTemplate(tree: ITree, templateId: string, template: OutlineItemTemplate): void {
		template.label.dispose();
	}
}

export class OutlineTreeState {

	readonly expanded: string[];

	static capture(tree: ITree): OutlineTreeState {
		let expanded = new Array<string>();
		let nav = tree.getNavigator();
		while (nav.next()) {
			let element = nav.current();
			if (element instanceof OutlineItem) {
				if (tree.isExpanded(element)) {
					expanded.push(element.id);
				}
			}
		}
		return { expanded };
	}

	static async restore(tree: ITree, state: OutlineTreeState): TPromise<void> {
		let model = <OutlineModel>tree.getInput();
		if (!state || !(model instanceof OutlineModel)) {
			return TPromise.as(undefined);
		}
		let group = await model.selected();
		let items: OutlineItem[] = [];
		for (const id of state.expanded) {
			let item = group.getItemById(id);
			if (item) {
				items.push(item);
			}
		}
		await tree.collapseAll(undefined);
		await tree.expandAll(items);
	}
}

export class OutlineController extends DefaultController {

	protected onLeftClick(tree: ITree, element: any, eventish: ICancelableEvent, origin: string = 'mouse'): boolean {
		let undoExpansion = !this.isClickOnTwistie(<IMouseEvent>eventish);
		let result = super.onLeftClick(tree, element, eventish, origin);
		if (undoExpansion) {
			tree.toggleExpansion(element, false).then(undefined, onUnexpectedError);
		}
		return result;
	}
}
