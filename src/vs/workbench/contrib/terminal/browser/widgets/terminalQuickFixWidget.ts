/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionSet, ActionShowOptions, BaseActionWidget, ListMenuItem } from 'vs/base/browser/ui/baseActionWidget/baseActionWidget';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ActionList } from 'vs/editor/contrib/codeAction/browser/actionList';
import { ActionGroup } from 'vs/editor/contrib/codeAction/browser/codeActionWidget';
import { localize } from 'vs/nls';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as dom from 'vs/base/browser/dom';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { Codicon } from 'vs/base/common/codicons';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';

export class TerminalQuickFix extends Disposable {
	action?: IAction;
	disabled?: boolean;
	constructor(action: IAction, disabled?: boolean) {
		super();
		this.action = action;
		this.disabled = disabled;
	}
}

export const Context = {
	Visible: new RawContextKey<boolean>('terminalQuickFixMenuVisible', false, localize('terminalQuickFixMenuVisible', "Whether the terminal quick fix menu is visible"))
};

interface ITerminalQuickFixDelegate {
	onSelectQuickFix(fix: TerminalQuickFix, trigger: string, options: { readonly preview: boolean }): Promise<any>;
	onHide(cancelled: boolean): void;
}

export class TerminalQuickFixWidget extends BaseActionWidget<TerminalQuickFix> {

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService
	) {
		super();
	}

	private static _instance?: TerminalQuickFixWidget;

	private _currentShowingContext?: {
		readonly options: ActionShowOptions;
		readonly trigger: string;
		readonly anchor: IAnchor;
		readonly container: HTMLElement | undefined;
		readonly actions: ActionSet<TerminalQuickFix>;
		readonly delegate: ITerminalQuickFixDelegate;
	};

	public static get INSTANCE(): TerminalQuickFixWidget | undefined { return this._instance; }

	public static getOrCreateInstance(instantiationService: IInstantiationService): BaseActionWidget<TerminalQuickFix> {
		if (!this._instance) {
			this._instance = instantiationService.createInstance(TerminalQuickFixWidget);
		}
		return this._instance;
	}

	public async show(trigger: string, actions: ActionSet<TerminalQuickFix>, anchor: IAnchor, container: HTMLElement | undefined, options: ActionShowOptions, delegate: ITerminalQuickFixDelegate): Promise<void> {
		this._currentShowingContext = undefined;
		const visibleContext = Context.Visible.bindTo(this._contextKeyService);

		const actionsToShow = options.includeDisabledActions && (this.showDisabled || actions.validActions.length === 0) ? actions.allActions : actions.validActions;
		if (!actionsToShow.length) {
			visibleContext.reset();
			return;
		}

		this._currentShowingContext = { trigger, actions, anchor, container, delegate, options };

		this._contextViewService.showContextView({
			getAnchor: () => anchor,
			render: (container: HTMLElement) => {
				visibleContext.set(true);
				return this._renderWidget(container, trigger, actions, options, actionsToShow, delegate);
			},
			onHide: (didCancel: boolean) => {
				visibleContext.reset();
				return this._onWidgetClosed(trigger, options, actions, didCancel, delegate);
			},
		}, container, false);
	}

	private _onWidgetClosed(trigger: string, options: ActionShowOptions, actions: ActionSet<TerminalQuickFix>, cancelled: boolean, delegate: ITerminalQuickFixDelegate): void {
		this._currentShowingContext = undefined;
		delegate.onHide(cancelled);
	}

	private _renderWidget(element: HTMLElement, trigger: string, actions: ActionSet<TerminalQuickFix>, options: ActionShowOptions, showingActions: readonly TerminalQuickFix[], delegate: ITerminalQuickFixDelegate): IDisposable {
		const renderDisposables = new DisposableStore();

		const widget = document.createElement('div');
		widget.classList.add('codeActionWidget');
		element.appendChild(widget);
		const onDidSelect = (action: TerminalQuickFix, options: { readonly preview: boolean }) => {
			this.hide();
			delegate.onSelectQuickFix(action as TerminalQuickFix, trigger, options);
		};
		const focusCondition = (element: ListMenuItem<TerminalQuickFix>) => { return !element?.item?.disabled; };
		this.list.value = new QuickFixList({
			user: 'terminalQuickFix',
			renderers: [],
		},
			showingActions,
			options.showHeaders ?? true,
			'acceptTerminalQuickFixAction',
			focusCondition,
			onDidSelect,
			this._contextViewService);

		widget.appendChild(this.list.value.domNode);

		// Invisible div to block mouse interaction in the rest of the UI
		const menuBlock = document.createElement('div');
		const block = element.appendChild(menuBlock);
		block.classList.add('context-view-block');
		block.style.position = 'fixed';
		block.style.cursor = 'initial';
		block.style.left = '0';
		block.style.top = '0';
		block.style.width = '100%';
		block.style.height = '100%';
		block.style.zIndex = '-1';
		renderDisposables.add(dom.addDisposableListener(block, dom.EventType.MOUSE_DOWN, e => e.stopPropagation()));

		// Invisible div to block mouse interaction with the menu
		const pointerBlockDiv = document.createElement('div');
		const pointerBlock = element.appendChild(pointerBlockDiv);
		pointerBlock.classList.add('context-view-pointerBlock');
		pointerBlock.style.position = 'fixed';
		pointerBlock.style.cursor = 'initial';
		pointerBlock.style.left = '0';
		pointerBlock.style.top = '0';
		pointerBlock.style.width = '100%';
		pointerBlock.style.height = '100%';
		pointerBlock.style.zIndex = '2';

		// Removes block on click INSIDE widget or ANY mouse movement
		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.MOUSE_DOWN, () => pointerBlock.remove()));

		// Action bar
		let actionBarWidth = 0;
		if (!options.fromLightbulb) {
			const actionBar = this._createActionBar(actions, options);
			if (actionBar) {
				widget.appendChild(actionBar.getContainer().parentElement!);
				renderDisposables.add(actionBar);
				actionBarWidth = actionBar.getContainer().offsetWidth;
			}
		}

		const width = this.list.value.layout(actionBarWidth);
		widget.style.width = `${width}px`;

		const focusTracker = renderDisposables.add(dom.trackFocus(element));
		renderDisposables.add(focusTracker.onDidBlur(() => this.hide()));

		return renderDisposables;
	}


	private _createActionBar(inputActions: ActionSet<TerminalQuickFix>, options: ActionShowOptions): ActionBar | undefined {
		const actions = this._getActionBarActions(inputActions, options);
		if (!actions.length) {
			return undefined;
		}

		const container = dom.$('.codeActionWidget-action-bar');
		const actionBar = new ActionBar(container);
		actionBar.push(actions, { icon: false, label: true });
		return actionBar;
	}

	private _getActionBarActions(inputActions: ActionSet<TerminalQuickFix>, options: ActionShowOptions): IAction[] {
		const actions = inputActions.documentation.map((command): IAction => ({
			id: command.id,
			label: command.title,
			tooltip: command.tooltip ?? '',
			class: undefined,
			enabled: true,
			run: () => this._commandService.executeCommand(command.id, ...(command.arguments ?? [])),
		}));

		if (options.includeDisabledActions && inputActions.validActions.length > 0 && inputActions.allActions.length !== inputActions.validActions.length) {
			actions.push(this.showDisabled ? {
				id: 'hideMoreactions',
				label: localize('hideMoreactions', 'Hide Disabled'),
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => this._toggleShowDisabled(false)
			} : {
				id: 'showMoreactions',
				label: localize('showMoreactions', 'Show Disabled'),
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => this._toggleShowDisabled(true)
			});
		}

		return actions;
	}

	/**
	 * Toggles whether the disabled actions in the code action widget are visible or not.
	 */
	private _toggleShowDisabled(newShowDisabled: boolean): void {
		const previousCtx = this._currentShowingContext;

		this.hide();

		this.showDisabled = newShowDisabled;

		if (previousCtx) {
			this.show(previousCtx.trigger, previousCtx.actions, previousCtx.anchor, previousCtx.container, previousCtx.options, previousCtx.delegate);
		}
	}
}

class QuickFixList extends ActionList<TerminalQuickFix> {
	public toMenuItems(inputActions: readonly TerminalQuickFix[], showHeaders: boolean): TerminalQuickFixListItem[] {
		const menuItems: TerminalQuickFixListItem[] = [];
		for (const action of inputActions) {
			if (!action.disabled && action.action) {
				menuItems.push({
					kind: 'terminal-quick-fix',
					item: action,
					group: {
						kind: CodeActionKind.QuickFix,
						icon: { codicon: Codicon.terminal, color: 'red' },
						title: action.action!.label
					}
				} as TerminalQuickFixListItem);
			}
		}
		return menuItems;
	}
}

interface TerminalQuickFixListItem extends ListMenuItem<TerminalQuickFix> {
	readonly kind: 'terminal-quick-fix';
	readonly item: TerminalQuickFix;
	readonly group: ActionGroup;
}
