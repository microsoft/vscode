/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { AriaRole } from 'vs/base/browser/ui/aria/aria';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ITreeCompressionDelegate } from 'vs/base/browser/ui/tree/asyncDataTree';
import { ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { IntervalTimer } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { marked } from 'vs/base/common/marked/marked';
import { FileAccess } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { BracketMatchingController } from 'vs/editor/contrib/bracketMatching/browser/bracketMatching';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { ViewportSemanticTokensContribution } from 'vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens';
import { SmartSelectController } from 'vs/editor/contrib/smartSelect/browser/smartSelect';
import { WordHighlighterContribution } from 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchCompressibleAsyncDataTree } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { IChatCodeBlockActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatCodeblockActions';
import { ChatTreeItem, IChatCodeBlockInfo, IChatFileTreeInfo } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatFollowups } from 'vs/workbench/contrib/chat/browser/chatFollowups';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { CONTEXT_REQUEST, CONTEXT_RESPONSE, CONTEXT_RESPONSE_HAS_PROVIDER_ID, CONTEXT_RESPONSE_VOTE } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatReplyFollowup, IChatResponseProgressFileTreeData, IChatService, ISlashCommand, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatResponseMarkdownRenderData, IChatResponseRenderData, IChatResponseViewModel, IChatWelcomeMessageViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IWordCountResult, getNWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { createFileIconThemableTreeContainerScope } from 'vs/workbench/contrib/files/browser/views/explorerView';
import { IFilesConfiguration } from 'vs/workbench/contrib/files/common/files';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { distinct } from 'vs/base/common/arrays';
import { IPlaceholderMarkdownString } from 'vs/workbench/contrib/chat/common/chatModel';

const $ = dom.$;

interface IChatListItemTemplate {
	rowContainer: HTMLElement;
	titleToolbar: MenuWorkbenchToolBar;
	avatar: HTMLElement;
	username: HTMLElement;
	value: HTMLElement;
	contextKeyService: IContextKeyService;
	templateDisposables: IDisposable;
	elementDisposables: DisposableStore;
}

interface IItemHeightChangeParams {
	element: ChatTreeItem;
	height: number;
}

const forceVerboseLayoutTracing = false;

export interface IChatRendererDelegate {
	getListLength(): number;
	getSlashCommands(): ISlashCommand[];
}

export interface IChatListItemRendererOptions {
	readonly renderStyle?: 'default' | 'compact';
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

	private _currentLayoutWidth: number = 0;
	private _isVisible = true;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	constructor(
		private readonly editorOptions: ChatEditorOptions,
		private readonly rendererOptions: IChatListItemRendererOptions,
		private readonly delegate: IChatRendererDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService
	) {
		super();
		this.renderer = this.instantiationService.createInstance(MarkdownRenderer, {});
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, this.editorOptions));
		this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
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

	private progressiveRenderEnabled(): boolean {
		return !this.configService.getValue('interactive.experimental.disableProgressiveRendering');
	}

	private getProgressiveRenderRate(element: IChatResponseViewModel): number {
		const configuredRate = this.configService.getValue('interactive.experimental.progressiveRenderingRate');
		if (typeof configuredRate === 'number') {
			return configuredRate;
		}

		if (element.isComplete) {
			return 60;
		}

		if (element.contentUpdateTimings && element.contentUpdateTimings.impliedWordLoadRate) {
			// This doesn't account for dead time after the last update. When the previous update is the final one and the model is only waiting for followupQuestions, that's good.
			// When there was one quick update and then you are waiting longer for the next one, that's not good since the rate should be decreasing.
			// If it's an issue, we can change this to be based on the total time from now to the beginning.
			const rateBoost = 1.5;
			return element.contentUpdateTimings.impliedWordLoadRate * rateBoost;
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
		this._currentLayoutWidth = width - 40; // TODO Padding
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
		const header = dom.append(rowContainer, $('.header'));
		const user = dom.append(header, $('.user'));
		const avatar = dom.append(user, $('.avatar'));
		const username = dom.append(user, $('h3.username'));
		const value = dom.append(rowContainer, $('.value'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService]));
		const titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, header, MenuId.ChatMessageTitle, {
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


		const template: IChatListItemTemplate = { avatar, username, value, rowContainer, elementDisposables, titleToolbar, templateDisposables, contextKeyService };
		return template;
	}

	renderElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IChatListItemTemplate): void {
		const { element } = node;
		const kind = isRequestVM(element) ? 'request' :
			isResponseVM(element) ? 'response' :
				'welcome';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

		CONTEXT_RESPONSE.bindTo(templateData.contextKeyService).set(isResponseVM(element));
		CONTEXT_REQUEST.bindTo(templateData.contextKeyService).set(isRequestVM(element));
		CONTEXT_RESPONSE_HAS_PROVIDER_ID.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.providerResponseId);
		if (isResponseVM(element)) {
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set(element.vote === InteractiveSessionVoteDirection.Up ? 'up' : element.vote === InteractiveSessionVoteDirection.Down ? 'down' : '');
		} else {
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set('');
		}

		templateData.titleToolbar.context = element;

		templateData.rowContainer.classList.toggle('interactive-request', isRequestVM(element));
		templateData.rowContainer.classList.toggle('interactive-response', isResponseVM(element));
		templateData.rowContainer.classList.toggle('interactive-welcome', isWelcomeVM(element));
		templateData.rowContainer.classList.toggle('filtered-response', !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered));
		templateData.username.textContent = element.username;

		if (element.avatarIconUri) {
			const avatarIcon = dom.$<HTMLImageElement>('img.icon');
			avatarIcon.src = FileAccess.uriToBrowserUri(element.avatarIconUri).toString(true);
			templateData.avatar.replaceChildren(avatarIcon);
		} else {
			const defaultIcon = isRequestVM(element) ? Codicon.account : Codicon.hubot;
			const avatarIcon = dom.$(ThemeIcon.asCSSSelector(defaultIcon));
			templateData.avatar.replaceChildren(avatarIcon);
		}

		// Do a progressive render if
		// - This the last response in the list
		// - And it is not a placeholder response ("Thinking...")
		// - And the response is not complete
		//   - Or, we previously started a progressive rendering of this element (if the element is complete, we will finish progressive rendering with a very fast rate)
		// - And, the feature is not disabled in configuration
		if (isResponseVM(element) && index === this.delegate.getListLength() - 1 && !element.isPlaceholder && (!element.isComplete || element.renderData) && this.progressiveRenderEnabled()) {
			this.traceLayout('renderElement', `start progressive render ${kind}, index=${index}`);
			const progressiveRenderingDisposables = templateData.elementDisposables.add(new DisposableStore());
			const timer = templateData.elementDisposables.add(new IntervalTimer());
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
			timer.cancelAndSet(runProgressiveRender, 50);
			runProgressiveRender(true);
		} else if (isResponseVM(element)) {
			this.basicRenderElement(element.response.value, element, index, templateData);
		} else if (isRequestVM(element)) {
			this.basicRenderElement([new MarkdownString(element.messageText)], element, index, templateData);
		} else {
			this.renderWelcomeMessage(element, templateData);
		}
	}

	private basicRenderElement(value: ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData>, element: ChatTreeItem, index: number, templateData: IChatListItemTemplate) {
		const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete);

		dom.clearNode(templateData.value);
		let fileTreeIndex = 0;
		for (const data of value) {
			const result = 'value' in data
				? this.renderMarkdown(data, element, templateData.elementDisposables, templateData, fillInIncompleteTokens)
				: this.renderTreeData(data, element, templateData.elementDisposables, templateData, fileTreeIndex++);
			templateData.value.appendChild(result.element);
			templateData.elementDisposables.add(result);
		}

		if (isResponseVM(element) && element.errorDetails?.message) {
			const icon = element.errorDetails.responseIsFiltered ? Codicon.info : Codicon.error;
			const errorDetails = dom.append(templateData.value, $('.interactive-response-error-details', undefined, renderIcon(icon)));
			errorDetails.appendChild($('span', undefined, element.errorDetails.message));
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
						action: {
							kind: 'command',
							command: followup
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
			const disposable = this._register(dom.scheduleAtNextAnimationFrame(() => {
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, height: newHeight });
			}));
		}
	}

	private renderWelcomeMessage(element: IChatWelcomeMessageViewModel, templateData: IChatListItemTemplate) {
		dom.clearNode(templateData.value);
		const slashCommands = this.delegate.getSlashCommands();

		for (const item of element.content) {
			if (Array.isArray(item)) {
				templateData.elementDisposables.add(new ChatFollowups(
					templateData.value,
					item,
					undefined,
					followup => this._onDidClickFollowup.fire(followup),
					templateData.contextKeyService));
			} else {
				const result = this.renderMarkdown(item as IMarkdownString, element, templateData.elementDisposables, templateData);
				for (const codeElement of result.element.querySelectorAll('code')) {
					if (codeElement.textContent && slashCommands.find(command => codeElement.textContent === `/${command.command}`)) {
						codeElement.classList.add('interactive-slash-command');
					}
				}
				templateData.value.appendChild(result.element);
				templateData.elementDisposables.add(result);
			}
		}

		const newHeight = templateData.rowContainer.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = this._register(dom.scheduleAtNextAnimationFrame(() => {
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

		let isFullyRendered = false;
		if (element.isCanceled) {
			this.traceLayout('runProgressiveRender', `canceled, index=${index}`);
			element.renderData = undefined;
			this.basicRenderElement(element.response.value, element, index, templateData);
			isFullyRendered = true;
		} else {
			// Figure out what we need to render in addition to what has already been rendered
			const currentResponseData = element.response.value;
			element.renderData ??= { renderedParts: [] };
			const renderedParts = element.renderData.renderedParts;
			const wordCountResults: IWordCountResult[] = [];
			const partsToRender: IChatResponseRenderData['renderedParts'] = [];

			currentResponseData.forEach((part, index) => {
				const renderedPart = renderedParts[index];
				// Is this part completely new?
				if (!renderedPart) {
					if (isInteractiveProgressTreeData(part)) {
						partsToRender[index] = part;
					} else {
						const wordCountResult = this.getDataForProgressiveRender(element, part, { renderedWordCount: 0, lastRenderTime: 0 });
						if (wordCountResult !== undefined) {
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
				else if (isInteractiveProgressTreeData(part) && !isInteractiveProgressTreeData(renderedPart)) {
					partsToRender[index] = part;
				}

				// Did this part's content change?
				else if (!isInteractiveProgressTreeData(part) && !isInteractiveProgressTreeData(renderedPart) && !renderedPart.isFullyRendered) {
					const wordCountResult = this.getDataForProgressiveRender(element, part, renderedPart);
					if (wordCountResult !== undefined) {
						partsToRender[index] = {
							renderedWordCount: wordCountResult.actualWordCount,
							lastRenderTime: Date.now(),
							isFullyRendered: wordCountResult.isFullString,
						};
						wordCountResults[index] = wordCountResult;
					}
				}
			});

			isFullyRendered = partsToRender.length === 0;

			if (isFullyRendered && element.isComplete) {
				// Response is done and content is rendered, so do a normal render
				this.traceLayout('runProgressiveRender', `end progressive render, index=${index} and clearing renderData, response is complete, index=${index}`);
				element.renderData = undefined;
				disposables.clear();
				this.basicRenderElement(element.response.value, element, index, templateData);
			} else if (!isFullyRendered) {
				let hasRenderedOneMarkdownBlock = false;
				partsToRender.forEach((partToRender, index) => {
					if (!partToRender) {
						return;
					}

					let result;
					if (isInteractiveProgressTreeData(partToRender)) {
						result = this.renderTreeData(partToRender, element, disposables, templateData, index);
					}

					// Avoid doing progressive rendering for multiple markdown parts simultaneously
					else if (!hasRenderedOneMarkdownBlock) {
						const { value } = wordCountResults[index];
						const isPlaceholder = isPlaceholderMarkdown(currentResponseData[index]);
						result = isPlaceholder
							? this.renderPlaceholder(new MarkdownString(value), templateData)
							: this.renderMarkdown(new MarkdownString(value), element, disposables, templateData, true);
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

	private renderTreeData(data: IChatResponseProgressFileTreeData, element: ChatTreeItem, disposables: DisposableStore, templateData: IChatListItemTemplate, treeDataIndex: number): { element: HTMLElement; dispose: () => void } {
		const ref = this._treePool.get();
		const tree = ref.object;

		const treeDisposables = new DisposableStore();
		treeDisposables.add(tree.onDidOpen((e) => {
			if (e.element && !('children' in e.element)) {
				this.openerService.open(e.element.uri);
			}
		}));
		treeDisposables.add(tree.onDidChangeCollapseState(() => {
			this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
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
			disposables.add(toDisposable(() => this.fileTreesByResponseId.set(element.id, fileTrees.filter(v => v.treeDataId !== data.uri.toString()))));
		}

		return {
			element: tree.getHTMLElement().parentElement!,
			dispose: () => {
				treeDisposables.dispose();
				ref.dispose();
			}
		};
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

	private renderMarkdown(markdown: IMarkdownString, element: ChatTreeItem, disposables: DisposableStore, templateData: IChatListItemTemplate, fillInIncompleteTokens = false): IMarkdownRenderResult {
		const disposablesList: IDisposable[] = [];
		let codeBlockIndex = 0;

		// TODO if the slash commands stay completely dynamic, this isn't quite right
		const slashCommands = this.delegate.getSlashCommands();
		const usedSlashCommand = slashCommands.find(s => markdown.value.startsWith(`/${s.command} `));
		const toRender = usedSlashCommand ? markdown.value.slice(usedSlashCommand.command.length + 2) : markdown.value;
		markdown = new MarkdownString(toRender, {
			isTrusted: {
				// Disable all other config options except isTrusted
				enabledCommands: typeof markdown.isTrusted === 'object' ? markdown.isTrusted?.enabledCommands : [] ?? []
			}
		});

		const codeblocks: IChatCodeBlockInfo[] = [];
		const result = this.renderer.render(markdown, {
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, text) => {
				const data = { languageId, text, codeBlockIndex: codeBlockIndex++, element, parentContextKeyService: templateData.contextKeyService };
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
				disposablesList.push(ref);
				return ref.object.element;
			}
		});

		if (isResponseVM(element)) {
			this.codeBlocksByResponseId.set(element.id, codeblocks);
			disposables.add(toDisposable(() => this.codeBlocksByResponseId.delete(element.id)));
		}

		if (usedSlashCommand) {
			const slashCommandElement = $('span.interactive-slash-command', { title: usedSlashCommand.detail }, `/${usedSlashCommand.command} `);
			if (result.element.firstChild?.nodeName.toLowerCase() === 'p') {
				result.element.firstChild.insertBefore(slashCommandElement, result.element.firstChild.firstChild);
			} else {
				result.element.insertBefore($('p', undefined, slashCommandElement), result.element.firstChild);
			}
		}

		disposablesList.reverse().forEach(d => disposables.add(d));
		return result;
	}

	private renderCodeBlock(data: IChatResultCodeBlockData, disposables: DisposableStore): IDisposableReference<IChatResultCodeBlockPart> {
		const ref = this._editorPool.get();
		const editorInfo = ref.object;
		editorInfo.render(data, this._currentLayoutWidth);

		return ref;
	}

	private getDataForProgressiveRender(element: IChatResponseViewModel, data: IMarkdownString, renderData: Pick<IChatResponseMarkdownRenderData, 'lastRenderTime' | 'renderedWordCount'>): IWordCountResult | undefined {
		const rate = this.getProgressiveRenderRate(element);
		const numWordsToRender = renderData.lastRenderTime === 0 ?
			1 :
			renderData.renderedWordCount +
			// Additional words to render beyond what's already rendered
			Math.floor((Date.now() - renderData.lastRenderTime) / 1000 * rate);

		if (numWordsToRender === renderData.renderedWordCount) {
			return undefined;
		}

		return getNWords(data.value, numWordsToRender);
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

interface IChatResultCodeBlockData {
	text: string;
	languageId: string;
	codeBlockIndex: number;
	element: ChatTreeItem;
	parentContextKeyService: IContextKeyService;
}

interface IChatResultCodeBlockPart {
	readonly onDidChangeContentHeight: Event<number>;
	readonly element: HTMLElement;
	readonly textModel: ITextModel;
	layout(width: number): void;
	render(data: IChatResultCodeBlockData, width: number): void;
	focus(): void;
	dispose(): void;
}

const defaultCodeblockPadding = 10;

class CodeBlockPart extends Disposable implements IChatResultCodeBlockPart {
	private readonly _onDidChangeContentHeight = this._register(new Emitter<number>());
	public readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	private readonly editor: CodeEditorWidget;
	private readonly toolbar: MenuWorkbenchToolBar;
	private readonly contextKeyService: IContextKeyService;

	public readonly textModel: ITextModel;
	public readonly element: HTMLElement;

	private currentScrollWidth = 0;

	constructor(
		private readonly options: ChatEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();
		this.element = $('.interactive-result-editor-wrapper');
		this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
		this.toolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.ChatCodeBlock, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));

		this._configureForScreenReader();
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
				this._configureForScreenReader();
			}
		}));
		const editorElement = dom.append(this.element, $('.interactive-result-editor'));
		this.editor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, editorElement, {
			...getSimpleEditorOptions(this.configurationService),
			readOnly: true,
			lineNumbers: 'off',
			selectOnLineNumbers: true,
			scrollBeyondLastLine: false,
			lineDecorationsWidth: 8,
			dragAndDrop: false,
			padding: { top: defaultCodeblockPadding, bottom: defaultCodeblockPadding },
			mouseWheelZoom: false,
			scrollbar: {
				alwaysConsumeMouseWheel: false
			},
			ariaLabel: localize('chat.codeBlockHelp', 'Code block'),
			...this.getEditorOptionsFromConfig()
		}, {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				MenuPreventer.ID,
				SelectionClipboardContributionID,
				ContextMenuController.ID,

				WordHighlighterContribution.ID,
				ViewportSemanticTokensContribution.ID,
				BracketMatchingController.ID,
				SmartSelectController.ID,
			])
		}));

		this._register(this.options.onDidChange(() => {
			this.editor.updateOptions(this.getEditorOptionsFromConfig());
		}));

		this._register(this.editor.onDidScrollChange(e => {
			this.currentScrollWidth = e.scrollWidth;
		}));
		this._register(this.editor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this._onDidChangeContentHeight.fire(e.contentHeight);
			}
		}));
		this._register(this.editor.onDidBlurEditorWidget(() => {
			this.element.classList.remove('focused');
			WordHighlighterContribution.get(this.editor)?.stopHighlighting();
		}));
		this._register(this.editor.onDidFocusEditorWidget(() => {
			this.element.classList.add('focused');
			WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
		}));

		this.textModel = this._register(this.modelService.createModel('', null, undefined));
		this.editor.setModel(this.textModel);
	}

	focus(): void {
		this.editor.focus();
	}

	private updatePaddingForLayout() {
		// scrollWidth = "the width of the content that needs to be scrolled"
		// contentWidth = "the width of the area where content is displayed"
		const horizontalScrollbarVisible = this.currentScrollWidth > this.editor.getLayoutInfo().contentWidth;
		const scrollbarHeight = this.editor.getLayoutInfo().horizontalScrollbarHeight;
		const bottomPadding = horizontalScrollbarVisible ?
			Math.max(defaultCodeblockPadding - scrollbarHeight, 2) :
			defaultCodeblockPadding;
		this.editor.updateOptions({ padding: { top: defaultCodeblockPadding, bottom: bottomPadding } });
	}

	private _configureForScreenReader(): void {
		const toolbarElt = this.toolbar.getElement();
		if (this.accessibilityService.isScreenReaderOptimized()) {
			toolbarElt.style.display = 'block';
			toolbarElt.ariaLabel = this.configurationService.getValue(AccessibilityVerbositySettingId.Chat) ? localize('chat.codeBlock.toolbarVerbose', 'Toolbar for code block which can be reached via tab') : localize('chat.codeBlock.toolbar', 'Code block toolbar');
		} else {
			toolbarElt.style.display = '';
		}

	}

	private getEditorOptionsFromConfig(): IEditorOptions {
		return {
			wordWrap: this.options.configuration.resultEditor.wordWrap,
			fontLigatures: this.options.configuration.resultEditor.fontLigatures,
			bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
			fontFamily: this.options.configuration.resultEditor.fontFamily === 'default' ?
				EDITOR_FONT_DEFAULTS.fontFamily :
				this.options.configuration.resultEditor.fontFamily,
			fontSize: this.options.configuration.resultEditor.fontSize,
			fontWeight: this.options.configuration.resultEditor.fontWeight,
			lineHeight: this.options.configuration.resultEditor.lineHeight,
		};
	}

	layout(width: number): void {
		const realContentHeight = this.editor.getContentHeight();
		const editorBorder = 2;
		this.editor.layout({ width: width - editorBorder, height: realContentHeight });
		this.updatePaddingForLayout();
	}

	render(data: IChatResultCodeBlockData, width: number): void {
		this.contextKeyService.updateParent(data.parentContextKeyService);

		if (this.options.configuration.resultEditor.wordWrap === 'on') {
			// Intialize the editor with the new proper width so that getContentHeight
			// will be computed correctly in the next call to layout()
			this.layout(width);
		}

		const text = this.fixCodeText(data.text, data.languageId);
		this.setText(text);

		const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(data.languageId) ?? undefined;
		this.setLanguage(vscodeLanguageId);

		this.layout(width);
		this.editor.updateOptions({ ariaLabel: localize('chat.codeBlockLabel', "Code block {0}", data.codeBlockIndex + 1) });
		this.toolbar.context = <IChatCodeBlockActionContext>{
			code: data.text,
			codeBlockIndex: data.codeBlockIndex,
			element: data.element,
			languageId: vscodeLanguageId
		};
	}

	private fixCodeText(text: string, languageId: string): string {
		if (languageId === 'php') {
			if (!text.trim().startsWith('<')) {
				return `<?php\n${text}\n?>`;
			}
		}

		return text;
	}

	private setText(newText: string): void {
		const currentText = this.textModel.getLinesContent().join('\n');
		if (newText === currentText) {
			return;
		}

		if (newText.startsWith(currentText)) {
			const text = newText.slice(currentText.length);
			const lastLine = this.textModel.getLineCount();
			const lastCol = this.textModel.getLineMaxColumn(lastLine);
			this.textModel.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol), text }]);
		} else {
			// console.log(`Failed to optimize setText`);
			this.textModel.setValue(newText);
		}
	}

	private setLanguage(vscodeLanguageId: string | undefined): void {
		this.textModel.setLanguage(vscodeLanguageId ?? PLAINTEXT_LANGUAGE_ID);
	}
}

interface IDisposableReference<T> extends IDisposable {
	object: T;
	isStale: () => boolean;
}

class EditorPool extends Disposable {
	private _pool: ResourcePool<IChatResultCodeBlockPart>;

	public get inUse(): ReadonlySet<IChatResultCodeBlockPart> {
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

	private editorFactory(): IChatResultCodeBlockPart {
		return this.instantiationService.createInstance(CodeBlockPart, this.options);
	}

	get(): IDisposableReference<IChatResultCodeBlockPart> {
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

// TODO does something in lifecycle.ts cover this?

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
		if (!element.children.length) {
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

function isPlaceholderMarkdown(item: IPlaceholderMarkdownString | IMarkdownString | IChatResponseProgressFileTreeData): item is IPlaceholderMarkdownString {
	return 'isPlaceholder' in item;
}
