/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { dirname as posixDirname, posix } from '../../../../../../base/common/path.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import type { IOutputAnalyzer, IOutputAnalyzerOptions } from './outputAnalyzer.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { ILanguageModelToolsService } from '../../../../chat/common/tools/languageModelToolsService.js';
import { AskQuestionsToolId } from '../../../../chat/common/tools/builtinTools/askQuestionsTool.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';

const addDomainQuestionHeader = 'addSandboxDomain';
const addPathQuestionHeader = 'addSandboxPath';
const domainCandidatePattern = /(?:https?|wss?):\/\/(?<urlHost>[^/\s'"`]+)|(?<host>(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?::\d+)?/gi;
const filesystemPathCandidatePattern = /(?<path>(?:~\/|\.{1,2}\/|\/)[^\s'"`:,;()\]]+)/g;
const networkIssuePattern = /(403|forbidden|network|domain|host|dns|resolve|connect|egress|tls|ssl|certificate|socket|fetch|proxy)/i;
const networkLinePattern = /(403|forbidden|domain|host|dns|resolve|connect|egress|tls|ssl|certificate|socket|fetch|proxy|sandbox)/i;

export class SandboxOutputAnalyzer extends Disposable implements IOutputAnalyzer {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
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

		const npxRetrySuggestion = this._withNpxRetrySuggestion(options.commandLine);
		if (npxRetrySuggestion) {
			return npxRetrySuggestion;
		}

		const blockedPath = this._findBlockedFileSystemPath(options.exitResult);
		if (blockedPath) {
			const pathStatus = this._sandboxService.getFileSystemPathStatus(blockedPath);
			if (pathStatus.inDenyWrite) {
				return localize(
					'runInTerminalTool.sandboxPathDeniedWrite',
					"Command failed while running in sandboxed mode. VS Code detected blocked filesystem access to {0}, but it is already present in denyWrite. Remove it from the denied list or adjust the sandbox rules before retrying.",
					`\`${blockedPath}\``,
				);
			}

			if (pathStatus.inDenyRead) {
				return localize(
					'runInTerminalTool.sandboxPathDeniedRead',
					"Command failed while running in sandboxed mode. VS Code detected blocked filesystem access to {0}, but it is already present in denyRead. Remove it from the denied list or adjust the sandbox rules before retrying.",
					`\`${blockedPath}\``,
				);
			}

			if (pathStatus.inAllowWrite) {
				return localize(
					'runInTerminalTool.sandboxPathAlreadyAllowed',
					"Command failed while running in sandboxed mode. VS Code detected blocked filesystem access to {0}, and it is already present in allowWrite. Check denyWrite, denyRead, or the command output for a different blocked path.",
					`\`${blockedPath}\``,
				);
			}

			const pathWasAdded = await this._askToAddPath(blockedPath, options.chatSessionResource, options.chatRequestId, options.token);
			if (pathWasAdded === true) {
				return localize(
					'runInTerminalTool.sandboxPathAdded',
					"Command failed while running in sandboxed mode. VS Code detected blocked filesystem access to {0} and added it to allowWrite. Re-run the command to retry with the updated sandbox settings.",
					`\`${blockedPath}\``,
				);
			}

			if (pathWasAdded === false) {
				return localize(
					'runInTerminalTool.sandboxPathNotAdded',
					"Command failed while running in sandboxed mode. VS Code detected blocked filesystem access to {0}, but it was not added to allowWrite.",
					`\`${blockedPath}\``,
				);
			}

			return localize(
				'runInTerminalTool.sandboxPathDetected',
				"Command failed while running in sandboxed mode. VS Code detected blocked filesystem access to {0}. Add it to allowWrite if that location should be writable.",
				`\`${blockedPath}\``,
			);
		}

		const blockedDomain = this._findBlockedDomain(options.exitResult);
		if (blockedDomain) {
			const domainStatus = this._sandboxService.getDomainListStatus(blockedDomain);
			if (domainStatus.inDeniedDomains) {
				return localize(
					'runInTerminalTool.sandboxDomainDenied',
					"Command failed while running in sandboxed mode. VS Code detected blocked access to {0}, but it is already present in {1}.deniedDomains. Remove it from the denied list or adjust the sandbox rules before retrying.",
					`\`${blockedDomain}\``,
					TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
				);
			}

			if (domainStatus.inAllowedDomains) {
				return localize(
					'runInTerminalTool.sandboxDomainAlreadyAllowed',
					"Command failed while running in sandboxed mode. VS Code detected blocked access to {0}, and it is already present in {1}.allowedDomains. Check {1}.deniedDomains or the command output for a different blocked host.",
					`\`${blockedDomain}\``,
					TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
				);
			}

			const domainWasAdded = await this._askToAddDomain(blockedDomain, options.chatSessionResource, options.chatRequestId, options.token);
			if (domainWasAdded === true) {
				return localize(
					'runInTerminalTool.sandboxDomainAdded',
					"Command failed while running in sandboxed mode. VS Code detected blocked access to {0} and added it to {1}.allowedDomains. Re-run the command to retry with the updated sandbox settings.",
					`\`${blockedDomain}\``,
					TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
				);
			}

			if (domainWasAdded === false) {
				return localize(
					'runInTerminalTool.sandboxDomainNotAdded',
					"Command failed while running in sandboxed mode. VS Code detected blocked access to {0}, but it was not added to {1}.allowedDomains.",
					`\`${blockedDomain}\``,
					TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
				);
			}

			return localize(
				'runInTerminalTool.sandboxDomainDetected',
				"Command failed while running in sandboxed mode. VS Code detected blocked access to {0}. Add it to {1}.allowedDomains if that domain should be reachable.",
				`\`${blockedDomain}\``,
				TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
			);
		}

		return localize(
			'runInTerminalTool.sandboxCommandFailed',
			"Command failed while running in sandboxed mode. Use the command result to determine the scenario. If the issue is filesystem permissions, update allowWrite in {0} (Linux) or {1} (macOS). If the issue is domain/network related, add the required domains to {2}.allowedDomains.",
			TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem,
			TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem,
			TerminalChatAgentToolsSettingId.TerminalSandboxNetwork
		);
	}

	private _withNpxRetrySuggestion(commandLine: string): string | undefined {
		const rewrittenCommandLine = this._rewriteNpxCommand(commandLine);
		if (!rewrittenCommandLine) {
			return undefined;
		}

		return localize(
			'runInTerminalTool.sandboxNpxRetrySuggestion',
			"Command failed while running in sandboxed mode. If this command uses npx in the sandbox, retry it as {0}.",
			`\`${rewrittenCommandLine}\``
		);
	}

	private _rewriteNpxCommand(commandLine: string): string | undefined {
		if (!/\bnpx\b/.test(commandLine)) {
			return undefined;
		}

		return commandLine.replace(/\bnpx\b/, 'node --import npx');
	}

	private async _askToAddDomain(domain: string, chatSessionResource: IOutputAnalyzerOptions['chatSessionResource'], chatRequestId: string | undefined, token: CancellationToken): Promise<boolean | undefined> {
		if (!chatSessionResource) {
			return undefined;
		}

		try {
			const result = await this._languageModelToolsService.invokeTool({
				callId: generateUuid(),
				toolId: AskQuestionsToolId,
				parameters: {
					questions: [{
						header: addDomainQuestionHeader,
						question: localize('runInTerminalTool.sandboxDomainQuestion', 'Add {0} to the terminal sandbox allowed domains?', domain),
						options: [{
							label: localize('runInTerminalTool.sandboxDomainQuestion.add', 'Add Domain'),
							recommended: true,
						}, {
							label: localize('runInTerminalTool.sandboxDomainQuestion.skip', 'Do Not Add'),
						}]
					}]
				},
				context: { sessionResource: chatSessionResource },
				chatRequestId,
			}, async () => 0, token);

			const answer = this._parseAskQuestionsAnswer(result, addDomainQuestionHeader);
			if (!answer || answer.skipped || !answer.selected.includes(localize('runInTerminalTool.sandboxDomainQuestion.add', 'Add Domain'))) {
				return false;
			}

			return this._sandboxService.addDomainToAllowedDomains(domain);
		} catch {
			return undefined;
		}
	}

	private async _askToAddPath(path: string, chatSessionResource: IOutputAnalyzerOptions['chatSessionResource'], chatRequestId: string | undefined, token: CancellationToken): Promise<boolean | undefined> {
		if (!chatSessionResource) {
			return undefined;
		}

		try {
			const result = await this._languageModelToolsService.invokeTool({
				callId: generateUuid(),
				toolId: AskQuestionsToolId,
				parameters: {
					questions: [{
						header: addPathQuestionHeader,
						question: localize('runInTerminalTool.sandboxPathQuestion', 'Add {0} to the terminal sandbox allowWrite list?', path),
						options: [{
							label: localize('runInTerminalTool.sandboxPathQuestion.add', 'Add Path'),
							recommended: true,
						}, {
							label: localize('runInTerminalTool.sandboxPathQuestion.skip', 'Do Not Add'),
						}]
					}]
				},
				context: { sessionResource: chatSessionResource },
				chatRequestId,
			}, async () => 0, token);

			const answer = this._parseAskQuestionsAnswer(result, addPathQuestionHeader);
			if (!answer || answer.skipped || !answer.selected.includes(localize('runInTerminalTool.sandboxPathQuestion.add', 'Add Path'))) {
				return false;
			}

			return this._sandboxService.addPathToAllowedWrite(path);
		} catch {
			return undefined;
		}
	}

	private _parseAskQuestionsAnswer(result: Awaited<ReturnType<ILanguageModelToolsService['invokeTool']>>, header: string): { selected: string[]; skipped: boolean } | undefined {
		const resultText = result.content.find(part => part.kind === 'text');
		if (!resultText) {
			return undefined;
		}

		try {
			const parsed = JSON.parse(resultText.value) as { answers?: Record<string, { selected?: string[]; skipped?: boolean }> };
			const answer = parsed.answers?.[header];
			if (!answer) {
				return undefined;
			}

			return {
				selected: answer.selected ?? [],
				skipped: answer.skipped ?? false,
			};
		} catch {
			return undefined;
		}
	}

	private _findBlockedDomain(exitResult: string): string | undefined {
		const lines = exitResult.split(/\r?\n/);
		for (const line of lines) {
			if (!networkLinePattern.test(line)) {
				continue;
			}

			const domain = this._extractDomainCandidate(line);
			if (domain) {
				return domain;
			}
		}

		if (!networkIssuePattern.test(exitResult)) {
			return undefined;
		}

		return this._extractDomainCandidate(exitResult);
	}

	private _findBlockedFileSystemPath(exitResult: string): string | undefined {
		const lines = exitResult.split(/\r?\n/);
		for (const line of lines) {
			const blockedPath = this._extractFileSystemPathCandidate(line);
			if (blockedPath) {
				return blockedPath;
			}
		}
		return this._extractFileSystemPathCandidate(exitResult);
	}

	private _extractDomainCandidate(text: string): string | undefined {
		for (const match of text.matchAll(domainCandidatePattern)) {
			const candidate = match.groups?.urlHost ?? match.groups?.host;
			const normalized = this._normalizeDomain(candidate);
			if (normalized) {
				return normalized;
			}
		}

		return undefined;
	}

	private _extractFileSystemPathCandidate(text: string): string | undefined {
		for (const match of text.matchAll(filesystemPathCandidatePattern)) {
			const candidate = this._normalizePath(match.groups?.path);
			if (!candidate) {
				continue;
			}

			const permissionPath = this._toPermissionPath(candidate, text);
			if (permissionPath) {
				return permissionPath;
			}
		}

		return undefined;
	}

	private _normalizeDomain(domain: string | undefined): string | undefined {
		if (!domain) {
			return undefined;
		}

		return domain.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '').replace(/:\d+$/, '') || undefined;
	}

	private _toPermissionPath(path: string, line: string): string | undefined {
		if (path === '/' || path === '.' || path === '..' || path.endsWith('/')) {
			return path;
		}

		if (/(writing to|reading from|open|opening|mkdir|create directory|creating directory|touch|redirect|permission denied|operation not permitted|read-only file system)/i.test(line)) {
			const parent = posixDirname(path);
			return parent === '.' && !path.startsWith('.') ? path : parent;
		}

		return path;
	}

	private _normalizePath(path: string | undefined): string | undefined {
		if (!path) {
			return undefined;
		}

		const trimmedPath = path.trim().replace(/^['"`]+|['"`]+$/g, '');
		if (!trimmedPath) {
			return undefined;
		}

		const normalizedPath = posix.normalize(trimmedPath.replace(/\\/g, '/'));
		if (normalizedPath === '/') {
			return normalizedPath;
		}

		return normalizedPath.replace(/\/+$/, '') || undefined;
	}
}
