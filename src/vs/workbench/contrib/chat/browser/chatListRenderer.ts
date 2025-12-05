/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { DropdownMenuActionViewItem, IDropdownMenuActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IListElementRenderDetails, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { IAction } from '../../../../base/common/actions.js';
import { coalesce, distinct } from '../../../../base/common/arrays.js';
import { findLast } from '../../../../base/common/arraysFind.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { canceledName } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, dispose, thenIfNotDisposed, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { FileAccess } from '../../../../base/common/network.js';
import { clamp } from '../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
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
import { IMarkdownRenderer } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchIssueService } from '../../issue/common/issue.js';
import { CodiconActionViewItem } from '../../notebook/browser/view/cellParts/cellActionView.js';
import { annotateSpecialMarkdownContent } from '../common/annotations.js';
import { checkModeOption } from '../common/chat.js';
import { IChatAgentMetadata } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatTextEditGroup } from '../common/chatModel.js';
import { chatSubcommandLeader } from '../common/chatParserTypes.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, ChatErrorLevel, IChatChangesSummary, IChatConfirmation, IChatContentReference, IChatElicitationRequest, IChatElicitationRequestSerialized, IChatExtensionsContent, IChatFollowup, IChatMarkdownContent, IChatMcpServersStarting, IChatMultiDiffData, IChatPullRequestContent, IChatTask, IChatTaskSerialized, IChatThinkingPart, IChatToolInvocation, IChatToolInvocationSerialized, IChatTreeData, IChatUndoStop, isChatFollowup } from '../common/chatService.js';
import { IChatRequestVariableEntry } from '../common/chatVariableEntries.js';
import { IChatChangesSummaryPart, IChatCodeCitations, IChatErrorDetailsPart, IChatReferences, IChatRendererContent, IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, isRequestVM, isResponseVM } from '../common/chatViewModel.js';
import { getNWords } from '../common/chatWordCounter.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../common/constants.js';
import { MarkUnhelpfulActionId } from './actions/chatTitleActions.js';
import { ChatTreeItem, IChatCodeBlockInfo, IChatFileTreeInfo, IChatListItemRendererOptions, IChatWidgetService } from './chat.js';
import { ChatAgentHover, getChatAgentHoverOptions } from './chatAgentHover.js';
import { ChatContentMarkdownRenderer } from './chatContentMarkdownRenderer.js';
import { ChatAgentCommandContentPart } from './chatContentParts/chatAgentCommandContentPart.js';
import { ChatAnonymousRateLimitedPart } from './chatContentParts/chatAnonymousRateLimitedPart.js';
import { ChatAttachmentsContentPart } from './chatContentParts/chatAttachmentsContentPart.js';
import { ChatCheckpointFileChangesSummaryContentPart } from './chatContentParts/chatChangesSummaryPart.js';
import { ChatCodeCitationContentPart } from './chatContentParts/chatCodeCitationContentPart.js';
import { ChatCommandButtonContentPart } from './chatContentParts/chatCommandContentPart.js';
import { ChatConfirmationContentPart } from './chatContentParts/chatConfirmationContentPart.js';
import { DiffEditorPool, EditorPool } from './chatContentParts/chatContentCodePools.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts/chatContentParts.js';
import { ChatElicitationContentPart } from './chatContentParts/chatElicitationContentPart.js';
import { ChatErrorConfirmationContentPart } from './chatContentParts/chatErrorConfirmationPart.js';
import { ChatErrorContentPart } from './chatContentParts/chatErrorContentPart.js';
import { ChatExtensionsContentPart } from './chatContentParts/chatExtensionsContentPart.js';
import { ChatMarkdownContentPart } from './chatContentParts/chatMarkdownContentPart.js';
import { ChatMcpServersInteractionContentPart } from './chatContentParts/chatMcpServersInteractionContentPart.js';
import { ChatMultiDiffContentPart } from './chatContentParts/chatMultiDiffContentPart.js';
import { ChatProgressContentPart, ChatWorkingProgressContentPart } from './chatContentParts/chatProgressContentPart.js';
import { ChatPullRequestContentPart } from './chatContentParts/chatPullRequestContentPart.js';
import { ChatQuotaExceededPart } from './chatContentParts/chatQuotaExceededPart.js';
import { ChatCollapsibleListContentPart, ChatUsedReferencesListContentPart, CollapsibleListPool } from './chatContentParts/chatReferencesContentPart.js';
import { ChatTaskContentPart } from './chatContentParts/chatTaskContentPart.js';
import { ChatTextEditContentPart } from './chatContentParts/chatTextEditContentPart.js';
import { ChatThinkingContentPart } from './chatContentParts/chatThinkingContentPart.js';
import { ChatTreeContentPart, TreePool } from './chatContentParts/chatTreeContentPart.js';
import './chatContentParts/media/chatMcpServersInteractionContent.css';
import { ChatToolInvocationPart } from './chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { ChatMarkdownDecorationsRenderer } from './chatMarkdownDecorationsRenderer.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatCodeBlockContentProvider, CodeBlockPart } from './codeBlockPart.js';

const $ = dom.$;

const COPILOT_USERNAME = 'GitHub Copilot';

export interface IChatListItemTemplate {
	currentElement?: ChatTreeItem;
	/**
	 * The parts that are currently rendered in the template. Note that these are purposely not added to elementDisposables-
	 * they are disposed in a separate cycle after diffing with the next content to render.
	 */
	renderedParts?: IChatContentPart[];
	readonly rowContainer: HTMLElement;
	readonly titleToolbar?: MenuWorkbenchToolBar;
	readonly header?: HTMLElement;
	readonly footerToolbar: MenuWorkbenchToolBar;
	readonly footerDetailsContainer: HTMLElement;
	readonly avatarContainer: HTMLElement;
	readonly username: HTMLElement;
	readonly detail: HTMLElement;
	readonly value: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly instantiationService: IInstantiationService;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
	readonly agentHover: ChatAgentHover;
	readonly requestHover: HTMLElement;
	readonly disabledOverlay: HTMLElement;
	readonly checkpointToolbar: MenuWorkbenchToolBar;
	readonly checkpointRestoreToolbar: MenuWorkbenchToolBar;
	readonly checkpointContainer: HTMLElement;
	readonly checkpointRestoreContainer: HTMLElement;
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
	currentChatMode(): ChatModeKind;

	readonly onDidScroll?: Event<void>;
}

const mostRecentResponseClassName = 'chat-most-recent-response';

export class ChatListItemRenderer extends Disposable implements ITreeRenderer<ChatTreeItem, FuzzyScore, IChatListItemTemplate> {
	static readonly ID = 'item';

	private readonly codeBlocksByResponseId = new Map<string, IChatCodeBlockInfo[]>();
	private readonly codeBlocksByEditorUri = new ResourceMap<IChatCodeBlockInfo>();

	private readonly fileTreesByResponseId = new Map<string, IChatFileTreeInfo[]>();
	private readonly focusedFileTreesByResponseId = new Map<string, number>();

	private readonly templateDataByRequestId = new Map<string, IChatListItemTemplate>();

	private readonly chatContentMarkdownRenderer: IMarkdownRenderer;
	private readonly markdownDecorationsRenderer: ChatMarkdownDecorationsRenderer;
	protected readonly _onDidClickFollowup = this._register(new Emitter<IChatFollowup>());
	readonly onDidClickFollowup: Event<IChatFollowup> = this._onDidClickFollowup.event;

	private readonly _onDidClickRerunWithAgentOrCommandDetection = new Emitter<{ readonly sessionResource: URI; readonly requestId: string }>();
	readonly onDidClickRerunWithAgentOrCommandDetection = this._onDidClickRerunWithAgentOrCommandDetection.event;


	private readonly _onDidClickRequest = this._register(new Emitter<IChatListItemTemplate>());
	readonly onDidClickRequest: Event<IChatListItemTemplate> = this._onDidClickRequest.event;

	private readonly _onDidRerender = this._register(new Emitter<IChatListItemTemplate>());
	readonly onDidRerender: Event<IChatListItemTemplate> = this._onDidRerender.event;

	private readonly _onDidDispose = this._register(new Emitter<IChatListItemTemplate>());
	readonly onDidDispose: Event<IChatListItemTemplate> = this._onDidDispose.event;

	private readonly _onDidFocusOutside = this._register(new Emitter<void>());
	readonly onDidFocusOutside: Event<void> = this._onDidFocusOutside.event;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	private readonly _editorPool: EditorPool;
	private readonly _toolEditorPool: EditorPool;
	private readonly _diffEditorPool: DiffEditorPool;
	private readonly _treePool: TreePool;
	private readonly _contentReferencesListPool: CollapsibleListPool;

	private _currentLayoutWidth: number = 0;
	private _isVisible = true;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	/**
	 * Tool invocations get their own so that the ChatViewModel doesn't overwrite it.
	 * TODO@roblourens shouldn't use the CodeBlockModelCollection at all
	 */
	private readonly _toolInvocationCodeBlockCollection: CodeBlockModelCollection;

	/**
	 * Prevents re-announcement of already rendered chat progress
	 * by screen readers
	 */
	private readonly _announcedToolProgressKeys = new Set<string>();

	constructor(
		editorOptions: ChatEditorOptions,
		private rendererOptions: IChatListItemRendererOptions,
		private readonly delegate: IChatRendererDelegate,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		overflowWidgetsDomNode: HTMLElement | undefined,
		private viewModel: IChatViewModel | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this.chatContentMarkdownRenderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
		this.markdownDecorationsRenderer = this.instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode, false));
		this._toolEditorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode, true));
		this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, editorOptions, delegate, overflowWidgetsDomNode, false));
		this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
		this._contentReferencesListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, undefined, undefined));

		this._register(this.instantiationService.createInstance(ChatCodeBlockContentProvider));
		this._toolInvocationCodeBlockCollection = this._register(this.instantiationService.createInstance(CodeBlockModelCollection, 'tools'));
	}

	public updateOptions(options: IChatListItemRendererOptions): void {
		this.rendererOptions = { ...this.rendererOptions, ...options };
	}

	get templateId(): string {
		return ChatListItemRenderer.ID;
	}

	editorsInUse(): Iterable<CodeBlockPart> {
		return Iterable.concat(this._editorPool.inUse(), this._toolEditorPool.inUse());
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
		const enum Rate {
			Min = 5,
			Max = 2000,
		}

		const minAfterComplete = 80;

		const rate = element.contentUpdateTimings?.impliedWordLoadRate;
		if (element.isComplete) {
			if (typeof rate === 'number') {
				return clamp(rate, minAfterComplete, Rate.Max);
			} else {
				return minAfterComplete;
			}
		}

		if (typeof rate === 'number') {
			return clamp(rate, Rate.Min, Rate.Max);
		}

		return 8;
	}

	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		const codeBlocks = this.codeBlocksByResponseId.get(response.id);
		return codeBlocks ?? [];
	}

	updateViewModel(viewModel: IChatViewModel | undefined): void {
		this.viewModel = viewModel;
		this._announcedToolProgressKeys.clear();

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

	getTemplateDataForRequestId(requestId?: string): IChatListItemTemplate | undefined {
		if (!requestId) {
			return undefined;
		}
		const templateData = this.templateDataByRequestId.get(requestId);
		if (templateData && templateData.currentElement?.id === requestId) {
			return templateData;
		}
		if (templateData) {
			this.templateDataByRequestId.delete(requestId);
		}
		return undefined;
	}

	setVisible(visible: boolean): void {
		this._isVisible = visible;
		this._onDidChangeVisibility.fire(visible);
	}

	layout(width: number): void {
		const newWidth = width - 40; // padding
		if (newWidth !== this._currentLayoutWidth) {
			this._currentLayoutWidth = newWidth;
			for (const editor of this._editorPool.inUse()) {
				editor.layout(this._currentLayoutWidth);
			}
			for (const toolEditor of this._toolEditorPool.inUse()) {
				toolEditor.layout(this._currentLayoutWidth);
			}
			for (const diffEditor of this._diffEditorPool.inUse()) {
				diffEditor.layout(this._currentLayoutWidth);
			}
		}
	}

	renderTemplate(container: HTMLElement): IChatListItemTemplate {
		const templateDisposables = new DisposableStore();
		const disabledOverlay = dom.append(container, $('.chat-row-disabled-overlay'));
		const rowContainer = dom.append(container, $('.interactive-item-container'));
		if (this.rendererOptions.renderStyle === 'compact') {
			rowContainer.classList.add('interactive-item-compact');
		}

		let headerParent = rowContainer;
		let valueParent = rowContainer;
		let detailContainerParent: HTMLElement | undefined;

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
		}

		const header = dom.append(headerParent, $('.header'));
		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));

		const requestHover = dom.append(rowContainer, $('.request-hover'));
		let titleToolbar: MenuWorkbenchToolBar | undefined;
		if (this.rendererOptions.noHeader) {
			header.classList.add('hidden');
		} else {
			titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, requestHover, MenuId.ChatMessageTitle, {
				menuOptions: {
					shouldForwardArgs: true
				},
				toolbarOptions: {
					shouldInlineSubmenu: submenu => submenu.actions.length <= 1
				},
			}));
		}
		this.hoverHidden(requestHover);

		const checkpointContainer = dom.append(rowContainer, $('.checkpoint-container'));
		const codiconContainer = dom.append(checkpointContainer, $('.codicon-container'));
		dom.append(codiconContainer, $('span.codicon.codicon-bookmark'));

		const checkpointToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, checkpointContainer, MenuId.ChatMessageCheckpoint, {
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
				}
				return undefined;
			},
			renderDropdownAsChildElement: true,
			menuOptions: {
				shouldForwardArgs: true
			},
			toolbarOptions: {
				shouldInlineSubmenu: submenu => submenu.actions.length <= 1
			},
		}));

		dom.append(checkpointContainer, $('.checkpoint-divider'));

		const user = dom.append(header, $('.user'));
		const avatarContainer = dom.append(user, $('.avatar-container'));
		const username = dom.append(user, $('h3.username'));
		username.tabIndex = 0;
		const detailContainer = dom.append(detailContainerParent ?? user, $('span.detail-container'));
		const detail = dom.append(detailContainer, $('span.detail'));
		dom.append(detailContainer, $('span.chat-animated-ellipsis'));
		const value = dom.append(valueParent, $('.value'));
		const elementDisposables = new DisposableStore();

		const footerToolbarContainer = dom.append(rowContainer, $('.chat-footer-toolbar'));
		if (this.rendererOptions.noFooter) {
			footerToolbarContainer.classList.add('hidden');
		}

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

		// Insert the details container into the toolbar's internal element structure
		const footerDetailsContainer = dom.append(footerToolbar.getElement(), $('.chat-footer-details'));
		footerDetailsContainer.tabIndex = 0;

		const checkpointRestoreContainer = dom.append(rowContainer, $('.checkpoint-restore-container'));
		const codiconRestoreContainer = dom.append(checkpointRestoreContainer, $('.codicon-container'));
		dom.append(codiconRestoreContainer, $('span.codicon.codicon-bookmark'));
		const label = dom.append(checkpointRestoreContainer, $('span.checkpoint-label-text'));
		label.textContent = localize('checkpointRestore', 'Checkpoint Restored');
		const checkpointRestoreToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, checkpointRestoreContainer, MenuId.ChatMessageRestoreCheckpoint, {
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
				}
				return undefined;
			},
			renderDropdownAsChildElement: true,
			menuOptions: {
				shouldForwardArgs: true
			},
			toolbarOptions: {
				shouldInlineSubmenu: submenu => submenu.actions.length <= 1
			},
		}));

		dom.append(checkpointRestoreContainer, $('.checkpoint-divider'));


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
					this.hoverService.showInstantHover({ content, target: user, trapFocus: true, actions: hoverOptions.actions }, true);
				}
			} else if (ev.equals(KeyCode.Escape)) {
				this.hoverService.hideHover();
			}
		}));
		const template: IChatListItemTemplate = { header, avatarContainer, requestHover, username, detail, value, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, agentHover, titleToolbar, footerToolbar, footerDetailsContainer, disabledOverlay, checkpointToolbar, checkpointRestoreToolbar, checkpointContainer, checkpointRestoreContainer };

		templateDisposables.add(dom.addDisposableListener(disabledOverlay, dom.EventType.CLICK, e => {
			if (!this.viewModel?.editing) {
				return;
			}
			const current = template.currentElement;
			if (!current || current.id === this.viewModel.editing.id) {
				return;
			}

			if (disabledOverlay.classList.contains('disabled')) {
				e.preventDefault();
				e.stopPropagation();
				this._onDidFocusOutside.fire();
			}
		}));
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

			const mappedTemplateData = this.templateDataByRequestId.get(templateData.currentElement.id);
			if (mappedTemplateData && (mappedTemplateData.currentElement?.id !== templateData.currentElement.id)) {
				this.templateDataByRequestId.delete(templateData.currentElement.id);
			}
		}

		templateData.currentElement = element;
		this.templateDataByRequestId.set(element.id, templateData);
		const kind = isRequestVM(element) ? 'request' :
			isResponseVM(element) ? 'response' :
				'welcome';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

		ChatContextKeys.isResponse.bindTo(templateData.contextKeyService).set(isResponseVM(element));
		ChatContextKeys.itemId.bindTo(templateData.contextKeyService).set(element.id);
		ChatContextKeys.isRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element));
		ChatContextKeys.responseDetectedAgentCommand.bindTo(templateData.contextKeyService).set(isResponseVM(element) && element.agentOrSlashCommandDetected);
		if (isResponseVM(element)) {
			ChatContextKeys.responseSupportsIssueReporting.bindTo(templateData.contextKeyService).set(!!element.agent?.metadata.supportIssueReporting);
			ChatContextKeys.responseVote.bindTo(templateData.contextKeyService).set(element.vote === ChatAgentVoteDirection.Up ? 'up' : element.vote === ChatAgentVoteDirection.Down ? 'down' : '');
		} else {
			ChatContextKeys.responseVote.bindTo(templateData.contextKeyService).set('');
		}

		if (templateData.titleToolbar) {
			templateData.titleToolbar.context = element;
		}
		templateData.footerToolbar.context = element;

		// Render result details in footer if available
		if (isResponseVM(element) && element.result?.details) {
			templateData.footerDetailsContainer.textContent = element.result.details;
			templateData.footerDetailsContainer.classList.remove('hidden');
		} else {
			templateData.footerDetailsContainer.classList.add('hidden');
		}

		ChatContextKeys.responseHasError.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.errorDetails);
		const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);
		ChatContextKeys.responseIsFiltered.bindTo(templateData.contextKeyService).set(isFiltered);

		const location = this.chatWidgetService.getWidgetBySessionResource(element.sessionResource)?.location;
		templateData.rowContainer.classList.toggle('editing-session', location === ChatAgentLocation.Chat);
		templateData.rowContainer.classList.toggle('interactive-request', isRequestVM(element));
		templateData.rowContainer.classList.toggle('interactive-response', isResponseVM(element));
		const progressMessageAtBottomOfResponse = checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse);
		templateData.rowContainer.classList.toggle('show-detail-progress', isResponseVM(element) && !element.isComplete && !element.progressMessages.length && !progressMessageAtBottomOfResponse);
		if (!this.rendererOptions.noHeader) {
			this.renderAvatar(element, templateData);
		}

		templateData.username.textContent = element.username;
		templateData.username.classList.toggle('hidden', element.username === COPILOT_USERNAME);
		templateData.avatarContainer.classList.toggle('hidden', element.username === COPILOT_USERNAME);

		this.hoverHidden(templateData.requestHover);
		dom.clearNode(templateData.detail);
		if (isResponseVM(element)) {
			this.renderDetail(element, templateData);
		}

		templateData.checkpointToolbar.context = element;
		const checkpointEnabled = this.configService.getValue<boolean>(ChatConfiguration.CheckpointsEnabled)
			&& (this.rendererOptions.restorable ?? true);

		templateData.checkpointContainer.classList.toggle('hidden', isResponseVM(element) || !(checkpointEnabled));

		// Only show restore container when we have a checkpoint and not editing
		const shouldShowRestore = this.viewModel?.model.checkpoint && !this.viewModel?.editing && (index === this.delegate.getListLength() - 1);
		templateData.checkpointRestoreContainer.classList.toggle('hidden', !(shouldShowRestore && checkpointEnabled));

		const editing = element.id === this.viewModel?.editing?.id;
		const isInput = this.configService.getValue<string>('chat.editRequests') === 'input';

		templateData.disabledOverlay.classList.toggle('disabled', element.shouldBeBlocked && !editing && this.viewModel?.editing !== undefined);
		templateData.rowContainer.classList.toggle('editing', editing && !isInput);
		templateData.rowContainer.classList.toggle('editing-input', editing && isInput);
		templateData.requestHover.classList.toggle('editing', editing && isInput);
		templateData.requestHover.classList.toggle('hidden', (!!this.viewModel?.editing && !editing) || isResponseVM(element));
		templateData.requestHover.classList.toggle('expanded', this.configService.getValue<string>('chat.editRequests') === 'hover');
		templateData.requestHover.classList.toggle('checkpoints-enabled', checkpointEnabled);
		templateData.elementDisposables.add(dom.addStandardDisposableListener(templateData.rowContainer, dom.EventType.CLICK, (e) => {
			const current = templateData.currentElement;
			if (current && this.viewModel?.editing && current.id !== this.viewModel.editing.id) {
				e.stopPropagation();
				e.preventDefault();
				this._onDidFocusOutside.fire();
			}
		}));

		// Overlay click listener removed: overlay is non-interactive in cancel-on-any-row mode.

		// hack @joaomoreno
		templateData.rowContainer.parentElement?.parentElement?.parentElement?.classList.toggle('request', isRequestVM(element));
		templateData.rowContainer.classList.toggle(mostRecentResponseClassName, index === this.delegate.getListLength() - 1);
		templateData.rowContainer.classList.toggle('confirmation-message', isRequestVM(element) && !!element.confirmation);

		// TODO: @justschen decide if we want to hide the header for requests or not
		const shouldShowHeader = isResponseVM(element) && !this.rendererOptions.noHeader;
		templateData.header?.classList.toggle('header-disabled', !shouldShowHeader);

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
				this.renderChatResponseBasic(element, index, templateData);
			} else if (isRequestVM(element)) {
				this.renderChatRequest(element, index, templateData);
			}
		}
	}

	private renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {
		dom.clearNode(templateData.detail);

		if (element.agentOrSlashCommandDetected) {
			const msg = element.slashCommand ? localize('usedAgentSlashCommand', "used {0} [[(rerun without)]]", `${chatSubcommandLeader}${element.slashCommand.name}`) : localize('usedAgent', "[[(rerun without)]]");
			dom.reset(templateData.detail, renderFormattedText(msg, {
				actionHandler: {
					disposables: templateData.elementDisposables,
					callback: (content) => {
						this._onDidClickRerunWithAgentOrCommandDetection.fire(element);
					},
				}
			}, $('span.agentOrSlashCommandDetected')));

		} else if (this.rendererOptions.renderStyle !== 'minimal' && !element.isComplete && !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
			templateData.detail.textContent = localize('working', "Working");
		}
	}

	private renderConfirmationAction(element: IChatRequestViewModel, templateData: IChatListItemTemplate) {
		dom.clearNode(templateData.detail);
		if (element.confirmation) {
			dom.append(templateData.detail, $('span.codicon.codicon-check', { 'aria-hidden': 'true' }));
			dom.append(templateData.detail, $('span.confirmation-text', undefined, localize('chatConfirmationAction', 'Selected "{0}"', element.confirmation)));
			templateData.header?.classList.remove('header-disabled');
			templateData.header?.classList.add('partially-disabled');
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
		} else if (agent?.iconDark && isDark(this.themeService.getColorTheme().type)) {
			return agent.iconDark;
		} else if (agent?.icon) {
			return agent.icon;
		} else {
			return Codicon.chatSparkle;
		}
	}

	private renderChatResponseBasic(element: IChatResponseViewModel, index: number, templateData: IChatListItemTemplate) {
		templateData.rowContainer.classList.toggle('chat-response-loading', (isResponseVM(element) && !element.isComplete));

		if (element.isCanceled) {
			const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
			if (lastThinking?.domNode) {
				lastThinking.finalizeTitleIfDefault();
				lastThinking.markAsInactive();
			}
		}

		const content: IChatRendererContent[] = [];
		const isFiltered = !!element.errorDetails?.responseIsFiltered;
		if (!isFiltered) {
			// Always add the references to avoid shifting the content parts when a reference is added, and having to re-diff all the content.
			// The part will hide itself if the list is empty.
			content.push({ kind: 'references', references: element.contentReferences });
			content.push(...annotateSpecialMarkdownContent(element.response.value));
			if (element.codeCitations.length) {
				content.push({ kind: 'codeCitations', citations: element.codeCitations });
			}
		}

		if (element.model.response === element.model.entireResponse && element.errorDetails?.message && element.errorDetails.message !== canceledName) {
			content.push({ kind: 'errorDetails', errorDetails: element.errorDetails, isLast: index === this.delegate.getListLength() - 1 });
		}

		const fileChangesSummaryPart = this.getChatFileChangesSummaryPart(element);
		if (fileChangesSummaryPart) {
			content.push(fileChangesSummaryPart);
		}

		const diff = this.diff(templateData.renderedParts ?? [], content, element);
		this.renderChatContentDiff(diff, content, element, index, templateData);

		this.updateItemHeightOnRender(element, templateData);
	}

	private shouldShowWorkingProgress(element: IChatResponseViewModel, partsToRender: IChatRendererContent[], templateData: IChatListItemTemplate): boolean {
		if (element.agentOrSlashCommandDetected || this.rendererOptions.renderStyle === 'minimal' || element.isComplete || !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
			return false;
		}

		// Show if no content, only "used references", ends with a complete tool call, or ends with complete text edits and there is no incomplete tool call (edits are still being applied some time after they are all generated)
		const lastPart = findLast(partsToRender, part => part.kind !== 'markdownContent' || part.content.value.trim().length > 0);

		const collapsedToolsMode = this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools');

		if (collapsedToolsMode === CollapsedToolsDisplayMode.Always || (collapsedToolsMode === CollapsedToolsDisplayMode.WithThinking && this.getLastThinkingPart(templateData.renderedParts))) {
			if (!lastPart || lastPart.kind === 'thinking' || lastPart.kind === 'toolInvocation' || lastPart.kind === 'prepareToolInvocation' || lastPart.kind === 'textEditGroup' || lastPart.kind === 'notebookEditGroup') {
				return false;
			}
		}

		if (
			!lastPart ||
			lastPart.kind === 'references' ||
			((lastPart.kind === 'toolInvocation' || lastPart.kind === 'toolInvocationSerialized') && (IChatToolInvocation.isComplete(lastPart) || lastPart.presentation === 'hidden')) ||
			((lastPart.kind === 'textEditGroup' || lastPart.kind === 'notebookEditGroup') && lastPart.done && !partsToRender.some(part => part.kind === 'toolInvocation' && !IChatToolInvocation.isComplete(part))) ||
			(lastPart.kind === 'progressTask' && lastPart.deferred.isSettled) ||
			lastPart.kind === 'prepareToolInvocation' || lastPart.kind === 'mcpServersStarting'
		) {
			return true;
		}

		return false;
	}


	private getChatFileChangesSummaryPart(element: IChatResponseViewModel): IChatChangesSummaryPart | undefined {
		if (!this.shouldShowFileChangesSummary(element)) {
			return undefined;
		}
		const consideredFiles: Set<string> = new Set();
		const fileChanges: IChatChangesSummary[] = [];
		for (const part of element.model.entireResponse.value) {
			if ((part.kind === 'textEditGroup' || part.kind === 'notebookEditGroup') && !consideredFiles.has(part.uri.toString(true))) {
				fileChanges.push({
					kind: 'changesSummary',
					reference: part.uri,
					sessionId: element.sessionId,
					requestId: element.requestId,
				});
				consideredFiles.add(part.uri.toString(true));
			}
		}
		if (!fileChanges.length) {
			return undefined;
		}
		return { kind: 'changesSummary', fileChanges };
	}

	private renderChatRequest(element: IChatRequestViewModel, index: number, templateData: IChatListItemTemplate) {
		templateData.rowContainer.classList.toggle('chat-response-loading', false);
		if (element.id === this.viewModel?.editing?.id) {
			this._onDidRerender.fire(templateData);
		}

		if (this.configService.getValue<string>('chat.editRequests') !== 'none' && this.rendererOptions.editable) {
			templateData.elementDisposables.add(dom.addDisposableListener(templateData.rowContainer, dom.EventType.KEY_DOWN, e => {
				const ev = new StandardKeyboardEvent(e);
				if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
					if (this.viewModel?.editing?.id !== element.id) {
						ev.preventDefault();
						ev.stopPropagation();
						this._onDidClickRequest.fire(templateData);
					}
				}
			}));
		}

		let content: IChatRendererContent[] = [];
		if (!element.confirmation) {
			const markdown = isChatFollowup(element.message) ?
				element.message.message :
				this.markdownDecorationsRenderer.convertParsedRequestToMarkdown(element.sessionResource, element.message);
			content = [{ content: new MarkdownString(markdown), kind: 'markdownContent' }];

			if (this.rendererOptions.renderStyle === 'minimal' && !element.isComplete) {
				templateData.value.classList.add('inline-progress');
				templateData.elementDisposables.add(toDisposable(() => templateData.value.classList.remove('inline-progress')));
				content.push({ content: new MarkdownString('<span></span>', { supportHtml: true }), kind: 'markdownContent' });
			} else {
				templateData.value.classList.remove('inline-progress');
			}
		}

		dom.clearNode(templateData.value);
		const parts: IChatContentPart[] = [];

		let inlineSlashCommandRendered = false;
		content.forEach((data, contentIndex) => {
			const context: IChatContentPartRenderContext = {
				element,
				elementIndex: index,
				contentIndex: contentIndex,
				content: content,
				preceedingContentParts: parts,
				container: templateData.rowContainer,
				editorPool: this._editorPool,
				diffEditorPool: this._diffEditorPool,
				codeBlockModelCollection: this.codeBlockModelCollection,
				currentWidth: () => this._currentLayoutWidth,
				get codeBlockStartIndex() {
					return context.preceedingContentParts.reduce((acc, part) => acc + (part.codeblocks?.length ?? 0), 0);
				},
			};
			const newPart = this.renderChatContentPart(data, templateData, context);
			if (newPart) {

				if (this.rendererOptions.renderDetectedCommandsWithRequest
					&& !inlineSlashCommandRendered
					&& element.agentOrSlashCommandDetected && element.slashCommand
					&& data.kind === 'markdownContent' // TODO this is fishy but I didn't find a better way to render on the same inline as the MD request part
				) {
					if (newPart.domNode) {
						newPart.domNode.style.display = 'inline-flex';
					}
					const cmdPart = this.instantiationService.createInstance(ChatAgentCommandContentPart, element.slashCommand, () => this._onDidClickRerunWithAgentOrCommandDetection.fire({ sessionResource: element.sessionResource, requestId: element.id }));
					templateData.value.appendChild(cmdPart.domNode);
					parts.push(cmdPart);
					inlineSlashCommandRendered = true;
				}

				if (newPart.domNode) {
					templateData.value.appendChild(newPart.domNode);
				}
				parts.push(newPart);
			}
		});

		if (templateData.renderedParts) {
			dispose(templateData.renderedParts);
		}
		templateData.renderedParts = parts;

		if (element.variables.length) {
			const newPart = this.renderAttachments(element.variables, element.contentReferences, templateData);
			if (newPart.domNode) {
				// p has a :last-child rule for margin
				templateData.value.appendChild(newPart.domNode);
			}
			templateData.elementDisposables.add(newPart);
		}

		this.updateItemHeightOnRender(element, templateData);
	}

	updateItemHeightOnRender(element: ChatTreeItem, templateData: IChatListItemTemplate) {
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
			this.renderChatResponseBasic(element, index, templateData);
			return true;
		}

		templateData.rowContainer.classList.toggle('chat-response-loading', true);
		this.traceLayout('doNextProgressiveRender', `START progressive render, index=${index}, renderData=${JSON.stringify(element.renderData)}`);
		const contentForThisTurn = this.getNextProgressiveRenderContent(element, templateData);
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
				this.renderChatResponseBasic(element, index, templateData);
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
		this.renderChatContentDiff(partsToRender, contentForThisTurn.content, element, index, templateData);

		const height = templateData.rowContainer.offsetHeight;
		element.currentRenderedHeight = height;
		if (!isInRenderElement) {
			this._onDidChangeItemHeight.fire({ element, height });
		}

		return false;
	}

	private renderChatContentDiff(partsToRender: ReadonlyArray<IChatRendererContent | null>, contentForThisTurn: ReadonlyArray<IChatRendererContent>, element: IChatResponseViewModel, elementIndex: number, templateData: IChatListItemTemplate): void {
		const renderedParts = templateData.renderedParts ?? [];
		templateData.renderedParts = renderedParts;
		partsToRender.forEach((partToRender, contentIndex) => {
			if (!partToRender) {
				// null=no change
				return;
			}

			const alreadyRenderedPart = templateData.renderedParts?.[contentIndex];

			// keep existing thinking part instance during streaming and update it in place
			if (alreadyRenderedPart) {
				if (partToRender.kind === 'thinking' && alreadyRenderedPart instanceof ChatThinkingContentPart) {
					if (!Array.isArray(partToRender.value)) {
						alreadyRenderedPart.updateThinking(partToRender);
					}
					renderedParts[contentIndex] = alreadyRenderedPart;
					return;
				} else if (alreadyRenderedPart instanceof ChatThinkingContentPart && this.shouldPinPart(partToRender, element)) {
					// keep existing thinking part if we are pinning it (combining tool calls into it)
					renderedParts[contentIndex] = alreadyRenderedPart;
					return;
				}

				alreadyRenderedPart.dispose();
			}

			const preceedingContentParts = renderedParts.slice(0, contentIndex);
			const context: IChatContentPartRenderContext = {
				element,
				elementIndex: elementIndex,
				content: contentForThisTurn,
				preceedingContentParts,
				contentIndex: contentIndex,
				container: templateData.rowContainer,
				editorPool: this._editorPool,
				diffEditorPool: this._diffEditorPool,
				codeBlockModelCollection: this.codeBlockModelCollection,
				currentWidth: () => this._currentLayoutWidth,
				get codeBlockStartIndex() {
					return context.preceedingContentParts.reduce((acc, part) => acc + (part.codeblocks?.length ?? 0), 0);
				},
			};

			// combine tool invocations into thinking part if needed. render the tool, but do not replace the working spinner with the new part's dom node since it is already inside the thinking part.
			const lastThinking = this.getLastThinkingPart(renderedParts);
			if (lastThinking && (partToRender.kind === 'toolInvocation' || partToRender.kind === 'toolInvocationSerialized') && this.shouldPinPart(partToRender, element)) {
				const newPart = this.renderChatContentPart(partToRender, templateData, context);
				if (newPart) {
					renderedParts[contentIndex] = newPart;
					if (alreadyRenderedPart instanceof ChatWorkingProgressContentPart && alreadyRenderedPart?.domNode) {
						alreadyRenderedPart.domNode.remove();
					}
				}
				return;
			}

			const newPart = this.renderChatContentPart(partToRender, templateData, context);
			if (newPart) {
				renderedParts[contentIndex] = newPart;
				// Maybe the part can't be rendered in this context, but this shouldn't really happen
				try {
					if (alreadyRenderedPart?.domNode) {
						if (newPart.domNode) {
							alreadyRenderedPart.domNode.replaceWith(newPart.domNode);
						} else {
							alreadyRenderedPart.domNode.remove();
						}
					} else if (newPart.domNode && !newPart.domNode.parentElement) {
						// Only append if not already attached somewhere else (e.g. inside a thinking wrapper)
						templateData.value.appendChild(newPart.domNode);
					}

				} catch (err) {
					this.logService.error('ChatListItemRenderer#renderChatContentDiff: error replacing part', err);
				}
			} else {
				alreadyRenderedPart?.domNode?.remove();
			}
		});

		// Delete previously rendered parts that are removed
		for (let i = partsToRender.length; i < renderedParts.length; i++) {
			const part = renderedParts[i];
			if (part) {
				part.dispose();
				part.domNode?.remove();
				delete renderedParts[i];
			}
		}
	}

	/**
	 * Returns all content parts that should be rendered, and trimmed markdown content. We will diff this with the current rendered set.
	 */
	private getNextProgressiveRenderContent(element: IChatResponseViewModel, templateData: IChatListItemTemplate): { content: IChatRendererContent[]; moreContentAvailable: boolean } {
		const data = this.getDataForProgressiveRender(element);

		// An unregistered setting for development- skip the word counting and smoothing, just render content as it comes in
		const renderImmediately = this.configService.getValue<boolean>('chat.experimental.renderMarkdownImmediately') === true;

		const renderableResponse = annotateSpecialMarkdownContent(element.response.value);

		this.traceLayout('getNextProgressiveRenderContent', `Want to render ${data.numWordsToRender} at ${data.rate} words/s, counting...`);
		let numNeededWords = data.numWordsToRender;
		const partsToRender: IChatRendererContent[] = [];

		// Always add the references to avoid shifting the content parts when a reference is added, and having to re-diff all the content.
		// The part will hide itself if the list is empty.
		partsToRender.push({ kind: 'references', references: element.contentReferences });

		let moreContentAvailable = false;
		for (let i = 0; i < renderableResponse.length; i++) {
			const part = renderableResponse[i];
			if (part.kind === 'markdownContent' && !renderImmediately) {
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

		if (this.shouldShowWorkingProgress(element, partsToRender, templateData)) {
			partsToRender.push({ kind: 'working' });
		}

		const fileChangesSummaryPart = this.getChatFileChangesSummaryPart(element);
		if (fileChangesSummaryPart) {
			partsToRender.push(fileChangesSummaryPart);
		}

		return { content: partsToRender, moreContentAvailable };
	}

	private shouldShowFileChangesSummary(element: IChatResponseViewModel): boolean {
		return element.isComplete && this.configService.getValue<boolean>('chat.checkpoints.showFileChanges');
	}

	private getDataForProgressiveRender(element: IChatResponseViewModel) {
		const hasMarkdownParts = element.response.value.some(part => part.kind === 'markdownContent' && part.content.value.trim().length > 0);
		if (!element.isComplete && hasMarkdownParts && (element.contentUpdateTimings ? element.contentUpdateTimings.lastWordCount : 0) === 0) {
			/**
			 * None of the content parts in the ongoing response have been rendered yet,
			 * so we should render all existing parts without animation.
			 */
			return {
				numWordsToRender: Number.MAX_SAFE_INTEGER,
				rate: Number.MAX_SAFE_INTEGER
			};
		}

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

	// put thinking parts inside a pinned part. commented out for now.
	private shouldPinPart(part: IChatRendererContent, element?: IChatResponseViewModel): boolean {
		const collapsedToolsMode = this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools');

		if (collapsedToolsMode === CollapsedToolsDisplayMode.Off) {
			return false;
		}

		// Don't pin MCP tools
		const isMcpTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.source.type === 'mcp';
		if (isMcpTool) {
			return false;
		}

		// Don't pin subagent tools and prepareToolInvocations
		const isSubagentTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && (part.fromSubAgent || part.toolId === 'runSubagent');
		if (isSubagentTool) {
			return false;
		}

		// Don't pin terminal tools
		const isTerminalTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolSpecificData?.kind === 'terminal';
		if (isTerminalTool) {
			return false;
		}

		if (part.kind === 'toolInvocation') {
			return !part.confirmationMessages;
		}

		if (part.kind === 'toolInvocationSerialized') {
			return true;
		}

		return part.kind === 'prepareToolInvocation';
	}

	private isCreateToolInvocationContent(content: IChatRendererContent | undefined): content is IChatToolInvocation | IChatToolInvocationSerialized {
		if (!content || (content.kind !== 'toolInvocation' && content.kind !== 'toolInvocationSerialized')) {
			return false;
		}

		const containsCreate = (value: string | IMarkdownString | undefined) => {
			if (!value) {
				return false;
			}
			const text = typeof value === 'string' ? value : value.value;
			return text.toLowerCase().includes('create');
		};

		if (containsCreate(content.invocationMessage) || containsCreate(content.pastTenseMessage)) {
			return true;
		}

		return content.toolId.toLowerCase().includes('create');
	}

	private getLastThinkingPart(renderedParts: ReadonlyArray<IChatContentPart> | undefined): ChatThinkingContentPart | undefined {
		if (!renderedParts || renderedParts.length === 0) {
			return undefined;
		}

		// Search backwards for the most recent active thinking part
		for (let i = renderedParts.length - 1; i >= 0; i--) {
			const part = renderedParts[i];
			if (part instanceof ChatThinkingContentPart && part.getIsActive()) {
				return part;
			}
		}

		return undefined;
	}

	private finalizeCurrentThinkingPart(context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): void {
		const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
		if (!lastThinking) {
			return;
		}
		const style = this.configService.getValue<ThinkingDisplayMode>('chat.agent.thinkingStyle');
		if (style === ThinkingDisplayMode.CollapsedPreview) {
			lastThinking.collapseContent();
		}
		lastThinking.finalizeTitleIfDefault();
		lastThinking.resetId();
		lastThinking.markAsInactive();
	}

	private renderChatContentPart(content: IChatRendererContent, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart | undefined {
		try {
			const collapsedToolsMode = this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools');
			// if we get an empty thinking part, mark thinking as finished
			if (content.kind === 'thinking' && (Array.isArray(content.value) ? content.value.length === 0 : !content.value)) {
				const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
				lastThinking?.resetId();
				return this.renderNoContent(other => content.kind === other.kind);
			}

			const lastRenderedPart = context.preceedingContentParts.length ? context.preceedingContentParts[context.preceedingContentParts.length - 1] : undefined;
			const previousContent = context.contentIndex > 0 ? context.content[context.contentIndex - 1] : undefined;

			// Special handling for "create" tool invocations- do not end thinking if previous part is a create tool invocation and config is set.
			const shouldKeepThinkingForCreateTool = collapsedToolsMode !== CollapsedToolsDisplayMode.Off && lastRenderedPart instanceof ChatToolInvocationPart && this.isCreateToolInvocationContent(previousContent);

			const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
			const isResponseElement = isResponseVM(context.element);
			const isThinkingContent = content.kind === 'working' || content.kind === 'thinking';
			const isToolStreamingContent = isResponseElement && this.shouldPinPart(content, isResponseElement ? context.element : undefined);
			if (!shouldKeepThinkingForCreateTool && lastThinking && lastThinking.getIsActive()) {
				if (!isThinkingContent && !isToolStreamingContent) {
					const followsThinkingPart = previousContent?.kind === 'thinking' || previousContent?.kind === 'toolInvocation' || previousContent?.kind === 'prepareToolInvocation' || previousContent?.kind === 'toolInvocationSerialized';

					if (content.kind !== 'textEditGroup' && (context.element.isComplete || followsThinkingPart)) {
						this.finalizeCurrentThinkingPart(context, templateData);
					}
				}
			}

			// sometimes content is rendered out of order on re-renders so instead of looking at the current chat content part's
			// context and templateData, we have to look globally to find the active thinking part.
			if (context.element.isComplete && !isThinkingContent && !this.shouldPinPart(content, isResponseElement ? context.element : undefined)) {
				for (const templateData of this.templateDataByRequestId.values()) {
					if (templateData.renderedParts) {
						const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
						if (content.kind !== 'textEditGroup' && lastThinking?.getIsActive()) {
							this.finalizeCurrentThinkingPart(context, templateData);
						}
					}
				}
			}

			if (content.kind === 'treeData') {
				return this.renderTreeData(content, templateData, context);
			} else if (content.kind === 'multiDiffData') {
				return this.renderMultiDiffData(content, templateData, context);
			} else if (content.kind === 'progressMessage') {
				return this.instantiationService.createInstance(ChatProgressContentPart, content, this.chatContentMarkdownRenderer, context, undefined, undefined, undefined, undefined);
			} else if (content.kind === 'working') {
				return this.instantiationService.createInstance(ChatWorkingProgressContentPart, content, this.chatContentMarkdownRenderer, context);
			} else if (content.kind === 'progressTask' || content.kind === 'progressTaskSerialized') {
				return this.renderProgressTask(content, templateData, context);
			} else if (content.kind === 'command') {
				return this.instantiationService.createInstance(ChatCommandButtonContentPart, content, context);
			} else if (content.kind === 'textEditGroup') {
				return this.renderTextEdit(context, content, templateData);
			} else if (content.kind === 'confirmation') {
				return this.renderConfirmation(context, content, templateData);
			} else if (content.kind === 'warning') {
				return this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Warning, content.content, content, this.chatContentMarkdownRenderer);
			} else if (content.kind === 'markdownContent') {
				return this.renderMarkdown(content, templateData, context);
			} else if (content.kind === 'references') {
				return this.renderContentReferencesListData(content, undefined, context, templateData);
			} else if (content.kind === 'codeCitations') {
				return this.renderCodeCitations(content, context, templateData);
			} else if (content.kind === 'toolInvocation' || content.kind === 'toolInvocationSerialized') {
				return this.renderToolInvocation(content, context, templateData);
			} else if (content.kind === 'extensions') {
				return this.renderExtensionsContent(content, context, templateData);
			} else if (content.kind === 'pullRequest') {
				return this.renderPullRequestContent(content, context, templateData);
			} else if (content.kind === 'undoStop') {
				return this.renderUndoStop(content);
			} else if (content.kind === 'errorDetails') {
				return this.renderChatErrorDetails(context, content, templateData);
			} else if (content.kind === 'elicitation2' || content.kind === 'elicitationSerialized') {
				return this.renderElicitation(context, content, templateData);
			} else if (content.kind === 'changesSummary') {
				return this.renderChangesSummary(content, context, templateData);
			} else if (content.kind === 'mcpServersStarting') {
				return this.renderMcpServersInteractionRequired(content, context, templateData);
			} else if (content.kind === 'thinking') {
				return this.renderThinkingPart(content, context, templateData);
			}

			return this.renderNoContent(other => content.kind === other.kind);
		} catch (err) {
			alert(`Chat error: ${toErrorMessage(err, false)}`);
			this.logService.error('ChatListItemRenderer#renderChatContentPart: error rendering content', toErrorMessage(err, true));
			const errorPart = this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Error, new MarkdownString(localize('renderFailMsg', "Failed to render content") + `: ${toErrorMessage(err, false)}`), content, this.chatContentMarkdownRenderer);
			return {
				dispose: () => errorPart.dispose(),
				domNode: errorPart.domNode,
				hasSameContent: (other => content.kind === other.kind),
			};
		}
	}

	override dispose(): void {
		this._announcedToolProgressKeys.clear();
		super.dispose();
	}


	private renderChatErrorDetails(context: IChatContentPartRenderContext, content: IChatErrorDetailsPart, templateData: IChatListItemTemplate): IChatContentPart {
		if (!isResponseVM(context.element)) {
			return this.renderNoContent(other => content.kind === other.kind);
		}

		const isLast = context.elementIndex === this.delegate.getListLength() - 1;
		if (content.errorDetails.isQuotaExceeded) {
			const renderedError = this.instantiationService.createInstance(ChatQuotaExceededPart, context.element, content, this.chatContentMarkdownRenderer);
			renderedError.addDisposable(renderedError.onDidChangeHeight(() => this.updateItemHeight(templateData)));
			return renderedError;
		} else if (content.errorDetails.isRateLimited && this.chatEntitlementService.anonymous) {
			const renderedError = this.instantiationService.createInstance(ChatAnonymousRateLimitedPart, content);
			return renderedError;
		} else if (content.errorDetails.confirmationButtons && isLast) {
			const level = content.errorDetails.level ?? ChatErrorLevel.Error;
			const errorConfirmation = this.instantiationService.createInstance(ChatErrorConfirmationContentPart, level, new MarkdownString(content.errorDetails.message), content, content.errorDetails.confirmationButtons, this.chatContentMarkdownRenderer, context);
			errorConfirmation.addDisposable(errorConfirmation.onDidChangeHeight(() => this.updateItemHeight(templateData)));
			return errorConfirmation;
		} else {
			const level = content.errorDetails.level ?? ChatErrorLevel.Error;
			return this.instantiationService.createInstance(ChatErrorContentPart, level, new MarkdownString(content.errorDetails.message), content, this.chatContentMarkdownRenderer);
		}
	}

	private renderUndoStop(content: IChatUndoStop) {
		return this.renderNoContent(other => other.kind === content.kind && other.id === content.id);
	}

	private renderNoContent(equals: (otherContent: IChatRendererContent) => boolean): IChatContentPart {
		return {
			dispose: () => { },
			domNode: undefined,
			hasSameContent: equals,
		};
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

	private renderMultiDiffData(content: IChatMultiDiffData, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart {
		const multiDiffPart = this.instantiationService.createInstance(ChatMultiDiffContentPart, content, context.element);
		multiDiffPart.addDisposable(multiDiffPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return multiDiffPart;
	}

	private renderContentReferencesListData(references: IChatReferences, labelOverride: string | undefined, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): ChatCollapsibleListContentPart {
		const referencesPart = this.instantiationService.createInstance(ChatUsedReferencesListContentPart, references.references, labelOverride, context, this._contentReferencesListPool, { expandedWhenEmptyResponse: checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.referencesExpandedWhenEmptyResponse) });
		referencesPart.addDisposable(referencesPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));

		return referencesPart;
	}

	private renderCodeCitations(citations: IChatCodeCitations, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): ChatCodeCitationContentPart {
		const citationsPart = this.instantiationService.createInstance(ChatCodeCitationContentPart, citations, context);
		return citationsPart;
	}

	private handleRenderedCodeblocks(element: ChatTreeItem, part: IChatContentPart, codeBlockStartIndex: number): void {
		if (!part.addDisposable || part.codeblocksPartId === undefined) {
			return;
		}

		const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id) ?? [];
		this.codeBlocksByResponseId.set(element.id, codeBlocksByResponseId);
		part.addDisposable(toDisposable(() => {
			const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id);
			if (codeBlocksByResponseId) {
				// Only delete if this is my code block
				part.codeblocks?.forEach((info, i) => {
					const codeblock = codeBlocksByResponseId[codeBlockStartIndex + i];
					if (codeblock?.ownerMarkdownPartId === part.codeblocksPartId) {
						delete codeBlocksByResponseId[codeBlockStartIndex + i];
					}
				});
			}
		}));

		part.codeblocks?.forEach((info, i) => {
			codeBlocksByResponseId[codeBlockStartIndex + i] = info;
			part.addDisposable!(thenIfNotDisposed(info.uriPromise, uri => {
				if (!uri) {
					return;
				}

				this.codeBlocksByEditorUri.set(uri, info);
				part.addDisposable!(toDisposable(() => {
					const codeblock = this.codeBlocksByEditorUri.get(uri);
					if (codeblock?.ownerMarkdownPartId === part.codeblocksPartId) {
						this.codeBlocksByEditorUri.delete(uri);
					}
				}));
			}));
		});

	}

	private renderToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart | undefined {
		const codeBlockStartIndex = context.codeBlockStartIndex;
		const part = this.instantiationService.createInstance(ChatToolInvocationPart, toolInvocation, context, this.chatContentMarkdownRenderer, this._contentReferencesListPool, this._toolEditorPool, () => this._currentLayoutWidth, this._toolInvocationCodeBlockCollection, this._announcedToolProgressKeys, codeBlockStartIndex);
		part.addDisposable(part.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		this.handleRenderedCodeblocks(context.element, part, codeBlockStartIndex);

		// handling for when we want to put tool invocations inside a thinking part
		const collapsedToolsMode = this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools');
		if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off) {

			// create thinking part if it doesn't exist yet
			const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
			if (!lastThinking && part?.domNode && toolInvocation.presentation !== 'hidden' && this.shouldPinPart(toolInvocation, context.element) && collapsedToolsMode === CollapsedToolsDisplayMode.Always) {
				const thinkingPart = this.renderThinkingPart({
					kind: 'thinking',
				}, context, templateData);

				if (thinkingPart instanceof ChatThinkingContentPart) {
					thinkingPart.appendItem(part?.domNode, toolInvocation.toolId, toolInvocation);
					thinkingPart.addDisposable(part);
					thinkingPart.addDisposable(thinkingPart.onDidChangeHeight(() => {
						this.updateItemHeight(templateData);
					}));
				}

				return thinkingPart;
			}

			if (this.shouldPinPart(toolInvocation, context.element)) {
				if (lastThinking && part?.domNode && toolInvocation.presentation !== 'hidden') {
					lastThinking.appendItem(part?.domNode, toolInvocation.toolId, toolInvocation);
					lastThinking.addDisposable(part);
				}
			} else {
				this.finalizeCurrentThinkingPart(context, templateData);
			}
		}

		return part;
	}

	private renderExtensionsContent(extensionsContent: IChatExtensionsContent, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart | undefined {
		const part = this.instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent);
		part.addDisposable(part.onDidChangeHeight(() => this.updateItemHeight(templateData)));
		return part;
	}

	private renderPullRequestContent(pullRequestContent: IChatPullRequestContent, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart | undefined {
		const part = this.instantiationService.createInstance(ChatPullRequestContentPart, pullRequestContent);
		part.addDisposable(part.onDidChangeHeight(() => this.updateItemHeight(templateData)));
		return part;
	}

	private renderProgressTask(task: IChatTask | IChatTaskSerialized, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart | undefined {
		if (!isResponseVM(context.element)) {
			return;
		}

		const taskPart = this.instantiationService.createInstance(ChatTaskContentPart, task, this._contentReferencesListPool, this.chatContentMarkdownRenderer, context);
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

	private renderElicitation(context: IChatContentPartRenderContext, elicitation: IChatElicitationRequest | IChatElicitationRequestSerialized, templateData: IChatListItemTemplate): IChatContentPart {
		if (elicitation.kind === 'elicitationSerialized' ? elicitation.isHidden : elicitation.isHidden?.get()) {
			return this.renderNoContent(other => elicitation.kind === other.kind);
		}

		const part = this.instantiationService.createInstance(ChatElicitationContentPart, elicitation, context);
		part.addDisposable(part.onDidChangeHeight(() => this.updateItemHeight(templateData)));
		return part;
	}

	private renderChangesSummary(content: IChatChangesSummaryPart, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart {
		const part = this.instantiationService.createInstance(ChatCheckpointFileChangesSummaryContentPart, content, context);
		part.addDisposable(part.onDidChangeHeight(() => { this.updateItemHeight(templateData); }));
		return part;
	}

	private renderAttachments(variables: IChatRequestVariableEntry[], contentReferences: ReadonlyArray<IChatContentReference> | undefined, templateData: IChatListItemTemplate) {
		return this.instantiationService.createInstance(ChatAttachmentsContentPart, {
			variables,
			contentReferences,
			domNode: undefined
		});
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
		const codeBlockStartIndex = context.codeBlockStartIndex;
		const markdownPart = templateData.instantiationService.createInstance(ChatMarkdownContentPart, markdown, context, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.chatContentMarkdownRenderer, undefined, this._currentLayoutWidth, this.codeBlockModelCollection, {});
		if (isRequestVM(element)) {
			markdownPart.domNode.tabIndex = 0;
			if (this.configService.getValue<string>('chat.editRequests') === 'inline' && this.rendererOptions.editable) {
				markdownPart.domNode.classList.add('clickable');
				markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.CLICK, (e: MouseEvent) => {
					if (this.viewModel?.editing?.id === element.id) {
						return;
					}

					// Don't handle clicks on links
					const clickedElement = e.target as HTMLElement;
					if (clickedElement.tagName === 'A') {
						return;
					}

					// Don't handle if there's a text selection in the window
					const selection = dom.getWindow(templateData.rowContainer).getSelection();
					if (selection && !selection.isCollapsed && selection.toString().length > 0) {
						return;
					}

					// Don't handle if there's a selection in code block
					const monacoEditor = dom.findParentWithClass(clickedElement, 'monaco-editor');
					if (monacoEditor) {
						const editorPart = Array.from(this.editorsInUse()).find(editor =>
							editor.element.contains(monacoEditor));

						if (editorPart?.editor.getSelection()?.isEmpty() === false) {
							return;
						}
					}

					e.preventDefault();
					e.stopPropagation();
					this._onDidClickRequest.fire(templateData);
				}));
				this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), markdownPart.domNode, localize('requestMarkdownPartTitle', "Click to Edit"), { trapFocus: true }));
			}
			markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.FOCUS, () => {
				this.hoverVisible(templateData.requestHover);
			}));
			markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.BLUR, () => {
				this.hoverHidden(templateData.requestHover);
			}));
		}

		markdownPart.addDisposable(markdownPart.onDidChangeHeight(() => {
			markdownPart.layout(this._currentLayoutWidth);
			this.updateItemHeight(templateData);
		}));

		this.handleRenderedCodeblocks(element, markdownPart, codeBlockStartIndex);

		return markdownPart;
	}

	renderThinkingPart(content: IChatThinkingPart, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart {
		// TODO @justschen @karthiknadig: remove this when OSWE moves off commentary channel
		if (!content.id) {
			content.id = Date.now().toString();
		}

		// if array, we do a naive part by part rendering for now
		if (Array.isArray(content.value)) {
			if (content.value.length < 1) {
				const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
				lastThinking?.finalizeTitleIfDefault();
				return this.renderNoContent(other => content.kind === other.kind);
			}
			let lastPart: IChatContentPart | undefined;
			for (const item of content.value) {
				if (item) {
					const lastThinkingPart = lastPart instanceof ChatThinkingContentPart && lastPart.getIsActive() ? lastPart : undefined;
					if (lastThinkingPart) {
						lastThinkingPart.setupThinkingContainer({ ...content, value: item }, context);
					} else {
						const itemContent = { ...content, value: item };
						const itemPart = templateData.instantiationService.createInstance(ChatThinkingContentPart, itemContent, context, this.chatContentMarkdownRenderer);
						itemPart.addDisposable(itemPart.onDidChangeHeight(() => this.updateItemHeight(templateData)));
						lastPart = itemPart;
					}
				}
			}
			return lastPart ?? this.renderNoContent(other => content.kind === other.kind);
			// non-array, handle case where we are currently thinking vs. starting a new thinking part
		} else {
			const lastActiveThinking = this.getLastThinkingPart(templateData.renderedParts);
			if (lastActiveThinking) {
				lastActiveThinking.setupThinkingContainer(content, context);
				return lastActiveThinking;
			} else {
				const part = templateData.instantiationService.createInstance(ChatThinkingContentPart, content, context, this.chatContentMarkdownRenderer);
				part.addDisposable(part.onDidChangeHeight(() => this.updateItemHeight(templateData)));
				return part;
			}

		}
	}

	disposeElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IChatListItemTemplate, details?: IListElementRenderDetails): void {
		this.traceLayout('disposeElement', `Disposing element, index=${index}`);
		templateData.elementDisposables.clear();

		if (templateData.currentElement && !this.viewModel?.editing) {
			this.templateDataByRequestId.delete(templateData.currentElement.id);
		}

		if (isRequestVM(node.element) && node.element.id === this.viewModel?.editing?.id && details?.onScroll) {
			this._onDidDispose.fire(templateData);
		}

		// Don't retain the toolbar context which includes chat viewmodels
		if (templateData.titleToolbar) {
			templateData.titleToolbar.context = undefined;
		}
		templateData.footerToolbar.context = undefined;
	}

	private renderMcpServersInteractionRequired(content: IChatMcpServersStarting, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart {
		return this.instantiationService.createInstance(ChatMcpServersInteractionContentPart, content, context);
	}

	disposeTemplate(templateData: IChatListItemTemplate): void {
		templateData.templateDisposables.dispose();
	}

	private hoverVisible(requestHover: HTMLElement) {
		requestHover.style.opacity = '1';
	}

	private hoverHidden(requestHover: HTMLElement) {
		requestHover.style.opacity = '0';
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
		const height = element.currentRenderedHeight ?? this.defaultElementHeight;
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
