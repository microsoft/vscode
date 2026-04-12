/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../../base/common/network.js';
import { isIOS, isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { isObject, isString } from '../../../../../base/common/types.js';
import { localize, localize2 } from '../../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
export var TerminalSendSequenceCommandId;
(function (TerminalSendSequenceCommandId) {
    TerminalSendSequenceCommandId["SendSequence"] = "workbench.action.terminal.sendSequence";
})(TerminalSendSequenceCommandId || (TerminalSendSequenceCommandId = {}));
function toOptionalString(obj) {
    return isString(obj) ? obj : undefined;
}
export const terminalSendSequenceCommand = async (accessor, args) => {
    const quickInputService = accessor.get(IQuickInputService);
    const configurationResolverService = accessor.get(IConfigurationResolverService);
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const historyService = accessor.get(IHistoryService);
    const terminalService = accessor.get(ITerminalService);
    const instance = terminalService.activeInstance;
    if (instance) {
        function isTextArg(obj) {
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
    id: "workbench.action.terminal.sendSequence" /* TerminalSendSequenceCommandId.SendSequence */,
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
export function registerSendSequenceKeybinding(text, rule) {
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: "workbench.action.terminal.sendSequence" /* TerminalSendSequenceCommandId.SendSequence */,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: rule.when || TerminalContextKeys.focus,
        primary: rule.primary,
        mac: rule.mac,
        linux: rule.linux,
        win: rule.win,
        handler: terminalSendSequenceCommand,
        args: { text }
    });
}
var Constants;
(function (Constants) {
    /** The text representation of `^<letter>` is `'A'.charCodeAt(0) + 1`. */
    Constants[Constants["CtrlLetterOffset"] = 64] = "CtrlLetterOffset";
})(Constants || (Constants = {}));
// An extra Windows-only ctrl+v keybinding is used for pwsh that sends ctrl+v directly to the
// shell, this gets handled by PSReadLine which properly handles multi-line pastes. This is
// disabled in accessibility mode as PowerShell does not run PSReadLine when it detects a screen
// reader. This works even when clipboard.readText is not supported.
if (isWindows) {
    registerSendSequenceKeybinding(String.fromCharCode('V'.charCodeAt(0) - 64 /* Constants.CtrlLetterOffset */), {
        when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals("terminalShellType" /* TerminalContextKeyStrings.ShellType */, "pwsh" /* GeneralShellType.PowerShell */), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
        primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */
    });
}
// Map certain keybindings in pwsh to unused keys which get handled by PSReadLine handlers in the
// shell integration script. This allows keystrokes that cannot be sent via VT sequences to work.
// See https://github.com/microsoft/terminal/issues/879#issuecomment-497775007
registerSendSequenceKeybinding('\x1b[24~a', {
    when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals("terminalShellType" /* TerminalContextKeyStrings.ShellType */, "pwsh" /* GeneralShellType.PowerShell */), TerminalContextKeys.terminalShellIntegrationEnabled, ContextKeyExpr.equals(`config.${"terminal.integrated.enableWin32InputMode" /* TerminalSettingId.EnableWin32InputMode */}`, true), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
    primary: 2048 /* KeyMod.CtrlCmd */ | 10 /* KeyCode.Space */,
    mac: { primary: 256 /* KeyMod.WinCtrl */ | 10 /* KeyCode.Space */ }
});
registerSendSequenceKeybinding('\x1b[24~b', {
    when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals("terminalShellType" /* TerminalContextKeyStrings.ShellType */, "pwsh" /* GeneralShellType.PowerShell */), TerminalContextKeys.terminalShellIntegrationEnabled, ContextKeyExpr.equals(`config.${"terminal.integrated.enableWin32InputMode" /* TerminalSettingId.EnableWin32InputMode */}`, true), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
    primary: 512 /* KeyMod.Alt */ | 10 /* KeyCode.Space */
});
registerSendSequenceKeybinding('\x1b[24~c', {
    when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals("terminalShellType" /* TerminalContextKeyStrings.ShellType */, "pwsh" /* GeneralShellType.PowerShell */), TerminalContextKeys.terminalShellIntegrationEnabled, ContextKeyExpr.equals(`config.${"terminal.integrated.enableWin32InputMode" /* TerminalSettingId.EnableWin32InputMode */}`, true), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
    primary: 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */
});
registerSendSequenceKeybinding('\x1b[24~d', {
    when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals("terminalShellType" /* TerminalContextKeyStrings.ShellType */, "pwsh" /* GeneralShellType.PowerShell */), TerminalContextKeys.terminalShellIntegrationEnabled, ContextKeyExpr.equals(`config.${"terminal.integrated.enableWin32InputMode" /* TerminalSettingId.EnableWin32InputMode */}`, true), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
    mac: { primary: 1024 /* KeyMod.Shift */ | 2048 /* KeyMod.CtrlCmd */ | 17 /* KeyCode.RightArrow */ }
});
// Always on pwsh keybindings
registerSendSequenceKeybinding('\x1b[1;2H', {
    when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals("terminalShellType" /* TerminalContextKeyStrings.ShellType */, "pwsh" /* GeneralShellType.PowerShell */), ContextKeyExpr.equals(`config.${"terminal.integrated.enableWin32InputMode" /* TerminalSettingId.EnableWin32InputMode */}`, true)),
    mac: { primary: 1024 /* KeyMod.Shift */ | 2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */ }
});
// Map alt+arrow to ctrl+arrow to allow word navigation in most shells to just work with alt. This
// is non-standard behavior, but a lot of terminals act like this (see
// https://github.com/microsoft/vscode/issues/190629). Note that macOS uses different sequences here
// to get the desired behavior.
registerSendSequenceKeybinding('\x1b[1;5A', {
    when: ContextKeyExpr.and(TerminalContextKeys.focus),
    primary: 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */
});
registerSendSequenceKeybinding('\x1b[1;5B', {
    when: ContextKeyExpr.and(TerminalContextKeys.focus),
    primary: 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */
});
registerSendSequenceKeybinding('\x1b' + (isMacintosh ? 'f' : '[1;5C'), {
    when: ContextKeyExpr.and(TerminalContextKeys.focus),
    primary: 512 /* KeyMod.Alt */ | 17 /* KeyCode.RightArrow */
});
registerSendSequenceKeybinding('\x1b' + (isMacintosh ? 'b' : '[1;5D'), {
    when: ContextKeyExpr.and(TerminalContextKeys.focus),
    primary: 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */
});
// Map ctrl+alt+r -> ctrl+r when in accessibility mode due to default run recent command keybinding
registerSendSequenceKeybinding('\x12', {
    when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */,
    mac: { primary: 256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */ }
});
// Map ctrl+alt+g -> ctrl+g due to default go to recent directory keybinding
registerSendSequenceKeybinding('\x07', {
    when: TerminalContextKeys.focus,
    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 37 /* KeyCode.KeyG */,
    mac: { primary: 256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 37 /* KeyCode.KeyG */ }
});
// send ctrl+c to the iPad when the terminal is focused and ctrl+c is pressed to kill the process (work around for #114009)
if (isIOS) {
    registerSendSequenceKeybinding(String.fromCharCode('C'.charCodeAt(0) - 64 /* Constants.CtrlLetterOffset */), {
        when: ContextKeyExpr.and(TerminalContextKeys.focus),
        primary: 256 /* KeyMod.WinCtrl */ | 33 /* KeyCode.KeyC */
    });
}
// Delete word left: ctrl+w
registerSendSequenceKeybinding(String.fromCharCode('W'.charCodeAt(0) - 64 /* Constants.CtrlLetterOffset */), {
    primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
    mac: { primary: 512 /* KeyMod.Alt */ | 1 /* KeyCode.Backspace */ }
});
if (isWindows) {
    // Delete word left: ctrl+h
    // Windows cmd.exe requires ^H to delete full word left
    registerSendSequenceKeybinding(String.fromCharCode('H'.charCodeAt(0) - 64 /* Constants.CtrlLetterOffset */), {
        when: ContextKeyExpr.and(TerminalContextKeys.focus, ContextKeyExpr.equals("terminalShellType" /* TerminalContextKeyStrings.ShellType */, "cmd" /* WindowsShellType.CommandPrompt */)),
        primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
    });
}
// Delete word right: alt+d [27, 100]
registerSendSequenceKeybinding('\u001bd', {
    primary: 2048 /* KeyMod.CtrlCmd */ | 20 /* KeyCode.Delete */,
    mac: { primary: 512 /* KeyMod.Alt */ | 20 /* KeyCode.Delete */ }
});
// Delete to line start: ctrl+u
registerSendSequenceKeybinding('\u0015', {
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */ }
});
// Move to line start: ctrl+A
registerSendSequenceKeybinding(String.fromCharCode('A'.charCodeAt(0) - 64), {
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */ }
});
// Move to line end: ctrl+E
registerSendSequenceKeybinding(String.fromCharCode('E'.charCodeAt(0) - 64), {
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 17 /* KeyCode.RightArrow */ }
});
// NUL: ctrl+shift+2
registerSendSequenceKeybinding('\u0000', {
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 23 /* KeyCode.Digit2 */,
    mac: { primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 23 /* KeyCode.Digit2 */ }
});
// RS: ctrl+shift+6
registerSendSequenceKeybinding('\u001e', {
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 27 /* KeyCode.Digit6 */,
    mac: { primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 27 /* KeyCode.Digit6 */ }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuc2VuZFNlcXVlbmNlLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zZW5kU2VxdWVuY2UvYnJvd3Nlci90ZXJtaW5hbC5zZW5kU2VxdWVuY2UuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkgsT0FBTyxFQUFFLGNBQWMsRUFBNkIsTUFBTSx5REFBeUQsQ0FBQztBQUVwSCxPQUFPLEVBQUUsbUJBQW1CLEVBQXVDLE1BQU0sa0VBQWtFLENBQUM7QUFDNUksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDakcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDM0gsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxtQkFBbUIsRUFBNkIsTUFBTSxnREFBZ0QsQ0FBQztBQUVoSCxNQUFNLENBQU4sSUFBa0IsNkJBRWpCO0FBRkQsV0FBa0IsNkJBQTZCO0lBQzlDLHdGQUF1RCxDQUFBO0FBQ3hELENBQUMsRUFGaUIsNkJBQTZCLEtBQTdCLDZCQUE2QixRQUU5QztBQUVELFNBQVMsZ0JBQWdCLENBQUMsR0FBWTtJQUNyQyxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDeEMsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLEtBQUssRUFBRSxRQUEwQixFQUFFLElBQWEsRUFBRSxFQUFFO0lBQzlGLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzNELE1BQU0sNEJBQTRCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO0lBQ2pGLE1BQU0sdUJBQXVCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3ZFLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDckQsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRXZELE1BQU0sUUFBUSxHQUFHLGVBQWUsQ0FBQyxjQUFjLENBQUM7SUFDaEQsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNkLFNBQVMsU0FBUyxDQUFDLEdBQVk7WUFDOUIsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxJQUFJLEdBQUcsQ0FBQztRQUN2QyxDQUFDO1FBQ0QsSUFBSSxJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUVyRSw0RUFBNEU7UUFDNUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsSUFBSSxHQUFHLE1BQU0saUJBQWlCLENBQUMsS0FBSyxDQUFDO2dCQUNwQyxLQUFLLEVBQUUsRUFBRTtnQkFDVCxXQUFXLEVBQUUsbURBQW1EO2dCQUNoRSxNQUFNLEVBQUUsUUFBUSxDQUFDLCtDQUErQyxFQUFFLHdDQUF3QyxDQUFDO2FBQzNHLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDWCxPQUFPO1lBQ1IsQ0FBQztZQUNELDJCQUEyQjtZQUMzQixJQUFJLGFBQWEsR0FBRyxJQUFJO2lCQUN0QixPQUFPLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQztpQkFDckIsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUV4QixzQ0FBc0M7WUFDdEMsT0FBTyxJQUFJLEVBQUUsQ0FBQztnQkFDYixNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ3pELElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLFNBQVMsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUNyRSxNQUFNO2dCQUNQLENBQUM7Z0JBQ0QsYUFBYSxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDMUksQ0FBQztZQUVELElBQUksR0FBRyxhQUFhLENBQUM7UUFDdEIsQ0FBQztRQUVELE1BQU0sc0JBQXNCLEdBQUcsY0FBYyxDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVJLE1BQU0sdUJBQXVCLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLGtCQUFrQixDQUFDLHNCQUFzQixDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDckosTUFBTSxZQUFZLEdBQUcsTUFBTSw0QkFBNEIsQ0FBQyxZQUFZLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDcEcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDeEMsQ0FBQztBQUNGLENBQUMsQ0FBQztBQUVGLE1BQU0sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLGNBQWMsRUFBRSxlQUFlLENBQUMsQ0FBQztBQUN0RSxzQkFBc0IsQ0FBQztJQUN0QixFQUFFLDJGQUE0QztJQUM5QyxLQUFLLEVBQUUsa0JBQWtCO0lBQ3pCLEVBQUUsRUFBRSxJQUFJO0lBQ1IsUUFBUSxFQUFFO1FBQ1QsV0FBVyxFQUFFLGtCQUFrQixDQUFDLEtBQUs7UUFDckMsSUFBSSxFQUFFLENBQUM7Z0JBQ04sSUFBSSxFQUFFLE1BQU07Z0JBQ1osTUFBTSxFQUFFO29CQUNQLElBQUksRUFBRSxRQUFRO29CQUNkLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsVUFBVSxFQUFFO3dCQUNYLElBQUksRUFBRTs0QkFDTCxXQUFXLEVBQUUsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDhDQUE4QyxDQUFDOzRCQUMvRixJQUFJLEVBQUUsUUFBUTt5QkFDZDtxQkFDRDtpQkFDRDthQUNELENBQUM7S0FDRjtJQUNELEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQywyQkFBMkIsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDO0NBQ3ZFLENBQUMsQ0FBQztBQUVILE1BQU0sVUFBVSw4QkFBOEIsQ0FBQyxJQUFZLEVBQUUsSUFBb0Q7SUFDaEgsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7UUFDcEQsRUFBRSwyRkFBNEM7UUFDOUMsTUFBTSw2Q0FBbUM7UUFDekMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLElBQUksbUJBQW1CLENBQUMsS0FBSztRQUM1QyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87UUFDckIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1FBQ2IsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1FBQ2pCLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztRQUNiLE9BQU8sRUFBRSwyQkFBMkI7UUFDcEMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFO0tBQ2QsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUlELElBQVcsU0FHVjtBQUhELFdBQVcsU0FBUztJQUNuQix5RUFBeUU7SUFDekUsa0VBQXFCLENBQUE7QUFDdEIsQ0FBQyxFQUhVLFNBQVMsS0FBVCxTQUFTLFFBR25CO0FBRUQsNkZBQTZGO0FBQzdGLDJGQUEyRjtBQUMzRixnR0FBZ0c7QUFDaEcsb0VBQW9FO0FBQ3BFLElBQUksU0FBUyxFQUFFLENBQUM7SUFDZiw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLHNDQUE2QixDQUFDLEVBQUU7UUFDbkcsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxNQUFNLHlHQUFrRSxFQUFFLGtDQUFrQyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3pMLE9BQU8sRUFBRSxpREFBNkI7S0FDdEMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELGlHQUFpRztBQUNqRyxpR0FBaUc7QUFDakcsOEVBQThFO0FBQzlFLDhCQUE4QixDQUFDLFdBQVcsRUFBRTtJQUMzQyxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLE1BQU0seUdBQWtFLEVBQUUsbUJBQW1CLENBQUMsK0JBQStCLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxVQUFVLHVGQUFzQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsa0NBQWtDLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDL1QsT0FBTyxFQUFFLGtEQUE4QjtJQUN2QyxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsaURBQThCLEVBQUU7Q0FDaEQsQ0FBQyxDQUFDO0FBQ0gsOEJBQThCLENBQUMsV0FBVyxFQUFFO0lBQzNDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsTUFBTSx5R0FBa0UsRUFBRSxtQkFBbUIsQ0FBQywrQkFBK0IsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLFVBQVUsdUZBQXNDLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxrQ0FBa0MsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUMvVCxPQUFPLEVBQUUsNkNBQTBCO0NBQ25DLENBQUMsQ0FBQztBQUNILDhCQUE4QixDQUFDLFdBQVcsRUFBRTtJQUMzQyxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLE1BQU0seUdBQWtFLEVBQUUsbUJBQW1CLENBQUMsK0JBQStCLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxVQUFVLHVGQUFzQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsa0NBQWtDLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDL1QsT0FBTyxFQUFFLCtDQUE0QjtDQUNyQyxDQUFDLENBQUM7QUFDSCw4QkFBOEIsQ0FBQyxXQUFXLEVBQUU7SUFDM0MsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxNQUFNLHlHQUFrRSxFQUFFLG1CQUFtQixDQUFDLCtCQUErQixFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsVUFBVSx1RkFBc0MsRUFBRSxFQUFFLElBQUksQ0FBQyxFQUFFLGtDQUFrQyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQy9ULEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxtREFBNkIsOEJBQXFCLEVBQUU7Q0FDcEUsQ0FBQyxDQUFDO0FBRUgsNkJBQTZCO0FBQzdCLDhCQUE4QixDQUFDLFdBQVcsRUFBRTtJQUMzQyxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLE1BQU0seUdBQWtFLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxVQUFVLHVGQUFzQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN04sR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLG1EQUE2Qiw2QkFBb0IsRUFBRTtDQUNuRSxDQUFDLENBQUM7QUFFSCxrR0FBa0c7QUFDbEcsc0VBQXNFO0FBQ3RFLG9HQUFvRztBQUNwRywrQkFBK0I7QUFDL0IsOEJBQThCLENBQUMsV0FBVyxFQUFFO0lBQzNDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQztJQUNuRCxPQUFPLEVBQUUsK0NBQTRCO0NBQ3JDLENBQUMsQ0FBQztBQUNILDhCQUE4QixDQUFDLFdBQVcsRUFBRTtJQUMzQyxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7SUFDbkQsT0FBTyxFQUFFLGlEQUE4QjtDQUN2QyxDQUFDLENBQUM7QUFDSCw4QkFBOEIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUU7SUFDdEUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDO0lBQ25ELE9BQU8sRUFBRSxrREFBK0I7Q0FDeEMsQ0FBQyxDQUFDO0FBQ0gsOEJBQThCLENBQUMsTUFBTSxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFO0lBQ3RFLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQztJQUNuRCxPQUFPLEVBQUUsaURBQThCO0NBQ3ZDLENBQUMsQ0FBQztBQUVILG1HQUFtRztBQUNuRyw4QkFBOEIsQ0FBQyxNQUFNLEVBQUU7SUFDdEMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLGtDQUFrQyxDQUFDO0lBQ3ZGLE9BQU8sRUFBRSxnREFBMkIsd0JBQWU7SUFDbkQsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLCtDQUEyQix3QkFBZSxFQUFFO0NBQzVELENBQUMsQ0FBQztBQUVILDRFQUE0RTtBQUM1RSw4QkFBOEIsQ0FBQyxNQUFNLEVBQUU7SUFDdEMsSUFBSSxFQUFFLG1CQUFtQixDQUFDLEtBQUs7SUFDL0IsT0FBTyxFQUFFLGdEQUEyQix3QkFBZTtJQUNuRCxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsK0NBQTJCLHdCQUFlLEVBQUU7Q0FDNUQsQ0FBQyxDQUFDO0FBRUgsMkhBQTJIO0FBQzNILElBQUksS0FBSyxFQUFFLENBQUM7SUFDWCw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLHNDQUE2QixDQUFDLEVBQUU7UUFDbkcsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDO1FBQ25ELE9BQU8sRUFBRSxnREFBNkI7S0FDdEMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELDJCQUEyQjtBQUMzQiw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLHNDQUE2QixDQUFDLEVBQUU7SUFDbkcsT0FBTyxFQUFFLHFEQUFrQztJQUMzQyxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsZ0RBQThCLEVBQUU7Q0FDaEQsQ0FBQyxDQUFDO0FBQ0gsSUFBSSxTQUFTLEVBQUUsQ0FBQztJQUNmLDJCQUEyQjtJQUMzQix1REFBdUQ7SUFDdkQsOEJBQThCLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxzQ0FBNkIsQ0FBQyxFQUFFO1FBQ25HLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsTUFBTSwyR0FBcUUsQ0FBQztRQUMvSSxPQUFPLEVBQUUscURBQWtDO0tBQzNDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFDRCxxQ0FBcUM7QUFDckMsOEJBQThCLENBQUMsU0FBUyxFQUFFO0lBQ3pDLE9BQU8sRUFBRSxtREFBK0I7SUFDeEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLDhDQUEyQixFQUFFO0NBQzdDLENBQUMsQ0FBQztBQUNILCtCQUErQjtBQUMvQiw4QkFBOEIsQ0FBQyxRQUFRLEVBQUU7SUFDeEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLHFEQUFrQyxFQUFFO0NBQ3BELENBQUMsQ0FBQztBQUNILDZCQUE2QjtBQUM3Qiw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUU7SUFDM0UsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLHNEQUFrQyxFQUFFO0NBQ3BELENBQUMsQ0FBQztBQUNILDJCQUEyQjtBQUMzQiw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUU7SUFDM0UsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLHVEQUFtQyxFQUFFO0NBQ3JELENBQUMsQ0FBQztBQUNILG9CQUFvQjtBQUNwQiw4QkFBOEIsQ0FBQyxRQUFRLEVBQUU7SUFDeEMsT0FBTyxFQUFFLG1EQUE2QiwwQkFBaUI7SUFDdkQsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGtEQUE2QiwwQkFBaUIsRUFBRTtDQUNoRSxDQUFDLENBQUM7QUFDSCxtQkFBbUI7QUFDbkIsOEJBQThCLENBQUMsUUFBUSxFQUFFO0lBQ3hDLE9BQU8sRUFBRSxtREFBNkIsMEJBQWlCO0lBQ3ZELEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxrREFBNkIsMEJBQWlCLEVBQUU7Q0FDaEUsQ0FBQyxDQUFDIn0=