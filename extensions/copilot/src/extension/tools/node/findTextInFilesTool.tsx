/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptPiece, PromptReference, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { OffsetLineColumnConverter } from '../../../platform/editing/common/offsetLineColumnConverter';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ISearchService } from '../../../platform/search/common/searchService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { raceTimeoutAndCancellationError } from '../../../util/common/racePromise';
import { asArray } from '../../../util/vs/base/common/arrays';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { count } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { Position as EditorPosition } from '../../../util/vs/editor/common/core/position';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExcludeSettingOptions, ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, Location, MarkdownString, Range } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { Tag } from '../../prompts/node/base/tag';
import { ToolName } from '../common/toolNames';
import { CopilotToolMode, ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation, InputGlobResult, inputGlobToPattern, patternContainsWorkspaceFolderPath } from './toolUtils';

interface IFindTextInFilesToolParams {
	query: string;
	isRegexp?: boolean;
	includePattern?: string;
	maxResults?: number;
	/** Whether to include files that would normally be ignored according to .gitignore, other ignore files and `files.exclude` and `search.exclude` settings. */
	includeIgnoredFiles?: boolean;
}

const MaxResultsCap = 200;

export class FindTextInFilesTool implements ICopilotTool<IFindTextInFilesToolParams> {
	public static readonly toolName = ToolName.FindTextInFiles;
	public static readonly nonDeferred = true;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IFindTextInFilesToolParams>, token: CancellationToken) {
		// TODO strict input validation
		// Certain models just really want to pass incorrect input
		if ((options.input as unknown as Record<string, string>).pattern) {
			throw new Error('The property "pattern" is not supported, please use "query"');
		}

		const endpoint = options.model && (await this.endpointProvider.getChatEndpoint(options.model));
		const modelFamily = endpoint?.family;

		// The input _should_ be a pattern matching inside a workspace, folder, but sometimes we get absolute paths, so try to resolve them
		const globResult = options.input.includePattern ? inputGlobToPattern(options.input.includePattern, this.workspaceService, modelFamily) : undefined;
		const patterns = globResult?.patterns;

		void this.sendSearchToolTelemetry(options, globResult);

		checkCancellation(token);
		const askedForTooManyResults = options.input.maxResults && options.input.maxResults > MaxResultsCap;
		const maxResults = Math.min(options.input.maxResults ?? 20, MaxResultsCap);
		const isRegExp = options.input.isRegexp ?? true;
		const queryIsValidRegex = this.isValidRegex(options.input.query);
		const includeIgnoredFiles = options.input.includeIgnoredFiles ?? false;

		// try find text with a timeout of 20s
		const timeoutInMs = 20_000;

		let results = await raceTimeoutAndCancellationError(
			(searchToken) => this.searchAndCollectResults(options.input.query, isRegExp, patterns, maxResults, includeIgnoredFiles, searchToken),
			token,
			timeoutInMs,
			// embed message to give LLM hint about what to do next
			`Timeout in searching text in files with ${isRegExp ? 'regex' : 'literal'} search, try a more specific search pattern or change regex/literal mode`
		);

		// If we still have no results, we need to try the opposite regex mode
		if (!results.length && queryIsValidRegex) {
			results = await raceTimeoutAndCancellationError(
				(searchToken) => this.searchAndCollectResults(options.input.query, !isRegExp, patterns, maxResults, includeIgnoredFiles, searchToken),
				token,
				timeoutInMs,
				// embed message to give LLM hint about what to do next
				`Find ${results.length} results in searching text in files with ${isRegExp ? 'regex' : 'literal'} search, and then another searching hits timeout in with ${!isRegExp ? 'regex' : 'literal'} search, try a more specific search pattern`
			);
		}

		let noMatchInstructions: string | undefined = undefined;
		if (!results.length && !includeIgnoredFiles) {
			// Get the search.exclude configuration
			const excludeSettings = this.configurationService.getNonExtensionConfig<Record<string, boolean>>('search.exclude');
			const excludePaths: string[] = [];
			if (excludeSettings) {
				for (const [path, isExcluded] of Object.entries(excludeSettings)) {
					if (isExcluded) {
						excludePaths.push(path);
					}
				}
			}

			noMatchInstructions = `Your search pattern might be excluded completely by either the search.exclude settings or .*ignore files.
If you believe that it should have results, you can check into the .*ignore files and the exclude setting (here are some excluded patterns for reference:[${excludePaths.join(',')}]).
Then if you want to include those files you can call the tool again by setting "includeIgnoredFiles" to true.`;
		}

		const prompt = await renderPromptElementJSON(this.instantiationService,
			FindTextInFilesResult,
			{ textResults: results, maxResults, askedForTooManyResults: Boolean(askedForTooManyResults), noMatchInstructions },
			options.tokenizationOptions,
			token);

		const result = new ExtendedLanguageModelToolResult([new LanguageModelPromptTsxPart(prompt)]);
		const textMatches = results.flatMap(r => {
			if ('ranges' in r) {
				return asArray(r.ranges).map(rangeInfo => new Location(r.uri, rangeInfo.sourceRange));
			}

			return [];
		}).slice(0, maxResults);
		const query = this.formatQueryString(options.input, globResult);
		result.toolResultMessage = this.getResultMessage(isRegExp, query, textMatches.length);

		result.toolResultDetails = textMatches;
		return result;
	}

	private async sendSearchToolTelemetry(options: vscode.LanguageModelToolInvocationOptions<IFindTextInFilesToolParams>, globResult: InputGlobResult | undefined): Promise<void> {
		const model = options.model && (await this.endpointProvider.getChatEndpoint(options.model)).model;
		const isMultiRoot = this.workspaceService.getWorkspaceFolders().length > 1;
		const includePattern = options.input.includePattern;
		/* __GDPR__
			"findTextInFilesToolInvoked" : {
				"owner": "roblourens",
				"comment": "Telemetry for the findTextInFiles tool in multi-root workspaces",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
				"isMultiRoot": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the workspace has multiple root folders" },
				"patternScopedToFolder": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the includePattern was resolved to a specific workspace folder" },
				"patternStartsWithFolderPath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the raw includePattern starts with a workspace folder absolute path" },
				"patternContainsFolderPath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the raw includePattern contains a workspace folder absolute path anywhere" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('findTextInFilesToolInvoked', {
			requestId: options.chatRequestId,
			model,
			isMultiRoot: String(isMultiRoot),
			patternScopedToFolder: String(!!globResult?.folderName),
			patternStartsWithFolderPath: String(!!includePattern && isAbsolute(includePattern) && !!this.workspaceService.getWorkspaceFolder(URI.file(includePattern))),
			patternContainsFolderPath: String(patternContainsWorkspaceFolderPath(includePattern, this.workspaceService)),
		});
	}

	private getResultMessage(isRegExp: boolean, query: string, count: number): MarkdownString {
		if (count === 0) {
			return isRegExp
				? new MarkdownString(l10n.t`Searched for regex ${query}, no results`)
				: new MarkdownString(l10n.t`Searched for text ${query}, no results`);
		} else if (count === 1) {
			return isRegExp
				? new MarkdownString(l10n.t`Searched for regex ${query}, 1 result`)
				: new MarkdownString(l10n.t`Searched for text ${query}, 1 result`);
		} else {
			return isRegExp
				? new MarkdownString(l10n.t`Searched for regex ${query}, ${count} results`)
				: new MarkdownString(l10n.t`Searched for text ${query}, ${count} results`);
		}
	}

	private isValidRegex(pattern: string): boolean {
		try {
			new RegExp(pattern);
			return true;
		} catch {
			return false;
		}
	}

	private async searchAndCollectResults(query: string, isRegExp: boolean, patterns: vscode.GlobPattern[] | undefined, maxResults: number, includeIgnoredFiles: boolean | undefined, token: CancellationToken): Promise<vscode.TextSearchResult2[]> {
		const findOptions: vscode.FindTextInFilesOptions2 = {
			include: patterns ? patterns : undefined,
			maxResults: maxResults + 1,
			useExcludeSettings: includeIgnoredFiles ? ExcludeSettingOptions.None : ExcludeSettingOptions.SearchAndFilesExclude,
			useIgnoreFiles: includeIgnoredFiles ? { local: false, parent: false, global: false } : undefined,
			caseInsensitive: true,
		};

		const searchResult = this.searchService.findTextInFiles2(
			{
				pattern: query,
				isRegExp,
			},
			findOptions,
			token);
		const results: vscode.TextSearchResult2[] = [];
		for await (const item of searchResult.results) {
			checkCancellation(token);
			results.push(item);
		}

		// Necessary in case it was rejected
		await searchResult.complete;

		return results;
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IFindTextInFilesToolParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const isRegExp = options.input.isRegexp ?? true;
		const globResult = options.input.includePattern ? inputGlobToPattern(options.input.includePattern, this.workspaceService, undefined) : undefined;
		const query = this.formatQueryString(options.input, globResult);
		return {
			invocationMessage: isRegExp ?
				new MarkdownString(l10n.t`Searching for regex ${query}`) :
				new MarkdownString(l10n.t`Searching for text ${query}`),
		};
	}

	/**
	 * Formats text as a Markdown inline code span that is resilient to backticks within the text.
	 * It chooses a backtick fence one longer than the longest run of backticks in the content,
	 * and pads with a space when the content begins or ends with a backtick as per CommonMark.
	 */
	private formatCodeSpan(text: string): string {
		const matches = text.match(/`+/g);
		const maxRun = matches ? matches.reduce((m, s) => Math.max(m, s.length), 0) : 0;
		const fence = '`'.repeat(maxRun + 1);
		const needsPadding = text.startsWith('`') || text.endsWith('`');
		const inner = needsPadding ? ` ${text} ` : text;
		return `${fence}${inner}${fence}`;
	}

	private formatQueryString(input: IFindTextInFilesToolParams, globResult?: InputGlobResult): string {
		const querySpan = this.formatCodeSpan(input.query);
		if (globResult?.folderName) {
			if (globResult.folderRelativePattern && globResult.folderRelativePattern !== '**') {
				return `${querySpan} (\`${globResult.folderName}\` \u00B7 ${this.formatCodeSpan(globResult.folderRelativePattern)})`;
			}
			return `${querySpan} (\`${globResult.folderName}\`)`;
		}
		if (input.includePattern && input.includePattern !== '**/*') {
			const patternSpan = this.formatCodeSpan(input.includePattern);
			return `${querySpan} (${patternSpan})`;
		}
		return querySpan;
	}

	async resolveInput(input: IFindTextInFilesToolParams, _promptContext: IBuildPromptContext, mode: CopilotToolMode): Promise<IFindTextInFilesToolParams> {
		let includePattern = input.includePattern;
		if (includePattern === '**') {
			includePattern = undefined;
		}

		if (includePattern && !includePattern.startsWith('**/') && !includePattern.startsWith('/') && !includePattern.includes(':')) {
			includePattern = `**/${includePattern}`;
		}
		if (includePattern && includePattern.endsWith('/')) {
			includePattern = `${includePattern}**`;
		}

		return {
			maxResults: mode === CopilotToolMode.FullContext ? 200 : 20,
			...input,
			includePattern,
		};
	}
}

ToolRegistry.registerTool(FindTextInFilesTool);
export interface FindTextInFilesResultProps extends BasePromptElementProps {
	textResults: vscode.TextSearchResult2[];
	maxResults: number;
	askedForTooManyResults?: boolean;
	noMatchInstructions?: string;
}

/** Max number of characters between matching ranges. */
const MAX_CHARS_BETWEEN_MATCHES = 500;

/** Start priority for findFiles lines so that context is gradually trimmed. */
const FIND_FILES_START_PRIORITY = 1000;

export class FindTextInFilesResult extends PromptElement<FindTextInFilesResultProps> {
	override async render(state: void, sizing: PromptSizing): Promise<PromptPiece> {
		const textMatches = this.props.textResults.filter(isTextSearchMatch);
		if (textMatches.length === 0) {
			const noMatchInstructions = this.props.noMatchInstructions ?? '';
			return <>No matches found.{noMatchInstructions}</>;
		}

		const numResults = textMatches.reduce((acc, result) => acc + result.ranges.length, 0);
		const resultCountToDisplay = Math.min(numResults, this.props.maxResults);
		const numResultsText = numResults === 1 ? '1 match' : `${resultCountToDisplay} matches`;
		const maxResultsText = numResults > this.props.maxResults ? ` (more results are available)` : '';
		const maxResultsTooLargeText = this.props.askedForTooManyResults ? ` (maxResults capped at ${MaxResultsCap})` : '';
		return <>
			{<TextChunk priority={20}>{numResultsText}{maxResultsText}{maxResultsTooLargeText}</TextChunk>}
			{textMatches.flatMap(result => {
				// The result preview line always ends in a newline, I think that makes sense but don't display an extra empty line
				const previewText = result.previewText.replace(/\n$/, '');
				return result.ranges.map((rangeInfo, i) => {
					return <FindMatch
						passPriority
						preview={previewText}
						rangeInPreview={rangeInfo.previewRange}
						rangeInDocument={rangeInfo.sourceRange}
						uri={result.uri}
					/>;
				});
			})}
		</>;
	}
}

interface IFindMatchProps extends BasePromptElementProps {
	preview: string;
	rangeInPreview: Range;
	rangeInDocument: Range;
	uri: URI;
}

/**
 * 1. Removes excessive extra character data from the match, e.g. avoiding
 * giant minified lines
 * 2. Wraps the match in a <match> tag
 * 3. Prioritizes lines in the middle of the match where the range lies
 */
export class FindMatch extends PromptElement<IFindMatchProps> {
	constructor(
		props: PromptElementProps<IFindMatchProps>,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override render(): PromptPiece {
		const { uri, preview, rangeInDocument, rangeInPreview } = this.props;

		const convert = new OffsetLineColumnConverter(preview);

		const start = convert.positionToOffset(new EditorPosition(rangeInPreview.start.line + 1, rangeInPreview.start.character + 1));
		const end = convert.positionToOffset(new EditorPosition(rangeInPreview.end.line + 1, rangeInPreview.end.character + 1));

		let toPreview = preview;
		let lineStartsAt = (rangeInDocument.start.line + 1) - count(preview.slice(0, start), '\n');
		if (preview.length - end > MAX_CHARS_BETWEEN_MATCHES) {
			toPreview = preview.slice(0, end + MAX_CHARS_BETWEEN_MATCHES) + '...';
		}

		if (start > MAX_CHARS_BETWEEN_MATCHES) {
			lineStartsAt += count(preview.slice(0, start - MAX_CHARS_BETWEEN_MATCHES), '\n');
			toPreview = '...' + toPreview.slice(start - MAX_CHARS_BETWEEN_MATCHES);
		}

		const toPreviewLines = toPreview.split('\n');
		const center = Math.floor(toPreviewLines.length / 2);
		return <Tag name='match' attrs={{
			path: this.promptPathRepresentationService.getFilePath(uri),
			line: rangeInDocument.start.line + 1,
		}}>
			<references value={[new PromptReference(new Location(this.props.uri, rangeInDocument), undefined, { isFromTool: true })]} />
			{toPreviewLines.map((line, i) =>
				<TextChunk priority={FIND_FILES_START_PRIORITY - Math.abs(i - center)}>
					{line}
				</TextChunk>
			)}
		</Tag>;
	}
}


export function isTextSearchMatch(obj: vscode.TextSearchResult2): obj is vscode.TextSearchMatch2 {
	return 'ranges' in obj;
}
