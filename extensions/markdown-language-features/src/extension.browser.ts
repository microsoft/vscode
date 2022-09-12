/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseLanguageClient, LanguageClient, LanguageClientOptions } from 'vscode-languageclient/browser';
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
	const serverMain = vscode.Uri.joinPath(context.extensionUri, 'server/dist/browser/main.js');
	const worker = new Worker(serverMain.toString());

	return startClient((id: string, name: string, clientOptions: LanguageClientOptions) => {
		return new LanguageClient(id, name, clientOptions, worker);
	}, workspace, parser);
}
