/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions } from 'vscode-languageclient/browser';
import { startClient } from './client';
import { activateShared } from './extension.shared';
import { VsCodeOutputLogger } from './logging';
import { IMdParser, MarkdownItEngine } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { githubSlugifier } from './slugify';
import { IMdWorkspace, VsCodeMdWorkspace } from './workspace';

export function activate(context: vscode.ExtensionContext) {
	const contributions = getMarkdownExtensionContributions(context);
	context.subscriptions.push(contributions);

	const logger = new VsCodeOutputLogger();
	context.subscriptions.push(logger);

	const engine = new MarkdownItEngine(contributions, githubSlugifier, logger);

	const workspace = new VsCodeMdWorkspace();
	context.subscriptions.push(workspace);

	activateShared(context, workspace, engine, logger, contributions);
	startServer(context, workspace, engine);
}

async function startServer(context: vscode.ExtensionContext, workspace: IMdWorkspace, parser: IMdParser): Promise<void> {
	const serverMain = vscode.Uri.joinPath(context.extensionUri, 'server/dist/browser/main.js');
	const worker = new Worker(serverMain.toString());

	await startClient((id: string, name: string, clientOptions: LanguageClientOptions) => {
		return new LanguageClient(id, name, clientOptions, worker);
	}, workspace, parser);
}
