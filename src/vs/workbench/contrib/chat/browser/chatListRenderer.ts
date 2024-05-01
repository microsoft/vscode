/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { Button } from 'vs/base/browser/ui/button/button';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeCompressionDelegate } from 'vs/base/browser/ui/tree/asyncDataTree';
import { ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { distinct } from 'vs/base/common/arrays';
import { disposableTimeout } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { FileAccess, Schemas, matchesSomeScheme } from 'vs/base/common/network';
import { clamp } from 'vs/base/common/numbers';
import { IObservable, autorun, constObservable } from 'vs/base/common/observable';
import { basename } from 'vs/base/common/path';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { ThemeIcon } from 'vs/base/common/themables';
import { isUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Range } from 'vs/editor/common/core/range';
import { TextEdit } from 'vs/editor/common/languages';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/model';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem, createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { FileKind, FileType } from 'vs/platform/files/common/files';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchCompressibleAsyncDataTree, WorkbenchList } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { ChatTreeItem, GeneratingPhrase, IChatCodeBlockInfo, IChatFileTreeInfo } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentHover } from 'vs/workbench/contrib/chat/browser/chatAgentHover';
import { ChatFollowups } from 'vs/workbench/contrib/chat/browser/chatFollowups';
import { ChatMarkdownDecorationsRenderer } from 'vs/workbench/contrib/chat/browser/chatMarkdownDecorationsRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { ChatCodeBlockContentProvider, CodeBlockPart, CodeCompareBlockPart, ICodeBlockData, ICodeCompareBlockData, ICodeCompareBlockDiffData, localFileLanguageId, parseLocalFileData } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { ChatAgentLocation, IChatAgentMetadata, IChatAgentNameService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING, CONTEXT_REQUEST, CONTEXT_RESPONSE, CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND, CONTEXT_RESPONSE_FILTERED, CONTEXT_RESPONSE_VOTE } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatProgressRenderableResponseContent, IChatTextEditGroup } from 'vs/workbench/contrib/chat/common/chatModel';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatCommandButton, IChatContentReference, IChatFollowup, IChatProgressMessage, IChatResponseProgressFileTreeData, IChatWarningMessage, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IChatProgressMessageRenderData, IChatRenderData, IChatResponseMarkdownRenderData, IChatResponseViewModel, IChatWelcomeMessageViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IWordCountResult, getNWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { createFileIconThemableTreeContainerScope } from 'vs/workbench/contrib/files/browser/views/explorerView';
import { IFilesConfiguration } from 'vs/workbench/contrib/files/common/files';
import { IMarkdownVulnerability, annotateSpecialMarkdownContent } from '../common/annotations';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection';
import { IChatListItemRendererOptions } from './chat';
import { DefaultModelSHA1Computer } from 'vs/editor/common/services/modelService';
import { generateUuid } from 'vs/base/common/uuid';

const $ = dom.$;

interface IChatListItemTemplate {
	currentElement?: ChatTreeItem;
	readonly rowContainer: HTMLElement;
	readonly titleToolbar?: MenuWorkbenchToolBar;
	readonly avatarContainer: HTMLElement;
	readonly agentAvatarContainer: HTMLElement;
	readonly username: HTMLElement;
	readonly detail: HTMLElement;
	readonly value: HTMLElement;
	readonly referencesListContainer: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
	readonly agentHover: ChatAgentHover;
}

interface IItemHeightChangeParams {
	element: ChatTreeItem;
	height: number;
}

const forceVerboseLayoutTracing = false;

export interface IChatRendererDelegate {
	getListLength(): number;

	readonly onDidScroll?: Event<void>;
}

export class ChatListItemRenderer extends Disposable implements ITreeRenderer<ChatTreeItem, FuzzyScore, IChatListItemTemplate> {
	static readonly ID = 'item';

	private readonly codeBlocksByResponseId = new Map<string, IChatCodeBlockInfo[]>();
	private readonly codeBlocksByEditorUri = new ResourceMap<IChatCodeBlockInfo>();

	private readonly fileTreesByResponseId = new Map<string, IChatFileTreeInfo[]>();
	private readonly focusedFileTreesByResponseId = new Map<string, number>();

	private readonly renderer: MarkdownRenderer;
	private readonly markdownDecorationsRenderer: ChatMarkdownDecorationsRenderer;

	protected readonly _onDidClickFollowup = this._register(new Emitter<IChatFollowup>());
	readonly onDidClickFollowup: Event<IChatFollowup> = this._onDidClickFollowup.event;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	private readonly _editorPool: EditorPool;
	private readonly _diffEditorPool: DiffEditorPool;
	private readonly _treePool: TreePool;
	private readonly _contentReferencesListPool: ContentReferencesListPool;

	private _currentLayoutWidth: number = 0;
	private _isVisible = true;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	private _usedReferencesEnabled = false;

	constructor(
		editorOptions: ChatEditorOptions,
		private readonly location: ChatAgentLocation,
		private readonly rendererOptions: IChatListItemRendererOptions,
		private readonly delegate: IChatRendererDelegate,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ICommandService private readonly commandService: ICommandService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatAgentNameService private readonly chatAgentNameService: IChatAgentNameService,
	) {
		super();

		this.renderer = this._register(this.instantiationService.createInstance(MarkdownRenderer, {}));
		this.markdownDecorationsRenderer = this.instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode));
		this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, editorOptions, delegate, overflowWidgetsDomNode));
		this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
		this._contentReferencesListPool = this._register(this.instantiationService.createInstance(ContentReferencesListPool, this._onDidChangeVisibility.event));

		this._register(this.instantiationService.createInstance(ChatCodeBlockContentProvider));

		this._usedReferencesEnabled = configService.getValue('chat.experimental.usedReferences') ?? true;
		this._register(configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('chat.experimental.usedReferences')) {
				this._usedReferencesEnabled = configService.getValue('chat.experimental.usedReferences') ?? true;
			}
		}));
	}

	get templateId(): string {
		return ChatListItemRenderer.ID;
	}

	editorsInUse() {
		return this._editorPool.inUse();
	}

	private traceLayout(method: string, message: string) {
		if (forceVerboseLayoutTracing) {
			this.logService.info(`ChatListItemRenderer#${method}: ${message}`);
		} else {
			this.logService.trace(`ChatListItemRenderer#${method}: ${message}`);
		}
	}

	private getProgressiveRenderRate(element: IChatResponseViewModel): number {
		if (element.isComplete) {
			return 80;
		}

		if (element.contentUpdateTimings && element.contentUpdateTimings.impliedWordLoadRate) {
			// words/s
			const minRate = 12;
			const maxRate = 80;

			// This doesn't account for dead time after the last update. When the previous update is the final one and the model is only waiting for followupQuestions, that's good.
			// When there was one quick update and then you are waiting longer for the next one, that's not good since the rate should be decreasing.
			// If it's an issue, we can change this to be based on the total time from now to the beginning.
			const rateBoost = 1.5;
			const rate = element.contentUpdateTimings.impliedWordLoadRate * rateBoost;
			return clamp(rate, minRate, maxRate);
		}

		return 8;
	}

	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		const codeBlocks = this.codeBlocksByResponseId.get(response.id);
		return codeBlocks ?? [];
	}

	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this.codeBlocksByEditorUri.get(uri);
	}

	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[] {
		const fileTrees = this.fileTreesByResponseId.get(response.id);
		return fileTrees ?? [];
	}

	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined {
		const fileTrees = this.fileTreesByResponseId.get(response.id);
		const lastFocusedFileTreeIndex = this.focusedFileTreesByResponseId.get(response.id);
		if (fileTrees?.length && lastFocusedFileTreeIndex !== undefined && lastFocusedFileTreeIndex < fileTrees.length) {
			return fileTrees[lastFocusedFileTreeIndex];
		}
		return undefined;
	}

	setVisible(visible: boolean): void {
		this._isVisible = visible;
		this._onDidChangeVisibility.fire(visible);
	}

	layout(width: number): void {
		this._currentLayoutWidth = width - (this.rendererOptions.noPadding ? 0 : 40); // padding
		for (const editor of this._editorPool.inUse()) {
			editor.layout(this._currentLayoutWidth);
		}
		for (const diffEditor of this._diffEditorPool.inUse()) {
			diffEditor.layout(this._currentLayoutWidth);
		}
	}

	renderTemplate(container: HTMLElement): IChatListItemTemplate {
		const templateDisposables = new DisposableStore();
		const rowContainer = dom.append(container, $('.interactive-item-container'));
		if (this.rendererOptions.renderStyle === 'compact') {
			rowContainer.classList.add('interactive-item-compact');
		}
		if (this.rendererOptions.noPadding) {
			rowContainer.classList.add('no-padding');
		}
		const header = dom.append(rowContainer, $('.header'));
		const user = dom.append(header, $('.user'));
		const avatarContainer = dom.append(user, $('.avatar-container'));
		const agentAvatarContainer = dom.append(user, $('.agent-avatar-container'));
		const username = dom.append(user, $('h3.username'));
		const detailContainer = dom.append(user, $('span.detail-container'));
		const detail = dom.append(detailContainer, $('span.detail'));
		dom.append(detailContainer, $('span.chat-animated-ellipsis'));
		const referencesListContainer = dom.append(rowContainer, $('.referencesListContainer'));
		const value = dom.append(rowContainer, $('.value'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService]));
		let titleToolbar: MenuWorkbenchToolBar | undefined;
		if (this.rendererOptions.noHeader) {
			header.classList.add('hidden');
		} else {
			titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, header, MenuId.ChatMessageTitle, {
				menuOptions: {
					shouldForwardArgs: true
				},
				toolbarOptions: {
					shouldInlineSubmenu: submenu => submenu.actions.length <= 1
				},
				actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
					if (action instanceof MenuItemAction && (action.item.id === 'workbench.action.chat.voteDown' || action.item.id === 'workbench.action.chat.voteUp')) {
						return scopedInstantiationService.createInstance(ChatVoteButton, action, options as IMenuEntryActionViewItemOptions);
					}
					return createActionViewItem(scopedInstantiationService, action, options);
				}
			}));
		}

		const agentHover = templateDisposables.add(this.instantiationService.createInstance(ChatAgentHover));

		templateDisposables.add(this.hoverService.setupUpdatableHover(getDefaultHoverDelegate('mouse'), header, () => {
			if (isResponseVM(template.currentElement) && template.currentElement.agent) {
				agentHover.setAgent(template.currentElement.agent.id);
				return agentHover.domNode;
			}

			return undefined;
		}));

		const template: IChatListItemTemplate = { avatarContainer, agentAvatarContainer, username, detail, referencesListContainer, value, rowContainer, elementDisposables, titleToolbar, templateDisposables, contextKeyService, agentHover };
		return template;
	}

	renderElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IChatListItemTemplate): void {
		this.renderChatTreeItem(node.element, index, templateData);
	}

	renderChatTreeItem(element: ChatTreeItem, index: number, templateData: IChatListItemTemplate): void {
		templateData.currentElement = element;
		const kind = isRequestVM(element) ? 'request' :
			isResponseVM(element) ? 'response' :
				'welcome';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

		CONTEXT_RESPONSE.bindTo(templateData.contextKeyService).set(isResponseVM(element));
		CONTEXT_REQUEST.bindTo(templateData.contextKeyService).set(isRequestVM(element));
		CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND.bindTo(templateData.contextKeyService).set(isResponseVM(element) && element.agentOrSlashCommandDetected);
		if (isResponseVM(element)) {
			CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING.bindTo(templateData.contextKeyService).set(!!element.agent?.metadata.supportIssueReporting);
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set(element.vote === InteractiveSessionVoteDirection.Up ? 'up' : element.vote === InteractiveSessionVoteDirection.Down ? 'down' : '');
		} else {
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set('');
		}

		if (templateData.titleToolbar) {
			templateData.titleToolbar.context = element;
		}

		const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);
		CONTEXT_RESPONSE_FILTERED.bindTo(templateData.contextKeyService).set(isFiltered);

		templateData.rowContainer.classList.toggle('interactive-request', isRequestVM(element));
		templateData.rowContainer.classList.toggle('interactive-response', isResponseVM(element));
		templateData.rowContainer.classList.toggle('interactive-welcome', isWelcomeVM(element));
		templateData.rowContainer.classList.toggle('filtered-response', isFiltered);
		templateData.rowContainer.classList.toggle('show-detail-progress', isResponseVM(element) && !element.isComplete && !element.progressMessages.length);
		templateData.username.textContent = element.username;
		if (!this.rendererOptions.noHeader) {
			this.renderAvatar(element, templateData);
		}

		dom.clearNode(templateData.detail);
		if (isResponseVM(element)) {
			this.renderDetail(element, templateData);
		}

		// Do a progressive render if
		// - This the last response in the list
		// - And it has some content
		// - And the response is not complete
		//   - Or, we previously started a progressive rendering of this element (if the element is complete, we will finish progressive rendering with a very fast rate)
		// - And, the feature is not disabled in configuration
		if (isResponseVM(element) && index === this.delegate.getListLength() - 1 && (!element.isComplete || element.renderData) && element.response.value.length) {
			this.traceLayout('renderElement', `start progressive render ${kind}, index=${index}`);

			const progressiveRenderingDisposables = templateData.elementDisposables.add(new DisposableStore());
			const timer = templateData.elementDisposables.add(new dom.WindowIntervalTimer());
			const runProgressiveRender = (initial?: boolean) => {
				try {
					if (this.doNextProgressiveRender(element, index, templateData, !!initial, progressiveRenderingDisposables)) {
						timer.cancel();
					}
				} catch (err) {
					// Kill the timer if anything went wrong, avoid getting stuck in a nasty rendering loop.
					timer.cancel();
					throw err;
				}
			};
			timer.cancelAndSet(runProgressiveRender, 50, dom.getWindow(templateData.rowContainer));
			runProgressiveRender(true);
		} else if (isResponseVM(element)) {
			const renderableResponse = annotateSpecialMarkdownContent(element.response.value);
			this.basicRenderElement(renderableResponse, element, index, templateData);
		} else if (isRequestVM(element)) {
			const markdown = 'message' in element.message ?
				element.message.message :
				this.markdownDecorationsRenderer.convertParsedRequestToMarkdown(element.message);
			this.basicRenderElement([{ content: new MarkdownString(markdown), kind: 'markdownContent' }], element, index, templateData);
		} else {
			this.renderWelcomeMessage(element, templateData);
		}
	}

	private renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {
		let agentName: IObservable<string | undefined> = constObservable(undefined);

		if (element.agent && !element.agent.isDefault) {
			const name = element.agent.name;
			agentName = this.chatAgentNameService.getAgentNameRestriction(element.agent)
				.map(allowed => allowed ? name : name); // TODO
		}

		templateData.elementDisposables.add(autorun(reader => {
			this._renderDetail(element, agentName.read(reader), templateData);
		}));
	}

	private _renderDetail(element: IChatResponseViewModel, agentName: string | undefined, templateData: IChatListItemTemplate): void {
		let progressMsg: string = '';
		if (!isUndefined(agentName)) {
			let usingMsg = chatAgentLeader + agentName;
			if (element.slashCommand) {
				usingMsg += ` ${chatSubcommandLeader}${element.slashCommand.name}`;
			}

			if (element.isComplete) {
				progressMsg = localize('usedAgent', "used {0}", usingMsg);
			} else {
				progressMsg = localize('usingAgent', "using {0}", usingMsg);
			}
		} else if (element.agentOrSlashCommandDetected) {
			const usingMsg: string[] = [];
			if (!isUndefined(agentName)) {
				usingMsg.push(chatAgentLeader + agentName);
			}
			if (element.slashCommand) {
				usingMsg.push(chatSubcommandLeader + element.slashCommand.name);
			}
			if (usingMsg.length) {
				if (element.isComplete) {
					progressMsg = localize('usedAgent', "used {0}", usingMsg.join(' '));
				} else {
					progressMsg = localize('usingAgent', "using {0}", usingMsg.join(' '));
				}
			}
		} else if (!element.isComplete) {
			progressMsg = GeneratingPhrase;
		}

		templateData.detail.textContent = progressMsg;
	}

	private renderAvatar(element: ChatTreeItem, templateData: IChatListItemTemplate): void {
		if (URI.isUri(element.avatarIcon)) {
			const avatarImgIcon = dom.$<HTMLImageElement>('img.icon');
			avatarImgIcon.src = FileAccess.uriToBrowserUri(element.avatarIcon).toString(true);
			templateData.avatarContainer.replaceChildren(dom.$('.avatar', undefined, avatarImgIcon));
		} else {
			const defaultIcon = isRequestVM(element) ? Codicon.account : Codicon.copilot;
			const icon = element.avatarIcon ?? defaultIcon;
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(icon));
			templateData.avatarContainer.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
		}

		if (isResponseVM(element) && element.agent && !element.agent.isDefault) {
			dom.show(templateData.agentAvatarContainer);
			const icon = this.getAgentIcon(element.agent.metadata);
			if (icon instanceof URI) {
				const avatarIcon = dom.$<HTMLImageElement>('img.icon');
				avatarIcon.src = FileAccess.uriToBrowserUri(icon).toString(true);
				templateData.agentAvatarContainer.replaceChildren(dom.$('.avatar', undefined, avatarIcon));
			} else if (icon) {
				const avatarIcon = dom.$(ThemeIcon.asCSSSelector(icon));
				templateData.agentAvatarContainer.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
			} else {
				dom.hide(templateData.agentAvatarContainer);
				return;
			}

			templateData.agentAvatarContainer.classList.toggle('complete', element.isComplete);
			if (!element.agentAvatarHasBeenRendered && !element.isComplete) {
				element.agentAvatarHasBeenRendered = true;
				templateData.agentAvatarContainer.classList.remove('loading');
				templateData.elementDisposables.add(disposableTimeout(() => {
					templateData.agentAvatarContainer.classList.toggle('loading', !element.isComplete);
				}, 100));
			} else {
				templateData.agentAvatarContainer.classList.toggle('loading', !element.isComplete);
			}
		} else {
			dom.hide(templateData.agentAvatarContainer);
		}
	}

	private getAgentIcon(agent: IChatAgentMetadata): URI | ThemeIcon | undefined {
		if (agent.themeIcon) {
			return agent.themeIcon;
		} else {
			return this.themeService.getColorTheme().type === ColorScheme.DARK && agent.iconDark ? agent.iconDark :
				agent.icon;
		}
	}

	private basicRenderElement(value: ReadonlyArray<IChatProgressRenderableResponseContent>, element: ChatTreeItem, index: number, templateData: IChatListItemTemplate) {
		const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete);

		dom.clearNode(templateData.value);
		dom.clearNode(templateData.referencesListContainer);

		if (isResponseVM(element)) {
			this.renderDetail(element, templateData);
		}

		this.renderContentReferencesIfNeeded(element, templateData, templateData.elementDisposables);

		let fileTreeIndex = 0;
		value.forEach((data, index) => {
			const result = data.kind === 'treeData'
				? this.renderTreeData(data.treeData, element, templateData, fileTreeIndex++)
				: data.kind === 'markdownContent'
					? this.renderMarkdown(data.content, element, templateData, fillInIncompleteTokens)
					: data.kind === 'progressMessage' && onlyProgressMessagesAfterI(value, index) ? this.renderProgressMessage(data, false) // TODO render command
						: data.kind === 'command' ? this.renderCommandButton(element, data)
							: data.kind === 'textEditGroup' ? this.renderTextEdit(element, data, templateData)
								: data.kind === 'warning' ? this.renderWarning(element, data)
									: undefined;

			if (result) {
				templateData.value.appendChild(result.element);
				templateData.elementDisposables.add(result);
			}
		});

		if (isResponseVM(element) && element.errorDetails?.message) {
			const icon = element.errorDetails.responseIsFiltered ? Codicon.info : Codicon.error;
			const errorDetails = dom.append(templateData.value, $('.interactive-response-error-details', undefined, renderIcon(icon)));
			const renderedError = templateData.elementDisposables.add(this.renderer.render(new MarkdownString(element.errorDetails.message)));
			errorDetails.appendChild($('span', undefined, renderedError.element));
		}



		const newHeight = templateData.rowContainer.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.elementDisposables.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.value), () => {
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, height: newHeight });
			}));
		}
	}

	private renderWelcomeMessage(element: IChatWelcomeMessageViewModel, templateData: IChatListItemTemplate) {
		dom.clearNode(templateData.value);
		dom.clearNode(templateData.referencesListContainer);
		dom.hide(templateData.referencesListContainer);

		for (const item of element.content) {
			if (Array.isArray(item)) {
				const scopedInstaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, templateData.contextKeyService]));
				templateData.elementDisposables.add(
					scopedInstaService.createInstance<typeof ChatFollowups<IChatFollowup>, ChatFollowups<IChatFollowup>>(
						ChatFollowups,
						templateData.value,
						item,
						this.location,
						undefined,
						followup => this._onDidClickFollowup.fire(followup)));
			} else {
				const result = this.renderMarkdown(item as IMarkdownString, element, templateData);
				templateData.value.appendChild(result.element);
				templateData.elementDisposables.add(result);
			}
		}

		const newHeight = templateData.rowContainer.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.elementDisposables.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.value), () => {
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, height: newHeight });
			}));
		}
	}

	/**
	 *	@returns true if progressive rendering should be considered complete- the element's data is fully rendered or the view is not visible
	 */
	private doNextProgressiveRender(element: IChatResponseViewModel, index: number, templateData: IChatListItemTemplate, isInRenderElement: boolean, disposables: DisposableStore): boolean {
		if (!this._isVisible) {
			return true;
		}

		const renderableResponse = annotateSpecialMarkdownContent(element.response.value);
		let isFullyRendered = false;
		if (element.isCanceled) {
			this.traceLayout('runProgressiveRender', `canceled, index=${index}`);
			element.renderData = undefined;
			this.basicRenderElement(renderableResponse, element, index, templateData);
			isFullyRendered = true;
		} else {
			// Figure out what we need to render in addition to what has already been rendered
			element.renderData ??= { renderedParts: [] };
			const renderedParts = element.renderData.renderedParts;
			const wordCountResults: IWordCountResult[] = [];
			const partsToRender: IChatRenderData[] = [];

			let somePartIsNotFullyRendered = false;
			renderableResponse.forEach((part, index) => {
				const renderedPart = renderedParts[index];
				// Is this part completely new?
				if (!renderedPart) {
					if (part.kind === 'treeData') {
						partsToRender[index] = part.treeData;
					} else if (part.kind === 'progressMessage') {
						partsToRender[index] = {
							progressMessage: part,
							isAtEndOfResponse: onlyProgressMessagesAfterI(renderableResponse, index),
							isLast: index === renderableResponse.length - 1,
						} satisfies IChatProgressMessageRenderData;
					} else if (part.kind === 'command') {
						partsToRender[index] = part;
					} else if (part.kind === 'textEditGroup') {
						partsToRender[index] = part;
					} else {
						const wordCountResult = this.getDataForProgressiveRender(element, contentToMarkdown(part.content), { renderedWordCount: 0, lastRenderTime: 0 });
						if (wordCountResult !== undefined) {
							this.traceLayout('doNextProgressiveRender', `Rendering new part ${index}, wordCountResult=${wordCountResult.actualWordCount}, rate=${wordCountResult.rate}`);
							partsToRender[index] = {
								renderedWordCount: wordCountResult.actualWordCount,
								lastRenderTime: Date.now(),
								isFullyRendered: wordCountResult.isFullString,
								originalMarkdown: part.content,
							};
							wordCountResults[index] = wordCountResult;
						}
					}
				}

				// Did this part's content change?
				else if ((part.kind === 'markdownContent' || part.kind === 'progressMessage') && isMarkdownRenderData(renderedPart)) { // TODO
					const wordCountResult = this.getDataForProgressiveRender(element, contentToMarkdown(part.content), renderedPart);
					// Check if there are any new words to render
					if (wordCountResult !== undefined && renderedPart.renderedWordCount !== wordCountResult?.actualWordCount) {
						this.traceLayout('doNextProgressiveRender', `Rendering changed part ${index}, wordCountResult=${wordCountResult.actualWordCount}, rate=${wordCountResult.rate}`);
						partsToRender[index] = {
							renderedWordCount: wordCountResult.actualWordCount,
							lastRenderTime: Date.now(),
							isFullyRendered: wordCountResult.isFullString,
							originalMarkdown: part.content,
						};
						wordCountResults[index] = wordCountResult;
					} else if (!renderedPart.isFullyRendered && !wordCountResult) {
						// This part is not fully rendered, but not enough time has passed to render more content
						somePartIsNotFullyRendered = true;
					}
				}

				// Is it a progress message that needs to be rerendered?
				else if (part.kind === 'progressMessage' && isProgressMessageRenderData(renderedPart) && (
					(renderedPart.isAtEndOfResponse !== onlyProgressMessagesAfterI(renderableResponse, index)) ||
					renderedPart.isLast !== (index === renderableResponse.length - 1))) {
					partsToRender[index] = {
						progressMessage: part,
						isAtEndOfResponse: onlyProgressMessagesAfterI(renderableResponse, index),
						isLast: index === renderableResponse.length - 1,
					} satisfies IChatProgressMessageRenderData;
				}
			});

			isFullyRendered = partsToRender.length === 0 && !somePartIsNotFullyRendered;

			if (isFullyRendered && element.isComplete) {
				// Response is done and content is rendered, so do a normal render
				this.traceLayout('runProgressiveRender', `end progressive render, index=${index} and clearing renderData, response is complete, index=${index}`);
				element.renderData = undefined;
				disposables.clear();
				this.basicRenderElement(renderableResponse, element, index, templateData);
			} else if (!isFullyRendered) {
				disposables.clear();
				this.renderContentReferencesIfNeeded(element, templateData, disposables);
				let hasRenderedOneMarkdownBlock = false;
				partsToRender.forEach((partToRender, index) => {
					if (!partToRender) {
						return;
					}

					// Undefined => don't do anything. null => remove the rendered element
					let result: { element: HTMLElement } & IDisposable | undefined | null;
					if (isInteractiveProgressTreeData(partToRender)) {
						result = this.renderTreeData(partToRender, element, templateData, index);
					} else if (isProgressMessageRenderData(partToRender)) {
						if (onlyProgressMessageRenderDatasAfterI(partsToRender, index)) {
							result = this.renderProgressMessage(partToRender.progressMessage, index === partsToRender.length - 1);
						} else {
							result = null;
						}
					} else if (isCommandButtonRenderData(partToRender)) {
						result = this.renderCommandButton(element, partToRender);

					} else if (isTextEditRenderData(partToRender)) {
						result = this.renderTextEdit(element, partToRender, templateData);
					}

					// Avoid doing progressive rendering for multiple markdown parts simultaneously
					else if (!hasRenderedOneMarkdownBlock && wordCountResults[index]) {
						const { value } = wordCountResults[index];
						const part = partsToRender[index];
						const originalMarkdown = 'originalMarkdown' in part ? part.originalMarkdown : undefined;
						const markdownToRender = new MarkdownString(value, originalMarkdown);
						result = this.renderMarkdown(markdownToRender, element, templateData, true);
						hasRenderedOneMarkdownBlock = true;
					}

					if (result === undefined) {
						return;
					}

					// Doing the progressive render
					renderedParts[index] = partToRender;
					const existingElement = templateData.value.children[index];
					if (existingElement) {
						if (result === null) {
							templateData.value.replaceChild($('span.placeholder-for-deleted-thing'), existingElement);
						} else {
							templateData.value.replaceChild(result.element, existingElement);
						}
					} else if (result) {
						templateData.value.appendChild(result.element);
					}

					if (result) {
						disposables.add(result);
					}
				});
			} else {
				// Nothing new to render, not done, keep waiting
				return false;
			}
		}

		// Some render happened - update the height
		const height = templateData.rowContainer.offsetHeight;
		element.currentRenderedHeight = height;
		if (!isInRenderElement) {
			this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
		}

		return isFullyRendered;
	}

	private renderTreeData(data: IChatResponseProgressFileTreeData, element: ChatTreeItem, templateData: IChatListItemTemplate, treeDataIndex: number): { element: HTMLElement; dispose: () => void } {
		const treeDisposables = new DisposableStore();
		const ref = treeDisposables.add(this._treePool.get());
		const tree = ref.object;

		treeDisposables.add(tree.onDidOpen((e) => {
			if (e.element && !('children' in e.element)) {
				this.openerService.open(e.element.uri);
			}
		}));
		treeDisposables.add(tree.onDidChangeCollapseState(() => {
			this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
		}));
		treeDisposables.add(tree.onContextMenu((e) => {
			e.browserEvent.preventDefault();
			e.browserEvent.stopPropagation();
		}));

		tree.setInput(data).then(() => {
			if (!ref.isStale()) {
				tree.layout();
				this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
			}
		});

		if (isResponseVM(element)) {
			const fileTreeFocusInfo = {
				treeDataId: data.uri.toString(),
				treeIndex: treeDataIndex,
				focus() {
					tree.domFocus();
				}
			};

			treeDisposables.add(tree.onDidFocus(() => {
				this.focusedFileTreesByResponseId.set(element.id, fileTreeFocusInfo.treeIndex);
			}));

			const fileTrees = this.fileTreesByResponseId.get(element.id) ?? [];
			fileTrees.push(fileTreeFocusInfo);
			this.fileTreesByResponseId.set(element.id, distinct(fileTrees, (v) => v.treeDataId));
			treeDisposables.add(toDisposable(() => this.fileTreesByResponseId.set(element.id, fileTrees.filter(v => v.treeDataId !== data.uri.toString()))));
		}

		return {
			element: tree.getHTMLElement().parentElement!,
			dispose: () => {
				treeDisposables.dispose();
			}
		};
	}

	private renderContentReferencesIfNeeded(element: ChatTreeItem, templateData: IChatListItemTemplate, disposables: DisposableStore): void {
		dom.clearNode(templateData.referencesListContainer);
		if (isResponseVM(element) && this._usedReferencesEnabled && element.contentReferences.length) {
			dom.show(templateData.referencesListContainer);
			const contentReferencesListResult = this.renderContentReferencesListData(element.contentReferences, element, templateData);
			templateData.referencesListContainer.appendChild(contentReferencesListResult.element);
			disposables.add(contentReferencesListResult);
		} else {
			dom.hide(templateData.referencesListContainer);
		}
	}

	private renderContentReferencesListData(data: ReadonlyArray<IChatContentReference>, element: IChatResponseViewModel, templateData: IChatListItemTemplate): { element: HTMLElement; dispose: () => void } {
		const listDisposables = new DisposableStore();
		const referencesLabel = data.length > 1 ?
			localize('usedReferencesPlural', "Used {0} references", data.length) :
			localize('usedReferencesSingular', "Used {0} reference", 1);
		const iconElement = $('.chat-used-context-icon');
		const icon = (element: IChatResponseViewModel) => element.usedReferencesExpanded ? Codicon.chevronDown : Codicon.chevronRight;
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon(element)));
		const buttonElement = $('.chat-used-context-label', undefined);

		const collapseButton = listDisposables.add(new Button(buttonElement, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		}));
		const container = $('.chat-used-context', undefined, buttonElement);
		collapseButton.label = referencesLabel;
		collapseButton.element.append(iconElement);
		this.updateAriaLabel(collapseButton.element, referencesLabel, element.usedReferencesExpanded);
		container.classList.toggle('chat-used-context-collapsed', !element.usedReferencesExpanded);
		listDisposables.add(collapseButton.onDidClick(() => {
			iconElement.classList.remove(...ThemeIcon.asClassNameArray(icon(element)));
			element.usedReferencesExpanded = !element.usedReferencesExpanded;
			iconElement.classList.add(...ThemeIcon.asClassNameArray(icon(element)));
			container.classList.toggle('chat-used-context-collapsed', !element.usedReferencesExpanded);
			this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
			this.updateAriaLabel(collapseButton.element, referencesLabel, element.usedReferencesExpanded);
		}));

		const ref = listDisposables.add(this._contentReferencesListPool.get());
		const list = ref.object;
		container.appendChild(list.getHTMLElement().parentElement!);

		listDisposables.add(list.onDidOpen((e) => {
			if (e.element) {
				const uriOrLocation = 'variableName' in e.element.reference ? e.element.reference.value : e.element.reference;
				const uri = URI.isUri(uriOrLocation) ? uriOrLocation :
					uriOrLocation?.uri;
				if (uri) {
					this.openerService.open(
						uri,
						{
							fromUserGesture: true,
							editorOptions: {
								...e.editorOptions,
								...{
									selection: uriOrLocation && 'range' in uriOrLocation ? uriOrLocation.range : undefined
								}
							}
						});
				}
			}
		}));
		listDisposables.add(list.onContextMenu((e) => {
			e.browserEvent.preventDefault();
			e.browserEvent.stopPropagation();
		}));

		const maxItemsShown = 6;
		const itemsShown = Math.min(data.length, maxItemsShown);
		const height = itemsShown * 22;
		list.layout(height);
		list.getHTMLElement().style.height = `${height}px`;
		list.splice(0, list.length, data);

		return {
			element: container,
			dispose: () => {
				listDisposables.dispose();
			}
		};
	}

	private updateAriaLabel(element: HTMLElement, label: string, expanded?: boolean): void {
		element.ariaLabel = expanded ? localize('usedReferencesExpanded', "{0}, expanded", label) : localize('usedReferencesCollapsed', "{0}, collapsed", label);
	}

	private renderProgressMessage(progress: IChatProgressMessage, showSpinner: boolean): IMarkdownRenderResult {
		if (showSpinner) {
			// this step is in progress, communicate it to SR users
			alert(progress.content.value);
		}
		const codicon = showSpinner ? ThemeIcon.modify(Codicon.sync, 'spin').id : Codicon.check.id;
		const markdown = new MarkdownString(`$(${codicon}) ${progress.content.value}`, {
			supportThemeIcons: true
		});
		const result = this.renderer.render(markdown);
		result.element.classList.add('progress-step');
		return result;
	}

	private renderCommandButton(element: ChatTreeItem, commandButton: IChatCommandButton): IMarkdownRenderResult {
		const container = $('.chat-command-button');
		const disposables = new DisposableStore();
		const enabled = !isResponseVM(element) || !element.isStale;
		const tooltip = enabled ?
			commandButton.command.tooltip :
			localize('commandButtonDisabled', "Button not available in restored chat");
		const button = disposables.add(new Button(container, { ...defaultButtonStyles, supportIcons: true, title: tooltip }));
		button.label = commandButton.command.title;
		button.enabled = enabled;

		// TODO still need telemetry for command buttons
		disposables.add(button.onDidClick(() => this.commandService.executeCommand(commandButton.command.id, ...(commandButton.command.arguments ?? []))));
		return {
			dispose() {
				disposables.dispose();
			},
			element: container
		};
	}

	private renderWarning(element: ChatTreeItem, chatWarning: IChatWarningMessage): IMarkdownRenderResult | undefined {
		const container = $('.chat-warning');
		container.appendChild($('.chat-warning-codicon', undefined, renderIcon(Codicon.warning)));
		const markdownContent = this.renderer.render(chatWarning.content);
		container.appendChild(markdownContent.element);
		return {
			element: container,
			dispose() { markdownContent.dispose(); }
		};
	}

	private renderTextEdit(element: ChatTreeItem, chatTextEdit: IChatTextEditGroup, templateData: IChatListItemTemplate): IMarkdownRenderResult | undefined {

		// TODO@jrieken move this into the CompareCodeBlock and properly say what kind of changes happen
		if (this.rendererOptions.renderTextEditsAsSummary?.(chatTextEdit.uri)) {
			if (isResponseVM(element) && element.response.value.every(item => item.kind === 'textEditGroup')) {
				return {
					element: $('.interactive-edits-summary', undefined, !element.isComplete ? localize('editsSummary1', "Making changes...") : localize('editsSummary', "Made changes.")),
					dispose() { }
				};
			}
			return undefined;
		}

		const store = new DisposableStore();
		const cts = new CancellationTokenSource();

		let isDisposed = false;
		store.add(toDisposable(() => {
			isDisposed = true;
			cts.dispose(true);
		}));

		const ref = this._diffEditorPool.get();

		// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
		// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
		store.add(ref.object.onDidChangeContentHeight(() => {
			ref.object.layout(this._currentLayoutWidth);
			this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
		}));

		const data: ICodeCompareBlockData = {
			element,
			edit: chatTextEdit,
			diffData: (async () => {

				const ref = await this.textModelService.createModelReference(chatTextEdit.uri);

				if (isDisposed) {
					ref.dispose();
					return;
				}

				store.add(ref);

				const original = ref.object.textEditorModel;
				let originalSha1: string = '';

				if (chatTextEdit.state) {
					originalSha1 = chatTextEdit.state.sha1;
				} else {
					const sha1 = new DefaultModelSHA1Computer();
					if (sha1.canComputeSHA1(original)) {
						originalSha1 = sha1.computeSHA1(original);
						chatTextEdit.state = { sha1: originalSha1, applied: 0 };
					}
				}

				const modified = this.modelService.createModel(
					createTextBufferFactoryFromSnapshot(original.createSnapshot()),
					{ languageId: original.getLanguageId(), onDidChange: Event.None },
					URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: original.uri.path, query: generateUuid() }),
					false
				);
				store.add(modified);
				if (!chatTextEdit.state?.applied) {
					for (const group of chatTextEdit.edits) {
						const edits = group.map(TextEdit.asEditOperation);
						modified.pushEditOperations(null, edits, () => null);
					}
				}
				return {
					modified,
					original,
					originalSha1
				} satisfies ICodeCompareBlockDiffData;
			})()
		};
		ref.object.render(data, this._currentLayoutWidth, cts.token);

		return {
			element: ref.object.element,
			dispose() {
				store.dispose();
			},
		};
	}

	private renderMarkdown(markdown: IMarkdownString, element: ChatTreeItem, templateData: IChatListItemTemplate, fillInIncompleteTokens = false): IMarkdownRenderResult {
		const disposables = new DisposableStore();

		// We release editors in order so that it's more likely that the same editor will be assigned if this element is re-rendered right away, like it often is during progressive rendering
		const orderedDisposablesList: IDisposable[] = [];
		const codeblocks: IChatCodeBlockInfo[] = [];
		let codeBlockIndex = 0;
		const result = this.renderer.render(markdown, {
			disallowRemoteImages: true,
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, text) => {
				const index = codeBlockIndex++;
				let textModel: Promise<IResolvedTextEditorModel>;
				let range: Range | undefined;
				let vulns: readonly IMarkdownVulnerability[] | undefined;
				if (equalsIgnoreCase(languageId, localFileLanguageId)) {
					try {
						const parsedBody = parseLocalFileData(text);
						range = parsedBody.range && Range.lift(parsedBody.range);
						textModel = this.textModelService.createModelReference(parsedBody.uri).then(ref => ref.object);
					} catch (e) {
						return $('div');
					}
				} else {
					if (!isRequestVM(element) && !isResponseVM(element)) {
						console.error('Trying to render code block in welcome', element.id, index);
						return $('div');
					}

					const sessionId = isResponseVM(element) || isRequestVM(element) ? element.sessionId : '';
					const modelEntry = this.codeBlockModelCollection.getOrCreate(sessionId, element, index);
					vulns = modelEntry.vulns;
					textModel = modelEntry.model;
				}

				const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
				const ref = this.renderCodeBlock({ languageId, textModel, codeBlockIndex: index, element, range, hideToolbar, parentContextKeyService: templateData.contextKeyService, vulns }, text);

				// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
				// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
				disposables.add(ref.object.onDidChangeContentHeight(() => {
					ref.object.layout(this._currentLayoutWidth);
					this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
				}));

				if (isResponseVM(element)) {
					const info: IChatCodeBlockInfo = {
						codeBlockIndex: index,
						element,
						focus() {
							ref.object.focus();
						}
					};
					codeblocks.push(info);
					if (ref.object.uri) {
						const uri = ref.object.uri;
						this.codeBlocksByEditorUri.set(uri, info);
						disposables.add(toDisposable(() => this.codeBlocksByEditorUri.delete(uri)));
					}
				}
				orderedDisposablesList.push(ref);
				return ref.object.element;
			},
			asyncRenderCallback: () => this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight }),
		});

		if (isResponseVM(element)) {
			this.codeBlocksByResponseId.set(element.id, codeblocks);
			disposables.add(toDisposable(() => this.codeBlocksByResponseId.delete(element.id)));
		}

		disposables.add(this.markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(result.element));

		orderedDisposablesList.reverse().forEach(d => disposables.add(d));
		return {
			element: result.element,
			dispose() {
				result.dispose();
				disposables.dispose();
			}
		};
	}

	private renderCodeBlock(data: ICodeBlockData, text: string): IDisposableReference<CodeBlockPart> {
		const ref = this._editorPool.get();
		const editorInfo = ref.object;
		if (isResponseVM(data.element)) {
			this.codeBlockModelCollection.update(data.element.sessionId, data.element, data.codeBlockIndex, { text, languageId: data.languageId });
		}

		editorInfo.render(data, this._currentLayoutWidth, this.rendererOptions.editableCodeBlock);

		return ref;
	}

	private getDataForProgressiveRender(element: IChatResponseViewModel, data: IMarkdownString, renderData: Pick<IChatResponseMarkdownRenderData, 'lastRenderTime' | 'renderedWordCount'>): IWordCountResult & { rate: number } | undefined {
		const rate = this.getProgressiveRenderRate(element);
		const numWordsToRender = renderData.lastRenderTime === 0 ?
			1 :
			renderData.renderedWordCount +
			// Additional words to render beyond what's already rendered
			Math.floor((Date.now() - renderData.lastRenderTime) / 1000 * rate);

		if (numWordsToRender === renderData.renderedWordCount) {
			return undefined;
		}

		return {
			...getNWords(data.value, numWordsToRender),
			rate
		};
	}

	disposeElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IChatListItemTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IChatListItemTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

export class ChatListDelegate implements IListVirtualDelegate<ChatTreeItem> {
	constructor(
		private readonly defaultElementHeight: number,
		@ILogService private readonly logService: ILogService
	) { }

	private _traceLayout(method: string, message: string) {
		if (forceVerboseLayoutTracing) {
			this.logService.info(`ChatListDelegate#${method}: ${message}`);
		} else {
			this.logService.trace(`ChatListDelegate#${method}: ${message}`);
		}
	}

	getHeight(element: ChatTreeItem): number {
		const kind = isRequestVM(element) ? 'request' : 'response';
		const height = ('currentRenderedHeight' in element ? element.currentRenderedHeight : undefined) ?? this.defaultElementHeight;
		this._traceLayout('getHeight', `${kind}, height=${height}`);
		return height;
	}

	getTemplateId(element: ChatTreeItem): string {
		return ChatListItemRenderer.ID;
	}

	hasDynamicHeight(element: ChatTreeItem): boolean {
		return true;
	}
}


interface IDisposableReference<T> extends IDisposable {
	object: T;
	isStale: () => boolean;
}

class EditorPool extends Disposable {

	private readonly _pool: ResourcePool<CodeBlockPart>;

	public inUse(): Iterable<CodeBlockPart> {
		return this._pool.inUse;
	}

	constructor(
		options: ChatEditorOptions,
		delegate: IChatRendererDelegate,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => {
			return instantiationService.createInstance(CodeBlockPart, options, MenuId.ChatCodeBlock, delegate, overflowWidgetsDomNode);
		}));
	}

	get(): IDisposableReference<CodeBlockPart> {
		const codeBlock = this._pool.get();
		let stale = false;
		return {
			object: codeBlock,
			isStale: () => stale,
			dispose: () => {
				codeBlock.reset();
				stale = true;
				this._pool.release(codeBlock);
			}
		};
	}
}

class DiffEditorPool extends Disposable {

	private readonly _pool: ResourcePool<CodeCompareBlockPart>;

	public inUse(): Iterable<CodeCompareBlockPart> {
		return this._pool.inUse;
	}

	constructor(
		options: ChatEditorOptions,
		delegate: IChatRendererDelegate,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => {
			return instantiationService.createInstance(CodeCompareBlockPart, options, MenuId.ChatCompareBlock, delegate, overflowWidgetsDomNode);
		}));
	}

	get(): IDisposableReference<CodeCompareBlockPart> {
		const codeBlock = this._pool.get();
		let stale = false;
		return {
			object: codeBlock,
			isStale: () => stale,
			dispose: () => {
				codeBlock.reset();
				stale = true;
				this._pool.release(codeBlock);
			}
		};
	}
}

class TreePool extends Disposable {
	private _pool: ResourcePool<WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData, void>>;

	public get inUse(): ReadonlySet<WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData, void>> {
		return this._pool.inUse;
	}

	constructor(
		private _onDidChangeVisibility: Event<boolean>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.treeFactory()));
	}

	private treeFactory(): WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData, void> {
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));

		const container = $('.interactive-response-progress-tree');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));

		const tree = this.instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData>,
			'ChatListRenderer',
			container,
			new ChatListTreeDelegate(),
			new ChatListTreeCompressionDelegate(),
			[new ChatListTreeRenderer(resourceLabels, this.configService.getValue('explorer.decorations'))],
			new ChatListTreeDataSource(),
			{
				collapseByDefault: () => false,
				expandOnlyOnTwistieClick: () => false,
				identityProvider: {
					getId: (e: IChatResponseProgressFileTreeData) => e.uri.toString()
				},
				accessibilityProvider: {
					getAriaLabel: (element: IChatResponseProgressFileTreeData) => element.label,
					getWidgetAriaLabel: () => localize('treeAriaLabel', "File Tree")
				},
				alwaysConsumeMouseWheel: false
			});

		return tree;
	}

	get(): IDisposableReference<WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData, void>> {
		const object = this._pool.get();
		let stale = false;
		return {
			object,
			isStale: () => stale,
			dispose: () => {
				stale = true;
				this._pool.release(object);
			}
		};
	}
}

class ContentReferencesListPool extends Disposable {
	private _pool: ResourcePool<WorkbenchList<IChatContentReference>>;

	public get inUse(): ReadonlySet<WorkbenchList<IChatContentReference>> {
		return this._pool.inUse;
	}

	constructor(
		private _onDidChangeVisibility: Event<boolean>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.listFactory()));
	}

	private listFactory(): WorkbenchList<IChatContentReference> {
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));

		const container = $('.chat-used-context-list');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));

		const list = this.instantiationService.createInstance(
			WorkbenchList<IChatContentReference>,
			'ChatListRenderer',
			container,
			new ContentReferencesListDelegate(),
			[this.instantiationService.createInstance(ContentReferencesListRenderer, resourceLabels)],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: IChatContentReference) => {
						const reference = element.reference;
						if ('variableName' in reference) {
							return reference.variableName;
						} else if (URI.isUri(reference)) {
							return basename(reference.path);
						} else {
							return basename(reference.uri.path);
						}
					},

					getWidgetAriaLabel: () => localize('usedReferences', "Used References")
				},
				dnd: {
					getDragURI: ({ reference }: IChatContentReference) => {
						if ('variableName' in reference) {
							return null;
						} else if (URI.isUri(reference)) {
							return reference.toString();
						} else {
							return reference.uri.toString();
						}
					},
					dispose: () => { },
					onDragOver: () => false,
					drop: () => { },
				},
			});

		return list;
	}

	get(): IDisposableReference<WorkbenchList<IChatContentReference>> {
		const object = this._pool.get();
		let stale = false;
		return {
			object,
			isStale: () => stale,
			dispose: () => {
				stale = true;
				this._pool.release(object);
			}
		};
	}
}

class ContentReferencesListDelegate implements IListVirtualDelegate<IChatContentReference> {
	getHeight(element: IChatContentReference): number {
		return 22;
	}

	getTemplateId(element: IChatContentReference): string {
		return ContentReferencesListRenderer.TEMPLATE_ID;
	}
}

interface IChatContentReferenceListTemplate {
	label: IResourceLabel;
	templateDisposables: IDisposable;
}

class ContentReferencesListRenderer implements IListRenderer<IChatContentReference, IChatContentReferenceListTemplate> {
	static TEMPLATE_ID = 'contentReferencesListRenderer';
	readonly templateId: string = ContentReferencesListRenderer.TEMPLATE_ID;

	constructor(
		private labels: ResourceLabels,
		@IThemeService private readonly themeService: IThemeService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
	) { }

	renderTemplate(container: HTMLElement): IChatContentReferenceListTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
		return { templateDisposables, label };
	}


	private getReferenceIcon(data: IChatContentReference): URI | ThemeIcon | undefined {
		if (ThemeIcon.isThemeIcon(data.iconPath)) {
			return data.iconPath;
		} else {
			return this.themeService.getColorTheme().type === ColorScheme.DARK && data.iconPath?.dark ? data.iconPath?.dark :
				data.iconPath?.light;
		}
	}

	renderElement(data: IChatContentReference, index: number, templateData: IChatContentReferenceListTemplate, height: number | undefined): void {
		const reference = data.reference;
		const icon = this.getReferenceIcon(data);
		templateData.label.element.style.display = 'flex';
		if ('variableName' in reference) {
			if (reference.value) {
				const uri = URI.isUri(reference.value) ? reference.value : reference.value.uri;
				templateData.label.setResource(
					{
						resource: uri,
						name: basenameOrAuthority(uri),
						description: `#${reference.variableName}`,
						range: 'range' in reference.value ? reference.value.range : undefined,
					}, { icon });
			} else {
				const variable = this.chatVariablesService.getVariable(reference.variableName);
				templateData.label.setLabel(`#${reference.variableName}`, undefined, { title: variable?.description });
			}
		} else {
			const uri = 'uri' in reference ? reference.uri : reference;
			if (matchesSomeScheme(uri, Schemas.mailto, Schemas.http, Schemas.https)) {
				templateData.label.setResource({ resource: uri, name: uri.toString() }, { icon: icon ?? Codicon.globe });
			} else {
				templateData.label.setFile(uri, {
					fileKind: FileKind.FILE,
					// Should not have this live-updating data on a historical reference
					fileDecorations: { badges: false, colors: false },
					range: 'range' in reference ? reference.range : undefined
				});
			}
		}
	}

	disposeTemplate(templateData: IChatContentReferenceListTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

class ResourcePool<T extends IDisposable> extends Disposable {
	private readonly pool: T[] = [];

	private _inUse = new Set<T>;
	public get inUse(): ReadonlySet<T> {
		return this._inUse;
	}

	constructor(
		private readonly _itemFactory: () => T,
	) {
		super();
	}

	get(): T {
		if (this.pool.length > 0) {
			const item = this.pool.pop()!;
			this._inUse.add(item);
			return item;
		}

		const item = this._register(this._itemFactory());
		this._inUse.add(item);
		return item;
	}

	release(item: T): void {
		this._inUse.delete(item);
		this.pool.push(item);
	}
}

class ChatVoteButton extends MenuEntryActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.toggle('checked', this.action.checked);
	}
}

class ChatListTreeDelegate implements IListVirtualDelegate<IChatResponseProgressFileTreeData> {
	static readonly ITEM_HEIGHT = 22;

	getHeight(element: IChatResponseProgressFileTreeData): number {
		return ChatListTreeDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: IChatResponseProgressFileTreeData): string {
		return 'chatListTreeTemplate';
	}
}

class ChatListTreeCompressionDelegate implements ITreeCompressionDelegate<IChatResponseProgressFileTreeData> {
	isIncompressible(element: IChatResponseProgressFileTreeData): boolean {
		return !element.children;
	}
}

interface IChatListTreeRendererTemplate {
	templateDisposables: DisposableStore;
	label: IResourceLabel;
}

class ChatListTreeRenderer implements ICompressibleTreeRenderer<IChatResponseProgressFileTreeData, void, IChatListTreeRendererTemplate> {
	templateId: string = 'chatListTreeTemplate';

	constructor(private labels: ResourceLabels, private decorations: IFilesConfiguration['explorer']['decorations']) { }

	renderCompressedElements(element: ITreeNode<ICompressedTreeNode<IChatResponseProgressFileTreeData>, void>, index: number, templateData: IChatListTreeRendererTemplate, height: number | undefined): void {
		templateData.label.element.style.display = 'flex';
		const label = element.element.elements.map((e) => e.label);
		templateData.label.setResource({ resource: element.element.elements[0].uri, name: label }, {
			title: element.element.elements[0].label,
			fileKind: element.children ? FileKind.FOLDER : FileKind.FILE,
			extraClasses: ['explorer-item'],
			fileDecorations: this.decorations
		});
	}
	renderTemplate(container: HTMLElement): IChatListTreeRendererTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
		return { templateDisposables, label };
	}
	renderElement(element: ITreeNode<IChatResponseProgressFileTreeData, void>, index: number, templateData: IChatListTreeRendererTemplate, height: number | undefined): void {
		templateData.label.element.style.display = 'flex';
		if (!element.children.length && element.element.type !== FileType.Directory) {
			templateData.label.setFile(element.element.uri, {
				fileKind: FileKind.FILE,
				hidePath: true,
				fileDecorations: this.decorations,
			});
		} else {
			templateData.label.setResource({ resource: element.element.uri, name: element.element.label }, {
				title: element.element.label,
				fileKind: FileKind.FOLDER,
				fileDecorations: this.decorations
			});
		}
	}
	disposeTemplate(templateData: IChatListTreeRendererTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

class ChatListTreeDataSource implements IAsyncDataSource<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData> {
	hasChildren(element: IChatResponseProgressFileTreeData): boolean {
		return !!element.children;
	}

	async getChildren(element: IChatResponseProgressFileTreeData): Promise<Iterable<IChatResponseProgressFileTreeData>> {
		return element.children ?? [];
	}
}

function isInteractiveProgressTreeData(item: Object): item is IChatResponseProgressFileTreeData {
	return 'label' in item;
}

function contentToMarkdown(str: string | IMarkdownString): IMarkdownString {
	return typeof str === 'string' ? { value: str } : str;
}

function isProgressMessage(item: any): item is IChatProgressMessage {
	return item && 'kind' in item && item.kind === 'progressMessage';
}

function isProgressMessageRenderData(item: IChatRenderData): item is IChatProgressMessageRenderData {
	return item && 'isAtEndOfResponse' in item;
}

function isCommandButtonRenderData(item: IChatRenderData): item is IChatCommandButton {
	return item && 'kind' in item && item.kind === 'command';
}

function isTextEditRenderData(item: IChatRenderData): item is IChatTextEditGroup {
	return item && 'kind' in item && item.kind === 'textEditGroup';
}

function isMarkdownRenderData(item: IChatRenderData): item is IChatResponseMarkdownRenderData {
	return item && 'renderedWordCount' in item;
}

function onlyProgressMessagesAfterI(items: ReadonlyArray<IChatProgressRenderableResponseContent>, i: number): boolean {
	return items.slice(i).every(isProgressMessage);
}

function onlyProgressMessageRenderDatasAfterI(items: ReadonlyArray<IChatRenderData>, i: number): boolean {
	return items.slice(i).every(isProgressMessageRenderData);
}
