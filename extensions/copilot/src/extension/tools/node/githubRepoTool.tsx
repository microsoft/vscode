/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptPiece, PromptReference, PromptSizing } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { FileChunkAndScore } from '../../../platform/chunking/common/chunk';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { GithubRepoId, toGithubNwo } from '../../../platform/git/common/gitService';
import { IGithubCodeSearchService } from '../../../platform/remoteCodeSearch/common/githubCodeSearchService';
import { RemoteCodeSearchIndexStatus } from '../../../platform/remoteCodeSearch/common/remoteCodeSearch';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { GithubAvailableEmbeddingTypesService, IGithubAvailableEmbeddingTypesService } from '../../../platform/workspaceChunkSearch/common/githubAvailableEmbeddingTypes';
import { Result } from '../../../util/common/result';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { isLocation, isUri } from '../../../util/common/types';
import { raceCancellationError, timeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, MarkdownString } from '../../../vscodeTypes';
import { getUniqueReferences } from '../../prompt/common/conversation';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { WorkspaceChunkList } from '../../prompts/node/panel/workspace/workspaceContext';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export interface GithubRepoToolParams {
	readonly repo: string;
	readonly query: string;
}

interface PrepareError {
	readonly message: string;
	readonly id: string;
	readonly details?: string;
}

export class GithubRepoTool implements ICopilotTool<GithubRepoToolParams> {
	public static readonly toolName = ToolName.GithubRepo;


	constructor(
		@IRunCommandExecutionService _commandService: IRunCommandExecutionService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IGithubCodeSearchService private readonly _githubCodeSearch: IGithubCodeSearchService,
		@IGithubAvailableEmbeddingTypesService private readonly _availableEmbeddingTypesManager: GithubAvailableEmbeddingTypesService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<GithubRepoToolParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const githubRepoId = GithubRepoId.parse(options.input.repo);
		if (!githubRepoId) {
			throw new Error('Invalid input. Could not parse repo');
		}

		const embeddingType = await this._availableEmbeddingTypesManager.getPreferredType(false);
		if (!embeddingType) {
			throw new Error('No embedding models available');
		}

		const searchResults = await this._githubCodeSearch.searchRepo({ silent: true }, embeddingType, { githubRepoId, localRepoRoot: undefined, indexedCommit: undefined }, options.input.query, 64, {}, new TelemetryCorrelationId('github-repo-tool'), token);

		// Map the chunks to URIs
		// TODO: Won't work for proxima or branches not called main
		const chunks = searchResults.chunks.map((entry): FileChunkAndScore => ({
			chunk: {
				...entry.chunk,
				file: URI.joinPath(URI.parse('https://github.com'), toGithubNwo(githubRepoId), 'tree', 'main', entry.chunk.file.path).with({
					fragment: `L${entry.chunk.range.startLineNumber}-L${entry.chunk.range.endLineNumber}`,
				}),
			},
			distance: entry.distance,
		}));

		let references: PromptReference[] = [];
		const json = await renderPromptElementJSON(this._instantiationService, GithubChunkSearchResults, {
			chunks,
			referencesOut: references,
		});
		const result = new ExtendedLanguageModelToolResult([
			new LanguageModelPromptTsxPart(json),
		]);

		references = getUniqueReferences(references);
		result.toolResultMessage = references.length === 0 ?
			new MarkdownString(l10n.t`Searched ${githubRepoId.toString()} for "${options.input.query}", no results`) :
			references.length === 1 ?
				new MarkdownString(l10n.t`Searched ${githubRepoId.toString()} for "${options.input.query}", 1 result`) :
				new MarkdownString(l10n.t`Searched ${githubRepoId.toString()} for "${options.input.query}", ${references.length} results`);
		result.toolResultDetails = references
			.map(r => r.anchor)
			.filter(r => isUri(r) || isLocation(r));
		return result;
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<GithubRepoToolParams>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		const prepareResult = await raceCancellationError(this.doPrepare(options, token), token);
		if (prepareResult.isOk()) {
			return {
				invocationMessage: l10n.t("Searching '{0}' for relevant code snippets", options.input.repo),
			};
		}

		/* __GDPR__
			"githubRepoTool.prepare.error" : {
				"owner": "mjbvz",
				"comment": "Tracks errors for the GitHub repo tool prepare step",
				"errorId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "General reason why the search failed" },
				"errorDetails": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "More detailed info about the failure" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('githubRepoTool.prepare.error', {
			errorId: prepareResult.err.id,
			errorDetails: prepareResult.err.details,
		});

		throw new Error(prepareResult.err.message);
	}

	private async doPrepare(options: vscode.LanguageModelToolInvocationPrepareOptions<GithubRepoToolParams>, token: vscode.CancellationToken): Promise<Result<GithubRepoId, PrepareError>> {
		if (!options.input.repo) {
			return Result.error<PrepareError>({
				message: l10n.t`Invalid input. No 'repo' argument provided`,
				id: 'no-repo-arg',
			});
		}

		let githubRepoId = GithubRepoId.parse(options.input.repo);
		if (!githubRepoId) {
			// We may have been passed a full URL
			try {
				const uri = URI.parse(options.input.repo);
				if (uri.scheme === 'https' && uri.authority === 'github.com') {
					const pathParts = uri.path.split('/');
					if (pathParts.length >= 3) {
						githubRepoId = new GithubRepoId(pathParts[1], pathParts[2]);
					}
				}
			} catch {
				// Noop
			}
		}

		if (!githubRepoId) {
			return Result.error<PrepareError>({
				message: l10n.t`Invalid input. Could not parse 'repo' argument`,
				id: 'could-not-parse-repo',
			});
		}

		const checkIndexReady = async (): Promise<Result<boolean, PrepareError>> => {
			const state = await raceCancellationError(this._githubCodeSearch.getRemoteIndexState({ silent: true }, githubRepoId, new TelemetryCorrelationId('GitHubRepoTool'), token), token);
			if (!state.isOk()) {
				if (state.err.type === 'not-authorized') {
					return Result.error<PrepareError>({
						message: l10n.t`Not authenticated`,
						id: 'no-auth-token',
					});
				} else {
					return Result.error<PrepareError>({
						message: l10n.t`Could not check status of Github repo index`,
						id: 'could-not-check-status',
					});
				}
			}

			if (state.val.status === RemoteCodeSearchIndexStatus.Ready) {
				return Result.ok(true);
			}

			return Result.error<PrepareError>({
				message: l10n.t`GitHub repo index not yet ready`,
				id: 'unexpected-status',
				details: `status: ${state.val.status}`,
			});
		};


		if ((await checkIndexReady()).isOk()) {
			return Result.ok(githubRepoId);
		}

		if (!await this._githubCodeSearch.triggerIndexing({ silent: true }, 'tool', githubRepoId, new TelemetryCorrelationId('GitHubRepoTool'))) {
			return Result.error<PrepareError>({
				message: l10n.t`Could not index Github repo. Repo may not exist or you may not have access to it.`,
				id: 'trigger-indexing-failed',
			});
		}

		const pollAttempts = 10;
		const pollDelay = 1000;
		for (let i = 0; i < pollAttempts; i++) {
			await raceCancellationError(timeout(pollDelay), token);
			if ((await raceCancellationError(checkIndexReady(), token)).isOk()) {
				return Result.ok(githubRepoId);
			}
		}

		return Result.error<PrepareError>({
			message: l10n.t`Github repo index not yet. Please try again shortly`,
			id: 'not-ready-after-polling',
		});
	}
}

interface GithubChunkSearchResultsProps extends BasePromptElementProps {
	readonly chunks: FileChunkAndScore[];

	readonly referencesOut: PromptReference[];
}

class GithubChunkSearchResults extends PromptElement<GithubChunkSearchResultsProps> {
	constructor(
		props: PromptElementProps<GithubChunkSearchResultsProps>,
	) {
		super(props);
	}

	override render(_state: void, _sizing: PromptSizing, _progress?: vscode.Progress<vscode.ChatResponsePart>, _token?: vscode.CancellationToken): Promise<PromptPiece | undefined> | PromptPiece | undefined {
		return <WorkspaceChunkList
			result={{ chunks: this.props.chunks }}
			referencesOut={this.props.referencesOut}
			absolutePaths={true}
			isToolCall={true} />;
	}
}


ToolRegistry.registerTool(GithubRepoTool);
