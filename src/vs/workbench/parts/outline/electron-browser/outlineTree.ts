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
import { IDataSource, IRenderer, ITree, ISorter } from 'vs/base/parts/tree/browser/tree';
import { OneOutline, OutlineItem } from './outlineModel';

export class OutlineSorter implements ISorter {
	compare(tree: ITree, a: any, b: any): number {
		return Range.compareRangesUsingStarts((<OutlineItem>a).symbol.location.range, (<OutlineItem>b).symbol.location.range);
	}
}

export class OutlineDataSource implements IDataSource {

	getId(tree: ITree, element: OneOutline | OutlineItem): string {
		if (element instanceof OneOutline) {
			return element.source;
		} else {
			return element.id;
		}
	}

	hasChildren(tree: ITree, element: OneOutline | OutlineItem): boolean {
		if (element instanceof OneOutline) {
			return element.items.length > 0;
		} else {
			return element.children.length > 0;
		}
	}

	async getChildren(tree: ITree, element: OneOutline | OutlineItem): TPromise<any, any> {
		if (element instanceof OneOutline) {
			return element.items;
		} else {
			return element.children;
		}
	}

	getParent(tree: ITree, element: any): TPromise<any, any> {
		return null;
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
