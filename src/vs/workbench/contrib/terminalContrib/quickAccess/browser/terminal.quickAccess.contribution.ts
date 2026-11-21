/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import * as nls from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IQuickAccessRegistry, Extensions as QuickAccessExtensions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { getQuickNavigateHandler } from '../../../../browser/quickaccess.js';
import { getTargetTerminal, registerTerminalAction, TERMINAL_TARGET_PROPERTIES } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalQuickAccessProvider } from '../../../terminalContrib/quickAccess/browser/terminalQuickAccess.js';

const enum TerminalQuickAccessCommandId {
	QuickOpenTerm = 'workbench.action.quickOpenTerm',
}

const quickAccessRegistry = (Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess));
const inTerminalsPicker = 'inTerminalPicker';
quickAccessRegistry.registerQuickAccessProvider({
	ctor: TerminalQuickAccessProvider,
	prefix: TerminalQuickAccessProvider.PREFIX,
	contextKey: inTerminalsPicker,
	placeholder: nls.localize('tasksQuickAccessPlaceholder', "Type a terminal name, ID, tab, or pane to open."),
	helpEntries: [{ description: nls.localize('tasksQuickAccessHelp', "Show All Opened Terminals"), commandId: TerminalQuickAccessCommandId.QuickOpenTerm }]
});
const quickAccessNavigateNextInTerminalPickerId = 'workbench.action.quickOpenNavigateNextInTerminalPicker';
CommandsRegistry.registerCommand({ id: quickAccessNavigateNextInTerminalPickerId, handler: getQuickNavigateHandler(quickAccessNavigateNextInTerminalPickerId, true) });
const quickAccessNavigatePreviousInTerminalPickerId = 'workbench.action.quickOpenNavigatePreviousInTerminalPicker';
CommandsRegistry.registerCommand({ id: quickAccessNavigatePreviousInTerminalPickerId, handler: getQuickNavigateHandler(quickAccessNavigatePreviousInTerminalPickerId, false) });

registerTerminalAction({
	id: TerminalQuickAccessCommandId.QuickOpenTerm,
	title: nls.localize2('quickAccessTerminal', 'Switch Active Terminal'),
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	metadata: {
		description: nls.localize('quickAccessTerminal.description', "Switch to a selected terminal, or show the terminal picker when no arguments are provided."),
		args: [{
			name: 'args',
			isOptional: true,
			schema: { type: 'object', properties: TERMINAL_TARGET_PROPERTIES }
		}]
	},
	run: async (c, accessor, args) => {
		if (args === undefined) {
			accessor.get(IQuickInputService).quickAccess.show(TerminalQuickAccessProvider.PREFIX);
			return;
		}
		const notificationService = accessor.get(INotificationService);
		if (!isObject(args)) {
			notificationService.warn(nls.localize('quickAccessTerminal.invalidArgs', "Terminal selection arguments must be an object."));
			return;
		}
		const instance = getTargetTerminal(c, args, notificationService);
		if (instance) {
			await c.service.focusInstance(instance);
		}
	}
});
