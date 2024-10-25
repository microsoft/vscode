/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Schemas } from '../../../../base/common/network.js';
import { isIOS, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import './media/terminal.css';
import './media/terminalVoice.css';
import './media/widgets.css';
import './media/xterm.css';
import * as nls from '../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Extensions as DragAndDropExtensions, IDragAndDropContributionRegistry, IDraggedResourceEditorInput } from '../../../../platform/dnd/browser/dnd.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { GeneralShellType, ITerminalLogService, WindowsShellType } from '../../../../platform/terminal/common/terminal.js';
import { TerminalLogService } from '../../../../platform/terminal/common/terminalLogService.js';
import { registerTerminalPlatformConfiguration } from '../../../../platform/terminal/common/terminalPlatformConfiguration.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation } from '../../../common/views.js';
import { RemoteTerminalBackendContribution } from './remoteTerminalBackend.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService, TerminalDataTransfers, terminalEditorId } from './terminal.js';
import { registerTerminalActions } from './terminalActions.js';
import { setupTerminalCommands } from './terminalCommands.js';
import { TerminalConfigurationService } from './terminalConfigurationService.js';
import { TerminalEditor } from './terminalEditor.js';
import { TerminalEditorInput } from './terminalEditorInput.js';
import { TerminalInputSerializer } from './terminalEditorSerializer.js';
import { TerminalEditorService } from './terminalEditorService.js';
import { TerminalGroupService } from './terminalGroupService.js';
import { terminalViewIcon } from './terminalIcons.js';
import { TerminalInstanceService } from './terminalInstanceService.js';
import { TerminalMainContribution } from './terminalMainContribution.js';
import { setupTerminalMenus } from './terminalMenus.js';
import { TerminalProfileService } from './terminalProfileService.js';
import { TerminalService } from './terminalService.js';
import { TerminalViewPane } from './terminalView.js';
import { ITerminalProfileService, TERMINAL_VIEW_ID, TerminalCommandId } from '../common/terminal.js';
import { registerColors } from '../common/terminalColorRegistry.js';
import { registerTerminalConfiguration } from '../common/terminalConfiguration.js';
import { TerminalContextKeyStrings, TerminalContextKeys } from '../common/terminalContextKey.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { registerSendSequenceKeybinding } from './terminalKeybindings.js';

// Register services
registerSingleton(ITerminalLogService, TerminalLogService, InstantiationType.Delayed);
registerSingleton(ITerminalConfigurationService, TerminalConfigurationService, InstantiationType.Delayed);
registerSingleton(ITerminalService, TerminalService, InstantiationType.Delayed);
registerSingleton(ITerminalEditorService, TerminalEditorService, InstantiationType.Delayed);
registerSingleton(ITerminalGroupService, TerminalGroupService, InstantiationType.Delayed);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, InstantiationType.Delayed);
registerSingleton(ITerminalProfileService, TerminalProfileService, InstantiationType.Delayed);

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
		when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, GeneralShellType.PowerShell), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
		primary: KeyMod.CtrlCmd | KeyCode.KeyV
	});
}

// Map certain keybindings in pwsh to unused keys which get handled by PSReadLine handlers in the
// shell integration script. This allows keystrokes that cannot be sent via VT sequences to work.
// See https://github.com/microsoft/terminal/issues/879#issuecomment-497775007
registerSendSequenceKeybinding('\x1b[24~a', { // F12,a -> ctrl+space (MenuComplete)
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, GeneralShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
	primary: KeyMod.CtrlCmd | KeyCode.Space,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
});
registerSendSequenceKeybinding('\x1b[24~b', { // F12,b -> alt+space (SetMark)
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, GeneralShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
	primary: KeyMod.Alt | KeyCode.Space
});
registerSendSequenceKeybinding('\x1b[24~c', { // F12,c -> shift+enter (AddLine)
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, GeneralShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
	primary: KeyMod.Shift | KeyCode.Enter
});
registerSendSequenceKeybinding('\x1b[24~d', { // F12,d -> shift+end (SelectLine) - HACK: \x1b[1;2F is supposed to work but it doesn't
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, GeneralShellType.PowerShell), TerminalContextKeys.terminalShellIntegrationEnabled, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
	mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.RightArrow }
});

// Always on pwsh keybindings
registerSendSequenceKeybinding('\x1b[1;2H', { // Shift+home
	when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals(TerminalContextKeyStrings.ShellType, GeneralShellType.PowerShell)),
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
