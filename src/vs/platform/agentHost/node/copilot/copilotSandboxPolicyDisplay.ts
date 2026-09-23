/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { appendEscapedMarkdownInlineCode, escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../base/common/htmlContent.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { CopilotSlashCommandInvocation, CopilotSlashCommandOutput, CopilotSlashCommandResult, ICopilotSlashCommandHandler, RuntimeSlashCommandInfo } from './copilotSlashCommand.js';

export const copilotSandboxPolicyCommand: RuntimeSlashCommandInfo = {
	name: 'sandbox-policy',
	description: localize('copilotSlashCommand.sandboxPolicy', "Show the effective sandbox policy for this session"),
	kind: 'builtin',
	allowDuringAgentExecution: true,
};

export class CopilotSandboxPolicyDisplay {
	constructor(
		private readonly _sessionId: string,
		private readonly _storageUri: URI,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) { }

	getHandler(command: RuntimeSlashCommandInfo): ICopilotSlashCommandHandler | undefined {
		if (command.kind !== 'builtin' || (command.name !== copilotSandboxPolicyCommand.name && command.name !== 'sandbox')) {
			return undefined;
		}
		return {
			getInvocation: command.name === copilotSandboxPolicyCommand.name ? input => this.getInvocation(input) : undefined,
			getOutput: (input, result) => command.name === copilotSandboxPolicyCommand.name || input === 'policy' ? this.getOutput(result) : undefined,
		};
	}

	private getInvocation(input: string): CopilotSlashCommandInvocation {
		if (input.trim().length > 0) {
			throw new Error(localize('copilotSlashCommand.sandboxPolicyNoArguments', "The /sandbox-policy command does not accept arguments."));
		}
		return { name: 'sandbox', input: 'policy' };
	}

	private async getOutput(result: CopilotSlashCommandResult): Promise<CopilotSlashCommandOutput> {
		const text = result.kind === 'text' ? result.text : result.kind === 'completed' ? result.message : undefined;
		if (!text?.trim()) {
			throw new Error(localize('copilotSlashCommand.sandboxPolicyUnavailable', "The SDK did not return a sandbox policy."));
		}
		const markdown = formatSandboxPolicyMarkdown(text, result.kind !== 'text' || result.markdown === true);
		const resource = URI.joinPath(this._sessionDataService.getSessionDataDir(this._storageUri), 'diagnostics', generateUuid(), 'sandbox-policy.md');
		try {
			await this._fileService.writeFile(resource, VSBuffer.fromString(markdown));
		} catch (err) {
			this._logService.error(err, `[Copilot:${this._sessionId}] Failed to write sandbox policy`);
			throw err;
		}
		return {
			kind: 'link',
			resource,
			label: localize('copilotSlashCommand.openSandboxPolicy', "Open Sandbox Policy"),
			preview: true,
		};
	}
}

/** Formats the SDK's terminal policy report for display without interpreting its policy rules. */
function formatSandboxPolicyMarkdown(text: string, markdown: boolean): string {
	const cleanText = removeAnsiEscapeCodes(text);
	if (markdown) {
		return cleanText;
	}

	const titlePrefix = 'Effective sandbox policy for ';
	if (!cleanText.startsWith(titlePrefix)) {
		return new MarkdownString().appendCodeblock('text', cleanText).value;
	}

	const [title, ...lines] = cleanText.trimEnd().split(/\r?\n/);
	const output = [
		`# ${localize('copilotSandboxPolicy.title', "Effective sandbox policy")}`,
		'',
		appendEscapedMarkdownInlineCode(title.slice(titlePrefix.length)),
		'',
	];
	for (const line of lines) {
		const content = line.trim();
		if (!content) {
			output.push('');
		} else if (line.startsWith('    ')) {
			output.push(`- ${appendEscapedMarkdownInlineCode(content)}`);
		} else if (content.endsWith(':')) {
			const heading = line.startsWith('  ') ? '###' : '##';
			output.push('', `${heading} ${escapeMarkdownSyntaxTokens(content.slice(0, -1))}`, '');
		} else if (line.startsWith('  ')) {
			output.push(`- ${escapeMarkdownSyntaxTokens(content.replace(/^- /, ''))}`);
		} else {
			output.push('', escapeMarkdownSyntaxTokens(content), '');
		}
	}
	return output.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
