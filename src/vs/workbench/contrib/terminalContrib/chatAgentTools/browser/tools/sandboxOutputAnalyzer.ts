/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import type { IOutputAnalyzer, IOutputAnalyzerOptions } from './outputAnalyzer.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

export class SandboxOutputAnalyzer extends Disposable implements IOutputAnalyzer {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
	) {
		super();
	}

	async analyze(options: IOutputAnalyzerOptions): Promise<string | undefined> {
		if (options.exitCode === undefined || options.exitCode === 0) {
			return undefined;
		}
		if (!options.isSandboxWrapped) {
			return undefined;
		}

		const os = await this._sandboxService.getOS();
		const fileSystemSetting = os === OperatingSystem.Linux
			? TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem
			: TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem;
		return `Command failed while running in sandboxed mode. If the command failed due to sandboxing:
- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in ${fileSystemSetting}, or to add required domains to ${TerminalChatAgentToolsSettingId.TerminalSandboxNetwork}.allowedDomains.
- You can also rerun requestUnsandboxedExecution=true and prompt the user to bypass the sandbox.

Here is the output of the command:\n`;
	}
}
