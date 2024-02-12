/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ButtonBar, IButton } from 'vs/base/browser/ui/button/button';
import { ActionRunner, IAction, IActionRunner, SubmenuAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { MenuId, IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export type IButtonConfigProvider = (action: IAction) => {
	showIcon?: boolean;
	showLabel?: boolean;
	isSecondary?: boolean;
} | undefined;

export interface IWorkbenchButtonBarOptions {
	telemetrySource?: string;
	buttonConfigProvider?: IButtonConfigProvider;
}

export class WorkbenchButtonBar extends ButtonBar {

	protected readonly _store = new DisposableStore();

	private readonly _actionRunner: IActionRunner;
	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;


	constructor(
		container: HTMLElement,
		private readonly _options: IWorkbenchButtonBarOptions | undefined,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container);

		this._actionRunner = this._store.add(new ActionRunner());
		if (_options?.telemetrySource) {
			this._actionRunner.onDidRun(e => {
				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
					'workbenchActionExecuted',
					{ id: e.action.id, from: _options.telemetrySource! }
				);
			}, undefined, this._store);
		}
	}

	override dispose() {
		this._onDidChange.dispose();
		this._store.dispose();
		super.dispose();
	}

	update(actions: IAction[]): void {

		const conifgProvider: IButtonConfigProvider = this._options?.buttonConfigProvider ?? (() => ({ showLabel: true }));

		this.clear();

		for (let i = 0; i < actions.length; i++) {

			const secondary = i > 0;
			const actionOrSubmenu = actions[i];
			let action: IAction;
			let btn: IButton;

			if (actionOrSubmenu instanceof SubmenuAction && actionOrSubmenu.actions.length > 0) {
				const [first, ...rest] = actionOrSubmenu.actions;
				action = <MenuItemAction>first;
				btn = this.addButtonWithDropdown({
					secondary: conifgProvider(action)?.isSecondary ?? secondary,
					actionRunner: this._actionRunner,
					actions: rest,
					contextMenuProvider: this._contextMenuService,
					ariaLabel: action.label
				});
			} else {
				action = actionOrSubmenu;
				btn = this.addButton({
					secondary: conifgProvider(action)?.isSecondary ?? secondary,
					ariaLabel: action.label
				});
			}

			btn.enabled = action.enabled;
			btn.element.classList.add('default-colors');
			if (conifgProvider(action)?.showLabel ?? true) {
				btn.label = action.label;
			} else {
				btn.element.classList.add('monaco-text-button');
			}
			if (conifgProvider(action)?.showIcon) {
				if (action instanceof MenuItemAction && ThemeIcon.isThemeIcon(action.item.icon)) {
					btn.icon = action.item.icon;
				} else if (action.class) {
					btn.element.classList.add(...action.class.split(' '));
				}
			}
			const kb = this._keybindingService.lookupKeybinding(action.id);
			if (kb) {
				btn.element.title = localize('labelWithKeybinding', "{0} ({1})", action.label, kb.getLabel());
			} else {
				btn.element.title = action.label;

			}
			btn.onDidClick(async () => {
				this._actionRunner.run(action);
			});
		}
		this._onDidChange.fire(this);
	}
}

export class MenuWorkbenchButtonBar extends WorkbenchButtonBar {

	constructor(
		container: HTMLElement,
		menuId: MenuId,
		options: IWorkbenchButtonBarOptions | undefined,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container, options, contextMenuService, keybindingService, telemetryService);

		const menu = menuService.createMenu(menuId, contextKeyService);
		this._store.add(menu);

		const update = () => {

			this.clear();

			const actions = menu
				.getActions({ renderShortTitle: true })
				.flatMap(entry => entry[1]);

			super.update(actions);

		};
		this._store.add(menu.onDidChange(update));
		update();
	}

	override dispose() {
		super.dispose();
	}

	override update(_actions: IAction[]): void {
		throw new Error('Use Menu or WorkbenchButtonBar');
	}
}
