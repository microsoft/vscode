/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, {Emitter} from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import {DefaultFilter} from 'vs/editor/common/modes/modesFilters';
import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError} from 'vs/base/common/errors';
import {sequence} from 'vs/base/common/async';
import {Range as EditorRange} from 'vs/editor/common/core/range';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/common/pluginHostTypeConverters';
import * as types from 'vs/workbench/api/common/pluginHostTypes';
import {IPosition, IRange, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {CancellationTokenSource} from 'vs/base/common/cancellation';
import {PluginHostModelService} from 'vs/workbench/api/common/pluginHostDocuments';
import {IMarkerService, IMarker} from 'vs/platform/markers/common/markers';
import {PluginHostCommands, MainThreadCommands} from 'vs/workbench/api/common/pluginHostCommands';
import {DeclarationRegistry} from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';
import {ExtraInfoRegistry} from 'vs/editor/contrib/hover/common/hover';
import {OccurrencesRegistry} from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import {ReferenceRegistry} from 'vs/editor/contrib/referenceSearch/common/referenceSearch';
import {IQuickFix2, QuickFixRegistry, getQuickFixes} from 'vs/editor/contrib/quickFix/common/quickFix';
import {IOutline} from 'vs/editor/contrib/quickOpen/common/quickOpen';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {NavigateTypesSupportRegistry, INavigateTypesSupport, ITypeBearing} from 'vs/workbench/parts/search/common/search'
import {RenameRegistry} from 'vs/editor/contrib/rename/common/rename';
import {FormatRegistry, FormatOnTypeRegistry} from 'vs/editor/contrib/format/common/format';
import {ICodeLensData} from 'vs/editor/contrib/codelens/common/codelens';
import {addApiCommand} from 'vs/platform/keybinding/common/commands';

export class ExtHostLanguageFeatureCommands {

	private _commands: PluginHostCommands;
	private _disposables: IDisposable[] = [];

	constructor(commands: PluginHostCommands) {
		this._commands = commands;

		addApiCommand('vscode.executeWorkspaceSymbolProvider', this._executeWorkspaceSymbolProvider, this);
		addApiCommand('vscode.executeDefinitionProvider', this._executeDefinitionProvider, this);
		addApiCommand('vscode.executeHoverProvider', this._executeHoverProvider, this);
		addApiCommand('vscode.executeDocumentHighlights', this._executeDocumentHighlights, this);
		addApiCommand('vscode.executeReferenceProvider', this._executeReferenceProvider, this);
		addApiCommand('vscode.executeDocumentRenameProvider', this._executeDocumentRenameProvider, this);
		addApiCommand('vscode.executeSignatureHelpProvider', this._executeSignatureHelpProvider, this);
		addApiCommand('vscode.executeDocumentSymbolProvider', this._executeDocumentSymbolProvider, this);
		addApiCommand('vscode.executeCompletionItemProvider', this._executeCompletionItemProvider, this);
		addApiCommand('vscode.executeCodeActionProvider', this._executeCodeActionProvider, this);
		addApiCommand('vscode.executeCodeLensProvider', this._executeCodeLensProvider, this);
		addApiCommand('vscode.executeFormatDocumentProvider', this._executeFormatDocumentProvider, this);
		addApiCommand('vscode.executeFormatRangeProvider', this._executeFormatRangeProvider, this);
		addApiCommand('vscode.executeFormatOnTypeProvider', this._executeFormatOnTypeProvider, this);
	}

	// --- command impl

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
				return value.map(typeConverters.toLocation)
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
				return value.map(typeConverters.toHover)
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
				return value.map(typeConverters.toDocumentHighlight)
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
				return value.map(typeConverters.toLocation)
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

	private _executeCompletionItemProvider(resource: URI, position: types.Position, triggerCharacter: string): Thenable<types.CompletionItem[]> {
		const args = {
			resource,
			position: position && typeConverters.fromPosition(position),
			triggerCharacter
		};
		return this._commands.executeCommand<modes.ISuggestResult[][]>('_executeCompletionItemProvider', args).then(value => {
			if (value) {
				let items: types.CompletionItem[] = [];
				for (let group of value) {
					for (let suggestions of group) {
						for (let suggestion of suggestions.suggestions) {
							const item = typeConverters.Suggest.to(suggestion);
							items.push(item);
						}
					}
				}
				return items;
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

	private _executeCodeLensProvider(resource: URI): Thenable<vscode.CodeLens[]>{
		const args = { resource };
		return this._commands.executeCommand<ICodeLensData[]>('_executeCodeLensProvider', args).then(value => {
			if (Array.isArray(value)) {
				return value.map(item => {
					return new types.CodeLens(typeConverters.toRange(item.symbol.range),
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

	private _executeFormatOnTypeProvider(resource: URI, position: types.Position, ch:string, options: vscode.FormattingOptions): Thenable<vscode.TextEdit[]> {
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