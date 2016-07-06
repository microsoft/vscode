/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import * as vscode from 'vscode';
import * as TypeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import {Range, Disposable, SignatureHelp, CompletionList} from 'vs/workbench/api/node/extHostTypes';
import {IPosition, IRange, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {ExtHostDocuments} from 'vs/workbench/api/node/extHostDocuments';
import {ExtHostCommands} from 'vs/workbench/api/node/extHostCommands';
import {ExtHostDiagnostics} from 'vs/workbench/api/node/extHostDiagnostics';
import {INavigateTypesSupport, ITypeBearing} from 'vs/workbench/parts/search/common/search';
import {asWinJsPromise, ShallowCancelThenPromise} from 'vs/base/common/async';
import {MainContext, MainThreadLanguageFeaturesShape} from './extHostProtocol';
import {regExpLeadsToEndlessLoop} from 'vs/base/common/strings';

// --- adapter

class OutlineAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.DocumentSymbolProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.DocumentSymbolProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideDocumentSymbols(resource: URI): TPromise<modes.SymbolInformation[]> {
		let doc = this._documents.getDocumentData(resource).document;
		return asWinJsPromise(token => this._provider.provideDocumentSymbols(doc, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(TypeConverters.SymbolInformation.toOutlineEntry);
			}
		});
	}
}

interface CachedCodeLens {
	symbols: modes.ICodeLensSymbol[];
	lenses: vscode.CodeLens[];
	disposables: IDisposable[];
}

class CodeLensAdapter {

	private _documents: ExtHostDocuments;
	private _commands: ExtHostCommands;
	private _provider: vscode.CodeLensProvider;

	private _cache: { [uri: string]: { version: number; data: TPromise<CachedCodeLens>; } } = Object.create(null);

	constructor(documents: ExtHostDocuments, commands: ExtHostCommands, provider: vscode.CodeLensProvider) {
		this._documents = documents;
		this._commands = commands;
		this._provider = provider;
	}

	provideCodeLenses(resource: URI): TPromise<modes.ICodeLensSymbol[]> {
		const doc = this._documents.getDocumentData(resource).document;
		const version = doc.version;
		const key = resource.toString();

		// from cache
		let entry = this._cache[key];
		if (entry && entry.version === version) {
			return new ShallowCancelThenPromise(entry.data.then(cached => cached.symbols));
		}

		const newCodeLensData = asWinJsPromise(token => this._provider.provideCodeLenses(doc, token)).then(lenses => {
			if (!Array.isArray(lenses)) {
				return;
			}

			const data: CachedCodeLens = {
				lenses,
				symbols: [],
				disposables: [],
			};

			lenses.forEach((lens, i) => {
				data.symbols.push(<modes.ICodeLensSymbol>{
					id: String(i),
					range: TypeConverters.fromRange(lens.range),
					command: TypeConverters.Command.from(lens.command, data.disposables)
				});
			});

			return data;
		});

		this._cache[key] = {
			version,
			data: newCodeLensData
		};

		return new ShallowCancelThenPromise(newCodeLensData.then(newCached => {
			if (entry) {
				// only now dispose old commands et al
				entry.data.then(oldCached => dispose(oldCached.disposables));
			}
			return newCached && newCached.symbols;
		}));

	}

	resolveCodeLens(resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICodeLensSymbol> {

		const entry = this._cache[resource.toString()];
		if (!entry) {
			return;
		}

		return entry.data.then(cachedData => {

			if (!cachedData) {
				return;
			}

			let lens = cachedData.lenses[Number(symbol.id)];
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
					};
				}

				symbol.command = TypeConverters.Command.from(command, cachedData.disposables);
				return symbol;
			});
		});
	}
}

class DefinitionAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.DefinitionProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.DefinitionProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideDefinition(resource: URI, position: IPosition): TPromise<modes.Definition> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = TypeConverters.toPosition(position);
		return asWinJsPromise(token => this._provider.provideDefinition(doc, pos, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(DefinitionAdapter._convertLocation);
			} else if (value) {
				return DefinitionAdapter._convertLocation(value);
			}
		});
	}

	private static _convertLocation(location: vscode.Location): modes.Location {
		if (!location) {
			return;
		}
		return <modes.Location>{
			uri: location.uri,
			range: TypeConverters.fromRange(location.range)
		};
	}
}

class HoverAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.HoverProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.HoverProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	public provideHover(resource: URI, position: IPosition): TPromise<modes.Hover> {

		let doc = this._documents.getDocumentData(resource).document;
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

class DocumentHighlightAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.DocumentHighlightProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.DocumentHighlightProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideDocumentHighlights(resource: URI, position: IPosition): TPromise<modes.DocumentHighlight[]> {

		let doc = this._documents.getDocumentData(resource).document;
		let pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideDocumentHighlights(doc, pos, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(DocumentHighlightAdapter._convertDocumentHighlight);
			}
		});
	}

	private static _convertDocumentHighlight(documentHighlight: vscode.DocumentHighlight): modes.DocumentHighlight {
		return {
			range: TypeConverters.fromRange(documentHighlight.range),
			kind: documentHighlight.kind
		};
	}
}

class ReferenceAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.ReferenceProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.ReferenceProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideReferences(resource: URI, position: IPosition, context: modes.ReferenceContext): TPromise<modes.Location[]> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideReferences(doc, pos, context, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(ReferenceAdapter._convertLocation);
			}
		});
	}

	private static _convertLocation(location: vscode.Location): modes.Location {
		return <modes.Location>{
			uri: location.uri,
			range: TypeConverters.fromRange(location.range)
		};
	}
}

class QuickFixAdapter {

	private _documents: ExtHostDocuments;
	private _commands: ExtHostCommands;
	private _diagnostics: ExtHostDiagnostics;
	private _provider: vscode.CodeActionProvider;

	private _cachedCommands: IDisposable[] = [];

	constructor(documents: ExtHostDocuments, commands: ExtHostCommands, diagnostics: ExtHostDiagnostics, provider: vscode.CodeActionProvider) {
		this._documents = documents;
		this._commands = commands;
		this._diagnostics = diagnostics;
		this._provider = provider;
	}

	provideCodeActions(resource: URI, range: IRange): TPromise<modes.CodeAction[]> {

		const doc = this._documents.getDocumentData(resource).document;
		const ran = TypeConverters.toRange(range);
		const allDiagnostics: vscode.Diagnostic[] = [];

		this._diagnostics.forEach(collection => {
			if (collection.has(resource)) {
				for (let diagnostic of collection.get(resource)) {
					if (diagnostic.range.intersection(ran)) {
						allDiagnostics.push(diagnostic);
					}
				}
			}
		});

		this._cachedCommands = dispose(this._cachedCommands);

		return asWinJsPromise(token => this._provider.provideCodeActions(doc, ran, { diagnostics: allDiagnostics }, token)).then(commands => {
			if (!Array.isArray(commands)) {
				return;
			}
			return commands.map((command, i) => {
				return <modes.CodeAction> {
					command: TypeConverters.Command.from(command, this._cachedCommands),
					score: i
				};
			});
		});
	}
}

class DocumentFormattingAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.DocumentFormattingEditProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.DocumentFormattingEditProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideDocumentFormattingEdits(resource: URI, options: modes.FormattingOptions): TPromise<ISingleEditOperation[]> {

		let doc = this._documents.getDocumentData(resource).document;

		return asWinJsPromise(token => this._provider.provideDocumentFormattingEdits(doc, <any>options, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(TypeConverters.TextEdit.from);
			}
		});
	}
}

class RangeFormattingAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.DocumentRangeFormattingEditProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.DocumentRangeFormattingEditProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideDocumentRangeFormattingEdits(resource: URI, range: IRange, options: modes.FormattingOptions): TPromise<ISingleEditOperation[]> {

		let doc = this._documents.getDocumentData(resource).document;
		let ran = TypeConverters.toRange(range);

		return asWinJsPromise(token => this._provider.provideDocumentRangeFormattingEdits(doc, ran, <any>options, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(TypeConverters.TextEdit.from);
			}
		});
	}
}

class OnTypeFormattingAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.OnTypeFormattingEditProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.OnTypeFormattingEditProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	autoFormatTriggerCharacters: string[] = []; // not here

	provideOnTypeFormattingEdits(resource: URI, position: IPosition, ch: string, options: modes.FormattingOptions): TPromise<ISingleEditOperation[]> {

		let doc = this._documents.getDocumentData(resource).document;
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

class RenameAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.RenameProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.RenameProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideRenameEdits(resource: URI, position: IPosition, newName: string): TPromise<modes.WorkspaceEdit> {

		let doc = this._documents.getDocumentData(resource).document;
		let pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideRenameEdits(doc, pos, newName, token)).then(value => {

			if (!value) {
				return;
			}

			let result = <modes.WorkspaceEdit>{
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
				return <modes.WorkspaceEdit>{
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

class SuggestAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.CompletionItemProvider;
	private _cache: { [key: string]: CompletionList } = Object.create(null);

	constructor(documents: ExtHostDocuments, provider: vscode.CompletionItemProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideCompletionItems(resource: URI, position: IPosition): TPromise<modes.ISuggestResult[]> {

		const doc = this._documents.getDocumentData(resource).document;
		const pos = TypeConverters.toPosition(position);
		const ran = doc.getWordRangeAtPosition(pos);

		const key = resource.toString();
		delete this._cache[key];

		return asWinJsPromise<vscode.CompletionItem[]|vscode.CompletionList>(token => this._provider.provideCompletionItems(doc, pos, token)).then(value => {

			let defaultSuggestions: modes.ISuggestResult = {
				suggestions: [],
				currentWord: ran ? doc.getText(new Range(ran.start.line, ran.start.character, pos.line, pos.character)) : '',
			};
			let allSuggestions: modes.ISuggestResult[] = [defaultSuggestions];

			let list: CompletionList;
			if (Array.isArray(value)) {
				list = new CompletionList(value);
			} else if (value instanceof CompletionList) {
				list = value;
				defaultSuggestions.incomplete = list.isIncomplete;
			} else if (!value) {
				// undefined and null are valid results
				return;
			} else {
				// warn about everything else
				console.warn('INVALID result from completion provider. expected CompletionItem-array or CompletionList but got:', value);
				return;
			}

			for (let i = 0; i < list.items.length; i++) {
				const item = list.items[i];
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
					suggestion.overwriteBefore = pos.character - editRange.start.character;
					suggestion.overwriteAfter = editRange.end.character - pos.character;

					allSuggestions.push({
						currentWord: doc.getText(editRange),
						suggestions: [suggestion],
						incomplete: list.isIncomplete
					});

				} else {
					defaultSuggestions.suggestions.push(suggestion);
				}

				// assign identifier to suggestion
				suggestion.id = String(i);
			}

			// cache for details call
			this._cache[key] = list;

			return allSuggestions;
		});
	}

	resolveCompletionItem(resource: URI, position: IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> {
		if (typeof this._provider.resolveCompletionItem !== 'function') {
			return TPromise.as(suggestion);
		}
		let list = this._cache[resource.toString()];
		if (!list) {
			return TPromise.as(suggestion);
		}
		let item = list.items[Number((<ISuggestion2> suggestion).id)];
		if (!item) {
			return TPromise.as(suggestion);
		}
		return asWinJsPromise(token => this._provider.resolveCompletionItem(item, token)).then(resolvedItem => {
			return TypeConverters.Suggest.from(resolvedItem || item);
		});
	}
}

class SignatureHelpAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.SignatureHelpProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.SignatureHelpProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideSignatureHelp(resource: URI, position: IPosition): TPromise<modes.SignatureHelp> {

		const doc = this._documents.getDocumentData(resource).document;
		const pos = TypeConverters.toPosition(position);

		return asWinJsPromise(token => this._provider.provideSignatureHelp(doc, pos, token)).then(value => {
			if (value instanceof SignatureHelp) {
				return TypeConverters.SignatureHelp.from(value);
			}
		});
	}
}

type Adapter = OutlineAdapter | CodeLensAdapter | DefinitionAdapter | HoverAdapter
	| DocumentHighlightAdapter | ReferenceAdapter | QuickFixAdapter | DocumentFormattingAdapter
	| RangeFormattingAdapter | OnTypeFormattingAdapter | NavigateTypeAdapter | RenameAdapter
	| SuggestAdapter | SignatureHelpAdapter;

export class ExtHostLanguageFeatures {

	private static _handlePool: number = 0;

	private _proxy: MainThreadLanguageFeaturesShape;
	private _documents: ExtHostDocuments;
	private _commands: ExtHostCommands;
	private _diagnostics: ExtHostDiagnostics;
	private _adapter: { [handle: number]: Adapter } = Object.create(null);

	constructor(
		threadService: IThreadService,
		documents: ExtHostDocuments,
		commands: ExtHostCommands,
		diagnostics: ExtHostDiagnostics
	) {
		this._proxy = threadService.get(MainContext.MainThreadLanguageFeatures);
		this._documents = documents;
		this._commands = commands;
		this._diagnostics = diagnostics;
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

	$provideDocumentSymbols(handle: number, resource: URI): TPromise<modes.SymbolInformation[]> {
		return this._withAdapter(handle, OutlineAdapter, adapter => adapter.provideDocumentSymbols(resource));
	}

	// --- code lens

	registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new CodeLensAdapter(this._documents, this._commands, provider);
		this._proxy.$registerCodeLensSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$provideCodeLenses(handle: number, resource: URI): TPromise<modes.ICodeLensSymbol[]> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.provideCodeLenses(resource));
	}

	$resolveCodeLens(handle: number, resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICodeLensSymbol> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.resolveCodeLens(resource, symbol));
	}

	// --- declaration

	registerDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new DefinitionAdapter(this._documents, provider);
		this._proxy.$registerDeclaractionSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$provideDefinition(handle: number, resource: URI, position: IPosition): TPromise<modes.Definition> {
		return this._withAdapter(handle, DefinitionAdapter, adapter => adapter.provideDefinition(resource, position));
	}

	// --- extra info

	registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new HoverAdapter(this._documents, provider);
		this._proxy.$registerHoverProvider(handle, selector);
		return this._createDisposable(handle);
	}

	$provideHover(handle: number, resource: URI, position: IPosition): TPromise<modes.Hover> {
		return this._withAdapter(handle, HoverAdapter, adpater => adpater.provideHover(resource, position));
	}

	// --- occurrences

	registerDocumentHighlightProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new DocumentHighlightAdapter(this._documents, provider);
		this._proxy.$registerDocumentHighlightProvider(handle, selector);
		return this._createDisposable(handle);
	}

	$provideDocumentHighlights(handle: number, resource: URI, position: IPosition): TPromise<modes.DocumentHighlight[]> {
		return this._withAdapter(handle, DocumentHighlightAdapter, adapter => adapter.provideDocumentHighlights(resource, position));
	}

	// --- references

	registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new ReferenceAdapter(this._documents, provider);
		this._proxy.$registerReferenceSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$provideReferences(handle: number, resource: URI, position: IPosition, context: modes.ReferenceContext): TPromise<modes.Location[]> {
		return this._withAdapter(handle, ReferenceAdapter, adapter => adapter.provideReferences(resource, position, context));
	}

	// --- quick fix

	registerCodeActionProvider(selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new QuickFixAdapter(this._documents, this._commands, this._diagnostics, provider);
		this._proxy.$registerQuickFixSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$provideCodeActions(handle: number, resource: URI, range: IRange): TPromise<modes.CodeAction[]> {
		return this._withAdapter(handle, QuickFixAdapter, adapter => adapter.provideCodeActions(resource, range));
	}

	// --- formatting

	registerDocumentFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new DocumentFormattingAdapter(this._documents, provider);
		this._proxy.$registerDocumentFormattingSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$provideDocumentFormattingEdits(handle: number, resource: URI, options: modes.FormattingOptions): TPromise<ISingleEditOperation[]> {
		return this._withAdapter(handle, DocumentFormattingAdapter, adapter => adapter.provideDocumentFormattingEdits(resource, options));
	}

	registerDocumentRangeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new RangeFormattingAdapter(this._documents, provider);
		this._proxy.$registerRangeFormattingSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$provideDocumentRangeFormattingEdits(handle: number, resource: URI, range: IRange, options: modes.FormattingOptions): TPromise<ISingleEditOperation[]> {
		return this._withAdapter(handle, RangeFormattingAdapter, adapter => adapter.provideDocumentRangeFormattingEdits(resource, range, options));
	}

	registerOnTypeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new OnTypeFormattingAdapter(this._documents, provider);
		this._proxy.$registerOnTypeFormattingSupport(handle, selector, triggerCharacters);
		return this._createDisposable(handle);
	}

	$provideOnTypeFormattingEdits(handle: number, resource: URI, position: IPosition, ch: string, options: modes.FormattingOptions): TPromise<ISingleEditOperation[]> {
		return this._withAdapter(handle, OnTypeFormattingAdapter, adapter => adapter.provideOnTypeFormattingEdits(resource, position, ch, options));
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

	$provideRenameEdits(handle: number, resource: URI, position: IPosition, newName: string): TPromise<modes.WorkspaceEdit> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.provideRenameEdits(resource, position, newName));
	}

	// --- suggestion

	registerCompletionItemProvider(selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new SuggestAdapter(this._documents, provider);
		this._proxy.$registerSuggestSupport(handle, selector, triggerCharacters);
		return this._createDisposable(handle);
	}

	$provideCompletionItems(handle: number, resource: URI, position: IPosition): TPromise<modes.ISuggestResult[]> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.provideCompletionItems(resource, position));
	}

	$resolveCompletionItem(handle: number, resource: URI, position: IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.resolveCompletionItem(resource, position, suggestion));
	}

	// --- parameter hints

	registerSignatureHelpProvider(selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new SignatureHelpAdapter(this._documents, provider);
		this._proxy.$registerSignatureHelpProvider(handle, selector, triggerCharacters);
		return this._createDisposable(handle);
	}

	$provideSignatureHelp(handle: number, resource: URI, position: IPosition): TPromise<modes.SignatureHelp> {
		return this._withAdapter(handle, SignatureHelpAdapter, adapter => adapter.provideSignatureHelp(resource, position));
	}

	// --- configuration

	setLanguageConfiguration(languageId:string, configuration: vscode.LanguageConfiguration): vscode.Disposable {
		let {wordPattern} = configuration;

		// check for a valid word pattern
		if (wordPattern && regExpLeadsToEndlessLoop(wordPattern)) {
			throw new Error(`Invalid language configuration: wordPattern '${wordPattern}' is not allowed to match the empty string.`);
		}

		// word definition
		if (wordPattern) {
			this._documents.setWordDefinitionFor(languageId, wordPattern);
		} else {
			this._documents.setWordDefinitionFor(languageId, null);
		}

		const handle = this._nextHandle();
		this._proxy.$setLanguageConfiguration(handle, languageId, configuration);
		return this._createDisposable(handle);
	}
}
