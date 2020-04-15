/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type * as Proto from '../protocol';
import TypeScriptServiceClientHost from '../typeScriptServiceClientHost';
import { ITypeScriptServiceClient } from '../typescriptService';
import { DiagnosticsManager } from '../features/diagnostics';
import { nulToken } from '../utils/cancellation';
import { applyCodeAction } from '../utils/codeAction';
import { Command } from '../utils/commandManager';
import * as typeConverters from '../utils/typeConverters';
import { Lazy } from '../utils/lazy';

const flatMapAsync = async <T, P>(arr: readonly T[], fn: (el: T) => Promise<P[]>) =>
	(await Promise.all(arr.map(fn))).reduce((acc, arr) => [...acc, ...arr], []);

export abstract class ExecuteAllFixesCommand implements Command {
	public abstract readonly id: string;
	protected abstract readonly fixName: string;
	private readonly serviceClient: ITypeScriptServiceClient;
	private readonly diagnosticsManager: DiagnosticsManager;

	public constructor(lazyClientHost: Lazy<TypeScriptServiceClientHost>) {
		const client = lazyClientHost.value;
		this.serviceClient = client.serviceClient;
		this.diagnosticsManager = client.serviceClient.diagnosticsManager;
	}

	public async execute() {
		const editor = vscode.window.activeTextEditor;

		if (!editor) {
			return;
		}

		const documents = vscode.workspace.textDocuments;
		const mainUri = editor?.document.uri.toString();
		const document = documents.find(({ uri }) => uri.toString() === mainUri);

		if (!document) {
			return;
		}

		const diagnostics = this.diagnosticsManager.getDiagnostics(document.uri);
		const fixActions = this.filterActions(
			(
				await flatMapAsync(diagnostics, (diagnostic) =>
					this.getFixesForDiagnostic(document, diagnostic)
				)
			).filter(({ fixName }) => fixName === this.fixName)
		);

		if (fixActions.length === 0) {
			return;
		}

		const combinedAction = fixActions.reduce((acc, action) => ({
			...acc,
			changes: [...acc.changes, ...action.changes]
		}));
		await applyCodeAction(this.serviceClient, combinedAction, nulToken);
	}

	private async getFixesForDiagnostic(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	) {
		const file = this.serviceClient.toOpenedFilePath(document) ?? '';

		const args: Proto.CodeFixRequestArgs = {
			...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
			errorCodes: [+diagnostic.code!]
		};
		const response = await this.serviceClient.execute('getCodeFixes', args, nulToken);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		return response.body;
	}

	protected filterActions(actions: Proto.CodeFixAction[]) {
		return actions;
	}
}
