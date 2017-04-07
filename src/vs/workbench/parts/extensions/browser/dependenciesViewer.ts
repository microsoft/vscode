/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { IDataSource, ITree, IRenderer } from 'vs/base/parts/tree/browser/tree';
import { DefaultController, ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import { Action } from 'vs/base/common/actions';
import { IExtensionDependencies, IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { once } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';

export interface IExtensionTemplateData {
	icon: HTMLImageElement;
	name: HTMLElement;
	identifier: HTMLElement;
	author: HTMLElement;
	extensionDisposables: IDisposable[];
	extensionDependencies: IExtensionDependencies;
}

export interface IUnknownExtensionTemplateData {
	identifier: HTMLElement;
}

export class DataSource implements IDataSource {

	public getId(tree: ITree, element: IExtensionDependencies): string {
		let id = element.identifier;
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
	private static UNKNOWN_EXTENSION_TEMPLATE_ID = 'unknown-extension-template';

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
	}

	public getHeight(tree: ITree, element: IExtensionDependencies): number {
		return 62;
	}

	public getTemplateId(tree: ITree, element: IExtensionDependencies): string {
		return element.extension ? Renderer.EXTENSION_TEMPLATE_ID : Renderer.UNKNOWN_EXTENSION_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (Renderer.EXTENSION_TEMPLATE_ID === templateId) {
			return this.renderExtensionTemplate(tree, container);
		}
		return this.renderUnknownExtensionTemplate(tree, container);
	}

	private renderExtensionTemplate(tree: ITree, container: HTMLElement): IExtensionTemplateData {
		dom.addClass(container, 'dependency');

		const icon = dom.append(container, dom.$<HTMLImageElement>('img.icon'));
		const details = dom.append(container, dom.$('.details'));

		const header = dom.append(details, dom.$('.header'));
		const name = dom.append(header, dom.$('span.name'));
		const openExtensionAction = this.instantiationService.createInstance(OpenExtensionAction);
		const extensionDisposables = [dom.addDisposableListener(name, 'click', (e: MouseEvent) => {
			tree.setFocus(openExtensionAction.extensionDependencies);
			tree.setSelection([openExtensionAction.extensionDependencies]);
			openExtensionAction.run(e.ctrlKey || e.metaKey);
			e.stopPropagation();
			e.preventDefault();
		})];
		var identifier = dom.append(header, dom.$('span.identifier'));

		const footer = dom.append(details, dom.$('.footer'));
		var author = dom.append(footer, dom.$('.author'));
		return {
			icon,
			name,
			identifier,
			author,
			extensionDisposables,
			set extensionDependencies(e: IExtensionDependencies) {
				openExtensionAction.extensionDependencies = e;
			}
		};
	}

	private renderUnknownExtensionTemplate(tree: ITree, container: HTMLElement): IUnknownExtensionTemplateData {
		const messageContainer = dom.append(container, dom.$('div.unknown-dependency'));
		dom.append(messageContainer, dom.$('span.error-marker')).textContent = localize('error', "Error");
		dom.append(messageContainer, dom.$('span.message')).textContent = localize('Unknown Dependency', "Unknown Dependency:");

		const identifier = dom.append(messageContainer, dom.$('span.message'));
		return { identifier };
	}

	public renderElement(tree: ITree, element: IExtensionDependencies, templateId: string, templateData: any): void {
		if (templateId === Renderer.EXTENSION_TEMPLATE_ID) {
			this.renderExtension(tree, element, templateData);
			return;
		}
		this.renderUnknownExtension(tree, element, templateData);
	}

	private renderExtension(tree: ITree, element: IExtensionDependencies, data: IExtensionTemplateData): void {
		const extension = element.extension;

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
		data.identifier.textContent = extension.id;
		data.author.textContent = extension.publisherDisplayName;
		data.extensionDependencies = element;
	}

	private renderUnknownExtension(tree: ITree, element: IExtensionDependencies, data: IUnknownExtensionTemplateData): void {
		data.identifier.textContent = element.identifier;
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		if (templateId === Renderer.EXTENSION_TEMPLATE_ID) {
			templateData.extensionDisposables = dispose((<IExtensionTemplateData>templateData).extensionDisposables);
		}
	}
}

export class Controller extends DefaultController {

	constructor( @IExtensionsWorkbenchService private extensionsWorkdbenchService: IExtensionsWorkbenchService) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP, keyboardSupport: false });

		// TODO@Sandeep this should be a command
		this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.Enter, (tree: ITree, event: any) => this.openExtension(tree, true));
	}

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

	public openExtension(tree: ITree, sideByside: boolean): boolean {
		const element: IExtensionDependencies = tree.getFocus();
		if (element.extension) {
			this.extensionsWorkdbenchService.open(element.extension, sideByside);
			return true;
		}
		return false;
	}
}

class OpenExtensionAction extends Action {

	private _extensionDependencies: IExtensionDependencies;

	constructor( @IExtensionsWorkbenchService private extensionsWorkdbenchService: IExtensionsWorkbenchService) {
		super('extensions.action.openDependency', '');
	}

	public set extensionDependencies(extensionDependencies: IExtensionDependencies) {
		this._extensionDependencies = extensionDependencies;
	}

	public get extensionDependencies(): IExtensionDependencies {
		return this._extensionDependencies;
	}

	run(sideByside: boolean): TPromise<any> {
		return this.extensionsWorkdbenchService.open(this._extensionDependencies.extension, sideByside);
	}
}