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
import DeclarationRegistry from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';
import ExtraInfoRegistry from 'vs/editor/contrib/hover/common/hover';
import DocumentHighlighterRegistry from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
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

class OutlineSupportAdapter implements IOutlineSupport {

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
				return value.map(OutlineSupportAdapter._convertSymbolInfo);
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

type Adapter = OutlineSupportAdapter;

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

	// --- outline

	registerDocumentSymbolProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider): vscode.Disposable {
		const handle = ExtHostLanguageFeatures._handlePool++;
		this._adapter[handle] = new OutlineSupportAdapter(this._documents, provider);
		this._proxy.$registerOutlineSupport(handle, selector);
		return this._createDisposable(handle);
	}

	$getOutline(handle: number, resource: URI): TPromise<IOutlineEntry[]>{
		let adapter = this._adapter[handle];
		if (adapter instanceof OutlineSupportAdapter) {
			return adapter.getOutline(resource);
		}
		return TPromise.wrapError(new Error('no adapter found'));
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
		let disposable = OutlineRegistry.register(selector, <IOutlineSupport>{
			getOutline: (resource: URI): TPromise<IOutlineEntry[]> => {
				return this._proxy.$getOutline(handle, resource);
			}
		});
		this._registrations[handle] = disposable;
		return undefined;
	}
}