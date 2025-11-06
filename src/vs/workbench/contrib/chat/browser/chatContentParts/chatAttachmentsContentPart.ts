/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { IChatRequestVariableEntry, isElementVariableEntry, isImageVariableEntry, isNotebookOutputVariableEntry, isPasteVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isSCMHistoryItemChangeRangeVariableEntry, isSCMHistoryItemChangeVariableEntry, isSCMHistoryItemVariableEntry, isTerminalVariableEntry, OmittedState } from '../../common/chatVariableEntries.js';
import { ChatResponseReferencePartStatusKind, IChatContentReference } from '../../common/chatService.js';
import { DefaultChatAttachmentWidget, ElementChatAttachmentWidget, FileAttachmentWidget, ImageAttachmentWidget, NotebookCellOutputChatAttachmentWidget, PasteAttachmentWidget, PromptFileAttachmentWidget, PromptTextAttachmentWidget, SCMHistoryItemAttachmentWidget, SCMHistoryItemChangeAttachmentWidget, SCMHistoryItemChangeRangeAttachmentWidget, TerminalCommandAttachmentWidget, ToolSetOrToolItemAttachmentWidget } from '../chatAttachmentWidgets.js';

export interface IChatAttachmentsContentPartOptions {
	readonly variables: IChatRequestVariableEntry[];
	readonly contentReferences?: ReadonlyArray<IChatContentReference>;
	readonly domNode?: HTMLElement;
	readonly limit?: number;
}

export class ChatAttachmentsContentPart extends Disposable {
	private readonly attachedContextDisposables = this._register(new DisposableStore());

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly _contextResourceLabels: ResourceLabels;
	private _showingAll = false;

	private readonly variables: IChatRequestVariableEntry[];
	private readonly contentReferences: ReadonlyArray<IChatContentReference>;
	private readonly limit?: number;
	public readonly domNode: HTMLElement | undefined;

	public contextMenuHandler?: (attachment: IChatRequestVariableEntry, event: MouseEvent) => void;

	constructor(
		options: IChatAttachmentsContentPartOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.variables = options.variables;
		this.contentReferences = options.contentReferences ?? [];
		this.limit = options.limit;
		this.domNode = options.domNode ?? dom.$('.chat-attached-context');

		this._contextResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));

		this.initAttachedContext(this.domNode);
		if (!this.domNode.childElementCount) {
			this.domNode = undefined;
		}
	}

	private initAttachedContext(container: HTMLElement) {
		dom.clearNode(container);
		this.attachedContextDisposables.clear();

		const visibleAttachments = this.getVisibleAttachments();
		const hasMoreAttachments = this.limit && this.variables.length > this.limit && !this._showingAll;

		for (const attachment of visibleAttachments) {
			this.renderAttachment(attachment, container);
		}

		if (hasMoreAttachments) {
			this.renderShowMoreButton(container);
		}
	}

	private getVisibleAttachments(): IChatRequestVariableEntry[] {
		if (!this.limit || this._showingAll) {
			return this.variables;
		}
		return this.variables.slice(0, this.limit);
	}

	private renderShowMoreButton(container: HTMLElement) {
		const remainingCount = this.variables.length - (this.limit ?? 0);

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

	private renderAttachment(attachment: IChatRequestVariableEntry, container: HTMLElement) {
		const resource = URI.isUri(attachment.value) ? attachment.value : attachment.value && typeof attachment.value === 'object' && 'uri' in attachment.value && URI.isUri(attachment.value.uri) ? attachment.value.uri : undefined;
		const range = attachment.value && typeof attachment.value === 'object' && 'range' in attachment.value && Range.isIRange(attachment.value.range) ? attachment.value.range : undefined;
		const correspondingContentReference = this.contentReferences.find((ref) => (typeof ref.reference === 'object' && 'variableName' in ref.reference && ref.reference.variableName === attachment.name) || (URI.isUri(ref.reference) && basename(ref.reference.path) === attachment.name));
		const isAttachmentOmitted = correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted;
		const isAttachmentPartialOrOmitted = isAttachmentOmitted || correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial;

		let widget;
		if (attachment.kind === 'tool' || attachment.kind === 'toolset') {
			widget = this.instantiationService.createInstance(ToolSetOrToolItemAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isElementVariableEntry(attachment)) {
			widget = this.instantiationService.createInstance(ElementChatAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isImageVariableEntry(attachment)) {
			attachment.omittedState = isAttachmentPartialOrOmitted ? OmittedState.Full : attachment.omittedState;
			widget = this.instantiationService.createInstance(ImageAttachmentWidget, resource, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isPromptFileVariableEntry(attachment)) {
			if (attachment.automaticallyAdded) {
				return; // Skip automatically added prompt files
			}
			widget = this.instantiationService.createInstance(PromptFileAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isPromptTextVariableEntry(attachment)) {
			if (attachment.automaticallyAdded) {
				return; // Skip automatically added prompt text
			}
			widget = this.instantiationService.createInstance(PromptTextAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (resource && (attachment.kind === 'file' || attachment.kind === 'directory')) {
			widget = this.instantiationService.createInstance(FileAttachmentWidget, resource, range, attachment, correspondingContentReference, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isTerminalVariableEntry(attachment)) {
			widget = this.instantiationService.createInstance(TerminalCommandAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isPasteVariableEntry(attachment)) {
			widget = this.instantiationService.createInstance(PasteAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (resource && isNotebookOutputVariableEntry(attachment)) {
			widget = this.instantiationService.createInstance(NotebookCellOutputChatAttachmentWidget, resource, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isSCMHistoryItemVariableEntry(attachment)) {
			widget = this.instantiationService.createInstance(SCMHistoryItemAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isSCMHistoryItemChangeVariableEntry(attachment)) {
			widget = this.instantiationService.createInstance(SCMHistoryItemChangeAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else if (isSCMHistoryItemChangeRangeVariableEntry(attachment)) {
			widget = this.instantiationService.createInstance(SCMHistoryItemChangeRangeAttachmentWidget, attachment, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		} else {
			widget = this.instantiationService.createInstance(DefaultChatAttachmentWidget, resource, range, attachment, correspondingContentReference, undefined, { shouldFocusClearButton: false, supportsDeletion: false }, container, this._contextResourceLabels);
		}

		let ariaLabel: string | null = null;

		if (isAttachmentPartialOrOmitted) {
			widget.element.classList.add('warning');
		}
		const description = correspondingContentReference?.options?.status?.description;
		if (isAttachmentPartialOrOmitted) {
			ariaLabel = `${ariaLabel}${description ? ` ${description}` : ''}`;
			for (const selector of ['.monaco-icon-suffix-container', '.monaco-icon-name-container']) {
				// eslint-disable-next-line no-restricted-syntax
				const element = widget.label.element.querySelector(selector);
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
}
