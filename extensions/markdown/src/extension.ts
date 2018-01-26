/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { MarkdownEngine } from './markdownEngine';
import { ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './security';
import { Logger } from './logger';
import { CommandManager } from './commandManager';
import * as commands from './commands/index';
import { loadDefaultTelemetryReporter } from './telemetryReporter';
import { loadMarkdownExtensions } from './markdownExtensions';
import LinkProvider from './features/documentLinkProvider';
import MDDocumentSymbolProvider from './features/documentSymbolProvider';
import { MarkdownContentProvider, getMarkdownUri, isMarkdownFile, MarkdownPreviewWebviewManager } from './features/previewContentProvider';


export function activate(context: vscode.ExtensionContext) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const engine = new MarkdownEngine();
	const logger = new Logger();

	const selector = 'markdown';

	const contentProvider = new MarkdownContentProvider(engine, context, cspArbiter, logger);
	loadMarkdownExtensions(contentProvider, engine);

	const webviewManager = new MarkdownPreviewWebviewManager(contentProvider);
	context.subscriptions.push(webviewManager);

	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new MDDocumentSymbolProvider(engine)));
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new LinkProvider()));

	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, webviewManager);

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);
	commandManager.register(new commands.ShowPreviewCommand(webviewManager, telemetryReporter));
	commandManager.register(new commands.ShowPreviewToSideCommand(webviewManager, telemetryReporter));
	commandManager.register(new commands.ShowSourceCommand());
	commandManager.register(new commands.RefreshPreviewCommand(webviewManager));
	commandManager.register(new commands.RevealLineCommand(logger));
	commandManager.register(new commands.MoveCursorToPositionCommand());
	commandManager.register(new commands.ShowPreviewSecuritySelectorCommand(previewSecuritySelector));
	commandManager.register(new commands.OnPreviewStyleLoadErrorCommand());
	commandManager.register(new commands.DidClickCommand());
	commandManager.register(new commands.OpenDocumentLinkCommand(engine));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		logger.updateConfiguration();
		webviewManager.updateConfiguration();
	}));

	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
		if (isMarkdownFile(event.textEditor.document)) {
			const markdownFile = getMarkdownUri(event.textEditor.document.uri);
			logger.log('updatePreviewForSelection', { markdownFile: markdownFile.toString() });

			vscode.commands.executeCommand('_workbench.htmlPreview.postMessage',
				markdownFile,
				{
					line: event.selections[0].active.line
				});
		}
	}));
}
