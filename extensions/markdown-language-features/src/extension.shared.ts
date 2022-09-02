/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseLanguageClient } from 'vscode-languageclient';
import { CommandManager } from './commandManager';
import * as commands from './commands/index';
import { registerPasteSupport } from './languageFeatures/copyPaste';
import { registerDiagnosticSupport } from './languageFeatures/diagnostics';
import { registerDropIntoEditorSupport } from './languageFeatures/dropIntoEditor';
import { registerFindFileReferenceSupport } from './languageFeatures/fileReferences';
import { registerUpdateLinksOnRename } from './languageFeatures/linkUpdater';
import { ILogger } from './logging';
import { MarkdownItEngine, MdParsingProvider } from './markdownEngine';
import { MarkdownContributionProvider } from './markdownExtensions';
import { MdDocumentRenderer } from './preview/documentRenderer';
import { MarkdownPreviewManager } from './preview/previewManager';
import { ContentSecurityPolicyArbiter, ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './preview/security';
import { MdTableOfContentsProvider } from './tableOfContents';
import { loadDefaultTelemetryReporter, TelemetryReporter } from './telemetryReporter';
import { IMdWorkspace } from './workspace';

export function activateShared(
	context: vscode.ExtensionContext,
	client: BaseLanguageClient,
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

	context.subscriptions.push(registerMarkdownLanguageFeatures(client, commandManager));
	context.subscriptions.push(registerMarkdownCommands(commandManager, previewManager, telemetryReporter, cspArbiter, engine, tocProvider));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		previewManager.updateConfiguration();
	}));
}

function registerMarkdownLanguageFeatures(
	client: BaseLanguageClient,
	commandManager: CommandManager,
): vscode.Disposable {
	const selector: vscode.DocumentSelector = { language: 'markdown', scheme: '*' };
	return vscode.Disposable.from(
		// Language features
		registerDiagnosticSupport(selector, commandManager),
		registerDropIntoEditorSupport(selector),
		registerFindFileReferenceSupport(commandManager, client),
		registerPasteSupport(selector),
		registerUpdateLinksOnRename(client),
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
