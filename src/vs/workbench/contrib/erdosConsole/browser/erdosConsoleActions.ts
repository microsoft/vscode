/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { ErdosConsoleFocused } from '../../../common/contextkeys.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IErdosConsoleService, ERDOS_CONSOLE_VIEW_ID } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

/**
 * Erdos console command ID's.
 */
const enum ErdosConsoleCommandId {
	ClearConsole = 'workbench.action.erdosConsole.clearConsole',
	ExecuteCode = 'workbench.action.erdosConsole.executeCode',
	FocusConsole = 'workbench.action.erdosConsole.focusConsole',
}

/**
 * Erdos console action category.
 */
const ERDOS_CONSOLE_ACTION_CATEGORY = localize('erdosConsoleCategory', "Console");

/**
 * Registers Erdos console actions.
 */
export function registerErdosConsoleActions() {
	/**
	 * The category for the actions below.
	 */
	const category: ILocalizedString = {
		value: ERDOS_CONSOLE_ACTION_CATEGORY,
		original: 'Console'
	};

	/**
	 * Register the clear console action. This action removes everything from the active console,
	 * just like running the clear command in a shell.
	 */
	registerAction2(class extends Action2 {
		/**
		 * Constructor.
		 */
		constructor() {
			super({
				id: ErdosConsoleCommandId.ClearConsole,
				title: {
					value: localize('workbench.action.erdosConsole.clearConsole', "Clear Console"),
					original: 'Clear Console'
				},
				f1: true,
				category,
				keybinding: {
					when: ErdosConsoleFocused,
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyL,
					mac: {
						primary: KeyMod.WinCtrl | KeyCode.KeyL
					}
				},
			});
		}

		/**
		 * Runs action.
		 * @param accessor The services accessor.
		 */
		async run(accessor: ServicesAccessor) {
			// Get the Erdos console service.
			const erdosConsoleService = accessor.get(IErdosConsoleService);

			// Clear the active console instance.
			if (erdosConsoleService.activeErdosConsoleInstance) {
				erdosConsoleService.activeErdosConsoleInstance.clearConsole();
			}
		}
	});

	/**
	 * Register the focus console action.
	 */
	registerAction2(class extends Action2 {
		/**
		 * Constructor.
		 */
		constructor() {
			super({
				id: ErdosConsoleCommandId.FocusConsole,
				title: {
					value: localize('workbench.action.erdosConsole.focusConsole', "Focus Console"),
					original: 'Focus Console'
				},
				f1: true,
				category,
			});
		}

		/**
		 * Runs action.
		 * @param accessor The services accessor.
		 */
		async run(accessor: ServicesAccessor) {
			// Get the views service.
			const viewsService = accessor.get(IViewsService);

			// Focus the console view.
			await viewsService.openView(ERDOS_CONSOLE_VIEW_ID, true);
		}
	});
}
