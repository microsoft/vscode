/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout } from '../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalService, type ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';

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
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
	}

	async createTerminal(shell: string, token: CancellationToken): Promise<IToolTerminal> {
		const instance = await this._createCopilotTerminal(shell);
		const toolTerminal: IToolTerminal = {
			instance,
			shellIntegrationQuality: ShellIntegrationQuality.None,
		};

		// Wait for shell integration when the fallback case has not been hit or when shell
		// integration injection is enabled. Note that it's possible for the fallback case to happen
		// and then for SI to activate again later in the session.
		const siInjectionEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled);

		// Get the configurable timeout to wait for shell integration
		const configuredTimeout = this._configurationService.getValue(TerminalChatAgentToolsSettingId.ShellIntegrationTimeout) as number | undefined;
		let waitTime: number;
		if (configuredTimeout === undefined || typeof configuredTimeout !== 'number' || configuredTimeout < 0) {
			waitTime = siInjectionEnabled ? 5000 : (instance.isRemote ? 3000 : 2000);
		} else {
			// There's an absolute minimum is 500ms
			waitTime = Math.max(configuredTimeout, 500);
		}

		if (
			ToolTerminalCreator._lastSuccessfulShell !== ShellLaunchType.Fallback ||
			siInjectionEnabled
		) {
			const shellIntegrationQuality = await this._waitForShellIntegration(instance, waitTime);
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

	private _createCopilotTerminal(shell: string) {
		return this._terminalService.createTerminal({
			config: {
				executable: shell,
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
		const store = new DisposableStore();
		const result = new DeferredPromise<ShellIntegrationQuality>();

		const siNoneTimer = store.add(new MutableDisposable());
		siNoneTimer.value = disposableTimeout(() => result.complete(ShellIntegrationQuality.None), timeoutMs);

		if (instance.capabilities.get(TerminalCapability.CommandDetection)?.hasRichCommandDetection) {
			// Rich command detection is available immediately.
			siNoneTimer.clear();
			result.complete(ShellIntegrationQuality.Rich);
		} else {
			const onSetRichCommandDetection = store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onSetRichCommandDetection));
			store.add(onSetRichCommandDetection.event((e) => {
				if (e.instance !== instance) {
					return;
				}
				siNoneTimer.clear();
				// Rich command detection becomes available some time after the terminal is created.
				result.complete(ShellIntegrationQuality.Rich);
			}));

			const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
			if (commandDetection) {
				siNoneTimer.clear();
				// When command detection lights up, allow up to 200ms for the rich command
				// detection sequence to come in before declaring it as basic shell integration.
				store.add(disposableTimeout(() => {
					result.complete(ShellIntegrationQuality.Basic);
				}, 200));
			} else {
				store.add(instance.capabilities.onDidAddCapabilityType(e => {
					if (e === TerminalCapability.CommandDetection) {
						siNoneTimer.clear();
						// When command detection lights up, allow up to 200ms for the rich command
						// detection sequence to come in before declaring it as basic shell
						// integration.
						store.add(disposableTimeout(() => {
							result.complete(ShellIntegrationQuality.Basic);
						}, 200));
					}
				}));
			}
		}

		result.p.finally(() => store.dispose());

		return result.p;
	}
}
