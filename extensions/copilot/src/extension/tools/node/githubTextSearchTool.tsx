/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptPiece, PromptReference, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { FileChunkAndScore } from '../../../platform/chunking/common/chunk';
import { GithubRepoId } from '../../../platform/git/common/gitService';
import { GithubCodeSearchScope, IGithubCodeSearchService } from '../../../platform/remoteCodeSearch/common/githubCodeSearchService';
import { createFencedCodeBlock, getLanguageId } from '../../../util/common/markdown';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { isLocation, isUri } from '../../../util/common/types';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, MarkdownString } from '../../../vscodeTypes';
import { getUniqueReferences } from '../../prompt/common/conversation';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export interface GithubTextSearchToolParams {
	readonly query: string;
	/** Either 'owner/repo' for a single repo, or an org name (no slash) */
	readonly scope: string;
	readonly maxResults?: number;
}

export class GithubTextSearchTool implements ICopilotTool<GithubTextSearchToolParams> {
	public static readonly toolName = ToolName.GithubTextSearch;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IGithubCodeSearchService private readonly _githubCodeSearch: IGithubCodeSearchService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<GithubTextSearchToolParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const scope = parseScope(options.input.scope);
		if (!scope) {
			throw new Error(l10n.t`Invalid input. Could not parse 'scope' argument`);
		}

		const maxResults = options.input.maxResults ?? 100;

		const searchResults = await this._githubCodeSearch.lexicalSearch(
			{ silent: true },
			scope,
			options.input.query,
			maxResults,
			{},
			new TelemetryCorrelationId('github-text-search-tool'),
			token,
		);

		const chunks = searchResults.chunks.map((entry): FileChunkAndScore => {
			let file = entry.file;
			if (file.scheme === 'githubRepoResult') {
				// Path format: /owner/repo/relative/file/path
				const parts = file.path.split('/').filter(Boolean);
				if (parts.length >= 3) {
					const nwo = `${parts[0]}/${parts[1]}`;
					const relativePath = parts.slice(2).join('/');
					file = URI.joinPath(URI.parse('https://github.com'), nwo, 'tree', 'main', '/' + relativePath).with({
						fragment: entry.range.startLineNumber > 0
							? `L${entry.range.startLineNumber}-L${entry.range.endLineNumber}`
							: undefined,
					});
				}
			}
			return { chunk: { ...entry, file }, distance: undefined };
		});

		let references: PromptReference[] = [];
		const json = await renderPromptElementJSON(this._instantiationService, GithubTextSearchResults, {
			chunks,
			referencesOut: references,
		});
		const result = new ExtendedLanguageModelToolResult([
			new LanguageModelPromptTsxPart(json),
		]);

		references = getUniqueReferences(references);
		const scopeLabel = options.input.scope;
		result.toolResultMessage = references.length === 0 ?
			new MarkdownString(l10n.t`Searched ${scopeLabel} for "${options.input.query}", no results`) :
			references.length === 1 ?
				new MarkdownString(l10n.t`Searched ${scopeLabel} for "${options.input.query}", 1 result`) :
				new MarkdownString(l10n.t`Searched ${scopeLabel} for "${options.input.query}", ${references.length} results`);
		result.toolResultDetails = references
			.map(r => r.anchor)
			.filter(r => isUri(r) || isLocation(r));
		return result;
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<GithubTextSearchToolParams>, _token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		if (!options.input.scope) {
			throw new Error(l10n.t`Invalid input. No 'scope' argument provided`);
		}
		if (!parseScope(options.input.scope)) {
			throw new Error(l10n.t`Invalid input. Could not parse 'scope' argument`);
		}
		return {
			invocationMessage: l10n.t("Searching '{0}' for '{1}'", options.input.scope, options.input.query),
		};
	}
}

function parseScope(scope: string): GithubCodeSearchScope | undefined {
	if (!scope) {
		return undefined;
	}
	if (scope.includes('/')) {
		const repoId = GithubRepoId.parse(scope);
		if (!repoId) {
			return undefined;
		}
		return { kind: 'repo', githubRepoId: repoId, localRepoRoot: undefined, indexedCommit: undefined };
	}

	return { kind: 'org', org: scope };
}

interface GithubTextSearchResultsProps extends BasePromptElementProps {
	readonly chunks: FileChunkAndScore[];
	readonly referencesOut: PromptReference[];
}

class GithubTextSearchResults extends PromptElement<GithubTextSearchResultsProps> {
	override render(_state: void, _sizing: PromptSizing): PromptPiece | undefined {
		const references: PromptReference[] = [];
		const seenFiles = new Set<string>();

		const renderedChunks = this.props.chunks
			.filter(x => x.chunk.text)
			.map(chunk => {
				const fileKey = chunk.chunk.file.toString();
				if (!seenFiles.has(fileKey)) {
					seenFiles.add(fileKey);
					references.push(new PromptReference(chunk.chunk.file));
				}

				const githubInfo = parseGithubFileUrl(chunk.chunk.file);
				const displayPath = githubInfo?.path ?? chunk.chunk.file.toString();
				const nwoLabel = githubInfo?.nwo;

				const lineInfo = ` starting at line ${chunk.chunk.range.startLineNumber}`;

				const headerText = nwoLabel
					? `Text match excerpt from \`${nwoLabel}\` in \`${displayPath}\`${lineInfo}:`
					: `Text match excerpt in \`${displayPath}\`${lineInfo}:`;

				return <TextChunk>
					{headerText}<br />
					{createFencedCodeBlock(getLanguageId(chunk.chunk.file), chunk.chunk.text)}<br /><br />
				</TextChunk>;
			});

		this.props.referencesOut.push(...references);

		return <>
			<references value={references} />
			{renderedChunks}
		</>;
	}
}

function parseGithubFileUrl(uri: URI): { nwo: string; path: string } | undefined {
	if (uri.scheme === 'https' && uri.authority === 'github.com') {
		const parts = uri.path.split('/').filter(Boolean);
		// Pattern: /owner/repo/tree/branch/...path
		if (parts.length >= 4 && parts[2] === 'tree') {
			return {
				nwo: `${parts[0]}/${parts[1]}`,
				path: parts.slice(4).join('/'),
			};
		}
	}
	return undefined;
}

ToolRegistry.registerTool(GithubTextSearchTool);
