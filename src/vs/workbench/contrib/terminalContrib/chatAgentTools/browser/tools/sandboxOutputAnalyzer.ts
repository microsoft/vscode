/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
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
		if (!(await this._sandboxService.isEnabled())) {
			return undefined;
		}

		return localize(
			'runInTerminalTool.sandboxCommandFailed',
			"Command failed while running in sandboxed mode. Use the command result to determine the scenario. If the issue is filesystem permissions, update allowWrite in {0} (Linux) or {1} (macOS). If the issue is domain/network related, add the required domains to {2}.allowedDomains.",
			TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem,
			TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem,
			TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
		);
	}
}
