/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from './commandManager';
import * as commands from './commands/index';
import { registerPasteSupport } from './languageFeatures/copyPaste';
import { registerDefinitionSupport } from './languageFeatures/definitionProvider';
import { registerDiagnosticSupport } from './languageFeatures/diagnostics';
import { MdLinkProvider, registerDocumentLinkSupport } from './languageFeatures/documentLinkProvider';
import { MdDocumentSymbolProvider, registerDocumentSymbolSupport } from './languageFeatures/documentSymbolProvider';
import { registerDropIntoEditorSupport } from './languageFeatures/dropIntoEditor';
import { registerFindFileReferenceSupport } from './languageFeatures/fileReferences';
import { registerFoldingSupport } from './languageFeatures/foldingProvider';
import { registerPathCompletionSupport } from './languageFeatures/pathCompletions';
import { MdReferencesProvider, registerReferencesSupport } from './languageFeatures/references';
import { registerRenameSupport } from './languageFeatures/rename';
import { registerSmartSelectSupport } from './languageFeatures/smartSelect';
import { registerWorkspaceSymbolSupport } from './languageFeatures/workspaceSymbolProvider';
import { Logger } from './logger';
import { MarkdownEngine } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { MarkdownContentProvider } from './preview/previewContentProvider';
import { MarkdownPreviewManager } from './preview/previewManager';
import { ContentSecurityPolicyArbiter, ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './preview/security';
import { githubSlugifier } from './slugify';
import { MdTableOfContentsProvider } from './tableOfContents';
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
	const previewManager = new MarkdownPreviewManager(contentProvider, logger, contributions, engine);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(registerMarkdownLanguageFeatures(commandManager, engine));
	context.subscriptions.push(registerMarkdownCommands(commandManager, previewManager, telemetryReporter, cspArbiter, engine));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		logger.updateConfiguration();
		previewManager.updateConfiguration();
	}));
}

function registerMarkdownLanguageFeatures(
	commandManager: CommandManager,
	engine: MarkdownEngine
): vscode.Disposable {
	const selector: vscode.DocumentSelector = { language: 'markdown', scheme: '*' };

	const workspaceContents = new VsCodeMdWorkspaceContents();

	const linkProvider = new MdLinkProvider(engine, workspaceContents);
	const tocProvider = new MdTableOfContentsProvider(engine, workspaceContents);
	const referencesProvider = new MdReferencesProvider(engine, workspaceContents, tocProvider);
	const symbolProvider = new MdDocumentSymbolProvider(tocProvider);

	return vscode.Disposable.from(
		workspaceContents,
		linkProvider,
		referencesProvider,
		tocProvider,

		// Language features
		registerDefinitionSupport(selector, referencesProvider),
		registerDiagnosticSupport(selector, engine, workspaceContents, linkProvider, commandManager, referencesProvider, tocProvider),
		registerDocumentLinkSupport(selector, linkProvider),
		registerDocumentSymbolSupport(selector, tocProvider),
		registerDropIntoEditorSupport(selector),
		registerFindFileReferenceSupport(commandManager, referencesProvider),
		registerFoldingSupport(selector, engine, tocProvider),
		registerPasteSupport(selector),
		registerPathCompletionSupport(selector, engine, linkProvider),
		registerReferencesSupport(selector, referencesProvider),
		registerRenameSupport(selector, workspaceContents, referencesProvider, engine.slugifier),
		registerSmartSelectSupport(selector, engine, tocProvider),
		registerWorkspaceSymbolSupport(workspaceContents, symbolProvider),
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
