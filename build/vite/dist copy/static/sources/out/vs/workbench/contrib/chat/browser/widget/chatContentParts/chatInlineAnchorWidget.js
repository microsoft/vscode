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
var InlineAnchorWidget_1;
import './media/chatInlineAnchorWidget.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { SymbolKinds } from '../../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { DefinitionAction } from '../../../../../../editor/contrib/gotoSymbol/browser/goToCommands.js';
import * as nls from '../../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { FileKind, IFileService } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { FolderThemeIcon, IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../../browser/dnd.js';
import { StaticResourceContextKey } from '../../../../../common/contextkeys.js';
import { IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { globMatchesResource } from '../../../../../services/editor/common/editorResolverService.js';
import { INotebookDocumentService } from '../../../../../services/notebook/common/notebookDocumentService.js';
import { ExplorerFolderContext } from '../../../../files/common/files.js';
import { IChatWidgetService } from '../../chat.js';
import { IChatImageCarouselService } from '../../chatImageCarouselService.js';
import { chatAttachmentResourceContextKey, hookUpSymbolAttachmentDragAndContextMenu } from '../../attachments/chatAttachmentWidgets.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { getMediaMime } from '../../../../../../base/common/mime.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
/**
 * Returns the editor ID to use when opening a resource from chat pills (inline anchors), based on the
 * `chat.editorAssociations` setting. Returns undefined if no association matches.
 */
export function getEditorOverrideForChatResource(resource, configurationService) {
    const associations = configurationService.getValue(ChatConfiguration.EditorAssociations) ?? {};
    // Sort patterns by length (longer patterns are more specific)
    const sortedPatterns = Object.keys(associations).sort((a, b) => b.length - a.length);
    for (const pattern of sortedPatterns) {
        if (globMatchesResource(pattern, resource)) {
            return associations[pattern];
        }
    }
    return undefined;
}
export function renderFileWidgets(element, instantiationService, chatMarkdownAnchorService, disposables) {
    // eslint-disable-next-line no-restricted-syntax
    const links = element.querySelectorAll('a');
    links.forEach(a => {
        // Empty link text -> render file widget
        // Also support metadata format: [linkText](file:///...uri?vscodeLinkType=...)
        const linkText = a.textContent?.trim();
        let shouldRenderWidget = false;
        let metadata;
        const href = a.getAttribute('data-href');
        let uri;
        if (href) {
            try {
                uri = URI.parse(href);
            }
            catch {
                // Invalid URI, skip rendering widget
            }
        }
        if (!linkText) {
            shouldRenderWidget = true;
        }
        else if (uri) {
            // Check for vscodeLinkType in query parameters
            const searchParams = new URLSearchParams(uri.query);
            const vscodeLinkType = searchParams.get('vscodeLinkType');
            if (vscodeLinkType) {
                metadata = {
                    vscodeLinkType,
                    linkText
                };
                shouldRenderWidget = true;
                // Strip vscodeLinkType from the URI once we've extracted the metadata for better compatibility with different FS
                searchParams.delete('vscodeLinkType');
                const remainingQuery = searchParams.toString();
                uri = uri.with({ query: remainingQuery });
            }
        }
        if (shouldRenderWidget && uri?.scheme) {
            const widget = instantiationService.createInstance(InlineAnchorWidget, a, { kind: 'inlineReference', inlineReference: uri }, metadata);
            disposables.add(chatMarkdownAnchorService.register(widget));
            disposables.add(widget);
        }
    });
}
let InlineAnchorWidget = class InlineAnchorWidget extends Disposable {
    static { InlineAnchorWidget_1 = this; }
    static { this.className = 'chat-inline-anchor-widget'; }
    constructor(element, inlineReference, metadata, chatImageCarouselService, configurationService, originalContextKeyService, contextMenuService, fileService, hoverService, instantiationService, labelService, languageService, menuService, modelService, telemetryService, themeService, notebookDocumentService, openerService, editorService) {
        super();
        this.element = element;
        this.inlineReference = inlineReference;
        this.metadata = metadata;
        this.chatImageCarouselService = chatImageCarouselService;
        this.configurationService = configurationService;
        this.notebookDocumentService = notebookDocumentService;
        this.openerService = openerService;
        this.editorService = editorService;
        // TODO: Make sure we handle updates from an inlineReference being `resolved` late
        this.data = 'uri' in inlineReference.inlineReference
            ? inlineReference.inlineReference
            : 'name' in inlineReference.inlineReference
                ? { kind: 'symbol', symbol: inlineReference.inlineReference }
                : { uri: inlineReference.inlineReference };
        element.classList.add(InlineAnchorWidget_1.className, 'show-file-icons');
        let iconText;
        let iconClasses;
        let location;
        if (this.data.kind === 'symbol') {
            const symbol = this.data.symbol;
            location = this.data.symbol.location;
            iconText = [this.data.symbol.name];
            iconClasses = ['codicon', ...getIconClasses(modelService, languageService, undefined, undefined, SymbolKinds.toIcon(symbol.kind))];
            this._store.add(instantiationService.invokeFunction(accessor => hookUpSymbolAttachmentDragAndContextMenu(accessor, element, originalContextKeyService, { value: symbol.location, name: symbol.name, kind: symbol.kind }, MenuId.ChatInlineSymbolAnchorContext)));
        }
        else {
            location = this.data;
            const filePathLabel = this.metadata?.linkText ?? labelService.getUriBasenameLabel(location.uri);
            let defaultIcon;
            if (location.range && this.data.kind !== 'symbol') {
                const suffix = location.range.startLineNumber === location.range.endLineNumber
                    ? `:${location.range.startLineNumber}`
                    : `:${location.range.startLineNumber}-${location.range.endLineNumber}`;
                iconText = [filePathLabel, dom.$('span.label-suffix', undefined, suffix)];
            }
            else if (location.uri.scheme === 'vscode-notebook-cell' && this.data.kind !== 'symbol') {
                iconText = [`${filePathLabel} • cell${this.getCellIndex(location.uri)}`];
            }
            else if (location.uri.scheme === Schemas.vscodeBrowser) {
                defaultIcon = Codicon.globe;
                const editorName = this.editorService.findEditors(location.uri)[0]?.editor?.getName() ?? BrowserEditorInput.DEFAULT_LABEL;
                iconText = [editorName];
            }
            else {
                iconText = [filePathLabel];
            }
            let fileKind = location.uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
            const recomputeIconClasses = () => getIconClasses(modelService, languageService, location.uri, fileKind, fileKind === FileKind.FOLDER && !themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : defaultIcon);
            iconClasses = recomputeIconClasses();
            const refreshIconClasses = () => {
                iconEl.classList.remove(...iconClasses);
                iconClasses = recomputeIconClasses();
                iconEl.classList.add(...iconClasses);
            };
            let isDirectory = false;
            fileService.stat(location.uri)
                .then(stat => {
                isDirectory = stat.isDirectory;
                if (stat.isDirectory) {
                    fileKind = FileKind.FOLDER;
                    refreshIconClasses();
                }
            })
                .catch(() => { });
            // Context menu (context key service created lazily on first context menu open)
            let contextKeyService;
            let isFolderContext;
            let contextMenuInitialized = false;
            const ensureContextKeyService = () => {
                if (!contextKeyService) {
                    contextKeyService = this._register(originalContextKeyService.createScoped(element));
                    chatAttachmentResourceContextKey.bindTo(contextKeyService).set(location.uri.toString());
                    isFolderContext = ExplorerFolderContext.bindTo(contextKeyService);
                }
                return contextKeyService;
            };
            this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, async (domEvent) => {
                const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
                dom.EventHelper.stop(domEvent, true);
                const cks = ensureContextKeyService();
                if (!contextMenuInitialized) {
                    contextMenuInitialized = true;
                    const resourceContextKey = new StaticResourceContextKey(cks, fileService, languageService, modelService);
                    resourceContextKey.set(location.uri);
                }
                isFolderContext.set(isDirectory);
                if (this._store.isDisposed) {
                    return;
                }
                contextMenuService.showContextMenu({
                    contextKeyService: cks,
                    getAnchor: () => event,
                    getActions: () => {
                        const menu = menuService.getMenuActions(MenuId.ChatInlineResourceAnchorContext, cks, { arg: location.uri });
                        return getFlatContextMenuActions(menu);
                    },
                });
            }));
            // Add line range label for screen readers
            if (location.range) {
                if (location.range.startLineNumber === location.range.endLineNumber) {
                    element.setAttribute('aria-label', nls.localize('chat.inlineAnchor.ariaLabel.line', "{0} line {1}", filePathLabel, location.range.startLineNumber));
                }
                else {
                    element.setAttribute('aria-label', nls.localize('chat.inlineAnchor.ariaLabel.range', "{0} lines {1} to {2}", filePathLabel, location.range.startLineNumber, location.range.endLineNumber));
                }
            }
        }
        const iconEl = dom.$('span.icon');
        iconEl.classList.add(...iconClasses);
        element.replaceChildren(iconEl, dom.$('span.icon-label', {}, ...iconText));
        const fragment = location.range ? `${location.range.startLineNumber},${location.range.startColumn}` : '';
        element.setAttribute('data-href', (fragment ? location.uri.with({ fragment }) : location.uri).toString());
        // Hover
        const relativeLabel = labelService.getUriLabel(location.uri, { relative: true });
        this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('element'), element, relativeLabel));
        // Drag and drop
        if (this.data.kind !== 'symbol') {
            element.draggable = true;
            this._register(dom.addDisposableListener(element, 'dragstart', e => {
                const stat = {
                    resource: location.uri,
                    selection: location.range,
                };
                instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, [stat], e));
                e.dataTransfer?.setDragImage(element, 0, 0);
            }));
        }
        // Click handler to open with custom editor association from chat.editorAssociations setting
        this._register(dom.addDisposableListener(element, 'click', async (e) => {
            dom.EventHelper.stop(e, true);
            // If the reference is an image file and the carousel is enabled, open the carousel
            const mimeType = getMediaMime(location.uri.path);
            if (mimeType?.startsWith('image/') && this.configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
                await this.chatImageCarouselService.openCarouselAtResource(location.uri);
                return;
            }
            const editorOverride = getEditorOverrideForChatResource(location.uri, this.configurationService);
            const editorOptions = {
                override: editorOverride,
            };
            if (location.range) {
                editorOptions.selection = location.range;
            }
            await this.openerService.open(location.uri, {
                fromUserGesture: true,
                editorOptions
            });
        }));
    }
    getHTMLElement() {
        return this.element;
    }
    getCellIndex(location) {
        const notebook = this.notebookDocumentService.getNotebook(location);
        const index = notebook?.getCellIndex(location) ?? -1;
        return index >= 0 ? ` ${index + 1}` : '';
    }
};
InlineAnchorWidget = InlineAnchorWidget_1 = __decorate([
    __param(3, IChatImageCarouselService),
    __param(4, IConfigurationService),
    __param(5, IContextKeyService),
    __param(6, IContextMenuService),
    __param(7, IFileService),
    __param(8, IHoverService),
    __param(9, IInstantiationService),
    __param(10, ILabelService),
    __param(11, ILanguageService),
    __param(12, IMenuService),
    __param(13, IModelService),
    __param(14, ITelemetryService),
    __param(15, IThemeService),
    __param(16, INotebookDocumentService),
    __param(17, IOpenerService),
    __param(18, IEditorService)
], InlineAnchorWidget);
export { InlineAnchorWidget };
//#region Resource context menu
registerAction2(class AddFileToChatAction extends Action2 {
    static { this.id = 'chat.inlineResourceAnchor.addFileToChat'; }
    constructor() {
        super({
            id: AddFileToChatAction.id,
            title: nls.localize2('actions.attach.label', "Add File to Chat"),
            menu: [{
                    id: MenuId.ChatInlineResourceAnchorContext,
                    group: 'chat',
                    order: 1,
                    when: ExplorerFolderContext.negate(),
                }]
        });
    }
    async run(accessor, resource) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const widget = chatWidgetService.lastFocusedWidget;
        if (widget) {
            widget.attachmentModel.addFile(resource);
        }
    }
});
//#endregion
//#region Resource keybindings
registerAction2(class CopyResourceAction extends Action2 {
    static { this.id = 'chat.inlineResourceAnchor.copyResource'; }
    constructor() {
        super({
            id: CopyResourceAction.id,
            title: nls.localize2('actions.copy.label', "Copy"),
            f1: false,
            precondition: chatAttachmentResourceContextKey,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */,
            }
        });
    }
    async run(accessor) {
        const chatWidgetService = accessor.get(IChatMarkdownAnchorService);
        const clipboardService = accessor.get(IClipboardService);
        const anchor = chatWidgetService.lastFocusedAnchor;
        if (!anchor) {
            return;
        }
        // TODO: we should also write out the standard mime types so that external programs can use them
        // like how `fillEditorsDragData` works but without having an event to work with.
        const resource = anchor.data.kind === 'symbol' ? anchor.data.symbol.location.uri : anchor.data.uri;
        clipboardService.writeResources([resource]);
    }
});
registerAction2(class OpenToSideResourceAction extends Action2 {
    static { this.id = 'chat.inlineResourceAnchor.openToSide'; }
    constructor() {
        super({
            id: OpenToSideResourceAction.id,
            title: nls.localize2('actions.openToSide.label', "Open to the Side"),
            f1: false,
            precondition: chatAttachmentResourceContextKey,
            keybinding: {
                weight: 400 /* KeybindingWeight.ExternalExtension */ + 2,
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */
                },
            },
            menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
                id: id,
                group: 'navigation',
                order: 1
            }))
        });
    }
    async run(accessor, arg) {
        const editorService = accessor.get(IEditorService);
        const configurationService = accessor.get(IConfigurationService);
        const target = this.getTarget(accessor, arg);
        if (!target) {
            return;
        }
        const targetUri = URI.isUri(target) ? target : target.uri;
        const editorOverride = getEditorOverrideForChatResource(targetUri, configurationService);
        const input = URI.isUri(target)
            ? { resource: target, options: { override: editorOverride } }
            : {
                resource: target.uri, options: {
                    override: editorOverride,
                    selection: {
                        startColumn: target.range.startColumn,
                        startLineNumber: target.range.startLineNumber,
                    }
                }
            };
        await editorService.openEditors([input], SIDE_GROUP);
    }
    getTarget(accessor, arg) {
        const chatWidgetService = accessor.get(IChatMarkdownAnchorService);
        if (arg) {
            return arg;
        }
        const anchor = chatWidgetService.lastFocusedAnchor;
        if (!anchor) {
            return undefined;
        }
        return anchor.data.kind === 'symbol' ? anchor.data.symbol.location : anchor.data.uri;
    }
});
//#endregion
//#region Symbol context menu
registerAction2(class GoToDefinitionAction extends Action2 {
    static { this.id = 'chat.inlineSymbolAnchor.goToDefinition'; }
    constructor() {
        super({
            id: GoToDefinitionAction.id,
            title: {
                ...nls.localize2('actions.goToDecl.label', "Go to Definition"),
                mnemonicTitle: nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition"),
            },
            menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
                id,
                group: '4_symbol_nav',
                order: 1.1,
                when: EditorContextKeys.hasDefinitionProvider,
            }))
        });
    }
    async run(accessor, location) {
        const editorService = accessor.get(ICodeEditorService);
        const instantiationService = accessor.get(IInstantiationService);
        await openEditorWithSelection(editorService, location);
        const action = new DefinitionAction({ openToSide: false, openInPeek: false, muteMessage: true }, { title: { value: '', original: '' }, id: '', precondition: undefined });
        return instantiationService.invokeFunction(accessor => action.run(accessor));
    }
});
async function openEditorWithSelection(editorService, location) {
    await editorService.openCodeEditor({
        resource: location.uri, options: {
            selection: {
                startColumn: location.range.startColumn,
                startLineNumber: location.range.startLineNumber,
            }
        }
    }, null);
}
async function runGoToCommand(accessor, command, location) {
    const editorService = accessor.get(ICodeEditorService);
    const commandService = accessor.get(ICommandService);
    await openEditorWithSelection(editorService, location);
    return commandService.executeCommand(command);
}
registerAction2(class GoToTypeDefinitionsAction extends Action2 {
    static { this.id = 'chat.inlineSymbolAnchor.goToTypeDefinitions'; }
    constructor() {
        super({
            id: GoToTypeDefinitionsAction.id,
            title: {
                ...nls.localize2('goToTypeDefinitions.label', "Go to Type Definitions"),
                mnemonicTitle: nls.localize({ key: 'miGotoTypeDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Type Definitions"),
            },
            menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
                id,
                group: '4_symbol_nav',
                order: 1.1,
                when: EditorContextKeys.hasTypeDefinitionProvider,
            })),
        });
    }
    async run(accessor, location) {
        await runGoToCommand(accessor, 'editor.action.goToTypeDefinition', location);
    }
});
registerAction2(class GoToImplementations extends Action2 {
    static { this.id = 'chat.inlineSymbolAnchor.goToImplementations'; }
    constructor() {
        super({
            id: GoToImplementations.id,
            title: {
                ...nls.localize2('goToImplementations.label', "Go to Implementations"),
                mnemonicTitle: nls.localize({ key: 'miGotoImplementations', comment: ['&& denotes a mnemonic'] }, "Go to &&Implementations"),
            },
            menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
                id,
                group: '4_symbol_nav',
                order: 1.2,
                when: EditorContextKeys.hasImplementationProvider,
            })),
        });
    }
    async run(accessor, location) {
        await runGoToCommand(accessor, 'editor.action.goToImplementation', location);
    }
});
registerAction2(class GoToReferencesAction extends Action2 {
    static { this.id = 'chat.inlineSymbolAnchor.goToReferences'; }
    constructor() {
        super({
            id: GoToReferencesAction.id,
            title: {
                ...nls.localize2('goToReferences.label', "Go to References"),
                mnemonicTitle: nls.localize({ key: 'miGotoReference', comment: ['&& denotes a mnemonic'] }, "Go to &&References"),
            },
            menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
                id,
                group: '4_symbol_nav',
                order: 1.3,
                when: EditorContextKeys.hasReferenceProvider,
            })),
        });
    }
    async run(accessor, location) {
        await runGoToCommand(accessor, 'editor.action.goToReferences', location);
    }
});
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElubGluZUFuY2hvcldpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0SW5saW5lQW5jaG9yV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLG9DQUFvQyxDQUFDO0FBQzVDLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFFMUcsT0FBTyxFQUFFLFVBQVUsRUFBbUIsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFFcEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekYsT0FBTyxFQUFZLFdBQVcsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM1RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDdkcsT0FBTyxLQUFLLEdBQUcsTUFBTSwwQkFBMEIsQ0FBQztBQUNoRCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNsSCxPQUFPLEVBQUUsT0FBTyxF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