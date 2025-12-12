/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	initializeTypstWasm,
	isWasmLoaded,
	compileToPdf,
	compileToSvg,
	validateSource,
	disposeWasm,
	DiagnosticInfo,
	WasmFileReader,
} from './wasm';

/**
 * TypstService manages the Typst WASM compiler for compilation and validation.
 *
 * Uses @myriaddreamin/typst-ts-web-compiler for:
 * - PDF compilation
 * - SVG compilation
 * - Error detection/diagnostics
 *
 * Language features (completions, hover, etc.) use static data since the
 * full LSP (tinymist-web) would need to be compiled separately.
 */
export interface TypstServiceOptions {
	/** Path segments to WASM directory relative to extension root (e.g., ['dist', 'browser', 'wasm']) */
	wasmPath: string[];
}

export class TypstService implements vscode.Disposable {
	private readonly _disposables: vscode.Disposable[] = [];
	private readonly _diagnosticCollection: vscode.DiagnosticCollection;
	private readonly _logger: vscode.OutputChannel;
	private readonly _wasmPath: string[];
	private _initialized = false;
	private _validationEnabled = true;
	private _validationTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly _context: vscode.ExtensionContext,
		options: TypstServiceOptions,
		logger?: vscode.OutputChannel
	) {
		this._wasmPath = options.wasmPath;
		this._logger = logger ?? vscode.window.createOutputChannel('Typst');
		this._diagnosticCollection = vscode.languages.createDiagnosticCollection('typst');
		this._disposables.push(this._diagnosticCollection);

		// Watch configuration changes
		this._disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('typst.validation.enabled')) {
					this._validationEnabled = vscode.workspace
						.getConfiguration('typst')
						.get('validation.enabled', true);

					if (!this._validationEnabled) {
						this._diagnosticCollection.clear();
					}
				}
			})
		);

		this._validationEnabled = vscode.workspace
			.getConfiguration('typst')
			.get('validation.enabled', true);

		this._logger.appendLine('TypstService created');
	}

	/**
	 * Initialize the WASM compiler
	 */
	async initialize(): Promise<void> {
		if (this._initialized) {
			return;
		}

		try {
			this._logger.appendLine('Initializing Typst WASM compiler...');

			// Get extension URI for loading WASM from bundled files
			// Path is configured per environment (browser: dist/browser/wasm, node: out/wasm)
			const wasmBaseUri = vscode.Uri.joinPath(
				this._context.extensionUri,
				...this._wasmPath
			);

			this._logger.appendLine(`WASM base URI: ${wasmBaseUri.toString()}`);

			// Create a file reader function that uses VS Code's workspace.fs API
			// This works in all environments: local dev, browser, and production web (vscode-server)
			const readWasmFile: WasmFileReader = async (filename: string): Promise<Uint8Array> => {
				const fileUri = vscode.Uri.joinPath(wasmBaseUri, filename);
				this._logger.appendLine(`Reading WASM file: ${fileUri.toString()}`);
				try {
					const bytes = await vscode.workspace.fs.readFile(fileUri);
					this._logger.appendLine(`WASM file loaded: ${filename} (${bytes.length} bytes)`);
					return bytes;
				} catch (error) {
					this._logger.appendLine(`Failed to read WASM file ${filename}: ${error}`);
					throw error;
				}
			};

			await initializeTypstWasm({ readWasmFile });

			this._initialized = true;
			this._logger.appendLine('Typst WASM compiler initialized successfully');

			// Set up document validation
			this.setupValidation();

			// Validate all open Typst documents
			for (const doc of vscode.workspace.textDocuments) {
				if (doc.languageId === 'typst') {
					this.scheduleValidation(doc);
				}
			}
		} catch (error) {
			this._logger.appendLine(`Failed to initialize WASM compiler: ${error}`);
			throw error;
		}
	}

	/**
	 * Set up document validation
	 */
	private setupValidation(): void {
		// Validate on document open
		this._disposables.push(
			vscode.workspace.onDidOpenTextDocument(doc => {
				if (doc.languageId === 'typst') {
					this.scheduleValidation(doc);
				}
			})
		);

		// Validate on document change (debounced)
		this._disposables.push(
			vscode.workspace.onDidChangeTextDocument(e => {
				if (e.document.languageId === 'typst') {
					this.scheduleValidation(e.document);
				}
			})
		);

		// Clear diagnostics on close
		this._disposables.push(
			vscode.workspace.onDidCloseTextDocument(doc => {
				this._diagnosticCollection.delete(doc.uri);
			})
		);
	}

	/**
	 * Schedule validation with debouncing
	 */
	private scheduleValidation(document: vscode.TextDocument): void {
		if (!this._validationEnabled || !this.isReady) {
			return;
		}

		// Clear existing timer
		if (this._validationTimer) {
			clearTimeout(this._validationTimer);
		}

		// Debounce validation (500ms)
		this._validationTimer = setTimeout(() => {
			this.validateDocument(document);
		}, 500);
	}

	/**
	 * Validate a document and report diagnostics
	 */
	async validateDocument(document: vscode.TextDocument): Promise<void> {
		if (!this.isReady || !this._validationEnabled) {
			return;
		}

		try {
			const errors = await validateSource(document.getText());
			const diagnostics = this.convertDiagnostics(document, errors);
			this._diagnosticCollection.set(document.uri, diagnostics);
		} catch (error) {
			this._logger.appendLine(`Validation error: ${error}`);
		}
	}

	/**
	 * Convert DiagnosticInfo to vscode.Diagnostic
	 */
	private convertDiagnostics(
		document: vscode.TextDocument,
		errors: DiagnosticInfo[]
	): vscode.Diagnostic[] {
		return errors.map(e => {
			// Clamp line numbers to document bounds
			const startLine = Math.min(e.range.start.line, document.lineCount - 1);
			const endLine = Math.min(e.range.end.line, document.lineCount - 1);

			const range = new vscode.Range(
				startLine,
				e.range.start.character,
				endLine,
				Math.min(e.range.end.character, document.lineAt(endLine).text.length)
			);

			let severity: vscode.DiagnosticSeverity;
			switch (e.severity) {
				case 'error': severity = vscode.DiagnosticSeverity.Error; break;
				case 'warning': severity = vscode.DiagnosticSeverity.Warning; break;
				default: severity = vscode.DiagnosticSeverity.Information;
			}

			return new vscode.Diagnostic(range, e.message, severity);
		});
	}

	/**
	 * Check if the service is ready
	 */
	get isReady(): boolean {
		return this._initialized && isWasmLoaded();
	}

	/**
	 * Compile a document to PDF
	 */
	async compileToPdf(document: vscode.TextDocument): Promise<{ success: boolean; pdf?: Uint8Array; error?: string }> {
		if (!this.isReady) {
			return { success: false, error: 'Compiler not initialized' };
		}

		try {
			const result = await compileToPdf(document.getText());

			if (result.success && result.pdf) {
				return { success: true, pdf: result.pdf };
			} else {
				// Show all errors, not just the first one
				const errorCount = result.errors?.length ?? 0;
				const errorMsg = result.errors?.map((e, i) => {
					const location = e.range.start.line > 0 ? ` (line ${e.range.start.line + 1})` : '';
					return `${i + 1}. ${e.message}${location}`;
				}).join('\n') ?? 'Unknown error';
				const summary = errorCount > 1 ? `${errorCount} errors found:\n${errorMsg}` : errorMsg;
				return { success: false, error: summary };
			}
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Compile a document to SVG
	 */
	async compileToSvg(document: vscode.TextDocument): Promise<{ success: boolean; svg?: string; error?: string }> {
		if (!this.isReady) {
			return { success: false, error: 'Compiler not initialized' };
		}

		try {
			const result = await compileToSvg(document.getText());

			if (result.success && result.svg) {
				return { success: true, svg: result.svg };
			} else {
				// Show all errors, not just the first one
				const errorCount = result.errors?.length ?? 0;
				const errorMsg = result.errors?.map((e, i) => {
					const location = e.range.start.line > 0 ? ` (line ${e.range.start.line + 1})` : '';
					return `${i + 1}. ${e.message}${location}`;
				}).join('\n') ?? 'Unknown error';
				const summary = errorCount > 1 ? `${errorCount} errors found:\n${errorMsg}` : errorMsg;
				return { success: false, error: summary };
			}
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	dispose(): void {
		if (this._validationTimer) {
			clearTimeout(this._validationTimer);
		}
		disposeWasm();
		this._disposables.forEach(d => d.dispose());
		this._logger.dispose();
	}
}
