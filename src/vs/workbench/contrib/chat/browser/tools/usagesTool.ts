/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { relativePath } from '../../../../../base/common/resources.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Location, LocationLink } from '../../../../../editor/common/languages.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { getDefinitionsAtPosition, getImplementationsAtPosition, getReferencesAtPosition } from '../../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ISearchService, QueryType, resultIsMatch } from '../../../../services/search/common/search.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress, } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { errorResult, findLineNumber, findSymbolColumn, ISymbolToolInput, resolveToolUri } from './toolHelpers.js';

export const UsagesToolId = 'vscode_listCodeUsages';

const BaseModelDescription = `Find all usages (references, definitions, and implementations) of a code symbol across the workspace. This tool locates where a symbol is referenced, defined, or implemented.

Input:
- "symbol": The exact name of the symbol to search for (function, class, method, variable, type, etc.).
- "uri": A full URI (e.g. "file:///path/to/file.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "filePath": A workspace-relative file path (e.g. "src/utils/helpers.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "lineContent": A substring of the line of code where the symbol appears. This is used to locate the exact position in the file. Must be the actual text from the file - do NOT fabricate it.

IMPORTANT: The file and line do NOT need to be the definition of the symbol. Any occurrence works - a usage, an import, a call site, etc. You can pick whichever occurrence is most convenient.

If the tool returns an error, retry with corrected input - ensure the file path is correct, the line content matches the actual file content, and the symbol name appears in that line.`;

export class UsagesTool extends Disposable implements IToolImpl {

	private readonly _onDidUpdateToolData = this._store.add(new Emitter<void>());
	readonly onDidUpdateToolData = this._onDidUpdateToolData.event;

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IModelService private readonly _modelService: IModelService,
		@ISearchService private readonly _searchService: ISearchService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._store.add(Event.debounce(
			this._languageFeaturesService.referenceProvider.onDidChange,
			() => { },
			2000
		)((() => this._onDidUpdateToolData.fire())));
	}

	getToolData(): IToolData {
		const languageIds = this._languageFeaturesService.referenceProvider.registeredLanguageIds;

		let modelDescription = BaseModelDescription;
		if (languageIds.has('*')) {
			modelDescription += '\n\nSupported for all languages.';
		} else if (languageIds.size > 0) {
			const sorted = [...languageIds].sort();
			modelDescription += `\n\nCurrently supported for: ${sorted.join(', ')}.`;
		} else {
			modelDescription += '\n\nNo languages currently have reference providers registered.';
		}

		return {
			id: UsagesToolId,
			toolReferenceName: 'usages',
			canBeReferencedInPrompt: false,
			icon: ThemeIcon.fromId(Codicon.references.id),
			displayName: localize('tool.usages.displayName', 'List Code Usages'),
			userDescription: localize('tool.usages.userDescription', 'Find references, definitions, and implementations of a symbol'),
			modelDescription,
			source: ToolDataSource.Internal,
			when: ContextKeyExpr.has('config.chat.tools.usagesTool.enabled'),
			inputSchema: {
				type: 'object',
				properties: {
					symbol: {
						type: 'string',
						description: 'The exact name of the symbol (function, class, method, variable, type, etc.) to find usages of.'
					},
					uri: {
						type: 'string',
						description: 'A full URI of a file where the symbol appears (e.g. "file:///path/to/file.ts"). Provide either "uri" or "filePath".'
					},
					filePath: {
						type: 'string',
						description: 'A workspace-relative file path where the symbol appears (e.g. "src/utils/helpers.ts"). Provide either "uri" or "filePath".'
					},
					lineContent: {
						type: 'string',
						description: 'A substring of the line of code where the symbol appears. Used to locate the exact position. Must be actual text from the file.'
					}
				},
				required: ['symbol', 'lineContent']
			}
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const input = context.parameters as ISymbolToolInput;
		return {
			invocationMessage: localize('tool.usages.invocationMessage', 'Analyzing usages of `{0}`', input.symbol),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const input = invocation.parameters as ISymbolToolInput;

		// --- resolve URI ---
		const uri = resolveToolUri(input, this._workspaceContextService);
		if (!uri) {
			return errorResult('Provide either "uri" (a full URI) or "filePath" (a workspace-relative path) to identify the file.');
		}

		// --- open text model ---
		const ref = await this._textModelService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;

			if (!this._languageFeaturesService.referenceProvider.has(model)) {
				return errorResult(`No reference provider available for this file's language. The usages tool may not support this language.`);
			}

			// --- find line containing lineContent ---
			const lineNumber = findLineNumber(model, input.lineContent);
			if (lineNumber === undefined) {
				return errorResult(`Could not find line content "${input.lineContent}" in ${uri.toString()}. Provide the exact text from the line where the symbol appears.`);
			}

			// --- find symbol in that line ---
			const lineText = model.getLineContent(lineNumber);
			const column = findSymbolColumn(lineText, input.symbol);
			if (column === undefined) {
				return errorResult(`Could not find symbol "${input.symbol}" in the matched line. Ensure the symbol name is correct and appears in the provided line content.`);
			}

			const position = new Position(lineNumber, column);

			// --- query references, definitions, implementations in parallel ---
			const [definitions, references, implementations] = await Promise.all([
				getDefinitionsAtPosition(this._languageFeaturesService.definitionProvider, model, position, false, token),
				getReferencesAtPosition(this._languageFeaturesService.referenceProvider, model, position, false, false, token),
				getImplementationsAtPosition(this._languageFeaturesService.implementationProvider, model, position, false, token),
			]);

			if (references.length === 0) {
				const result = createToolSimpleTextResult(`No usages found for \`${input.symbol}\`.`);
				result.toolResultMessage = new MarkdownString(localize('tool.usages.noResults', 'Analyzed usages of `{0}`, no results', input.symbol));
				return result;
			}

			// --- classify and format results with previews ---
			const previews = await this._getLinePreviews(input.symbol, references, token);

			const lines: string[] = [];
			lines.push(`${references.length} usages of \`${input.symbol}\`:\n`);

			for (let i = 0; i < references.length; i++) {
				const ref = references[i];
				const kind = this._classifyReference(ref, definitions, implementations);
				const startLine = Range.lift(ref.range).startLineNumber;
				const preview = previews[i];
				if (preview) {
					lines.push(`<usage type="${kind}" uri="${ref.uri.toString()}" line="${startLine}">`);
					lines.push(`\t${preview}`);
					lines.push(`</usage>`);
				} else {
					lines.push(`<usage type="${kind}" uri="${ref.uri.toString()}" line="${startLine}" />`);
				}
			}

			const text = lines.join('\n');
			const result = createToolSimpleTextResult(text);

			result.toolResultMessage = references.length === 1
				? new MarkdownString(localize('tool.usages.oneResult', 'Analyzed usages of `{0}`, 1 result', input.symbol))
				: new MarkdownString(localize('tool.usages.results', 'Analyzed usages of `{0}`, {1} results', input.symbol, references.length));

			result.toolResultDetails = references.map((r): Location => ({ uri: r.uri, range: r.range }));

			return result;
		} finally {
			ref.dispose();
		}
	}

	private async _getLinePreviews(symbol: string, references: LocationLink[], token: CancellationToken): Promise<(string | undefined)[]> {
		const previews: (string | undefined)[] = new Array(references.length);

		// Build a lookup: (uriString, lineNumber) → index in references array
		const lookup = new Map<string, number>();
		const needSearch = new ResourceSet();

		for (let i = 0; i < references.length; i++) {
			const ref = references[i];
			const lineNumber = Range.lift(ref.range).startLineNumber;

			// Try already-open models first
			const existingModel = this._modelService.getModel(ref.uri);
			if (existingModel) {
				previews[i] = existingModel.getLineContent(lineNumber).trim();
			} else {
				lookup.set(`${ref.uri.toString()}:${lineNumber}`, i);
				needSearch.add(ref.uri);
			}
		}

		if (needSearch.size === 0 || token.isCancellationRequested) {
			return previews;
		}

		// Use ISearchService to search for the symbol name, restricted to the
		// referenced files. This is backed by ripgrep for file:// URIs.
		try {
			// Build includePattern from workspace-relative paths
			const folders = this._workspaceContextService.getWorkspace().folders;
			const relativePaths: string[] = [];
			for (const uri of needSearch) {
				const folder = this._workspaceContextService.getWorkspaceFolder(uri);
				if (folder) {
					const rel = relativePath(folder.uri, uri);
					if (rel) {
						relativePaths.push(rel);
					}
				}
			}

			if (relativePaths.length > 0) {
				const includePattern: Record<string, true> = {};
				if (relativePaths.length === 1) {
					includePattern[relativePaths[0]] = true;
				} else {
					includePattern[`{${relativePaths.join(',')}}`] = true;
				}

				const searchResult = await this._searchService.textSearch(
					{
						type: QueryType.Text,
						contentPattern: { pattern: escapeRegExpCharacters(symbol), isRegExp: true, isWordMatch: true },
						folderQueries: folders.map(f => ({ folder: f.uri })),
						includePattern,
					},
					token,
				);

				for (const fileMatch of searchResult.results) {
					if (!fileMatch.results) {
						continue;
					}
					for (const textMatch of fileMatch.results) {
						if (!resultIsMatch(textMatch)) {
							continue;
						}
						for (const range of textMatch.rangeLocations) {
							const lineNumber = range.source.startLineNumber + 1; // 0-based → 1-based
							const key = `${fileMatch.resource.toString()}:${lineNumber}`;
							const idx = lookup.get(key);
							if (idx !== undefined) {
								previews[idx] = textMatch.previewText.trim();
								lookup.delete(key);
							}
						}
					}
				}
			}
		} catch {
			// search might fail, leave remaining previews as undefined
		}

		return previews;
	}

	private _classifyReference(ref: LocationLink, definitions: LocationLink[], implementations: LocationLink[]): string {
		if (definitions.some(d => this._overlaps(ref, d))) {
			return 'definition';
		}
		if (implementations.some(d => this._overlaps(ref, d))) {
			return 'implementation';
		}
		return 'reference';
	}

	private _overlaps(a: LocationLink, b: LocationLink): boolean {
		if (a.uri.toString() !== b.uri.toString()) {
			return false;
		}
		return Range.areIntersectingOrTouching(a.range, b.range);
	}

}

export class UsagesToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.usagesTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const usagesTool = this._store.add(instantiationService.createInstance(UsagesTool));

		let registration: IDisposable | undefined;
		const registerUsagesTool = () => {
			registration?.dispose();
			toolsService.flushToolUpdates();
			const toolData = usagesTool.getToolData();
			registration = toolsService.registerTool(toolData, usagesTool);
		};
		registerUsagesTool();
		this._store.add(usagesTool.onDidUpdateToolData(registerUsagesTool));
		this._store.add({ dispose: () => registration?.dispose() });
	}
}
