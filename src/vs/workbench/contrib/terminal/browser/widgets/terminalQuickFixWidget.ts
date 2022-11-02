/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionSet, ActionShowOptions, BaseActionWidget, ListMenuItem, stripNewlines } from 'vs/base/browser/ui/baseActionWidget/baseActionWidget';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ActionItemRenderer, ActionList, HeaderRenderer, IActionMenuTemplateData } from 'vs/editor/contrib/actionWidget/browser/actionWidget';
import { localize } from 'vs/nls';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as dom from 'vs/base/browser/dom';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { Codicon } from 'vs/base/common/codicons';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ActionGroup } from 'vs/editor/contrib/codeAction/browser/codeActionWidget';

const acceptSelectedTerminalQuickFixCommand = 'acceptSelectedTerminalQuickFixCommand';
const previewSelectedTerminalQuickFixCommand = 'previewSelectedTerminalQuickFixCommand';
const weight = KeybindingWeight.EditorContrib + 1000;

export class TerminalQuickFix extends Disposable {
	action?: IAction;
	disabled?: boolean;
	title?: string;
	constructor(action?: IAction, title?: string, disabled?: boolean) {
		super();
		this.action = action;
		this.disabled = disabled;
		this.title = title;
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

	private static _instance?: TerminalQuickFixWidget;

	public static get INSTANCE(): TerminalQuickFixWidget | undefined { return this._instance; }

	public static getOrCreateInstance(instantiationService: IInstantiationService): TerminalQuickFixWidget {
		if (!this._instance) {
			this._instance = instantiationService.createInstance(TerminalQuickFixWidget);
		}
		return this._instance;
	}

	private _currentShowingContext?: {
		readonly options: ActionShowOptions;
		readonly trigger: string;
		readonly anchor: IAnchor;
		readonly container: HTMLElement | undefined;
		readonly actions: ActionSet<TerminalQuickFix>;
		readonly delegate: ITerminalQuickFixDelegate;
	};

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
	}

	get isVisible(): boolean {
		return !!this._currentShowingContext;
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

	private _renderWidget(element: HTMLElement, trigger: string, actions: ActionSet<TerminalQuickFix>, options: ActionShowOptions, showingActions: readonly TerminalQuickFix[], delegate: ITerminalQuickFixDelegate): IDisposable {
		const renderDisposables = new DisposableStore();

		const widget = document.createElement('div');
		widget.classList.add('terminalQuickFixWidget');
		element.appendChild(widget);
		const onDidSelect = async (action: TerminalQuickFix, options: { readonly preview: boolean }) => {
			await delegate.onSelectQuickFix(action, trigger, options);
			this.hide();
		};
		this.list.value = new QuickFixList(
			showingActions,
			options.showHeaders ?? true,
			onDidSelect,
			this._keybindingService,
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

	private _onWidgetClosed(trigger: string, options: ActionShowOptions, actions: ActionSet<TerminalQuickFix>, cancelled: boolean, delegate: ITerminalQuickFixDelegate): void {
		this._currentShowingContext = undefined;
		delegate.onHide(cancelled);
	}

	/**
	 * Toggles whether the disabled actions in the quick fix widget are visible or not.
	 */
	private _toggleShowDisabled(newShowDisabled: boolean): void {
		const previousCtx = this._currentShowingContext;

		this.hide();

		this.showDisabled = newShowDisabled;

		if (previousCtx) {
			this.show(previousCtx.trigger, previousCtx.actions, previousCtx.anchor, previousCtx.container, previousCtx.options, previousCtx.delegate);
		}
	}

	private _createActionBar(inputActions: ActionSet<TerminalQuickFix>, options: ActionShowOptions): ActionBar | undefined {
		const actions = this._getActionBarActions(inputActions, options);
		if (!actions.length) {
			return undefined;
		}

		const container = dom.$('.quickFixActionWidget-action-bar');
		const actionBar = new ActionBar(container);
		actionBar.push(actions, { icon: false, label: true });
		return actionBar;
	}

	private _getActionBarActions(inputActions: ActionSet<TerminalQuickFix>, options: ActionShowOptions): IAction[] {
		const actions = [];
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
}

export class QuickFixItemRenderer extends ActionItemRenderer<ListMenuItem<TerminalQuickFix>> {
	constructor(
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
	}
	get templateId(): string {
		return 'action';
	}
	renderElement(element: ListMenuItem<TerminalQuickFix>, _index: number, data: IActionMenuTemplateData): void {
		if (element.group.icon) {
			data.icon.className = element.group.icon.codicon.classNames;
			data.icon.style.color = element.group.icon.color ?? '';
		} else {
			data.icon.className = Codicon.lightBulb.classNames;
			data.icon.style.color = 'var(--vscode-editorLightBulb-foreground)';
		}
		if (!element.item?.action?.label) {
			return;
		}
		data.text.textContent = stripNewlines(element.item?.action?.label);

		if (element.item.disabled) {
			data.container.title = element.item.action.label;
			data.container.classList.add('option-disabled');
		} else {
			data.container.title = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", this._keybindingService.lookupKeybinding(acceptSelectedTerminalQuickFixCommand)?.getLabel(), this._keybindingService.lookupKeybinding(previewSelectedTerminalQuickFixCommand)?.getLabel());
			data.container.classList.remove('option-disabled');
		}
	}
}

class QuickFixList extends ActionList<TerminalQuickFix> {
	constructor(
		fixes: readonly TerminalQuickFix[],
		showHeaders: boolean,
		onDidSelect: (fix: TerminalQuickFix, options: { readonly preview: boolean }) => void,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super({
			user: 'quickFixWidget',
			renderers: [
				new QuickFixItemRenderer(keybindingService),
				new HeaderRenderer(),
			],
			options: {
				keyboardSupport: true,
				accessibilityProvider: {
					getAriaLabel: element => {
						if (element.kind === 'action') {
							let label = stripNewlines(element.item.action.label);
							if (element.item.action.disabled) {
								label = localize({ key: 'customQuickFixWidget.labels', comment: ['terminal quick fix labels for accessibility.'] }, "{0}, Disabled Reason: {1}", label, element.item.disabled);
							}
							return label;
						}
						return null;
					},
					getWidgetAriaLabel: () => localize({ key: 'customQuickFixWidget', comment: ['A terminal quick fix Option'] }, "Terminal Quick Fix Widget"),
					getRole: () => 'option',
					getWidgetRole: () => 'terminal-quickfix-widget'
				},
			}
		}, fixes, showHeaders, previewSelectedTerminalQuickFixCommand, acceptSelectedTerminalQuickFixCommand, (element: ListMenuItem<TerminalQuickFix>) => { return element.kind !== 'header' && !element.item?.disabled; }, onDidSelect, contextViewService);
	}

	public toMenuItems(inputActions: readonly TerminalQuickFix[], showHeaders: boolean): ListMenuItem<TerminalQuickFix>[] {
		const menuItems: TerminalQuickFixListItem[] = [];
		menuItems.push({
			kind: 'header',
			group: {
				kind: CodeActionKind.QuickFix,
				title: 'Quick fix...',
				icon: { codicon: Codicon.lightBulb }
			}
		});
		for (const action of showHeaders ? inputActions : inputActions.filter(i => !!i.action)) {
			if (!action.disabled && action.action) {
				menuItems.push({
					kind: 'action',
					item: action,
					group: {
						kind: CodeActionKind.QuickFix,
						icon: { codicon: action.action.id === 'quickFix.opener' ? Codicon.link : Codicon.run },
						title: action.action!.label
					}
				});
			}
		}
		return menuItems;
	}
}

interface TerminalQuickFixListItem extends ListMenuItem<TerminalQuickFix> {
	readonly kind: 'action' | 'header';
	readonly item?: TerminalQuickFix;
	readonly group: ActionGroup;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'hideTerminalQuickFixWidget',
			title: {
				value: localize('hideTerminalQuickFixWidget.title', "Hide terminal quick fix widget"),
				original: 'Hide terminal quick fix widget'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape]
			},
		});
	}

	run(): void {
		TerminalQuickFixWidget.INSTANCE?.hide();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'selectPrevTerminalQuickFix',
			title: {
				value: localize('selectPrevTerminalQuickFix.title', "Select previous terminal quick fix"),
				original: 'Select previous terminal quick fix'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyCode.UpArrow,
				secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
				mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] },
			}
		});
	}

	run(): void {
		TerminalQuickFixWidget.INSTANCE?.focusPrevious();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'selectNextTerminalQuickFix',
			title: {
				value: localize('selectNextTerminalQuickFix.title', "Select next terminal quick fix"),
				original: 'Select next terminal quick fix'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyCode.DownArrow,
				secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
				mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
			}
		});
	}

	run(): void {
		TerminalQuickFixWidget.INSTANCE?.focusNext();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: acceptSelectedTerminalQuickFixCommand,
			title: {
				value: localize('acceptSelected.title', "Accept selected terminal quick fix"),
				original: 'Accept selected terminal quick fix'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyCode.Enter,
				secondary: [KeyMod.CtrlCmd | KeyCode.Period],
			}
		});
	}

	run(): void {
		TerminalQuickFixWidget.INSTANCE?.acceptSelected();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: previewSelectedTerminalQuickFixCommand,
			title: {
				value: localize('previewSelected.title', "Preview selected terminal quick fix"),
				original: 'Preview selected terminal quick fix'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
			}
		});
	}

	run(): void {
		TerminalQuickFixWidget.INSTANCE?.acceptSelected();
	}
});

