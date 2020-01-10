/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { coalesce, flatten } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as network from 'vs/base/common/network';
import { repeat } from 'vs/base/common/strings';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import type { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLinePreference, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { searchEditorFindMatch, searchEditorFindMatchBorder } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { UntitledTextEditorInput } from 'vs/workbench/common/editor/untitledTextEditorInput';
import { ExcludePatternInputWidget, PatternInputWidget } from 'vs/workbench/contrib/search/browser/patternInputWidget';
import { SearchWidget } from 'vs/workbench/contrib/search/browser/searchWidget';
import { ITextQueryBuilderOptions, QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { FileMatch, Match, searchMatchComparer, SearchModel, SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPatternInfo, ISearchConfigurationProperties, ITextQuery } from 'vs/workbench/services/search/common/search';
import { Delayer } from 'vs/base/common/async';

const RESULT_LINE_REGEX = /^(\s+)(\d+)(:| )(\s+)(.*)$/;

type SearchConfiguration = {
	query: string,
	includes: string,
	excludes: string,
	contextLines: number,
	wholeWord: boolean,
	caseSensitive: boolean,
	regexp: boolean,
	useIgnores: boolean
};

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
			this.config = { query: '', includes: '', excludes: '', contextLines: 0, wholeWord: false, caseSensitive: false, regexp: false, useIgnores: true };
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
		return URI.from({ scheme: 'code-search', fragment: `${this.instanceNumber}` });
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

export class SearchEditor extends BaseEditor {
	static readonly ID: string = 'workbench.editor.searchEditor';

	private queryEditorWidget!: SearchWidget;
	private searchResultEditor!: CodeEditorWidget;
	private queryEditorContainer!: HTMLElement;
	private dimension?: DOM.Dimension;
	private inputPatternIncludes!: PatternInputWidget;
	private inputPatternExcludes!: ExcludePatternInputWidget;
	private includesExcludesContainer!: HTMLElement;
	private toggleQueryDetailsButton!: HTMLElement;

	private runSearchDelayer = new Delayer(300);
	private pauseSearching: boolean = false;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(SearchEditor.ID, telemetryService, themeService, storageService);
	}

	createEditor(parent: HTMLElement) {
		DOM.addClass(parent, 'search-editor');

		// Query
		this.queryEditorContainer = DOM.append(parent, DOM.$('.query-container'));

		this.queryEditorWidget = this._register(this.instantiationService.createInstance(SearchWidget, this.queryEditorContainer, { _hideReplaceToggle: true, showContextToggle: true }));
		this._register(this.queryEditorWidget.onReplaceToggled(() => this.reLayout()));
		this._register(this.queryEditorWidget.onDidHeightChange(() => this.reLayout()));
		this.queryEditorWidget.onSearchSubmit(() => this.runSearch());
		this.queryEditorWidget.searchInput.onDidOptionChange(() => this.runSearch());
		this.queryEditorWidget.onDidToggleContext(() => this.runSearch());

		// Includes/Excludes Dropdown
		this.includesExcludesContainer = DOM.append(this.queryEditorContainer, DOM.$('.includes-excludes'));
		// // Toggle query details button
		this.toggleQueryDetailsButton = DOM.append(this.includesExcludesContainer, DOM.$('.expand.codicon.codicon-ellipsis', { tabindex: 0, role: 'button', title: localize('moreSearch', "Toggle Search Details") }));
		this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.CLICK, e => {
			DOM.EventHelper.stop(e);
			this.toggleQueryDetails();
		}));
		this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(e);
				this.toggleQueryDetails();
			}
		}));
		this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.equals(KeyMod.Shift | KeyCode.Tab)) {
				if (this.queryEditorWidget.isReplaceActive()) {
					this.queryEditorWidget.focusReplaceAllAction();
				} else {
					this.queryEditorWidget.isReplaceShown() ? this.queryEditorWidget.replaceInput.focusOnPreserve() : this.queryEditorWidget.focusRegexAction();
				}
				DOM.EventHelper.stop(e);
			}
		}));

		// // Includes

		const folderIncludesList = DOM.append(this.includesExcludesContainer, DOM.$('.file-types.includes'));
		const filesToIncludeTitle = localize('searchScope.includes', "files to include");
		DOM.append(folderIncludesList, DOM.$('h4', undefined, filesToIncludeTitle));

		this.inputPatternIncludes = this._register(this.instantiationService.createInstance(PatternInputWidget, folderIncludesList, this.contextViewService, {
			ariaLabel: localize('label.includes', 'Search Include Patterns'),
		}));
		this.inputPatternIncludes.onSubmit(_triggeredOnType => this.runSearch());

		// // Excludes
		const excludesList = DOM.append(this.includesExcludesContainer, DOM.$('.file-types.excludes'));
		const excludesTitle = localize('searchScope.excludes', "files to exclude");
		DOM.append(excludesList, DOM.$('h4', undefined, excludesTitle));

		this.inputPatternExcludes = this._register(this.instantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
			ariaLabel: localize('label.excludes', 'Search Exclude Patterns'),
		}));

		this.inputPatternExcludes.onSubmit(_triggeredOnType => this.runSearch());
		this.inputPatternExcludes.onChangeIgnoreBox(() => this.runSearch());

		// Editor
		const searchResultContainer = DOM.append(parent, DOM.$('.search-results'));
		const configuration: IEditorOptions = this.configurationService.getValue('editor', { overrideIdentifier: 'search-result' });
		const options: ICodeEditorWidgetOptions = {};
		this.searchResultEditor = this._register(this.instantiationService.createInstance(CodeEditorWidget, searchResultContainer, configuration, options));
		this.searchResultEditor.onMouseUp(e => {

			if (e.event.detail === 2) {
				const behaviour = this.configurationService.getValue<ISearchConfigurationProperties>('search').searchEditorPreview.doubleClickBehaviour;
				const position = e.target.position;
				if (position && behaviour !== 'selectWord') {
					const line = this.searchResultEditor.getModel()?.getLineContent(position.lineNumber) ?? '';
					if (line.match(RESULT_LINE_REGEX)) {
						this.searchResultEditor.setSelection(Range.fromPositions(position));
						this.commandService.executeCommand(behaviour === 'goToLocation' ? 'editor.action.goToDeclaration' : 'editor.action.openDeclarationToTheSide');
					}
				}
			}
		});
	}

	private async runSearch() {
		if (!this.pauseSearching) {
			this.runSearchDelayer.trigger(() => this.doRunSearch());
		}
	}

	private async doRunSearch() {
		const startInput = this.input;

		const config: SearchConfiguration = {
			caseSensitive: this.queryEditorWidget.searchInput.getCaseSensitive(),
			contextLines: this.queryEditorWidget.contextLines(),
			excludes: this.inputPatternExcludes.getValue(),
			includes: this.inputPatternIncludes.getValue(),
			query: this.queryEditorWidget.searchInput.getValue(),
			regexp: this.queryEditorWidget.searchInput.getRegex(),
			wholeWord: this.queryEditorWidget.searchInput.getWholeWords(),
			useIgnores: this.inputPatternExcludes.useExcludesAndIgnoreFiles()
		};

		const content: IPatternInfo = {
			pattern: config.query,
			isRegExp: config.regexp,
			isCaseSensitive: config.caseSensitive,
			isWordMatch: config.wholeWord,
		};

		const options: ITextQueryBuilderOptions = {
			_reason: 'searchEditor',
			extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
			maxResults: 10000,
			disregardIgnoreFiles: !config.useIgnores,
			disregardExcludeSettings: !config.useIgnores,
			excludePattern: config.excludes,
			includePattern: config.includes,
			previewOptions: {
				matchLines: 1,
				charsPerLine: 1000
			},
			afterContext: config.contextLines,
			beforeContext: config.contextLines,
			isSmartCase: this.configurationService.getValue<ISearchConfigurationProperties>('search').smartCase,
			expandPatterns: true
		};

		const folderResources = this.contextService.getWorkspace().folders;
		let query: ITextQuery;
		try {
			const queryBuilder = this.instantiationService.createInstance(QueryBuilder);
			query = queryBuilder.text(content, folderResources.map(folder => folder.uri), options);
		}
		catch (err) {
			return;
		}
		const searchModel = this.instantiationService.createInstance(SearchModel);
		await searchModel.search(query);
		if (this.input !== startInput) {
			searchModel.dispose();
			return;
		}

		(assertIsDefined(this._input) as SearchEditorInput).setConfig(config);

		const labelFormatter = (uri: URI): string => this.labelService.getUriLabel(uri, { relative: true });
		const results = serializeSearchResultForEditor(searchModel.searchResult, config.includes, config.excludes, config.contextLines, labelFormatter, false);
		const textModel = assertIsDefined(this.searchResultEditor.getModel());
		textModel.setValue(results.text.join(lineDelimiter));
		textModel.deltaDecorations([], results.matchRanges.map(range => ({ range, options: { className: 'searchEditorFindMatch', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));

		searchModel.dispose();
	}

	layout(dimension: DOM.Dimension) {
		this.dimension = dimension;
		this.reLayout();
	}

	focusInput() {
		this.queryEditorWidget.focus();
	}

	private reLayout() {
		if (this.dimension) {
			this.queryEditorWidget.setWidth(this.dimension.width - 28 /* container margin */);
			this.searchResultEditor.layout({ height: this.dimension.height - DOM.getTotalHeight(this.queryEditorContainer), width: this.dimension.width });
			this.inputPatternExcludes.setWidth(this.dimension.width - 28 /* container margin */);
			this.inputPatternIncludes.setWidth(this.dimension.width - 28 /* container margin */);
		}
	}

	async setInput(newInput: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		if (!(newInput instanceof SearchEditorInput)) { return; }
		this.pauseSearching = true;
		// TODO: Manage model lifecycle in SearchEditorInput
		const model = this.modelService.getModel(newInput.getResource());

		this.searchResultEditor.setModel(model);
		this.queryEditorWidget.setValue(newInput.config.query, true);
		this.queryEditorWidget.searchInput.setCaseSensitive(newInput.config.caseSensitive);
		this.queryEditorWidget.searchInput.setRegex(newInput.config.regexp);
		this.queryEditorWidget.searchInput.setWholeWords(newInput.config.wholeWord);
		this.queryEditorWidget.setContextLines(newInput.config.contextLines);
		this.inputPatternExcludes.setValue(newInput.config.excludes);
		this.inputPatternIncludes.setValue(newInput.config.includes);
		this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(newInput.config.useIgnores);

		this.focusInput();
		await super.setInput(newInput, options, token);
		this.pauseSearching = false;
	}

	toggleQueryDetails(): void {
		const cls = 'expanded';
		const shouldShow = !DOM.hasClass(this.includesExcludesContainer, cls);

		if (shouldShow) {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'true');
			DOM.addClass(this.includesExcludesContainer, cls);
		} else {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'false');
			DOM.removeClass(this.includesExcludesContainer, cls);
		}

		this.reLayout();
	}

	getModel() {
		return this.searchResultEditor.getModel();
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

const serializeSearchResultForEditor = (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, contextLines: number, labelFormatter: (x: URI) => string, includeHeader: boolean): SearchResultSerialization => {
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
