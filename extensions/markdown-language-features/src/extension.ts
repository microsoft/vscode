/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { MdLanguageClient, startClient } from './client/client';
import { activateShared } from './extension.shared';
import { VsCodeOutputLogger } from './logging';
import { IMdParser, MarkdownItEngine } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { githubSlugifier } from './slugify';

export async function activate(context: vscode.ExtensionContext) {
	const contributions = getMarkdownExtensionContributions(context);
	context.subscriptions.push(contributions);

	const logger = new VsCodeOutputLogger();
	context.subscriptions.push(logger);
	const engine = new MarkdownItEngine(contributions, githubSlugifier, logger);
	registerTestOutputRenderer();

	const client = await startServer(context, engine);
	context.subscriptions.push(client);
	activateShared(context, client, engine, logger, contributions);

}

function startServer(context: vscode.ExtensionContext, parser: IMdParser): Promise<MdLanguageClient> {
	const isDebugBuild = context.extension.packageJSON.main.includes('/out/');

	const serverModule = context.asAbsolutePath(
		isDebugBuild
			// For local non bundled version of vscode-markdown-languageserver
			// ? './node_modules/vscode-markdown-languageserver/out/node/workerMain'
			? './node_modules/vscode-markdown-languageserver/dist/node/workerMain'
			: './dist/serverWorkerMain'
	);

	// The debug options for the server
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (7000 + Math.round(Math.random() * 999))] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	// pass the location of the localization bundle to the server
	process.env['VSCODE_L10N_BUNDLE_LOCATION'] = vscode.l10n.uri?.toString() ?? '';

	return startClient((id, name, clientOptions) => {
		return new LanguageClient(id, name, serverOptions, clientOptions);
	}, parser);
}


function registerTestOutputRenderer() {
	vscode.lm.registerTool('renderMarkdown', {
		invoke: (_options, _token) => {
			const result = new vscode.ExtendedLanguageModelToolResult([]);

			(result as vscode.ExtendedLanguageModelToolResult2).toolResultDetails2 = {
				mime: 'application/vnd.test-output',
				value: new Uint8Array(Buffer.from('This is a test <b>output</b> rendered by the test renderer.'))
			};

			return result;
		},
	});

	vscode.chat.registerChatOutputRenderer('application/vnd.test-output', {
		async renderChatOutput(data, webview, _token) {
			const decodedData = new TextDecoder().decode(data);

			webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Document</title>
</head>
<body>
	${decodedData}
</body>
</html>`;


		},
	});
}

