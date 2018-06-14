/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { ISetting } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;

export interface ITOCEntry {
	id: string;
	label: string;
	children?: ITOCEntry[];
	settings?: (string | ISetting)[];
}

export class TOCElement {
	id: string;
	label: string;

	parent?: TOCElement;
	children?: TOCElement[];
}

export function getTOCElement(tocRoot: ITOCEntry, parent?: TOCElement): TOCElement {
	const element = new TOCElement();
	element.id = tocRoot.id;
	element.label = tocRoot.label;

	element.parent = parent;
	if (tocRoot.children) {
		element.children = tocRoot.children.map(child => getTOCElement(child, element));
	}

	return element;
}

export class TOCDataSource implements IDataSource {
	getId(tree: ITree, element: TOCElement): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: TOCElement): boolean {
		return !!(element.children && element.children.length);
	}

	getChildren(tree: ITree, element: TOCElement): TPromise<TOCElement[], any> {
		return TPromise.as(<TOCElement[]>element.children);
	}

	getParent(tree: ITree, element: TOCElement): TPromise<any, any> {
		return TPromise.wrap(element.parent);
	}
}

const TOC_ENTRY_TEMPLATE_ID = 'settings.toc.entry';

interface ITOCEntryTemplate {
	element: HTMLElement;
}

export class TOCRenderer implements IRenderer {
	getHeight(tree: ITree, element: TOCElement): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: TOCElement): string {
		return TOC_ENTRY_TEMPLATE_ID;
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITOCEntryTemplate {
		return {
			element: DOM.append(container, $('.settings-toc-entry'))
		};
	}

	renderElement(tree: ITree, element: TOCElement, templateId: string, template: ITOCEntryTemplate): void {
		template.element.textContent = element.label;
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
	}
}
