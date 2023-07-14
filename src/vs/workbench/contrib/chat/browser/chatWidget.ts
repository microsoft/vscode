/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ITreeContextMenuEvent, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/chat';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IViewsService } from 'vs/workbench/common/views';
import { clearChatSession } from 'vs/workbench/contrib/chat/browser/actions/chatClear';
import { ChatTreeItem, IChatAccessibilityService, IChatCodeBlockInfo, IChatWidget, IChatWidgetService, IChatWidgetViewContext } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { ChatAccessibilityProvider, ChatListDelegate, ChatListItemRenderer, IChatRendererDelegate } from 'vs/workbench/contrib/chat/browser/chatListRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_SESSION } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatReplyFollowup, IChatService, ISlashCommand } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatViewModel, IChatResponseViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

const $ = dom.$;

function revealLastElement(list: WorkbenchObjectTree<any>) {
	list.scrollTop = list.scrollHeight - list.renderHeight;
}

export interface IViewState {
	inputValue?: string;
	// renderData
}

export interface IChatWidgetStyles {
	listForeground: string;
	listBackground: string;
	inputEditorBackground: string;
	resultEditorBackground: string;
}

export class ChatWidget extends Disposable implements IChatWidget {
	public static readonly CONTRIBS: { new(...args: [IChatWidget, ...any]): any }[] = [];

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidChangeViewModel = this._register(new Emitter<void>());
	readonly onDidChangeViewModel = this._onDidChangeViewModel.event;

	private tree!: WorkbenchObjectTree<ChatTreeItem>;
	private renderer!: ChatListItemRenderer;

	private inputPart!: ChatInputPart;
	private editorOptions!: ChatEditorOptions;

	private listContainer!: HTMLElement;
	private container!: HTMLElement;

	private bodyDimension: dom.Dimension | undefined;
	private visible = false;
	private visibleChangeCount = 0;
	private requestInProgress: IContextKey<boolean>;

	private previousTreeScrollHeight: number = 0;

	private viewModelDisposables = new DisposableStore();
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

		this.slashCommandsPromise = undefined;
		this.lastSlashCommands = undefined;
		this.getSlashCommands().then(() => {
			this.onDidChangeItems();
		});

		this._onDidChangeViewModel.fire();
	}

	get viewModel() {
		return this._viewModel;
	}

	private lastSlashCommands: ISlashCommand[] | undefined;
	private slashCommandsPromise: Promise<ISlashCommand[] | undefined> | undefined;

	constructor(
		readonly viewContext: IChatWidgetViewContext,
		private readonly styles: IChatWidgetStyles,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IChatAccessibilityService private readonly _chatAccessibilityService: IChatAccessibilityService
	) {
		super();
		CONTEXT_IN_CHAT_SESSION.bindTo(contextKeyService).set(true);
		this.requestInProgress = CONTEXT_CHAT_REQUEST_IN_PROGRESS.bindTo(contextKeyService);

		this._register((chatWidgetService as ChatWidgetService).register(this));
	}

	get providerId(): string {
		return this.viewModel?.providerId || '';
	}

	get inputEditor(): ICodeEditor {
		return this.inputPart.inputEditor!;
	}

	get inputUri(): URI {
		return this.inputPart.inputUri;
	}

	render(parent: HTMLElement): void {
		const viewId = 'viewId' in this.viewContext ? this.viewContext.viewId : undefined;
		this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, viewId, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));
		const renderInputOnTop = this.viewContext.renderInputOnTop ?? false;

		this.container = dom.append(parent, $('.interactive-session'));
		if (renderInputOnTop) {
			this.createInput(this.container, { renderFollowups: false });
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
		} else {
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
			this.createInput(this.container);
		}

		this.createList(this.listContainer);

		this._register(this.editorOptions.onDidChange(() => this.onDidStyleChange()));
		this.onDidStyleChange();

		// Do initial render
		if (this.viewModel) {
			this.onDidChangeItems();
			revealLastElement(this.tree);
		}

		ChatWidget.CONTRIBS.forEach(contrib => this._register(this.instantiationService.createInstance(contrib, this)));
	}

	focusInput(): void {
		this.inputPart.focus();
	}

	private onDidChangeItems() {
		if (this.tree && this.visible) {
			const treeItems = (this.viewModel?.getItems() ?? [])
				.map(item => {
					return <ITreeElement<ChatTreeItem>>{
						element: item,
						collapsed: false,
						collapsible: false
					};
				});

			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => {
						return ((isResponseVM(element) || isRequestVM(element)) ? element.dataId : element.id) +
							// TODO? We can give the welcome message a proper VM or get rid of the rest of the VMs
							((isWelcomeVM(element) && !this.viewModel?.isInitialized) ? '_initializing' : '') +
							// Ensure re-rendering an element once slash commands are loaded, so the colorization can be applied.
							`${(isRequestVM(element) || isWelcomeVM(element)) && !!this.lastSlashCommands ? '_scLoaded' : ''}` +
							// If a response is in the process of progressive rendering, we need to ensure that it will
							// be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
							`${isResponseVM(element) && element.renderData ? `_${this.visibleChangeCount}` : ''}`;
					},
				}
			});

			const lastItem = treeItems[treeItems.length - 1]?.element;
			if (lastItem && isResponseVM(lastItem) && lastItem.isComplete) {
				this.renderFollowups(lastItem.replyFollowups);
			} else {
				this.renderFollowups(undefined);
			}
		}
	}

	private async renderFollowups(items?: IChatReplyFollowup[]): Promise<void> {
		this.inputPart.renderFollowups(items);

		if (this.bodyDimension) {
			this.layout(this.bodyDimension.height, this.bodyDimension.width);
		}
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.visibleChangeCount++;
		this.renderer.setVisible(visible);

		if (visible) {
			setTimeout(() => {
				// Progressive rendering paused while hidden, so start it up again.
				// Do it after a timeout because the container is not visible yet (it should be but offsetHeight returns 0 here)
				if (this.visible) {
					this.onDidChangeItems();
				}
			}, 0);
		}
	}

	async getSlashCommands(): Promise<ISlashCommand[] | undefined> {
		if (!this.viewModel) {
			return;
		}

		if (!this.slashCommandsPromise) {
			this.slashCommandsPromise = this.chatService.getSlashCommands(this.viewModel.sessionId, CancellationToken.None).then(commands => {
				// If this becomes a repeated pattern, we should have a real internal slash command provider system
				const clearCommand: ISlashCommand = {
					command: 'clear',
					sortText: 'z_clear',
					detail: localize('clear', "Clear the session"),
				};
				this.lastSlashCommands = [
					...(commands ?? []),
					clearCommand
				];
				return this.lastSlashCommands;
			});
		}

		return this.slashCommandsPromise;
	}

	private createList(listContainer: HTMLElement): void {
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
		const delegate = scopedInstantiationService.createInstance(ChatListDelegate);
		const rendererDelegate: IChatRendererDelegate = {
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			getSlashCommands: () => this.lastSlashCommands ?? [],
		};
		this.renderer = this._register(scopedInstantiationService.createInstance(ChatListItemRenderer, this.editorOptions, rendererDelegate));
		this._register(this.renderer.onDidClickFollowup(item => {
			this.acceptInput(item);
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
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: new ChatAccessibilityProvider(),
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: ChatTreeItem) => isRequestVM(e) ? e.message : isResponseVM(e) ? e.response.value : '' }, // TODO
				setRowLineHeight: false,
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
		this.tree.onContextMenu(e => this.onContextMenu(e));

		this._register(this.tree.onDidChangeContentHeight(() => {
			this.onDidChangeTreeContentHeight();
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			this.tree.updateElementHeight(e.element, e.height);
		}));
		this._register(this.tree.onDidFocus(() => {
			this._onDidFocus.fire();
		}));
	}

	private onContextMenu(e: ITreeContextMenuEvent<ChatTreeItem | null>): void {
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this.contextMenuService.showContextMenu({
			menuId: MenuId.ChatContext,
			menuActionOptions: { shouldForwardArgs: true },
			contextKeyService: this.contextKeyService,
			getAnchor: () => e.anchor,
			getActionsContext: () => e.element,
		});
	}

	private onDidChangeTreeContentHeight(): void {
		if (this.tree.scrollHeight !== this.previousTreeScrollHeight) {
			// Due to rounding, the scrollTop + renderHeight will not exactly match the scrollHeight.
			// Consider the tree to be scrolled all the way down if it is within 2px of the bottom.
			const lastElementWasVisible = this.tree.scrollTop + this.tree.renderHeight >= this.previousTreeScrollHeight - 2;
			if (lastElementWasVisible) {
				dom.scheduleAtNextAnimationFrame(() => {
					// Can't set scrollTop during this event listener, the list might overwrite the change
					revealLastElement(this.tree);
				}, 0);
			}
		}

		this.previousTreeScrollHeight = this.tree.scrollHeight;
	}

	private createInput(container: HTMLElement, options?: { renderFollowups: boolean }): void {
		this.inputPart = this.instantiationService.createInstance(ChatInputPart, { renderFollowups: options?.renderFollowups ?? true });
		this.inputPart.render(container, '', this);

		this._register(this.inputPart.onDidFocus(() => this._onDidFocus.fire()));
		this._register(this.inputPart.onDidAcceptFollowup(followup => this.acceptInput(followup)));
		this._register(this.inputPart.onDidChangeHeight(() => this.bodyDimension && this.layout(this.bodyDimension.height, this.bodyDimension.width)));
	}

	private onDidStyleChange(): void {
		this.container.style.setProperty('--vscode-interactive-result-editor-background-color', this.editorOptions.configuration.resultEditor.backgroundColor?.toString() ?? '');
		this.container.style.setProperty('--vscode-interactive-session-foreground', this.editorOptions.configuration.foreground?.toString() ?? '');
	}

	setModel(model: IChatModel, viewState: IViewState): void {
		if (!this.container) {
			throw new Error('Call render() before setModel()');
		}

		this.container.setAttribute('data-session-id', model.sessionId);
		this.viewModel = this.instantiationService.createInstance(ChatViewModel, model);
		this.viewModelDisposables.add(this.viewModel.onDidChange(e => {
			this.slashCommandsPromise = undefined;
			this.requestInProgress.set(this.viewModel!.requestInProgress);
			this.onDidChangeItems();
			if (e?.kind === 'addRequest') {
				revealLastElement(this.tree);
				this.focusInput();
			}
		}));
		this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
			// Disposes the viewmodel and listeners
			this.viewModel = undefined;
			this.onDidChangeItems();
		}));
		this.inputPart.setState(model.providerId, viewState.inputValue ?? '');

		if (this.tree) {
			this.onDidChangeItems();
			revealLastElement(this.tree);
		}
	}

	getFocus(): ChatTreeItem | undefined {
		return withNullAsUndefined(this.tree.getFocus()[0]);
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

	async acceptInput(query?: string | IChatReplyFollowup): Promise<void> {
		if (this.viewModel) {
			const editorValue = this.inputPart.inputEditor.getValue();

			// Shortcut for /clear command
			if (!query && editorValue.trim() === '/clear') {
				// Small hack, if this becomes a repeated pattern, we should have a real internal slash command provider system
				this.instantiationService.invokeFunction(clearChatSession, this);
				return;
			}
			this._chatAccessibilityService.acceptRequest();
			const input = query ?? editorValue;
			const usedSlashCommand = this.lookupSlashCommand(typeof input === 'string' ? input : input.message);
			const result = await this.chatService.sendRequest(this.viewModel.sessionId, input, usedSlashCommand);

			if (result) {
				this.inputPart.acceptInput(query);
				result.responseCompletePromise.then(async () => {
					const responses = this.viewModel?.getItems().filter(isResponseVM);
					const lastResponse = responses?.[responses.length - 1];
					this._chatAccessibilityService.acceptResponse(lastResponse);
				});
			} else {
				this._chatAccessibilityService.acceptResponse();
			}
		}
	}

	private lookupSlashCommand(input: string): ISlashCommand | undefined {
		return this.lastSlashCommands?.find(sc => input.startsWith(`/${sc.command}`));
	}

	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		return this.renderer.getCodeBlockInfosForResponse(response);
	}

	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this.renderer.getCodeBlockInfoForEditor(uri);
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

		const inputPartHeight = this.inputPart.layout(height, width);
		const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;

		const listHeight = height - inputPartHeight;

		this.tree.layout(listHeight, width);
		this.tree.getHTMLElement().style.height = `${listHeight}px`;
		this.renderer.layout(width);
		if (lastElementVisible) {
			revealLastElement(this.tree);
		}

		this.listContainer.style.height = `${height - inputPartHeight}px`;
	}

	saveState(): void {
		this.inputPart.saveState();
	}

	getViewState(): IViewState {
		this.inputPart.saveState();
		return { inputValue: this.inputPart.inputEditor.getValue() };
	}
}

export class ChatWidgetService implements IChatWidgetService {

	declare readonly _serviceBrand: undefined;

	private _widgets: ChatWidget[] = [];
	private _lastFocusedWidget: ChatWidget | undefined = undefined;

	get lastFocusedWidget(): ChatWidget | undefined {
		return this._lastFocusedWidget;
	}

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@IChatContributionService private readonly chatContributionService: IChatContributionService,
	) { }

	getWidgetByInputUri(uri: URI): ChatWidget | undefined {
		return this._widgets.find(w => isEqual(w.inputUri, uri));
	}

	async revealViewForProvider(providerId: string): Promise<ChatWidget | undefined> {
		const viewId = this.chatContributionService.getViewIdForProvider(providerId);
		const view = await this.viewsService.openView<ChatViewPane>(viewId);

		return view?.widget;
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

