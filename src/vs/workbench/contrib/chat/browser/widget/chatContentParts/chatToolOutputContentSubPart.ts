/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { basename, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../../../files/browser/fileConstants.js';
import { getAttachableImageExtension } from '../../../common/model/chatModel.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { CodeBlockPart, ICodeBlockData } from './codeBlockPart.js';
import { ChatAttachmentsContentPart } from './chatAttachmentsContentPart.js';
import { IDisposableReference } from './chatCollections.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatCollapsibleIOPart, IChatCollapsibleIOCodePart, IChatCollapsibleIODataPart } from './chatToolInputOutputContentPart.js';

/**
 * A reusable component for rendering tool output consisting of code blocks and/or resources.
 * This is used by both ChatCollapsibleInputOutputContentPart and ChatToolPostExecuteConfirmationPart.
 */
export class ChatToolOutputContentSubPart extends Disposable {
	private readonly _editorReferences: IDisposableReference<CodeBlockPart>[] = [];
	public readonly domNode: HTMLElement;
	readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		private readonly context: IChatContentPartRenderContext,
		private readonly parts: ChatCollapsibleIOPart[],
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IFileService private readonly _fileService: IFileService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();
		this.domNode = this.createOutputContents();
	}

	private toMdString(value: string | IMarkdownString): MarkdownString {
		if (typeof value === 'string') {
			return new MarkdownString('').appendText(value);
		}
		return new MarkdownString(value.value, { isTrusted: value.isTrusted });
	}

	private createOutputContents(): HTMLElement {
		const container = dom.$('div');

		for (let i = 0; i < this.parts.length; i++) {
			const part = this.parts[i];
			if (part.kind === 'code') {
				// Collect adjacent code parts and combine their contents
				const codeParts = [part];
				while (i + 1 < this.parts.length && this.parts[i + 1].kind === 'code') {
					codeParts.push(this.parts[++i] as IChatCollapsibleIOCodePart);
				}
				this.addCodeBlock(codeParts, container);
				continue;
			}

			const group: IChatCollapsibleIODataPart[] = [];
			for (let k = i; k < this.parts.length; k++) {
				const part = this.parts[k];
				if (part.kind !== 'data') {
					break;
				}
				group.push(part);
			}

			this.addResourceGroup(group, container);
			i += group.length - 1; // Skip the parts we just added
		}

		return container;
	}

	private addResourceGroup(parts: IChatCollapsibleIODataPart[], container: HTMLElement) {
		const el = dom.h('.chat-collapsible-io-resource-group', [
			dom.h('.chat-collapsible-io-resource-items@items'),
			dom.h('.chat-collapsible-io-resource-actions@actions'),
		]);

		this.fillInResourceGroup(parts, el.items, el.actions);

		container.appendChild(el.root);
		return el.root;
	}

	/**
	 * Delay in milliseconds before decoding base64 image data.
	 * This avoids expensive decode operations during scrolling.
	 */
	private static readonly IMAGE_DECODE_DELAY_MS = 100;

	private async fillInResourceGroup(parts: IChatCollapsibleIODataPart[], itemsContainer: HTMLElement, actionsContainer: HTMLElement) {
		// First pass: create entries immediately, using file placeholders for base64 images
		const entries: IChatRequestVariableEntry[] = [];
		const deferredImageParts: { index: number; part: IChatCollapsibleIODataPart }[] = [];

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (part.mimeType && getAttachableImageExtension(part.mimeType)) {
				if (part.base64Value) {
					// Defer base64 decode - use file placeholder for now
					entries.push({ kind: 'file', id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
					deferredImageParts.push({ index: i, part });
				} else if (part.value) {
					entries.push({ kind: 'image', id: generateUuid(), name: basename(part.uri), value: part.value, mimeType: part.mimeType, isURL: false, references: [{ kind: 'reference', reference: part.uri }] });
				} else {
					const value = await this._fileService.readFile(part.uri).then(f => f.value.buffer, () => undefined);
					if (!value) {
						entries.push({ kind: 'file', id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
					} else {
						entries.push({ kind: 'image', id: generateUuid(), name: basename(part.uri), value, mimeType: part.mimeType, isURL: false, references: [{ kind: 'reference', reference: part.uri }] });
					}
				}
			} else {
				entries.push({ kind: 'file', id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
			}
		}

		if (this._store.isDisposed) {
			return;
		}

		// Render attachments immediately with placeholders
		const attachments = this._register(this._instantiationService.createInstance(
			ChatAttachmentsContentPart,
			{
				variables: entries,
				limit: 5,
				contentReferences: undefined,
				domNode: undefined
			}
		));

		attachments.contextMenuHandler = (attachment, event) => {
			const index = entries.indexOf(attachment);
			const part = parts[index];
			if (part) {
				event.preventDefault();
				event.stopPropagation();

				this._contextMenuService.showContextMenu({
					menuId: MenuId.ChatToolOutputResourceContext,
					menuActionOptions: { shouldForwardArgs: true },
					getAnchor: () => ({ x: event.pageX, y: event.pageY }),
					getActionsContext: () => ({ parts: [part] } satisfies IChatToolOutputResourceToolbarContext),
				});
			}
		};

		itemsContainer.appendChild(attachments.domNode!);

		const toolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, MenuId.ChatToolOutputResourceToolbar, {
			menuOptions: {
				shouldForwardArgs: true,
			},
		}));
		toolbar.context = { parts } satisfies IChatToolOutputResourceToolbarContext;

		// Second pass: decode base64 images asynchronously and update in place
		if (deferredImageParts.length > 0) {
			this._register(disposableTimeout(() => {
				for (const { index, part } of deferredImageParts) {
					try {
						const value = decodeBase64(part.base64Value!).buffer;
						entries[index] = { kind: 'image', id: generateUuid(), name: basename(part.uri), value, mimeType: part.mimeType!, isURL: false, references: [{ kind: 'reference', reference: part.uri }] };
					} catch {
						// Keep the file placeholder on decode failure
					}
				}

				// Update attachments in place
				attachments.updateVariables(entries);
			}, ChatToolOutputContentSubPart.IMAGE_DECODE_DELAY_MS));
		}
	}

	private addCodeBlock(parts: IChatCollapsibleIOCodePart[], container: HTMLElement): void {
		const firstPart = parts[0];
		if (firstPart.title) {
			const title = dom.$('div.chat-confirmation-widget-title');
			const renderedTitle = this._register(this._markdownRendererService.render(this.toMdString(firstPart.title)));
			title.appendChild(renderedTitle.element);
			container.appendChild(title);
		}

		// Combine text from all adjacent code parts and create model lazily
		const combinedText = parts.map(p => p.data).join('\n');
		const textModel = this._register(this.modelService.createModel(
			combinedText,
			this.languageService.createById(firstPart.languageId),
			undefined,
			true
		));

		const data: ICodeBlockData = {
			languageId: firstPart.languageId,
			textModel: Promise.resolve(textModel),
			codeBlockIndex: firstPart.codeBlockIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			parentContextKeyService: this.contextKeyService,
			renderOptions: firstPart.options,
			chatSessionResource: this.context.element.sessionResource,
		};
		const editorReference = this._register(this.context.editorPool.get());
		editorReference.object.render(data, this.context.currentWidth.get());
		container.appendChild(editorReference.object.element);
		this._editorReferences.push(editorReference);

		// Track the codeblock
		this.codeblocks.push({
			ownerMarkdownPartId: firstPart.ownerMarkdownPartId,
			codeBlockIndex: firstPart.codeBlockIndex,
			elementId: this.context.element.id,
			uri: textModel.uri,
			uriPromise: Promise.resolve(textModel.uri),
			codemapperUri: undefined,
			chatSessionResource: this.context.element.sessionResource,
			focus: () => { }
		});
	}

	layout(width: number): void {
		this._editorReferences.forEach(r => r.object.layout(width));
	}
}

interface IChatToolOutputResourceToolbarContext {
	parts: IChatCollapsibleIODataPart[];
}



class SaveResourcesAction extends Action2 {
	public static readonly ID = 'chat.toolOutput.save';
	constructor() {
		super({
			id: SaveResourcesAction.ID,
			title: localize2('chat.saveResources', "Save As..."),
			icon: Codicon.cloudDownload,
			menu: [{
				id: MenuId.ChatToolOutputResourceToolbar,
				group: 'navigation',
				order: 1
			}, {
				id: MenuId.ChatToolOutputResourceContext,
			}]
		});
	}

	async run(accessor: ServicesAccessor, context: IChatToolOutputResourceToolbarContext) {
		const fileDialog = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);
		const progressService = accessor.get(IProgressService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const commandService = accessor.get(ICommandService);
		const labelService = accessor.get(ILabelService);
		const defaultFilepath = await fileDialog.defaultFilePath();

		const savePart = async (part: IChatCollapsibleIODataPart, isFolder: boolean, uri: URI) => {
			const target = isFolder ? joinPath(uri, basename(part.uri)) : uri;
			try {
				if (part.kind === 'data') {
					await fileService.copy(part.uri, target, true);
				} else {
					// MCP doesn't support streaming data, so no sense trying
					const contents = await fileService.readFile(part.uri);
					await fileService.writeFile(target, contents.value);
				}
			} catch (e) {
				notificationService.error(localize('chat.saveResources.error', "Failed to save {0}: {1}", basename(part.uri), e));
			}
		};

		const withProgress = async (thenReveal: URI, todo: (() => Promise<void>)[]) => {
			await progressService.withProgress({
				location: ProgressLocation.Notification,
				delay: 5_000,
				title: localize('chat.saveResources.progress', "Saving resources..."),
			}, async report => {
				for (const task of todo) {
					await task();
					report.report({ increment: 1, total: todo.length });
				}
			});

			if (workspaceContextService.isInsideWorkspace(thenReveal)) {
				commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, thenReveal);
			} else {
				notificationService.info(localize('chat.saveResources.reveal', "Saved resources to {0}", labelService.getUriLabel(thenReveal)));
			}
		};

		if (context.parts.length === 1) {
			const part = context.parts[0];
			const uri = await fileDialog.pickFileToSave(joinPath(defaultFilepath, basename(part.uri)));
			if (!uri) {
				return;
			}
			await withProgress(uri, [() => savePart(part, false, uri)]);
		} else {
			const uris = await fileDialog.showOpenDialog({
				title: localize('chat.saveResources.title', "Pick folder to save resources"),
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				defaultUri: workspaceContextService.getWorkspace().folders[0]?.uri,
			});

			if (!uris?.length) {
				return;
			}

			await withProgress(uris[0], context.parts.map(part => () => savePart(part, true, uris[0])));
		}
	}
}

registerAction2(SaveResourcesAction);
