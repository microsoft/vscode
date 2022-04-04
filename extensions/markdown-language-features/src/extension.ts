/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from './commandManager';
import * as commands from './commands/index';
import { MdLinkProvider } from './languageFeatures/documentLinkProvider';
import { MdDocumentSymbolProvider } from './languageFeatures/documentSymbolProvider';
import { registerDropIntoEditor } from './languageFeatures/dropIntoEditor';
import { MdFoldingProvider } from './languageFeatures/foldingProvider';
import { MdPathCompletionProvider } from './languageFeatures/pathCompletions';
import { MdReferencesProvider } from './languageFeatures/references';
import { MdRenameProvider } from './languageFeatures/rename';
import { MdSmartSelect } from './languageFeatures/smartSelect';
import { MdWorkspaceSymbolProvider } from './languageFeatures/workspaceSymbolProvider';
import { Logger } from './logger';
import { MarkdownEngine } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { MarkdownContentProvider } from './preview/previewContentProvider';
import { MarkdownPreviewManager } from './preview/previewManager';
import { ContentSecurityPolicyArbiter, ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './preview/security';
import { githubSlugifier } from './slugify';
import { loadDefaultTelemetryReporter, TelemetryReporter } from './telemetryReporter';
import { VsCodeMdWorkspaceContents } from './workspaceContents';


export function activate(context: vscode.ExtensionContext) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const contributions = getMarkdownExtensionContributions(context);
	context.subscriptions.push(contributions);

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const engine = new MarkdownEngine(contributions, githubSlugifier);
	const logger = new Logger();

	const contentProvider = new MarkdownContentProvider(engine, context, cspArbiter, contributions, logger);
	const symbolProvider = new MdDocumentSymbolProvider(engine);
	const previewManager = new MarkdownPreviewManager(contentProvider, logger, contributions, engine);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(registerMarkdownLanguageFeatures(symbolProvider, engine));
	context.subscriptions.push(registerMarkdownCommands(previewManager, telemetryReporter, cspArbiter, engine));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		logger.updateConfiguration();
		previewManager.updateConfiguration();
	}));
}

function registerMarkdownLanguageFeatures(
	symbolProvider: MdDocumentSymbolProvider,
	engine: MarkdownEngine
): vscode.Disposable {
	const selector: vscode.DocumentSelector = { language: 'markdown', scheme: '*' };

	const linkProvider = new MdLinkProvider(engine);
	const workspaceContents = new VsCodeMdWorkspaceContents();

	const referencesProvider = new MdReferencesProvider(linkProvider, workspaceContents, engine, githubSlugifier);
	return vscode.Disposable.from(
		vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider),
		vscode.languages.registerDocumentLinkProvider(selector, linkProvider),
		vscode.languages.registerFoldingRangeProvider(selector, new MdFoldingProvider(engine)),
		vscode.languages.registerSelectionRangeProvider(selector, new MdSmartSelect(engine)),
		vscode.languages.registerWorkspaceSymbolProvider(new MdWorkspaceSymbolProvider(symbolProvider, workspaceContents)),
		vscode.languages.registerReferenceProvider(selector, referencesProvider),
		vscode.languages.registerRenameProvider(selector, new MdRenameProvider(referencesProvider, githubSlugifier)),
		MdPathCompletionProvider.register(selector, engine, linkProvider),
		registerDropIntoEditor(selector),
	);
}

function registerMarkdownCommands(
	previewManager: MarkdownPreviewManager,
	telemetryReporter: TelemetryReporter,
	cspArbiter: ContentSecurityPolicyArbiter,
	engine: MarkdownEngine
): vscode.Disposable {
	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, previewManager);

	const commandManager = new CommandManager();
	commandManager.register(new commands.ShowPreviewCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowLockedPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowSourceCommand(previewManager));
	commandManager.register(new commands.RefreshPreviewCommand(previewManager, engine));
	commandManager.register(new commands.MoveCursorToPositionCommand());
	commandManager.register(new commands.ShowPreviewSecuritySelectorCommand(previewSecuritySelector, previewManager));
	commandManager.register(new commands.OpenDocumentLinkCommand(engine));
	commandManager.register(new commands.ToggleLockCommand(previewManager));
	commandManager.register(new commands.RenderDocument(engine));
	commandManager.register(new commands.ReloadPlugins(previewManager, engine));
	return commandManager;
}

