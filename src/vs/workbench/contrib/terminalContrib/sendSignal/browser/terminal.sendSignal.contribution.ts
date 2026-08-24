/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '../../../../../base/common/platform.js';
import { isObject, isString } from '../../../../../base/common/types.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IQuickInputService, type QuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';

export const enum TerminalSendSignalCommandId {
	SendSignal = 'workbench.action.terminal.sendSignal',
}

function toOptionalString(obj: unknown): string | undefined {
	return isString(obj) ? obj : undefined;
}

const sendSignalString = localize2('sendSignal', "Send Signal");
registerTerminalAction({
	id: TerminalSendSignalCommandId.SendSignal,
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

		function isSignalArg(obj: unknown): obj is { signal: string } {
			return isObject(obj) && 'signal' in obj;
		}
		let signal = isSignalArg(args) ? toOptionalString(args.signal) : undefined;

		if (!signal) {
			const signalOptions: QuickPickItem[] = [
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
			} else {
				signal = selected.label;
			}
		}

		await instance.sendSignal(signal);
	}
});
