/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import type { IOutputAnalyzer, IOutputAnalyzerOptions } from './outputAnalyzer.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';

export class SandboxOutputAnalyzer extends Disposable implements IOutputAnalyzer {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
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
		let fileSystemSetting: TerminalChatAgentToolsSettingId;
		switch (os) {
			case OperatingSystem.Linux:
				fileSystemSetting = TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem;
				break;
			case OperatingSystem.Windows:
				fileSystemSetting = TerminalChatAgentToolsSettingId.AgentSandboxWindowsFileSystem;
				break;
			default:
				fileSystemSetting = TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem;
				break;
		}

		const prefix = knownFailure
			? 'Command failed while running in sandboxed mode. If the command failed due to sandboxing:'
			: 'Command ran in sandboxed mode and may have been blocked by the sandbox. If the command failed due to sandboxing:';
		const retryWithAllowNetworkRequests = this._configurationService.getValue<boolean>(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests) === true;
		const networkRecovery = retryWithAllowNetworkRequests
			? '- If you determine from the output that the failure was caused by blocked network access, immediately retry the command with requestAllowNetwork=true and provide requestAllowNetworkReason. This keeps the command sandboxed with unrestricted network access and automatically shows a confirmation prompt to the user.\n- If it is not a network restriction, or the command still fails after retrying with requestAllowNetwork=true, immediately retry the command with requestUnsandboxedExecution=true and provide requestUnsandboxedExecutionReason. Do NOT ask the user - setting this flag automatically shows a confirmation prompt to the user.'
			: '- Sandboxed execution with unrestricted network access is disabled by chat.agent.sandbox.retryWithAllowNetworkRequests. Do not set requestAllowNetwork=true.\n- If the command cannot be made to work by updating sandbox rules, immediately retry it with requestUnsandboxedExecution=true and provide requestUnsandboxedExecutionReason. Do NOT ask the user - setting this flag automatically shows a confirmation prompt to the user.';
		return `${prefix}
- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in ${fileSystemSetting}, or to add required domains to ${AgentNetworkDomainSettingId.AllowedNetworkDomains}.
${networkRecovery}

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

/**
 * Checks whether output clearly suggests a network failure. This is used only
 * to prevent automatic unsandboxing; retry selection is left to the model.
 */
export function outputLooksSandboxNetworkBlocked(output: string): boolean {
	const normalized = output.replace(/\n/g, ' ');
	return /Could not resolve host|Temporary failure in name resolution|Name or service not known|EAI_AGAIN|ENETUNREACH|Network is unreachable|network (?:access )?(?:blocked|disabled)|(?:connect|socket).*(?:Operation not permitted|Permission denied)|(?:Operation not permitted|Permission denied).*(?:connect|socket)/i.test(normalized);
}
