/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, timeout } from '../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
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
				icon: ThemeIcon.fromId(Codicon.chatSparkle.id),
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
		const dataFinished = new DeferredPromise<void>();

		const deferred = new DeferredPromise<ShellIntegrationQuality>();
		const timer = disposableTimeout(() => deferred.complete(ShellIntegrationQuality.None), timeoutMs);

		if (instance.capabilities.get(TerminalCapability.CommandDetection)?.hasRichCommandDetection) {
			timer.dispose();
			deferred.complete(ShellIntegrationQuality.Rich);
		} else {
			const onSetRichCommandDetection = this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onSetRichCommandDetection);

			const richCommandDetectionListener = onSetRichCommandDetection.event((e) => {
				if (e.instance !== instance) {
					return;
				}
				deferred.complete(ShellIntegrationQuality.Rich);
			});

			const store = new DisposableStore();

			const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
			if (commandDetection) {
				timer.dispose();
				// When command detection lights up, allow up to 200ms for the rich command
				// detection sequence to come in before declaring it as basic shell integration.
				// up.
				Promise.race([
					dataFinished.p,
					timeout(200)
				]).then(() => {
					if (!deferred.isResolved) {
						deferred.complete(ShellIntegrationQuality.Basic);
					}
				});
			} else {
				store.add(instance.capabilities.onDidAddCapabilityType(e => {
					if (e === TerminalCapability.CommandDetection) {
						timer.dispose();
						// When command detection lights up, allow up to 200ms for the rich command
						// detection sequence to come in before declaring it as basic shell integration.
						// up.
						Promise.race([
							dataFinished.p,
							timeout(200)
						]).then(() => deferred.complete(ShellIntegrationQuality.Basic));
					}
				}));
			}

			deferred.p.finally(() => {
				store.dispose();
				richCommandDetectionListener.dispose();
			});
		}

		return deferred.p;
	}
}
