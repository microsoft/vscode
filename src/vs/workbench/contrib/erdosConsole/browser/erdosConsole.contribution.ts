/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ErdosConsoleFocused } from '../../../common/contextkeys.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { ErdosConsoleViewPane } from './erdosConsoleView.js';
// import { registerErdosConsoleActions } from './erdosConsoleActions.js';
import { IErdosConsoleService, ERDOS_CONSOLE_VIEW_ID } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { ErdosConsoleService } from '../../../services/erdosConsole/browser/erdosConsoleService.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IRuntimeStartupService } from '../../../services/runtimeStartup/common/runtimeStartupService.js';
import { ErdosRuntimeStartupService } from '../../../services/runtimeStartup/browser/erdosRuntimeStartupService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { RuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSession.js';
import { ICommandAndKeybindingRule, KeybindingWeight, KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry } from '../../../common/views.js';
import { ERDOS_CONSOLE_COPY, ERDOS_CONSOLE_PASTE, ERDOS_CONSOLE_SELECT_ALL } from './erdosConsoleIdentifiers.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

// The Erdos console view icon.
const erdosConsoleViewIcon = registerIcon(
	'erdos-console-view-icon',
	Codicon.terminal, // Using terminal icon for now, can create custom icon later
	nls.localize('erdosConsoleViewIcon', 'View icon of the Erdos console view.')
);

// Register the Erdos console view container.
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: ERDOS_CONSOLE_VIEW_ID,
	title: {
		value: nls.localize('erdos.console', "Console"),
		original: 'Console'
	},
	icon: erdosConsoleViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ERDOS_CONSOLE_VIEW_ID, {
		mergeViewWithContainerWhenSingleView: true
	}]),
	storageId: ERDOS_CONSOLE_VIEW_ID,
	hideIfEmpty: true,
	// --- Start Erdos ---
	order: 1,
	// --- End Erdos ---
}, ViewContainerLocation.Panel, {
	doNotRegisterOpenCommand: true,
	isDefault: true
});

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: ERDOS_CONSOLE_VIEW_ID,
	name: {
		value: nls.localize('erdos.console', "Console"),
		original: 'Console'
	},
	containerIcon: erdosConsoleViewIcon,
	canMoveView: true,
	canToggleVisibility: false,
	ctorDescriptor: new SyncDescriptor(ErdosConsoleViewPane),
	openCommandActionDescriptor: {
		id: 'workbench.action.erdosConsole.open',
		mnemonicTitle: nls.localize({ key: 'miOpenConsole', comment: ['&& denotes a mnemonic'] }, "&&Console"),
		keybindings: {},
		order: 3,
	}
}], VIEW_CONTAINER);

// Below we define keybindings so we can refer to them in the console context
// menu and display the keybinding shortcut next to the menu action. We don't
// necessarily want to handle the keybinding instead of VS Code. In that case,
// we condition the keybinding handler on this context key that never activates.
const never = new RawContextKey<boolean>('never', false);

// Register keybinding rule for copy.
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ERDOS_CONSOLE_COPY,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyC,
	// We let the default command copy for us
	when: never,
	handler: accessor => { }
} satisfies ICommandAndKeybindingRule);

// Register keybinding rule for paste.
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ERDOS_CONSOLE_PASTE,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyV,
	when: ErdosConsoleFocused,
	handler: async accessor => {
		const clipboardService = accessor.get(IClipboardService);
		const consoleService = accessor.get(IErdosConsoleService);
		const text = await clipboardService.readText();
		return consoleService.activeErdosConsoleInstance?.pasteText(text);
	}
} satisfies ICommandAndKeybindingRule);

// Register keybinding rule for select all.
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ERDOS_CONSOLE_SELECT_ALL,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyA,
	when: ErdosConsoleFocused,
	handler: async accessor => {
		const consoleService = accessor.get(IErdosConsoleService);
		return consoleService.activeErdosConsoleInstance?.selectAll();
	}
} satisfies ICommandAndKeybindingRule);

// Register the services
registerSingleton(IRuntimeStartupService, ErdosRuntimeStartupService, InstantiationType.Delayed);
registerSingleton(IRuntimeSessionService, RuntimeSessionService, InstantiationType.Eager);
registerSingleton(IErdosConsoleService, ErdosConsoleService, InstantiationType.Delayed);

// Register all the Erdos console actions.
// registerErdosConsoleActions();
