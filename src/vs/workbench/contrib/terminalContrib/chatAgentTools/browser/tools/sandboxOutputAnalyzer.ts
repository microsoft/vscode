/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import type { IOutputAnalyzer, IOutputAnalyzerOptions } from './outputAnalyzer.js';
import { URI } from '../../../../../../base/common/uri.js';
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
		// sandbox_networking:if exit code 56, check for sandbox network restriction issues
		if (options.exitCode === 56 || options.exitCode === 403) {
			const domains = this._extractDomains(options.commandLine);
			if (domains.length === 0) {
				return undefined;
			}
			const sandboxChecks = this._sandboxService.checkIfDomainsAreSandboxed(domains);
			const sandboxedDomains = sandboxChecks
				.filter(check => check.isInAllowedList === true || check.isInDeniedList === true)
				.map(check => check.domain);

			// domains are not listed in sandbox config.
			if (sandboxedDomains.length === 0) {
				return localize(
					'runInTerminalTool.sandboxCommandFailed.unlistedDomains',
					"Command failed due to sandbox restrictions. The domains used in the command are not listed in the sandbox network settings. Use the ask_questions tool with options 'Yes: {domain name}' and 'No: {domain name}'. The question should be: 'Add {domain name} to allow list?', add the question header as 'manageDomain'. Do not try alternate approaches until the domains are added to the allow list in setting {1}. Domains: {0}.",
					domains.join(', '),
					TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
				);
				// added in denied list.
			} else if (sandboxChecks.filter(check => check.isInDeniedList === true).length > 0) {
				return localize(
					'runInTerminalTool.sandboxCommandFailed.deniedDomains',
					"Command failed due to sandbox restrictions. These domains are in the sandbox denied list: {0}. Use the ask_questions tool to ask the user if they want to remove {0} from the sandbox denied list in setting {1}. The question should be: 'Remove {domain name} from denied list?', add the question header as 'manageDomain'. Do not try alternate approaches until the domains are removed from the denied list.",
					sandboxedDomains.join(', '),
					TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
				);
			} else {
				//check for redirects
				return localize(
					'runInTerminalTool.sandboxCommandFailed.possibleRedirects',
					"Command failed due to sandbox restrictions. These domains are in the sandbox allowed list: {0}. These domains may redirect to another domain thats not added to the sandbox network settings {2}. Try `curl -IL https://{1}` to inspect redirects. Once redirect domains are identified, use the ask_questions tool with options 'Yes: {domain name}' and 'No: {domain name}'. The question should be: 'Add {domain name} to allow list?', add the question header as 'manageDomain'. Do not try alternate approaches until the redirect domains are added to the allow list.",
					sandboxedDomains.join(', '),
					sandboxedDomains[0],
					TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
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
