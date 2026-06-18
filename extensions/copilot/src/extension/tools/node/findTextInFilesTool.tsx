/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptPiece, PromptReference, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { OffsetLineColumnConverter } from '../../../platform/editing/common/offsetLineColumnConverter';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { RelativePattern } from '../../../platform/filesystem/common/fileTypes';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ISearchService } from '../../../platform/search/common/searchService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { WorkingDirectory } from '../../../platform/workspace/common/workingDirectory';
import { raceTimeoutAndCancellationError } from '../../../util/common/racePromise';
import { asArray } from '../../../util/vs/base/common/arrays';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../util/vs/base/common/path';
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
import { IExperimentationService } from '../../../lib/node/chatLibMain';
import { splitLines } from '../../../util/vs/base/common/strings';

interface IFindTextInFilesToolParams {
	query: string;
	isRegexp?: boolean;
	includePattern?: string;
	maxResults?: number;
	/** Whether to include files that would normally be ignored according to .gitignore, other ignore files and `files.exclude` and `search.exclude` settings. */
	includeIgnoredFiles?: boolean;
}

const MaxResultsCap = 200;

interface FileMatch {
	path: string;
	matches: vscode.TextSearchMatch2[];
	elidedMatches?: number;
}

interface MatchResult {
	stats: {
		total: number;
		elided: number;
		filesElided: number;
	};
	files: FileMatch[];
}

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
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
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
		const workingDir = new WorkingDirectory(options.workingDirectory, this.workspaceService);
		const globResult = options.input.includePattern ? inputGlobToPattern(options.input.includePattern, workingDir, modelFamily) : undefined;
		let patterns = globResult?.patterns;

		// When no include pattern is specified but a working directory is set (agents window),
		// scope the search to the session's working directory.
		if (!patterns && workingDir.hasExplicitWorkingDirectory) {
			patterns = [new RelativePattern(workingDir.uri!, '**')];
		}

		const outputFormat = this.getOutputFormat();
		const useGrepStyle = outputFormat === 'grep';
		void this.sendSearchToolTelemetry(options, globResult, outputFormat);

		checkCancellation(token);
		const askedForTooManyResults = options.input.maxResults && options.input.maxResults > MaxResultsCap;
		const maxResults = Math.min(options.input.maxResults ?? 20, MaxResultsCap);
		const isRegExp = options.input.isRegexp ?? true;
		const queryIsValidRegex = this.isValidRegex(options.input.query);
		const includeIgnoredFiles = options.input.includeIgnoredFiles ?? false;

		// try find text with a timeout of 20s
		const timeoutInMs = 20_000;

		// For the grp output we don't limit the number of matches by cutting files. We instead
		// keep files and cut matches for each file. Therefore we need to ask for more results upfront
		// to account for the fact that some files will be cut off. For the tag output we cut off files
		// instead of matches, so we can just ask for the maxResults number of results.
		const searchMaxResults = useGrepStyle ? maxResults * 5 : maxResults;

		let results = await raceTimeoutAndCancellationError(
			(searchToken) => this.searchAndCollectResults(options.input.query, isRegExp, patterns, searchMaxResults, includeIgnoredFiles, searchToken),
			token,
			timeoutInMs,
			// embed message to give LLM hint about what to do next
			`Timeout in searching text in files with ${isRegExp ? 'regex' : 'literal'} search, try a more specific search pattern or change regex/literal mode`
		);

		// If we still have no results, we need to try the opposite regex mode
		if (!results.length && queryIsValidRegex) {
			results = await raceTimeoutAndCancellationError(
				(searchToken) => this.searchAndCollectResults(options.input.query, !isRegExp, patterns, searchMaxResults, includeIgnoredFiles, searchToken),
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

		if (useGrepStyle) {
			return this.renderGrepStyle(results, options, maxResults, globResult, isRegExp, noMatchInstructions, token);
		} else {
			return this.renderTagStyle(results, options, maxResults, globResult, askedForTooManyResults, isRegExp, noMatchInstructions, token);
		}
	}

	private async renderTagStyle(results: vscode.TextSearchResult2[], options: vscode.LanguageModelToolInvocationOptions<IFindTextInFilesToolParams>, maxResults: number, globResult: InputGlobResult | undefined, askedForTooManyResults: boolean | number | undefined, isRegExp: boolean, noMatchInstructions: string | undefined, token: CancellationToken): Promise<vscode.ExtendedLanguageModelToolResult> {
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

	private async renderGrepStyle(results: vscode.TextSearchResult2[], options: vscode.LanguageModelToolInvocationOptions<IFindTextInFilesToolParams>, maxResults: number, globResult: InputGlobResult | undefined, isRegExp: boolean, noMatchInstructions: string | undefined, token: CancellationToken): Promise<vscode.ExtendedLanguageModelToolResult> {
		const groupedMatches = this.createGroupedFileMatches(results, maxResults);
		if (!groupedMatches) {
			return this.errorResult(noMatchInstructions ? `No matches found. ${noMatchInstructions}` : 'No matches found.');
		}
		const prompt = await renderPromptElementJSON(this.instantiationService,
			FindTextInFilesGrepResult,
			{ grouped: groupedMatches, query: options.input.query },
			options.tokenizationOptions,
			token);
		const result = new ExtendedLanguageModelToolResult([new LanguageModelPromptTsxPart(prompt)]);
		const query = this.formatQueryString(options.input, globResult);
		result.toolResultMessage = this.getResultMessage(isRegExp, query, groupedMatches.stats.total);
		return result;
	}

	private createGroupedFileMatches(results: vscode.TextSearchResult2[], maxResults: number): MatchResult | undefined {
		const textMatches = results.filter(isTextSearchMatch);
		if (!textMatches.length) {
			return undefined;
		}
		const groupedByFile: Map<string, FileMatch> = new Map();
		for (const textMatch of textMatches) {
			const path = this.promptPathRepresentationService.getFilePath(textMatch.uri, true);
			let fileMatch = groupedByFile.get(path);
			if (fileMatch === undefined) {
				fileMatch = { path, matches: [] };
				groupedByFile.set(path, fileMatch);
			}
			fileMatch.matches.push(textMatch);
		}
		let fileMatches = Array.from(groupedByFile.values()).sort((a, b) => a.path.localeCompare(b.path));
		let totalMatches = 0;
		for (const fileMatch of fileMatches) {
			fileMatch.matches = fileMatch.matches.sort((a, b) => a.ranges[0].sourceRange.start.line - b.ranges[0].sourceRange.start.line);
			totalMatches += fileMatch.matches.length;
		}

		let totalElided = 0;
		let filesElided = 0;
		if (totalMatches > maxResults) {
			// Every file we keep must show at least one match, so we can show at most
			// `maxResults` files. When there are more files than that, drop the extra
			// files entirely (keeping the alphabetically-first ones) and count them.
			const shownFileCount = Math.min(fileMatches.length, maxResults);
			for (let i = shownFileCount; i < fileMatches.length; i++) {
				totalElided += fileMatches[i].matches.length;
			}
			filesElided = fileMatches.length - shownFileCount;
			fileMatches = fileMatches.slice(0, shownFileCount);

			// Distribute the `maxResults` budget across the kept files proportionally to
			// their number of matches, guaranteeing at least one match per file (largest
			// remainder method).
			const shownTotal = fileMatches.reduce((sum, fileMatch) => sum + fileMatch.matches.length, 0);
			const allocations = fileMatches.map((fileMatch, index) => {
				const exact = (fileMatch.matches.length / shownTotal) * maxResults;
				const floor = Math.floor(exact);
				return { index, allowed: Math.max(1, floor), remainder: exact - floor };
			});
			let allocated = allocations.reduce((sum, allocation) => sum + allocation.allowed, 0);

			if (allocated < maxResults) {
				// Hand out the remaining budget to the files with the largest remainder,
				// never allocating more matches than a file actually has.
				const byRemainder = allocations.slice().sort((a, b) => b.remainder - a.remainder);
				let progressed = true;
				while (allocated < maxResults && progressed) {
					progressed = false;
					for (const allocation of byRemainder) {
						if (allocated >= maxResults) {
							break;
						}
						if (allocation.allowed < fileMatches[allocation.index].matches.length) {
							allocation.allowed++;
							allocated++;
							progressed = true;
						}
					}
				}
			} else if (allocated > maxResults) {
				// The minimum-one-per-file rule pushed us over budget; reclaim slots from
				// the files with the smallest remainder without dropping below one match.
				const byRemainder = allocations.slice().sort((a, b) => a.remainder - b.remainder);
				let progressed = true;
				while (allocated > maxResults && progressed) {
					progressed = false;
					for (const allocation of byRemainder) {
						if (allocated <= maxResults) {
							break;
						}
						if (allocation.allowed > 1) {
							allocation.allowed--;
							allocated--;
							progressed = true;
						}
					}
				}
			}

			for (const allocation of allocations) {
				const fileMatch = fileMatches[allocation.index];
				if (fileMatch.matches.length > allocation.allowed) {
					const elided = fileMatch.matches.length - allocation.allowed;
					fileMatch.elidedMatches = elided;
					totalElided += elided;
					fileMatch.matches = fileMatch.matches.slice(0, allocation.allowed);
				}
			}
		}
		return {
			stats: {
				total: totalMatches,
				elided: totalElided,
				filesElided: filesElided,
			},
			files: fileMatches
		};
	}

	private errorResult(message: string): vscode.ExtendedLanguageModelToolResult {
		const result = new ExtendedLanguageModelToolResult([]);
		result.toolResultMessage = new MarkdownString(message);
		return result;
	}

	private async sendSearchToolTelemetry(options: vscode.LanguageModelToolInvocationOptions<IFindTextInFilesToolParams>, globResult: InputGlobResult | undefined, outputFormat: string): Promise<void> {
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
				"patternContainsFolderPath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the raw includePattern contains a workspace folder absolute path anywhere" },
				"outputFormat": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The output format of the search results" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('findTextInFilesToolInvoked', {
			requestId: options.chatRequestId,
			model,
			isMultiRoot: String(isMultiRoot),
			patternScopedToFolder: String(!!globResult?.folderName),
			patternStartsWithFolderPath: String(!!includePattern && isAbsolute(includePattern) && !!this.workspaceService.getWorkspaceFolder(URI.file(includePattern))),
			patternContainsFolderPath: String(patternContainsWorkspaceFolderPath(includePattern, this.workspaceService)),
			outputFormat: outputFormat
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
		const globResult = options.input.includePattern ? inputGlobToPattern(options.input.includePattern, new WorkingDirectory(undefined, this.workspaceService), undefined) : undefined;
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

	private getOutputFormat(): 'grep' | 'tag' {
		const expFlag = this.configurationService.getExperimentBasedConfig(ConfigKey.GrepSearchOutputFormat, this.experimentationService);
		return expFlag === 'grep' ? 'grep' : 'tag';
	}
}

ToolRegistry.registerTool(FindTextInFilesTool);
export interface FindTextInFilesResultProps extends BasePromptElementProps {
	textResults: vscode.TextSearchResult2[];
	maxResults: number;
	askedForTooManyResults?: boolean;
	noMatchInstructions?: string;
}

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

	/** Max number of characters between matching ranges. */
	private static readonly MAX_CHARS_BETWEEN_MATCHES = 500;

	/**
	 * Max number of characters of the matched span itself to include before eliding its
	 * middle. Prevents a single match (e.g. a greedy regex matching a multi-megabyte minified
	 * line) from contributing an unbounded amount of text.
	 */
	private static readonly MAX_MATCH_PREVIEW_CHARS = 2000;

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

		const toPreviewLines = FindMatch.boundMatchPreview(preview, start, end);
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

	/**
	 * Bounds a match preview so a single match cannot contribute an unbounded amount of text,
	 * returning the result already split into lines (so callers don't need to split again).
	 *
	 * - Trims surrounding context to {@link MAX_CHARS_BETWEEN_MATCHES} characters on each side.
	 * - If the matched span itself exceeds {@link MAX_MATCH_PREVIEW_CHARS}, elides it via
	 *   {@link elideMatchTextLines}: the middle characters (single-line) or the middle lines
	 *   (multi-line) are dropped while the match's boundaries stay visible.
	 *
	 * For matches within these limits the surrounding window is returned unchanged.
	 *
	 * @param preview The full preview text (may span multiple lines and be very large).
	 * @param start Offset of the match start within `preview`.
	 * @param end Offset of the match end within `preview`.
	 */
	private static boundMatchPreview(preview: string, start: number, end: number): string[] {
		start = Math.max(0, Math.min(start, preview.length));
		end = Math.max(start, Math.min(end, preview.length));

		const matchText = preview.slice(start, end);
		const matchLines = matchText.length > this.MAX_MATCH_PREVIEW_CHARS
			? this.elideMatchTextLines(matchText)
			: splitLines(matchText);

		const prefix = start > this.MAX_CHARS_BETWEEN_MATCHES ? '...' : '';
		const suffix = preview.length - end > this.MAX_CHARS_BETWEEN_MATCHES ? '...' : '';
		const beforeLines = splitLines(prefix + preview.slice(Math.max(0, start - this.MAX_CHARS_BETWEEN_MATCHES), start));
		const afterLines = splitLines(preview.slice(end, end + this.MAX_CHARS_BETWEEN_MATCHES) + suffix);

		// The last `before` line shares a physical line with the first match line, and the last match
		// line shares a physical line with the first `after` line, so stitch them together at those
		// seams rather than joining everything and splitting again.
		const head = beforeLines[beforeLines.length - 1];
		const tail = afterLines[0];
		const lines = beforeLines.slice(0, -1);
		if (matchLines.length === 1) {
			lines.push(head + matchLines[0] + tail);
		} else {
			lines.push(head + matchLines[0]);
			for (let i = 1; i < matchLines.length - 1; i++) {
				lines.push(matchLines[i]);
			}
			lines.push(matchLines[matchLines.length - 1] + tail);
		}
		lines.push(...afterLines.slice(1));
		return lines;
	}

	/**
	 * Bounds the matched span itself so a single match cannot contribute an unbounded amount of text,
	 * returning the bounded match as an array of lines.
	 *
	 * - A single-line match keeps its head and tail and elides the middle characters.
	 * - A multi-line match keeps only its first and last line (each width-bounded the same way) and
	 *   elides the lines in between, so the start and end of the match both remain visible instead of
	 *   being cut mid-way.
	 */
	private static elideMatchTextLines(matchText: string): string[] {
		if (!matchText.includes('\n')) {
			return [this.elideLineWidth(matchText)];
		}
		const lines = splitLines(matchText);
		const first = this.elideLineWidth(lines[0]);
		const last = this.elideLineWidth(lines[lines.length - 1]);
		const elidedLines = lines.length - 2;
		return elidedLines > 0
			? [first, `[... ${elidedLines} ${elidedLines === 1 ? 'line' : 'lines'} elided ...]`, last]
			: [first, last];
	}

	/**
	 * Elides the middle of a single line if it exceeds {@link MAX_MATCH_PREVIEW_CHARS}, keeping its
	 * head and tail so both ends of the line remain visible.
	 */
	private static elideLineWidth(line: string): string {
		if (line.length <= this.MAX_MATCH_PREVIEW_CHARS) {
			return line;
		}
		const head = Math.ceil(this.MAX_MATCH_PREVIEW_CHARS / 2);
		const tail = this.MAX_MATCH_PREVIEW_CHARS - head;
		const elided = line.length - head - tail;
		return `${line.slice(0, head)}[... ${elided} characters elided ...]${line.slice(line.length - tail)}`;
	}
}

export interface FindTextInFilesGrepResultProps extends BasePromptElementProps {
	grouped: MatchResult;
	query: string;
}

/**
 * Renders grep-style search results as plain text (no XML tags) through prompt-tsx, so the
 * output participates in token-budget pruning and carries editor references instead of being
 * emitted as a single unprunable text blob.
 *
 * Each file is rendered as its own {@link TextChunk}, prefixed with a blank line to match the
 * grep output format. Earlier files are given a higher priority so that, when the budget is
 * exceeded, later files are dropped first.
 */
export class FindTextInFilesGrepResult extends PromptElement<FindTextInFilesGrepResultProps> {

	/** Grep output: lines at or below this length are emitted verbatim. */
	private static readonly MAX_LINE_CHARS = 600;

	/** Grep output: characters of context kept before the match when a long line is truncated. */
	private static readonly CONTEXT_BEFORE_CHARS = 150;

	/** Grep output: characters of context kept after the match when a long line is truncated. */
	private static readonly CONTEXT_AFTER_CHARS = 105;

	/** Grep output: max characters of the matched span itself before its middle is elided. */
	private static readonly MAX_MATCH_CHARS = 300;

	override render(): PromptPiece {
		const { grouped, query } = this.props;

		const totalMatches = grouped.stats.total;
		const totalFiles = grouped.stats.filesElided + grouped.files.length;
		const matchText = totalMatches === 1 ? `1 match` : `${totalMatches} matches`;
		const filesText = totalFiles === 1 ? `1 file` : `${totalFiles} files`;
		let elided = '';
		if (grouped.stats.elided > 0) {
			const shownMatches = totalMatches - grouped.stats.elided;
			const shownMatchText = shownMatches === 1 ? `1 match` : `${shownMatches} matches`;
			const shownFilesText = grouped.files.length === 1 ? `1 file` : `${grouped.files.length} files`;
			elided = ` (showing ${shownMatchText} in ${shownFilesText})`;
		}
		const header = `Found ${matchText} in ${filesText} for "${query}"${elided}`;


		return <>
			<TextChunk priority={20}>{header}</TextChunk>
			{grouped.files.map((file, fileIndex) => {
				const lines = [file.path];
				for (const match of file.matches) {
					const line = match.ranges[0].sourceRange.start.line + 1;
					lines.push(`${line}:${FindTextInFilesGrepResult.boundMatchPreview(match)}`);
				}
				if (file.elidedMatches && file.elidedMatches > 0) {
					const more = file.elidedMatches === 1 ? `1 more match` : `${file.elidedMatches} more matches`;
					lines.push(`... (${more} in this file)`);
				}
				const references = file.matches.map((match) => new PromptReference(new Location(match.uri, match.ranges[0].sourceRange), undefined, { isFromTool: true }));
				// The leading newline renders as a blank line separating this file block from the
				// previous chunk, matching the plain-text grep format.
				return <>
					<references value={references} />
					<TextChunk priority={FIND_FILES_START_PRIORITY - fileIndex}>{`\n${lines.join('\n')}`}</TextChunk>
				</>;
			})}
		</>;
	}

	/**
	 * Renders a single search match as one grep-style line, bounded for an LLM consumer.
	 *
	 * Lines up to {@link GREP_MAX_LINE_CHARS} characters are returned verbatim. Longer lines (typically
	 * minified or generated) are reduced to a match-centered window: {@link GREP_CONTEXT_BEFORE_CHARS}
	 * characters before the match, up to {@link GREP_MAX_MATCH_CHARS} of the match itself (middle-elided
	 * if larger), and {@link GREP_CONTEXT_AFTER_CHARS} after, followed by a
	 * `[match at col N, line truncated, M chars]` annotation so the model knows where the match sits in
	 * the full line and can read the file for the rest. The result is always a single line.
	 */
	private static boundMatchPreview(textMatch: vscode.TextSearchMatch2): string {
		const preview = textMatch.previewText.replace(/\n$/, '').trimEnd();
		if (preview.length <= this.MAX_LINE_CHARS) {
			return this.collapseToSingleLine(preview);
		}

		const previewRange = textMatch.ranges[0].previewRange;
		const convert = new OffsetLineColumnConverter(preview);
		const start = Math.max(0, Math.min(convert.positionToOffset(new EditorPosition(previewRange.start.line + 1, previewRange.start.character + 1)), preview.length));
		const end = Math.max(start, Math.min(convert.positionToOffset(new EditorPosition(previewRange.end.line + 1, previewRange.end.character + 1)), preview.length));

		let matchText = preview.slice(start, end);
		if (matchText.length > this.MAX_MATCH_CHARS) {
			const head = Math.ceil(this.MAX_MATCH_CHARS / 2);
			const tail = this.MAX_MATCH_CHARS - head;
			const elided = matchText.length - head - tail;
			matchText = `${matchText.slice(0, head)}[... ${elided} characters elided ...]${matchText.slice(matchText.length - tail)}`;
		}

		const before = preview.slice(Math.max(0, start - this.CONTEXT_BEFORE_CHARS), start);
		const after = preview.slice(end, end + this.CONTEXT_AFTER_CHARS);
		const column = textMatch.ranges[0].sourceRange.start.character + 1;
		const annotation = ` [match at col ${column} \u00B7 line truncated, ${this.formatCharCount(preview.length)} chars]`;

		return this.collapseToSingleLine(`${before}${matchText}${after}`) + annotation;
	}

	/** Collapses any newlines so a value always renders on a single physical line. */
	private static collapseToSingleLine(text: string): string {
		return text.replace(/\r\n|\r|\n/g, ' ');
	}

	/** Formats a number with thousands separators, e.g. `48210` becomes `48,210`. */
	private static formatCharCount(count: number): string {
		return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}
}

export function isTextSearchMatch(obj: vscode.TextSearchResult2): obj is vscode.TextSearchMatch2 {
	return 'ranges' in obj;
}
