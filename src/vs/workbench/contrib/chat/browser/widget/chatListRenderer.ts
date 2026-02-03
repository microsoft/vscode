/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { DropdownMenuActionViewItem, IDropdownMenuActionViewItemOptions } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { CachedListVirtualDelegate, IListElementRenderDetails } from '../../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { IAction } from '../../../../../base/common/actions.js';
import { coalesce, distinct } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { canceledName } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, dispose, thenIfNotDisposed, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ScrollEvent } from '../../../../../base/common/scrollable.js';
import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IMenuEntryActionViewItemOptions, createActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { isDark } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchIssueService } from '../../../issue/common/issue.js';
import { CodiconActionViewItem } from '../../../notebook/browser/view/cellParts/cellActionView.js';
import { annotateSpecialMarkdownContent, extractSubAgentInvocationIdFromText, hasCodeblockUriTag } from '../../common/widget/annotations.js';
import { checkModeOption } from '../../common/chat.js';
import { IChatAgentMetadata } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatTextEditGroup } from '../../common/model/chatModel.js';
import { chatSubcommandLeader } from '../../common/requestParser/chatParserTypes.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, ChatErrorLevel, ChatRequestQueueKind, IChatConfirmation, IChatContentReference, IChatElicitationRequest, IChatElicitationRequestSerialized, IChatExtensionsContent, IChatFollowup, IChatMarkdownContent, IChatMcpServersStarting, IChatMcpServersStartingSerialized, IChatMultiDiffData, IChatMultiDiffDataSerialized, IChatPullRequestContent, IChatQuestionCarousel, IChatService, IChatTask, IChatTaskSerialized, IChatThinkingPart, IChatToolInvocation, IChatToolInvocationSerialized, IChatTreeData, IChatUndoStop, isChatFollowup } from '../../common/chatService/chatService.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatChangesSummaryPart, IChatCodeCitations, IChatErrorDetailsPart, IChatReferences, IChatRendererContent, IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, isRequestVM, isResponseVM, IChatPendingDividerViewModel, isPendingDividerVM } from '../../common/model/chatViewModel.js';
import { getNWords } from '../../common/model/chatWordCounter.js';
import { CodeBlockModelCollection } from '../../common/widget/codeBlockModelCollection.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../common/constants.js';
import { MarkUnhelpfulActionId } from '../actions/chatTitleActions.js';
import { ChatTreeItem, IChatCodeBlockInfo, IChatFileTreeInfo, IChatListItemRendererOptions, IChatWidgetService } from '../chat.js';
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
import { ChatQuestionCarouselPart } from './chatContentParts/chatQuestionCarouselPart.js';
import { ChatExtensionsContentPart } from './chatContentParts/chatExtensionsContentPart.js';
import { ChatMarkdownContentPart, codeblockHasClosingBackticks } from './chatContentParts/chatMarkdownContentPart.js';
import { ChatMcpServersInteractionContentPart } from './chatContentParts/chatMcpServersInteractionContentPart.js';
import { ChatMultiDiffContentPart } from './chatContentParts/chatMultiDiffContentPart.js';
import { ChatProgressContentPart, ChatWorkingProgressContentPart } from './chatContentParts/chatProgressContentPart.js';
import { ChatPullRequestContentPart } from './chatContentParts/chatPullRequestContentPart.js';
import { ChatQuotaExceededPart } from './chatContentParts/chatQuotaExceededPart.js';
import { ChatCollapsibleListContentPart, ChatUsedReferencesListContentPart, CollapsibleListPool } from './chatContentParts/chatReferencesContentPart.js';
import { ChatTaskContentPart } from './chatContentParts/chatTaskContentPart.js';
import { ChatTextEditContentPart } from './chatContentParts/chatTextEditContentPart.js';
import { ChatThinkingContentPart } from './chatContentParts/chatThinkingContentPart.js';
import { ChatSubagentContentPart } from './chatContentParts/chatSubagentContentPart.js';
import { ChatTipContentPart } from './chatContentParts/chatTipContentPart.js';
import { ChatTreeContentPart, TreePool } from './chatContentParts/chatTreeContentPart.js';
import { ChatWorkspaceEditContentPart } from './chatContentParts/chatWorkspaceEditContentPart.js';
import { ChatToolInvocationPart } from './chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { ChatMarkdownDecorationsRenderer } from './chatContentParts/chatMarkdownDecorationsRenderer.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatCodeBlockContentProvider, CodeBlockPart } from './chatContentParts/codeBlockPart.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { RunSubagentTool } from '../../common/tools/builtinTools/runSubagentTool.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IChatTipService } from '../chatTipService.js';

const $ = dom.$;

const COPILOT_USERNAME = 'GitHub Copilot';

export interface IChatListItemTemplate {
	currentElement?: ChatTreeItem;
	/**
	 * The parts that are currently rendered in the template. Note that these are purposely not added to elementDisposables-
	 * they are disposed in a separate cycle after diffing with the next content to render.
	 */
	renderedParts?: IChatContentPart[];
	/**
	 * Element used to track whether the template is mounted in the DOM.
	 */
	renderedPartsMounted?: boolean;

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

	readonly onDidScroll?: Event<ScrollEvent>;
}

const mostRecentResponseClassName = 'chat-most-recent-response';

export class ChatListItemRenderer extends Disposable implements ITreeRenderer<ChatTreeItem, FuzzyScore, IChatListItemTemplate> {
	static readonly ID = 'item';

	private readonly codeBlocksByResponseId = new Map<string, IChatCodeBlockInfo[]>();
	private readonly codeBlocksByEditorUri = new ResourceMap<IChatCodeBlockInfo>();

	private readonly fileTreesByResponseId = new Map<string, IChatFileTreeInfo[]>();
	private readonly focusedFileTreesByResponseId = new Map<string, number>();

	private readonly templateDataByRequestId = new Map<string, IChatListItemTemplate>();

	/** Track pending question carousels by session resource for auto-skip on chat submission */
	private readonly pendingQuestionCarousels = new ResourceMap<Set<ChatQuestionCarouselPart>>();

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

	private readonly _onDidUpdateViewModel = this._register(new Emitter<void>());

	private readonly _editorPool: EditorPool;
	private readonly _toolEditorPool: EditorPool;
	private readonly _diffEditorPool: DiffEditorPool;
	private readonly _treePool: TreePool;
	private readonly _contentReferencesListPool: CollapsibleListPool;

	private _currentLayoutWidth = observableValue(this, 0);
	private _isVisible = true;
	private _elementBeingRendered: ChatTreeItem | undefined;
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
		@IChatService private readonly chatService: IChatService,
		@IChatTipService private readonly chatTipService: IChatTipService,
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

		// Auto-skip pending question carousels when user submits a new chat message
		this._register(this.chatService.onDidSubmitRequest(e => {
			const carousels = this.pendingQuestionCarousels.get(e.chatSessionResource);
			if (carousels) {
				for (const carousel of carousels) {
					carousel.skip();
				}
				carousels.clear();
			}
		}));
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
			Min = 40,
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
		this.codeBlocksByEditorUri.clear();
		this.codeBlocksByResponseId.clear();
		this.fileTreesByResponseId.clear();
		this.focusedFileTreesByResponseId.clear();
		this._editorPool.clear();
		this._toolEditorPool.clear();
		this._diffEditorPool.clear();
		this._treePool.clear();
		this._contentReferencesListPool.clear();
		this._onDidUpdateViewModel.fire();
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
		if (newWidth !== this._currentLayoutWidth.get()) {
			this._currentLayoutWidth.set(newWidth, undefined);
			for (const editor of this._editorPool.inUse()) {
				editor.layout(newWidth);
			}
			for (const toolEditor of this._toolEditorPool.inUse()) {
				toolEditor.layout(newWidth);
			}
			for (const diffEditor of this._diffEditorPool.inUse()) {
				diffEditor.layout(newWidth);
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
		const elementDisposables = templateDisposables.add(new DisposableStore());

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
		const connectionObserver = document.createElement('connection-observer') as dom.ConnectionObserverElement;
		dom.append(container, connectionObserver);
		const template: IChatListItemTemplate = { header, avatarContainer, requestHover, username, detail, value, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, agentHover, titleToolbar, footerToolbar, footerDetailsContainer, disabledOverlay, checkpointToolbar, checkpointRestoreToolbar, checkpointContainer, checkpointRestoreContainer };

		connectionObserver.onDidDisconnect = () => {
			template.renderedPartsMounted = false;
		};

		templateDisposables.add(this._onDidUpdateViewModel.event(() => {
			if (!template.currentElement || !this.viewModel?.sessionResource || !isEqual(template.currentElement.sessionResource, this.viewModel.sessionResource)) {
				this.clearRenderedParts(template);
			}
		}));

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

		const resizeObserver = templateDisposables.add(new dom.DisposableResizeObserver((entries) => {
			if (!template.currentElement) {
				return;
			}

			const entry = entries[0];
			if (entry) {
				const height = entry.borderBoxSize.at(0)?.blockSize;
				if (height === 0 || !height || !template.rowContainer.isConnected) {
					// Don't fire for changes that happen from the row being removed from the DOM
					return;
				}

				const normalizedHeight = Math.ceil(height);
				template.currentElement.currentRenderedHeight = normalizedHeight;
				if (template.currentElement !== this._elementBeingRendered) {
					this._onDidChangeItemHeight.fire({ element: template.currentElement, height: normalizedHeight });
				}
			}
		}));
		templateDisposables.add(resizeObserver.observe(rowContainer));

		return template;
	}

	renderElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IChatListItemTemplate): void {
		this._elementBeingRendered = node.element;
		try {
			this.renderChatTreeItem(node.element, index, templateData);
		} finally {
			this._elementBeingRendered = undefined;
		}
	}

	/**
	 * Dispose the rendered parts in the template, which aren't done in disposeElement
	 * so they can be reused when a new render is started.
	 */
	private clearRenderedParts(templateData: IChatListItemTemplate): void {
		if (templateData.renderedParts) {
			dispose(coalesce(templateData.renderedParts));
			templateData.renderedParts = undefined;
			dom.clearNode(templateData.value);
		}

		// This template item is no longer in use, or having another element rendered into it,
		// clear the context on toolbars so it doesn't retain the viewmodel.
		if (templateData.titleToolbar) {
			templateData.titleToolbar.context = undefined;
		}
		templateData.footerToolbar.context = undefined;
		templateData.checkpointToolbar.context = undefined;
		templateData.checkpointRestoreToolbar.context = undefined;
	}

	private renderChatTreeItem(element: ChatTreeItem, index: number, templateData: IChatListItemTemplate): void {
		if (templateData.currentElement && templateData.currentElement.id !== element.id) {
			this.traceLayout('renderChatTreeItem', `Rendering a different element into the template, index=${index}`);
			const mappedTemplateData = this.templateDataByRequestId.get(templateData.currentElement.id);
			if (mappedTemplateData && (mappedTemplateData.currentElement?.id !== templateData.currentElement.id)) {
				this.templateDataByRequestId.delete(templateData.currentElement.id);
			}

			this.clearRenderedParts(templateData);
		}

		templateData.currentElement = element;
		this.templateDataByRequestId.set(element.id, templateData);

		// Handle pending divider with simplified rendering
		if (isPendingDividerVM(element)) {
			this.renderPendingDivider(element, templateData);
			return;
		}

		const kind = isRequestVM(element) ? 'request' :
			isResponseVM(element) ? 'response' :
				isPendingDividerVM(element) ? 'pendingDivider' :
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
		// Clear pending-related classes from previous renders
		templateData.rowContainer.classList.remove('pending-item', 'pending-divider', 'pending-request');
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

		templateData.elementDisposables.add(autorun(r => {
			const shouldBeBlocked = element.shouldBeBlocked.read(r);
			templateData.disabledOverlay.classList.toggle('disabled', shouldBeBlocked && !editing && this.viewModel?.editing !== undefined);
		}));
		templateData.rowContainer.classList.toggle('editing', editing && !isInput);
		templateData.rowContainer.classList.toggle('editing-input', editing && isInput);
		templateData.requestHover.classList.toggle('editing', editing && isInput);
		templateData.requestHover.classList.toggle('hidden', (!!this.viewModel?.editing && !editing) || isResponseVM(element) || !this.rendererOptions.editable);
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
		templateData.renderedPartsMounted = true;
	}

	private renderPendingDivider(element: IChatPendingDividerViewModel, templateData: IChatListItemTemplate): void {
		templateData.rowContainer.classList.add('pending-item');
		templateData.rowContainer.classList.add('pending-divider');
		templateData.rowContainer.classList.remove('interactive-request', 'interactive-response', 'pending-request');

		// Hide header elements not applicable to pending divider
		templateData.avatarContainer.classList.add('hidden');
		templateData.username.classList.add('hidden');
		templateData.requestHover.classList.add('hidden');
		templateData.checkpointContainer.classList.add('hidden');
		templateData.checkpointRestoreContainer.classList.add('hidden');
		templateData.footerToolbar.getElement().classList.add('hidden');
		if (templateData.titleToolbar) {
			templateData.titleToolbar.getElement().classList.add('hidden');
		}

		dom.clearNode(templateData.value);
		dom.clearNode(templateData.detail);

		const dividerContent = dom.$('.pending-divider-content');
		const label = dom.append(dividerContent, dom.$('span.pending-divider-label'));

		if (element.dividerKind === ChatRequestQueueKind.Steering) {
			label.textContent = localize('steeringDivider', "Steering");
			label.title = localize('steeringDividerTooltip', "Steering message will be sent after the next tool call happens");
		} else {
			label.textContent = localize('queuedDivider', "Queued");
			label.title = localize('queuedDividerTooltip', "Queued messages will be sent after the current request completes");
		}

		templateData.value.appendChild(dividerContent);
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
		if (isPendingDividerVM(element)) {
			return;
		}
		let icon: URI | ThemeIcon;
		if (isResponseVM(element)) {
			icon = this.getAgentIcon(element.agent?.metadata);
		} else if (isRequestVM(element)) {
			icon = element.avatarIcon ?? Codicon.account;
		} else {
			icon = Codicon.account;
		}
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

		if (element.isComplete || element.isCanceled) {
			const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
			if (lastThinking?.domNode && lastThinking.getIsActive()) {
				lastThinking.finalizeTitleIfDefault();
				lastThinking.markAsInactive();
			}
			this.finalizeAllSubagentParts(templateData);
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
	}

	private shouldShowWorkingProgress(element: IChatResponseViewModel, partsToRender: IChatRendererContent[], templateData: IChatListItemTemplate): boolean {
		if (element.agentOrSlashCommandDetected || this.rendererOptions.renderStyle === 'minimal' || element.isComplete || !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
			return false;
		}

		// Don't show working if a streaming tool invocation is already present
		if (partsToRender.some(part => part.kind === 'toolInvocation' && IChatToolInvocation.isStreaming(part))) {
			return false;
		}

		// Show if no content, only "used references", ends with a complete tool call, or ends with complete text edits and there is no incomplete tool call (edits are still being applied some time after they are all generated)
		const lastPart = findLast(partsToRender, part => part.kind !== 'markdownContent' || part.content.value.trim().length > 0);

		// don't show working progress when there is thinking content in partsToRender (about to be rendered)
		if (partsToRender.some(part => part.kind === 'thinking')) {
			return false;
		}

		// never show working progress when there is an active thinking piece
		const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
		if (lastThinking) {
			return false;
		}

		const collapsedToolsMode = this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools');
		if (collapsedToolsMode !== CollapsedToolsDisplayMode.Off &&
			partsToRender.some(part =>
				(part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') &&
				part.presentation !== 'hidden' &&
				this.shouldPinPart(part, element)
			)) {
			return false;
		}

		// Don't show working spinner when there's any active subagent - subagents have their own progress indicator
		if (this.getSubagentPart(templateData.renderedParts)) {
			return false;
		}

		if (
			!lastPart ||
			lastPart.kind === 'references' ||
			((lastPart.kind === 'toolInvocation' || lastPart.kind === 'toolInvocationSerialized') && (IChatToolInvocation.isComplete(lastPart) || lastPart.presentation === 'hidden')) ||
			((lastPart.kind === 'textEditGroup' || lastPart.kind === 'notebookEditGroup') && lastPart.done && !partsToRender.some(part => part.kind === 'toolInvocation' && !IChatToolInvocation.isComplete(part))) ||
			(lastPart.kind === 'progressTask' && lastPart.deferred.isSettled) ||
			lastPart.kind === 'mcpServersStarting'
		) {
			return true;
		}

		return false;
	}


	private getChatFileChangesSummaryPart(element: IChatResponseViewModel): IChatChangesSummaryPart | undefined {
		if (!this.shouldShowFileChangesSummary(element)) {
			return undefined;
		}
		if (!element.model.entireResponse.value.some(part => part.kind === 'textEditGroup' || part.kind === 'notebookEditGroup')) {
			return undefined;
		}

		return { kind: 'changesSummary', requestId: element.requestId, sessionResource: element.sessionResource };
	}

	private renderChatRequest(element: IChatRequestViewModel, index: number, templateData: IChatListItemTemplate) {
		templateData.rowContainer.classList.toggle('chat-response-loading', false);
		templateData.rowContainer.classList.toggle('pending-request', !!element.pendingKind);
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

		// Render tip above the request message (if available)
		const tip = this.chatTipService.getNextTip(element.id, element.timestamp, this.contextKeyService);
		if (tip) {
			const tipPart = new ChatTipContentPart(tip, this.chatContentMarkdownRenderer);
			templateData.value.appendChild(tipPart.domNode);
			templateData.elementDisposables.add(tipPart);
		}

		let inlineSlashCommandRendered = false;
		content.forEach((data, contentIndex) => {
			const context: IChatContentPartRenderContext = {
				element,
				elementIndex: index,
				contentIndex: contentIndex,
				content: content,
				container: templateData.rowContainer,
				editorPool: this._editorPool,
				diffEditorPool: this._diffEditorPool,
				codeBlockModelCollection: this.codeBlockModelCollection,
				currentWidth: this._currentLayoutWidth,
				onDidChangeVisibility: this._onDidChangeVisibility.event,
				get codeBlockStartIndex() {
					return parts.reduce((acc, part) => acc + (part.codeblocks?.length ?? 0), 0);
				},
				get treeStartIndex() {
					return parts.filter(part => part instanceof ChatTreeContentPart).length;
				}
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
		this.traceLayout('doNextProgressiveRender', `START progressive render, index=${index}`);
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
				return true;
			}
		}

		// Do an actual progressive render
		this.traceLayout('doNextProgressiveRender', `doing progressive render, ${partsToRender.length} parts to render`);
		this.renderChatContentDiff(partsToRender, contentForThisTurn.content, element, index, templateData);

		return false;
	}

	private renderChatContentDiff(partsToRender: ReadonlyArray<IChatRendererContent | null>, contentForThisTurn: ReadonlyArray<IChatRendererContent>, element: IChatResponseViewModel, elementIndex: number, templateData: IChatListItemTemplate): void {
		const renderedParts = templateData.renderedParts ?? [];
		templateData.renderedParts = renderedParts;
		partsToRender.forEach((partToRender, contentIndex) => {
			const alreadyRenderedPart = templateData.renderedParts?.[contentIndex];

			if (!partToRender) {
				// null=no change
				if (!templateData.renderedPartsMounted) {
					alreadyRenderedPart?.onDidRemount?.();
				}
				return;
			}

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
				contentIndex: contentIndex,
				container: templateData.rowContainer,
				editorPool: this._editorPool,
				diffEditorPool: this._diffEditorPool,
				codeBlockModelCollection: this.codeBlockModelCollection,
				currentWidth: this._currentLayoutWidth,
				onDidChangeVisibility: this._onDidChangeVisibility.event,
				get codeBlockStartIndex() {
					return preceedingContentParts.reduce((acc, part) => acc + (part.codeblocks?.length ?? 0), 0);
				},
				get treeStartIndex() {
					return preceedingContentParts.filter(part => part instanceof ChatTreeContentPart).length;
				}
			};

			// combine tool invocations into thinking part if needed. render the tool, but do not replace the working spinner with the new part's dom node since it is already inside the thinking part.
			const lastThinking = this.getLastThinkingPart(renderedParts);
			if (lastThinking && (partToRender.kind === 'toolInvocation' || partToRender.kind === 'toolInvocationSerialized' || partToRender.kind === 'markdownContent' || partToRender.kind === 'textEditGroup') && this.shouldPinPart(partToRender, element)) {
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
		// Only show file changes summary for local sessions - background sessions already have their own file changes part
		const isLocalSession = getChatSessionType(element.sessionResource) === localChatSessionType;
		return element.isComplete && isLocalSession && this.configService.getValue<boolean>('chat.checkpoints.showFileChanges');
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

	private hasCodeblockUri(part: IChatRendererContent): boolean {
		if (part.kind !== 'markdownContent') {
			return false;
		}
		return hasCodeblockUriTag(part.content.value);
	}

	private isCodeblockComplete(part: IChatRendererContent, element: ChatTreeItem): boolean {
		if (part.kind !== 'markdownContent') {
			return true;
		}
		return !isResponseVM(element) || element.isComplete || codeblockHasClosingBackticks(part.content.value);
	}

	private shouldPinPart(part: IChatRendererContent, element?: IChatResponseViewModel): boolean {
		const collapsedToolsMode = this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools');

		// thinking and working content are always pinned (they are the thinking container itself)
		if (part.kind === 'thinking' || part.kind === 'working') {
			return true;
		}

		// should not finalize thinking
		if (part.kind === 'undoStop') {
			return true;
		}

		if (collapsedToolsMode === CollapsedToolsDisplayMode.Off) {
			return false;
		}

		// is an edit related part
		if (this.hasCodeblockUri(part) || part.kind === 'textEditGroup') {
			return true;
		}

		// Don't pin MCP tools
		const isMcpTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.source?.type === 'mcp';
		if (isMcpTool) {
			return false;
		}

		// don't pin Mermaid tools since it has rendered output
		const isMermaidTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolId.toLowerCase().includes('mermaid');
		if (isMermaidTool) {
			return false;
		}

		// don't pin ask questions tool invocations
		const isAskQuestionsTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolId === 'copilot_askQuestions';
		if (isAskQuestionsTool) {
			return false;
		}

		// Don't pin subagent tools to thinking parts - they have their own grouping
		const isSubagentTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && (part.subAgentInvocationId || part.toolId === RunSubagentTool.Id);
		if (isSubagentTool) {
			return false;
		}

		// only pin terminal tools based on settings
		const isTerminalTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolSpecificData?.kind === 'terminal';
		const isContributedTerminalToolInvocation = element
			&& (element.sessionResource.scheme !== Schemas.vscodeChatInput && element.sessionResource.scheme !== Schemas.vscodeLocalChatSession) // contributed sessions
			&& part.kind === 'toolInvocationSerialized' && part.toolSpecificData?.kind === 'terminal'; // contributed serialized terminal tool invocations data
		if (isTerminalTool && !isContributedTerminalToolInvocation) {
			// don't pin terminals with confirmation
			if (part.kind === 'toolInvocation' && IChatToolInvocation.getConfirmationMessages(part)) {
				return false;
			}
			const terminalToolsInThinking = this.configService.getValue<boolean>(ChatConfiguration.TerminalToolsInThinking);
			return !!terminalToolsInThinking;
		}

		if (part.kind === 'toolInvocation') {
			// pin when streaming since we don't know if we have confirmation yet or not
			if (IChatToolInvocation.isStreaming(part)) {
				return true;
			}
			// don't pin if waiting for confirmation or post-approval
			const state = part.state.get();
			if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
				return false;
			}
			return !IChatToolInvocation.getConfirmationMessages(part);
		}

		if (part.kind === 'toolInvocationSerialized') {
			return true;
		}

		return false;
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

	/**
	 * Determines if a thinking part at the given content index is "look-ahead complete".
	 * A thinking part is look-ahead complete if there are subsequent parts that will NOT
	 * be pinned to it, meaning we know this thinking part is already done even though
	 * the overall response is still in progress.
	 */
	private isThinkingLookAheadComplete(context: IChatContentPartRenderContext, element?: IChatResponseViewModel): boolean {
		// If element is already complete, no need for look-ahead
		if (element?.isComplete) {
			return true;
		}

		// Look at all parts after the current content index
		for (let i = context.contentIndex + 1; i < context.content.length; i++) {
			const nextPart = context.content[i];
			// If there's any part that would NOT be pinned to the thinking part,
			// then this thinking part is already complete
			if (!this.shouldPinPart(nextPart, element)) {
				return true;
			}
		}

		return false;
	}

	private getSubagentPart(renderedParts: ReadonlyArray<IChatContentPart> | undefined, subAgentInvocationId?: string): ChatSubagentContentPart | undefined {
		if (!renderedParts || renderedParts.length === 0) {
			return undefined;
		}

		// Search backwards for the most recent subagent part
		for (let i = renderedParts.length - 1; i >= 0; i--) {
			const part = renderedParts[i];
			if (part instanceof ChatSubagentContentPart) {
				// If looking for a specific ID, return the part with that ID regardless of active state
				if (subAgentInvocationId && part.subAgentInvocationId === subAgentInvocationId) {
					return part;
				}
				// If no ID specified, only return active parts
				if (!subAgentInvocationId && part.getIsActive()) {
					return part;
				}
			}
		}

		return undefined;
	}

	private finalizeAllSubagentParts(templateData: IChatListItemTemplate): void {
		if (!templateData.renderedParts) {
			return;
		}

		// Finalize all active subagent parts (there can be multiple parallel subagents)
		for (const part of templateData.renderedParts) {
			if (part instanceof ChatSubagentContentPart && part.getIsActive()) {
				part.markAsInactive();
			}
		}
	}

	private handleSubagentToolGrouping(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, subagentId: string, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate, codeBlockStartIndex: number): ChatSubagentContentPart {
		// Finalize any active thinking part since subagent tools have their own grouping
		this.finalizeCurrentThinkingPart(context, templateData);

		const lastSubagent = this.getSubagentPart(templateData.renderedParts, subagentId);
		if (lastSubagent) {
			// Append to existing subagent part with matching ID
			// But skip the runSubagent tool itself - we only want child tools
			if (toolInvocation.toolId !== RunSubagentTool.Id) {
				lastSubagent.appendToolInvocation(toolInvocation, codeBlockStartIndex);
			}
			return lastSubagent;
		}

		// Create a new subagent part - it will extract description/agentName/prompt and watch for completion
		const subagentPart = this.instantiationService.createInstance(
			ChatSubagentContentPart,
			subagentId,
			toolInvocation,
			context,
			this.chatContentMarkdownRenderer,
			this._contentReferencesListPool,
			this._toolEditorPool,
			() => this._currentLayoutWidth.get(),
			this._toolInvocationCodeBlockCollection,
			this._announcedToolProgressKeys,
		);
		// Don't append the runSubagent tool itself - its description is already shown in the title
		// Only append child tools (those with subAgentInvocationId)
		if (toolInvocation.toolId !== RunSubagentTool.Id) {
			subagentPart.appendToolInvocation(toolInvocation, codeBlockStartIndex);
		}
		return subagentPart;
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
			// if we get an empty thinking part, mark thinking as finished
			if (content.kind === 'thinking' && (Array.isArray(content.value) ? content.value.length === 0 : content.value === '')) {
				const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
				lastThinking?.resetId();
				return this.renderNoContent(other => content.kind === other.kind);
			}

			const isResponseElement = isResponseVM(context.element);
			const shouldPin = this.shouldPinPart(content, isResponseElement ? context.element : undefined);

			// sometimes content is rendered out of order on re-renders so instead of looking at the current chat content part's
			// context and templateData, we have to look globally to find the active thinking part.
			if (context.element.isComplete && !shouldPin) {
				for (const templateData of this.templateDataByRequestId.values()) {
					if (templateData.renderedParts) {
						const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
						if (lastThinking?.getIsActive()) {
							this.finalizeCurrentThinkingPart(context, templateData);
						}
					}
				}
			}

			// Check if this is subagent content
			const isSubagentContent = (content.kind === 'toolInvocation' || content.kind === 'toolInvocationSerialized')
				&& (content.subAgentInvocationId || content.toolId === RunSubagentTool.Id);

			// Finalize all subagent parts when element is complete
			// Note: We don't finalize when non-subagent content arrives because parallel subagents may still be running
			if (context.element.isComplete && !isSubagentContent) {
				for (const templateData of this.templateDataByRequestId.values()) {
					this.finalizeAllSubagentParts(templateData);
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
			} else if (content.kind === 'questionCarousel') {
				return this.renderQuestionCarousel(context, content, templateData);
			} else if (content.kind === 'changesSummary') {
				return this.renderChangesSummary(content, context, templateData);
			} else if (content.kind === 'mcpServersStarting') {
				return this.renderMcpServersInteractionRequired(content, context, templateData);
			} else if (content.kind === 'thinking') {
				return this.renderThinkingPart(content, context, templateData);
			} else if (content.kind === 'workspaceEdit') {
				return this.instantiationService.createInstance(ChatWorkspaceEditContentPart, content, context, this.chatContentMarkdownRenderer);
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
			return renderedError;
		} else if (content.errorDetails.isRateLimited && this.chatEntitlementService.anonymous) {
			const renderedError = this.instantiationService.createInstance(ChatAnonymousRateLimitedPart, content);
			return renderedError;
		} else if (content.errorDetails.confirmationButtons && isLast) {
			const level = content.errorDetails.level ?? ChatErrorLevel.Error;
			const errorConfirmation = this.instantiationService.createInstance(ChatErrorConfirmationContentPart, level, new MarkdownString(content.errorDetails.message), content, content.errorDetails.confirmationButtons, this.chatContentMarkdownRenderer, context);
			return errorConfirmation;
		} else {
			const level = content.errorDetails.level ?? ChatErrorLevel.Error;
			return this.instantiationService.createInstance(ChatErrorContentPart, level, new MarkdownString(content.errorDetails.message), content, this.chatContentMarkdownRenderer);
		}
	}

	private renderUndoStop(content: IChatUndoStop) {
		return this.renderNoContent(other => other.kind === content.kind && other.id === content.id);
	}

	private renderNoContent(equals: (other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem) => boolean): IChatContentPart {
		return {
			dispose: () => { },
			domNode: undefined,
			hasSameContent: equals,
		};
	}

	private renderTreeData(content: IChatTreeData, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart {
		const data = content.treeData;
		const treePart = this.instantiationService.createInstance(ChatTreeContentPart, data, this._treePool);

		if (isResponseVM(context.element)) {
			const fileTreeFocusInfo = {
				treeDataId: data.uri.toString(),
				treeIndex: context.treeStartIndex,
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

	private renderMultiDiffData(content: IChatMultiDiffData | IChatMultiDiffDataSerialized, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart {
		const multiDiffPart = this.instantiationService.createInstance(ChatMultiDiffContentPart, content, context.element);
		return multiDiffPart;
	}

	private renderContentReferencesListData(references: IChatReferences, labelOverride: string | undefined, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): ChatCollapsibleListContentPart {
		const referencesPart = this.instantiationService.createInstance(ChatUsedReferencesListContentPart, references.references, labelOverride, context, this._contentReferencesListPool, { expandedWhenEmptyResponse: checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.referencesExpandedWhenEmptyResponse) });

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
		if (this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools') === CollapsedToolsDisplayMode.Off) {
			this.finalizeCurrentThinkingPart(context, templateData);
		}

		const codeBlockStartIndex = context.codeBlockStartIndex;

		// Factory that creates the tool invocation part with all necessary setup
		let lazilyCreatedPart: ChatToolInvocationPart | undefined = undefined;
		const createToolPart = (): { domNode: HTMLElement; part: ChatToolInvocationPart } => {
			lazilyCreatedPart = this.instantiationService.createInstance(ChatToolInvocationPart, toolInvocation, context, this.chatContentMarkdownRenderer, this._contentReferencesListPool, this._toolEditorPool, () => this._currentLayoutWidth.get(), this._toolInvocationCodeBlockCollection, this._announcedToolProgressKeys, codeBlockStartIndex);
			this.handleRenderedCodeblocks(context.element, lazilyCreatedPart, codeBlockStartIndex);
			return { domNode: lazilyCreatedPart.domNode, part: lazilyCreatedPart };
		};

		// handling for when we want to put tool invocations inside a thinking part
		const collapsedToolsMode = this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools');
		if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off) {
			const lastThinking = this.getLastThinkingPart(templateData.renderedParts);

			// create thinking part if it doesn't exist yet
			if (!lastThinking && toolInvocation.presentation !== 'hidden' && this.shouldPinPart(toolInvocation, context.element) && collapsedToolsMode === CollapsedToolsDisplayMode.Always) {
				const thinkingPart = this.renderThinkingPart({
					kind: 'thinking',
				}, context, templateData);

				if (thinkingPart instanceof ChatThinkingContentPart) {
					// Append using factory - thinking part decides whether to render lazily
					thinkingPart.appendItem(createToolPart, toolInvocation.toolId, toolInvocation, templateData.value);
					this.setupConfirmationTransitionWatcher(toolInvocation, thinkingPart, () => lazilyCreatedPart, createToolPart, context, templateData);
				}

				return thinkingPart;
			}

			if (this.shouldPinPart(toolInvocation, context.element)) {
				if (lastThinking && toolInvocation.presentation !== 'hidden') {
					// Append using factory - thinking part decides whether to render lazily
					lastThinking.appendItem(createToolPart, toolInvocation.toolId, toolInvocation, templateData.value);
					this.setupConfirmationTransitionWatcher(toolInvocation, lastThinking, () => lazilyCreatedPart, createToolPart, context, templateData);
					return this.renderNoContent((other, followingContent, element) => lazilyCreatedPart ?
						lazilyCreatedPart.hasSameContent(other, followingContent, element) :
						toolInvocation.kind === other.kind);
				}
			} else {
				this.finalizeCurrentThinkingPart(context, templateData);
			}
		}

		// Check for subagent grouping before creating tool part - subagent part handles lazy creation
		const subagentId = toolInvocation.toolId === RunSubagentTool.Id ? toolInvocation.toolCallId : toolInvocation.subAgentInvocationId;
		if (subagentId && isResponseVM(context.element) && toolInvocation.presentation !== 'hidden') {
			return this.handleSubagentToolGrouping(toolInvocation, subagentId, context, templateData, codeBlockStartIndex);
		}

		// For cases not handled above (no thinking part, no subagent, etc.), create the part now
		const { part } = createToolPart();

		return part;
	}

	// watch for confirmation part transition when tool invocation is streaming
	private setupConfirmationTransitionWatcher(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		thinkingPart: ChatThinkingContentPart,
		getCreatedPart: () => ChatToolInvocationPart | undefined,
		createToolPart: () => { domNode: HTMLElement; part: ChatToolInvocationPart },
		context: IChatContentPartRenderContext,
		templateData: IChatListItemTemplate
	): void {
		if (toolInvocation.kind !== 'toolInvocation') {
			return;
		}

		const removeConfirmationWidget = () => {
			const createdPart = getCreatedPart();
			// move the created part out of thinking and into the main template
			if (createdPart?.domNode) {
				const wrapper = createdPart.domNode.parentElement;
				if (wrapper?.classList.contains('chat-thinking-tool-wrapper')) {
					wrapper.remove();
				}
				templateData.value.appendChild(createdPart.domNode);
			} else {
				thinkingPart.removeLazyItem(toolInvocation.toolId);
				const { domNode } = createToolPart();
				templateData.value.appendChild(domNode);
			}
			this.finalizeCurrentThinkingPart(context, templateData);
		};

		const currentState = toolInvocation.state.get();
		if (currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation || currentState.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
			removeConfirmationWidget();
			return;
		}

		const isWorkingState = (type: IChatToolInvocation.StateKind) =>
			type === IChatToolInvocation.StateKind.Streaming || type === IChatToolInvocation.StateKind.Executing;

		if (!isWorkingState(currentState.type)) {
			return;
		}

		let didRemoveConfirmationWidget = false;
		const disposable = autorun(reader => {
			const state = toolInvocation.state.read(reader);
			if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
				if (didRemoveConfirmationWidget) {
					return;
				}
				didRemoveConfirmationWidget = true;
				disposable.dispose();
				removeConfirmationWidget();
			}
		});

		thinkingPart.addDisposable(disposable);
	}

	private renderExtensionsContent(extensionsContent: IChatExtensionsContent, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart | undefined {
		const part = this.instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent);
		return part;
	}

	private renderPullRequestContent(pullRequestContent: IChatPullRequestContent, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart | undefined {
		const part = this.instantiationService.createInstance(ChatPullRequestContentPart, pullRequestContent);
		return part;
	}

	private renderProgressTask(task: IChatTask | IChatTaskSerialized, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart | undefined {
		if (!isResponseVM(context.element)) {
			return;
		}

		const taskPart = this.instantiationService.createInstance(ChatTaskContentPart, task, this._contentReferencesListPool, this.chatContentMarkdownRenderer, context);
		return taskPart;
	}


	private renderConfirmation(context: IChatContentPartRenderContext, confirmation: IChatConfirmation, templateData: IChatListItemTemplate): IChatContentPart {
		const part = this.instantiationService.createInstance(ChatConfirmationContentPart, confirmation, context);
		return part;
	}

	private renderElicitation(context: IChatContentPartRenderContext, elicitation: IChatElicitationRequest | IChatElicitationRequestSerialized, templateData: IChatListItemTemplate): IChatContentPart {
		if (elicitation.kind === 'elicitationSerialized' ? elicitation.isHidden : elicitation.isHidden?.get()) {
			return this.renderNoContent(other => elicitation.kind === other.kind);
		}

		this.finalizeCurrentThinkingPart(context, templateData);

		const part = this.instantiationService.createInstance(ChatElicitationContentPart, elicitation, context);
		return part;
	}

	private renderQuestionCarousel(context: IChatContentPartRenderContext, carousel: IChatQuestionCarousel, templateData: IChatListItemTemplate): IChatContentPart {
		this.finalizeCurrentThinkingPart(context, templateData);

		const widget = isResponseVM(context.element) ? this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource) : undefined;
		const shouldAutoFocus = widget ? widget.getInput() === '' : true;

		const part = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, {
			shouldAutoFocus,
			onSubmit: async (answers) => {
				// Mark the carousel as used and store the answers
				const answersRecord = answers ? Object.fromEntries(answers) : undefined;
				if (answersRecord) {
					carousel.data = answersRecord;
				}
				carousel.isUsed = true;

				// Notify the extension about the carousel answers to resolve the deferred promise
				if (isResponseVM(context.element) && carousel.resolveId) {
					this.chatService.notifyQuestionCarouselAnswer(context.element.requestId, carousel.resolveId, answersRecord);
				}

				// Remove from pending carousels
				this.removeCarouselFromTracking(context, part);
			}
		});

		// If global auto-approve (yolo mode) is enabled, skip with defaults immediately
		if (!carousel.isUsed && this.configService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
			part.skip();
		}

		// Track the carousel for auto-skip when user submits a new message
		if (isResponseVM(context.element) && carousel.allowSkip && !carousel.isUsed) {
			let carousels = this.pendingQuestionCarousels.get(context.element.sessionResource);
			if (!carousels) {
				carousels = new Set();
				this.pendingQuestionCarousels.set(context.element.sessionResource, carousels);
			}
			carousels.add(part);

			// Clean up when the part is disposed
			part.addDisposable({ dispose: () => this.removeCarouselFromTracking(context, part) });
		}

		return part;
	}

	private removeCarouselFromTracking(context: IChatContentPartRenderContext, part: ChatQuestionCarouselPart): void {
		if (isResponseVM(context.element)) {
			const carousels = this.pendingQuestionCarousels.get(context.element.sessionResource);
			if (carousels) {
				carousels.delete(part);
			}
		}
	}

	private renderChangesSummary(content: IChatChangesSummaryPart, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart {
		const part = this.instantiationService.createInstance(ChatCheckpointFileChangesSummaryContentPart, content, context);
		return part;
	}

	private renderAttachments(variables: readonly IChatRequestVariableEntry[], contentReferences: ReadonlyArray<IChatContentReference> | undefined, templateData: IChatListItemTemplate) {
		return this.instantiationService.createInstance(ChatAttachmentsContentPart, {
			variables,
			contentReferences,
			domNode: undefined
		});
	}

	private renderTextEdit(context: IChatContentPartRenderContext, chatTextEdit: IChatTextEditGroup, templateData: IChatListItemTemplate): IChatContentPart {
		const textEditPart = this.instantiationService.createInstance(ChatTextEditContentPart, chatTextEdit, context, this.rendererOptions, this._diffEditorPool, this._currentLayoutWidth.get());
		return textEditPart;
	}

	private renderMarkdown(markdown: IChatMarkdownContent, templateData: IChatListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart {
		const element = context.element;
		const isFinalAnswerPart = isResponseVM(element) && element.isComplete && context.contentIndex === context.content.length - 1;
		if (!this.hasCodeblockUri(markdown) || isFinalAnswerPart) {
			this.finalizeCurrentThinkingPart(context, templateData);
		}
		const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete || !!element.renderData);
		const codeBlockStartIndex = context.codeBlockStartIndex;
		const markdownPart = templateData.instantiationService.createInstance(ChatMarkdownContentPart, markdown, context, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.chatContentMarkdownRenderer, undefined, this._currentLayoutWidth.get(), this.codeBlockModelCollection, {});
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
				markdownPart.addDisposable(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), markdownPart.domNode, localize('requestMarkdownPartTitle', "Click to Edit"), { trapFocus: true }));
			}
			markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.FOCUS, () => {
				this.hoverVisible(templateData.requestHover);
			}));
			markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.BLUR, () => {
				this.hoverHidden(templateData.requestHover);
			}));
		}

		this.handleRenderedCodeblocks(element, markdownPart, codeBlockStartIndex);

		const collapsedToolsMode = this.configService.getValue<CollapsedToolsDisplayMode>('chat.agent.thinking.collapsedTools');
		if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off && !isFinalAnswerPart) {

			// append to thinking part when the codeblock is complete
			const isComplete = this.isCodeblockComplete(markdown, context.element);

			// Check if this markdown should be routed to a subagent content part
			const subAgentInvocationId = extractSubAgentInvocationIdFromText(markdown.content.value);
			if (subAgentInvocationId) {
				const subagentPart = this.getSubagentPart(templateData.renderedParts, subAgentInvocationId);
				if (subagentPart && markdownPart?.domNode && isComplete) {
					subagentPart.appendMarkdownItem(
						() => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
						markdownPart.codeblocksPartId,
						markdown,
						templateData.value
					);
					return subagentPart;
				}
			}

			// create thinking part if it doesn't exist yet
			const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
			if (!lastThinking && markdownPart?.domNode && this.shouldPinPart(markdown, context.element) && collapsedToolsMode === CollapsedToolsDisplayMode.Always && isComplete) {
				const thinkingPart = this.renderThinkingPart({
					kind: 'thinking',
				}, context, templateData);

				if (thinkingPart instanceof ChatThinkingContentPart) {
					// Factory wrapping already-created markdown part
					thinkingPart.appendItem(
						() => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
						markdownPart.codeblocksPartId,
						markdown,
						templateData.value
					);
				}

				return thinkingPart;
			}

			if (this.shouldPinPart(markdown, context.element) && isComplete) {
				if (lastThinking && markdownPart?.domNode) {
					// Factory wrapping already-created markdown part
					lastThinking.appendItem(
						() => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
						markdownPart.codeblocksPartId,
						markdown,
						templateData.value
					);
				}
			} else if (!this.shouldPinPart(markdown, context.element)) {
				this.finalizeCurrentThinkingPart(context, templateData);
			}
		}

		return markdownPart;
	}

	renderThinkingPart(content: IChatThinkingPart, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart {
		// TODO @justschen @karthiknadig: remove this when OSWE moves off commentary channel
		if (!content.id) {
			content.id = Date.now().toString();
		}

		// Determine if this thinking part is already complete based on look-ahead
		// (i.e., there are subsequent parts that won't be pinned to this thinking part)
		const element = isResponseVM(context.element) ? context.element : undefined;
		const streamingCompleted = this.isThinkingLookAheadComplete(context, element);

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
						lastThinkingPart.setupThinkingContainer({ ...content, value: item });
					} else {
						const itemContent = { ...content, value: item };
						const itemPart = templateData.instantiationService.createInstance(ChatThinkingContentPart, itemContent, context, this.chatContentMarkdownRenderer, streamingCompleted);
						lastPart = itemPart;
					}
				}
			}
			return lastPart ?? this.renderNoContent(other => content.kind === other.kind);
			// non-array, handle case where we are currently thinking vs. starting a new thinking part
		} else {
			const lastActiveThinking = this.getLastThinkingPart(templateData.renderedParts);
			if (lastActiveThinking) {
				lastActiveThinking.setupThinkingContainer(content);
				return lastActiveThinking;
			} else {
				const part = templateData.instantiationService.createInstance(ChatThinkingContentPart, content, context, this.chatContentMarkdownRenderer, streamingCompleted);
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
		templateData.checkpointToolbar.context = undefined;
		templateData.checkpointRestoreToolbar.context = undefined;
	}

	private renderMcpServersInteractionRequired(content: IChatMcpServersStarting | IChatMcpServersStartingSerialized, context: IChatContentPartRenderContext, templateData: IChatListItemTemplate): IChatContentPart {
		return this.instantiationService.createInstance(ChatMcpServersInteractionContentPart, content, context);
	}

	disposeTemplate(templateData: IChatListItemTemplate): void {
		this.clearRenderedParts(templateData);
		templateData.templateDisposables.dispose();
	}

	private hoverVisible(requestHover: HTMLElement) {
		requestHover.style.opacity = '1';
	}

	private hoverHidden(requestHover: HTMLElement) {
		requestHover.style.opacity = '0';
	}

}

export class ChatListDelegate extends CachedListVirtualDelegate<ChatTreeItem> {
	constructor(
		private readonly defaultElementHeight: number,
	) {
		super();
	}

	protected estimateHeight(element: ChatTreeItem): number {
		// currentRenderedHeight is not load-bearing here- probably if it's ever set, then the superclass cache will have the height.
		return element.currentRenderedHeight ?? this.defaultElementHeight;
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
