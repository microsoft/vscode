/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, {Emitter} from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError} from 'vs/base/common/errors';
import {sequence} from 'vs/base/common/async';
import {Range as EditorRange} from 'vs/editor/common/core/range';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import * as vscode from 'vscode';
import * as TypeConverters from 'vs/workbench/api/common/pluginHostTypeConverters';
import {Position, Range, SymbolKind, DocumentHighlightKind, Disposable, Diagnostic, DiagnosticSeverity, Location, SignatureHelp, CompletionItemKind} from 'vs/workbench/api/common/pluginHostTypes';
import {IPosition, IRange, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {CancellationTokenSource} from 'vs/base/common/cancellation';
import {PluginHostModelService} from 'vs/workbench/api/common/pluginHostDocuments';
import {IMarkerService, IMarker} from 'vs/platform/markers/common/markers';
import {PluginHostCommands, MainThreadCommands} from 'vs/workbench/api/common/pluginHostCommands';
import {DeclarationRegistry} from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';
import {ExtraInfoRegistry} from 'vs/editor/contrib/hover/common/hover';
import {OccurrencesRegistry} from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import ReferenceSearchRegistry from 'vs/editor/contrib/referenceSearch/common/referenceSearch';
import QuickFixRegistry from 'vs/editor/contrib/quickFix/common/quickFix';
import {OutlineRegistry, IOutlineEntry, IOutlineSupport} from 'vs/editor/contrib/quickOpen/common/quickOpen';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
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
				return value.map(OutlineAdapter._convertSymbolInfo);
			}
		});
	}

	private static _convertSymbolInfo(symbol: vscode.SymbolInformation): IOutlineEntry {
		return <IOutlineEntry>{
			type: TypeConverters.fromSymbolKind(symbol.kind),
			range: TypeConverters.fromRange(symbol.location.range),
			containerLabel: symbol.containerName,
			label: symbol.name,
			icon: undefined,
		};
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
					range: TypeConverters.fromRange(lens.range)
				}
			});
		});
	}

	resolveCodeLensSymbol(resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICommand> {

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
			return {
				id: command.command,
				title: command.title,
				arguments: command.arguments
			}
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

			let {range, contents} = value;

			if (!range) {
				range = doc.getWordRangeAtPosition(pos);
			}
			if (!range) {
				range = new Range(pos, pos);
			}

			return <modes.IComputeExtraInfoResult>{
				range: TypeConverters.fromRange(range),
				htmlContent: contents && contents.map(TypeConverters.fromFormattedString)
			}
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

type Adapter = OutlineAdapter | CodeLensAdapter | DeclarationAdapter | ExtraInfoAdapter | OccurrencesAdapter;

@Remotable.PluginHostContext('ExtHostLanguageFeatures')
export class ExtHostLanguageFeatures {

	private static _handlePool = 0;

	private _proxy: MainThreadLanguageFeatures;
	private _documents: PluginHostModelService;
	private _adapter: { [handle: number]: Adapter } = Object.create(null);

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadLanguageFeatures);
		this._documents = threadService.getRemotable(PluginHostModelService);
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

	$getOutline(handle: number, resource: URI): TPromise<IOutlineEntry[]>{
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

	$resolveCodeLensSymbol(handle:number, resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICommand> {
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

	$computeInfo(handle:number, resource: URI, position: IPosition): TPromise<modes.IComputeExtraInfoResult> {
		return this._withAdapter(handle, ExtraInfoAdapter, adpater => adpater.computeInfo(resource, position));
	}

	// --- occurrences adapter

	registerDocumentHighlightProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter[handle] = new OccurrencesAdapter(this._documents, provider);
		this._proxy.$registerOccurrencesSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$findOccurrences(handle:number, resource: URI, position: IPosition): TPromise<modes.IOccurence[]> {
		return this._withAdapter(handle, OccurrencesAdapter, adapter => adapter.findOccurrences(resource, position));
	}
}

@Remotable.MainContext('MainThreadLanguageFeatures')
export class MainThreadLanguageFeatures {

	private _proxy: ExtHostLanguageFeatures;
	private _registrations: { [handle: number]: IDisposable; } = Object.create(null);

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(ExtHostLanguageFeatures);
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
			resolveCodeLensSymbol: (resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICommand> => {
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
}