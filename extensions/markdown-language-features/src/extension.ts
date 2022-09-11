/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseLanguageClient, LanguageClient, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { startClient } from './client';
import { activateShared } from './extension.shared';
import { VsCodeOutputLogger } from './logging';
import { IMdParser, MarkdownItEngine } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { githubSlugifier } from './slugify';
import { IMdWorkspace, VsCodeMdWorkspace } from './workspace';

export async function activate(context: vscode.ExtensionContext) {
	const contributions = getMarkdownExtensionContributions(context);
	context.subscriptions.push(contributions);

	const logger = new VsCodeOutputLogger();
	context.subscriptions.push(logger);

	const engine = new MarkdownItEngine(contributions, githubSlugifier, logger);

	const workspace = new VsCodeMdWorkspace();
	context.subscriptions.push(workspace);

	const client = await startServer(context, workspace, engine);
	context.subscriptions.push({
		dispose: () => client.stop()
	});
	activateShared(context, client, engine, logger, contributions);
}

function startServer(context: vscode.ExtensionContext, workspace: IMdWorkspace, parser: IMdParser): Promise<BaseLanguageClient> {
	const clientMain = vscode.extensions.getExtension('vscode.markdown-language-features')?.packageJSON?.main || '';

	const serverMain = `./server/${clientMain.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/main`;
	const serverModule = context.asAbsolutePath(serverMain);

	// The debug options for the server
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (7000 + Math.round(Math.random() * 999))] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};
	return startClient((id, name, clientOptions) => {
		return new LanguageClient(id, name, serverOptions, clientOptions);
	}, workspace, parser);
}
