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
import { MarkdownContentProvider, MarkdownPreviewManager } from './features/previewContentProvider';


export function activate(context: vscode.ExtensionContext) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const engine = new MarkdownEngine();
	const logger = new Logger();

	const selector = 'markdown';

	const contentProvider = new MarkdownContentProvider(engine, context, cspArbiter, logger);
	loadMarkdownExtensions(contentProvider, engine);

	const previewManager = new MarkdownPreviewManager(contentProvider, logger);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new MDDocumentSymbolProvider(engine)));
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new LinkProvider()));

	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, previewManager);

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);
	commandManager.register(new commands.ShowPreviewCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowPinnedPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowSourceCommand(previewManager));
	commandManager.register(new commands.RefreshPreviewCommand(previewManager));
	commandManager.register(new commands.RevealLineCommand(logger, previewManager));
	commandManager.register(new commands.MoveCursorToPositionCommand());
	commandManager.register(new commands.ShowPreviewSecuritySelectorCommand(previewSecuritySelector));
	commandManager.register(new commands.OnPreviewStyleLoadErrorCommand());
	commandManager.register(new commands.OpenDocumentLinkCommand(engine));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		logger.updateConfiguration();
		previewManager.updateConfiguration();
	}));
}
