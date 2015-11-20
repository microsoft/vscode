/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, {Emitter} from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
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
import DeclarationRegistry from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';
import ExtraInfoRegistry from 'vs/editor/contrib/hover/common/hover';
import DocumentHighlighterRegistry from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import ReferenceSearchRegistry from 'vs/editor/contrib/referenceSearch/common/referenceSearch';
import QuickFixRegistry from 'vs/editor/contrib/quickFix/common/quickFix';
import QuickOutlineRegistry, {IOutlineEntry, IOutlineSupport} from 'vs/editor/contrib/quickOpen/common/quickOpen';
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

export class AbstractExtHostSupport<P> {

	protected _provider: P;
	protected _documents: PluginHostModelService;

	constructor(provider: P, documents: PluginHostModelService) {
		this._provider = provider;
		this._documents = documents;
	}

	protected getDocument(resource: URI): vscode.TextDocument {
		return this._documents.getDocument(resource);
	}
}

// ---- outline support

export class ExtHostOutlineSupport extends AbstractExtHostSupport<vscode.DocumentSymbolProvider> implements IOutlineSupport {

	getOutline(resource: URI): TPromise<IOutlineEntry[]>{
		let doc = this.getDocument(resource);
		return asWinJsPromise(token => this._provider.provideDocumentSymbols(doc, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(ExtHostOutlineSupport._convertSymbolInfo);
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

// ---- code lens suppot

export class ExtHostCodeLensSupport extends AbstractExtHostSupport<vscode.CodeLensProvider> implements modes.ICodeLensSupport {

	private _cache: { [resource: string]: [string, vscode.CodeLens][] } = Object.create(null);
	private _providerCanResolveLens: boolean;

	constructor(provider: vscode.CodeLensProvider, documents: PluginHostModelService) {
		super(provider, documents);
		this._providerCanResolveLens = typeof provider.resolveCodeLens === 'function';
	}

	findCodeLensSymbols(resource: URI): TPromise<modes.ICodeLensSymbol[]> {

		delete this._cache[resource.toString()];
		let doc = this.getDocument(resource);

		return asWinJsPromise(token => this._provider.provideCodeLenses(doc, token)).then(value => {
			if (!Array.isArray(value)) {
				return;
			}

			let result: modes.ICodeLensSymbol[] = [];
			for (let i = 0; i < value.length; i++) {
				let lens = value[i];

				if (!this._providerCanResolveLens && !lens.isResolved) {
					lens.command = {
						title: '<<Lens has NO command and provider does NOT implement resolveCodeLens>>',
						command: 'missing'
					};
				}

				let id = 'code_lense_#' + i;
				let key = resource.toString();
				if (i === 0) {
					this._cache[key] = [];
				}
				this._cache[key].push([id, lens]);

				result.push({
					id,
					range: TypeConverters.fromRange(lens.range)
				});
			}
			return result;
		});
	}

	resolveCodeLensSymbol(resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICommand> {

		let lens: vscode.CodeLens;
		let tuples = this._cache[resource.toString()];
		if (tuples) {
			for (let tuple of tuples) {
				if (tuple[0] === symbol.id) {
					lens = tuple[1];
				}
			}
		}

		if (!lens) {
			return;
		}

		let resolve: TPromise<vscode.CodeLens>;
		if (typeof this._provider.resolveCodeLens !== 'function') {
			resolve = TPromise.as(lens);
		} else {
			resolve = asWinJsPromise(token => this._provider.resolveCodeLens(lens, token));
		}

		return resolve.then(newLens => {
			lens = newLens || lens;
			if (lens.command) {
				return {
					id: lens.command.command,
					title: lens.command.title,
					arguments: lens.command.arguments
				}
			}
		});
	}
}

type LanguageSupport = ExtHostOutlineSupport | ExtHostCodeLensSupport;

@Remotable.PluginHostContext('ExtHostLanguageFeatures')
export class ExtHostLanguageFeatures {

	private _provider: { [handle: number]: LanguageSupport } = Object.create(null);
	private _handlePool = 0;
	private _proxy: MainThreadLanguageFeatures;
	private _documents: PluginHostModelService;

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadLanguageFeatures);
		this._documents = threadService.getRemotable(PluginHostModelService);
	}

	// --- outline aka document symbols

	registerDocumentSymbolProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._provider[handle] = new ExtHostOutlineSupport(provider, this._documents);
		this._proxy.$registerOutlineSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$getOutline(handle: number, resource: URI): TPromise<IOutlineEntry[]> {
		let provider = this._provider[handle];
		if (provider instanceof ExtHostOutlineSupport) {
			return provider.getOutline(resource);
		} else {
			return this._missingProvider();
		}
	}

	// --- code lens

	registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
		const handle = this._nextHandle();
		this._provider[handle] = new ExtHostCodeLensSupport(provider, this._documents);
		this._proxy.$registerCodeLensSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$findCodeLensSymbols(handle: number, resource: URI): TPromise<modes.ICodeLensSymbol[]> {
		let provider = this._provider[handle];
		if (provider instanceof ExtHostCodeLensSupport) {
			return provider.findCodeLensSymbols(resource);
		} else {
			return this._missingProvider();
		}
	}

	$resolveCodeLensSymbol(handle: number, resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICommand> {
		let provider = this._provider[handle];
		if (provider instanceof ExtHostCodeLensSupport) {
			return provider.resolveCodeLensSymbol(resource, symbol);
		} else {
			return this._missingProvider();
		}
	}

	// ---- utils

	private _nextHandle(): number {
		return this._handlePool++;
	}

	private _createDisposable(handle: number): vscode.Disposable {
		return new Disposable(() => {
			delete this._provider[handle];
			this._proxy.$unregister(handle);
		});
	}

	private _missingProvider():TPromise<any> {
		return TPromise.wrapError<any>('missing provider');
	}
}

@Remotable.MainContext('MainThreadLanguageFeatures')
export class MainThreadLanguageFeatures {

	private _disposables: { [handle: number]: IDisposable } = Object.create(null);
	private _proxy: ExtHostLanguageFeatures;

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(ExtHostLanguageFeatures);
	}

	$unregister(handle: number): TPromise<void> {
		if (this._disposables[handle]) {
			this._disposables[handle].dispose();
			delete this._disposables[handle];
		}
		return undefined;
	}

	// --- outline

	$registerOutlineSupport(handle: number, selector: vscode.DocumentSelector): TPromise<void>{
		let disposable = QuickOutlineRegistry.register(selector, <IOutlineSupport>{
			getOutline: (resource: URI) => {
				return this._proxy.$getOutline(handle, resource);
			}
		});
		this._disposables[handle] = disposable;
		return undefined;
	}

	// --- code lens

	$registerCodeLensSupport(handle: number, selector: vscode.DocumentSelector): TPromise<void> {
		let disposable = CodeLensRegistry.register(selector, <modes.ICodeLensSupport>{
			findCodeLensSymbols:(resource: URI) => {
				return this._proxy.$findCodeLensSymbols(handle, resource);
			},
			resolveCodeLensSymbol:(resource: URI, symbol) => {
				return this._proxy.$resolveCodeLensSymbol(handle, resource, symbol);
			}
		});
		return undefined;
	}
}