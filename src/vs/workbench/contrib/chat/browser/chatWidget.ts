/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ITreeContextMenuEvent, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { disposableTimeout, timeout } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { matchesScheme, Schemas } from 'vs/base/common/network';
import { extUri, isEqual } from 'vs/base/common/resources';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/chat';
import 'vs/css!./media/chatAgentHover';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ChatTreeItem, IChatAccessibilityService, IChatCodeBlockInfo, IChatFileTreeInfo, IChatWidget, IChatWidgetService, IChatWidgetViewContext, IChatWidgetViewOptions } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAccessibilityProvider } from 'vs/workbench/contrib/chat/browser/chatAccessibilityProvider';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { ChatListDelegate, ChatListItemRenderer, IChatRendererDelegate } from 'vs/workbench/contrib/chat/browser/chatListRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_INPUT_HAS_AGENT, CONTEXT_CHAT_LOCATION, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_QUICK_CHAT, CONTEXT_RESPONSE_FILTERED } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ChatModelInitState, IChatModel, IChatRequestVariableEntry, IChatResponseModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { ChatRequestAgentPart, IParsedChatRequest, chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ChatRequestParser } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { IChatFollowup, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { ChatViewModel, IChatResponseViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { CodeBlockModelCollection } from 'vs/workbench/contrib/chat/common/codeBlockModelCollection';
import { IChatListItemRendererOptions } from './chat';

const $ = dom.$;

function revealLastElement(list: WorkbenchObjectTree<any>) {
	list.scrollTop = list.scrollHeight - list.renderHeight;
}

export type IChatInputState = Record<string, any>;
export interface IChatViewState {
	inputValue?: string;
	inputState?: IChatInputState;
}

export interface IChatWidgetStyles {
	listForeground: string;
	listBackground: string;
	inputEditorBackground: string;
	resultEditorBackground: string;
}

export interface IChatWidgetContrib extends IDisposable {
	readonly id: string;

	/**
	 * A piece of state which is related to the input editor of the chat widget
	 */
	getInputState?(): any;

	onDidChangeInputState?: Event<void>;

	/**
	 * Called with the result of getInputState when navigating input history.
	 */
	setInputState?(s: any): void;
}

export class ChatWidget extends Disposable implements IChatWidget {
	public static readonly CONTRIBS: { new(...args: [IChatWidget, ...any]): IChatWidgetContrib }[] = [];

	private readonly _onDidSubmitAgent = this._register(new Emitter<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>());
	public readonly onDidSubmitAgent = this._onDidSubmitAgent.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidChangeViewModel = this._register(new Emitter<void>());
	readonly onDidChangeViewModel = this._onDidChangeViewModel.event;

	private _onDidScroll = this._register(new Emitter<void>());
	readonly onDidScroll = this._onDidScroll.event;

	private _onDidClear = this._register(new Emitter<void>());
	readonly onDidClear = this._onDidClear.event;

	private _onDidAcceptInput = this._register(new Emitter<void>());
	readonly onDidAcceptInput = this._onDidAcceptInput.event;

	private _onDidDeleteContext = this._register(new Emitter<IChatRequestVariableEntry>());
	readonly onDidDeleteContext = this._onDidDeleteContext.event;

	private _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private _onDidChangeParsedInput = this._register(new Emitter<void>());
	readonly onDidChangeParsedInput = this._onDidChangeParsedInput.event;

	private readonly _onWillMaybeChangeHeight = new Emitter<void>();
	readonly onWillMaybeChangeHeight: Event<void> = this._onWillMaybeChangeHeight.event;

	private _onDidChangeHeight = this._register(new Emitter<number>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly _onDidChangeContentHeight = new Emitter<void>();
	readonly onDidChangeContentHeight: Event<void> = this._onDidChangeContentHeight.event;

	private contribs: ReadonlyArray<IChatWidgetContrib> = [];

	private tree!: WorkbenchObjectTree<ChatTreeItem>;
	private renderer!: ChatListItemRenderer;
	private readonly _codeBlockModelCollection: CodeBlockModelCollection;

	private inputPart!: ChatInputPart;
	private editorOptions!: ChatEditorOptions;

	private listContainer!: HTMLElement;
	private container!: HTMLElement;

	private bodyDimension: dom.Dimension | undefined;
	private visibleChangeCount = 0;
	private requestInProgress: IContextKey<boolean>;
	private agentInInput: IContextKey<boolean>;

	private _visible = false;
	public get visible() {
		return this._visible;
	}

	private previousTreeScrollHeight: number = 0;

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: ChatViewModel | undefined;
	private set viewModel(viewModel: ChatViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
		}

		this._onDidChangeViewModel.fire();
	}

	get viewModel() {
		return this._viewModel;
	}

	private parsedChatRequest: IParsedChatRequest | undefined;
	get parsedInput() {
		if (this.parsedChatRequest === undefined) {
			this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(this.viewModel!.sessionId, this.getInput(), this.location, { selectedAgent: this._lastSelectedAgent });

			this.agentInInput.set((!!this.parsedChatRequest.parts.find(part => part instanceof ChatRequestAgentPart)));
		}

		return this.parsedChatRequest;
	}

	get scopedContextKeyService(): IContextKeyService {
		return this.contextKeyService;
	}

	constructor(
		readonly location: ChatAgentLocation,
		readonly viewContext: IChatWidgetViewContext,
		private readonly viewOptions: IChatWidgetViewOptions,
		private readonly styles: IChatWidgetStyles,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IChatAccessibilityService private readonly chatAccessibilityService: IChatAccessibilityService,
		@ILogService private readonly logService: ILogService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
	) {
		super();
		CONTEXT_IN_CHAT_SESSION.bindTo(contextKeyService).set(true);
		CONTEXT_CHAT_LOCATION.bindTo(contextKeyService).set(location);
		CONTEXT_IN_QUICK_CHAT.bindTo(contextKeyService).set('resource' in viewContext);
		this.agentInInput = CONTEXT_CHAT_INPUT_HAS_AGENT.bindTo(contextKeyService);
		this.requestInProgress = CONTEXT_CHAT_REQUEST_IN_PROGRESS.bindTo(contextKeyService);

		this._register((chatWidgetService as ChatWidgetService).register(this));

		this._codeBlockModelCollection = this._register(instantiationService.createInstance(CodeBlockModelCollection));

		this._register(codeEditorService.registerCodeEditorOpenHandler(async (input: ITextResourceEditorInput, _source: ICodeEditor | null, _sideBySide?: boolean): Promise<ICodeEditor | null> => {
			let resource = input.resource;

			// if trying to open backing documents, actually open the real chat code block doc
			if (matchesScheme(resource, Schemas.vscodeCopilotBackingChatCodeBlock)) {
				resource = resource.with({ scheme: Schemas.vscodeChatCodeBlock });
			}

			if (resource.scheme !== Schemas.vscodeChatCodeBlock) {
				return null;
			}

			const responseId = resource.path.split('/').at(1);
			if (!responseId) {
				return null;
			}

			const item = this.viewModel?.getItems().find(item => item.id === responseId);
			if (!item) {
				return null;
			}

			// TODO: needs to reveal the chat view

			this.reveal(item);

			await timeout(0); // wait for list to actually render

			for (const editor of this.renderer.editorsInUse() ?? []) {
				if (extUri.isEqual(editor.uri, resource, true)) {
					const inner = editor.editor;
					if (input.options?.selection) {
						inner.setSelection({
							startLineNumber: input.options.selection.startLineNumber,
							startColumn: input.options.selection.startColumn,
							endLineNumber: input.options.selection.startLineNumber ?? input.options.selection.endLineNumber,
							endColumn: input.options.selection.startColumn ?? input.options.selection.endColumn
						});
					}
					return inner;
				}
			}
			return null;
		}));
	}

	private _lastSelectedAgent: IChatAgentData | undefined;
	set lastSelectedAgent(agent: IChatAgentData | undefined) {
		this.parsedChatRequest = undefined;
		this._lastSelectedAgent = agent;
		this._onDidChangeParsedInput.fire();
	}

	get lastSelectedAgent(): IChatAgentData | undefined {
		return this._lastSelectedAgent;
	}

	get supportsFileReferences(): boolean {
		return !!this.viewOptions.supportsFileReferences;
	}

	get input(): ChatInputPart {
		return this.inputPart;
	}

	get inputEditor(): ICodeEditor {
		return this.inputPart.inputEditor;
	}

	get inputUri(): URI {
		return this.inputPart.inputUri;
	}

	get contentHeight(): number {
		return this.inputPart.contentHeight + this.tree.contentHeight;
	}

	render(parent: HTMLElement): void {
		const viewId = 'viewId' in this.viewContext ? this.viewContext.viewId : undefined;
		this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, viewId, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));
		const renderInputOnTop = this.viewOptions.renderInputOnTop ?? false;
		const renderFollowups = this.viewOptions.renderFollowups ?? !renderInputOnTop;
		const renderStyle = this.viewOptions.renderStyle;

		this.container = dom.append(parent, $('.interactive-session'));
		if (renderInputOnTop) {
			this.createInput(this.container, { renderFollowups, renderStyle });
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
		} else {
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
			this.createInput(this.container, { renderFollowups, renderStyle });
		}

		this.createList(this.listContainer, { ...this.viewOptions.rendererOptions, renderStyle });

		this._register(this.editorOptions.onDidChange(() => this.onDidStyleChange()));
		this.onDidStyleChange();

		// Do initial render
		if (this.viewModel) {
			this.onDidChangeItems();
			revealLastElement(this.tree);
		}

		this.contribs = ChatWidget.CONTRIBS.map(contrib => {
			try {
				return this._register(this.instantiationService.createInstance(contrib, this));
			} catch (err) {
				this.logService.error('Failed to instantiate chat widget contrib', toErrorMessage(err));
				return undefined;
			}
		}).filter(isDefined);

		this.contribs.forEach(c => {
			if (c.onDidChangeInputState) {
				this._register(c.onDidChangeInputState(() => {
					const state = this.collectInputState();
					this.inputPart.updateState(state);
				}));
			}
		});
	}

	getContrib<T extends IChatWidgetContrib>(id: string): T | undefined {
		return this.contribs.find(c => c.id === id) as T;
	}

	focusInput(): void {
		this.inputPart.focus();
	}

	hasInputFocus(): boolean {
		return this.inputPart.hasFocus();
	}

	moveFocus(item: ChatTreeItem, type: 'next' | 'previous'): void {
		if (!isResponseVM(item)) {
			return;
		}
		const items = this.viewModel?.getItems();
		if (!items) {
			return;
		}
		const responseItems = items.filter(i => isResponseVM(i));
		const targetIndex = responseItems.indexOf(item);
		if (targetIndex === undefined) {
			return;
		}
		const indexToFocus = type === 'next' ? targetIndex + 1 : targetIndex - 1;
		if (indexToFocus < 0 || indexToFocus > responseItems.length - 1) {
			return;
		}
		this.focus(responseItems[indexToFocus]);
	}

	clear(): void {
		if (this._dynamicMessageLayoutData) {
			this._dynamicMessageLayoutData.enabled = true;
		}
		this._onDidClear.fire();
	}

	private onDidChangeItems(skipDynamicLayout?: boolean) {
		if (this.tree && this._visible) {
			const treeItems = (this.viewModel?.getItems() ?? [])
				.map((item): ITreeElement<ChatTreeItem> => {
					return {
						element: item,
						collapsed: false,
						collapsible: false
					};
				});

			this._onWillMaybeChangeHeight.fire();

			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => {
						return ((isResponseVM(element) || isRequestVM(element)) ? element.dataId : element.id) +
							// TODO? We can give the welcome message a proper VM or get rid of the rest of the VMs
							((isWelcomeVM(element) && this.viewModel) ? `_${ChatModelInitState[this.viewModel.initState]}` : '') +
							// Ensure re-rendering an element once slash commands are loaded, so the colorization can be applied.
							`${(isRequestVM(element) || isWelcomeVM(element)) /* && !!this.lastSlashCommands ? '_scLoaded' : '' */}` +
							// If a response is in the process of progressive rendering, we need to ensure that it will
							// be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
							`${isResponseVM(element) && element.renderData ? `_${this.visibleChangeCount}` : ''}` +
							// Re-render once content references are loaded
							(isResponseVM(element) ? `_${element.contentReferences.length}` : '');
					},
				}
			});

			if (!skipDynamicLayout && this._dynamicMessageLayoutData) {
				this.layoutDynamicChatTreeItemMode();
			}

			const lastItem = treeItems[treeItems.length - 1]?.element;
			if (lastItem && isResponseVM(lastItem) && lastItem.isComplete) {
				this.renderFollowups(lastItem.replyFollowups, lastItem);
			} else if (lastItem && isWelcomeVM(lastItem)) {
				this.renderFollowups(lastItem.sampleQuestions);
			} else {
				this.renderFollowups(undefined);
			}
		}
	}

	private async renderFollowups(items: IChatFollowup[] | undefined, response?: IChatResponseViewModel): Promise<void> {
		this.inputPart.renderFollowups(items, response);

		if (this.bodyDimension) {
			this.layout(this.bodyDimension.height, this.bodyDimension.width);
		}
	}

	setVisible(visible: boolean): void {
		const wasVisible = this._visible;
		this._visible = visible;
		this.visibleChangeCount++;
		this.renderer.setVisible(visible);
		this.input.setVisible(visible);

		if (visible) {
			this._register(disposableTimeout(() => {
				// Progressive rendering paused while hidden, so start it up again.
				// Do it after a timeout because the container is not visible yet (it should be but offsetHeight returns 0 here)
				if (this._visible) {
					this.onDidChangeItems(true);
				}
			}, 0));
		} else if (wasVisible) {
			this._onDidHide.fire();
		}
	}

	private createList(listContainer: HTMLElement, options: IChatListItemRendererOptions): void {
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
		const delegate = scopedInstantiationService.createInstance(ChatListDelegate, this.viewOptions.defaultElementHeight ?? 200);
		const rendererDelegate: IChatRendererDelegate = {
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			onDidScroll: this.onDidScroll,
		};

		// Create a dom element to hold UI from editor widgets embedded in chat messages
		const overflowWidgetsContainer = document.createElement('div');
		overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
		listContainer.append(overflowWidgetsContainer);

		this.renderer = this._register(scopedInstantiationService.createInstance(
			ChatListItemRenderer,
			this.editorOptions,
			this.location,
			options,
			rendererDelegate,
			this._codeBlockModelCollection,
			overflowWidgetsContainer,
		));
		this._register(this.renderer.onDidClickFollowup(item => {
			// is this used anymore?
			this.acceptInput(item.message);
		}));
		this._register(this.renderer.onDidClickRerunWithAgentOrCommandDetection(item => {
			const request = this.chatService.getSession(item.sessionId)?.getRequests().find(candidate => candidate.id === item.requestId);
			if (request) {
				this.chatService.resendRequest(request, { noCommandDetection: true, attempt: request.attempt, location: this.location }).catch(e => this.logService.error('FAILED to rerun request', e));
			}
		}));

		this.tree = <WorkbenchObjectTree<ChatTreeItem>>scopedInstantiationService.createInstance(
			WorkbenchObjectTree,
			'Chat',
			listContainer,
			delegate,
			[this.renderer],
			{
				identityProvider: { getId: (e: ChatTreeItem) => e.id },
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: ChatTreeItem) => isRequestVM(e) ? e.message : isResponseVM(e) ? e.response.value : '' }, // TODO
				setRowLineHeight: false,
				filter: this.viewOptions.filter ? { filter: this.viewOptions.filter.bind(this.viewOptions), } : undefined,
				overrideStyles: {
					listFocusBackground: this.styles.listBackground,
					listInactiveFocusBackground: this.styles.listBackground,
					listActiveSelectionBackground: this.styles.listBackground,
					listFocusAndSelectionBackground: this.styles.listBackground,
					listInactiveSelectionBackground: this.styles.listBackground,
					listHoverBackground: this.styles.listBackground,
					listBackground: this.styles.listBackground,
					listFocusForeground: this.styles.listForeground,
					listHoverForeground: this.styles.listForeground,
					listInactiveFocusForeground: this.styles.listForeground,
					listInactiveSelectionForeground: this.styles.listForeground,
					listActiveSelectionForeground: this.styles.listForeground,
					listFocusAndSelectionForeground: this.styles.listForeground,
				}
			});
		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(this.tree.onDidChangeContentHeight(() => {
			this.onDidChangeTreeContentHeight();
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			this.tree.updateElementHeight(e.element, e.height);
		}));
		this._register(this.tree.onDidFocus(() => {
			this._onDidFocus.fire();
		}));
		this._register(this.tree.onDidScroll(() => {
			this._onDidScroll.fire();
		}));
	}

	private onContextMenu(e: ITreeContextMenuEvent<ChatTreeItem | null>): void {
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		const selected = e.element;
		const scopedContextKeyService = this.contextKeyService.createOverlay([
			[CONTEXT_RESPONSE_FILTERED.key, isResponseVM(selected) && !!selected.errorDetails?.responseIsFiltered]
		]);
		this.contextMenuService.showContextMenu({
			menuId: MenuId.ChatContext,
			menuActionOptions: { shouldForwardArgs: true },
			contextKeyService: scopedContextKeyService,
			getAnchor: () => e.anchor,
			getActionsContext: () => selected,
		});
	}

	private onDidChangeTreeContentHeight(): void {
		if (this.tree.scrollHeight !== this.previousTreeScrollHeight) {
			// Due to rounding, the scrollTop + renderHeight will not exactly match the scrollHeight.
			// Consider the tree to be scrolled all the way down if it is within 2px of the bottom.
			const lastElementWasVisible = this.tree.scrollTop + this.tree.renderHeight >= this.previousTreeScrollHeight - 2;
			if (lastElementWasVisible) {
				dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
					// Can't set scrollTop during this event listener, the list might overwrite the change
					revealLastElement(this.tree);
				}, 0);
			}
		}

		this.previousTreeScrollHeight = this.tree.scrollHeight;
		this._onDidChangeContentHeight.fire();
	}

	private createInput(container: HTMLElement, options?: { renderFollowups: boolean; renderStyle?: 'default' | 'compact' | 'minimal' }): void {
		this.inputPart = this._register(this.instantiationService.createInstance(ChatInputPart,
			this.location,
			{
				renderFollowups: options?.renderFollowups ?? true,
				renderStyle: options?.renderStyle === 'minimal' ? 'compact' : options?.renderStyle,
				menus: { executeToolbar: MenuId.ChatExecute, ...this.viewOptions.menus },
				editorOverflowWidgetsDomNode: this.viewOptions.editorOverflowWidgetsDomNode,
			}
		));
		this.inputPart.render(container, '', this);

		this._register(this.inputPart.onDidLoadInputState(state => {
			this.contribs.forEach(c => {
				if (c.setInputState) {
					const contribState = (typeof state === 'object' && state?.[c.id]) ?? {};
					c.setInputState(contribState);
				}
			});
		}));
		this._register(this.inputPart.onDidFocus(() => this._onDidFocus.fire()));
		this._register(this.inputPart.onDidDeleteContext((e) => this._onDidDeleteContext.fire(e)));
		this._register(this.inputPart.onDidAcceptFollowup(e => {
			if (!this.viewModel) {
				return;
			}

			let msg = '';
			if (e.followup.agentId && e.followup.agentId !== this.chatAgentService.getDefaultAgent(this.location)?.id) {
				const agent = this.chatAgentService.getAgent(e.followup.agentId);
				if (!agent) {
					return;
				}

				this.lastSelectedAgent = agent;
				msg = `${chatAgentLeader}${agent.name} `;
				if (e.followup.subCommand) {
					msg += `${chatSubcommandLeader}${e.followup.subCommand} `;
				}
			} else if (!e.followup.agentId && e.followup.subCommand && this.chatSlashCommandService.hasCommand(e.followup.subCommand)) {
				msg = `${chatSubcommandLeader}${e.followup.subCommand} `;
			}

			msg += e.followup.message;
			this.acceptInput(msg);

			if (!e.response) {
				// Followups can be shown by the welcome message, then there is no response associated.
				// At some point we probably want telemetry for these too.
				return;
			}

			this.chatService.notifyUserAction({
				sessionId: this.viewModel.sessionId,
				requestId: e.response.requestId,
				agentId: e.response.agent?.id,
				result: e.response.result,
				action: {
					kind: 'followUp',
					followup: e.followup
				},
			});
		}));
		this._register(this.inputPart.onDidChangeHeight(() => {
			if (this.bodyDimension) {
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}
			this._onDidChangeContentHeight.fire();
		}));
		this._register(this.inputEditor.onDidChangeModelContent(() => this.parsedChatRequest = undefined));
		this._register(this.chatAgentService.onDidChangeAgents(() => this.parsedChatRequest = undefined));
	}

	private onDidStyleChange(): void {
		this.container.style.setProperty('--vscode-interactive-result-editor-background-color', this.editorOptions.configuration.resultEditor.backgroundColor?.toString() ?? '');
		this.container.style.setProperty('--vscode-interactive-session-foreground', this.editorOptions.configuration.foreground?.toString() ?? '');
		this.container.style.setProperty('--vscode-chat-list-background', this.themeService.getColorTheme().getColor(this.styles.listBackground)?.toString() ?? '');
	}

	setModel(model: IChatModel, viewState: IChatViewState): void {
		if (!this.container) {
			throw new Error('Call render() before setModel()');
		}

		this._codeBlockModelCollection.clear();

		this.container.setAttribute('data-session-id', model.sessionId);
		this.viewModel = this.instantiationService.createInstance(ChatViewModel, model, this._codeBlockModelCollection);
		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange, 0)(events => {
			if (!this.viewModel) {
				return;
			}

			this.requestInProgress.set(this.viewModel.requestInProgress);

			this.onDidChangeItems();
			if (events.some(e => e?.kind === 'addRequest') && this.visible) {
				revealLastElement(this.tree);
				this.focusInput();
			}
		}));
		this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
			// Ensure that view state is saved here, because we will load it again when a new model is assigned
			this.inputPart.saveState();

			// Disposes the viewmodel and listeners
			this.viewModel = undefined;
			this.onDidChangeItems();
		}));
		this.inputPart.initForNewChatModel(viewState.inputValue, viewState.inputState ?? this.collectInputState());
		this.contribs.forEach(c => {
			if (c.setInputState && viewState.inputState?.[c.id]) {
				c.setInputState(viewState.inputState?.[c.id]);
			}
		});

		if (this.tree) {
			this.onDidChangeItems();
			revealLastElement(this.tree);
		}

	}

	getFocus(): ChatTreeItem | undefined {
		return this.tree.getFocus()[0] ?? undefined;
	}

	reveal(item: ChatTreeItem): void {
		this.tree.reveal(item);
	}

	focus(item: ChatTreeItem): void {
		const items = this.tree.getNode(null).children;
		const node = items.find(i => i.element?.id === item.id);
		if (!node) {
			return;
		}

		this.tree.setFocus([node.element]);
		this.tree.domFocus();
	}

	refilter() {
		this.tree.refilter();
	}

	setInputPlaceholder(placeholder: string): void {
		this.viewModel?.setInputPlaceholder(placeholder);
	}

	resetInputPlaceholder(): void {
		this.viewModel?.resetInputPlaceholder();
	}

	setInput(value = ''): void {
		this.inputPart.setValue(value, false);
	}

	getInput(): string {
		return this.inputPart.inputEditor.getValue();
	}

	logInputHistory(): void {
		this.inputPart.logInputHistory();
	}

	async acceptInput(query?: string): Promise<IChatResponseModel | undefined> {
		return this._acceptInput(query ? { query } : undefined);
	}

	async acceptInputWithPrefix(prefix: string): Promise<void> {
		this._acceptInput({ prefix });
	}

	private collectInputState(): IChatInputState {
		const inputState: IChatInputState = {};
		this.contribs.forEach(c => {
			if (c.getInputState) {
				inputState[c.id] = c.getInputState();
			}
		});
		return inputState;
	}

	private async _acceptInput(opts: { query: string } | { prefix: string } | undefined): Promise<IChatResponseModel | undefined> {
		if (this.viewModel) {
			this._onDidAcceptInput.fire();

			const editorValue = this.getInput();
			const requestId = this.chatAccessibilityService.acceptRequest();
			const input = !opts ? editorValue :
				'query' in opts ? opts.query :
					`${opts.prefix} ${editorValue}`;
			const isUserQuery = !opts || 'prefix' in opts;
			const result = await this.chatService.sendRequest(this.viewModel.sessionId, input, { location: this.location, parserContext: { selectedAgent: this._lastSelectedAgent }, attachedContext: [...this.inputPart.attachedContext.values()] });

			if (result) {
				this.inputPart.attachedContext.clear();
				this.inputPart.acceptInput(isUserQuery);
				this._onDidSubmitAgent.fire({ agent: result.agent, slashCommand: result.slashCommand });
				this.inputPart.updateState(this.collectInputState());
				result.responseCompletePromise.then(() => {
					const responses = this.viewModel?.getItems().filter(isResponseVM);
					const lastResponse = responses?.[responses.length - 1];
					this.chatAccessibilityService.acceptResponse(lastResponse, requestId);
				});
				return result.responseCreatedPromise;
			}
		}
		return undefined;
	}


	setContext(overwrite: boolean, ...contentReferences: IChatRequestVariableEntry[]) {
		if (overwrite) {
			this.inputPart.attachedContext.clear();
		}
		this.inputPart.attachContext(...contentReferences);

		if (this.bodyDimension) {
			this.layout(this.bodyDimension.height, this.bodyDimension.width);
		}
	}

	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		return this.renderer.getCodeBlockInfosForResponse(response);
	}

	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this.renderer.getCodeBlockInfoForEditor(uri);
	}

	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[] {
		return this.renderer.getFileTreeInfosForResponse(response);
	}

	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined {
		return this.renderer.getLastFocusedFileTreeForResponse(response);
	}

	focusLastMessage(): void {
		if (!this.viewModel) {
			return;
		}

		const items = this.tree.getNode(null).children;
		const lastItem = items[items.length - 1];
		if (!lastItem) {
			return;
		}

		this.tree.setFocus([lastItem.element]);
		this.tree.domFocus();
	}

	layout(height: number, width: number): void {
		width = Math.min(width, 850);
		this.bodyDimension = new dom.Dimension(width, height);

		this.inputPart.layout(height, width);
		const inputPartHeight = this.inputPart.inputPartHeight;
		const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;

		const listHeight = height - inputPartHeight;

		this.tree.layout(listHeight, width);
		this.tree.getHTMLElement().style.height = `${listHeight}px`;
		this.renderer.layout(width);
		if (lastElementVisible) {
			revealLastElement(this.tree);
		}

		this.listContainer.style.height = `${height - inputPartHeight}px`;

		this._onDidChangeHeight.fire(height);
	}

	private _dynamicMessageLayoutData?: { numOfMessages: number; maxHeight: number; enabled: boolean };

	// An alternative to layout, this allows you to specify the number of ChatTreeItems
	// you want to show, and the max height of the container. It will then layout the
	// tree to show that many items.
	// TODO@TylerLeonhardt: This could use some refactoring to make it clear which layout strategy is being used
	setDynamicChatTreeItemLayout(numOfChatTreeItems: number, maxHeight: number) {
		this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
		this._register(this.renderer.onDidChangeItemHeight(() => this.layoutDynamicChatTreeItemMode()));

		const mutableDisposable = this._register(new MutableDisposable());
		this._register(this.tree.onDidScroll((e) => {
			// TODO@TylerLeonhardt this should probably just be disposed when this is disabled
			// and then set up again when it is enabled again
			if (!this._dynamicMessageLayoutData?.enabled) {
				return;
			}
			mutableDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
				if (!e.scrollTopChanged || e.heightChanged || e.scrollHeightChanged) {
					return;
				}
				const renderHeight = e.height;
				const diff = e.scrollHeight - renderHeight - e.scrollTop;
				if (diff === 0) {
					return;
				}

				const possibleMaxHeight = (this._dynamicMessageLayoutData?.maxHeight ?? maxHeight);
				const width = this.bodyDimension?.width ?? this.container.offsetWidth;
				this.inputPart.layout(possibleMaxHeight, width);
				const inputPartHeight = this.inputPart.inputPartHeight;
				const newHeight = Math.min(renderHeight + diff, possibleMaxHeight - inputPartHeight);
				this.layout(newHeight + inputPartHeight, width);
			});
		}));
	}

	updateDynamicChatTreeItemLayout(numOfChatTreeItems: number, maxHeight: number) {
		this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
		let hasChanged = false;
		let height = this.bodyDimension!.height;
		let width = this.bodyDimension!.width;
		if (maxHeight < this.bodyDimension!.height) {
			height = maxHeight;
			hasChanged = true;
		}
		const containerWidth = this.container.offsetWidth;
		if (this.bodyDimension?.width !== containerWidth) {
			width = containerWidth;
			hasChanged = true;
		}
		if (hasChanged) {
			this.layout(height, width);
		}
	}

	get isDynamicChatTreeItemLayoutEnabled(): boolean {
		return this._dynamicMessageLayoutData?.enabled ?? false;
	}

	set isDynamicChatTreeItemLayoutEnabled(value: boolean) {
		if (!this._dynamicMessageLayoutData) {
			return;
		}
		this._dynamicMessageLayoutData.enabled = value;
	}

	layoutDynamicChatTreeItemMode(): void {
		if (!this.viewModel || !this._dynamicMessageLayoutData?.enabled) {
			return;
		}

		const width = this.bodyDimension?.width ?? this.container.offsetWidth;
		this.inputPart.layout(this._dynamicMessageLayoutData.maxHeight, width);
		const inputHeight = this.inputPart.inputPartHeight;

		const totalMessages = this.viewModel.getItems();
		// grab the last N messages
		const messages = totalMessages.slice(-this._dynamicMessageLayoutData.numOfMessages);

		const needsRerender = messages.some(m => m.currentRenderedHeight === undefined);
		const listHeight = needsRerender
			? this._dynamicMessageLayoutData.maxHeight
			: messages.reduce((acc, message) => acc + message.currentRenderedHeight!, 0);

		this.layout(
			Math.min(
				// we add an additional 18px in order to show that there is scrollable content
				inputHeight + listHeight + (totalMessages.length > 2 ? 18 : 0),
				this._dynamicMessageLayoutData.maxHeight
			),
			width
		);

		if (needsRerender || !listHeight) {
			// TODO: figure out a better place to reveal the last element
			revealLastElement(this.tree);
		}
	}

	saveState(): void {
		this.inputPart.saveState();
	}

	getViewState(): IChatViewState {
		this.inputPart.saveState();
		return { inputValue: this.getInput(), inputState: this.collectInputState() };
	}


}

export class ChatWidgetService implements IChatWidgetService {

	declare readonly _serviceBrand: undefined;

	private _widgets: ChatWidget[] = [];
	private _lastFocusedWidget: ChatWidget | undefined = undefined;

	get lastFocusedWidget(): ChatWidget | undefined {
		return this._lastFocusedWidget;
	}

	constructor() { }

	getWidgetByInputUri(uri: URI): ChatWidget | undefined {
		return this._widgets.find(w => isEqual(w.inputUri, uri));
	}

	getWidgetBySessionId(sessionId: string): ChatWidget | undefined {
		return this._widgets.find(w => w.viewModel?.sessionId === sessionId);
	}

	private setLastFocusedWidget(widget: ChatWidget | undefined): void {
		if (widget === this._lastFocusedWidget) {
			return;
		}

		this._lastFocusedWidget = widget;
	}

	register(newWidget: ChatWidget): IDisposable {
		if (this._widgets.some(widget => widget === newWidget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		this._widgets.push(newWidget);

		return combinedDisposable(
			newWidget.onDidFocus(() => this.setLastFocusedWidget(newWidget)),
			toDisposable(() => this._widgets.splice(this._widgets.indexOf(newWidget), 1))
		);
	}
}
