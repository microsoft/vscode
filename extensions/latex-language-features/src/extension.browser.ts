/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LatexService } from './latexService';
import { CommandManager } from './commands/commandManager';
import { BuildCommand } from './commands/buildCommand';
import { PreviewCommand } from './commands/previewCommand';
import { CleanCommand } from './commands/cleanCommand';
import { SyncCommand } from './commands/syncCommand';
import { OutputChannelLogger } from './utils/logger';
import { PreviewManager } from './preview/previewManager';
import { LaTeXDocumentSymbolProvider } from './outline/documentSymbolProvider';
import { LaTeXCompletionProvider } from './completion/completionProvider';
import { initializeMacroCompleter } from './completion/completer/macro';
import { initializeEnvironmentCompleter } from './completion/completer/environment';
import { initializePackageCompleter } from './completion/completer/package';
import { LaTeXCodeActionProvider } from './codeActions/codeActionProvider';
import { registerMathHoverProvider, registerReferenceHoverProvider, registerGraphicsHoverProvider, registerTableHoverProvider } from './hover';
import { registerDefinitionProvider } from './definition';
import { registerFoldingProviders } from './folding';
import { registerEnvPairCommands } from './envPair';
import { registerSelectionRangeProvider } from './selection';
import { registerDuplicateLabelDetector } from './lint';
import { registerSectionCommands } from './section';
import { registerQuoteFixer } from './quoteFixer';
import { registerTextCommands } from './textCommands';
import { registerWordCountProvider } from './wordCount';
import { registerSmartEnterProvider } from './smartEnter';
import { registerBibTeXFormatter } from './bibtex';
import { registerCitationChecker } from './citations';
import { registerLaTeXFormatter } from './formatter';

let latexService: LatexService | undefined;
let commandManager: CommandManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const logger = new OutputChannelLogger('LaTeX');
	context.subscriptions.push(logger);

	// Initialize LaTeX service
	latexService = new LatexService(logger, context);
	const previewManager = new PreviewManager(context, logger);
	latexService.setPreviewManager(previewManager);
	context.subscriptions.push(latexService, previewManager);

	// Diagnostics provider is initialized inside LatexService

	// Initialize command manager
	commandManager = new CommandManager();
	context.subscriptions.push(commandManager);

	// Register commands
	commandManager.register(new BuildCommand(latexService, logger));
	commandManager.register(new PreviewCommand(latexService, logger));
	commandManager.register(new CleanCommand(latexService, logger));
	commandManager.register(new SyncCommand(latexService, logger));

	// Register document symbol provider for outline
	// In web, we need to support all schemes (vscode-vfs, etc.) not just file/untitled
	const latexSelector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' }
	];
	const documentSymbolProvider = new LaTeXDocumentSymbolProvider(logger);
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(latexSelector, documentSymbolProvider)
	);

	// Register code action provider for AI-powered quick fixes
	context.subscriptions.push(LaTeXCodeActionProvider.register(context));

	// Register math hover provider for equation preview
	registerMathHoverProvider(context);

	// Register reference hover provider for \ref, \eqref, etc.
	registerReferenceHoverProvider(context);

	// Register graphics hover provider for \includegraphics
	registerGraphicsHoverProvider(context);

	// Register table hover provider for tabular environments
	context.subscriptions.push(registerTableHoverProvider(context));

	// Register definition provider for "Go to Definition"
	context.subscriptions.push(registerDefinitionProvider(context));

	// Register folding providers for code folding
	const foldingDisposables = registerFoldingProviders(context);
	foldingDisposables.forEach(d => context.subscriptions.push(d));

	// Register environment pair commands (goto matching, select env, close env)
	const envPairDisposables = registerEnvPairCommands(context);
	envPairDisposables.forEach(d => context.subscriptions.push(d));

	// Register selection range provider for smart selection
	context.subscriptions.push(registerSelectionRangeProvider(context));

	// Register duplicate label detector
	const lintDisposables = registerDuplicateLabelDetector();
	lintDisposables.forEach(d => context.subscriptions.push(d));

	// Register section commands (promote, demote, select)
	const sectionDisposables = registerSectionCommands();
	sectionDisposables.forEach(d => context.subscriptions.push(d));

	// Register quote fixer command
	const quoteFixerDisposables = registerQuoteFixer();
	quoteFixerDisposables.forEach(d => context.subscriptions.push(d));

	// Register text commands (wrap env, surround, shortcuts)
	const textCommandsDisposables = registerTextCommands();
	textCommandsDisposables.forEach(d => context.subscriptions.push(d));

	// Register word count provider (status bar)
	const wordCountDisposables = registerWordCountProvider(context);
	wordCountDisposables.forEach(d => context.subscriptions.push(d));

	// Register smart enter key handler
	const smartEnterDisposables = registerSmartEnterProvider();
	smartEnterDisposables.forEach(d => context.subscriptions.push(d));

	// Register BibTeX formatter
	const bibtexDisposables = registerBibTeXFormatter();
	bibtexDisposables.forEach(d => context.subscriptions.push(d));

	// Register citation checker
	const citationDisposables = registerCitationChecker();
	citationDisposables.forEach(d => context.subscriptions.push(d));

	// Register LaTeX formatter
	const formatterDisposables = registerLaTeXFormatter();
	formatterDisposables.forEach(d => context.subscriptions.push(d));

	// Initialize completion
	// In browser, we need to wait for data to load before registering the provider
	const finalDataUri = context.extensionUri;

	// Initialize completers and wait for them to complete before registering provider
	try {
		await Promise.all([
			initializeMacroCompleter(finalDataUri)
				.catch(err => {
					logger.error(`Failed to initialize macro completer: ${err}`);
				}),
			initializeEnvironmentCompleter(finalDataUri)
				.catch(err => {
					logger.error(`Failed to initialize environment completer: ${err}`);
				}),
			initializePackageCompleter(finalDataUri)
				.catch(err => {
					logger.error(`Failed to initialize package completer: ${err}`);
				})
		]);
	} catch (error) {
		logger.error(`Error during completion initialization: ${error}`);
	}

	// Register completion provider AFTER data is loaded
	const completionProvider = new LaTeXCompletionProvider();
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			latexSelector,
			completionProvider,
			'\\',
			'{'
		)
	);

	// Register file watchers for auto-build
	const config = vscode.workspace.getConfiguration('latex');
	const autoBuild = config.get<string>('compilation.autoBuild', 'onSave');

	if (autoBuild !== 'never') {
		const watcher = vscode.workspace.createFileSystemWatcher('**/*.tex');
		context.subscriptions.push(watcher);

		if (autoBuild === 'onSave') {
			context.subscriptions.push(
				vscode.workspace.onDidSaveTextDocument(async (document) => {
					if (document.languageId === 'latex' || document.languageId === 'tex') {
						await latexService?.build(document.uri);
					}
				})
			);
		} else if (autoBuild === 'onFileChange') {
			watcher.onDidChange(async (uri) => {
				if (uri.fsPath.endsWith('.tex')) {
					await latexService?.build(uri);
				}
			});
		}
	}

	logger.info('LaTeX Language Features extension activated (browser)');
}

export function deactivate(): void {
	latexService?.dispose();
	commandManager?.dispose();
}

