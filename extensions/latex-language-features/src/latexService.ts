/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannelLogger } from './utils/logger';
import { WasmLatexCompiler } from './compilers/wasmCompiler';
import { ServerLatexCompiler } from './compilers/serverCompiler';
import { PreviewManager } from './preview/previewManager';
import { LaTeXDiagnosticsProvider } from './diagnostics/diagnosticsProvider';
import { RecipeManager } from './compilers/recipe';

export interface CompilationResult {
	success: boolean;
	error?: string;
	pdfPath?: string;
	pdfData?: Uint8Array; // PDF data for direct preview (from WASM compilation)
	logPath?: string;
	logContent?: string; // Add log content for diagnostics
	fallbackUsed?: boolean; // Indicates if fallback from WASM to server was used (for suppressing error notifications)
}

export class LatexService implements vscode.Disposable {
	private wasmCompiler: WasmLatexCompiler;
	private serverCompiler: ServerLatexCompiler;
	private previewManager: PreviewManager | undefined;
	private diagnosticsProvider: LaTeXDiagnosticsProvider | undefined;
	private disposables: vscode.Disposable[] = [];
	constructor(
		private readonly logger: OutputChannelLogger,
		context?: vscode.ExtensionContext
	) {
		this.wasmCompiler = new WasmLatexCompiler(logger, context);
		this.serverCompiler = new ServerLatexCompiler(logger);
		if (context) {
			this.diagnosticsProvider = new LaTeXDiagnosticsProvider(logger, context);
			this.disposables.push(this.diagnosticsProvider);
		}
	}

	setContext(context: vscode.ExtensionContext): void {
		// Recreate compiler with context
		this.wasmCompiler.dispose();
		this.wasmCompiler = new WasmLatexCompiler(this.logger, context);
	}

	setPreviewManager(previewManager: PreviewManager): void {
		this.previewManager = previewManager;
	}

	setDiagnosticsProvider(diagnosticsProvider: LaTeXDiagnosticsProvider): void {
		this.diagnosticsProvider = diagnosticsProvider;
	}

	async build(uri: vscode.Uri): Promise<CompilationResult> {
		const config = vscode.workspace.getConfiguration('latex');
		const mode = config.get<string>('compilation.mode', 'auto');
		const recipe = config.get<string>('compilation.recipe', 'pdflatex');

		this.logger.info(`Building with recipe: ${recipe}`);
		this.logger.info(`Compilation mode: ${mode}`);

		// Determine compilation strategy
		let result: CompilationResult;
		if (mode === 'wasm') {
			result = await this.buildWithWasm(uri, recipe);
		} else if (mode === 'server') {
			result = await this.buildWithServer(uri, recipe);
		} else {
			// Auto mode: try WASM first if recipe is supported, otherwise use server directly
			const isWeb = vscode.env.uiKind === vscode.UIKind.Web;
			const isWasmSupported = RecipeManager.isWasmSupported(recipe);

			if (isWasmSupported) {
				this.logger.info('Attempting WASM compilation...');
				const wasmResult = await this.buildWithWasm(uri, recipe);
				if (wasmResult.success) {
					result = wasmResult;
				} else {
					this.logger.warn(`WASM compilation failed: ${wasmResult.error || 'Unknown error'}`);
					if (isWeb) {
						// In web context, server compiler is not available
						// Return the WASM error with helpful message
						result = {
							success: false,
							error: `WASM compilation failed: ${wasmResult.error || 'Unknown error'}. ` +
								`In web context, only WASM compilation is supported. ` +
								`Check the Problems pane for detailed error information.`,
							logContent: wasmResult.logContent // Preserve log content for diagnostics
						};
					} else {
						this.logger.info('Falling back to server-side compilation...');
						const serverResult = await this.buildWithServer(uri, recipe);
						if (!serverResult.success) {
							result = serverResult;
						} else {
							result = serverResult;
							result.fallbackUsed = true;
						}
					}
				}
			} else {
				// Recipe not supported by WASM
				if (isWeb) {
					// In web context, we can't use server compiler
					// Suggest using pdflatex recipe instead
					this.logger.error(`Recipe "${recipe}" is not supported by WASM compiler. ` +
						`In web context, only WASM compilation is available. ` +
						`Please change the recipe to "pdflatex" (supported by WASM) or use Electron/desktop version for complex recipes.`);
					result = {
						success: false,
						error: `Recipe "${recipe}" is not supported in web context. ` +
							`Only "pdflatex" recipe is supported by WASM compiler. ` +
							`Please change latex.compilation.recipe to "pdflatex" or use Electron/desktop version for "${recipe}".`
					};
				} else {
					// Use server compiler directly
					this.logger.info(`Recipe "${recipe}" is not supported by WASM compiler, using server compiler directly.`);
					result = await this.buildWithServer(uri, recipe);
					if (result.success) {
						result.fallbackUsed = true;
					}
				}
			}
		}

		// Update diagnostics from compilation log if available
		// Always try to update diagnostics, even on failure, if logContent is available
		if (this.diagnosticsProvider) {
			try {
				const document = await vscode.workspace.openTextDocument(uri);
				if (result.logContent) {
					this.logger.info(`Updating diagnostics from log (length: ${result.logContent.length})`);
					this.diagnosticsProvider.updateFromLog(document, result.logContent);

					// Check if any diagnostics were created - if not, add a fallback error
					const existingDiagnostics = this.diagnosticsProvider.getDiagnostics(document.uri);
					this.logger.info(`Diagnostics after parsing: ${existingDiagnostics.length} found`);

					if (!result.success && existingDiagnostics.length === 0) {
						// No diagnostics from log parsing, add a general compilation error
						this.logger.warn('No diagnostics found in log, adding fallback error');
						this.diagnosticsProvider.addCompilationError(document, result.error || 'Compilation failed');
					} else if (existingDiagnostics.length > 0) {
						// Clear any previous fallback errors since we have real diagnostics
						this.logger.info(`Found ${existingDiagnostics.length} diagnostics from log parsing`);
					}
				} else if (!result.success) {
					// Compilation failed but no log content - add error diagnostic
					this.logger.warn('Compilation failed but no log content available');
					this.diagnosticsProvider.addCompilationError(document, result.error || 'Compilation failed');
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.logger.error(`Failed to update diagnostics from log: ${message}`);
				if (error instanceof Error && error.stack) {
					this.logger.error(`Stack: ${error.stack}`);
				}
			}
		}

		// Also try to read log file directly for server compilation (if not already processed)
		if (this.diagnosticsProvider && mode !== 'wasm' && !result.logContent) {
			// Try to read log file directly for server compilation
			try {
				const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
				if (workspaceFolder) {
					const uriPath = uri.path;
					const lastSlash = uriPath.lastIndexOf('/');
					const fileName = lastSlash >= 0 ? uriPath.substring(lastSlash + 1) : uriPath;
					const lastDot = fileName.lastIndexOf('.');
					const baseName = lastDot >= 0 ? fileName.substring(0, lastDot) : fileName;
					const logUri = vscode.Uri.joinPath(workspaceFolder.uri, baseName + '.log');

					try {
						const logBytes = await vscode.workspace.fs.readFile(logUri);
						const logContent = new TextDecoder('utf-8').decode(logBytes);
						const document = await vscode.workspace.openTextDocument(uri);
						this.diagnosticsProvider.updateFromLog(document, logContent);
					} catch {
						// Log file might not exist, which is okay
					}
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.logger.warn(`Failed to read log file for diagnostics: ${message}`);
			}
		}

		return result;
	}

	private async buildWithWasm(uri: vscode.Uri, recipe: string): Promise<CompilationResult> {
		try {
			return await this.wasmCompiler.compile(uri, recipe);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`WASM compilation error: ${message}`);
			return {
				success: false,
				error: `WASM compilation failed: ${message}`
			};
		}
	}

	private async buildWithServer(uri: vscode.Uri, recipe: string): Promise<CompilationResult> {
		try {
			return await this.serverCompiler.compile(uri, recipe);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Server compilation error: ${message}`);
			return {
				success: false,
				error: `Server compilation failed: ${message}`
			};
		}
	}

	async preview(uri: vscode.Uri, position?: vscode.Position): Promise<void> {
		const config = vscode.workspace.getConfiguration('latex');
		const viewer = config.get<string>('preview.viewer', 'tab');

		// First ensure the document is built
		const buildResult = await this.build(uri);
		if (!buildResult.success || (!buildResult.pdfPath && !buildResult.pdfData)) {
			const errorMsg = buildResult.error || 'Unknown error';
			throw new Error(`Cannot preview: compilation failed - ${errorMsg}`);
		}

		if (viewer === 'tab') {
			if (!this.previewManager) {
				throw new Error('Preview manager not initialized');
			}
			// Pass PDF data directly if available (from WASM compilation)
			const pdfPath = buildResult.pdfPath ?? '';
			await this.previewManager.showPreview(uri, pdfPath, buildResult.pdfData, position);
		} else {
			// External viewer
			if (!buildResult.pdfPath) {
				throw new Error('Cannot open external viewer: no PDF path available');
			}
			const pdfUri = typeof buildResult.pdfPath === 'string'
				? vscode.Uri.file(buildResult.pdfPath)
				: vscode.Uri.parse(buildResult.pdfPath);
			await vscode.commands.executeCommand('vscode.open', pdfUri);
		}
	}

	async clean(uri: vscode.Uri): Promise<void> {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!workspaceFolder) {
			throw new Error('No workspace folder found');
		}

		// Get base name and directory from URI
		const uriPath = uri.path;
		const lastSlash = uriPath.lastIndexOf('/');
		const dirPath = lastSlash >= 0 ? uriPath.substring(0, lastSlash) : '';
		const fileName = lastSlash >= 0 ? uriPath.substring(lastSlash + 1) : uriPath;
		const lastDot = fileName.lastIndexOf('.');
		const baseName = lastDot >= 0 ? fileName.substring(0, lastDot) : fileName;

		// LaTeX auxiliary files to clean
		const extensions = [
			'.aux', '.log', '.out', '.toc', '.lof', '.lot',
			'.fls', '.fdb_latexmk', '.synctex.gz', '.bbl', '.blg',
			'.nav', '.snm', '.vrb', '.bcf', '.run.xml'
		];

		let cleanedCount = 0;
		for (const ext of extensions) {
			const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, dirPath, baseName + ext);
			try {
				await vscode.workspace.fs.delete(fileUri, { useTrash: false });
				cleanedCount++;
				this.logger.info(`Deleted: ${baseName}${ext}`);
			} catch (error) {
				// File might not exist, which is fine
				const errorObj = error as { code?: string };
				if (errorObj.code !== 'FileNotFound') {
					this.logger.warn(`Failed to delete ${baseName}${ext}: ${error}`);
				}
			}
		}

		// Clean PDF if it exists
		const pdfUri = vscode.Uri.joinPath(workspaceFolder.uri, dirPath, baseName + '.pdf');
		try {
			await vscode.workspace.fs.delete(pdfUri, { useTrash: false });
			cleanedCount++;
			this.logger.info(`Deleted: ${baseName}.pdf`);
		} catch (error) {
			const errorObj = error as { code?: string };
			if (errorObj.code !== 'FileNotFound') {
				this.logger.warn(`Failed to delete ${baseName}.pdf: ${error}`);
			}
		}

		this.logger.info(`Cleaned ${cleanedCount} file(s)`);
	}

	async syncFromSource(uri: vscode.Uri, position: vscode.Position): Promise<void> {
		// SyncTeX: Sync from source to PDF
		// Open preview and sync to position
		await this.preview(uri, position);
		this.logger.info(`SyncTeX: Syncing from source position ${position.line}:${position.character}`);

		// If preview is already open, send sync message
		if (this.previewManager) {
			await this.previewManager.syncFromSource(uri, position);
		}
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.wasmCompiler.dispose();
		this.serverCompiler.dispose();
		this.previewManager?.dispose();
		this.diagnosticsProvider?.dispose();
	}
}

