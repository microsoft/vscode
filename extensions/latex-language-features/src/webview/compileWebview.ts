/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Webview script for LaTeX compilation using SwiftLaTeX
 * This runs in the webview context (browser)
 */

// This will be loaded in the webview HTML
// The actual implementation will be in JavaScript that runs in the webview

export function getCompileWebviewScript(): string {
	return `
(function() {
	const vscode = acquireVsCodeApi();
	
	let engineService = null;
	let engineInitialized = false;

	// LatexEngineService class definition
	class LatexEngineService {
		constructor(Engine) {
			this.Engine = Engine;
			this.engine = null;
			this.engineReady = false;
			this.initializationPromise = null;
		}

		async initialize() {
			if (this.initializationPromise) {
				return this.initializationPromise;
			}

			this.initializationPromise = (async () => {
				try {
					if (!this.engine) {
						this.engine = new this.Engine();
						await this.engine.loadEngine();
						this.engine.setTexliveEndpoint('https://texlive.emaily.re');
						// Check if engine is ready - loadEngine() should have resolved when ready
						this.engineReady = this.engine.isReady();
						if (!this.engineReady) {
							// Wait a bit more and check again
							await new Promise(resolve => setTimeout(resolve, 500));
							this.engineReady = this.engine.isReady();
							if (!this.engineReady) {
								throw new Error('Engine failed to become ready after loadEngine(). Worker may not have initialized correctly.');
							}
						}
					} else {
						// If engine already exists, just check if it's ready
						this.engineReady = this.engine.isReady();
					}
				} catch (error) {
					this.engineReady = false;
					throw error;
				}
			})();

			return this.initializationPromise;
		}

		async compile(latexSource, mainFile = 'main.tex') {
			try {
				// Always ensure engine is initialized
				await this.initialize();
				
				// Double-check readiness after initialization
				if (!this.engine || !this.engine.isReady()) {
					this.engineReady = false;
					return {
						success: false,
						error: 'SwiftLaTeX engine is not ready after initialization'
					};
				}

				this.engine.writeMemFSFile(mainFile, latexSource);
				this.engine.setEngineMainFile(mainFile);

				const result = await this.engine.compileLaTeX();

				if (result.status === 0 && result.pdf) {
					return {
						success: true,
						pdf: result.pdf,
						log: result.log,
						status: result.status
					};
				} else {
					return {
						success: false,
						error: 'Compilation failed with status ' + result.status,
						log: result.log,
						status: result.status
					};
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					success: false,
					error: message
				};
			}
		}

		isReady() {
			// Check engine directly, not just the cached flag
			return this.engine !== null && this.engine.isReady();
		}

		dispose() {
			if (this.engine) {
				this.engine.flushCache();
				this.engine = null;
			}
			this.engineReady = false;
			this.initializationPromise = null;
		}
	}

	// Initialize SwiftLaTeX engine
	async function initializeEngine() {
		if (engineInitialized) {
			return;
		}

		try {
			// Wait for PdfTeXEngine to be available (loaded from script tag)
			// Give it a moment to load
			let attempts = 0;
			while (typeof PdfTeXEngine === 'undefined' && attempts < 50) {
				await new Promise(resolve => setTimeout(resolve, 100));
				attempts++;
			}
			
			if (typeof PdfTeXEngine === 'undefined') {
				throw new Error('PdfTeXEngine not found after waiting. Make sure PdfTeXEngine.js is loaded. Check browser console for script loading errors.');
			}

			const Engine = PdfTeXEngine;
			engineService = new LatexEngineService(Engine);
			
			// Add timeout for engine initialization (30 seconds)
			const initPromise = engineService.initialize();
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('Engine initialization timeout (30s)')), 30000);
			});
			
			await Promise.race([initPromise, timeoutPromise]);
			engineInitialized = true;
			
			vscode.postMessage({
				type: 'engineReady'
			});
		} catch (error) {
			console.error('Failed to initialize engine:', error);
			engineInitialized = false;
			// Provide more detailed error message
			// Handle cases where error might be undefined or null
			let errorMessage = 'Unknown error';
			if (error) {
				if (error instanceof Error) {
					errorMessage = error.message || String(error);
				} else if (typeof error === 'object' && 'message' in error) {
					errorMessage = String(error.message);
				} else {
					errorMessage = String(error);
				}
			}
			
			if (errorMessage.includes('undefined') || errorMessage.includes('Cannot read properties')) {
				errorMessage = 'WASM file failed to load. This may be due to service worker issues in cloud environments. ' +
					'Check browser console for details. Error: ' + errorMessage;
			}
			vscode.postMessage({
				type: 'engineError',
				error: errorMessage
			});
		}
	}

	// Compile LaTeX source
	async function compileLatex(latexSource, mainFile, compilationId) {
		if (!engineService || !engineService.isReady()) {
			try {
				await initializeEngine();
				// Wait a bit after initialization
				await new Promise(resolve => setTimeout(resolve, 500));
			} catch (error) {
				console.error('Engine initialization failed during compile:', error);
				let errorMessage = 'Unknown error';
				if (error) {
					if (error instanceof Error) {
						errorMessage = error.message || String(error);
					} else if (typeof error === 'object' && 'message' in error) {
						errorMessage = String(error.message);
					} else {
						errorMessage = String(error);
					}
				}
				vscode.postMessage({
					type: 'compilationError',
					compilationId: compilationId,
					error: 'Engine initialization failed: ' + errorMessage
				});
				return;
			}
		}

		if (!engineService || !engineService.isReady()) {
			console.error('Engine still not ready after initialization');
			vscode.postMessage({
				type: 'compilationError',
				compilationId: compilationId,
				error: 'Engine is not ready. Check browser console for initialization errors.'
			});
			return;
		}

		try {
			vscode.postMessage({
				type: 'compilationStarted',
				compilationId: compilationId
			});
			
			// Add timeout for compilation (50 seconds, leaving 10s buffer before overall timeout)
			const compilePromise = engineService.compile(latexSource, mainFile || 'main.tex');
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('Compilation timeout (50s)')), 50000);
			});
			
			const result = await Promise.race([compilePromise, timeoutPromise]);
			// The result from engineService.compile() has: {success: boolean, pdf?: Uint8Array, log?: string, error?: string}
			const success = result.success;
			const pdf = result.pdf;
			const log = result.log || '';
			const error = result.error;

			if (success && pdf) {
				// Convert Uint8Array to base64 for transmission
				const pdfBase64 = btoa(String.fromCharCode(...pdf));
				
				vscode.postMessage({
					type: 'compilationSuccess',
					compilationId: compilationId,
					pdf: pdfBase64,
					log: log
				});
			} else {
				// Extract LaTeX error messages from log with better parsing
				let errorMsg = error;
				let errorLine = null;
				let errorFile = null;
				
				if (!errorMsg && log) {
					// Split log by actual newlines (handle both all line breaks)
					// Use String.fromCharCode(10) to avoid template literal escaping issues
					const newlineChar = String.fromCharCode(10);
					const normalizedLog = log.replace(/\\\\n/g, newlineChar).replace(/\\n/g, newlineChar);
					const logLines = normalizedLog.split(newlineChar);
					
					// Extract error lines (lines starting with "!")
					const errorLines = logLines.filter(line => line.trim().startsWith('!'));
					
					if (errorLines.length > 0) {
						// Get the first error
						const firstError = errorLines[0];
						const cleanError = firstError.replace(/^!\s*/, '').trim();
						
						// Try to find line number in the error context
						// Look for "l.XX" pattern which indicates line number
						const lineNumberMatch = normalizedLog.match(/l\.(\d+)\s/);
						if (lineNumberMatch) {
							errorLine = parseInt(lineNumberMatch[1], 10);
						}
						
						// Try to find file name in error context
						// Look for .tex files in the log - use a simple pattern to avoid escaping issues
						for (const line of logLines) {
							const texFileMatch = line.match(/([a-zA-Z0-9_\\/\\-]+\\.tex)/);
							if (texFileMatch) {
								errorFile = texFileMatch[1];
								break;
							}
						}
						
						// Build a user-friendly error message
						if (errorLine) {
							errorMsg = 'Line ' + errorLine + ': ' + cleanError;
						} else {
							errorMsg = cleanError;
						}
						
						// Add context from the line that caused the error (l.XX ...)
						const contextMatch = normalizedLog.match(new RegExp('l\\.\\d+\\s+\\.\\.\\.\\s*(.+?)(?:' + newlineChar + '|$)', 'g'));
						if (contextMatch) {
							const context = contextMatch[1].trim();
							if (context.length > 0 && context.length < 100) {
								errorMsg += ' (' + context + ')';
							}
						}
					} else {
						// Look for common error patterns
						// Split by newlines first, then match patterns on each line
						for (const line of logLines) {
							if (line.match(/Fatal error occurred/i)) {
								errorMsg = line.trim();
								break;
							}
							if (line.match(/Undefined control sequence/i)) {
								errorMsg = line.trim();
								break;
							}
							if (line.match(/Missing /i)) {
								errorMsg = line.trim();
								break;
							}
							if (line.match(/Environment .* undefined/i)) {
								errorMsg = line.trim();
								break;
							}
							if (line.match(/LaTeX Error:/i)) {
								errorMsg = line.trim();
								break;
							}
						}
						
						if (!errorMsg) {
							errorMsg = 'Compilation failed (status ' + result.status + ')';
						}
					}
				}
				
				if (!errorMsg) {
					errorMsg = 'Compilation failed (status ' + result.status + ')';
				}
				
				vscode.postMessage({
					type: 'compilationError',
					compilationId: compilationId,
					error: errorMsg,
					log: log,
					errorLine: errorLine,
					errorFile: errorFile
				});
			}
		} catch (error) {
			console.error('Compilation exception:', error);
			vscode.postMessage({
				type: 'compilationError',
				compilationId: compilationId,
				error: error.message || String(error)
			});
		}
	}

	// Listen for messages from extension host
	window.addEventListener('message', event => {
		const message = event.data;
		
		switch (message.type) {
			case 'compile':
				compileLatex(message.latexSource, message.mainFile, message.compilationId).then(() => {
					// Compilation completed silently
				}).catch(err => {
					console.error('Compilation error:', err);
					vscode.postMessage({
						type: 'compilationError',
						compilationId: message.compilationId,
						error: err.message || String(err)
					});
				});
				break;
			case 'initialize':
				initializeEngine();
				break;
		}
	});

	// Send webviewReady immediately when script loads
	// Engine initialization will happen lazily when needed
	vscode.postMessage({
		type: 'webviewReady'
	});
	
	// Auto-initialize engine in background (non-blocking)
	initializeEngine().catch(err => {
		console.error('Engine initialization failed:', err);
	});
})();
`;
}
