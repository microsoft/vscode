/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { renderFormattedText } from 'vs/base/browser/formattedTextRenderer';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { Button } from 'vs/base/browser/ui/button/button';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { distinct } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { FileAccess, Schemas, matchesSomeScheme } from 'vs/base/common/network';
import { clamp } from 'vs/base/common/numbers';
import { autorun } from 'vs/base/common/observable';
import { basename } from 'vs/base/common/path';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { localize } from 'vs/nls';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem, createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { FileKind } from 'vs/platform/files/common/files';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { ChatTreeItem, GeneratingPhrase, IChatCodeBlockInfo, IChatFileTreeInfo } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentHover, getChatAgentHoverOptions } from 'vs/workbench/contrib/chat/browser/chatAgentHover';
import { IDisposableReference, ResourcePool } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatCollections';
import { ChatCommandButtonContentPart } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatCommandContentPart';
import { ChatConfirmationContentPart } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatConfirmationContentPart';
import { ChatMarkdownContentPart, EditorPool } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatMarkdownContentPart';
import { ChatProgressContentPart } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatProgressContentPart';
import { ChatTextEditContentPart, DiffEditorPool } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatTextEditContentPart';
import { ChatTreeContentPart, TreePool } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatTreeContentPart';
import { ChatWarningContentPart } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatWarningContentPart';
import { ChatFollowups } from 'vs/workbench/contrib/chat/browser/chatFollowups';
import { ChatMarkdownDecorationsRenderer } from 'vs/workbench/contrib/chat/browser/chatMarkdownDecorationsRenderer';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/chat/browser/chatMarkdownRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { ChatCodeBlockContentProvider } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { ChatAgentLocation, IChatAgentMetadata } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING, CONTEXT_REQUEST, CONTEXT_RESPONSE, CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND, CONTEXT_RESPONSE_FILTERED, CONTEXT_RESPONSE_VOTE } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatProgressRenderableResponseContent, IChatTextEditGroup } from 'vs/workbench/contrib/chat/common/chatModel';
import { chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ChatAgentVoteDirection, IChatCommandButton, IChatConfirmation, IChatContentReference, IChatFollowup, IChatProgressMessage, IChatResponseProgressFileTreeData, IChatTask, IChatWarningMessage } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IChatProgressMessageRenderData, IChatRenderData, IChatResponseMarkdownRenderData, IChatResponseViewModel, IChatTaskRenderData, IChatWelcomeMessageViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IWordCountResult, getNWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { createFileIconThemableTreeContainerScope } from 'vs/workbench/contrib/files/browser/views/explorerView';
import { annotateSpecialMarkdownContent } from '../common/annotations';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection';
import { IChatListItemRendererOptions } from './chat';

const $ = dom.$;

interface IChatListItemTemplate {
	currentElement?: ChatTreeItem;
	readonly rowContainer: HTMLElement;
	readonly titleToolbar?: MenuWorkbenchToolBar;
	readonly avatarContainer: HTMLElement;
	readonly username: HTMLElement;
	readonly detail: HTMLElement;
	readonly value: HTMLElement;
	readonly referencesListContainer: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly instantiationService: IInstantiationService;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
	readonly agentHover: ChatAgentHover;
}

interface IItemHeightChangeParams {
	element: ChatTreeItem;
	height: number;
}

interface IChatMarkdownRenderResult extends IMarkdownRenderResult {
	codeBlockCount: number;
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

	private readonly _onDidClickRerunWithAgentOrCommandDetection = new Emitter<IChatResponseViewModel>();
	readonly onDidClickRerunWithAgentOrCommandDetection: Event<IChatResponseViewModel> = this._onDidClickRerunWithAgentOrCommandDetection.event;

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
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this.renderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));
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

		let headerParent = rowContainer;
		let referencesListParent = rowContainer;
		let valueParent = rowContainer;
		let detailContainerParent: HTMLElement | undefined;
		let toolbarParent: HTMLElement | undefined;

		if (this.rendererOptions.renderStyle === 'minimal') {
			rowContainer.classList.add('interactive-item-compact');
			rowContainer.classList.add('minimal');
			// -----------------------------------------------------
			//  icon | details
			//       | references
			//       | value
			// -----------------------------------------------------
			const lhsContainer = dom.append(rowContainer, $('.column.left'));
			const rhsContainer = dom.append(rowContainer, $('.column'));

			headerParent = lhsContainer;
			detailContainerParent = rhsContainer;
			referencesListParent = rhsContainer;
			valueParent = rhsContainer;
			toolbarParent = dom.append(rowContainer, $('.header'));
		}

		const header = dom.append(headerParent, $('.header'));
		const user = dom.append(header, $('.user'));
		user.tabIndex = 0;
		user.role = 'toolbar';
		const avatarContainer = dom.append(user, $('.avatar-container'));
		const username = dom.append(user, $('h3.username'));
		const detailContainer = dom.append(detailContainerParent ?? user, $('span.detail-container'));
		const detail = dom.append(detailContainer, $('span.detail'));
		dom.append(detailContainer, $('span.chat-animated-ellipsis'));
		const referencesListContainer = dom.append(referencesListParent, $('.referencesListContainer'));
		const value = dom.append(valueParent, $('.value'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService]));
		let titleToolbar: MenuWorkbenchToolBar | undefined;
		if (this.rendererOptions.noHeader) {
			header.classList.add('hidden');
		} else {
			titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarParent ?? header, MenuId.ChatMessageTitle, {
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
		const hoverContent = () => {
			if (isResponseVM(template.currentElement) && template.currentElement.agent && !template.currentElement.agent.isDefault) {
				agentHover.setAgent(template.currentElement.agent.id);
				return agentHover.domNode;
			}

			return undefined;
		};
		const hoverOptions = getChatAgentHoverOptions(() => isResponseVM(template.currentElement) ? template.currentElement.agent : undefined, this.commandService);
		templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), user, hoverContent, hoverOptions));
		templateDisposables.add(dom.addDisposableListener(user, dom.EventType.KEY_DOWN, e => {
			const ev = new StandardKeyboardEvent(e);
			if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
				const content = hoverContent();
				if (content) {
					this.hoverService.showHover({ content, target: user, trapFocus: true, actions: hoverOptions.actions }, true);
				}
			} else if (ev.equals(KeyCode.Escape)) {
				this.hoverService.hideHover();
			}
		}));
		const template: IChatListItemTemplate = { avatarContainer, username, detail, referencesListContainer, value, rowContainer, elementDisposables, titleToolbar, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, agentHover };
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
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set(element.vote === ChatAgentVoteDirection.Up ? 'up' : element.vote === ChatAgentVoteDirection.Down ? 'down' : '');
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
				this.markdownDecorationsRenderer.convertParsedRequestToMarkdown(element.message); // TODO@roblourens can be a ChatMarkdownContentPart
			this.basicRenderElement([{ content: new MarkdownString(markdown), kind: 'markdownContent' }], element, index, templateData);
		} else {
			this.renderWelcomeMessage(element, templateData);
		}
	}

	private renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {
		templateData.elementDisposables.add(autorun(reader => {
			this._renderDetail(element, templateData);
		}));
	}

	private _renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {

		dom.clearNode(templateData.detail);

		if (element.slashCommand && element.agentOrSlashCommandDetected) {
			let msg: string = '';
			const usingMsg = `${chatSubcommandLeader}${element.slashCommand.name}`;
			if (element.isComplete) {
				msg = localize('usedAgent', "used {0} [[(rerun without)]]", usingMsg);
			} else {
				msg = localize('usingAgent', "using {0}", usingMsg);
			}
			dom.reset(templateData.detail, renderFormattedText(msg, {
				className: 'agentOrSlashCommandDetected',
				inline: true,
				actionHandler: {
					disposables: templateData.elementDisposables,
					callback: (content) => {
						this._onDidClickRerunWithAgentOrCommandDetection.fire(element);
					},
				}
			}));

		} else if (!element.isComplete) {
			templateData.detail.textContent = GeneratingPhrase;
		}
	}

	private renderAvatar(element: ChatTreeItem, templateData: IChatListItemTemplate): void {
		const icon = isResponseVM(element) ?
			this.getAgentIcon(element.agent?.metadata) :
			(element.avatarIcon ?? Codicon.account);
		if (icon instanceof URI) {
			const avatarIcon = dom.$<HTMLImageElement>('img.icon');
			avatarIcon.src = FileAccess.uriToBrowserUri(icon).toString(true);
			templateData.avatarContainer.replaceChildren(dom.$('.avatar', undefined, avatarIcon));
		} else {
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(icon));
			templateData.avatarContainer.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
		}
	}

	private getAgentIcon(agent: IChatAgentMetadata | undefined): URI | ThemeIcon {
		if (agent?.themeIcon) {
			return agent.themeIcon;
		} else if (agent?.iconDark && this.themeService.getColorTheme().type === ColorScheme.DARK) {
			return agent.iconDark;
		} else if (agent?.icon) {
			return agent.icon;
		} else {
			return Codicon.copilot;
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
		let codeBlockIndex = 0;
		value.forEach((data, index) => {
			const result = data.kind === 'treeData'
				? this.renderTreeData(data.treeData, element, templateData, fileTreeIndex++)
				: data.kind === 'markdownContent'
					? this.renderMarkdown(data.content, element, templateData, fillInIncompleteTokens, codeBlockIndex)
					: data.kind === 'progressMessage' && onlyProgressMessagesAfterI(value, index) ? this.renderProgressMessage(data, false)
						: data.kind === 'progressTask' ? this.renderProgressTask(data, false, element, templateData)
							: data.kind === 'command' ? this.instantiationService.createInstance(ChatCommandButtonContentPart, data, element)
								: data.kind === 'textEditGroup' ? this.renderTextEdit(element, data, templateData)
									: data.kind === 'warning' ? this.instantiationService.createInstance(ChatWarningContentPart, 'warning', data.content, this.renderer)
										: data.kind === 'confirmation' ? this.renderConfirmation(element, data, templateData)
											: undefined;

			if (result) {
				templateData.value.appendChild(result.element);
				templateData.elementDisposables.add(result);

				if ('codeBlockCount' in result) {
					codeBlockIndex += (result as IChatMarkdownRenderResult).codeBlockCount;
				}
			}
		});

		if (isResponseVM(element) && element.errorDetails?.message) {
			const renderedError = this.instantiationService.createInstance(ChatWarningContentPart, element.errorDetails.responseIsFiltered ? 'info' : 'error', new MarkdownString(element.errorDetails.message), this.renderer);
			templateData.elementDisposables.add(renderedError);
			templateData.value.appendChild(renderedError.element);
		}

		const newHeight = templateData.rowContainer.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.elementDisposables.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.value), () => {
				// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
				// If it becomes properly sync, then this could be removed.
				element.currentRenderedHeight = templateData.rowContainer.offsetHeight;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, height: element.currentRenderedHeight });
			}));
		}
	}

	private updateItemHeight(templateData: IChatListItemTemplate): void {
		if (!templateData.currentElement) {
			return;
		}

		const newHeight = templateData.rowContainer.offsetHeight;
		templateData.currentElement.currentRenderedHeight = newHeight;
		this._onDidChangeItemHeight.fire({ element: templateData.currentElement, height: newHeight });
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
				// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
				// If it becomes properly sync, then this could be removed.
				element.currentRenderedHeight = templateData.rowContainer.offsetHeight;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, height: element.currentRenderedHeight });
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
					} else if (part.kind === 'command' ||
						part.kind === 'textEditGroup' ||
						part.kind === 'confirmation' ||
						part.kind === 'warning') {
						partsToRender[index] = part;
					} else if (part.kind === 'progressTask') {
						partsToRender[index] = {
							task: part,
							isSettled: part.isSettled?.() ?? true,
							progressLength: part.progress.length,
						};
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

				else if (part.kind === 'progressTask' && isProgressTaskRenderData(renderedPart)) {
					const isSettled = part.isSettled?.() ?? true;
					if (renderedPart.isSettled !== isSettled || part.progress.length !== renderedPart.progressLength || isSettled) {
						partsToRender[index] = { task: part, isSettled, progressLength: part.progress.length };
					}
				}
			});

			isFullyRendered = partsToRender.filter((p) => !('isSettled' in p) || !p.isSettled).length === 0 && !somePartIsNotFullyRendered;

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
					} else if (isProgressTaskRenderData(partToRender)) {
						result = this.renderProgressTask(partToRender.task, !partToRender.isSettled, element, templateData);
					} else if (isCommandButtonRenderData(partToRender)) {
						result = this.instantiationService.createInstance(ChatCommandButtonContentPart, partToRender, element);
					} else if (isTextEditRenderData(partToRender)) {
						result = this.renderTextEdit(element, partToRender, templateData);
					} else if (isConfirmationRenderData(partToRender)) {
						result = this.renderConfirmation(element, partToRender, templateData);
					} else if (isWarningRenderData(partToRender)) {
						result = this.instantiationService.createInstance(ChatWarningContentPart, 'warning', partToRender.content, this.renderer);
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
		const store = new DisposableStore();
		const treePart = store.add(this.instantiationService.createInstance(ChatTreeContentPart, data, element, this._treePool, treeDataIndex));

		store.add(treePart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));

		if (isResponseVM(element)) {
			const fileTreeFocusInfo = {
				treeDataId: data.uri.toString(),
				treeIndex: treeDataIndex,
				focus() {
					treePart.domFocus();
				}
			};

			// TODO@roblourens there's got to be a better way to navigate trees
			store.add(treePart.onDidFocus(() => {
				this.focusedFileTreesByResponseId.set(element.id, fileTreeFocusInfo.treeIndex);
			}));

			const fileTrees = this.fileTreesByResponseId.get(element.id) ?? [];
			fileTrees.push(fileTreeFocusInfo);
			this.fileTreesByResponseId.set(element.id, distinct(fileTrees, (v) => v.treeDataId));
			store.add(toDisposable(() => this.fileTreesByResponseId.set(element.id, fileTrees.filter(v => v.treeDataId !== data.uri.toString()))));
		}

		return {
			element: treePart.element,
			dispose: () => store.dispose()
		};
	}

	private renderContentReferencesIfNeeded(element: ChatTreeItem, templateData: IChatListItemTemplate, disposables: DisposableStore): void {
		if (isResponseVM(element) && this._usedReferencesEnabled && element.contentReferences.length) {
			dom.show(templateData.referencesListContainer);
			const contentReferencesListResult = this.renderContentReferencesListData(null, element.contentReferences, element, templateData);
			if (templateData.referencesListContainer.firstChild) {
				templateData.referencesListContainer.replaceChild(contentReferencesListResult.element, templateData.referencesListContainer.firstChild!);
			} else {
				templateData.referencesListContainer.appendChild(contentReferencesListResult.element);
			}
			disposables.add(contentReferencesListResult);
		} else {
			dom.hide(templateData.referencesListContainer);
		}
	}

	private renderContentReferencesListData(task: IChatTask | null, data: ReadonlyArray<IChatContentReference | IChatWarningMessage>, element: IChatResponseViewModel, templateData: IChatListItemTemplate): { element: HTMLElement; dispose: () => void } {
		const listDisposables = new DisposableStore();
		const referencesLabel = task?.content.value ?? (data.length > 1 ?
			localize('usedReferencesPlural', "Used {0} references", data.length) :
			localize('usedReferencesSingular', "Used {0} reference", 1));
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
		collapseButton.element.prepend(iconElement);
		this.updateAriaLabel(collapseButton.element, referencesLabel, element.usedReferencesExpanded);
		container.classList.toggle('chat-used-context-collapsed', !element.usedReferencesExpanded);
		listDisposables.add(collapseButton.onDidClick(() => {
			iconElement.classList.remove(...ThemeIcon.asClassNameArray(icon(element)));
			element.usedReferencesExpanded = !element.usedReferencesExpanded;
			iconElement.classList.add(...ThemeIcon.asClassNameArray(icon(element)));
			container.classList.toggle('chat-used-context-collapsed', !element.usedReferencesExpanded);
			this.updateItemHeight(templateData);
			this.updateAriaLabel(collapseButton.element, referencesLabel, element.usedReferencesExpanded);
		}));

		const ref = listDisposables.add(this._contentReferencesListPool.get());
		const list = ref.object;
		container.appendChild(list.getHTMLElement().parentElement!);

		listDisposables.add(list.onDidOpen((e) => {
			if (e.element && 'reference' in e.element) {
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

	private renderProgressTask(task: IChatTask, showSpinner: boolean, element: ChatTreeItem, templateData: IChatListItemTemplate): IMarkdownRenderResult | undefined {
		if (!isResponseVM(element)) {
			return;
		}

		if (task.progress.length) {
			const refs = this.renderContentReferencesListData(task, task.progress, element, templateData);
			const node = dom.$('.chat-progress-task');
			node.appendChild(refs.element);
			return { element: node, dispose: refs.dispose };
		}

		return this.renderProgressMessage(task, showSpinner);
	}

	private renderProgressMessage(progress: IChatProgressMessage | IChatTask, showSpinner: boolean): IMarkdownRenderResult {
		return this.instantiationService.createInstance(ChatProgressContentPart, progress, showSpinner, this.renderer);
	}

	private renderConfirmation(element: ChatTreeItem, confirmation: IChatConfirmation, templateData: IChatListItemTemplate): IMarkdownRenderResult | undefined {
		const store = new DisposableStore();
		const part = store.add(this.instantiationService.createInstance(ChatConfirmationContentPart, confirmation, element));
		store.add(part.onDidChangeHeight(() => this.updateItemHeight(templateData)));
		return {
			element: part.element,
			dispose() { store.dispose(); }
		};
	}

	private renderTextEdit(element: ChatTreeItem, chatTextEdit: IChatTextEditGroup, templateData: IChatListItemTemplate): IMarkdownRenderResult | undefined {

		const store = new DisposableStore();
		const textEditPart = store.add(this.instantiationService.createInstance(ChatTextEditContentPart, chatTextEdit, element, this.rendererOptions, this._diffEditorPool, this._currentLayoutWidth));
		store.add(textEditPart.onDidChangeHeight(() => {
			textEditPart.layout(this._currentLayoutWidth);
			this.updateItemHeight(templateData);
		}));

		return {
			element: textEditPart.element,
			dispose() { store.dispose(); }
		};
	}

	private renderMarkdown(markdown: IMarkdownString, element: ChatTreeItem, templateData: IChatListItemTemplate, fillInIncompleteTokens = false, codeBlockStartIndex = 0): IChatMarkdownRenderResult {
		const store = new DisposableStore();
		// TODO@roblourens too many parameters
		const markdownPart = store.add(this.instantiationService.createInstance(ChatMarkdownContentPart, markdown, element, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.renderer, this._currentLayoutWidth, this.codeBlockModelCollection, this.rendererOptions));
		store.add(markdownPart.onDidChangeHeight(() => {
			markdownPart.layout(this._currentLayoutWidth);
			this.updateItemHeight(templateData);
		}));
		this.codeBlocksByResponseId.set(element.id, markdownPart.codeblocks);
		store.add(toDisposable(() => this.codeBlocksByResponseId.delete(element.id)));

		markdownPart.codeblocks.forEach(info => {
			if (info.uri) {
				const uri = info.uri;
				this.codeBlocksByEditorUri.set(uri, info);
				this._register(toDisposable(() => this.codeBlocksByEditorUri.delete(uri)));
			}
		});

		return {
			codeBlockCount: markdownPart.codeBlockCount,
			element: markdownPart.element,
			dispose() {
				store.dispose();
			}
		};
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

class ContentReferencesListPool extends Disposable {
	private _pool: ResourcePool<WorkbenchList<IChatContentReference | IChatWarningMessage>>;

	public get inUse(): ReadonlySet<WorkbenchList<IChatContentReference | IChatWarningMessage>> {
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

	private listFactory(): WorkbenchList<IChatContentReference | IChatWarningMessage> {
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));

		const container = $('.chat-used-context-list');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));

		const list = this.instantiationService.createInstance(
			WorkbenchList<IChatContentReference | IChatWarningMessage>,
			'ChatListRenderer',
			container,
			new ContentReferencesListDelegate(),
			[this.instantiationService.createInstance(ContentReferencesListRenderer, resourceLabels)],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: IChatContentReference | IChatWarningMessage) => {
						if (element.kind === 'warning') {
							return element.content.value;
						}
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
					getDragURI: (element: IChatContentReference | IChatWarningMessage) => {
						if (element.kind === 'warning') {
							return null;
						}
						const { reference } = element;
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

	get(): IDisposableReference<WorkbenchList<IChatContentReference | IChatWarningMessage>> {
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

class ContentReferencesListDelegate implements IListVirtualDelegate<IChatContentReference | IChatWarningMessage> {
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

class ContentReferencesListRenderer implements IListRenderer<IChatContentReference | IChatWarningMessage, IChatContentReferenceListTemplate> {
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
			return this.themeService.getColorTheme().type === ColorScheme.DARK && data.iconPath?.dark
				? data.iconPath?.dark
				: data.iconPath?.light;
		}
	}

	renderElement(data: IChatContentReference | IChatWarningMessage, index: number, templateData: IChatContentReferenceListTemplate, height: number | undefined): void {
		if (data.kind === 'warning') {
			templateData.label.setResource({ name: data.content.value }, { icon: Codicon.warning });
			return;
		}

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

class ChatVoteButton extends MenuEntryActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.toggle('checked', this.action.checked);
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

function isProgressTaskRenderData(item: any): item is IChatTaskRenderData {
	return item && 'isSettled' in item;
}

function isWarningRenderData(item: any): item is IChatWarningMessage {
	return item && 'kind' in item && item.kind === 'warning';
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

function isConfirmationRenderData(item: IChatRenderData): item is IChatConfirmation {
	return item && 'kind' in item && item.kind === 'confirmation';
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
