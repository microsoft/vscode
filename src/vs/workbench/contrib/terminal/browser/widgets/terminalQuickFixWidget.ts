/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionSet, ActionShowOptions, ListMenuItem, stripNewlines } from 'vs/base/browser/ui/baseActionWidget/baseActionWidget';
import { IAction } from 'vs/base/common/actions';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ActionItemRenderer, ActionList, ActionListItemKind, ActionWidget, HeaderRenderer, IRenderDelegate } from 'vs/editor/contrib/actionWidget/browser/actionWidget';
import { localize } from 'vs/nls';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { Codicon } from 'vs/base/common/codicons';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const acceptSelectedTerminalQuickFixCommand = 'acceptSelectedTerminalQuickFixCommand';
export const previewSelectedTerminalQuickFixCommand = 'previewSelectedTerminalQuickFixCommand';
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

	override renderWidget(element: HTMLElement, trigger: string, actions: ActionSet<TerminalQuickFix>, options: ActionShowOptions, showingActions: readonly TerminalQuickFix[], delegate: IRenderDelegate<TerminalQuickFix>): IDisposable {
		const widget = document.createElement('div');
		widget.classList.add('actionWidget');
		element.appendChild(widget);
		const onDidSelect = async (action: TerminalQuickFix, preview?: boolean) => {
			await delegate.onSelect(action, trigger, preview);
			this.hide();
		};
		this.list.value = new QuickFixList(
			showingActions,
			options.showHeaders ?? true,
			onDidSelect,
			this.keybindingService,
			this.contextViewService);


		widget.appendChild(this.list.value.domNode);
		return super.renderWidget(element, trigger, actions, options, showingActions, delegate, widget);
	}
}

class QuickFixList extends ActionList<TerminalQuickFix> {
	constructor(
		fixes: readonly TerminalQuickFix[],
		showHeaders: boolean,
		onDidSelect: (fix: TerminalQuickFix, preview?: boolean) => void,
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
			kind: ActionListItemKind.Header,
			group: {
				kind: CodeActionKind.QuickFix,
				title: 'Quick fix...',
				icon: { codicon: Codicon.lightBulb }
			}
		});
		for (const action of showHeaders ? inputActions : inputActions.filter(i => !!i.action)) {
			if (!action.disabled && action.action) {
				menuItems.push({
					kind: ActionListItemKind.Action,
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
	readonly item?: TerminalQuickFix;
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
		TerminalQuickFixWidget.INSTANCE?.acceptSelected(true);
	}
});

