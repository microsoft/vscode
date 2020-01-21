/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, flatten } from 'vs/base/common/arrays';
import * as network from 'vs/base/common/network';
import { repeat, endsWith } from 'vs/base/common/strings';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import { isDiffEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLinePreference, TrackedRangeStickiness, ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { searchEditorFindMatch, searchEditorFindMatchBorder } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { UntitledTextEditorInput } from 'vs/workbench/common/editor/untitledTextEditorInput';
import { FileMatch, Match, searchMatchComparer, SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextQuery } from 'vs/workbench/services/search/common/search';
import { IEditorInputFactory, GroupIdentifier, EditorInput, SaveContext } from 'vs/workbench/common/editor';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { SearchEditor } from 'vs/workbench/contrib/search/browser/searchEditor';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ITextFileSaveOptions, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import type { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { dirname, joinPath, isEqual } from 'vs/base/common/resources';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { basename } from 'vs/base/common/path';



export type SearchConfiguration = {
	query: string,
	includes: string,
	excludes: string
	contextLines: number,
	wholeWord: boolean,
	caseSensitive: boolean,
	regexp: boolean,
	useIgnores: boolean,
	showIncludesExcludes: boolean,
};

export class SearchEditorContribution implements IWorkbenchContribution {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IModelService protected readonly modelService: IModelService,
	) {

		this.editorService.overrideOpenEditor((editor, options, group) => {
			const resource = editor.getResource();
			if (!resource ||
				!(endsWith(resource.path, '.code-search') || resource.scheme === 'search-editor') ||
				!(editor instanceof FileEditorInput || (resource.scheme === 'search-editor'))) {
				return undefined;
			}

			if (group.isOpened(editor)) {
				return undefined;
			}

			return {
				override: (async () => {
					const contents = resource.scheme === 'search-editor' ? this.modelService.getModel(resource)?.getValue() ?? '' : (await this.textFileService.read(resource)).value;
					const header = searchHeaderToContentPattern(contents.split('\n').slice(0, 5));

					const input = instantiationService.createInstance(
						SearchEditorInput,
						{
							query: header.pattern,
							regexp: header.flags.regex,
							caseSensitive: header.flags.caseSensitive,
							wholeWord: header.flags.wholeWord,
							includes: header.includes,
							excludes: header.excludes,
							contextLines: header.context ?? 0,
							useIgnores: !header.flags.ignoreExcludes,
							showIncludesExcludes: !!(header.includes || header.excludes || header.flags.ignoreExcludes)
						}, contents, resource);

					return editorService.openEditor(input, { ...options, pinned: resource.scheme === 'search-editor', ignoreOverrides: true }, group);
				})()
			};
		});
	}
}

export class SearchEditorInputFactory implements IEditorInputFactory {

	canSerialize() { return true; }

	serialize(input: SearchEditorInput) {
		let resource = undefined;
		if (input.resource.path) {
			resource = input.resource.toString();
		}

		return JSON.stringify({ ...input.config, resource });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SearchEditorInput | undefined {
		const { resource, ...config } = JSON.parse(serializedEditorInput);
		return instantiationService.createInstance(SearchEditorInput, config, undefined, resource && URI.parse(resource));
	}
}

let searchEditorInputInstances = 0;
export class SearchEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.editorinputs.searchEditorInput';

	private _config: SearchConfiguration;
	public get config(): Readonly<SearchConfiguration> {
		return this._config;
	}

	private model: ITextModel;
	public readonly resource: URI;

	private dirty: boolean = false;

	constructor(
		config: Partial<SearchConfiguration> | undefined,
		initialContents: string | undefined,
		resource: URI | undefined,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IEditorService protected readonly editorService: IEditorService,
		@IEditorGroupsService protected readonly editorGroupService: IEditorGroupsService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.resource = resource ?? URI.from({ scheme: 'search-editor', fragment: `${searchEditorInputInstances++}` });
		this._config = { ...{ query: '', includes: '', excludes: '', contextLines: 0, wholeWord: false, caseSensitive: false, regexp: false, useIgnores: true, showIncludesExcludes: false }, ...config };

		const searchResultMode = this.modeService.create('search-result');

		this.model = this.modelService.getModel(this.resource) ?? this.modelService.createModel(initialContents ?? '', searchResultMode, this.resource);
	}

	async save(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<boolean> {
		if (this.resource.scheme === 'search-editor') {
			const path = await this.promptForPath(this.resource, this.suggestFileName(), options?.availableFileSystems);
			if (path) {
				if (await this.textFileService.saveAs(this.resource, path, options)) {
					this.setDirty(false);
					if (options?.context !== SaveContext.EDITOR_CLOSE && !isEqual(path, this.resource)) {
						const replacement = this.instantiationService.createInstance(SearchEditorInput, this.config, undefined, path);
						await this.editorService.replaceEditors([{ editor: this, replacement, options: { pinned: true } }], group);
						return true;
					} else if (options?.context === SaveContext.EDITOR_CLOSE) {
						return true;
					}
				}
			}
			return false;
		} else {
			this.setDirty(false);
			return !!this.textFileService.write(this.resource, this.model.getValue(), options);
		}
	}

	// Brining this over from textFileService because it only suggests for untitled scheme.
	// In the future I may just use the untitled scheme. I dont get particular benefit from using search-editor...
	private async promptForPath(resource: URI, defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> {
		// Help user to find a name for the file by opening it first
		await this.editorService.openEditor({ resource, options: { revealIfOpened: true, preserveFocus: true } });
		return this.fileDialogService.pickFileToSave(defaultUri, availableFileSystems);
	}

	getTypeId(): string {
		return SearchEditorInput.ID;
	}

	getName(): string {
		if (this.resource.scheme === 'search-editor') {
			return this.config.query ? localize('searchTitle.withQuery', "Search: {0}", this.config.query) : localize('searchTitle', "Search");
		}
		return localize('searchTitle.withQuery', "Search: {0}", basename(this.resource.path, '.code-search'));
	}

	setConfig(config: SearchConfiguration) {
		this._config = config;
		this._onDidChangeLabel.fire();
	}

	async resolve() {
		return null;
	}

	setDirty(dirty: boolean) {
		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	isDirty() {
		return this.dirty;
	}

	dispose() {
		this.modelService.destroyModel(this.resource);
		super.dispose();
	}

	matches(other: unknown) {
		if (this === other) { return true; }

		if (other instanceof SearchEditorInput) {
			if (
				(other.resource.path && other.resource.path === this.resource.path) ||
				(other.resource.fragment && other.resource.fragment === this.resource.fragment)
			) {
				return true;
			}
		}
		return false;
	}

	// Bringing this over from textFileService because it only suggests for untitled scheme.
	// In the future I may just use the untitled scheme. I dont get particular benefit from using search-editor...
	private suggestFileName(): URI {
		const searchFileName = (this.config.query.replace(/[^\w \-_]+/g, '_') || 'Search') + '.code-search';

		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		const schemeFilter = remoteAuthority ? network.Schemas.vscodeRemote : network.Schemas.file;

		const lastActiveFile = this.historyService.getLastActiveFile(schemeFilter);
		if (lastActiveFile) {
			const lastDir = dirname(lastActiveFile);
			return joinPath(lastDir, searchFileName);
		}

		const lastActiveFolder = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);
		if (lastActiveFolder) {
			return joinPath(lastActiveFolder, searchFileName);
		}

		return URI.from({ scheme: schemeFilter, path: searchFileName });
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

	return { matchRanges: allResults.matchRanges.map(translateRangeLines(header.length)), text: header.concat(allResults.text.length ? allResults.text : ['No Results']) };
};

export const openNewSearchEditor =
	async (editorService: IEditorService, instantiationService: IInstantiationService) => {
		const activeEditor = editorService.activeTextEditorWidget;
		let activeModel: ICodeEditor | undefined;
		if (isDiffEditor(activeEditor)) {
			if (activeEditor.getOriginalEditor().hasTextFocus()) {
				activeModel = activeEditor.getOriginalEditor();
			} else {
				activeModel = activeEditor.getModifiedEditor();
			}
		} else {
			activeModel = activeEditor as ICodeEditor | undefined;
		}
		const selection = activeModel?.getSelection();
		let selected = (selection && activeModel?.getModel()?.getValueInRange(selection)) ?? '';
		await editorService.openEditor(instantiationService.createInstance(SearchEditorInput, { query: selected }, undefined, undefined), { pinned: true });
	};

export const createEditorFromSearchResult =
	async (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, labelService: ILabelService, editorService: IEditorService, instantiationService: IInstantiationService) => {
		if (!searchResult.query) {
			console.error('Expected searchResult.query to be defined. Got', searchResult);
			return;
		}

		const searchTerm = searchResult.query.contentPattern.pattern.replace(/[^\w-_. ]/g, '') || 'Search';

		const labelFormatter = (uri: URI): string => labelService.getUriLabel(uri, { relative: true });

		const results = serializeSearchResultForEditor(searchResult, rawIncludePattern, rawExcludePattern, 0, labelFormatter, true);
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

		const input = instantiationService.createInstance(
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
			}, contents, undefined);

		const editor = await editorService.openEditor(input, { pinned: true }) as SearchEditor;
		const model = assertIsDefined(editor.getModel());
		model.deltaDecorations([], results.matchRanges.map(range => ({ range, options: { className: 'searchEditorFindMatch', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
	};

registerThemingParticipant((theme, collector) => {
	collector.addRule(`.monaco-editor .searchEditorFindMatch { background-color: ${theme.getColor(searchEditorFindMatch)}; }`);

	const findMatchHighlightBorder = theme.getColor(searchEditorFindMatchBorder);
	if (findMatchHighlightBorder) {
		collector.addRule(`.monaco-editor .searchEditorFindMatch { border: 1px ${theme.type === 'hc' ? 'dotted' : 'solid'} ${findMatchHighlightBorder}; box-sizing: border-box; }`);
	}
});
