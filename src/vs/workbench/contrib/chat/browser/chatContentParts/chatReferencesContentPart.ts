/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { matchesSomeScheme, Schemas } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/path.js';
import { basenameOrAuthority, isEqualAuthority } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { IResourceLabel, ResourceLabels } from '../../../../browser/labels.js';
import { ColorScheme } from '../../../../browser/web.api.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { SETTINGS_AUTHORITY } from '../../../../services/preferences/common/preferences.js';
import { createFileIconThemableTreeContainerScope } from '../../../files/browser/views/explorerView.js';
import { ExplorerFolderContext } from '../../../files/common/files.js';
import { chatEditingWidgetFileStateContextKey, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { ChatResponseReferencePartStatusKind, IChatContentReference, IChatWarningMessage } from '../../common/chatService.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { IChatRendererContent, IChatResponseViewModel } from '../../common/chatViewModel.js';
import { ChatTreeItem, IChatWidgetService } from '../chat.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IDisposableReference, ResourcePool } from './chatCollections.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';

export const $ = dom.$;

export interface IChatReferenceListItem extends IChatContentReference {
	title?: string;
	description?: string;
	state?: WorkingSetEntryState;
	excluded?: boolean;
}

export type IChatCollapsibleListItem = IChatReferenceListItem | IChatWarningMessage;

export class ChatCollapsibleListContentPart extends ChatCollapsibleContentPart {

	constructor(
		private readonly data: ReadonlyArray<IChatCollapsibleListItem>,
		labelOverride: IMarkdownString | string | undefined,
		context: IChatContentPartRenderContext,
		private readonly contentReferencesListPool: CollapsibleListPool,
		@IOpenerService private readonly openerService: IOpenerService,
		@IMenuService private readonly menuService: IMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super(labelOverride ?? (data.length > 1 ?
			localize('usedReferencesPlural', "Used {0} references", data.length) :
			localize('usedReferencesSingular', "Used {0} reference", 1)), context);
	}

	protected override initContent(): HTMLElement {
		const ref = this._register(this.contentReferencesListPool.get());
		const list = ref.object;

		this._register(list.onDidOpen((e) => {
			if (e.element && 'reference' in e.element && typeof e.element.reference === 'object') {
				const uriOrLocation = 'variableName' in e.element.reference ? e.element.reference.value : e.element.reference;
				const uri = URI.isUri(uriOrLocation) ? uriOrLocation :
					uriOrLocation?.uri;
				if (uri) {
					this.openerService.open(
						uri,
						{
							fromUserGesture: true,
							editorOptions: {
								...e.editorOptions,
								...{
									selection: uriOrLocation && 'range' in uriOrLocation ? uriOrLocation.range : undefined
								}
							}
						});
				}
			}
		}));

		this._register(list.onContextMenu(e => {
			dom.EventHelper.stop(e.browserEvent, true);

			const uri = e.element && getResourceForElement(e.element);
			if (!uri) {
				return;
			}

			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => {
					const menu = this.menuService.getMenuActions(MenuId.ChatAttachmentsContext, list.contextKeyService, { shouldForwardArgs: true, arg: uri });
					return getFlatContextMenuActions(menu);
				}
			});
		}));

		const resourceContextKey = this._register(this.instantiationService.createInstance(ResourceContextKey));
		this._register(list.onDidChangeFocus(e => {
			resourceContextKey.reset();
			const element = e.elements.length ? e.elements[0] : undefined;
			const uri = element && getResourceForElement(element);
			resourceContextKey.set(uri ?? null);
		}));

		const maxItemsShown = 6;
		const itemsShown = Math.min(this.data.length, maxItemsShown);
		const height = itemsShown * 22;
		list.layout(height);
		list.getHTMLElement().style.height = `${height}px`;
		list.splice(0, list.length, this.data);

		return list.getHTMLElement().parentElement!;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'references' && other.references.length === this.data.length && (!!followingContent.length === this.hasFollowingContent);
	}
}

export interface IChatUsedReferencesListOptions {
	expandedWhenEmptyResponse?: boolean;
}

export class ChatUsedReferencesListContentPart extends ChatCollapsibleListContentPart {
	constructor(
		data: ReadonlyArray<IChatCollapsibleListItem>,
		labelOverride: IMarkdownString | string | undefined,
		context: IChatContentPartRenderContext,
		contentReferencesListPool: CollapsibleListPool,
		private readonly options: IChatUsedReferencesListOptions,
		@IOpenerService openerService: IOpenerService,
		@IMenuService menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super(data, labelOverride, context, contentReferencesListPool, openerService, menuService, instantiationService, contextMenuService);
		if (data.length === 0) {
			dom.hide(this.domNode);
		}
	}

	protected override isExpanded(): boolean {
		const element = this.context.element as IChatResponseViewModel;
		return element.usedReferencesExpanded ?? !!(
			this.options.expandedWhenEmptyResponse && element.response.value.length === 0
		);
	}

	protected override setExpanded(value: boolean): void {
		const element = this.context.element as IChatResponseViewModel;
		element.usedReferencesExpanded = !this.isExpanded();
	}
}

export class CollapsibleListPool extends Disposable {
	private _pool: ResourcePool<WorkbenchList<IChatCollapsibleListItem>>;

	public get inUse(): ReadonlySet<WorkbenchList<IChatCollapsibleListItem>> {
		return this._pool.inUse;
	}

	constructor(
		private _onDidChangeVisibility: Event<boolean>,
		private readonly menuId: MenuId | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.listFactory()));
	}

	private listFactory(): WorkbenchList<IChatCollapsibleListItem> {
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));

		const container = $('.chat-used-context-list');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));

		const list = this.instantiationService.createInstance(
			WorkbenchList<IChatCollapsibleListItem>,
			'ChatListRenderer',
			container,
			new CollapsibleListDelegate(),
			[this.instantiationService.createInstance(CollapsibleListRenderer, resourceLabels, this.menuId)],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: IChatCollapsibleListItem) => {
						if (element.kind === 'warning') {
							return element.content.value;
						}
						const reference = element.reference;
						if (typeof reference === 'string') {
							return reference;
						} else if ('variableName' in reference) {
							return reference.variableName;
						} else if (URI.isUri(reference)) {
							return basename(reference.path);
						} else {
							return basename(reference.uri.path);
						}
					},

					getWidgetAriaLabel: () => localize('chatCollapsibleList', "Collapsible Chat List")
				},
				dnd: {
					getDragURI: (element: IChatCollapsibleListItem) => getResourceForElement(element)?.toString() ?? null,
					getDragLabel: (elements, originalEvent) => {
						const uris: URI[] = coalesce(elements.map(getResourceForElement));
						if (!uris.length) {
							return undefined;
						} else if (uris.length === 1) {
							return this.labelService.getUriLabel(uris[0], { relative: true });
						} else {
							return `${uris.length}`;
						}
					},
					dispose: () => { },
					onDragOver: () => false,
					drop: () => { },
					onDragStart: (data, originalEvent) => {
						try {
							const elements = data.getData() as IChatCollapsibleListItem[];
							const uris: URI[] = coalesce(elements.map(getResourceForElement));
							this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
						} catch {
							// noop
						}
					},
				},
			});

		return list;
	}

	get(): IDisposableReference<WorkbenchList<IChatCollapsibleListItem>> {
		const object = this._pool.get();
		let stale = false;
		return {
			object,
			isStale: () => stale,
			dispose: () => {
				stale = true;
				this._pool.release(object);
			}
		};
	}
}

class CollapsibleListDelegate implements IListVirtualDelegate<IChatCollapsibleListItem> {
	getHeight(element: IChatCollapsibleListItem): number {
		return 22;
	}

	getTemplateId(element: IChatCollapsibleListItem): string {
		return CollapsibleListRenderer.TEMPLATE_ID;
	}
}

interface ICollapsibleListTemplate {
	readonly contextKeyService?: IContextKeyService;
	readonly label: IResourceLabel;
	readonly templateDisposables: DisposableStore;
	toolbar: MenuWorkbenchToolBar | undefined;
	actionBarContainer?: HTMLElement;
}

class CollapsibleListRenderer implements IListRenderer<IChatCollapsibleListItem, ICollapsibleListTemplate> {
	static TEMPLATE_ID = 'chatCollapsibleListRenderer';
	readonly templateId: string = CollapsibleListRenderer.TEMPLATE_ID;

	constructor(
		private labels: ResourceLabels,
		private menuId: MenuId | undefined,
		@IThemeService private readonly themeService: IThemeService,
		@IProductService private readonly productService: IProductService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) { }

	renderTemplate(container: HTMLElement): ICollapsibleListTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));

		let toolbar;
		let actionBarContainer;
		let contextKeyService;
		if (this.menuId) {
			actionBarContainer = $('.chat-collapsible-list-action-bar');
			contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
			const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
			toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, this.menuId, { menuOptions: { shouldForwardArgs: true, arg: undefined } }));
			label.element.appendChild(actionBarContainer);
		}

		return { templateDisposables, label, toolbar, actionBarContainer, contextKeyService };
	}


	private getReferenceIcon(data: IChatContentReference): URI | ThemeIcon | undefined {
		if (ThemeIcon.isThemeIcon(data.iconPath)) {
			return data.iconPath;
		} else {
			return this.themeService.getColorTheme().type === ColorScheme.DARK && data.iconPath?.dark
				? data.iconPath?.dark
				: data.iconPath?.light;
		}
	}

	renderElement(data: IChatCollapsibleListItem, index: number, templateData: ICollapsibleListTemplate, height: number | undefined): void {
		if (data.kind === 'warning') {
			templateData.label.setResource({ name: data.content.value }, { icon: Codicon.warning });
			return;
		}

		const reference = data.reference;
		const icon = this.getReferenceIcon(data);
		templateData.label.element.style.display = 'flex';
		let arg: URI | undefined;
		if (typeof reference === 'object' && 'variableName' in reference) {
			if (reference.value) {
				const uri = URI.isUri(reference.value) ? reference.value : reference.value.uri;
				templateData.label.setResource(
					{
						resource: uri,
						name: basenameOrAuthority(uri),
						description: `#${reference.variableName}`,
						range: 'range' in reference.value ? reference.value.range : undefined,
					}, { icon, title: data.options?.status?.description ?? data.title });
			} else if (reference.variableName.startsWith('kernelVariable')) {
				const variable = reference.variableName.split(':')[1];
				const asVariableName = `${variable}`;
				const label = `Kernel variable`;
				templateData.label.setLabel(label, asVariableName, { title: data.options?.status?.description });
			} else {
				// Nothing else is expected to fall into here
				templateData.label.setLabel('Unknown variable type');
			}
		} else if (typeof reference === 'string') {
			templateData.label.setLabel(reference, undefined, { iconPath: URI.isUri(icon) ? icon : undefined, title: data.options?.status?.description ?? data.title });

		} else {
			const uri = 'uri' in reference ? reference.uri : reference;
			arg = uri;
			const extraClasses = data.excluded ? ['excluded'] : [];
			if (uri.scheme === 'https' && isEqualAuthority(uri.authority, 'github.com') && uri.path.includes('/tree/')) {
				// Parse a nicer label for GitHub URIs that point at a particular commit + file
				const label = uri.path.split('/').slice(1, 3).join('/');
				const description = uri.path.split('/').slice(5).join('/');
				templateData.label.setResource({ resource: uri, name: label, description }, { icon: Codicon.github, title: data.title, strikethrough: data.excluded, extraClasses });
			} else if (uri.scheme === this.productService.urlProtocol && isEqualAuthority(uri.authority, SETTINGS_AUTHORITY)) {
				// a nicer label for settings URIs
				const settingId = uri.path.substring(1);
				templateData.label.setResource({ resource: uri, name: settingId }, { icon: Codicon.settingsGear, title: localize('setting.hover', "Open setting '{0}'", settingId), strikethrough: data.excluded, extraClasses });
			} else if (matchesSomeScheme(uri, Schemas.mailto, Schemas.http, Schemas.https)) {
				templateData.label.setResource({ resource: uri, name: uri.toString() }, { icon: icon ?? Codicon.globe, title: data.options?.status?.description ?? data.title ?? uri.toString(), strikethrough: data.excluded, extraClasses });
			} else {
				templateData.label.setFile(uri, {
					fileKind: FileKind.FILE,
					// Should not have this live-updating data on a historical reference
					fileDecorations: undefined,
					range: 'range' in reference ? reference.range : undefined,
					title: data.options?.status?.description ?? data.title,
					strikethrough: data.excluded,
					extraClasses
				});
			}
		}

		for (const selector of ['.monaco-icon-suffix-container', '.monaco-icon-name-container']) {
			const element = templateData.label.element.querySelector(selector);
			if (element) {
				if (data.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted || data.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial) {
					element.classList.add('warning');
				} else {
					element.classList.remove('warning');
				}
			}
		}

		if (data.state !== undefined) {
			if (templateData.actionBarContainer) {
				if (data.state === WorkingSetEntryState.Modified && !templateData.actionBarContainer.classList.contains('modified')) {
					templateData.actionBarContainer.classList.add('modified');
					templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.add('modified');
				} else if (data.state !== WorkingSetEntryState.Modified) {
					templateData.actionBarContainer.classList.remove('modified');
					templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.remove('modified');
				}
			}
			if (templateData.toolbar) {
				templateData.toolbar.context = arg;
			}
			if (templateData.contextKeyService) {
				if (data.state !== undefined) {
					chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(data.state);
				}
			}
		}
	}

	disposeTemplate(templateData: ICollapsibleListTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

function getResourceForElement(element: IChatCollapsibleListItem): URI | null {
	if (element.kind === 'warning') {
		return null;
	}
	const { reference } = element;
	if (typeof reference === 'string' || 'variableName' in reference) {
		return null;
	} else if (URI.isUri(reference)) {
		return reference;
	} else {
		return reference.uri;
	}
}

//#region Resource context menu

registerAction2(class AddToChatAction extends Action2 {

	static readonly id = 'workbench.action.chat.addToChatAction';

	constructor() {
		super({
			id: AddToChatAction.id,
			title: {
				...localize2('addToChat', "Add File to Chat"),
			},
			f1: false,
			menu: [{
				id: MenuId.ChatAttachmentsContext,
				group: 'chat',
				order: 1,
				when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, ExplorerFolderContext.negate()),
			}]
		});
	}

	override async run(accessor: ServicesAccessor, resource: URI): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const variablesService = accessor.get(IChatVariablesService);

		if (!resource) {
			return;
		}

		const widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		variablesService.attachContext('file', resource, widget.location);
	}
});

registerAction2(class OpenChatReferenceLinkAction extends Action2 {

	static readonly id = 'workbench.action.chat.copyLink';

	constructor() {
		super({
			id: OpenChatReferenceLinkAction.id,
			title: {
				...localize2('copyLink', "Copy Link"),
			},
			f1: false,
			menu: [{
				id: MenuId.ChatAttachmentsContext,
				group: 'chat',
				order: 0,
				when: ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.http), ResourceContextKey.Scheme.isEqualTo(Schemas.https)),
			}]
		});
	}

	override async run(accessor: ServicesAccessor, resource: URI): Promise<void> {
		await accessor.get(IClipboardService).writeResources([resource]);
	}
});

//#endregion
