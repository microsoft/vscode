/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from './commandManager';
import * as commands from './commands/index';
import LinkProvider from './features/documentLinkProvider';
import MDDocumentSymbolProvider from './features/documentSymbolProvider';
import MarkdownFoldingProvider from './features/foldingProvider';
import { MarkdownContentProvider } from './features/previewContentProvider';
import { MarkdownPreviewManager } from './features/previewManager';
import MarkdownWorkspaceSymbolProvider from './features/workspaceSymbolProvider';
import { Logger } from './logger';
import { MarkdownEngine } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './security';
import { loadDefaultTelemetryReporter } from './telemetryReporter';
import { githubSlugifier } from './slugify';


export function activate(context: vscode.ExtensionContext) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const contributions = getMarkdownExtensionContributions(context);

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const engine = new MarkdownEngine(contributions, githubSlugifier);
	const logger = new Logger();

	const selector: vscode.DocumentSelector = [
		{ language: 'markdown', scheme: 'file' },
		{ language: 'markdown', scheme: 'untitled' }
	];

	const contentProvider = new MarkdownContentProvider(engine, context, cspArbiter, contributions, logger);
	const symbolProvider = new MDDocumentSymbolProvider(engine);
	const previewManager = new MarkdownPreviewManager(contentProvider, logger, contributions);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(vscode.languages.setLanguageConfiguration('markdown', {
		wordPattern: new RegExp('(\\p{Alphabetic}|\\p{Number})+', 'ug'),
	}));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider));
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new LinkProvider()));
	context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, new MarkdownFoldingProvider(engine)));
	context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new MarkdownWorkspaceSymbolProvider(symbolProvider)));

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
	commandManager.register(new commands.OpenDocumentLinkCommand(engine));
	commandManager.register(new commands.ToggleLockCommand(previewManager));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		logger.updateConfiguration();
		previewManager.updateConfiguration();
	}));
}
