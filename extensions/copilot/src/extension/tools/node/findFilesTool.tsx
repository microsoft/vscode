/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptElementProps, PromptPiece, PromptReference, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { URI } from '../../../util/vs/base/common/uri';

import * as l10n from '@vscode/l10n';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ISearchService } from '../../../platform/search/common/searchService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { raceTimeoutAndCancellationError } from '../../../util/common/racePromise';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, MarkdownString } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { ToolName } from '../common/toolNames';
import { CopilotToolMode, ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation, inputGlobToPattern, patternContainsWorkspaceFolderPath } from './toolUtils';

export interface IFindFilesToolParams {
	query: string;
	maxResults?: number;
}

export class FindFilesTool implements ICopilotTool<IFindFilesToolParams> {
	public static readonly toolName = ToolName.FindFiles;
	public static readonly nonDeferred = true;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IFindFilesToolParams>, token: CancellationToken) {
		checkCancellation(token);

		// TODO strict input validation
		// Certain models just really want to pass incorrect input
		if ((options.input as unknown as Record<string, string>).path) {
			throw new Error('The property "path" is not supported');
		}

		const endpoint = options.model && (await this.endpointProvider.getChatEndpoint(options.model));
		const modelFamily = endpoint?.family;

		// The input _should_ be a pattern matching inside a workspace, folder, but sometimes we get absolute paths, so try to resolve them
		const globResult = inputGlobToPattern(options.input.query, this.workspaceService, modelFamily);

		void this.sendSearchToolTelemetry(options, globResult.folderName);

		// try find text with a timeout of 20s
		const timeoutInMs = 20_000;


		const results = await raceTimeoutAndCancellationError(
			(searchToken) => Promise.resolve(this.searchService.findFiles(globResult.patterns, { caseInsensitive: true }, searchToken)),
			token,
			timeoutInMs,
			'Timeout in searching files, try a more specific search pattern'
		);

		checkCancellation(token);

		const maxResults = options.input.maxResults ?? 20;
		const resultsToShow = results.slice(0, maxResults);
		// Render the prompt element with a timeout
		const prompt = await renderPromptElementJSON(this.instantiationService, FindFilesResult, { fileResults: resultsToShow, totalResults: results.length }, options.tokenizationOptions, token);
		const result = new ExtendedLanguageModelToolResult([new LanguageModelPromptTsxPart(prompt)]);
		const query = this.formatQueryLabel(globResult, options.input.query);
		result.toolResultMessage = resultsToShow.length === 0 ?
			new MarkdownString(l10n.t`Searched for files matching ${query}, no matches`) :
			resultsToShow.length === 1 ?
				new MarkdownString(l10n.t`Searched for files matching ${query}, 1 match`) :
				new MarkdownString(l10n.t`Searched for files matching ${query}, ${resultsToShow.length} matches`);
		result.toolResultDetails = resultsToShow;
		return result;
	}

	private async sendSearchToolTelemetry(options: vscode.LanguageModelToolInvocationOptions<IFindFilesToolParams>, folderName: string | undefined): Promise<void> {
		const model = options.model && (await this.endpointProvider.getChatEndpoint(options.model)).model;
		const isMultiRoot = this.workspaceService.getWorkspaceFolders().length > 1;
		const query = options.input.query;
		/* __GDPR__
			"findFilesToolInvoked" : {
				"owner": "roblourens",
				"comment": "Telemetry for the findFiles tool in multi-root workspaces",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
				"isMultiRoot": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the workspace has multiple root folders" },
				"queryScopedToFolder": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the query was resolved to a specific workspace folder" },
				"queryStartsWithFolderPath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the raw query starts with a workspace folder absolute path" },
				"queryContainsFolderPath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the raw query contains a workspace folder absolute path anywhere" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('findFilesToolInvoked', {
			requestId: options.chatRequestId,
			model,
			isMultiRoot: String(isMultiRoot),
			queryScopedToFolder: String(!!folderName),
			queryStartsWithFolderPath: String(isAbsolute(query) && !!this.workspaceService.getWorkspaceFolder(URI.file(query))),
			queryContainsFolderPath: String(patternContainsWorkspaceFolderPath(query, this.workspaceService)),
		});
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IFindFilesToolParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const globResult = inputGlobToPattern(options.input.query, this.workspaceService, undefined);
		const query = this.formatQueryLabel(globResult, options.input.query);
		return {
			invocationMessage: new MarkdownString(l10n.t`Searching for files matching ${query}`)
		};
	}

	private formatQueryLabel(globResult: { folderName?: string; folderRelativePattern?: string }, rawQuery: string): string {
		if (globResult.folderName) {
			if (globResult.folderRelativePattern && globResult.folderRelativePattern !== '**') {
				return `\`${globResult.folderName}\` \u00B7 \`${globResult.folderRelativePattern}\``;
			}
			return `\`${globResult.folderName}\``;
		}
		return `\`${rawQuery}\``;
	}

	async resolveInput(input: IFindFilesToolParams, _promptContext: IBuildPromptContext, mode: CopilotToolMode): Promise<IFindFilesToolParams> {
		let query = input.query;
		if (!query.startsWith('**/') && !query.startsWith('/') && !query.includes(':')) {
			query = `**/${query}`;
		}

		if (query.endsWith('/')) {
			query = `${query}**`;
		}

		return {
			...input,
			query,
			maxResults: mode === CopilotToolMode.FullContext ?
				Math.max(input.maxResults ?? 0, 200) :
				input.maxResults ?? 20,
		};
	}
}

ToolRegistry.registerTool(FindFilesTool);

export interface FindFilesResultProps extends BasePromptElementProps {
	fileResults: URI[];
	totalResults: number;
}

export class FindFilesResult extends PromptElement<FindFilesResultProps> {
	constructor(
		props: PromptElementProps<FindFilesResultProps>,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (this.props.fileResults.length === 0) {
			return <>No files found</>;
		}

		return <>
			{<TextChunk priority={20}>{this.props.totalResults === 1 ? '1 total result' : `${this.props.totalResults} total results`}</TextChunk>}
			{this.props.fileResults.map(file => <TextChunk priority={10}>
				<references value={[new PromptReference(file, undefined, { isFromTool: true })]} />
				{this.promptPathRepresentationService.getFilePath(file)}
			</TextChunk>)}
			{this.props.totalResults > this.props.fileResults.length && <TextChunk priority={20}>{'...'}</TextChunk>}
		</>;
	}
}
