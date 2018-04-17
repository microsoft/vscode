/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import { Command } from '../utils/commandManager';
import * as typeconverts from '../utils/typeConverters';

import { isSupportedLanguageMode } from '../utils/languageModeIds';
import API from '../utils/api';
import { Lazy } from '../utils/lazy';
import TypeScriptServiceClientHost from '../typeScriptServiceClientHost';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();


export class OrganizeImportsCommand implements Command {
	public static readonly Ids = ['javascript.organizeImports', 'typescript.organizeImports'];

	public readonly id = OrganizeImportsCommand.Ids;

	constructor(
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>
	) { }

	public async execute(): Promise<boolean> {
		// Don't force activation
		if (!this.lazyClientHost.hasValue) {
			return false;
		}

		const client = this.lazyClientHost.value.serviceClient;
		if (!client.apiVersion.has280Features()) {
			return false;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor || !isSupportedLanguageMode(editor.document)) {
			return false;
		}

		const file = client.normalizePath(editor.document.uri);
		if (!file) {
			return false;
		}

		const args: Proto.OrganizeImportsRequestArgs = {
			scope: {
				type: 'file',
				args: {
					file
				}
			}
		};
		const response = await client.execute('organizeImports', args);
		if (!response || !response.success) {
			return false;
		}

		const edits = typeconverts.WorkspaceEdit.fromFromFileCodeEdits(client, response.body);
		return await vscode.workspace.applyEdit(edits);
	}
}

/**
 * When clause context set when the ts version supports organize imports.
 */
const contextName = 'typescript.canOrganizeImports';

export class OrganizeImportsContextManager {

	private currentValue: boolean = false;

	public onDidChangeApiVersion(apiVersion: API): any {
		this.updateContext(apiVersion.has280Features());
	}

	private updateContext(newValue: boolean) {
		if (newValue === this.currentValue) {
			return;
		}

		vscode.commands.executeCommand('setContext', contextName, newValue);
		this.currentValue = newValue;
	}
}


export class OrganizeImportsCodeActionProvider implements vscode.CodeActionProvider {
	private static readonly organizeImportsKind = vscode.CodeActionKind.Source.append('organizeImports');

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [OrganizeImportsCodeActionProvider.organizeImportsKind]
	};

	public provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		_context: vscode.CodeActionContext,
		_token: vscode.CancellationToken
	): vscode.CodeAction[] {
		if (!isSupportedLanguageMode(document)) {
			return [];
		}

		if (!this.client.apiVersion.has280Features()) {
			return [];
		}

		const action = new vscode.CodeAction(localize('oraganizeImportsAction.title', "Organize Imports"), OrganizeImportsCodeActionProvider.organizeImportsKind);
		action.command = { title: '', command: OrganizeImportsCommand.Ids[0] };
		return [action];
	}
}