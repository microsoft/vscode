/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import * as types from 'vs/workbench/api/node/extHostTypes';
import {ISingleEditOperation} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {ICommandHandlerDescription} from 'vs/platform/keybinding/common/keybindingService';
import {ExtHostCommands} from 'vs/workbench/api/node/extHostCommands';
import {IQuickFix2} from 'vs/editor/contrib/quickFix/common/quickFix';
import {IOutline} from 'vs/editor/contrib/quickOpen/common/quickOpen';
import {ITypeBearing} from 'vs/workbench/parts/search/common/search';
import {ICodeLensData} from 'vs/editor/contrib/codelens/common/codelens';
import {IThreadService} from 'vs/platform/thread/common/thread';

export function registerApiCommands(threadService: IThreadService) {
	const commands = threadService.getRemotable(ExtHostCommands);
	new ExtHostApiCommands(commands).registerCommands();
}

class ExtHostApiCommands {

	private _commands: ExtHostCommands;
	private _disposables: IDisposable[] = [];

	constructor(commands: ExtHostCommands) {
		this._commands = commands;
	}

	registerCommands() {
		this._register('vscode.executeWorkspaceSymbolProvider', this._executeWorkspaceSymbolProvider, {
			description: 'Execute all workspace symbol provider.',
			args: [{ name: 'query', description: 'Search string', constraint: String }],
			returns: 'A promise that resolves to an array of SymbolInformation-instances.'

		});
		this._register('vscode.executeDefinitionProvider', this._executeDefinitionProvider, {
			description: 'Execute all definition provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position of a symbol', constraint: types.Position }
			],
			returns: 'A promise that resolves to an array of Location-instances.'
		});
		this._register('vscode.executeHoverProvider', this._executeHoverProvider, {
			description: 'Execute all hover provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position of a symbol', constraint: types.Position }
			],
			returns: 'A promise that resolves to an array of Hover-instances.'
		});
		this._register('vscode.executeDocumentHighlights', this._executeDocumentHighlights, {
			description: 'Execute document highlight provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position in a text document', constraint: types.Position }
			],
			returns: 'A promise that resolves to an array of DocumentHighlight-instances.'
		});
		this._register('vscode.executeReferenceProvider', this._executeReferenceProvider, {
			description: 'Execute reference provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position in a text document', constraint: types.Position }
			],
			returns: 'A promise that resolves to an array of Location-instances.'
		});
		this._register('vscode.executeDocumentRenameProvider', this._executeDocumentRenameProvider, {
			description: 'Execute rename provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position in a text document', constraint: types.Position },
				{ name: 'newName', description: 'The new symbol name', constraint: String }
			],
			returns: 'A promise that resolves to a WorkspaceEdit.'
		});
		this._register('vscode.executeSignatureHelpProvider', this._executeSignatureHelpProvider, {
			description: 'Execute signature help provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position in a text document', constraint: types.Position },
				{ name: 'triggerCharacter', description: '(optional) Trigger signature help when the user types the character, like `,` or `(`' }
			],
			returns: 'A promise that resolves to SignatureHelp.'
		});
		this._register('vscode.executeDocumentSymbolProvider', this._executeDocumentSymbolProvider, {
			description: 'Execute document symbol provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI }
			],
			returns: 'A promise that resolves to an array of SymbolInformation-instances.'
		});
		this._register('vscode.executeCompletionItemProvider', this._executeCompletionItemProvider, {
			description: 'Execute completion item provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position in a text document', constraint: types.Position },
				{ name: 'triggerCharacter', description: '(optional) Trigger completion when the user types the character, like `,` or `(`' }
			],
			returns: 'A promise that resolves to a CompletionList-instance.'
		});
		this._register('vscode.executeCodeActionProvider', this._executeCodeActionProvider, {
			description: 'Execute code action provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'range', description: 'Range in a text document', constraint: types.Range }
			],
			returns: 'A promise that resolves to an array of Command-instances.'
		});
		this._register('vscode.executeCodeLensProvider', this._executeCodeLensProvider, {
			description: 'Execute completion item provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI }
			],
			returns: 'A promise that resolves to an array of CodeLens-instances.'
		});
		this._register('vscode.executeFormatDocumentProvider', this._executeFormatDocumentProvider, {
			description: 'Execute document format provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'options', description: 'Formatting options' }
			],
			returns: 'A promise that resolves to an array of TextEdits.'
		});
		this._register('vscode.executeFormatRangeProvider', this._executeFormatRangeProvider, {
			description: 'Execute range format provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'range', description: 'Range in a text document', constraint: types.Range },
				{ name: 'options', description: 'Formatting options' }
			],
			returns: 'A promise that resolves to an array of TextEdits.'
		});
		this._register('vscode.executeFormatOnTypeProvider', this._executeFormatOnTypeProvider, {
			description: 'Execute document format provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position in a text document', constraint: types.Position },
				{ name: 'ch', description: 'Character that got typed', constraint: String },
				{ name: 'options', description: 'Formatting options' }
			],
			returns: 'A promise that resolves to an array of TextEdits.'
		});


		this._register('vscode.previewHtml', (uri: URI, position?: vscode.ViewColumn) => {
			return this._commands.executeCommand('_workbench.previewHtml', uri,
				typeof position === 'number' ? typeConverters.fromViewColumn(position) : void 0);

		}, {
			description: 'Preview an html document.',
			args: [
				{ name: 'uri', description: 'Uri of the document to preview.', constraint: URI },
				{ name: 'column', description: '(optional) Column in which to preview.' },
			]
		});
	}

	// --- command impl

	private _register(id: string, handler: (...args: any[]) => any, description?: ICommandHandlerDescription): void {
		let disposable = this._commands.registerCommand(id, handler, this, description);
		this._disposables.push(disposable);
	}

	/**
	 * Execute workspace symbol provider.
	 *
	 * @param query Search string to match query symbol names
	 * @return A promise that resolves to an array of symbol information.
	 */
	private _executeWorkspaceSymbolProvider(query: string): Thenable<types.SymbolInformation[]> {
		return this._commands.executeCommand<ITypeBearing[]>('_executeWorkspaceSymbolProvider', { query }).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConverters.toSymbolInformation);
			}
		});
	}

	private _executeDefinitionProvider(resource: URI, position: types.Position): Thenable<types.Location[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.IReference[]>('_executeDefinitionProvider', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConverters.location.to);
			}
		});
	}

	private _executeHoverProvider(resource: URI, position: types.Position): Thenable<types.Hover[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.IComputeExtraInfoResult[]>('_executeHoverProvider', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConverters.toHover);
			}
		});
	}

	private _executeDocumentHighlights(resource: URI, position: types.Position): Thenable<types.DocumentHighlight[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.IOccurence[]>('_executeDocumentHighlights', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConverters.toDocumentHighlight);
			}
		});
	}

	private _executeReferenceProvider(resource: URI, position: types.Position): Thenable<types.Location[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.IReference[]>('_executeDocumentHighlights', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(typeConverters.location.to);
			}
		});
	}

	private _executeDocumentRenameProvider(resource: URI, position: types.Position, newName: string): Thenable<types.WorkspaceEdit> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position),
			newName
		};
		return this._commands.executeCommand<modes.IRenameResult>('_executeDocumentRenameProvider', args).then(value => {
			if (!value) {
				return;
			}
			if (value.rejectReason) {
				return TPromise.wrapError(value.rejectReason);
			}
			let workspaceEdit = new types.WorkspaceEdit();
			for (let edit of value.edits) {
				workspaceEdit.replace(edit.resource, typeConverters.toRange(edit.range), edit.newText);
			}
			return workspaceEdit;
		});
	}

	private _executeSignatureHelpProvider(resource: URI, position: types.Position, triggerCharacter: string): Thenable<types.SignatureHelp> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position),
			triggerCharacter
		};
		return this._commands.executeCommand<modes.IParameterHints>('_executeSignatureHelpProvider', args).then(value => {
			if (value) {
				return typeConverters.SignatureHelp.to(value);
			}
		});
	}

	private _executeCompletionItemProvider(resource: URI, position: types.Position, triggerCharacter: string): Thenable<types.CompletionItem[]|types.CompletionList> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position),
			triggerCharacter
		};
		return this._commands.executeCommand<modes.ISuggestResult[][]>('_executeCompletionItemProvider', args).then(value => {
			if (value) {
				let items: types.CompletionItem[] = [];
				let incomplete: boolean;
				for (let group of value) {
					for (let suggestions of group) {
						incomplete = suggestions.incomplete || incomplete;
						for (let suggestion of suggestions.suggestions) {
							const item = typeConverters.Suggest.to(suggestions, position, suggestion);
							items.push(item);
						}
					}
				}
				return new types.CompletionList(<any>items, incomplete);
			}
		});
	}

	private _executeDocumentSymbolProvider(resource: URI): Thenable<types.SymbolInformation[]> {
		const args = {
			resource
		};
		return this._commands.executeCommand<IOutline>('_executeDocumentSymbolProvider', args).then(value => {
			if (value && Array.isArray(value.entries)) {
				return value.entries.map(typeConverters.SymbolInformation.fromOutlineEntry);
			}
		});
	}

	private _executeCodeActionProvider(resource: URI, range: types.Range): Thenable<vscode.Command[]> {
		const args = {
			resource,
			range: typeConverters.fromRange(range)
		};
		return this._commands.executeCommand<IQuickFix2[]>('_executeCodeActionProvider', args).then(value => {
			if (!Array.isArray(value)) {
				return;
			}
			return value.map(quickFix => typeConverters.Command.to(quickFix.command));
		});
	}

	private _executeCodeLensProvider(resource: URI): Thenable<vscode.CodeLens[]> {
		const args = { resource };
		return this._commands.executeCommand<ICodeLensData[]>('_executeCodeLensProvider', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(item => {
					return new types.CodeLens(
						typeConverters.toRange(item.symbol.range),
						typeConverters.Command.to(item.symbol.command));
				});
			}
		});
	}

	private _executeFormatDocumentProvider(resource: URI, options: vscode.FormattingOptions): Thenable<vscode.TextEdit[]> {
		const args = {
			resource,
			options
		};
		return this._commands.executeCommand<ISingleEditOperation[]>('_executeFormatDocumentProvider', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(edit => new types.TextEdit(typeConverters.toRange(edit.range), edit.text));
			}
		});
	}

	private _executeFormatRangeProvider(resource: URI, range: types.Range, options: vscode.FormattingOptions): Thenable<vscode.TextEdit[]> {
		const args = {
			resource,
			range: typeConverters.fromRange(range),
			options
		};
		return this._commands.executeCommand<ISingleEditOperation[]>('_executeFormatRangeProvider', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(edit => new types.TextEdit(typeConverters.toRange(edit.range), edit.text));
			}
		});
	}

	private _executeFormatOnTypeProvider(resource: URI, position: types.Position, ch: string, options: vscode.FormattingOptions): Thenable<vscode.TextEdit[]> {
		const args = {
			resource,
			position: typeConverters.fromPosition(position),
			ch,
			options
		};
		return this._commands.executeCommand<ISingleEditOperation[]>('_executeFormatOnTypeProvider', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(edit => new types.TextEdit(typeConverters.toRange(edit.range), edit.text));
			}
		});
	}
}
