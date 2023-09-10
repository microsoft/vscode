/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MdLanguageClient } from './client/client';
import { CommandManager } from './commandManager';
import { registerMarkdownCommands } from './commands/index';
import { registerPasteSupport } from './languageFeatures/copyFiles/pasteResourceProvider';
import { registerLinkPasteSupport } from './languageFeatures/copyFiles/pasteUrlProvider';
import { registerDiagnosticSupport } from './languageFeatures/diagnostics';
import { registerDropIntoEditorSupport } from './languageFeatures/copyFiles/dropResourceProvider';
import { registerFindFileReferenceSupport } from './languageFeatures/fileReferences';
import { registerUpdateLinksOnRename } from './languageFeatures/linkUpdater';
import { ILogger } from './logging';
import { MarkdownItEngine } from './markdownEngine';
import { MarkdownContributionProvider } from './markdownExtensions';
import { MdDocumentRenderer } from './preview/documentRenderer';
import { MarkdownPreviewManager } from './preview/previewManager';
import { ExtensionContentSecurityPolicyArbiter } from './preview/security';
import { loadDefaultTelemetryReporter } from './telemetryReporter';
import { MdLinkOpener } from './util/openDocumentLink';

export function activateShared(
	context: vscode.ExtensionContext,
	client: MdLanguageClient,
	engine: MarkdownItEngine,
	logger: ILogger,
	contributions: MarkdownContributionProvider,
) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const commandManager = new CommandManager();

	const opener = new MdLinkOpener(client);

	const contentProvider = new MdDocumentRenderer(engine, context, cspArbiter, contributions, logger);
	const previewManager = new MarkdownPreviewManager(contentProvider, logger, contributions, opener);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(registerMarkdownLanguageFeatures(client, commandManager));
	context.subscriptions.push(registerMarkdownCommands(commandManager, previewManager, telemetryReporter, cspArbiter, engine));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		previewManager.updateConfiguration();
	}));
}

function registerMarkdownLanguageFeatures(
	client: MdLanguageClient,
	commandManager: CommandManager,
): vscode.Disposable {
	const selector: vscode.DocumentSelector = { language: 'markdown', scheme: '*' };
	return vscode.Disposable.from(
		// Language features
		registerDiagnosticSupport(selector, commandManager),
		registerDropIntoEditorSupport(selector),
		registerFindFileReferenceSupport(commandManager, client),
		registerPasteSupport(selector),
		registerLinkPasteSupport(selector),
		registerUpdateLinksOnRename(client),
	);
}

