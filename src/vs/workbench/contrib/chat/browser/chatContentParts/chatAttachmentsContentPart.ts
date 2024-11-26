/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../../base/browser/ui/hover/hover.js';
import { createInstantHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { FileKind, IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService, OpenInternalOptions } from '../../../../../platform/opener/common/opener.js';
import { FolderThemeIcon, IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { revealInSideBarCommand } from '../../../files/browser/fileActions.contribution.js';
import { IChatRequestVariableEntry, isPasteVariableEntry } from '../../common/chatModel.js';
import { ChatResponseReferencePartStatusKind, IChatContentReference } from '../../common/chatService.js';

export class ChatAttachmentsContentPart extends Disposable {
	private readonly attachedContextDisposables = this._register(new DisposableStore());

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly _contextResourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event });

	constructor(
		private readonly variables: IChatRequestVariableEntry[],
		private readonly contentReferences: ReadonlyArray<IChatContentReference> = [],
		private readonly workingSet: ReadonlyArray<URI> = [],
		public readonly domNode: HTMLElement = dom.$('.chat-attached-context'),
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IFileService private readonly fileService: IFileService,
		@ICommandService private readonly commandService: ICommandService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();

		this.initAttachedContext(domNode);
	}

	private initAttachedContext(container: HTMLElement) {
		dom.clearNode(container);
		this.attachedContextDisposables.clear();
		dom.setVisibility(Boolean(this.variables.length), this.domNode);
		const hoverDelegate = this.attachedContextDisposables.add(createInstantHoverDelegate());

		this.variables.forEach(async (attachment) => {
			const resource = URI.isUri(attachment.value) ? attachment.value : attachment.value && typeof attachment.value === 'object' && 'uri' in attachment.value && URI.isUri(attachment.value.uri) ? attachment.value.uri : undefined;
			const range = attachment.value && typeof attachment.value === 'object' && 'range' in attachment.value && Range.isIRange(attachment.value.range) ? attachment.value.range : undefined;
			if (resource && attachment.isFile && this.workingSet.find(entry => entry.toString() === resource.toString())) {
				// Don't render attachment if it's in the working set
				return;
			}

			const widget = dom.append(container, dom.$('.chat-attached-context-attachment.show-file-icons'));
			const label = this._contextResourceLabels.create(widget, { supportIcons: true, hoverDelegate, hoverTargetOverride: widget });

			const correspondingContentReference = this.contentReferences.find((ref) => typeof ref.reference === 'object' && 'variableName' in ref.reference && ref.reference.variableName === attachment.name);
			const isAttachmentOmitted = correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted;
			const isAttachmentPartialOrOmitted = isAttachmentOmitted || correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial;

			let ariaLabel: string | undefined;

			if (resource && (attachment.isFile || attachment.isDirectory)) {
				const fileBasename = basename(resource.path);
				const fileDirname = dirname(resource.path);
				const friendlyName = `${fileBasename} ${fileDirname}`;

				if (isAttachmentOmitted) {
					ariaLabel = range ? localize('chat.omittedFileAttachmentWithRange', "Omitted: {0}, line {1} to line {2}.", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.omittedFileAttachment', "Omitted: {0}.", friendlyName);
				} else if (isAttachmentPartialOrOmitted) {
					ariaLabel = range ? localize('chat.partialFileAttachmentWithRange', "Partially attached: {0}, line {1} to line {2}.", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.partialFileAttachment', "Partially attached: {0}.", friendlyName);
				} else {
					ariaLabel = range ? localize('chat.fileAttachmentWithRange3', "Attached: {0}, line {1} to line {2}.", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment3', "Attached: {0}.", friendlyName);
				}

				const fileOptions = {
					hidePath: true,
					title: correspondingContentReference?.options?.status?.description
				};
				label.setFile(resource, attachment.isFile ? {
					...fileOptions,
					fileKind: FileKind.FILE,
					range,
				} : {
					...fileOptions,
					fileKind: FileKind.FOLDER,
					icon: !this.themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : undefined
				});

				this.instantiationService.invokeFunction(accessor => hookUpResourceAttachmentInteractions(accessor, this.attachedContextDisposables, widget, resource));

			} else if (attachment.isImage) {
				ariaLabel = localize('chat.imageAttachment', "Attached image, {0}", attachment.name);

				const hoverElement = dom.$('div.chat-attached-context-hover');
				hoverElement.setAttribute('aria-label', ariaLabel);

				// Custom label
				const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-file-media'));
				const textLabel = dom.$('span.chat-attached-context-custom-text', {}, attachment.name);
				widget.appendChild(pillIcon);
				widget.appendChild(textLabel);

				let buffer: Uint8Array;
				try {
					if (attachment.value instanceof URI) {
						const readFile = await this.fileService.readFile(attachment.value);
						buffer = readFile.value.buffer;

					} else {
						buffer = attachment.value as Uint8Array;
					}
					await this.createImageElements(buffer, widget, hoverElement);
				} catch (error) {
					console.error('Error processing attachment:', error);
				}

				widget.style.position = 'relative';
				if (!this.attachedContextDisposables.isDisposed) {
					this.attachedContextDisposables.add(this.hoverService.setupManagedHover(hoverDelegate, widget, hoverElement));
				}
			} else if (isPasteVariableEntry(attachment)) {
				ariaLabel = localize('chat.attachment', "Attached context, {0}", attachment.name);

				const hoverContent: IManagedHoverTooltipMarkdownString = {
					markdown: {
						value: `\`\`\`${attachment.language}\n${attachment.code}\n\`\`\``,
					},
					markdownNotSupportedFallback: attachment.code,
				};

				const classNames = ['file-icon', `${attachment.language}-lang-file-icon`];
				label.setLabel(attachment.fileName, undefined, { extraClasses: classNames });
				widget.appendChild(dom.$('span.attachment-additional-info', {}, `Pasted ${attachment.pastedLines}`));

				widget.style.position = 'relative';

				if (!this.attachedContextDisposables.isDisposed) {
					this.attachedContextDisposables.add(this.hoverService.setupManagedHover(hoverDelegate, widget, hoverContent, { trapFocus: true }));
				}
			} else {
				const attachmentLabel = attachment.fullName ?? attachment.name;
				const withIcon = attachment.icon?.id ? `$(${attachment.icon.id}) ${attachmentLabel}` : attachmentLabel;
				label.setLabel(withIcon, correspondingContentReference?.options?.status?.description);

				ariaLabel = localize('chat.attachment3', "Attached context: {0}.", attachment.name);
			}

			if (isAttachmentPartialOrOmitted) {
				widget.classList.add('warning');
			}
			const description = correspondingContentReference?.options?.status?.description;
			if (isAttachmentPartialOrOmitted) {
				ariaLabel = `${ariaLabel}${description ? ` ${description}` : ''}`;
				for (const selector of ['.monaco-icon-suffix-container', '.monaco-icon-name-container']) {
					const element = label.element.querySelector(selector);
					if (element) {
						element.classList.add('warning');
					}
				}
			}

			if (resource) {
				widget.style.cursor = 'pointer';
				if (!this.attachedContextDisposables.isDisposed) {
					this.attachedContextDisposables.add(dom.addDisposableListener(widget, dom.EventType.CLICK, async (e: MouseEvent) => {
						dom.EventHelper.stop(e, true);
						if (attachment.isDirectory) {
							this.openResource(resource, true);
						} else {
							this.openResource(resource, false, range);
						}
					}));
				}
			}

			widget.ariaLabel = ariaLabel;
			widget.tabIndex = 0;
		});
	}

	private openResource(resource: URI, isDirectory: true): void;
	private openResource(resource: URI, isDirectory: false, range: IRange | undefined): void;
	private openResource(resource: URI, isDirectory?: boolean, range?: IRange): void {
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

	// Helper function to create and replace image
	private async createImageElements(buffer: ArrayBuffer | Uint8Array, widget: HTMLElement, hoverElement: HTMLElement) {
		const blob = new Blob([buffer], { type: 'image/png' });
		const url = URL.createObjectURL(blob);
		const img = dom.$('img.chat-attached-context-image', { src: url, alt: '' });
		const pillImg = dom.$('img.chat-attached-context-pill-image', { src: url, alt: '' });
		const pill = dom.$('div.chat-attached-context-pill', {}, pillImg);

		const existingPill = widget.querySelector('.chat-attached-context-pill');
		if (existingPill) {
			existingPill.replaceWith(pill);
		}

		// Update hover image
		hoverElement.appendChild(img);
	}
}

export function hookUpResourceAttachmentInteractions(accessor: ServicesAccessor, store: DisposableStore, widget: HTMLElement, resource: URI): void {
	const fileService = accessor.get(IFileService);
	const languageService = accessor.get(ILanguageService);
	const modelService = accessor.get(IModelService);
	const contextKeyService = accessor.get(IContextKeyService);
	const instantiationService = accessor.get(IInstantiationService);
	const contextMenuService = accessor.get(IContextMenuService);
	const menuService = accessor.get(IMenuService);

	// Context
	const scopedContextKeyService = store.add(contextKeyService.createScoped(widget));
	const resourceContextKey = store.add(new ResourceContextKey(scopedContextKeyService, fileService, languageService, modelService));
	resourceContextKey.set(resource);

	// Drag and drop
	widget.draggable = true;
	store.add(dom.addDisposableListener(widget, 'dragstart', e => {
		instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, [resource], e));
		e.dataTransfer?.setDragImage(widget, 0, 0);
	}));

	// Context menu
	store.add(dom.addDisposableListener(widget, dom.EventType.CONTEXT_MENU, domEvent => {
		const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
		dom.EventHelper.stop(domEvent, true);

		contextMenuService.showContextMenu({
			contextKeyService: scopedContextKeyService,
			getAnchor: () => event,
			getActions: () => {
				const menu = menuService.getMenuActions(MenuId.ChatInputResourceAttachmentContext, scopedContextKeyService, { arg: resource });
				return getFlatContextMenuActions(menu);
			},
		});
	}));
}
