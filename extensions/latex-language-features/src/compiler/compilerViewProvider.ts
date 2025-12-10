/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannelLogger } from '../utils/logger';
import { getCompileWebviewScript } from '../webview/compileWebview';

/**
 * Provides a webview view in the LaTeX sidebar for compilation
 * This replaces the separate webview panel with a persistent sidebar view
 */
export class CompilerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'latexCompiler';

	private _view?: vscode.WebviewView;
	private isInitialized = false;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly logger: OutputChannelLogger
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this._view = webviewView;
		this.logger.info('Compiler view resolved');

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this.context.extensionUri,
				vscode.Uri.joinPath(this.context.extensionUri, 'vendors'),
			],
		};

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
		this.logger.info('Compiler view HTML set');

		// Handle messages from webview
		webviewView.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.type) {
					case 'webviewReady':
						this.isInitialized = true;
						this.logger.info('Compiler webview initialized');
						break;
					case 'engineReady':
						this.logger.info('LaTeX engine ready in compiler view');
						break;
					case 'engineError':
						this.logger.error(`Engine error: ${message.error}`);
						break;
					case 'compileRequest': {
						// Forward to LaTeX service
						const activeEditor = vscode.window.activeTextEditor;
						if (
							activeEditor &&
							(activeEditor.document.languageId === 'latex' ||
								activeEditor.document.languageId === 'tex')
						) {
							vscode.commands.executeCommand('latex.build');
						} else {
							vscode.window.showWarningMessage('Please open a LaTeX file to compile');
						}
						break;
					}
					case 'recompileRequest': {
						// Recompile current file
						const activeEditor2 = vscode.window.activeTextEditor;
						if (
							activeEditor2 &&
							(activeEditor2.document.languageId === 'latex' ||
								activeEditor2.document.languageId === 'tex')
						) {
							vscode.commands.executeCommand('latex.build');
						}
						break;
					}
					case 'previewRequest': {
						// Preview current file
						const activeEditor3 = vscode.window.activeTextEditor;
						if (
							activeEditor3 &&
							(activeEditor3.document.languageId === 'latex' ||
								activeEditor3.document.languageId === 'tex')
						) {
							vscode.commands.executeCommand('latex.preview');
						}
						break;
					}
				}
			},
			null,
			this.context.subscriptions
		);

		// When view becomes visible, ensure it's initialized
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible && !this.isInitialized) {
				// Delay initialization slightly to ensure HTML is loaded
				setTimeout(() => {
					this.initializeWebview();
				}, 200);
			}
		});

		// Always initialize the webview, even if not visible
		// This allows background compilation without requiring the view to be visible
		setTimeout(() => {
			this.initializeWebview();
		}, 500);
	}

	private initializeWebview(): void {
		if (!this._view) {
			this.logger.warn('Cannot initialize webview: view not available');
			return;
		}

		// Send initialization message
		try {
			this._view.webview.postMessage({
				type: 'initialize',
			});
			this.logger.info('Sent initialization message to compiler webview');
		} catch (error) {
			this.logger.warn(`Failed to send initialization message: ${error}`);
		}
	}

	/**
	 * Get the webview for compilation
	 */
	public getWebview(): vscode.Webview | undefined {
		return this._view?.webview;
	}

	/**
	 * Check if the webview is ready
	 */
	public isReady(): boolean {
		return this._view !== undefined && this.isInitialized && this._view.visible;
	}

	/**
	 * Check if the webview is available (even if not fully initialized)
	 */
	public isAvailable(): boolean {
		return this._view !== undefined && this._view.webview !== undefined;
	}

	/**
	 * Reveal the compiler view
	 */
	public reveal(): void {
		this._view?.show(true);
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		// Get SwiftLaTeX files
		const wasmUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'vendors',
				'swiftlatex',
				'swiftlatexpdftex.wasm'
			)
		);
		const workerScriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'vendors', 'swiftlatex', 'swiftlatexpdftex.js')
		);
		const pdfTexEngineUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'vendors', 'swiftlatex', 'PdfTeXEngine.js')
		);

		const nonce = this.getNonce();
		const cspSource = webview.cspSource;

		// Get WASM embedding code template
		const wasmEmbeddingCodeTemplate = this.getWasmEmbeddingCodeTemplate();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${cspSource}; style-src ${cspSource} 'unsafe-inline'; connect-src data: ${cspSource} https:; worker-src blob: ${cspSource}; child-src blob:;">
	<title>LaTeX Compiler</title>
	<style nonce="${nonce}">
		body {
			margin: 0;
			padding: 10px;
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
		.button-container {
			display: flex;
			gap: 8px;
			margin-bottom: 10px;
			flex-wrap: wrap;
		}
		button {
			padding: 6px 12px;
			border: 1px solid var(--vscode-button-border);
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-radius: 2px;
			cursor: pointer;
			font-size: 12px;
		}
		button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		#status {
			padding: 10px;
			margin: 10px 0;
			border-radius: 4px;
			background-color: var(--vscode-editor-background);
		}
		.status-ready {
			color: var(--vscode-testing-iconPassed);
		}
		.status-error {
			color: var(--vscode-errorForeground);
		}
		.status-loading {
			color: var(--vscode-descriptionForeground);
		}
		#log {
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			white-space: pre-wrap;
			word-wrap: break-word;
			max-height: 300px;
			overflow-y: auto;
			padding: 10px;
			background-color: var(--vscode-textBlockQuote-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
			margin-top: 10px;
			display: none;
		}
	</style>
</head>
<body>
	<div class="button-container">
		<button id="compileBtn">Compile</button>
		<button id="recompileBtn" disabled>Recompile</button>
		<button id="previewBtn" disabled>Preview</button>
	</div>
	<div id="status" class="status-loading">Initializing LaTeX compiler...</div>
	<div id="log"></div>
	
	<!-- Setup worker path and load PdfTeXEngine -->
	<script nonce="${nonce}">
		(async function() {
			try {
				// Fetch WASM file and convert to base64 for embedding
				console.log('Fetching WASM file from:', '${wasmUri}');
				const wasmResponse = await fetch('${wasmUri}');
				if (!wasmResponse.ok) {
					throw new Error('Failed to fetch WASM file: ' + wasmResponse.status);
				}
				const wasmArrayBuffer = await wasmResponse.arrayBuffer();
				const wasmBytes = new Uint8Array(wasmArrayBuffer);
				let wasmBase64 = '';
				for (let i = 0; i < wasmBytes.length; i++) {
					wasmBase64 += String.fromCharCode(wasmBytes[i]);
				}
				wasmBase64 = btoa(wasmBase64);
				console.log('WASM file loaded, size:', wasmBytes.length, 'bytes');
				
				// Fetch worker script
				console.log('Fetching worker script from:', '${workerScriptUri}');
				const workerResponse = await fetch('${workerScriptUri}');
				if (!workerResponse.ok) {
					throw new Error('Failed to fetch worker script: ' + workerResponse.status);
				}
				let workerScriptContent = await workerResponse.text();
				
				// Inject WASM embedding code
				const wasmEmbedCodeTemplate = ${JSON.stringify(wasmEmbeddingCodeTemplate)};
				const wasmEmbedCode = wasmEmbedCodeTemplate.replace(
					'WASM_BASE64_PLACEHOLDER',
					JSON.stringify(wasmBase64)
				);
				workerScriptContent = wasmEmbedCode + '\\n\\n' + workerScriptContent;
				
				const blob = new Blob([workerScriptContent], { type: 'application/javascript' });
				const workerBlobUrl = URL.createObjectURL(blob);
				console.log('Created blob URL for worker with embedded WASM');
				window.SWIFTLATEX_WORKER_PATH = workerBlobUrl;
			} catch (error) {
				console.error('Failed to create worker with embedded WASM:', error);
				window.SWIFTLATEX_WORKER_PATH = '${workerScriptUri}';
			}
			window.SWIFTLATEX_WASM_PATH = '${wasmUri}';
			
			// Load PdfTeXEngine
			const script = document.createElement('script');
			script.nonce = '${nonce}';
			script.src = '${pdfTexEngineUri}';
			script.onload = function() {
				console.log('PdfTeXEngine.js loaded');
				window.SWIFTLATEX_ENGINE_LOADED = true;
				if (window.SWIFTLATEX_ENGINE_LOADED_CALLBACK) {
					window.SWIFTLATEX_ENGINE_LOADED_CALLBACK();
				}
			};
			script.onerror = function(error) {
				console.error('Failed to load PdfTeXEngine.js:', error);
			};
			document.head.appendChild(script);
		})();
	</script>
	
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		
		// Button handlers
		const compileBtn = document.getElementById('compileBtn');
		const recompileBtn = document.getElementById('recompileBtn');
		const previewBtn = document.getElementById('previewBtn');
		
		compileBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'compileRequest' });
		});
		
		recompileBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'recompileRequest' });
		});
		
		previewBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'previewRequest' });
		});
		
		// Update button states based on compilation status
		window.addEventListener('message', (event) => {
			const message = event.data;
			if (message.type === 'compilationSuccess') {
				recompileBtn.disabled = false;
				previewBtn.disabled = false;
			}
		});
	</script>
	
	<script nonce="${nonce}">
		${getCompileWebviewScript()}
	</script>
</body>
</html>`;
	}

	private getWasmEmbeddingCodeTemplate(): string {
		return `
// Embedded WASM binary (injected by webview)
(function() {
	try {
		const EMBEDDED_WASM_BASE64 = WASM_BASE64_PLACEHOLDER;
		
		// Decode base64 to ArrayBuffer
		const binaryString = atob(EMBEDDED_WASM_BASE64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		const EMBEDDED_WASM_BINARY = bytes.buffer;

		// Override fetch to intercept WASM file requests
		const originalFetch = self.fetch || fetch;
		self.fetch = function(input, init) {
			const url = typeof input === 'string' ? input : input.url;
			if (url && (url.includes('swiftlatexpdftex.wasm') || url.endsWith('.wasm'))) {
				console.log('Intercepted WASM fetch request, using embedded binary');
				return Promise.resolve(new Response(EMBEDDED_WASM_BINARY, {
					headers: { 'Content-Type': 'application/wasm' }
				}));
			}
			return originalFetch.apply(this, arguments);
		};

		// Set up Module before it's initialized
		if (typeof Module === 'undefined') {
			var Module = {};
		}

		// Set wasmBinary for compatibility with Emscripten
		Module.wasmBinary = EMBEDDED_WASM_BINARY;

		// Use instantiateWasm to provide WASM directly
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
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	dispose(): void {
		// View will be disposed by VS Code
		this._view = undefined;
		this.isInitialized = false;
	}
}
