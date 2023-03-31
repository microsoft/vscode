/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Button } from 'vs/base/browser/ui/button/button';
import { ITreeContextMenuEvent, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { HistoryNavigator } from 'vs/base/common/history';
import { Disposable, DisposableStore, IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/interactiveSession';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { registerAndCreateHistoryNavigationContext } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { foreground } from 'vs/platform/theme/common/colorRegistry';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { Memento } from 'vs/workbench/common/memento';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IInteractiveSessionExecuteActionContext } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionExecuteActions';
import { IInteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { InteractiveSessionFollowups } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionFollowups';
import { IInteractiveSessionRendererDelegate, InteractiveListItemRenderer, InteractiveSessionAccessibilityProvider, InteractiveSessionListDelegate, InteractiveTreeItem } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionListRenderer';
import { InteractiveSessionEditorOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { CONTEXT_INTERACTIVE_REQUEST_IN_PROGRESS, CONTEXT_IN_INTERACTIVE_INPUT, CONTEXT_IN_INTERACTIVE_SESSION } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionReplyFollowup, IInteractiveSessionService, IInteractiveSlashCommand } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveSessionViewModel, InteractiveSessionViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { IInteractiveSessionWidgetHistoryService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionWidgetHistoryService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export const IInteractiveSessionWidgetService = createDecorator<IInteractiveSessionWidgetService>('interactiveSessionWidgetService');

export interface IInteractiveSessionWidgetService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the currently focused widget if any.
	 */
	readonly lastFocusedWidget: InteractiveSessionWidget | undefined;

	getWidgetByInputUri(uri: URI): InteractiveSessionWidget | undefined;
}

const $ = dom.$;

function revealLastElement(list: WorkbenchObjectTree<any>) {
	list.scrollTop = list.scrollHeight - list.renderHeight;
}

interface IViewState {
	inputValue: string;
}

const INPUT_EDITOR_MAX_HEIGHT = 250;

export class InteractiveSessionWidget extends Disposable implements IInteractiveSessionWidget, IHistoryNavigationWidget {
	public static readonly CONTRIBS: { new(...args: [IInteractiveSessionWidget, ...any]): any }[] = [];
	public static readonly INPUT_SCHEME = 'interactiveSessionInput';

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	private _onDidChangeViewModel = this._register(new Emitter<void>());
	readonly onDidChangeViewModel = this._onDidChangeViewModel.event;

	private static _counter = 0;
	public readonly inputUri = URI.parse(`${InteractiveSessionWidget.INPUT_SCHEME}:input-${InteractiveSessionWidget._counter++}`);

	private tree!: WorkbenchObjectTree<InteractiveTreeItem>;
	private renderer!: InteractiveListItemRenderer;
	private inputEditorHeight = 0;

	private _inputEditor!: CodeEditorWidget;
	public get inputEditor() {
		return this._inputEditor;
	}

	private history: HistoryNavigator<string>;
	private setHistoryNavigationEnablement!: (enabled: boolean) => void;
	private inputOptions!: InteractiveSessionEditorOptions;
	private inputModel: ITextModel | undefined;
	private listContainer!: HTMLElement;
	private container!: HTMLElement;
	private welcomeViewContainer!: HTMLElement;

	private followupsContainer!: HTMLElement;
	private followupsDisposables = this._register(new DisposableStore());

	private welcomeViewDisposables = this._register(new DisposableStore());
	private bodyDimension: dom.Dimension | undefined;
	private visible = false;
	private requestInProgress: IContextKey<boolean>;

	private previousTreeScrollHeight: number = 0;

	private currentViewModelPromise: Promise<IInteractiveSessionViewModel | undefined> | undefined;

	private viewModelDisposables = new DisposableStore();
	private _viewModel: InteractiveSessionViewModel | undefined;
	private set viewModel(viewModel: InteractiveSessionViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
		}

		this.currentViewModelPromise = undefined;
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

	private lastSlashCommands: IInteractiveSlashCommand[] | undefined;
	private slashCommandsPromise: Promise<IInteractiveSlashCommand[] | undefined> | undefined;

	private memento: Memento;
	private viewState: IViewState;

	constructor(
		private readonly providerId: string,
		readonly viewId: string | undefined,
		private readonly listBackgroundColorDelegate: () => string,
		private readonly inputEditorBackgroundColorDelegate: () => string,
		private readonly resultEditorBackgroundColorDelegate: () => string,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService,
		@IInteractiveSessionWidgetService interactiveSessionWidgetService: IInteractiveSessionWidgetService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInteractiveSessionWidgetHistoryService private readonly historyService: IInteractiveSessionWidgetHistoryService,
	) {
		super();
		CONTEXT_IN_INTERACTIVE_SESSION.bindTo(contextKeyService).set(true);
		this.requestInProgress = CONTEXT_INTERACTIVE_REQUEST_IN_PROGRESS.bindTo(contextKeyService);

		this._register((interactiveSessionWidgetService as InteractiveSessionWidgetService).register(this));
		this.initializeSessionModel(true);

		const history = this.historyService.getHistory(this.providerId);
		this.history = new HistoryNavigator(history, 50);
		this._register(this.historyService.onDidClearHistory(() => this.history.clear()));

		this.memento = new Memento('interactive-session-' + this.providerId, storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.USER) as IViewState;
	}

	get element(): HTMLElement {
		// TODO this too is only used for IHistoryNavigationWidget and isn't really correct, put the input editor in its own class
		return this.container;
	}

	render(parent: HTMLElement): void {
		this.container = dom.append(parent, $('.interactive-session'));
		this.listContainer = dom.append(this.container, $(`.interactive-list`));

		this.inputOptions = this._register(this.instantiationService.createInstance(InteractiveSessionEditorOptions, this.viewId, this.inputEditorBackgroundColorDelegate, this.resultEditorBackgroundColorDelegate));
		this.renderWelcomeView(this.container);
		this.createList(this.listContainer);
		this.createInput(this.container);

		this._register(this.inputOptions.onDidChange(() => this.onDidStyleChange()));
		this.onDidStyleChange();

		// Do initial render
		if (this.viewModel) {
			this.onDidChangeItems();
		}

		InteractiveSessionWidget.CONTRIBS.forEach(contrib => this._register(this.instantiationService.createInstance(contrib, this)));
	}

	focusInput(): void {
		this._inputEditor.focus();
	}

	private onDidChangeItems() {
		if (this.tree && this.visible) {
			const items: InteractiveTreeItem[] = this.viewModel?.getItems() ?? [];
			if (this.viewModel?.welcomeMessage) {
				items.unshift(this.viewModel.welcomeMessage);
			}

			const treeItems = items.map(item => {
				return <ITreeElement<InteractiveTreeItem>>{
					element: item,
					collapsed: false,
					collapsible: false
				};
			});

			if (treeItems.length > 0) {
				this.setWelcomeViewVisible(false);
			}

			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => {
						return element.id + `${(isRequestVM(element) || isWelcomeVM(element)) && !!this.lastSlashCommands ? '_scLoaded' : ''}`;
					},
				}
			});

			const lastItem = items[items.length - 1];
			if (lastItem && isResponseVM(lastItem) && lastItem.isComplete) {
				this.renderFollowups(lastItem.replyFollowups);
			} else {
				this.renderFollowups(undefined);
			}
		}
	}

	private async renderFollowups(items?: IInteractiveSessionReplyFollowup[]): Promise<void> {
		this.followupsDisposables.clear();
		dom.clearNode(this.followupsContainer);

		if (items && items.length > 0) {
			this.followupsDisposables.add(new InteractiveSessionFollowups(this.followupsContainer, items, undefined, followup => this.acceptInput(followup)));
		}

		if (this.bodyDimension) {
			this.layout(this.bodyDimension.height, this.bodyDimension.width);
		}
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (visible) {
			if (!this.inputModel) {
				this.inputModel = this.modelService.getModel(this.inputUri) || this.modelService.createModel('', null, this.inputUri, true);
				this.inputModel.updateOptions({ bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false } });
				this._inputEditor.setModel(this.inputModel);
				if (this.viewState.inputValue) {
					this.inputModel.setValue(this.viewState.inputValue);
					const lineNumber = this.inputModel.getLineCount();
					this._inputEditor.setPosition({ lineNumber, column: this.inputModel.getLineMaxColumn(lineNumber) });
				}
			}

			// Not sure why this is needed- the view is being rendered before it's visible, and then the list content doesn't show up
			this.onDidChangeItems();
		}
	}

	async getSlashCommands(): Promise<IInteractiveSlashCommand[] | undefined> {
		if (!this.viewModel) {
			return;
		}

		if (!this.slashCommandsPromise) {
			this.slashCommandsPromise = this.interactiveSessionService.getSlashCommands(this.viewModel.sessionId, CancellationToken.None).then(commands => {
				// If this becomes a repeated pattern, we should have a real internal slash command provider system
				const clearCommand: IInteractiveSlashCommand = {
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

	private onDidStyleChange(): void {
		this.container.style.setProperty('--vscode-interactive-result-editor-background-color', this.inputOptions.configuration.resultEditor.backgroundColor?.toString() ?? '');
	}

	private async renderWelcomeView(container: HTMLElement): Promise<void> {
		if (this.welcomeViewContainer) {
			dom.clearNode(this.welcomeViewContainer);
		} else {
			this.welcomeViewContainer = dom.append(container, $('.interactive-session-welcome-view'));
		}

		this.welcomeViewDisposables.clear();
		const suggestions = await this.interactiveSessionService.provideSuggestions(this.providerId, CancellationToken.None);
		const suggElements = suggestions?.map(sugg => {
			const button = this.welcomeViewDisposables.add(new Button(this.welcomeViewContainer, defaultButtonStyles));
			button.label = `"${sugg}"`;
			this.welcomeViewDisposables.add(button.onDidClick(() => this.acceptInput(sugg)));
			return button;
		});
		if (suggElements && suggElements.length > 0) {
			this.setWelcomeViewVisible(false);
		} else {
			this.setWelcomeViewVisible(false);
		}
	}

	private setWelcomeViewVisible(visible: boolean): void {
		if (visible) {
			dom.show(this.welcomeViewContainer);
			dom.hide(this.listContainer);
		} else {
			dom.hide(this.welcomeViewContainer);
			dom.show(this.listContainer);
		}
	}

	private createList(listContainer: HTMLElement): void {
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
		const delegate = scopedInstantiationService.createInstance(InteractiveSessionListDelegate);
		const rendererDelegate: IInteractiveSessionRendererDelegate = {
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			getSlashCommands: () => this.lastSlashCommands ?? [],
		};
		this.renderer = scopedInstantiationService.createInstance(InteractiveListItemRenderer, this.inputOptions, rendererDelegate);
		this._register(this.renderer.onDidClickFollowup(item => {
			this.acceptInput(item);
		}));

		this.tree = <WorkbenchObjectTree<InteractiveTreeItem>>scopedInstantiationService.createInstance(
			WorkbenchObjectTree,
			'InteractiveSession',
			listContainer,
			delegate,
			[this.renderer],
			{
				identityProvider: { getId: (e: InteractiveTreeItem) => e.id },
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: new InteractiveSessionAccessibilityProvider(),
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: InteractiveTreeItem) => isRequestVM(e) ? e.message : isResponseVM(e) ? e.response.value : '' }, // TODO
				setRowLineHeight: false,
				overrideStyles: {
					listFocusBackground: this.listBackgroundColorDelegate(),
					listInactiveFocusBackground: this.listBackgroundColorDelegate(),
					listActiveSelectionBackground: this.listBackgroundColorDelegate(),
					listFocusAndSelectionBackground: this.listBackgroundColorDelegate(),
					listInactiveSelectionBackground: this.listBackgroundColorDelegate(),
					listHoverBackground: this.listBackgroundColorDelegate(),
					listBackground: this.listBackgroundColorDelegate(),
					listFocusForeground: foreground,
					listHoverForeground: foreground,
					listInactiveFocusForeground: foreground,
					listInactiveSelectionForeground: foreground,
					listActiveSelectionForeground: foreground,
					listFocusAndSelectionForeground: foreground,
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

	private onContextMenu(e: ITreeContextMenuEvent<InteractiveTreeItem | null>): void {
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this.contextMenuService.showContextMenu({
			menuId: MenuId.InteractiveSessionContext,
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
			// const lastElementWasVisible = this.list.scrollTop + this.list.renderHeight >= this.previousTreeScrollHeight - 2;
			const lastElementWasVisible = this.tree.scrollTop + this.tree.renderHeight >= this.previousTreeScrollHeight;
			if (lastElementWasVisible) {
				dom.scheduleAtNextAnimationFrame(() => {
					// Can't set scrollTop during this event listener, the list might overwrite the change
					revealLastElement(this.tree);
				}, 0);
			}
		}

		this.previousTreeScrollHeight = this.tree.scrollHeight;
	}

	private createInput(container: HTMLElement): void {
		const inputPart = dom.append(container, $('.interactive-input-part'));
		this.followupsContainer = dom.append(inputPart, $('.interactive-input-followups'));

		const inputContainer = dom.append(inputPart, $('.interactive-input-and-toolbar'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		CONTEXT_IN_INTERACTIVE_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
		this.setHistoryNavigationEnablement = enabled => {
			historyNavigationBackwardsEnablement.set(enabled);
			historyNavigationForwardsEnablement.set(enabled);
		};

		const options = getSimpleEditorOptions();
		options.readOnly = false;
		options.ariaLabel = localize('interactiveSessionInput', "Interactive Session Input");
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = { top: 8, bottom: 7 };
		options.cursorWidth = 1;
		options.wrappingStrategy = 'advanced';
		options.bracketPairColorization = { enabled: false };
		options.suggest = { showIcons: false };
		options.scrollbar = { ...(options.scrollbar ?? {}), vertical: 'hidden' };

		const inputEditorElement = dom.append(inputContainer, $('.interactive-input-editor'));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, inputEditorElement, options, getSimpleCodeEditorWidgetOptions()));

		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.min(this._inputEditor.getContentHeight(), INPUT_EDITOR_MAX_HEIGHT);
			if (this.bodyDimension && currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}

			// Only allow history navigation when the input is empty.
			// (If this model change happened as a result of a history navigation, this is canceled out by a call in this.navigateHistory)
			const model = this._inputEditor.getModel();
			this.setHistoryNavigationEnablement(!!model && model.getValue() === '');
		}));
		this._register(this._inputEditor.onDidFocusEditorText(() => {
			this._onDidFocus.fire();
			inputContainer.classList.toggle('focused', true);
		}));
		this._register(this._inputEditor.onDidBlurEditorText(() => {
			inputContainer.classList.toggle('focused', false);

			// TODO this is just needed for the IHistoryNavigationWidget, which is really the input, not the whole Widget.
			// Break the input editor into its own class to make this make sense
			this._onDidBlur.fire();
		}));

		const toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, inputContainer, MenuId.InteractiveSessionExecute, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));
		toolbar.getElement().classList.add('interactive-execute-toolbar');
		toolbar.context = <IInteractiveSessionExecuteActionContext>{ widget: this };
	}

	showPreviousValue(): void {
		this.navigateHistory(true);
	}

	showNextValue(): void {
		this.navigateHistory(false);
	}

	private navigateHistory(previous: boolean): void {
		const historyInput = previous ? this.history.previous() : this.history.next();

		if (historyInput) {
			this.inputEditor.setValue(historyInput);
			aria.status(historyInput);
			if (historyInput) {
				// always leave cursor at the end.
				this.inputEditor.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
			}
			this.setHistoryNavigationEnablement(true);
		}
	}

	private async initializeSessionModel(initial = false) {
		if (this.currentViewModelPromise) {
			await this.currentViewModelPromise;
			return;
		}

		const doInitializeSessionModel = async () => {
			await this.extensionService.whenInstalledExtensionsRegistered();
			const model = await this.interactiveSessionService.startSession(this.providerId, initial, CancellationToken.None);
			if (!model) {
				throw new Error('Failed to start session');
			}

			if (this.viewModel) {
				// Oops, created two. TODO this could be better
				return;
			}

			this.viewModel = this.instantiationService.createInstance(InteractiveSessionViewModel, model);
			this.viewModelDisposables.add(this.viewModel.onDidChange(() => {
				this.slashCommandsPromise = undefined;
				this.onDidChangeItems();
			}));
			this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
				this.viewModel = undefined;
				this.onDidChangeItems();
			}));

			if (this.tree) {
				this.onDidChangeItems();
			}
		};
		this.currentViewModelPromise = doInitializeSessionModel()
			.then(() => this.viewModel);
		await this.currentViewModelPromise;
	}

	async acceptInput(query?: string | IInteractiveSessionReplyFollowup): Promise<void> {
		if (!this.viewModel) {
			// This currently shouldn't happen anymore, but leaving this here to make sure we don't get stuck without a viewmodel
			await this.initializeSessionModel();
		}

		if (this.viewModel) {
			const editorValue = this._inputEditor.getValue();
			if (!query && editorValue) {
				// Followups and programmatic messages don't go to history
				this.history.add(editorValue);
			}

			// Shortcut for /clear command
			if (!query && editorValue.trim() === '/clear') {
				// If this becomes a repeated pattern, we should have a real internal slash command provider system
				this.clear();
				this._inputEditor.setValue('');
				return;
			}

			const input = query ?? editorValue;
			const result = this.interactiveSessionService.sendRequest(this.viewModel.sessionId, input);
			if (result) {
				this.requestInProgress.set(true);
				result.completePromise.finally(() => {
					this.requestInProgress.set(false);
				});

				this._inputEditor.setValue('');
				revealLastElement(this.tree);
			}
		}
	}

	async waitForViewModel(): Promise<IInteractiveSessionViewModel | undefined> {
		return this.currentViewModelPromise;
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

	async clear(): Promise<void> {
		if (this.viewModel) {
			this.interactiveSessionService.clearSession(this.viewModel.sessionId);
			await this.initializeSessionModel();
			this.focusInput();
			this.renderWelcomeView(this.container);
		}
	}

	getModel(): IInteractiveSessionViewModel | undefined {
		return this.viewModel;
	}

	layout(height: number, width: number): void {
		this.bodyDimension = new dom.Dimension(width, height);
		const followupsHeight = this.followupsContainer.offsetHeight;
		const inputPartBorder = 1;
		const inputPartPadding = 24;
		const inputEditorHeight = Math.min(this._inputEditor.getContentHeight(), height - followupsHeight - inputPartPadding - inputPartBorder, INPUT_EDITOR_MAX_HEIGHT);
		const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
		const inputEditorBorder = 2;
		const inputPartHeight = followupsHeight + inputEditorHeight + inputPartPadding + inputPartBorder + inputEditorBorder;
		const listHeight = height - inputPartHeight;

		this.tree.layout(listHeight, width);
		this.tree.getHTMLElement().style.height = `${listHeight}px`;
		this.renderer.layout(width);
		if (lastElementVisible) {
			revealLastElement(this.tree);
		}

		this.welcomeViewContainer.style.height = `${height - inputPartHeight}px`;
		this.listContainer.style.height = `${height - inputPartHeight}px`;

		const editorBorder = 2;
		const editorPadding = 8;
		const executeToolbarWidth = 25;
		this._inputEditor.layout({ width: width - inputPartPadding - editorBorder - editorPadding - executeToolbarWidth, height: inputEditorHeight });
	}

	saveState(): void {
		const inputHistory = this.history.getHistory();
		this.historyService.saveHistory(this.providerId, inputHistory);

		this.viewState.inputValue = this._inputEditor.getValue();
		this.memento.saveMemento();
	}

	public override dispose(): void {
		this.saveState();
		super.dispose();

		if (this.viewModel) {
			this.interactiveSessionService.releaseSession(this.viewModel.sessionId);
		}
	}
}

export class InteractiveSessionWidgetService implements IInteractiveSessionWidgetService {

	declare readonly _serviceBrand: undefined;

	private _widgets: InteractiveSessionWidget[] = [];
	private _lastFocusedWidget: InteractiveSessionWidget | undefined = undefined;

	get lastFocusedWidget(): InteractiveSessionWidget | undefined {
		return this._lastFocusedWidget;
	}

	constructor() { }

	getWidgetByInputUri(uri: URI): InteractiveSessionWidget | undefined {
		return this._widgets.find(w => isEqual(w.inputUri, uri));
	}

	private setLastFocusedWidget(widget: InteractiveSessionWidget | undefined): void {
		if (widget === this._lastFocusedWidget) {
			return;
		}

		this._lastFocusedWidget = widget;
	}

	register(newWidget: InteractiveSessionWidget): IDisposable {
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
