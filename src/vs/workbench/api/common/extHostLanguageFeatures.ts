/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { mixin } from 'vs/base/common/objects';
import type * as vscode from 'vscode';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { Range, Disposable, CompletionList, SnippetString, CodeActionKind, SymbolInformation, DocumentSymbol, SemanticTokensEdits, SemanticTokens, SemanticTokensEdit, Location, InlineCompletionTriggerKind, InternalDataTransferItem, CodeActionTriggerKind } from 'vs/workbench/api/common/extHostTypes';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import * as languages from 'vs/editor/common/languages';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostCommands, CommandsConverter } from 'vs/workbench/api/common/extHostCommands';
import { ExtHostDiagnostics } from 'vs/workbench/api/common/extHostDiagnostics';
import * as extHostProtocol from './extHost.protocol';
import { regExpLeadsToEndlessLoop, regExpFlags } from 'vs/base/common/strings';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange, Range as EditorRange } from 'vs/editor/common/core/range';
import { isFalsyOrEmpty, isNonEmptyArray, coalesce } from 'vs/base/common/arrays';
import { assertType, isObject } from 'vs/base/common/types';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';
import { encodeSemanticTokensDto } from 'vs/editor/common/services/semanticTokensDto';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { IExtHostApiDeprecationService } from 'vs/workbench/api/common/extHostApiDeprecationService';
import { Cache } from './cache';
import { StopWatch } from 'vs/base/common/stopwatch';
import { isCancellationError, NotImplementedError } from 'vs/base/common/errors';
import { raceCancellationError } from 'vs/base/common/async';
import { checkProposedApiEnabled, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { IExtHostTelemetry } from 'vs/workbench/api/common/extHostTelemetry';
import { localize } from 'vs/nls';

// --- adapter

class DocumentSymbolAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentSymbolProvider
	) { }

	async provideDocumentSymbols(resource: URI, token: CancellationToken): Promise<languages.DocumentSymbol[] | undefined> {
		const doc = this._documents.getDocument(resource);
		const value = await this._provider.provideDocumentSymbols(doc, token);
		if (isFalsyOrEmpty(value)) {
			return undefined;
		} else if (value![0] instanceof DocumentSymbol) {
			return (<DocumentSymbol[]>value).map(typeConvert.DocumentSymbol.from);
		} else {
			return DocumentSymbolAdapter._asDocumentSymbolTree(<SymbolInformation[]>value);
		}
	}

	private static _asDocumentSymbolTree(infos: SymbolInformation[]): languages.DocumentSymbol[] {
		// first sort by start (and end) and then loop over all elements
		// and build a tree based on containment.
		infos = infos.slice(0).sort((a, b) => {
			let res = a.location.range.start.compareTo(b.location.range.start);
			if (res === 0) {
				res = b.location.range.end.compareTo(a.location.range.end);
			}
			return res;
		});
		const res: languages.DocumentSymbol[] = [];
		const parentStack: languages.DocumentSymbol[] = [];
		for (const info of infos) {
			const element: languages.DocumentSymbol = {
				name: info.name || '!!MISSING: name!!',
				kind: typeConvert.SymbolKind.from(info.kind),
				tags: info.tags?.map(typeConvert.SymbolTag.from) || [],
				detail: '',
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
					parent.children?.push(element);
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

	async provideCodeLenses(resource: URI, token: CancellationToken): Promise<extHostProtocol.ICodeLensListDto | undefined> {
		const doc = this._documents.getDocument(resource);

		const lenses = await this._provider.provideCodeLenses(doc, token);
		if (!lenses || token.isCancellationRequested) {
			return undefined;
		}
		const cacheId = this._cache.add(lenses);
		const disposables = new DisposableStore();
		this._disposables.set(cacheId, disposables);
		const result: extHostProtocol.ICodeLensListDto = {
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
	}

	async resolveCodeLens(symbol: extHostProtocol.ICodeLensDto, token: CancellationToken): Promise<extHostProtocol.ICodeLensDto | undefined> {

		const lens = symbol.cacheId && this._cache.get(...symbol.cacheId);
		if (!lens) {
			return undefined;
		}

		let resolvedLens: vscode.CodeLens | undefined | null;
		if (typeof this._provider.resolveCodeLens !== 'function' || lens.isResolved) {
			resolvedLens = lens;
		} else {
			resolvedLens = await this._provider.resolveCodeLens(lens, token);
		}
		if (!resolvedLens) {
			resolvedLens = lens;
		}

		if (token.isCancellationRequested) {
			return undefined;
		}
		const disposables = symbol.cacheId && this._disposables.get(symbol.cacheId[0]);
		if (!disposables) {
			// disposed in the meantime
			return undefined;
		}
		symbol.command = this._commands.toInternal(resolvedLens.command ?? CodeLensAdapter._badCmd, disposables);
		return symbol;
	}

	releaseCodeLenses(cachedId: number): void {
		this._disposables.get(cachedId)?.dispose();
		this._disposables.delete(cachedId);
		this._cache.delete(cachedId);
	}
}

function convertToLocationLinks(value: vscode.Location | vscode.Location[] | vscode.LocationLink[] | undefined | null): languages.LocationLink[] {
	if (Array.isArray(value)) {
		return (<any>value).map(typeConvert.DefinitionLink.from);
	} else if (value) {
		return [typeConvert.DefinitionLink.from(value)];
	}
	return [];
}

class DefinitionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DefinitionProvider
	) { }

	async provideDefinition(resource: URI, position: IPosition, token: CancellationToken): Promise<languages.LocationLink[]> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		const value = await this._provider.provideDefinition(doc, pos, token);
		return convertToLocationLinks(value);
	}
}

class DeclarationAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DeclarationProvider
	) { }

	async provideDeclaration(resource: URI, position: IPosition, token: CancellationToken): Promise<languages.LocationLink[]> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		const value = await this._provider.provideDeclaration(doc, pos, token);
		return convertToLocationLinks(value);
	}
}

class ImplementationAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.ImplementationProvider
	) { }

	async provideImplementation(resource: URI, position: IPosition, token: CancellationToken): Promise<languages.LocationLink[]> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		const value = await this._provider.provideImplementation(doc, pos, token);
		return convertToLocationLinks(value);
	}
}

class TypeDefinitionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.TypeDefinitionProvider
	) { }

	async provideTypeDefinition(resource: URI, position: IPosition, token: CancellationToken): Promise<languages.LocationLink[]> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		const value = await this._provider.provideTypeDefinition(doc, pos, token);
		return convertToLocationLinks(value);
	}
}

class HoverAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.HoverProvider,
	) { }

	async provideHover(resource: URI, position: IPosition, token: CancellationToken): Promise<languages.Hover | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		const value = await this._provider.provideHover(doc, pos, token);
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
	}
}

class EvaluatableExpressionAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.EvaluatableExpressionProvider,
	) { }

	async provideEvaluatableExpression(resource: URI, position: IPosition, token: CancellationToken): Promise<languages.EvaluatableExpression | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		const value = await this._provider.provideEvaluatableExpression(doc, pos, token);
		if (value) {
			return typeConvert.EvaluatableExpression.from(value);
		}
		return undefined;
	}
}

class InlineValuesAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.InlineValuesProvider,
	) { }

	async provideInlineValues(resource: URI, viewPort: IRange, context: extHostProtocol.IInlineValueContextDto, token: CancellationToken): Promise<languages.InlineValue[] | undefined> {
		const doc = this._documents.getDocument(resource);
		const value = await this._provider.provideInlineValues(doc, typeConvert.Range.to(viewPort), typeConvert.InlineValueContext.to(context), token);
		if (Array.isArray(value)) {
			return value.map(iv => typeConvert.InlineValue.from(iv));
		}
		return undefined;
	}
}

class DocumentHighlightAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentHighlightProvider
	) { }

	async provideDocumentHighlights(resource: URI, position: IPosition, token: CancellationToken): Promise<languages.DocumentHighlight[] | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		const value = await this._provider.provideDocumentHighlights(doc, pos, token);
		if (Array.isArray(value)) {
			return value.map(typeConvert.DocumentHighlight.from);
		}
		return undefined;
	}
}

class LinkedEditingRangeAdapter {
	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.LinkedEditingRangeProvider
	) { }

	async provideLinkedEditingRanges(resource: URI, position: IPosition, token: CancellationToken): Promise<languages.LinkedEditingRanges | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		const value = await this._provider.provideLinkedEditingRanges(doc, pos, token);
		if (value && Array.isArray(value.ranges)) {
			return {
				ranges: coalesce(value.ranges.map(typeConvert.Range.from)),
				wordPattern: value.wordPattern
			};
		}
		return undefined;
	}
}

class ReferenceAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.ReferenceProvider
	) { }

	async provideReferences(resource: URI, position: IPosition, context: languages.ReferenceContext, token: CancellationToken): Promise<languages.Location[] | undefined> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		const value = await this._provider.provideReferences(doc, pos, context, token);
		if (Array.isArray(value)) {
			return value.map(typeConvert.location.from);
		}
		return undefined;
	}
}

export interface CustomCodeAction extends extHostProtocol.ICodeActionDto {
	_isSynthetic?: boolean;
}

class CodeActionAdapter {
	private static readonly _maxCodeActionsPerFile: number = 1000;

	private readonly _cache = new Cache<vscode.CodeAction | vscode.Command>('CodeAction');
	private readonly _disposables = new Map<number, DisposableStore>();
	private readonly nbKind = new CodeActionKind('notebook');

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _diagnostics: ExtHostDiagnostics,
		private readonly _provider: vscode.CodeActionProvider,
		private readonly _logService: ILogService,
		private readonly _extension: IExtensionDescription,
		private readonly _apiDeprecation: IExtHostApiDeprecationService,
	) { }

	async provideCodeActions(resource: URI, rangeOrSelection: IRange | ISelection, context: languages.CodeActionContext, token: CancellationToken): Promise<extHostProtocol.ICodeActionListDto | undefined> {

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
			only: context.only ? new CodeActionKind(context.only) : undefined,
			triggerKind: typeConvert.CodeActionTriggerKind.to(context.trigger),
		};

		const commandsOrActions = await this._provider.provideCodeActions(doc, ran, codeActionContext, token);
		if (!isNonEmptyArray(commandsOrActions) || token.isCancellationRequested) {
			return undefined;
		}

		const cacheId = this._cache.add(commandsOrActions);
		const disposables = new DisposableStore();
		this._disposables.set(cacheId, disposables);
		const actions: CustomCodeAction[] = [];
		for (let i = 0; i < commandsOrActions.length; i++) {
			const candidate = commandsOrActions[i];
			if (!candidate) {
				continue;
			}
			if (CodeActionAdapter._isCommand(candidate)) {
				// old school: synthetic code action
				this._apiDeprecation.report('CodeActionProvider.provideCodeActions - return commands', this._extension,
					`Return 'CodeAction' instances instead.`);

				actions.push({
					_isSynthetic: true,
					title: candidate.title,
					command: this._commands.toInternal(candidate, disposables),
				});
			} else {
				if (codeActionContext.triggerKind !== CodeActionTriggerKind.Invoke && candidate.kind && this.nbKind.contains(candidate.kind)) {
					continue;
				}

				if (codeActionContext.only) {
					if (!candidate.kind) {
						this._logService.warn(`${this._extension.identifier.value} - Code actions of kind '${codeActionContext.only.value} 'requested but returned code action does not have a 'kind'. Code action will be dropped. Please set 'CodeAction.kind'.`);
					} else if (!codeActionContext.only.contains(candidate.kind)) {
						this._logService.warn(`${this._extension.identifier.value} - Code actions of kind '${codeActionContext.only.value} 'requested but returned code action is of kind '${candidate.kind.value}'. Code action will be dropped. Please check 'CodeActionContext.only' to only return requested code actions.`);
					}
				}

				// new school: convert code action
				actions.push({
					cacheId: [cacheId, i],
					title: candidate.title,
					command: candidate.command && this._commands.toInternal(candidate.command, disposables),
					diagnostics: candidate.diagnostics && candidate.diagnostics.map(typeConvert.Diagnostic.from),
					edit: candidate.edit && typeConvert.WorkspaceEdit.from(candidate.edit, undefined),
					kind: candidate.kind && candidate.kind.value,
					isPreferred: candidate.isPreferred,
					disabled: candidate.disabled?.reason
				});
			}
		}
		return { cacheId, actions };
	}

	async resolveCodeAction(id: extHostProtocol.ChainedCacheId, token: CancellationToken): Promise<{ edit?: extHostProtocol.IWorkspaceEditDto; command?: extHostProtocol.ICommandDto }> {
		const [sessionId, itemId] = id;
		const item = this._cache.get(sessionId, itemId);
		if (!item || CodeActionAdapter._isCommand(item)) {
			return {}; // code actions only!
		}
		if (!this._provider.resolveCodeAction) {
			return {}; // this should not happen...
		}


		const resolvedItem = (await this._provider.resolveCodeAction(item, token)) ?? item;

		let resolvedEdit: extHostProtocol.IWorkspaceEditDto | undefined;
		if (resolvedItem.edit) {
			resolvedEdit = typeConvert.WorkspaceEdit.from(resolvedItem.edit, undefined);
		}

		let resolvedCommand: extHostProtocol.ICommandDto | undefined;
		if (resolvedItem.command) {
			const disposables = this._disposables.get(sessionId);
			if (disposables) {
				resolvedCommand = this._commands.toInternal(resolvedItem.command, disposables);
			}
		}

		return { edit: resolvedEdit, command: resolvedCommand };
	}

	releaseCodeActions(cachedId: number): void {
		this._disposables.get(cachedId)?.dispose();
		this._disposables.delete(cachedId);
		this._cache.delete(cachedId);
	}

	private static _isCommand(thing: any): thing is vscode.Command {
		return typeof (<vscode.Command>thing).command === 'string' && typeof (<vscode.Command>thing).title === 'string';
	}
}

class DocumentPasteEditProvider {

	constructor(
		private readonly _proxy: extHostProtocol.MainThreadLanguageFeaturesShape,
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentPasteEditProvider,
		private readonly _handle: number,
		private readonly _extension: IExtensionDescription,
	) { }

	async prepareDocumentPaste(resource: URI, ranges: IRange[], dataTransferDto: extHostProtocol.DataTransferDTO, token: CancellationToken): Promise<extHostProtocol.DataTransferDTO | undefined> {
		if (!this._provider.prepareDocumentPaste) {
			return;
		}

		const doc = this._documents.getDocument(resource);
		const vscodeRanges = ranges.map(range => typeConvert.Range.to(range));

		const dataTransfer = typeConvert.DataTransfer.toDataTransfer(dataTransferDto, () => {
			throw new NotImplementedError();
		});
		await this._provider.prepareDocumentPaste(doc, vscodeRanges, dataTransfer, token);
		if (token.isCancellationRequested) {
			return;
		}

		// Only send back values that have been added to the data transfer
		const entries = Array.from(dataTransfer).filter(([, value]) => !(value instanceof InternalDataTransferItem));
		return typeConvert.DataTransfer.from(entries);
	}

	async providePasteEdits(requestId: number, resource: URI, ranges: IRange[], dataTransferDto: extHostProtocol.DataTransferDTO, token: CancellationToken): Promise<undefined | extHostProtocol.IPasteEditDto> {
		if (!this._provider.provideDocumentPasteEdits) {
			return;
		}

		const doc = this._documents.getDocument(resource);
		const vscodeRanges = ranges.map(range => typeConvert.Range.to(range));

		const dataTransfer = typeConvert.DataTransfer.toDataTransfer(dataTransferDto, async (id) => {
			return (await this._proxy.$resolvePasteFileData(this._handle, requestId, id)).buffer;
		});

		const edit = await this._provider.provideDocumentPasteEdits(doc, vscodeRanges, dataTransfer, token);
		if (!edit) {
			return;
		}

		return {
			id: edit.id ? this._extension.identifier.value + '.' + edit.id : this._extension.identifier.value,
			label: edit.label ?? localize('defaultPasteLabel', "Paste using '{0}' extension", this._extension.displayName || this._extension.name),
			detail: this._extension.displayName || this._extension.name,
			priority: edit.priority ?? 0,
			insertText: typeof edit.insertText === 'string' ? edit.insertText : { snippet: edit.insertText.value },
			additionalEdit: edit.additionalEdit ? typeConvert.WorkspaceEdit.from(edit.additionalEdit, undefined) : undefined,
		};
	}
}

class DocumentFormattingAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentFormattingEditProvider
	) { }

	async provideDocumentFormattingEdits(resource: URI, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {

		const document = this._documents.getDocument(resource);

		const value = await this._provider.provideDocumentFormattingEdits(document, <any>options, token);
		if (Array.isArray(value)) {
			return value.map(typeConvert.TextEdit.from);
		}
		return undefined;
	}
}

class RangeFormattingAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentRangeFormattingEditProvider
	) { }

	async provideDocumentRangeFormattingEdits(resource: URI, range: IRange, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {

		const document = this._documents.getDocument(resource);
		const ran = typeConvert.Range.to(range);

		const value = await this._provider.provideDocumentRangeFormattingEdits(document, ran, <any>options, token);
		if (Array.isArray(value)) {
			return value.map(typeConvert.TextEdit.from);
		}
		return undefined;
	}

	async provideDocumentRangesFormattingEdits(resource: URI, ranges: IRange[], options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {
		assertType(typeof this._provider.provideDocumentRangesFormattingEdits === 'function', 'INVALID invocation of `provideDocumentRangesFormattingEdits`');

		const document = this._documents.getDocument(resource);
		const _ranges = <Range[]>ranges.map(typeConvert.Range.to);
		const value = await this._provider.provideDocumentRangesFormattingEdits(document, _ranges, <any>options, token);
		if (Array.isArray(value)) {
			return value.map(typeConvert.TextEdit.from);
		}
		return undefined;
	}
}

class OnTypeFormattingAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.OnTypeFormattingEditProvider
	) { }

	autoFormatTriggerCharacters: string[] = []; // not here

	async provideOnTypeFormattingEdits(resource: URI, position: IPosition, ch: string, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {

		const document = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		const value = await this._provider.provideOnTypeFormattingEdits(document, pos, ch, <any>options, token);
		if (Array.isArray(value)) {
			return value.map(typeConvert.TextEdit.from);
		}
		return undefined;
	}
}

class NavigateTypeAdapter {

	private readonly _cache = new Cache<vscode.SymbolInformation>('WorkspaceSymbols');

	constructor(
		private readonly _provider: vscode.WorkspaceSymbolProvider,
		private readonly _logService: ILogService
	) { }

	async provideWorkspaceSymbols(search: string, token: CancellationToken): Promise<extHostProtocol.IWorkspaceSymbolsDto> {
		const value = await this._provider.provideWorkspaceSymbols(search, token);

		if (!isNonEmptyArray(value)) {
			return { symbols: [] };
		}

		const sid = this._cache.add(value);
		const result: extHostProtocol.IWorkspaceSymbolsDto = {
			cacheId: sid,
			symbols: []
		};

		for (let i = 0; i < value.length; i++) {
			const item = value[i];
			if (!item || !item.name) {
				this._logService.warn('INVALID SymbolInformation', item);
				continue;
			}
			result.symbols.push({
				...typeConvert.WorkspaceSymbol.from(item),
				cacheId: [sid, i]
			});
		}

		return result;
	}

	async resolveWorkspaceSymbol(symbol: extHostProtocol.IWorkspaceSymbolDto, token: CancellationToken): Promise<extHostProtocol.IWorkspaceSymbolDto | undefined> {
		if (typeof this._provider.resolveWorkspaceSymbol !== 'function') {
			return symbol;
		}
		if (!symbol.cacheId) {
			return symbol;
		}
		const item = this._cache.get(...symbol.cacheId);
		if (item) {
			const value = await this._provider.resolveWorkspaceSymbol(item, token);
			return value && mixin(symbol, typeConvert.WorkspaceSymbol.from(value), true);
		}
		return undefined;
	}

	releaseWorkspaceSymbols(id: number): any {
		this._cache.delete(id);
	}
}

class RenameAdapter {

	static supportsResolving(provider: vscode.RenameProvider): boolean {
		return typeof provider.prepareRename === 'function';
	}

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.RenameProvider,
		private readonly _logService: ILogService
	) { }

	async provideRenameEdits(resource: URI, position: IPosition, newName: string, token: CancellationToken): Promise<extHostProtocol.IWorkspaceEditDto | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		try {
			const value = await this._provider.provideRenameEdits(doc, pos, newName, token);
			if (!value) {
				return undefined;
			}
			return typeConvert.WorkspaceEdit.from(value);

		} catch (err) {
			const rejectReason = RenameAdapter._asMessage(err);
			if (rejectReason) {
				return <extHostProtocol.IWorkspaceEditDto>{ rejectReason, edits: undefined! };
			} else {
				// generic error
				return Promise.reject<extHostProtocol.IWorkspaceEditDto>(err);
			}
		}
	}

	async resolveRenameLocation(resource: URI, position: IPosition, token: CancellationToken): Promise<(languages.RenameLocation & languages.Rejection) | undefined> {
		if (typeof this._provider.prepareRename !== 'function') {
			return Promise.resolve(undefined);
		}

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		try {
			const rangeOrLocation = await this._provider.prepareRename(doc, pos, token);

			let range: vscode.Range | undefined;
			let text: string | undefined;
			if (Range.isRange(rangeOrLocation)) {
				range = rangeOrLocation;
				text = doc.getText(rangeOrLocation);

			} else if (isObject(rangeOrLocation)) {
				range = rangeOrLocation.range;
				text = rangeOrLocation.placeholder;
			}

			if (!range || !text) {
				return undefined;
			}
			if (range.start.line > pos.line || range.end.line < pos.line) {
				this._logService.warn('INVALID rename location: position line must be within range start/end lines');
				return undefined;
			}
			return { range: typeConvert.Range.from(range), text };

		} catch (err) {
			const rejectReason = RenameAdapter._asMessage(err);
			if (rejectReason) {
				return <languages.RenameLocation & languages.Rejection>{ rejectReason, range: undefined!, text: undefined! };
			} else {
				return Promise.reject<any>(err);
			}
		}
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

class SemanticTokensPreviousResult {
	constructor(
		readonly resultId: string | undefined,
		readonly tokens?: Uint32Array,
	) { }
}

type RelaxedSemanticTokens = { readonly resultId?: string; readonly data: number[] };
type RelaxedSemanticTokensEdit = { readonly start: number; readonly deleteCount: number; readonly data?: number[] };
type RelaxedSemanticTokensEdits = { readonly resultId?: string; readonly edits: RelaxedSemanticTokensEdit[] };

type ProvidedSemanticTokens = vscode.SemanticTokens | RelaxedSemanticTokens;
type ProvidedSemanticTokensEdits = vscode.SemanticTokensEdits | RelaxedSemanticTokensEdits;

class DocumentSemanticTokensAdapter {

	private readonly _previousResults: Map<number, SemanticTokensPreviousResult>;
	private _nextResultId = 1;

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentSemanticTokensProvider,
	) {
		this._previousResults = new Map<number, SemanticTokensPreviousResult>();
	}

	async provideDocumentSemanticTokens(resource: URI, previousResultId: number, token: CancellationToken): Promise<VSBuffer | null> {
		const doc = this._documents.getDocument(resource);
		const previousResult = (previousResultId !== 0 ? this._previousResults.get(previousResultId) : null);
		let value = typeof previousResult?.resultId === 'string' && typeof this._provider.provideDocumentSemanticTokensEdits === 'function'
			? await this._provider.provideDocumentSemanticTokensEdits(doc, previousResult.resultId, token)
			: await this._provider.provideDocumentSemanticTokens(doc, token);

		if (previousResult) {
			this._previousResults.delete(previousResultId);
		}
		if (!value) {
			return null;
		}
		value = DocumentSemanticTokensAdapter._fixProvidedSemanticTokens(value);
		return this._send(DocumentSemanticTokensAdapter._convertToEdits(previousResult, value), value);
	}

	async releaseDocumentSemanticColoring(semanticColoringResultId: number): Promise<void> {
		this._previousResults.delete(semanticColoringResultId);
	}

	private static _fixProvidedSemanticTokens(v: ProvidedSemanticTokens | ProvidedSemanticTokensEdits): vscode.SemanticTokens | vscode.SemanticTokensEdits {
		if (DocumentSemanticTokensAdapter._isSemanticTokens(v)) {
			if (DocumentSemanticTokensAdapter._isCorrectSemanticTokens(v)) {
				return v;
			}
			return new SemanticTokens(new Uint32Array(v.data), v.resultId);
		} else if (DocumentSemanticTokensAdapter._isSemanticTokensEdits(v)) {
			if (DocumentSemanticTokensAdapter._isCorrectSemanticTokensEdits(v)) {
				return v;
			}
			return new SemanticTokensEdits(v.edits.map(edit => new SemanticTokensEdit(edit.start, edit.deleteCount, edit.data ? new Uint32Array(edit.data) : edit.data)), v.resultId);
		}
		return v;
	}

	private static _isSemanticTokens(v: ProvidedSemanticTokens | ProvidedSemanticTokensEdits): v is ProvidedSemanticTokens {
		return v && !!((v as ProvidedSemanticTokens).data);
	}

	private static _isCorrectSemanticTokens(v: ProvidedSemanticTokens): v is vscode.SemanticTokens {
		return (v.data instanceof Uint32Array);
	}

	private static _isSemanticTokensEdits(v: ProvidedSemanticTokens | ProvidedSemanticTokensEdits): v is ProvidedSemanticTokensEdits {
		return v && Array.isArray((v as ProvidedSemanticTokensEdits).edits);
	}

	private static _isCorrectSemanticTokensEdits(v: ProvidedSemanticTokensEdits): v is vscode.SemanticTokensEdits {
		for (const edit of v.edits) {
			if (!(edit.data instanceof Uint32Array)) {
				return false;
			}
		}
		return true;
	}

	private static _convertToEdits(previousResult: SemanticTokensPreviousResult | null | undefined, newResult: vscode.SemanticTokens | vscode.SemanticTokensEdits): vscode.SemanticTokens | vscode.SemanticTokensEdits {
		if (!DocumentSemanticTokensAdapter._isSemanticTokens(newResult)) {
			return newResult;
		}
		if (!previousResult || !previousResult.tokens) {
			return newResult;
		}
		const oldData = previousResult.tokens;
		const oldLength = oldData.length;
		const newData = newResult.data;
		const newLength = newData.length;

		let commonPrefixLength = 0;
		const maxCommonPrefixLength = Math.min(oldLength, newLength);
		while (commonPrefixLength < maxCommonPrefixLength && oldData[commonPrefixLength] === newData[commonPrefixLength]) {
			commonPrefixLength++;
		}

		if (commonPrefixLength === oldLength && commonPrefixLength === newLength) {
			// complete overlap!
			return new SemanticTokensEdits([], newResult.resultId);
		}

		let commonSuffixLength = 0;
		const maxCommonSuffixLength = maxCommonPrefixLength - commonPrefixLength;
		while (commonSuffixLength < maxCommonSuffixLength && oldData[oldLength - commonSuffixLength - 1] === newData[newLength - commonSuffixLength - 1]) {
			commonSuffixLength++;
		}

		return new SemanticTokensEdits([{
			start: commonPrefixLength,
			deleteCount: (oldLength - commonPrefixLength - commonSuffixLength),
			data: newData.subarray(commonPrefixLength, newLength - commonSuffixLength)
		}], newResult.resultId);
	}

	private _send(value: vscode.SemanticTokens | vscode.SemanticTokensEdits, original: vscode.SemanticTokens | vscode.SemanticTokensEdits): VSBuffer | null {
		if (DocumentSemanticTokensAdapter._isSemanticTokens(value)) {
			const myId = this._nextResultId++;
			this._previousResults.set(myId, new SemanticTokensPreviousResult(value.resultId, value.data));
			return encodeSemanticTokensDto({
				id: myId,
				type: 'full',
				data: value.data
			});
		}

		if (DocumentSemanticTokensAdapter._isSemanticTokensEdits(value)) {
			const myId = this._nextResultId++;
			if (DocumentSemanticTokensAdapter._isSemanticTokens(original)) {
				// store the original
				this._previousResults.set(myId, new SemanticTokensPreviousResult(original.resultId, original.data));
			} else {
				this._previousResults.set(myId, new SemanticTokensPreviousResult(value.resultId));
			}
			return encodeSemanticTokensDto({
				id: myId,
				type: 'delta',
				deltas: (value.edits || []).map(edit => ({ start: edit.start, deleteCount: edit.deleteCount, data: edit.data }))
			});
		}

		return null;
	}
}

class DocumentRangeSemanticTokensAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentRangeSemanticTokensProvider,
	) { }

	async provideDocumentRangeSemanticTokens(resource: URI, range: IRange, token: CancellationToken): Promise<VSBuffer | null> {
		const doc = this._documents.getDocument(resource);
		const value = await this._provider.provideDocumentRangeSemanticTokens(doc, typeConvert.Range.to(range), token);
		if (!value) {
			return null;
		}
		return this._send(value);
	}

	private _send(value: vscode.SemanticTokens): VSBuffer {
		return encodeSemanticTokensDto({
			id: 0,
			type: 'full',
			data: value.data
		});
	}
}

class CompletionsAdapter {

	static supportsResolving(provider: vscode.CompletionItemProvider): boolean {
		return typeof provider.resolveCompletionItem === 'function';
	}

	private _cache = new Cache<vscode.CompletionItem>('CompletionItem');
	private _disposables = new Map<number, DisposableStore>();

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _provider: vscode.CompletionItemProvider,
		private readonly _apiDeprecation: IExtHostApiDeprecationService,
		private readonly _extension: IExtensionDescription,
	) { }

	async provideCompletionItems(resource: URI, position: IPosition, context: languages.CompletionContext, token: CancellationToken): Promise<extHostProtocol.ISuggestResultDto | undefined> {

		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		// The default insert/replace ranges. It's important to compute them
		// before asynchronously asking the provider for its results. See
		// https://github.com/microsoft/vscode/issues/83400#issuecomment-546851421
		const replaceRange = doc.getWordRangeAtPosition(pos) || new Range(pos, pos);
		const insertRange = replaceRange.with({ end: pos });

		const sw = new StopWatch();
		const itemsOrList = await this._provider.provideCompletionItems(doc, pos, token, typeConvert.CompletionContext.to(context));

		if (!itemsOrList) {
			// undefined and null are valid results
			return undefined;
		}

		if (token.isCancellationRequested) {
			// cancelled -> return without further ado, esp no caching
			// of results as they will leak
			return undefined;
		}

		const list = Array.isArray(itemsOrList) ? new CompletionList(itemsOrList) : itemsOrList;

		// keep result for providers that support resolving
		const pid: number = CompletionsAdapter.supportsResolving(this._provider) ? this._cache.add(list.items) : this._cache.add([]);
		const disposables = new DisposableStore();
		this._disposables.set(pid, disposables);

		const completions: extHostProtocol.ISuggestDataDto[] = [];
		const result: extHostProtocol.ISuggestResultDto = {
			x: pid,
			[extHostProtocol.ISuggestResultDtoField.completions]: completions,
			[extHostProtocol.ISuggestResultDtoField.defaultRanges]: { replace: typeConvert.Range.from(replaceRange), insert: typeConvert.Range.from(insertRange) },
			[extHostProtocol.ISuggestResultDtoField.isIncomplete]: list.isIncomplete || undefined,
			[extHostProtocol.ISuggestResultDtoField.duration]: sw.elapsed()
		};

		for (let i = 0; i < list.items.length; i++) {
			const item = list.items[i];
			// check for bad completion item first
			const dto = this._convertCompletionItem(item, [pid, i], insertRange, replaceRange);
			completions.push(dto);
		}

		return result;
	}

	async resolveCompletionItem(id: extHostProtocol.ChainedCacheId, token: CancellationToken): Promise<extHostProtocol.ISuggestDataDto | undefined> {

		if (typeof this._provider.resolveCompletionItem !== 'function') {
			return undefined;
		}

		const item = this._cache.get(...id);
		if (!item) {
			return undefined;
		}

		const resolvedItem = await this._provider.resolveCompletionItem!(item, token);

		if (!resolvedItem) {
			return undefined;
		}

		const enforcedResolvedItem = {
			...item,
			documentation: resolvedItem.documentation,
			detail: resolvedItem.detail,
			additionalTextEdits: resolvedItem.additionalTextEdits
		};

		if (CompletionsAdapter._insertTextIdent(item.insertText) !== CompletionsAdapter._insertTextIdent(resolvedItem.insertText)) {
			this._apiDeprecation.report('CompletionItem.insertText', this._extension, 'extension MAY NOT change \'insertText\' of a CompletionItem during resolve');
			enforcedResolvedItem.insertText = resolvedItem.insertText;
		}

		return this._convertCompletionItem(enforcedResolvedItem, id);
	}

	private static _insertTextIdent(insertText: string | vscode.SnippetString | undefined) {
		switch (typeof insertText) {
			case 'string': return insertText;
			case 'undefined': return undefined;
			case 'object': return insertText.value;
		}
	}

	releaseCompletionItems(id: number): any {
		this._disposables.get(id)?.dispose();
		this._disposables.delete(id);
		this._cache.delete(id);
	}

	private _convertCompletionItem(item: vscode.CompletionItem, id: extHostProtocol.ChainedCacheId, defaultInsertRange?: vscode.Range, defaultReplaceRange?: vscode.Range): extHostProtocol.ISuggestDataDto {

		const disposables = this._disposables.get(id[0]);
		if (!disposables) {
			throw Error('DisposableStore is missing...');
		}

		const command = this._commands.toInternal(item.command, disposables);
		const result: extHostProtocol.ISuggestDataDto = {
			//
			x: id,
			//
			[extHostProtocol.ISuggestDataDtoField.label]: item.label,
			[extHostProtocol.ISuggestDataDtoField.kind]: item.kind !== undefined ? typeConvert.CompletionItemKind.from(item.kind) : undefined,
			[extHostProtocol.ISuggestDataDtoField.kindModifier]: item.tags && item.tags.map(typeConvert.CompletionItemTag.from),
			[extHostProtocol.ISuggestDataDtoField.detail]: item.detail,
			[extHostProtocol.ISuggestDataDtoField.documentation]: typeof item.documentation === 'undefined' ? undefined : typeConvert.MarkdownString.fromStrict(item.documentation),
			[extHostProtocol.ISuggestDataDtoField.sortText]: item.sortText !== item.label ? item.sortText : undefined,
			[extHostProtocol.ISuggestDataDtoField.filterText]: item.filterText !== item.label ? item.filterText : undefined,
			[extHostProtocol.ISuggestDataDtoField.preselect]: item.preselect || undefined,
			[extHostProtocol.ISuggestDataDtoField.insertTextRules]: item.keepWhitespace ? languages.CompletionItemInsertTextRule.KeepWhitespace : languages.CompletionItemInsertTextRule.None,
			[extHostProtocol.ISuggestDataDtoField.commitCharacters]: item.commitCharacters?.join(''),
			[extHostProtocol.ISuggestDataDtoField.additionalTextEdits]: item.additionalTextEdits && item.additionalTextEdits.map(typeConvert.TextEdit.from),
			[extHostProtocol.ISuggestDataDtoField.commandIdent]: command?.$ident,
			[extHostProtocol.ISuggestDataDtoField.commandId]: command?.id,
			[extHostProtocol.ISuggestDataDtoField.commandArguments]: command?.$ident ? undefined : command?.arguments, // filled in on main side from $ident
		};

		// 'insertText'-logic
		if (item.textEdit) {
			this._apiDeprecation.report('CompletionItem.textEdit', this._extension, `Use 'CompletionItem.insertText' and 'CompletionItem.range' instead.`);
			result[extHostProtocol.ISuggestDataDtoField.insertText] = item.textEdit.newText;

		} else if (typeof item.insertText === 'string') {
			result[extHostProtocol.ISuggestDataDtoField.insertText] = item.insertText;

		} else if (item.insertText instanceof SnippetString) {
			result[extHostProtocol.ISuggestDataDtoField.insertText] = item.insertText.value;
			result[extHostProtocol.ISuggestDataDtoField.insertTextRules]! |= languages.CompletionItemInsertTextRule.InsertAsSnippet;
		}

		// 'overwrite[Before|After]'-logic
		let range: vscode.Range | { inserting: vscode.Range; replacing: vscode.Range } | undefined;
		if (item.textEdit) {
			range = item.textEdit.range;
		} else if (item.range) {
			range = item.range;
		}

		if (Range.isRange(range)) {
			// "old" range
			result[extHostProtocol.ISuggestDataDtoField.range] = typeConvert.Range.from(range);

		} else if (range && (!defaultInsertRange?.isEqual(range.inserting) || !defaultReplaceRange?.isEqual(range.replacing))) {
			// ONLY send range when it's different from the default ranges (safe bandwidth)
			result[extHostProtocol.ISuggestDataDtoField.range] = {
				insert: typeConvert.Range.from(range.inserting),
				replace: typeConvert.Range.from(range.replacing)
			};
		}

		return result;
	}
}

class InlineCompletionAdapterBase {
	async provideInlineCompletions(resource: URI, position: IPosition, context: languages.InlineCompletionContext, token: CancellationToken): Promise<extHostProtocol.IdentifiableInlineCompletions | undefined> {
		return undefined;
	}

	disposeCompletions(pid: number): void { }

	handleDidShowCompletionItem(pid: number, idx: number, updatedInsertText: string): void { }

	handlePartialAccept(pid: number, idx: number, acceptedCharacters: number): void { }
}

class InlineCompletionAdapter extends InlineCompletionAdapterBase {
	private readonly _references = new ReferenceMap<{
		dispose(): void;
		items: readonly vscode.InlineCompletionItem[];
	}>();

	private readonly _isAdditionsProposedApiEnabled = isProposedApiEnabled(this._extension, 'inlineCompletionsAdditions');

	constructor(
		private readonly _extension: IExtensionDescription,
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.InlineCompletionItemProvider,
		private readonly _commands: CommandsConverter,
	) {
		super();
	}

	public get supportsHandleEvents(): boolean {
		return isProposedApiEnabled(this._extension, 'inlineCompletionsAdditions')
			&& (typeof this._provider.handleDidShowCompletionItem === 'function'
				|| typeof this._provider.handleDidPartiallyAcceptCompletionItem === 'function');
	}

	private readonly languageTriggerKindToVSCodeTriggerKind: Record<languages.InlineCompletionTriggerKind, InlineCompletionTriggerKind> = {
		[languages.InlineCompletionTriggerKind.Automatic]: InlineCompletionTriggerKind.Automatic,
		[languages.InlineCompletionTriggerKind.Explicit]: InlineCompletionTriggerKind.Invoke,
	};

	override async provideInlineCompletions(resource: URI, position: IPosition, context: languages.InlineCompletionContext, token: CancellationToken): Promise<extHostProtocol.IdentifiableInlineCompletions | undefined> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);

		const result = await this._provider.provideInlineCompletionItems(doc, pos, {
			selectedCompletionInfo:
				context.selectedSuggestionInfo
					? {
						range: typeConvert.Range.to(context.selectedSuggestionInfo.range),
						text: context.selectedSuggestionInfo.text
					}
					: undefined,
			triggerKind: this.languageTriggerKindToVSCodeTriggerKind[context.triggerKind]
		}, token);

		if (!result) {
			// undefined and null are valid results
			return undefined;
		}

		if (token.isCancellationRequested) {
			// cancelled -> return without further ado, esp no caching
			// of results as they will leak
			return undefined;
		}

		const normalizedResult = Array.isArray(result) ? result : result.items;
		const commands = this._isAdditionsProposedApiEnabled ? Array.isArray(result) ? [] : result.commands || [] : [];
		const suppressSuggestions = this._isAdditionsProposedApiEnabled && !Array.isArray(result) ? result.suppressSuggestions : undefined;
		const enableForwardStability = this._isAdditionsProposedApiEnabled && !Array.isArray(result) ? result.enableForwardStability : undefined;

		let disposableStore: DisposableStore | undefined = undefined;
		const pid = this._references.createReferenceId({
			dispose() {
				disposableStore?.dispose();
			},
			items: normalizedResult
		});

		return {
			pid,
			items: normalizedResult.map<extHostProtocol.IdentifiableInlineCompletion>((item, idx) => {
				let command: languages.Command | undefined = undefined;
				if (item.command) {
					if (!disposableStore) {
						disposableStore = new DisposableStore();
					}
					command = this._commands.toInternal(item.command, disposableStore);
				}

				const insertText = item.insertText;
				return ({
					insertText: typeof insertText === 'string' ? insertText : { snippet: insertText.value },
					filterText: item.filterText,
					range: item.range ? typeConvert.Range.from(item.range) : undefined,
					command,
					idx: idx,
					completeBracketPairs: this._isAdditionsProposedApiEnabled ? item.completeBracketPairs : false,
				});
			}),
			commands: commands.map(c => {
				if (!disposableStore) {
					disposableStore = new DisposableStore();
				}
				return this._commands.toInternal(c, disposableStore);
			}),
			suppressSuggestions,
			enableForwardStability,
		};
	}

	override disposeCompletions(pid: number) {
		const data = this._references.disposeReferenceId(pid);
		data?.dispose();
	}

	override handleDidShowCompletionItem(pid: number, idx: number, updatedInsertText: string): void {
		const completionItem = this._references.get(pid)?.items[idx];
		if (completionItem) {
			if (this._provider.handleDidShowCompletionItem && this._isAdditionsProposedApiEnabled) {
				this._provider.handleDidShowCompletionItem(completionItem, updatedInsertText);
			}
		}
	}

	override handlePartialAccept(pid: number, idx: number, acceptedCharacters: number): void {
		const completionItem = this._references.get(pid)?.items[idx];
		if (completionItem) {
			if (this._provider.handleDidPartiallyAcceptCompletionItem && this._isAdditionsProposedApiEnabled) {
				this._provider.handleDidPartiallyAcceptCompletionItem(completionItem, acceptedCharacters);
			}
		}
	}
}

class ReferenceMap<T> {
	private readonly _references = new Map<number, T>();
	private _idPool = 1;

	createReferenceId(value: T): number {
		const id = this._idPool++;
		this._references.set(id, value);
		return id;
	}

	disposeReferenceId(referenceId: number): T | undefined {
		const value = this._references.get(referenceId);
		this._references.delete(referenceId);
		return value;
	}

	get(referenceId: number): T | undefined {
		return this._references.get(referenceId);
	}
}

class SignatureHelpAdapter {

	private readonly _cache = new Cache<vscode.SignatureHelp>('SignatureHelp');

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.SignatureHelpProvider,
	) { }

	async provideSignatureHelp(resource: URI, position: IPosition, context: extHostProtocol.ISignatureHelpContextDto, token: CancellationToken): Promise<extHostProtocol.ISignatureHelpDto | undefined> {
		const doc = this._documents.getDocument(resource);
		const pos = typeConvert.Position.to(position);
		const vscodeContext = this.reviveContext(context);

		const value = await this._provider.provideSignatureHelp(doc, pos, token, vscodeContext);
		if (value) {
			const id = this._cache.add([value]);
			return { ...typeConvert.SignatureHelp.from(value), id };
		}
		return undefined;
	}

	private reviveContext(context: extHostProtocol.ISignatureHelpContextDto): vscode.SignatureHelpContext {
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

class InlayHintsAdapter {

	private _cache = new Cache<vscode.InlayHint>('InlayHints');
	private readonly _disposables = new Map<number, DisposableStore>();

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _provider: vscode.InlayHintsProvider,
		private readonly _logService: ILogService,
		private readonly _extension: IExtensionDescription
	) { }

	async provideInlayHints(resource: URI, ran: IRange, token: CancellationToken): Promise<extHostProtocol.IInlayHintsDto | undefined> {
		const doc = this._documents.getDocument(resource);
		const range = typeConvert.Range.to(ran);

		const hints = await this._provider.provideInlayHints(doc, range, token);
		if (!Array.isArray(hints) || hints.length === 0) {
			// bad result
			this._logService.trace(`[InlayHints] NO inlay hints from '${this._extension.identifier.value}' for ${ran}`);
			return undefined;
		}
		if (token.isCancellationRequested) {
			// cancelled -> return without further ado, esp no caching
			// of results as they will leak
			return undefined;
		}
		const pid = this._cache.add(hints);
		this._disposables.set(pid, new DisposableStore());
		const result: extHostProtocol.IInlayHintsDto = { hints: [], cacheId: pid };
		for (let i = 0; i < hints.length; i++) {
			if (this._isValidInlayHint(hints[i], range)) {
				result.hints.push(this._convertInlayHint(hints[i], [pid, i]));
			}
		}
		this._logService.trace(`[InlayHints] ${result.hints.length} inlay hints from '${this._extension.identifier.value}' for ${ran}`);
		return result;
	}

	async resolveInlayHint(id: extHostProtocol.ChainedCacheId, token: CancellationToken) {
		if (typeof this._provider.resolveInlayHint !== 'function') {
			return undefined;
		}
		const item = this._cache.get(...id);
		if (!item) {
			return undefined;
		}
		const hint = await this._provider.resolveInlayHint!(item, token);
		if (!hint) {
			return undefined;
		}
		if (!this._isValidInlayHint(hint)) {
			return undefined;
		}
		return this._convertInlayHint(hint, id);
	}

	releaseHints(id: number): any {
		this._disposables.get(id)?.dispose();
		this._disposables.delete(id);
		this._cache.delete(id);
	}

	private _isValidInlayHint(hint: vscode.InlayHint, range?: vscode.Range): boolean {
		if (hint.label.length === 0 || Array.isArray(hint.label) && hint.label.every(part => part.value.length === 0)) {
			console.log('INVALID inlay hint, empty label', hint);
			return false;
		}
		if (range && !range.contains(hint.position)) {
			// console.log('INVALID inlay hint, position outside range', range, hint);
			return false;
		}
		return true;
	}

	private _convertInlayHint(hint: vscode.InlayHint, id: extHostProtocol.ChainedCacheId): extHostProtocol.IInlayHintDto {

		const disposables = this._disposables.get(id[0]);
		if (!disposables) {
			throw Error('DisposableStore is missing...');
		}

		const result: extHostProtocol.IInlayHintDto = {
			label: '', // fill-in below
			cacheId: id,
			tooltip: typeConvert.MarkdownString.fromStrict(hint.tooltip),
			position: typeConvert.Position.from(hint.position),
			textEdits: hint.textEdits && hint.textEdits.map(typeConvert.TextEdit.from),
			kind: hint.kind && typeConvert.InlayHintKind.from(hint.kind),
			paddingLeft: hint.paddingLeft,
			paddingRight: hint.paddingRight,
		};

		if (typeof hint.label === 'string') {
			result.label = hint.label;
		} else {
			result.label = hint.label.map(part => {
				const result: languages.InlayHintLabelPart = { label: part.value };
				result.tooltip = typeConvert.MarkdownString.fromStrict(part.tooltip);
				if (Location.isLocation(part.location)) {
					result.location = typeConvert.location.from(part.location);
				}
				if (part.command) {
					result.command = this._commands.toInternal(part.command, disposables);
				}
				return result;
			});
		}
		return result;
	}
}

class LinkProviderAdapter {

	private _cache = new Cache<vscode.DocumentLink>('DocumentLink');

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentLinkProvider
	) { }

	async provideLinks(resource: URI, token: CancellationToken): Promise<extHostProtocol.ILinksListDto | undefined> {
		const doc = this._documents.getDocument(resource);

		const links = await this._provider.provideDocumentLinks(doc, token);
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
			return { links: links.filter(LinkProviderAdapter._validateLink).map(typeConvert.DocumentLink.from) };

		} else {
			// cache links for future resolving
			const pid = this._cache.add(links);
			const result: extHostProtocol.ILinksListDto = { links: [], cacheId: pid };
			for (let i = 0; i < links.length; i++) {

				if (!LinkProviderAdapter._validateLink(links[i])) {
					continue;
				}

				const dto: extHostProtocol.ILinkDto = typeConvert.DocumentLink.from(links[i]);
				dto.cacheId = [pid, i];
				result.links.push(dto);
			}
			return result;
		}
	}

	private static _validateLink(link: vscode.DocumentLink): boolean {
		if (link.target && link.target.path.length > 50_000) {
			console.warn('DROPPING link because it is too long');
			return false;
		}
		return true;
	}

	async resolveLink(id: extHostProtocol.ChainedCacheId, token: CancellationToken): Promise<extHostProtocol.ILinkDto | undefined> {
		if (typeof this._provider.resolveDocumentLink !== 'function') {
			return undefined;
		}
		const item = this._cache.get(...id);
		if (!item) {
			return undefined;
		}
		const link = await this._provider.resolveDocumentLink!(item, token);
		if (!link || !LinkProviderAdapter._validateLink(link)) {
			return undefined;
		}
		return typeConvert.DocumentLink.from(link);
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

	async provideColors(resource: URI, token: CancellationToken): Promise<extHostProtocol.IRawColorInfo[]> {
		const doc = this._documents.getDocument(resource);
		const colors = await this._provider.provideDocumentColors(doc, token);
		if (!Array.isArray(colors)) {
			return [];
		}
		const colorInfos: extHostProtocol.IRawColorInfo[] = colors.map(ci => {
			return {
				color: typeConvert.Color.from(ci.color),
				range: typeConvert.Range.from(ci.range)
			};
		});
		return colorInfos;
	}

	async provideColorPresentations(resource: URI, raw: extHostProtocol.IRawColorInfo, token: CancellationToken): Promise<languages.IColorPresentation[] | undefined> {
		const document = this._documents.getDocument(resource);
		const range = typeConvert.Range.to(raw.range);
		const color = typeConvert.Color.to(raw.color);
		const value = await this._provider.provideColorPresentations(color, { document, range }, token);
		if (!Array.isArray(value)) {
			return undefined;
		}
		return value.map(typeConvert.ColorPresentation.from);
	}
}

class FoldingProviderAdapter {

	constructor(
		private _documents: ExtHostDocuments,
		private _provider: vscode.FoldingRangeProvider
	) { }

	async provideFoldingRanges(resource: URI, context: languages.FoldingContext, token: CancellationToken): Promise<languages.FoldingRange[] | undefined> {
		const doc = this._documents.getDocument(resource);
		const ranges = await this._provider.provideFoldingRanges(doc, context, token);
		if (!Array.isArray(ranges)) {
			return undefined;
		}
		return ranges.map(typeConvert.FoldingRange.from);
	}
}

class SelectionRangeAdapter {

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.SelectionRangeProvider,
		private readonly _logService: ILogService
	) { }

	async provideSelectionRanges(resource: URI, pos: IPosition[], token: CancellationToken): Promise<languages.SelectionRange[][]> {
		const document = this._documents.getDocument(resource);
		const positions = pos.map(typeConvert.Position.to);

		const allProviderRanges = await this._provider.provideSelectionRanges(document, positions, token);
		if (!isNonEmptyArray(allProviderRanges)) {
			return [];
		}
		if (allProviderRanges.length !== positions.length) {
			this._logService.warn('BAD selection ranges, provider must return ranges for each position');
			return [];
		}
		const allResults: languages.SelectionRange[][] = [];
		for (let i = 0; i < positions.length; i++) {
			const oneResult: languages.SelectionRange[] = [];
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
	}
}

class CallHierarchyAdapter {

	private readonly _idPool = new IdGenerator('');
	private readonly _cache = new Map<string, Map<string, vscode.CallHierarchyItem>>();

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.CallHierarchyProvider
	) { }

	async prepareSession(uri: URI, position: IPosition, token: CancellationToken): Promise<extHostProtocol.ICallHierarchyItemDto[] | undefined> {
		const doc = this._documents.getDocument(uri);
		const pos = typeConvert.Position.to(position);

		const items = await this._provider.prepareCallHierarchy(doc, pos, token);
		if (!items) {
			return undefined;
		}

		const sessionId = this._idPool.nextId();
		this._cache.set(sessionId, new Map());

		if (Array.isArray(items)) {
			return items.map(item => this._cacheAndConvertItem(sessionId, item));
		} else {
			return [this._cacheAndConvertItem(sessionId, items)];
		}
	}

	async provideCallsTo(sessionId: string, itemId: string, token: CancellationToken): Promise<extHostProtocol.IIncomingCallDto[] | undefined> {
		const item = this._itemFromCache(sessionId, itemId);
		if (!item) {
			throw new Error('missing call hierarchy item');
		}
		const calls = await this._provider.provideCallHierarchyIncomingCalls(item, token);
		if (!calls) {
			return undefined;
		}
		return calls.map(call => {
			return {
				from: this._cacheAndConvertItem(sessionId, call.from),
				fromRanges: call.fromRanges.map(r => typeConvert.Range.from(r))
			};
		});
	}

	async provideCallsFrom(sessionId: string, itemId: string, token: CancellationToken): Promise<extHostProtocol.IOutgoingCallDto[] | undefined> {
		const item = this._itemFromCache(sessionId, itemId);
		if (!item) {
			throw new Error('missing call hierarchy item');
		}
		const calls = await this._provider.provideCallHierarchyOutgoingCalls(item, token);
		if (!calls) {
			return undefined;
		}
		return calls.map(call => {
			return {
				to: this._cacheAndConvertItem(sessionId, call.to),
				fromRanges: call.fromRanges.map(r => typeConvert.Range.from(r))
			};
		});
	}

	releaseSession(sessionId: string): void {
		this._cache.delete(sessionId);
	}

	private _cacheAndConvertItem(sessionId: string, item: vscode.CallHierarchyItem): extHostProtocol.ICallHierarchyItemDto {
		const map = this._cache.get(sessionId)!;
		const dto = typeConvert.CallHierarchyItem.from(item, sessionId, map.size.toString(36));
		map.set(dto._itemId, item);
		return dto;
	}

	private _itemFromCache(sessionId: string, itemId: string): vscode.CallHierarchyItem | undefined {
		const map = this._cache.get(sessionId);
		return map?.get(itemId);
	}
}

class TypeHierarchyAdapter {

	private readonly _idPool = new IdGenerator('');
	private readonly _cache = new Map<string, Map<string, vscode.TypeHierarchyItem>>();

	constructor(
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.TypeHierarchyProvider
	) { }

	async prepareSession(uri: URI, position: IPosition, token: CancellationToken): Promise<extHostProtocol.ITypeHierarchyItemDto[] | undefined> {
		const doc = this._documents.getDocument(uri);
		const pos = typeConvert.Position.to(position);

		const items = await this._provider.prepareTypeHierarchy(doc, pos, token);
		if (!items) {
			return undefined;
		}

		const sessionId = this._idPool.nextId();
		this._cache.set(sessionId, new Map());

		if (Array.isArray(items)) {
			return items.map(item => this._cacheAndConvertItem(sessionId, item));
		} else {
			return [this._cacheAndConvertItem(sessionId, items)];
		}
	}

	async provideSupertypes(sessionId: string, itemId: string, token: CancellationToken): Promise<extHostProtocol.ITypeHierarchyItemDto[] | undefined> {
		const item = this._itemFromCache(sessionId, itemId);
		if (!item) {
			throw new Error('missing type hierarchy item');
		}
		const supertypes = await this._provider.provideTypeHierarchySupertypes(item, token);
		if (!supertypes) {
			return undefined;
		}
		return supertypes.map(supertype => {
			return this._cacheAndConvertItem(sessionId, supertype);
		});
	}

	async provideSubtypes(sessionId: string, itemId: string, token: CancellationToken): Promise<extHostProtocol.ITypeHierarchyItemDto[] | undefined> {
		const item = this._itemFromCache(sessionId, itemId);
		if (!item) {
			throw new Error('missing type hierarchy item');
		}
		const subtypes = await this._provider.provideTypeHierarchySubtypes(item, token);
		if (!subtypes) {
			return undefined;
		}
		return subtypes.map(subtype => {
			return this._cacheAndConvertItem(sessionId, subtype);
		});
	}

	releaseSession(sessionId: string): void {
		this._cache.delete(sessionId);
	}

	private _cacheAndConvertItem(sessionId: string, item: vscode.TypeHierarchyItem): extHostProtocol.ITypeHierarchyItemDto {
		const map = this._cache.get(sessionId)!;
		const dto = typeConvert.TypeHierarchyItem.from(item, sessionId, map.size.toString(36));
		map.set(dto._itemId, item);
		return dto;
	}

	private _itemFromCache(sessionId: string, itemId: string): vscode.TypeHierarchyItem | undefined {
		const map = this._cache.get(sessionId);
		return map?.get(itemId);
	}
}

class DocumentOnDropEditAdapter {

	constructor(
		private readonly _proxy: extHostProtocol.MainThreadLanguageFeaturesShape,
		private readonly _documents: ExtHostDocuments,
		private readonly _provider: vscode.DocumentDropEditProvider,
		private readonly _handle: number,
		private readonly _extension: IExtensionDescription,
	) { }

	async provideDocumentOnDropEdits(requestId: number, uri: URI, position: IPosition, dataTransferDto: extHostProtocol.DataTransferDTO, token: CancellationToken): Promise<extHostProtocol.IDocumentOnDropEditDto | undefined> {
		const doc = this._documents.getDocument(uri);
		const pos = typeConvert.Position.to(position);
		const dataTransfer = typeConvert.DataTransfer.toDataTransfer(dataTransferDto, async (id) => {
			return (await this._proxy.$resolveDocumentOnDropFileData(this._handle, requestId, id)).buffer;
		});

		const edit = await this._provider.provideDocumentDropEdits(doc, pos, dataTransfer, token);
		if (!edit) {
			return undefined;
		}
		return {
			id: edit.id ? this._extension.identifier.value + '.' + edit.id : this._extension.identifier.value,
			label: edit.label ?? localize('defaultDropLabel', "Drop using '{0}' extension", this._extension.displayName || this._extension.name),
			priority: edit.priority ?? 0,
			insertText: typeof edit.insertText === 'string' ? edit.insertText : { snippet: edit.insertText.value },
			additionalEdit: edit.additionalEdit ? typeConvert.WorkspaceEdit.from(edit.additionalEdit, undefined) : undefined,
		};
	}
}

type Adapter = DocumentSymbolAdapter | CodeLensAdapter | DefinitionAdapter | HoverAdapter
	| DocumentHighlightAdapter | ReferenceAdapter | CodeActionAdapter | DocumentPasteEditProvider | DocumentFormattingAdapter
	| RangeFormattingAdapter | OnTypeFormattingAdapter | NavigateTypeAdapter | RenameAdapter
	| CompletionsAdapter | SignatureHelpAdapter | LinkProviderAdapter | ImplementationAdapter
	| TypeDefinitionAdapter | ColorProviderAdapter | FoldingProviderAdapter | DeclarationAdapter
	| SelectionRangeAdapter | CallHierarchyAdapter | TypeHierarchyAdapter
	| DocumentSemanticTokensAdapter | DocumentRangeSemanticTokensAdapter
	| EvaluatableExpressionAdapter | InlineValuesAdapter
	| LinkedEditingRangeAdapter | InlayHintsAdapter | InlineCompletionAdapter
	| DocumentOnDropEditAdapter;

class AdapterData {
	constructor(
		readonly adapter: Adapter,
		readonly extension: IExtensionDescription
	) { }
}

export class ExtHostLanguageFeatures implements extHostProtocol.ExtHostLanguageFeaturesShape {

	private static _handlePool: number = 0;

	private readonly _proxy: extHostProtocol.MainThreadLanguageFeaturesShape;
	private readonly _adapter = new Map<number, AdapterData>();

	constructor(
		mainContext: extHostProtocol.IMainContext,
		private readonly _uriTransformer: IURITransformer,
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: ExtHostCommands,
		private readonly _diagnostics: ExtHostDiagnostics,
		private readonly _logService: ILogService,
		private readonly _apiDeprecation: IExtHostApiDeprecationService,
		private readonly _extensionTelemetry: IExtHostTelemetry
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadLanguageFeatures);
	}

	private _transformDocumentSelector(selector: vscode.DocumentSelector, extension: IExtensionDescription): Array<extHostProtocol.IDocumentFilterDto> {
		return typeConvert.DocumentSelector.from(selector, this._uriTransformer, extension);
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

	private async _withAdapter<A, R>(
		handle: number,
		ctor: { new(...args: any[]): A },
		callback: (adapter: A, extension: IExtensionDescription) => Promise<R>,
		fallbackValue: R,
		tokenToRaceAgainst: CancellationToken | undefined,
		doNotLog: boolean = false
	): Promise<R> {
		const data = this._adapter.get(handle);
		if (!data || !(data.adapter instanceof ctor)) {
			return fallbackValue;
		}

		const t1: number = Date.now();
		if (!doNotLog) {
			this._logService.trace(`[${data.extension.identifier.value}] INVOKE provider '${callback.toString().replace(/[\r\n]/g, '')}'`);
		}

		const result = callback(data.adapter, data.extension);

		// logging,tracing
		Promise.resolve(result).catch(err => {
			if (!isCancellationError(err)) {
				this._logService.error(`[${data.extension.identifier.value}] provider FAILED`);
				this._logService.error(err);

				this._extensionTelemetry.onExtensionError(data.extension.identifier, err);
			}
		}).finally(() => {
			if (!doNotLog) {
				this._logService.trace(`[${data.extension.identifier.value}] provider DONE after ${Date.now() - t1}ms`);
			}
		});

		if (CancellationToken.isCancellationToken(tokenToRaceAgainst)) {
			return raceCancellationError(result, tokenToRaceAgainst);
		}
		return result;
	}

	private _addNewAdapter(adapter: Adapter, extension: IExtensionDescription): number {
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
		this._proxy.$registerDocumentSymbolProvider(handle, this._transformDocumentSelector(selector, extension), displayName);
		return this._createDisposable(handle);
	}

	$provideDocumentSymbols(handle: number, resource: UriComponents, token: CancellationToken): Promise<languages.DocumentSymbol[] | undefined> {
		return this._withAdapter(handle, DocumentSymbolAdapter, adapter => adapter.provideDocumentSymbols(URI.revive(resource), token), undefined, token);
	}

	// --- code lens

	registerCodeLensProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
		const handle = this._nextHandle();
		const eventHandle = typeof provider.onDidChangeCodeLenses === 'function' ? this._nextHandle() : undefined;

		this._adapter.set(handle, new AdapterData(new CodeLensAdapter(this._documents, this._commands.converter, provider), extension));
		this._proxy.$registerCodeLensSupport(handle, this._transformDocumentSelector(selector, extension), eventHandle);
		let result = this._createDisposable(handle);

		if (eventHandle !== undefined) {
			const subscription = provider.onDidChangeCodeLenses!(_ => this._proxy.$emitCodeLensEvent(eventHandle));
			result = Disposable.from(result, subscription);
		}

		return result;
	}

	$provideCodeLenses(handle: number, resource: UriComponents, token: CancellationToken): Promise<extHostProtocol.ICodeLensListDto | undefined> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.provideCodeLenses(URI.revive(resource), token), undefined, token);
	}

	$resolveCodeLens(handle: number, symbol: extHostProtocol.ICodeLensDto, token: CancellationToken): Promise<extHostProtocol.ICodeLensDto | undefined> {
		return this._withAdapter(handle, CodeLensAdapter, adapter => adapter.resolveCodeLens(symbol, token), undefined, undefined);
	}

	$releaseCodeLenses(handle: number, cacheId: number): void {
		this._withAdapter(handle, CodeLensAdapter, adapter => Promise.resolve(adapter.releaseCodeLenses(cacheId)), undefined, undefined);
	}

	// --- declaration

	registerDefinitionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DefinitionAdapter(this._documents, provider), extension);
		this._proxy.$registerDefinitionSupport(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.LocationLink[]> {
		return this._withAdapter(handle, DefinitionAdapter, adapter => adapter.provideDefinition(URI.revive(resource), position, token), [], token);
	}

	registerDeclarationProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DeclarationProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DeclarationAdapter(this._documents, provider), extension);
		this._proxy.$registerDeclarationSupport(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideDeclaration(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.LocationLink[]> {
		return this._withAdapter(handle, DeclarationAdapter, adapter => adapter.provideDeclaration(URI.revive(resource), position, token), [], token);
	}

	registerImplementationProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.ImplementationProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ImplementationAdapter(this._documents, provider), extension);
		this._proxy.$registerImplementationSupport(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideImplementation(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.LocationLink[]> {
		return this._withAdapter(handle, ImplementationAdapter, adapter => adapter.provideImplementation(URI.revive(resource), position, token), [], token);
	}

	registerTypeDefinitionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.TypeDefinitionProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new TypeDefinitionAdapter(this._documents, provider), extension);
		this._proxy.$registerTypeDefinitionSupport(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideTypeDefinition(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.LocationLink[]> {
		return this._withAdapter(handle, TypeDefinitionAdapter, adapter => adapter.provideTypeDefinition(URI.revive(resource), position, token), [], token);
	}

	// --- extra info

	registerHoverProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.HoverProvider, extensionId?: ExtensionIdentifier): vscode.Disposable {
		const handle = this._addNewAdapter(new HoverAdapter(this._documents, provider), extension);
		this._proxy.$registerHoverProvider(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideHover(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.Hover | undefined> {
		return this._withAdapter(handle, HoverAdapter, adapter => adapter.provideHover(URI.revive(resource), position, token), undefined, token);
	}

	// --- debug hover

	registerEvaluatableExpressionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.EvaluatableExpressionProvider, extensionId?: ExtensionIdentifier): vscode.Disposable {
		const handle = this._addNewAdapter(new EvaluatableExpressionAdapter(this._documents, provider), extension);
		this._proxy.$registerEvaluatableExpressionProvider(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideEvaluatableExpression(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.EvaluatableExpression | undefined> {
		return this._withAdapter(handle, EvaluatableExpressionAdapter, adapter => adapter.provideEvaluatableExpression(URI.revive(resource), position, token), undefined, token);
	}

	// --- debug inline values

	registerInlineValuesProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.InlineValuesProvider, extensionId?: ExtensionIdentifier): vscode.Disposable {

		const eventHandle = typeof provider.onDidChangeInlineValues === 'function' ? this._nextHandle() : undefined;
		const handle = this._addNewAdapter(new InlineValuesAdapter(this._documents, provider), extension);

		this._proxy.$registerInlineValuesProvider(handle, this._transformDocumentSelector(selector, extension), eventHandle);
		let result = this._createDisposable(handle);

		if (eventHandle !== undefined) {
			const subscription = provider.onDidChangeInlineValues!(_ => this._proxy.$emitInlineValuesEvent(eventHandle));
			result = Disposable.from(result, subscription);
		}
		return result;
	}

	$provideInlineValues(handle: number, resource: UriComponents, range: IRange, context: extHostProtocol.IInlineValueContextDto, token: CancellationToken): Promise<languages.InlineValue[] | undefined> {
		return this._withAdapter(handle, InlineValuesAdapter, adapter => adapter.provideInlineValues(URI.revive(resource), range, context, token), undefined, token);
	}

	// --- occurrences

	registerDocumentHighlightProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentHighlightAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentHighlightProvider(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideDocumentHighlights(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<languages.DocumentHighlight[] | undefined> {
		return this._withAdapter(handle, DocumentHighlightAdapter, adapter => adapter.provideDocumentHighlights(URI.revive(resource), position, token), undefined, token);
	}

	// --- linked editing

	registerLinkedEditingRangeProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.LinkedEditingRangeProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new LinkedEditingRangeAdapter(this._documents, provider), extension);
		this._proxy.$registerLinkedEditingRangeProvider(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideLinkedEditingRanges(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<extHostProtocol.ILinkedEditingRangesDto | undefined> {
		return this._withAdapter(handle, LinkedEditingRangeAdapter, async adapter => {
			const res = await adapter.provideLinkedEditingRanges(URI.revive(resource), position, token);
			if (res) {
				return {
					ranges: res.ranges,
					wordPattern: res.wordPattern ? ExtHostLanguageFeatures._serializeRegExp(res.wordPattern) : undefined
				};
			}
			return undefined;
		}, undefined, token);
	}

	// --- references

	registerReferenceProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ReferenceAdapter(this._documents, provider), extension);
		this._proxy.$registerReferenceSupport(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideReferences(handle: number, resource: UriComponents, position: IPosition, context: languages.ReferenceContext, token: CancellationToken): Promise<languages.Location[] | undefined> {
		return this._withAdapter(handle, ReferenceAdapter, adapter => adapter.provideReferences(URI.revive(resource), position, context, token), undefined, token);
	}

	// --- quick fix

	registerCodeActionProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider, metadata?: vscode.CodeActionProviderMetadata): vscode.Disposable {
		const store = new DisposableStore();
		const handle = this._addNewAdapter(new CodeActionAdapter(this._documents, this._commands.converter, this._diagnostics, provider, this._logService, extension, this._apiDeprecation), extension);
		this._proxy.$registerQuickFixSupport(handle, this._transformDocumentSelector(selector, extension), {
			providedKinds: metadata?.providedCodeActionKinds?.map(kind => kind.value),
			documentation: metadata?.documentation?.map(x => ({
				kind: x.kind.value,
				command: this._commands.converter.toInternal(x.command, store),
			}))
		}, ExtHostLanguageFeatures._extLabel(extension), Boolean(provider.resolveCodeAction));
		store.add(this._createDisposable(handle));
		return store;
	}


	$provideCodeActions(handle: number, resource: UriComponents, rangeOrSelection: IRange | ISelection, context: languages.CodeActionContext, token: CancellationToken): Promise<extHostProtocol.ICodeActionListDto | undefined> {
		return this._withAdapter(handle, CodeActionAdapter, adapter => adapter.provideCodeActions(URI.revive(resource), rangeOrSelection, context, token), undefined, token);
	}

	$resolveCodeAction(handle: number, id: extHostProtocol.ChainedCacheId, token: CancellationToken): Promise<{ edit?: extHostProtocol.IWorkspaceEditDto; command?: extHostProtocol.ICommandDto }> {
		return this._withAdapter(handle, CodeActionAdapter, adapter => adapter.resolveCodeAction(id, token), {}, undefined);
	}

	$releaseCodeActions(handle: number, cacheId: number): void {
		this._withAdapter(handle, CodeActionAdapter, adapter => Promise.resolve(adapter.releaseCodeActions(cacheId)), undefined, undefined);
	}

	// --- formatting

	registerDocumentFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentFormattingSupport(handle, this._transformDocumentSelector(selector, extension), extension.identifier, extension.displayName || extension.name);
		return this._createDisposable(handle);
	}

	$provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {
		return this._withAdapter(handle, DocumentFormattingAdapter, adapter => adapter.provideDocumentFormattingEdits(URI.revive(resource), options, token), undefined, token);
	}

	registerDocumentRangeFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
		const canFormatMultipleRanges = typeof provider.provideDocumentRangesFormattingEdits === 'function';
		if (canFormatMultipleRanges) {
			checkProposedApiEnabled(extension, 'formatMultipleRanges');
		}
		const handle = this._addNewAdapter(new RangeFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerRangeFormattingSupport(handle, this._transformDocumentSelector(selector, extension), extension.identifier, extension.displayName || extension.name, canFormatMultipleRanges);
		return this._createDisposable(handle);
	}

	$provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: IRange, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {
		return this._withAdapter(handle, RangeFormattingAdapter, adapter => adapter.provideDocumentRangeFormattingEdits(URI.revive(resource), range, options, token), undefined, token);
	}

	$provideDocumentRangesFormattingEdits(handle: number, resource: UriComponents, ranges: IRange[], options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {
		return this._withAdapter(handle, RangeFormattingAdapter, adapter => adapter.provideDocumentRangesFormattingEdits(URI.revive(resource), ranges, options, token), undefined, token);
	}

	registerOnTypeFormattingEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new OnTypeFormattingAdapter(this._documents, provider), extension);
		this._proxy.$registerOnTypeFormattingSupport(handle, this._transformDocumentSelector(selector, extension), triggerCharacters, extension.identifier);
		return this._createDisposable(handle);
	}

	$provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: IPosition, ch: string, options: languages.FormattingOptions, token: CancellationToken): Promise<ISingleEditOperation[] | undefined> {
		return this._withAdapter(handle, OnTypeFormattingAdapter, adapter => adapter.provideOnTypeFormattingEdits(URI.revive(resource), position, ch, options, token), undefined, token);
	}

	// --- navigate types

	registerWorkspaceSymbolProvider(extension: IExtensionDescription, provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new NavigateTypeAdapter(provider, this._logService), extension);
		this._proxy.$registerNavigateTypeSupport(handle, typeof provider.resolveWorkspaceSymbol === 'function');
		return this._createDisposable(handle);
	}

	$provideWorkspaceSymbols(handle: number, search: string, token: CancellationToken): Promise<extHostProtocol.IWorkspaceSymbolsDto> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.provideWorkspaceSymbols(search, token), { symbols: [] }, token);
	}

	$resolveWorkspaceSymbol(handle: number, symbol: extHostProtocol.IWorkspaceSymbolDto, token: CancellationToken): Promise<extHostProtocol.IWorkspaceSymbolDto | undefined> {
		return this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.resolveWorkspaceSymbol(symbol, token), undefined, undefined);
	}

	$releaseWorkspaceSymbols(handle: number, id: number): void {
		this._withAdapter(handle, NavigateTypeAdapter, adapter => adapter.releaseWorkspaceSymbols(id), undefined, undefined);
	}

	// --- rename

	registerRenameProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.RenameProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new RenameAdapter(this._documents, provider, this._logService), extension);
		this._proxy.$registerRenameSupport(handle, this._transformDocumentSelector(selector, extension), RenameAdapter.supportsResolving(provider));
		return this._createDisposable(handle);
	}

	$provideRenameEdits(handle: number, resource: UriComponents, position: IPosition, newName: string, token: CancellationToken): Promise<extHostProtocol.IWorkspaceEditDto | undefined> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.provideRenameEdits(URI.revive(resource), position, newName, token), undefined, token);
	}

	$resolveRenameLocation(handle: number, resource: URI, position: IPosition, token: CancellationToken): Promise<languages.RenameLocation | undefined> {
		return this._withAdapter(handle, RenameAdapter, adapter => adapter.resolveRenameLocation(URI.revive(resource), position, token), undefined, token);
	}

	//#region semantic coloring

	registerDocumentSemanticTokensProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentSemanticTokensProvider, legend: vscode.SemanticTokensLegend): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentSemanticTokensAdapter(this._documents, provider), extension);
		const eventHandle = (typeof provider.onDidChangeSemanticTokens === 'function' ? this._nextHandle() : undefined);
		this._proxy.$registerDocumentSemanticTokensProvider(handle, this._transformDocumentSelector(selector, extension), legend, eventHandle);
		let result = this._createDisposable(handle);

		if (eventHandle) {
			const subscription = provider.onDidChangeSemanticTokens!(_ => this._proxy.$emitDocumentSemanticTokensEvent(eventHandle));
			result = Disposable.from(result, subscription);
		}

		return result;
	}

	$provideDocumentSemanticTokens(handle: number, resource: UriComponents, previousResultId: number, token: CancellationToken): Promise<VSBuffer | null> {
		return this._withAdapter(handle, DocumentSemanticTokensAdapter, adapter => adapter.provideDocumentSemanticTokens(URI.revive(resource), previousResultId, token), null, token);
	}

	$releaseDocumentSemanticTokens(handle: number, semanticColoringResultId: number): void {
		this._withAdapter(handle, DocumentSemanticTokensAdapter, adapter => adapter.releaseDocumentSemanticColoring(semanticColoringResultId), undefined, undefined);
	}

	registerDocumentRangeSemanticTokensProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentRangeSemanticTokensProvider, legend: vscode.SemanticTokensLegend): vscode.Disposable {
		const handle = this._addNewAdapter(new DocumentRangeSemanticTokensAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentRangeSemanticTokensProvider(handle, this._transformDocumentSelector(selector, extension), legend);
		return this._createDisposable(handle);
	}

	$provideDocumentRangeSemanticTokens(handle: number, resource: UriComponents, range: IRange, token: CancellationToken): Promise<VSBuffer | null> {
		return this._withAdapter(handle, DocumentRangeSemanticTokensAdapter, adapter => adapter.provideDocumentRangeSemanticTokens(URI.revive(resource), range, token), null, token);
	}

	//#endregion

	// --- suggestion

	registerCompletionItemProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, triggerCharacters: string[]): vscode.Disposable {
		const handle = this._addNewAdapter(new CompletionsAdapter(this._documents, this._commands.converter, provider, this._apiDeprecation, extension), extension);
		this._proxy.$registerCompletionsProvider(handle, this._transformDocumentSelector(selector, extension), triggerCharacters, CompletionsAdapter.supportsResolving(provider), `${extension.identifier.value}(${triggerCharacters.join('')})`);
		return this._createDisposable(handle);
	}

	$provideCompletionItems(handle: number, resource: UriComponents, position: IPosition, context: languages.CompletionContext, token: CancellationToken): Promise<extHostProtocol.ISuggestResultDto | undefined> {
		return this._withAdapter(handle, CompletionsAdapter, adapter => adapter.provideCompletionItems(URI.revive(resource), position, context, token), undefined, token);
	}

	$resolveCompletionItem(handle: number, id: extHostProtocol.ChainedCacheId, token: CancellationToken): Promise<extHostProtocol.ISuggestDataDto | undefined> {
		return this._withAdapter(handle, CompletionsAdapter, adapter => adapter.resolveCompletionItem(id, token), undefined, token);
	}

	$releaseCompletionItems(handle: number, id: number): void {
		this._withAdapter(handle, CompletionsAdapter, adapter => adapter.releaseCompletionItems(id), undefined, undefined);
	}

	// --- ghost test

	registerInlineCompletionsProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.InlineCompletionItemProvider): vscode.Disposable {
		const adapter = new InlineCompletionAdapter(extension, this._documents, provider, this._commands.converter);
		const handle = this._addNewAdapter(adapter, extension);
		this._proxy.$registerInlineCompletionsSupport(handle, this._transformDocumentSelector(selector, extension), adapter.supportsHandleEvents);
		return this._createDisposable(handle);
	}

	$provideInlineCompletions(handle: number, resource: UriComponents, position: IPosition, context: languages.InlineCompletionContext, token: CancellationToken): Promise<extHostProtocol.IdentifiableInlineCompletions | undefined> {
		return this._withAdapter(handle, InlineCompletionAdapterBase, adapter => adapter.provideInlineCompletions(URI.revive(resource), position, context, token), undefined, token);
	}

	$handleInlineCompletionDidShow(handle: number, pid: number, idx: number, updatedInsertText: string): void {
		this._withAdapter(handle, InlineCompletionAdapterBase, async adapter => {
			adapter.handleDidShowCompletionItem(pid, idx, updatedInsertText);
		}, undefined, undefined);
	}

	$handleInlineCompletionPartialAccept(handle: number, pid: number, idx: number, acceptedCharacters: number): void {
		this._withAdapter(handle, InlineCompletionAdapterBase, async adapter => {
			adapter.handlePartialAccept(pid, idx, acceptedCharacters);
		}, undefined, undefined);
	}

	$freeInlineCompletionsList(handle: number, pid: number): void {
		this._withAdapter(handle, InlineCompletionAdapterBase, async adapter => { adapter.disposeCompletions(pid); }, undefined, undefined);
	}

	// --- parameter hints

	registerSignatureHelpProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, metadataOrTriggerChars: string[] | vscode.SignatureHelpProviderMetadata): vscode.Disposable {
		const metadata: extHostProtocol.ISignatureHelpProviderMetadataDto | undefined = Array.isArray(metadataOrTriggerChars)
			? { triggerCharacters: metadataOrTriggerChars, retriggerCharacters: [] }
			: metadataOrTriggerChars;

		const handle = this._addNewAdapter(new SignatureHelpAdapter(this._documents, provider), extension);
		this._proxy.$registerSignatureHelpProvider(handle, this._transformDocumentSelector(selector, extension), metadata);
		return this._createDisposable(handle);
	}

	$provideSignatureHelp(handle: number, resource: UriComponents, position: IPosition, context: extHostProtocol.ISignatureHelpContextDto, token: CancellationToken): Promise<extHostProtocol.ISignatureHelpDto | undefined> {
		return this._withAdapter(handle, SignatureHelpAdapter, adapter => adapter.provideSignatureHelp(URI.revive(resource), position, context, token), undefined, token);
	}

	$releaseSignatureHelp(handle: number, id: number): void {
		this._withAdapter(handle, SignatureHelpAdapter, adapter => adapter.releaseSignatureHelp(id), undefined, undefined);
	}

	// --- inline hints

	registerInlayHintsProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.InlayHintsProvider): vscode.Disposable {

		const eventHandle = typeof provider.onDidChangeInlayHints === 'function' ? this._nextHandle() : undefined;
		const handle = this._addNewAdapter(new InlayHintsAdapter(this._documents, this._commands.converter, provider, this._logService, extension), extension);

		this._proxy.$registerInlayHintsProvider(handle, this._transformDocumentSelector(selector, extension), typeof provider.resolveInlayHint === 'function', eventHandle, ExtHostLanguageFeatures._extLabel(extension));
		let result = this._createDisposable(handle);

		if (eventHandle !== undefined) {
			const subscription = provider.onDidChangeInlayHints!(uri => this._proxy.$emitInlayHintsEvent(eventHandle));
			result = Disposable.from(result, subscription);
		}
		return result;
	}

	$provideInlayHints(handle: number, resource: UriComponents, range: IRange, token: CancellationToken): Promise<extHostProtocol.IInlayHintsDto | undefined> {
		return this._withAdapter(handle, InlayHintsAdapter, adapter => adapter.provideInlayHints(URI.revive(resource), range, token), undefined, token);
	}

	$resolveInlayHint(handle: number, id: extHostProtocol.ChainedCacheId, token: CancellationToken): Promise<extHostProtocol.IInlayHintDto | undefined> {
		return this._withAdapter(handle, InlayHintsAdapter, adapter => adapter.resolveInlayHint(id, token), undefined, token);
	}

	$releaseInlayHints(handle: number, id: number): void {
		this._withAdapter(handle, InlayHintsAdapter, adapter => adapter.releaseHints(id), undefined, undefined);
	}

	// --- links

	registerDocumentLinkProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentLinkProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new LinkProviderAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentLinkProvider(handle, this._transformDocumentSelector(selector, extension), typeof provider.resolveDocumentLink === 'function');
		return this._createDisposable(handle);
	}

	$provideDocumentLinks(handle: number, resource: UriComponents, token: CancellationToken): Promise<extHostProtocol.ILinksListDto | undefined> {
		return this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.provideLinks(URI.revive(resource), token), undefined, token, resource.scheme === 'output');
	}

	$resolveDocumentLink(handle: number, id: extHostProtocol.ChainedCacheId, token: CancellationToken): Promise<extHostProtocol.ILinkDto | undefined> {
		return this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.resolveLink(id, token), undefined, undefined, true);
	}

	$releaseDocumentLinks(handle: number, id: number): void {
		this._withAdapter(handle, LinkProviderAdapter, adapter => adapter.releaseLinks(id), undefined, undefined, true);
	}

	registerColorProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentColorProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new ColorProviderAdapter(this._documents, provider), extension);
		this._proxy.$registerDocumentColorProvider(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideDocumentColors(handle: number, resource: UriComponents, token: CancellationToken): Promise<extHostProtocol.IRawColorInfo[]> {
		return this._withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColors(URI.revive(resource), token), [], token);
	}

	$provideColorPresentations(handle: number, resource: UriComponents, colorInfo: extHostProtocol.IRawColorInfo, token: CancellationToken): Promise<languages.IColorPresentation[] | undefined> {
		return this._withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColorPresentations(URI.revive(resource), colorInfo, token), undefined, token);
	}

	registerFoldingRangeProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.FoldingRangeProvider): vscode.Disposable {
		const handle = this._nextHandle();
		const eventHandle = typeof provider.onDidChangeFoldingRanges === 'function' ? this._nextHandle() : undefined;

		this._adapter.set(handle, new AdapterData(new FoldingProviderAdapter(this._documents, provider), extension));
		this._proxy.$registerFoldingRangeProvider(handle, this._transformDocumentSelector(selector, extension), extension.identifier, eventHandle);
		let result = this._createDisposable(handle);

		if (eventHandle !== undefined) {
			const subscription = provider.onDidChangeFoldingRanges!(() => this._proxy.$emitFoldingRangeEvent(eventHandle));
			result = Disposable.from(result, subscription);
		}

		return result;
	}

	$provideFoldingRanges(handle: number, resource: UriComponents, context: vscode.FoldingContext, token: CancellationToken): Promise<languages.FoldingRange[] | undefined> {
		return this._withAdapter(handle, FoldingProviderAdapter, adapter => adapter.provideFoldingRanges(URI.revive(resource), context, token), undefined, token);
	}

	// --- smart select

	registerSelectionRangeProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.SelectionRangeProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new SelectionRangeAdapter(this._documents, provider, this._logService), extension);
		this._proxy.$registerSelectionRangeProvider(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$provideSelectionRanges(handle: number, resource: UriComponents, positions: IPosition[], token: CancellationToken): Promise<languages.SelectionRange[][]> {
		return this._withAdapter(handle, SelectionRangeAdapter, adapter => adapter.provideSelectionRanges(URI.revive(resource), positions, token), [], token);
	}

	// --- call hierarchy

	registerCallHierarchyProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.CallHierarchyProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new CallHierarchyAdapter(this._documents, provider), extension);
		this._proxy.$registerCallHierarchyProvider(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$prepareCallHierarchy(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<extHostProtocol.ICallHierarchyItemDto[] | undefined> {
		return this._withAdapter(handle, CallHierarchyAdapter, adapter => Promise.resolve(adapter.prepareSession(URI.revive(resource), position, token)), undefined, token);
	}

	$provideCallHierarchyIncomingCalls(handle: number, sessionId: string, itemId: string, token: CancellationToken): Promise<extHostProtocol.IIncomingCallDto[] | undefined> {
		return this._withAdapter(handle, CallHierarchyAdapter, adapter => adapter.provideCallsTo(sessionId, itemId, token), undefined, token);
	}

	$provideCallHierarchyOutgoingCalls(handle: number, sessionId: string, itemId: string, token: CancellationToken): Promise<extHostProtocol.IOutgoingCallDto[] | undefined> {
		return this._withAdapter(handle, CallHierarchyAdapter, adapter => adapter.provideCallsFrom(sessionId, itemId, token), undefined, token);
	}

	$releaseCallHierarchy(handle: number, sessionId: string): void {
		this._withAdapter(handle, CallHierarchyAdapter, adapter => Promise.resolve(adapter.releaseSession(sessionId)), undefined, undefined);
	}

	// --- type hierarchy
	registerTypeHierarchyProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.TypeHierarchyProvider): vscode.Disposable {
		const handle = this._addNewAdapter(new TypeHierarchyAdapter(this._documents, provider), extension);
		this._proxy.$registerTypeHierarchyProvider(handle, this._transformDocumentSelector(selector, extension));
		return this._createDisposable(handle);
	}

	$prepareTypeHierarchy(handle: number, resource: UriComponents, position: IPosition, token: CancellationToken): Promise<extHostProtocol.ITypeHierarchyItemDto[] | undefined> {
		return this._withAdapter(handle, TypeHierarchyAdapter, adapter => Promise.resolve(adapter.prepareSession(URI.revive(resource), position, token)), undefined, token);
	}

	$provideTypeHierarchySupertypes(handle: number, sessionId: string, itemId: string, token: CancellationToken): Promise<extHostProtocol.ITypeHierarchyItemDto[] | undefined> {
		return this._withAdapter(handle, TypeHierarchyAdapter, adapter => adapter.provideSupertypes(sessionId, itemId, token), undefined, token);
	}

	$provideTypeHierarchySubtypes(handle: number, sessionId: string, itemId: string, token: CancellationToken): Promise<extHostProtocol.ITypeHierarchyItemDto[] | undefined> {
		return this._withAdapter(handle, TypeHierarchyAdapter, adapter => adapter.provideSubtypes(sessionId, itemId, token), undefined, token);
	}

	$releaseTypeHierarchy(handle: number, sessionId: string): void {
		this._withAdapter(handle, TypeHierarchyAdapter, adapter => Promise.resolve(adapter.releaseSession(sessionId)), undefined, undefined);
	}

	// --- Document on drop

	registerDocumentOnDropEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentDropEditProvider, metadata?: vscode.DocumentDropEditProviderMetadata) {
		const handle = this._nextHandle();
		this._adapter.set(handle, new AdapterData(new DocumentOnDropEditAdapter(this._proxy, this._documents, provider, handle, extension), extension));

		this._proxy.$registerDocumentOnDropEditProvider(handle, this._transformDocumentSelector(selector, extension), isProposedApiEnabled(extension, 'dropMetadata') ? metadata : undefined);

		return this._createDisposable(handle);
	}

	$provideDocumentOnDropEdits(handle: number, requestId: number, resource: UriComponents, position: IPosition, dataTransferDto: extHostProtocol.DataTransferDTO, token: CancellationToken): Promise<extHostProtocol.IDocumentOnDropEditDto | undefined> {
		return this._withAdapter(handle, DocumentOnDropEditAdapter, adapter =>
			Promise.resolve(adapter.provideDocumentOnDropEdits(requestId, URI.revive(resource), position, dataTransferDto, token)), undefined, undefined);
	}

	// --- copy/paste actions

	registerDocumentPasteEditProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, provider: vscode.DocumentPasteEditProvider, metadata: vscode.DocumentPasteProviderMetadata): vscode.Disposable {
		const handle = this._nextHandle();
		this._adapter.set(handle, new AdapterData(new DocumentPasteEditProvider(this._proxy, this._documents, provider, handle, extension), extension));
		this._proxy.$registerPasteEditProvider(handle, this._transformDocumentSelector(selector, extension), {
			supportsCopy: !!provider.prepareDocumentPaste,
			supportsPaste: !!provider.provideDocumentPasteEdits,
			copyMimeTypes: metadata.copyMimeTypes,
			pasteMimeTypes: metadata.pasteMimeTypes,
		});
		return this._createDisposable(handle);
	}

	$prepareDocumentPaste(handle: number, resource: UriComponents, ranges: IRange[], dataTransfer: extHostProtocol.DataTransferDTO, token: CancellationToken): Promise<extHostProtocol.DataTransferDTO | undefined> {
		return this._withAdapter(handle, DocumentPasteEditProvider, adapter => adapter.prepareDocumentPaste(URI.revive(resource), ranges, dataTransfer, token), undefined, token);
	}

	$providePasteEdits(handle: number, requestId: number, resource: UriComponents, ranges: IRange[], dataTransferDto: extHostProtocol.DataTransferDTO, token: CancellationToken): Promise<extHostProtocol.IPasteEditDto | undefined> {
		return this._withAdapter(handle, DocumentPasteEditProvider, adapter => adapter.providePasteEdits(requestId, URI.revive(resource), ranges, dataTransferDto, token), undefined, token);
	}

	// --- configuration

	private static _serializeRegExp(regExp: RegExp): extHostProtocol.IRegExpDto {
		return {
			pattern: regExp.source,
			flags: regExpFlags(regExp),
		};
	}

	private static _serializeIndentationRule(indentationRule: vscode.IndentationRule): extHostProtocol.IIndentationRuleDto {
		return {
			decreaseIndentPattern: ExtHostLanguageFeatures._serializeRegExp(indentationRule.decreaseIndentPattern),
			increaseIndentPattern: ExtHostLanguageFeatures._serializeRegExp(indentationRule.increaseIndentPattern),
			indentNextLinePattern: indentationRule.indentNextLinePattern ? ExtHostLanguageFeatures._serializeRegExp(indentationRule.indentNextLinePattern) : undefined,
			unIndentedLinePattern: indentationRule.unIndentedLinePattern ? ExtHostLanguageFeatures._serializeRegExp(indentationRule.unIndentedLinePattern) : undefined,
		};
	}

	private static _serializeOnEnterRule(onEnterRule: vscode.OnEnterRule): extHostProtocol.IOnEnterRuleDto {
		return {
			beforeText: ExtHostLanguageFeatures._serializeRegExp(onEnterRule.beforeText),
			afterText: onEnterRule.afterText ? ExtHostLanguageFeatures._serializeRegExp(onEnterRule.afterText) : undefined,
			previousLineText: onEnterRule.previousLineText ? ExtHostLanguageFeatures._serializeRegExp(onEnterRule.previousLineText) : undefined,
			action: onEnterRule.action
		};
	}

	private static _serializeOnEnterRules(onEnterRules: vscode.OnEnterRule[]): extHostProtocol.IOnEnterRuleDto[] {
		return onEnterRules.map(ExtHostLanguageFeatures._serializeOnEnterRule);
	}

	setLanguageConfiguration(extension: IExtensionDescription, languageId: string, configuration: vscode.LanguageConfiguration): vscode.Disposable {
		const { wordPattern } = configuration;

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

		if (configuration.__electricCharacterSupport) {
			this._apiDeprecation.report('LanguageConfiguration.__electricCharacterSupport', extension,
				`Do not use.`);
		}

		if (configuration.__characterPairSupport) {
			this._apiDeprecation.report('LanguageConfiguration.__characterPairSupport', extension,
				`Do not use.`);
		}

		const handle = this._nextHandle();
		const serializedConfiguration: extHostProtocol.ILanguageConfigurationDto = {
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

	$setWordDefinitions(wordDefinitions: extHostProtocol.ILanguageWordDefinitionDto[]): void {
		for (const wordDefinition of wordDefinitions) {
			this._documents.setWordDefinitionFor(wordDefinition.languageId, new RegExp(wordDefinition.regexSource, wordDefinition.regexFlags));
		}
	}
}
