/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import type { IOutputAnalyzer, IOutputAnalyzerOptions } from './outputAnalyzer.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';

export class SandboxOutputAnalyzer extends Disposable implements IOutputAnalyzer {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
	) {
		super();
	}

	async analyze(options: IOutputAnalyzerOptions): Promise<string | undefined> {
		if (!options.isSandboxWrapped) {
			return undefined;
		}

		const knownFailure = options.exitCode !== undefined && options.exitCode !== 0;
		const suspectedFailure = !knownFailure && options.exitCode === undefined && this._outputLooksSandboxBlocked(options.exitResult);

		if (!knownFailure && !suspectedFailure) {
			return undefined;
		}

		const os = await this._sandboxService.getOS();
		const fileSystemSetting = os === OperatingSystem.Linux
			? TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem
			: TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem;

		const prefix = knownFailure
			? 'Command failed while running in sandboxed mode. If the command failed due to sandboxing:'
			: 'Command ran in sandboxed mode and may have been blocked by the sandbox. If the command failed due to sandboxing:';
		return `${prefix}
- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in ${fileSystemSetting}, or to add required domains to ${AgentNetworkDomainSettingId.AllowedNetworkDomains}.
- Otherwise, immediately retry the command with requestUnsandboxedExecution=true. Do NOT ask the user — setting this flag automatically shows a confirmation prompt to the user.

Here is the output of the command:\n`;
	}

	/**
	 * Checks whether the command output contains strings that typically indicate
	 * the sandbox blocked the operation. Used when exit code is unavailable.
	 *
	 * The output may contain newlines inserted by terminal wrapping, so we
	 * strip them before testing.
	 */
	private _outputLooksSandboxBlocked(output: string): boolean {
		return outputLooksSandboxBlocked(output);
	}
}

/**
 * Checks whether the command output contains strings that typically indicate
 * the sandbox blocked the operation. The output may contain newlines inserted
 * by terminal wrapping, so we strip them before testing.
 */
export function outputLooksSandboxBlocked(output: string): boolean {
	const normalized = output.replace(/\n/g, ' ');
	return /Operation not permitted|Permission denied|Read-only file system|sandbox-exec|bwrap|sandbox_violation/i.test(normalized);
}
