/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { DropdownMenuActionViewItem, IDropdownMenuActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { IAction } from '../../../../base/common/actions.js';
import { coalesce, distinct } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { FileAccess } from '../../../../base/common/network.js';
import { clamp } from '../../../../base/common/numbers.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../nls.js';
import { IMenuEntryActionViewItemOptions, createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkbenchIssueService } from '../../issue/common/issue.js';
import { annotateSpecialMarkdownContent } from '../common/annotations.js';
import { ChatAgentLocation, IChatAgentMetadata } from '../common/chatAgents.js';
import { CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING, CONTEXT_ITEM_ID, CONTEXT_REQUEST, CONTEXT_RESPONSE, CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND, CONTEXT_RESPONSE_ERROR, CONTEXT_RESPONSE_FILTERED, CONTEXT_RESPONSE_VOTE } from '../common/chatContextKeys.js';
import { isChatRequestCheckpointed } from '../common/chatEditingService.js';
import { IChatRequestVariableEntry, IChatTextEditGroup } from '../common/chatModel.js';
import { chatSubcommandLeader } from '../common/chatParserTypes.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, IChatConfirmation, IChatContentReference, IChatFollowup, IChatMarkdownContent, IChatTask, IChatToolInvocation, IChatToolInvocationSerialized, IChatTreeData } from '../common/chatService.js';
import { IChatCodeCitations, IChatReferences, IChatRendererContent, IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../common/chatViewModel.js';
import { getNWords } from '../common/chatWordCounter.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { MarkUnhelpfulActionId } from './actions/chatTitleActions.js';
import { ChatTreeItem, GeneratingPhrase, IChatCodeBlockInfo, IChatFileTreeInfo, IChatListItemRendererOptions, IChatWidgetService } from './chat.js';
import { ChatAgentHover, getChatAgentHoverOptions } from './chatAgentHover.js';
import { ChatAttachmentsContentPart } from './chatContentParts/chatAttachmentsContentPart.js';
import { ChatCodeCitationContentPart } from './chatContentParts/chatCodeCitationContentPart.js';
import { ChatCommandButtonContentPart } from './chatContentParts/chatCommandContentPart.js';
import { ChatConfirmationContentPart } from './chatContentParts/chatConfirmationContentPart.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts/chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from './chatContentParts/chatMarkdownContentPart.js';
import { ChatProgressContentPart } from './chatContentParts/chatProgressContentPart.js';
import { ChatCollapsibleListContentPart, CollapsibleListPool } from './chatContentParts/chatReferencesContentPart.js';
import { ChatTaskContentPart } from './chatContentParts/chatTaskContentPart.js';
import { ChatTextEditContentPart, DiffEditorPool } from './chatContentParts/chatTextEditContentPart.js';
import { ChatToolInvocationPart } from './chatContentParts/chatToolInvocationPart.js';
import { ChatTreeContentPart, TreePool } from './chatContentParts/chatTreeContentPart.js';
import { ChatWarningContentPart } from './chatContentParts/chatWarningContentPart.js';
import { ChatMarkdownDecorationsRenderer } from './chatMarkdownDecorationsRenderer.js';
import { ChatMarkdownRenderer } from './chatMarkdownRenderer.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatCodeBlockContentProvider, CodeBlockPart } from './codeBlockPart.js';

const $ = dom.$;

interface IChatListItemTemplate {
	currentElement?: ChatTreeItem;
	renderedParts?: IChatContentPart[];
	readonly rowContainer: HTMLElement;
	readonly titleToolbar?: MenuWorkbenchToolBar;
	readonly footerToolbar: MenuWorkbenchToolBar;
	readonly avatarContainer: HTMLElement;
	readonly username: HTMLElement;
	readonly detail: HTMLElement;
	readonly value: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly instantiationService: IInstantiationService;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
	readonly agentHover: ChatAgentHover;
	readonly disabledOverlay: HTMLElement;
}

interface IItemHeightChangeParams {
	element: ChatTreeItem;
	height: number;
}

const forceVerboseLayoutTracing = false
	// || Boolean("TRUE") // causes a linter warning so that it cannot be pushed
	;

export interface IChatRendererDelegate {
	container: HTMLElement;
	getListLength(): number;

	readonly onDidScroll?: Event<void>;
}

const mostRecentResponseClassName = 'chat-most-recent-response';

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
	private readonly _contentReferencesListPool: CollapsibleListPool;

	private _currentLayoutWidth: number = 0;
	private _isVisible = true;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	constructor(
		editorOptions: ChatEditorOptions,
		private readonly rendererOptions: IChatListItemRendererOptions,
		private readonly delegate: IChatRendererDelegate,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		this.renderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));
		this.markdownDecorationsRenderer = this.instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode));
		this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, editorOptions, delegate, overflowWidgetsDomNode));
		this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
		this._contentReferencesListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, undefined));

		this._register(this.instantiationService.createInstance(ChatCodeBlockContentProvider));
	}

	get templateId(): string {
		return ChatListItemRenderer.ID;
	}

	editorsInUse(): Iterable<CodeBlockPart> {
		return this._editorPool.inUse();
	}

	private traceLayout(method: string, message: string) {
		if (forceVerboseLayoutTracing) {
			this.logService.info(`ChatListItemRenderer#${method}: ${message}`);
		} else {
			this.logService.trace(`ChatListItemRenderer#${method}: ${message}`);
		}
	}

	/**
	 * Compute a rate to render at in words/s.
	 */
	private getProgressiveRenderRate(element: IChatResponseViewModel): number {
		if (element.isComplete) {
			return 80;
		}

		if (element.contentUpdateTimings && element.contentUpdateTimings.impliedWordLoadRate) {
			const minRate = 5;
			const maxRate = 80;

			const rate = element.contentUpdateTimings.impliedWordLoadRate;
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
		const disabledOverlay = dom.append(container, $('.disabled-overlay'));
		const rowContainer = dom.append(container, $('.interactive-item-container'));
		if (this.rendererOptions.renderStyle === 'compact') {
			rowContainer.classList.add('interactive-item-compact');
		}
		if (this.rendererOptions.noPadding) {
			rowContainer.classList.add('no-padding');
		}

		let headerParent = rowContainer;
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
			const rhsContainer = dom.append(rowContainer, $('.column.right'));

			headerParent = lhsContainer;
			detailContainerParent = rhsContainer;
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
		const value = dom.append(valueParent, $('.value'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));

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
			}));
		}

		const footerToolbarContainer = dom.append(rowContainer, $('.chat-footer-toolbar'));
		const footerToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, footerToolbarContainer, MenuId.ChatMessageFooter, {
			eventDebounceDelay: 0,
			menuOptions: { shouldForwardArgs: true, renderShortTitle: true },
			toolbarOptions: { shouldInlineSubmenu: submenu => submenu.actions.length <= 1 },
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action instanceof MenuItemAction && action.item.id === MarkUnhelpfulActionId) {
					return scopedInstantiationService.createInstance(ChatVoteDownButton, action, options as IMenuEntryActionViewItemOptions);
				}
				return createActionViewItem(scopedInstantiationService, action, options);
			}
		}));

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
		const template: IChatListItemTemplate = { avatarContainer, username, detail, value, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, agentHover, titleToolbar, footerToolbar, disabledOverlay };
		return template;
	}

	renderElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IChatListItemTemplate): void {
		this.renderChatTreeItem(node.element, index, templateData);
	}

	private clearRenderedParts(templateData: IChatListItemTemplate): void {
		if (templateData.renderedParts) {
			dispose(coalesce(templateData.renderedParts));
			templateData.renderedParts = undefined;
			dom.clearNode(templateData.value);
		}
	}

	renderChatTreeItem(element: ChatTreeItem, index: number, templateData: IChatListItemTemplate): void {
		if (templateData.currentElement && templateData.currentElement.id !== element.id) {
			this.traceLayout('renderChatTreeItem', `Rendering a different element into the template, index=${index}`);
			this.clearRenderedParts(templateData);
		}

		templateData.currentElement = element;
		const kind = isRequestVM(element) ? 'request' :
			isResponseVM(element) ? 'response' :
				'welcome';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

		CONTEXT_RESPONSE.bindTo(templateData.contextKeyService).set(isResponseVM(element));
		CONTEXT_ITEM_ID.bindTo(templateData.contextKeyService).set(element.id);
		CONTEXT_REQUEST.bindTo(templateData.contextKeyService).set(isRequestVM(element));
		CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND.bindTo(templateData.contextKeyService).set(isResponseVM(element) && element.agentOrSlashCommandDetected);
		if (isResponseVM(element)) {
			CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING.bindTo(templateData.contextKeyService).set(!!element.agent?.metadata.supportIssueReporting);
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set(element.vote === ChatAgentVoteDirection.Up ? 'up' : element.vote === ChatAgentVoteDirection.Down ? 'down' : '');
			isChatRequestCheckpointed.bindTo(templateData.contextKeyService).set(element.model.session.checkpoint?.id === element.requestId);
		} else {
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set('');
		}

		if (templateData.titleToolbar) {
			templateData.titleToolbar.context = element;
		}
		templateData.footerToolbar.context = element;

		CONTEXT_RESPONSE_ERROR.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.errorDetails);
		const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);
		CONTEXT_RESPONSE_FILTERED.bindTo(templateData.contextKeyService).set(isFiltered);

		templateData.rowContainer.classList.toggle('editing-session', this.chatWidgetService.getWidgetBySessionId(element.sessionId)?.location === ChatAgentLocation.EditingSession);
		templateData.rowContainer.classList.toggle('interactive-request', isRequestVM(element));
		templateData.rowContainer.classList.toggle('interactive-response', isResponseVM(element));
		templateData.rowContainer.classList.toggle('show-detail-progress', isResponseVM(element) && !element.isComplete && !element.progressMessages.length);
		templateData.username.textContent = element.username;
		if (!this.rendererOptions.noHeader) {
			this.renderAvatar(element, templateData);
		}

		dom.clearNode(templateData.detail);
		if (isResponseVM(element)) {
			this.renderDetail(element, templateData);
		}

		templateData.disabledOverlay.classList.toggle('disabled', element.isDisabled);
		templateData.rowContainer.classList.toggle('disabled', element.isDisabled);
		templateData.rowContainer.classList.toggle(mostRecentResponseClassName, index === this.delegate.getListLength() - 1);

		if (isRequestVM(element) && element.confirmation) {
			this.renderConfirmationAction(element, templateData);
		}

		// Do a progressive render if
		// - This the last response in the list
		// - And it has some content
		// - And the response is not complete
		//   - Or, we previously started a progressive rendering of this element (if the element is complete, we will finish progressive rendering with a very fast rate)
		if (isResponseVM(element) && index === this.delegate.getListLength() - 1 && (!element.isComplete || element.renderData)) {
			this.traceLayout('renderElement', `start progressive render, index=${index}`);

			const timer = templateData.elementDisposables.add(new dom.WindowIntervalTimer());
			const runProgressiveRender = (initial?: boolean) => {
				try {
					if (this.doNextProgressiveRender(element, index, templateData, !!initial)) {
						timer.cancel();
					}
				} catch (err) {
					// Kill the timer if anything went wrong, avoid getting stuck in a nasty rendering loop.
					timer.cancel();
					this.logService.error(err);
				}
			};
			timer.cancelAndSet(runProgressiveRender, 50, dom.getWindow(templateData.rowContainer));
			runProgressiveRender(true);
		} else {
			if (isResponseVM(element)) {
				this.basicRenderElement(element, index, templateData);
			} else if (isRequestVM(element)) {
				this.basicRenderElement(element, index, templateData);
			}
		}
	}

	private renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {
		templateData.elementDisposables.add(autorun(reader => {
			this._renderDetail(element, templateData);
		}));
	}

	private _renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {

		dom.clearNode(templateData.detail);

		if (element.agentOrSlashCommandDetected) {
			const msg = element.slashCommand ? localize('usedAgentSlashCommand', "used {0} [[(rerun without)]]", `${chatSubcommandLeader}${element.slashCommand.name}`) : localize('usedAgent', "[[(rerun without)]]");
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

	private renderConfirmationAction(element: IChatRequestViewModel, templateData: IChatListItemTemplate) {
		dom.clearNode(templateData.detail);
		if (element.confirmation) {
			templateData.detail.textContent = localize('chatConfirmationAction', 'selected "{0}"', element.confirmation);
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

	private basicRenderElement(element: ChatTreeItem, index: number, templateData: IChatListItemTemplate) {
		templateData.rowContainer.classList.toggle('chat-response-loading', isResponseVM(element) && !element.isComplete);

		let value: IChatRendererContent[] = [];
		if (isRequestVM(element) && !element.confirmation) {
			const markdown = 'message' in element.message ?
				element.message.message :
				this.markdownDecorationsRenderer.convertParsedRequestToMarkdown(element.message);
			value = [{ content: new MarkdownString(markdown), kind: 'markdownContent' }];
		} else if (isResponseVM(element)) {
			if (element.contentReferences.length) {
				value.push({ kind: 'references', references: element.contentReferences });
			}
			value.push(...annotateSpecialMarkdownContent(element.response.value));
			if (element.codeCitations.length) {
				value.push({ kind: 'codeCitations', citations: element.codeCitations });
			}
		}

		dom.clearNode(templateData.value);

		if (isResponseVM(element)) {
			this.renderDetail(element, templateData);
		}

		const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);

		const parts: IChatContentPart[] = [];
		if (!isFiltered) {
			value.forEach((data, index) => {
				const context: IChatContentPartRenderContext = {
					element,
					contentIndex: index,
					content: value,
					preceedingContentParts: parts,
				};
				const newPart = this.renderChatContentPart(data, templateData, context);
				if (newPart) {
					templateData.value.appendChild(newPart.domNode);
					parts.push(newPart);
				}
			});
		}

		if (templateData.renderedParts) {
			dispose(templateData.renderedParts);
		}
		templateData.renderedParts = parts;

		if (!isFiltered) {
			if (isRequestVM(element) && element.variables.length) {
				const newPart = this.renderAttachments(element.variables, element.contentReferences, element.workingSet, templateData);
				if (newPart) {
					templateData.value.appendChild(newPart.domNode);
					templateData.elementDisposables.add(newPart);
				}
			}
		}

		if (isResponseVM(element) && element.errorDetails?.message) {
			const renderedError = this.instantiationService.createInstance(ChatWarningContentPart, element.errorDetails.responseIsFiltered ? 'info' : 'error', new MarkdownString(element.errorDetails.message), this.renderer);
			templateData.elementDisposables.add(renderedError);
			templateData.value.appendChild(renderedError.domNode);
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

		const newHeight = Math.max(templateData.rowContainer.offsetHeight, 1);
		templateData.currentElement.currentRenderedHeight = newHeight;
		this._onDidChangeItemHeight.fire({ element: templateData.currentElement, height: newHeight });
	}

	/**
	 *	@returns true if progressive rendering should be considered complete- the element's data is fully rendered or the view is not visible
	 */
	private doNextProgressiveRender(element: IChatResponseViewModel, index: number, templateData: IChatListItemTemplate, isInRenderElement: boolean): boolean {
		if (!this._isVisible) {
			return true;
		}

		if (element.isCanceled) {
			this.traceLayout('doNextProgressiveRender', `canceled, index=${index}`);
			element.renderData = undefined;
			this.basicRenderElement(element, index, templateData);
			return true;
		}

		templateData.rowContainer.classList.toggle('chat-response-loading', true);
		this.traceLayout('doNextProgressiveRender', `START progressive render, index=${index}, renderData=${JSON.stringify(element.renderData)}`);
		const contentForThisTurn = this.getNextProgressiveRenderContent(element);
		const partsToRender = this.diff(templateData.renderedParts ?? [], contentForThisTurn.content, element);

		const contentIsAlreadyRendered = partsToRender.every(part => part === null);
		if (contentIsAlreadyRendered) {
			if (contentForThisTurn.moreContentAvailable) {
				// The content that we want to render in this turn is already rendered, but there is more content to render on the next tick
				this.traceLayout('doNextProgressiveRender', 'not rendering any new content this tick, but more available');
				return false;
			} else if (element.isComplete) {
				// All content is rendered, and response is done, so do a normal render
				this.traceLayout('doNextProgressiveRender', `END progressive render, index=${index} and clearing renderData, response is complete`);
				element.renderData = undefined;
				this.basicRenderElement(element, index, templateData);
				return true;
			} else {
				// Nothing new to render, stop rendering until next model update
				this.traceLayout('doNextProgressiveRender', 'caught up with the stream- no new content to render');

				if (!templateData.renderedParts) {
					// First render? Initialize currentRenderedHeight. https://github.com/microsoft/vscode/issues/232096
					const height = templateData.rowContainer.offsetHeight;
					element.currentRenderedHeight = height;
				}

				return true;
			}
		}

		// Do an actual progressive render
		this.traceLayout('doNextProgressiveRender', `doing progressive render, ${partsToRender.length} parts to render`);
		this.renderChatContentDiff(partsToRender, contentForThisTurn.content, element, templateData);

		const height = templateData.rowContainer.offsetHeight;
		element.currentRenderedHeight = height;
		if (!isInRenderElement) {
			this._onDidChangeItemHeight.fire({ element, height });
		}

		return false;
	}

	private renderChatContentDiff(partsToRender: ReadonlyArray<IChatRendererContent | null>, contentForThisTurn: ReadonlyArray<IChatRendererContent>, element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {
		const renderedParts = templateData.renderedParts ?? [];
		templateData.renderedParts = renderedParts;
		partsToRender.forEach((partToRender, index) => {
			if (!partToRender) {
				// null=no change
				return;
			}

			const alreadyRenderedPart = templateData.renderedParts?.[index];
			if (alreadyRenderedPart) {
				alreadyRenderedPart.dispose();
			}

			const preceedingContentParts = renderedParts.slice(0, index);
			const context: IChatContentPartRenderContext = {
				element,
				content: contentForThisTurn,
				preceedingContentParts,
				contentIndex: index,
			};
			const newPart = this.renderChatContentPart(partToRender, templateData, context);
			if (newPart) {
				// Maybe the part can't be rendered in this context, but this shouldn't really happen
				if (alreadyRenderedPart) {
					try {
						// This method can throw HierarchyRequestError
						alreadyRenderedPart.domNode.replaceWith(newPart.domNode);
					} catch (err) {
						this.logService.error('ChatListItemRenderer#renderChatContentDiff: error replacing part', err);
					}
				} else {
					templateData.value.appendChild(newPart.domNode);
				}

				renderedParts[index] = newPart;
			} else if (alreadyRenderedPart) {
				alreadyRenderedPart.domNode.remove();
			}
		});
	}

	/**
	 * Returns all content parts that should be rendered, and trimmed markdown content. We will diff this with the current rendered set.
	 */
	private getNextProgressiveRenderContent(element: IChatResponseViewModel): { content: IChatRendererContent[]; moreContentAvailable: boolean } {
		const data = this.getDataForProgressiveRender(element);

		const renderableResponse = annotateSpecialMarkdownContent(element.response.value);

		this.traceLayout('getNextProgressiveRenderContent', `Want to render ${data.numWordsToRender} at ${data.rate} words/s, counting...`);
		let numNeededWords = data.numWordsToRender;
		const partsToRender: IChatRendererContent[] = [];
		if (element.contentReferences.length) {
			partsToRender.push({ kind: 'references', references: element.contentReferences });
		}

		let moreContentAvailable = false;
		for (let i = 0; i < renderableResponse.length; i++) {
			const part = renderableResponse[i];
			if (part.kind === 'markdownContent') {
				const wordCountResult = getNWords(part.content.value, numNeededWords);
				this.traceLayout('getNextProgressiveRenderContent', `  Chunk ${i}: Want to render ${numNeededWords} words and found ${wordCountResult.returnedWordCount} words. Total words in chunk: ${wordCountResult.totalWordCount}`);
				numNeededWords -= wordCountResult.returnedWordCount;

				if (wordCountResult.isFullString) {
					partsToRender.push(part);

					// Consumed full markdown chunk- need to ensure that all following non-markdown parts are rendered
					for (const nextPart of renderableResponse.slice(i + 1)) {
						if (nextPart.kind !== 'markdownContent') {
							i++;
							partsToRender.push(nextPart);
						} else {
							moreContentAvailable = true;
							break;
						}
					}
				} else {
					// Only taking part of this markdown part
					moreContentAvailable = true;
					partsToRender.push({ ...part, content: new MarkdownString(wordCountResult.value, part.content) });
				}

				if (numNeededWords <= 0) {
					// Collected all words and following non-markdown parts if needed, done
					if (renderableResponse.slice(i + 1).some(part => part.kind === 'markdownContent')) {
						moreContentAvailable = true;
					}
					break;
				}
			} else {
				partsToRender.push(part);
			}
		}

		const lastWordCount = element.contentUpdateTimings?.lastWordCount ?? 0;
		const newRenderedWordCount = data.numWordsToRender - numNeededWords;
		const bufferWords = lastWordCount - newRenderedWordCount;
		this.traceLayout('getNextProgressiveRenderContent', `Want to render ${data.numWordsToRender} words. Rendering ${newRenderedWordCount} words. Buffer: ${bufferWords} words`);
		if (newRenderedWordCount > 0 && newRenderedWordCount !== element.renderData?.renderedWordCount) {
			// Only update lastRenderTime when we actually render new content
			element.renderData = { lastRenderTime: Date.now(), renderedWordCount: newRenderedWordCount, renderedParts: partsToRender };
		}

		return { content: partsToRender, moreContentAvailable };
	}

	private getDataForProgressiveRender(element: IChatResponseViewModel) {
		const renderData = element.renderData ?? { lastRenderTime: 0, renderedWordCount: 0 };

		const rate = this.getProgressiveRenderRate(element);
		const numWordsToRender = renderData.lastRenderTime === 0 ?
			1 :
			renderData.renderedWordCount +
			// Additional words to render beyond what's already rendered
			Math.floor((Date.now() - renderData.lastRenderTime) / 1000 * rate);

		return {
			numWordsToRender,
			rate
		};
	}

	private diff(renderedParts: ReadonlyArray<IChatContentPart>, contentToRender: ReadonlyArray<IChatRendererContent>, element: ChatTreeItem): ReadonlyArray<IChatRendererContent | null> {
		const diff: (IChatRendererContent | null)[] = [];
		for (let i = 0; i < contentToRender.length; i++) {
			const content = contentToRender[i];
			const renderedPart = renderedParts[i];

			if (!renderedPart || !renderedPart.hasSameContent(content, contentToRender.slice(i + 1), element)) {
				diff.push(content);
			} else {
				// null -> no change
				diff.push(null);
			}
		}

		return diff;
	}

	private renderChatContentPart(content: IChatRendererContent, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart | undefined {
		if (content.kind === 'treeData') {
			return this.renderTreeData(content, templateData, context);
		} else if (content.kind === 'progressMessage') {
			return this.instantiationService.createInstance(ChatProgressContentPart, content, this.renderer, context);
		} else if (content.kind === 'progressTask') {
			return this.renderProgressTask(content, templateData, context);
		} else if (content.kind === 'command') {
			return this.instantiationService.createInstance(ChatCommandButtonContentPart, content, context);
		} else if (content.kind === 'textEditGroup') {
			return this.renderTextEdit(context, content, templateData);
		} else if (content.kind === 'confirmation') {
			return this.renderConfirmation(context, content, templateData);
		} else if (content.kind === 'warning') {
			return this.instantiationService.createInstance(ChatWarningContentPart, 'warning', content.content, this.renderer);
		} else if (content.kind === 'markdownContent') {
			return this.renderMarkdown(content, templateData, context);
		} else if (content.kind === 'references') {
			return this.renderContentReferencesListData(content, undefined, context, templateData);
		} else if (content.kind === 'codeCitations') {
			return this.renderCodeCitationsListData(content, context, templateData);
		} else if (content.kind === 'toolInvocation' || content.kind === 'toolInvocationSerialized') {
			return this.renderToolInvocation(content, context, templateData);
		}

		return undefined;
	}

	private renderTreeData(content: IChatTreeData, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart {
		const data = content.treeData;
		const treeDataIndex = context.preceedingContentParts.filter(part => part instanceof ChatTreeContentPart).length;
		const treePart = this.instantiationService.createInstance(ChatTreeContentPart, data, context.element, this._treePool, treeDataIndex);

		treePart.addDisposable(treePart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));

		if (isResponseVM(context.element)) {
			const fileTreeFocusInfo = {
				treeDataId: data.uri.toString(),
				treeIndex: treeDataIndex,
				focus() {
					treePart.domFocus();
				}
			};

			// TODO@roblourens there's got to be a better way to navigate trees
			treePart.addDisposable(treePart.onDidFocus(() => {
				this.focusedFileTreesByResponseId.set(context.element.id, fileTreeFocusInfo.treeIndex);
			}));

			const fileTrees = this.fileTreesByResponseId.get(context.element.id) ?? [];
			fileTrees.push(fileTreeFocusInfo);
			this.fileTreesByResponseId.set(context.element.id, distinct(fileTrees, (v) => v.treeDataId));
			treePart.addDisposable(toDisposable(() => this.fileTreesByResponseId.set(context.element.id, fileTrees.filter(v => v.treeDataId !== data.uri.toString()))));
		}

		return treePart;
	}

	private renderContentReferencesListData(references: IChatReferences, labelOverride: string | undefined, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): ChatCollapsibleListContentPart {
		const referencesPart = this.instantiationService.createInstance(ChatCollapsibleListContentPart, references.references, labelOverride, context.element as IChatResponseViewModel, this._contentReferencesListPool);
		referencesPart.addDisposable(referencesPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));

		return referencesPart;
	}

	private renderCodeCitationsListData(citations: IChatCodeCitations, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): ChatCodeCitationContentPart {
		const citationsPart = this.instantiationService.createInstance(ChatCodeCitationContentPart, citations, context);
		return citationsPart;
	}

	private renderToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart {
		const part = this.instantiationService.createInstance(ChatToolInvocationPart, toolInvocation, context, this.renderer);
		part.addDisposable(part.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return part;
	}

	private renderProgressTask(task: IChatTask, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart | undefined {
		if (!isResponseVM(context.element)) {
			return;
		}

		const taskPart = this.instantiationService.createInstance(ChatTaskContentPart, task, this._contentReferencesListPool, this.renderer, context);
		taskPart.addDisposable(taskPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return taskPart;
	}

	private renderConfirmation(context: IChatContentPartRenderContext, confirmation: IChatConfirmation, templateData: IChatListItemTemplate): IChatContentPart {
		const part = this.instantiationService.createInstance(ChatConfirmationContentPart, confirmation, context);
		part.addDisposable(part.onDidChangeHeight(() => this.updateItemHeight(templateData)));
		return part;
	}

	private renderAttachments(variables: IChatRequestVariableEntry[], contentReferences: ReadonlyArray<IChatContentReference> | undefined, workingSet: ReadonlyArray<URI> | undefined, templateData: IChatListItemTemplate) {
		return this.instantiationService.createInstance(ChatAttachmentsContentPart, variables, contentReferences, workingSet, undefined);
	}

	private renderTextEdit(context: IChatContentPartRenderContext, chatTextEdit: IChatTextEditGroup, templateData: IChatListItemTemplate): IChatContentPart {
		const textEditPart = this.instantiationService.createInstance(ChatTextEditContentPart, chatTextEdit, context, this.rendererOptions, this._diffEditorPool, this._currentLayoutWidth);
		textEditPart.addDisposable(textEditPart.onDidChangeHeight(() => {
			textEditPart.layout(this._currentLayoutWidth);
			this.updateItemHeight(templateData);
		}));

		return textEditPart;
	}

	private renderMarkdown(markdown: IChatMarkdownContent, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart {
		const element = context.element;
		const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete || !!element.renderData);
		const codeBlockStartIndex = context.preceedingContentParts.reduce((acc, part) => acc + (part instanceof ChatMarkdownContentPart ? part.codeblocks.length : 0), 0);
		const markdownPart = templateData.instantiationService.createInstance(ChatMarkdownContentPart, markdown, context, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.renderer, this._currentLayoutWidth, this.codeBlockModelCollection, this.rendererOptions);
		const markdownPartId = markdownPart.id;
		markdownPart.addDisposable(markdownPart.onDidChangeHeight(() => {
			markdownPart.layout(this._currentLayoutWidth);
			this.updateItemHeight(templateData);
		}));

		const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id) ?? [];
		this.codeBlocksByResponseId.set(element.id, codeBlocksByResponseId);
		markdownPart.addDisposable(toDisposable(() => {
			const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id);
			if (codeBlocksByResponseId) {
				// Only delete if this is my code block
				markdownPart.codeblocks.forEach((info, i) => {
					const codeblock = codeBlocksByResponseId[codeBlockStartIndex + i];
					if (codeblock?.ownerMarkdownPartId === markdownPartId) {
						delete codeBlocksByResponseId[codeBlockStartIndex + i];
					}
				});
			}
		}));

		markdownPart.codeblocks.forEach((info, i) => {
			codeBlocksByResponseId[codeBlockStartIndex + i] = info;
			if (info.uri) {
				const uri = info.uri;
				this.codeBlocksByEditorUri.set(uri, info);
				markdownPart.addDisposable(toDisposable(() => {
					const codeblock = this.codeBlocksByEditorUri.get(uri);
					if (codeblock?.ownerMarkdownPartId === markdownPartId) {
						this.codeBlocksByEditorUri.delete(uri);
					}
				}));
			}
		});

		return markdownPart;
	}

	disposeElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IChatListItemTemplate): void {
		this.traceLayout('disposeElement', `Disposing element, index=${index}`);
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

const voteDownDetailLabels: Record<ChatAgentVoteDownReason, string> = {
	[ChatAgentVoteDownReason.IncorrectCode]: localize('incorrectCode', "Suggested incorrect code"),
	[ChatAgentVoteDownReason.DidNotFollowInstructions]: localize('didNotFollowInstructions', "Didn't follow instructions"),
	[ChatAgentVoteDownReason.MissingContext]: localize('missingContext', "Missing context"),
	[ChatAgentVoteDownReason.OffensiveOrUnsafe]: localize('offensiveOrUnsafe', "Offensive or unsafe"),
	[ChatAgentVoteDownReason.PoorlyWrittenOrFormatted]: localize('poorlyWrittenOrFormatted', "Poorly written or formatted"),
	[ChatAgentVoteDownReason.RefusedAValidRequest]: localize('refusedAValidRequest', "Refused a valid request"),
	[ChatAgentVoteDownReason.IncompleteCode]: localize('incompleteCode', "Incomplete code"),
	[ChatAgentVoteDownReason.WillReportIssue]: localize('reportIssue', "Report an issue"),
	[ChatAgentVoteDownReason.Other]: localize('other', "Other"),
};

export class ChatVoteDownButton extends DropdownMenuActionViewItem {
	constructor(
		action: IAction,
		options: IDropdownMenuActionViewItemOptions | undefined,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService,
		@ILogService private readonly logService: ILogService,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super(action,
			{ getActions: () => this.getActions(), },
			contextMenuService,
			{
				...options,
				classNames: ThemeIcon.asClassNameArray(Codicon.thumbsdown),
			});
	}

	getActions(): readonly IAction[] {
		return [
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.IncorrectCode),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.DidNotFollowInstructions),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.IncompleteCode),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.MissingContext),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.PoorlyWrittenOrFormatted),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.RefusedAValidRequest),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.OffensiveOrUnsafe),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.Other),
			{
				id: 'reportIssue',
				label: voteDownDetailLabels[ChatAgentVoteDownReason.WillReportIssue],
				tooltip: '',
				enabled: true,
				class: undefined,
				run: async (context: IChatResponseViewModel) => {
					if (!isResponseVM(context)) {
						this.logService.error('ChatVoteDownButton#run: invalid context');
						return;
					}

					await this.commandService.executeCommand(MarkUnhelpfulActionId, context, ChatAgentVoteDownReason.WillReportIssue);
					await this.issueService.openReporter({ extensionId: context.agent?.extensionId.value });
				}
			}
		];
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.element?.classList.toggle('checked', this.action.checked);
	}

	private getVoteDownDetailAction(reason: ChatAgentVoteDownReason): IAction {
		const label = voteDownDetailLabels[reason];
		return {
			id: MarkUnhelpfulActionId,
			label,
			tooltip: '',
			enabled: true,
			checked: (this._context as IChatResponseViewModel).voteDownReason === reason,
			class: undefined,
			run: async (context: IChatResponseViewModel) => {
				if (!isResponseVM(context)) {
					this.logService.error('ChatVoteDownButton#getVoteDownDetailAction: invalid context');
					return;
				}

				await this.commandService.executeCommand(MarkUnhelpfulActionId, context, reason);
			}
		};
	}
}
