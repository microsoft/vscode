/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { basename, joinPath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { localize, localize2 } from '../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../../files/browser/fileConstants.js';
import { getAttachableImageExtension } from '../../common/chatModel.js';
import { IChatRequestVariableEntry } from '../../common/chatVariableEntries.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { LanguageModelPartAudience } from '../../common/languageModels.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../chat.js';
import { CodeBlockPart, ICodeBlockData, ICodeBlockRenderOptions } from '../codeBlockPart.js';
import { ChatAttachmentsContentPart } from './chatAttachmentsContentPart.js';
import { IDisposableReference } from './chatCollections.js';
import { ChatQueryTitlePart } from './chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { EditorPool } from './chatMarkdownContentPart.js';

export interface IChatCollapsibleIOCodePart {
	kind: 'code';
	textModel: ITextModel;
	languageId: string;
	options: ICodeBlockRenderOptions;
	codeBlockInfo: IChatCodeBlockInfo;
}

export interface IChatCollapsibleIODataPart {
	kind: 'data';
	value?: Uint8Array;
	audience?: LanguageModelPartAudience[];
	mimeType: string | undefined;
	uri: URI;
}

export type ChatCollapsibleIOPart = IChatCollapsibleIOCodePart | IChatCollapsibleIODataPart;

export interface IChatCollapsibleInputData extends IChatCollapsibleIOCodePart { }
export interface IChatCollapsibleOutputData {
	parts: ChatCollapsibleIOPart[];
}

export class ChatCollapsibleInputOutputContentPart extends Disposable {
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _currentWidth: number = 0;
	private readonly _editorReferences: IDisposableReference<CodeBlockPart>[] = [];
	private readonly _titlePart: ChatQueryTitlePart;
	public readonly domNode: HTMLElement;

	readonly codeblocks: IChatCodeBlockInfo[] = [];

	public set title(s: string | IMarkdownString) {
		this._titlePart.title = s;
	}

	public get title(): string | IMarkdownString {
		return this._titlePart.title;
	}

	private readonly _expanded: ISettableObservable<boolean>;

	public get expanded(): boolean {
		return this._expanded.get();
	}

	constructor(
		title: IMarkdownString | string,
		subtitle: string | IMarkdownString | undefined,
		private readonly context: IChatContentPartRenderContext,
		private readonly editorPool: EditorPool,
		private readonly input: IChatCollapsibleInputData,
		private readonly output: IChatCollapsibleOutputData | undefined,
		isError: boolean,
		initiallyExpanded: boolean,
		width: number,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._currentWidth = width;

		const container = dom.h('.chat-confirmation-widget-container');
		const titleEl = dom.h('.chat-confirmation-widget-title-inner');
		const iconEl = dom.h('.chat-confirmation-widget-title-icon');
		const elements = dom.h('.chat-confirmation-widget');
		this.domNode = container.root;
		container.root.appendChild(elements.root);

		const titlePart = this._titlePart = this._register(_instantiationService.createInstance(
			ChatQueryTitlePart,
			titleEl.root,
			title,
			subtitle,
			_instantiationService.createInstance(MarkdownRenderer, {}),
		));
		this._register(titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		const spacer = document.createElement('span');
		spacer.style.flexGrow = '1';

		const btn = this._register(new ButtonWithIcon(elements.root, {}));
		btn.element.classList.add('chat-confirmation-widget-title', 'monaco-text-button');
		btn.labelElement.append(titleEl.root, iconEl.root);

		const check = dom.h(isError
			? ThemeIcon.asCSSSelector(Codicon.error)
			: output
				? ThemeIcon.asCSSSelector(Codicon.check)
				: ThemeIcon.asCSSSelector(ThemeIcon.modify(Codicon.loading, 'spin'))
		);
		iconEl.root.appendChild(check.root);

		const expanded = this._expanded = observableValue(this, initiallyExpanded);
		this._register(autorun(r => {
			const value = expanded.read(r);
			btn.icon = value ? Codicon.chevronDown : Codicon.chevronRight;
			elements.root.classList.toggle('collapsed', !value);
			this._onDidChangeHeight.fire();
		}));

		const toggle = (e: Event) => {
			if (!e.defaultPrevented) {
				const value = expanded.get();
				expanded.set(!value, undefined);
				e.preventDefault();
			}
		};

		this._register(btn.onDidClick(toggle));

		const message = dom.h('.chat-confirmation-widget-message');
		message.root.appendChild(this.createMessageContents());
		elements.root.appendChild(message.root);

		const topLevelResources = this.output?.parts
			.filter(p => p.kind === 'data')
			.filter(p => !p.audience || p.audience.includes(LanguageModelPartAudience.User));
		if (topLevelResources?.length) {
			const group = this.addResourceGroup(topLevelResources, container.root);
			group.classList.add('chat-collapsible-top-level-resource-group');
			this._register(autorun(r => {
				group.style.display = expanded.read(r) ? 'none' : '';
			}));
		}
	}

	private createMessageContents() {
		const contents = dom.h('div', [
			dom.h('h3@inputTitle'),
			dom.h('div@input'),
			dom.h('h3@outputTitle'),
			dom.h('div@output'),
		]);

		const { input, output } = this;

		contents.inputTitle.textContent = localize('chat.input', "Input");
		this.addCodeBlock(input, contents.input);

		if (!output) {
			contents.output.remove();
			contents.outputTitle.remove();
		} else {
			contents.outputTitle.textContent = localize('chat.output', "Output");
			for (let i = 0; i < output.parts.length; i++) {
				const part = output.parts[i];
				if (part.kind === 'code') {
					this.addCodeBlock(part, contents.output);
					continue;
				}

				const group: IChatCollapsibleIODataPart[] = [];
				for (let k = i; k < output.parts.length; k++) {
					const part = output.parts[k];
					if (part.kind !== 'data') {
						break;
					}
					group.push(part);
				}

				this.addResourceGroup(group, contents.output);
				i += group.length - 1; // Skip the parts we just added
			}
		}

		return contents.root;
	}

	private addResourceGroup(parts: IChatCollapsibleIODataPart[], container: HTMLElement) {
		const el = dom.h('.chat-collapsible-io-resource-group', [
			dom.h('.chat-collapsible-io-resource-items@items'),
			dom.h('.chat-collapsible-io-resource-actions@actions'),
		]);

		this.fillInResourceGroup(parts, el.items, el.actions).then(() => this._onDidChangeHeight.fire());

		container.appendChild(el.root);
		return el.root;
	}

	private async fillInResourceGroup(parts: IChatCollapsibleIODataPart[], itemsContainer: HTMLElement, actionsContainer: HTMLElement) {
		const entries = await Promise.all(parts.map(async (part): Promise<IChatRequestVariableEntry> => {
			if (part.mimeType && getAttachableImageExtension(part.mimeType)) {
				const value = part.value ?? await this._fileService.readFile(part.uri).then(f => f.value.buffer, () => undefined);
				return { kind: 'image', id: generateUuid(), name: basename(part.uri), value, mimeType: part.mimeType, isURL: false, references: [{ kind: 'reference', reference: part.uri }] };
			} else {
				return { kind: 'file', id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri };
			}
		}));

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
	}


	private addCodeBlock(part: IChatCollapsibleIOCodePart, container: HTMLElement) {
		const data: ICodeBlockData = {
			languageId: part.languageId,
			textModel: Promise.resolve(part.textModel),
			codeBlockIndex: part.codeBlockInfo.codeBlockIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			parentContextKeyService: this.contextKeyService,
			renderOptions: part.options,
			chatSessionId: this.context.element.sessionId,
		};
		const editorReference = this._register(this.editorPool.get());
		editorReference.object.render(data, this._currentWidth || 300);
		this._register(editorReference.object.onDidChangeContentHeight(() => this._onDidChangeHeight.fire()));
		container.appendChild(editorReference.object.element);
		this._editorReferences.push(editorReference);
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		// For now, we consider content different unless it's exactly the same instance
		return false;
	}

	layout(width: number): void {
		this._currentWidth = width;
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
