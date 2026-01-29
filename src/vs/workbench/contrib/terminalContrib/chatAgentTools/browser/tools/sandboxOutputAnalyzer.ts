/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import type { IOutputAnalyzer, IOutputAnalyzerOptions } from './outputAnalyzer.js';
import { createCommandUri, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';

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
		// sandbox_networking:if exit code 56, check for sandbox network restriction issues
		if (options.exitCode === 56) {
			const domains = this._extractDomains(options.commandLine);
			if (domains.length === 0) {
				return undefined;
			}
			const sandboxChecks = this._sandboxService.checkIfDomainsAreSandboxed(domains);
			const sandboxedDomains = sandboxChecks
				.filter(check => check.isInAllowedList === true || check.isInDeniedList === true)
				.map(check => check.domain);

			const settingsUri = createCommandUri('workbench.action.openSettings', { query: 'sandbox network' });
			const settingsLink = new MarkdownString(
				`[${localize('terminal.sandbox.network settings', 'Update Settings')}](${settingsUri.toString()} "${localize('terminal.sandbox.network.settings.tooltip', 'Open settings and search for sandbox')}")`,
				{ isTrusted: { enabledCommands: ['workbench.action.openSettings'] } }
			);
			// domains are not listed in sandbox config.
			if (sandboxedDomains.length === 0) {
				return localize(
					'runInTerminalTool.sandboxCommandFailed.unlistedDomains',
					"Command failed due to sandbox restrictions. The domains used in the command are not listed in the sandbox network settings. Domains can be updated in sandbox settings using {0}.",
					settingsLink.value
				);
				// added in denied list.
			} else if (sandboxChecks.filter(check => check.isInDeniedList === true).length > 0) {
				return localize(
					'runInTerminalTool.sandboxCommandFailed.deniedDomains',
					"Command failed due to sandbox restrictions. These domains are in the sandbox denied list: {0}. Domains can be updated in sandbox settings using {1}.",
					sandboxedDomains.join(', '),
					settingsLink.value
				);
			} else {
				//check for redirects
				return localize(
					'runInTerminalTool.sandboxCommandFailed.possibleRedirects',
					"Command failed due to sandbox restrictions. These domains are in the sandbox allowed list: {0}. These domains may redirect to another domain thats not added to the sandbox network settings; try `curl -IL https://{1}` to inspect redirects. Domains can be updated in sandbox settings using {2}.",
					sandboxedDomains.join(', '),
					sandboxedDomains[0],
					settingsLink.value
				);
			}
		}
		return undefined;
	}

	private _extractDomains(text: string): string[] {
		const urlRegex = /https?:\/\/\S+/g;
		const domains = new Set<string>();
		for (const match of text.matchAll(urlRegex)) {
			const rawUrl = match[0].replace(/[\]\[),.]+$/, '');
			const parsed = URI.parse(rawUrl);
			if (parsed.authority) {
				const domain = parsed.authority.split(':')[0];
				if (domain) {
					domains.add(domain.toLowerCase());
				}
			}
		}
		return Array.from(domains);
	}
}
