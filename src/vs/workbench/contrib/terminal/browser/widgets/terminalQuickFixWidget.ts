/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionSet, ActionShowOptions, ListMenuItem, stripNewlines } from 'vs/base/browser/ui/baseActionWidget/baseActionWidget';
import { IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ActionItemRenderer, ActionList, ActionWidget, HeaderRenderer } from 'vs/editor/contrib/actionWidget/browser/actionWidget';
import { localize } from 'vs/nls';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as dom from 'vs/base/browser/dom';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { Codicon } from 'vs/base/common/codicons';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ActionGroup } from 'vs/editor/contrib/codeAction/browser/codeActionWidget';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

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

export class TerminalQuickFixWidget extends ActionWidget<TerminalQuickFix> {

	private static _instance?: TerminalQuickFixWidget;

	public static get INSTANCE(): TerminalQuickFixWidget | undefined { return this._instance; }

	public static getOrCreateInstance(instantiationService: IInstantiationService): TerminalQuickFixWidget {
		if (!this._instance) {
			this._instance = instantiationService.createInstance(TerminalQuickFixWidget);
		}
		return this._instance;
	}

	constructor(
		@ICommandService override readonly _commandService: ICommandService,
		@IContextViewService override readonly contextViewService: IContextViewService,
		@IKeybindingService override readonly keybindingService: IKeybindingService,
		@ITelemetryService override readonly _telemetryService: ITelemetryService,
		@IContextKeyService override readonly _contextKeyService: IContextKeyService
	) {
		super(Context.Visible, _commandService, contextViewService, keybindingService, _telemetryService, _contextKeyService);
	}

	renderWidget(element: HTMLElement, trigger: string, actions: ActionSet<TerminalQuickFix>, options: ActionShowOptions, showingActions: readonly TerminalQuickFix[], delegate: ITerminalQuickFixDelegate): IDisposable {
		const renderDisposables = new DisposableStore();

		const widget = document.createElement('div');
		widget.classList.add('codeActionWidget');
		element.appendChild(widget);
		const onDidSelect = async (action: TerminalQuickFix, options: { readonly preview: boolean }) => {
			await delegate.onSelectQuickFix(action, trigger, options);
			this.hide();
		};
		this.list.value = new QuickFixList(
			showingActions,
			options.showHeaders ?? true,
			onDidSelect,
			this.keybindingService,
			this.contextViewService);


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
			const actionBar = this.createActionBar('.terminalQuickFixWidget-action-bar', actions, options);
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

	onWidgetClosed(trigger: any, options: ActionShowOptions, actions: ActionSet<TerminalQuickFix>, cancelled: boolean, delegate: any): void {
		this.currentShowingContext = undefined;
		delegate.onHide(cancelled);
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
				new ActionItemRenderer<TerminalQuickFix>(acceptSelectedTerminalQuickFixCommand, previewSelectedTerminalQuickFixCommand, keybindingService),
				new HeaderRenderer(),
			],
			options: {
				keyboardSupport: true,
				accessibilityProvider: {
					getAriaLabel: element => {
						if (element.kind === 'code-action') {
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
					kind: 'code-action',
					item: action,
					group: {
						kind: CodeActionKind.QuickFix,
						icon: { codicon: action.action.id === 'quickFix.opener' ? Codicon.link : Codicon.run },
						title: action.action!.label
					},
					disabled: false,
					label: action.title
				});
			}
		}
		return menuItems;
	}
}

interface TerminalQuickFixListItem extends ListMenuItem<TerminalQuickFix> {
	readonly kind: 'code-action' | 'header';
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

