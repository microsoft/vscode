/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannelLogger } from '../utils/logger';
import { CompilationResult } from '../latexService';
import { HiddenCompilerWebview } from '../compiler/hiddenCompilerWebview';
import { RecipeManager } from './recipe';

/**
 * WebAssembly-based LaTeX compiler
 * Uses SwiftLaTeX via webview-based compilation
 * Compilation happens in webview context (browser), not extension host
 * Uses a hidden webview panel that persists throughout the session
 */
export class WasmLatexCompiler {
	private hiddenWebview: HiddenCompilerWebview | null = null;
	private context: vscode.ExtensionContext | null = null;
	private pendingCompilations = new Map<
		string,
		{
			resolve: (result: CompilationResult) => void;
			reject: (error: Error) => void;
			timeoutHandle?: ReturnType<typeof setTimeout>;
		}
	>();

	constructor(
		private readonly logger: OutputChannelLogger,
		context?: vscode.ExtensionContext
	) {
		this.context = context || null;
		if (context) {
			this.hiddenWebview = new HiddenCompilerWebview(context, logger);
		}
	}

	/**
	 * Set the extension context (creates hidden webview)
	 */
	setContext(context: vscode.ExtensionContext): void {
		this.context = context;
		if (!this.hiddenWebview) {
			this.hiddenWebview = new HiddenCompilerWebview(context, this.logger);
		}
	}

	async compile(uri: vscode.Uri, recipe: string): Promise<CompilationResult> {
		try {
			// Check if recipe is supported by WASM compiler
			// WASM compiler (SwiftLaTeX) primarily supports pdflatex
			// Complex recipes like latexmk with bibtex require server compiler
			if (!RecipeManager.isWasmSupported(recipe)) {
				this.logger.info(`Recipe "${recipe}" is not supported by WASM compiler. Use server compiler instead.`);
				return {
					success: false,
					error: `Recipe "${recipe}" is not supported by WASM compiler. Complex recipes (latexmk, xelatex, lualatex) require server-side compilation. Please use server compiler or set compilation.mode to "server".`
				};
			}

			// Check if SwiftLaTeX files are available
			if (this.context) {
				const wasmPath = vscode.Uri.joinPath(
					this.context.extensionUri,
					'vendors',
					'swiftlatex',
					'swiftlatexpdftex.wasm'
				);
				try {
					await vscode.workspace.fs.stat(wasmPath);
				} catch {
					return {
						success: false,
						error:
							'SwiftLaTeX WASM files not found. Please download SwiftLaTeX files to vendors/swiftlatex/ directory. ' +
							'See SETUP_SWIFTLATEX.md for instructions. ' +
							'Required files: PdfTeXEngine.js, swiftlatexpdftex.js, swiftlatexpdftex.wasm',
					};
				}
			}

			// Check context first
			if (!this.context) {
				this.logger.error('Extension context is not available');
				return {
					success: false,
					error:
						'Extension context is not available. The extension may not be properly activated. Please restart VS Code.',
				};
			}

			// Ensure hidden webview is available
			if (!this.hiddenWebview) {
				if (!this.context) {
					return {
						success: false,
						error:
							'Extension context is not available. The extension may not be properly activated. Please restart VS Code.',
					};
				}
				this.hiddenWebview = new HiddenCompilerWebview(this.context, this.logger);
			}

			this.logger.info('Waiting for hidden compiler webview to be available...');

			// Get the webview (it will wait for initialization if needed)
			try {
				await this.hiddenWebview.getWebview();
				this.logger.info('Hidden compiler webview is available');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.logger.error(`Failed to get webview: ${message}`);
				return {
					success: false,
					error:
						'LaTeX compiler webview is not available. The compiler may still be initializing. Please try again in a few seconds.',
				};
			}

			// Read the LaTeX source
			const document = await vscode.workspace.openTextDocument(uri);
			const latexSource = document.getText();

			// Get base name for main file
			const uriPath = uri.path;
			const lastSlash = uriPath.lastIndexOf('/');
			const fileName = lastSlash >= 0 ? uriPath.substring(lastSlash + 1) : uriPath;

			this.logger.info(`Compiling LaTeX with SwiftLaTeX: ${fileName}`);

			// Compile using webview
			return await this.compileInWebview(latexSource, fileName, uri);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`WASM compilation error: ${message}`);
			return {
				success: false,
				error: message,
			};
		}
	}

	private async compileInWebview(
		latexSource: string,
		mainFile: string,
		_uri: vscode.Uri
	): Promise<CompilationResult> {
		return new Promise((resolve, reject) => {
			const compilationId = `${Date.now()}-${Math.random()}`;

			// Store promise handlers
			this.pendingCompilations.set(compilationId, { resolve, reject });

			// Get webview from hidden webview
			if (!this.hiddenWebview) {
				reject(new Error('Hidden webview is not available'));
				return;
			}

			// Get the webview (should already be initialized)
			this.hiddenWebview.getWebview().then((webview) => {
				// Set up message listener (one-time)
				const messageListener = webview.onDidReceiveMessage(async (message: any) => {
					this.logger.info(
						`Received message from webview: ${message.type} (compilationId: ${message.compilationId})`
					);

					if (message.compilationId !== compilationId) {
						this.logger.warn(
							`Message compilationId mismatch: expected ${compilationId}, got ${message.compilationId}`
						);
						return; // Not for this compilation
					}

					switch (message.type) {
						case 'webviewReady':
							this.logger.info('Webview is ready');
							break;

						case 'compilationStarted':
							this.logger.info('Compilation started in webview');
							break;

						case 'compilationSuccess': {
							// Decode base64 PDF outside try block so it's available in catch
							const pdfBase64 = message.pdf;
							// Decode base64 - in Node.js extension host, we can use a simple base64 decoder
							// Convert base64 string to Uint8Array
							const binaryString = this.base64ToBinary(pdfBase64);
							const pdfBytes = new Uint8Array(binaryString.length);
							for (let i = 0; i < binaryString.length; i++) {
								pdfBytes[i] = binaryString.charCodeAt(i);
							}
							const logContent = message.log; // Store log content for use in catch block

							// PDF compilation successful - return PDF data without writing to file
							this.logger.info(`PDF compilation successful. Size: ${pdfBytes.length} bytes.`);

							const result: CompilationResult = {
								success: true,
								pdfData: pdfBytes, // PDF data for preview (no file written)
								logContent: logContent, // Include log content for build results view
							};

							const pending = this.pendingCompilations.get(compilationId);
							if (pending) {
								this.pendingCompilations.delete(compilationId);
								if (pending.timeoutHandle) {
									clearTimeout(pending.timeoutHandle);
								}
								pending.resolve(result);
							}
							messageListener.dispose();
							break;
						}

						case 'compilationError': {
							this.logger.error(`Compilation error: ${message.error}`);
							if (message.log) {
								this.logger.error(`Compilation log: ${message.log}`);
							}
							const pending = this.pendingCompilations.get(compilationId);
							if (pending) {
								this.pendingCompilations.delete(compilationId);
								if (pending.timeoutHandle) {
									clearTimeout(pending.timeoutHandle);
								}
								pending.resolve({
									success: false,
									error: message.error || 'Compilation failed',
									logContent: message.log, // Include log content for build results view
								});
							}
							messageListener.dispose();
							break;
						}

						case 'engineError': {
							this.logger.error(`Engine error: ${message.error}`);
							const pending2 = this.pendingCompilations.get(compilationId);
							if (pending2) {
								this.pendingCompilations.delete(compilationId);
								if (pending2.timeoutHandle) {
									clearTimeout(pending2.timeoutHandle);
								}
								pending2.resolve({
									success: false,
									error: `SwiftLaTeX engine error: ${message.error}`,
									logContent: message.log || undefined // Include log if available
								});
							}
							messageListener.dispose();
							break;
						}
					}
				});

				// Send compile message to webview
				this.logger.info(
					`Sending compile message to webview (compilationId: ${compilationId}, mainFile: ${mainFile})`
				);
				try {
					webview.postMessage({
						type: 'compile',
						compilationId,
						latexSource,
						mainFile,
					});
					this.logger.info('Compile message sent to webview');
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.logger.error(`Failed to send message to webview: ${message}`);
					messageListener.dispose();
					resolve({
						success: false,
						error: `Failed to communicate with webview: ${message}`,
					});
					return;
				}

				// Timeout after 60 seconds
				const timeoutHandle = setTimeout(() => {
					if (this.pendingCompilations.has(compilationId)) {
						this.pendingCompilations.delete(compilationId);
						messageListener.dispose();
						resolve({
							success: false,
							error: 'Compilation timeout (60s)',
						});
					}
				}, 60000);

				// Store timeout handle in pending compilation
				const pending = this.pendingCompilations.get(compilationId);
				if (pending) {
					pending.timeoutHandle = timeoutHandle;
				}
			}).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				this.logger.error(`Failed to get webview: ${message}`);
				reject(new Error(`Failed to get webview: ${message}`));
			});
		});
	}

	// Removed initializeWebview - now using CompilerViewProvider
	// Removed getWasmEmbeddingCodeTemplate - now handled by CompilerViewProvider
	// Removed getWebviewHtml - now handled by CompilerViewProvider
	// Removed downloadPdfFallback - PDFs are no longer written to disk

	private base64ToBinary(base64: string): string {
		// Simple base64 decoder for Node.js environment
		// In browser, we'd use atob, but in Node.js extension host we decode manually
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
		let output = '';

		base64 = base64.replace(/[^A-Za-z0-9\+\/]/g, '');

		for (let i = 0; i < base64.length; i += 4) {
			const enc1 = chars.indexOf(base64.charAt(i));
			const enc2 = chars.indexOf(base64.charAt(i + 1));
			const enc3 = chars.indexOf(base64.charAt(i + 2));
			const enc4 = chars.indexOf(base64.charAt(i + 3));

			const chr1 = (enc1 << 2) | (enc2 >> 4);
			const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
			const chr3 = ((enc3 & 3) << 6) | enc4;

			output += String.fromCharCode(chr1);

			if (enc3 !== 64) {
				output += String.fromCharCode(chr2);
			}
			if (enc4 !== 64) {
				output += String.fromCharCode(chr3);
			}
		}

		return output;
	}

	// Removed getNonce - now handled by CompilerViewProvider

	dispose(): void {
		this.pendingCompilations.clear();
		if (this.hiddenWebview) {
			this.hiddenWebview.dispose();
			this.hiddenWebview = null;
		}
	}
}
