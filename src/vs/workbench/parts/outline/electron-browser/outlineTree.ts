/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/outline';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { IDataSource, IRenderer, ITree, ISorter, IFilter } from 'vs/base/parts/tree/browser/tree';
import { OneOutline, OutlineItem } from './outlineModel';

export class OutlineItemComparator implements ISorter {
	compare(tree: ITree, a: OutlineItem, b: OutlineItem): number {
		return Range.compareRangesUsingStarts(a.symbol.location.range, b.symbol.location.range);
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

	hasChildren(tree: ITree, element: OneOutline | OutlineItem): boolean {
		return element.children.length > 0;
	}

	async getChildren(tree: ITree, element: OneOutline | OutlineItem): TPromise<any, any> {
		return element.children;
	}

	async getParent(tree: ITree, element: OneOutline | OutlineItem): TPromise<any, any> {
		return element instanceof OutlineItem ? element.parent : undefined;
	}
}

export class OutlineItemTemplate {

	readonly icon: HTMLSpanElement;
	readonly label: HTMLSpanElement;
	readonly detail: HTMLSpanElement;

	constructor(container: HTMLElement) {
		this.icon = document.createElement('span');
		this.label = document.createElement('span');
		this.detail = document.createElement('span');
		container.appendChild(this.icon);
		container.appendChild(this.label);
		container.appendChild(this.detail);
		dom.addClass(this.icon, 'icon');
		dom.addClass(this.label, 'label');
		dom.addClass(this.detail, 'detail');
		dom.addClass(container, 'outline-item');
	}
}

export class OutlineRenderer implements IRenderer {
	getHeight(tree: ITree, element: any): number {
		return 22;
	}
	getTemplateId(tree: ITree, element: any): string {
		return 'outline.element';
	}
	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		return new OutlineItemTemplate(container);
	}
	renderElement(tree: ITree, element: any, templateId: string, template: OutlineItemTemplate): void {
		template.icon.classList.add(symbolKindToCssClass((<OutlineItem>element).symbol.kind));
		template.label.innerText = (<OutlineItem>element).symbol.name;
	}
	disposeTemplate(tree: ITree, templateId: string, templateData: OutlineItemTemplate): void {
		//todo@joh
	}
}
