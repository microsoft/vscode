/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { ITreeContextMenuEvent, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/interactiveSession';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { foreground } from 'vs/platform/theme/common/colorRegistry';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IInteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { IInteractiveSessionRendererDelegate, InteractiveListItemRenderer, InteractiveSessionAccessibilityProvider, InteractiveSessionListDelegate, InteractiveTreeItem } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionListRenderer';
import { InteractiveSessionEditorOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { IInteractiveSessionService, IInteractiveSlashCommand } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveSessionViewModel, InteractiveSessionViewModel, isRequestVM, isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
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

export const CONTEXT_IN_INTERACTIVE_INPUT = new RawContextKey<boolean>('inInteractiveInput', false, { type: 'boolean', description: localize('inInteractiveInput', "True when focus is in the interactive input, false otherwise.") });
export const CONTEXT_IN_INTERACTIVE_SESSION = new RawContextKey<boolean>('inInteractiveSession', false, { type: 'boolean', description: localize('inInteractiveSession', "True when focus is in the interactive session widget, false otherwise.") });

function revealLastElement(list: WorkbenchObjectTree<any>) {
	list.scrollTop = list.scrollHeight - list.renderHeight;
}

const INPUT_EDITOR_MAX_HEIGHT = 275;

export class InteractiveSessionWidget extends Disposable implements IInteractiveSessionWidget {
	public static readonly CONTRIBS: { new(...args: [IInteractiveSessionWidget, ...any]): any }[] = [];
	public static readonly INPUT_SCHEME = 'interactiveSessionInput';

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

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

	private inputOptions!: InteractiveSessionEditorOptions;
	private inputModel: ITextModel | undefined;
	private listContainer!: HTMLElement;
	private container!: HTMLElement;
	private welcomeViewContainer!: HTMLElement;
	private welcomeViewDisposables = this._register(new DisposableStore());
	private bodyDimension: dom.Dimension | undefined;
	private visible = false;

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
		this.getSlashCommands(); // start the refresh

		this._onDidChangeViewModel.fire();
	}

	get viewModel() {
		return this._viewModel;
	}

	private lastSlashCommands: IInteractiveSlashCommand[] | undefined;
	private slashCommandsPromise: Promise<IInteractiveSlashCommand[] | undefined> | undefined;

	constructor(
		private readonly providerId: string,
		private readonly viewId: string | undefined,
		private readonly listBackgroundColorDelegate: () => string,
		private readonly inputEditorBackgroundColorDelegate: () => string,
		private readonly resultEditorBackgroundColorDelegate: () => string,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService,
		@IInteractiveSessionWidgetService interactiveSessionWidgetService: IInteractiveSessionWidgetService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();
		CONTEXT_IN_INTERACTIVE_SESSION.bindTo(contextKeyService).set(true);

		this._register((interactiveSessionWidgetService as InteractiveSessionWidgetService).register(this));
		this.initializeSessionModel(true);
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
			const items = this.viewModel?.getItems() ?? [];
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

			const lastItem = treeItems[treeItems.length - 1];
			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId(element) {
						const isLastAndResponse = isResponseVM(element) && element === lastItem.element;
						return element.id + (isLastAndResponse ? '_last' : '');
					},
				}
			});
		}
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (visible) {
			if (!this.inputModel) {
				this.inputModel = this.modelService.getModel(this.inputUri) || this.modelService.createModel('', null, this.inputUri, true);
			}
			this._inputEditor.setModel(this.inputModel);

			// Not sure why this is needed- the view is being rendered before it's visible, and then the list content doesn't show up
			this.onDidChangeItems();
		}
	}

	async getSlashCommands(): Promise<IInteractiveSlashCommand[] | undefined> {
		if (!this.viewModel) {
			return;
		}

		if (!this.slashCommandsPromise) {
			this.slashCommandsPromise = this.interactiveSessionService.getSlashCommands(this.viewModel.sessionId, CancellationToken.None);
			this.slashCommandsPromise.then(commands => this.lastSlashCommands = commands);
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
			this.setWelcomeViewVisible(true);
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
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: InteractiveTreeItem) => isRequestVM(e) ? e.message : e.response.value },
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
		this._register(this.renderer.onDidSelectFollowup(followup => {
			this.acceptInput(followup);
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
		const inputContainer = dom.append(container, $('.interactive-input-wrapper'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		CONTEXT_IN_INTERACTIVE_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const options = getSimpleEditorOptions();
		options.readOnly = false;
		options.ariaLabel = localize('interactiveSessionInput', "Interactive Session Input");
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = { top: 8, bottom: 7 };
		options.cursorWidth = 1;
		options.wrappingStrategy = 'advanced';

		const inputEditorElement = dom.append(inputContainer, $('.interactive-input-editor'));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, inputEditorElement, options, { ...getSimpleCodeEditorWidgetOptions(), isSimpleWidget: false }));

		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.min(this._inputEditor.getContentHeight(), INPUT_EDITOR_MAX_HEIGHT);
			if (this.bodyDimension && currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}
		}));
		this._register(this._inputEditor.onDidFocusEditorText(() => this._onDidFocus.fire()));

		this._register(dom.addStandardDisposableListener(inputContainer, dom.EventType.FOCUS, () => inputContainer.classList.add('synthetic-focus')));
		this._register(dom.addStandardDisposableListener(inputContainer, dom.EventType.BLUR, () => inputContainer.classList.remove('synthetic-focus')));
	}

	private async initializeSessionModel(initial = false) {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const model = await this.interactiveSessionService.startSession(this.providerId, initial, CancellationToken.None);
		if (!model) {
			throw new Error('Failed to start session');
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
	}

	async acceptInput(query?: string): Promise<void> {
		if (!this.viewModel) {
			await this.initializeSessionModel();
		}

		if (this.viewModel) {
			const input = query ?? this._inputEditor.getValue();
			if (this.interactiveSessionService.sendRequest(this.viewModel.sessionId, input, CancellationToken.None)) {
				this._inputEditor.setValue('');
				revealLastElement(this.tree);
			}
		}
	}

	focusLastMessage(): void {
		if (!this.viewModel) {
			return;
		}

		const items = this.viewModel.getItems();
		const lastItem = items[items.length - 1];
		if (!lastItem) {
			return;
		}

		this.tree.setFocus([lastItem]);
		this.tree.domFocus();
	}

	clear(): void {
		if (this.viewModel) {
			this.interactiveSessionService.clearSession(this.viewModel.sessionId);
			this.focusInput();
			this.renderWelcomeView(this.container);
		}
	}

	getModel(): IInteractiveSessionViewModel | undefined {
		return this.viewModel;
	}

	layout(height: number, width: number): void {
		this.bodyDimension = new dom.Dimension(width, height);
		const inputHeight = Math.min(this._inputEditor.getContentHeight(), height, INPUT_EDITOR_MAX_HEIGHT);
		const inputWrapperPadding = 24;
		const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
		const listHeight = height - inputHeight - inputWrapperPadding;

		this.tree.layout(listHeight, width);
		this.tree.getHTMLElement().style.height = `${listHeight}px`;
		this.renderer.layout(width);
		if (lastElementVisible) {
			revealLastElement(this.tree);
		}

		this.welcomeViewContainer.style.height = `${height - inputHeight - inputWrapperPadding}px`;
		this.listContainer.style.height = `${height - inputHeight - inputWrapperPadding}px`;

		this._inputEditor.layout({ width: width - inputWrapperPadding, height: inputHeight });
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
