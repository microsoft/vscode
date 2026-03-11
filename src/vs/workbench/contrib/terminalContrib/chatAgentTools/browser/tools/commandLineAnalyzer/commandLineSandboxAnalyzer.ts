/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ITerminalSandboxService } from '../../../common/terminalSandboxService.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';

export class CommandLineSandboxAnalyzer extends Disposable implements ICommandLineAnalyzer {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
	) {
		super();
	}

	async analyze(_options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult> {
		if (!(await this._sandboxService.isEnabled())) {
			return {
				isAutoApproveAllowed: true,
			};
		}
		return {
			isAutoApproveAllowed: true,
			forceAutoApproval: true,
		};
	}
}
