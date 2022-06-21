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
import { MarkdownItEngine, IMdParser, MdParsingProvider } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { MarkdownContentProvider } from './preview/previewContentProvider';
import { MarkdownPreviewManager } from './preview/previewManager';
import { ContentSecurityPolicyArbiter, ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './preview/security';
import { githubSlugifier } from './slugify';
import { MdTableOfContentsProvider } from './tableOfContents';
import { loadDefaultTelemetryReporter, TelemetryReporter } from './telemetryReporter';
import { MdWorkspaceContents, VsCodeMdWorkspaceContents } from './workspaceContents';


export function activate(context: vscode.ExtensionContext) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const contributions = getMarkdownExtensionContributions(context);
	context.subscriptions.push(contributions);

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const logger = new Logger();
	const commandManager = new CommandManager();

	const engine = new MarkdownItEngine(contributions, githubSlugifier);
	const workspaceContents = new VsCodeMdWorkspaceContents();
	const parser = new MdParsingProvider(engine, workspaceContents);
	const tocProvider = new MdTableOfContentsProvider(parser, workspaceContents);
	context.subscriptions.push(workspaceContents, parser, tocProvider);

	const contentProvider = new MarkdownContentProvider(engine, context, cspArbiter, contributions, logger);
	const previewManager = new MarkdownPreviewManager(contentProvider, logger, contributions, tocProvider);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(registerMarkdownLanguageFeatures(parser, workspaceContents, commandManager, tocProvider));
	context.subscriptions.push(registerMarkdownCommands(commandManager, previewManager, telemetryReporter, cspArbiter, engine, tocProvider));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		logger.updateConfiguration();
		previewManager.updateConfiguration();
	}));
}

function registerMarkdownLanguageFeatures(
	parser: IMdParser,
	workspaceContents: MdWorkspaceContents,
	commandManager: CommandManager,
	tocProvider: MdTableOfContentsProvider,
): vscode.Disposable {
	const selector: vscode.DocumentSelector = { language: 'markdown', scheme: '*' };

	const linkProvider = new MdLinkProvider(parser, workspaceContents);
	const referencesProvider = new MdReferencesProvider(parser, workspaceContents, tocProvider);
	const symbolProvider = new MdDocumentSymbolProvider(tocProvider);

	return vscode.Disposable.from(
		linkProvider,
		referencesProvider,

		// Language features
		registerDefinitionSupport(selector, referencesProvider),
		registerDiagnosticSupport(selector, workspaceContents, linkProvider, commandManager, referencesProvider, tocProvider),
		registerDocumentLinkSupport(selector, linkProvider),
		registerDocumentSymbolSupport(selector, tocProvider),
		registerDropIntoEditorSupport(selector),
		registerFindFileReferenceSupport(commandManager, referencesProvider),
		registerFoldingSupport(selector, parser, tocProvider),
		registerPasteSupport(selector),
		registerPathCompletionSupport(selector, parser, linkProvider),
		registerReferencesSupport(selector, referencesProvider),
		registerRenameSupport(selector, workspaceContents, referencesProvider, parser.slugifier),
		registerSmartSelectSupport(selector, parser, tocProvider),
		registerWorkspaceSymbolSupport(workspaceContents, symbolProvider),
	);
}

function registerMarkdownCommands(
	commandManager: CommandManager,
	previewManager: MarkdownPreviewManager,
	telemetryReporter: TelemetryReporter,
	cspArbiter: ContentSecurityPolicyArbiter,
	engine: MarkdownItEngine,
	tocProvider: MdTableOfContentsProvider,
): vscode.Disposable {
	const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, previewManager);

	commandManager.register(new commands.ShowPreviewCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowLockedPreviewToSideCommand(previewManager, telemetryReporter));
	commandManager.register(new commands.ShowSourceCommand(previewManager));
	commandManager.register(new commands.RefreshPreviewCommand(previewManager, engine));
	commandManager.register(new commands.MoveCursorToPositionCommand());
	commandManager.register(new commands.ShowPreviewSecuritySelectorCommand(previewSecuritySelector, previewManager));
	commandManager.register(new commands.OpenDocumentLinkCommand(tocProvider));
	commandManager.register(new commands.ToggleLockCommand(previewManager));
	commandManager.register(new commands.RenderDocument(engine));
	commandManager.register(new commands.ReloadPlugins(previewManager, engine));
	return commandManager;
}
