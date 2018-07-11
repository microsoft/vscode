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
import { Action } from 'vs/base/common/actions';
import { IExtensionsWorkbenchService, IExtension } from 'vs/workbench/parts/extensions/common/extensions';
import { once } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { WorkbenchTreeController, WorkbenchTree, IListService } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export interface IExtensionTemplateData {
	icon: HTMLImageElement;
	name: HTMLElement;
	identifier: HTMLElement;
	author: HTMLElement;
	extensionDisposables: IDisposable[];
	extensionData: IExtensionData;
}

export interface IUnknownExtensionTemplateData {
	identifier: HTMLElement;
}

export interface IExtensionData {
	extension: IExtension;
	hasChildren: boolean;
	getChildren: () => Promise<IExtensionData[]>;
	parent: IExtensionData;
}

export class DataSource implements IDataSource {

	public getId(tree: ITree, { extension, parent }: IExtensionData): string {
		return parent ? this.getId(tree, parent) + '/' + extension.id : extension.id;
	}

	public hasChildren(tree: ITree, { hasChildren }: IExtensionData): boolean {
		return hasChildren;
	}

	public getChildren(tree: ITree, extensionData: IExtensionData): Promise {
		return extensionData.getChildren();
	}

	public getParent(tree: ITree, { parent }: IExtensionData): Promise {
		return TPromise.as(parent);
	}
}

export class Renderer implements IRenderer {

	private static readonly EXTENSION_TEMPLATE_ID = 'extension-template';
	private static readonly UNKNOWN_EXTENSION_TEMPLATE_ID = 'unknown-extension-template';

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
	}

	public getHeight(tree: ITree, element: IExtensionData): number {
		return 62;
	}

	public getTemplateId(tree: ITree, { extension }: IExtensionData): string {
		return extension ? Renderer.EXTENSION_TEMPLATE_ID : Renderer.UNKNOWN_EXTENSION_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (Renderer.EXTENSION_TEMPLATE_ID === templateId) {
			return this.renderExtensionTemplate(tree, container);
		}
		return this.renderUnknownExtensionTemplate(tree, container);
	}

	private renderExtensionTemplate(tree: ITree, container: HTMLElement): IExtensionTemplateData {
		dom.addClass(container, 'extension');

		const icon = dom.append(container, dom.$<HTMLImageElement>('img.icon'));
		const details = dom.append(container, dom.$('.details'));

		const header = dom.append(details, dom.$('.header'));
		const name = dom.append(header, dom.$('span.name'));
		const openExtensionAction = this.instantiationService.createInstance(OpenExtensionAction);
		const extensionDisposables = [dom.addDisposableListener(name, 'click', (e: MouseEvent) => {
			tree.setFocus(openExtensionAction.extensionData);
			tree.setSelection([openExtensionAction.extensionData]);
			openExtensionAction.run(e.ctrlKey || e.metaKey);
			e.stopPropagation();
			e.preventDefault();
		})];
		const identifier = dom.append(header, dom.$('span.identifier'));

		const footer = dom.append(details, dom.$('.footer'));
		const author = dom.append(footer, dom.$('.author'));
		return {
			icon,
			name,
			identifier,
			author,
			extensionDisposables,
			set extensionData(extensionData: IExtensionData) {
				openExtensionAction.extensionData = extensionData;
			}
		};
	}

	private renderUnknownExtensionTemplate(tree: ITree, container: HTMLElement): IUnknownExtensionTemplateData {
		const messageContainer = dom.append(container, dom.$('div.unknown-extension'));
		dom.append(messageContainer, dom.$('span.error-marker')).textContent = localize('error', "Error");
		dom.append(messageContainer, dom.$('span.message')).textContent = localize('Unknown Extension', "Unknown Extension:");

		const identifier = dom.append(messageContainer, dom.$('span.message'));
		return { identifier };
	}

	public renderElement(tree: ITree, element: IExtensionData, templateId: string, templateData: any): void {
		if (templateId === Renderer.EXTENSION_TEMPLATE_ID) {
			this.renderExtension(tree, element, templateData);
			return;
		}
		this.renderUnknownExtension(tree, element, templateData);
	}

	private renderExtension(tree: ITree, extensionData: IExtensionData, data: IExtensionTemplateData): void {
		const extension = extensionData.extension;
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
		data.extensionData = extensionData;
	}

	private renderUnknownExtension(tree: ITree, { extension }: IExtensionData, data: IUnknownExtensionTemplateData): void {
		data.identifier.textContent = extension.id;
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		if (templateId === Renderer.EXTENSION_TEMPLATE_ID) {
			templateData.extensionDisposables = dispose((<IExtensionTemplateData>templateData).extensionDisposables);
		}
	}
}

export class Controller extends WorkbenchTreeController {

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkdbenchService: IExtensionsWorkbenchService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({}, configurationService);

		// TODO@Sandeep this should be a command
		this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.Enter, (tree: ITree, event: any) => this.openExtension(tree, true));
	}

	protected onLeftClick(tree: ITree, element: IExtensionData, event: IMouseEvent): boolean {
		let currentFocused = tree.getFocus();
		if (super.onLeftClick(tree, element, event)) {
			if (element.parent === null) {
				if (currentFocused) {
					tree.setFocus(currentFocused);
				} else {
					tree.focusFirst();
				}
				return true;
			}
		}
		return false;
	}

	public openExtension(tree: ITree, sideByside: boolean): boolean {
		const element: IExtensionData = tree.getFocus();
		if (element.extension) {
			this.extensionsWorkdbenchService.open(element.extension, sideByside);
			return true;
		}
		return false;
	}
}

class OpenExtensionAction extends Action {

	private _extension: IExtensionData;

	constructor(@IExtensionsWorkbenchService private extensionsWorkdbenchService: IExtensionsWorkbenchService) {
		super('extensions.action.openExtension', '');
	}

	public set extensionData(extension: IExtensionData) {
		this._extension = extension;
	}

	public get extensionData(): IExtensionData {
		return this._extension;
	}

	run(sideByside: boolean): TPromise<any> {
		return this.extensionsWorkdbenchService.open(this.extensionData.extension, sideByside);
	}
}

export class ExtensionsTree extends WorkbenchTree {

	constructor(
		input: IExtensionData,
		container: HTMLElement,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const renderer = instantiationService.createInstance(Renderer);
		const controller = instantiationService.createInstance(Controller);

		super(
			container,
			{
				dataSource: new DataSource(),
				renderer,
				controller
			}, {
				indentPixels: 40,
				twistiePixels: 20
			},
			contextKeyService, listService, themeService, instantiationService, configurationService
		);

		this.setInput(input);

		this.disposables.push(this.onDidChangeSelection(event => {
			if (event && event.payload && event.payload.origin === 'keyboard') {
				controller.openExtension(this, false);
			}
		}));
	}
}