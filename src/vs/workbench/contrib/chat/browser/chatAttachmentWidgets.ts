/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as event from '../../../../base/common/event.js';
import { $ } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IOpenerService, OpenInternalOptions } from '../../../../platform/opener/common/opener.js';
import { IThemeService, FolderThemeIcon } from '../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels, IFileLabelOptions } from '../../../browser/labels.js';
import { revealInSideBarCommand } from '../../files/browser/fileActions.contribution.js';
import { IChatRequestPasteVariableEntry, IChatRequestVariableEntry, IElementVariableEntry, INotebookOutputVariableEntry, OmittedState } from '../common/chatModel.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { hookUpResourceAttachmentDragAndContextMenu, hookUpSymbolAttachmentDragAndContextMenu } from './chatContentParts/chatAttachmentsContentPart.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { CellUri } from '../../notebook/common/notebookCommon.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

abstract class AbstractChatAttachmentWidget extends Disposable {
	public readonly element: HTMLElement;
	public readonly label: IResourceLabel;

	private readonly _onDidDelete: event.Emitter<Event> = this._register(new event.Emitter<Event>());
	get onDidDelete(): event.Event<Event> {
		return this._onDidDelete.event;
	}

	constructor(
		private readonly attachment: IChatRequestVariableEntry,
		private readonly shouldFocusClearButton: boolean,
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		protected readonly hoverDelegate: IHoverDelegate,
		protected readonly currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		@ICommandService protected readonly commandService: ICommandService,
		@IOpenerService protected readonly openerService: IOpenerService,
	) {
		super();
		this.element = dom.append(container, $('.chat-attached-context-attachment.show-file-icons'));
		this.label = contextResourceLabels.create(this.element, { supportIcons: true, hoverDelegate, hoverTargetOverride: this.element });
		this._register(this.label);
		this.element.tabIndex = 0;
	}

	protected modelSupportsVision() {
		return modelSupportsVision(this.currentLanguageModel);
	}

	protected attachClearButton() {

		if (this.attachment.range) {
			// no clear button for attachments with ranges because range means
			// referenced from prompt
			return;
		}

		const clearButton = new Button(this.element, {
			supportIcons: true,
			hoverDelegate: this.hoverDelegate,
			title: localize('chat.attachment.clearButton', "Remove from context")
		});
		clearButton.icon = Codicon.close;
		this._register(clearButton);
		this._register(event.Event.once(clearButton.onDidClick)((e) => {
			this._onDidDelete.fire(e);
		}));
		this._register(dom.addStandardDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
			if (e.keyCode === KeyCode.Backspace || e.keyCode === KeyCode.Delete) {
				this._onDidDelete.fire(e.browserEvent);
			}
		}));
		if (this.shouldFocusClearButton) {
			clearButton.focus();
		}
	}

	protected addResourceOpenHandlers(resource: URI, range: IRange | undefined): void {
		this.element.style.cursor = 'pointer';
		this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, (e: MouseEvent) => {
			dom.EventHelper.stop(e, true);
			if (this.attachment.kind === 'directory') {
				this.openResource(resource, true);
			} else {
				this.openResource(resource, false, range);
			}
		}));

		this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				if (this.attachment.kind === 'directory') {
					this.openResource(resource, true);
				} else {
					this.openResource(resource, false, range);
				}
			}
		}));
	}

	protected openResource(resource: URI, isDirectory: true): void;
	protected openResource(resource: URI, isDirectory: false, range: IRange | undefined): void;
	protected openResource(resource: URI, isDirectory?: boolean, range?: IRange): void {
		if (isDirectory) {
			// Reveal Directory in explorer
			this.commandService.executeCommand(revealInSideBarCommand.id, resource);
			return;
		}

		// Open file in editor
		const openTextEditorOptions: ITextEditorOptions | undefined = range ? { selection: range } : undefined;
		const options: OpenInternalOptions = {
			fromUserGesture: true,
			editorOptions: openTextEditorOptions,
		};
		this.openerService.open(resource, options);
	}
}

function modelSupportsVision(currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined) {
	return currentLanguageModel?.metadata.capabilities?.vision ?? false;
}

export class FileAttachmentWidget extends AbstractChatAttachmentWidget {

	constructor(
		resource: URI,
		range: IRange | undefined,
		attachment: IChatRequestVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		shouldFocusClearButton: boolean,
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(attachment, shouldFocusClearButton, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		const fileBasename = basename(resource.path);
		const fileDirname = dirname(resource.path);
		const friendlyName = `${fileBasename} ${fileDirname}`;
		let ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);

		if (attachment.omittedState === OmittedState.Full) {
			ariaLabel = localize('chat.omittedFileAttachment', "Omitted this file: {0}", attachment.name);
			this.renderOmittedWarning(friendlyName, ariaLabel, hoverDelegate);
		} else {
			const fileOptions: IFileLabelOptions = { hidePath: true };
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

		this.element.ariaLabel = ariaLabel;

		this.instantiationService.invokeFunction(accessor => {
			this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
		});
		this.addResourceOpenHandlers(resource, range);

		this.attachClearButton();
	}

	private renderOmittedWarning(friendlyName: string, ariaLabel: string, hoverDelegate: IHoverDelegate) {
		const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-warning'));
		const textLabel = dom.$('span.chat-attached-context-custom-text', {}, friendlyName);
		this.element.appendChild(pillIcon);
		this.element.appendChild(textLabel);

		const hoverElement = dom.$('div.chat-attached-context-hover');
		hoverElement.setAttribute('aria-label', ariaLabel);
		this.element.classList.add('warning');

		hoverElement.textContent = localize('chat.fileAttachmentHover', "{0} does not support this {1} type.", this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name : this.currentLanguageModel, 'file');
		this._register(this.hoverService.setupManagedHover(hoverDelegate, this.element, hoverElement, { trapFocus: true }));
	}
}

export class ImageAttachmentWidget extends AbstractChatAttachmentWidget {

	constructor(
		resource: URI | undefined,
		attachment: IChatRequestVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		shouldFocusClearButton: boolean,
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(attachment, shouldFocusClearButton, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		let ariaLabel: string;
		if (attachment.omittedState === OmittedState.Full) {
			ariaLabel = localize('chat.omittedImageAttachment', "Omitted this image: {0}", attachment.name);
		} else if (attachment.omittedState === OmittedState.Partial) {
			ariaLabel = localize('chat.partiallyOmittedImageAttachment', "Partially omitted this image: {0}", attachment.name);
		} else {
			ariaLabel = localize('chat.imageAttachment', "Attached image, {0}", attachment.name);
		}

		const ref = attachment.references?.[0]?.reference;
		resource = ref && URI.isUri(ref) ? ref : undefined;
		const clickHandler = () => {
			if (resource) {
				this.openResource(resource, false, undefined);
			}
		};
		type AttachImageEvent = {
			currentModel: string;
			supportsVision: boolean;
		};
		type AttachImageEventClassification = {
			currentModel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model at the point of attaching the image.' };
			supportsVision: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the current model supports vision or not.' };
			owner: 'justschen';
			comment: 'Event used to gain insights when images are attached, and if the model supported vision or not.';
		};

		const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : 'unknown';
		const supportsVision = this.modelSupportsVision();

		this.telemetryService.publicLog2<AttachImageEvent, AttachImageEventClassification>('copilot.attachImage', {
			currentModel: currentLanguageModelName,
			supportsVision: supportsVision
		});

		const fullName = resource?.toString() || attachment.fullName || attachment.name;
		this._register(createImageElements(resource, attachment.name, fullName, this.element, attachment.value as Uint8Array, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, attachment.omittedState));

		if (resource) {
			this.addResourceOpenHandlers(resource, undefined);
		}

		this.attachClearButton();
	}
}

function createImageElements(resource: URI | undefined, name: string, fullName: string,
	element: HTMLElement,
	buffer: ArrayBuffer | Uint8Array,
	hoverService: IHoverService, ariaLabel: string,
	currentLanguageModelName: string,
	clickHandler: () => void,
	currentLanguageModel?: ILanguageModelChatMetadataAndIdentifier,
	omittedState?: OmittedState): IDisposable {

	const disposable = new DisposableStore();
	if (omittedState === OmittedState.Partial) {
		element.classList.add('partial-warning');
	}

	element.ariaLabel = ariaLabel;
	element.style.position = 'relative';

	if (resource) {
		element.style.cursor = 'pointer';
		disposable.add(dom.addDisposableListener(element, 'click', clickHandler));
	}
	const supportsVision = modelSupportsVision(currentLanguageModel);
	const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$(supportsVision ? 'span.codicon.codicon-file-media' : 'span.codicon.codicon-warning'));
	const textLabel = dom.$('span.chat-attached-context-custom-text', {}, name);
	element.appendChild(pillIcon);
	element.appendChild(textLabel);

	const hoverElement = dom.$('div.chat-attached-context-hover');
	hoverElement.setAttribute('aria-label', ariaLabel);

	if (!supportsVision && currentLanguageModel) {
		element.classList.add('warning');
		hoverElement.textContent = localize('chat.fileAttachmentHover', "{0} does not support this {1} type.", currentLanguageModelName, 'image');
		disposable.add(hoverService.setupDelayedHover(element, { content: hoverElement, appearance: { showPointer: true } }));
	} else {
		disposable.add(hoverService.setupDelayedHover(element, { content: hoverElement, appearance: { showPointer: true } }));


		const blob = new Blob([buffer], { type: 'image/png' });
		const url = URL.createObjectURL(blob);
		const pillImg = dom.$('img.chat-attached-context-pill-image', { src: url, alt: '' });
		const pill = dom.$('div.chat-attached-context-pill', {}, pillImg);

		const existingPill = element.querySelector('.chat-attached-context-pill');
		if (existingPill) {
			existingPill.replaceWith(pill);
		}

		const hoverImage = dom.$('img.chat-attached-context-image', { src: url, alt: '' });
		const imageContainer = dom.$('div.chat-attached-context-image-container', {}, hoverImage);
		hoverElement.appendChild(imageContainer);

		if (resource) {
			const urlContainer = dom.$('a.chat-attached-context-url', {}, omittedState === OmittedState.Partial ? localize('chat.imageAttachmentWarning', "This GIF was partially omitted - current frame will be sent.") : fullName);
			const separator = dom.$('div.chat-attached-context-url-separator');
			disposable.add(dom.addDisposableListener(urlContainer, 'click', () => clickHandler()));
			hoverElement.append(separator, urlContainer);
		}

		hoverImage.onload = () => { URL.revokeObjectURL(url); };
		hoverImage.onerror = () => {
			// reset to original icon on error or invalid image
			const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-file-media'));
			const pill = dom.$('div.chat-attached-context-pill', {}, pillIcon);
			const existingPill = element.querySelector('.chat-attached-context-pill');
			if (existingPill) {
				existingPill.replaceWith(pill);
			}
		};
	}
	return disposable;
}

export class PasteAttachmentWidget extends AbstractChatAttachmentWidget {

	constructor(
		attachment: IChatRequestPasteVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		shouldFocusClearButton: boolean,
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(attachment, shouldFocusClearButton, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		const ariaLabel = localize('chat.attachment', "Attached context, {0}", attachment.name);
		this.element.ariaLabel = ariaLabel;

		const classNames = ['file-icon', `${attachment.language}-lang-file-icon`];
		let resource: URI | undefined;
		let range: IRange | undefined;

		if (attachment.copiedFrom) {
			resource = attachment.copiedFrom.uri;
			range = attachment.copiedFrom.range;
			const filename = basename(resource.path);
			this.label.setLabel(filename, undefined, { extraClasses: classNames });
		} else {
			this.label.setLabel(attachment.fileName, undefined, { extraClasses: classNames });
		}
		this.element.appendChild(dom.$('span.attachment-additional-info', {}, `Pasted ${attachment.pastedLines}`));

		this.element.style.position = 'relative';

		const sourceUri = attachment.copiedFrom?.uri;
		const hoverContent: IManagedHoverTooltipMarkdownString = {
			markdown: {
				value: `${sourceUri ? this.instantiationService.invokeFunction(accessor => accessor.get(ILabelService).getUriLabel(sourceUri, { relative: true })) : attachment.fileName}\n\n---\n\n\`\`\`${attachment.language}\n\n${attachment.code}\n\`\`\``,
			},
			markdownNotSupportedFallback: attachment.code,
		};
		this._register(this.hoverService.setupManagedHover(hoverDelegate, this.element, hoverContent, { trapFocus: true }));

		const copiedFromResource = attachment.copiedFrom?.uri;
		if (copiedFromResource) {
			this._register(this.instantiationService.invokeFunction(hookUpResourceAttachmentDragAndContextMenu, this.element, copiedFromResource));
			this.addResourceOpenHandlers(copiedFromResource, range);
		}

		this.attachClearButton();
	}
}

export class DefaultChatAttachmentWidget extends AbstractChatAttachmentWidget {
	constructor(
		resource: URI | undefined,
		range: IRange | undefined,
		attachment: IChatRequestVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		shouldFocusClearButton: boolean,
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(attachment, shouldFocusClearButton, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		const attachmentLabel = attachment.fullName ?? attachment.name;
		const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\u00A0${attachmentLabel}` : attachmentLabel;
		this.label.setLabel(withIcon, undefined);
		this.element.ariaLabel = localize('chat.attachment', "Attached context, {0}", attachment.name);

		if (attachment.kind === 'diagnostic') {
			if (attachment.filterUri) {
				resource = attachment.filterUri ? URI.revive(attachment.filterUri) : undefined;
				range = attachment.filterRange;
			} else {
				this.element.style.cursor = 'pointer';
				this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, () => {
					this.commandService.executeCommand('workbench.panel.markers.view.focus');
				}));
			}
		}

		if (attachment.kind === 'symbol') {
			const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
			this._register(this.instantiationService.invokeFunction(hookUpSymbolAttachmentDragAndContextMenu, this.element, scopedContextKeyService, { ...attachment, kind: attachment.symbolKind }, MenuId.ChatInputSymbolAttachmentContext));
		}

		if (resource) {
			this.addResourceOpenHandlers(resource, range);
		}

		this.attachClearButton();
	}
}

export class NotebookCellOutputChatAttachmentWidget extends AbstractChatAttachmentWidget {
	constructor(
		resource: URI,
		attachment: INotebookOutputVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		shouldFocusClearButton: boolean,
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@INotebookService private readonly notebookService: INotebookService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(attachment, shouldFocusClearButton, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

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
		this.attachClearButton();
	}
	getAriaLabel(attachment: INotebookOutputVariableEntry): string {
		return localize('chat.NotebookImageAttachment', "Attached Notebook output, {0}", attachment.name);
	}
	private renderErrorOutput(resource: URI, attachment: INotebookOutputVariableEntry) {
		const attachmentLabel = attachment.name;
		const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\u00A0${attachmentLabel}` : attachmentLabel;
		const buffer = this.getOutputItem(resource, attachment)?.data.buffer ?? new Uint8Array();
		let title: string | undefined = undefined;
		try {
			const error = JSON.parse(new TextDecoder().decode(buffer)) as Error;
			if (error.name && error.message) {
				title = `${error.name}: ${error.message}`;
			}
		} catch {
			//
		}
		this.label.setLabel(withIcon, undefined, { title });
		this.element.ariaLabel = this.getAriaLabel(attachment);
	}
	private renderGenericOutput(resource: URI, attachment: INotebookOutputVariableEntry) {
		this.element.ariaLabel = this.getAriaLabel(attachment);
		this.label.setFile(resource, { hidePath: true, icon: ThemeIcon.fromId('output') });
	}
	private renderImageOutput(resource: URI, attachment: INotebookOutputVariableEntry) {
		let ariaLabel: string;
		if (attachment.omittedState === OmittedState.Full) {
			ariaLabel = localize('chat.omittedNotebookImageAttachment', "Omitted this Notebook ouput: {0}", attachment.name);
		} else if (attachment.omittedState === OmittedState.Partial) {
			ariaLabel = localize('chat.partiallyOmittedNotebookImageAttachment', "Partially omitted this Notebook output: {0}", attachment.name);
		} else {
			ariaLabel = this.getAriaLabel(attachment);
		}

		const clickHandler = () => this.openResource(resource, false, undefined);
		const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : 'unknown';
		const buffer = this.getOutputItem(resource, attachment)?.data.buffer ?? new Uint8Array();
		this._register(createImageElements(resource, attachment.name, attachment.name, this.element, buffer, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, attachment.omittedState));
	}

	private getOutputItem(resource: URI, attachment: INotebookOutputVariableEntry) {
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

}

export class ElementChatAttachmentWidget extends AbstractChatAttachmentWidget {
	constructor(
		attachment: IElementVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		shouldFocusClearButton: boolean,
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IEditorService editorService: IEditorService,
	) {
		super(attachment, shouldFocusClearButton, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		const ariaLabel = localize('chat.elementAttachment', "Attached element, {0}", attachment.name);
		this.element.ariaLabel = ariaLabel;

		this.element.style.position = 'relative';
		this.element.style.cursor = 'pointer';
		const attachmentLabel = attachment.name;
		const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\u00A0${attachmentLabel}` : attachmentLabel;
		this.label.setLabel(withIcon, undefined, { title: localize('chat.clickToViewContents', "Click to view the contents of: {0}", attachmentLabel) });

		this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async () => {
			const content = attachment.value?.toString() || '';
			await editorService.openEditor({
				resource: undefined,
				contents: content,
				options: {
					pinned: true
				}
			});
		}));

		this.attachClearButton();
	}
}
