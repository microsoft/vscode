/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from './commandManager';
import * as commands from './commands/index';
import { registerPasteSupport } from './languageFeatures/copyPaste';
import { registerDefinitionSupport } from './languageFeatures/definitions';
import { registerDiagnosticSupport } from './languageFeatures/diagnostics';
import { MdLinkProvider, registerDocumentLinkSupport } from './languageFeatures/documentLinks';
import { MdDocumentSymbolProvider } from './languageFeatures/documentSymbols';
import { registerDropIntoEditorSupport } from './languageFeatures/dropIntoEditor';
import { registerFindFileReferenceSupport } from './languageFeatures/fileReferences';
import { registerPathCompletionSupport } from './languageFeatures/pathCompletions';
import { MdReferencesProvider, registerReferencesSupport } from './languageFeatures/references';
import { registerRenameSupport } from './languageFeatures/rename';
import { registerWorkspaceSymbolSupport } from './languageFeatures/workspaceSymbols';
import { ILogger } from './logging';
import { IMdParser, MarkdownItEngine, MdParsingProvider } from './markdownEngine';
import { MarkdownContributionProvider } from './markdownExtensions';
import { MdDocumentRenderer } from './preview/documentRenderer';
import { MarkdownPreviewManager } from './preview/previewManager';
import { ContentSecurityPolicyArbiter, ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './preview/security';
import { MdTableOfContentsProvider } from './tableOfContents';
import { loadDefaultTelemetryReporter, TelemetryReporter } from './telemetryReporter';
import { IMdWorkspace } from './workspace';

export function activateShared(
	context: vscode.ExtensionContext,
	workspace: IMdWorkspace,
	engine: MarkdownItEngine,
	logger: ILogger,
	contributions: MarkdownContributionProvider,
) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const commandManager = new CommandManager();

	const parser = new MdParsingProvider(engine, workspace);
	const tocProvider = new MdTableOfContentsProvider(parser, workspace, logger);
	context.subscriptions.push(parser, tocProvider);

	const contentProvider = new MdDocumentRenderer(engine, context, cspArbiter, contributions, logger);
	const previewManager = new MarkdownPreviewManager(contentProvider, workspace, logger, contributions, tocProvider);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(registerMarkdownLanguageFeatures(parser, workspace, commandManager, tocProvider, logger));
	context.subscriptions.push(registerMarkdownCommands(commandManager, previewManager, telemetryReporter, cspArbiter, engine, tocProvider));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		previewManager.updateConfiguration();
	}));
}

function registerMarkdownLanguageFeatures(
	parser: IMdParser,
	workspace: IMdWorkspace,
	commandManager: CommandManager,
	tocProvider: MdTableOfContentsProvider,
	logger: ILogger,
): vscode.Disposable {
	const selector: vscode.DocumentSelector = { language: 'markdown', scheme: '*' };

	const linkProvider = new MdLinkProvider(parser, workspace, logger);
	const referencesProvider = new MdReferencesProvider(parser, workspace, tocProvider, logger);
	const symbolProvider = new MdDocumentSymbolProvider(tocProvider, logger);

	return vscode.Disposable.from(
		linkProvider,
		referencesProvider,

		// Language features
		registerDefinitionSupport(selector, referencesProvider),
		registerDiagnosticSupport(selector, workspace, linkProvider, commandManager, referencesProvider, tocProvider, logger),
		registerDocumentLinkSupport(selector, linkProvider),
		registerDropIntoEditorSupport(selector),
		registerFindFileReferenceSupport(commandManager, referencesProvider),
		registerPasteSupport(selector),
		registerPathCompletionSupport(selector, workspace, parser, linkProvider),
		registerReferencesSupport(selector, referencesProvider),
		registerRenameSupport(selector, workspace, referencesProvider, parser.slugifier),
		registerWorkspaceSymbolSupport(workspace, symbolProvider),
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
