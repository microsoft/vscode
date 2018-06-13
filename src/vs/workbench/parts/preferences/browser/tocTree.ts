/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { IResolvedTOCEntry, ITOCGroupEntry } from 'vs/workbench/parts/preferences/browser/settingsEditor2';
import { ISetting } from 'vs/workbench/services/preferences/common/preferences';
import { isTOCLeaf } from 'vs/workbench/parts/preferences/browser/settingsTree';

const $ = DOM.$;

// export interface ITOCRoot {
// 	id: string;
// 	children: ITOCEntry[];
// }

export class TOCDataSource implements IDataSource {
	getId(tree: ITree, element: IResolvedTOCEntry): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: IResolvedTOCEntry): boolean {
		return !isTOCLeaf(element) && element.children.length && typeof element.children[0] !== 'string';
	}

	getChildren(tree: ITree, element: ITOCGroupEntry<ISetting>): TPromise<IResolvedTOCEntry[], any> {
		return TPromise.as(<IResolvedTOCEntry[]>element.children);
	}

	getParent(tree: ITree, element: IResolvedTOCEntry): TPromise<any, any> {
		return TPromise.wrap(null); // ??
	}
}

const TOC_ENTRY_TEMPLATE_ID = 'settings.toc.entry';

interface ITOCEntryTemplate {
	element: HTMLElement;
}

export class TOCRenderer implements IRenderer {
	getHeight(tree: ITree, element: IResolvedTOCEntry): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: IResolvedTOCEntry): string {
		return TOC_ENTRY_TEMPLATE_ID;
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITOCEntryTemplate {
		return {
			element: DOM.append(container, $('.settings-toc-entry'))
		};
	}

	renderElement(tree: ITree, element: IResolvedTOCEntry, templateId: string, template: ITOCEntryTemplate): void {
		template.element.textContent = element.label;
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
	}
}
