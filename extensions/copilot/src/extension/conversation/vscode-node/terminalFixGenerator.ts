/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { extractCodeBlocks } from '../../../util/common/markdown';
import { IntervalTimer } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { TerminalQuickFixFileContextPrompt, TerminalQuickFixPrompt } from '../../prompts/node/panel/terminalQuickFix';

const enum CommandRelevance {
	Low = 1,
	Medium = 2,
	High = 3,
}

function relevanceToString(relevance: CommandRelevance): string {
	switch (relevance) {
		case CommandRelevance.High: return l10n.t('high relevance');
		case CommandRelevance.Medium: return l10n.t('medium relevance');
		case CommandRelevance.Low: return l10n.t('low relevance');
	}
}

function parseRelevance(relevance: 'low' | 'medium' | 'high'): CommandRelevance {
	switch (relevance) {
		case 'high': return CommandRelevance.High;
		case 'medium': return CommandRelevance.Medium;
		case 'low': return CommandRelevance.Low;
	}
}

export interface ICommandSuggestion {
	command: string;
	description: string;
	relevance: CommandRelevance;
}

export function setLastCommandMatchResult(value: vscode.TerminalCommandMatchResult) { lastCommandMatchResult = value; }
export let lastCommandMatchResult: vscode.TerminalCommandMatchResult | undefined;

export async function generateTerminalFixes(instantiationService: IInstantiationService) {
	const commandMatchResult = lastCommandMatchResult;
	if (!commandMatchResult) {
		return;
	}
	type CommandPick = vscode.QuickPickItem & { suggestion: ICommandSuggestion };
	const picksPromise: Promise<(CommandPick | vscode.QuickPickItem)[]> = new Promise(r => {
		instantiationService.createInstance(TerminalQuickFixGenerator).generateTerminalQuickFix(commandMatchResult, CancellationToken.None).then(fixes => {
			const picks: (CommandPick | vscode.QuickPickItem)[] = (fixes ?? []).sort((a, b) => b.relevance - a.relevance).map(e => ({
				label: e.command,
				description: e.description,
				suggestion: e
			}) satisfies CommandPick);
			let currentRelevance: CommandRelevance | undefined;
			for (let i = 0; i < picks.length; i++) {
				const pick = picks[i];
				const lastPick = picks.at(i - 1)!;
				if (
					'suggestion' in pick &&
					(
						!currentRelevance ||
						(i > 0 && 'suggestion' in lastPick && pick.suggestion.relevance !== lastPick.suggestion.relevance)
					)
				) {
					currentRelevance = pick.suggestion.relevance;
					picks.splice(i++, 0, { label: relevanceToString(currentRelevance), kind: vscode.QuickPickItemKind.Separator });
				}
			}
			r(picks);
		});
	});
	picksPromise.then(picks => {
		if (picks.length === 0) {
			vscode.window.showInformationMessage('No fixes found');
		}
	});
	const pick = vscode.window.createQuickPick<(vscode.QuickPickItem | CommandPick)>();
	pick.canSelectMany = false;

	// Setup loading state
	const generatingString = l10n.t('Generating');
	pick.placeholder = generatingString;
	pick.busy = true;
	let dots = 0;
	const dotTimer = new IntervalTimer();
	dotTimer.cancelAndSet(() => {
		dots++;
		if (dots > 3) {
			dots = 0;
		}
		pick.placeholder = generatingString + '.'.repeat(dots);
	}, 250);

	pick.show();
	pick.items = await picksPromise;

	// Clear loading state
	dotTimer.cancel();
	pick.placeholder = '';
	pick.busy = false;

	await new Promise<void>(r => pick.onDidAccept(() => r()));

	const item = pick.activeItems[0];
	if (item && 'suggestion' in item) {
		const shouldExecute = !item.suggestion.command.match(/{.+}/);
		vscode.window.activeTerminal?.sendText(item.suggestion.command, shouldExecute);
	}

	pick.dispose();
}

class TerminalQuickFixGenerator {

	constructor(
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
	}

	async generateTerminalQuickFix(commandMatchResult: vscode.TerminalCommandMatchResult, token: CancellationToken): Promise<ICommandSuggestion[] | undefined> {
		const unverifiedContextUris = await this._generateTerminalQuickFixFileContext(commandMatchResult, token);
		if (!unverifiedContextUris || token.isCancellationRequested) {
			return;
		}

		const verifiedContextUris: Uri[] = [];
		const verifiedContextDirectoryUris: Uri[] = [];
		const nonExistentContextUris: Uri[] = [];
		for (const uri of unverifiedContextUris) {
			try {
				const exists = await vscode.workspace.fs.stat(uri);
				// This does not support binary files
				if (exists.type === vscode.FileType.File || exists.type === vscode.FileType.SymbolicLink) {
					verifiedContextUris.push(uri);
				} else if (exists.type === vscode.FileType.Directory) {
					verifiedContextDirectoryUris.push(uri);
				} else {
					nonExistentContextUris.push(uri);
				}
			} catch {
				nonExistentContextUris.push(uri);
			}
		}

		const endpoint = await this._endpointProvider.getChatEndpoint('copilot-fast');

		const promptRenderer = PromptRenderer.create(this._instantiationService, endpoint, TerminalQuickFixPrompt, {
			commandLine: commandMatchResult.commandLine,
			output: [],
			verifiedContextUris,
			verifiedContextDirectoryUris,
			nonExistentContextUris,
		});

		const prompt = await promptRenderer.render(undefined, undefined);

		const fetchResult = await endpoint.makeChatRequest(
			'terminalQuickFixGenerator',
			prompt.messages,
			undefined,
			token,
			ChatLocation.Other
		);
		this._logService.info('Terminal QuickFix FetchResult ' + fetchResult);
		if (token.isCancellationRequested) {
			return;
		}
		if (fetchResult.type !== 'success') {
			throw new Error(vscode.l10n.t('Encountered an error while determining terminal quick fixes: {0}', fetchResult.type));
		}
		this._logService.debug('generalTerminalQuickFix fetchResult.value ' + fetchResult.value);

		// Parse result json
		const parsedResults: ICommandSuggestion[] = [];
		try {
			// The result may come in a md fenced code block
			const codeblocks = extractCodeBlocks(fetchResult.value);
			const json = JSON.parse(codeblocks.length > 0 ? codeblocks[0].code : fetchResult.value) as unknown;
			if (json && Array.isArray(json)) {
				for (const entry of (json as unknown[])) {
					if (typeof entry === 'object' && entry) {
						const command = 'command' in entry && typeof entry.command === 'string' ? entry.command : undefined;
						const description = 'description' in entry && typeof entry.description === 'string' ? entry.description : undefined;
						const relevance = 'relevance' in entry && typeof entry.relevance === 'string' && (entry.relevance === 'low' || entry.relevance === 'medium' || entry.relevance === 'high') ? entry.relevance : undefined;
						if (command && description && relevance) {
							parsedResults.push({
								command,
								description,
								relevance: parseRelevance(relevance)
							});
						}
					}
				}
			}
		} catch (e) {
			this._logService.error('Error parsing terminal quick fix results: ' + e);
		}

		return parsedResults;
	}

	private async _generateTerminalQuickFixFileContext(commandMatchResult: vscode.TerminalCommandMatchResult, token: CancellationToken) {
		const endpoint = await this._endpointProvider.getChatEndpoint('copilot-fast');

		const promptRenderer = PromptRenderer.create(this._instantiationService, endpoint, TerminalQuickFixFileContextPrompt, {
			commandLine: commandMatchResult.commandLine,
			output: [],
		});

		const prompt = await promptRenderer.render(undefined, undefined);
		this._logService.debug('_generalTerminalQuickFixFileContext prompt.messages: ' + prompt.messages);

		const fetchResult = await endpoint.makeChatRequest(
			'terminalQuickFixGenerator',
			prompt.messages,
			async _ => void 0,
			token,
			ChatLocation.Other
		);
		this._logService.info('Terminal Quick Fix Fetch Result: ' + fetchResult);
		if (token.isCancellationRequested) {
			return;
		}
		if (fetchResult.type !== 'success') {
			throw new Error(vscode.l10n.t('Encountered an error while fetching quick fix file context: {0}', fetchResult.type));
		}

		this._logService.debug('_generalTerminalQuickFixFileContext fetchResult.value' + fetchResult.value);

		// Parse result json
		const parsedResults: { fileName: string }[] = [];
		try {
			const json = JSON.parse(fetchResult.value) as unknown;
			if (json && Array.isArray(json)) {
				for (const entry of (json as unknown[])) {
					if (typeof entry === 'object' && entry) {
						const fileName = 'fileName' in entry && typeof entry.fileName === 'string' ? entry.fileName : undefined;
						if (fileName) {
							parsedResults.push({ fileName });
						}
					}
				}
			}
		} catch {
			// no-op
		}

		const uris: Uri[] = [];
		const requestedFiles: Set<string> = new Set();
		const folders = this._workspaceService.getWorkspaceFolders();
		const tryAddFileVariables = async (file: string) => {
			for (const rootFolder of folders) {
				const uri = URI.joinPath(rootFolder, file);
				if (requestedFiles.has(uri.toString())) {
					return;
				}
				requestedFiles.add(uri.toString());
				// Do not stat here as the follow up wants to know whether it exists
				uris.push(uri);
			}
		};

		for (const { fileName } of parsedResults) {
			if (fileName.endsWith('.exe') || (fileName.includes('/bin/') && !fileName.endsWith('activate'))) {
				continue;
			}
			if (isAbsolute(fileName)) {
				uris.push(Uri.file(fileName));
			} else {
				await tryAddFileVariables(fileName);
			}
		}

		return uris;
	}
}
