/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, flatten } from 'vs/base/common/arrays';
import * as network from 'vs/base/common/network';
import { repeat } from 'vs/base/common/strings';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLinePreference, TrackedRangeStickiness } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { searchEditorFindMatch, searchEditorFindMatchBorder } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { UntitledTextEditorInput } from 'vs/workbench/common/editor/untitledTextEditorInput';
import { ITextQueryBuilderOptions, QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { FileMatch, Match, searchMatchComparer, SearchModel, SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPatternInfo, ISearchConfigurationProperties, ITextQuery } from 'vs/workbench/services/search/common/search';
import { EditorInput, IEditorInputFactory } from 'vs/workbench/common/editor';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { SearchEditor } from 'vs/workbench/contrib/search/browser/searchEditor';


export type SearchConfiguration = {
	query: string,
	includes: string,
	excludes: string,
	contextLines: number,
	wholeWord: boolean,
	caseSensitive: boolean,
	regexp: boolean,
	useIgnores: boolean,
	showIncludesExcludes: boolean,
};

export class SearchEditorInputFactory implements IEditorInputFactory {

	canSerialize() { return true; }

	serialize(input: SearchEditorInput) {
		return JSON.stringify(input.config);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SearchEditorInput | undefined {
		return instantiationService.createInstance(SearchEditorInput, JSON.parse(serializedEditorInput));
	}
}

let searchEditorInputInstances = 0;
export class SearchEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.editorinputs.searchEditorInput';

	public config: SearchConfiguration;
	private instanceNumber: number = searchEditorInputInstances++;

	constructor(
		config: SearchConfiguration | undefined,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) {
		super();

		if (config === undefined) {
			this.config = { query: '', includes: '', excludes: '', contextLines: 0, wholeWord: false, caseSensitive: false, regexp: false, useIgnores: true, showIncludesExcludes: false };
		} else {
			this.config = config;
		}

		const searchResultMode = this.modeService.create('search-result');
		this.modelService.createModel('', searchResultMode, this.getResource());
	}

	getTypeId(): string {
		return SearchEditorInput.ID;
	}

	getResource(): URI {
		return URI.from({ scheme: 'search-editor', fragment: `${this.instanceNumber}` });
	}

	getName(): string {
		return this.config.query ? localize('searchTitle.withQuery', "Search: {0}", this.config.query) : localize('searchTitle', "Search");
	}

	setConfig(config: SearchConfiguration) {
		this.config = config;
		this._onDidChangeLabel.fire();
	}

	async resolve() {
		return null;
	}

	dispose() {
		this.modelService.destroyModel(this.getResource());
		super.dispose();
	}
}

// Using \r\n on Windows inserts an extra newline between results.
const lineDelimiter = '\n';

const translateRangeLines =
	(n: number) =>
		(range: Range) =>
			new Range(range.startLineNumber + n, range.startColumn, range.endLineNumber + n, range.endColumn);

const matchToSearchResultFormat = (match: Match): { line: string, ranges: Range[], lineNumber: string }[] => {
	const getLinePrefix = (i: number) => `${match.range().startLineNumber + i}`;

	const fullMatchLines = match.fullPreviewLines();
	const largestPrefixSize = fullMatchLines.reduce((largest, _, i) => Math.max(getLinePrefix(i).length, largest), 0);


	const results: { line: string, ranges: Range[], lineNumber: string }[] = [];

	fullMatchLines
		.forEach((sourceLine, i) => {
			const lineNumber = getLinePrefix(i);
			const paddingStr = repeat(' ', largestPrefixSize - lineNumber.length);
			const prefix = `  ${lineNumber}: ${paddingStr}`;
			const prefixOffset = prefix.length;

			const line = (prefix + sourceLine).replace(/\r?\n?$/, '');

			const rangeOnThisLine = ({ start, end }: { start?: number; end?: number; }) => new Range(1, (start ?? 1) + prefixOffset, 1, (end ?? sourceLine.length + 1) + prefixOffset);

			const matchRange = match.range();
			const matchIsSingleLine = matchRange.startLineNumber === matchRange.endLineNumber;

			let lineRange;
			if (matchIsSingleLine) { lineRange = (rangeOnThisLine({ start: matchRange.startColumn, end: matchRange.endColumn })); }
			else if (i === 0) { lineRange = (rangeOnThisLine({ start: matchRange.startColumn })); }
			else if (i === fullMatchLines.length - 1) { lineRange = (rangeOnThisLine({ end: matchRange.endColumn })); }
			else { lineRange = (rangeOnThisLine({})); }

			results.push({ lineNumber: lineNumber, line, ranges: [lineRange] });
		});

	return results;
};

type SearchResultSerialization = { text: string[], matchRanges: Range[] };

function fileMatchToSearchResultFormat(fileMatch: FileMatch, labelFormatter: (x: URI) => string): SearchResultSerialization {
	const serializedMatches = flatten(fileMatch.matches()
		.sort(searchMatchComparer)
		.map(match => matchToSearchResultFormat(match)));

	const uriString = labelFormatter(fileMatch.resource);
	let text: string[] = [`${uriString}:`];
	let matchRanges: Range[] = [];

	const targetLineNumberToOffset: Record<string, number> = {};

	const context: { line: string, lineNumber: number }[] = [];
	fileMatch.context.forEach((line, lineNumber) => context.push({ line, lineNumber }));
	context.sort((a, b) => a.lineNumber - b.lineNumber);

	let lastLine: number | undefined = undefined;

	const seenLines = new Set<string>();
	serializedMatches.forEach(match => {
		if (!seenLines.has(match.line)) {
			while (context.length && context[0].lineNumber < +match.lineNumber) {
				const { line, lineNumber } = context.shift()!;
				if (lastLine !== undefined && lineNumber !== lastLine + 1) {
					text.push('');
				}
				text.push(`  ${lineNumber}  ${line}`);
				lastLine = lineNumber;
			}

			targetLineNumberToOffset[match.lineNumber] = text.length;
			seenLines.add(match.line);
			text.push(match.line);
			lastLine = +match.lineNumber;
		}

		matchRanges.push(...match.ranges.map(translateRangeLines(targetLineNumberToOffset[match.lineNumber])));
	});

	while (context.length) {
		const { line, lineNumber } = context.shift()!;
		text.push(`  ${lineNumber}  ${line}`);
	}

	return { text, matchRanges };
}

const flattenSearchResultSerializations = (serializations: SearchResultSerialization[]): SearchResultSerialization => {
	let text: string[] = [];
	let matchRanges: Range[] = [];

	serializations.forEach(serialized => {
		serialized.matchRanges.map(translateRangeLines(text.length)).forEach(range => matchRanges.push(range));
		serialized.text.forEach(line => text.push(line));
		text.push(''); // new line
	});

	return { text, matchRanges };
};

const contentPatternToSearchResultHeader = (pattern: ITextQuery | null, includes: string, excludes: string, contextLines: number): string[] => {
	if (!pattern) { return []; }

	const removeNullFalseAndUndefined = <T>(a: (T | null | false | undefined)[]) => a.filter(a => a !== false && a !== null && a !== undefined) as T[];

	const escapeNewlines = (str: string) => str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');

	return removeNullFalseAndUndefined([
		`# Query: ${escapeNewlines(pattern.contentPattern.pattern)}`,

		(pattern.contentPattern.isCaseSensitive || pattern.contentPattern.isWordMatch || pattern.contentPattern.isRegExp || pattern.userDisabledExcludesAndIgnoreFiles)
		&& `# Flags: ${coalesce([
			pattern.contentPattern.isCaseSensitive && 'CaseSensitive',
			pattern.contentPattern.isWordMatch && 'WordMatch',
			pattern.contentPattern.isRegExp && 'RegExp',
			pattern.userDisabledExcludesAndIgnoreFiles && 'IgnoreExcludeSettings'
		]).join(' ')}`,
		includes ? `# Including: ${includes}` : undefined,
		excludes ? `# Excluding: ${excludes}` : undefined,
		contextLines ? `# ContextLines: ${contextLines}` : undefined,
		''
	]);
};


type SearchHeader = {
	pattern: string;
	flags: {
		regex: boolean;
		wholeWord: boolean;
		caseSensitive: boolean;
		ignoreExcludes: boolean;
	};
	includes: string;
	excludes: string;
	context: number | undefined;
};

const searchHeaderToContentPattern = (header: string[]): SearchHeader => {
	const query: SearchHeader = {
		pattern: '',
		flags: { regex: false, caseSensitive: false, ignoreExcludes: false, wholeWord: false },
		includes: '',
		excludes: '',
		context: undefined
	};

	const unescapeNewlines = (str: string) => {
		let out = '';
		for (let i = 0; i < str.length; i++) {
			if (str[i] === '\\') {
				i++;
				const escaped = str[i];

				if (escaped === 'n') {
					out += '\n';
				}
				else if (escaped === '\\') {
					out += '\\';
				}
				else {
					throw Error(localize('invalidQueryStringError', "All backslashes in Query string must be escaped (\\\\)"));
				}
			} else {
				out += str[i];
			}
		}
		return out;
	};
	const parseYML = /^# ([^:]*): (.*)$/;
	for (const line of header) {
		const parsed = parseYML.exec(line);
		if (!parsed) { continue; }
		const [, key, value] = parsed;
		switch (key) {
			case 'Query': query.pattern = unescapeNewlines(value); break;
			case 'Including': query.includes = value; break;
			case 'Excluding': query.excludes = value; break;
			case 'ContextLines': query.context = +value; break;
			case 'Flags': {
				query.flags = {
					regex: value.indexOf('RegExp') !== -1,
					caseSensitive: value.indexOf('CaseSensitive') !== -1,
					ignoreExcludes: value.indexOf('IgnoreExcludeSettings') !== -1,
					wholeWord: value.indexOf('WordMatch') !== -1
				};
			}
		}
	}

	return query;
};

export const serializeSearchResultForEditor = (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, contextLines: number, labelFormatter: (x: URI) => string, includeHeader: boolean): SearchResultSerialization => {
	const header = includeHeader ? contentPatternToSearchResultHeader(searchResult.query, rawIncludePattern, rawExcludePattern, contextLines) : [];
	const allResults =
		flattenSearchResultSerializations(
			flatten(
				searchResult.folderMatches().sort(searchMatchComparer)
					.map(folderMatch => folderMatch.matches().sort(searchMatchComparer)
						.map(fileMatch => fileMatchToSearchResultFormat(fileMatch, labelFormatter)))));

	return { matchRanges: allResults.matchRanges.map(translateRangeLines(header.length)), text: header.concat(allResults.text) };
};

export const refreshActiveEditorSearch =
	async (contextLines: number | undefined, editorService: IEditorService, instantiationService: IInstantiationService, contextService: IWorkspaceContextService, labelService: ILabelService, configurationService: IConfigurationService) => {
		const editorWidget = editorService.activeTextEditorWidget;
		if (!isCodeEditor(editorWidget)) {
			return;
		}

		const textModel = editorWidget.getModel();
		if (!textModel) { return; }

		const header = textModel.getValueInRange(new Range(1, 1, 5, 1), EndOfLinePreference.LF)
			.split(lineDelimiter)
			.filter(line => line.indexOf('# ') === 0);

		const contentPattern = searchHeaderToContentPattern(header);

		const content: IPatternInfo = {
			pattern: contentPattern.pattern,
			isRegExp: contentPattern.flags.regex,
			isCaseSensitive: contentPattern.flags.caseSensitive,
			isWordMatch: contentPattern.flags.wholeWord
		};

		contextLines = contextLines ?? contentPattern.context ?? 0;

		const options: ITextQueryBuilderOptions = {
			_reason: 'searchEditor',
			extraFileResources: instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
			maxResults: 10000,
			disregardIgnoreFiles: contentPattern.flags.ignoreExcludes,
			disregardExcludeSettings: contentPattern.flags.ignoreExcludes,
			excludePattern: contentPattern.excludes,
			includePattern: contentPattern.includes,
			previewOptions: {
				matchLines: 1,
				charsPerLine: 1000
			},
			afterContext: contextLines,
			beforeContext: contextLines,
			isSmartCase: configurationService.getValue<ISearchConfigurationProperties>('search').smartCase,
			expandPatterns: true
		};

		const folderResources = contextService.getWorkspace().folders;

		let query: ITextQuery;
		try {
			const queryBuilder = instantiationService.createInstance(QueryBuilder);
			query = queryBuilder.text(content, folderResources.map(folder => folder.uri), options);
		} catch (err) {
			return;
		}

		const searchModel = instantiationService.createInstance(SearchModel);
		await searchModel.search(query);

		const labelFormatter = (uri: URI): string => labelService.getUriLabel(uri, { relative: true });
		const results = serializeSearchResultForEditor(searchModel.searchResult, contentPattern.includes, contentPattern.excludes, contextLines, labelFormatter, false);

		textModel.setValue(results.text.join(lineDelimiter));
		textModel.deltaDecorations([], results.matchRanges.map(range => ({ range, options: { className: 'searchEditorFindMatch', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
	};

export const openNewSearchEditor =
	async (editorService: IEditorService, instantiationService: IInstantiationService) => {
		await editorService.openEditor(instantiationService.createInstance(SearchEditorInput, undefined), { pinned: true });
	};

export const createEditorFromSearchResult =
	async (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, labelService: ILabelService, editorService: IEditorService, instantiationService: IInstantiationService) => {
		if (!searchResult.query) {
			console.error('Expected searchResult.query to be defined. Got', searchResult);
			return;
		}

		const searchTerm = searchResult.query.contentPattern.pattern.replace(/[^\w-_. ]/g, '') || 'Search';

		const labelFormatter = (uri: URI): string => labelService.getUriLabel(uri, { relative: true });

		const results = serializeSearchResultForEditor(searchResult, rawIncludePattern, rawExcludePattern, 0, labelFormatter, false);
		const contents = results.text.join(lineDelimiter);
		let possible = {
			contents,
			mode: 'search-result',
			resource: URI.from({ scheme: network.Schemas.untitled, path: searchTerm })
		};

		let id = 0;

		let existing = editorService.getOpened(possible);
		while (existing) {
			if (existing instanceof UntitledTextEditorInput) {
				const model = await existing.resolve();
				const existingContents = model.textEditorModel.getValue(EndOfLinePreference.LF);
				if (existingContents === contents) {
					break;
				}
			}
			possible.resource = possible.resource.with({ path: searchTerm + '-' + ++id });
			existing = editorService.getOpened(possible);
		}

		const editor = await editorService.openEditor(
			instantiationService.createInstance(
				SearchEditorInput,
				{
					query: searchResult.query.contentPattern.pattern,
					regexp: !!searchResult.query.contentPattern.isRegExp,
					caseSensitive: !!searchResult.query.contentPattern.isCaseSensitive,
					wholeWord: !!searchResult.query.contentPattern.isWordMatch,
					includes: rawIncludePattern,
					excludes: rawExcludePattern,
					contextLines: 0,
					useIgnores: !searchResult.query.userDisabledExcludesAndIgnoreFiles,
					showIncludesExcludes: !!(rawExcludePattern || rawExcludePattern || searchResult.query.userDisabledExcludesAndIgnoreFiles)
				}),
			{ pinned: true }) as SearchEditor;

		const model = assertIsDefined(editor.getModel());
		model.setValue(contents);
		model.deltaDecorations([], results.matchRanges.map(range => ({ range, options: { className: 'searchEditorFindMatch', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
	};

registerThemingParticipant((theme, collector) => {
	collector.addRule(`.monaco-editor .searchEditorFindMatch { background-color: ${theme.getColor(searchEditorFindMatch)}; }`);

	const findMatchHighlightBorder = theme.getColor(searchEditorFindMatchBorder);
	if (findMatchHighlightBorder) {
		collector.addRule(`.monaco-editor .searchEditorFindMatch { border: 1px ${theme.type === 'hc' ? 'dotted' : 'solid'} ${findMatchHighlightBorder}; box-sizing: border-box; }`);
	}
});
