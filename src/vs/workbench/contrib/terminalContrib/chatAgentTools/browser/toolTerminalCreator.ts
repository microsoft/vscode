/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, raceTimeout } from '../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { hasKey, isNumber, isObject, isString } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { PromptInputState } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { ITerminalLogService, ITerminalProfile, TerminalSettingId, type IShellLaunchConfig } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalService, type ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { getShellIntegrationTimeout } from '../../../terminal/common/terminalEnvironment.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';
import { isBash, isFish, isPowerShell, isZsh } from './runInTerminalHelpers.js';

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
	isBackground?: boolean;
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

	async createTerminal(shellOrProfile: string | ITerminalProfile, os: OperatingSystem, token: CancellationToken, cwd?: URI): Promise<IToolTerminal> {
		const instance = await this._createCopilotTerminal(shellOrProfile, os, cwd);
		const toolTerminal: IToolTerminal = {
			instance,
			shellIntegrationQuality: ShellIntegrationQuality.None,
		};
		let processReadyTimestamp = 0;

		// Ensure the shell process launches successfully
		const initResult = await Promise.any([
			instance.processReady.then(() => processReadyTimestamp = Date.now()),
			Event.toPromise(instance.onExit),
		]);
		if (!isNumber(initResult) && isObject(initResult) && hasKey(initResult, { message: true })) {
			throw new Error(initResult.message);
		}

		// Wait for shell integration when the fallback case has not been hit or when shell
		// integration injection is enabled. Note that it's possible for the fallback case to happen
		// and then for SI to activate again later in the session.
		const siInjectionEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled) === true;

		// Get the configurable timeout to wait for shell integration
		const waitTime = getShellIntegrationTimeout(
			this._configurationService,
			siInjectionEnabled,
			instance.hasRemoteAuthority,
			processReadyTimestamp
		);

		if (
			ToolTerminalCreator._lastSuccessfulShell !== ShellLaunchType.Fallback ||
			siInjectionEnabled
		) {
			this._logService.info(`ToolTerminalCreator#createTerminal: Waiting ${waitTime}ms for shell integration`);
			const shellIntegrationQuality = await this._waitForShellIntegration(instance, waitTime);
			if (token.isCancellationRequested) {
				instance.dispose();
				throw new CancellationError();
			}

			// If SI is rich, wait for the prompt state to change. This prevents an issue with pwsh
			// in particular where shell startup can swallow `\r` input events, preventing the
			// command from executing.
			if (shellIntegrationQuality === ShellIntegrationQuality.Rich) {
				const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
				if (commandDetection?.promptInputModel.state === PromptInputState.Unknown) {
					this._logService.info(`ToolTerminalCreator#createTerminal: Waiting up to 2s for PromptInputModel state to change`);
					const didStart = await raceTimeout(Event.toPromise(commandDetection.onCommandStarted), 2000);
					if (!didStart) {
						this._logService.info(`ToolTerminalCreator#createTerminal: PromptInputModel state did not change within timeout`);
					}
				}
			}

			if (shellIntegrationQuality !== ShellIntegrationQuality.None) {
				ToolTerminalCreator._lastSuccessfulShell = ShellLaunchType.Default;
				toolTerminal.shellIntegrationQuality = shellIntegrationQuality;
				// Execute shellCommand if provided (after shell integration is ready)
				await this._executeShellCommand(shellOrProfile, instance);
				return toolTerminal;
			}
		} else {
			this._logService.info(`ToolTerminalCreator#createTerminal: Skipping wait for shell integration - last successful launch type ${ToolTerminalCreator._lastSuccessfulShell}`);
			// Execute shellCommand even when skipping shell integration wait
			await this._executeShellCommand(shellOrProfile, instance);
		}

		// Fallback case: No shell integration in default profile
		ToolTerminalCreator._lastSuccessfulShell = ShellLaunchType.Fallback;
		// Execute shellCommand in fallback case as well
		await this._executeShellCommand(shellOrProfile, instance);
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

	/**
	 * Executes the shellCommand from the profile if provided.
	 * This runs after the shell is ready to prepare the environment (e.g., conda activate).
	 */
	private async _executeShellCommand(
		shellOrProfile: string | ITerminalProfile,
		instance: ITerminalInstance
	): Promise<void> {
		// Only execute if we have a profile object with a shellCommand
		if (isString(shellOrProfile)) {
			return;
		}

		const shellCommand = (shellOrProfile as ITerminalProfile & { shellCommand?: string }).shellCommand;

		// Skip if no command or empty string
		if (!shellCommand || shellCommand.trim().length === 0) {
			return;
		}

		this._logService.info(`ToolTerminalCreator#_executeShellCommand: Executing shell command: ${shellCommand}`);

		// Send the command to the terminal
		instance.sendText(shellCommand, true);

		// Wait for the command to complete
		await this._waitForCommandCompletion(instance);
	}

	/**
	 * Waits for the shell command to complete by monitoring for idle state.
	 * Resolves when the terminal has been idle for 500ms or after a 5s timeout.
	 */
	private _waitForCommandCompletion(instance: ITerminalInstance): Promise<void> {
		return new Promise(resolve => {
			const store = new DisposableStore();
			const maxTimeout = 5000;
			const idleThreshold = 500;
			const checkInterval = 100;
			let lastDataTime = Date.now();

			const cleanup = () => {
				store.dispose();
				resolve();
			};

			// Track when we receive data
			store.add(instance.onData(() => {
				lastDataTime = Date.now();
			}));

			// Absolute timeout
			store.add(disposableTimeout(cleanup, maxTimeout));

			// Idle check loop using setInterval pattern
			const checkIdle = () => {
				if (Date.now() - lastDataTime > idleThreshold) {
					cleanup();
				} else {
					store.add(disposableTimeout(checkIdle, checkInterval));
				}
			};
			// Start checking after initial idle threshold
			store.add(disposableTimeout(checkIdle, idleThreshold));
		});
	}

	private _createCopilotTerminal(shellOrProfile: string | ITerminalProfile, os: OperatingSystem, cwd?: URI) {
		const shellPath = isString(shellOrProfile) ? shellOrProfile : shellOrProfile.path;

		const env: Record<string, string> = {
			// Avoid making `git diff` interactive when called from copilot
			GIT_PAGER: 'cat',
		};

		const preventShellHistory = this._configurationService.getValue(TerminalChatAgentToolsSettingId.PreventShellHistory) === true;
		if (preventShellHistory) {
			// Check if the shell supports history exclusion via shell integration scripts
			if (
				isBash(shellPath, os) ||
				isZsh(shellPath, os) ||
				isFish(shellPath, os) ||
				isPowerShell(shellPath, os)
			) {
				env['VSCODE_PREVENT_SHELL_HISTORY'] = '1';
			}
		}

		const config: IShellLaunchConfig = {
			icon: ThemeIcon.fromId(Codicon.chatSparkle.id),
			hideFromUser: true,
			forcePersist: true,
			env,
		};

		if (isString(shellOrProfile)) {
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

		// Pass cwd to ensure AI terminals start in the workspace directory and inherit
		// workspace-level environment configuration (e.g., conda activation, Python env)
		return this._terminalService.createTerminal({ config, cwd });
	}

	private _waitForShellIntegration(
		instance: ITerminalInstance,
		timeoutMs: number
	): Promise<ShellIntegrationQuality> {
		const store = new DisposableStore();
		const result = new DeferredPromise<ShellIntegrationQuality>();

		const siNoneTimer = store.add(new MutableDisposable());
		siNoneTimer.value = disposableTimeout(() => {
			this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Timed out ${timeoutMs}ms, using no SI`);
			result.complete(ShellIntegrationQuality.None);
		}, timeoutMs);

		if (instance.capabilities.get(TerminalCapability.CommandDetection)?.hasRichCommandDetection) {
			// Rich command detection is available immediately.
			siNoneTimer.clear();
			this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Rich SI available immediately`);
			result.complete(ShellIntegrationQuality.Rich);
		} else {
			const onSetRichCommandDetection = store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onSetRichCommandDetection));
			store.add(onSetRichCommandDetection.event((e) => {
				if (e.instance !== instance) {
					return;
				}
				siNoneTimer.clear();
				// Rich command detection becomes available some time after the terminal is created.
				this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Rich SI available eventually`);
				result.complete(ShellIntegrationQuality.Rich);
			}));

			const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
			if (commandDetection) {
				siNoneTimer.clear();
				// When SI lights up, allow up to 200ms for the rich command
				// detection sequence to come in before declaring it as basic shell integration.
				store.add(disposableTimeout(() => {
					this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Timed out 200ms, using basic SI`);
					result.complete(ShellIntegrationQuality.Basic);
				}, 200));
			} else {
				store.add(instance.capabilities.onDidAddCommandDetectionCapability(e => {
					siNoneTimer.clear();
					// When command detection lights up, allow up to 200ms for the rich command
					// detection sequence to come in before declaring it as basic shell
					// integration.
					store.add(disposableTimeout(() => {
						this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Timed out 200ms, using basic SI (via listener)`);
						result.complete(ShellIntegrationQuality.Basic);
					}, 200));
				}));
			}
		}

		result.p.finally(() => {
			this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Promise complete, disposing store`);
			store.dispose();
		});

		return result.p;
	}
}
