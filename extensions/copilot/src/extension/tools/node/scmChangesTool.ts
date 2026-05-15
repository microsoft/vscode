/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { Diff, IGitDiffService } from '../../../platform/git/common/gitDiffService';
import { IGitService } from '../../../platform/git/common/gitService';
import { Change } from '../../../platform/git/vscode/git';
import { ILogService } from '../../../platform/log/common/logService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { GitChanges } from '../../prompts/node/git/gitChanges';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { checkCancellation } from './toolUtils';

/**
 * Maximum number of changed files to process diffs for.
 * Beyond this limit, only file names are reported to the model.
 */
const MAX_CHANGED_FILES = 200;

/**
 * Timeout for the entire diff retrieval operation (in milliseconds).
 */
const DIFF_RETRIEVAL_TIMEOUT_MS = 30_000; // 30 seconds

interface IGetScmChangesToolParams {
	repositoryPath?: string;
	sourceControlState?: ('unstaged' | 'staged' | 'merge-conflicts')[];
}

class GetScmChangesTool implements ICopilotTool<IGetScmChangesToolParams> {

	public static readonly toolName = ToolName.GetScmChanges;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IGitService private readonly gitService: IGitService,
		@IGitDiffService private readonly gitDiffService: IGitDiffService,
		@ILogService private readonly logService: ILogService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IGetScmChangesToolParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult | null | undefined> {
		checkCancellation(token);
		await this.gitService.initialize();

		this.logService.trace(`[GetScmChangesTool][invoke] Options: ${JSON.stringify(options)}`);

		const diffs: Diff[] = [];
		const changedFiles: Change[] = [];

		const uri = options.input.repositoryPath
			? this.promptPathRepresentationService.resolveFilePath(options.input.repositoryPath)
			: undefined;

		let repository = uri ? await this.gitService.getRepository(uri) : undefined;
		repository = repository ?? this.gitService.activeRepository.get();

		if (!repository) {
			this.logService.warn(`[GetScmChangesTool][invoke] Unable to resolve the repository using repositoryPath: ${options.input.repositoryPath}`);
			this.logService.warn(`[GetScmChangesTool][invoke] Unable to resolve the active repository: ${this.gitService.activeRepository.get()?.rootUri.toString()}`);

			return new LanguageModelToolResult([new LanguageModelTextPart('The workspace does not contain a git repository')]);
		}

		this.logService.trace(`[GetScmChangesTool][invoke] Uri: ${uri?.toString()}`);
		this.logService.trace(`[GetScmChangesTool][invoke] Repository: ${repository.rootUri.toString()}`);

		let truncatedCount = 0;

		const changes = repository?.changes;
		if (changes) {
			if (options.input.sourceControlState) {
				for (const state of options.input.sourceControlState) {
					switch (state) {
						case 'staged':
							changedFiles.push(...changes.indexChanges);
							break;
						case 'unstaged':
							changedFiles.push(
								...changes.workingTree,
								...changes.untrackedChanges);
							break;
						case 'merge-conflicts':
							changedFiles.push(...changes.mergeChanges);
							break;
					}
				}
			} else {
				changedFiles.push(
					...changes.workingTree,
					...changes.indexChanges,
					...changes.mergeChanges,
					...changes.untrackedChanges);
			}

			this.logService.trace(`[GetScmChangesTool][invoke] Total changed files: ${changedFiles.length}`);

			// Limit the number of files to process for diffs
			const filesToDiff = changedFiles.slice(0, MAX_CHANGED_FILES);
			truncatedCount = Math.max(0, changedFiles.length - MAX_CHANGED_FILES);
			if (truncatedCount > 0) {
				this.logService.info(`[GetScmChangesTool][invoke] Limiting diff processing to ${MAX_CHANGED_FILES} files (${truncatedCount} additional files will be listed without diffs)`);
			}

			try {
				const diffResult = await raceTimeout(
					this.gitDiffService.getChangeDiffs(repository.rootUri, filesToDiff, token),
					DIFF_RETRIEVAL_TIMEOUT_MS
				);

				if (diffResult === undefined) {
					this.logService.warn(`[GetScmChangesTool][invoke] Diff retrieval timed out after ${DIFF_RETRIEVAL_TIMEOUT_MS}ms`);
					const fileList = changedFiles.map(f => f.uri.fsPath).join('\n');
					return new LanguageModelToolResult([new LanguageModelTextPart(
						`Diff retrieval timed out. The repository has ${changedFiles.length} changed file(s):\n${fileList}\n\nYou can use the terminal to run 'git diff' commands to inspect specific files.`
					)]);
				}

				diffs.push(...diffResult);
			} catch (e) {
				this.logService.warn(`[GetScmChangesTool][invoke] Error retrieving diffs: ${e}`);
				const fileList = changedFiles.map(f => f.uri.fsPath).join('\n');
				return new LanguageModelToolResult([new LanguageModelTextPart(
					`Error retrieving diffs: ${e instanceof Error ? e.message : String(e)}. The repository has ${changedFiles.length} changed file(s):\n${fileList}\n\nYou can use the terminal to run 'git diff' commands to inspect specific files.`
				)]);
			}
		} else {
			this.logService.warn(`[GetScmChangesTool][invoke] Unable to retrieve changes because there is no active repository`);
		}

		checkCancellation(token);

		const resultParts: (typeof LanguageModelTextPart.prototype | typeof LanguageModelPromptTsxPart.prototype)[] = [];

		if (diffs.length) {
			resultParts.push(new LanguageModelPromptTsxPart(await renderPromptElementJSON(this.instantiationService, GitChanges, { diffs }, options.tokenizationOptions, token)));
		}

		// Report files that were not diffed due to the limit
		if (truncatedCount > 0) {
			const truncatedFiles = changedFiles.slice(MAX_CHANGED_FILES);
			const truncatedFileList = truncatedFiles.map(f => f.uri.fsPath).join('\n');
			resultParts.push(new LanguageModelTextPart(
				`\n\n${truncatedCount} additional changed file(s) not shown above (too many to diff):\n${truncatedFileList}\n\nYou can use the terminal to run 'git diff' commands to inspect specific files.`
			));
		}

		if (resultParts.length === 0) {
			resultParts.push(new LanguageModelTextPart('No changed files found'));
		}

		return new LanguageModelToolResult(resultParts);
	}

	prepareInvocation?(options: vscode.LanguageModelToolInvocationPrepareOptions<IGetScmChangesToolParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		checkCancellation(token);

		const uri = options.input.repositoryPath
			? this.promptPathRepresentationService.resolveFilePath(options.input.repositoryPath)
			: undefined;

		this.logService.trace(`[GetScmChangesTool][prepareInvocation] Options: ${JSON.stringify(options)}`);
		this.logService.trace(`[GetScmChangesTool][prepareInvocation] Uri: ${uri?.toString()}`);

		return uri
			? {
				invocationMessage: new MarkdownString(l10n.t`Reading changed files in ${formatUriForFileWidget(uri)}`),
				pastTenseMessage: new MarkdownString(l10n.t`Read changed files in ${formatUriForFileWidget(uri)}`),
			}
			: {
				invocationMessage: new MarkdownString(l10n.t`Reading changed files in the active git repository`),
				pastTenseMessage: new MarkdownString(l10n.t`Read changed files in the active git repository`),
			};
	}

	async provideInput(): Promise<IGetScmChangesToolParams | undefined> {
		await this.gitService.initialize();

		this.logService.trace(`[GetScmChangesTool][provideInput] Active repository: ${this.gitService.activeRepository.get()?.rootUri.toString()}`);

		return Promise.resolve({
			repositoryPath: this.gitService.activeRepository.get()?.rootUri.toString(),
			sourceControlState: ['unstaged', 'staged'],
		});
	}
}

ToolRegistry.registerTool(GetScmChangesTool);
