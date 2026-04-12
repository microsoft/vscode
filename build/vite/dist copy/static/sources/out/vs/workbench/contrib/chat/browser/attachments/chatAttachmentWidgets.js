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
import { $ } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import * as event from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/path.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { fillInSymbolsDragData } from '../../../../../platform/dnd/browser/dnd.js';
import { registerOpenEditorListeners } from '../../../../../platform/editor/browser/editor.js';
import { FileKind, IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { FolderThemeIcon, IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { StaticResourceContextKey } from '../../../../common/contextkeys.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { revealInSideBarCommand } from '../../../files/browser/fileActions.contribution.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { toHistoryItemHoverContent } from '../../../scm/browser/scmHistory.js';
import { getHistoryItemEditorTitle } from '../../../scm/browser/util.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { coerceImageBuffer } from '../../common/chatImageExtraction.js';
import { ChatConfiguration } from '../../common/constants.js';
import { MAX_IMAGES_PER_REQUEST, PromptFileVariableKind, isStringVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILanguageModelToolsService, isToolSet } from '../../common/tools/languageModelToolsService.js';
import { getCleanPromptName } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IChatContextService } from '../contextContrib/chatContextService.js';
import { IChatImageCarouselService } from '../chatImageCarouselService.js';
const commonHoverOptions = {
    style: 1 /* HoverStyle.Pointer */,
    position: {
        hoverPosition: 2 /* HoverPosition.BELOW */
    },
    trapFocus: true,
};
const commonHoverLifecycleOptions = {
    groupId: 'chat-attachments',
};
const KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES = [
    'display',
    'position',
    'margin',
    'padding',
    'font-size',
    'font-family',
    'color',
    'background-color'
];
let AbstractChatAttachmentWidget = class AbstractChatAttachmentWidget extends Disposable {
    get onDidDelete() {
        return this._onDidDelete.event;
    }
    get onDidOpen() {
        return this._onDidOpen.event;
    }
    constructor(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService, terminalService) {
        super();
        this.attachment = attachment;
        this.options = options;
        this.currentLanguageModel = currentLanguageModel;
        this.commandService = commandService;
        this.openerService = openerService;
        this.configurationService = configurationService;
        this.terminalService = terminalService;
        this._onDidDelete = this._register(new event.Emitter());
        this._onDidOpen = this._register(new event.Emitter());
        this._hasClearButton = false;
        this.element = dom.append(container, $('.chat-attached-context-attachment.show-file-icons'));
        this.attachClearButton();
        this.label = contextResourceLabels.create(this.element, { supportIcons: true, hoverTargetOverride: this.element });
        this._register(this.label);
        this.element.tabIndex = 0;
        this.element.role = 'button';
        // Add middle-click support for removal
        this._register(dom.addDisposableListener(this.element, dom.EventType.AUXCLICK, (e) => {
            if (e.button === 1 /* Middle Button */ && this.options.supportsDeletion && !this.attachment.range) {
                e.preventDefault();
                e.stopPropagation();
                this._onDidDelete.fire(e);
            }
        }));
    }
    modelSupportsVision() {
        return modelSupportsVision(this.currentLanguageModel);
    }
    appendDeletionHint(ariaLabel) {
        if (!this._hasClearButton) {
            return ariaLabel;
        }
        return localize('chat.attachment.withDeleteHint', "{0} (Delete)", ariaLabel);
    }
    attachClearButton() {
        if (this.attachment.range || !this.options.supportsDeletion) {
            // no clear button for attachments with ranges because range means
            // referenced from prompt
            return;
        }
        this._hasClearButton = true;
        const clearButton = new Button(this.element, {
            supportIcons: true,
            hoverDelegate: createInstantHoverDelegate(),
            title: localize('chat.attachment.clearButton', "Remove from context")
        });
        clearButton.element.tabIndex = -1;
        clearButton.icon = Codicon.close;
        this._register(clearButton);
        this._register(event.Event.once(clearButton.onDidClick)((e) => {
            this._onDidDelete.fire(e);
        }));
        this._register(dom.addStandardDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
            if (e.keyCode === 1 /* KeyCode.Backspace */ || e.keyCode === 20 /* KeyCode.Delete */) {
                e.preventDefault();
                e.stopPropagation();
                this._onDidDelete.fire(e.browserEvent);
            }
        }));
    }
    addResourceOpenHandlers(resource, range) {
        this.element.style.cursor = 'pointer';
        this._register(registerOpenEditorListeners(this.element, async (options) => {
            if (this.attachment.kind === 'directory') {
                await this.openResource(resource, options, true);
            }
            else {
                await this.openResource(resource, options, false, range);
            }
        }));
    }
    async openResource(resource, openOptions, isDirectory, range) {
        if (isDirectory) {
            // Reveal Directory in explorer
            this.commandService.executeCommand(revealInSideBarCommand.id, resource);
            return;
        }
        if (resource.scheme === Schemas.vscodeTerminal) {
            this.terminalService?.openResource(resource);
            return;
        }
        // Open file in editor
        const openTextEditorOptions = range ? { selection: range } : undefined;
        const options = {
            fromUserGesture: true,
            openToSide: openOptions.openToSide,
            editorOptions: {
                ...openTextEditorOptions,
                ...openOptions.editorOptions
            },
        };
        await this.openerService.open(resource, options);
        this._onDidOpen.fire();
        this.element.focus();
    }
};
AbstractChatAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IOpenerService),
    __param(7, IConfigurationService),
    __param(8, ITerminalService)
], AbstractChatAttachmentWidget);
function modelSupportsVision(currentLanguageModel) {
    return currentLanguageModel?.metadata.capabilities?.vision ?? false;
}
let FileAttachmentWidget = class FileAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(resource, range, attachment, correspondingContentReference, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, themeService, hoverService, languageModelsService, instantiationService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.themeService = themeService;
        this.hoverService = hoverService;
        this.languageModelsService = languageModelsService;
        this.instantiationService = instantiationService;
        const fileBasename = basename(resource.path);
        const fileDirname = dirname(resource.path);
        const friendlyName = `${fileBasename} ${fileDirname}`;
        let ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);
        if (attachment.omittedState === 2 /* OmittedState.Full */) {
            ariaLabel = localize('chat.omittedFileAttachment', "Omitted this file: {0}", attachment.name);
            this.renderOmittedWarning(friendlyName, ariaLabel);
        }
        else {
            const fileOptions = { hidePath: true, title: correspondingContentReference?.options?.status?.description };
            this.label.setFile(resource, attachment.kind === 'file' ? {
                ...fileOptions,
                fileKind: FileKind.FILE,
                range,
            } : {
                ...fileOptions,
                fileKind: FileKind.FOLDER,
                icon: !this.themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : undefined
            });
        }
        this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
        this.instantiationService.invokeFunction(accessor => {
            this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
        });
        this.addResourceOpenHandlers(resource, range);
    }
    renderOmittedWarning(friendlyName, ariaLabel) {
        const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-warning'));
        const textLabel = dom.$('span.chat-attached-context-custom-text', {}, friendlyName);
        this.element.appendChild(pillIcon);
        this.element.appendChild(textLabel);
        const hoverElement = dom.$('div.chat-attached-context-hover');
        hoverElement.setAttribute('aria-label', ariaLabel);
        this.element.classList.add('warning');
        hoverElement.textContent = localize('chat.fileAttachmentHover', "{0} does not support this file type.", this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name : this.currentLanguageModel ?? 'This model');
        this._register(this.hoverService.setupDelayedHover(this.element, {
            ...commonHoverOptions,
            content: hoverElement,
        }, commonHoverLifecycleOptions));
    }
};
FileAttachmentWidget = __decorate([
    __param(8, ICommandService),
    __param(9, IOpenerService),
    __param(10, IConfigurationService),
    __param(11, IThemeService),
    __param(12, IHoverService),
    __param(13, ILanguageModelsService),
    __param(14, IInstantiationService)
], FileAttachmentWidget);
export { FileAttachmentWidget };
let TerminalCommandAttachmentWidget = class TerminalCommandAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, terminalService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService, terminalService);
        this.hoverService = hoverService;
        this.terminalService = terminalService;
        const ariaLabel = localize('chat.terminalCommand', "Terminal command, {0}", attachment.command);
        const clickHandler = () => this.openResource(attachment.resource, { editorOptions: { preserveFocus: true } }, false, undefined);
        this._register(createTerminalCommandElements(this.element, attachment, ariaLabel, this.hoverService, clickHandler));
        this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, async (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(3 /* KeyCode.Enter */) || event.equals(10 /* KeyCode.Space */)) {
                dom.EventHelper.stop(e, true);
                await clickHandler();
            }
        }));
        this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    }
};
TerminalCommandAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IOpenerService),
    __param(7, IConfigurationService),
    __param(8, IHoverService),
    __param(9, ITerminalService)
], TerminalCommandAttachmentWidget);
export { TerminalCommandAttachmentWidget };
var TerminalConstants;
(function (TerminalConstants) {
    TerminalConstants[TerminalConstants["MaxAttachmentOutputLineCount"] = 5] = "MaxAttachmentOutputLineCount";
    TerminalConstants[TerminalConstants["MaxAttachmentOutputLineLength"] = 80] = "MaxAttachmentOutputLineLength";
})(TerminalConstants || (TerminalConstants = {}));
function createTerminalCommandElements(element, attachment, ariaLabel, hoverService, clickHandler) {
    const disposable = new DisposableStore();
    element.ariaLabel = ariaLabel;
    element.style.cursor = 'pointer';
    const terminalIconSpan = dom.$('span');
    terminalIconSpan.classList.add(...ThemeIcon.asClassNameArray(Codicon.terminal));
    const pillIcon = dom.$('div.chat-attached-context-pill', {}, terminalIconSpan);
    const textLabel = dom.$('span.chat-attached-context-custom-text', {}, attachment.command);
    element.appendChild(pillIcon);
    element.appendChild(textLabel);
    disposable.add(dom.addDisposableListener(element, dom.EventType.CLICK, e => {
        e.preventDefault();
        e.stopPropagation();
        clickHandler();
    }));
    disposable.add(hoverService.setupDelayedHover(element, () => getHoverContent(ariaLabel, attachment), commonHoverLifecycleOptions));
    return disposable;
}
function getHoverContent(ariaLabel, attachment) {
    {
        const hoverElement = dom.$('div.chat-attached-context-hover');
        hoverElement.setAttribute('aria-label', ariaLabel);
        const commandTitle = dom.$('div', {}, typeof attachment.exitCode === 'number'
            ? localize('chat.terminalCommandHoverCommandTitleExit', "Command: {0}, exit code: {1}", attachment.command, attachment.exitCode)
            : localize('chat.terminalCommandHoverCommandTitle', "Command"));
        commandTitle.classList.add('attachment-additional-info');
        const commandBlock = dom.$('pre.chat-terminal-command-block');
        hoverElement.append(commandTitle, commandBlock);
        if (attachment.output && attachment.output.trim().length > 0) {
            const outputTitle = dom.$('div', {}, localize('chat.terminalCommandHoverOutputTitle', "Output:"));
            outputTitle.classList.add('attachment-additional-info');
            const outputBlock = dom.$('pre.chat-terminal-command-output');
            const fullOutputLines = attachment.output.split('\n');
            const hoverOutputLines = [];
            for (const line of fullOutputLines) {
                if (hoverOutputLines.length >= 5 /* TerminalConstants.MaxAttachmentOutputLineCount */) {
                    hoverOutputLines.push('...');
                    break;
                }
                const trimmed = line.trim();
                if (trimmed.length === 0) {
                    continue;
                }
                if (trimmed.length > 80 /* TerminalConstants.MaxAttachmentOutputLineLength */) {
                    hoverOutputLines.push(`${trimmed.slice(0, 80 /* TerminalConstants.MaxAttachmentOutputLineLength */)}...`);
                }
                else {
                    hoverOutputLines.push(trimmed);
                }
            }
            outputBlock.textContent = hoverOutputLines.join('\n');
            hoverElement.append(outputTitle, outputBlock);
        }
        return {
            ...commonHoverOptions,
            content: hoverElement,
        };
    }
}
let ImageAttachmentWidget = class ImageAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(resource, attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, languageModelsService, instantiationService, labelService, chatEntitlementService, chatImageCarouselService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.hoverService = hoverService;
        this.languageModelsService = languageModelsService;
        this.labelService = labelService;
        this.chatEntitlementService = chatEntitlementService;
        this.chatImageCarouselService = chatImageCarouselService;
        let ariaLabel;
        if (attachment.omittedState === 2 /* OmittedState.Full */) {
            ariaLabel = localize('chat.omittedImageAttachment', "Omitted this image: {0}", attachment.name);
        }
        else if (attachment.omittedState === 1 /* OmittedState.Partial */) {
            ariaLabel = localize('chat.partiallyOmittedImageAttachment', "Partially omitted this image: {0}", attachment.name);
        }
        else if (attachment.omittedState === 3 /* OmittedState.ImageLimitExceeded */) {
            ariaLabel = localize('chat.imageLimitExceededAttachment', "Image not sent due to limit: {0}", attachment.name);
        }
        else {
            ariaLabel = localize('chat.imageAttachment', "Attached image, {0}", attachment.name);
        }
        const ref = attachment.references?.[0]?.reference;
        resource = ref && URI.isUri(ref) ? ref : undefined;
        const imageData = coerceImageBuffer(attachment.value);
        const clickHandler = async () => {
            if ((resource || imageData) && configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
                await this.openInCarousel(attachment.name, imageData, resource);
            }
            else if (resource) {
                await this.openResource(resource, { editorOptions: { preserveFocus: true } }, false, undefined);
            }
        };
        const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : 'Current model';
        const fullName = resource ? this.labelService.getUriLabel(resource) : (attachment.fullName || attachment.name);
        this._register(createImageElements(resource, attachment.name, fullName, this.element, imageData ?? attachment.value, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, attachment.omittedState, this.chatEntitlementService.previewFeaturesDisabled));
        this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
        // Wire up click + keyboard (Enter/Space) open handlers
        const canOpenCarousel = !!imageData && configurationService.getValue(ChatConfiguration.ImageCarouselEnabled);
        if (canOpenCarousel || resource) {
            this.element.style.cursor = 'pointer';
            this._register(registerOpenEditorListeners(this.element, async () => {
                await clickHandler();
            }));
        }
        if (resource) {
            instantiationService.invokeFunction(accessor => {
                this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
            });
        }
    }
    async openInCarousel(name, data, referenceUri) {
        const resource = referenceUri ?? URI.from({ scheme: 'data', path: name });
        await this.chatImageCarouselService.openCarouselAtResource(resource, data);
    }
};
ImageAttachmentWidget = __decorate([
    __param(6, ICommandService),
    __param(7, IOpenerService),
    __param(8, IConfigurationService),
    __param(9, IHoverService),
    __param(10, ILanguageModelsService),
    __param(11, IInstantiationService),
    __param(12, ILabelService),
    __param(13, IChatEntitlementService),
    __param(14, IChatImageCarouselService)
], ImageAttachmentWidget);
export { ImageAttachmentWidget };
function createImageElements(resource, name, fullName, element, buffer, hoverService, ariaLabel, currentLanguageModelName, clickHandler, currentLanguageModel, omittedState, previewFeaturesDisabled) {
    const disposable = new DisposableStore();
    if (omittedState === 1 /* OmittedState.Partial */) {
        element.classList.add('partial-warning');
    }
    element.ariaLabel = ariaLabel;
    element.style.position = 'relative';
    if (resource) {
        element.style.cursor = 'pointer';
    }
    const supportsVision = modelSupportsVision(currentLanguageModel);
    const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$((supportsVision && !previewFeaturesDisabled) ? 'span.codicon.codicon-file-media' : 'span.codicon.codicon-warning'));
    const textLabel = dom.$('span.chat-attached-context-custom-text', {}, name);
    element.appendChild(pillIcon);
    element.appendChild(textLabel);
    const hoverElement = dom.$('div.chat-attached-context-hover');
    hoverElement.setAttribute('aria-label', ariaLabel);
    if (previewFeaturesDisabled) {
        element.classList.add('warning');
        hoverElement.textContent = localize('chat.imageAttachmentPreviewFeaturesDisabled', "Vision is disabled by your organization.");
        disposable.add(hoverService.setupDelayedHover(element, {
            content: hoverElement,
            style: 1 /* HoverStyle.Pointer */,
        }));
    }
    else if ((!supportsVision && currentLanguageModel) || omittedState === 2 /* OmittedState.Full */) {
        element.classList.add('warning');
        hoverElement.textContent = localize('chat.imageAttachmentHover', "{0} does not support images.", currentLanguageModelName ?? 'This model');
        disposable.add(hoverService.setupDelayedHover(element, {
            content: hoverElement,
            style: 1 /* HoverStyle.Pointer */,
        }));
    }
    else if (omittedState === 3 /* OmittedState.ImageLimitExceeded */) {
        element.classList.add('warning');
        hoverElement.textContent = localize('chat.imageLimitExceededHover', "This image was not sent because the maximum of {0} images per request was exceeded.", MAX_IMAGES_PER_REQUEST);
        disposable.add(hoverService.setupDelayedHover(element, {
            content: hoverElement,
            style: 1 /* HoverStyle.Pointer */,
        }));
    }
    else {
        disposable.add(hoverService.setupDelayedHover(element, {
            content: hoverElement,
            style: 1 /* HoverStyle.Pointer */,
        }));
        const blob = new Blob([buffer], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const pillImg = dom.$('img.chat-attached-context-pill-image', { src: url, alt: '' });
        const pill = dom.$('div.chat-attached-context-pill', {}, pillImg);
        // eslint-disable-next-line no-restricted-syntax
        const existingPill = element.querySelector('.chat-attached-context-pill');
        if (existingPill) {
            existingPill.replaceWith(pill);
        }
        const hoverImage = dom.$('img.chat-attached-context-image', { src: url, alt: '' });
        const imageContainer = dom.$('div.chat-attached-context-image-container', {}, hoverImage);
        hoverElement.appendChild(imageContainer);
        if (resource) {
            const urlContainer = dom.$('a.chat-attached-context-url', {}, omittedState === 1 /* OmittedState.Partial */ ? localize('chat.imageAttachmentWarning', "This GIF was partially omitted - current frame will be sent.") : fullName);
            const separator = dom.$('div.chat-attached-context-url-separator');
            disposable.add(dom.addDisposableListener(urlContainer, 'click', () => clickHandler()));
            hoverElement.append(separator, urlContainer);
        }
        hoverImage.onload = () => { URL.revokeObjectURL(url); };
        hoverImage.onerror = () => {
            // reset to original icon on error or invalid image
            const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-file-media'));
            const pill = dom.$('div.chat-attached-context-pill', {}, pillIcon);
            // eslint-disable-next-line no-restricted-syntax
            const existingPill = element.querySelector('.chat-attached-context-pill');
            if (existingPill) {
                existingPill.replaceWith(pill);
            }
        };
    }
    return disposable;
}
let PasteAttachmentWidget = class PasteAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, instantiationService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.hoverService = hoverService;
        this.instantiationService = instantiationService;
        const ariaLabel = localize('chat.attachment', "Attached context, {0}", attachment.name);
        this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
        const classNames = ['file-icon', `${attachment.language}-lang-file-icon`];
        let resource;
        let range;
        if (attachment.copiedFrom) {
            resource = attachment.copiedFrom.uri;
            range = attachment.copiedFrom.range;
            const filename = basename(resource.path);
            this.label.setLabel(filename, undefined, { extraClasses: classNames });
        }
        else {
            this.label.setLabel(attachment.fileName, undefined, { extraClasses: classNames });
        }
        this.element.appendChild(dom.$('span.attachment-additional-info', {}, `Pasted ${attachment.pastedLines}`));
        this.element.style.position = 'relative';
        const sourceUri = attachment.copiedFrom?.uri;
        const hoverContent = new MarkdownString(`${sourceUri ? this.instantiationService.invokeFunction(accessor => accessor.get(ILabelService).getUriLabel(sourceUri, { relative: true })) : attachment.fileName}\n\n---\n\n\`\`\`${attachment.language}\n\n${attachment.code}\n\`\`\``);
        this._register(this.hoverService.setupDelayedHover(this.element, {
            ...commonHoverOptions,
            content: hoverContent,
        }, commonHoverLifecycleOptions));
        const copiedFromResource = attachment.copiedFrom?.uri;
        if (copiedFromResource) {
            this._register(this.instantiationService.invokeFunction(hookUpResourceAttachmentDragAndContextMenu, this.element, copiedFromResource));
            this.addResourceOpenHandlers(copiedFromResource, range);
        }
    }
};
PasteAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IOpenerService),
    __param(7, IConfigurationService),
    __param(8, IHoverService),
    __param(9, IInstantiationService)
], PasteAttachmentWidget);
export { PasteAttachmentWidget };
let DefaultChatAttachmentWidget = class DefaultChatAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(resource, range, attachment, correspondingContentReference, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, contextKeyService, instantiationService, hoverService, modelService, languageService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this.hoverService = hoverService;
        this.modelService = modelService;
        this.languageService = languageService;
        this._tooltipHover = this._register(new MutableDisposable());
        const attachmentLabel = attachment.fullName ?? attachment.name;
        // Derive icon classes from resourceUri for file/folder icons
        if (isStringVariableEntry(attachment) && attachment.icon && (ThemeIcon.isFile(attachment.icon) || ThemeIcon.isFolder(attachment.icon)) && attachment.resourceUri) {
            const fileKind = ThemeIcon.isFolder(attachment.icon) ? FileKind.FOLDER : FileKind.FILE;
            const iconClasses = getIconClasses(this.modelService, this.languageService, attachment.resourceUri, fileKind);
            this.label.setLabel(attachmentLabel, correspondingContentReference?.options?.status?.description, { extraClasses: iconClasses });
        }
        else {
            const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\u00A0${attachmentLabel}` : attachmentLabel;
            this.label.setLabel(withIcon, correspondingContentReference?.options?.status?.description);
        }
        this.element.ariaLabel = this.appendDeletionHint(localize('chat.attachment', "Attached context, {0}", attachment.name));
        if (attachment.kind === 'diagnostic') {
            if (attachment.filterUri) {
                resource = attachment.filterUri ? URI.revive(attachment.filterUri) : undefined;
                range = attachment.filterRange;
            }
            else {
                this.element.style.cursor = 'pointer';
                this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, () => {
                    this.commandService.executeCommand('workbench.panel.markers.view.focus');
                }));
            }
        }
        if (attachment.kind === 'symbol') {
            this._register(this.instantiationService.invokeFunction(hookUpSymbolAttachmentDragAndContextMenu, this.element, this.contextKeyService, { ...attachment, kind: attachment.symbolKind }, MenuId.ChatInputSymbolAttachmentContext));
        }
        // Handle click for string context attachments with context commands
        if (isStringVariableEntry(attachment) && attachment.commandId) {
            this.element.style.cursor = 'pointer';
            const contextItemHandle = attachment.handle;
            this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async () => {
                const chatContextService = this.instantiationService.invokeFunction(accessor => accessor.get(IChatContextService));
                await chatContextService.executeChatContextItemCommand(contextItemHandle);
            }));
        }
        // Handle click for debug events attachments
        if (attachment.kind === 'debugEvents') {
            this.element.style.cursor = 'pointer';
            this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, () => {
                const d = new Date(attachment.snapshotTime);
                const filter = `before:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                this.commandService.executeCommand('workbench.action.chat.openAgentDebugPanelForSession', attachment.sessionResource, filter);
            }));
        }
        // Setup tooltip hover for string context attachments
        if ((isStringVariableEntry(attachment) || attachment.kind === 'generic') && attachment.tooltip) {
            this._setupTooltipHover(attachment.tooltip);
        }
        if (resource) {
            this.addResourceOpenHandlers(resource, range);
        }
    }
    _setupTooltipHover(tooltip) {
        this._tooltipHover.value = this.hoverService.setupDelayedHover(this.element, {
            content: tooltip,
            appearance: { showPointer: true },
        });
    }
};
DefaultChatAttachmentWidget = __decorate([
    __param(8, ICommandService),
    __param(9, IOpenerService),
    __param(10, IConfigurationService),
    __param(11, IContextKeyService),
    __param(12, IInstantiationService),
    __param(13, IHoverService),
    __param(14, IModelService),
    __param(15, ILanguageService)
], DefaultChatAttachmentWidget);
export { DefaultChatAttachmentWidget };
let PromptFileAttachmentWidget = class PromptFileAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, labelService, instantiationService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.labelService = labelService;
        this.instantiationService = instantiationService;
        this.hintElement = dom.append(this.element, dom.$('span.prompt-type'));
        this.updateLabel(attachment);
        this.instantiationService.invokeFunction(accessor => {
            this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, attachment.value));
        });
        this.addResourceOpenHandlers(attachment.value, undefined);
    }
    updateLabel(attachment) {
        const resource = attachment.value;
        const fileBasename = basename(resource.path);
        const fileDirname = dirname(resource.path);
        const friendlyName = `${fileBasename} ${fileDirname}`;
        const isPrompt = attachment.id.startsWith(PromptFileVariableKind.PromptFile);
        const ariaLabel = isPrompt
            ? localize('chat.promptAttachment', "Prompt file, {0}", friendlyName)
            : localize('chat.instructionsAttachment', "Instructions attachment, {0}", friendlyName);
        const typeLabel = isPrompt
            ? localize('prompt', "Prompt")
            : localize('instructions', "Instructions");
        const title = this.labelService.getUriLabel(resource) + (attachment.originLabel ? `\n${attachment.originLabel}` : '');
        //const { topError } = this.promptFile;
        this.element.classList.remove('warning', 'error');
        // if there are some errors/warning during the process of resolving
        // attachment references (including all the nested child references),
        // add the issue details in the hover title for the attachment, one
        // error/warning at a time because there is a limited space available
        // if (topError) {
        // 	const { errorSubject: subject } = topError;
        // 	const isError = (subject === 'root');
        // 	this.element.classList.add((isError) ? 'error' : 'warning');
        // 	const severity = (isError)
        // 		? localize('error', "Error")
        // 		: localize('warning', "Warning");
        // 	title += `\n[${severity}]: ${topError.localizedMessage}`;
        // }
        const fileWithoutExtension = getCleanPromptName(resource);
        this.label.setFile(URI.file(fileWithoutExtension), {
            fileKind: FileKind.FILE,
            hidePath: true,
            range: undefined,
            title,
            icon: ThemeIcon.fromId(Codicon.bookmark.id),
            extraClasses: [],
        });
        this.hintElement.innerText = typeLabel;
        this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    }
};
PromptFileAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IOpenerService),
    __param(7, IConfigurationService),
    __param(8, ILabelService),
    __param(9, IInstantiationService)
], PromptFileAttachmentWidget);
export { PromptFileAttachmentWidget };
let PromptTextAttachmentWidget = class PromptTextAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, preferencesService, hoverService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        if (attachment.settingId) {
            const openSettings = () => preferencesService.openSettings({ jsonEditor: false, query: `@id:${attachment.settingId}` });
            this.element.style.cursor = 'pointer';
            this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async (e) => {
                dom.EventHelper.stop(e, true);
                openSettings();
            }));
            this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, async (e) => {
                const event = new StandardKeyboardEvent(e);
                if (event.equals(3 /* KeyCode.Enter */) || event.equals(10 /* KeyCode.Space */)) {
                    dom.EventHelper.stop(e, true);
                    openSettings();
                }
            }));
        }
        this.label.setLabel(localize('instructions.label', 'Additional Instructions'), undefined, undefined);
        this.element.ariaLabel = this.appendDeletionHint(localize('chat.attachment', "Attached context, {0}", attachment.name));
        this._register(hoverService.setupDelayedHover(this.element, {
            ...commonHoverOptions,
            content: attachment.value,
        }, commonHoverLifecycleOptions));
    }
};
PromptTextAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IOpenerService),
    __param(7, IConfigurationService),
    __param(8, IPreferencesService),
    __param(9, IHoverService)
], PromptTextAttachmentWidget);
export { PromptTextAttachmentWidget };
let ToolSetOrToolItemAttachmentWidget = class ToolSetOrToolItemAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, toolsService, commandService, openerService, configurationService, hoverService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        const toolOrToolSet = Iterable.find(toolsService.getTools(currentLanguageModel?.metadata), tool => tool.id === attachment.id) ?? Iterable.find(toolsService.getToolSetsForModel(currentLanguageModel?.metadata), toolSet => toolSet.id === attachment.id);
        let name = attachment.name;
        const icon = attachment.icon ?? Codicon.tools;
        if (isToolSet(toolOrToolSet)) {
            name = toolOrToolSet.referenceName;
        }
        else if (toolOrToolSet) {
            name = toolOrToolSet.toolReferenceName ?? name;
        }
        this.label.setLabel(`$(${icon.id})\u00A0${name}`, undefined);
        this.element.style.cursor = 'pointer';
        this.element.ariaLabel = this.appendDeletionHint(localize('chat.attachment', "Attached context, {0}", name));
        let hoverContent;
        if (isToolSet(toolOrToolSet)) {
            hoverContent = localize('toolset', "{0} - {1}", toolOrToolSet.description ?? toolOrToolSet.referenceName, toolOrToolSet.source.label);
        }
        else if (toolOrToolSet) {
            hoverContent = localize('tool', "{0} - {1}", toolOrToolSet.userDescription ?? toolOrToolSet.modelDescription, toolOrToolSet.source.label);
        }
        if (hoverContent) {
            this._register(hoverService.setupDelayedHover(this.element, {
                ...commonHoverOptions,
                content: hoverContent,
            }, commonHoverLifecycleOptions));
        }
    }
};
ToolSetOrToolItemAttachmentWidget = __decorate([
    __param(5, ILanguageModelToolsService),
    __param(6, ICommandService),
    __param(7, IOpenerService),
    __param(8, IConfigurationService),
    __param(9, IHoverService)
], ToolSetOrToolItemAttachmentWidget);
export { ToolSetOrToolItemAttachmentWidget };
let NotebookCellOutputChatAttachmentWidget = class NotebookCellOutputChatAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(resource, attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, languageModelsService, notebookService, instantiationService, chatEntitlementService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.hoverService = hoverService;
        this.languageModelsService = languageModelsService;
        this.notebookService = notebookService;
        this.instantiationService = instantiationService;
        this.chatEntitlementService = chatEntitlementService;
        switch (attachment.mimeType) {
            case 'application/vnd.code.notebook.error': {
                this.renderErrorOutput(resource, attachment);
                break;
            }
            case 'image/png':
            case 'image/jpeg':
            case 'image/svg': {
                this.renderImageOutput(resource, attachment);
                break;
            }
            default: {
                this.renderGenericOutput(resource, attachment);
            }
        }
        this.instantiationService.invokeFunction(accessor => {
            this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
        });
        this.addResourceOpenHandlers(resource, undefined);
    }
    getAriaLabel(attachment) {
        return localize('chat.NotebookImageAttachment', "Attached Notebook output, {0}", attachment.name);
    }
    renderErrorOutput(resource, attachment) {
        const attachmentLabel = attachment.name;
        const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\u00A0${attachmentLabel}` : attachmentLabel;
        const buffer = this.getOutputItem(resource, attachment)?.data.buffer ?? new Uint8Array();
        let title = undefined;
        try {
            const error = JSON.parse(new TextDecoder().decode(buffer));
            if (error.name && error.message) {
                title = `${error.name}: ${error.message}`;
            }
        }
        catch {
            //
        }
        this.label.setLabel(withIcon, undefined, { title });
        this.element.ariaLabel = this.appendDeletionHint(this.getAriaLabel(attachment));
    }
    renderGenericOutput(resource, attachment) {
        this.element.ariaLabel = this.appendDeletionHint(this.getAriaLabel(attachment));
        this.label.setFile(resource, { hidePath: true, icon: ThemeIcon.fromId('output') });
    }
    renderImageOutput(resource, attachment) {
        let ariaLabel;
        if (attachment.omittedState === 2 /* OmittedState.Full */) {
            ariaLabel = localize('chat.omittedNotebookImageAttachment', "Omitted this Notebook ouput: {0}", attachment.name);
        }
        else if (attachment.omittedState === 1 /* OmittedState.Partial */) {
            ariaLabel = localize('chat.partiallyOmittedNotebookImageAttachment', "Partially omitted this Notebook output: {0}", attachment.name);
        }
        else {
            ariaLabel = this.getAriaLabel(attachment);
        }
        const clickHandler = async () => await this.openResource(resource, { editorOptions: { preserveFocus: true } }, false, undefined);
        const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : undefined;
        const buffer = this.getOutputItem(resource, attachment)?.data.buffer ?? new Uint8Array();
        this._register(createImageElements(resource, attachment.name, attachment.name, this.element, buffer, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, attachment.omittedState, this.chatEntitlementService.previewFeaturesDisabled));
        this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    }
    getOutputItem(resource, attachment) {
        const parsedInfo = CellUri.parseCellOutputUri(resource);
        if (!parsedInfo || typeof parsedInfo.cellHandle !== 'number' || typeof parsedInfo.outputIndex !== 'number') {
            return undefined;
        }
        const notebook = this.notebookService.getNotebookTextModel(parsedInfo.notebook);
        if (!notebook) {
            return undefined;
        }
        const cell = notebook.cells.find(c => c.handle === parsedInfo.cellHandle);
        if (!cell) {
            return undefined;
        }
        const output = cell.outputs.length > parsedInfo.outputIndex ? cell.outputs[parsedInfo.outputIndex] : undefined;
        return output?.outputs.find(o => o.mime === attachment.mimeType);
    }
};
NotebookCellOutputChatAttachmentWidget = __decorate([
    __param(6, ICommandService),
    __param(7, IOpenerService),
    __param(8, IConfigurationService),
    __param(9, IHoverService),
    __param(10, ILanguageModelsService),
    __param(11, INotebookService),
    __param(12, IInstantiationService),
    __param(13, IChatEntitlementService)
], NotebookCellOutputChatAttachmentWidget);
export { NotebookCellOutputChatAttachmentWidget };
let ElementChatAttachmentWidget = class ElementChatAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, editorService, hoverService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.editorService = editorService;
        this.hoverService = hoverService;
        const ariaLabel = localize('chat.elementAttachment', "Attached element, {0}", attachment.name);
        this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
        this.element.style.position = 'relative';
        this.element.style.cursor = 'pointer';
        const attachmentLabel = attachment.name;
        const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\u00A0${attachmentLabel}` : attachmentLabel;
        this.label.setLabel(withIcon, undefined, { title: localize('chat.clickToViewContents', "Click to view the contents of: {0}", attachmentLabel) });
        this._register(this.hoverService.setupDelayedHover(this.element, this.getHoverContent(attachment), commonHoverLifecycleOptions));
        this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async () => {
            await this.openElementAttachment(attachment);
        }));
    }
    getHoverContent(attachment) {
        if (!this.shouldRenderRichElementHover(attachment)) {
            return this.getSimpleHoverContent(attachment);
        }
        const hoverElement = dom.$('div.chat-attached-context-hover.chat-element-hover');
        // Wrap all sections in a scrollable container for VS Code styled scrollbar
        const scrollableContent = dom.$('div.chat-element-hover-content');
        const innerScrollables = [];
        // ELEMENT section: show the selected element tag with all attributes
        {
            const section = dom.$('div.chat-element-hover-section');
            const header = dom.$('div.chat-element-hover-header', {}, localize('chat.elementHover.element', "ELEMENT"));
            section.appendChild(header);
            const elementPre = dom.$('pre.chat-element-hover-code');
            const elementCode = dom.$('code');
            // Build the element tag from the outerHTML (just the opening tag)
            const tagDisplay = this.formatElementTag(attachment);
            elementCode.textContent = tagDisplay;
            elementPre.appendChild(elementCode);
            const elementScrollable = this._register(new DomScrollableElement(elementPre, {
                horizontal: 1 /* ScrollbarVisibility.Auto */,
                vertical: 2 /* ScrollbarVisibility.Hidden */,
            }));
            innerScrollables.push(elementScrollable);
            section.appendChild(elementScrollable.getDomNode());
            scrollableContent.appendChild(section);
        }
        // KEY COMPUTED STYLES section
        const computedStyleEntries = this.getComputedStyleEntriesForHover(attachment.computedStyles);
        if (computedStyleEntries.length > 0) {
            const section = dom.$('div.chat-element-hover-section');
            const header = dom.$('div.chat-element-hover-header', {}, localize('chat.elementHover.computedStyles', "KEY COMPUTED STYLES"));
            section.appendChild(header);
            const table = dom.$('div.chat-element-hover-table');
            for (const [name, value] of computedStyleEntries) {
                const row = dom.$('div.chat-element-hover-row');
                row.appendChild(dom.$('span.chat-element-hover-label', {}, `${name}:`));
                const valueContainer = dom.$('span.chat-element-hover-value');
                // Show color swatch for color properties
                if ((name === 'color' || name === 'background-color') && value) {
                    const swatch = dom.$('span.chat-element-hover-color-swatch');
                    swatch.style.backgroundColor = value;
                    valueContainer.appendChild(swatch);
                }
                valueContainer.appendChild(document.createTextNode(value));
                row.appendChild(valueContainer);
                table.appendChild(row);
            }
            section.appendChild(table);
            const showMoreButton = dom.$('button.chat-element-hover-show-more', { type: 'button' }, localize('chat.elementHover.showMore', "Show More..."));
            this._register(dom.addDisposableListener(showMoreButton, dom.EventType.CLICK, async (e) => {
                dom.EventHelper.stop(e, true);
                await this.openElementAttachment(attachment);
            }));
            section.appendChild(showMoreButton);
            scrollableContent.appendChild(section);
        }
        // HTML PATH section: render ancestor chain as indented HTML tree
        if (attachment.ancestors && attachment.ancestors.length > 1) {
            const section = dom.$('div.chat-element-hover-section');
            const header = dom.$('div.chat-element-hover-header', {}, localize('chat.elementHover.htmlPath', "HTML PATH"));
            section.appendChild(header);
            const lines = [];
            for (let i = 0; i < attachment.ancestors.length; i++) {
                const ancestor = attachment.ancestors[i];
                const indent = '  '.repeat(i);
                const tag = this.formatAncestorTag(ancestor);
                lines.push(`${indent}${tag}`);
            }
            const pathPre = dom.$('pre.chat-element-hover-code');
            const pathCode = dom.$('code');
            pathCode.textContent = lines.join('\n');
            pathPre.appendChild(pathCode);
            const pathScrollable = this._register(new DomScrollableElement(pathPre, {
                horizontal: 1 /* ScrollbarVisibility.Auto */,
                vertical: 2 /* ScrollbarVisibility.Hidden */,
            }));
            innerScrollables.push(pathScrollable);
            section.appendChild(pathScrollable.getDomNode());
            scrollableContent.appendChild(section);
        }
        // ATTRIBUTES section
        if (attachment.attributes && Object.keys(attachment.attributes).length > 0) {
            const section = dom.$('div.chat-element-hover-section');
            const header = dom.$('div.chat-element-hover-header', {}, localize('chat.elementHover.attributes', "ATTRIBUTES"));
            section.appendChild(header);
            const table = dom.$('div.chat-element-hover-table');
            for (const [name, value] of Object.entries(attachment.attributes)) {
                const row = dom.$('div.chat-element-hover-row');
                row.appendChild(dom.$('span.chat-element-hover-label', {}, `${name}:`));
                row.appendChild(dom.$('span.chat-element-hover-value', {}, value));
                table.appendChild(row);
            }
            section.appendChild(table);
            scrollableContent.appendChild(section);
        }
        // POSITION & SIZE section
        if (attachment.dimensions) {
            const section = dom.$('div.chat-element-hover-section');
            const header = dom.$('div.chat-element-hover-header', {}, localize('chat.elementHover.positionSize', "POSITION & SIZE"));
            section.appendChild(header);
            const table = dom.$('div.chat-element-hover-table');
            const dims = [
                ['top:', attachment.dimensions.top],
                ['left:', attachment.dimensions.left],
                ['width:', attachment.dimensions.width],
                ['height:', attachment.dimensions.height],
            ];
            for (const [label, val] of dims) {
                const row = dom.$('div.chat-element-hover-row');
                row.appendChild(dom.$('span.chat-element-hover-label', {}, label));
                row.appendChild(dom.$('span.chat-element-hover-value', {}, `${Math.round(val)}px`));
                table.appendChild(row);
            }
            section.appendChild(table);
            scrollableContent.appendChild(section);
        }
        // INNER TEXT section
        if (attachment.innerText) {
            const section = dom.$('div.chat-element-hover-section');
            const header = dom.$('div.chat-element-hover-header', {}, localize('chat.elementHover.innerText', "INNER TEXT"));
            section.appendChild(header);
            section.appendChild(dom.$('div.chat-element-hover-text', {}, attachment.innerText));
            scrollableContent.appendChild(section);
        }
        const scrollableElement = this._register(new DomScrollableElement(scrollableContent, {
            vertical: 1 /* ScrollbarVisibility.Auto */,
            horizontal: 2 /* ScrollbarVisibility.Hidden */,
            consumeMouseWheelIfScrollbarIsNeeded: true,
        }));
        const scrollableDomNode = scrollableElement.getDomNode();
        scrollableDomNode.classList.add('chat-element-hover-scrollable');
        hoverElement.appendChild(scrollableDomNode);
        return {
            ...commonHoverOptions,
            content: hoverElement,
            additionalClasses: ['chat-element-data-hover'],
            onDidShow: () => {
                for (const s of innerScrollables) {
                    s.scanDomNode();
                }
                scrollableElement.scanDomNode();
            },
        };
    }
    shouldRenderRichElementHover(attachment) {
        if (attachment.dimensions || attachment.innerText) {
            return true;
        }
        if (attachment.ancestors && attachment.ancestors.length > 0) {
            return true;
        }
        if (attachment.attributes && Object.keys(attachment.attributes).length > 0) {
            return true;
        }
        if (attachment.computedStyles && Object.keys(attachment.computedStyles).length > 0) {
            return true;
        }
        return false;
    }
    getSimpleHoverContent(attachment) {
        const content = attachment.value?.toString() ?? '';
        const hoverContent = new MarkdownString();
        hoverContent.appendText(attachment.fullName ?? attachment.name);
        if (content.trim().length > 0) {
            hoverContent.appendMarkdown('\n\n');
            hoverContent.appendCodeblock('text', content);
        }
        return {
            ...commonHoverOptions,
            content: hoverContent,
        };
    }
    getComputedStyleEntriesForHover(computedStyles) {
        if (!computedStyles) {
            return [];
        }
        const keyEntries = [];
        for (const property of KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES) {
            if (property === 'margin' || property === 'padding') {
                const shorthand = this.getBoxShorthandValue(computedStyles, property);
                if (typeof shorthand === 'string') {
                    keyEntries.push([property, shorthand]);
                    continue;
                }
            }
            const value = computedStyles[property];
            if (typeof value === 'string') {
                keyEntries.push([property, value]);
            }
        }
        // Fallback for older payloads that might not include the key properties.
        if (keyEntries.length > 0) {
            return keyEntries;
        }
        return Object.entries(computedStyles).slice(0, KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES.length);
    }
    getBoxShorthandValue(computedStyles, propertyName) {
        const top = computedStyles[`${propertyName}-top`];
        const right = computedStyles[`${propertyName}-right`];
        const bottom = computedStyles[`${propertyName}-bottom`];
        const left = computedStyles[`${propertyName}-left`];
        if (typeof top === 'string' && typeof right === 'string' && typeof bottom === 'string' && typeof left === 'string') {
            return `${top} ${right} ${bottom} ${left}`;
        }
        return computedStyles[propertyName];
    }
    async openElementAttachment(attachment) {
        const content = attachment.value?.toString() || '';
        await this.editorService.openEditor({
            resource: undefined,
            contents: content,
            options: {
                pinned: true
            }
        });
    }
    formatElementTag(attachment) {
        // Extract the opening tag from the outerHTML within the value string
        // Value format: "Attached HTML and CSS Context\n\n<tag ...>...</tag>\n\n..."
        const content = attachment.value?.toString() ?? '';
        const htmlMatch = content.match(/\n\n(<[^>]+>)/);
        if (htmlMatch) {
            return htmlMatch[1];
        }
        // Fallback: try first tag in content
        const fallback = content.match(/<([^>]+)>/);
        if (fallback) {
            return `<${fallback[1]}>`;
        }
        return `<${attachment.name}>`;
    }
    formatAncestorTag(ancestor) {
        const parts = [`<${ancestor.tagName}`];
        if (ancestor.classNames?.length) {
            parts.push(` class="${ancestor.classNames.join(' ')}"`);
        }
        if (ancestor.id) {
            parts.push(` id="${ancestor.id}"`);
        }
        return parts.join('') + '>';
    }
};
ElementChatAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IOpenerService),
    __param(7, IConfigurationService),
    __param(8, IEditorService),
    __param(9, IHoverService)
], ElementChatAttachmentWidget);
export { ElementChatAttachmentWidget };
let SCMHistoryItemAttachmentWidget = class SCMHistoryItemAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, markdownRendererService, hoverService, openerService, configurationService, themeService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.label.setLabel(attachment.name, undefined);
        this.element.style.cursor = 'pointer';
        this.element.ariaLabel = this.appendDeletionHint(localize('chat.attachment', "Attached context, {0}", attachment.name));
        const { content, disposables } = toHistoryItemHoverContent(markdownRendererService, attachment.historyItem, false);
        this._store.add(hoverService.setupDelayedHover(this.element, {
            ...commonHoverOptions,
            content,
        }, commonHoverLifecycleOptions));
        this._store.add(disposables);
        this._store.add(dom.addDisposableListener(this.element, dom.EventType.CLICK, (e) => {
            dom.EventHelper.stop(e, true);
            this._openAttachment(attachment);
        }));
        this._store.add(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(3 /* KeyCode.Enter */) || event.equals(10 /* KeyCode.Space */)) {
                dom.EventHelper.stop(e, true);
                this._openAttachment(attachment);
            }
        }));
    }
    async _openAttachment(attachment) {
        await this.commandService.executeCommand('_workbench.openMultiDiffEditor', {
            title: getHistoryItemEditorTitle(attachment.historyItem), multiDiffSourceUri: attachment.value
        });
    }
};
SCMHistoryItemAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IMarkdownRendererService),
    __param(7, IHoverService),
    __param(8, IOpenerService),
    __param(9, IConfigurationService),
    __param(10, IThemeService)
], SCMHistoryItemAttachmentWidget);
export { SCMHistoryItemAttachmentWidget };
let SCMHistoryItemChangeAttachmentWidget = class SCMHistoryItemChangeAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, hoverService, markdownRendererService, openerService, configurationService, themeService, editorService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.editorService = editorService;
        const nameSuffix = `\u00A0$(${Codicon.gitCommit.id})${attachment.historyItem.displayId ?? attachment.historyItem.id}`;
        this.label.setFile(attachment.value, { fileKind: FileKind.FILE, hidePath: true, nameSuffix });
        this.element.ariaLabel = this.appendDeletionHint(localize('chat.attachment', "Attached context, {0}", attachment.name));
        const { content, disposables } = toHistoryItemHoverContent(markdownRendererService, attachment.historyItem, false);
        this._store.add(hoverService.setupDelayedHover(this.element, {
            ...commonHoverOptions, content,
        }, commonHoverLifecycleOptions));
        this._store.add(disposables);
        this.addResourceOpenHandlers(attachment.value, undefined);
    }
    async openResource(resource, options, isDirectory, range) {
        const attachment = this.attachment;
        const historyItem = attachment.historyItem;
        await this.editorService.openEditor({
            resource,
            label: `${basename(resource.path)} (${historyItem.displayId ?? historyItem.id})`,
            options: { ...options.editorOptions }
        }, options.openToSide ? SIDE_GROUP : undefined);
    }
};
SCMHistoryItemChangeAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IHoverService),
    __param(7, IMarkdownRendererService),
    __param(8, IOpenerService),
    __param(9, IConfigurationService),
    __param(10, IThemeService),
    __param(11, IEditorService)
], SCMHistoryItemChangeAttachmentWidget);
export { SCMHistoryItemChangeAttachmentWidget };
let SCMHistoryItemChangeRangeAttachmentWidget = class SCMHistoryItemChangeRangeAttachmentWidget extends AbstractChatAttachmentWidget {
    constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, editorService) {
        super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
        this.editorService = editorService;
        const historyItemStartId = attachment.historyItemChangeStart.historyItem.displayId ?? attachment.historyItemChangeStart.historyItem.id;
        const historyItemEndId = attachment.historyItemChangeEnd.historyItem.displayId ?? attachment.historyItemChangeEnd.historyItem.id;
        const nameSuffix = `\u00A0$(${Codicon.gitCommit.id})${historyItemStartId}..${historyItemEndId}`;
        this.label.setFile(attachment.value, { fileKind: FileKind.FILE, hidePath: true, nameSuffix });
        this.element.ariaLabel = this.appendDeletionHint(localize('chat.attachment', "Attached context, {0}", attachment.name));
        this.addResourceOpenHandlers(attachment.value, undefined);
    }
    async openResource(resource, options, isDirectory, range) {
        const attachment = this.attachment;
        const historyItemChangeStart = attachment.historyItemChangeStart;
        const historyItemChangeEnd = attachment.historyItemChangeEnd;
        const originalUriTitle = `${basename(historyItemChangeStart.uri.fsPath)} (${historyItemChangeStart.historyItem.displayId ?? historyItemChangeStart.historyItem.id})`;
        const modifiedUriTitle = `${basename(historyItemChangeEnd.uri.fsPath)} (${historyItemChangeEnd.historyItem.displayId ?? historyItemChangeEnd.historyItem.id})`;
        await this.editorService.openEditor({
            original: { resource: historyItemChangeStart.uri },
            modified: { resource: historyItemChangeEnd.uri },
            label: `${originalUriTitle} ↔ ${modifiedUriTitle}`,
            options: { ...options.editorOptions }
        }, options.openToSide ? SIDE_GROUP : undefined);
    }
};
SCMHistoryItemChangeRangeAttachmentWidget = __decorate([
    __param(5, ICommandService),
    __param(6, IOpenerService),
    __param(7, IConfigurationService),
    __param(8, IEditorService)
], SCMHistoryItemChangeRangeAttachmentWidget);
export { SCMHistoryItemChangeRangeAttachmentWidget };
export function hookUpResourceAttachmentDragAndContextMenu(accessor, widget, resource) {
    const contextKeyService = accessor.get(IContextKeyService);
    const instantiationService = accessor.get(IInstantiationService);
    const store = new DisposableStore();
    // Context
    const scopedContextKeyService = store.add(contextKeyService.createScoped(widget));
    setResourceContext(accessor, scopedContextKeyService, resource);
    // Drag and drop
    widget.draggable = true;
    store.add(dom.addDisposableListener(widget, 'dragstart', e => {
        instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, [resource], e));
        e.dataTransfer?.setDragImage(widget, 0, 0);
    }));
    // Context menu
    store.add(addBasicContextMenu(accessor, widget, scopedContextKeyService, MenuId.ChatInputResourceAttachmentContext, resource));
    return store;
}
export function hookUpSymbolAttachmentDragAndContextMenu(accessor, widget, parentContextKeyService, attachment, contextMenuId) {
    const instantiationService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const textModelService = accessor.get(ITextModelService);
    const contextMenuService = accessor.get(IContextMenuService);
    const menuService = accessor.get(IMenuService);
    const store = new DisposableStore();
    // Drag and drop
    widget.draggable = true;
    store.add(dom.addDisposableListener(widget, 'dragstart', e => {
        instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, [{ resource: attachment.value.uri, selection: attachment.value.range }], e));
        fillInSymbolsDragData([{
                fsPath: attachment.value.uri.fsPath,
                range: attachment.value.range,
                name: attachment.name,
                kind: attachment.kind,
            }], e);
        e.dataTransfer?.setDragImage(widget, 0, 0);
    }));
    // Context menu (context key service and resource contexts are initialized lazily on first context menu open)
    let scopedContextKeyService;
    let providerContexts;
    const ensureContextKeyService = () => {
        if (!scopedContextKeyService) {
            scopedContextKeyService = store.add(parentContextKeyService.createScoped(widget));
            chatAttachmentResourceContextKey.bindTo(scopedContextKeyService).set(attachment.value.uri.toString());
            setResourceContext(accessor, scopedContextKeyService, attachment.value.uri);
        }
        return scopedContextKeyService;
    };
    const ensureProviderContexts = () => {
        const cks = ensureContextKeyService();
        if (!providerContexts) {
            providerContexts = [
                [EditorContextKeys.hasDefinitionProvider.bindTo(cks), languageFeaturesService.definitionProvider],
                [EditorContextKeys.hasReferenceProvider.bindTo(cks), languageFeaturesService.referenceProvider],
                [EditorContextKeys.hasImplementationProvider.bindTo(cks), languageFeaturesService.implementationProvider],
                [EditorContextKeys.hasTypeDefinitionProvider.bindTo(cks), languageFeaturesService.typeDefinitionProvider],
            ];
        }
    };
    const updateContextKeys = async () => {
        ensureProviderContexts();
        const modelRef = await textModelService.createModelReference(attachment.value.uri);
        try {
            const model = modelRef.object.textEditorModel;
            for (const [contextKey, registry] of providerContexts) {
                contextKey.set(registry.has(model));
            }
        }
        finally {
            modelRef.dispose();
        }
    };
    store.add(dom.addDisposableListener(widget, dom.EventType.CONTEXT_MENU, async (domEvent) => {
        const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
        dom.EventHelper.stop(domEvent, true);
        const cks = ensureContextKeyService();
        try {
            await updateContextKeys();
        }
        catch (e) {
            console.error(e);
        }
        contextMenuService.showContextMenu({
            contextKeyService: cks,
            getAnchor: () => event,
            getActions: () => {
                const menu = menuService.getMenuActions(contextMenuId, cks, { arg: attachment.value });
                return getFlatContextMenuActions(menu);
            },
        });
    }));
    return store;
}
function setResourceContext(accessor, scopedContextKeyService, resource) {
    const fileService = accessor.get(IFileService);
    const languageService = accessor.get(ILanguageService);
    const modelService = accessor.get(IModelService);
    const resourceContextKey = new StaticResourceContextKey(scopedContextKeyService, fileService, languageService, modelService);
    resourceContextKey.set(resource);
}
function addBasicContextMenu(accessor, widget, scopedContextKeyService, menuId, arg, updateContextKeys) {
    const contextMenuService = accessor.get(IContextMenuService);
    const menuService = accessor.get(IMenuService);
    return dom.addDisposableListener(widget, dom.EventType.CONTEXT_MENU, async (domEvent) => {
        const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
        dom.EventHelper.stop(domEvent, true);
        try {
            await updateContextKeys?.();
        }
        catch (e) {
            console.error(e);
        }
        contextMenuService.showContextMenu({
            contextKeyService: scopedContextKeyService,
            getAnchor: () => event,
            getActions: () => {
                const menu = menuService.getMenuActions(menuId, scopedContextKeyService, { arg });
                return getFlatContextMenuActions(menu);
            },
        });
    });
}
export const chatAttachmentResourceContextKey = new RawContextKey('chatAttachmentResource', undefined, { type: 'URI', description: localize('resource', "The full value of the chat attachment resource, including scheme and path") });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEF0dGFjaG1lbnRXaWRnZXRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFekUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFFMUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDckcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sS0FBSyxLQUFLLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0SCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUV2RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNB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