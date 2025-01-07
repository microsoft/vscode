/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../../base/browser/ui/hover/hover.js';
import { createInstantHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { LanguageFeatureRegistry } from '../../../../../editor/common/languageFeatureRegistry.js';
import { Location, SymbolKind } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService, IScopedContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { fillInSymbolsDragData } from '../../../../../platform/dnd/browser/dnd.js';
import { ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { FileKind, IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService, OpenInternalOptions } from '../../../../../platform/opener/common/opener.js';
import { FolderThemeIcon, IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { revealInSideBarCommand } from '../../../files/browser/fileActions.contribution.js';
import { IChatRequestVariableEntry, isPasteVariableEntry } from '../../common/chatModel.js';
import { ChatResponseReferencePartStatusKind, IChatContentReference } from '../../common/chatService.js';

export const chatAttachmentResourceContextKey = new RawContextKey<string>('chatAttachmentResource', undefined, { type: 'URI', description: localize('resource', "The full value of the chat attachment resource, including scheme and path") });


export class ChatAttachmentsContentPart extends Disposable {
	private readonly attachedContextDisposables = this._register(new DisposableStore());

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly _contextResourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event });

	constructor(
		private readonly variables: IChatRequestVariableEntry[],
		private readonly contentReferences: ReadonlyArray<IChatContentReference> = [],
		private readonly workingSet: ReadonlyArray<URI> = [],
		public readonly domNode: HTMLElement = dom.$('.chat-attached-context'),
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IFileService private readonly fileService: IFileService,
		@ICommandService private readonly commandService: ICommandService,
		@IThemeService private readonly themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService
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
			let resource = URI.isUri(attachment.value) ? attachment.value : attachment.value && typeof attachment.value === 'object' && 'uri' in attachment.value && URI.isUri(attachment.value.uri) ? attachment.value.uri : undefined;
			let range = attachment.value && typeof attachment.value === 'object' && 'range' in attachment.value && Range.isIRange(attachment.value.range) ? attachment.value.range : undefined;
			if (resource && attachment.isFile && this.workingSet.find(entry => entry.toString() === resource?.toString())) {
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

				this.instantiationService.invokeFunction(accessor => {
					if (resource) {
						this.attachedContextDisposables.add(hookUpResourceAttachmentDragAndContextMenu(accessor, widget, resource));
					}
				});
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

				const classNames = ['file-icon', `${attachment.language}-lang-file-icon`];
				if (attachment.copiedFrom) {
					resource = attachment.copiedFrom.uri;
					range = attachment.copiedFrom.range;
					const filename = basename(resource.path);
					label.setLabel(filename, undefined, { extraClasses: classNames });
				} else {
					label.setLabel(attachment.fileName, undefined, { extraClasses: classNames });
				}
				widget.appendChild(dom.$('span.attachment-additional-info', {}, `Pasted ${attachment.pastedLines}`));

				widget.style.position = 'relative';

				const hoverContent: IManagedHoverTooltipMarkdownString = {
					markdown: {
						value: `**${attachment.copiedFrom ? this.labelService.getUriLabel(attachment.copiedFrom.uri, { relative: true }) : attachment.fileName}**\n\n---\n\n\`\`\`${attachment.language}\n${attachment.code}\n\`\`\``,
					},
					markdownNotSupportedFallback: attachment.code,
				};

				if (!this.attachedContextDisposables.isDisposed) {
					this.attachedContextDisposables.add(this.hoverService.setupManagedHover(hoverDelegate, widget, hoverContent, { trapFocus: true }));

					const resource = attachment.copiedFrom?.uri;
					if (resource) {
						this.attachedContextDisposables.add(this.instantiationService.invokeFunction(accessor => hookUpResourceAttachmentDragAndContextMenu(accessor, widget, resource)));
					}
				}
			} else {
				const attachmentLabel = attachment.fullName ?? attachment.name;
				const withIcon = attachment.icon?.id ? `$(${attachment.icon.id}) ${attachmentLabel}` : attachmentLabel;
				label.setLabel(withIcon, correspondingContentReference?.options?.status?.description);

				ariaLabel = localize('chat.attachment3', "Attached context: {0}.", attachment.name);
			}

			if (attachment.kind === 'symbol') {
				const scopedContextKeyService = this.attachedContextDisposables.add(this.contextKeyService.createScoped(widget));
				this.attachedContextDisposables.add(this.instantiationService.invokeFunction(accessor => hookUpSymbolAttachmentDragAndContextMenu(accessor, widget, scopedContextKeyService, { ...attachment, kind: attachment.symbolKind }, MenuId.ChatInputSymbolAttachmentContext)));
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
