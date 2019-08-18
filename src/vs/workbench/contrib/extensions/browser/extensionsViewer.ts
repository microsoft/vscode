/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { IExtensionsWorkbenchService, IExtension } from 'vs/workbench/contrib/extensions/common/extensions';
import { Event } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService, WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IAsyncDataSource, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CancellationToken } from 'vs/base/common/cancellation';
import { isNonEmptyArray } from 'vs/base/common/arrays';

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
	getChildren: () => Promise<IExtensionData[] | null>;
	parent: IExtensionData | null;
}

export class AsyncDataSource implements IAsyncDataSource<IExtensionData, any> {

	public hasChildren({ hasChildren }: IExtensionData): boolean {
		return hasChildren;
	}

	public getChildren(extensionData: IExtensionData): Promise<any> {
		return extensionData.getChildren();
	}

}

export class VirualDelegate implements IListVirtualDelegate<IExtensionData> {

	public getHeight(element: IExtensionData): number {
		return 62;
	}
	public getTemplateId({ extension }: IExtensionData): string {
		return extension ? ExtensionRenderer.TEMPLATE_ID : UnknownExtensionRenderer.TEMPLATE_ID;
	}
}

export class ExtensionRenderer implements IListRenderer<ITreeNode<IExtensionData>, IExtensionTemplateData> {

	static readonly TEMPLATE_ID = 'extension-template';

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
	}

	public get templateId(): string {
		return ExtensionRenderer.TEMPLATE_ID;
	}

	public renderTemplate(container: HTMLElement): IExtensionTemplateData {
		dom.addClass(container, 'extension');

		const icon = dom.append(container, dom.$<HTMLImageElement>('img.icon'));
		const details = dom.append(container, dom.$('.details'));

		const header = dom.append(details, dom.$('.header'));
		const name = dom.append(header, dom.$('span.name'));
		const openExtensionAction = this.instantiationService.createInstance(OpenExtensionAction);
		const extensionDisposables = [dom.addDisposableListener(name, 'click', (e: MouseEvent) => {
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

	public renderElement(node: ITreeNode<IExtensionData>, index: number, data: IExtensionTemplateData): void {
		const extension = node.element.extension;
		const onError = Event.once(domEvent(data.icon, 'error'));
		onError(() => data.icon.src = extension.iconUrlFallback, null, data.extensionDisposables);
		data.icon.src = extension.iconUrl;

		if (!data.icon.complete) {
			data.icon.style.visibility = 'hidden';
			data.icon.onload = () => data.icon.style.visibility = 'inherit';
		} else {
			data.icon.style.visibility = 'inherit';
		}

		data.name.textContent = extension.displayName;
		data.identifier.textContent = extension.identifier.id;
		data.author.textContent = extension.publisherDisplayName;
		data.extensionData = node.element;
	}

	public disposeTemplate(templateData: IExtensionTemplateData): void {
		templateData.extensionDisposables = dispose((<IExtensionTemplateData>templateData).extensionDisposables);
	}
}

export class UnknownExtensionRenderer implements IListRenderer<ITreeNode<IExtensionData>, IUnknownExtensionTemplateData> {

	static readonly TEMPLATE_ID = 'unknown-extension-template';

	public get templateId(): string {
		return UnknownExtensionRenderer.TEMPLATE_ID;
	}

	public renderTemplate(container: HTMLElement): IUnknownExtensionTemplateData {
		const messageContainer = dom.append(container, dom.$('div.unknown-extension'));
		dom.append(messageContainer, dom.$('span.error-marker')).textContent = localize('error', "Error");
		dom.append(messageContainer, dom.$('span.message')).textContent = localize('Unknown Extension', "Unknown Extension:");

		const identifier = dom.append(messageContainer, dom.$('span.message'));
		return { identifier };
	}

	public renderElement(node: ITreeNode<IExtensionData>, index: number, data: IUnknownExtensionTemplateData): void {
		data.identifier.textContent = node.element.extension.identifier.id;
	}

	public disposeTemplate(data: IUnknownExtensionTemplateData): void {
	}
}

class OpenExtensionAction extends Action {

	private _extensionData: IExtensionData | undefined;

	constructor(@IExtensionsWorkbenchService private readonly extensionsWorkdbenchService: IExtensionsWorkbenchService) {
		super('extensions.action.openExtension', '');
	}

	public set extensionData(extension: IExtensionData) {
		this._extensionData = extension;
	}

	run(sideByside: boolean): Promise<any> {
		if (this._extensionData) {
			return this.extensionsWorkdbenchService.open(this._extensionData.extension, sideByside);
		}
		return Promise.resolve();
	}
}

export class ExtensionsTree extends WorkbenchAsyncDataTree<IExtensionData, IExtensionData> {

	constructor(
		input: IExtensionData,
		container: HTMLElement,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IExtensionsWorkbenchService extensionsWorkdbenchService: IExtensionsWorkbenchService
	) {
		const delegate = new VirualDelegate();
		const dataSource = new AsyncDataSource();
		const renderers = [instantiationService.createInstance(ExtensionRenderer), instantiationService.createInstance(UnknownExtensionRenderer)];
		const identityProvider = {
			getId({ extension, parent }: IExtensionData): string {
				return parent ? this.getId(parent) + '/' + extension.identifier.id : extension.identifier.id;
			}
		};

		super(
			container,
			delegate,
			renderers,
			dataSource,
			{
				indent: 40,
				identityProvider,
				multipleSelectionSupport: false
			},
			contextKeyService, listService, themeService, configurationService, keybindingService, accessibilityService
		);

		this.setInput(input);

		this.disposables.push(this.onDidChangeSelection(event => {
			if (event.browserEvent && event.browserEvent instanceof KeyboardEvent) {
				extensionsWorkdbenchService.open(event.elements[0].extension, false);
			}
		}));
	}
}

export class ExtensionData implements IExtensionData {

	readonly extension: IExtension;
	readonly parent: IExtensionData | null;
	private readonly getChildrenExtensionIds: (extension: IExtension) => string[];
	private readonly childrenExtensionIds: string[];
	private readonly extensionsWorkbenchService: IExtensionsWorkbenchService;

	constructor(extension: IExtension, parent: IExtensionData | null, getChildrenExtensionIds: (extension: IExtension) => string[], extensionsWorkbenchService: IExtensionsWorkbenchService) {
		this.extension = extension;
		this.parent = parent;
		this.getChildrenExtensionIds = getChildrenExtensionIds;
		this.extensionsWorkbenchService = extensionsWorkbenchService;
		this.childrenExtensionIds = this.getChildrenExtensionIds(extension);
	}

	get hasChildren(): boolean {
		return isNonEmptyArray(this.childrenExtensionIds);
	}

	async getChildren(): Promise<IExtensionData[] | null> {
		if (this.hasChildren) {
			const localById = this.extensionsWorkbenchService.local.reduce((result, e) => { result.set(e.identifier.id.toLowerCase(), e); return result; }, new Map<string, IExtension>());
			const result: IExtension[] = [];
			const toQuery: string[] = [];
			for (const extensionId of this.childrenExtensionIds) {
				const id = extensionId.toLowerCase();
				const local = localById.get(id);
				if (local) {
					result.push(local);
				} else {
					toQuery.push(id);
				}
			}
			if (toQuery.length) {
				const galleryResult = await this.extensionsWorkbenchService.queryGallery({ names: toQuery, pageSize: toQuery.length }, CancellationToken.None);
				result.push(...galleryResult.firstPage);
			}
			return result.map(extension => new ExtensionData(extension, this, this.getChildrenExtensionIds, this.extensionsWorkbenchService));
		}
		return null;
	}
}
