/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { IDataSource, ITree, IRenderer } from 'vs/base/parts/tree/browser/tree';
import { DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { IExtensionDependencies } from './extensions';
import { once } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';

interface IExtensionTemplateData {
	icon: HTMLImageElement;
	name: HTMLElement;
	identifier: HTMLElement;
	author: HTMLElement;
	extensionDisposables: IDisposable[];
}

export class DataSource implements IDataSource {

	public getId(tree: ITree, element: IExtensionDependencies): string {
		let id = `${element.extension.publisher}.${element.extension.name}`;
		this.getParent(tree, element).then(parent => {
			id = parent ? this.getId(tree, parent) + '/' + id : id;
		});
		return id;
	}

	public hasChildren(tree: ITree, element: IExtensionDependencies): boolean {
		return element.hasDependencies;
	}

	public getChildren(tree: ITree, element: IExtensionDependencies): Promise {
		return TPromise.as(element.dependencies);
	}

	public getParent(tree: ITree, element: IExtensionDependencies): Promise {
		return TPromise.as(element.dependent);
	}
}

export class Renderer implements IRenderer {

	private static EXTENSION_TEMPLATE_ID = 'extension-template';

	public getHeight(tree: ITree, element: IExtensionDependencies): number {
		return 62;
	}

	public getTemplateId(tree: ITree, element: IExtensionDependencies): string {
		return Renderer.EXTENSION_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		dom.addClass(container, 'dependency');

		var data: IExtensionTemplateData = Object.create(null);
		data.icon = dom.append(container, dom.$<HTMLImageElement>('img.icon'));
		const details = dom.append(container, dom.$('.details'));

		const header = dom.append(details, dom.$('.header'));
		data.name = dom.append(header, dom.$('span.name'));
		data.identifier = dom.append(header, dom.$('span.identifier'));

		const footer = dom.append(details, dom.$('.footer'));
		data.author = dom.append(footer, dom.$('.author'));
		return data;
	}


	public renderElement(tree: ITree, element: IExtensionDependencies, templateId: string, templateData: any): void {
		const extension = element.extension;
		const data = <IExtensionTemplateData>templateData;

		const onError = once(domEvent(data.icon, 'error'));
		onError(() => data.icon.src = extension.iconUrlFallback, null, data.extensionDisposables);
		data.icon.src = extension.iconUrl;

		if (!data.icon.complete) {
			data.icon.style.visibility = 'hidden';
			data.icon.onload = () => data.icon.style.visibility = 'inherit';
		} else {
			data.icon.style.visibility = 'inherit';
		}

		data.name.textContent = extension.displayName;
		data.identifier.textContent = `${extension.publisher}.${extension.name}`;
		data.author.textContent = extension.publisherDisplayName;
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		(<IExtensionTemplateData>templateData).extensionDisposables = dispose((<IExtensionTemplateData>templateData).extensionDisposables);
	}
}

export class Controller extends DefaultController {

	protected onLeftClick(tree: ITree, element: IExtensionDependencies, event: IMouseEvent): boolean {
		let currentFoucssed = tree.getFocus();
		if (super.onLeftClick(tree, element, event)) {
			if (element.dependent === null) {
				if (currentFoucssed) {
					tree.setFocus(currentFoucssed);
				} else {
					tree.focusFirst();
				}
				return true;
			}
		}
		return false;
	}
}