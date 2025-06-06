/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { isObject, isString } from '../../../../../base/common/types.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IQuickInputService, type QuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalSendCommandsCommandId } from '../common/terminal.sendCommands.js';

function toOptionalString(obj: unknown): string | undefined {
	return isString(obj) ? obj : undefined;
}

const sendSequenceString = localize2('sendSequence', "Send Sequence");
registerTerminalAction({
	id: TerminalSendCommandsCommandId.SendSequence,
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
	run: async (c, accessor, args) => {
		const quickInputService = accessor.get(IQuickInputService);
		const configurationResolverService = accessor.get(IConfigurationResolverService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const historyService = accessor.get(IHistoryService);

		const instance = c.service.activeInstance;
		if (instance) {
			let text = isObject(args) && 'text' in args ? toOptionalString(args.text) : undefined;

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

			const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(instance.isRemote ? Schemas.vscodeRemote : Schemas.file);
			const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
			const resolvedText = await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, text);
			instance.sendText(resolvedText, false);
		}
	}
});

const sendSignalString = localize2('sendSignal', "Send Signal");
registerTerminalAction({
	id: TerminalSendCommandsCommandId.SendSignal,
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

		let signal = isObject(args) && 'signal' in args ? toOptionalString(args.signal) : undefined;

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
