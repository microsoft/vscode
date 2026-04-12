/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isWindows } from '../../../../../base/common/platform.js';
import { isObject, isString } from '../../../../../base/common/types.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
export var TerminalSendSignalCommandId;
(function (TerminalSendSignalCommandId) {
    TerminalSendSignalCommandId["SendSignal"] = "workbench.action.terminal.sendSignal";
})(TerminalSendSignalCommandId || (TerminalSendSignalCommandId = {}));
function toOptionalString(obj) {
    return isString(obj) ? obj : undefined;
}
const sendSignalString = localize2('sendSignal', "Send Signal");
registerTerminalAction({
    id: "workbench.action.terminal.sendSignal" /* TerminalSendSignalCommandId.SendSignal */,
    title: sendSignalString,
    f1: !isWindows,
    metadata: {
        description: sendSignalString.value,
        args: [{
                name: 'args',
                schema: {
                    type: 'object',
                    required: ['signal'],
                    properties: {
                        signal: {
                            description: localize('sendSignal.signal.desc', "The signal to send to the terminal process (e.g., 'SIGTERM', 'SIGINT', 'SIGKILL')"),
                            type: 'string'
                        }
                    },
                }
            }]
    },
    run: async (c, accessor, args) => {
        const quickInputService = accessor.get(IQuickInputService);
        const instance = c.service.activeInstance;
        if (!instance) {
            return;
        }
        function isSignalArg(obj) {
            return isObject(obj) && 'signal' in obj;
        }
        let signal = isSignalArg(args) ? toOptionalString(args.signal) : undefined;
        if (!signal) {
            const signalOptions = [
                { label: 'SIGINT', description: localize('SIGINT', 'Interrupt process (Ctrl+C)') },
                { label: 'SIGTERM', description: localize('SIGTERM', 'Terminate process gracefully') },
                { label: 'SIGKILL', description: localize('SIGKILL', 'Force kill process') },
                { label: 'SIGSTOP', description: localize('SIGSTOP', 'Stop process') },
                { label: 'SIGCONT', description: localize('SIGCONT', 'Continue process') },
                { label: 'SIGHUP', description: localize('SIGHUP', 'Hangup') },
                { label: 'SIGQUIT', description: localize('SIGQUIT', 'Quit process') },
                { label: 'SIGUSR1', description: localize('SIGUSR1', 'User-defined signal 1') },
                { label: 'SIGUSR2', description: localize('SIGUSR2', 'User-defined signal 2') },
                { type: 'separator' },
                { label: localize('manualSignal', 'Manually enter signal') }
            ];
            const selected = await quickInputService.pick(signalOptions, {
                placeHolder: localize('selectSignal', 'Select signal to send to terminal process')
            });
            if (!selected) {
                return;
            }
            if (selected.label === localize('manualSignal', 'Manually enter signal')) {
                const inputSignal = await quickInputService.input({
                    prompt: localize('enterSignal', 'Enter signal name (e.g., SIGTERM, SIGKILL)'),
                });
                if (!inputSignal) {
                    return;
                }
                signal = inputSignal;
            }
            else {
                signal = selected.label;
            }
        }
        await instance.sendSignal(signal);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuc2VuZFNpZ25hbC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvc2VuZFNpZ25hbC9icm93c2VyL3Rlcm1pbmFsLnNlbmRTaWduYWwuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLGtCQUFrQixFQUFzQixNQUFNLHlEQUF5RCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXRGLE1BQU0sQ0FBTixJQUFrQiwyQkFFakI7QUFGRCxXQUFrQiwyQkFBMkI7SUFDNUMsa0ZBQW1ELENBQUE7QUFDcEQsQ0FBQyxFQUZpQiwyQkFBMkIsS0FBM0IsMkJBQTJCLFFBRTVDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxHQUFZO0lBQ3JDLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUN4QyxDQUFDO0FBRUQsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0FBQ2hFLHNCQUFzQixDQUFDO0lBQ3RCLEVBQUUscUZBQXdDO0lBQzFDLEtBQUssRUFBRSxnQkFBZ0I7SUFDdkIsRUFBRSxFQUFFLENBQUMsU0FBUztJQUNkLFFBQVEsRUFBRTtRQUNULFdBQVcsRUFBRSxnQkFBZ0IsQ0FB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