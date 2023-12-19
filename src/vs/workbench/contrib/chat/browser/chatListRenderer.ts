/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { AriaRole } from 'vs/base/browser/ui/aria/aria';
import { Button } from 'vs/base/browser/ui/button/button';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ITreeCompressionDelegate } from 'vs/base/browser/ui/tree/asyncDataTree';
import { ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { distinct } from 'vs/base/common/arrays';
import { disposableTimeout } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { marked } from 'vs/base/common/marked/marked';
import { FileAccess } from 'vs/base/common/network';
import { clamp } from 'vs/base/common/numbers';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { localize } from 'vs/nls';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { FileKind, FileType } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchCompressibleAsyncDataTree, WorkbenchList } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { ChatTreeItem, IChatCodeBlockInfo, IChatFileTreeInfo } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatFollowups } from 'vs/workbench/contrib/chat/browser/chatFollowups';
import { annotateSpecialMarkdownContent, convertParsedRequestToMarkdown, extractVulnerabilitiesFromText, walkTreeAndAnnotateReferenceLinks } from 'vs/workbench/contrib/chat/browser/chatMarkdownDecorationsRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { CodeBlockPart, ICodeBlockData, ICodeBlockPart } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { IChatAgentMetadata } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING, CONTEXT_REQUEST, CONTEXT_RESPONSE, CONTEXT_RESPONSE_FILTERED, CONTEXT_RESPONSE_VOTE } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatProgressRenderableResponseContent } from 'vs/workbench/contrib/chat/common/chatModel';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatContentReference, IChatReplyFollowup, IChatResponseProgressFileTreeData, IChatService, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatResponseMarkdownRenderData, IChatResponseRenderData, IChatResponseViewModel, IChatWelcomeMessageViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IWordCountResult, getNWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { createFileIconThemableTreeContainerScope } from 'vs/workbench/contrib/files/browser/views/explorerView';
import { IFilesConfiguration } from 'vs/workbench/contrib/files/common/files';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const $ = dom.$;

interface IChatListItemTemplate {
	readonly rowContainer: HTMLElement;
	readonly titleToolbar?: MenuWorkbenchToolBar;
	readonly avatarContainer: HTMLElement;
	readonly agentAvatarContainer: HTMLElement;
	readonly username: HTMLElement;
	readonly detail: HTMLElement;
	readonly progressSteps: HTMLElement;
	readonly value: HTMLElement;
	readonly referencesListContainer: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
}

interface IItemHeightChangeParams {
	element: ChatTreeItem;
	height: number;
}

const forceVerboseLayoutTracing = false;

export interface IChatRendererDelegate {
	getListLength(): number;
}

export interface IChatListItemRendererOptions {
	readonly renderStyle?: 'default' | 'compact';
	readonly noHeader?: boolean;
	readonly noPadding?: boolean;
}

export class ChatListItemRenderer extends Disposable implements ITreeRenderer<ChatTreeItem, FuzzyScore, IChatListItemTemplate> {
	static readonly ID = 'item';

	private readonly codeBlocksByResponseId = new Map<string, IChatCodeBlockInfo[]>();
	private readonly codeBlocksByEditorUri = new ResourceMap<IChatCodeBlockInfo>();

	private readonly fileTreesByResponseId = new Map<string, IChatFileTreeInfo[]>();
	private readonly focusedFileTreesByResponseId = new Map<string, number>();

	private readonly renderer: MarkdownRenderer;

	protected readonly _onDidClickFollowup = this._register(new Emitter<IChatReplyFollowup>());
	readonly onDidClickFollowup: Event<IChatReplyFollowup> = this._onDidClickFollowup.event;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	private readonly _editorPool: EditorPool;
	private readonly _treePool: TreePool;
	private readonly _contentReferencesListPool: ContentReferencesListPool;

	private _currentLayoutWidth: number = 0;
	private _isVisible = true;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	private _usedReferencesEnabled = false;

	constructor(
		private readonly editorOptions: ChatEditorOptions,
		private readonly rendererOptions: IChatListItemRendererOptions,
		private readonly delegate: IChatRendererDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IProductService productService: IProductService,
		@IThemeService private readonly themeService: IThemeService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
		this.renderer = this.instantiationService.createInstance(MarkdownRenderer, {});
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, this.editorOptions));
		this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
		this._contentReferencesListPool = this._register(this.instantiationService.createInstance(ContentReferencesListPool, this._onDidChangeVisibility.event));

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
		this._editorPool.inUse.forEach(editor => {
			editor.layout(this._currentLayoutWidth);
		});
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
		const progressSteps = dom.append(rowContainer, $('.progress-steps'));
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
				actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
					if (action instanceof MenuItemAction && (action.item.id === 'workbench.action.chat.voteDown' || action.item.id === 'workbench.action.chat.voteUp')) {
						return scopedInstantiationService.createInstance(ChatVoteButton, action, options as IMenuEntryActionViewItemOptions);
					}

					return undefined;
				}
			}));
		}
		const template: IChatListItemTemplate = { avatarContainer, agentAvatarContainer, username, detail, progressSteps, referencesListContainer, value, rowContainer, elementDisposables, titleToolbar, templateDisposables, contextKeyService };
		return template;
	}

	renderElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IChatListItemTemplate): void {
		this.renderChatTreeItem(node.element, index, templateData);
	}

	renderChatTreeItem(element: ChatTreeItem, index: number, templateData: IChatListItemTemplate): void {
		const kind = isRequestVM(element) ? 'request' :
			isResponseVM(element) ? 'response' :
				'welcome';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

		CONTEXT_RESPONSE.bindTo(templateData.contextKeyService).set(isResponseVM(element));
		CONTEXT_REQUEST.bindTo(templateData.contextKeyService).set(isRequestVM(element));
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
		dom.clearNode(templateData.progressSteps);
		if (isResponseVM(element)) {
			this.renderDetail(element, templateData);
			this.renderProgressSteps(element, templateData);
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
			const markdown = 'kind' in element.message ?
				element.message.message :
				convertParsedRequestToMarkdown(element.message);
			this.basicRenderElement([{ content: new MarkdownString(markdown), kind: 'markdownContent' }], element, index, templateData);
		} else {
			this.renderWelcomeMessage(element, templateData);
		}
	}

	private renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {
		let progressMsg: string = '';
		if (element.agent && !element.agent.metadata.isDefault) {
			let usingMsg = chatAgentLeader + element.agent.id;
			if (element.slashCommand) {
				usingMsg += ` ${chatSubcommandLeader}${element.slashCommand.name}`;
			}

			if (element.isComplete) {
				progressMsg = localize('usedAgent', "used {0}", usingMsg);
			} else {
				progressMsg = localize('usingAgent', "using {0}", usingMsg);
			}
		} else if (!element.isComplete) {
			progressMsg = localize('thinking', "Thinking");
		}

		templateData.detail.textContent = progressMsg;
		if (element.agent) {
			templateData.detail.title = progressMsg + (element.slashCommand?.description ? `\n${element.slashCommand.description}` : '');
		} else {
			templateData.detail.title = '';
		}
	}

	private renderProgressSteps(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {
		if (element.response.value.length || element.isComplete) {
			return;
		}

		element.progressMessages.forEach((msg, index) => {
			const last = index === element.progressMessages.length - 1;
			const icon = last ? ThemeIcon.modify(Codicon.sync, 'spin') : Codicon.check;
			const step = dom.$('.progress-step', undefined, renderIcon(icon), dom.$('span.progress-step-message', undefined, msg.content));
			templateData.progressSteps.appendChild(step);
		});
	}

	private renderAvatar(element: ChatTreeItem, templateData: IChatListItemTemplate): void {
		if (element.avatarIconUri) {
			const avatarImgIcon = dom.$<HTMLImageElement>('img.icon');
			avatarImgIcon.src = FileAccess.uriToBrowserUri(element.avatarIconUri).toString(true);
			templateData.avatarContainer.replaceChildren(dom.$('.avatar', undefined, avatarImgIcon));
		} else {
			const defaultIcon = isRequestVM(element) ? Codicon.account : Codicon.copilot;
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(defaultIcon));
			templateData.avatarContainer.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
		}

		if (isResponseVM(element) && element.agent && !element.agent.metadata.isDefault) {
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
		for (const data of value) {
			const result = data.kind === 'treeData'
				? this.renderTreeData(data.treeData, element, templateData, fileTreeIndex++)
				: data.kind === 'markdownContent'
					? this.renderMarkdown(data.content, element, templateData, fillInIncompleteTokens)
					: this.renderPlaceholder(new MarkdownString(data.content), templateData);
			templateData.value.appendChild(result.element);
			templateData.elementDisposables.add(result);
		}

		if (isResponseVM(element) && element.errorDetails?.message) {
			const icon = element.errorDetails.responseIsFiltered ? Codicon.info : Codicon.error;
			const errorDetails = dom.append(templateData.value, $('.interactive-response-error-details', undefined, renderIcon(icon)));
			const renderedError = templateData.elementDisposables.add(this.renderer.render(new MarkdownString(element.errorDetails.message)));
			errorDetails.appendChild($('span', undefined, renderedError.element));
		}

		if (isResponseVM(element) && element.commandFollowups?.length) {
			const followupsContainer = dom.append(templateData.value, $('.interactive-response-followups'));
			templateData.elementDisposables.add(new ChatFollowups(
				followupsContainer,
				element.commandFollowups,
				defaultButtonStyles,
				followup => {
					this.chatService.notifyUserAction({
						providerId: element.providerId,
						agentId: element.agent?.id,
						sessionId: element.sessionId,
						requestId: element.requestId,
						action: {
							kind: 'command',
							command: followup,
						}
					});
					return this.commandService.executeCommand(followup.commandId, ...(followup.args ?? []));
				},
				templateData.contextKeyService));
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

		for (const item of element.content) {
			if (Array.isArray(item)) {
				templateData.elementDisposables.add(new ChatFollowups(
					templateData.value,
					item,
					undefined,
					followup => this._onDidClickFollowup.fire(followup),
					templateData.contextKeyService));
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

		disposables.clear();

		const annotatedResult = annotateSpecialMarkdownContent(element.response.value);
		const renderableResponse = annotatedResult;
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
			const partsToRender: IChatResponseRenderData['renderedParts'] = [];

			let somePartIsNotFullyRendered = false;
			renderableResponse.forEach((part, index) => {
				const renderedPart = renderedParts[index];
				// Is this part completely new?
				if (!renderedPart) {
					if (part.kind === 'treeData') {
						partsToRender[index] = part.treeData;
					} else {
						const wordCountResult = this.getDataForProgressiveRender(element, contentToMarkdown(part.content), { renderedWordCount: 0, lastRenderTime: 0 });
						if (wordCountResult !== undefined) {
							this.traceLayout('doNextProgressiveRender', `Rendering new part ${index}, wordCountResult=${wordCountResult.actualWordCount}, rate=${wordCountResult.rate}`);
							partsToRender[index] = {
								renderedWordCount: wordCountResult.actualWordCount,
								lastRenderTime: Date.now(),
								isFullyRendered: wordCountResult.isFullString,
							};
							wordCountResults[index] = wordCountResult;
						}
					}
				}

				// Did this part go from being a placeholder string to resolved tree data?
				else if (part.kind === 'treeData' && !isInteractiveProgressTreeData(renderedPart)) {
					partsToRender[index] = part.treeData;
				}

				// Did this part's content change?
				else if (part.kind !== 'treeData' && !isInteractiveProgressTreeData(renderedPart)) {
					const wordCountResult = this.getDataForProgressiveRender(element, contentToMarkdown(part.content), renderedPart);
					// Check if there are any new words to render
					if (wordCountResult !== undefined && renderedPart.renderedWordCount !== wordCountResult?.actualWordCount) {
						this.traceLayout('doNextProgressiveRender', `Rendering changed part ${index}, wordCountResult=${wordCountResult.actualWordCount}, rate=${wordCountResult.rate}`);
						partsToRender[index] = {
							renderedWordCount: wordCountResult.actualWordCount,
							lastRenderTime: Date.now(),
							isFullyRendered: wordCountResult.isFullString,
						};
						wordCountResults[index] = wordCountResult;
					} else if (!renderedPart.isFullyRendered && !wordCountResult) {
						// This part is not fully rendered, but not enough time has passed to render more content
						somePartIsNotFullyRendered = true;
					}
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
				this.renderContentReferencesIfNeeded(element, templateData, disposables);
				let hasRenderedOneMarkdownBlock = false;
				partsToRender.forEach((partToRender, index) => {
					if (!partToRender) {
						return;
					}

					let result;
					if (isInteractiveProgressTreeData(partToRender)) {
						result = this.renderTreeData(partToRender, element, templateData, index);
					}

					// Avoid doing progressive rendering for multiple markdown parts simultaneously
					else if (!hasRenderedOneMarkdownBlock) {
						const { value } = wordCountResults[index];
						result = renderableResponse[index].kind === 'asyncContent'
							? this.renderPlaceholder(new MarkdownString(value), templateData)
							: this.renderMarkdown(new MarkdownString(value), element, templateData, true);
						hasRenderedOneMarkdownBlock = true;
					}

					if (!result) {
						return;
					}

					// Doing the progressive render
					renderedParts[index] = partToRender;
					const existingElement = templateData.value.children[index];
					if (existingElement) {
						templateData.value.replaceChild(result.element, existingElement);
					} else {
						templateData.value.appendChild(result.element);
					}
					disposables.add(result);
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

		const collapseButton = new Button(buttonElement, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		});
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
				this.editorService.openEditor({
					resource: 'uri' in e.element.reference ? e.element.reference.uri : e.element.reference,
					options: {
						...e.editorOptions,
						...{
							selection: 'range' in e.element.reference ? e.element.reference.range : undefined
						}
					}
				});
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

	private renderPlaceholder(markdown: IMarkdownString, templateData: IChatListItemTemplate): IMarkdownRenderResult {
		const codicon = $('.interactive-response-codicon-details', undefined, renderIcon({ id: 'sync~spin' }));
		codicon.classList.add('interactive-response-placeholder-codicon');
		const result = dom.append(templateData.value, codicon);

		const content = this.renderer.render(markdown);
		content.element.className = 'interactive-response-placeholder-content';
		result.appendChild(content.element);

		return { element: result, dispose: () => content.dispose() };
	}

	private renderMarkdown(markdown: IMarkdownString, element: ChatTreeItem, templateData: IChatListItemTemplate, fillInIncompleteTokens = false): IMarkdownRenderResult {
		const disposables = new DisposableStore();
		let codeBlockIndex = 0;

		markdown = new MarkdownString(markdown.value, {
			isTrusted: {
				// Disable all other config options except isTrusted
				enabledCommands: typeof markdown.isTrusted === 'object' ? markdown.isTrusted?.enabledCommands : [] ?? []
			}
		});

		// We release editors in order so that it's more likely that the same editor will be assigned if this element is re-rendered right away, like it often is during progressive rendering
		const orderedDisposablesList: IDisposable[] = [];
		const codeblocks: IChatCodeBlockInfo[] = [];
		const result = this.renderer.render(markdown, {
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, text) => {
				const vulns = extractVulnerabilitiesFromText(text);

				const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
				const data = { languageId, text: vulns.newText, codeBlockIndex: codeBlockIndex++, element, hideToolbar, parentContextKeyService: templateData.contextKeyService, vulns: vulns.vulnerabilities };
				const ref = this.renderCodeBlock(data, disposables);

				// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
				// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
				disposables.add(ref.object.onDidChangeContentHeight(() => {
					ref.object.layout(this._currentLayoutWidth);
					this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
				}));

				if (isResponseVM(element)) {
					const info: IChatCodeBlockInfo = {
						codeBlockIndex: data.codeBlockIndex,
						element,
						focus() {
							ref.object.focus();
						}
					};
					codeblocks.push(info);
					this.codeBlocksByEditorUri.set(ref.object.textModel.uri, info);
					disposables.add(toDisposable(() => this.codeBlocksByEditorUri.delete(ref.object.textModel.uri)));
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

		walkTreeAndAnnotateReferenceLinks(result.element, this.keybindingService);

		orderedDisposablesList.reverse().forEach(d => disposables.add(d));
		return {
			element: result.element,
			dispose() {
				result.dispose();
				disposables.dispose();
			}
		};
	}

	private renderCodeBlock(data: ICodeBlockData, disposables: DisposableStore): IDisposableReference<ICodeBlockPart> {
		const ref = this._editorPool.get();
		const editorInfo = ref.object;
		editorInfo.render(data, this._currentLayoutWidth);

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
		const height = ('currentRenderedHeight' in element ? element.currentRenderedHeight : undefined) ?? 200;
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

export class ChatAccessibilityProvider implements IListAccessibilityProvider<ChatTreeItem> {

	constructor(
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService
	) {

	}
	getWidgetRole(): AriaRole {
		return 'list';
	}

	getRole(element: ChatTreeItem): AriaRole | undefined {
		return 'listitem';
	}

	getWidgetAriaLabel(): string {
		return localize('chat', "Chat");
	}

	getAriaLabel(element: ChatTreeItem): string {
		if (isRequestVM(element)) {
			return element.messageText;
		}

		if (isResponseVM(element)) {
			return this._getLabelWithCodeBlockCount(element);
		}

		if (isWelcomeVM(element)) {
			return element.content.map(c => 'value' in c ? c.value : c.map(followup => followup.message).join('\n')).join('\n');
		}

		return '';
	}

	private _getLabelWithCodeBlockCount(element: IChatResponseViewModel): string {
		const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.Chat);
		let label: string = '';
		let commandFollowUpInfo;
		const commandFollowupLength = element.commandFollowups?.length ?? 0;
		switch (commandFollowupLength) {
			case 0:
				break;
			case 1:
				commandFollowUpInfo = localize('commandFollowUpInfo', "Command: {0}", element.commandFollowups![0].title);
				break;
			default:
				commandFollowUpInfo = localize('commandFollowUpInfoMany', "Commands: {0}", element.commandFollowups!.map(followup => followup.title).join(', '));
		}
		const fileTreeCount = element.response.value.filter((v) => !('value' in v))?.length ?? 0;
		let fileTreeCountHint = '';
		switch (fileTreeCount) {
			case 0:
				break;
			case 1:
				fileTreeCountHint = localize('singleFileTreeHint', "1 file tree");
				break;
			default:
				fileTreeCountHint = localize('multiFileTreeHint', "{0} file trees", fileTreeCount);
				break;
		}
		const codeBlockCount = marked.lexer(element.response.asString()).filter(token => token.type === 'code')?.length ?? 0;
		switch (codeBlockCount) {
			case 0:
				label = accessibleViewHint ? localize('noCodeBlocksHint', "{0} {1} {2}", fileTreeCountHint, element.response.asString(), accessibleViewHint) : localize('noCodeBlocks', "{0} {1}", fileTreeCountHint, element.response.asString());
				break;
			case 1:
				label = accessibleViewHint ? localize('singleCodeBlockHint', "{0} 1 code block: {1} {2}", fileTreeCountHint, element.response.asString(), accessibleViewHint) : localize('singleCodeBlock', "{0} 1 code block: {1}", fileTreeCountHint, element.response.asString());
				break;
			default:
				label = accessibleViewHint ? localize('multiCodeBlockHint', "{0} {1} code blocks: {2}", fileTreeCountHint, codeBlockCount, element.response.asString(), accessibleViewHint) : localize('multiCodeBlock', "{0} {1} code blocks", fileTreeCountHint, codeBlockCount, element.response.asString());
				break;
		}
		return commandFollowUpInfo ? commandFollowUpInfo + ', ' + label : label;
	}
}


interface IDisposableReference<T> extends IDisposable {
	object: T;
	isStale: () => boolean;
}

class EditorPool extends Disposable {
	private _pool: ResourcePool<ICodeBlockPart>;

	public get inUse(): ReadonlySet<ICodeBlockPart> {
		return this._pool.inUse;
	}

	constructor(
		private readonly options: ChatEditorOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.editorFactory()));

		// TODO listen to changes on options
	}

	private editorFactory(): ICodeBlockPart {
		return this.instantiationService.createInstance(CodeBlockPart, this.options, MenuId.ChatCodeBlock);
	}

	get(): IDisposableReference<ICodeBlockPart> {
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
		const resourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility });

		const container = $('.interactive-response-progress-tree');
		createFileIconThemableTreeContainerScope(container, this.themeService);

		const tree = <WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData>>this.instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree,
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
		const resourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility });

		const container = $('.chat-used-context-list');
		createFileIconThemableTreeContainerScope(container, this.themeService);

		const list = <WorkbenchList<IChatContentReference>>this.instantiationService.createInstance(
			WorkbenchList,
			'ChatListRenderer',
			container,
			new ContentReferencesListDelegate(),
			[new ContentReferencesListRenderer(resourceLabels)],
			{
				alwaysConsumeMouseWheel: false,
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

	constructor(private labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): IChatContentReferenceListTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
		return { templateDisposables, label };
	}

	renderElement(element: IChatContentReference, index: number, templateData: IChatContentReferenceListTemplate, height: number | undefined): void {
		templateData.label.element.style.display = 'flex';
		templateData.label.setFile('uri' in element.reference ? element.reference.uri : element.reference, {
			fileKind: FileKind.FILE,
			// Should not have this live-updating data on a historical reference
			fileDecorations: { badges: false, colors: false },
			range: 'range' in element.reference ? element.reference.range : undefined
		});
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

function isInteractiveProgressTreeData(item: IChatResponseProgressFileTreeData | IChatResponseMarkdownRenderData | IMarkdownString): item is IChatResponseProgressFileTreeData {
	return 'label' in item;
}

function contentToMarkdown(str: string | IMarkdownString): IMarkdownString {
	return typeof str === 'string' ? { value: str } : str;
}
