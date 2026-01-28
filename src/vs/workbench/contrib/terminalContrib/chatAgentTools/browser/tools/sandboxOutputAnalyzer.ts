/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
// import { OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import type { IOutputAnalyzer, IOutputAnalyzerOptions } from './outputAnalyzer.js';

export class SandboxOutputAnalyzer extends Disposable implements IOutputAnalyzer {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
	) {
		super();
	}

	async analyze(options: IOutputAnalyzerOptions): Promise<string | undefined> {
		// if (options.exitCode === undefined || options.exitCode === 0 || OS === OperatingSystem.Windows) {
		// 	return undefined;
		// }
		if (!(await this._sandboxService.isEnabled())) {
			return undefined;
		}
		if (options.exitCode === 403 || options.exitCode === 56) {
			const exitText = options.exitResult
				.split('\n')
				.filter(line => !line.startsWith('[SandboxDebug]'))
				.join('\n');
			// const domainRegex = /(?:https?:\/\/)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d+)?/g;
			// const domains = new Set<string>();
			// for (const match of exitText.matchAll(domainRegex)) {
			// 	const domain = match[1];
			// 	if (domain) {
			// 		domains.add(domain.toLowerCase());
			// 	}
			// }
			// if (domains.size > 0) {
			// 	const domainList = Array.from(domains.values()).join(', ');
			return localize('runInTerminalTool.sandboxCommandFailed.domain', 'testing: Command failed due to sandbox restrictions. Please check if the required domains are allowed in the sandbox configuration.');
			// }
			// return exitText;


		}
		return undefined;
	}
}
