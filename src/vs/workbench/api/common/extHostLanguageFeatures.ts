/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { mixin } from 'vs/base/common/objects';
import * as vscode from 'vscode';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { Range, Disposable, CompletionList, SnippetString, CodeActionKind, SymbolInformation, DocumentSymbol } from 'vs/workbench/api/common/extHostTypes';
import { ISingleEditOperation } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostCommands, CommandsConverter } from 'vs/workbench/api/common/extHostCommands';
import { ExtHostDiagnostics } from 'vs/workbench/api/common/extHostDiagnostics';
import { asPromise } from 'vs/base/common/async';
import { MainContext, MainThreadLanguageFeaturesShape, ExtHostLanguageFeaturesShape, IRawColorInfo, IMainContext, IdObject, IRegExpDto, IIndentationRuleDto, IOnEnterRuleDto, ILanguageConfigurationDto, IWorkspaceSymbolDto, ISuggestResultDto, IWorkspaceSymbolsDto, ICodeActionDto, IDocumentFilterDto, IWorkspaceEditDto, ISignatureHelpProviderMetadataDto, ILinkDto, ICodeLensDto, ISuggestDataDto, ILinksListDto, ChainedCacheId, ICodeLensListDto, ICodeActionListDto, ISignatureHelpDto, ISignatureHelpContextDto } from './extHost.protocol';
import { regExpLeadsToEndlessLoop, regExpFlags } from 'vs/base/common/strings';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange, Range as EditorRange } from 'vs/editor/common/core/range';
import { isFalsyOrEmpty, isNonEmptyArray, coalesce, asArray } from 'vs/base/common/arrays';
import { isObject } from 'vs/base/common/types';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as callHierarchy from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { LRUCache } from 'vs/base/common/map';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { DisposableStore, dispose } from 'vs/base/common/lifecycle';

// --- adapter

class DocumentSymbolAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.DocumentSymbolProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.DocumentSymbolProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideDocumentSymbols(resource: URI, token: CancellationToken): Promise<modes.DocumentSymbol[] | undefined> {
		const doc = this._documents.getDocument(resource);
		return asPromise(() => this._provider.provideDocumentSymbols(doc, token)).then(value => {
			if (isFalsyOrEmpty(value)) {
				return undefined;
			} else if (value![0] instanceof DocumentSymbol) {
				return (<DocumentSymbol[]>value).map(typeConvert.DocumentSymbol.from);
			} else {
				return DocumentSymbolAdapter._asDocumentSymbolTree(<SymbolInformation[]>value);
			}
		});
	}

	private static _asDocumentSymbolTree(infos: SymbolInformation[]): modes.DocumentSymbol[] {
		// first sort by start (and end) and then loop over all elements
		// and build a tree based on containment.
		infos = infos.slice(0).sort((a, b) => {
			let res = a.location.range.start.compareTo(b.location.range.start);
			if (res === 0) {
				res = b.location.range.end.compareTo(a.location.range.end);
			}
			return res;
		});
		const res: modes.DocumentSymbol[] = [];
		const parentStack: modes.DocumentSymbol[] = [];
		for (const info of infos) {
			const element = <modes.DocumentSymbol>{
				name: info.name || '!!MISSING: name!!',
				kind: typeConvert.SymbolKind.from(info.kind),
				detail: undefined!, // Strict null override — avoid changing behavior
				containerName: info.containerName,
				range: typeConvert.Range.from(info.location.range),
				selectionRange: typeConvert.Range.from(info.location.range),
				children: []
			};

			while (true) {
				if (parentStack.length === 0) {
					parentStack.push(element);
					res.push(element);
					break;
				}
				const parent = parentStack[parentStack.length - 1];
				if (EditorRange.containsRange(parent.range, element.range) && !EditorRange.equalsRange(parent.range, element.range)) {
					if (parent.children) {
						parent.children.push(element);
					}
					parentStack.push(element);
					break;
				}
				parentStack.pop();
			}
		}
		return res;
	}
}

class CodeLensAdapter {

	private static _badCmd: vscode.Command = { command: 'missing', title: '!!MISSING: command!!' };

	private readonly _cache = new Cache<vscode.CodeLens>('CodeLens');
	private readonly _disposables = new Map<number, DisposableStore>();

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _provider: vscode.CodeLensProvider
	) { }

	provideCodeLenses(resource: URI, token: CancellationToken): Promise<ICodeLensListDto | undefined> {
		const doc = this._documents.getDocument(resource);

		return asPromise(() => this._provider.provideCodeLenses(doc, token)).then(lenses => {

			if (!lenses || token.isCancellationRequested) {
				return undefined;
			}

			const cacheId = this._cache.add(lenses);
			const disposables = new DisposableStore();
			this._disposables.set(cacheId, disposables);

			const result: ICodeLensListDto = {
				cacheId,
				lenses: [],
			};

			for (let i = 0; i < lenses.length; i++) {
				result.lenses.push({
					cacheId: [cacheId, i],
					range: typeConvert.Range.from(lenses[i].range),
					command: this._commands.toInternal(lenses[i].command, disposables)
				});
			}

			return result;
		});
	}

	resolveCodeLens(symbol: ICodeLensDto, token: CancellationToken): Promise<ICodeLensDto | undefined> {

		const lens = symbol.cacheId && this._cache.get(...symbol.cacheId);
		if (!lens) {
			return Promise.resolve(undefined);
		}

		let resolve: Promise<vscode.CodeLens | undefined | null>;
		if (typeof this._provider.resolveCodeLens !== 'function' || lens.isResolved) {
			resolve = Promise.resolve(lens);
		} else {
			resolve = asPromise(() => this._provider.resolveCodeLens!(lens, token));
		}

		return resolve.then(newLens => {
			if (token.isCancellationRequested) {
				return undefined;
			}

			const disposables = symbol.cacheId && this._disposables.get(symbol.cacheId[0]);
			if (!disposables) {
				// We've already been disposed of
				return undefined;
			}

			newLens = newLens || lens;
			symbol.command = this._commands.toInternal(newLens.command || CodeLensAdapter._badCmd, disposables);
			return symbol;
		});
	}

	releaseCodeLenses(cachedId: number): void {
		dispose(this._disposables.get(cachedId));
		this._disposables.delete(cachedId);
		this._cache.delete(cachedId);
	}
}

function convertToLocationLinks(value: vscode.Definition): modes.LocationLink[] {
	return value ? asArray(value).map(typeConvert.DefinitionLink.from) : [];
}

class DefinitionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DefinitionProvider
	) { }

	provideDefinition(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.LocationLink[]> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideDefinition(doc, pos, token)).then(convertToLocationLinks);
	}
}

class DeclarationAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DeclarationProvider
	) { }

	provideDeclaration(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.LocationLink[]> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideDeclaration(doc, pos, token)).then(convertToLocationLinks);
	}
}

class ImplementationAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.ImplementationProvider
	) { }

	provideImplementation(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.LocationLink[]> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideImplementation(doc, pos, token)).then(convertToLocationLinks);
	}
}

class TypeDefinitionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.TypeDefinitionProvider
	) { }

	provideTypeDefinition(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.LocationLink[]> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideTypeDefinition(doc, pos, token)).then(convertToLocationLinks);
	}
}

class HoverAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.HoverProvider,
	) { }

	public provideHover(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.Hover | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.provideHover(doc, pos, token)).then(value => {
			if (!value || isFalsyOrEmpty(value.contents)) {
				return undefined;
			}
			if (!value.range) {
				value.range = doc.getWordRangeAtPosition(pos);
			}
			if (!value.range) {
				value.range = new Range(pos, pos);
			}

			return typeConvert.Hover.from(value);
		});
	}
}

class DocumentHighlightAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentHighlightProvider
	) { }

	provideDocumentHighlights(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.DocumentHighlight[] | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.provideDocumentHighlights(doc, pos, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConvert.DocumentHighlight.from);
			}
			return undefined;
		});
	}
}

class ReferenceAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.ReferenceProvider
	) { }

	provideReferences(resource: URI, position: IPosition, context: modes.ReferenceContext, token: CancellationToken): Promise<modes.Location[] | undefined> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.provideReferences(doc, pos, context, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConvert.location.from);
			}
			return undefined;
		});
	}
}

export interface CustomCodeAction extends ICodeActionDto {
	_isSynthetic?: boolean;
}

class CodeActionAdapter {
	private static readonly _maxCodeActionsPerFile: number = 1000;

	private readonly _cache = new Cache<vscode.CodeAction | vscode.Command>('CodeAction');
	private readonly _disposables = new Map<number, DisposableStore>();

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _diagnostics: ExtHostDiagnostics,
		private readonly _provider: vscode.CodeActionProvider,
		private readonly _logService: ILogService,
		private readonly _extensionId: ExtensionIdentifier
	) { }

	provideCodeActions(resource: URI, rangeOrSelection: IRange | ISelection, context: modes.CodeActionContext, token: CancellationToken): Promise<ICodeActionListDto | undefined> {

		const doc = this._documents.getDocument(resource);
		const ran = Selection.isISelection(rangeOrSelection)
			? <vscode.Selection>typeConvert.Selection.to(rangeOrSelection)
			: <vscode.Range>typeConvert.Range.to(rangeOrSelection);
		const allDiagnostics: vscode.Diagnostic[] = [];

		for (const diagnostic of this._diagnostics.getDiagnostics(resource)) {
			if (ran.intersection(diagnostic.range)) {
				const newLen = allDiagnostics.push(diagnostic);
				if (newLen > CodeActionAdapter._maxCodeActionsPerFile) {
					break;
				}
			}
		}

		const codeActionContext: vscode.CodeActionContext = {
			diagnostics: allDiagnostics,
			only: context.only ? new CodeActionKind(context.only) : undefined
		};

		return asPromise(() => this._provider.provideCodeActions(doc, ran, codeActionContext, token)).then(commandsOrActions => {
			if (!isNonEmptyArray(commandsOrActions) || token.isCancellationRequested) {
				return undefined;
			}

			const cacheId = this._cache.add(commandsOrActions);
			const disposables = new DisposableStore();
			this._disposables.set(cacheId, disposables);

			const actions: CustomCodeAction[] = [];
			for (const candidate of commandsOrActions) {
				if (!candidate) {
					continue;
				}
				if (CodeActionAdapter._isCommand(candidate)) {
					// old school: synthetic code action
					actions.push({
						_isSynthetic: true,
						title: candidate.title,
						command: this._commands.toInternal(candidate, disposables),
					});
				} else {
					if (codeActionContext.only) {
						if (!candidate.kind) {
							this._logService.warn(`${this._extensionId.value} - Code actions of kind '${codeActionContext.only.value} 'requested but returned code action does not have a 'kind'. Code action will be dropped. Please set 'CodeAction.kind'.`);
						} else if (!codeActionContext.only.contains(candidate.kind)) {
							this._logService.warn(`${this._extensionId.value} - Code actions of kind '${codeActionContext.only.value} 'requested but returned code action is of kind '${candidate.kind.value}'. Code action will be dropped. Please check 'CodeActionContext.only' to only return requested code actions.`);
						}
					}

					// new school: convert code action
					actions.push({
						title: candidate.title,
						command: candidate.command && this._commands.toInternal(candidate.command, disposables),
						diagnostics: candidate.diagnostics && candidate.diagnostics.map(typeConvert.Diagnostic.from),
						edit: candidate.edit && typeConvert.WorkspaceEdit.from(candidate.edit),
						kind: candidate.kind && candidate.kind.value,
						isPreferred: candidate.isPreferred,
					});
				}
			}

			return <ICodeActionListDto>{ cacheId, actions };
		});
	}

	public releaseCodeActions(cachedId: number): void {
		dispose(this._disposables.get(cachedId));
		this._disposables.delete(cachedId);
		this._cache.delete(cachedId);
	}

	private static _isCommand(thing: any): thing is vscode.Command {
		return typeof (<vscode.Command>thing).command === 'string' && typeof (<vscode.Command>thing).title === 'string';
	}
}

class DocumentFormattingAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentFormattingEditProvider
	) { }

	provideDocumentFormattingEdits(resource: URI, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {

		const document = this._documents.getDocument(resource);

		return asPromise(() => this._provider.provideDocumentFormattingEdits(document, <any>options, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConvert.TextEdit.from);
			}
			return undefined;
		});
	}
}

class RangeFormattingAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentRangeFormattingEditProvider
	) { }

	provideDocumentRangeFormattingEdits(resource: URI, range: IRange, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {

		const document = this._documents.getDocument(resource);
		const ran = typeConvert.Range.to(range);

		return asPromise(() => this._provider.provideDocumentRangeFormattingEdits(document, ran, <any>options, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConvert.TextEdit.from);
			}
			return undefined;
		});
	}
}

class OnTypeFormattingAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.OnTypeFormattingEditProvider
	) { }

	autoFormatTriggerCharacters: string[] = []; // not here

	provideOnTypeFormattingEdits(resource: URI, position: IPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {

		const document = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.provideOnTypeFormattingEdits(document, pos, ch, <any>options, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConvert.TextEdit.from);
			}
			return undefined;
		});
	}
}

class NavigateTypeAdapter {

	private readonly _symbolCache: { [id: number]: vscode.SymbolInformation } = Object.create(null);
	private readonly _resultCache: { [id: number]: [number, number] } = Object.create(null);
	private readonly _provider: vscode.WorkspaceSymbolProvider;

	constructor(provider: vscode.WorkspaceSymbolProvider) {
		this._provider = provider;
	}

	provideWorkspaceSymbols(search: string, token: CancellationToken): Promise<IWorkspaceSymbolsDto> {
		const result: IWorkspaceSymbolsDto = IdObject.mixin({ symbols: [] });
		return asPromise(() => this._provider.provideWorkspaceSymbols(search, token)).then(value => {
			if (isNonEmptyArray(value)) {
				for (const item of value) {
					if (!item) {
						// drop
						continue;
					}
					if (!item.name) {
						console.warn('INVALID SymbolInformation, lacks name', item);
						continue;
					}
					const symbol = IdObject.mixin(typeConvert.WorkspaceSymbol.from(item));
					this._symbolCache[symbol._id!] = item;
					result.symbols.push(symbol);
				}
			}
		}).then(() => {
			if (result.symbols.length > 0) {
				this._resultCache[result._id!] = [result.symbols[0]._id!, result.symbols[result.symbols.length - 1]._id!];
			}
			return result;
		});
	}

	resolveWorkspaceSymbol(symbol: IWorkspaceSymbolDto, token: CancellationToken): Promise<IWorkspaceSymbolDto | undefined> {

		if (typeof this._provider.resolveWorkspaceSymbol !== 'function') {
			return Promise.resolve(symbol);
		}

		const item = this._symbolCache[symbol._id!];
		if (item) {
			return asPromise(() => this._provider.resolveWorkspaceSymbol!(item, token)).then(value => {
				return value && mixin(symbol, typeConvert.WorkspaceSymbol.from(value), true);
			});
		}
		return Promise.resolve(undefined);
	}

	releaseWorkspaceSymbols(id: number): any {
		const range = this._resultCache[id];
		if (range) {
			for (let [from, to] = range; from <= to; from++) {
				delete this._symbolCache[from];
			}
			delete this._resultCache[id];
		}
	}
}

class RenameAdapter {

	static supportsResolving(provider: vscode.RenameProvider): boolean {
		return typeof provider.prepareRename === 'function';
	}

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.RenameProvider
	) { }

	provideRenameEdits(resource: URI, position: IPosition, newName: string, token: CancellationToken): Promise<IWorkspaceEditDto | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.provideRenameEdits(doc, pos, newName, token)).then(value => {
			if (!value) {
				return undefined;
			}
			return typeConvert.WorkspaceEdit.from(value);
		}, err => {
			const rejectReason = RenameAdapter._asMessage(err);
			if (rejectReason) {
				return <IWorkspaceEditDto>{ rejectReason, edits: undefined! };
			} else {
				// generic error
				return Promise.reject<IWorkspaceEditDto>(err);
			}
		});
	}

	resolveRenameLocation(resource: URI, position: IPosition, token: CancellationToken): Promise<(modes.RenameLocation & modes.Rejection) | undefined> {
		if (typeof this._provider.prepareRename !== 'function') {
			return Promise.resolve(undefined);
		}

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.prepareRename!(doc, pos, token)).then(rangeOrLocation => {

			let range: vscode.Range | undefined;
			let text: string | undefined;
			if (Range.isRange(rangeOrLocation)) {
				range = rangeOrLocation;
				text = doc.getText(rangeOrLocation);

			} else if (isObject(rangeOrLocation)) {
				range = rangeOrLocation.range;
				text = rangeOrLocation.placeholder;
			}

			if (!range) {
				return undefined;
			}
			if (range.start.line > pos.line || range.end.line < pos.line) {
				console.warn('INVALID rename location: position line must be within range start/end lines');
				return undefined;
			}
			return { range: typeConvert.Range.from(range), text };
		}, err => {
			const rejectReason = RenameAdapter._asMessage(err);
			if (rejectReason) {
				return <modes.RenameLocation & modes.Rejection>{ rejectReason, range: undefined!, text: undefined! };
			} else {
				return Promise.reject<any>(err);
			}
		});
	}

	private static _asMessage(err: any): string | undefined {
		if (typeof err === 'string') {
			return err;
		} else if (err instanceof Error && typeof err.message === 'string') {
			return err.message;
		} else {
			return undefined;
		}
	}
}

class SuggestAdapter {

	static supportsResolving(provider: vscode.CompletionItemProvider): boolean {
		return typeof provider.resolveCompletionItem === 'function';
	}

	private _documents: ExtHostDocuments;
	private _commands: CommandsConverter;
	private _provider: vscode.CompletionItemProvider;

	private _cache = new Cache<vscode.CompletionItem>('CompletionItem');
	private _disposables = new Map<number, DisposableStore>();

	constructor(documents: ExtHostDocuments, commands: CommandsConverter, provider: vscode.CompletionItemProvider) {
		this._documents = documents;
		this._commands = commands;
		this._provider = provider;
	}

	provideCompletionItems(resource: URI, position: IPosition, context: modes.CompletionContext, token: CancellationToken): Promise<ISuggestResultDto | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.provideCompletionItems(doc, pos, token, typeConvert.CompletionContext.to(context))).then(value => {

			if (!value) {
				// undefined and null are valid results
				return undefined;
			}

			if (token.isCancellationRequested) {
				// cancelled -> return without further ado, esp no caching
				// of results as they will leak
				return undefined;
			}

			const list = Array.isArray(value) ? new CompletionList(value) : value;

			// keep result for providers that support resolving
			const pid: number = SuggestAdapter.supportsResolving(this._provider) ? this._cache.add(list.items) : this._cache.add([]);
			const disposables = new DisposableStore();
			this._disposables.set(pid, disposables);

			// the default text edit range
			const wordRangeBeforePos = (doc.getWordRangeAtPosition(pos) as Range || new Range(pos, pos))
				.with({ end: pos });

			const result: ISuggestResultDto = {
				x: pid,
				b: [],
				a: typeConvert.Range.from(wordRangeBeforePos),
				c: list.isIncomplete || undefined
			};

			for (let i = 0; i < list.items.length; i++) {
				const suggestion = this._convertCompletionItem(list.items[i], pos, [pid, i]);
				// check for bad completion item
				// for the converter did warn
				if (suggestion) {
					result.b.push(suggestion);
				}
			}

			return result;
		});
	}

	resolveCompletionItem(_resource: URI, position: IPosition, id: ChainedCacheId, token: CancellationToken): Promise<ISuggestDataDto | undefined> {

		if (typeof this._provider.resolveCompletionItem !== 'function') {
			return Promise.resolve(undefined);
		}

		const item = this._cache.get(...id);
		if (!item) {
			return Promise.resolve(undefined);
		}

		return asPromise(() => this._provider.resolveCompletionItem!(item, token)).then(resolvedItem => {

			if (!resolvedItem) {
				return undefined;
			}

			const pos = typeConvert.Position.to(position);
			return this._convertCompletionItem(resolvedItem, pos, id);
		});
	}

	releaseCompletionItems(id: number): any {
		dispose(this._disposables.get(id));
		this._disposables.delete(id);
		this._cache.delete(id);
	}

	private _convertCompletionItem(item: vscode.CompletionItem, position: vscode.Position, id: ChainedCacheId): ISuggestDataDto | undefined {
		if (typeof item.label !== 'string' || item.label.length === 0) {
			console.warn('INVALID text edit -> must have at least a label');
			return undefined;
		}

		const disposables = this._disposables.get(id[0]);
		if (!disposables) {
			throw Error('DisposableStore is missing...');
		}

		const result: ISuggestDataDto = {
			//
			x: id,
			//
			a: item.label,
			b: typeConvert.CompletionItemKind.from(item.kind),
			c: item.detail,
			d: typeof item.documentation === 'undefined' ? undefined : typeConvert.MarkdownString.fromStrict(item.documentation),
			e: item.sortText,
			f: item.filterText,
			g: item.preselect,
			i: item.keepWhitespace ? modes.CompletionItemInsertTextRule.KeepWhitespace : 0,
			k: item.commitCharacters,
			l: item.additionalTextEdits && item.additionalTextEdits.map(typeConvert.TextEdit.from),
			m: this._commands.toInternal(item.command, disposables),
		};

		// 'insertText'-logic
		if (item.textEdit) {
			result.h = item.textEdit.newText;

		} else if (typeof item.insertText === 'string') {
			result.h = item.insertText;

		} else if (item.insertText instanceof SnippetString) {
			result.h = item.insertText.value;
			result.i! |= modes.CompletionItemInsertTextRule.InsertAsSnippet;
		}

		// 'overwrite[Before|After]'-logic
		let range: vscode.Range | undefined;
		if (item.textEdit) {
			range = item.textEdit.range;
		} else if (item.range) {
			range = item.range;
		}
		result.j = typeConvert.Range.from(range);

		if (range && (!range.isSingleLine || range.start.line !== position.line)) {
			console.warn('INVALID text edit -> must be single line and on the same line');
			return undefined;
		}

		return result;
	}
}

class SignatureHelpAdapter {

	private readonly _cache = new Cache<vscode.SignatureHelp>('SignatureHelp');

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.SignatureHelpProvider,
	) { }

	provideSignatureHelp(resource: URI, position: IPosition, context: ISignatureHelpContextDto, token: CancellationToken): Promise<ISignatureHelpDto | undefined> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		const vscodeContext = this.reviveContext(context);

		return asPromise(() => this._provider.provideSignatureHelp(doc, pos, token, vscodeContext)).then(value => {
			if (value) {
				const id = this._cache.add([value]);
				return { ...typeConvert.SignatureHelp.from(value), id };
			}
			return undefined;
		});
	}

	private reviveContext(context: ISignatureHelpContextDto): vscode.SignatureHelpContext {
		let activeSignatureHelp: vscode.SignatureHelp | undefined = undefined;
		if (context.activeSignatureHelp) {
			const revivedSignatureHelp = typeConvert.SignatureHelp.to(context.activeSignatureHelp);
			const saved = this._cache.get(context.activeSignatureHelp.id, 0);
			if (saved) {
				activeSignatureHelp = saved;
				activeSignatureHelp.activeSignature = revivedSignatureHelp.activeSignature;
				activeSignatureHelp.activeParameter = revivedSignatureHelp.activeParameter;
			} else {
				activeSignatureHelp = revivedSignatureHelp;
			}
		}
		return { ...context, activeSignatureHelp };
	}

	releaseSignatureHelp(id: number): any {
		this._cache.delete(id);
	}
}

class Cache<T> {
	private static readonly enableDebugLogging = false;

	private readonly _data = new Map<number, readonly T[]>();
	private _idPool = 1;

	constructor(
		private readonly id: string
	) { }

	add(item: readonly T[]): number {
		const id = this._idPool++;
		this._data.set(id, item);
		this.logDebugInfo();
		return id;
	}

	get(pid: number, id: number): T | undefined {
		return this._data.has(pid) ? this._data.get(pid)![id] : undefined;
	}

	delete(id: number) {
		this._data.delete(id);
		this.logDebugInfo();
	}

	private logDebugInfo() {
		if (!Cache.enableDebugLogging) {
			return;
		}
		console.log(`${this.id} cache size — ${this._data.size}`);
	}
}

class LinkProviderAdapter {

	private _cache = new Cache<vscode.DocumentLink>('DocumentLink');

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentLinkProvider
	) { }

	provideLinks(resource: URI, token: CancellationToken): Promise<ILinksListDto | undefined> {
		const doc = this._documents.getDocument(resource);

		return asPromise(() => this._provider.provideDocumentLinks(doc, token)).then(links => {
			if (!Array.isArray(links) || links.length === 0) {
				// bad result
				return undefined;
			}

			if (token.isCancellationRequested) {
				// cancelled -> return without further ado, esp no caching
				// of results as they will leak
				return undefined;
			}

			if (typeof this._provider.resolveDocumentLink !== 'function') {
				// no resolve -> no caching
				return { links: links.map(typeConvert.DocumentLink.from) };

			} else {
				// cache links for future resolving
				const pid = this._cache.add(links);
				const result: ILinksListDto = { links: [], id: pid };
				for (let i = 0; i < links.length; i++) {
					const dto: ILinkDto = typeConvert.DocumentLink.from(links[i]);
					dto.cacheId = [pid, i];
					result.links.push(dto);
				}
				return result;
			}
		});
	}

	resolveLink(id: ChainedCacheId, token: CancellationToken): Promise<ILinkDto | undefined> {
		if (typeof this._provider.resolveDocumentLink !== 'function') {
			return Promise.resolve(undefined);
		}
		const item = this._cache.get(...id);
		if (!item) {
			return Promise.resolve(undefined);
		}
		return asPromise(() => this._provider.resolveDocumentLink!(item, token)).then(value => {
			return value && typeConvert.DocumentLink.from(value) || undefined;
		});
	}

	releaseLinks(id: number): any {
		this._cache.delete(id);
	}
}

class ColorProviderAdapter {

	constructor(
		private _documents: ExtHostDocuments,
		private _provider: vscode.DocumentColorProvider
	) { }

	provideColors(resource: URI, token: CancellationToken): Promise<IRawColorInfo[]> {
		const doc = this._documents.getDocument(resource);
		return asPromise(() => this._provider.provideDocumentColors(doc, token)).then(colors => {
			if (!Array.isArray<vscode.ColorInformation>(colors)) {
				return [];
			}

			const colorInfos: IRawColorInfo[] = colors.map(ci => {
				return {
					color: typeConvert.Color.from(ci.color),
					range: typeConvert.Range.from(ci.range)
				};
			});

			return colorInfos;
		});
	}

	provideColorPresentations(resource: URI, raw: IRawColorInfo, token: CancellationToken): Promise<modes.IColorPresentation[] | undefined> {
		const document = this._documents.getDocument(resource);
		const range = typeConvert.Range.to(raw.range);
		const color = typeConvert.Color.to(raw.color);
		return asPromise(() => this._provider.provideColorPresentations(color, { document, range }, token)).then(value => {
			if (!Array.isArray(value)) {
				return undefined;
			}
			return value.map(typeConvert.ColorPresentation.from);
		});
	}
}

class FoldingProviderAdapter {

	constructor(
		private _documents: ExtHostDocuments,
		private _provider: vscode.FoldingRangeProvider
	) { }

	provideFoldingRanges(resource: URI, context: modes.FoldingContext, token: CancellationToken): Promise<modes.FoldingRange[] | undefined> {
		const doc = this._documents.getDocument(resource);
		return asPromise(() => this._provider.provideFoldingRanges(doc, context, token)).then(ranges => {
			if (!Array.isArray(ranges)) {
				return undefined;
			}
			return ranges.map(typeConvert.FoldingRange.from);
		});
	}
}

class SelectionRangeAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.SelectionRangeProvider
	) { }

	provideSelectionRanges(resource: URI, pos: IPosition[], token: CancellationToken): Promise<modes.SelectionRange[][]> {
		const document = this._documents.getDocument(resource);
		const positions = pos.map(typeConvert.Position.to);

		return asPromise(() => this._provider.provideSelectionRanges(document, positions, token)).then(allProviderRanges => {
			if (!isNonEmptyArray(allProviderRanges)) {
				return [];
			}
			if (allProviderRanges.length !== positions.length) {
				console.warn('BAD selection ranges, provider must return ranges for each position');
				return [];
			}

			const allResults: modes.SelectionRange[][] = [];
			for (let i = 0; i < positions.length; i++) {
				const oneResult: modes.SelectionRange[] = [];
				allResults.push(oneResult);

				let last: vscode.Position | vscode.Range = positions[i];
				let selectionRange = allProviderRanges[i];

				while (true) {
					if (!selectionRange.range.contains(last)) {
						throw new Error('INVALID selection range, must contain the previous range');
					}
					oneResult.push(typeConvert.SelectionRange.from(selectionRange));
					if (!selectionRange.parent) {
						break;
					}
					last = selectionRange.range;
					selectionRange = selectionRange.parent;
				}
			}
			return allResults;
		});
	}
}

class CallHierarchyAdapter {

	// todo@joh keep object (heap service, lifecycle)
	private readonly _cache = new LRUCache<number, vscode.CallHierarchyItem>(1000, 0.8);
	private _idPool = 0;

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.CallHierarchyItemProvider
	) { }

	provideCallHierarchyItem(resource: URI, pos: IPosition, token: CancellationToken): Promise<undefined | callHierarchy.CallHierarchyItem> {
		const document = this._documents.getDocument(resource);
		const position = typeConvert.Position.to(pos);

		return asPromise(() => this._provider.provideCallHierarchyItem(document, position, token)).then(item => {
			if (!item) {
				return undefined;
			}
			return this._fromItem(item);
		});
	}

	resolveCallHierarchyItem(item: callHierarchy.CallHierarchyItem, direction: callHierarchy.CallHierarchyDirection, token: CancellationToken): Promise<[callHierarchy.CallHierarchyItem, modes.Location[]][]> {
		return asPromise(() => this._provider.resolveCallHierarchyItem(
			this._cache.get(item._id)!,
			direction as number, token) // todo@joh proper convert
		).then(data => {
			if (!data) {
				return [];
			}
			return data.map(tuple => {
				return <[callHierarchy.CallHierarchyItem, modes.Location[]]>[
					this._fromItem(tuple[0]),
					tuple[1].map(typeConvert.location.from)
				];
			});
		});
	}

	private _fromItem(item: vscode.CallHierarchyItem, _id: number = this._idPool++): callHierarchy.CallHierarchyItem {
		const res = <callHierarchy.CallHierarchyItem>{
			_id,
			name: item.name,
			detail: item.detail,
			kind: typeConvert.SymbolKind.from(item.kind),
			uri: item.uri,
			range: typeConvert.Range.from(item.range),
			selectionRange: typeConvert.Range.from(item.selectionRange),
		};
		this._cache.set(_id, item);
		return res;
	}
}

type Adapter = DocumentSymbolAdapter | CodeLensAdapter | DefinitionAdapter | HoverAdapter
	| DocumentHighlightAdapter | ReferenceAdapter | CodeActionAdapter | DocumentFormattingAdapter
	| RangeFormattingAdapter | OnTypeFormattingAdapter | NavigateTypeAdapter | RenameAdapter
	| SuggestAdapter | SignatureHelpAdapter | LinkProviderAdapter | ImplementationAdapter | TypeDefinitionAdapter
	| ColorProviderAdapter | FoldingProviderAdapter | DeclarationAdapter | SelectionRangeAdapter | CallHierarchyAdapter;

class AdapterData {
	constructor(
		readonly adapter: Adapter,
		readonly extension: IExtensionDescription | undefined
	) { }
}

export class ExtHostLanguageFeatures implements ExtHostLanguageFeaturesShape {

	private static _handlePool: number = 0;

	private readonly _uriTransformer: IURITransformer | null;
	private _proxy: MainThreadLanguageFeaturesShape;
	private _documents: ExtHostDocuments;
	private _commands: ExtHostCommands;
	private _diagnostics: ExtHostDiagnostics;
	private _adapter = new Map<number, AdapterData>();
	private readonly _logService: ILogService;

	constructor(
		mainContext: IMainContext,
		uriTransformer: IURITransformer | null,
		documents: ExtHostDocuments,
		commands: ExtHostCommands,
		diagnostics: ExtHostDiagnostics,
		logService: ILogService
	) {
		this._uriTransformer = uriTransformer;
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageFeatures);
		this._documents = documents;
		this._commands = commands;
		this._diagnostics = diagnostics;
		this._logService = logService;
	}

	private _transformDocumentSelector(selector: vscode.DocumentSelector): Array<IDocumentFilterDto> {
		return coalesce(asArray(selector).map(sel => this._doTransformDocumentSelector(sel)));
	}

	private _doTransformDocumentSelector(selector: string | vscode.DocumentFilter): IDocumentFilterDto | undefined {
		if (typeof selector === 'string') {
			return {
				$serialized: true,
				language: selector
			};
		}

		if (selector) {
			return {
				$serialized: true,
				language: selector.language,
				scheme: this._transformScheme(selector.scheme),
				pattern: typeof selector.pattern === 'undefined' ? undefined : typeConvert.GlobPattern.from(selector.pattern),
				exclusive: selector.exclusive
			};
		}

		return undefined;
	}

	private _transformScheme(scheme: string | undefined): string | undefined {
		if (this._uriTransformer && typeof scheme === 'string') {
			return this._uriTransformer.transformOutgoingScheme(scheme);
		}
		return scheme;
	}

	private _createDisposable(handle: number): Disposable {
		return new Disposable(() => {
			this._adapter.delete(handle);
			this._proxy.$unregister(handle);
		});
	}

	private _nextHandle(): number {
		return ExtHostLanguageFeatures._handlePool++;
	}

	private _withAdapter<A, R>(handle: number, ctor: { new(...args: any[]): A }, callback: (adapter: A, extension: IExtensionDescription | undefined) => Promise<R>, fallbackValue: R): Promise<R> {
		const data = this._adapter.get(handle);
		if (!data) {
			return Promise.resolve(fallbackValue);
		}

		if (data.adapter instanceof ctor) {
			let t1: number;
			if (data.extension) {
				t1 = Date.now();
				this._logService.trace(`[${data.extension.identifier.value}] INVOKE provider '${(ctor as any).name}'`);
			}
			const p = callback(data.adapter, data.extension);
			const extension = data.extension;
			if (extension) {
				Promise.resolve(p).then(
					() => this._logService.trace(`[${extension.identifier.value}] provider DONE after ${Date.now() - t1}ms`),
					err => {
						this._logService.error(`[${extension.identifier.value}] provider FAILED`);
						this._logService.error(err);
					}
				);
			}
			return p;
		}
		return Promise.reject(new Error('no adapter found'));
	}

	private _addNewAdapter(adapter: Adapter, extension: IExtensionDescription | undefined): number {
		const handle = this._nextHandle();
		this._adapter.set(handle, new AdapterData(adapter, extension));
		return handle;
	}

	private static _extLabel(ext: IExtensionDescription): string {
		return ext.displayName || ext.name;
	}

	// --- outline

	registerDocumentSymbolProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider, metadata?: vscode.DocumentSymbolProviderMetadata): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentSymbolAdapter(this._documents, provider), extension);
		const displayName = (metadata && metadata.label) || ExtHostLanguageFeatures._extLabel(extension);
		this._proxy.$registerDocumentSymbolProvider(handle, this._transformDocumentSelector(selector), displayName);
		return this._createDisposable(handle);
	}

	$provideDocumentSymbols(handle: number, resource: UriComponents, token: CancellationToken): Promise<modes.DocumentSymbol[] | undefined> {
		return this._withAdapter(handle, DocumentSymbolAdapter, adapter => adapter.provideDocumentSymbols(URI.revive(resource), token), undefined);
	}

	// --- code lens

	registerCodeLensProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
		const handle = this._nextHandle();
		const eventHandle = typeof provider.onDidChangeCodeLenses === 'function' ? this._nextHandle() : undefined;

		this._adapter.set(handle, new AdapterData(new CodeLensAdapter(this._documents, this._commands.converter, provider), extension));
		this._proxy.$registerCodeLensSupport(handle, this._transformDocumentSelector(selector), eventHandle);
		let result = this._createDisposable(handle);

		if (eventHandle !== undefined) {
			const subscription = provider.onDidChangeCodeLenses!(_ => this._proxy.$emitCodeLensEvent(eventHandle));
			result = Disposable.from(result, subscription);
		}

		return result;
	}

	$provideCodeLenses(handle: number, resource: UriComponents, token: CancellationToken): Promise<ICodeLensListDto | undefined> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.provideCodeLenses(URI.revive(resource), token), undefined);
	}

	$resolveCodeLens(handle: number, symbol: ICodeLensDto, token: CancellationToken): Promise<ICodeLensDto | undefined> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.resolveCodeLens(symbol, token), undefined);
	}

	$releaseCodeLenses(handle: number, cacheId: number): void {
		this._withAdapter(handle, CodeLensAdapter, adapter => Promise.resolve(adapter.releaseCodeLenses(cacheId)), undefined);
	}

	// --- declaration

	registerDefinitionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DefinitionAdapter(this._documents, provider), extension);
		this._proxy.$registerDefinitionSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.LocationLink[]> {
		return this._withAdapter(handle, DefinitionAdapter, adapter => adapter.provideDefinition(URI.revive(resource), position, token), []);
	}

	registerDeclarationProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DeclarationProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DeclarationAdapter(this._documents, provider), extension);
		this._proxy.$registerDeclarationSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDeclaration(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.LocationLink[]> {
		return this._withAdapter(handle, DeclarationAdapter, adapter => adapter.provideDeclaration(URI.revive(resource), position, token), []);
	}

	registerImplementationProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.ImplementationProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ImplementationAdapter(this._documents, provider), extension);
		this._proxy.$registerImplementationSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideImplementation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.LocationLink[]> {
		return this._withAdapter(handle, ImplementationAdapter, adapter => adapter.provideImplementation(URI.revive(resource), position, token), []);
	}

	registerTypeDefinitionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.TypeDefinitionProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new TypeDefinitionAdapter(this._documents, provider), extension);
		this._proxy.$registerTypeDefinitionSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideTypeDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.LocationLink[]> {
		return this._withAdapter(handle, TypeDefinitionAdapter, adapter => adapter.provideTypeDefinition(URI.revive(resource), position, token), []);
	}

	// --- extra info

	registerHoverProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.HoverProvider, extensionId?: ExtensionIdentifier): vscode.Disposable {
		const handle = this._addNewAdapter(new HoverAdapter(this._documents, provider), extension);
		this._proxy.$registerHoverProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideHover(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.Hover | undefined> {
		return this._withAdapter(handle, HoverAdapter, adapter => adapter.provideHover(URI.revive(resource), position, token), undefined);
	}

	// --- occurrences

	registerDocumentHighlightProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentHighlightAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentHighlightProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentHighlights(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.DocumentHighlight[] | undefined> {
		return this._withAdapter(handle, DocumentHighlightAdapter, adapter => adapter.provideDocumentHighlights(URI.revive(resource), position, token), undefined);
	}

	// --- references

	registerReferenceProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ReferenceAdapter(this._documents, provider), extension);
		this._proxy.$registerReferenceSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideReferences(handle: number, resource: UriComponents, position: IPosition, context: modes.ReferenceContext, token: CancellationToken): Promise<modes.Location[] | undefined> {
		return this._withAdapter(handle, ReferenceAdapter, adapter => adapter.provideReferences(URI.revive(resource), position, context, token), undefined);
	}

	// --- quick fix

	registerCodeActionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider, metadata?: vscode.CodeActionProviderMetadata): vscode.Disposable {
		const handle = this._addNewAdapter(new CodeActionAdapter(this._documents, this._commands.converter, this._diagnostics, provider, this._logService, extension.identifier), extension);
		this._proxy.$registerQuickFixSupport(handle, this._transformDocumentSelector(selector), (metadata && metadata.providedCodeActionKinds) ? metadata.providedCodeActionKinds.map(kind => kind.value) : undefined);
		return this._createDisposable(handle);
	}


	$provideCodeActions(handle: number, resource: UriComponents, rangeOrSelection: IRange | ISelection, context: modes.CodeActionContext, token: CancellationToken): Promise<ICodeActionListDto | undefined> {
		return this._withAdapter(handle, CodeActionAdapter, adapter => adapter.provideCodeActions(URI.revive(resource), rangeOrSelection, context, token), undefined);
	}

	$releaseCodeActions(handle: number, cacheId: number): void {
		this._withAdapter(handle, CodeActionAdapter, adapter => Promise.resolve(adapter.releaseCodeActions(cacheId)), undefined);
	}

	// --- formatting

	registerDocumentFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentFormattingSupport(handle, this._transformDocumentSelector(selector), extension.identifier, extension.displayName || extension.name);
		return this._createDisposable(handle);
	}

	$provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {
		return this._withAdapter(handle, DocumentFormattingAdapter, adapter => adapter.provideDocumentFormattingEdits(URI.revive(resource), options, token), undefined);
	}

	registerDocumentRangeFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new RangeFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerRangeFormattingSupport(handle, this._transformDocumentSelector(selector), extension.identifier, extension.displayName || extension.name);
		return this._createDisposable(handle);
	}

	$provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: IRange, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {
		return this._withAdapter(handle, RangeFormattingAdapter, adapter => adapter.provideDocumentRangeFormattingEdits(URI.revive(resource), range, options, token), undefined);
	}

	registerOnTypeFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new OnTypeFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerOnTypeFormattingSupport(handle, this._transformDocumentSelector(selector), triggerCharacters, extension.identifier);
		return this._createDisposable(handle);
	}

	$provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: IPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {
		return this._withAdapter(handle, OnTypeFormattingAdapter, adapter => adapter.provideOnTypeFormattingEdits(URI.revive(resource), position, ch, options, token), undefined);
	}

	// --- navigate types

	registerWorkspaceSymbolProvider(extension: IExtensionDescription, provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new NavigateTypeAdapter(provider), extension);
		this._proxy.$registerNavigateTypeSupport(handle);
		return this._createDisposable(handle);
	}

	$provideWorkspaceSymbols(handle: number, search: string, token: CancellationToken): Promise<IWorkspaceSymbolsDto> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.provideWorkspaceSymbols(search, token), { symbols: [] });
	}

	$resolveWorkspaceSymbol(handle: number, symbol: IWorkspaceSymbolDto, token: CancellationToken): Promise<IWorkspaceSymbolDto | undefined> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.resolveWorkspaceSymbol(symbol, token), undefined);
	}

	$releaseWorkspaceSymbols(handle: number, id: number): void {
		this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.releaseWorkspaceSymbols(id), undefined);
	}

	// --- rename

	registerRenameProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.RenameProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new RenameAdapter(this._documents, provider), extension);
		this._proxy.$registerRenameSupport(handle, this._transformDocumentSelector(selector), RenameAdapter.supportsResolving(provider));
		return this._createDisposable(handle);
	}

	$provideRenameEdits(handle: number, resource: UriComponents, position: IPosition, newName: string, token: CancellationToken): Promise<IWorkspaceEditDto | undefined> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.provideRenameEdits(URI.revive(resource), position, newName, token), undefined);
	}

	$resolveRenameLocation(handle: number, resource: URI, position: IPosition, token: CancellationToken): Promise<modes.RenameLocation | undefined> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.resolveRenameLocation(URI.revive(resource), position, token), undefined);
	}

	// --- suggestion

	registerCompletionItemProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new SuggestAdapter(this._documents, this._commands.converter, provider), extension);
		this._proxy.$registerSuggestSupport(handle, this._transformDocumentSelector(selector), triggerCharacters, SuggestAdapter.supportsResolving(provider), extension.identifier);
		return this._createDisposable(handle);
	}

	$provideCompletionItems(handle: number, resource: UriComponents, position: IPosition, context: modes.CompletionContext, token: CancellationToken): Promise<ISuggestResultDto | undefined> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.provideCompletionItems(URI.revive(resource), position, context, token), undefined);
	}

	$resolveCompletionItem(handle: number, resource: UriComponents, position: IPosition, id: ChainedCacheId, token: CancellationToken): Promise<ISuggestDataDto | undefined> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.resolveCompletionItem(URI.revive(resource), position, id, token), undefined);
	}

	$releaseCompletionItems(handle: number, id: number): void {
		this._withAdapter(handle, SuggestAdapter, adapter => adapter.releaseCompletionItems(id), undefined);
	}

	// --- parameter hints

	registerSignatureHelpProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, metadataOrTriggerChars: string[] | vscode.SignatureHelpProviderMetadata): vscode.Disposable {
		const metadata: ISignatureHelpProviderMetadataDto | undefined = Array.isArray(metadataOrTriggerChars)
			? { triggerCharacters: metadataOrTriggerChars, retriggerCharacters: [] }
			: metadataOrTriggerChars;

		const handle = this._addNewAdapter(new SignatureHelpAdapter(this._documents, provider), extension);
		this._proxy.$registerSignatureHelpProvider(handle, this._transformDocumentSelector(selector), metadata);
		return this._createDisposable(handle);
	}

	$provideSignatureHelp(handle: number, resource: UriComponents, position: IPosition, context: ISignatureHelpContextDto, token: CancellationToken): Promise<ISignatureHelpDto | undefined> {
		return this._withAdapter(handle, SignatureHelpAdapter, adapter => adapter.provideSignatureHelp(URI.revive(resource), position, context, token), undefined);
	}

	$releaseSignatureHelp(handle: number, id: number): void {
		this._withAdapter(handle, SignatureHelpAdapter, adapter => adapter.releaseSignatureHelp(id), undefined);
	}

	// --- links

	registerDocumentLinkProvider(extension: IExtensionDescription | undefined, selector: vscode.DocumentSelector, provider: vscode.DocumentLinkProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new LinkProviderAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentLinkProvider(handle, this._transformDocumentSelector(selector), typeof provider.resolveDocumentLink === 'function');
		return this._createDisposable(handle);
	}

	$provideDocumentLinks(handle: number, resource: UriComponents, token: CancellationToken): Promise<ILinksListDto | undefined> {
		return this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.provideLinks(URI.revive(resource), token), undefined);
	}

	$resolveDocumentLink(handle: number, id: ChainedCacheId, token: CancellationToken): Promise<ILinkDto | undefined> {
		return this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.resolveLink(id, token), undefined);
	}

	$releaseDocumentLinks(handle: number, id: number): void {
		this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.releaseLinks(id), undefined);
	}

	registerColorProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentColorProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ColorProviderAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentColorProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentColors(handle: number, resource: UriComponents, token: CancellationToken): Promise<IRawColorInfo[]> {
		return this._withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColors(URI.revive(resource), token), []);
	}

	$provideColorPresentations(handle: number, resource: UriComponents, colorInfo: IRawColorInfo, token: CancellationToken): Promise<modes.IColorPresentation[] | undefined> {
		return this._withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColorPresentations(URI.revive(resource), colorInfo, token), undefined);
	}

	registerFoldingRangeProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.FoldingRangeProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new FoldingProviderAdapter(this._documents, provider), extension);
		this._proxy.$registerFoldingRangeProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideFoldingRanges(handle: number, resource: UriComponents, context: vscode.FoldingContext, token: CancellationToken): Promise<modes.FoldingRange[] | undefined> {
		return this._withAdapter(handle, FoldingProviderAdapter, adapter => adapter.provideFoldingRanges(URI.revive(resource), context, token), undefined);
	}

	// --- smart select

	registerSelectionRangeProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.SelectionRangeProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new SelectionRangeAdapter(this._documents, provider), extension);
		this._proxy.$registerSelectionRangeProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideSelectionRanges(handle: number, resource: UriComponents, positions: IPosition[], token: CancellationToken): Promise<modes.SelectionRange[][]> {
		return this._withAdapter(handle, SelectionRangeAdapter, adapter => adapter.provideSelectionRanges(URI.revive(resource), positions, token), []);
	}

	// --- call hierarchy

	registerCallHierarchyProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CallHierarchyItemProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new CallHierarchyAdapter(this._documents, provider), extension);
		this._proxy.$registerCallHierarchyProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideCallHierarchyItem(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<undefined | callHierarchy.CallHierarchyItem> {
		return this._withAdapter(handle, CallHierarchyAdapter, adapter => adapter.provideCallHierarchyItem(URI.revive(resource), position, token), undefined);
	}

	$resolveCallHierarchyItem(handle: number, item: callHierarchy.CallHierarchyItem, direction: callHierarchy.CallHierarchyDirection, token: CancellationToken): Promise<[callHierarchy.CallHierarchyItem, modes.Location[]][]> {
		return this._withAdapter(handle, CallHierarchyAdapter, adapter => adapter.resolveCallHierarchyItem(item, direction, token), []);
	}

	// --- configuration

	private static _serializeRegExp(regExp: RegExp): IRegExpDto {
		return {
			pattern: regExp.source,
			flags: regExpFlags(regExp),
		};
	}

	private static _serializeIndentationRule(indentationRule: vscode.IndentationRule): IIndentationRuleDto {
		return {
			decreaseIndentPattern: ExtHostLanguageFeatures._serializeRegExp(indentationRule.decreaseIndentPattern),
			increaseIndentPattern: ExtHostLanguageFeatures._serializeRegExp(indentationRule.increaseIndentPattern),
			indentNextLinePattern: indentationRule.indentNextLinePattern ? ExtHostLanguageFeatures._serializeRegExp(indentationRule.indentNextLinePattern) : undefined,
			unIndentedLinePattern: indentationRule.unIndentedLinePattern ? ExtHostLanguageFeatures._serializeRegExp(indentationRule.unIndentedLinePattern) : undefined,
		};
	}

	private static _serializeOnEnterRule(onEnterRule: vscode.OnEnterRule): IOnEnterRuleDto {
		return {
			beforeText: ExtHostLanguageFeatures._serializeRegExp(onEnterRule.beforeText),
			afterText: onEnterRule.afterText ? ExtHostLanguageFeatures._serializeRegExp(onEnterRule.afterText) : undefined,
			oneLineAboveText: onEnterRule.oneLineAboveText ? ExtHostLanguageFeatures._serializeRegExp(onEnterRule.oneLineAboveText) : undefined,
			action: onEnterRule.action
		};
	}

	private static _serializeOnEnterRules(onEnterRules: vscode.OnEnterRule[]): IOnEnterRuleDto[] {
		return onEnterRules.map(ExtHostLanguageFeatures._serializeOnEnterRule);
	}

	setLanguageConfiguration(languageId: string, configuration: vscode.LanguageConfiguration): vscode.Disposable {
		let { wordPattern } = configuration;

		// check for a valid word pattern
		if (wordPattern && regExpLeadsToEndlessLoop(wordPattern)) {
			throw new Error(`Invalid language configuration: wordPattern '${wordPattern}' is not allowed to match the empty string.`);
		}

		// word definition
		if (wordPattern) {
			this._documents.setWordDefinitionFor(languageId, wordPattern);
		} else {
			this._documents.setWordDefinitionFor(languageId, undefined);
		}

		const handle = this._nextHandle();
		const serializedConfiguration: ILanguageConfigurationDto = {
			comments: configuration.comments,
			brackets: configuration.brackets,
			wordPattern: configuration.wordPattern ? ExtHostLanguageFeatures._serializeRegExp(configuration.wordPattern) : undefined,
			indentationRules: configuration.indentationRules ? ExtHostLanguageFeatures._serializeIndentationRule(configuration.indentationRules) : undefined,
			onEnterRules: configuration.onEnterRules ? ExtHostLanguageFeatures._serializeOnEnterRules(configuration.onEnterRules) : undefined,
			__electricCharacterSupport: configuration.__electricCharacterSupport,
			__characterPairSupport: configuration.__characterPairSupport,
		};
		this._proxy.$setLanguageConfiguration(handle, languageId, serializedConfiguration);
		return this._createDisposable(handle);
	}
}
