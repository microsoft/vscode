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

export abstract class AbstractMainThreadFeature<T> {

	private _id: string;
	protected _commands: PluginHostCommands;
	protected _handlePool = 0;
	protected _disposable: { [handle: number]: IDisposable } = Object.create(null);
	protected _registry: LanguageFeatureRegistry<T>;

	constructor(id: string, registry: LanguageFeatureRegistry<T>, @IThreadService threadService: IThreadService) {
		this._id = id;
		this._registry = registry;
		this._commands = threadService.getRemotable(PluginHostCommands);
	}

	_getId(): TPromise<string> {
		return TPromise.as(this._id);
	}

	_register(selector: vscode.DocumentSelector): TPromise<number> {
		const handle = this._handlePool++;
		this._disposable[handle] = this._registry.register(selector, <any> this);
		return TPromise.as(handle);
	}

	_unregister(handle: number): TPromise<any> {
		if (this._disposable[handle]) {
			this._disposable[handle].dispose();
			delete this._disposable[handle];
		}
		return undefined;
	}

	_executeCommand<T>(...args:any[]):TPromise<T> {
		let result = this._commands.executeCommand<any>(this._id, ...args);
		return new TPromise<T>((c, e) => {
			result.then(c, e);
		});
	}
}

export abstract class AbstractExtensionHostFeature<T, P extends AbstractMainThreadFeature<any>> {

	protected _commands: PluginHostCommands;
	protected _proxy: P;
	protected _registry = new LanguageFeatureRegistry<T>();
	protected _models: PluginHostModelService;

	constructor(proxy: P, @IThreadService threadService: IThreadService) {
		this._proxy = proxy;
		this._models = threadService.getRemotable(PluginHostModelService);
		this._commands = threadService.getRemotable(PluginHostCommands);

		proxy._getId().then(value => this._commands.registerCommand(value, this._runAsCommand, this));
	}

	register(selector: vscode.DocumentSelector, provider: T): vscode.Disposable {

		let disposable = this._registry.register(selector, provider);
		let handle = this._proxy._register(selector);

		return new Disposable(() => {
			disposable.dispose(); // remove locally
			handle.then(value => this._proxy._unregister(value));
		});
	}

	protected abstract _runAsCommand(...args: any[]): any;

	protected _getAllFor(document: vscode.TextDocument): T[] {
		return this._registry.all({
			language: document.languageId,
			uri: <any> document.uri
		});
	}

	protected _getOrderedFor(document: vscode.TextDocument): T[] {
		return this._registry.ordered({
			language: document.languageId,
			uri: <any>document.uri
		});
	}
}

// ---- definition feature

export class ExtensionHostDefinitionFeature extends AbstractExtensionHostFeature<vscode.DefinitionProvider, MainThreadDefinitionFeature> {

	constructor(@IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadDefinitionFeature), threadService);
	}

	_runAsCommand(resource: URI, position: IPosition): TPromise<modes.IReference[]> {

		let document = this._models.getDocument(resource);
		let pos = TypeConverters.toPosition(position);
		let locations: vscode.Location[] = [];

		let promises = this._registry.all({ language: document.languageId, uri: document.uri }).map(provider => {
			return asWinJsPromise(token => provider.provideDefinition(document, pos, token)).then(result => {
				if (Array.isArray(result)) {
					locations.push(...result);
				} else {
					locations.push(<any> result);
				}
			}, err => {
				console.error(err);
			});
		});

		return TPromise.join(promises).then(() => {
			return locations.map(ExtensionHostDefinitionFeature._convertLocation);
		})
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

@Remotable.MainContext('MainThreadDefinitionProvider')
export class MainThreadDefinitionFeature extends AbstractMainThreadFeature<modes.IDeclarationSupport> implements modes.IDeclarationSupport {

	constructor(@IThreadService threadService: IThreadService) {
		super('vscode.executeDefinitionProvider', DeclarationRegistry, threadService);
	}

	canFindDeclaration() {
		return true
	}

	findDeclaration(resource: URI, position: IPosition): TPromise<modes.IReference[]>{
		return this._executeCommand(resource, position);
	}
}

// ---- hover


export class ExtensionHostHoverFeature extends AbstractExtensionHostFeature<vscode.HoverProvider, MainThreadHoverFeature> {

	constructor( @IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadHoverFeature), threadService);
	}

	_runAsCommand(resource: URI, position: IPosition): TPromise<modes.IComputeExtraInfoResult> {

		let document = this._models.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		// incrementally building up the result
		let contents: vscode.MarkedString[] = [];
		let word = document.getWordRangeAtPosition(pos);
		let start = word && word.start || pos;
		let end = word && word.end || pos;

		let promises = this._registry.all({ language: document.languageId, uri: document.uri }).map(provider => {

			return asWinJsPromise(token => provider.provideHover(document, pos, token)).then(result => {

				if (!result) {
					return;
				}

				if (result.range) {
					if (result.range.start.isBefore(start)) {
						start = <any> result.range.start;
					}
					if (end.isBefore(<any>result.range.end)) {
						end = <any> result.range.end;
					}
				}

				for (let markedString of result.contents) {
					if (markedString) {
						contents.push(markedString);
					}
				}
				contents.push('\n');

			}, err => {
				console.error(err);
			});
		});

		return TPromise.join(promises).then(() => {

			contents.pop(); // remove the last '\n' element we added

			return {
				range: TypeConverters.fromRange(new Range(start, end)),
				htmlContent: contents.map(TypeConverters.fromFormattedString)
			};
		});
	}
}

@Remotable.MainContext('MainThreadHoverFeature')
export class MainThreadHoverFeature extends AbstractMainThreadFeature<modes.IExtraInfoSupport> implements modes.IExtraInfoSupport {

	constructor(@IThreadService threadService: IThreadService) {
		super('vscode.executeHoverProvider', ExtraInfoRegistry, threadService);
	}

	computeInfo(resource: URI, position: IPosition): TPromise<modes.IComputeExtraInfoResult> {
		return this._executeCommand(resource, position);
	}
}

// --- occurrences


export class ExtensionHostOccurrencesFeature extends AbstractExtensionHostFeature<vscode.DocumentHighlightProvider, MainThreadOccurrencesFeature> {

	constructor(@IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadOccurrencesFeature), threadService);
	}

	_runAsCommand(resource: URI, position: IPosition): TPromise<modes.IOccurence[]> {

		let document = this._models.getDocument(resource);
		let pos = TypeConverters.toPosition(position);
		let highlights: vscode.DocumentHighlight[];

		let factory = this._getOrderedFor(document).map(provider => {
			return () => {
				if (!highlights) {
					return asWinJsPromise(token => provider.provideDocumentHighlights(document, pos, token)).then(result => {
						if (Array.isArray(result) && result.length > 0) {
							highlights = result;
						}
					}, err => {
						console.error(err);
					});
				}
			}
		});

		return sequence(factory).then(() => {
			if (highlights) {
				return highlights.map(ExtensionHostOccurrencesFeature._convertDocumentHighlight);
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

@Remotable.MainContext('MainThreadOccurrencesFeature')
export class MainThreadOccurrencesFeature extends AbstractMainThreadFeature<modes.IOccurrencesSupport> {

	constructor(@IThreadService threadService: IThreadService) {
		super('vscode.executeDocumentHighlights', DocumentHighlighterRegistry, threadService);
	}

	findOccurrences(resource: URI, position: IPosition): TPromise<modes.IOccurence[]> {
		return this._executeCommand(resource, position);
	}
}

// --- reference search

export class ExtensionHostReferenceSearch extends AbstractExtensionHostFeature<vscode.ReferenceProvider, MainThreadReferenceSearch> {

	constructor(@IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadReferenceSearch), threadService);
	}

	protected _runAsCommand(resource: URI, position: IPosition, includeDeclaration: boolean): TPromise<modes.IReference[]> {

		if (!(resource instanceof URI)) {
			return TPromise.wrapError('resource expected');
		}

		let document = this._models.getDocument(resource);
		let pos = TypeConverters.toPosition(position);
		let locations: vscode.Location[] = [];

		let promises = this._registry.all({ language: document.languageId, uri: document.uri }).map(provider => {
			return asWinJsPromise(token => provider.provideReferences(document, pos, { includeDeclaration }, token)).then(result => {
				if (Array.isArray(result)) {
					locations.push(...result);
				}
			}, err => {
				console.error(err);
			});
		});

		return TPromise.join(promises).then(() => {
			return locations.map(ExtensionHostReferenceSearch._convertLocation);
		});
	}

	private static _convertLocation(location: vscode.Location): modes.IReference {
		return <modes.IReference>{
			resource: location.uri,
			range: TypeConverters.fromRange(location.range)
		};
	}
}

@Remotable.MainContext('MainThreadReferenceSearch')
export class MainThreadReferenceSearch extends AbstractMainThreadFeature<modes.IReferenceSupport> implements modes.IReferenceSupport {

	constructor(@IThreadService threadService: IThreadService) {
		super('vscode.executeReferenceProvider', ReferenceSearchRegistry, threadService);
	}

	canFindReferences():boolean {
		return true
	}

	findReferences(resource: URI, position: IPosition, includeDeclaration: boolean): TPromise<modes.IReference[]> {
		return this._executeCommand(resource, position, includeDeclaration);
	}
}

// --- quick fix aka code actions

export class ExtensionHostCodeActions extends AbstractExtensionHostFeature<vscode.CodeActionProvider, MainThreadCodeActions> {

	private _disposable: Disposable;

	constructor(@IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadCodeActions), threadService);
	}

	_runAsCommand(resource: URI, range: IRange, marker:IMarker[]): TPromise<modes.IQuickFix[]> {

		let document = this._models.getDocument(resource);
		let _range = TypeConverters.toRange(range);
		let commands: vscode.Command[] = [];

		let diagnostics = <vscode.Diagnostic[]> <any> marker.map(marker => {
			let diag = new Diagnostic(TypeConverters.toRange(marker), marker.message);
			diag.code = marker.code;
			diag.severity = TypeConverters.toDiagnosticSeverty(marker.severity);
			return diag;
		});

		let promises = this._getAllFor(document).map(provider => {
			return asWinJsPromise(token => provider.provideCodeActions(document, _range, { diagnostics }, token)).then(result => {
				if (Array.isArray(result)) {
					commands.push(...result);
				}
			}, err => {
				console.error(err);
			});
		});

		return TPromise.join(promises).then(() => {
			if (this._disposable) {
				this._disposable.dispose();
			}

			let disposables: IDisposable[] = [];
			let quickFixes: modes.IQuickFix[] = [];

			commands.forEach((command, i) => {

				let id = '_code_action_action_wrapper_#' + i;

				// create fake action such that the aruments don't
				// have to be send between ext-host
				disposables.push(this._commands.registerCommand(id, () => {
					return this._commands.executeCommand(command.command, ...command.arguments);
				}));

				// create quick fix
				quickFixes.push({
					id,
					label: command.title,
					score: 1
				});
			});

			// not very nice... we need
			// some sort of event to tell us when
			// quick fix is bored of our commands
			this._disposable = Disposable.from(...disposables);
			return quickFixes;
		});
	}
}

@Remotable.MainContext('MainThreadCodeAction')
export class MainThreadCodeActions extends AbstractMainThreadFeature<modes.IQuickFixSupport> implements modes.IQuickFixSupport {

	private _keybindingService: IKeybindingService;
	private _markerService: IMarkerService;

	constructor( @IThreadService threadService: IThreadService, @IKeybindingService keybindingService: IKeybindingService,
		@IMarkerService markerService: IMarkerService) {

		super('vscode.executeCodeActionProvider', QuickFixRegistry, threadService);
		this._keybindingService = keybindingService;
		this._markerService = markerService;
	}

	getQuickFixes(resource: URI, range: IRange): TPromise<modes.IQuickFix[]> {

		let markers: IMarker[] = [];
		this._markerService.read({ resource }).forEach(marker => {
			if (EditorRange.lift(marker).intersectRanges(range)) {
				markers.push(marker);
			}
		});

		return this._executeCommand(resource, range, markers);
	}

	runQuickFixAction (resource:URI, range:IRange, id:string) {
		return TPromise.as(this._keybindingService.executeCommand(id));
	}
}

// ---- OutlineSupport aka DocumentSymbols

export class ExtensionHostDocumentSymbols extends AbstractExtensionHostFeature<vscode.DocumentSymbolProvider, MainThreadDocumentSymbols> {

	constructor( @IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadDocumentSymbols), threadService);
	}

	protected _runAsCommand(resource: URI): TPromise<IOutlineEntry[]> {

		if (!(resource instanceof URI)) {
			return TPromise.wrapError('uri missing');
		}

		let symbols: vscode.SymbolInformation[] = [];
		let document = this._models.getDocument(resource);
		let candidate = {
			language: document.languageId,
			uri: document.uri
		};
		let promises = this._registry.all(candidate).map(provider => {
			return asWinJsPromise(token => {
				return provider.provideDocumentSymbols(document, token);
			}).then(result => {
				if (Array.isArray(result)) {
					symbols.push(...result);
				}
			}, err => {
				console.log(err);
			});
		});

		return TPromise.join(promises).then(() => {
			return symbols
				.sort(ExtensionHostDocumentSymbols._compareByStart)
				.map(ExtensionHostDocumentSymbols._convertSymbolInfo);
		});
	}

	private static _compareByStart(a: vscode.SymbolInformation, b: vscode.SymbolInformation): number {
		if (a.location.range.start.isBefore(b.location.range.start)) {
			return -1;
		} else if (b.location.range.start.isBefore(a.location.range.start)) {
			return 1;
		} else {
			return 0;
		}
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

@Remotable.MainContext('MainThreadDocumentSymbols2')
export class MainThreadDocumentSymbols extends AbstractMainThreadFeature<IOutlineSupport> implements IOutlineSupport {

	constructor( @IThreadService threadService: IThreadService) {
		super('vscode.executeDocumentSymbolProvider', QuickOutlineRegistry, threadService);
	}

	getOutline(resource: URI): TPromise<IOutlineEntry[]>{
		return this._executeCommand(resource);
	}
}

// -- Rename provider

export class ExtensionHostRename extends AbstractExtensionHostFeature<vscode.RenameProvider, MainThreadRename> {

	constructor( @IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadRename), threadService);
	}

	_runAsCommand(resource: URI, position: IPosition, newName: string): TPromise<modes.IRenameResult> {

		let document = this._models.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		let hasResult = false;
		let rejects: string[] = [];
		let factory = this._getOrderedFor(document).map(provider => {
			return () => {
				if (!hasResult) {
					return asWinJsPromise(token => provider.provideRenameEdits(document, pos, newName, token)).then(result => {
						if (result && result.size > 0) {
							hasResult = true;
							return result;
						}
					}, err => {
						if (typeof err === 'string') {
							rejects.push(err);
						}
					});
				}
			};
		});

		return sequence(factory).then(results => {
			let rename = results[0];
			if (!rename) {
				return <modes.IRenameResult>{
					rejectReason: rejects.join('\n'),
					edits: undefined,
					currentName: undefined
				};
			}

			let result = <modes.IRenameResult>{
				currentName: undefined,
				edits: []
			};
			for (let entry of rename.entries()) {
				let [uri, textEdits] = entry;
				for (let textEdit of textEdits) {
					result.edits.push({
						resource: <URI> uri,
						newText: textEdit.newText,
						range: TypeConverters.fromRange(textEdit.range)
					});
				}
			}
			return result;
		});
	}
}

@Remotable.MainContext('MainThreadRename')
export class MainThreadRename extends AbstractMainThreadFeature<modes.IRenameSupport> implements modes.IRenameSupport {

	constructor( @IThreadService threadService: IThreadService) {
		super('vscode.executeDocumentRenameProvider', RenameRegistry, threadService);
	}

	rename(resource: URI, position: IPosition, newName: string): TPromise<modes.IRenameResult> {
		return this._executeCommand(resource, position, newName);
	}
}

// --- format

export class ExtHostFormatDocument extends AbstractExtensionHostFeature<vscode.DocumentFormattingEditProvider, MainThreadFormatDocument> {

	constructor( @IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadFormatDocument), threadService);
	}

	_runAsCommand(resource: URI, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {

		let document = this._models.getDocument(resource);
		let provider = this._getOrderedFor(document)[0];

		return asWinJsPromise(token => provider.provideDocumentFormattingEdits(document, <any>options, token)).then(result => {
			if (Array.isArray(result)) {
				return result.map(ExtHostFormatDocument.convertTextEdit);
			}
		});
	}

	static convertTextEdit(edit: vscode.TextEdit): ISingleEditOperation {
		return <ISingleEditOperation>{
			text: edit.newText,
			range: TypeConverters.fromRange(edit.range)
		}
	}
}

@Remotable.MainContext('MainThreadFormatDocument')
export class MainThreadFormatDocument extends AbstractMainThreadFeature<modes.IFormattingSupport> implements modes.IFormattingSupport {

	constructor( @IThreadService threadService: IThreadService) {
		super('vscode.executeFormatDocumentProvider', FormatRegistry, threadService);
	}

	formatDocument(resource: URI, options: modes.IFormattingOptions):TPromise<ISingleEditOperation[]> {
		return this._executeCommand(resource, options);
	}
}

export class ExtHostFormatRange extends AbstractExtensionHostFeature<vscode.DocumentRangeFormattingEditProvider, MainThreadFormatRange> {

	constructor( @IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadFormatRange), threadService);
	}

	_runAsCommand(resource: URI, range: IRange, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {

		let document = this._models.getDocument(resource);
		let provider = this._getOrderedFor(document)[0];
		let ran: Range;

		if (range) {
			ran = TypeConverters.toRange(range);
		} else {
			let lastLine = document.lineAt(document.lineCount - 1);
			let {line, character} = lastLine.range.end;
			ran = new Range(0, 0, line, character);
		}

		return asWinJsPromise(token => provider.provideDocumentRangeFormattingEdits(document, ran, <any>options, token)).then(result => {
			if (Array.isArray(result)) {
				return result.map(ExtHostFormatDocument.convertTextEdit);
			}
		});
	}
}

@Remotable.MainContext('MainThreadFormatRange')
export class MainThreadFormatRange extends AbstractMainThreadFeature<modes.IFormattingSupport> implements modes.IFormattingSupport {

	constructor( @IThreadService threadService: IThreadService) {
		super('vscode.executeFormatRangeProvider', FormatRegistry, threadService);
	}

	formatRange(resource: URI, range:IRange, options: modes.IFormattingOptions):TPromise<ISingleEditOperation[]> {
		return this._executeCommand(resource, range, options);
	}
}

// --- format on type

export interface FormatOnTypeEntry {
	triggerCharacters: string[];
	provider: vscode.OnTypeFormattingEditProvider;
}

export class ExtHostFormatOnType extends AbstractExtensionHostFeature<FormatOnTypeEntry, MainThreadFormatOnType> {

	constructor( @IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadFormatOnType), threadService);
	}

	register(selector: vscode.DocumentSelector, provider: FormatOnTypeEntry): vscode.Disposable {

		let disposable = this._registry.register(selector, provider);
		let handle = this._proxy._register(selector, provider.triggerCharacters);

		return new Disposable(() => {
			disposable.dispose();
			handle.then(value => this._proxy._unregister(value));
		});
	}

	_runAsCommand(resource: URI, position: IPosition, ch: string, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {

		let document = this._models.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		let ordered = this._getOrderedFor(document);
		let provider: vscode.OnTypeFormattingEditProvider;
		for (let entry of ordered) {
			if (entry.triggerCharacters.indexOf(ch) >= 0) {
				provider = entry.provider;
				break;
			}
		}

		if (provider) {
			return asWinJsPromise(token => provider.provideOnTypeFormattingEdits(document, pos, ch, <any>options, token)).then(result => {
				if (Array.isArray(result)) {
					return result.map(ExtHostFormatDocument.convertTextEdit);
				}
			});
		}
	}
}

@Remotable.MainContext('MainThreadFormatOnType')
export class MainThreadFormatOnType extends AbstractMainThreadFeature<modes.IFormattingSupport> implements modes.IFormattingSupport {

	autoFormatTriggerCharacters: string[] = [];

	constructor( @IThreadService threadService: IThreadService) {
		super('vscode.executeFormatOnTypeProvider', FormatOnTypeRegistry, threadService);
	}

	_register(selector: vscode.DocumentSelector, triggerCharacters: string[] = []): TPromise<number> {
		this.autoFormatTriggerCharacters.push(...triggerCharacters);
		return super._register(selector);
	}

	formatDocument(resource: URI, options: modes.IFormattingOptions):TPromise<ISingleEditOperation[]> {
		throw new Error('format on type only');
	}

	formatAfterKeystroke(resource: URI, position: IPosition, ch: string, options: modes.IFormattingOptions): TPromise<ISingleEditOperation[]> {
		return this._executeCommand(resource, position, ch, options);
	}
}

// ---- signature help

export interface SignatureHelpEntry {
	provider: vscode.SignatureHelpProvider;
	triggerCharacters: string[];
}

export class ExtHostSignatureHelp extends AbstractExtensionHostFeature<SignatureHelpEntry, MainThreadSignatureHelp> {

	constructor( @IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadSignatureHelp), threadService);
	}

	register(selector: vscode.DocumentSelector, entry: SignatureHelpEntry): vscode.Disposable {

		let disposable = this._registry.register(selector, entry);
		let handle = this._proxy._register(selector, entry.triggerCharacters);

		return new Disposable(() => {
			disposable.dispose();
			handle.then(value => this._proxy._unregister(value));
		});
	}

	_runAsCommand(resource: URI, position: IPosition, triggerCharacter?: string): TPromise<modes.IParameterHints> {

		let document = this._models.getDocument(resource);
		let pos = TypeConverters.toPosition(position);

		let entry = this._getOrderedFor(document)[0];
		if (entry) {

			if (triggerCharacter) {
				if (entry.triggerCharacters.indexOf(triggerCharacter) < 0) {
					return;
				}
			}

			return asWinJsPromise(token => entry.provider.provideSignatureHelp(document, pos, token)).then(result => {
				if (result instanceof SignatureHelp) {
					return ExtHostSignatureHelp._convertSignatureHelp(result);
				}
			});
		}
	}

	private static _convertSignatureHelp(signatureHelp: SignatureHelp): modes.IParameterHints {

		let result: modes.IParameterHints = {
			currentSignature: signatureHelp.activeSignature,
			currentParameter: signatureHelp.activeParameter,
			signatures: []
		}

		for (let signature of signatureHelp.signatures) {

			let signatureItem: modes.ISignature = {
				label: signature.label,
				documentation: signature.documentation,
				parameters: []
			};

			let idx = 0;
			for (let parameter of signature.parameters) {

				let parameterItem: modes.IParameter = {
					label: parameter.label,
					documentation: parameter.documentation,
				};

				signatureItem.parameters.push(parameterItem);
				idx = signature.label.indexOf(parameter.label, idx);

				if (idx >= 0) {
					parameterItem.signatureLabelOffset = idx;
					idx += parameter.label.length;
					parameterItem.signatureLabelEnd = idx;
				}
			}

			result.signatures.push(signatureItem);
		}

		return result;
	}
}

@Remotable.MainContext('MainThreadSignatureHelp')
export class MainThreadSignatureHelp extends AbstractMainThreadFeature<modes.IParameterHintsSupport> implements modes.IParameterHintsSupport {

	private _triggerCharacters: string[] = [];

	constructor( @IThreadService threadService: IThreadService) {
		super('vscode.executeSignatureHelpProvider', ParameterHintsRegistry, threadService);
	}

	_register(selector: vscode.DocumentSelector, triggerCharacters: string[] = []): TPromise<number> {
		this._triggerCharacters.push(...triggerCharacters);
		return super._register(selector);
	}

	getParameterHintsTriggerCharacters(): string[] {
		return this._triggerCharacters;
	}

	shouldTriggerParameterHints(context: modes.ILineContext, offset: number): boolean {
		return true;
	}

	getParameterHints(resource: URI, position: IPosition, triggerCharacter?: string): TPromise<modes.IParameterHints> {
		return this._executeCommand(resource, position, triggerCharacter);
	}
}

// ---- Completions

export interface CompletionItemEnty {
	provider: vscode.CompletionItemProvider;
	triggerCharacters: string[];
}

@Remotable.PluginHostContext('ExtHostCompletions')
export class ExtHostCompletions extends AbstractExtensionHostFeature<CompletionItemEnty, MainThreadCompletions> {

	private _detailsStorage: {[n:number]:[vscode.CompletionItemProvider, vscode.CompletionItem]} = Object.create(null);

	constructor( @IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadCompletions), threadService);
	}

	register(selector: vscode.DocumentSelector, entry: CompletionItemEnty): vscode.Disposable {
		let disposable = this._registry.register(selector, entry);
		let handle = this._proxy._register(selector, entry.triggerCharacters);
		return new Disposable(() => {
			disposable.dispose();
			handle.then(value => this._proxy._unregister(value));
		});
	}

	_runAsCommand(resource: URI, position: IPosition, character?: string): TPromise<modes.ISuggestions[]> {

		this._detailsStorage = Object.create(null);

		let document = this._models.getDocument(resource);
		let pos = TypeConverters.toPosition(position);
		let ran = document.getWordRangeAtPosition(pos);
		let entries = this._getOrderedFor(document);

		// filter
		if (character) {
			entries = entries.filter(provider => provider.triggerCharacters.indexOf(character) >= 0);
		}

		let defaultSuggestions: modes.ISuggestions = {
			suggestions: [],
			currentWord: ran ? document.getText(new Range(ran.start, pos)) : '',
		};
		let allSuggestions: modes.ISuggestions[] = [defaultSuggestions];

		let promises = entries.map(entry => {
			return asWinJsPromise(token => entry.provider.provideCompletionItems(document, pos, token)).then(result => {
				if (!Array.isArray(result)) {
					return;
				}

				let canResolveDetails = typeof entry.provider.resolveCompletionItem === 'function';
				let detailsIdPool = 1;

				for (let item of result) {

					let suggestion = ExtHostCompletions._convertCompletionItem(item);
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

						allSuggestions.push({
							currentWord: document.getText(<any>editRange),
							suggestions: [suggestion],
							overwriteBefore: pos.character - editRange.start.character,
							overwriteAfter: editRange.end.character - pos.character
						});

					} else {
						defaultSuggestions.suggestions.push(suggestion);
					}

					if (canResolveDetails) {
						let id = detailsIdPool++;
						(<any>suggestion)._detailsId = id;
						this._detailsStorage[id] = [entry.provider, item];
					}
				}
			});
		});

		return TPromise.join(promises).then(() => allSuggestions);
	}

	_resolveDetails(suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> {
		let id = (<any>suggestion)._detailsId;
		if (this._detailsStorage[id]) {
			let [provider, item] = this._detailsStorage[id];
			return asWinJsPromise(token => provider.resolveCompletionItem(item, token)).then(resolvedItem => {
				return ExtHostCompletions._convertCompletionItem(resolvedItem || item);
			});
		}
	}

	private static _convertCompletionItem(item: vscode.CompletionItem): modes.ISuggestion {
		return {
			label: item.label,
			codeSnippet: item.insertText || item.label,
			type: CompletionItemKind[item.kind || CompletionItemKind.Text].toString().toLowerCase(),
			typeLabel: item.detail,
			documentationLabel: item.documentation,
			sortText: item.sortText,
			filterText: item.filterText
		};
	}
}

@Remotable.MainContext('MainThreadCompletions')
export class MainThreadCompletions extends AbstractMainThreadFeature<modes.ISuggestSupport> {

	private _triggerCharacters: string[] = [];
	private _proxy: ExtHostCompletions;

	constructor( @IThreadService threadService: IThreadService) {
		super('vscode.executeCompletionItemProvider', SuggestRegistry, threadService);
		this._proxy = threadService.getRemotable(ExtHostCompletions);
	}

	_register(selector: vscode.DocumentSelector, triggerCharacters: string[] = []): TPromise<number> {
		this._triggerCharacters.push(...triggerCharacters);
		return super._register(selector);
	}

	suggest(resource: URI, position: IPosition, triggerCharacter?: string): TPromise<modes.ISuggestions[]> {
		return this._executeCommand(resource, position, triggerCharacter);
	}

	getSuggestionDetails(resource: URI, position: IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> {
		return this._proxy._resolveDetails(suggestion).then(value => {
			return value || suggestion
		});
	}

	getTriggerCharacters(): string[] {
		return this._triggerCharacters;
	}

	shouldShowEmptySuggestionList(): boolean {
		return false;
	}

	shouldAutotriggerSuggest(context: modes.ILineContext, offset: number, triggeredByCharacter: string): boolean {
		return true;
	}
}

// ---- Code Lens

@Remotable.PluginHostContext('ExtensionHostCodeLens')
export class ExtensionHostCodeLens extends AbstractExtensionHostFeature<vscode.CodeLensProvider, MainThreadCodeLens> {

	private static _idPool = 0;
	private _lenses: { [id: string]: [string, vscode.CodeLensProvider, vscode.CodeLens] } = Object.create(null);

	constructor(@IThreadService threadService: IThreadService) {
		super(threadService.getRemotable(MainThreadCodeLens), threadService);
		this._models.onDidRemoveDocument(event => this._clearCache(event.uri));
	}

	_clearCache(resource: URI): void {
		for (let key in this._lenses) {
			if (this._lenses[key][0] === resource.toString()) {
				delete this._lenses[key];
			}
		}
	}

	_runAsCommand(resource: URI): TPromise<modes.ICodeLensSymbol[]> {

		let document = this._models.getDocument(resource);
		let result: modes.ICodeLensSymbol[] = [];
		let promises = this._getAllFor(document).map(provider => {

			let providerCanResolveLens = typeof provider.resolveCodeLens === 'function';

			return asWinJsPromise(token => provider.provideCodeLenses(document, token)).then(lenses => {

				// new commands
				this._clearCache(resource);

				if (!Array.isArray(lenses)) {
					return;
				}
				for (let lens of lenses) {

					if (!providerCanResolveLens && !lens.isResolved) {
						throw new Error('illegal state - code lens must be resolved or provider must implement resolveCodeLens-function');
					}

					let id = 'code_lense_#' + ExtensionHostCodeLens._idPool++;
					this._lenses[id] = [resource.toString(), provider, lens];

					result.push({
						id,
						range: TypeConverters.fromRange(lens.range)
					});
				}
			}, err => {
				console.error(err);
			});
		});

		return TPromise.join(promises).then(() => {
			return result;
		});
	}

	_resolveCodeLensSymbol(symbol: modes.ICodeLensSymbol): TPromise<modes.ICommand> {

		if (!this._lenses[symbol.id]) {
			return;
		}

		let [, provider, lens] = this._lenses[symbol.id];
		let resolve: TPromise<vscode.CodeLens>;

		if (typeof provider.resolveCodeLens !== 'function') {
			resolve = TPromise.as(lens);
		} else {
			resolve = asWinJsPromise(token => provider.resolveCodeLens(lens, token));
		}

		return resolve.then(newLens => {
			lens = newLens || lens;
			if (lens.command) {
				return {
					id: <string>lens.command.command,
					title: lens.command.title,
					arguments: lens.command.arguments
				}
			}
		});
	}
}

@Remotable.MainContext('MainThreadCodeLens')
export class MainThreadCodeLens extends AbstractMainThreadFeature<modes.ICodeLensSupport> implements modes.ICodeLensSupport {

	private _proxy: ExtensionHostCodeLens;

	constructor( @IThreadService threadService: IThreadService) {
		super('vscode.executeCodeLensProvider', CodeLensRegistry, threadService);
		this._proxy = threadService.getRemotable(ExtensionHostCodeLens);
	}

	findCodeLensSymbols(resource: URI): TPromise<modes.ICodeLensSymbol[]> {
		return this._executeCommand(resource);
	}

	resolveCodeLensSymbol(resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICommand> {
		return this._proxy._resolveCodeLensSymbol(symbol);
	}
}

// --- workspace symbols

export class ExtensionHostWorkspaceSymbols {

	private _provider: vscode.WorkspaceSymbolProvider[] = [];
	private _proxy: MainThreadWorkspaceSymbols;
	private _threadService: IThreadService;
	private _commands: PluginHostCommands;

	constructor(@IThreadService threadService: IThreadService) {
		this._threadService = threadService;
		this._commands = threadService.getRemotable(PluginHostCommands);
		this._proxy = threadService.getRemotable(MainThreadWorkspaceSymbols);
		this._commands.registerCommand(MainThreadWorkspaceSymbols.CommandId, this._runAsCommand, this);
	}

	register(provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {

		this._provider.push(provider);

		// is first, register commands, do stuff
		if (this._provider.length === 1) {
			this._proxy._enable(true);
		}

		return new Disposable(() => {
			let idx = this._provider.indexOf(provider);
			if (idx >= 0) {
				this._provider.splice(idx, 1);
				if (this._provider.length === 0) {
					this._proxy._enable(false);
				}
			}
		});
	}

	private _runAsCommand(query: string): TPromise<ITypeBearing[]> {

		if (typeof query !== 'string') {
			return TPromise.wrapError('query is not string');
		}

		let symbols: vscode.SymbolInformation[] = [];
		let promises = this._provider.map(provider => {
			return asWinJsPromise(token => {
				return provider.provideWorkspaceSymbols(query, token)
			}).then(value => {
				if (Array.isArray(value)) {
					symbols.push(...value);
				}
			}, err => {
				console.error(err);
			});
		});

		return TPromise.join(promises).then(() => {
			return symbols.map(ExtensionHostWorkspaceSymbols._fromSymbolInformation);
		});
	}

	private static _fromSymbolInformation(info: vscode.SymbolInformation): ITypeBearing {
		return <ITypeBearing>{
			name: info.name,
			type: SymbolKind[info.kind || SymbolKind.Property].toLowerCase(),
			range: TypeConverters.fromRange(info.location.range),
			resourceUri: info.location.uri,
			containerName: info.containerName,
			parameters: '',
		};
	}
}

@Remotable.MainContext('MainThreadWorkspaceSymbols')
export class MainThreadWorkspaceSymbols implements INavigateTypesSupport {

	static CommandId = 'vscode.executeWorkspaceSymbolProvider';

	private _commands: PluginHostCommands;
	private _disposable: IDisposable;

	constructor(@IThreadService threadService: IThreadService) {
		this._commands = threadService.getRemotable(PluginHostCommands);
	}

	_enable(value: boolean): void {
		if (value) {
			this._disposable = NavigateTypesSupportRegistry.register(this);
		} else if (this._disposable) {
			this._disposable.dispose();
			this._disposable = undefined;
		}
	}

	getNavigateToItems(search: string): TPromise<ITypeBearing[]> {
		let value = this._commands.executeCommand<ITypeBearing[]>(MainThreadWorkspaceSymbols.CommandId, search);
		return TPromise.as(<any>value);
	}
}

export namespace LanguageFeatures {

	export function createMainThreadInstances(threadService: IThreadService): void {
		threadService.getRemotable(MainThreadDefinitionFeature);
		threadService.getRemotable(MainThreadHoverFeature);
		threadService.getRemotable(MainThreadOccurrencesFeature);
		threadService.getRemotable(MainThreadReferenceSearch);
		threadService.getRemotable(MainThreadCodeActions);
		threadService.getRemotable(MainThreadCodeLens);
		threadService.getRemotable(MainThreadDocumentSymbols);
		threadService.getRemotable(MainThreadWorkspaceSymbols);
		threadService.getRemotable(MainThreadRename);
		threadService.getRemotable(MainThreadFormatDocument);
		threadService.getRemotable(MainThreadFormatRange);
		threadService.getRemotable(MainThreadFormatOnType);
		threadService.getRemotable(MainThreadSignatureHelp);
		threadService.getRemotable(MainThreadCompletions);
	}

	export function createExtensionHostInstances(threadService: IThreadService) {
		return {
			definition: new ExtensionHostDefinitionFeature(threadService),
			hover: new ExtensionHostHoverFeature(threadService),
			documentHighlight: new ExtensionHostOccurrencesFeature(threadService),
			referenceSearch: new ExtensionHostReferenceSearch(threadService),
			codeActions: new ExtensionHostCodeActions(threadService),
			codeLens: threadService.getRemotable(ExtensionHostCodeLens),
			documentSymbols: new ExtensionHostDocumentSymbols(threadService),
			workspaceSymbols: new ExtensionHostWorkspaceSymbols(threadService),
			rename: new ExtensionHostRename(threadService),
			formatDocument: new ExtHostFormatDocument(threadService),
			formatRange: new ExtHostFormatRange(threadService),
			formatOnType: new ExtHostFormatOnType(threadService),
			signatureHelp: new ExtHostSignatureHelp(threadService),
			completions: threadService.getRemotable(ExtHostCompletions)
		};
	}
}