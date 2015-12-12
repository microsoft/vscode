/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {DefaultFilter} from 'vs/editor/common/modes/modesFilters';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {Range as EditorRange} from 'vs/editor/common/core/range';
import * as vscode from 'vscode';
import * as TypeConverters from 'vs/workbench/api/common/pluginHostTypeConverters';
import {Range, DocumentHighlightKind, Disposable, Diagnostic, SignatureHelp} from 'vs/workbench/api/common/pluginHostTypes';
import {IPosition, IRange, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {CancellationTokenSource} from 'vs/base/common/cancellation';
import {PluginHostModelService} from 'vs/workbench/api/common/pluginHostDocuments';
import {IMarkerService, IMarker} from 'vs/platform/markers/common/markers';
import {PluginHostCommands} from 'vs/workbench/api/common/pluginHostCommands';
import {DeclarationRegistry} from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';
import {ExtraInfoRegistry} from 'vs/editor/contrib/hover/common/hover';
import {OccurrencesRegistry} from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import {ReferenceRegistry} from 'vs/editor/contrib/referenceSearch/common/referenceSearch';
import {QuickFixRegistry} from 'vs/editor/contrib/quickFix/common/quickFix';
import {OutlineRegistry, IOutlineEntry, IOutlineSupport} from 'vs/editor/contrib/quickOpen/common/quickOpen';
import {NavigateTypesSupportRegistry, INavigateTypesSupport, ITypeBearing} from 'vs/workbench/parts/search/common/search'
import {RenameRegistry} from 'vs/editor/contrib/rename/common/rename';
import {FormatRegistry, FormatOnTypeRegistry} from 'vs/editor/contrib/format/common/format';
import {CodeLensRegistry} from 'vs/editor/contrib/codelens/common/codelens';
import {ParameterHintsRegistry} from 'vs/editor/contrib/parameterHints/common/parameterHints';
import {SuggestRegistry} from 'vs/editor/contrib/suggest/common/suggest';

function isThenable<T>(obj: any): obj is Thenable<T> {
	return obj && typeof obj['then'] === 'function';
}

function asWinJsPromise<T>(callback: (token: vscode.CancellationToken) => T | Thenable<T>): TPromise<T> {
	let source = new CancellationTokenSource();
	return new TPromise<T>((resolve, reject) => {
		let item = callback(source.token);
		if (isThenable<T>(item)) {
			item.then(resolve, reject);
		} else {
			resolve(item);
		}
	}, () => {
		source.cancel();
	});
}

// --- adapter

class OutlineAdapter implements IOutlineSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.DocumentSymbolProvider;

	constructor(documents: PluginHostModelService, provider: vscode.DocumentSymbolProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	getOutline(resource: URI): TPromise<IOutlineEntry[]> {
		let doc = this._documents.getDocument(resource);
		return asWinJsPromise(token => this._provider.provideDocumentSymbols(doc, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(TypeConverters.SymbolInformation.toOutlineEntry);
			}
		});
	}
}

class CodeLensAdapter implements modes.ICodeLensSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.CodeLensProvider;

	private _cache: { [uri: string]: vscode.CodeLens[] } = Object.create(null);

	constructor(documents: PluginHostModelService, provider: vscode.CodeLensProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	findCodeLensSymbols(resource: URI): TPromise<modes.ICodeLensSymbol[]> {
		let doc = this._documents.getDocument(resource);
		let key = resource.toString();

		delete this._cache[key];

		return asWinJsPromise(token => this._provider.provideCodeLenses(doc, token)).then(value => {
			if (!Array.isArray(value)) {
				return;
			}

			this._cache[key] = value;

			return value.map((lens, i) => {
				return <modes.ICodeLensSymbol>{
					id: String(i),
					range: TypeConverters.fromRange(lens.range),
					command: TypeConverters.Command.from(lens.command)
				}
			});
		});
	}

	resolveCodeLensSymbol(resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICodeLensSymbol> {

		let lenses = this._cache[resource.toString()];
		if (!lenses) {
			return;
		}

		let lens = lenses[Number(symbol.id)];
		if (!lens) {
			return;
		}

		let resolve: TPromise<vscode.CodeLens>;
		if (typeof this._provider.resolveCodeLens !== 'function' || lens.isResolved) {
			resolve = TPromise.as(lens);
		} else {
			resolve = asWinJsPromise(token => this._provider.resolveCodeLens(lens, token));
		}

		return resolve.then(newLens => {
			lens = newLens || lens;
			let command = lens.command;
			if (!command) {
				command = {
					title: '<<MISSING COMMAND>>',
					command: 'missing',
				}
			}

			symbol.command = TypeConverters.Command.from(command);
			return symbol;
		});
	}
}

class DeclarationAdapter implements modes.IDeclarationSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.DefinitionProvider;

	constructor(documents: PluginHostModelService, provider: vscode.DefinitionProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	canFindDeclaration() {
		return true;
	}

	findDeclaration(resource: URI, position: IPosition): TPromise<modes.IReference[]> {
		let doc = this._documents.getDocument(resource);
		let pos = TypeConverters.toPosition(position);
		return asWinJsPromise(token => this._provider.provideDefinition(doc, pos, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(DeclarationAdapter._convertLocation);
			} else if (value) {
				return DeclarationAdapter._convertLocation(value);
			}
		});
	}

	private static _convertLocation(location: vscode.Location): modes.IReference {
		if (!location) {
			return;
		}
		return <modes.IReference>{
			resource: location.uri,
			range: TypeConverters.fromRange(location.range)
		};
	}
}

class ExtraInfoAdapter implements modes.IExtraInfoSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.HoverProvider;

	constructor(documents: PluginHostModelService, provider: vscode.HoverProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	computeInfo(resource: URI, position: IPosition): TPromise<modes.IComputeExtraInfoResult> {

		let doc = this._documents.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideHover(doc, pos, token)).then(value => {
			if (!value) {
				return;
			}
			if (!value.range) {
				value.range = doc.getWordRangeAtPosition(pos);
			}
			if (!value.range) {
				value.range = new Range(pos, pos);
			}

			return TypeConverters.fromHover(value);
		});
	}
}

class OccurrencesAdapter implements modes.IOccurrencesSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.DocumentHighlightProvider;

	constructor(documents: PluginHostModelService, provider: vscode.DocumentHighlightProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	findOccurrences(resource: URI, position: IPosition): TPromise<modes.IOccurence[]> {

		let doc = this._documents.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideDocumentHighlights(doc, pos, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(OccurrencesAdapter._convertDocumentHighlight);
			}
		});
	}

	private static _convertDocumentHighlight(documentHighlight: vscode.DocumentHighlight): modes.IOccurence {
		return {
			range: TypeConverters.fromRange(documentHighlight.range),
			kind: DocumentHighlightKind[documentHighlight.kind].toString().toLowerCase()
		}
	}
}

class ReferenceAdapter implements modes.IReferenceSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.ReferenceProvider;

	constructor(documents: PluginHostModelService, provider: vscode.ReferenceProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	canFindReferences(): boolean {
		return true
	}

	findReferences(resource: URI, position: IPosition, includeDeclaration: boolean): TPromise<modes.IReference[]> {
		let doc = this._documents.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideReferences(doc, pos, { includeDeclaration }, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(ReferenceAdapter._convertLocation);
			}
		});
	}

	private static _convertLocation(location: vscode.Location): modes.IReference {
		return <modes.IReference>{
			resource: location.uri,
			range: TypeConverters.fromRange(location.range)
		};
	}
}

class QuickFixAdapter implements modes.IQuickFixSupport {

	private _documents: PluginHostModelService;
	private _commands: PluginHostCommands;
	private _provider: vscode.CodeActionProvider;

	constructor(documents: PluginHostModelService, commands: PluginHostCommands, provider: vscode.CodeActionProvider) {
		this._documents = documents;
		this._commands = commands;
		this._provider = provider;
	}

	getQuickFixes(resource: URI, range: IRange, marker?: IMarker[]): TPromise<modes.IQuickFix[]> {

		const doc = this._documents.getDocument(resource);
		const ran = TypeConverters.toRange(range);
		const diagnostics = marker.map(marker => {
			const diag = new Diagnostic(TypeConverters.toRange(marker), marker.message);
			diag.code = marker.code;
			diag.severity = TypeConverters.toDiagnosticSeverty(marker.severity);
			return diag;
		});

		return asWinJsPromise(token => this._provider.provideCodeActions(doc, ran, { diagnostics: <any>diagnostics }, token)).then(commands => {
			if (!Array.isArray(commands)) {
				return;
			}
			return commands.map((command, i) => {
				return <modes.IQuickFix> {
					command: TypeConverters.Command.from(command),
					score: i
				};
			});
		});
	}

	runQuickFixAction(resource: URI, range: IRange, quickFix: modes.IQuickFix): any {
		let {command} = quickFix;
		return this._commands.executeCommand(command.id, ...command.arguments);
	}
}

class DocumentFormattingAdapter implements modes.IFormattingSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.DocumentFormattingEditProvider;

	constructor(documents: PluginHostModelService, provider: vscode.DocumentFormattingEditProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	formatDocument(resource: URI, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {

		let doc = this._documents.getDocument(resource);

		return asWinJsPromise(token => this._provider.provideDocumentFormattingEdits(doc, <any>options, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(TypeConverters.TextEdit.from);
			}
		});
	}
}

class RangeFormattingAdapter implements modes.IFormattingSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.DocumentRangeFormattingEditProvider;

	constructor(documents: PluginHostModelService, provider: vscode.DocumentRangeFormattingEditProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	formatRange(resource: URI, range: IRange, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {

		let doc = this._documents.getDocument(resource);
		let ran = TypeConverters.toRange(range);

		return asWinJsPromise(token => this._provider.provideDocumentRangeFormattingEdits(doc, ran, <any>options, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(TypeConverters.TextEdit.from);
			}
		});
	}
}

class OnTypeFormattingAdapter implements modes.IFormattingSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.OnTypeFormattingEditProvider;

	constructor(documents: PluginHostModelService, provider: vscode.OnTypeFormattingEditProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	autoFormatTriggerCharacters: string[] = []; // not here

	formatAfterKeystroke(resource: URI, position: IPosition, ch: string, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {

		let doc = this._documents.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideOnTypeFormattingEdits(doc, pos, ch, <any> options, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(TypeConverters.TextEdit.from);
			}
		});
	}
}

class NavigateTypeAdapter implements INavigateTypesSupport {

	private _provider: vscode.WorkspaceSymbolProvider;

	constructor(provider: vscode.WorkspaceSymbolProvider) {
		this._provider = provider;
	}

	getNavigateToItems(search: string): TPromise<ITypeBearing[]> {
		return asWinJsPromise(token => this._provider.provideWorkspaceSymbols(search, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(TypeConverters.fromSymbolInformation);
			}
		});
	}
}

class RenameAdapter implements modes.IRenameSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.RenameProvider;

	constructor(documents: PluginHostModelService, provider: vscode.RenameProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	rename(resource: URI, position: IPosition, newName: string): TPromise<modes.IRenameResult> {

		let doc = this._documents.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideRenameEdits(doc, pos, newName, token)).then(value => {

			if (!value) {
				return;
			}

			let result = <modes.IRenameResult>{
				currentName: undefined,
				edits: []
			};

			for (let entry of value.entries()) {
				let [uri, textEdits] = entry;
				for (let textEdit of textEdits) {
					result.edits.push({
						resource: <URI>uri,
						newText: textEdit.newText,
						range: TypeConverters.fromRange(textEdit.range)
					});
				}
			}
			return result;
		}, err => {
			if (typeof err === 'string') {
				return <modes.IRenameResult>{
					currentName: undefined,
					edits: undefined,
					rejectReason: err
				};
			}
			return TPromise.wrapError(err);
		});
	}
}

interface ISuggestion2 extends modes.ISuggestion {
	id: string;
}

class SuggestAdapter implements modes.ISuggestSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.CompletionItemProvider;
	private _cache: { [key: string]: vscode.CompletionItem[] } = Object.create(null);

	constructor(documents: PluginHostModelService, provider: vscode.CompletionItemProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	suggest(resource: URI, position: IPosition): TPromise<modes.ISuggestResult[]> {

		const doc = this._documents.getDocument(resource);
		const pos = TypeConverters.toPosition(position);
		const ran = doc.getWordRangeAtPosition(pos);

		const key = resource.toString();
		delete this._cache[key];

		return asWinJsPromise(token => this._provider.provideCompletionItems(doc, pos, token)).then(value => {

			let defaultSuggestions: modes.ISuggestResult = {
				suggestions: [],
				currentWord: ran ? doc.getText(new Range(ran.start, pos)) : '',
			};
			let allSuggestions: modes.ISuggestResult[] = [defaultSuggestions];


			for (let i = 0; i < value.length; i++) {
				const item = value[i];
				const suggestion = <ISuggestion2> TypeConverters.Suggest.from(item);

				if (item.textEdit) {

					let editRange = item.textEdit.range;

					// invalid text edit
					if (!editRange.isSingleLine || editRange.start.line !== pos.line) {
						console.warn('INVALID text edit, must be single line and on the same line');
						continue;
					}

					// insert the text of the edit and create a dedicated
					// suggestion-container with overwrite[Before|After]
					suggestion.codeSnippet = item.textEdit.newText;
					suggestion.overwriteBefore = pos.character - editRange.start.character,
					suggestion.overwriteAfter = editRange.end.character - pos.character

					allSuggestions.push({
						currentWord: doc.getText(<any>editRange),
						suggestions: [suggestion]
					});

				} else {
					defaultSuggestions.suggestions.push(suggestion);
				}

				// assign identifier to suggestion
				suggestion.id = String(i);
			}

			// cache for details call
			this._cache[key] = value;

			return allSuggestions;
		});
	}

	getSuggestionDetails(resource: URI, position: IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> {
		if (typeof this._provider.resolveCompletionItem !== 'function') {
			return TPromise.as(suggestion);
		}
		let items = this._cache[resource.toString()];
		if (!items) {
			return TPromise.as(suggestion);
		}
		let item = items[Number((<ISuggestion2> suggestion).id)];
		if (!item) {
			return TPromise.as(suggestion);
		}
		return asWinJsPromise(token => this._provider.resolveCompletionItem(item, token)).then(resolvedItem => {
			return TypeConverters.Suggest.from(resolvedItem || item);
		});
	}

	getFilter(): any {
		throw new Error('illegal state');
	}
	getTriggerCharacters(): string[] {
		throw new Error('illegal state');
	}
	shouldShowEmptySuggestionList(): boolean {
		throw new Error('illegal state');
	}
	shouldAutotriggerSuggest(context: modes.ILineContext, offset: number, triggeredByCharacter: string): boolean {
		throw new Error('illegal state');
	}
}

class ParameterHintsAdapter implements modes.IParameterHintsSupport {

	private _documents: PluginHostModelService;
	private _provider: vscode.SignatureHelpProvider;

	constructor(documents: PluginHostModelService, provider: vscode.SignatureHelpProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	getParameterHints(resource: URI, position: IPosition, triggerCharacter?: string): TPromise<modes.IParameterHints> {

		const doc = this._documents.getDocument(resource);
		const pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideSignatureHelp(doc, pos, token)).then(value => {
			if (value instanceof SignatureHelp) {
				return TypeConverters.SignatureHelp.from(value);
			}
		});
	}

	getParameterHintsTriggerCharacters(): string[] {
		throw new Error('illegal state');
	}

	shouldTriggerParameterHints(context: modes.ILineContext, offset: number): boolean {
		throw new Error('illegal state');
	}
}

type Adapter = OutlineAdapter | CodeLensAdapter | DeclarationAdapter | ExtraInfoAdapter
	| OccurrencesAdapter | ReferenceAdapter | QuickFixAdapter | DocumentFormattingAdapter
	| RangeFormattingAdapter | OnTypeFormattingAdapter | NavigateTypeAdapter | RenameAdapter
	| SuggestAdapter | ParameterHintsAdapter;

@Remotable.PluginHostContext('ExtHostLanguageFeatures')
export class ExtHostLanguageFeatures {

	private static _handlePool: number = 0;

	private _proxy: MainThreadLanguageFeatures;
	private _documents: PluginHostModelService;
	private _commands: PluginHostCommands;
	private _adapter: { [handle: number]: Adapter } = Object.create(null);

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadLanguageFeatures);
		this._documents = threadService.getRemotable(PluginHostModelService);
		this._commands = threadService.getRemotable(PluginHostCommands);
	}

	private _createDisposable(handle: number): Disposable {
		return new Disposable(() => {
			delete this._adapter[handle];
			this._proxy.$unregister(handle);
		});
	}

	private _nextHandle(): number {
		return ExtHostLanguageFeatures._handlePool++;
	}

	private _withAdapter<A, R>(handle: number, ctor: { new (...args: any[]): A }, callback: (adapter: A) => TPromise<R>): TPromise<R> {
		let adapter = this._adapter[handle];
		if (!(adapter instanceof ctor)) {
			return TPromise.wrapError(new Error('no adapter found'));
		}
		return callback(<any> adapter);
	}

	// --- outline

	registerDocumentSymbolProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new OutlineAdapter(this._documents, provider);
		this._proxy.$registerOutlineSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$getOutline(handle: number, resource: URI): TPromise<IOutlineEntry[]> {
		return this._withAdapter(handle, OutlineAdapter, adapter => adapter.getOutline(resource));
	}

	// --- code lens

	registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new CodeLensAdapter(this._documents, provider);
		this._proxy.$registerCodeLensSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$findCodeLensSymbols(handle: number, resource: URI): TPromise<modes.ICodeLensSymbol[]> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.findCodeLensSymbols(resource));
	}

	$resolveCodeLensSymbol(handle: number, resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICodeLensSymbol> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.resolveCodeLensSymbol(resource, symbol));
	}

	// --- declaration

	registerDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new DeclarationAdapter(this._documents, provider);
		this._proxy.$registerDeclaractionSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$findDeclaration(handle: number, resource: URI, position: IPosition): TPromise<modes.IReference[]> {
		return this._withAdapter(handle, DeclarationAdapter, adapter => adapter.findDeclaration(resource, position));
	}

	// --- extra info

	registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new ExtraInfoAdapter(this._documents, provider);
		this._proxy.$registerExtraInfoSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$computeInfo(handle: number, resource: URI, position: IPosition): TPromise<modes.IComputeExtraInfoResult> {
		return this._withAdapter(handle, ExtraInfoAdapter, adpater => adpater.computeInfo(resource, position));
	}

	// --- occurrences

	registerDocumentHighlightProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new OccurrencesAdapter(this._documents, provider);
		this._proxy.$registerOccurrencesSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$findOccurrences(handle: number, resource: URI, position: IPosition): TPromise<modes.IOccurence[]> {
		return this._withAdapter(handle, OccurrencesAdapter, adapter => adapter.findOccurrences(resource, position));
	}

	// --- references

	registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new ReferenceAdapter(this._documents, provider);
		this._proxy.$registerReferenceSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$findReferences(handle: number, resource: URI, position: IPosition, includeDeclaration: boolean): TPromise<modes.IReference[]> {
		return this._withAdapter(handle, ReferenceAdapter, adapter => adapter.findReferences(resource, position, includeDeclaration));
	}

	// --- quick fix

	registerCodeActionProvider(selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new QuickFixAdapter(this._documents, this._commands, provider);
		this._proxy.$registerQuickFixSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$getQuickFixes(handle: number, resource: URI, range: IRange, marker: IMarker[]): TPromise<modes.IQuickFix[]> {
		return this._withAdapter(handle, QuickFixAdapter, adapter => adapter.getQuickFixes(resource, range, marker));
	}

	$runQuickFixAction(handle: number, resource: URI, range: IRange, quickFix: modes.IQuickFix): any {
		return this._withAdapter(handle, QuickFixAdapter, adapter => adapter.runQuickFixAction(resource, range, quickFix));
	}

	// --- formatting

	registerDocumentFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new DocumentFormattingAdapter(this._documents, provider);
		this._proxy.$registerDocumentFormattingSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$formatDocument(handle: number, resource: URI, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {
		return this._withAdapter(handle, DocumentFormattingAdapter, adapter => adapter.formatDocument(resource, options));
	}

	registerDocumentRangeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new RangeFormattingAdapter(this._documents, provider);
		this._proxy.$registerRangeFormattingSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$formatRange(handle: number, resource: URI, range: IRange, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {
		return this._withAdapter(handle, RangeFormattingAdapter, adapter => adapter.formatRange(resource, range, options));
	}

	registerOnTypeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new OnTypeFormattingAdapter(this._documents, provider);
		this._proxy.$registerOnTypeFormattingSupport(handle, selector, triggerCharacters);
		return this._createDisposable(handle);
	}

	$formatAfterKeystroke(handle: number, resource: URI, position: IPosition, ch: string, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {
		return this._withAdapter(handle, OnTypeFormattingAdapter, adapter => adapter.formatAfterKeystroke(resource, position, ch, options));
	}

	// --- navigate types

	registerWorkspaceSymbolProvider(provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new NavigateTypeAdapter(provider);
		this._proxy.$registerNavigateTypeSupport(handle);
		return this._createDisposable(handle);
	}

	$getNavigateToItems(handle: number, search: string): TPromise<ITypeBearing[]> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.getNavigateToItems(search));
	}

	// --- rename

	registerRenameProvider(selector: vscode.DocumentSelector, provider: vscode.RenameProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new RenameAdapter(this._documents, provider);
		this._proxy.$registerRenameSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$rename(handle: number, resource: URI, position: IPosition, newName: string): TPromise<modes.IRenameResult> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.rename(resource, position, newName));
	}

	// --- suggestion

	registerCompletionItemProvider(selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new SuggestAdapter(this._documents, provider);
		this._proxy.$registerSuggestSupport(handle, selector, triggerCharacters);
		return this._createDisposable(handle);
	}

	$suggest(handle: number, resource: URI, position: IPosition): TPromise<modes.ISuggestResult[]> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.suggest(resource, position));
	}

	$getSuggestionDetails(handle: number, resource: URI, position: IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.getSuggestionDetails(resource, position, suggestion));
	}

	// --- parameter hints

	registerSignatureHelpProvider(selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new ParameterHintsAdapter(this._documents, provider);
		this._proxy.$registerParameterHintsSupport(handle, selector, triggerCharacters);
		return this._createDisposable(handle);
	}

	$getParameterHints(handle: number, resource: URI, position: IPosition, triggerCharacter?: string): TPromise<modes.IParameterHints> {
		return this._withAdapter(handle, ParameterHintsAdapter, adapter => adapter.getParameterHints(resource, position, triggerCharacter));
	}
}

@Remotable.MainContext('MainThreadLanguageFeatures')
export class MainThreadLanguageFeatures {

	private _proxy: ExtHostLanguageFeatures;
	private _markerService: IMarkerService;
	private _registrations: { [handle: number]: IDisposable; } = Object.create(null);

	constructor( @IThreadService threadService: IThreadService, @IMarkerService markerService: IMarkerService) {
		this._proxy = threadService.getRemotable(ExtHostLanguageFeatures);
		this._markerService = markerService;
	}

	$unregister(handle: number): TPromise<any> {
		let registration = this._registrations[handle];
		if (registration) {
			registration.dispose();
			delete this._registrations[handle];
		}
		return undefined;
	}

	// --- outline

	$registerOutlineSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = OutlineRegistry.register(selector, <IOutlineSupport>{
			getOutline: (resource: URI): TPromise<IOutlineEntry[]> => {
				return this._proxy.$getOutline(handle, resource);
			}
		});
		return undefined;
	}

	// --- code lens

	$registerCodeLensSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = CodeLensRegistry.register(selector, <modes.ICodeLensSupport>{
			findCodeLensSymbols: (resource: URI): TPromise<modes.ICodeLensSymbol[]> => {
				return this._proxy.$findCodeLensSymbols(handle, resource);
			},
			resolveCodeLensSymbol: (resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICodeLensSymbol> => {
				return this._proxy.$resolveCodeLensSymbol(handle, resource, symbol);
			}
		});
		return undefined;
	}

	// --- declaration

	$registerDeclaractionSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = DeclarationRegistry.register(selector, <modes.IDeclarationSupport>{
			canFindDeclaration() {
				return true;
			},
			findDeclaration: (resource: URI, position: IPosition): TPromise<modes.IReference[]> => {
				return this._proxy.$findDeclaration(handle, resource, position);
			}
		});
		return undefined;
	}

	// --- extra info

	$registerExtraInfoSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = ExtraInfoRegistry.register(selector, <modes.IExtraInfoSupport>{
			computeInfo: (resource: URI, position: IPosition): TPromise<modes.IComputeExtraInfoResult> => {
				return this._proxy.$computeInfo(handle, resource, position);
			}
		});
		return undefined;
	}

	// --- occurrences

	$registerOccurrencesSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = OccurrencesRegistry.register(selector, <modes.IOccurrencesSupport>{
			findOccurrences: (resource: URI, position: IPosition): TPromise<modes.IOccurence[]> => {
				return this._proxy.$findOccurrences(handle, resource, position);
			}
		});
		return undefined;
	}

	// --- references

	$registerReferenceSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = ReferenceRegistry.register(selector, <modes.IReferenceSupport>{
			canFindReferences() {
				return true;
			},
			findReferences: (resource: URI, position: IPosition, includeDeclaration: boolean): TPromise<modes.IReference[]> => {
				return this._proxy.$findReferences(handle, resource, position, includeDeclaration);
			}
		});
		return undefined;
	}

	// --- quick fix

	$registerQuickFixSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = QuickFixRegistry.register(selector, <modes.IQuickFixSupport>{
			getQuickFixes: (resource: URI, range: IRange): TPromise<modes.IQuickFix[]> => {
				let markers: IMarker[] = [];
				this._markerService.read({ resource }).forEach(marker => {
					if (EditorRange.lift(marker).intersectRanges(range)) {
						markers.push(marker);
					}
				});
				return this._proxy.$getQuickFixes(handle, resource, range, markers);
			},
			runQuickFixAction: (resource: URI, range: IRange, quickFix: modes.IQuickFix) => {
				return this._proxy.$runQuickFixAction(handle, resource, range, quickFix);
			}
		});
		return undefined;
	}

	// --- formatting

	$registerDocumentFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = FormatRegistry.register(selector, <modes.IFormattingSupport>{
			formatDocument: (resource: URI, options: modes.IFormattingOptions): TPromise <ISingleEditOperation[] > => {
				return this._proxy.$formatDocument(handle, resource, options);
			}
		});
		return undefined;
	}

	$registerRangeFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = FormatRegistry.register(selector, <modes.IFormattingSupport>{
			formatRange: (resource: URI, range: IRange, options: modes.IFormattingOptions): TPromise <ISingleEditOperation[] > => {
				return this._proxy.$formatRange(handle, resource, range, options);
			}
		});
		return undefined;
	}

	$registerOnTypeFormattingSupport(handle: number, selector: vscode.DocumentSelector, autoFormatTriggerCharacters: string[]): TPromise<any> {
		this._registrations[handle] = FormatOnTypeRegistry.register(selector, <modes.IFormattingSupport>{

			autoFormatTriggerCharacters,

			formatAfterKeystroke: (resource: URI, position: IPosition, ch: string, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> => {
				return this._proxy.$formatAfterKeystroke(handle, resource, position, ch, options);
			}
		});
		return undefined;
	}

	// --- navigate type

	$registerNavigateTypeSupport(handle: number): TPromise<any> {
		this._registrations[handle] = NavigateTypesSupportRegistry.register(<INavigateTypesSupport>{
			getNavigateToItems: (search: string): TPromise<ITypeBearing[]> => {
				return this._proxy.$getNavigateToItems(handle, search);
			}
		});
		return undefined;
	}

	// --- rename

	$registerRenameSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> {
		this._registrations[handle] = RenameRegistry.register(selector, <modes.IRenameSupport>{
			rename: (resource: URI, position: IPosition, newName: string): TPromise<modes.IRenameResult> => {
				return this._proxy.$rename(handle, resource, position, newName);
			}
		});
		return undefined;
	}

	// --- suggest

	$registerSuggestSupport(handle: number, selector: vscode.DocumentSelector, triggerCharacters: string[]): TPromise<any> {
		this._registrations[handle] = SuggestRegistry.register(selector, <modes.ISuggestSupport>{
			suggest: (resource: URI, position: IPosition, triggerCharacter?: string): TPromise<modes.ISuggestResult[]> => {
				return this._proxy.$suggest(handle, resource, position);
			},
			getSuggestionDetails: (resource: URI, position: IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> => {
				return this._proxy.$getSuggestionDetails(handle, resource, position, suggestion);
			},
			getFilter() {
				return DefaultFilter;
			},
			getTriggerCharacters(): string[] {
				return triggerCharacters;
			},
			shouldShowEmptySuggestionList(): boolean {
				return true;
			},
			shouldAutotriggerSuggest(): boolean {
				return true;
			}
		});
		return undefined;
	}

	// --- parameter hints

	$registerParameterHintsSupport(handle: number, selector: vscode.DocumentSelector, triggerCharacter: string[]): TPromise<any> {
		this._registrations[handle] = ParameterHintsRegistry.register(selector, <modes.IParameterHintsSupport>{
			getParameterHints: (resource: URI, position: IPosition, triggerCharacter?: string): TPromise<modes.IParameterHints> => {
				return this._proxy.$getParameterHints(handle, resource, position, triggerCharacter);
			},
			getParameterHintsTriggerCharacters(): string[] {
				return triggerCharacter;
			},
			shouldTriggerParameterHints(context: modes.ILineContext, offset: number): boolean {
				return true;
			}
		});
		return undefined;
	}
}
