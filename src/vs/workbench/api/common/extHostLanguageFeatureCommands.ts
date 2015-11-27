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
import {QuickFixRegistry} from 'vs/editor/contrib/quickFix/common/quickFix';
import {OutlineRegistry, IOutlineEntry, IOutlineSupport} from 'vs/editor/contrib/quickOpen/common/quickOpen';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {NavigateTypesSupportRegistry, INavigateTypesSupport, ITypeBearing} from 'vs/workbench/parts/search/common/search'
import {RenameRegistry} from 'vs/editor/contrib/rename/common/rename';
import {FormatRegistry, FormatOnTypeRegistry} from 'vs/editor/contrib/format/common/format';
import {CodeLensRegistry} from 'vs/editor/contrib/codelens/common/codelens';
import {ParameterHintsRegistry} from 'vs/editor/contrib/parameterHints/common/parameterHints';
import {SuggestRegistry} from 'vs/editor/contrib/suggest/common/suggest';

// vscode.executeWorkspaceSymbolProvider
// vscode.executeDefinitionProvider
// vscode.executeHoverProvider

// vscode.executeDocumentHighlights
// vscode.executeReferenceProvider
// vscode.executeCodeActionProvider
// vscode.executeCodeLensProvider
// vscode.executeDocumentSymbolProvider
// vscode.executeDocumentRenameProvider
// vscode.executeFormatDocumentProvider
// vscode.executeFormatRangeProvider
// vscode.executeFormatOnTypeProvider
// vscode.executeSignatureHelpProvider
// vscode.executeCompletionItemProvider

export class ExtHostLanguageFeatureCommands {

	private _commands: PluginHostCommands;
	private _disposables: IDisposable[] = [];

	constructor(commands: PluginHostCommands) {
		this._commands = commands;

		this._register('vscode.executeWorkspaceSymbolProvider', this._executeWorkspaceSymbolProvider);
		this._register('vscode.executeDefinitionProvider', this._executeDefinitionProvider);
		this._register('vscode.executeHoverProvider', this._executeHoverProvider);
	}

	private _register(id: string, callback: (...args: any[]) => any): void {
		this._disposables.push(this._commands.registerCommand(id, callback, this));
	}

	// --- command impl

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
}