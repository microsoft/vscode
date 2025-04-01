/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { $, addDisposableListener } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
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
import { IChatRequestPasteVariableEntry, IChatRequestVariableEntry } from '../common/chatModel.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { hookUpResourceAttachmentDragAndContextMenu, hookUpSymbolAttachmentDragAndContextMenu } from './chatContentParts/chatAttachmentsContentPart.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

abstract class AbstractChatAttachmentWidget extends Disposable {
	public readonly element: HTMLElement;
	public readonly label: IResourceLabel;

	private readonly _onDidDelete: Emitter<globalThis.Event> = this._register(new Emitter<globalThis.Event>());
	get onDidDelete(): Event<globalThis.Event> {
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
		return this.currentLanguageModel?.metadata.capabilities?.vision ?? false;
	}

	protected attachClearButton() {
		const clearButton = new Button(this.element, {
			supportIcons: true,
			hoverDelegate: this.hoverDelegate,
			title: localize('chat.attachment.clearButton', "Remove from context")
		});
		clearButton.icon = Codicon.close;
		this._register(clearButton);
		this._register(Event.once(clearButton.onDidClick)((e) => {
			this._onDidDelete.fire(e);
		}));
		if (this.shouldFocusClearButton) {
			clearButton.focus();
		}
	}

	protected addResourceOpenHandlers(resource: URI, range: IRange | undefined): void {
		this.element.style.cursor = 'pointer';
		this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, (e: MouseEvent) => {
			dom.EventHelper.stop(e, true);
			if (this.attachment.isDirectory) {
				this.openResource(resource, true);
			} else {
				this.openResource(resource, false, range);
			}
		}));

		this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				if (this.attachment.isDirectory) {
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
		const ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);
		this.element.ariaLabel = ariaLabel;

		if (attachment.isOmitted) {
			this.renderOmittedWarning(friendlyName, ariaLabel, hoverDelegate);
		} else {
			const fileOptions: IFileLabelOptions = { hidePath: true };
			this.label.setFile(resource, attachment.isFile ? {
				...fileOptions,
				fileKind: FileKind.FILE,
				range,
			} : {
				...fileOptions,
				fileKind: FileKind.FOLDER,
				icon: !this.themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : undefined
			});
		}

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

		const ariaLabel = localize('chat.imageAttachment', "Attached image, {0}", attachment.name);
		this.element.ariaLabel = ariaLabel;
		this.element.style.position = 'relative';

		if (attachment.references) {
			this.element.style.cursor = 'pointer';
			const clickHandler = () => {
				if (attachment.references && URI.isUri(attachment.references[0].reference)) {
					this.openResource(attachment.references[0].reference, false, undefined);
				}
			};
			this._register(addDisposableListener(this.element, 'click', clickHandler));
		}

		const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$(this.modelSupportsVision() ? 'span.codicon.codicon-file-media' : 'span.codicon.codicon-warning'));
		const textLabel = dom.$('span.chat-attached-context-custom-text', {}, attachment.name);
		this.element.appendChild(pillIcon);
		this.element.appendChild(textLabel);

		const hoverElement = dom.$('div.chat-attached-context-hover');
		hoverElement.setAttribute('aria-label', ariaLabel);

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

		if (!supportsVision && this.currentLanguageModel) {
			this.element.classList.add('warning');
			hoverElement.textContent = localize('chat.fileAttachmentHover', "{0} does not support this {1} type.", currentLanguageModelName, 'image');
			this._register(this.hoverService.setupManagedHover(hoverDelegate, this.element, hoverElement, { trapFocus: true }));
		} else {
			const buffer = attachment.value as Uint8Array;
			this.createImageElements(buffer, this.element, hoverElement);
			this._register(this.hoverService.setupManagedHover(hoverDelegate, this.element, hoverElement, { trapFocus: false }));
		}

		if (resource) {
			this.addResourceOpenHandlers(resource, undefined);
		}

		this.attachClearButton();
	}

	private createImageElements(buffer: ArrayBuffer | Uint8Array, widget: HTMLElement, hoverElement: HTMLElement) {
		const blob = new Blob([buffer], { type: 'image/png' });
		const url = URL.createObjectURL(blob);
		const pillImg = dom.$('img.chat-attached-context-pill-image', { src: url, alt: '' });
		const pill = dom.$('div.chat-attached-context-pill', {}, pillImg);

		const existingPill = widget.querySelector('.chat-attached-context-pill');
		if (existingPill) {
			existingPill.replaceWith(pill);
		}

		const hoverImage = dom.$('img.chat-attached-context-image', { src: url, alt: '' });

		// Update hover image
		hoverElement.appendChild(hoverImage);

		hoverImage.onload = () => {
			URL.revokeObjectURL(url);
		};

		hoverImage.onerror = () => {
			// reset to original icon on error or invalid image
			const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-file-media'));
			const pill = dom.$('div.chat-attached-context-pill', {}, pillIcon);
			const existingPill = widget.querySelector('.chat-attached-context-pill');
			if (existingPill) {
				existingPill.replaceWith(pill);
			}
		};
	}
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
			this._register(this.instantiationService.invokeFunction(accessor => hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, copiedFromResource)));
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
		const withIcon = attachment.icon?.id ? `$(${attachment.icon.id}) ${attachmentLabel}` : attachmentLabel;
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
			this._register(this.instantiationService.invokeFunction(accessor => hookUpSymbolAttachmentDragAndContextMenu(accessor, this.element, scopedContextKeyService, { ...attachment, kind: attachment.symbolKind }, MenuId.ChatInputSymbolAttachmentContext)));
		}

		if (resource) {
			this.addResourceOpenHandlers(resource, range);
		}

		this.attachClearButton();
	}
}
