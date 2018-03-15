/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as env from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions } from 'vs/workbench/browser/quickopen';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { GotoSymbolAction, GOTO_SYMBOL_PREFIX, SCOPE_PREFIX, GotoSymbolHandler } from 'vs/workbench/parts/quickopen/browser/gotoSymbolHandler';
import { ShowAllCommandsAction, ALL_COMMANDS_PREFIX, ClearCommandHistoryAction, CommandsHandler } from 'vs/workbench/parts/quickopen/browser/commandsHandler';
import { GotoLineAction, GOTO_LINE_PREFIX, GotoLineHandler } from 'vs/workbench/parts/quickopen/browser/gotoLineHandler';
import { HELP_PREFIX, HelpHandler } from 'vs/workbench/parts/quickopen/browser/helpHandler';
import { VIEW_PICKER_PREFIX, OpenViewPickerAction, QuickOpenViewPickerAction, ViewPickerHandler } from 'vs/workbench/parts/quickopen/browser/viewPickerHandler';
import { inQuickOpenContext, getQuickNavigateHandler } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

// Register Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearCommandHistoryAction, ClearCommandHistoryAction.ID, ClearCommandHistoryAction.LABEL), 'Clear Command History');
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllCommandsAction, ShowAllCommandsAction.ID, ShowAllCommandsAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
	secondary: [KeyCode.F1]
}), 'Show All Commands');

registry.registerWorkbenchAction(new SyncActionDescriptor(GotoLineAction, GotoLineAction.ID, GotoLineAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_G,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_G }
}), 'Go to Line...');

registry.registerWorkbenchAction(new SyncActionDescriptor(GotoSymbolAction, GotoSymbolAction.ID, GotoSymbolAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_O
}), 'Go to Symbol in File...');

const inViewsPickerContextKey = 'inViewsPicker';
const inViewsPickerContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(inViewsPickerContextKey));

const viewPickerKeybinding = { primary: KeyMod.CtrlCmd | KeyCode.KEY_Q, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_Q }, linux: { primary: null } };

const viewCategory = nls.localize('view', "View");
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenViewPickerAction, OpenViewPickerAction.ID, OpenViewPickerAction.LABEL), 'View: Open View', viewCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenViewPickerAction, QuickOpenViewPickerAction.ID, QuickOpenViewPickerAction.LABEL, viewPickerKeybinding), 'View: Quick Open View', viewCategory);

const quickOpenNavigateNextInViewPickerId = 'workbench.action.quickOpenNavigateNextInViewPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInViewPickerId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	handler: getQuickNavigateHandler(quickOpenNavigateNextInViewPickerId, true),
	when: inViewsPickerContext,
	primary: viewPickerKeybinding.primary,
	linux: viewPickerKeybinding.linux,
	mac: viewPickerKeybinding.mac
});

const quickOpenNavigatePreviousInViewPickerId = 'workbench.action.quickOpenNavigatePreviousInViewPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInViewPickerId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInViewPickerId, false),
	when: inViewsPickerContext,
	primary: viewPickerKeybinding.primary | KeyMod.Shift,
	linux: viewPickerKeybinding.linux,
	mac: {
		primary: viewPickerKeybinding.mac.primary | KeyMod.Shift
	}
});

// Register Quick Open Handler

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		CommandsHandler,
		CommandsHandler.ID,
		ALL_COMMANDS_PREFIX,
		'inCommandsPicker',
		nls.localize('commandsHandlerDescriptionDefault', "Show and Run Commands")
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		GotoLineHandler,
		GotoLineHandler.ID,
		GOTO_LINE_PREFIX,
		null,
		[
			{
				prefix: GOTO_LINE_PREFIX,
				needsEditor: true,
				description: env.isMacintosh ? nls.localize('gotoLineDescriptionMac', "Go to Line") : nls.localize('gotoLineDescriptionWin', "Go to Line")
			},
		]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		GotoSymbolHandler,
		GotoSymbolHandler.ID,
		GOTO_SYMBOL_PREFIX,
		'inFileSymbolsPicker',
		[
			{
				prefix: GOTO_SYMBOL_PREFIX,
				needsEditor: true,
				description: nls.localize('gotoSymbolDescription', "Go to Symbol in File")
			},
			{
				prefix: GOTO_SYMBOL_PREFIX + SCOPE_PREFIX,
				needsEditor: true,
				description: nls.localize('gotoSymbolDescriptionScoped', "Go to Symbol in File by Category")
			}
		]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		HelpHandler,
		HelpHandler.ID,
		HELP_PREFIX,
		null,
		nls.localize('helpDescription', "Show Help")
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		ViewPickerHandler,
		ViewPickerHandler.ID,
		VIEW_PICKER_PREFIX,
		inViewsPickerContextKey,
		[
			{
				prefix: VIEW_PICKER_PREFIX,
				needsEditor: false,
				description: nls.localize('viewPickerDescription', "Open View")
			}
		]
	)
);