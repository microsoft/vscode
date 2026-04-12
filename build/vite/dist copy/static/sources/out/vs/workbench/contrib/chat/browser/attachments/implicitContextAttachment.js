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
import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileKind, IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { isStringImplicitContextValue } from '../../common/attachments/chatVariableEntries.js';
import { IChatContextService } from '../contextContrib/chatContextService.js';
let ImplicitContextAttachmentWidget = class ImplicitContextAttachmentWidget extends Disposable {
    constructor(widgetRef, isAttachmentAlreadyAttached, attachment, resourceLabels, attachmentModel, domNode, contextKeyService, contextMenuService, labelService, menuService, fileService, languageService, modelService, hoverService, configService, chatContextService) {
        super();
        this.widgetRef = widgetRef;
        this.isAttachmentAlreadyAttached = isAttachmentAlreadyAttached;
        this.attachment = attachment;
        this.resourceLabels = resourceLabels;
        this.attachmentModel = attachmentModel;
        this.domNode = domNode;
        this.contextKeyService = contextKeyService;
        this.contextMenuService = contextMenuService;
        this.labelService = labelService;
        this.menuService = menuService;
        this.fileService = fileService;
        this.languageService = languageService;
        this.modelService = modelService;
        this.hoverService = hoverService;
        this.configService = configService;
        this.chatContextService = chatContextService;
        this.renderDisposables = this._register(new DisposableStore());
        this.renderedCount = 0;
        this.render();
    }
    render() {
        this.renderDisposables.clear();
        this.renderedCount = 0;
        for (const context of this.attachment.values) {
            const targetUri = context.uri;
            const targetRange = isLocation(context.value) ? context.value.range : undefined;
            const targetHandle = isStringImplicitContextValue(context.value) ? context.value.handle : undefined;
            const currentlyAttached = this.isAttachmentAlreadyAttached(targetUri, targetRange, targetHandle);
            if (!currentlyAttached) {
                this.renderMainContext(context, context.isSelection);
                this.renderedCount++;
            }
        }
    }
    get hasRenderedContexts() {
        return this.renderedCount > 0;
    }
    renderMainContext(context, isSelection) {
        const contextNode = dom.$('.chat-attached-context-attachment.show-file-icons.implicit');
        this.domNode.appendChild(contextNode);
        contextNode.tabIndex = 0;
        contextNode.classList.toggle('disabled', !context.enabled);
        const file = context.uri;
        const attachmentTypeName = file?.scheme === Schemas.vscodeNotebookCell ? localize('cell.lowercase', "cell") : localize('file.lowercase', "file");
        const contextLabel = context.name ?? (file ? basename(file) : localize('implicitContextFallback', "context"));
        const isSuggestedEnabled = this.configService.getValue('chat.implicitContext.suggestedContext');
        // Create toggle button BEFORE the label so it appears on the left
        if (isSuggestedEnabled) {
            if (!isSelection) {
                const buttonMsg = context.enabled
                    ? localize('disableImplicitContext', "Disable {0} context {1}", attachmentTypeName, contextLabel)
                    : localize('addToContext', "Add {0} to context", contextLabel);
                const toggleButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: buttonMsg }));
                toggleButton.icon = context.enabled ? Codicon.x : Codicon.plus;
                this.renderDisposables.add(toggleButton.onDidClick(async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (!context.enabled) {
                        await this.convertToRegularAttachment(context);
                    }
                    context.enabled = false;
                }));
            }
            else {
                const pinButtonMsg = localize('pinSelection', "Pin selection");
                const pinButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: pinButtonMsg }));
                pinButton.icon = Codicon.pinned;
                this.renderDisposables.add(pinButton.onDidClick(async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    await this.pinSelection();
                }));
            }
            if (!context.enabled && isSelection) {
                contextNode.classList.remove('disabled');
            }
            this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.CLICK, async (e) => {
                if (!context.enabled && !isSelection) {
                    await this.convertToRegularAttachment(context);
                }
            }));
            this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.KEY_DOWN, async (e) => {
                const event = new StandardKeyboardEvent(e);
                if (event.equals(3 /* KeyCode.Enter */) || event.equals(10 /* KeyCode.Space */)) {
                    if (!context.enabled && !isSelection) {
                        e.preventDefault();
                        e.stopPropagation();
                        await this.convertToRegularAttachment(context);
                    }
                }
            }));
        }
        else {
            const buttonMsg = context.enabled ? localize('disable', "Disable current {0} context", attachmentTypeName) : localize('enable', "Enable current {0} context", attachmentTypeName);
            const toggleButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: buttonMsg }));
            toggleButton.icon = context.enabled ? Codicon.eye : Codicon.eyeClosed;
            this.renderDisposables.add(toggleButton.onDidClick((e) => {
                e.stopPropagation(); // prevent it from triggering the click handler on the parent immediately after rerendering
                context.enabled = !context.enabled;
            }));
        }
        const label = this.resourceLabels.create(contextNode, { supportIcons: true });
        let title;
        let markdownTooltip;
        if (isStringImplicitContextValue(context.value)) {
            markdownTooltip = context.value.tooltip;
            title = this.renderString(label, context.name, context.icon, context.value.resourceUri, markdownTooltip, localize('openFile', "Current file context"));
            contextNode.ariaLabel = localize('chat.implicitStringContext', "Suggested context, {0}", context.name);
        }
        else {
            title = this.renderResource(context.value, context.isSelection, context.enabled, label, contextNode);
        }
        if (markdownTooltip || title) {
            this.renderDisposables.add(this.hoverService.setupDelayedHover(contextNode, {
                content: markdownTooltip ?? title,
                appearance: { showPointer: true },
            }));
        }
        // Context menu
        const scopedContextKeyService = this.renderDisposables.add(this.contextKeyService.createScoped(contextNode));
        const resourceContextKey = this.renderDisposables.add(new ResourceContextKey(scopedContextKeyService, this.fileService, this.languageService, this.modelService));
        resourceContextKey.set(file);
        this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.CONTEXT_MENU, async (domEvent) => {
            const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
            dom.EventHelper.stop(domEvent, true);
            this.contextMenuService.showContextMenu({
                contextKeyService: scopedContextKeyService,
                getAnchor: () => event,
                getActions: () => {
                    const menu = this.menuService.getMenuActions(MenuId.ChatInputResourceAttachmentContext, scopedContextKeyService, { arg: file });
                    return getFlatContextMenuActions(menu);
                },
            });
        }));
    }
    renderString(resourceLabel, name, icon, resourceUri, markdownTooltip, defaultTitle) {
        // Don't set title if we have a markdown tooltip - the hover service will handle it
        const title = markdownTooltip ? undefined : defaultTitle;
        // Derive icon classes from resourceUri for file/folder icons
        if (icon && (ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon)) && resourceUri) {
            const fileKind = ThemeIcon.isFolder(icon) ? FileKind.FOLDER : FileKind.FILE;
            const iconClasses = getIconClasses(this.modelService, this.languageService, resourceUri, fileKind);
            resourceLabel.setLabel(name, undefined, { extraClasses: iconClasses, title });
        }
        else {
            resourceLabel.setLabel(name, undefined, { iconPath: icon, title });
        }
        return title;
    }
    renderResource(attachmentValue, isSelection, enabled, label, contextNode) {
        const file = URI.isUri(attachmentValue) ? attachmentValue : attachmentValue.uri;
        const range = URI.isUri(attachmentValue) || !isSelection ? undefined : attachmentValue.range;
        const attachmentTypeName = file.scheme === Schemas.vscodeNotebookCell ? localize('cell.lowercase', "cell") : localize('file.lowercase', "file");
        const fileBasename = basename(file);
        const fileDirname = dirname(file);
        const friendlyName = `${fileBasename} ${fileDirname}`;
        const ariaLabel = range
            ? localize('chat.implicitFileContextWithRange', "Suggested context, {0}, {1}, line {2} to line {3}", attachmentTypeName, friendlyName, range.startLineNumber, range.endLineNumber)
            : localize('chat.implicitFileContext', "Suggested context, {0}, {1}", attachmentTypeName, friendlyName);
        const uriLabel = this.labelService.getUriLabel(file, { relative: true });
        const currentFile = localize('openEditor', "Current {0} context", attachmentTypeName);
        const inactive = localize('enableHint', "Enable current {0} context", attachmentTypeName);
        const currentFileHint = enabled || isSelection ? currentFile : inactive;
        const title = `${currentFileHint}\n${uriLabel}`;
        label.setFile(file, {
            fileKind: FileKind.FILE,
            hidePath: true,
            range,
            title
        });
        contextNode.ariaLabel = ariaLabel;
        return title;
    }
    async convertToRegularAttachment(attachment) {
        if (!attachment.value) {
            return;
        }
        if (isStringImplicitContextValue(attachment.value)) {
            if (attachment.value.value === undefined) {
                await this.chatContextService.resolveChatContext(attachment.value);
            }
            const context = {
                kind: 'string',
                value: attachment.value.value,
                id: attachment.id,
                name: attachment.name,
                icon: attachment.value.icon,
                modelDescription: attachment.modelDescription,
                uri: attachment.value.uri,
                resourceUri: attachment.value.resourceUri,
                tooltip: attachment.value.tooltip,
                commandId: attachment.value.commandId,
                handle: attachment.value.handle
            };
            this.attachmentModel.addContext(context);
        }
        else {
            const file = URI.isUri(attachment.value) ? attachment.value : attachment.value.uri;
            if (file.scheme === Schemas.vscodeNotebookCell && isLocation(attachment.value)) {
                this.attachmentModel.addFile(file, attachment.value.range);
            }
            else {
                this.attachmentModel.addFile(file);
            }
        }
        this.widgetRef()?.focusInput();
    }
    async pinSelection() {
        for (const attachment of this.attachment.values) {
            if (!attachment.value || !attachment.isSelection) {
                continue;
            }
            if (!URI.isUri(attachment.value) && !isStringImplicitContextValue(attachment.value)) {
                const location = attachment.value;
                this.attachmentModel.addFile(location.uri, location.range);
            }
        }
        this.widgetRef()?.focusInput();
    }
};
ImplicitContextAttachmentWidget = __decorate([
    __param(6, IContextKeyService),
    __param(7, IContextMenuService),
    __param(8, ILabelService),
    __param(9, IMenuService),
    __param(10, IFileService),
    __param(11, ILanguageService),
    __param(12, IModelService),
    __param(13, IHoverService),
    __param(14, IConfigurationService),
    __param(15, IChatContextService)
], ImplicitContextAttachmentWidget);
export { ImplicitContextAttachmentWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1wbGljaXRDb250ZXh0QXR0YWNobWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9pbXBsaWNpdENvbnRleHRBdHRhY2htZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDckYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDL0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFcEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBWSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1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