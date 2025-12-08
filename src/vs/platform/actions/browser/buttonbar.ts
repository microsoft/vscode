/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ButtonBar, IButton } from 'vs/base/browser/ui/button/button';
import { ActionRunner, IAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { MenuId, IMenuService, SubmenuItemAction, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export type IButtonConfigProvider = (action: IAction) => {
	showIcon?: boolean;
	showLabel?: boolean;
	isSecondary?: boolean;
} | undefined;

export interface IMenuWorkbenchButtonBarOptions {
	telemetrySource?: string;
	buttonConfigProvider?: IButtonConfigProvider;
}

export class MenuWorkbenchButtonBar extends ButtonBar {

	private readonly _store = new DisposableStore();

	private readonly _onDidChangeMenuItems = new Emitter<this>();
	readonly onDidChangeMenuItems: Event<this> = this._onDidChangeMenuItems.event;

	constructor(
		container: HTMLElement,
		menuId: MenuId,
		options: IMenuWorkbenchButtonBarOptions | undefined,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container);

		const menu = menuService.createMenu(menuId, contextKeyService);
		this._store.add(menu);

		const actionRunner = this._store.add(new ActionRunner());
		if (options?.telemetrySource) {
			actionRunner.onDidRun(e => {
				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
					'workbenchActionExecuted',
					{ id: e.action.id, from: options.telemetrySource! }
				);
			}, this._store);
		}

		const conifgProvider: IButtonConfigProvider = options?.buttonConfigProvider ?? (() => ({ showLabel: true }));

		const update = () => {

			this.clear();

			const actions = menu
				.getActions({ renderShortTitle: true })
				.flatMap(entry => entry[1]);

			for (let i = 0; i < actions.length; i++) {

				const secondary = i > 0;
				const actionOrSubmenu = actions[i];
				let action: MenuItemAction | SubmenuItemAction;
				let btn: IButton;

				if (actionOrSubmenu instanceof SubmenuItemAction && actionOrSubmenu.actions.length > 0) {
					const [first, ...rest] = actionOrSubmenu.actions;
					action = <MenuItemAction>first;
					btn = this.addButtonWithDropdown({
						secondary: conifgProvider(action)?.isSecondary ?? secondary,
						actionRunner,
						actions: rest,
						contextMenuProvider: contextMenuService,
					});
				} else {
					action = actionOrSubmenu;
					btn = this.addButton({
						secondary: conifgProvider(action)?.isSecondary ?? secondary,
					});
				}

				btn.enabled = action.enabled;
				btn.element.classList.add('default-colors');
				if (conifgProvider(action)?.showLabel ?? true) {
					btn.label = action.label;
				} else {
					btn.element.classList.add('monaco-text-button');
				}
				if (conifgProvider(action)?.showIcon && ThemeIcon.isThemeIcon(action.item.icon)) {
					btn.icon = action.item.icon;
				}
				const kb = keybindingService.lookupKeybinding(action.id);
				if (kb) {
					btn.element.title = localize('labelWithKeybinding', "{0} ({1})", action.label, kb.getLabel());
				} else {
					btn.element.title = action.label;

				}
				btn.onDidClick(async () => {
					actionRunner.run(action);
				});
			}
			this._onDidChangeMenuItems.fire(this);
		};
		this._store.add(menu.onDidChange(update));
		update();
	}

	override dispose() {
		this._onDidChangeMenuItems.dispose();
		this._store.dispose();
		super.dispose();
	}
}
