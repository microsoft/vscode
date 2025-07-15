/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, timeout } from '../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalService, type ITerminalInstance } from '../../../terminal/browser/terminal.js';

const enum ShellLaunchType {
	Unknown = 0,
	Default = 1,
	Fallback = 2,
}

export const enum ShellIntegrationQuality {
	None = 'none',
	Basic = 'basic',
	Rich = 'rich',
}

export interface IToolTerminal {
	instance: ITerminalInstance;
	shellIntegrationQuality: ShellIntegrationQuality;
}

export class ToolTerminalCreator {
	/**
	 * The shell preference cached for the lifetime of the window. This allows skipping previous
	 * shell approaches that failed in previous runs to save time.
	 */
	private static _lastSuccessfulShell: ShellLaunchType = ShellLaunchType.Unknown;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
	}

	async createTerminal(token: CancellationToken): Promise<IToolTerminal> {
		const instance = await this._createCopilotTerminal();
		const toolTerminal: IToolTerminal = {
			instance,
			shellIntegrationQuality: ShellIntegrationQuality.None,
		};

		// The default profile has shell integration
		if (ToolTerminalCreator._lastSuccessfulShell <= ShellLaunchType.Default) {
			const shellIntegrationQuality = await this._waitForShellIntegration(instance, 5000);
			if (token.isCancellationRequested) {
				instance.dispose();
				throw new CancellationError();
			}

			if (shellIntegrationQuality !== ShellIntegrationQuality.None) {
				ToolTerminalCreator._lastSuccessfulShell = ShellLaunchType.Default;
				toolTerminal.shellIntegrationQuality = shellIntegrationQuality;
				return toolTerminal;
			}
		}

		// Fallback case: No shell integration in default profile
		ToolTerminalCreator._lastSuccessfulShell = ShellLaunchType.Fallback;
		return toolTerminal;
	}

	private _createCopilotTerminal() {
		return this._terminalService.createTerminal({
			config: {
				name: 'Copilot',
				icon: ThemeIcon.fromId('copilot'),
				hideFromUser: true,
				env: {
					GIT_PAGER: 'cat', // avoid making `git diff` interactive when called from copilot
				},
			},
		});
	}

	private _waitForShellIntegration(
		instance: ITerminalInstance,
		timeoutMs: number
	): Promise<ShellIntegrationQuality> {
		let shellIntegrationQuality: ShellIntegrationQuality.Basic | ShellIntegrationQuality.Rich = ShellIntegrationQuality.Basic;

		// TODO: This could be done much nicer in core - listen to CommandDetectionCapability.onSetRichCommandDetection
		const dataFinished = new DeferredPromise<void>();
		const dataListener = instance.onData(e => {
			if (e.match(oscRegex('633;P;HasRichCommandDetection=True'))) {
				shellIntegrationQuality = ShellIntegrationQuality.Rich;
				dataFinished.complete();
			}
		});

		const deferred = new DeferredPromise<ShellIntegrationQuality>();
		const timer = disposableTimeout(() => deferred.complete(ShellIntegrationQuality.None), timeoutMs);

		if (instance.capabilities.get(TerminalCapability.CommandDetection)?.hasRichCommandDetection) {
			timer.dispose();
			deferred.complete(shellIntegrationQuality);
		} else {
			const onSetRichCommandDetection = this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onSetRichCommandDetection);

			const siListener = onSetRichCommandDetection.event((e) => {
				if (e.instance !== instance) {
					return;
				}
				timer.dispose();
				// TODO: This could be simplified, this event will only ever fire when it's rich
				if (shellIntegrationQuality === ShellIntegrationQuality.Rich) {
					deferred.complete(shellIntegrationQuality);
				}
			});

			const store = new DisposableStore();

			const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
			if (commandDetection) {
				// When command detection lights up, allow up to 200ms for the rich command
				// detection sequence to come in before declaring it as basic shell integration.
				// up.
				Promise.race([
					dataFinished.p,
					timeout(200)
				]).then(() => deferred.complete(shellIntegrationQuality));
			} else {
				store.add(instance.capabilities.onDidAddCapabilityType(e => {
					if (e === TerminalCapability.CommandDetection) {
						// When command detection lights up, allow up to 200ms for the rich command
						// detection sequence to come in before declaring it as basic shell integration.
						// up.
						Promise.race([
							dataFinished.p,
							timeout(200)
						]).then(() => deferred.complete(shellIntegrationQuality));
					}
				}));
			}
			// TODO: Listen for basic shell integration
			// else {
			// 		// While the rich command detection data should come in before
			// 		// `onDidChangeTerminalShellIntegration` fires, the data write event is
			// 		// debounced/buffered, so allow for up to 200ms for the data event to come
			// 		// up.
			// 		Promise.race([
			// 			dataFinished.p,
			// 			timeout(200)
			// 		]).then(() => deferred.complete(shellIntegrationQuality));
			// 	}
			// }

			deferred.p.finally(() => {
				store.dispose();
				siListener.dispose();
				dataListener.dispose();
			});
		}

		return deferred.p;
	}
}

/**
 * Gets a regex that matches an OSC sequence with the given params.
 * @param params The body of the OSC sequence, such as `633;A`. This is passed in to the RegExp
 * constructor so it should follow those escape rules and you can match on things like `[16]33;A`.
 */
function oscRegex(params: string): RegExp {
	// This includes all the possible OSC encodings. The most common prefix is `\x1b]` and the most
	// command suffixes are `\x07` and `\x1b\\`.
	return new RegExp(`(?:\x1b\\]|\x9d)${params}(?:\x1b\\\\|\x07|\x9c)`);
}
