/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CollapsibleListRenderer_1;
import * as dom from '../../../../../../base/browser/dom.js';
import { coalesce } from '../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { matchesSomeScheme, Schemas } from '../../../../../../base/common/network.js';
import { basename } from '../../../../../../base/common/path.js';
import { basenameOrAuthority, isEqualAuthority } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { isDark } from '../../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../../browser/dnd.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { ResourceContextKey } from '../../../../../common/contextkeys.js';
import { SETTINGS_AUTHORITY } from '../../../../../services/preferences/common/preferences.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { ExplorerFolderContext } from '../../../../files/common/files.js';
import { chatEditingWidgetFileStateContextKey } from '../../../common/editing/chatEditingService.js';
import { ChatResponseReferencePartStatusKind } from '../../../common/chatService/chatService.js';
import { IChatWidgetService } from '../../chat.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { ResourcePool } from './chatCollections.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
const $ = dom.$;
let ChatCollapsibleListContentPart = class ChatCollapsibleListContentPart extends ChatCollapsibleContentPart {
    constructor(data, labelOverride, context, contentReferencesListPool, hoverMessage, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService) {
        super(labelOverride ?? (data.length > 1 ?
            localize('usedReferencesPlural', "Used {0} references", data.length) :
            localize('usedReferencesSingular', "Used {0} reference", 1)), context, hoverMessage, hoverService, configurationService);
        this.data = data;
        this.contentReferencesListPool = contentReferencesListPool;
        this.openerService = openerService;
        this.menuService = menuService;
        this.instantiationService = instantiationService;
        this.contextMenuService = contextMenuService;
        this.icon = Codicon.check;
    }
    initContent() {
        const ref = this._register(this.contentReferencesListPool.get());
        const list = ref.object;
        this._register(list.onDidOpen((e) => {
            if (e.element && 'reference' in e.element && typeof e.element.reference === 'object') {
                const uriOrLocation = 'variableName' in e.element.reference ? e.element.reference.value : e.element.reference;
                const uri = URI.isUri(uriOrLocation) ? uriOrLocation :
                    uriOrLocation?.uri;
                if (uri) {
                    this.openerService.open(uri, {
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
        return list.getHTMLElement().parentElement;
    }
    hasSameContent(other, followingContent, element) {
        return other.kind === 'references' && other.references.length === this.data.length && (!!followingContent.length === this.hasFollowingContent);
    }
};
ChatCollapsibleListContentPart = __decorate([
    __param(5, IOpenerService),
    __param(6, IMenuService),
    __param(7, IInstantiationService),
    __param(8, IContextMenuService),
    __param(9, IHoverService),
    __param(10, IConfigurationService)
], ChatCollapsibleListContentPart);
export { ChatCollapsibleListContentPart };
let ChatUsedReferencesListContentPart = class ChatUsedReferencesListContentPart extends ChatCollapsibleListContentPart {
    constructor(data, labelOverride, context, contentReferencesListPool, options, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService) {
        super(data, labelOverride, context, contentReferencesListPool, undefined, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService);
        this.options = options;
        if (data.length === 0) {
            dom.hide(this.domNode);
        }
    }
    isExpanded() {
        const element = this.element;
        return element.usedReferencesExpanded ?? !!(this.options.expandedWhenEmptyResponse && element.response.value.length === 0);
    }
    setExpanded(value) {
        const element = this.element;
        element.usedReferencesExpanded = !this.isExpanded();
    }
};
ChatUsedReferencesListContentPart = __decorate([
    __param(5, IOpenerService),
    __param(6, IMenuService),
    __param(7, IInstantiationService),
    __param(8, IContextMenuService),
    __param(9, IHoverService),
    __param(10, IConfigurationService)
], ChatUsedReferencesListContentPart);
export { ChatUsedReferencesListContentPart };
let CollapsibleListPool = class CollapsibleListPool extends Disposable {
    get inUse() {
        return this._pool.inUse;
    }
    constructor(_onDidChangeVisibility, menuId, listOptions, instantiationService, themeService, labelService) {
        super();
        this._onDidChangeVisibility = _onDidChangeVisibility;
        this.menuId = menuId;
        this.listOptions = listOptions;
        this.instantiationService = instantiationService;
        this.themeService = themeService;
        this.labelService = labelService;
        this._pool = this._register(new ResourcePool(() => this.listFactory()));
    }
    listFactory() {
        const store = new DisposableStore();
        const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));
        const container = $('.chat-used-context-list');
        store.add(createFileIconThemableTreeContainerScope(container, this.themeService));
        const list = this.instantiationService.createInstance((WorkbenchList), 'ChatListRenderer', container, new CollapsibleListDelegate(), [this.instantiationService.createInstance(CollapsibleListRenderer, resourceLabels, this.menuId)], {
            ...this.listOptions,
            alwaysConsumeMouseWheel: false,
            accessibilityProvider: {
                getAriaLabel: (element) => {
                    if (element.kind === 'warning') {
                        return element.content.value;
                    }
                    const reference = element.reference;
                    if (typeof reference === 'string') {
                        return reference;
                    }
                    else if ('variableName' in reference) {
                        return reference.variableName;
                    }
                    else if (URI.isUri(reference)) {
                        return basename(reference.path);
                    }
                    else {
                        return basename(reference.uri.path);
                    }
                },
                getWidgetAriaLabel: () => localize('chatCollapsibleList', "Collapsible Chat References List")
            },
            dnd: {
                getDragURI: (element) => getResourceForElement(element)?.toString() ?? null,
                getDragLabel: (elements, originalEvent) => {
                    const uris = coalesce(elements.map(getResourceForElement));
                    if (!uris.length) {
                        return undefined;
                    }
                    else if (uris.length === 1) {
                        return this.labelService.getUriLabel(uris[0], { relative: true });
                    }
                    else {
                        return `${uris.length}`;
                    }
                },
                dispose: () => { },
                onDragOver: () => false,
                drop: () => { },
                onDragStart: (data, originalEvent) => {
                    try {
                        const elements = data.getData();
                        const uris = coalesce(elements.map(getResourceForElement));
                        this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
                    }
                    catch {
                        // noop
                    }
                },
            },
        });
        return {
            list,
            dispose: () => store.dispose()
        };
    }
    get() {
        const wrapper = this._pool.get();
        let stale = false;
        return {
            object: wrapper.list,
            isStale: () => stale,
            dispose: () => {
                stale = true;
                this._pool.release(wrapper);
            }
        };
    }
    clear() {
        this._pool.clear();
    }
};
CollapsibleListPool = __decorate([
    __param(3, IInstantiationService),
    __param(4, IThemeService),
    __param(5, ILabelService)
], CollapsibleListPool);
export { CollapsibleListPool };
class CollapsibleListDelegate {
    getHeight(element) {
        return 22;
    }
    getTemplateId(element) {
        return CollapsibleListRenderer.TEMPLATE_ID;
    }
}
let CollapsibleListRenderer = class CollapsibleListRenderer {
    static { CollapsibleListRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'chatCollapsibleListRenderer'; }
    constructor(labels, menuId, themeService, productService, instantiationService, contextKeyService) {
        this.labels = labels;
        this.menuId = menuId;
        this.themeService = themeService;
        this.productService = productService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.templateId = CollapsibleListRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
        const fileDiffsContainer = $('.working-set-line-counts');
        const addedSpan = dom.$('.working-set-lines-added');
        const removedSpan = dom.$('.working-set-lines-removed');
        fileDiffsContainer.appendChild(addedSpan);
        fileDiffsContainer.appendChild(removedSpan);
        label.element.appendChild(fileDiffsContainer);
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
        return { templateDisposables, label, toolbar, actionBarContainer, contextKeyService, fileDiffsContainer, addedSpan, removedSpan };
    }
    getReferenceIcon(data) {
        if (ThemeIcon.isThemeIcon(data.iconPath)) {
            return data.iconPath;
        }
        else {
            return isDark(this.themeService.getColorTheme().type) && data.iconPath?.dark
                ? data.iconPath?.dark
                : data.iconPath?.light;
        }
    }
    renderElement(data, index, templateData) {
        if (data.kind === 'warning') {
            templateData.label.setResource({ name: data.content.value }, { icon: Codicon.warning });
            return;
        }
        const reference = data.reference;
        const icon = this.getReferenceIcon(data);
        templateData.label.element.style.display = 'flex';
        let arg;
        if (typeof reference === 'object' && 'variableName' in reference) {
            if (reference.value) {
                const uri = URI.isUri(reference.value) ? reference.value : reference.value.uri;
                templateData.label.setResource({
                    resource: uri,
                    name: basenameOrAuthority(uri),
                    description: `#${reference.variableName}`,
                    range: 'range' in reference.value ? reference.value.range : undefined,
                }, { icon, title: data.options?.status?.description ?? data.title });
            }
            else if (reference.variableName.startsWith('kernelVariable')) {
                const variable = reference.variableName.split(':')[1];
                const asVariableName = `${variable}`;
                const label = `Kernel variable`;
                templateData.label.setLabel(label, asVariableName, { title: data.options?.status?.description });
            }
            else {
                templateData.label.setLabel(reference.variableName, undefined, { title: data.options?.status?.description ?? data.title });
            }
        }
        else if (typeof reference === 'string') {
            templateData.label.setLabel(reference, undefined, { iconPath: URI.isUri(icon) ? icon : undefined, title: data.options?.status?.description ?? data.title });
        }
        else {
            const uri = 'uri' in reference ? reference.uri : reference;
            arg = uri;
            const extraClasses = data.excluded ? ['excluded'] : [];
            if (uri.scheme === 'https' && isEqualAuthority(uri.authority, 'github.com') && uri.path.includes('/tree/')) {
                // Parse a nicer label for GitHub URIs that point at a particular commit + file
                templateData.label.setResource(getResourceLabelForGithubUri(uri), { icon: Codicon.github, title: data.title, strikethrough: data.excluded, extraClasses });
            }
            else if (uri.scheme === this.productService.urlProtocol && isEqualAuthority(uri.authority, SETTINGS_AUTHORITY)) {
                // a nicer label for settings URIs
                const settingId = uri.path.substring(1);
                templateData.label.setResource({ resource: uri, name: settingId }, { icon: Codicon.settingsGear, title: localize('setting.hover', "Open setting '{0}'", settingId), strikethrough: data.excluded, extraClasses });
            }
            else if (matchesSomeScheme(uri, Schemas.mailto, Schemas.http, Schemas.https)) {
                templateData.label.setResource({ resource: uri, name: uri.toString(true) }, { icon: icon ?? Codicon.globe, title: data.options?.status?.description ?? data.title ?? uri.toString(true), strikethrough: data.excluded, extraClasses });
            }
            else {
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
            // eslint-disable-next-line no-restricted-syntax
            const element = templateData.label.element.querySelector(selector);
            if (element) {
                if (data.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted || data.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial) {
                    element.classList.add('warning');
                }
                else {
                    element.classList.remove('warning');
                }
            }
        }
        if (data.state !== undefined) {
            if (templateData.actionBarContainer || data.showModifiedState) {
                const diffMeta = data?.options?.diffMeta;
                if (diffMeta) {
                    if (!templateData.fileDiffsContainer || !templateData.addedSpan || !templateData.removedSpan) {
                        return;
                    }
                    templateData.addedSpan.textContent = `+${diffMeta.added}`;
                    templateData.removedSpan.textContent = `-${diffMeta.removed}`;
                    templateData.fileDiffsContainer.setAttribute('aria-label', localize('chatEditingSession.fileCounts', '{0} lines added, {1} lines removed', diffMeta.added, diffMeta.removed));
                }
                // eslint-disable-next-line no-restricted-syntax
                templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.add('modified');
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
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
};
CollapsibleListRenderer = CollapsibleListRenderer_1 = __decorate([
    __param(2, IThemeService),
    __param(3, IProductService),
    __param(4, IInstantiationService),
    __param(5, IContextKeyService)
], CollapsibleListRenderer);
function getResourceLabelForGithubUri(uri) {
    const repoPath = uri.path.split('/').slice(1, 3).join('/');
    const filePath = uri.path.split('/').slice(5);
    const fileName = filePath.at(-1);
    const range = getLineRangeFromGithubUri(uri);
    return {
        resource: uri,
        name: fileName ?? filePath.join('/'),
        description: [repoPath, ...filePath.slice(0, -1)].join('/'),
        range
    };
}
function getLineRangeFromGithubUri(uri) {
    if (!uri.fragment) {
        return undefined;
    }
    // Extract the line range from the fragment
    // Github line ranges are 1-based
    const match = uri.fragment.match(/\bL(\d+)(?:-L(\d+))?/);
    if (!match) {
        return undefined;
    }
    const startLine = parseInt(match[1]);
    if (isNaN(startLine)) {
        return undefined;
    }
    const endLine = match[2] ? parseInt(match[2]) : startLine;
    if (isNaN(endLine)) {
        return undefined;
    }
    return {
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: 1
    };
}
function getResourceForElement(element) {
    if (element.kind === 'warning') {
        return null;
    }
    const { reference } = element;
    if (typeof reference === 'string' || 'variableName' in reference) {
        return null;
    }
    else if (URI.isUri(reference)) {
        return reference;
    }
    else {
        return reference.uri;
    }
}
//#region Resource context menu
registerAction2(class AddToChatAction extends Action2 {
    static { this.id = 'workbench.action.chat.addToChatAction'; }
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
    async run(accessor, resource) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        if (!resource) {
            return;
        }
        const widget = chatWidgetService.lastFocusedWidget;
        if (widget) {
            widget.attachmentModel.addFile(resource);
        }
    }
});
registerAction2(class OpenChatReferenceLinkAction extends Action2 {
    static { this.id = 'workbench.action.chat.copyLink'; }
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
    async run(accessor, resource) {
        await accessor.get(IClipboardService).writeResources([resource]);
    }
});
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlZmVyZW5jZXNDb250ZW50UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UmVmZXJlbmNlc0NvbnRlbnRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBRzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFHcEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNsSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEgsT0FBTyxF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