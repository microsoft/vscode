/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Schemas } from 'vs/base/common/network';
import { isIOS, isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/scrollbar';
import 'vs/css!./media/terminal';
import 'vs/css!./media/terminalVoice';
import 'vs/css!./media/widgets';
import 'vs/css!./media/xterm';
import * as nls from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { Extensions as DragAndDropExtensions, IDragAndDropContributionRegistry, IDraggedResourceEditorInput } from 'vs/platform/dnd/browser/dnd';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IKeybindings, KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickAccessRegistry, Extensions as QuickAccessExtensions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITerminalLogService, TerminalSettingId, WindowsShellType } from 'vs/platform/terminal/common/terminal';
import { TerminalLogService } from 'vs/platform/terminal/common/terminalLogService';
import { registerTerminalPlatformConfiguration } from 'vs/platform/terminal/common/terminalPlatformConfiguration';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { getQuickNavigateHandler } from 'vs/workbench/browser/quickaccess';
import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation } from 'vs/workbench/common/views';
import { RemoteTerminalBackendContribution } from 'vs/workbench/contrib/terminal/browser/remoteTerminalBackend';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService, TerminalDataTransfers, terminalEditorId } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalActions, terminalSendSequenceCommand } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { setupTerminalCommands } from 'vs/workbench/contrib/terminal/browser/terminalCommands';
import { TerminalEditor } from 'vs/workbench/contrib/terminal/browser/terminalEditor';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { TerminalInputSerializer } from 'vs/workbench/contrib/terminal/browser/terminalEditorSerializer';
import { TerminalEditorService } from 'vs/workbench/contrib/terminal/browser/terminalEditorService';
import { TerminalGroupService } from 'vs/workbench/contrib/terminal/browser/terminalGroupService';
import { terminalViewIcon } from 'vs/workbench/contrib/terminal/browser/terminalIcons';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminalInstanceService';
import { TerminalMainContribution } from 'vs/workbench/contrib/terminal/browser/terminalMainContribution';
import { setupTerminalMenus } from 'vs/workbench/contrib/terminal/browser/terminalMenus';
import { TerminalProfileService } from 'vs/workbench/contrib/terminal/browser/terminalProfileService';
import { TerminalQuickAccessProvider } from 'vs/workbench/contrib/terminal/browser/terminalQuickAccess';
import { TerminalService } from 'vs/workbench/contrib/terminal/browser/terminalService';
import { TerminalViewPane } from 'vs/workbench/contrib/terminal/browser/terminalView';
import { ITerminalProfileService, TERMINAL_VIEW_ID, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { registerColors } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { registerTerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminalConfiguration';
import { TerminalContextKeyStrings, TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';

// Register services
registerSingleton(ITerminalLogService, TerminalLogService, InstantiationType.Delayed);
registerSingleton(ITerminalService, TerminalService, InstantiationType.Delayed);
registerSingleton(ITerminalEditorService, TerminalEditorService, InstantiationType.Delayed);
registerSingleton(ITerminalGroupService, TerminalGroupService, InstantiationType.Delayed);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, InstantiationType.Delayed);
registerSingleton(ITerminalProfileService, TerminalProfileService, InstantiationType.Delayed);

// Register quick accesses
const quickAccessRegistry = (Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess));
const inTerminalsPicker = 'inTerminalPicker';
quickAccessRegistry.registerQuickAccessProvider({
	ctor: TerminalQuickAccessProvider,
	prefix: TerminalQuickAccessProvider.PREFIX,
	contextKey: inTerminalsPicker,
	placeholder: nls.localize('tasksQuickAccessPlaceholder', "Type the name of a terminal to open."),
	helpEntries: [{ description: nls.localize('tasksQuickAccessHelp', "Show All Opened Terminals"), commandId: TerminalCommandId.QuickOpenTerm }]
});
const quickAccessNavigateNextInTerminalPickerId = 'workbench.action.quickOpenNavigateNextInTerminalPicker';
CommandsRegistry.registerCommand({ id: quickAccessNavigateNextInTerminalPickerId, handler: getQuickNavigateHandler(quickAccessNavigateNextInTerminalPickerId, true) });
const quickAccessNavigatePreviousInTerminalPickerId = 'workbench.action.quickOpenNavigatePreviousInTerminalPicker';
CommandsRegistry.registerCommand({ id: quickAccessNavigatePreviousInTerminalPickerId, handler: getQuickNavigateHandler(quickAccessNavigatePreviousInTerminalPickerId, false) });

// Register workbench contributions
// This contribution blocks startup as it's critical to enable the web embedder window.createTerminal API
registerWorkbenchContribution2(TerminalMainContribution.ID, TerminalMainContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RemoteTerminalBackendContribution.ID, RemoteTerminalBackendContribution, WorkbenchPhase.AfterRestored);

// Register configurations
registerTerminalPlatformConfiguration();
registerTerminalConfiguration();

// Register editor/dnd contributions
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(TerminalEditorInput.ID, TerminalInputSerializer);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		TerminalEditor,
		terminalEditorId,
		terminalStrings.terminal
	),
	[
		new SyncDescriptor(TerminalEditorInput)
	]
);
Registry.as<IDragAndDropContributionRegistry>(DragAndDropExtensions.DragAndDropContribution).register({
	dataFormatKey: TerminalDataTransfers.Terminals,
	getEditorInputs(data) {
		const editors: IDraggedResourceEditorInput[] = [];
		try {
			const terminalEditors: string[] = JSON.parse(data);
			for (const terminalEditor of terminalEditors) {
				editors.push({ resource: URI.parse(terminalEditor) });
			}
		} catch (error) {
			// Invalid transfer
		}
		return editors;
	},
	setData(resources, event) {
		const terminalResources = resources.filter(({ resource }) => resource.scheme === Schemas.vscodeTerminal);
		if (terminalResources.length) {
			event.dataTransfer?.setData(TerminalDataTransfers.Terminals, JSON.stringify(terminalResources.map(({ resource }) => resource.toString())));
		}
	}
});

// Register views
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: TERMINAL_VIEW_ID,
	title: nls.localize2('terminal', "Terminal"),
	icon: terminalViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [TERMINAL_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: TERMINAL_VIEW_ID,
	hideIfEmpty: true,
	order: 3,
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true, isDefault: true });
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: TERMINAL_VIEW_ID,
	name: nls.localize2('terminal', "Terminal"),
	containerIcon: terminalViewIcon,
	canToggleVisibility: false,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(TerminalViewPane),
	openCommandActionDescriptor: {
		id: TerminalCommandId.Toggle,
		mnemonicTitle: nls.localize({ key: 'miToggleIntegratedTerminal', comment: ['&& denotes a mnemonic'] }, "&&Terminal"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyCode.Backquote,
			mac: { primary: KeyMod.WinCtrl | KeyCode.Backquote }
		},
		order: 3
	}
}], VIEW_CONTAINER);

// Register actions
registerTerminalActions();

function registerSendSequenceKeybinding(text: string, rule: { when?: ContextKeyExpression } & IKeybindings): void {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: TerminalCommandId.SendSequence,
		weight: KeybindingWeight.WorkbenchContrib,
		when: rule.when || TerminalContextKeys.focus,
		primary: rule.primary,
		mac: rule.mac,
		linux: rule.linux,
		win: rule.win,
		handler: terminalSendSequenceCommand,
		args: { text }
	});
}

const enum Constants {
	/** The text representation of `^<letter>` is `'A'.charCodeAt(0) + 1`. */
	CtrlLetterOffset = 64
}

// An extra Windows-only ctrl+v keybinding is used for pwsh that sends ctrl+v directly to the
// shell, this gets handled by PSReadLine which properly handles multi-line pastes. This is
// disabled in accessibility mode as PowerShell does not run PSReadLine when it detects a screen
// reader. This works even when clipboard.readText is not supported.
if (isWindows) {
	registerSendSequenceKeybinding(String.fromCharCode('V'.charCodeAt(0) - Constants.CtrlLetterOffset), { // ctrl+v
		when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, WindowsShellType.PowerShell), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
		primary: KeyMod.CtrlCmd | KeyCode.KeyV
	});
}

// Map certain keybindings in pwsh to unused keys which get handled by PSReadLine handlers in the
// shell integration script. This allows keystrokes that cannot be sent via VT sequences to work.
// See https://github.com/microsoft/terminal/issues/879#issuecomment-497775007
registerSendSequenceKeybinding('\x1b[24~a', { // F12,a -> ctrl+space (MenuComplete)
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, WindowsShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
	primary: KeyMod.CtrlCmd | KeyCode.Space,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
});
registerSendSequenceKeybinding('\x1b[24~b', { // F12,b -> alt+space (SetMark)
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, WindowsShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
	primary: KeyMod.Alt | KeyCode.Space
});
registerSendSequenceKeybinding('\x1b[24~c', { // F12,c -> shift+enter (AddLine)
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, WindowsShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
	primary: KeyMod.Shift | KeyCode.Enter
});
registerSendSequenceKeybinding('\x1b[24~d', { // F12,d -> shift+end (SelectLine) - HACK: \x1b[1;2F is supposed to work but it doesn't
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, WindowsShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
	mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.RightArrow }
});
registerSendSequenceKeybinding('\x1b[24~e', { // F12,e -> ctrl+space (Native suggest)
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, WindowsShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(), ContextKeyExpr.equals(`config.${TerminalSettingId.ShellIntegrationSuggestEnabled}`, true)),
	primary: KeyMod.CtrlCmd | KeyCode.Space,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
});

// Always on pwsh keybindings
registerSendSequenceKeybinding('\x1b[1;2H', { // Shift+home
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, WindowsShellType.PowerShell)),
	mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.LeftArrow }
});

// Map ctrl+alt+r -> ctrl+r when in accessibility mode due to default run recent command keybinding
registerSendSequenceKeybinding('\x12', {
	when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR }
});

// Map ctrl+alt+g -> ctrl+g due to default go to recent directory keybinding
registerSendSequenceKeybinding('\x07', {
	when: TerminalContextKeys.focus,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyG,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyG }
});

// send ctrl+c to the iPad when the terminal is focused and ctrl+c is pressed to kill the process (work around for #114009)
if (isIOS) {
	registerSendSequenceKeybinding(String.fromCharCode('C'.charCodeAt(0) - Constants.CtrlLetterOffset), { // ctrl+c
		when: ContextKeyExpr.and(TerminalContextKeys.focus),
		primary: KeyMod.WinCtrl | KeyCode.KeyC
	});
}

// Delete word left: ctrl+w
registerSendSequenceKeybinding(String.fromCharCode('W'.charCodeAt(0) - Constants.CtrlLetterOffset), {
	primary: KeyMod.CtrlCmd | KeyCode.Backspace,
	mac: { primary: KeyMod.Alt | KeyCode.Backspace }
});
if (isWindows) {
	// Delete word left: ctrl+h
	// Windows cmd.exe requires ^H to delete full word left
	registerSendSequenceKeybinding(String.fromCharCode('H'.charCodeAt(0) - Constants.CtrlLetterOffset), {
		when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, WindowsShellType.CommandPrompt)),
		primary: KeyMod.CtrlCmd | KeyCode.Backspace,
	});
}
// Delete word right: alt+d [27, 100]
registerSendSequenceKeybinding('\u001bd', {
	primary: KeyMod.CtrlCmd | KeyCode.Delete,
	mac: { primary: KeyMod.Alt | KeyCode.Delete }
});
// Delete to line start: ctrl+u
registerSendSequenceKeybinding('\u0015', {
	mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace }
});
// Move to line start: ctrl+A
registerSendSequenceKeybinding(String.fromCharCode('A'.charCodeAt(0) - 64), {
	mac: { primary: KeyMod.CtrlCmd | KeyCode.LeftArrow }
});
// Move to line end: ctrl+E
registerSendSequenceKeybinding(String.fromCharCode('E'.charCodeAt(0) - 64), {
	mac: { primary: KeyMod.CtrlCmd | KeyCode.RightArrow }
});
// NUL: ctrl+shift+2
registerSendSequenceKeybinding('\u0000', {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit2,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit2 }
});
// RS: ctrl+shift+6
registerSendSequenceKeybinding('\u001e', {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit6,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit6 }
});
// US (Undo): ctrl+/
registerSendSequenceKeybinding('\u001f', {
	primary: KeyMod.CtrlCmd | KeyCode.Slash,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Slash }
});

setupTerminalCommands();

setupTerminalMenus();

registerColors();
