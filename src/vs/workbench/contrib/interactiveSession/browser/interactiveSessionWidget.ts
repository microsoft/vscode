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
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/interactiveSession';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { foreground } from 'vs/platform/theme/common/colorRegistry';
import { Memento } from 'vs/workbench/common/memento';
import { IViewsService } from 'vs/workbench/common/views';
import { IInteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { InteractiveSessionInputPart } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionInputPart';
import { IInteractiveSessionRendererDelegate, InteractiveListItemRenderer, InteractiveSessionAccessibilityProvider, InteractiveSessionListDelegate, InteractiveTreeItem } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionListRenderer';
import { InteractiveSessionEditorOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { InteractiveSessionViewPane } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionViewPane';
import { CONTEXT_INTERACTIVE_REQUEST_IN_PROGRESS, CONTEXT_IN_INTERACTIVE_SESSION } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContributionService';
import { IInteractiveSessionModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveSessionReplyFollowup, IInteractiveSessionService, IInteractiveSlashCommand } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { InteractiveSessionViewModel, isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';

export const IInteractiveSessionWidgetService = createDecorator<IInteractiveSessionWidgetService>('interactiveSessionWidgetService');

export interface IInteractiveSessionWidgetService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 */
	readonly lastFocusedWidget: IInteractiveSessionWidget | undefined;

	/**
	 * Returns whether a view was successfully revealed.
	 */
	revealViewForProvider(providerId: string): Promise<IInteractiveSessionWidget | undefined>;

	getWidgetByInputUri(uri: URI): IInteractiveSessionWidget | undefined;
}

const $ = dom.$;

function revealLastElement(list: WorkbenchObjectTree<any>) {
	list.scrollTop = list.scrollHeight - list.renderHeight;
}

interface IViewState {
	inputValue: string;
	// renderData
}

export type IInteractiveSessionWidgetViewContext = { viewId: string } | { resource: URI };

export class InteractiveSessionWidget extends Disposable implements IInteractiveSessionWidget {
	public static readonly CONTRIBS: { new(...args: [IInteractiveSessionWidget, ...any]): any }[] = [];

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidChangeViewModel = this._register(new Emitter<void>());
	readonly onDidChangeViewModel = this._onDidChangeViewModel.event;

	private tree!: WorkbenchObjectTree<InteractiveTreeItem>;
	private renderer!: InteractiveListItemRenderer;

	private inputPart!: InteractiveSessionInputPart;
	private editorOptions!: InteractiveSessionEditorOptions;

	private listContainer!: HTMLElement;
	private container!: HTMLElement;

	private bodyDimension: dom.Dimension | undefined;
	private visible = false;
	private visibleChangeCount = 0;
	private requestInProgress: IContextKey<boolean>;

	private previousTreeScrollHeight: number = 0;

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

	private viewState: IViewState;

	constructor(
		readonly providerId: string,
		initialModel: IInteractiveSessionModel | undefined,
		readonly viewContext: IInteractiveSessionWidgetViewContext,
		private readonly listBackgroundColorDelegate: () => string,
		private readonly inputEditorBackgroundColorDelegate: () => string,
		private readonly resultEditorBackgroundColorDelegate: () => string,
		private readonly memento: Memento,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService,
		@IInteractiveSessionWidgetService interactiveSessionWidgetService: IInteractiveSessionWidgetService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();
		CONTEXT_IN_INTERACTIVE_SESSION.bindTo(contextKeyService).set(true);
		this.requestInProgress = CONTEXT_INTERACTIVE_REQUEST_IN_PROGRESS.bindTo(contextKeyService);

		this._register((interactiveSessionWidgetService as InteractiveSessionWidgetService).register(this));
		this.initializeSessionModel(true, initialModel);

		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.USER) as IViewState;
	}

	get inputEditor(): ICodeEditor {
		return this.inputPart.inputEditor!;
	}

	get inputUri(): URI {
		return this.inputPart.inputUri;
	}

	render(parent: HTMLElement): void {
		this.container = dom.append(parent, $('.interactive-session'));
		this.listContainer = dom.append(this.container, $(`.interactive-list`));

		const viewId = 'viewId' in this.viewContext ? this.viewContext.viewId : undefined;
		this.editorOptions = this._register(this.instantiationService.createInstance(InteractiveSessionEditorOptions, viewId, this.inputEditorBackgroundColorDelegate, this.resultEditorBackgroundColorDelegate));
		this.createList(this.listContainer);
		this.createInput(this.container);

		this._register(this.editorOptions.onDidChange(() => this.onDidStyleChange()));
		this.onDidStyleChange();

		// Do initial render
		if (this.viewModel) {
			this.onDidChangeItems();
			revealLastElement(this.tree);
		}

		InteractiveSessionWidget.CONTRIBS.forEach(contrib => this._register(this.instantiationService.createInstance(contrib, this)));
	}

	focusInput(): void {
		this.inputPart.focus();
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

			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => {
						return element.id +
							// Ensure re-rendering an element once slash commands are loaded, so the colorization can be applied.
							`${(isRequestVM(element) || isWelcomeVM(element)) && !!this.lastSlashCommands ? '_scLoaded' : ''}` +
							// If a response is in the process of progressive rendering, we need to ensure that it will
							// be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
							`${isResponseVM(element) && element.renderData ? `_${this.visibleChangeCount}` : ''}`;
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
			// Progressive rendering paused while hidden, so start it up again
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

	private createList(listContainer: HTMLElement): void {
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
		const delegate = scopedInstantiationService.createInstance(InteractiveSessionListDelegate);
		const rendererDelegate: IInteractiveSessionRendererDelegate = {
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			getSlashCommands: () => this.lastSlashCommands ?? [],
		};
		this.renderer = this._register(scopedInstantiationService.createInstance(InteractiveListItemRenderer, this.editorOptions, rendererDelegate));
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

	private createInput(container: HTMLElement): void {
		this.inputPart = this.instantiationService.createInstance(InteractiveSessionInputPart, this.providerId);
		this.inputPart.render(container, this.viewState.inputValue, this);

		this._register(this.inputPart.onDidFocus(() => this._onDidFocus.fire()));
		this._register(this.inputPart.onDidAcceptFollowup(followup => this.acceptInput(followup)));
		this._register(this.inputPart.onDidChangeHeight(() => this.bodyDimension && this.layout(this.bodyDimension.height, this.bodyDimension.width)));
	}

	private onDidStyleChange(): void {
		this.container.style.setProperty('--vscode-interactive-result-editor-background-color', this.editorOptions.configuration.resultEditor.backgroundColor?.toString() ?? '');
	}

	private initializeSessionModel(initial = false, initialModel?: IInteractiveSessionModel | undefined) {
		const model = initialModel ?? this.interactiveSessionService.startSession(this.providerId, initial, CancellationToken.None);
		if (!model) {
			throw new Error('Failed to start session');
		}

		this.viewModel = this.instantiationService.createInstance(InteractiveSessionViewModel, model);
		this.viewModelDisposables.add(this.viewModel.onDidChange(() => {
			this.slashCommandsPromise = undefined;
			this.requestInProgress.set(this.viewModel!.requestInProgress);
			this.onDidChangeItems();
		}));
		this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
			this.viewModel = undefined;
			this.onDidChangeItems();
		}));

		if (this.tree) {
			this.onDidChangeItems();
			revealLastElement(this.tree);
		}
	}

	async acceptInput(query?: string | IInteractiveSessionReplyFollowup): Promise<void> {
		if (this.viewModel) {
			const editorValue = this.inputPart.inputEditor.getValue();

			// Shortcut for /clear command
			if (!query && editorValue.trim() === '/clear') {
				// If this becomes a repeated pattern, we should have a real internal slash command provider system
				this.clear();
				this.inputPart.inputEditor.setValue('');
				return;
			}

			const input = query ?? editorValue;
			const result = await this.interactiveSessionService.sendRequest(this.viewModel.sessionId, input);
			if (result) {
				revealLastElement(this.tree);
				this.inputPart.acceptInput(query);
			}
		}
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
			this.initializeSessionModel();
			this.focusInput();
		}
	}

	layout(height: number, width: number): void {
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

		this.viewState.inputValue = this.inputPart.inputEditor.getValue();
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

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@IInteractiveSessionContributionService private readonly interactiveSessionContributionService: IInteractiveSessionContributionService,
	) { }

	getWidgetByInputUri(uri: URI): InteractiveSessionWidget | undefined {
		return this._widgets.find(w => isEqual(w.inputUri, uri));
	}

	async revealViewForProvider(providerId: string): Promise<InteractiveSessionWidget | undefined> {
		const viewId = this.interactiveSessionContributionService.getViewIdForProvider(providerId);
		const view = await this.viewsService.openView<InteractiveSessionViewPane>(viewId);

		return view?.widget;
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
