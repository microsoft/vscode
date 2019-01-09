/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { mixin } from 'vs/base/common/objects';
import * as vscode from 'vscode';
import * as typeConvert from 'vs/workbench/api/node/extHostTypeConverters';
import { Range, Disposable, CompletionList, SnippetString, CodeActionKind, SymbolInformation, DocumentSymbol } from 'vs/workbench/api/node/extHostTypes';
import { ISingleEditOperation } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { ExtHostHeapService } from 'vs/workbench/api/node/extHostHeapService';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { ExtHostCommands, CommandsConverter } from 'vs/workbench/api/node/extHostCommands';
import { ExtHostDiagnostics } from 'vs/workbench/api/node/extHostDiagnostics';
import { asPromise } from 'vs/base/common/async';
import { MainContext, MainThreadLanguageFeaturesShape, ExtHostLanguageFeaturesShape, ObjectIdentifier, IRawColorInfo, IMainContext, IdObject, ISerializedRegExp, ISerializedIndentationRule, ISerializedOnEnterRule, ISerializedLanguageConfiguration, WorkspaceSymbolDto, SuggestResultDto, WorkspaceSymbolsDto, SuggestionDto, CodeActionDto, ISerializedDocumentFilter, WorkspaceEditDto, ISerializedSignatureHelpProviderMetadata } from './extHost.protocol';
import { regExpLeadsToEndlessLoop, regExpFlags } from 'vs/base/common/strings';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange, Range as EditorRange } from 'vs/editor/common/core/range';
import { isFalsyOrEmpty, isNonEmptyArray } from 'vs/base/common/arrays';
import { isObject } from 'vs/base/common/types';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

// --- adapter

class DocumentSymbolAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.DocumentSymbolProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.DocumentSymbolProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideDocumentSymbols(resource: URI, token: CancellationToken): Promise<modes.DocumentSymbol[]> {
		let doc = this._documents.getDocumentData(resource).document;
		return asPromise(() => this._provider.provideDocumentSymbols(doc, token)).then(value => {
			if (isFalsyOrEmpty(value)) {
				return undefined;
			} else if (value[0] instanceof DocumentSymbol) {
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
		let res: modes.DocumentSymbol[] = [];
		let parentStack: modes.DocumentSymbol[] = [];
		for (const info of infos) {
			let element = <modes.DocumentSymbol>{
				name: info.name || '!!MISSING: name!!',
				kind: typeConvert.SymbolKind.from(info.kind),
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
				let parent = parentStack[parentStack.length - 1];
				if (EditorRange.containsRange(parent.range, element.range) && !EditorRange.equalsRange(parent.range, element.range)) {
					parent.children.push(element);
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

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _heapService: ExtHostHeapService,
		private readonly _provider: vscode.CodeLensProvider
	) { }

	provideCodeLenses(resource: URI, token: CancellationToken): Promise<modes.ICodeLensSymbol[]> {
		const doc = this._documents.getDocumentData(resource).document;

		return asPromise(() => this._provider.provideCodeLenses(doc, token)).then(lenses => {
			if (Array.isArray(lenses)) {
				return lenses.map(lens => {
					const id = this._heapService.keep(lens);
					return ObjectIdentifier.mixin({
						range: typeConvert.Range.from(lens.range),
						command: this._commands.toInternal(lens.command)
					}, id);
				});
			}
			return undefined;
		});
	}

	resolveCodeLens(resource: URI, symbol: modes.ICodeLensSymbol, token: CancellationToken): Promise<modes.ICodeLensSymbol> {

		const lens = this._heapService.get<vscode.CodeLens>(ObjectIdentifier.of(symbol));
		if (!lens) {
			return undefined;
		}

		let resolve: Promise<vscode.CodeLens>;
		if (typeof this._provider.resolveCodeLens !== 'function' || lens.isResolved) {
			resolve = Promise.resolve(lens);
		} else {
			resolve = asPromise(() => this._provider.resolveCodeLens(lens, token));
		}

		return resolve.then(newLens => {
			newLens = newLens || lens;
			symbol.command = this._commands.toInternal(newLens.command || CodeLensAdapter._badCmd);
			return symbol;
		});
	}
}

function convertToDefinitionLinks(value: vscode.Definition): modes.DefinitionLink[] {
	if (Array.isArray(value)) {
		return (value as (vscode.DefinitionLink | vscode.Location)[]).map(typeConvert.DefinitionLink.from);
	} else if (value) {
		return [typeConvert.DefinitionLink.from(value)];
	}
	return undefined;
}

class DefinitionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DefinitionProvider
	) { }

	provideDefinition(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.DefinitionLink[]> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideDefinition(doc, pos, token)).then(convertToDefinitionLinks);
	}
}

class DeclarationAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DeclarationProvider
	) { }

	provideDeclaration(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.DefinitionLink[]> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideDeclaration(doc, pos, token)).then(convertToDefinitionLinks);
	}
}

class ImplementationAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.ImplementationProvider
	) { }

	provideImplementation(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.DefinitionLink[]> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideImplementation(doc, pos, token)).then(convertToDefinitionLinks);
	}
}

class TypeDefinitionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.TypeDefinitionProvider
	) { }

	provideTypeDefinition(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.DefinitionLink[]> {
		const doc = this._documents.getDocumentData(resource).document;
		const pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideTypeDefinition(doc, pos, token)).then(convertToDefinitionLinks);
	}
}

class HoverAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.HoverProvider,
	) { }

	public provideHover(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.Hover> {

		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

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

	provideDocumentHighlights(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.DocumentHighlight[]> {

		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

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

	provideReferences(resource: URI, position: IPosition, context: modes.ReferenceContext, token: CancellationToken): Promise<modes.Location[]> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.provideReferences(doc, pos, context, token)).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConvert.location.from);
			}
			return undefined;
		});
	}
}

export interface CustomCodeAction extends CodeActionDto {
	_isSynthetic?: boolean;
}

class CodeActionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _diagnostics: ExtHostDiagnostics,
		private readonly _provider: vscode.CodeActionProvider,
		private readonly _logService: ILogService,
		private readonly _extensionId: ExtensionIdentifier
	) { }

	provideCodeActions(resource: URI, rangeOrSelection: IRange | ISelection, context: modes.CodeActionContext, token: CancellationToken): Promise<CodeActionDto[]> {

		const doc = this._documents.getDocumentData(resource).document;
		const ran = Selection.isISelection(rangeOrSelection)
			? <vscode.Selection>typeConvert.Selection.to(rangeOrSelection)
			: <vscode.Range>typeConvert.Range.to(rangeOrSelection);
		const allDiagnostics: vscode.Diagnostic[] = [];

		for (const diagnostic of this._diagnostics.getDiagnostics(resource)) {
			if (ran.intersection(diagnostic.range)) {
				allDiagnostics.push(diagnostic);
			}
		}

		const codeActionContext: vscode.CodeActionContext = {
			diagnostics: allDiagnostics,
			only: context.only ? new CodeActionKind(context.only) : undefined
		};

		return asPromise(() => this._provider.provideCodeActions(doc, ran, codeActionContext, token)).then(commandsOrActions => {
			if (isFalsyOrEmpty(commandsOrActions)) {
				return undefined;
			}
			const result: CustomCodeAction[] = [];
			for (const candidate of commandsOrActions) {
				if (!candidate) {
					continue;
				}
				if (CodeActionAdapter._isCommand(candidate)) {
					// old school: synthetic code action
					result.push({
						_isSynthetic: true,
						title: candidate.title,
						command: this._commands.toInternal(candidate),
					});
				} else {
					if (codeActionContext.only) {
						if (!candidate.kind) {
							this._logService.warn(`${this._extensionId.value} - Code actions of kind '${codeActionContext.only.value} 'requested but returned code action does not have a 'kind'. Code action will be dropped. Please set 'CodeAction.kind'.`);
						} else if (!codeActionContext.only.contains(candidate.kind)) {
							this._logService.warn(`${this._extensionId.value} -Code actions of kind '${codeActionContext.only.value} 'requested but returned code action is of kind '${candidate.kind.value}'. Code action will be dropped. Please check 'CodeActionContext.only' to only return requested code actions.`);
						}
					}

					// new school: convert code action
					result.push({
						title: candidate.title,
						command: candidate.command && this._commands.toInternal(candidate.command),
						diagnostics: candidate.diagnostics && candidate.diagnostics.map(typeConvert.Diagnostic.from),
						edit: candidate.edit && typeConvert.WorkspaceEdit.from(candidate.edit),
						kind: candidate.kind && candidate.kind.value
					});
				}
			}

			return result;
		});
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

	provideDocumentFormattingEdits(resource: URI, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> {

		const { document } = this._documents.getDocumentData(resource);

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

	provideDocumentRangeFormattingEdits(resource: URI, range: IRange, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> {

		const { document } = this._documents.getDocumentData(resource);
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

	provideOnTypeFormattingEdits(resource: URI, position: IPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> {

		const { document } = this._documents.getDocumentData(resource);
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

	provideWorkspaceSymbols(search: string, token: CancellationToken): Promise<WorkspaceSymbolsDto> {
		const result: WorkspaceSymbolsDto = IdObject.mixin({ symbols: [] });
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
					this._symbolCache[symbol._id] = item;
					result.symbols.push(symbol);
				}
			}
		}).then(() => {
			if (result.symbols.length > 0) {
				this._resultCache[result._id] = [result.symbols[0]._id, result.symbols[result.symbols.length - 1]._id];
			}
			return result;
		});
	}

	resolveWorkspaceSymbol(symbol: WorkspaceSymbolDto, token: CancellationToken): Promise<WorkspaceSymbolDto> {

		if (typeof this._provider.resolveWorkspaceSymbol !== 'function') {
			return Promise.resolve(symbol);
		}

		const item = this._symbolCache[symbol._id];
		if (item) {
			return asPromise(() => this._provider.resolveWorkspaceSymbol(item, token)).then(value => {
				return value && mixin(symbol, typeConvert.WorkspaceSymbol.from(value), true);
			});
		}
		return undefined;
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

	provideRenameEdits(resource: URI, position: IPosition, newName: string, token: CancellationToken): Promise<WorkspaceEditDto> {

		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.provideRenameEdits(doc, pos, newName, token)).then(value => {
			if (!value) {
				return undefined;
			}
			return typeConvert.WorkspaceEdit.from(value);
		}, err => {
			let rejectReason = RenameAdapter._asMessage(err);
			if (rejectReason) {
				return <WorkspaceEditDto>{ rejectReason, edits: undefined };
			} else {
				// generic error
				return Promise.reject<WorkspaceEditDto>(err);
			}
		});
	}

	resolveRenameLocation(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.RenameLocation & modes.Rejection> {
		if (typeof this._provider.prepareRename !== 'function') {
			return Promise.resolve(undefined);
		}

		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

		return asPromise(() => this._provider.prepareRename(doc, pos, token)).then(rangeOrLocation => {

			let range: vscode.Range;
			let text: string;
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
			let rejectReason = RenameAdapter._asMessage(err);
			if (rejectReason) {
				return <modes.RenameLocation & modes.Rejection>{ rejectReason, range: undefined, text: undefined };
			} else {
				return Promise.reject(err);
			}
		});
	}

	private static _asMessage(err: any): string {
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

	private _cache = new Map<number, vscode.CompletionItem[]>();
	private _idPool = 0;

	constructor(documents: ExtHostDocuments, commands: CommandsConverter, provider: vscode.CompletionItemProvider) {
		this._documents = documents;
		this._commands = commands;
		this._provider = provider;
	}

	provideCompletionItems(resource: URI, position: IPosition, context: modes.CompletionContext, token: CancellationToken): Promise<SuggestResultDto> {

		const doc = this._documents.getDocumentData(resource).document;
		const pos = typeConvert.Position.to(position);

		return asPromise<vscode.CompletionItem[] | vscode.CompletionList>(
			() => this._provider.provideCompletionItems(doc, pos, token, typeConvert.CompletionContext.to(context))
		).then(value => {

			const _id = this._idPool++;

			const result: SuggestResultDto = {
				_id,
				suggestions: [],
			};

			let list: CompletionList;
			if (!value) {
				// undefined and null are valid results
				return undefined;

			} else if (Array.isArray(value)) {
				list = new CompletionList(value);

			} else {
				list = value;
				result.incomplete = list.isIncomplete;
			}

			// the default text edit range
			const wordRangeBeforePos = (doc.getWordRangeAtPosition(pos) as Range || new Range(pos, pos))
				.with({ end: pos });

			for (let i = 0; i < list.items.length; i++) {
				const suggestion = this._convertCompletionItem(list.items[i], pos, wordRangeBeforePos, i, _id);
				// check for bad completion item
				// for the converter did warn
				if (suggestion) {
					result.suggestions.push(suggestion);
				}
			}
			this._cache.set(_id, list.items);

			return result;
		});
	}

	resolveCompletionItem(resource: URI, position: IPosition, suggestion: modes.CompletionItem, token: CancellationToken): Promise<modes.CompletionItem> {

		if (typeof this._provider.resolveCompletionItem !== 'function') {
			return Promise.resolve(suggestion);
		}

		const { _parentId, _id } = (<SuggestionDto>suggestion);
		const item = this._cache.has(_parentId) && this._cache.get(_parentId)[_id];
		if (!item) {
			return Promise.resolve(suggestion);
		}

		return asPromise(() => this._provider.resolveCompletionItem(item, token)).then(resolvedItem => {

			if (!resolvedItem) {
				return suggestion;
			}

			const doc = this._documents.getDocumentData(resource).document;
			const pos = typeConvert.Position.to(position);
			const wordRangeBeforePos = (doc.getWordRangeAtPosition(pos) as Range || new Range(pos, pos)).with({ end: pos });
			const newSuggestion = this._convertCompletionItem(resolvedItem, pos, wordRangeBeforePos, _id, _parentId);
			if (newSuggestion) {
				mixin(suggestion, newSuggestion, true);
			}

			return suggestion;
		});
	}

	releaseCompletionItems(id: number): any {
		this._cache.delete(id);
	}

	private _convertCompletionItem(item: vscode.CompletionItem, position: vscode.Position, defaultRange: vscode.Range, _id: number, _parentId: number): SuggestionDto {
		if (typeof item.label !== 'string' || item.label.length === 0) {
			console.warn('INVALID text edit -> must have at least a label');
			return undefined;
		}

		const result: SuggestionDto = {
			//
			_id,
			_parentId,
			//
			label: item.label,
			kind: typeConvert.CompletionItemKind.from(item.kind),
			detail: item.detail,
			documentation: typeConvert.MarkdownString.fromStrict(item.documentation),
			filterText: item.filterText,
			sortText: item.sortText,
			preselect: item.preselect,
			//
			range: undefined,
			insertText: undefined,
			insertTextRules: item.keepWhitespace ? modes.CompletionItemInsertTextRule.KeepWhitespace : 0,
			additionalTextEdits: item.additionalTextEdits && item.additionalTextEdits.map(typeConvert.TextEdit.from),
			command: this._commands.toInternal(item.command),
			commitCharacters: item.commitCharacters
		};

		// 'insertText'-logic
		if (item.textEdit) {
			result.insertText = item.textEdit.newText;

		} else if (typeof item.insertText === 'string') {
			result.insertText = item.insertText;

		} else if (item.insertText instanceof SnippetString) {
			result.insertText = item.insertText.value;
			result.insertTextRules += modes.CompletionItemInsertTextRule.InsertAsSnippet;

		} else {
			result.insertText = item.label;
		}

		// 'overwrite[Before|After]'-logic
		let range: vscode.Range;
		if (item.textEdit) {
			range = item.textEdit.range;
		} else if (item.range) {
			range = item.range;
		} else {
			range = defaultRange;
		}
		result.range = typeConvert.Range.from(range);

		if (!range.isSingleLine || range.start.line !== position.line) {
			console.warn('INVALID text edit -> must be single line and on the same line');
			return undefined;
		}

		return result;
	}
}

class SignatureHelpAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.SignatureHelpProvider,
		private readonly _heap: ExtHostHeapService,
	) { }

	provideSignatureHelp(resource: URI, position: IPosition, context: modes.SignatureHelpContext, token: CancellationToken): Promise<modes.SignatureHelp> {
		const doc = this._documents.getDocumentData(resource).document;
		const pos = typeConvert.Position.to(position);
		const vscodeContext = this.reviveContext(context);

		return asPromise(() => this._provider.provideSignatureHelp(doc, pos, token, vscodeContext)).then(value => {
			if (value) {
				const id = this._heap.keep(value);
				return ObjectIdentifier.mixin(typeConvert.SignatureHelp.from(value), id);
			}
			return undefined;
		});
	}

	private reviveContext(context: modes.SignatureHelpContext): vscode.SignatureHelpContext {
		let activeSignatureHelp: vscode.SignatureHelp | undefined = undefined;
		if (context.activeSignatureHelp) {
			const saved = this._heap.get<vscode.SignatureHelp>(ObjectIdentifier.of(context.activeSignatureHelp));
			if (saved) {
				activeSignatureHelp = saved;
			} else {
				activeSignatureHelp = typeConvert.SignatureHelp.to(context.activeSignatureHelp);
			}
		}
		return { ...context, activeSignatureHelp };
	}
}

class LinkProviderAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _heapService: ExtHostHeapService,
		private readonly _provider: vscode.DocumentLinkProvider
	) { }

	provideLinks(resource: URI, token: CancellationToken): Promise<modes.ILink[]> {
		const doc = this._documents.getDocumentData(resource).document;

		return asPromise(() => this._provider.provideDocumentLinks(doc, token)).then(links => {
			if (!Array.isArray(links)) {
				return undefined;
			}
			const result: modes.ILink[] = [];
			for (const link of links) {
				let data = typeConvert.DocumentLink.from(link);
				let id = this._heapService.keep(link);
				ObjectIdentifier.mixin(data, id);
				result.push(data);
			}
			return result;
		});
	}

	resolveLink(link: modes.ILink, token: CancellationToken): Promise<modes.ILink> {
		if (typeof this._provider.resolveDocumentLink !== 'function') {
			return undefined;
		}

		const id = ObjectIdentifier.of(link);
		const item = this._heapService.get<vscode.DocumentLink>(id);
		if (!item) {
			return undefined;
		}

		return asPromise(() => this._provider.resolveDocumentLink(item, token)).then(value => {
			if (value) {
				return typeConvert.DocumentLink.from(value);
			}
			return undefined;
		});
	}
}

class ColorProviderAdapter {

	constructor(
		private _documents: ExtHostDocuments,
		private _provider: vscode.DocumentColorProvider
	) { }

	provideColors(resource: URI, token: CancellationToken): Promise<IRawColorInfo[]> {
		const doc = this._documents.getDocumentData(resource).document;
		return asPromise(() => this._provider.provideDocumentColors(doc, token)).then(colors => {
			if (!Array.isArray(colors)) {
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

	provideColorPresentations(resource: URI, raw: IRawColorInfo, token: CancellationToken): Promise<modes.IColorPresentation[]> {
		const document = this._documents.getDocumentData(resource).document;
		const range = typeConvert.Range.to(raw.range);
		const color = typeConvert.Color.to(raw.color);
		return asPromise(() => this._provider.provideColorPresentations(color, { document, range }, token)).then(value => {
			return value.map(typeConvert.ColorPresentation.from);
		});
	}
}

class FoldingProviderAdapter {

	constructor(
		private _documents: ExtHostDocuments,
		private _provider: vscode.FoldingRangeProvider
	) { }

	provideFoldingRanges(resource: URI, context: modes.FoldingContext, token: CancellationToken): Promise<modes.FoldingRange[]> {
		const doc = this._documents.getDocumentData(resource).document;
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

	provideSelectionRanges(resource: URI, position: IPosition, token: CancellationToken): Promise<modes.SelectionRange[]> {
		const { document } = this._documents.getDocumentData(resource);
		const pos = typeConvert.Position.to(position);
		return asPromise(() => this._provider.provideSelectionRanges(document, pos, token)).then(selectionRanges => {
			if (isFalsyOrEmpty(selectionRanges)) {
				return undefined;
			}
			let result: modes.SelectionRange[] = [];
			let last: vscode.Position | vscode.Range = pos;
			for (const sel of selectionRanges) {
				if (!sel.range.contains(last)) {
					throw new Error('INVALID selection range, must contain the previous range');
				}
				result.push(typeConvert.SelectionRange.from(sel));
				last = sel.range;
			}
			return result;
		});
	}
}

type Adapter = DocumentSymbolAdapter | CodeLensAdapter | DefinitionAdapter | HoverAdapter
	| DocumentHighlightAdapter | ReferenceAdapter | CodeActionAdapter | DocumentFormattingAdapter
	| RangeFormattingAdapter | OnTypeFormattingAdapter | NavigateTypeAdapter | RenameAdapter
	| SuggestAdapter | SignatureHelpAdapter | LinkProviderAdapter | ImplementationAdapter | TypeDefinitionAdapter
	| ColorProviderAdapter | FoldingProviderAdapter | DeclarationAdapter | SelectionRangeAdapter;

class AdapterData {
	constructor(
		readonly adapter: Adapter,
		readonly extension: IExtensionDescription | undefined
	) { }
}

export interface ISchemeTransformer {
	transformOutgoing(scheme: string): string;
}

export class ExtHostLanguageFeatures implements ExtHostLanguageFeaturesShape {

	private static _handlePool: number = 0;

	private readonly _schemeTransformer: ISchemeTransformer;
	private _proxy: MainThreadLanguageFeaturesShape;
	private _documents: ExtHostDocuments;
	private _commands: ExtHostCommands;
	private _heapService: ExtHostHeapService;
	private _diagnostics: ExtHostDiagnostics;
	private _adapter = new Map<number, AdapterData>();
	private readonly _logService: ILogService;

	constructor(
		mainContext: IMainContext,
		schemeTransformer: ISchemeTransformer,
		documents: ExtHostDocuments,
		commands: ExtHostCommands,
		heapMonitor: ExtHostHeapService,
		diagnostics: ExtHostDiagnostics,
		logService: ILogService
	) {
		this._schemeTransformer = schemeTransformer;
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageFeatures);
		this._documents = documents;
		this._commands = commands;
		this._heapService = heapMonitor;
		this._diagnostics = diagnostics;
		this._logService = logService;
	}

	private _transformDocumentSelector(selector: vscode.DocumentSelector): ISerializedDocumentFilter[] {
		if (Array.isArray(selector)) {
			return selector.map(sel => this._doTransformDocumentSelector(sel));
		}

		return [this._doTransformDocumentSelector(selector)];
	}

	private _doTransformDocumentSelector(selector: string | vscode.DocumentFilter): ISerializedDocumentFilter {
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
				pattern: selector.pattern,
				exclusive: selector.exclusive
			};
		}

		return undefined;
	}

	private _transformScheme(scheme: string): string {
		if (this._schemeTransformer && typeof scheme === 'string') {
			return this._schemeTransformer.transformOutgoing(scheme);
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

	private _withAdapter<A, R>(handle: number, ctor: { new(...args: any[]): A }, callback: (adapter: A) => Promise<R>): Promise<R> {
		let data = this._adapter.get(handle);
		if (data.adapter instanceof ctor) {
			let t1: number;
			if (data.extension) {
				t1 = Date.now();
				this._logService.trace(`[${data.extension.identifier.value}] INVOKE provider '${(ctor as any).name}'`);
			}
			let p = callback(data.adapter);
			if (data.extension) {
				Promise.resolve(p).then(
					() => this._logService.trace(`[${data.extension.identifier.value}] provider DONE after ${Date.now() - t1}ms`),
					err => {
						this._logService.error(`[${data.extension.identifier.value}] provider FAILED`);
						this._logService.error(err);
					}
				);
			}
			return p;
		}
		return Promise.reject(new Error('no adapter found'));
	}

	private _addNewAdapter(adapter: Adapter, extension: IExtensionDescription): number {
		const handle = this._nextHandle();
		this._adapter.set(handle, new AdapterData(adapter, extension));
		return handle;
	}

	// --- outline

	registerDocumentSymbolProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider, metadata?: vscode.DocumentSymbolProviderMetadata): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentSymbolAdapter(this._documents, provider), extension);
		const displayName = (metadata && metadata.label) || (extension && (extension.displayName || extension.name)) || undefined;
		this._proxy.$registerOutlineSupport(handle, this._transformDocumentSelector(selector), displayName);
		return this._createDisposable(handle);
	}

	$provideDocumentSymbols(handle: number, resource: UriComponents, token: CancellationToken): Promise<modes.DocumentSymbol[]> {
		return this._withAdapter(handle, DocumentSymbolAdapter, adapter => adapter.provideDocumentSymbols(URI.revive(resource), token));
	}

	// --- code lens

	registerCodeLensProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
		const handle = this._nextHandle();
		const eventHandle = typeof provider.onDidChangeCodeLenses === 'function' ? this._nextHandle() : undefined;

		this._adapter.set(handle, new AdapterData(new CodeLensAdapter(this._documents, this._commands.converter, this._heapService, provider), extension));
		this._proxy.$registerCodeLensSupport(handle, this._transformDocumentSelector(selector), eventHandle);
		let result = this._createDisposable(handle);

		if (eventHandle !== undefined) {
			const subscription = provider.onDidChangeCodeLenses(_ => this._proxy.$emitCodeLensEvent(eventHandle));
			result = Disposable.from(result, subscription);
		}

		return result;
	}

	$provideCodeLenses(handle: number, resource: UriComponents, token: CancellationToken): Promise<modes.ICodeLensSymbol[]> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.provideCodeLenses(URI.revive(resource), token));
	}

	$resolveCodeLens(handle: number, resource: UriComponents, symbol: modes.ICodeLensSymbol, token: CancellationToken): Promise<modes.ICodeLensSymbol> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.resolveCodeLens(URI.revive(resource), symbol, token));
	}

	// --- declaration

	registerDefinitionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DefinitionAdapter(this._documents, provider), extension);
		this._proxy.$registerDefinitionSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.DefinitionLink[]> {
		return this._withAdapter(handle, DefinitionAdapter, adapter => adapter.provideDefinition(URI.revive(resource), position, token));
	}

	registerDeclarationProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DeclarationProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DeclarationAdapter(this._documents, provider), extension);
		this._proxy.$registerDeclarationSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDeclaration(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.DefinitionLink[]> {
		return this._withAdapter(handle, DeclarationAdapter, adapter => adapter.provideDeclaration(URI.revive(resource), position, token));
	}

	registerImplementationProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.ImplementationProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ImplementationAdapter(this._documents, provider), extension);
		this._proxy.$registerImplementationSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideImplementation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.DefinitionLink[]> {
		return this._withAdapter(handle, ImplementationAdapter, adapter => adapter.provideImplementation(URI.revive(resource), position, token));
	}

	registerTypeDefinitionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.TypeDefinitionProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new TypeDefinitionAdapter(this._documents, provider), extension);
		this._proxy.$registerTypeDefinitionSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideTypeDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.DefinitionLink[]> {
		return this._withAdapter(handle, TypeDefinitionAdapter, adapter => adapter.provideTypeDefinition(URI.revive(resource), position, token));
	}

	// --- extra info

	registerHoverProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.HoverProvider, extensionId?: ExtensionIdentifier): vscode.Disposable {
		const handle = this._addNewAdapter(new HoverAdapter(this._documents, provider), extension);
		this._proxy.$registerHoverProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideHover(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.Hover> {
		return this._withAdapter(handle, HoverAdapter, adapter => adapter.provideHover(URI.revive(resource), position, token));
	}

	// --- occurrences

	registerDocumentHighlightProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentHighlightAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentHighlightProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentHighlights(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.DocumentHighlight[]> {
		return this._withAdapter(handle, DocumentHighlightAdapter, adapter => adapter.provideDocumentHighlights(URI.revive(resource), position, token));
	}

	// --- references

	registerReferenceProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ReferenceAdapter(this._documents, provider), extension);
		this._proxy.$registerReferenceSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideReferences(handle: number, resource: UriComponents, position: IPosition, context: modes.ReferenceContext, token: CancellationToken): Promise<modes.Location[]> {
		return this._withAdapter(handle, ReferenceAdapter, adapter => adapter.provideReferences(URI.revive(resource), position, context, token));
	}

	// --- quick fix

	registerCodeActionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider, metadata?: vscode.CodeActionProviderMetadata): vscode.Disposable {
		const handle = this._addNewAdapter(new CodeActionAdapter(this._documents, this._commands.converter, this._diagnostics, provider, this._logService, extension.identifier), extension);
		this._proxy.$registerQuickFixSupport(handle, this._transformDocumentSelector(selector), metadata && metadata.providedCodeActionKinds ? metadata.providedCodeActionKinds.map(kind => kind.value) : undefined);
		return this._createDisposable(handle);
	}


	$provideCodeActions(handle: number, resource: UriComponents, rangeOrSelection: IRange | ISelection, context: modes.CodeActionContext, token: CancellationToken): Promise<CodeActionDto[]> {
		return this._withAdapter(handle, CodeActionAdapter, adapter => adapter.provideCodeActions(URI.revive(resource), rangeOrSelection, context, token));
	}

	// --- formatting

	registerDocumentFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentFormattingSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> {
		return this._withAdapter(handle, DocumentFormattingAdapter, adapter => adapter.provideDocumentFormattingEdits(URI.revive(resource), options, token));
	}

	registerDocumentRangeFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new RangeFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerRangeFormattingSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: IRange, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> {
		return this._withAdapter(handle, RangeFormattingAdapter, adapter => adapter.provideDocumentRangeFormattingEdits(URI.revive(resource), range, options, token));
	}

	registerOnTypeFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new OnTypeFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerOnTypeFormattingSupport(handle, this._transformDocumentSelector(selector), triggerCharacters);
		return this._createDisposable(handle);
	}

	$provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: IPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[]> {
		return this._withAdapter(handle, OnTypeFormattingAdapter, adapter => adapter.provideOnTypeFormattingEdits(URI.revive(resource), position, ch, options, token));
	}

	// --- navigate types

	registerWorkspaceSymbolProvider(extension: IExtensionDescription, provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new NavigateTypeAdapter(provider), extension);
		this._proxy.$registerNavigateTypeSupport(handle);
		return this._createDisposable(handle);
	}

	$provideWorkspaceSymbols(handle: number, search: string, token: CancellationToken): Promise<WorkspaceSymbolsDto> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.provideWorkspaceSymbols(search, token));
	}

	$resolveWorkspaceSymbol(handle: number, symbol: WorkspaceSymbolDto, token: CancellationToken): Promise<WorkspaceSymbolDto> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.resolveWorkspaceSymbol(symbol, token));
	}

	$releaseWorkspaceSymbols(handle: number, id: number): void {
		this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.releaseWorkspaceSymbols(id));
	}

	// --- rename

	registerRenameProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.RenameProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new RenameAdapter(this._documents, provider), extension);
		this._proxy.$registerRenameSupport(handle, this._transformDocumentSelector(selector), RenameAdapter.supportsResolving(provider));
		return this._createDisposable(handle);
	}

	$provideRenameEdits(handle: number, resource: UriComponents, position: IPosition, newName: string, token: CancellationToken): Promise<WorkspaceEditDto> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.provideRenameEdits(URI.revive(resource), position, newName, token));
	}

	$resolveRenameLocation(handle: number, resource: URI, position: IPosition, token: CancellationToken): Promise<modes.RenameLocation> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.resolveRenameLocation(URI.revive(resource), position, token));
	}

	// --- suggestion

	registerCompletionItemProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new SuggestAdapter(this._documents, this._commands.converter, provider), extension);
		this._proxy.$registerSuggestSupport(handle, this._transformDocumentSelector(selector), triggerCharacters, SuggestAdapter.supportsResolving(provider));
		return this._createDisposable(handle);
	}

	$provideCompletionItems(handle: number, resource: UriComponents, position: IPosition, context: modes.CompletionContext, token: CancellationToken): Promise<SuggestResultDto> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.provideCompletionItems(URI.revive(resource), position, context, token));
	}

	$resolveCompletionItem(handle: number, resource: UriComponents, position: IPosition, suggestion: modes.CompletionItem, token: CancellationToken): Promise<modes.CompletionItem> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.resolveCompletionItem(URI.revive(resource), position, suggestion, token));
	}

	$releaseCompletionItems(handle: number, id: number): void {
		this._withAdapter(handle, SuggestAdapter, adapter => adapter.releaseCompletionItems(id));
	}

	// --- parameter hints

	registerSignatureHelpProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, metadataOrTriggerChars?: string[] | vscode.SignatureHelpProviderMetadata): vscode.Disposable {
		const metadata: ISerializedSignatureHelpProviderMetadata = Array.isArray(metadataOrTriggerChars)
			? { triggerCharacters: metadataOrTriggerChars, retriggerCharacters: [] }
			: metadataOrTriggerChars;

		const handle = this._addNewAdapter(new SignatureHelpAdapter(this._documents, provider, this._heapService), extension);
		this._proxy.$registerSignatureHelpProvider(handle, this._transformDocumentSelector(selector), metadata);
		return this._createDisposable(handle);
	}

	$provideSignatureHelp(handle: number, resource: UriComponents, position: IPosition, context: modes.SignatureHelpContext, token: CancellationToken): Promise<modes.SignatureHelp> {
		return this._withAdapter(handle, SignatureHelpAdapter, adapter => adapter.provideSignatureHelp(URI.revive(resource), position, context, token));
	}

	// --- links

	registerDocumentLinkProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentLinkProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new LinkProviderAdapter(this._documents, this._heapService, provider), extension);
		this._proxy.$registerDocumentLinkProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentLinks(handle: number, resource: UriComponents, token: CancellationToken): Promise<modes.ILink[]> {
		return this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.provideLinks(URI.revive(resource), token));
	}

	$resolveDocumentLink(handle: number, link: modes.ILink, token: CancellationToken): Promise<modes.ILink> {
		return this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.resolveLink(link, token));
	}

	registerColorProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentColorProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ColorProviderAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentColorProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentColors(handle: number, resource: UriComponents, token: CancellationToken): Promise<IRawColorInfo[]> {
		return this._withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColors(URI.revive(resource), token));
	}

	$provideColorPresentations(handle: number, resource: UriComponents, colorInfo: IRawColorInfo, token: CancellationToken): Promise<modes.IColorPresentation[]> {
		return this._withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColorPresentations(URI.revive(resource), colorInfo, token));
	}

	registerFoldingRangeProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.FoldingRangeProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new FoldingProviderAdapter(this._documents, provider), extension);
		this._proxy.$registerFoldingRangeProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideFoldingRanges(handle: number, resource: UriComponents, context: vscode.FoldingContext, token: CancellationToken): Promise<modes.FoldingRange[]> {
		return this._withAdapter(handle, FoldingProviderAdapter, adapter => adapter.provideFoldingRanges(URI.revive(resource), context, token));
	}

	// --- smart select

	registerSelectionRangeProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.SelectionRangeProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new SelectionRangeAdapter(this._documents, provider), extension);
		this._proxy.$registerSelectionRangeProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideSelectionRanges(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<modes.SelectionRange[]> {
		return this._withAdapter(handle, SelectionRangeAdapter, adapter => adapter.provideSelectionRanges(URI.revive(resource), position, token));
	}

	// --- configuration

	private static _serializeRegExp(regExp: RegExp): ISerializedRegExp {
		if (typeof regExp === 'undefined') {
			return undefined;
		}
		if (regExp === null) {
			return null;
		}
		return {
			pattern: regExp.source,
			flags: regExpFlags(regExp),
		};
	}

	private static _serializeIndentationRule(indentationRule: vscode.IndentationRule): ISerializedIndentationRule {
		if (typeof indentationRule === 'undefined') {
			return undefined;
		}
		if (indentationRule === null) {
			return null;
		}
		return {
			decreaseIndentPattern: ExtHostLanguageFeatures._serializeRegExp(indentationRule.decreaseIndentPattern),
			increaseIndentPattern: ExtHostLanguageFeatures._serializeRegExp(indentationRule.increaseIndentPattern),
			indentNextLinePattern: ExtHostLanguageFeatures._serializeRegExp(indentationRule.indentNextLinePattern),
			unIndentedLinePattern: ExtHostLanguageFeatures._serializeRegExp(indentationRule.unIndentedLinePattern),
		};
	}

	private static _serializeOnEnterRule(onEnterRule: vscode.OnEnterRule): ISerializedOnEnterRule {
		return {
			beforeText: ExtHostLanguageFeatures._serializeRegExp(onEnterRule.beforeText),
			afterText: ExtHostLanguageFeatures._serializeRegExp(onEnterRule.afterText),
			oneLineAboveText: ExtHostLanguageFeatures._serializeRegExp(onEnterRule.oneLineAboveText),
			action: onEnterRule.action
		};
	}

	private static _serializeOnEnterRules(onEnterRules: vscode.OnEnterRule[]): ISerializedOnEnterRule[] {
		if (typeof onEnterRules === 'undefined') {
			return undefined;
		}
		if (onEnterRules === null) {
			return null;
		}
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
			this._documents.setWordDefinitionFor(languageId, null);
		}

		const handle = this._nextHandle();
		const serializedConfiguration: ISerializedLanguageConfiguration = {
			comments: configuration.comments,
			brackets: configuration.brackets,
			wordPattern: ExtHostLanguageFeatures._serializeRegExp(configuration.wordPattern),
			indentationRules: ExtHostLanguageFeatures._serializeIndentationRule(configuration.indentationRules),
			onEnterRules: ExtHostLanguageFeatures._serializeOnEnterRules(configuration.onEnterRules),
			__electricCharacterSupport: configuration.__electricCharacterSupport,
			__characterPairSupport: configuration.__characterPairSupport,
		};
		this._proxy.$setLanguageConfiguration(handle, languageId, serializedConfiguration);
		return this._createDisposable(handle);
	}
}
