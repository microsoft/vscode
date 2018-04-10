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
import { getMarkdownExtensionContributions } from './markdownExtensions';
import LinkProvider from './features/documentLinkProvider';
import MDDocumentSymbolProvider from './features/documentSymbolProvider';
import { MarkdownContentProvider } from './features/previewContentProvider';
import { MarkdownPreviewManager } from './features/previewManager';
import MarkdownFoldingProvider from './features/foldingProvider';


export function activate(context: vscode.ExtensionContext) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const contributions = getMarkdownExtensionContributions();

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const engine = new MarkdownEngine(contributions);
	const logger = new Logger();

	const selector = 'markdown';

	const contentProvider = new MarkdownContentProvider(engine, context, cspArbiter, contributions, logger);

	const previewManager = new MarkdownPreviewManager(contentProvider, logger, contributions);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new MDDocumentSymbolProvider(engine)));
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new LinkProvider()));
	context.subscriptions.push(vscode.languages.registerFoldingProvider(selector, new MarkdownFoldingProvider(engine)));

	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, previewManager);

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);
	commandManager.register(new commands.ShowPreviewCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowLockedPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowSourceCommand(previewManager));
	commandManager.register(new commands.RefreshPreviewCommand(previewManager));
	commandManager.register(new commands.MoveCursorToPositionCommand());
	commandManager.register(new commands.ShowPreviewSecuritySelectorCommand(previewSecuritySelector, previewManager));
	commandManager.register(new commands.OnPreviewStyleLoadErrorCommand());
	commandManager.register(new commands.OpenDocumentLinkCommand(engine));
	commandManager.register(new commands.ToggleLockCommand(previewManager));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		logger.updateConfiguration();
		previewManager.updateConfiguration();
	}));
}
