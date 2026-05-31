/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { ITerminalSandboxService } from '../../../common/terminalSandboxService.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';

export class CommandLineSandboxAnalyzer extends Disposable implements ICommandLineAnalyzer {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	private _isAutoApproveEnabled(): boolean {
		return this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) !== false;
	}

	async analyze(_options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult> {
		const isAutoApproveEnabled = this._isAutoApproveEnabled();
		if (!(await this._sandboxService.isEnabled())) {
			return {
				isAutoApproveAllowed: isAutoApproveEnabled,
			};
		}
		return {
			isAutoApproveAllowed: isAutoApproveEnabled,
			forceAutoApproval: !_options.requiresUnsandboxConfirmation && isAutoApproveEnabled,
		};
	}
}
