/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { URI, UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
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
import { asThenable } from 'vs/base/common/async';
import { MainContext, MainThreadLanguageFeaturesShape, ExtHostLanguageFeaturesShape, ObjectIdentifier, IRawColorInfo, IMainContext, IdObject, ISerializedRegExp, ISerializedIndentationRule, ISerializedOnEnterRule, ISerializedLanguageConfiguration, WorkspaceSymbolDto, SuggestResultDto, WorkspaceSymbolsDto, SuggestionDto, CodeActionDto, ISerializedDocumentFilter, WorkspaceEditDto } from './extHost.protocol';
import { regExpLeadsToEndlessLoop } from 'vs/base/common/strings';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange, Range as EditorRange } from 'vs/editor/common/core/range';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { isObject } from 'vs/base/common/types';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';

// --- adapter

class OutlineAdapter {

	private _documents: ExtHostDocuments;
	private _provider: vscode.DocumentSymbolProvider;

	constructor(documents: ExtHostDocuments, provider: vscode.DocumentSymbolProvider) {
		this._documents = documents;
		this._provider = provider;
	}

	provideDocumentSymbols(resource: URI, token: CancellationToken): Thenable<modes.DocumentSymbol[]> {
		let doc = this._documents.getDocumentData(resource).document;
		return asThenable(() => this._provider.provideDocumentSymbols(doc, token)).then(value => {
			if (isFalsyOrEmpty(value)) {
				return undefined;
			}
			if (value[0] instanceof DocumentSymbol) {
				return (<DocumentSymbol[]>value).map(typeConvert.DocumentSymbol.from);
			} else {
				return OutlineAdapter._asDocumentSymbolTree(resource, <SymbolInformation[]>value);
			}
		});
	}

	private static _asDocumentSymbolTree(resource: URI, info: SymbolInformation[]): modes.DocumentSymbol[] {
		// first sort by start (and end) and then loop over all elements
		// and build a tree based on containment.
		info = info.slice(0).sort((a, b) => {
			let res = a.location.range.start.compareTo(b.location.range.start);
			if (res === 0) {
				res = b.location.range.end.compareTo(a.location.range.end);
			}
			return res;
		});
		let res: modes.DocumentSymbol[] = [];
		let parentStack: modes.DocumentSymbol[] = [];
		for (let i = 0; i < info.length; i++) {
			let element = <modes.DocumentSymbol>{
				name: info[i].name,
				kind: typeConvert.SymbolKind.from(info[i].kind),
				containerName: info[i].containerName,
				range: typeConvert.Range.from(info[i].location.range),
				selectionRange: typeConvert.Range.from(info[i].location.range),
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

	private static _badCmd: vscode.Command = { command: 'missing', title: '<<MISSING COMMAND>>' };

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _heapService: ExtHostHeapService,
		private readonly _provider: vscode.CodeLensProvider
	) { }

	provideCodeLenses(resource: URI, token: CancellationToken): Thenable<modes.ICodeLensSymbol[]> {
		const doc = this._documents.getDocumentData(resource).document;

		return asThenable(() => this._provider.provideCodeLenses(doc, token)).then(lenses => {
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

	resolveCodeLens(resource: URI, symbol: modes.ICodeLensSymbol, token: CancellationToken): Thenable<modes.ICodeLensSymbol> {

		const lens = this._heapService.get<vscode.CodeLens>(ObjectIdentifier.of(symbol));
		if (!lens) {
			return undefined;
		}

		let resolve: Thenable<vscode.CodeLens>;
		if (typeof this._provider.resolveCodeLens !== 'function' || lens.isResolved) {
			resolve = TPromise.as(lens);
		} else {
			resolve = asThenable(() => this._provider.resolveCodeLens(lens, token));
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

	provideDefinition(resource: URI, position: IPosition, token: CancellationToken): Thenable<modes.DefinitionLink[]> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);
		return asThenable(() => this._provider.provideDefinition(doc, pos, token)).then(convertToDefinitionLinks);
	}
}

class ImplementationAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.ImplementationProvider
	) { }

	provideImplementation(resource: URI, position: IPosition, token: CancellationToken): Thenable<modes.DefinitionLink[]> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);
		return asThenable(() => this._provider.provideImplementation(doc, pos, token)).then(convertToDefinitionLinks);
	}
}

class TypeDefinitionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.TypeDefinitionProvider
	) { }

	provideTypeDefinition(resource: URI, position: IPosition, token: CancellationToken): Thenable<modes.DefinitionLink[]> {
		const doc = this._documents.getDocumentData(resource).document;
		const pos = typeConvert.Position.to(position);
		return asThenable(() => this._provider.provideTypeDefinition(doc, pos, token)).then(convertToDefinitionLinks);
	}
}

class HoverAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.HoverProvider,
	) { }

	public provideHover(resource: URI, position: IPosition, token: CancellationToken): Thenable<modes.Hover> {

		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

		return asThenable(() => this._provider.provideHover(doc, pos, token)).then(value => {
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

	provideDocumentHighlights(resource: URI, position: IPosition, token: CancellationToken): Thenable<modes.DocumentHighlight[]> {

		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

		return asThenable(() => this._provider.provideDocumentHighlights(doc, pos, token)).then(value => {
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

	provideReferences(resource: URI, position: IPosition, context: modes.ReferenceContext, token: CancellationToken): Thenable<modes.Location[]> {
		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

		return asThenable(() => this._provider.provideReferences(doc, pos, context, token)).then(value => {
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
		private readonly _extensionId: string
	) { }

	provideCodeActions(resource: URI, rangeOrSelection: IRange | ISelection, context: modes.CodeActionContext, token: CancellationToken): Thenable<CodeActionDto[]> {

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

		return asThenable(() => this._provider.provideCodeActions(doc, ran, codeActionContext, token)).then(commandsOrActions => {
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
							this._logService.warn(`${this._extensionId} - Code actions of kind '${codeActionContext.only.value} 'requested but returned code action does not have a 'kind'. Code action will be dropped. Please set 'CodeAction.kind'.`);
						} else if (!codeActionContext.only.contains(candidate.kind)) {
							this._logService.warn(`${this._extensionId} -Code actions of kind '${codeActionContext.only.value} 'requested but returned code action is of kind '${candidate.kind.value}'. Code action will be dropped. Please check 'CodeActionContext.only' to only return requested code actions.`);
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

	provideDocumentFormattingEdits(resource: URI, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> {

		const { document } = this._documents.getDocumentData(resource);

		return asThenable(() => this._provider.provideDocumentFormattingEdits(document, <any>options, token)).then(value => {
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

	provideDocumentRangeFormattingEdits(resource: URI, range: IRange, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> {

		const { document } = this._documents.getDocumentData(resource);
		const ran = typeConvert.Range.to(range);

		return asThenable(() => this._provider.provideDocumentRangeFormattingEdits(document, ran, <any>options, token)).then(value => {
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

	provideOnTypeFormattingEdits(resource: URI, position: IPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> {

		const { document } = this._documents.getDocumentData(resource);
		const pos = typeConvert.Position.to(position);

		return asThenable(() => this._provider.provideOnTypeFormattingEdits(document, pos, ch, <any>options, token)).then(value => {
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

	provideWorkspaceSymbols(search: string, token: CancellationToken): Thenable<WorkspaceSymbolsDto> {
		const result: WorkspaceSymbolsDto = IdObject.mixin({ symbols: [] });
		return asThenable(() => this._provider.provideWorkspaceSymbols(search, token)).then(value => {
			if (!isFalsyOrEmpty(value)) {
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

	resolveWorkspaceSymbol(symbol: WorkspaceSymbolDto, token: CancellationToken): Thenable<WorkspaceSymbolDto> {

		if (typeof this._provider.resolveWorkspaceSymbol !== 'function') {
			return TPromise.as(symbol);
		}

		const item = this._symbolCache[symbol._id];
		if (item) {
			return asThenable(() => this._provider.resolveWorkspaceSymbol(item, token)).then(value => {
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

	provideRenameEdits(resource: URI, position: IPosition, newName: string, token: CancellationToken): Thenable<WorkspaceEditDto> {

		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

		return asThenable(() => this._provider.provideRenameEdits(doc, pos, newName, token)).then(value => {
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

	resolveRenameLocation(resource: URI, position: IPosition, token: CancellationToken): Thenable<modes.RenameLocation & modes.Rejection> {
		if (typeof this._provider.prepareRename !== 'function') {
			return TPromise.as(undefined);
		}

		let doc = this._documents.getDocumentData(resource).document;
		let pos = typeConvert.Position.to(position);

		return asThenable(() => this._provider.prepareRename(doc, pos, token)).then(rangeOrLocation => {

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

			if (!range.contains(pos)) {
				console.warn('INVALID rename location: range must contain position');
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

	provideCompletionItems(resource: URI, position: IPosition, context: modes.SuggestContext, token: CancellationToken): Thenable<SuggestResultDto> {

		const doc = this._documents.getDocumentData(resource).document;
		const pos = typeConvert.Position.to(position);

		return asThenable<vscode.CompletionItem[] | vscode.CompletionList>(
			() => this._provider.provideCompletionItems(doc, pos, token, typeConvert.CompletionContext.from(context))
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

	resolveCompletionItem(resource: URI, position: IPosition, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> {

		if (typeof this._provider.resolveCompletionItem !== 'function') {
			return TPromise.as(suggestion);
		}

		const { _parentId, _id } = (<SuggestionDto>suggestion);
		const item = this._cache.has(_parentId) && this._cache.get(_parentId)[_id];
		if (!item) {
			return TPromise.as(suggestion);
		}

		return asThenable(() => this._provider.resolveCompletionItem(item, token)).then(resolvedItem => {

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
			type: typeConvert.CompletionItemKind.from(item.kind),
			detail: item.detail,
			documentation: item.documentation,
			filterText: item.filterText,
			sortText: item.sortText,
			preselect: item.preselect,
			//
			insertText: undefined,
			additionalTextEdits: item.additionalTextEdits && item.additionalTextEdits.map(typeConvert.TextEdit.from),
			command: this._commands.toInternal(item.command),
			commitCharacters: item.commitCharacters
		};

		// 'insertText'-logic
		if (item.textEdit) {
			result.insertText = item.textEdit.newText;
			result.insertTextIsSnippet = false;

		} else if (typeof item.insertText === 'string') {
			result.insertText = item.insertText;
			result.insertTextIsSnippet = false;

		} else if (item.insertText instanceof SnippetString) {
			result.insertText = item.insertText.value;
			result.insertTextIsSnippet = true;

		} else {
			result.insertText = item.label;
			result.insertTextIsSnippet = false;
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
		result.overwriteBefore = position.character - range.start.character;
		result.overwriteAfter = range.end.character - position.character;

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
		private readonly _provider: vscode.SignatureHelpProvider
	) { }

	provideSignatureHelp(resource: URI, position: IPosition, context: modes.SignatureHelpContext, token: CancellationToken): Thenable<modes.SignatureHelp> {

		const doc = this._documents.getDocumentData(resource).document;
		const pos = typeConvert.Position.to(position);

		return asThenable(() => this._provider.provideSignatureHelp(doc, pos, token, context)).then(value => {
			if (value) {
				return typeConvert.SignatureHelp.from(value);
			}
			return undefined;
		});
	}
}

class LinkProviderAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _heapService: ExtHostHeapService,
		private readonly _provider: vscode.DocumentLinkProvider
	) { }

	provideLinks(resource: URI, token: CancellationToken): Thenable<modes.ILink[]> {
		const doc = this._documents.getDocumentData(resource).document;

		return asThenable(() => this._provider.provideDocumentLinks(doc, token)).then(links => {
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

	resolveLink(link: modes.ILink, token: CancellationToken): Thenable<modes.ILink> {
		if (typeof this._provider.resolveDocumentLink !== 'function') {
			return undefined;
		}

		const id = ObjectIdentifier.of(link);
		const item = this._heapService.get<vscode.DocumentLink>(id);
		if (!item) {
			return undefined;
		}

		return asThenable(() => this._provider.resolveDocumentLink(item, token)).then(value => {
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

	provideColors(resource: URI, token: CancellationToken): Thenable<IRawColorInfo[]> {
		const doc = this._documents.getDocumentData(resource).document;
		return asThenable(() => this._provider.provideDocumentColors(doc, token)).then(colors => {
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

	provideColorPresentations(resource: URI, raw: IRawColorInfo, token: CancellationToken): Thenable<modes.IColorPresentation[]> {
		const document = this._documents.getDocumentData(resource).document;
		const range = typeConvert.Range.to(raw.range);
		const color = typeConvert.Color.to(raw.color);
		return asThenable(() => this._provider.provideColorPresentations(color, { document, range }, token)).then(value => {
			return value.map(typeConvert.ColorPresentation.from);
		});
	}
}

class FoldingProviderAdapter {

	constructor(
		private _documents: ExtHostDocuments,
		private _provider: vscode.FoldingRangeProvider
	) { }

	provideFoldingRanges(resource: URI, context: modes.FoldingContext, token: CancellationToken): Thenable<modes.FoldingRange[]> {
		const doc = this._documents.getDocumentData(resource).document;
		return asThenable(() => this._provider.provideFoldingRanges(doc, context, token)).then(ranges => {
			if (!Array.isArray(ranges)) {
				return void 0;
			}
			return ranges.map(typeConvert.FoldingRange.from);
		});
	}
}

type Adapter = OutlineAdapter | CodeLensAdapter | DefinitionAdapter | HoverAdapter
	| DocumentHighlightAdapter | ReferenceAdapter | CodeActionAdapter | DocumentFormattingAdapter
	| RangeFormattingAdapter | OnTypeFormattingAdapter | NavigateTypeAdapter | RenameAdapter
	| SuggestAdapter | SignatureHelpAdapter | LinkProviderAdapter | ImplementationAdapter | TypeDefinitionAdapter
	| ColorProviderAdapter | FoldingProviderAdapter;

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
	private _adapter = new Map<number, Adapter>();
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

	private _withAdapter<A, R>(handle: number, ctor: { new(...args: any[]): A }, callback: (adapter: A) => Thenable<R>): Thenable<R> {
		let adapter = this._adapter.get(handle);
		if (!(adapter instanceof ctor)) {
			return TPromise.wrapError<R>(new Error('no adapter found'));
		}
		return callback(<any>adapter);
	}

	private _addNewAdapter(adapter: Adapter): number {
		const handle = this._nextHandle();
		this._adapter.set(handle, adapter);
		return handle;
	}

	// --- outline

	registerDocumentSymbolProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider, extension?: IExtensionDescription): vscode.Disposable {
		const handle = this._addNewAdapter(new OutlineAdapter(this._documents, provider));
		this._proxy.$registerOutlineSupport(handle, this._transformDocumentSelector(selector), extension ? extension.displayName || extension.name : undefined);
		return this._createDisposable(handle);
	}

	$provideDocumentSymbols(handle: number, resource: UriComponents, token: CancellationToken): Thenable<modes.DocumentSymbol[]> {
		return this._withAdapter(handle, OutlineAdapter, adapter => adapter.provideDocumentSymbols(URI.revive(resource), token));
	}

	// --- code lens

	registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
		const handle = this._nextHandle();
		const eventHandle = typeof provider.onDidChangeCodeLenses === 'function' ? this._nextHandle() : undefined;

		this._adapter.set(handle, new CodeLensAdapter(this._documents, this._commands.converter, this._heapService, provider));
		this._proxy.$registerCodeLensSupport(handle, this._transformDocumentSelector(selector), eventHandle);
		let result = this._createDisposable(handle);

		if (eventHandle !== undefined) {
			const subscription = provider.onDidChangeCodeLenses(_ => this._proxy.$emitCodeLensEvent(eventHandle));
			result = Disposable.from(result, subscription);
		}

		return result;
	}

	$provideCodeLenses(handle: number, resource: UriComponents, token: CancellationToken): Thenable<modes.ICodeLensSymbol[]> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.provideCodeLenses(URI.revive(resource), token));
	}

	$resolveCodeLens(handle: number, resource: UriComponents, symbol: modes.ICodeLensSymbol, token: CancellationToken): Thenable<modes.ICodeLensSymbol> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.resolveCodeLens(URI.revive(resource), symbol, token));
	}

	// --- declaration

	registerDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DefinitionAdapter(this._documents, provider));
		this._proxy.$registerDeclaractionSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Thenable<modes.DefinitionLink[]> {
		return this._withAdapter(handle, DefinitionAdapter, adapter => adapter.provideDefinition(URI.revive(resource), position, token));
	}

	registerImplementationProvider(selector: vscode.DocumentSelector, provider: vscode.ImplementationProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ImplementationAdapter(this._documents, provider));
		this._proxy.$registerImplementationSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideImplementation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Thenable<modes.DefinitionLink[]> {
		return this._withAdapter(handle, ImplementationAdapter, adapter => adapter.provideImplementation(URI.revive(resource), position, token));
	}

	registerTypeDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.TypeDefinitionProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new TypeDefinitionAdapter(this._documents, provider));
		this._proxy.$registerTypeDefinitionSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideTypeDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Thenable<modes.DefinitionLink[]> {
		return this._withAdapter(handle, TypeDefinitionAdapter, adapter => adapter.provideTypeDefinition(URI.revive(resource), position, token));
	}

	// --- extra info

	registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider, extensionId?: string): vscode.Disposable {
		const handle = this._addNewAdapter(new HoverAdapter(this._documents, provider));
		this._proxy.$registerHoverProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideHover(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Thenable<modes.Hover> {
		return this._withAdapter(handle, HoverAdapter, adapter => adapter.provideHover(URI.revive(resource), position, token));
	}

	// --- occurrences

	registerDocumentHighlightProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentHighlightAdapter(this._documents, provider));
		this._proxy.$registerDocumentHighlightProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentHighlights(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Thenable<modes.DocumentHighlight[]> {
		return this._withAdapter(handle, DocumentHighlightAdapter, adapter => adapter.provideDocumentHighlights(URI.revive(resource), position, token));
	}

	// --- references

	registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ReferenceAdapter(this._documents, provider));
		this._proxy.$registerReferenceSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideReferences(handle: number, resource: UriComponents, position: IPosition, context: modes.ReferenceContext, token: CancellationToken): Thenable<modes.Location[]> {
		return this._withAdapter(handle, ReferenceAdapter, adapter => adapter.provideReferences(URI.revive(resource), position, context, token));
	}

	// --- quick fix

	registerCodeActionProvider(selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider, extension?: IExtensionDescription, metadata?: vscode.CodeActionProviderMetadata): vscode.Disposable {
		const handle = this._addNewAdapter(new CodeActionAdapter(this._documents, this._commands.converter, this._diagnostics, provider, this._logService, extension ? extension.id : ''));
		this._proxy.$registerQuickFixSupport(handle, this._transformDocumentSelector(selector), metadata && metadata.providedCodeActionKinds ? metadata.providedCodeActionKinds.map(kind => kind.value) : undefined);
		return this._createDisposable(handle);
	}


	$provideCodeActions(handle: number, resource: UriComponents, rangeOrSelection: IRange | ISelection, context: modes.CodeActionContext, token: CancellationToken): Thenable<CodeActionDto[]> {
		return this._withAdapter(handle, CodeActionAdapter, adapter => adapter.provideCodeActions(URI.revive(resource), rangeOrSelection, context, token));
	}

	// --- formatting

	registerDocumentFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentFormattingAdapter(this._documents, provider));
		this._proxy.$registerDocumentFormattingSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> {
		return this._withAdapter(handle, DocumentFormattingAdapter, adapter => adapter.provideDocumentFormattingEdits(URI.revive(resource), options, token));
	}

	registerDocumentRangeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new RangeFormattingAdapter(this._documents, provider));
		this._proxy.$registerRangeFormattingSupport(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: IRange, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> {
		return this._withAdapter(handle, RangeFormattingAdapter, adapter => adapter.provideDocumentRangeFormattingEdits(URI.revive(resource), range, options, token));
	}

	registerOnTypeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new OnTypeFormattingAdapter(this._documents, provider));
		this._proxy.$registerOnTypeFormattingSupport(handle, this._transformDocumentSelector(selector), triggerCharacters);
		return this._createDisposable(handle);
	}

	$provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: IPosition, ch: string, options: modes.FormattingOptions, token: CancellationToken): Thenable<ISingleEditOperation[]> {
		return this._withAdapter(handle, OnTypeFormattingAdapter, adapter => adapter.provideOnTypeFormattingEdits(URI.revive(resource), position, ch, options, token));
	}

	// --- navigate types

	registerWorkspaceSymbolProvider(provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new NavigateTypeAdapter(provider));
		this._proxy.$registerNavigateTypeSupport(handle);
		return this._createDisposable(handle);
	}

	$provideWorkspaceSymbols(handle: number, search: string, token: CancellationToken): Thenable<WorkspaceSymbolsDto> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.provideWorkspaceSymbols(search, token));
	}

	$resolveWorkspaceSymbol(handle: number, symbol: WorkspaceSymbolDto, token: CancellationToken): Thenable<WorkspaceSymbolDto> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.resolveWorkspaceSymbol(symbol, token));
	}

	$releaseWorkspaceSymbols(handle: number, id: number): void {
		this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.releaseWorkspaceSymbols(id));
	}

	// --- rename

	registerRenameProvider(selector: vscode.DocumentSelector, provider: vscode.RenameProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new RenameAdapter(this._documents, provider));
		this._proxy.$registerRenameSupport(handle, this._transformDocumentSelector(selector), RenameAdapter.supportsResolving(provider));
		return this._createDisposable(handle);
	}

	$provideRenameEdits(handle: number, resource: UriComponents, position: IPosition, newName: string, token: CancellationToken): Thenable<WorkspaceEditDto> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.provideRenameEdits(URI.revive(resource), position, newName, token));
	}

	$resolveRenameLocation(handle: number, resource: URI, position: IPosition, token: CancellationToken): Thenable<modes.RenameLocation> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.resolveRenameLocation(URI.revive(resource), position, token));
	}

	// --- suggestion

	registerCompletionItemProvider(selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new SuggestAdapter(this._documents, this._commands.converter, provider));
		this._proxy.$registerSuggestSupport(handle, this._transformDocumentSelector(selector), triggerCharacters, SuggestAdapter.supportsResolving(provider));
		return this._createDisposable(handle);
	}

	$provideCompletionItems(handle: number, resource: UriComponents, position: IPosition, context: modes.SuggestContext, token: CancellationToken): Thenable<SuggestResultDto> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.provideCompletionItems(URI.revive(resource), position, context, token));
	}

	$resolveCompletionItem(handle: number, resource: UriComponents, position: IPosition, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> {
		return this._withAdapter(handle, SuggestAdapter, adapter => adapter.resolveCompletionItem(URI.revive(resource), position, suggestion, token));
	}

	$releaseCompletionItems(handle: number, id: number): void {
		this._withAdapter(handle, SuggestAdapter, adapter => adapter.releaseCompletionItems(id));
	}

	// --- parameter hints

	registerSignatureHelpProvider(selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new SignatureHelpAdapter(this._documents, provider));
		this._proxy.$registerSignatureHelpProvider(handle, this._transformDocumentSelector(selector), triggerCharacters);
		return this._createDisposable(handle);
	}

	$provideSignatureHelp(handle: number, resource: UriComponents, position: IPosition, context: modes.SignatureHelpContext, token: CancellationToken): Thenable<modes.SignatureHelp> {
		return this._withAdapter(handle, SignatureHelpAdapter, adapter => adapter.provideSignatureHelp(URI.revive(resource), position, context, token));
	}

	// --- links

	registerDocumentLinkProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentLinkProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new LinkProviderAdapter(this._documents, this._heapService, provider));
		this._proxy.$registerDocumentLinkProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentLinks(handle: number, resource: UriComponents, token: CancellationToken): Thenable<modes.ILink[]> {
		return this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.provideLinks(URI.revive(resource), token));
	}

	$resolveDocumentLink(handle: number, link: modes.ILink, token: CancellationToken): Thenable<modes.ILink> {
		return this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.resolveLink(link, token));
	}

	registerColorProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentColorProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ColorProviderAdapter(this._documents, provider));
		this._proxy.$registerDocumentColorProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideDocumentColors(handle: number, resource: UriComponents, token: CancellationToken): Thenable<IRawColorInfo[]> {
		return this._withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColors(URI.revive(resource), token));
	}

	$provideColorPresentations(handle: number, resource: UriComponents, colorInfo: IRawColorInfo, token: CancellationToken): Thenable<modes.IColorPresentation[]> {
		return this._withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColorPresentations(URI.revive(resource), colorInfo, token));
	}

	registerFoldingRangeProvider(selector: vscode.DocumentSelector, provider: vscode.FoldingRangeProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new FoldingProviderAdapter(this._documents, provider));
		this._proxy.$registerFoldingRangeProvider(handle, this._transformDocumentSelector(selector));
		return this._createDisposable(handle);
	}

	$provideFoldingRanges(handle: number, resource: UriComponents, context: vscode.FoldingContext, token: CancellationToken): Thenable<modes.FoldingRange[]> {
		return this._withAdapter(handle, FoldingProviderAdapter, adapter => adapter.provideFoldingRanges(URI.revive(resource), context, token));
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
			flags: (regExp.global ? 'g' : '') + (regExp.ignoreCase ? 'i' : '') + (regExp.multiline ? 'm' : ''),
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
