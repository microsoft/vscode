/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isNumber, isObject } from '../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { PromptInputState } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { ITerminalLogService, ITerminalProfile, TerminalSettingId, type IShellLaunchConfig } from '../../../../../platform/terminal/common/terminal.js';
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
	receivedUserInput?: boolean;
}

export class ToolTerminalCreator {
	/**
	 * The shell preference cached for the lifetime of the window. This allows skipping previous
	 * shell approaches that failed in previous runs to save time.
	 */
	private static _lastSuccessfulShell: ShellLaunchType = ShellLaunchType.Unknown;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
	}

	async createTerminal(shellOrProfile: string | ITerminalProfile, token: CancellationToken): Promise<IToolTerminal> {
		const instance = await this._createCopilotTerminal(shellOrProfile);
		const toolTerminal: IToolTerminal = {
			instance,
			shellIntegrationQuality: ShellIntegrationQuality.None,
		};
		let processReadyTime: number | undefined;
		const store = new DisposableStore();
		const processReadyListener = store.add(instance.onProcessIdReady(() => {
			processReadyTime = Date.now();
		}));
		const siInjectionEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled);
		const timeoutValue = this._configurationService.getValue<unknown>(TerminalSettingId.ShellIntegrationTimeout);
		let commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		let timeoutMs: number;

		if (!isNumber(timeoutValue) || timeoutValue < 0) {
			timeoutMs = siInjectionEnabled ? 5000 : (instance.isRemote ? 3000 : 2000);
		} else {
			timeoutMs = Math.max(timeoutValue, 500);
		}

		// Ensure the shell process launches successfully
		const initResult = await Promise.any([
			instance.processReady, // Question: Should I just `then` on `processReady` instead of listening to `onProcessIdReady earlier?`
			Event.toPromise(instance.onExit),
		]);

		if (!isNumber(initResult) && isObject(initResult) && 'message' in initResult) {
			processReadyListener.dispose();
			throw new Error(initResult.message);
		}
		if (
			ToolTerminalCreator._lastSuccessfulShell !== ShellLaunchType.Fallback ||
			siInjectionEnabled
		) {
			// Question: Not sure if this exact if conditions are valid for both runCommand for for Copilot terminals.
			if (!commandDetection || commandDetection.promptInputModel.state !== PromptInputState.Input) {
				if (processReadyTime) {
					const elapsed = Date.now() - processReadyTime;
					timeoutMs = Math.max(0, timeoutMs - elapsed);
				}

				await Promise.race([
					new Promise<void>(r => {
						store.add(instance.capabilities.onDidAddCommandDetectionCapability(e => {
							commandDetection = e;
							if (commandDetection.promptInputModel.state === PromptInputState.Input) {
								r();
							} else {
								store.add(commandDetection.promptInputModel.onDidStartInput(() => {
									r();
								}));
							}
						}));
					}),
					timeout(timeoutMs)
				]);
				// Question: I should remove this store.dispose(). If I call processReadyListener.dispose() afterwards, would it throw error?
				store.dispose();
			}

			if (token.isCancellationRequested) {
				processReadyListener.dispose();
				instance.dispose();
				throw new CancellationError();
			}

			processReadyListener.dispose();
			const shellIntegrationQuality = commandDetection?.hasRichCommandDetection
				? ShellIntegrationQuality.Rich
				: commandDetection
					? ShellIntegrationQuality.Basic
					: ShellIntegrationQuality.None;

			if (shellIntegrationQuality !== ShellIntegrationQuality.None) {
				ToolTerminalCreator._lastSuccessfulShell = ShellLaunchType.Default;
				toolTerminal.shellIntegrationQuality = shellIntegrationQuality;
				return toolTerminal;
			}
		} else {
			this._logService.info(`ToolTerminalCreator#createTerminal: Skipping wait for shell integration - last successful launch type ${ToolTerminalCreator._lastSuccessfulShell}`);
		}

		// Fallback case: No shell integration in default profile
		ToolTerminalCreator._lastSuccessfulShell = ShellLaunchType.Fallback;
		return toolTerminal;
	}

	/**
	 * Synchronously update shell integration quality based on the terminal instance's current
	 * capabilities. This is a defensive change to avoid no shell integration being sticky
	 * https://github.com/microsoft/vscode/issues/260880
	 *
	 * Only upgrade quality just in case.
	 */
	refreshShellIntegrationQuality(toolTerminal: IToolTerminal) {
		const commandDetection = toolTerminal.instance.capabilities.get(TerminalCapability.CommandDetection);
		if (commandDetection) {
			if (
				toolTerminal.shellIntegrationQuality === ShellIntegrationQuality.None ||
				toolTerminal.shellIntegrationQuality === ShellIntegrationQuality.Basic
			) {
				toolTerminal.shellIntegrationQuality = commandDetection.hasRichCommandDetection ? ShellIntegrationQuality.Rich : ShellIntegrationQuality.Basic;
			}
		}
	}

	private _createCopilotTerminal(shellOrProfile: string | ITerminalProfile) {
		const config: IShellLaunchConfig = {
			icon: ThemeIcon.fromId(Codicon.chatSparkle.id),
			hideFromUser: true,
			forcePersist: true,
			env: {
				// Avoid making `git diff` interactive when called from copilot
				GIT_PAGER: 'cat',
			}
		};

		if (typeof shellOrProfile === 'string') {
			config.executable = shellOrProfile;
		} else {
			config.executable = shellOrProfile.path;
			config.args = shellOrProfile.args;
			config.icon = shellOrProfile.icon ?? config.icon;
			config.color = shellOrProfile.color;
			config.env = {
				...config.env,
				...shellOrProfile.env
			};
		}

		return this._terminalService.createTerminal({ config });
	}
}
