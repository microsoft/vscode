/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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
	const previewManager = new PreviewManager(logger);
	latexService.setPreviewManager(previewManager);
	context.subscriptions.push(latexService);
	context.subscriptions.push(previewManager);

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
	// Support all schemes (file, untitled, vscode-vfs, vscode-remote, etc.)
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
	logger.info('LaTeX Code Action Provider registered for AI-powered fixes');

	// Register math hover provider for equation preview
	registerMathHoverProvider(context);
	logger.info('Math Hover Provider registered for equation preview');

	// Register reference hover provider for \ref, \eqref, etc.
	registerReferenceHoverProvider(context);
	logger.info('Reference Hover Provider registered for reference preview');

	// Register graphics hover provider for \includegraphics
	registerGraphicsHoverProvider(context);
	logger.info('Graphics Hover Provider registered for image preview');

	// Register table hover provider for tabular environments
	context.subscriptions.push(registerTableHoverProvider(context));
	logger.info('Table Hover Provider registered for table preview');

	// Register definition provider for "Go to Definition"
	context.subscriptions.push(registerDefinitionProvider(context));
	logger.info('LaTeX Definition Provider registered for Go to Definition');

	// Register folding providers for code folding
	const foldingDisposables = registerFoldingProviders(context);
	foldingDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Folding Providers registered for code folding');

	// Register environment pair commands (goto matching, select env, close env)
	const envPairDisposables = registerEnvPairCommands(context);
	envPairDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Environment Pair Commands registered');

	// Register selection range provider for smart selection
	context.subscriptions.push(registerSelectionRangeProvider(context));
	logger.info('LaTeX Selection Range Provider registered');

	// Register duplicate label detector
	const lintDisposables = registerDuplicateLabelDetector();
	lintDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Duplicate Label Detector registered');

	// Register section commands (promote, demote, select)
	const sectionDisposables = registerSectionCommands();
	sectionDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Section Commands registered');

	// Register quote fixer command
	const quoteFixerDisposables = registerQuoteFixer();
	quoteFixerDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Quote Fixer registered');

	// Register text commands (wrap env, surround, shortcuts)
	const textCommandsDisposables = registerTextCommands();
	textCommandsDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Text Commands registered');

	// Register word count provider (status bar)
	const wordCountDisposables = registerWordCountProvider(context);
	wordCountDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Word Count Provider registered');

	// Register smart enter key handler
	const smartEnterDisposables = registerSmartEnterProvider();
	smartEnterDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Smart Enter Provider registered');

	// Register BibTeX formatter
	const bibtexDisposables = registerBibTeXFormatter();
	bibtexDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('BibTeX Formatter registered');

	// Register citation checker
	const citationDisposables = registerCitationChecker();
	citationDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('Citation Checker registered');

	// Register LaTeX formatter
	const formatterDisposables = registerLaTeXFormatter();
	formatterDisposables.forEach(d => context.subscriptions.push(d));
	logger.info('LaTeX Formatter registered');

	// Initialize completion
	// Try to load data from latex-workshop extension if available, otherwise use local data
	const latexWorkshopPath = path.join(context.extensionPath, '..', '..', 'resources', 'extensions', 'latex-workshop', 'extension');
	const dataPath = fs.existsSync(latexWorkshopPath) ? latexWorkshopPath : context.extensionPath;
	const dataUri = vscode.Uri.file(dataPath);
	// Initialize completers asynchronously
	initializeMacroCompleter(dataUri)
		.catch(err => {
			logger.error(`Failed to initialize macro completer: ${err}`);
		});
	initializeEnvironmentCompleter(dataUri)
		.catch(err => {
			logger.error(`Failed to initialize environment completer: ${err}`);
		});
	initializePackageCompleter(dataUri)
		.catch(err => {
			logger.error(`Failed to initialize package completer: ${err}`);
		});

	// Register completion provider
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

	logger.info('LaTeX Language Features extension activated');
}

export function deactivate(): void {
	latexService?.dispose();
	commandManager?.dispose();
}

