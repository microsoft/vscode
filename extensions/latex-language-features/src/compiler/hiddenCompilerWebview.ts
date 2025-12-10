/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannelLogger } from '../utils/logger';
import { getCompileWebviewScript } from '../webview/compileWebview';

/**
 * Manages a hidden webview panel for LaTeX compilation
 * The panel is never shown to the user but persists throughout the session
 * Uses retainContextWhenHidden to keep the webview alive even when not visible
 */
export class HiddenCompilerWebview implements vscode.Disposable {
	private static readonly viewType = 'latexCompilerHidden';
	private panel: vscode.WebviewPanel | undefined;
	private isInitialized = false;
	private initializationPromise: Promise<void> | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly logger: OutputChannelLogger
	) {
		// Don't create panel immediately - create on demand to avoid showing it
		// Panel will be created when getWebview() is first called
	}

	private createPanel(): void {
		if (this.panel) {
			return; // Already created
		}

		this.logger.info('Creating hidden compiler webview panel');

		// Create panel in the least intrusive column (furthest right)
		// Use preserveFocus to avoid stealing focus
		const targetColumn = vscode.ViewColumn.Three || vscode.ViewColumn.Beside || vscode.ViewColumn.Active;

		this.panel = vscode.window.createWebviewPanel(
			HiddenCompilerWebview.viewType,
			'LaTeX Compiler', // Minimal title
			{
				viewColumn: targetColumn,
				preserveFocus: true // Don't steal focus from active editor
			},
			{
				enableScripts: true,
				retainContextWhenHidden: true, // Keep webview alive even when hidden
				localResourceRoots: [
					this.context.extensionUri,
					vscode.Uri.joinPath(this.context.extensionUri, 'vendors'),
				],
			}
		);

		// Immediately try to refocus the active editor to hide the panel
		// Use a small delay to ensure panel is created first
		setTimeout(() => {
			if (this.panel) {
				try {
					// Refocus the active editor to hide the webview panel
					const activeEditor = vscode.window.activeTextEditor;
					if (activeEditor) {
						vscode.window.showTextDocument(activeEditor.document, activeEditor.viewColumn, false);
						this.logger.info('Hidden compiler webview panel created, refocused active editor');
					}
				} catch (error) {
					this.logger.warn(`Could not refocus editor: ${error}`);
				}
			}
		}, 100);

		// Monitor view state and try to keep panel hidden
		this.panel.onDidChangeViewState(
			(e) => {
				// If panel becomes visible, try to hide it by refocusing the active editor
				if (e.webviewPanel.visible && !e.webviewPanel.active) {
					// Panel is visible but not active - try to refocus active editor
					const activeEditor = vscode.window.activeTextEditor;
					if (activeEditor) {
						// Refocus the active editor to hide the webview
						vscode.window.showTextDocument(activeEditor.document, activeEditor.viewColumn, false);
					}
				}
			},
			null,
			this.context.subscriptions
		);

		// Handle disposal - don't recreate automatically to avoid loops
		this.panel.onDidDispose(
			() => {
				this.logger.info('Hidden compiler webview panel disposed');
				this.panel = undefined;
				this.isInitialized = false;
				this.initializationPromise = undefined;
				// Don't auto-recreate - will be created on demand when needed
			},
			null,
			this.context.subscriptions
		);

		// Set HTML
		this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

		// Handle messages
		this.panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.type) {
					case 'webviewReady':
						this.isInitialized = true;
						this.logger.info('Hidden compiler webview initialized');
						break;
					case 'engineReady':
						this.logger.info('LaTeX engine ready in hidden webview');
						break;
					case 'engineError':
						this.logger.error(`Engine error: ${message.error}`);
						break;
				}
			},
			null,
			this.context.subscriptions
		);

		// Initialize
		this.initializeWebview();
	}

	private initializeWebview(): void {
		if (!this.panel) {
			return;
		}

		try {
			this.panel.webview.postMessage({
				type: 'initialize',
			});
			this.logger.info(
				'Sent initialization message to hidden compiler webview'
			);
		} catch (error) {
			this.logger.warn(`Failed to send initialization message: ${error}`);
		}
	}

	/**
	 * Get the webview, ensuring it's initialized
	 */
	public async getWebview(): Promise<vscode.Webview> {
		// Create panel if it doesn't exist
		if (!this.panel) {
			this.createPanel();
			// Wait a bit for panel to be created
			await new Promise((resolve) => setTimeout(resolve, 200));
		}

		if (!this.panel) {
			throw new Error('Webview panel not available');
		}

		// Wait for initialization
		if (!this.initializationPromise) {
			this.initializationPromise = this.waitForInitialization();
		}

		await this.initializationPromise;

		if (!this.panel) {
			throw new Error('Webview panel not available');
		}

		return this.panel.webview;
	}

	private async waitForInitialization(): Promise<void> {
		let attempts = 0;
		const maxAttempts = 150; // 15 seconds
		while (attempts < maxAttempts) {
			if (this.isInitialized && this.panel) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
			attempts++;
		}
		if (!this.isInitialized) {
			this.logger.warn(
				'Hidden compiler webview did not initialize within timeout'
			);
		}
	}

	/**
	 * Check if webview is ready
	 */
	public isReady(): boolean {
		return this.panel !== undefined && this.isInitialized;
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const wasmUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'vendors',
				'swiftlatex',
				'swiftlatexpdftex.wasm'
			)
		);
		const workerScriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'vendors',
				'swiftlatex',
				'swiftlatexpdftex.js'
			)
		);
		const pdfTexEngineUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'vendors',
				'swiftlatex',
				'PdfTeXEngine.js'
			)
		);

		const nonce = this.getNonce();
		const cspSource = webview.cspSource;
		const wasmEmbeddingCodeTemplate = this.getWasmEmbeddingCodeTemplate();
		const compileWebviewScript = getCompileWebviewScript();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${cspSource}; style-src ${cspSource} 'unsafe-inline'; connect-src data: ${cspSource} https:; worker-src blob: ${cspSource}; child-src blob:;">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>LaTeX Compiler</title>
</head>
<body>
	<div style="display: none;">Hidden LaTeX Compiler</div>
	
	<script nonce="${nonce}">
		window.SWIFTLATEX_WORKER_PATH = '';
		window.SWIFTLATEX_WASM_PATH = '';
		window.SWIFTLATEX_ENGINE_LOADED = false;
		window.SWIFTLATEX_ENGINE_LOADED_CALLBACK = null;
	</script>
	
	<script nonce="${nonce}">
		(async function() {
			try {
				const wasmResponse = await fetch("${wasmUri}");
				const wasmArrayBuffer = await wasmResponse.arrayBuffer();
				const wasmBytes = new Uint8Array(wasmArrayBuffer);
				let wasmBase64 = '';
				for (let i = 0; i < wasmBytes.length; i++) {
					wasmBase64 += String.fromCharCode(wasmBytes[i]);
				}
				wasmBase64 = btoa(wasmBase64);
				
				const workerResponse = await fetch("${workerScriptUri}");
				let workerScriptContent = await workerResponse.text();
				
				const wasmEmbedCodeTemplate = ${JSON.stringify(wasmEmbeddingCodeTemplate)};
				const wasmEmbedCode = wasmEmbedCodeTemplate.replace(
					'WASM_BASE64_PLACEHOLDER',
					JSON.stringify(wasmBase64)
				);
				workerScriptContent = wasmEmbedCode + '\\n\\n' + workerScriptContent;
				
				const blob = new Blob([workerScriptContent], { type: 'application/javascript' });
				const workerBlobUrl = URL.createObjectURL(blob);
				window.SWIFTLATEX_WORKER_PATH = workerBlobUrl;
			} catch (error) {
				console.error('Failed to create worker with embedded WASM:', error);
				window.SWIFTLATEX_WORKER_PATH = "${workerScriptUri}";
			}
			window.SWIFTLATEX_WASM_PATH = "${wasmUri}";
			
			// Load PdfTeXEngine after worker path is ready
			const script = document.createElement('script');
			script.nonce = '${nonce}';
			script.src = "${pdfTexEngineUri}";
			script.onload = function() {
				// Patch PdfTeXEngine to use our blob URL for the worker
				if (typeof PdfTeXEngine !== 'undefined') {
					const originalLoadEngine = PdfTeXEngine.prototype.loadEngine;
					PdfTeXEngine.prototype.loadEngine = function() {
						if (this.latexWorker !== undefined) {
							throw new Error('Other instance is running, abort()');
						}
						this.latexWorkerStatus = 1; // EngineStatus.Init = 1
						return new Promise((resolve, reject) => {
							// Use blob URL if available, otherwise fall back to default path
							const workerPath = window.SWIFTLATEX_WORKER_PATH || '/swiftlatex/swiftlatexpdftex.js';
							
							// Add timeout for worker initialization (10 seconds)
							const timeout = setTimeout(() => {
								if (this.latexWorkerStatus !== 2) { // EngineStatus.Ready = 2
									this.latexWorkerStatus = 4; // EngineStatus.Error
									reject(new Error('Worker initialization timeout: worker did not send "ok" message'));
								}
							}, 10000);
							
							try {
								this.latexWorker = new Worker(workerPath);
								
								this.latexWorker.onmessage = (ev) => {
									const data = ev.data;
									const cmd = data.result;
									if (cmd === 'ok') {
										clearTimeout(timeout);
										this.latexWorkerStatus = 2; // EngineStatus.Ready = 2
										resolve();
									} else {
										clearTimeout(timeout);
										this.latexWorkerStatus = 4; // EngineStatus.Error
										reject(new Error('Worker initialization failed: ' + (data.error || JSON.stringify(data))));
									}
								};
								
								this.latexWorker.onerror = (error) => {
									clearTimeout(timeout);
									console.error('Worker error event:', error);
									console.error('Worker error details:', {
										message: error.message,
										filename: error.filename,
										lineno: error.lineno,
										colno: error.colno
									});
									this.latexWorkerStatus = 4; // EngineStatus.Error
									reject(new Error('Worker failed to load: ' + (error.message || 'Unknown error')));
								};
								
								// Also listen for unhandled errors
								this.latexWorker.addEventListener('error', (error) => {
									console.error('Worker unhandled error:', error);
								});
							} catch (error) {
								clearTimeout(timeout);
								console.error('Failed to create worker:', error);
								this.latexWorkerStatus = 4; // EngineStatus.Error
								reject(new Error('Failed to create worker: ' + (error.message || 'Unknown error')));
							}
						}).then(() => {
							this.latexWorker.onmessage = function(_) {};
							this.latexWorker.onerror = function(_) {};
						});
					};
				}
				window.SWIFTLATEX_ENGINE_LOADED = true;
				if (window.SWIFTLATEX_ENGINE_LOADED_CALLBACK) {
					window.SWIFTLATEX_ENGINE_LOADED_CALLBACK();
				}
			};
			document.head.appendChild(script);
		})();
	</script>
	
	<script nonce="${nonce}">
		${compileWebviewScript.replace(/<\/script>/gi, '<\\/script>')}
	</script>
</body>
</html>`;
	}

	private getWasmEmbeddingCodeTemplate(): string {
		return `
(function() {
	try {
		const EMBEDDED_WASM_BASE64 = WASM_BASE64_PLACEHOLDER;
		const binaryString = atob(EMBEDDED_WASM_BASE64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		const EMBEDDED_WASM_BINARY = bytes.buffer;

		const originalFetch = self.fetch || fetch;
		self.fetch = function(input, init) {
			const url = typeof input === 'string' ? input : input.url;
			if (url && (url.includes('swiftlatexpdftex.wasm') || url.endsWith('.wasm'))) {
				return Promise.resolve(new Response(EMBEDDED_WASM_BINARY, {
					headers: { 'Content-Type': 'application/wasm' }
				}));
			}
			return originalFetch.apply(this, arguments);
		};

		if (typeof Module === 'undefined') {
			var Module = {};
		}

		Module.wasmBinary = EMBEDDED_WASM_BINARY;

		Module.instantiateWasm = function(info, receiveInstance) {
			return WebAssembly.instantiate(EMBEDDED_WASM_BINARY, info).then(function(result) {
				receiveInstance(result.instance, result.module);
				return {};
			}).catch(function(error) {
				console.error('Failed to instantiate embedded WASM:', error);
				throw error;
			});
		};
	} catch (error) {
		console.error('Failed to set up WASM embedding:', error);
	}
})();
`.trim();
	}

	private getNonce(): string {
		let text = '';
		const possible =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	public dispose(): void {
		if (this.panel) {
			this.panel.dispose();
			this.panel = undefined;
		}
		this.isInitialized = false;
		this.initializationPromise = undefined;
	}
}
