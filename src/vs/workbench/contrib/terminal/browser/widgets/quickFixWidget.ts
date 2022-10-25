// /*---------------------------------------------------------------------------------------------
//  *  Copyright (c) Microsoft Corporation. All rights reserved.
//  *  Licensed under the MIT License. See License.txt in the project root for license information.
//  *--------------------------------------------------------------------------------------------*/

// import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
// import { ActionItem, ActionMenuItem, ActionSet, ActionShowOptions, BaseActionWidget } from 'vs/base/browser/ui/baseActionWidget/baseActionWidget';
// import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
// import { List } from 'vs/base/browser/ui/list/listWidget';
// import { IAction } from 'vs/base/common/actions';
// import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
// import { ActionList } from 'vs/editor/contrib/codeAction/browser/actionList';
// import { CodeActionTrigger, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/common/types';
// import { localize } from 'vs/nls';
// import { ICommandService } from 'vs/platform/commands/common/commands';
// import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
// import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
// import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
// import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
// import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

// export const Context = {
// 	Visible: new RawContextKey<boolean>('codeActionMenuVisible', false, localize('terminalQuickFixMenuVisible', "Whether the terminal quick fix widget is visible"))
// };

// export interface ITerminalQuickFixDelegate {
// 	onSelectQuickFix(fix: ITerminalQuickFix): Promise<any>;
// 	onHide(cancelled: boolean): void;
// }

// export interface ITerminalQuickFix extends ActionMenuItem {
// 	title: string;
// 	kind?: string;
// 	id?: string;
// 	disabled?: string;
// }

// export class QuickFixWidget extends BaseActionWidget<ITerminalQuickFix> {

// 	private static _instance?: QuickFixWidget;

// 	public static get INSTANCE(): QuickFixWidget | undefined { return this._instance; }

// 	public static getOrCreateInstance(instantiationService: IInstantiationService): QuickFixWidget {
// 		if (!this._instance) {
// 			this._instance = instantiationService.createInstance(QuickFixWidget);
// 		}
// 		return this._instance;
// 	}

// 	private _currentShowingContext?: {
// 		readonly options: ActionShowOptions;
// 		readonly trigger: CodeActionTrigger;
// 		readonly anchor: IAnchor;
// 		readonly container: HTMLElement | undefined;
// 		readonly codeActions: ActionSet;
// 		readonly delegate: ITerminalQuickFixDelegate;
// 	};

// 	constructor(
// 		@ICommandService private readonly _commandService: ICommandService,
// 		@IContextViewService private readonly _contextViewService: IContextViewService,
// 		@IKeybindingService private readonly _keybindingService: IKeybindingService,
// 		@ITelemetryService private readonly _telemetryService: ITelemetryService,
// 		@IContextKeyService private readonly _contextKeyService: IContextKeyService
// 	) {
// 		super();
// 	}

// 	get isVisible(): boolean {
// 		return !!this._currentShowingContext;
// 	}

// 	public toMenuItems(actions: readonly TerminalQuickFix[], showHeaders: boolean): ActionMenuItem[] {
// 		const list = this.list.value;
// 		if (!list) {
// 			throw new Error('No list');
// 		}
// 		return list.toMenuItems(actions, showHeaders);
// 	}

// 	public async show(trigger: CodeActionTrigger, codeActions: ActionSet, anchor: IAnchor, container: HTMLElement | undefined, options: ActionShowOptions, delegate: ITerminalQuickFixDelegate): Promise<void> {
// 		this._currentShowingContext = undefined;
// 		const visibleContext = Context.Visible.bindTo(this._contextKeyService);

// 		const actionsToShow = options.includeDisabledActions && (this.showDisabled || codeActions.validActions.length === 0) ? codeActions.allActions : codeActions.validActions;
// 		if (!actionsToShow.length) {
// 			visibleContext.reset();
// 			return;
// 		}

// 		this._currentShowingContext = { trigger, codeActions, anchor, container, delegate, options };

// 		this._contextViewService.showContextView({
// 			getAnchor: () => anchor,
// 			render: (container: HTMLElement) => {
// 				visibleContext.set(true);
// 				return this._renderWidget(container, trigger, codeActions, options, actionsToShow, delegate);
// 			},
// 			onHide: (didCancel: boolean) => {
// 				visibleContext.reset();
// 				return this._onWidgetClosed(trigger, options, codeActions, didCancel, delegate);
// 			},
// 		}, container, false);
// 	}

// 	public acceptSelected(options?: { readonly preview?: boolean }) {
// 		this.list.value?.acceptSelected(options);
// 	}

// 	private _renderWidget(element: HTMLElement, trigger: CodeActionTrigger, actions: ActionSet, options: ActionShowOptions, showingActions: readonly ActionItem[], delegate: ITerminalQuickFixDelegate): IDisposable {
// 		const renderDisposables = new DisposableStore();

// 		const widget = document.createElement('div');
// 		widget.classList.add('codeActionWidget');
// 		element.appendChild(widget);

// 		this.list.value = new QuickFixList(
// 			new List(actions.allActions, widget,),
// 			showingActions,
// 			options.showHeaders ?? true,
// 			(action) => {
// 				this.hide();
// 				delegate.onSelectQuickFix(action);
// 			},
// 			this._keybindingService,
// 			this._contextViewService);

// 		widget.appendChild(this.list.value.domNode);

// 		// Invisible div to block mouse interaction in the rest of the UI
// 		const menuBlock = document.createElement('div');
// 		const block = element.appendChild(menuBlock);
// 		block.classList.add('context-view-block');
// 		block.style.position = 'fixed';
// 		block.style.cursor = 'initial';
// 		block.style.left = '0';
// 		block.style.top = '0';
// 		block.style.width = '100%';
// 		block.style.height = '100%';
// 		block.style.zIndex = '-1';
// 		renderDisposables.add(dom.addDisposableListener(block, dom.EventType.MOUSE_DOWN, e => e.stopPropagation()));

// 		// Invisible div to block mouse interaction with the menu
// 		const pointerBlockDiv = document.createElement('div');
// 		const pointerBlock = element.appendChild(pointerBlockDiv);
// 		pointerBlock.classList.add('context-view-pointerBlock');
// 		pointerBlock.style.position = 'fixed';
// 		pointerBlock.style.cursor = 'initial';
// 		pointerBlock.style.left = '0';
// 		pointerBlock.style.top = '0';
// 		pointerBlock.style.width = '100%';
// 		pointerBlock.style.height = '100%';
// 		pointerBlock.style.zIndex = '2';

// 		// Removes block on click INSIDE widget or ANY mouse movement
// 		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
// 		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.MOUSE_DOWN, () => pointerBlock.remove()));

// 		// Action bar
// 		let actionBarWidth = 0;
// 		if (!options.fromLightbulb) {
// 			const actionBar = this._createActionBar(actions, options);
// 			if (actionBar) {
// 				widget.appendChild(actionBar.getContainer().parentElement!);
// 				renderDisposables.add(actionBar);
// 				actionBarWidth = actionBar.getContainer().offsetWidth;
// 			}
// 		}

// 		const width = this.list.value.layout(actionBarWidth);
// 		widget.style.width = `${width}px`;

// 		const focusTracker = renderDisposables.add(dom.trackFocus(element));
// 		renderDisposables.add(focusTracker.onDidBlur(() => this.hide()));

// 		return renderDisposables;
// 	}

// 	/**
// 	 * Toggles whether the disabled actions in the code action widget are visible or not.
// 	 */
// 	private _toggleShowDisabled(newShowDisabled: boolean): void {
// 		const previousCtx = this._currentShowingContext;

// 		this.hide();

// 		this.showDisabled = newShowDisabled;

// 		if (previousCtx) {
// 			this.show(previousCtx.trigger, previousCtx.codeActions, previousCtx.anchor, previousCtx.container, previousCtx.options, previousCtx.delegate);
// 		}
// 	}

// 	private _onWidgetClosed(trigger: CodeActionTrigger, options: ActionShowOptions, codeActions: ActionSet, cancelled: boolean, delegate: ITerminalQuickFixDelegate): void {
// 		type ApplyCodeActionEvent = {
// 			codeActionFrom: CodeActionTriggerSource;
// 			validCodeActions: number;
// 			cancelled: boolean;
// 		};

// 		type ApplyCodeEventClassification = {
// 			codeActionFrom: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of action used to opened the code action.' };
// 			validCodeActions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The total number of valid actions that are highlighted and can be used.' };
// 			cancelled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The indicator if the menu was selected or cancelled.' };
// 			owner: 'mjbvz';
// 			comment: 'Event used to gain insights into how code actions are being triggered';
// 		};

// 		this._telemetryService.publicLog2<ApplyCodeActionEvent, ApplyCodeEventClassification>('codeAction.applyCodeAction', {
// 			codeActionFrom: options.fromLightbulb ? CodeActionTriggerSource.Lightbulb : trigger.triggerAction,
// 			validCodeActions: codeActions.validActions.length,
// 			cancelled: cancelled,
// 		});

// 		this._currentShowingContext = undefined;

// 		delegate.onHide(cancelled);
// 	}

// 	private _createActionBar(codeActions: ActionSet, options: ActionShowOptions): ActionBar | undefined {
// 		const actions = this._getActionBarActions(codeActions, options);
// 		if (!actions.length) {
// 			return undefined;
// 		}

// 		const container = dom.$('.codeActionWidget-action-bar');
// 		const actionBar = new ActionBar(container);
// 		actionBar.push(actions, { icon: false, label: true });
// 		return actionBar;
// 	}

// 	private _getActionBarActions(codeActions: ActionSet, options: ActionShowOptions): IAction[] {
// 		const actions = codeActions.documentation.map((command): IAction => ({
// 			id: command.id,
// 			label: command.title,
// 			tooltip: command.tooltip ?? '',
// 			class: undefined,
// 			enabled: true,
// 			run: () => this._commandService.executeCommand(command.id, ...(command.arguments ?? [])),
// 		}));

// 		if (options.includeDisabledActions && codeActions.validActions.length > 0 && codeActions.allActions.length !== codeActions.validActions.length) {
// 			actions.push(showDisabled ? {
// 				id: 'hideMoreCodeActions',
// 				label: localize('hideMoreCodeActions', 'Hide Disabled'),
// 				enabled: true,
// 				tooltip: '',
// 				class: undefined,
// 				run: () => this._toggleShowDisabled(false)
// 			} : {
// 				id: 'showMoreCodeActions',
// 				label: localize('showMoreCodeActions', 'Show Disabled'),
// 				enabled: true,
// 				tooltip: '',
// 				class: undefined,
// 				run: () => this._toggleShowDisabled(true)
// 			});
// 		}

// 		return actions;
// 	}
// }

// class QuickFixList extends ActionList<ITerminalQuickFix> {
// 	public toMenuItems(inputCodeActions: readonly ActionItem[], showHeaders: boolean): ITerminalQuickFix[] {
// 		throw new Error('Method not implemented.');
// 	}

// }
