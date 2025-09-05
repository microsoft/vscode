/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { $ } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { Codicon } from '../../../../base/common/codicons.js';
import * as event from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { LanguageFeatureRegistry } from '../../../../editor/common/languageFeatureRegistry.js';
import { Location, SymbolKind } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService, IScopedContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { fillInSymbolsDragData } from '../../../../platform/dnd/browser/dnd.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IOpenerService, OpenInternalOptions } from '../../../../platform/opener/common/opener.js';
import { FolderThemeIcon, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../browser/dnd.js';
import { IFileLabelOptions, IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { revealInSideBarCommand } from '../../files/browser/fileActions.contribution.js';
import { CellUri } from '../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { getHistoryItemEditorTitle, getHistoryItemHoverContent } from '../../scm/browser/util.js';
import { IChatContentReference } from '../common/chatService.js';
import { IChatRequestPasteVariableEntry, IChatRequestToolEntry, IChatRequestToolSetEntry, IChatRequestVariableEntry, IElementVariableEntry, INotebookOutputVariableEntry, IPromptFileVariableEntry, IPromptTextVariableEntry, ISCMHistoryItemVariableEntry, OmittedState, PromptFileVariableKind } from '../common/chatVariableEntries.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { ILanguageModelToolsService, ToolSet } from '../common/languageModelToolsService.js';
import { getCleanPromptName } from '../common/promptSyntax/config/promptFileLocations.js';

abstract class AbstractChatAttachmentWidget extends Disposable {
	public readonly element: HTMLElement;
	public readonly label: IResourceLabel;

	private readonly _onDidDelete: event.Emitter<Event> = this._register(new event.Emitter<Event>());
	get onDidDelete(): event.Event<Event> {
		return this._onDidDelete.event;
	}

	private readonly _onDidOpen: event.Emitter<void> = this._register(new event.Emitter<void>());
	get onDidOpen(): event.Event<void> {
		return this._onDidOpen.event;
	}

	constructor(
		private readonly attachment: IChatRequestVariableEntry,
		private readonly options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
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
		this.element.role = 'button';

		// Add middle-click support for removal
		this._register(dom.addDisposableListener(this.element, dom.EventType.AUXCLICK, (e: MouseEvent) => {
			if (e.button === 1 /* Middle Button */ && this.options.supportsDeletion && !this.attachment.range) {
				e.preventDefault();
				e.stopPropagation();
				this._onDidDelete.fire(e);
			}
		}));
	}

	protected modelSupportsVision() {
		return modelSupportsVision(this.currentLanguageModel);
	}

	protected attachClearButton() {

		if (this.attachment.range || !this.options.supportsDeletion) {
			// no clear button for attachments with ranges because range means
			// referenced from prompt
			return;
		}

		const clearButton = new Button(this.element, {
			supportIcons: true,
			hoverDelegate: this.hoverDelegate,
			title: localize('chat.attachment.clearButton', "Remove from context")
		});
		clearButton.element.tabIndex = -1;
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
	}

	protected addResourceOpenHandlers(resource: URI, range: IRange | undefined): void {
		this.element.style.cursor = 'pointer';
		this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async (e: MouseEvent) => {
			dom.EventHelper.stop(e, true);
			if (this.attachment.kind === 'directory') {
				await this.openResource(resource, true);
			} else {
				await this.openResource(resource, false, range);
			}
		}));

		this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, async (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				if (this.attachment.kind === 'directory') {
					await this.openResource(resource, true);
				} else {
					await this.openResource(resource, false, range);
				}
			}
		}));
	}

	protected async openResource(resource: URI, isDirectory: true): Promise<void>;
	protected async openResource(resource: URI, isDirectory: false, range: IRange | undefined): Promise<void>;
	protected async openResource(resource: URI, isDirectory?: boolean, range?: IRange): Promise<void> {
		if (isDirectory) {
			// Reveal Directory in explorer
			this.commandService.executeCommand(revealInSideBarCommand.id, resource);
			return;
		}

		// Open file in editor
		const openTextEditorOptions: ITextEditorOptions | undefined = range ? { selection: range } : undefined;
		const options: OpenInternalOptions = {
			fromUserGesture: true,
			editorOptions: { ...openTextEditorOptions, preserveFocus: true },
		};
		await this.openerService.open(resource, options);
		this._onDidOpen.fire();
		this.element.focus();
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
		correspondingContentReference: IChatContentReference | undefined,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
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
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		const fileBasename = basename(resource.path);
		const fileDirname = dirname(resource.path);
		const friendlyName = `${fileBasename} ${fileDirname}`;
		let ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);

		if (attachment.omittedState === OmittedState.Full) {
			ariaLabel = localize('chat.omittedFileAttachment', "Omitted this file: {0}", attachment.name);
			this.renderOmittedWarning(friendlyName, ariaLabel, hoverDelegate);
		} else {
			const fileOptions: IFileLabelOptions = { hidePath: true, title: correspondingContentReference?.options?.status?.description };
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

		hoverElement.textContent = localize('chat.fileAttachmentHover', "{0} does not support this file type.", this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name : this.currentLanguageModel ?? 'This model');
		this._register(this.hoverService.setupManagedHover(hoverDelegate, this.element, hoverElement, { trapFocus: true }));
	}
}

export class ImageAttachmentWidget extends AbstractChatAttachmentWidget {

	constructor(
		resource: URI | undefined,
		attachment: IChatRequestVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

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
		const clickHandler = async () => {
			if (resource) {
				await this.openResource(resource, false, undefined);
			}
		};

		const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : 'Current model';

		const fullName = resource ? this.labelService.getUriLabel(resource) : (attachment.fullName || attachment.name);
		this._register(createImageElements(resource, attachment.name, fullName, this.element, attachment.value as Uint8Array, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, attachment.omittedState));

		if (resource) {
			this.addResourceOpenHandlers(resource, undefined);
			instantiationService.invokeFunction(accessor => {
				this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
			});
		}

		this.attachClearButton();
	}
}

function createImageElements(resource: URI | undefined, name: string, fullName: string,
	element: HTMLElement,
	buffer: ArrayBuffer | Uint8Array,
	hoverService: IHoverService, ariaLabel: string,
	currentLanguageModelName: string | undefined,
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

	if ((!supportsVision && currentLanguageModel) || omittedState === OmittedState.Full) {
		element.classList.add('warning');
		hoverElement.textContent = localize('chat.imageAttachmentHover', "{0} does not support images.", currentLanguageModelName ?? 'This model');
		disposable.add(hoverService.setupDelayedHover(element, { content: hoverElement, appearance: { showPointer: true } }));
	} else {
		disposable.add(hoverService.setupDelayedHover(element, { content: hoverElement, appearance: { showPointer: true } }));

		const blob = new Blob([buffer as Uint8Array<ArrayBuffer>], { type: 'image/png' });
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
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

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
		correspondingContentReference: IChatContentReference | undefined,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		const attachmentLabel = attachment.fullName ?? attachment.name;
		const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\u00A0${attachmentLabel}` : attachmentLabel;
		this.label.setLabel(withIcon, correspondingContentReference?.options?.status?.description);
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

export class PromptFileAttachmentWidget extends AbstractChatAttachmentWidget {

	private hintElement: HTMLElement;

	constructor(
		attachment: IPromptFileVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);


		this.hintElement = dom.append(this.element, dom.$('span.prompt-type'));

		this.updateLabel(attachment);

		this.instantiationService.invokeFunction(accessor => {
			this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, attachment.value));
		});
		this.addResourceOpenHandlers(attachment.value, undefined);

		this.attachClearButton();
	}

	private updateLabel(attachment: IPromptFileVariableEntry) {
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


		this.element.ariaLabel = ariaLabel;
	}
}

export class PromptTextAttachmentWidget extends AbstractChatAttachmentWidget {

	constructor(
		attachment: IPromptTextVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IPreferencesService preferencesService: IPreferencesService,
		@IHoverService hoverService: IHoverService
	) {
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		if (attachment.settingId) {
			const openSettings = () => preferencesService.openSettings({ jsonEditor: false, query: `@id:${attachment.settingId}` });

			this.element.style.cursor = 'pointer';
			this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async (e: MouseEvent) => {
				dom.EventHelper.stop(e, true);
				openSettings();
			}));

			this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, async (e: KeyboardEvent) => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					dom.EventHelper.stop(e, true);
					openSettings();
				}
			}));
		}
		this.label.setLabel(localize('instructions.label', 'Additional Instructions'), undefined, undefined);

		this._register(hoverService.setupManagedHover(hoverDelegate, this.element, attachment.value, { trapFocus: true }));

	}
}


export class ToolSetOrToolItemAttachmentWidget extends AbstractChatAttachmentWidget {
	constructor(
		attachment: IChatRequestToolSetEntry | IChatRequestToolEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService hoverService: IHoverService
	) {
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);


		const toolOrToolSet = Iterable.find(toolsService.getTools(), tool => tool.id === attachment.id) ?? Iterable.find(toolsService.toolSets.get(), toolSet => toolSet.id === attachment.id);

		let name = attachment.name;
		const icon = attachment.icon ?? Codicon.tools;

		if (toolOrToolSet instanceof ToolSet) {
			name = toolOrToolSet.referenceName;
		} else if (toolOrToolSet) {
			name = toolOrToolSet.toolReferenceName ?? name;
		}

		this.label.setLabel(`$(${icon.id})\u00A0${name}`, undefined);

		this.element.style.cursor = 'pointer';
		this.element.ariaLabel = localize('chat.attachment', "Attached context, {0}", name);

		let hoverContent: string | undefined;

		if (toolOrToolSet instanceof ToolSet) {
			hoverContent = localize('toolset', "{0} - {1}", toolOrToolSet.description ?? toolOrToolSet.referenceName, toolOrToolSet.source.label);
		} else if (toolOrToolSet) {
			hoverContent = localize('tool', "{0} - {1}", toolOrToolSet.userDescription ?? toolOrToolSet.modelDescription, toolOrToolSet.source.label);
		}

		if (hoverContent) {
			this._register(hoverService.setupManagedHover(hoverDelegate, this.element, hoverContent, { trapFocus: true }));
		}

		this.attachClearButton();
	}


}

export class NotebookCellOutputChatAttachmentWidget extends AbstractChatAttachmentWidget {
	constructor(
		resource: URI,
		attachment: INotebookOutputVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
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
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

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

		const clickHandler = async () => await this.openResource(resource, false, undefined);
		const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : undefined;
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
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IEditorService editorService: IEditorService,
	) {
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

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

export class SCMHistoryItemAttachmentWidget extends AbstractChatAttachmentWidget {
	constructor(
		attachment: ISCMHistoryItemVariableEntry,
		currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		contextResourceLabels: ResourceLabels,
		hoverDelegate: IHoverDelegate,
		@ICommandService commandService: ICommandService,
		@IHoverService hoverService: IHoverService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService
	) {
		super(attachment, options, container, contextResourceLabels, hoverDelegate, currentLanguageModel, commandService, openerService);

		this.label.setLabel(attachment.name, undefined);

		this.element.style.cursor = 'pointer';
		this.element.ariaLabel = localize('chat.attachment', "Attached context, {0}", attachment.name);

		this._store.add(hoverService.setupManagedHover(hoverDelegate, this.element, () => getHistoryItemHoverContent(themeService, attachment.historyItem), { trapFocus: true }));

		this._store.add(dom.addDisposableListener(this.element, dom.EventType.CLICK, (e: MouseEvent) => {
			dom.EventHelper.stop(e, true);
			this._openAttachment(attachment);
		}));

		this._store.add(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				this._openAttachment(attachment);
			}
		}));

		this.attachClearButton();
	}

	private async _openAttachment(attachment: ISCMHistoryItemVariableEntry): Promise<void> {
		await this.commandService.executeCommand('_workbench.openMultiDiffEditor', {
			title: getHistoryItemEditorTitle(attachment.historyItem), multiDiffSourceUri: attachment.value
		});
	}
}

export function hookUpResourceAttachmentDragAndContextMenu(accessor: ServicesAccessor, widget: HTMLElement, resource: URI): IDisposable {
	const contextKeyService = accessor.get(IContextKeyService);
	const instantiationService = accessor.get(IInstantiationService);

	const store = new DisposableStore();

	// Context
	const scopedContextKeyService = store.add(contextKeyService.createScoped(widget));
	store.add(setResourceContext(accessor, scopedContextKeyService, resource));

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

export function hookUpSymbolAttachmentDragAndContextMenu(accessor: ServicesAccessor, widget: HTMLElement, scopedContextKeyService: IScopedContextKeyService, attachment: { name: string; value: Location; kind: SymbolKind }, contextMenuId: MenuId): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const textModelService = accessor.get(ITextModelService);

	const store = new DisposableStore();

	// Context
	store.add(setResourceContext(accessor, scopedContextKeyService, attachment.value.uri));

	const chatResourceContext = chatAttachmentResourceContextKey.bindTo(scopedContextKeyService);
	chatResourceContext.set(attachment.value.uri.toString());

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

	// Context menu
	const providerContexts: ReadonlyArray<[IContextKey<boolean>, LanguageFeatureRegistry<unknown>]> = [
		[EditorContextKeys.hasDefinitionProvider.bindTo(scopedContextKeyService), languageFeaturesService.definitionProvider],
		[EditorContextKeys.hasReferenceProvider.bindTo(scopedContextKeyService), languageFeaturesService.referenceProvider],
		[EditorContextKeys.hasImplementationProvider.bindTo(scopedContextKeyService), languageFeaturesService.implementationProvider],
		[EditorContextKeys.hasTypeDefinitionProvider.bindTo(scopedContextKeyService), languageFeaturesService.typeDefinitionProvider],
	];

	const updateContextKeys = async () => {
		const modelRef = await textModelService.createModelReference(attachment.value.uri);
		try {
			const model = modelRef.object.textEditorModel;
			for (const [contextKey, registry] of providerContexts) {
				contextKey.set(registry.has(model));
			}
		} finally {
			modelRef.dispose();
		}
	};
	store.add(addBasicContextMenu(accessor, widget, scopedContextKeyService, contextMenuId, attachment.value, updateContextKeys));

	return store;
}

function setResourceContext(accessor: ServicesAccessor, scopedContextKeyService: IScopedContextKeyService, resource: URI) {
	const fileService = accessor.get(IFileService);
	const languageService = accessor.get(ILanguageService);
	const modelService = accessor.get(IModelService);

	const resourceContextKey = new ResourceContextKey(scopedContextKeyService, fileService, languageService, modelService);
	resourceContextKey.set(resource);
	return resourceContextKey;
}

function addBasicContextMenu(accessor: ServicesAccessor, widget: HTMLElement, scopedContextKeyService: IScopedContextKeyService, menuId: MenuId, arg: any, updateContextKeys?: () => Promise<void>): IDisposable {
	const contextMenuService = accessor.get(IContextMenuService);
	const menuService = accessor.get(IMenuService);

	return dom.addDisposableListener(widget, dom.EventType.CONTEXT_MENU, async domEvent => {
		const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
		dom.EventHelper.stop(domEvent, true);

		try {
			await updateContextKeys?.();
		} catch (e) {
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

export const chatAttachmentResourceContextKey = new RawContextKey<string>('chatAttachmentResource', undefined, { type: 'URI', description: localize('resource', "The full value of the chat attachment resource, including scheme and path") });
