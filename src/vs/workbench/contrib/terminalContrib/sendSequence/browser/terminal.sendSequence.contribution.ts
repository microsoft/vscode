/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isIOS, isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { isObject, isString } from '../../../../../base/common/types.js';
import { localize, localize2 } from '../../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { ContextKeyExpr, type ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import type { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight, type IKeybindings } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { GeneralShellType, WindowsShellType } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys, TerminalContextKeyStrings } from '../../../terminal/common/terminalContextKey.js';

export const enum TerminalSendSequenceCommandId {
	SendSequence = 'workbench.action.terminal.sendSequence',
}

function toOptionalString(obj: unknown): string | undefined {
	return isString(obj) ? obj : undefined;
}

export const terminalSendSequenceCommand = async (accessor: ServicesAccessor, args: unknown) => {
	const quickInputService = accessor.get(IQuickInputService);
	const configurationResolverService = accessor.get(IConfigurationResolverService);
	const workspaceContextService = accessor.get(IWorkspaceContextService);
	const historyService = accessor.get(IHistoryService);
	const terminalService = accessor.get(ITerminalService);

	const instance = terminalService.activeInstance;
	if (instance) {
		function isTextArg(obj: unknown): obj is { text: string } {
			return isObject(obj) && 'text' in obj;
		}
		let text = isTextArg(args) ? toOptionalString(args.text) : undefined;

		// If no text provided, prompt user for input and process special characters
		if (!text) {
			text = await quickInputService.input({
				value: '',
				placeHolder: 'Enter sequence to send (supports \\n, \\r, \\xAB)',
				prompt: localize('workbench.action.terminal.sendSequence.prompt', "Enter sequence to send to the terminal"),
			});
			if (!text) {
				return;
			}
			// Process escape sequences
			let processedText = text
				.replace(/\\n/g, '\n')
				.replace(/\\r/g, '\r');

			// Process hex escape sequences (\xNN)
			while (true) {
				const match = processedText.match(/\\x([0-9a-fA-F]{2})/);
				if (match === null || match.index === undefined || match.length < 2) {
					break;
				}
				processedText = processedText.slice(0, match.index) + String.fromCharCode(parseInt(match[1], 16)) + processedText.slice(match.index + 4);
			}

			text = processedText;
		}

		const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(instance.hasRemoteAuthority ? Schemas.vscodeRemote : Schemas.file);
		const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
		const resolvedText = await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, text);
		instance.sendText(resolvedText, false);
	}
};

const sendSequenceString = localize2('sendSequence', "Send Sequence");
registerTerminalAction({
	id: TerminalSendSequenceCommandId.SendSequence,
	title: sendSequenceString,
	f1: true,
	metadata: {
		description: sendSequenceString.value,
		args: [{
			name: 'args',
			schema: {
				type: 'object',
				required: ['text'],
				properties: {
					text: {
						description: localize('sendSequence.text.desc', "The sequence of text to send to the terminal"),
						type: 'string'
					}
				},
			}
		}]
	},
	run: (c, accessor, args) => terminalSendSequenceCommand(accessor, args)
});

export function registerSendSequenceKeybinding(text: string, rule: { when?: ContextKeyExpression } & IKeybindings): void {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: TerminalSendSequenceCommandId.SendSequence,
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

// Map alt+arrow to ctrl+arrow to allow word navigation in most shells to just work with alt. This
// is non-standard behavior, but a lot of terminals act like this (see
// https://github.com/microsoft/vscode/issues/190629). Note that macOS uses different sequences here
// to get the desired behavior.
registerSendSequenceKeybinding('\x1b[1;5A', {
	when: ContextKeyExpr.and(TerminalContextKeys.focus),
	primary: KeyMod.Alt | KeyCode.UpArrow
});
registerSendSequenceKeybinding('\x1b[1;5B', {
	when: ContextKeyExpr.and(TerminalContextKeys.focus),
	primary: KeyMod.Alt | KeyCode.DownArrow
});
registerSendSequenceKeybinding('\x1b' + (isMacintosh ? 'f' : '[1;5C'), {
	when: ContextKeyExpr.and(TerminalContextKeys.focus),
	primary: KeyMod.Alt | KeyCode.RightArrow
});
registerSendSequenceKeybinding('\x1b' + (isMacintosh ? 'b' : '[1;5D'), {
	when: ContextKeyExpr.and(TerminalContextKeys.focus),
	primary: KeyMod.Alt | KeyCode.LeftArrow
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
