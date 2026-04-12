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
import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { isElementVariableEntry, isImageVariableEntry, isNotebookOutputVariableEntry, isPasteVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isSCMHistoryItemChangeRangeVariableEntry, isSCMHistoryItemChangeVariableEntry, isSCMHistoryItemVariableEntry, isTerminalVariableEntry, isWorkspaceVariableEntry, MAX_IMAGES_PER_REQUEST } from '../../../common/attachments/chatVariableEntries.js';
import { ChatResponseReferencePartStatusKind } from '../../../common/chatService/chatService.js';
import { DefaultChatAttachmentWidget, ElementChatAttachmentWidget, FileAttachmentWidget, ImageAttachmentWidget, NotebookCellOutputChatAttachmentWidget, PasteAttachmentWidget, PromptFileAttachmentWidget, PromptTextAttachmentWidget, SCMHistoryItemAttachmentWidget, SCMHistoryItemChangeAttachmentWidget, SCMHistoryItemChangeRangeAttachmentWidget, TerminalCommandAttachmentWidget, ToolSetOrToolItemAttachmentWidget } from '../../attachments/chatAttachmentWidgets.js';
import { IChatAttachmentWidgetRegistry } from '../../attachments/chatAttachmentWidgetRegistry.js';
let ChatAttachmentsContentPart = class ChatAttachmentsContentPart extends Disposable {
    constructor(options, instantiationService, chatAttachmentWidgetRegistry) {
        super();
        this.instantiationService = instantiationService;
        this.chatAttachmentWidgetRegistry = chatAttachmentWidgetRegistry;
        this.attachedContextDisposables = this._register(new DisposableStore());
        this._onDidChangeVisibility = this._register(new Emitter());
        this._showingAll = false;
        this._variables = options.variables;
        this.contentReferences = options.contentReferences ?? [];
        this.limit = options.limit;
        this.domNode = options.domNode ?? dom.$('.chat-attached-context');
        this._contextResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));
        this.initAttachedContext(this.domNode);
        if (!this.domNode.childElementCount) {
            this.domNode = undefined;
        }
    }
    /**
     * Update the variables and re-render the attachments in place.
     */
    updateVariables(variables) {
        this._variables = variables;
        if (this.domNode) {
            this.initAttachedContext(this.domNode);
        }
    }
    initAttachedContext(container) {
        dom.clearNode(container);
        this.attachedContextDisposables.clear();
        const visibleAttachments = this.getVisibleAttachments();
        const hasMoreAttachments = this.limit && this._variables.length > this.limit && !this._showingAll;
        this.markImageLimitExceeded(this._variables);
        for (const attachment of visibleAttachments) {
            this.renderAttachment(attachment, container);
        }
        if (hasMoreAttachments) {
            this.renderShowMoreButton(container);
        }
    }
    getVisibleAttachments() {
        if (!this.limit || this._showingAll) {
            return this._variables;
        }
        return this._variables.slice(0, this.limit);
    }
    /**
     * When the total number of image attachments exceeds the per-request limit,
     * mark the oldest images (those that will be dropped by the backend) with
     * {@link OmittedState.ImageLimitExceeded}.
     */
    markImageLimitExceeded(attachments) {
        const imageAttachments = attachments.filter(isImageVariableEntry);
        if (imageAttachments.length <= MAX_IMAGES_PER_REQUEST) {
            return;
        }
        // The backend keeps the most-recent images, so mark the oldest ones as exceeded.
        // Only overwrite NotOmitted or ImageLimitExceeded to avoid clobbering other states (e.g. Partial for GIFs).
        const excessCount = imageAttachments.length - MAX_IMAGES_PER_REQUEST;
        for (let i = 0; i < excessCount; i++) {
            if (imageAttachments[i].omittedState === 0 /* OmittedState.NotOmitted */ || imageAttachments[i].omittedState === 3 /* OmittedState.ImageLimitExceeded */) {
                imageAttachments[i].omittedState = 3 /* OmittedState.ImageLimitExceeded */;
            }
        }
    }
    renderShowMoreButton(container) {
        const remainingCount = this._variables.length - (this.limit ?? 0);
        // Create a button that looks like the attachment pills
        const showMoreButton = dom.$('div.chat-attached-context-attachment.chat-attachments-show-more-button');
        showMoreButton.setAttribute('role', 'button');
        showMoreButton.setAttribute('tabindex', '0');
        showMoreButton.style.cursor = 'pointer';
        // Add pill icon (ellipsis)
        const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-ellipsis'));
        // Add text label
        const textLabel = dom.$('span.chat-attached-context-custom-text');
        textLabel.textContent = `${remainingCount} more`;
        showMoreButton.appendChild(pillIcon);
        showMoreButton.appendChild(textLabel);
        // Add click and keyboard event handlers
        const clickHandler = () => {
            this._showingAll = true;
            this.initAttachedContext(container);
        };
        this.attachedContextDisposables.add(dom.addDisposableListener(showMoreButton, 'click', clickHandler));
        this.attachedContextDisposables.add(dom.addDisposableListener(showMoreButton, 'keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clickHandler();
            }
        }));
        container.appendChild(showMoreButton);
        this.attachedContextDisposables.add({ dispose: () => showMoreButton.remove() });
    }
    renderAttachment(attachment, container) {
        const resource = URI.isUri(attachment.value) ? attachment.value : attachment.value && typeof attachment.value === 'object' && 'uri' in attachment.value && URI.isUri(attachment.value.uri) ? attachment.value.uri : undefined;
        const range = attachment.value && typeof attachment.value === 'object' && 'range' in attachment.value && Range.isIRange(attachment.value.range) ? attachment.value.range : undefined;
        const correspondingContentReference = this.contentReferences.find((ref) => (typeof ref.reference === 'object' && 'variableName' in ref.reference && ref.reference.variableName === attachment.name) || (URI.isUri(ref.reference) && basename(ref.reference.path) === attachment.name));
        const isAttachmentOmitted = correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted;
        const isAttachmentPartialOrOmitted = isAttachmentOmitted || correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial;
        let widget;
        if (attachment.kind === 'tool' || attachment.kind === 'toolset') {
            widget = this.instantiationService.createInstance(ToolSetOrToolItemAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isElementVariableEntry(attachment)) {
            widget = this.instantiationService.createInstance(ElementChatAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isImageVariableEntry(attachment)) {
            attachment.omittedState = isAttachmentPartialOrOmitted ? 2 /* OmittedState.Full */ : attachment.omittedState;
            widget = this.instantiationService.createInstance(ImageAttachmentWidget, resource, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isPromptFileVariableEntry(attachment)) {
            if (attachment.automaticallyAdded) {
                return; // Skip automatically added prompt files
            }
            widget = this.instantiationService.createInstance(PromptFileAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isPromptTextVariableEntry(attachment)) {
            if (attachment.automaticallyAdded) {
                return; // Skip automatically added prompt text
            }
            widget = this.instantiationService.createInstance(PromptTextAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (resource && (attachment.kind === 'file' || attachment.kind === 'directory')) {
            widget = this.instantiationService.createInstance(FileAttachmentWidget, resource, range, attachment, correspondingContentReference, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isTerminalVariableEntry(attachment)) {
            widget = this.instantiationService.createInstance(TerminalCommandAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isPasteVariableEntry(attachment)) {
            widget = this.instantiationService.createInstance(PasteAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (resource && isNotebookOutputVariableEntry(attachment)) {
            widget = this.instantiationService.createInstance(NotebookCellOutputChatAttachmentWidget, resource, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isSCMHistoryItemVariableEntry(attachment)) {
            widget = this.instantiationService.createInstance(SCMHistoryItemAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isSCMHistoryItemChangeVariableEntry(attachment)) {
            widget = this.instantiationService.createInstance(SCMHistoryItemChangeAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isSCMHistoryItemChangeRangeVariableEntry(attachment)) {
            widget = this.instantiationService.createInstance(SCMHistoryItemChangeRangeAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        else if (isWorkspaceVariableEntry(attachment)) {
            // skip workspace attachments
            return;
        }
        else {
            widget = this.chatAttachmentWidgetRegistry.createWidget(attachment, { shouldFocusClearButton: false, supportsDeletion: false }, container)
                ?? this.instantiationService.createInstance(DefaultChatAttachmentWidget, resource, range, attachment, correspondingContentReference, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
        }
        let ariaLabel = null;
        if (isAttachmentPartialOrOmitted) {
            widget.element.classList.add('warning');
        }
        const description = correspondingContentReference?.options?.status?.description;
        if (isAttachmentPartialOrOmitted) {
            ariaLabel = `${ariaLabel}${description ? ` ${description}` : ''}`;
            for (const selector of ['.monaco-icon-suffix-container', '.monaco-icon-name-container']) {
                // eslint-disable-next-line no-restricted-syntax
                const element = widget.label?.element.querySelector(selector);
                if (element) {
                    element.classList.add('warning');
                }
            }
        }
        this._register(dom.addDisposableListener(widget.element, 'contextmenu', e => this.contextMenuHandler?.(attachment, e)));
        if (this.attachedContextDisposables.isDisposed) {
            widget.dispose();
            return;
        }
        if (ariaLabel) {
            widget.element.ariaLabel = ariaLabel;
        }
        this.attachedContextDisposables.add(widget);
    }
};
ChatAttachmentsContentPart = __decorate([
    __param(1, IInstantiationService),
    __param(2, IChatAttachmentWidgetRegistry)
], ChatAttachmentsContentPart);
export { ChatAttachmentsContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUE2QixzQkFBc0IsRUFBRSxvQkFBb0IsRUFBRSw2QkFBNkIsRUFBRSxvQkFBb0IsRUFBRSx5QkFBeUIsRUFBRSx5QkFBeUIsRUFBRSx3Q0FBd0MsRUFBRSxtQ0FBbUMsRUFBRSw2QkFBNkIsRUFBRSx1QkFBdUIsRUFBRSx3QkFBd0IsRUFBRSxzQkFBc0IsRUFBZ0IsTUFBTSxvREFBb0QsQ0FBQztBQUMvYixPQUFPLEVBQUUsbUNBQW1DLEVBQXlCLE1BQU0sNENBQTRDLENBQUM7QUFDeEgsT0FBTyxFQUFFLDJCQUEyQixFQUFFLDJCQUEyQixFQUFFLG9CQUFvQixFQUFFLHFCQUFxQixFQUFFLHNDQUFz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