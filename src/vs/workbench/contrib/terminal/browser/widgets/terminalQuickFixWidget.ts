/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ActionItemRenderer, ActionList, ActionListItemKind, ActionShowOptions, ActionWidget, IRenderDelegate, ListMenuItem } from 'vs/platform/actionWidget/browser/actionWidget';
import { localize } from 'vs/nls';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { Codicon } from 'vs/base/common/codicons';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ActionSet } from 'vs/base/common/actionWidget/actionWidget';

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
			renderers: [new ActionItemRenderer<TerminalQuickFix>(keybindingService)],
		}, fixes, showHeaders, onDidSelect, contextViewService);
	}

	public toMenuItems(inputActions: readonly TerminalQuickFix[], showHeaders: boolean): ListMenuItem<TerminalQuickFix>[] {
		const menuItems: ListMenuItem<TerminalQuickFix>[] = [];
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
