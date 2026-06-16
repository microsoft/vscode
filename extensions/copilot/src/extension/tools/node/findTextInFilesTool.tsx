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
import { count } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { Position as EditorPosition } from '../../../util/vs/editor/common/core/position';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExcludeSettingOptions, ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, LanguageModelTextPart, Location, MarkdownString, Range } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { Tag } from '../../prompts/node/base/tag';
import { ToolName } from '../common/toolNames';
import { CopilotToolMode, ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation, InputGlobResult, inputGlobToPattern, patternContainsWorkspaceFolderPath } from './toolUtils';
import { IExperimentationService } from '../../../lib/node/chatLibMain';

interface IFindTextInFilesToolParams {
	query: string;
	isRegexp?: boolean;
	includePattern?: string;
	maxResults?: number;
	/** Whether to include files that would normally be ignored according to .gitignore, other ignore files and `files.exclude` and `search.exclude` settings. */
	includeIgnoredFiles?: boolean;
}

const MaxResultsCap = 200;

interface LineMatch {
	line: number;
	text: string;
}

interface FileMatch {
	path: string;
	matches: LineMatch[];
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

	private renderGrepStyle(results: vscode.TextSearchResult2[], options: vscode.LanguageModelToolInvocationOptions<IFindTextInFilesToolParams>, maxResults: number, globResult: InputGlobResult | undefined, isRegExp: boolean, noMatchInstructions: string | undefined, token: CancellationToken): vscode.ExtendedLanguageModelToolResult {
		const groupedMatches = this.createGroupedFileMatches(results, maxResults);
		if (!groupedMatches) {
			return this.errorResult(noMatchInstructions ? `No matches found. ${noMatchInstructions}` : 'No matches found.');
		}
		const totalMatches = groupedMatches.stats.total;
		const totalFiles = groupedMatches.stats.filesElided + groupedMatches.files.length;
		const match = totalMatches === 1 ? `1 match` : `${totalMatches} matches`;
		const files = totalFiles === 1 ? `1 file` : `${totalFiles} files`;
		let elided: string = '';
		if (groupedMatches.stats.elided > 0) {
			const shownMatches = groupedMatches.stats.total - groupedMatches.stats.elided;
			const match = shownMatches === 1 ? `1 match` : `${shownMatches} matches`;
			const files = groupedMatches.files.length === 1 ? `1 file` : `${groupedMatches.files.length} files`;
			elided = ` (showing ${match} in ${files})`;
		}
		const buffer: string[] = [`Found ${match} in ${files} for "${options.input.query}"${elided}`, ''];
		groupedMatches.files.forEach((f, i) => {
			buffer.push(f.path);
			for (const match of f.matches) {
				buffer.push(`${match.line}:${match.text}`);
			}
			if (f.elidedMatches && f.elidedMatches > 0) {
				const match = f.elidedMatches === 1 ? `1 more match` : `${f.elidedMatches} more matches`;
				buffer.push(`... (${match} in this file)`);
			}
			if (i < groupedMatches.files.length - 1) {
				buffer.push('');
			}
		});
		const result = new ExtendedLanguageModelToolResult([new LanguageModelTextPart(buffer.join('\n'))]);
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
			fileMatch.matches.push({
				line: textMatch.ranges[0].sourceRange.start.line + 1,
				text: textMatch.previewText.replace(/\n$/, '').trimEnd()
			});
		}
		let fileMatches = Array.from(groupedByFile.values()).sort((a, b) => a.path.localeCompare(b.path));
		let totalMatches = 0;
		for (const fileMatch of fileMatches) {
			fileMatch.matches = fileMatch.matches.sort((a, b) => a.line - b.line);
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
