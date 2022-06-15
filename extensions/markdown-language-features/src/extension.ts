/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from './commandManager';
import * as commands from './commands/index';
import { registerPasteProvider } from './languageFeatures/copyPaste';
import { MdDefinitionProvider } from './languageFeatures/definitionProvider';
import { register as registerDiagnostics } from './languageFeatures/diagnostics';
import { MdLinkComputer, registerDocumentLinkProvider } from './languageFeatures/documentLinkProvider';
import { MdDocumentSymbolProvider } from './languageFeatures/documentSymbolProvider';
import { registerDropIntoEditor } from './languageFeatures/dropIntoEditor';
import { registerFindFileReferences } from './languageFeatures/fileReferences';
import { MdFoldingProvider } from './languageFeatures/foldingProvider';
import { MdPathCompletionProvider } from './languageFeatures/pathCompletions';
import { MdReferencesComputer, registerReferencesProvider } from './languageFeatures/references';
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
	const commandManager = new CommandManager();

	const contentProvider = new MarkdownContentProvider(engine, context, cspArbiter, contributions, logger);
	const symbolProvider = new MdDocumentSymbolProvider(engine);
	const previewManager = new MarkdownPreviewManager(contentProvider, logger, contributions, engine);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(registerMarkdownLanguageFeatures(commandManager, symbolProvider, engine));
	context.subscriptions.push(registerMarkdownCommands(commandManager, previewManager, telemetryReporter, cspArbiter, engine));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		logger.updateConfiguration();
		previewManager.updateConfiguration();
	}));
}

function registerMarkdownLanguageFeatures(
	commandManager: CommandManager,
	symbolProvider: MdDocumentSymbolProvider,
	engine: MarkdownEngine
): vscode.Disposable {
	const selector: vscode.DocumentSelector = { language: 'markdown', scheme: '*' };

	const linkComputer = new MdLinkComputer(engine);
	const workspaceContents = new VsCodeMdWorkspaceContents();

	const referencesComputer = new MdReferencesComputer(linkComputer, workspaceContents, engine, githubSlugifier);
	return vscode.Disposable.from(
		workspaceContents,
		vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider),
		vscode.languages.registerFoldingRangeProvider(selector, new MdFoldingProvider(engine)),
		vscode.languages.registerSelectionRangeProvider(selector, new MdSmartSelect(engine)),
		vscode.languages.registerWorkspaceSymbolProvider(new MdWorkspaceSymbolProvider(symbolProvider, workspaceContents)),
		vscode.languages.registerRenameProvider(selector, new MdRenameProvider(referencesComputer, workspaceContents, githubSlugifier)),
		vscode.languages.registerDefinitionProvider(selector, new MdDefinitionProvider(referencesComputer)),
		MdPathCompletionProvider.register(selector, engine, linkComputer),
		registerDocumentLinkProvider(selector, linkComputer),
		registerDiagnostics(selector, engine, workspaceContents, linkComputer, commandManager, referencesComputer),
		registerDropIntoEditor(selector),
		registerReferencesProvider(selector, referencesComputer),
		registerPasteProvider(selector),
		registerFindFileReferences(commandManager, referencesComputer),
	);
}

function registerMarkdownCommands(
	commandManager: CommandManager,
	previewManager: MarkdownPreviewManager,
	telemetryReporter: TelemetryReporter,
	cspArbiter: ContentSecurityPolicyArbiter,
	engine: MarkdownEngine
): vscode.Disposable {
	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, previewManager);

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
