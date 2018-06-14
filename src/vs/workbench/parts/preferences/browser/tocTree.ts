/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { SettingsTreeElement, SettingsTreeGroupElement } from 'vs/workbench/parts/preferences/browser/settingsTree';

const $ = DOM.$;

export class TOCDataSource implements IDataSource {
	getId(tree: ITree, element: SettingsTreeGroupElement): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: SettingsTreeElement): boolean {
		return element instanceof SettingsTreeGroupElement && element.children && element.children.every(child => child instanceof SettingsTreeGroupElement);
	}

	getChildren(tree: ITree, element: SettingsTreeGroupElement): TPromise<SettingsTreeElement[], any> {
		return TPromise.as(<SettingsTreeElement[]>element.children);
	}

	getParent(tree: ITree, element: SettingsTreeElement): TPromise<any, any> {
		return TPromise.wrap(element.parent);
	}

	shouldAutoexpand() {
		return true;
	}
}

const TOC_ENTRY_TEMPLATE_ID = 'settings.toc.entry';

interface ITOCEntryTemplate {
	element: HTMLElement;
}

export class TOCRenderer implements IRenderer {
	getHeight(tree: ITree, element: SettingsTreeElement): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: SettingsTreeElement): string {
		return TOC_ENTRY_TEMPLATE_ID;
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITOCEntryTemplate {
		return {
			element: DOM.append(container, $('.settings-toc-entry'))
		};
	}

	renderElement(tree: ITree, element: SettingsTreeGroupElement, templateId: string, template: ITOCEntryTemplate): void {
		template.element.textContent = element.label;
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
	}
}
