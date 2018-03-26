/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import * as types from 'vs/workbench/api/node/extHostTypes';
import { ISingleEditOperation } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { IWorkspaceSymbolProvider } from 'vs/workbench/parts/search/common/search';
import { Position as EditorPosition, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { CustomCodeAction } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { ExtHostTask } from './extHostTask';

export class ExtHostApiCommands {

	static register(commands: ExtHostCommands, workspace: ExtHostTask) {
		return new ExtHostApiCommands(commands, workspace).registerCommands();
	}

	private _commands: ExtHostCommands;
	private _tasks: ExtHostTask;
	private _disposables: IDisposable[] = [];

	private constructor(commands: ExtHostCommands, task: ExtHostTask) {
		this._commands = commands;
		this._tasks = task;
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
		this._register('vscode.executeTypeDefinitionProvider', this._executeTypeDefinitionProvider, {
			description: 'Execute all type definition providers.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position of a symbol', constraint: types.Position }
			],
			returns: 'A promise that resolves to an array of Location-instances.'
		});
		this._register('vscode.executeImplementationProvider', this._executeImplementationProvider, {
			description: 'Execute all implementation providers.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI },
				{ name: 'position', description: 'Position of a symbol', constraint: types.Position }
			],
			returns: 'A promise that resolves to an array of Location-instance.'
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
				{ name: 'triggerCharacter', description: '(optional) Trigger signature help when the user types the character, like `,` or `(`', constraint: value => value === void 0 || typeof value === 'string' }
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
				{ name: 'triggerCharacter', description: '(optional) Trigger completion when the user types the character, like `,` or `(`', constraint: value => value === void 0 || typeof value === 'string' }
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
			description: 'Execute CodeLens provider.',
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
		this._register('vscode.executeLinkProvider', this._executeDocumentLinkProvider, {
			description: 'Execute document link provider.',
			args: [
				{ name: 'uri', description: 'Uri of a text document', constraint: URI }
			],
			returns: 'A promise that resolves to an array of DocumentLink-instances.'
		});
		this._register('vscode.executeTaskProvider', this._executeTaskProvider, {
			description: 'Execute task provider',
			args: [],
			returns: 'An array of task handles'
		});

		this._register('vscode.previewHtml', (uri: URI, position?: vscode.ViewColumn, label?: string, options?: any) => {
			return this._commands.executeCommand('_workbench.previewHtml',
				uri,
				typeof position === 'number' && typeConverters.fromViewColumn(position),
				label,
				options);
		}, {
				description: `
					Render the html of the resource in an editor view.

					See [working with the html preview](https://code.visualstudio.com/docs/extensionAPI/vscode-api-commands#working-with-the-html-preview) for more information about the html preview's intergration with the editor and for best practices for extension authors.
				`,
				args: [
					{ name: 'uri', description: 'Uri of the resource to preview.', constraint: value => value instanceof URI || typeof value === 'string' },
					{ name: 'column', description: '(optional) Column in which to preview.', constraint: value => typeof value === 'undefined' || (typeof value === 'number' && typeof types.ViewColumn[value] === 'string') },
					{ name: 'label', description: '(optional) An human readable string that is used as title for the preview.', constraint: v => typeof v === 'string' || typeof v === 'undefined' },
					{ name: 'options', description: '(optional) Options for controlling webview environment.', constraint: v => typeof v === 'object' || typeof v === 'undefined' }
				]
			});

		this._register('vscode.openFolder', (uri?: URI, forceNewWindow?: boolean) => {
			if (!uri) {
				return this._commands.executeCommand('_files.pickFolderAndOpen', forceNewWindow);
			}

			return this._commands.executeCommand('_files.windowOpen', [uri.fsPath], forceNewWindow);
		}, {
				description: 'Open a folder or workspace in the current window or new window depending on the newWindow argument. Note that opening in the same window will shutdown the current extension host process and start a new one on the given folder/workspace unless the newWindow parameter is set to true.',
				args: [
					{ name: 'uri', description: '(optional) Uri of the folder or workspace file to open. If not provided, a native dialog will ask the user for the folder', constraint: value => value === void 0 || value instanceof URI },
					{ name: 'newWindow', description: '(optional) Whether to open the folder/workspace in a new window or the same. Defaults to opening in the same window.', constraint: value => value === void 0 || typeof value === 'boolean' }
				]
			});

		this._register('vscode.diff', (left: URI, right: URI, label: string, options?: vscode.TextDocumentShowOptions) => {
			return this._commands.executeCommand('_workbench.diff', [
				left, right,
				label,
				undefined,
				typeConverters.toTextEditorOptions(options),
				options ? typeConverters.fromViewColumn(options.viewColumn) : undefined
			]);
		}, {
				description: 'Opens the provided resources in the diff editor to compare their contents.',
				args: [
					{ name: 'left', description: 'Left-hand side resource of the diff editor', constraint: URI },
					{ name: 'right', description: 'Right-hand side resource of the diff editor', constraint: URI },
					{ name: 'title', description: '(optional) Human readable title for the diff editor', constraint: v => v === void 0 || typeof v === 'string' },
					{ name: 'options', description: '(optional) Editor options, see vscode.TextDocumentShowOptions' }
				]
			});

		this._register('vscode.open', (resource: URI, columnOrOptions?: vscode.ViewColumn | vscode.TextDocumentShowOptions) => {
			let options: ITextEditorOptions;
			let column: EditorPosition;

			if (columnOrOptions) {
				if (typeof columnOrOptions === 'number') {
					column = typeConverters.fromViewColumn(columnOrOptions);
				} else {
					options = typeConverters.toTextEditorOptions(columnOrOptions);
					column = typeConverters.fromViewColumn(columnOrOptions.viewColumn);
				}
			}

			return this._commands.executeCommand('_workbench.open', [
				resource,
				options,
				column
			]);
		}, {
				description: 'Opens the provided resource in the editor. Can be a text or binary file, or a http(s) url. If you need more control over the options for opening a text file, use vscode.window.showTextDocument instead.',
				args: [
					{ name: 'resource', description: 'Resource to open', constraint: URI },
					{ name: 'columnOrOptions', description: '(optional) Either the column in which to open or editor options, see vscode.TextDocumentShowOptions', constraint: v => v === void 0 || typeof v === 'number' || typeof v === 'object' }
				]
			});

		this._register('vscode.removeFromRecentlyOpened', (path: string) => {
			return this._commands.executeCommand('_workbench.removeFromRecentlyOpened', path);
		}, {
				description: 'Removes an entry with the given path from the recently opened list.',
				args: [
					{ name: 'path', description: 'Path to remove from recently opened.', constraint: value => typeof value === 'string' }
				]
			});
	}

	// --- command impl

	private _register(id: string, handler: (...args: any[]) => any, description?: ICommandHandlerDescription): void {
		let disposable = this._commands.registerCommand(false, id, handler, this, description);
		this._disposables.push(disposable);
	}

	/**
	 * Execute workspace symbol provider.
	 *
	 * @param query Search string to match query symbol names
	 * @return A promise that resolves to an array of symbol information.
	 */
	private _executeWorkspaceSymbolProvider(query: string): Thenable<types.SymbolInformation[]> {
		return this._commands.executeCommand<[IWorkspaceSymbolProvider, modes.SymbolInformation[]][]>('_executeWorkspaceSymbolProvider', { query }).then(value => {
			const result: types.SymbolInformation[] = [];
			if (Array.isArray(value)) {
				for (let tuple of value) {
					result.push(...tuple[1].map(typeConverters.toSymbolInformation));
				}
			}
			return result;
		});
	}

	private _executeDefinitionProvider(resource: URI, position: types.Position): Thenable<types.Location[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.Location[]>('_executeDefinitionProvider', args)
			.then(tryMapWith(typeConverters.location.to));
	}

	private _executeTypeDefinitionProvider(resource: URI, position: types.Position): Thenable<types.Location[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.Location[]>('_executeTypeDefinitionProvider', args)
			.then(tryMapWith(typeConverters.location.to));
	}

	private _executeImplementationProvider(resource: URI, position: types.Position): Thenable<types.Location[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.Location[]>('_executeImplementationProvider', args)
			.then(tryMapWith(typeConverters.location.to));
	}

	private _executeHoverProvider(resource: URI, position: types.Position): Thenable<types.Hover[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.Hover[]>('_executeHoverProvider', args)
			.then(tryMapWith(typeConverters.toHover));
	}

	private _executeDocumentHighlights(resource: URI, position: types.Position): Thenable<types.DocumentHighlight[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.DocumentHighlight[]>('_executeDocumentHighlights', args)
			.then(tryMapWith(typeConverters.toDocumentHighlight));
	}

	private _executeReferenceProvider(resource: URI, position: types.Position): Thenable<types.Location[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position)
		};
		return this._commands.executeCommand<modes.Location[]>('_executeReferenceProvider', args)
			.then(tryMapWith(typeConverters.location.to));
	}

	private _executeDocumentRenameProvider(resource: URI, position: types.Position, newName: string): Thenable<types.WorkspaceEdit> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position),
			newName
		};
		return this._commands.executeCommand<modes.WorkspaceEdit>('_executeDocumentRenameProvider', args).then(value => {
			if (!value) {
				return undefined;
			}
			if (value.rejectReason) {
				return TPromise.wrapError<types.WorkspaceEdit>(new Error(value.rejectReason));
			}
			return typeConverters.WorkspaceEdit.to(value);
		});
	}

	private _executeSignatureHelpProvider(resource: URI, position: types.Position, triggerCharacter: string): Thenable<types.SignatureHelp> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position),
			triggerCharacter
		};
		return this._commands.executeCommand<modes.SignatureHelp>('_executeSignatureHelpProvider', args).then(value => {
			if (value) {
				return typeConverters.SignatureHelp.to(value);
			}
			return undefined;
		});
	}

	private _executeCompletionItemProvider(resource: URI, position: types.Position, triggerCharacter: string): Thenable<types.CompletionList> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position),
			triggerCharacter
		};
		return this._commands.executeCommand<modes.ISuggestResult>('_executeCompletionItemProvider', args).then(result => {
			if (result) {
				const items = result.suggestions.map(suggestion => typeConverters.Suggest.to(position, suggestion));
				return new types.CompletionList(items, result.incomplete);
			}
			return undefined;
		});
	}

	private _executeDocumentSymbolProvider(resource: URI): Thenable<types.SymbolInformation[]> {
		const args = {
			resource
		};
		return this._commands.executeCommand<modes.IOutline>('_executeDocumentSymbolProvider', args).then(value => {
			if (value && Array.isArray(value.entries)) {
				return value.entries.map(typeConverters.toSymbolInformation);
			}
			return undefined;
		});
	}

	private _executeCodeActionProvider(resource: URI, range: types.Range): Thenable<(vscode.CodeAction | vscode.Command)[]> {
		const args = {
			resource,
			range: typeConverters.fromRange(range)
		};
		return this._commands.executeCommand<CustomCodeAction[]>('_executeCodeActionProvider', args)
			.then(tryMapWith(codeAction => {
				if (codeAction._isSynthetic) {
					return this._commands.converter.fromInternal(codeAction.command);
				} else {
					const ret = new types.CodeAction(
						codeAction.title,
						codeAction.kind ? new types.CodeActionKind(codeAction.kind) : undefined
					);
					if (codeAction.edit) {
						ret.edit = typeConverters.WorkspaceEdit.to(codeAction.edit);
					}
					if (codeAction.command) {
						ret.command = this._commands.converter.fromInternal(codeAction.command);
					}
					return ret;
				}
			}));
	}

	private _executeCodeLensProvider(resource: URI): Thenable<vscode.CodeLens[]> {
		const args = { resource };
		return this._commands.executeCommand<modes.ICodeLensSymbol[]>('_executeCodeLensProvider', args)
			.then(tryMapWith(item => {
				return new types.CodeLens(
					typeConverters.toRange(item.range),
					this._commands.converter.fromInternal(item.command));
			}));

	}

	private _executeFormatDocumentProvider(resource: URI, options: vscode.FormattingOptions): Thenable<vscode.TextEdit[]> {
		const args = {
			resource,
			options
		};
		return this._commands.executeCommand<ISingleEditOperation[]>('_executeFormatDocumentProvider', args)
			.then(tryMapWith(edit => new types.TextEdit(typeConverters.toRange(edit.range), edit.text)));
	}

	private _executeFormatRangeProvider(resource: URI, range: types.Range, options: vscode.FormattingOptions): Thenable<vscode.TextEdit[]> {
		const args = {
			resource,
			range: typeConverters.fromRange(range),
			options
		};
		return this._commands.executeCommand<ISingleEditOperation[]>('_executeFormatRangeProvider', args)
			.then(tryMapWith(edit => new types.TextEdit(typeConverters.toRange(edit.range), edit.text)));
	}

	private _executeFormatOnTypeProvider(resource: URI, position: types.Position, ch: string, options: vscode.FormattingOptions): Thenable<vscode.TextEdit[]> {
		const args = {
			resource,
			position: typeConverters.fromPosition(position),
			ch,
			options
		};
		return this._commands.executeCommand<ISingleEditOperation[]>('_executeFormatOnTypeProvider', args)
			.then(tryMapWith(edit => new types.TextEdit(typeConverters.toRange(edit.range), edit.text)));
	}

	private _executeDocumentLinkProvider(resource: URI): Thenable<vscode.DocumentLink[]> {
		return this._commands.executeCommand<modes.ILink[]>('_executeLinkProvider', resource)
			.then(tryMapWith(typeConverters.DocumentLink.to));
	}

	private _executeTaskProvider(): Thenable<vscode.Task[]> {
		return this._tasks.executeTaskProvider();
	}
}

function tryMapWith<T, R>(f: (x: T) => R) {
	return (value: T[]) => {
		if (Array.isArray(value)) {
			return value.map(f);
		}
		return undefined;
	};
}