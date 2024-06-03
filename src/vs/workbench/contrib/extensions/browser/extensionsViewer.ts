/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IDisposable, dispose, Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { IExtensionsWorkbenchService, IExtension } from 'vs/workbench/contrib/extensions/common/extensions';
import { Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService, WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IAsyncDataSource, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';
import { CancellationToken } from 'vs/base/common/cancellation';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Delegate, Renderer } from 'vs/workbench/contrib/extensions/browser/extensionsList';
import { listFocusForeground, listFocusBackground, foreground, editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IStyleOverride } from 'vs/platform/theme/browser/defaultStyles';
import { getAriaLabelForExtension } from 'vs/workbench/contrib/extensions/browser/extensionsViews';

export class ExtensionsGridView extends Disposable {

	readonly element: HTMLElement;
	private readonly renderer: Renderer;
	private readonly delegate: Delegate;
	private readonly disposableStore: DisposableStore;

	constructor(
		parent: HTMLElement,
		delegate: Delegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.element = dom.append(parent, dom.$('.extensions-grid-view'));
		this.renderer = this.instantiationService.createInstance(Renderer, { onFocus: Event.None, onBlur: Event.None }, { hoverOptions: { position() { return HoverPosition.BELOW; } } });
		this.delegate = delegate;
		this.disposableStore = this._register(new DisposableStore());
	}

	setExtensions(extensions: IExtension[]): void {
		this.disposableStore.clear();
		extensions.forEach((e, index) => this.renderExtension(e, index));
	}

	private renderExtension(extension: IExtension, index: number): void {
		const extensionContainer = dom.append(this.element, dom.$('.extension-container'));
		extensionContainer.style.height = `${this.delegate.getHeight()}px`;
		extensionContainer.setAttribute('tabindex', '0');

		const template = this.renderer.renderTemplate(extensionContainer);
		this.disposableStore.add(toDisposable(() => this.renderer.disposeTemplate(template)));

		const openExtensionAction = this.instantiationService.createInstance(OpenExtensionAction);
		openExtensionAction.extension = extension;
		template.name.setAttribute('tabindex', '0');

		const handleEvent = (e: StandardMouseEvent | StandardKeyboardEvent) => {
			if (e instanceof StandardKeyboardEvent && e.keyCode !== KeyCode.Enter) {
				return;
			}
			openExtensionAction.run(e.ctrlKey || e.metaKey);
			e.stopPropagation();
			e.preventDefault();
		};

		this.disposableStore.add(dom.addDisposableListener(template.name, dom.EventType.CLICK, (e: MouseEvent) => handleEvent(new StandardMouseEvent(dom.getWindow(template.name), e))));
		this.disposableStore.add(dom.addDisposableListener(template.name, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => handleEvent(new StandardKeyboardEvent(e))));
		this.disposableStore.add(dom.addDisposableListener(extensionContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => handleEvent(new StandardKeyboardEvent(e))));

		this.renderer.renderElement(extension, index, template);
	}
}

interface IExtensionTemplateData {
	icon: HTMLImageElement;
	name: HTMLElement;
	identifier: HTMLElement;
	author: HTMLElement;
	extensionDisposables: IDisposable[];
	extensionData: IExtensionData;
}

interface IUnknownExtensionTemplateData {
	identifier: HTMLElement;
}

interface IExtensionData {
	extension: IExtension;
	hasChildren: boolean;
	getChildren: () => Promise<IExtensionData[] | null>;
	parent: IExtensionData | null;
}

class AsyncDataSource implements IAsyncDataSource<IExtensionData, any> {

	public hasChildren({ hasChildren }: IExtensionData): boolean {
		return hasChildren;
	}

	public getChildren(extensionData: IExtensionData): Promise<any> {
		return extensionData.getChildren();
	}

}

class VirualDelegate implements IListVirtualDelegate<IExtensionData> {

	public getHeight(element: IExtensionData): number {
		return 62;
	}
	public getTemplateId({ extension }: IExtensionData): string {
		return extension ? ExtensionRenderer.TEMPLATE_ID : UnknownExtensionRenderer.TEMPLATE_ID;
	}
}

class ExtensionRenderer implements IListRenderer<ITreeNode<IExtensionData>, IExtensionTemplateData> {

	static readonly TEMPLATE_ID = 'extension-template';

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
	}

	public get templateId(): string {
		return ExtensionRenderer.TEMPLATE_ID;
	}

	public renderTemplate(container: HTMLElement): IExtensionTemplateData {
		container.classList.add('extension');

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
				openExtensionAction.extension = extensionData.extension;
			}
		};
	}

	public renderElement(node: ITreeNode<IExtensionData>, index: number, data: IExtensionTemplateData): void {
		const extension = node.element.extension;
		data.extensionDisposables.push(dom.addDisposableListener(data.icon, 'error', () => data.icon.src = extension.iconUrlFallback, { once: true }));
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

class UnknownExtensionRenderer implements IListRenderer<ITreeNode<IExtensionData>, IUnknownExtensionTemplateData> {

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

	private _extension: IExtension | undefined;

	constructor(@IExtensionsWorkbenchService private readonly extensionsWorkdbenchService: IExtensionsWorkbenchService) {
		super('extensions.action.openExtension', '');
	}

	public set extension(extension: IExtension) {
		this._extension = extension;
	}

	override run(sideByside: boolean): Promise<any> {
		if (this._extension) {
			return this.extensionsWorkdbenchService.open(this._extension, { sideByside });
		}
		return Promise.resolve();
	}
}

export class ExtensionsTree extends WorkbenchAsyncDataTree<IExtensionData, IExtensionData> {

	constructor(
		input: IExtensionData,
		container: HTMLElement,
		overrideStyles: IStyleOverride<IListStyles>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
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
			'ExtensionsTree',
			container,
			delegate,
			renderers,
			dataSource,
			{
				indent: 40,
				identityProvider,
				multipleSelectionSupport: false,
				overrideStyles,
				accessibilityProvider: {
					getAriaLabel(extensionData: IExtensionData): string {
						return getAriaLabelForExtension(extensionData.extension);
					},
					getWidgetAriaLabel(): string {
						return localize('extensions', "Extensions");
					}
				}
			},
			instantiationService, contextKeyService, listService, configurationService
		);

		this.setInput(input);

		this.disposables.add(this.onDidChangeSelection(event => {
			if (dom.isKeyboardEvent(event.browserEvent)) {
				extensionsWorkdbenchService.open(event.elements[0].extension, { sideByside: false });
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
			const result: IExtension[] = await getExtensions(this.childrenExtensionIds, this.extensionsWorkbenchService);
			return result.map(extension => new ExtensionData(extension, this, this.getChildrenExtensionIds, this.extensionsWorkbenchService));
		}
		return null;
	}
}

export async function getExtensions(extensions: string[], extensionsWorkbenchService: IExtensionsWorkbenchService): Promise<IExtension[]> {
	const localById = extensionsWorkbenchService.local.reduce((result, e) => { result.set(e.identifier.id.toLowerCase(), e); return result; }, new Map<string, IExtension>());
	const result: IExtension[] = [];
	const toQuery: string[] = [];
	for (const extensionId of extensions) {
		const id = extensionId.toLowerCase();
		const local = localById.get(id);
		if (local) {
			result.push(local);
		} else {
			toQuery.push(id);
		}
	}
	if (toQuery.length) {
		const galleryResult = await extensionsWorkbenchService.getExtensions(toQuery.map(id => ({ id })), CancellationToken.None);
		result.push(...galleryResult);
	}
	return result;
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const focusBackground = theme.getColor(listFocusBackground);
	if (focusBackground) {
		collector.addRule(`.extensions-grid-view .extension-container:focus { background-color: ${focusBackground}; outline: none; }`);
	}
	const focusForeground = theme.getColor(listFocusForeground);
	if (focusForeground) {
		collector.addRule(`.extensions-grid-view .extension-container:focus { color: ${focusForeground}; }`);
	}
	const foregroundColor = theme.getColor(foreground);
	const editorBackgroundColor = theme.getColor(editorBackground);
	if (foregroundColor && editorBackgroundColor) {
		const authorForeground = foregroundColor.transparent(.9).makeOpaque(editorBackgroundColor);
		collector.addRule(`.extensions-grid-view .extension-container:not(.disabled) .author { color: ${authorForeground}; }`);
		const disabledExtensionForeground = foregroundColor.transparent(.5).makeOpaque(editorBackgroundColor);
		collector.addRule(`.extensions-grid-view .extension-container.disabled { color: ${disabledExtensionForeground}; }`);
	}
});
