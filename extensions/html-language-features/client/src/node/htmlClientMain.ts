/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiagnosticModel, type InitializationOptions } from '@volar/language-server';
import * as serverProtocol from '@volar/language-server/protocol';
import { activateAutoInsertion, createLabsInfo, getTsdk } from '@volar/vscode';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient/node';

let client: lsp.BaseLanguageClient;

export async function activate(context: vscode.ExtensionContext) {

	const serverModule = context.asAbsolutePath('./server/out/node/htmlServerMain');
	const runOptions = { execArgv: <string[]>[] };
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (8000 + Math.round(Math.random() * 999))] };
	const serverOptions: lsp.ServerOptions = {
		run: {
			module: serverModule,
			transport: lsp.TransportKind.ipc,
			options: runOptions
		},
		debug: {
			module: serverModule,
			transport: lsp.TransportKind.ipc,
			options: debugOptions
		},
	};
	const initializationOptions: InitializationOptions = {
		typescript: {
			tsdk: (await getTsdk(context)).tsdk,
		},
		diagnosticModel: DiagnosticModel.Pull,
		fullCompletionList: true,
	};
	const clientOptions: lsp.LanguageClientOptions = {
		documentSelector: [{ language: 'html' }],
		initializationOptions,
	};
	client = new lsp.LanguageClient(
		'html',
		'HTML',
		serverOptions,
		clientOptions,
	);
	await client.start();

	activateAutoInsertion('html', client);

	const labsInfo = createLabsInfo(serverProtocol);
	labsInfo.addLanguageClient(client);
	return labsInfo.extensionExports;
}

export function deactivate(): Thenable<any> | undefined {
	return client?.stop();
}
